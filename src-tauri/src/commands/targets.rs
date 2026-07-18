use crate::app_state::AppState;
use crate::config::TargetLoader;
use crate::error::AppError;
use canireach_core::Target;
use tauri::State;

#[tauri::command]
pub fn get_targets(state: State<'_, AppState>) -> Result<Vec<Target>, AppError> {
    let targets = state.targets.lock().unwrap();
    Ok(targets.clone())
}

#[tauri::command]
pub fn create_target(state: State<'_, AppState>, target: Target) -> Result<Vec<Target>, AppError> {
    // Validate target input
    if target.name.trim().is_empty() {
        return Err(AppError::Generic("Target name cannot be empty".to_string()));
    }
    if target.url.trim().is_empty() {
        return Err(AppError::Generic("Target URL cannot be empty".to_string()));
    }

    let mut targets = state.targets.lock().unwrap();

    // Check for duplicate ID
    if targets.iter().any(|t| t.id == target.id) {
        return Err(AppError::Generic(
            "Target with this ID already exists".to_string(),
        ));
    }

    let mut new_target = target;
    new_target.created_at = chrono::Utc::now().to_rfc3339();
    new_target.updated_at = chrono::Utc::now().to_rfc3339();

    targets.push(new_target);
    TargetLoader::save(&targets)?;

    Ok(targets.clone())
}

#[tauri::command]
pub fn update_target(state: State<'_, AppState>, target: Target) -> Result<Vec<Target>, AppError> {
    if target.name.trim().is_empty() {
        return Err(AppError::Generic("Target name cannot be empty".to_string()));
    }
    if target.url.trim().is_empty() {
        return Err(AppError::Generic("Target URL cannot be empty".to_string()));
    }

    let mut targets = state.targets.lock().unwrap();

    let index = targets
        .iter()
        .position(|t| t.id == target.id)
        .ok_or_else(|| AppError::Generic("Target not found".to_string()))?;

    let mut updated_target = target;
    updated_target.updated_at = chrono::Utc::now().to_rfc3339();

    targets[index] = updated_target;
    TargetLoader::save(&targets)?;

    Ok(targets.clone())
}

#[tauri::command]
pub fn delete_target(state: State<'_, AppState>, id: String) -> Result<Vec<Target>, AppError> {
    let mut targets = state.targets.lock().unwrap();

    let index = targets
        .iter()
        .position(|t| t.id == id)
        .ok_or_else(|| AppError::Generic("Target not found".to_string()))?;

    targets.remove(index);
    TargetLoader::save(&targets)?;

    Ok(targets.clone())
}

#[tauri::command]
pub fn duplicate_target(state: State<'_, AppState>, id: String) -> Result<Vec<Target>, AppError> {
    let mut targets = state.targets.lock().unwrap();

    let target_to_copy = targets
        .iter()
        .find(|t| t.id == id)
        .ok_or_else(|| AppError::Generic("Target not found".to_string()))?
        .clone();

    let mut new_target = target_to_copy;
    let new_id = format!("{}-copy-{}", new_target.id, chrono::Utc::now().timestamp());
    new_target.id = new_id.clone();
    new_target.name = format!("{} (Copy)", new_target.name);
    new_target.created_at = chrono::Utc::now().to_rfc3339();
    new_target.updated_at = chrono::Utc::now().to_rfc3339();

    targets.push(new_target);
    TargetLoader::save(&targets)?;

    Ok(targets.clone())
}

#[tauri::command]
pub fn set_target_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<Vec<Target>, AppError> {
    let mut targets = state.targets.lock().unwrap();

    let index = targets
        .iter()
        .position(|t| t.id == id)
        .ok_or_else(|| AppError::Generic("Target not found".to_string()))?;

    targets[index].enabled = enabled;
    targets[index].updated_at = chrono::Utc::now().to_rfc3339();
    TargetLoader::save(&targets)?;

    Ok(targets.clone())
}
