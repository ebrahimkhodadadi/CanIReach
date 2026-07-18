use crate::error::AppError;
use crate::monitoring::models::schedule::MonitoringSchedule;
use std::fs;
use std::path::PathBuf;

pub struct SchedulesLoader;

impl SchedulesLoader {
    pub fn load() -> Result<Vec<MonitoringSchedule>, AppError> {
        let paths = vec![
            PathBuf::from("config/schedules.json"),
            PathBuf::from("../config/schedules.json"),
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
            Some(c) => serde_json::from_str::<Vec<MonitoringSchedule>>(&c)
                .map_err(|e| AppError::Config(format!("Failed to parse schedules config: {}", e))),
            None => {
                let defaults = Vec::new();
                let save_path = PathBuf::from("config/schedules.json");
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

    pub fn save(schedules: &Vec<MonitoringSchedule>) -> Result<(), AppError> {
        let paths = vec![
            PathBuf::from("config/schedules.json"),
            PathBuf::from("../config/schedules.json"),
        ];

        let mut save_path = PathBuf::from("config/schedules.json");
        for path in &paths {
            if path.exists() {
                save_path = path.clone();
                break;
            }
        }

        if let Some(parent) = save_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let serialized = serde_json::to_string_pretty(schedules)
            .map_err(|e| AppError::Generic(format!("Failed to serialize schedules: {}", e)))?;
        fs::write(save_path, serialized)
            .map_err(|e| AppError::Generic(format!("Failed to write schedules: {}", e)))?;

        Ok(())
    }
}
