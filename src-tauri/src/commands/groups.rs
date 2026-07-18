use crate::app_state::AppState;
use crate::config::GroupsLoader;
use crate::error::AppError;
use canireach_core::TargetGroup;
use tauri::State;

#[tauri::command]
pub fn get_target_groups() -> Result<Vec<TargetGroup>, AppError> {
    GroupsLoader::load()
}

#[tauri::command]
pub fn create_target_group(group: TargetGroup) -> Result<Vec<TargetGroup>, AppError> {
    if group.name.trim().is_empty() {
        return Err(AppError::Generic("Group name cannot be empty".to_string()));
    }

    let mut groups = GroupsLoader::load()?;
    if groups.iter().any(|g| g.id == group.id) {
        return Err(AppError::Generic(
            "Group with this ID already exists".to_string(),
        ));
    }

    let mut new_group = group;
    new_group.created_at = chrono::Utc::now().to_rfc3339();
    new_group.updated_at = chrono::Utc::now().to_rfc3339();

    groups.push(new_group);
    GroupsLoader::save(&groups)?;
    Ok(groups)
}

#[tauri::command]
pub fn update_target_group(group: TargetGroup) -> Result<Vec<TargetGroup>, AppError> {
    if group.name.trim().is_empty() {
        return Err(AppError::Generic("Group name cannot be empty".to_string()));
    }

    let mut groups = GroupsLoader::load()?;
    let index = groups
        .iter()
        .position(|g| g.id == group.id)
        .ok_or_else(|| AppError::Generic("Group not found".to_string()))?;

    let mut updated_group = group;
    updated_group.updated_at = chrono::Utc::now().to_rfc3339();

    groups[index] = updated_group;
    GroupsLoader::save(&groups)?;
    Ok(groups)
}

#[tauri::command]
pub fn delete_target_group(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<TargetGroup>, AppError> {
    let mut groups = GroupsLoader::load()?;
    let index = groups
        .iter()
        .position(|g| g.id == id)
        .ok_or_else(|| AppError::Generic("Group not found".to_string()))?;

    groups.remove(index);
    GroupsLoader::save(&groups)?;

    // Clean up targets that belonged to this group (remove group id)
    let mut targets = state.targets.lock().unwrap();
    let mut modified = false;
    for target in targets.iter_mut() {
        if target.group_ids.contains(&id) {
            target.group_ids.retain(|g| g != &id);
            target.updated_at = chrono::Utc::now().to_rfc3339();
            modified = true;
        }
    }
    if modified {
        crate::config::TargetLoader::save(&targets)?;
    }

    Ok(groups)
}
