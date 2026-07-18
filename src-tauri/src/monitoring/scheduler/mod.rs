use crate::app_state::AppState;
use crate::config::SchedulesLoader;
use crate::error::AppError;
use crate::events::emit_probe_update;
use crate::intelligence::collector::FailedRequestRegistry;
use crate::monitoring::alerts::AlertEngine;
use crate::monitoring::incidents::IncidentEngine;
use crate::monitoring::models::schedule::{MonitoringSchedule, MonitoringScope};
use crate::monitoring::persistence::DbManager;
use canireach_core::{ProbeResult, Target};
use fs2::FileExt;
use std::fs::{File, OpenOptions};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use uuid::Uuid;

pub struct SchedulerLock {
    _file: File,
}

impl SchedulerLock {
    pub fn acquire() -> Result<Self, Option<u32>> {
        let lock_path = crate::config::get_app_data_dir().join("scheduler.lock");
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&lock_path)
            .map_err(|_| None)?;

        if file.try_lock_exclusive().is_ok() {
            let pid = std::process::id();
            if file.set_len(0).is_ok() {
                use std::io::Write;
                let mut f = &file;
                let _ = writeln!(f, "{}", pid);
            }
            Ok(Self { _file: file })
        } else {
            use std::io::Read;
            let mut content = String::new();
            let mut f = &file;
            let _ = f.read_to_string(&mut content);
            let owner_pid = content.trim().parse::<u32>().ok();
            Err(owner_pid)
        }
    }
}

pub struct SchedulerService;

impl SchedulerService {
    pub fn start(app_handle: AppHandle) -> UnboundedSender<()> {
        let (tx, mut rx): (UnboundedSender<()>, UnboundedReceiver<()>) = unbounded_channel();
        let app_handle_clone = app_handle.clone();

        tauri::async_runtime::spawn(async move {
            println!("INFO: Scheduler background loop started.");
            let mut lock_holder = None;

            // Loop forever
            loop {
                if lock_holder.is_none() {
                    match SchedulerLock::acquire() {
                        Ok(lock) => {
                            println!(
                                "INFO: Acquired scheduler lock. Active scheduler PID: {}",
                                std::process::id()
                            );
                            lock_holder = Some(lock);
                        }
                        Err(owner_pid) => {
                            let owner_str = owner_pid
                                .map(|p| p.to_string())
                                .unwrap_or_else(|| "unknown".to_string());
                            println!("WARN: Scheduler lock held by another process (PID {}). Retrying in 10s...", owner_str);
                            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
                            continue;
                        }
                    }
                }

                let state = app_handle_clone.state::<AppState>();

                // Check if monitoring is paused
                if state.monitoring_paused.load(Ordering::Relaxed) {
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    continue;
                }

                // 1. Load active schedules
                let schedules = match SchedulesLoader::load() {
                    Ok(s) => s,
                    Err(e) => {
                        println!("ERROR: Failed to load schedules in scheduler tick: {:?}", e);
                        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                        continue;
                    }
                };

                let now = chrono::Utc::now();
                let mut next_wake = now + chrono::Duration::minutes(5);
                let mut due_schedules = Vec::new();

                let mut updated_schedules = schedules.clone();
                let mut modified = false;

                for schedule in &mut updated_schedules {
                    if !schedule.enabled {
                        continue;
                    }

                    // If next_run_at is not calculated yet, initialize it
                    if schedule.next_run_at.is_none() {
                        schedule.next_run_at =
                            schedule.calculate_next_run(now).map(|t| t.to_rfc3339());
                        modified = true;
                    }

                    if let Some(ref next_run_str) = schedule.next_run_at {
                        if let Ok(next_run) = chrono::DateTime::parse_from_rfc3339(next_run_str) {
                            let next_run_utc = next_run.with_timezone(&chrono::Utc);
                            if next_run_utc <= now {
                                due_schedules.push(schedule.clone());
                                // Calculate next run after this one
                                schedule.last_run_at = Some(now.to_rfc3339());
                                schedule.next_run_at =
                                    schedule.calculate_next_run(now).map(|t| t.to_rfc3339());
                                modified = true;
                            } else if next_run_utc < next_wake {
                                next_wake = next_run_utc;
                            }
                        }
                    }
                }

                // Save next run recalculations
                if modified {
                    let _ = SchedulesLoader::save(&updated_schedules);
                    // Notify UI that schedules have updated
                    let _ = app_handle_clone.emit("scheduler:next-run-changed", ());
                }

                // 2. Execute due schedules
                for schedule in due_schedules {
                    let app_exec = app_handle_clone.clone();
                    tokio::spawn(async move {
                        if let Err(err) = Self::execute_schedule(Some(app_exec), schedule).await {
                            println!("ERROR: Failed to execute schedule: {:?}", err);
                        }
                    });
                }

                // 3. Sleep until next due run or until woke up by trigger
                let sleep_duration = (next_wake - chrono::Utc::now()).num_milliseconds();
                if sleep_duration > 0 {
                    let sleep_dur_u64 = sleep_duration as u64;
                    tokio::select! {
                        _ = tokio::time::sleep(tokio::time::Duration::from_millis(sleep_dur_u64)) => {
                            // Woke up naturally via timeout
                        }
                        _ = rx.recv() => {
                            // Interrupted early by re-sync request
                            println!("INFO: Scheduler interrupted for re-sync.");
                        }
                    }
                } else {
                    // Small fallback sleep to prevent busy spinning if clock shifts
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                }
            }
        });

        tx
    }

