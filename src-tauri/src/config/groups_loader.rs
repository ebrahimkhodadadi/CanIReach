use crate::error::AppError;
use canireach_core::TargetGroup;
use std::fs;
use std::path::PathBuf;

pub struct GroupsLoader;

impl GroupsLoader {
    pub fn load() -> Result<Vec<TargetGroup>, AppError> {
        let paths = vec![
            PathBuf::from("config/groups.json"),
            PathBuf::from("../config/groups.json"),
        ];

        let mut content = None;
        for path in &paths {
            if path.exists() {
                if let Ok(c) = fs::read_to_string(path) {
                    content = Some(c);
                    break;
                }
            }
        }

        match content {
            Some(c) => serde_json::from_str::<Vec<TargetGroup>>(&c)
                .map_err(|e| AppError::Config(format!("Failed to parse groups config: {}", e))),
            None => {
                let defaults = Self::get_defaults();
                let save_path = PathBuf::from("config/groups.json");
                if let Some(parent) = save_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                if let Ok(serialized) = serde_json::to_string_pretty(&defaults) {
                    let _ = fs::write(&save_path, serialized);
                }
                Ok(defaults)
            }
        }
    }

    pub fn save(groups: &Vec<TargetGroup>) -> Result<(), AppError> {
        let paths = vec![
            PathBuf::from("config/groups.json"),
            PathBuf::from("../config/groups.json"),
        ];

        let mut save_path = PathBuf::from("config/groups.json");
        for path in &paths {
            if path.exists() {
                save_path = path.clone();
                break;
            }
        }

        if let Some(parent) = save_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let serialized = serde_json::to_string_pretty(groups)
            .map_err(|e| AppError::Generic(format!("Failed to serialize groups: {}", e)))?;
        fs::write(save_path, serialized)
            .map_err(|e| AppError::Generic(format!("Failed to write groups: {}", e)))?;

        Ok(())
    }

    fn get_defaults() -> Vec<TargetGroup> {
        vec![
            TargetGroup {
                id: "google-services".to_string(),
                name: "Google Services".to_string(),
                description: Some("Google development services and APIs".to_string()),
                color: Some("#4285F4".to_string()),
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            TargetGroup {
                id: "package-managers".to_string(),
                name: "Package Managers".to_string(),
                description: Some("Crates, NPM, Pub registries".to_string()),
                color: Some("#34A853".to_string()),
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
        ]
    }
}
