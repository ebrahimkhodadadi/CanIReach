use crate::app_state::AppState;
use crate::error::AppError;
use canireach_core::ProbeConfig;
use tauri::State;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct FrontendSettings {
    pub timeout_ms: u64,
    pub connect_timeout_ms: u64,
    pub dns_timeout_ms: u64,
    pub tcp_timeout_ms: u64,
    pub tls_timeout_ms: u64,
    pub redirect_limit: usize,
    pub follow_redirects: bool,
    pub prefer_ipv4: bool,
    pub prefer_ipv6: bool,
    pub enable_ipv4_diagnostics: bool,
    pub enable_ipv6_diagnostics: bool,
    pub verify_tls: bool,
    pub proxy_mode: String, // "system" | "none" | "custom"
    pub proxy_url: Option<String>,
    pub user_agent: String,
    pub retry_count: u32,
    pub retry_delay_ms: u64,
    pub concurrency_limit: usize,
}

impl From<ProbeConfig> for FrontendSettings {
    fn from(c: ProbeConfig) -> Self {
        Self {
            timeout_ms: c.timeout.as_millis() as u64,
            connect_timeout_ms: c.connect_timeout.as_millis() as u64,
            dns_timeout_ms: c.dns_timeout.as_millis() as u64,
            tcp_timeout_ms: c.tcp_timeout.as_millis() as u64,
            tls_timeout_ms: c.tls_timeout.as_millis() as u64,
            redirect_limit: c.redirect_limit,
            follow_redirects: c.follow_redirects,
            prefer_ipv4: c.prefer_ipv4,
            prefer_ipv6: c.prefer_ipv6,
            enable_ipv4_diagnostics: c.enable_ipv4_diagnostics,
            enable_ipv6_diagnostics: c.enable_ipv6_diagnostics,
            verify_tls: c.verify_tls,
            proxy_mode: c.proxy_mode,
            proxy_url: c.proxy_url,
            user_agent: c.user_agent,
            retry_count: c.retry_count,
            retry_delay_ms: c.retry_delay.as_millis() as u64,
            concurrency_limit: c.concurrency_limit,
        }
    }
}

impl From<FrontendSettings> for ProbeConfig {
    fn from(s: FrontendSettings) -> Self {
        Self {
            timeout: std::time::Duration::from_millis(s.timeout_ms),
            connect_timeout: std::time::Duration::from_millis(s.connect_timeout_ms),
            dns_timeout: std::time::Duration::from_millis(s.dns_timeout_ms),
            tcp_timeout: std::time::Duration::from_millis(s.tcp_timeout_ms),
            tls_timeout: std::time::Duration::from_millis(s.tls_timeout_ms),
            redirect_limit: s.redirect_limit,
            follow_redirects: s.follow_redirects,
            prefer_ipv4: s.prefer_ipv4,
            prefer_ipv6: s.prefer_ipv6,
            enable_ipv4_diagnostics: s.enable_ipv4_diagnostics,
            enable_ipv6_diagnostics: s.enable_ipv6_diagnostics,
            verify_tls: s.verify_tls,
            proxy_mode: s.proxy_mode,
            proxy_url: s.proxy_url,
            user_agent: s.user_agent,
            retry_count: s.retry_count,
            retry_delay: std::time::Duration::from_millis(s.retry_delay_ms),
            concurrency_limit: s.concurrency_limit,
        }
    }
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<FrontendSettings, AppError> {
    let config = state.config.lock().unwrap().clone();
    Ok(FrontendSettings::from(config))
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: FrontendSettings,
) -> Result<(), AppError> {
    state.save_config(ProbeConfig::from(settings)).await?;
    Ok(())
}

#[tauri::command]
pub fn reset_application(app: tauri::AppHandle) {
    let data_dir = crate::config::get_app_data_dir();

    // Delete files in AppData directory
    let files_to_delete = vec![
        "settings.json",
        "targets.json",
        "history.db",
        "history.db-wal",
        "history.db-shm",
    ];

    for file in files_to_delete {
        let path = data_dir.join(file);
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }

    // Restart the application
    app.restart();
}
