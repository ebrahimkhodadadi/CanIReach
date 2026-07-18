use reqwest::Client;
use std::net::SocketAddr;
use std::time::{Duration, Instant};
use tokio::net::TcpStream;

#[derive(Debug, Clone)]
pub struct LatencyStats {
    pub min_ms: i64,
    pub max_ms: i64,
    pub mean_ms: i64,
    pub median_ms: i64,
    pub jitter_ms: i64,
    pub loss_percent: f64,
}

pub struct LatencyMeasurer;

impl LatencyMeasurer {
    pub async fn measure_tcp_latency(
        addr: SocketAddr,
        samples_count: usize,
        timeout: Duration,
    ) -> (Vec<i64>, f64) {
        let mut samples = Vec::new();
        let mut failed = 0;

        for _ in 0..samples_count {
            let start = Instant::now();
            match tokio::time::timeout(timeout, TcpStream::connect(addr)).await {
                Ok(Ok(_stream)) => {
                    samples.push(start.elapsed().as_millis() as i64);
                }
                _ => {
                    failed += 1;
                }
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        let loss_percent = if samples_count > 0 {
            (failed as f64 / samples_count as f64) * 100.0
        } else {
            0.0
        };

        (samples, loss_percent)
    }

    pub async fn measure_http_ttfb_with_client(
        client: &reqwest::Client,
        url: &str,
        samples_count: usize,
    ) -> (Vec<i64>, f64) {
        let mut samples = Vec::new();
        let mut failed = 0;

        for _ in 0..samples_count {
            let start = Instant::now();
            match client.head(url).send().await {
                Ok(_response) => {
                    samples.push(start.elapsed().as_millis() as i64);
                }
                _ => {
                    failed += 1;
                }
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        let loss_percent = if samples_count > 0 {
            (failed as f64 / samples_count as f64) * 100.0
        } else {
            0.0
        };

        (samples, loss_percent)
    }

    pub async fn measure_http_ttfb(
        url: &str,
        samples_count: usize,
        timeout: Duration,
    ) -> (Vec<i64>, f64) {
        let mut samples = Vec::new();
        let mut failed = 0;
        let client = Client::builder()
            .timeout(timeout)
            .build()
            .unwrap_or_default();

        for _ in 0..samples_count {
            let start = Instant::now();
            match client.head(url).send().await {
                Ok(_response) => {
                    samples.push(start.elapsed().as_millis() as i64);
                }
                _ => {
                    failed += 1;
                }
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        let loss_percent = if samples_count > 0 {
            (failed as f64 / samples_count as f64) * 100.0
        } else {
            0.0
        };

        (samples, loss_percent)
    }

    pub fn calculate_stats(mut samples: Vec<i64>, loss_percent: f64) -> Option<LatencyStats> {
        if samples.is_empty() {
            return None;
        }
        samples.sort_unstable();

        let min_ms = samples[0];
        let max_ms = samples[samples.len() - 1];
        let sum: i64 = samples.iter().sum();
        let mean_ms = sum / samples.len() as i64;
        let median_ms = samples[samples.len() / 2];

        // RFC Jitter: mean of absolute differences of consecutive samples
        let mut absolute_diffs = Vec::new();
        for i in 1..samples.len() {
            absolute_diffs.push((samples[i] - samples[i - 1]).abs());
        }
        let jitter_ms = if !absolute_diffs.is_empty() {
            let diff_sum: i64 = absolute_diffs.iter().sum();
            diff_sum / absolute_diffs.len() as i64
        } else {
            0
        };

        Some(LatencyStats {
            min_ms,
            max_ms,
            mean_ms,
            median_ms,
            jitter_ms,
            loss_percent,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_stats() {
        let samples = vec![100, 120, 110, 130, 140];
        let stats = LatencyMeasurer::calculate_stats(samples, 20.0).unwrap();
        assert_eq!(stats.min_ms, 100);
        assert_eq!(stats.max_ms, 140);
        assert_eq!(stats.mean_ms, 120);
        assert_eq!(stats.median_ms, 120);
        assert_eq!(stats.jitter_ms, 10);
        assert_eq!(stats.loss_percent, 20.0);
    }

    #[test]
    fn test_empty_samples() {
        let stats = LatencyMeasurer::calculate_stats(vec![], 0.0);
        assert!(stats.is_none());
    }
}
