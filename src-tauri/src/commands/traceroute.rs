use crate::app_state::AppState;
use crate::error::AppError;
use crate::traceroute::{run_traceroute, TracerouteResult};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn start_traceroute(
    app: AppHandle,
    state: State<'_, AppState>,
    target_id: String,
    trace_id: String,
    max_hops: Option<u32>,
    resolve_hostnames: Option<bool>,
) -> Result<TracerouteResult, AppError> {
    let target_host;
    let target_name;
    {
        let targets_lock = state.targets.lock().unwrap();
        let target = targets_lock
            .iter()
            .find(|t| t.id == target_id)
            .ok_or_else(|| AppError::Generic(format!("Target not found: {}", target_id)))?;
        target_host = target.url.clone();
        target_name = target.name.clone();
    }

    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut active = state
            .active_traces
            .lock()
            .map_err(|e| AppError::Generic(format!("Failed to lock active traces map: {}", e)))?;
        active.insert(trace_id.clone(), cancel_flag.clone());
    }

    let max_hops_val = max_hops.unwrap_or(30).clamp(1, 64);
    let resolve = resolve_hostnames.unwrap_or(true);

    let result = run_traceroute(
        Some(app),
        target_id,
        target_name,
        target_host,
        trace_id.clone(),
        max_hops_val,
        resolve,
        cancel_flag,
    )
    .await
    .map_err(AppError::Generic);

    {
        if let Ok(mut active) = state.active_traces.lock() {
            active.remove(&trace_id);
        }
    }

    result
}

#[tauri::command]
pub fn cancel_traceroute(state: State<'_, AppState>, trace_id: String) -> Result<(), AppError> {
    let active = state
        .active_traces
        .lock()
        .map_err(|e| AppError::Generic(format!("Failed to lock active traces map: {}", e)))?;

    if let Some(flag) = active.get(&trace_id) {
        flag.store(true, Ordering::Relaxed);
    }

    Ok(())
}
