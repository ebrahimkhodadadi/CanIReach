use crate::app_state::AppState;
use crate::error::AppError;
use crate::events::emit_probe_update;
use crate::intelligence::collector::FailedRequestRegistry;
use crate::monitoring::persistence::DbManager;
use canireach_core::ProbeResult;
use rusqlite::params;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ContinuousMonitorConfig {
    pub interval_seconds: u32,
    pub run_immediately: bool,
    pub persist_across_restart: bool,
    pub pause_when_offline: bool,
    pub retry_on_network_recovery: bool,
    pub overlap_policy: String, // "skip" | "queue"
    pub notify_on_failure: bool,
    pub notify_on_recovery: bool,
}

impl Default for ContinuousMonitorConfig {
    fn default() -> Self {
        Self {
            interval_seconds: 30,
            run_immediately: true,
            persist_across_restart: false,
            pause_when_offline: true,
            retry_on_network_recovery: true,
            overlap_policy: "skip".to_string(),
            notify_on_failure: true,
            notify_on_recovery: true,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MonitorSession {
    pub id: String,
    pub target_id: String,
    pub config: ContinuousMonitorConfig,
    pub state: String, // "idle" | "running" | "paused" | "stopped"
    pub started_at: Option<String>,
    pub stopped_at: Option<String>,
    pub total_runs: u32,
    pub successful_runs: u32,
    pub failed_runs: u32,
    pub consecutive_failures: u32,
    pub last_run_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MonitorRun {
    pub id: String,
    pub session_id: String,
    pub target_id: String,
    pub run_index: u32,
    pub status: String,
    pub latency_ms: Option<i64>,
    pub http_status: Option<i64>,
    pub error_category: Option<String>,
    pub error_message: Option<String>,
    pub profile_id: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}

pub struct ContinuousMonitorManager {
    sessions: Arc<Mutex<HashMap<String, SessionHandle>>>,
}

struct SessionHandle {
    cancellation: Arc<AtomicBool>,
    session: MonitorSession,
}

impl ContinuousMonitorManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start_monitor(
        &self,
        app: AppHandle,
        target_id: String,
        config: ContinuousMonitorConfig,
    ) -> Result<MonitorSession, AppError> {
        // Prevent duplicate loops
        {
            let sessions = self.sessions.lock().await;
            if let Some(existing) = sessions.get(&target_id) {
                if existing.session.state == "running" {
                    return Ok(existing.session.clone());
                }
            }
        }

        let session_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        let session = MonitorSession {
            id: session_id.clone(),
            target_id: target_id.clone(),
            config: config.clone(),
            state: "running".to_string(),
            started_at: Some(now.clone()),
            stopped_at: None,
            total_runs: 0,
            successful_runs: 0,
            failed_runs: 0,
            consecutive_failures: 0,
            last_run_at: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        // Persist session to DB
        let conn =
            DbManager::get_connection().map_err(|e| AppError::Generic(format!("DB error: {}", e)))?;
        let config_json = serde_json::to_string(&config).unwrap_or_default();
        conn.execute(
            "INSERT INTO continuous_monitor_sessions (id, target_id, config_json, state, started_at, total_runs, successful_runs, failed_runs, consecutive_failures, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, 0, ?6, ?7)",
            params![session_id, target_id, config_json, "running", now, now, now],
        )
        .map_err(|e| AppError::Generic(format!("Failed to insert session: {}", e)))?;

        let cancellation = Arc::new(AtomicBool::new(false));

        // Register handle
        {
            let mut sessions = self.sessions.lock().await;
            sessions.insert(
                target_id.clone(),
                SessionHandle {
                    cancellation: cancellation.clone(),
                    session: session.clone(),
                },
            );
        }

        // Spawn the monitoring loop
        let app_clone = app.clone();
        let target_id_clone = target_id.clone();
        let session_id_clone = session_id.clone();
        let cancellation_clone = cancellation.clone();
        let sessions_ref = self.sessions.clone();
        let interval_secs = config.interval_seconds.max(5);

        tokio::spawn(async move {
            // If run_immediately, do first run right away
            if config.run_immediately {
                Self::run_single_check(
                    &app_clone,
                    &session_id_clone,
                    &target_id_clone,
                    1,
                    &sessions_ref,
                )
                .await;
            }

            let mut run_index: u32 = if config.run_immediately { 2 } else { 1 };
            let mut interval =
                tokio::time::interval(tokio::time::Duration::from_secs(interval_secs as u64));
            interval.tick().await; // skip first immediate tick

            loop {
                if cancellation_clone.load(Ordering::Relaxed) {
                    println!(
                        "INFO: Continuous monitor for {} cancelled.",
                        target_id_clone
                    );
                    break;
                }

                interval.tick().await;

                if cancellation_clone.load(Ordering::Relaxed) {
                    break;
                }

                Self::run_single_check(
                    &app_clone,
                    &session_id_clone,
                    &target_id_clone,
                    run_index,
                    &sessions_ref,
                )
                .await;
                run_index += 1;
            }

            // Update session state to stopped
            if let Ok(conn) = DbManager::get_connection() {
                let _ = conn.execute(
                    "UPDATE continuous_monitor_sessions SET state = 'stopped', stopped_at = ?1, updated_at = ?1 WHERE id = ?2",
                    params![chrono::Utc::now().to_rfc3339(), session_id_clone],
                );
            }

            // Emit state changed
            let _ = app_clone.emit(
                "continuous-monitor:state-changed",
                serde_json::json!({
                    "session_id": session_id_clone,
                    "target_id": target_id_clone,
                    "state": "stopped",
                }),
            );
        });

        // Emit state changed
        let _ = app.emit(
            "continuous-monitor:state-changed",
            serde_json::json!({
                "session_id": session_id,
                "target_id": target_id,
                "state": "running",
            }),
        );

        Ok(session)
    }

    pub async fn stop_monitor(&self, target_id: &str) -> Result<MonitorSession, AppError> {
        let mut sessions = self.sessions.lock().await;
        if let Some(handle) = sessions.get_mut(target_id) {
            handle.cancellation.store(true, Ordering::Relaxed);
            handle.session.state = "stopped".to_string();
            handle.session.stopped_at = Some(chrono::Utc::now().to_rfc3339());
            handle.session.updated_at = chrono::Utc::now().to_rfc3339();
            let session = handle.session.clone();

            // Update DB
            if let Ok(conn) = DbManager::get_connection() {
                let _ = conn.execute(
                    "UPDATE continuous_monitor_sessions SET state = 'stopped', stopped_at = ?1, updated_at = ?1 WHERE id = ?2",
                    params![session.stopped_at, session.id],
                );
            }

            Ok(session)
        } else {
            Err(AppError::Generic(format!(
                "No active monitor for target: {}",
                target_id
            )))
        }
    }

    pub async fn get_session_status(&self, target_id: &str) -> Option<MonitorSession> {
        let sessions = self.sessions.lock().await;
        sessions.get(target_id).map(|h| h.session.clone())
    }

    pub async fn get_all_active_sessions(&self) -> Vec<MonitorSession> {
        let sessions = self.sessions.lock().await;
        sessions.values().map(|h| h.session.clone()).collect()
    }

    async fn run_single_check(
        app: &AppHandle,
        session_id: &str,
        target_id: &str,
        run_index: u32,
        sessions: &Arc<Mutex<HashMap<String, SessionHandle>>>,
    ) {
        let state = app.state::<AppState>();
        let targets = state.targets.lock().unwrap().clone();
        let target = match targets.iter().find(|t| t.id == target_id) {
            Some(t) => t.clone(),
            None => {
                println!(
                    "WARN: Target {} not found, skipping continuous check.",
                    target_id
                );
                return;
            }
        };

        let now = chrono::Utc::now().to_rfc3339();
        let run_id = Uuid::new_v4().to_string();

        // Run probe
        let result: ProbeResult = {
            let engine = state.engine.lock().await;
            engine
                .probe_one(&target, Arc::new(AtomicBool::new(false)))
                .await
        };

        let is_healthy = result.overall_status == "up";
        let status_str = match result.overall_status.as_str() {
            "up" => "healthy",
            "degraded" => "degraded",
            "down" => "unreachable",
            _ => "unknown",
        };
        let latency = result.latency_ms;
        let http_status_val = result.http_status.map(|s| s as i64);
        let error_category = result.failure.as_ref().map(|f| format!("{:?}", f.kind));
        let error_message = result
            .failure
            .as_ref()
            .map(|f| f.user_message.clone());

        // Save run to DB
        if let Ok(conn) = DbManager::get_connection() {
            let _ = conn.execute(
                "INSERT INTO continuous_monitor_runs (id, session_id, target_id, run_index, status, latency_ms, http_status, error_category, error_message, started_at, completed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![run_id, session_id, target_id, run_index as i32, status_str, latency as i64, http_status_val, error_category, error_message, now, chrono::Utc::now().to_rfc3339()],
            );

            // Update session counters
            let _ = conn.execute(
                "UPDATE continuous_monitor_sessions SET total_runs = total_runs + 1, last_run_at = ?1, updated_at = ?1 WHERE id = ?2",
                params![now, session_id],
            );
            if is_healthy {
                let _ = conn.execute(
                    "UPDATE continuous_monitor_sessions SET successful_runs = successful_runs + 1, consecutive_failures = 0 WHERE id = ?1",
                    params![session_id],
                );
            } else {
                let _ = conn.execute(
                    "UPDATE continuous_monitor_sessions SET failed_runs = failed_runs + 1, consecutive_failures = consecutive_failures + 1 WHERE id = ?1",
                    params![session_id],
                );
            }
        }

        // Update in-memory session
        {
            let mut sessions_guard = sessions.lock().await;
            if let Some(handle) = sessions_guard.get_mut(target_id) {
                handle.session.total_runs += 1;
                handle.session.last_run_at = Some(now.clone());
                handle.session.updated_at = now.clone();
                if is_healthy {
                    handle.session.successful_runs += 1;
                    handle.session.consecutive_failures = 0;
                } else {
                    handle.session.failed_runs += 1;
                    handle.session.consecutive_failures += 1;
                }
            }
        }

        // Record failed request if probe failed
        if !is_healthy {
            if let Ok(conn) = DbManager::get_connection() {
                let _ = FailedRequestRegistry::record_from_probe_result(
                    &conn,
                    &result,
                    Some(session_id),
                    &target.url,
                );
            }
        }

        // Emit probe update for UI grid
        emit_probe_update(Some(app), result);

        // Emit continuous monitor run completed
        let _ = app.emit(
            "continuous-monitor:run-completed",
            serde_json::json!({
                "session_id": session_id,
                "target_id": target_id,
                "run_index": run_index,
                "status": status_str,
                "latency_ms": latency,
                "http_status": http_status_val,
                "is_healthy": is_healthy,
                "timestamp": now,
            }),
        );
    }
}
