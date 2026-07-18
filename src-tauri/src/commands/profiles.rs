use crate::app_state::AppState;
use crate::config::ProfilesLoader;
use crate::error::AppError;
use canireach_core::NetworkProfile;
use tauri::State;

#[tauri::command]
pub fn get_network_profiles() -> Result<Vec<NetworkProfile>, AppError> {
    ProfilesLoader::load()
}

#[tauri::command]
pub fn create_network_profile(profile: NetworkProfile) -> Result<Vec<NetworkProfile>, AppError> {
    if profile.name.trim().is_empty() {
        return Err(AppError::Generic(
            "Profile name cannot be empty".to_string(),
        ));
    }

    let mut profiles = ProfilesLoader::load()?;
    if profiles.iter().any(|p| p.id == profile.id) {
        return Err(AppError::Generic(
            "Profile with this ID already exists".to_string(),
        ));
    }

    let mut new_profile = profile;
    new_profile.created_at = chrono::Utc::now().to_rfc3339();
    new_profile.updated_at = chrono::Utc::now().to_rfc3339();

    // If new profile is default, unset other defaults
    if new_profile.is_default {
        for p in &mut profiles {
            p.is_default = false;
        }
    }

    profiles.push(new_profile);
    ProfilesLoader::save(&profiles)?;
    Ok(profiles)
}

#[tauri::command]
pub fn update_network_profile(profile: NetworkProfile) -> Result<Vec<NetworkProfile>, AppError> {
    if profile.name.trim().is_empty() {
        return Err(AppError::Generic(
            "Profile name cannot be empty".to_string(),
        ));
    }

    let mut profiles = ProfilesLoader::load()?;
    let index = profiles
        .iter()
        .position(|p| p.id == profile.id)
        .ok_or_else(|| AppError::Generic("Profile not found".to_string()))?;

    // Protect system-default profile from losing its default flag unless another is default
    let mut updated_profile = profile;
    updated_profile.updated_at = chrono::Utc::now().to_rfc3339();

    if updated_profile.is_default {
        for (i, p) in profiles.iter_mut().enumerate() {
            if i != index {
                p.is_default = false;
            }
        }
    }

    profiles[index] = updated_profile;
    ProfilesLoader::save(&profiles)?;
    Ok(profiles)
}

#[tauri::command]
pub fn delete_network_profile(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<NetworkProfile>, AppError> {
    if id == "system-default" {
        return Err(AppError::Generic(
            "Cannot delete protected System Default profile".to_string(),
        ));
    }

    let mut profiles = ProfilesLoader::load()?;
    let index = profiles
        .iter()
        .position(|p| p.id == id)
        .ok_or_else(|| AppError::Generic("Profile not found".to_string()))?;

    let removed = profiles.remove(index);

    // If the deleted profile was default, make system-default the default
    if removed.is_default {
        if let Some(sys) = profiles.iter_mut().find(|p| p.id == "system-default") {
            sys.is_default = true;
        }
    }

    ProfilesLoader::save(&profiles)?;

    // Clean up targets that belonged to this profile
    let mut targets = state.targets.lock().unwrap();
    let mut modified = false;
    for target in targets.iter_mut() {
        if target.network_profile_id == Some(id.clone()) {
            target.network_profile_id = None;
            target.updated_at = chrono::Utc::now().to_rfc3339();
            modified = true;
        }
    }
    if modified {
        crate::config::TargetLoader::save(&targets)?;
    }

    Ok(profiles)
}

#[tauri::command]
pub fn set_default_network_profile(id: String) -> Result<Vec<NetworkProfile>, AppError> {
    let mut profiles = ProfilesLoader::load()?;
    let index = profiles
        .iter()
        .position(|p| p.id == id)
        .ok_or_else(|| AppError::Generic("Profile not found".to_string()))?;

    for (i, p) in profiles.iter_mut().enumerate() {
        p.is_default = i == index;
        p.updated_at = chrono::Utc::now().to_rfc3339();
    }

    ProfilesLoader::save(&profiles)?;
    Ok(profiles)
}
