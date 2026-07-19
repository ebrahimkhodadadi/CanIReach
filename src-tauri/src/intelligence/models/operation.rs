use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkOperationRecord {
    pub schema_version: u32,
    pub id: String,
    pub run_id: Option<String>,
    pub batch_id: Option<String>,
    pub target_id: Option<String>,
    pub profile_id: Option<String>,
    pub operation_type: String,
    pub status: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub duration_ms: Option<u64>,
    pub failure_code: Option<String>,
    pub summary: String,
    pub request_metadata: Option<String>,
    pub response_metadata: Option<String>,

    // Phase 1 enrichment fields
    #[serde(default = "default_source_type")]
    pub source_type: String,
    #[serde(default = "default_visibility")]
    pub visibility_level: String,
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub registrable_domain: Option<String>,
    #[serde(default)]
    pub destination_ip: Option<String>,
    #[serde(default)]
    pub destination_port: Option<u16>,
    #[serde(default)]
    pub protocol: Option<String>,
    #[serde(default)]
    pub http_status_code: Option<u16>,
    #[serde(default = "default_failure_category")]
    pub failure_category: String,
    #[serde(default)]
    pub failure_reason: Option<String>,
    #[serde(default = "default_severity")]
    pub severity: String,
    #[serde(default = "default_one")]
    pub occurrence_count: u32,
    #[serde(default)]
    pub first_seen_at: Option<String>,
    #[serde(default)]
    pub last_seen_at: Option<String>,
    #[serde(default)]
    pub related_target_id: Option<String>,
    #[serde(default)]
    pub metadata_json: Option<String>,
}

fn default_source_type() -> String { "canireach_probe".to_string() }
fn default_visibility() -> String { "application_instrumented".to_string() }
fn default_failure_category() -> String { "unknown".to_string() }
fn default_severity() -> String { "medium".to_string() }
fn default_one() -> u32 { 1 }

impl NetworkOperationRecord {
    pub fn dedup_key(&self) -> String {
        format!(
            "{}|{}|{}|{}|{}",
            self.source_type,
            self.host.as_deref().unwrap_or(""),
            self.destination_port.map(|p| p.to_string()).unwrap_or_default(),
            self.failure_category,
            self.operation_type,
        )
    }
}
