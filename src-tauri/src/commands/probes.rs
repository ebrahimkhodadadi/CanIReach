use crate::app_state::AppState;
use crate::error::AppError;
use crate::events::{
    emit_probe_cancelled, emit_probe_stage_completed, emit_probe_stage_started, emit_probe_started,
    emit_probe_update,
};
use canireach_core::{ProbeEvent, ProbeResult};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn probe_all(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<ProbeResult>, AppError> {
    let targets = state.targets.lock().unwrap().clone();
    let app_clone = app.clone();
    let cancel_flag = Arc::new(AtomicBool::new(false));

    {
        let mut active = state
            .active_probes
            .lock()
            .map_err(|e| AppError::Generic(format!("Failed to lock active probes map: {}", e)))?;
        for target in &targets {
            active.insert(target.id.clone(), cancel_flag.clone());
        }
    }

    let engine = state.engine.lock().await;
    let results = engine
        .probe_all(targets.clone(), cancel_flag.clone(), move |result| {
            emit_probe_update(Some(&app_clone), result);
        })
        .await;

    {
        if let Ok(mut active) = state.active_probes.lock() {
            for target in &targets {
                active.remove(&target.id);
            }
        }
    }

    if let Ok(conn) = crate::monitoring::persistence::DbManager::get_connection() {
        for result in &results {
            let profile_id = targets
                .iter()
                .find(|t| t.id == result.target_id)
                .and_then(|t| t.network_profile_id.clone())
                .unwrap_or_else(|| "system-default".to_string());
            let _ = crate::intelligence::collector::FailedRequestRegistry::record_from_probe_result(
                &conn,
                result,
                None,
                &profile_id,
            );
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn probe_by_category(
    category: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<ProbeResult>, AppError> {
    let all_targets = state.targets.lock().unwrap().clone();
    let targets: Vec<_> = all_targets
        .into_iter()
        .filter(|t| t.category.as_deref() == Some(&category) && t.enabled)
        .collect();

    if targets.is_empty() {
        return Ok(Vec::new());
    }

    let app_clone = app.clone();
    let cancel_flag = Arc::new(AtomicBool::new(false));

    {
        let mut active = state
            .active_probes
            .lock()
            .map_err(|e| AppError::Generic(format!("Failed to lock active probes map: {}", e)))?;
        for target in &targets {
            active.insert(target.id.clone(), cancel_flag.clone());
        }
    }

    emit_probe_started(
        Some(&app_clone),
        &format!("category:{}", category),
        &format!("Testing category: {}", category),
    );

    let engine = state.engine.lock().await;
    let results = engine
        .probe_all(targets.clone(), cancel_flag.clone(), move |result| {
            emit_probe_update(Some(&app_clone), result);
        })
        .await;
    drop(engine);

    {
        let mut active = state
            .active_probes
            .lock()
            .map_err(|e| AppError::Generic(format!("Failed to lock active probes map: {}", e)))?;
        for target in &targets {
            active.remove(&target.id);
        }
    }

    if let Ok(conn) = crate::monitoring::persistence::DbManager::get_connection() {
        for result in &results {
            let profile_id = targets
                .iter()
                .find(|t| t.id == result.target_id)
                .and_then(|t| t.network_profile_id.clone())
                .unwrap_or_else(|| "system-default".to_string());
            let _ = crate::intelligence::collector::FailedRequestRegistry::record_from_probe_result(
                &conn,
                result,
                None,
                &profile_id,
            );
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn probe_one(
    app: AppHandle,
    state: State<'_, AppState>,
    target_id: String,
) -> Result<ProbeResult, AppError> {
    let target = {
        let targets_lock = state.targets.lock().unwrap();
        targets_lock
            .iter()
            .find(|t| t.id == target_id)
            .ok_or_else(|| AppError::Generic(format!("Target with id '{}' not found", target_id)))?
            .clone()
    };

    let app_clone = app.clone();
    let target_id_clone = target_id.clone();
    let cancel_flag = Arc::new(AtomicBool::new(false));

    {
        let mut active = state
            .active_probes
            .lock()
            .map_err(|e| AppError::Generic(format!("Failed to lock active probes map: {}", e)))?;
        active.insert(target_id.clone(), cancel_flag.clone());
    }

    let engine = state.engine.lock().await;
    let result = engine
        .probe_one_with_events(&target, cancel_flag.clone(), move |event| match event {
            ProbeEvent::Started { run_id } => {
                emit_probe_started(Some(&app_clone), &run_id, &target_id_clone);
            }
            ProbeEvent::StageStarted { run_id, stage } => {
                emit_probe_stage_started(Some(&app_clone), &run_id, &target_id_clone, &stage);
            }
            ProbeEvent::StageCompleted {
                run_id,
                stage,
                result,
            } => {
                emit_probe_stage_completed(
                    Some(&app_clone),
                    &run_id,
                    &target_id_clone,
                    &stage,
                    &result,
                );
            }
            ProbeEvent::Completed { run_id: _, result } => {
                emit_probe_update(Some(&app_clone), *result);
            }
        })
        .await;

    {
        if let Ok(mut active) = state.active_probes.lock() {
            active.remove(&target_id);
        }
    }

    let profile_id = target
        .network_profile_id
        .clone()
        .unwrap_or_else(|| "system-default".to_string());
    if let Ok(conn) = crate::monitoring::persistence::DbManager::get_connection() {
        let _ = crate::intelligence::collector::FailedRequestRegistry::record_from_probe_result(
            &conn,
            &result,
            None,
            &profile_id,
        );
    }

    Ok(result)
}

#[tauri::command]
pub fn cancel_probe(
    app: AppHandle,
    state: State<'_, AppState>,
    target_id: String,
) -> Result<(), AppError> {
    let active = state
        .active_probes
        .lock()
        .map_err(|e| AppError::Generic(format!("Failed to lock active probes map: {}", e)))?;

    if let Some(flag) = active.get(&target_id) {
        flag.store(true, Ordering::Relaxed);
    }

    emit_probe_cancelled(Some(&app), &target_id, &target_id);

    Ok(())
}

#[tauri::command]
pub fn cancel_all_probes(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    let active = state
        .active_probes
        .lock()
        .map_err(|e| AppError::Generic(format!("Failed to lock active probes map: {}", e)))?;

    let target_ids: Vec<String> = active.keys().cloned().collect();
    for flag in active.values() {
        flag.store(true, Ordering::Relaxed);
    }

    for target_id in target_ids {
        emit_probe_cancelled(Some(&app), &target_id, &target_id);
    }

    Ok(())
}
