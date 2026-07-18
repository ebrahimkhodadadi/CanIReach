use super::probe_log::ProbeLog;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProbeStatus {
    Success,
    Failed,
    Timeout,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FailureStage {
    None,
    Validation,
    Dns,
    Tcp,
    Tls,
    Proxy,
    Http,
    Redirect,
    Timeout,
    Ipv4,
    Ipv6,
    Runtime,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FailureKind {
    InvalidUrl,
    InvalidHostname,
    DnsNotFound,
    DnsTimeout,
    DnsServerFailure,
    TcpRefused,
    TcpTimeout,
    NetworkUnreachable,
    TlsCertificate,
    TlsHandshake,
    ProxyUnavailable,
    ProxyAuthentication,
    HttpStatus,
    HttpRequest,
    RedirectLimit,
    ConnectionTimeout,
    Ipv4Failed,
    Ipv6Failed,
    PermissionDenied,
    RuntimeError,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    Direct,
    Inferred,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailureEvidence {
    pub stage: FailureStage,
    pub kind: FailureKind,
    pub user_message: String,
    pub technical_message: Option<String>,
    pub error_chain: Option<Vec<String>>,
    pub errno: Option<String>,
    pub http_status: Option<u16>,
    pub address: Option<String>,
    pub protocol: Option<String>, // "ipv4" | "ipv6" | "unknown"
    pub retryable: bool,
    pub observed_at: DateTime<Utc>,
    pub confidence: Confidence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProbeStageResult {
    pub stage: FailureStage,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub duration_ms: Option<u64>,
    pub status: String, // "passed" | "failed" | "skipped" | "timeout"
    pub error: Option<FailureEvidence>,
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProbeResult {
    pub target_id: String,
    pub target_url: String,
    pub run_id: String,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub overall_status: String, // "up" | "degraded" | "down" | "unknown"
    pub dns: Option<ProbeStageResult>,
    pub tcp: Option<ProbeStageResult>,
    pub tls: Option<ProbeStageResult>,
    pub http: Option<ProbeStageResult>,
    pub ipv4: Option<ProbeStageResult>,
    pub ipv6: Option<ProbeStageResult>,
    pub redirect: Option<ProbeStageResult>,
    pub failure: Option<FailureEvidence>,
    pub timings: Timings,
    pub status: ProbeStatus,         // Backwards compatibility
    pub failure_stage: FailureStage, // Backwards compatibility
    pub http_status: Option<u16>,    // Backwards compatibility
    pub latency_ms: u64,             // Backwards compatibility
    pub error: Option<String>,       // Backwards compatibility
    pub error_code: Option<String>,  // Backwards compatibility
    pub timestamp: DateTime<Utc>,    // Backwards compatibility
    pub log: ProbeLog,               // Backwards compatibility
    pub final_url: Option<String>,   // Backwards compatibility
    pub redirect_count: Option<u32>, // Backwards compatibility
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Timings {
    pub dns_ms: Option<u64>,
    pub tcp_ms: Option<u64>,
    pub tls_ms: Option<u64>,
    pub request_ms: Option<u64>,
    pub total_ms: Option<u64>,
}
