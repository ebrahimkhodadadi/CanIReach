use crate::app_state::AppState;
use crate::error::AppError;
use crate::monitoring::continuous::{ContinuousMonitorConfig, MonitorSession};
use crate::monitoring::persistence::DbManager;
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub async fn start_continuous_monitor(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    target_id: String,
    config_json: Option<String>,
) -> Result<MonitorSession, AppError> {
    let config: ContinuousMonitorConfig = config_json
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    // Validate interval
    if config.interval_seconds < 5 {
        return Err(AppError::Generic(
            "Minimum interval is 5 seconds".to_string(),
        ));
    }

    let manager = state.continuous_monitor_manager.lock().await;
    manager.start_monitor(app, target_id, config).await
}

#[tauri::command]
pub async fn stop_continuous_monitor(
    state: State<'_, AppState>,
    target_id: String,
) -> Result<MonitorSession, AppError> {
    let manager = state.continuous_monitor_manager.lock().await;
    manager.stop_monitor(&target_id).await
}

#[tauri::command]
pub async fn get_continuous_monitor_status(
    state: State<'_, AppState>,
    target_id: String,
) -> Result<Option<MonitorSession>, AppError> {
    let manager = state.continuous_monitor_manager.lock().await;
    Ok(manager.get_session_status(&target_id).await)
}

#[tauri::command]
pub async fn list_continuous_monitors(
    state: State<'_, AppState>,
) -> Result<Vec<MonitorSession>, AppError> {
    let manager = state.continuous_monitor_manager.lock().await;
    Ok(manager.get_all_active_sessions().await)
}

#[tauri::command]
pub fn get_continuous_monitor_history(
    target_id: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<serde_json::Value>, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("DB error: {}", e)))?;
    let limit_val = limit.unwrap_or(50);
    let offset_val = offset.unwrap_or(0);

    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, target_id, run_index, status, latency_ms, http_status, error_category, error_message, started_at, completed_at
             FROM continuous_monitor_runs WHERE target_id = ?1 ORDER BY started_at DESC LIMIT ?2 OFFSET ?3",
        )
        .map_err(|e| AppError::Generic(e.to_string()))?;

    let rows = stmt
        .query_map(
            params![target_id, limit_val as i64, offset_val as i64],
            |row| {
                Ok(serde_json::json!({
                    "id": row.get::<_, String>(0)?,
                    "session_id": row.get::<_, String>(1)?,
                    "target_id": row.get::<_, String>(2)?,
                    "run_index": row.get::<_, i32>(3)?,
                    "status": row.get::<_, String>(4)?,
                    "latency_ms": row.get::<_, Option<i64>>(5)?,
                    "http_status": row.get::<_, Option<i64>>(6)?,
                    "error_category": row.get::<_, Option<String>>(7)?,
                    "error_message": row.get::<_, Option<String>>(8)?,
                    "started_at": row.get::<_, String>(9)?,
                    "completed_at": row.get::<_, Option<String>>(10)?,
                }))
            },
        )
        .map_err(|e| AppError::Generic(e.to_string()))?;

    let mut results = Vec::new();
    for r in rows {
        results.push(r.map_err(|e| AppError::Generic(e.to_string()))?);
    }
    Ok(results)
}
