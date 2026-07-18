use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NetworkInterfaceSelection {
    pub mode: String,
    pub interface_id: Option<String>,
    pub source_ipv4: Option<String>,
    pub source_ipv6: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DnsServerConfig {
    pub id: String,
    pub name: Option<String>,
    pub protocol: String,
    pub address: String,
    pub port: Option<u16>,
    pub server_name: Option<String>,
    pub doh_url: Option<String>,
    pub bootstrap_addresses: Option<Vec<String>>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DnsSelection {
    pub mode: String,
    pub servers: Vec<DnsServerConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProxySelection {
    pub mode: String,
    pub custom_type: Option<String>,
    pub custom_host: Option<String>,
    pub custom_port: Option<u16>,
    pub auth_username: Option<String>,
    pub auth_credential_id: Option<String>,
    pub bypass: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PreflightProfileSettings {
    pub run_preflight: bool,
    pub timeout_ms: u32,
    pub endpoints: Vec<String>,
    pub min_success_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NetworkProfile {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_default: bool,
    pub interface: NetworkInterfaceSelection,
    pub dns: DnsSelection,
    pub proxy: ProxySelection,
    pub ip_preference: String,
    pub preflight: Option<PreflightProfileSettings>,
    pub created_at: String,
    pub updated_at: String,
}
