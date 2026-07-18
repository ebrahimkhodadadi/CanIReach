use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacyExpectationPolicy {
    pub schema_version: u32,
    pub id: String,
    pub profile_id: String,
    pub expected_routing: String, // "system_behavior" | "direct_only" | "proxy_preferred" | "proxy_required"
    pub dns_expectation: String, // "system_allowed" | "custom_resolver_required" | "proxy_remote_resolution_required" | "no_external_dns_expectation"
    pub ipv6_policy: String,     // "allowed" | "required" | "forbidden" | "must_use_proxy"
    pub webrtc_expectation: String, // "not_evaluated" | "host_candidates_allowed" | "public_candidates_forbidden"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacyAssessment {
    pub schema_version: u32,
    pub id: String,
    pub profile_id: String,
    pub status: String, // "queued" | "running" | "completed" | "failed"
    pub started_at: String,
    pub completed_at: Option<String>,
    pub overall_verdict: Option<String>,
    pub findings_json: Option<String>, // JSON string of specific policy violations/matches
}
