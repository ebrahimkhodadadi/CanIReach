use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TracerouteState {
    Queued,
    Running,
    Completed,
    Partial,
    Failed,
    Timeout,
    Cancelled,
    Unavailable,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum HopStatus {
    Responded,
    Timeout,
    Unreachable,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HopResponse {
    pub address: Option<String>,
    pub hostname: Option<String>,
    pub rtt_ms: Option<f64>,
    pub responded: bool,
    pub timed_out: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TracerouteHop {
    pub hop_number: u32,
    pub address: Option<String>,
    pub hostname: Option<String>,
    pub status: HopStatus,
    pub rtt_ms: Option<f64>,
    pub rtt_values_ms: Option<Vec<f64>>,
    pub packet_loss_percent: Option<f64>,
    pub timeout_count: Option<u32>,
    pub raw_line: Option<String>,
    pub error_message: Option<String>,
    pub responses: Vec<HopResponse>,
    pub is_destination: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TracerouteResult {
    pub trace_id: String,
    pub target_id: String,
    pub target_name: String,
    pub destination: String,
    pub destination_address: Option<String>,
    pub platform: String,
    pub method: String,
    pub status: TracerouteState,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub duration_ms: Option<u64>,
    pub max_hops: u32,
    pub probes_per_hop: u32,
    pub completed_hops: u32,
    pub hops: Vec<TracerouteHop>,
    pub raw_output: Option<String>,
    pub stderr_output: Option<String>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}