    pub async fn execute_schedule(
        app: Option<AppHandle>,
        schedule: MonitoringSchedule,
    ) -> Result<(), AppError> {
        println!("INFO: Executing scheduled monitoring: {}", schedule.name);

        // 1. Resolve targets in scope
        let all_targets = if let Some(ref a) = app {
            let state = a.state::<AppState>();
            let targets = state.targets.lock().unwrap().clone();
            targets
        } else {
            crate::config::TargetLoader::load()?
        };
        let target_scope: Vec<Target> = match &schedule.scope {
            MonitoringScope::AllEnabledTargets => {
                all_targets.into_iter().filter(|t| t.enabled).collect()
            }
            MonitoringScope::SelectedTargets { target_ids } => all_targets
                .into_iter()
                .filter(|t| target_ids.contains(&t.id) && t.enabled)
                .collect(),
            MonitoringScope::Group { group_id } => all_targets
                .into_iter()
                .filter(|t| t.group_ids.contains(group_id) && t.enabled)
                .collect(),
        };

        let target_count = target_scope.len() as u32;
        if target_count == 0 {
            println!("WARN: Scheduled run scope matched 0 targets.");
            return Ok(());
        }

        // 2. Open Batch in database
        let batch_id = Uuid::new_v4().to_string();
        let started_at = chrono::Utc::now();
        let started_at_str = started_at.to_rfc3339();

        let conn = DbManager::get_connection()
            .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

        conn.execute(
            "INSERT INTO batches (id, schedule_id, status, target_count, completed_count, passed_count, failed_count, started_at)
             VALUES (?1, ?2, 'running', ?3, 0, 0, 0, ?4)",
            rusqlite::params![batch_id, schedule.id, target_count, started_at_str],
        ).map_err(|e| AppError::Generic(format!("Failed to insert batch: {}", e)))?;

        // Notify UI about batch started
        if let Some(ref a) = app {
            let _ = a.emit(
                "monitoring:batch-started",
                serde_json::json!({
                    "batch_id": batch_id,
                    "schedule_id": schedule.id,
                    "target_count": target_count,
                    "started_at": started_at_str,
                }),
            );
        }

        let mut passed_count = 0;
        let mut failed_count = 0;

        // 3. Probing targets
        for target in target_scope {
            // Lock engine and run the probe
            let result: ProbeResult = if let Some(ref a) = app {
                let state = a.state::<AppState>();
                let engine = state.engine.lock().await;
                engine.probe_one(&target).await
            } else {
                let config_path = std::path::PathBuf::from("config/settings.json");
                let config = if config_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&config_path) {
                        serde_json::from_str(&content)
                            .unwrap_or_else(|_| canireach_core::ProbeConfig::default())
                    } else {
                        canireach_core::ProbeConfig::default()
                    }
                } else {
                    canireach_core::ProbeConfig::default()
                };
                let engine = canireach_core::ProbeEngine::new(config)?;
                engine.probe_one(&target).await
            };

            // Calculate status
            let is_healthy = result.overall_status == "up";
            let status_str = match result.overall_status.as_str() {
                "up" => "healthy",
                "degraded" => "degraded",
                "down" => "unreachable",
                _ => "unknown",
            };

            if is_healthy {
                passed_count += 1;
            } else {
                failed_count += 1;
            }

            // Save run to DB
            let run_id = result.run_id.clone();
            let latency_ms = result.latency_ms as i64;
            let http_status = result.http_status.map(|s| s as i64);
            let profile_id = schedule
                .network_profile_override_id
                .clone()
                .unwrap_or_else(|| "system-default".to_string());
            let evidence_serialized = serde_json::to_string(&result).ok();

            let _ = conn.execute(
                "INSERT INTO target_runs (id, batch_id, target_id, status, latency_ms, http_status, profile_id, primary_failure_code, technical_evidence, started_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                rusqlite::params![
                    run_id,
                    batch_id,
                    target.id,
                    status_str,
                    latency_ms,
                    http_status,
                    profile_id,
                    result.failure.as_ref().map(|f| format!("{:?}", f.kind)),
                    evidence_serialized,
                    started_at_str
                ],
            );

            // Record failed request operations in central registry
            let _ = FailedRequestRegistry::record_from_probe_result(
                &conn,
                &result,
                Some(&batch_id),
                &profile_id,
            );

            // Trigger real-time UI grid update
            emit_probe_update(app.as_ref(), result.clone());

            // Process incidents & alerts
            if let Ok(Some(incident)) = IncidentEngine::process_run(
                &conn,
                &target.id,
                &profile_id,
                status_str,
                &run_id,
                &target.name,
            ) {
                let alert_event = if incident.status == "resolved" {
                    "incident_resolved"
                } else {
                    "incident_opened"
                };
                let _ = AlertEngine::trigger_alert(app.as_ref(), &conn, &incident, alert_event);
            }
        }

        // 4. Update Batch status to completed
        let completed_at_str = chrono::Utc::now().to_rfc3339();
        let duration_ms = (chrono::Utc::now() - started_at).num_milliseconds();

        let _ = conn.execute(
            "UPDATE batches
             SET status = 'completed', completed_count = ?1, passed_count = ?2, failed_count = ?3, completed_at = ?4, duration_ms = ?5
             WHERE id = ?6",
            rusqlite::params![target_count, passed_count, failed_count, completed_at_str, duration_ms, batch_id],
        );

        // Notify UI batch completed
        if let Some(ref a) = app {
            let _ = a.emit(
                "monitoring:batch-completed",
                serde_json::json!({
                    "batch_id": batch_id,
                    "status": "completed",
                    "passed_count": passed_count,
                    "failed_count": failed_count,
                    "completed_at": completed_at_str,
                }),
            );
        }

        Ok(())
    }
}
