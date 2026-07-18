use crate::app_state::AppState;
use crate::monitoring::analyzer::AnalyzerSnapshot;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_analyzer_snapshot(
    state: State<'_, AppState>,
    _dummy: Option<bool>,
) -> Result<AnalyzerSnapshot, String> {
    Ok(state.analyzer_snapshot.lock().unwrap().clone())
}

#[tauri::command]
pub fn start_analyzer(
    app: AppHandle,
    state: State<'_, AppState>,
    _dummy: Option<bool>,
) -> Result<(), String> {
    state
        .analyzer_service
        .start(app, state.analyzer_snapshot.clone());
    Ok(())
}

#[tauri::command]
pub fn stop_analyzer(state: State<'_, AppState>, _dummy: Option<bool>) -> Result<(), String> {
    state.analyzer_service.stop();
    let mut snapshot = state.analyzer_snapshot.lock().unwrap();
    snapshot.status = "off".to_string();
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzerSampleRow {
    pub created_at: String,
    pub latency_ms: f32,
    pub jitter_ms: f32,
    pub dns_latency_ms: f32,
    pub packet_loss: f32,
    pub availability: f32,
    pub stability_score: f32,
}

#[tauri::command]
pub fn get_analyzer_samples(limit: u32) -> Result<Vec<AnalyzerSampleRow>, String> {
    let conn = crate::monitoring::persistence::DbManager::get_connection()
        .map_err(|e| format!("Database connection error: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT created_at, latency_ms, jitter_ms, dns_latency_ms, packet_loss, availability, stability_score 
             FROM analyzer_samples 
             ORDER BY created_at DESC 
             LIMIT ?1",
        )
        .map_err(|e| format!("Statement preparation error: {}", e))?;

    let rows = stmt
        .query_map([limit], |row| {
            Ok(AnalyzerSampleRow {
                created_at: row.get(0)?,
                latency_ms: row.get(1)?,
                jitter_ms: row.get(2)?,
                dns_latency_ms: row.get(3)?,
                packet_loss: row.get(4)?,
                availability: row.get(5)?,
                stability_score: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query execution error: {}", e))?;

    let mut results = Vec::new();
    for item in rows.flatten() {
        results.push(item);
    }

    results.reverse();
    Ok(results)
}
