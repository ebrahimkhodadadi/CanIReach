use crate::config::TargetLoader;
use crate::error::AppError;
use canireach_core::{ProbeConfig, ProbeEngine, Target};
use std::collections::HashMap;
use std::fs;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tokio::sync::Mutex as TokioMutex;

pub struct AppState {
    pub engine: TokioMutex<ProbeEngine>,
    pub config: Mutex<ProbeConfig>,
    pub targets: Mutex<Vec<Target>>,
    pub active_traces: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    pub active_probes: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    pub scheduler_wake_tx: Mutex<Option<tokio::sync::mpsc::UnboundedSender<()>>>,
    pub monitoring_paused: Arc<AtomicBool>,
    pub webrtc_candidates: Arc<Mutex<HashMap<String, Vec<String>>>>,
    pub updater_status: Arc<Mutex<crate::commands::updater::UpdateSnapshot>>,
    pub analyzer_service: crate::monitoring::analyzer::AnalyzerService,
    pub analyzer_snapshot: Arc<Mutex<crate::monitoring::analyzer::AnalyzerSnapshot>>,
    pub continuous_monitor_manager: TokioMutex<crate::monitoring::continuous::ContinuousMonitorManager>,
}

impl AppState {
    pub fn init() -> Result<Self, AppError> {
        let targets = Mutex::new(TargetLoader::load()?);
        let scheduler_wake_tx = Mutex::new(None);
        let monitoring_paused = Arc::new(AtomicBool::new(false));
        let webrtc_candidates = Arc::new(Mutex::new(HashMap::new()));

        let config_path = crate::config::get_settings_path();
        let config = if config_path.exists() {
            if let Ok(content) = fs::read_to_string(&config_path) {
                serde_json::from_str(&content).unwrap_or_else(|_| ProbeConfig::default())
            } else {
                ProbeConfig::default()
            }
        } else {
            ProbeConfig::default()
        };

        let updater_status = Arc::new(Mutex::new(crate::commands::updater::UpdateSnapshot {
            status: crate::commands::updater::UpdateStatus::Idle,
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            available_version: None,
            download_progress: None,
            error: None,
        }));

        let analyzer_service = crate::monitoring::analyzer::AnalyzerService::new();
        let analyzer_snapshot =
            Arc::new(Mutex::new(crate::monitoring::analyzer::AnalyzerSnapshot {
                status: "off".to_string(),
                current_latency: 0.0,
                current_jitter: 0.0,
                current_dns_latency: 0.0,
                current_loss: 0.0,
                stability_score: 100.0,
                active_interface: "Ethernet/Wi-Fi".to_string(),
                ip4_available: true,
                ip6_available: false,
            }));

        let engine = ProbeEngine::new(config.clone())?;
        let active_traces = Arc::new(Mutex::new(HashMap::new()));
        let active_probes = Arc::new(Mutex::new(HashMap::new()));
        let continuous_monitor_manager =
            TokioMutex::new(crate::monitoring::continuous::ContinuousMonitorManager::new());

        Ok(Self {
            engine: TokioMutex::new(engine),
            config: Mutex::new(config),
            targets,
            active_traces,
            active_probes,
            scheduler_wake_tx,
            monitoring_paused,
            webrtc_candidates,
            updater_status,
            analyzer_service,
            analyzer_snapshot,
            continuous_monitor_manager,
        })
    }

    pub async fn save_config(&self, new_config: ProbeConfig) -> Result<(), AppError> {
        let config_path = crate::config::get_settings_path();
        let serialized = serde_json::to_string_pretty(&new_config)
            .map_err(|e| AppError::Generic(format!("Failed to serialize config: {}", e)))?;
        fs::write(config_path, serialized)
            .map_err(|e| AppError::Generic(format!("Failed to write config: {}", e)))?;

        let new_engine = ProbeEngine::new(new_config.clone())?;

        {
            let mut config_lock = self.config.lock().unwrap();
            *config_lock = new_config;
        }

        let mut engine_lock = self.engine.lock().await;
        *engine_lock = new_engine;

        Ok(())
    }
}
