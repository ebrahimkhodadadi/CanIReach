use crate::error::AppError;
use crate::monitoring::models::run::{HistoricalTargetRun, MonitoringIncident};
use crate::monitoring::persistence::DbManager;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UptimeMetric {
    pub target_id: String,
    pub target_name: String,
    pub uptime_percentage: f64,
    pub total_runs: u32,
    pub failures: u32,
    pub average_latency_ms: f64,
}

#[tauri::command]
pub fn query_monitoring_history(
    target_id: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<HistoricalTargetRun>, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let limit_val = limit.unwrap_or(50);
    let offset_val = offset.unwrap_or(0);

    if let Some(tid) = target_id {
        let mut stmt = conn.prepare(
            "SELECT id, batch_id, target_id, status, latency_ms, http_status, profile_id, primary_failure_code, technical_evidence, started_at
             FROM target_runs
             WHERE target_id = ?1
             ORDER BY started_at DESC
             LIMIT ?2 OFFSET ?3"
        ).map_err(|e| AppError::Generic(e.to_string()))?;

        let rows = stmt
            .query_map(params![tid, limit_val, offset_val], |row| {
                Ok(HistoricalTargetRun {
                    id: row.get(0)?,
                    batch_id: row.get(1)?,
                    target_id: row.get(2)?,
                    status: row.get(3)?,
                    latency_ms: row.get::<_, Option<i64>>(4)?.map(|l| l as u64),
                    http_status: row.get::<_, Option<i64>>(5)?.map(|s| s as u32),
                    profile_id: row.get(6)?,
                    primary_failure_code: row.get(7)?,
                    technical_evidence: row.get(8)?,
                    started_at: row.get(9)?,
                })
            })
            .map_err(|e| AppError::Generic(e.to_string()))?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r.map_err(|e| AppError::Generic(e.to_string()))?);
        }
        Ok(results)
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, batch_id, target_id, status, latency_ms, http_status, profile_id, primary_failure_code, technical_evidence, started_at
             FROM target_runs
             ORDER BY started_at DESC
             LIMIT ?1 OFFSET ?2"
        ).map_err(|e| AppError::Generic(e.to_string()))?;

        let rows = stmt
            .query_map(params![limit_val, offset_val], |row| {
                Ok(HistoricalTargetRun {
                    id: row.get(0)?,
                    batch_id: row.get(1)?,
                    target_id: row.get(2)?,
                    status: row.get(3)?,
                    latency_ms: row.get::<_, Option<i64>>(4)?.map(|l| l as u64),
                    http_status: row.get::<_, Option<i64>>(5)?.map(|s| s as u32),
                    profile_id: row.get(6)?,
                    primary_failure_code: row.get(7)?,
                    technical_evidence: row.get(8)?,
                    started_at: row.get(9)?,
                })
            })
            .map_err(|e| AppError::Generic(e.to_string()))?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r.map_err(|e| AppError::Generic(e.to_string()))?);
        }
        Ok(results)
    }
}

#[tauri::command]
pub fn get_history_summary() -> Result<serde_json::Value, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    // Query total targets run counts
    let total_runs: u32 = conn
        .query_row("SELECT COUNT(*) FROM target_runs", [], |row| row.get(0))
        .unwrap_or(0);

    let passed_runs: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM target_runs WHERE status = 'healthy'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let failed_runs: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM target_runs WHERE status IN ('unreachable', 'degraded')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let open_incidents: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM incidents WHERE status = 'open'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let average_latency: f64 = conn
        .query_row(
            "SELECT AVG(latency_ms) FROM target_runs WHERE status = 'healthy'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0.0);

    let uptime_pct = if total_runs > 0 {
        (passed_runs as f64 / total_runs as f64) * 100.0
    } else {
        100.0
    };

    Ok(serde_json::json!({
        "total_runs": total_runs,
        "passed_runs": passed_runs,
        "failed_runs": failed_runs,
        "open_incidents": open_incidents,
        "average_latency_ms": average_latency,
        "uptime_percentage": uptime_pct,
    }))
}

