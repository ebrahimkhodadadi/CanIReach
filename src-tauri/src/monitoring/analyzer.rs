use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::time::sleep;

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzerSnapshot {
    pub status: String,
    pub current_latency: f32,
    pub current_jitter: f32,
    pub current_dns_latency: f32,
    pub current_loss: f32,
    pub stability_score: f32,
    pub active_interface: String,
    pub ip4_available: bool,
    pub ip6_available: bool,
}

pub struct AnalyzerService {
    active: Arc<AtomicBool>,
}

impl Default for AnalyzerService {
    fn default() -> Self {
        Self::new()
    }
}

impl AnalyzerService {
    pub fn new() -> Self {
        Self {
            active: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self, app: AppHandle, state: Arc<Mutex<AnalyzerSnapshot>>) {
        if self.active.swap(true, Ordering::SeqCst) {
            return;
        }

        let active = self.active.clone();
        tauri::async_runtime::spawn(async move {
            println!("INFO: Live Network Stability Analyzer loop started.");
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(3))
                .build()
                .unwrap_or_default();

            let mut latency_history = Vec::new();

            while active.load(Ordering::SeqCst) {
                let start_time = Instant::now();

                let dns_start = Instant::now();
                let dns_success = tokio::net::lookup_host("google.com:80").await.is_ok();
                let dns_latency = if dns_success {
                    dns_start.elapsed().as_millis() as f32
                } else {
                    1000.0
                };

                let conn_start = Instant::now();
                let conn_res = client.get("https://1.1.1.1").send().await;
                let conn_latency = if conn_res.is_ok() {
                    conn_start.elapsed().as_millis() as f32
                } else {
                    1000.0
                };

                let current_latency = if conn_latency < 1000.0 {
                    conn_latency
                } else {
                    dns_latency
                };

                if current_latency < 1000.0 {
                    latency_history.push(current_latency);
                    if latency_history.len() > 10 {
                        latency_history.remove(0);
                    }
                }

                let avg_latency: f32 = if !latency_history.is_empty() {
                    latency_history.iter().sum::<f32>() / latency_history.len() as f32
                } else {
                    0.0
                };
                let jitter = if latency_history.len() > 1 {
                    let variance = latency_history
                        .iter()
                        .map(|l| (l - avg_latency).powi(2))
                        .sum::<f32>()
                        / latency_history.len() as f32;
                    variance.sqrt()
                } else {
                    0.0
                };

                let current_loss = if current_latency >= 1000.0 {
                    100.0
                } else {
                    0.0
                };
                let availability = if current_latency < 1000.0 { 100.0 } else { 0.0 };

                let availability_sub = availability * 0.4;
                let latency_sub = ((300.0 - current_latency.min(300.0)) / 300.0 * 100.0) * 0.3;
                let dns_sub = if dns_success { 20.0 } else { 0.0 };
                let jitter_sub = ((50.0 - jitter.min(50.0)) / 50.0 * 100.0) * 0.1;
                let stability_score =
                    (availability_sub + latency_sub + dns_sub + jitter_sub).clamp(0.0, 100.0);

                let snapshot = AnalyzerSnapshot {
                    status: "running".to_string(),
                    current_latency,
                    current_jitter: jitter,
                    current_dns_latency: dns_latency,
                    current_loss,
                    stability_score,
                    active_interface: "Ethernet/Wi-Fi".to_string(),
                    ip4_available: true,
                    ip6_available: false,
                };

                *state.lock().unwrap() = snapshot.clone();

                if let Ok(conn) = crate::monitoring::persistence::DbManager::get_connection() {
                    let _ = conn.execute(
                        "INSERT INTO analyzer_samples (id, created_at, latency_ms, jitter_ms, dns_latency_ms, packet_loss, availability, ipv4_available, ipv6_available, stability_score)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                        [
                            uuid::Uuid::new_v4().to_string(),
                            chrono::Utc::now().to_rfc3339(),
                            current_latency.to_string(),
                            jitter.to_string(),
                            dns_latency.to_string(),
                            current_loss.to_string(),
                            availability.to_string(),
                            "1".to_string(),
                            "0".to_string(),
                            stability_score.to_string(),
                        ]
                    );
                }

                let _ = app.emit("analyzer-snapshot-changed", snapshot);

                let elapsed = start_time.elapsed();
                if elapsed < Duration::from_secs(5) {
                    sleep(Duration::from_secs(5) - elapsed).await;
                }
            }
            println!("INFO: Live Network Stability Analyzer loop stopped.");
        });
    }

    pub fn stop(&self) {
        self.active.store(false, Ordering::SeqCst);
    }
}
