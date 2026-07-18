use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringBatch {
    pub schema_version: u32,
    pub id: String,
    pub schedule_id: Option<String>,
    pub status: String, // "queued" | "running" | "completed" | "failed" | "cancelled" | "skipped"
    pub target_count: u32,
    pub completed_count: u32,
    pub passed_count: u32,
    pub failed_count: u32,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalTargetRun {
    pub id: String,
    pub batch_id: String,
    pub target_id: String,
    pub status: String, // "healthy" | "degraded" | "unreachable" | "unknown"
    pub latency_ms: Option<u64>,
    pub http_status: Option<u32>,
    pub profile_id: String,
    pub primary_failure_code: Option<String>,
    pub technical_evidence: Option<String>, // Serialized JSON
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringIncident {
    pub id: String,
    pub target_id: String,
    pub profile_id: String,
    pub status: String, // "open" | "resolved"
    pub started_at: String,
    pub resolved_at: Option<String>,
    pub acknowledged_at: Option<String>,
    pub consecutive_failures: u32,
    pub last_observed_at: String,
    pub title: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertDelivery {
    pub id: String,
    pub incident_id: String,
    pub rule_id: String,
    pub event_type: String,
    pub status: String,
    pub created_at: String,
}
