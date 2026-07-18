use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiagnosticOverrides {
    #[serde(default)]
    pub follow_redirects: Option<bool>,
    #[serde(default)]
    pub request_method: Option<String>,
    #[serde(default)]
    pub test_ipv4: Option<bool>,
    #[serde(default)]
    pub test_ipv6: Option<bool>,
    #[serde(default)]
    pub enable_http2: Option<bool>,
    #[serde(default)]
    pub enable_http3: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Target {
    pub id: String,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub group_ids: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub network_profile_id: Option<String>,
    #[serde(default)]
    pub diagnostic_overrides: Option<DiagnosticOverrides>,
    #[serde(default = "default_time")]
    pub created_at: String,
    #[serde(default = "default_time")]
    pub updated_at: String,
}

fn default_true() -> bool {
    true
}

fn default_time() -> String {
    chrono::Utc::now().to_rfc3339()
}
