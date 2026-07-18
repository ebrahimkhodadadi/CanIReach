use std::fs;
use std::path::{Path, PathBuf};

pub fn get_app_data_dir() -> PathBuf {
    let dir = if let Some(mut path) = dirs::data_dir() {
        path.push("CanIReach");
        path
    } else {
        PathBuf::from("config")
    };
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn get_db_path() -> PathBuf {
    get_app_data_dir().join("history.db")
}

pub fn get_settings_path() -> PathBuf {
    get_app_data_dir().join("settings.json")
}

pub fn get_targets_path() -> PathBuf {
    get_app_data_dir().join("targets.json")
}

pub fn get_groups_path() -> PathBuf {
    get_app_data_dir().join("groups.json")
}

pub fn get_profiles_path() -> PathBuf {
    get_app_data_dir().join("profiles.json")
}

pub fn get_schedules_path() -> PathBuf {
    get_app_data_dir().join("schedules.json")
}

pub fn migrate_local_config_if_needed() {
    let local_dir = Path::new("config");
    let target_dir = get_app_data_dir();

    if !local_dir.exists() || local_dir == target_dir {
        return;
    }

    let files = [
        "history.db",
        "settings.json",
        "targets.json",
        "groups.json",
        "profiles.json",
        "schedules.json",
    ];

    for file in &files {
        let src = local_dir.join(file);
        let dest = target_dir.join(file);
        if src.exists() && !dest.exists() {
            if let Err(e) = fs::copy(&src, &dest) {
                eprintln!(
                    "WARN: Failed to migrate configuration file {:?}: {}",
                    file, e
                );
            } else {
                println!("INFO: Migrated configuration file {:?} to AppData.", file);
            }
        }
    }
}