#[tauri::command]
pub fn delete_monitoring_history() -> Result<(), AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    conn.execute("DELETE FROM target_runs", [])
        .map_err(|e| AppError::Generic(e.to_string()))?;
    conn.execute("DELETE FROM batches", [])
        .map_err(|e| AppError::Generic(e.to_string()))?;
    conn.execute("DELETE FROM incidents", [])
        .map_err(|e| AppError::Generic(e.to_string()))?;
    conn.execute("DELETE FROM alert_deliveries", [])
        .map_err(|e| AppError::Generic(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub fn list_incidents(status: Option<String>) -> Result<Vec<MonitoringIncident>, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let mut results = Vec::new();

    if let Some(ref st) = status {
        let mut stmt = conn.prepare(
            "SELECT id, target_id, profile_id, status, started_at, resolved_at, acknowledged_at, consecutive_failures, last_observed_at, title, summary
             FROM incidents
             WHERE status = ?1
             ORDER BY started_at DESC"
        ).map_err(|e| AppError::Generic(e.to_string()))?;

        let rows = stmt
            .query_map(params![st], |row| {
                Ok(MonitoringIncident {
                    id: row.get(0)?,
                    target_id: row.get(1)?,
                    profile_id: row.get(2)?,
                    status: row.get(3)?,
                    started_at: row.get(4)?,
                    resolved_at: row.get(5)?,
                    acknowledged_at: row.get(6)?,
                    consecutive_failures: row.get(7)?,
                    last_observed_at: row.get(8)?,
                    title: row.get(9)?,
                    summary: row.get(10)?,
                })
            })
            .map_err(|e| AppError::Generic(e.to_string()))?;

        for r in rows {
            results.push(r.map_err(|e| AppError::Generic(e.to_string()))?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, target_id, profile_id, status, started_at, resolved_at, acknowledged_at, consecutive_failures, last_observed_at, title, summary
             FROM incidents
             ORDER BY started_at DESC"
        ).map_err(|e| AppError::Generic(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(MonitoringIncident {
                    id: row.get(0)?,
                    target_id: row.get(1)?,
                    profile_id: row.get(2)?,
                    status: row.get(3)?,
                    started_at: row.get(4)?,
                    resolved_at: row.get(5)?,
                    acknowledged_at: row.get(6)?,
                    consecutive_failures: row.get(7)?,
                    last_observed_at: row.get(8)?,
                    title: row.get(9)?,
                    summary: row.get(10)?,
                })
            })
            .map_err(|e| AppError::Generic(e.to_string()))?;

        for r in rows {
            results.push(r.map_err(|e| AppError::Generic(e.to_string()))?);
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn acknowledge_incident(id: String) -> Result<(), AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE incidents
         SET acknowledged_at = ?1
         WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| AppError::Generic(e.to_string()))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringNotification {
    pub id: String,
    pub r#type: String,
    pub severity: String,
    pub created_at: String,
    pub read_at: Option<String>,
    pub title: String,
    pub summary: String,
    pub target_id: Option<String>,
    pub profile_id: Option<String>,
    pub run_id: Option<String>,
    pub incident_id: Option<String>,
    pub problem_id: Option<String>,
    pub delivery_state: String,
    pub deduplication_key: Option<String>,
}

#[tauri::command]
pub fn list_notifications(
    unread_only: bool,
    limit: Option<u32>,
) -> Result<Vec<MonitoringNotification>, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let limit_val = limit.unwrap_or(100);
    
    let sql = if unread_only {
        "SELECT id, type, severity, created_at, read_at, title, summary, target_id, profile_id, run_id, incident_id, problem_id, delivery_state, deduplication_key
         FROM notifications
         WHERE read_at IS NULL
         ORDER BY created_at DESC
         LIMIT ?1"
    } else {
        "SELECT id, type, severity, created_at, read_at, title, summary, target_id, profile_id, run_id, incident_id, problem_id, delivery_state, deduplication_key
         FROM notifications
         ORDER BY created_at DESC
         LIMIT ?1"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| AppError::Generic(e.to_string()))?;
    let rows = stmt
        .query_map(params![limit_val], |row| {
            Ok(MonitoringNotification {
                id: row.get(0)?,
                r#type: row.get(1)?,
                severity: row.get(2)?,
                created_at: row.get(3)?,
                read_at: row.get(4)?,
                title: row.get(5)?,
                summary: row.get(6)?,
                target_id: row.get(7)?,
                profile_id: row.get(8)?,
                run_id: row.get(9)?,
                incident_id: row.get(10)?,
                problem_id: row.get(11)?,
                delivery_state: row.get(12)?,
                deduplication_key: row.get(13)?,
            })
        })
        .map_err(|e| AppError::Generic(e.to_string()))?;

    let mut results = Vec::new();
    for r in rows {
        results.push(r.map_err(|e| AppError::Generic(e.to_string()))?);
    }
    Ok(results)
}

#[tauri::command]
pub fn mark_notification_as_read(id: String) -> Result<(), AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE notifications
         SET read_at = ?1
         WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| AppError::Generic(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub fn mark_all_notifications_as_read() -> Result<(), AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE notifications
         SET read_at = ?1
         WHERE read_at IS NULL",
        params![now],
    )
    .map_err(|e| AppError::Generic(e.to_string()))?;

    Ok(())
}
