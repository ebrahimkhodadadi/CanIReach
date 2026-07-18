use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInvestigation {
    pub schema_version: u32,
    pub id: String,
    pub target_id: String,
    pub status: String, // "draft" | "running" | "completed" | "failed"
    pub baseline_profile_id: String,
    pub comparison_profile_ids: Vec<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub overall_assessment: Option<String>, // Serialized JSON string of findings
}
