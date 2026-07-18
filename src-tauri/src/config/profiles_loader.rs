use crate::error::AppError;
use canireach_core::{
    DnsSelection, NetworkInterfaceSelection, NetworkProfile, PreflightProfileSettings,
    ProxySelection,
};
use std::fs;
use std::path::PathBuf;

pub struct ProfilesLoader;

impl ProfilesLoader {
    pub fn load() -> Result<Vec<NetworkProfile>, AppError> {
        let paths = vec![
            PathBuf::from("config/profiles.json"),
            PathBuf::from("../config/profiles.json"),
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
            Some(c) => serde_json::from_str::<Vec<NetworkProfile>>(&c)
                .map_err(|e| AppError::Config(format!("Failed to parse profiles config: {}", e))),
            None => {
                let defaults = Self::get_defaults();
                let save_path = PathBuf::from("config/profiles.json");
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

    pub fn save(profiles: &Vec<NetworkProfile>) -> Result<(), AppError> {
        let paths = vec![
            PathBuf::from("config/profiles.json"),
            PathBuf::from("../config/profiles.json"),
        ];

        let mut save_path = PathBuf::from("config/profiles.json");
        for path in &paths {
            if path.exists() {
                save_path = path.clone();
                break;
            }
        }

        if let Some(parent) = save_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let serialized = serde_json::to_string_pretty(profiles)
            .map_err(|e| AppError::Generic(format!("Failed to serialize profiles: {}", e)))?;
        fs::write(save_path, serialized)
            .map_err(|e| AppError::Generic(format!("Failed to write profiles: {}", e)))?;

        Ok(())
    }

    fn get_defaults() -> Vec<NetworkProfile> {
        vec![NetworkProfile {
            id: "system-default".to_string(),
            name: "System Default".to_string(),
            description: Some(
                "Use current system routing, DNS, and proxy configurations".to_string(),
            ),
            is_default: true,
            interface: NetworkInterfaceSelection {
                mode: "system".to_string(),
                interface_id: None,
                source_ipv4: None,
                source_ipv6: None,
            },
            dns: DnsSelection {
                mode: "system".to_string(),
                servers: Vec::new(),
            },
            proxy: ProxySelection {
                mode: "system".to_string(),
                custom_type: None,
                custom_host: None,
                custom_port: None,
                auth_username: None,
                auth_credential_id: None,
                bypass: None,
            },
            ip_preference: "system".to_string(),
            preflight: Some(PreflightProfileSettings {
                run_preflight: true,
                timeout_ms: 3000,
                endpoints: vec![
                    "https://www.google.com".to_string(),
                    "https://www.cloudflare.com".to_string(),
                ],
                min_success_count: 1,
            }),
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        }]
    }
}
