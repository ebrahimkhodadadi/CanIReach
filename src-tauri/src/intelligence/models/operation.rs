use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkOperationRecord {
    pub schema_version: u32,
    pub id: String,
    pub run_id: Option<String>,
    pub batch_id: Option<String>,
    pub target_id: Option<String>,
    pub profile_id: Option<String>,
    pub operation_type: String, // "dns" | "tcp" | "tls" | "http" | "proxy" | "traceroute" | "preflight"
    pub status: String,         // "succeeded" | "failed" | "cancelled" | "timed_out" | "suspicious"
    pub started_at: String,
    pub completed_at: Option<String>,
    pub duration_ms: Option<u64>,
    pub failure_code: Option<String>,
    pub summary: String,
    pub request_metadata: Option<String>, // Sanitized JSON String
    pub response_metadata: Option<String>, // Sanitized JSON String
}
