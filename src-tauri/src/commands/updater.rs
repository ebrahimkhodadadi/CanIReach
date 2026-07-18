use crate::app_state::AppState;
use crate::error::AppError;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub enum UpdateStatus {
    Idle,
    Checking,
    UpToDate,
    Available,
    Downloading,
    Downloaded,
    Verifying,
    ReadyToInstall,
    Installing,
    Failed,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSnapshot {
    pub status: UpdateStatus,
    pub current_version: String,
    pub available_version: Option<String>,
    pub download_progress: Option<f32>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn get_update_state(state: State<'_, AppState>) -> UpdateSnapshot {
    state.updater_status.lock().unwrap().clone()
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle, state: State<'_, AppState>) -> Result<UpdateSnapshot, AppError> {
    {
        let mut status = state.updater_status.lock().unwrap();
        status.status = UpdateStatus::Checking;
        status.error = None;
        let _ = app.emit("update-state-changed", status.clone());
    }

    let updater = app.updater().map_err(|e| AppError::Generic(e.to_string()))?;
    match updater.check().await {
        Ok(Some(update)) => {
            let mut status = state.updater_status.lock().unwrap();
            status.status = UpdateStatus::Available;
            status.available_version = Some(update.version.clone());
            let _ = app.emit("update-state-changed", status.clone());
            Ok(status.clone())
        }
        Ok(None) => {
            let mut status = state.updater_status.lock().unwrap();
            status.status = UpdateStatus::UpToDate;
            let _ = app.emit("update-state-changed", status.clone());
            Ok(status.clone())
        }
        Err(e) => {
            let mut status = state.updater_status.lock().unwrap();
            status.status = UpdateStatus::Failed;
            status.error = Some(e.to_string());
            let _ = app.emit("update-state-changed", status.clone());
            Ok(status.clone())
        }
    }
}

#[tauri::command]
pub async fn download_and_install_update(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    let updater = app.updater().map_err(|e| AppError::Generic(e.to_string()))?;
    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => return Err(AppError::Generic("No update available".to_string())),
        Err(e) => return Err(AppError::Generic(e.to_string())),
    };

    {
        let mut status = state.updater_status.lock().unwrap();
        status.status = UpdateStatus::Downloading;
        status.download_progress = Some(0.0);
        let _ = app.emit("update-state-changed", status.clone());
    }

    let updater_status = state.updater_status.clone();
    let app_clone = app.clone();

    // Trigger download & install
    let update_res = update.download_and_install(
        move |chunk_len, total_len| {
            if let Some(total) = total_len {
                let progress = chunk_len as f32 / total as f32;
                let mut status = updater_status.lock().unwrap();
                status.download_progress = Some(progress);
                let _ = app_clone.emit("update-state-changed", status.clone());
            }
        },
        || {}
    ).await;

    if let Err(e) = update_res {
        let mut status = state.updater_status.lock().unwrap();
        status.status = UpdateStatus::Failed;
        status.error = Some(e.to_string());
        let _ = app.emit("update-state-changed", status.clone());
        return Err(AppError::Generic(e.to_string()));
    }

    // Coordinate safe shutdown:
    // 1. Pause Scheduler Service
    let state_handle = app.state::<AppState>();
    if let Some(tx) = &*state_handle.scheduler_wake_tx.lock().unwrap() {
        state_handle.monitoring_paused.store(true, std::sync::atomic::Ordering::SeqCst);
        let _ = tx.send(());
    }

    // 2. Log update lifecycle event inside db
    if let Ok(conn) = crate::monitoring::persistence::DbManager::get_connection() {
        let _ = conn.execute(
            "INSERT INTO notifications (id, type, severity, created_at, title, summary, delivery_state)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            [
                uuid::Uuid::new_v4().to_string(),
                "lifecycle".to_string(),
                "info".to_string(),
                chrono::Utc::now().to_rfc3339(),
                "Application Updated".to_string(),
                "The application was successfully updated to a newer version.".to_string(),
                "delivered".to_string(),
            ],
        );
    }

    {
        let mut status = state.updater_status.lock().unwrap();
        status.status = UpdateStatus::ReadyToInstall;
        let _ = app.emit("update-state-changed", status.clone());
    }

    Ok(())
}
