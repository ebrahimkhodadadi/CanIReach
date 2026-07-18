use std::time::Duration;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProbeConfig {
    pub timeout: Duration,
    pub connect_timeout: Duration,
    pub dns_timeout: Duration,
    pub tcp_timeout: Duration,
    pub tls_timeout: Duration,
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
    pub retry_delay: Duration,
    pub concurrency_limit: usize,
}

impl Default for ProbeConfig {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(10),
            connect_timeout: Duration::from_secs(5),
            dns_timeout: Duration::from_secs(3),
            tcp_timeout: Duration::from_secs(3),
            tls_timeout: Duration::from_secs(3),
            redirect_limit: 10,
            follow_redirects: true,
            prefer_ipv4: true,
            prefer_ipv6: false,
            enable_ipv4_diagnostics: true,
            enable_ipv6_diagnostics: true,
            verify_tls: true,
            proxy_mode: "system".to_string(),
            proxy_url: None,
            user_agent: "CanIReach Reachability Probe".to_string(),
            retry_count: 1,
            retry_delay: Duration::from_millis(500),
            concurrency_limit: 5,
        }
    }
}
