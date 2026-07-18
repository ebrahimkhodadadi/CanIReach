use futures_util::StreamExt;
use reqwest::Client;
use std::time::{Duration, Instant};

pub struct ThroughputMeasurer;

impl ThroughputMeasurer {
    pub async fn run_download(
        client: &Client,
        url: &str,
        timeout: Duration,
        max_bytes: u64,
    ) -> Result<(f64, u64), String> {
        let response = client.get(url).send().await.map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            return Err(format!(
                "Download request failed with status: {}",
                response.status()
            ));
        }

        let mut stream = response.bytes_stream();
        let mut total_bytes = 0;

        let download_start = Instant::now();
        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(|e| e.to_string())?;
            total_bytes += chunk.len() as u64;

            if total_bytes >= max_bytes || download_start.elapsed() >= timeout {
                break;
            }
        }

        let elapsed = download_start.elapsed().as_secs_f64();
        let mbps = if elapsed > 0.0 {
            let bits = total_bytes * 8;
            (bits as f64 / 1_000_000.0) / elapsed
        } else {
            0.0
        };

        Ok((mbps, total_bytes))
    }

    pub async fn run_upload(
        client: &Client,
        url: &str,
        _timeout: Duration,
        max_bytes: u64,
    ) -> Result<(f64, u64), String> {
        // Generate static dummy payload to upload
        let dummy_chunk = vec![0u8; 16384]; // 16KB chunk
        let mut total_uploaded = 0;
        let mut stream_data = Vec::new();

        while total_uploaded < max_bytes {
            let to_add = std::cmp::min(dummy_chunk.len() as u64, max_bytes - total_uploaded);
            stream_data.extend_from_slice(&dummy_chunk[..to_add as usize]);
            total_uploaded += to_add;
        }

        let start = Instant::now();
        let response = client
            .post(url)
            .body(stream_data)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            return Err(format!(
                "Upload request failed with status: {}",
                response.status()
            ));
        }

        let elapsed = start.elapsed().as_secs_f64();
        let mbps = if elapsed > 0.0 {
            let bits = max_bytes * 8;
            (bits as f64 / 1_000_000.0) / elapsed
        } else {
            0.0
        };

        Ok((mbps, max_bytes))
    }
}
