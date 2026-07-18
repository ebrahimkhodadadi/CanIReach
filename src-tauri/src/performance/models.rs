use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceBenchmark {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub network_profile_id: Option<String>,
    pub test_latency: bool,
    pub test_packet_loss: bool,
    pub test_download: bool,
    pub test_upload: bool,
    pub max_download_bytes: u64,
    pub max_upload_bytes: u64,
    pub timeout_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceRun {
    pub schema_version: u32,
    pub id: String,
    pub benchmark_id: Option<String>,
    pub profile_id: String,
    pub status: String, // "queued" | "running" | "completed" | "failed" | "cancelled"
    pub started_at: String,
    pub completed_at: Option<String>,
    pub latency_ms: Option<i64>,
    pub jitter_ms: Option<i64>,
    pub loss_percent: Option<f64>,
    pub download_mbps: Option<f64>,
    pub upload_mbps: Option<f64>,
    pub bytes_downloaded: u64,
    pub bytes_uploaded: u64,
    pub loaded_latency_ms: Option<i64>,
    pub bufferbloat_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceEndpoint {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub latency_url: String,
    pub download_url: String,
    pub upload_url: String,
}
