use crate::config::ProfilesLoader;
use crate::error::AppError;
use crate::monitoring::persistence::DbManager;
use crate::performance::budget::DataBudgetManager;
use crate::performance::latency::LatencyMeasurer;
use crate::performance::models::PerformanceRun;
use crate::performance::throughput::ThroughputMeasurer;
use crate::privacy_diagnostics::client::build_client_for_profile;
use chrono::Utc;
use rusqlite::params;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use uuid::Uuid;

#[tauri::command]
pub async fn start_performance_run(
    profile_id: String,
    latency_url: Option<String>,
    download_url: Option<String>,
    upload_url: Option<String>,
    test_types: Vec<String>,
) -> Result<PerformanceRun, AppError> {
    let started_at = Utc::now().to_rfc3339();
    let run_id = Uuid::new_v4().to_string();

    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    // Load matching network profile or default
    let profiles = ProfilesLoader::load()
        .map_err(|e| AppError::Generic(format!("Failed to load profiles: {}", e)))?;

    let profile = profiles
        .iter()
        .find(|p| p.id == profile_id)
        .cloned()
        .unwrap_or_else(|| canireach_core::NetworkProfile {
            id: "system-default".to_string(),
            name: "System Default".to_string(),
            description: None,
            is_default: true,
            interface: canireach_core::NetworkInterfaceSelection {
                mode: "system".to_string(),
                interface_id: None,
                source_ipv4: None,
                source_ipv6: None,
            },
            dns: canireach_core::DnsSelection {
                mode: "system".to_string(),
                servers: Vec::new(),
            },
            proxy: canireach_core::ProxySelection {
                mode: "system".to_string(),
                custom_type: None,
                custom_host: None,
                custom_port: None,
                auth_username: None,
                auth_credential_id: None,
                bypass: None,
            },
            ip_preference: "system".to_string(),
            preflight: None,
            created_at: "".to_string(),
            updated_at: "".to_string(),
        });

    // Build client for this profile
    let client =
        build_client_for_profile(&profile, Duration::from_secs(10)).map_err(AppError::Generic)?;

    // Quick sanity check on data budget (limit to 100MB per day for safety)
    let date_str = Utc::now().format("%Y-%m-%d").to_string();
    let budget_exceeded =
        DataBudgetManager::check_budget_exceeded(&conn, &date_str, 100_000_000).unwrap_or(false);

    if budget_exceeded {
        return Err(AppError::Generic(
            "Daily data limit of 100MB reached. Performance tests blocked.".to_string(),
        ));
    }

    let mut run = PerformanceRun {
        schema_version: 1,
        id: run_id.clone(),
        benchmark_id: None,
        profile_id: profile_id.clone(),
        status: "running".to_string(),
        started_at: started_at.clone(),
        completed_at: None,
        latency_ms: None,
        jitter_ms: None,
        loss_percent: None,
        download_mbps: None,
        upload_mbps: None,
        bytes_downloaded: 0,
        bytes_uploaded: 0,
        loaded_latency_ms: None,
        bufferbloat_ms: None,
    };

    // Insert initial running state
    conn.execute(
        "INSERT INTO performance_runs (
            id, benchmark_id, profile_id, status, started_at, completed_at,
            latency_ms, jitter_ms, loss_percent, download_mbps, upload_mbps,
            bytes_downloaded, bytes_uploaded, loaded_latency_ms, bufferbloat_ms
         ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, NULL)",
        params![
            run.id,
            run.benchmark_id,
            run.profile_id,
            run.status,
            run.started_at
        ],
    )
    .map_err(|e| AppError::Generic(format!("DB Insert error: {}", e)))?;

    // Perform latency test
    if test_types.contains(&"latency".to_string()) {
        if let Some(ref l_url) = latency_url {
            let (samples, loss) =
                LatencyMeasurer::measure_http_ttfb_with_client(&client, l_url, 5).await;
            if let Some(stats) = LatencyMeasurer::calculate_stats(samples, loss) {
                run.latency_ms = Some(stats.median_ms);
                run.jitter_ms = Some(stats.jitter_ms);
                run.loss_percent = Some(stats.loss_percent);
            }
        }
    }

    // Perform download throughput test (limit payload to 10MB) & measure Bufferbloat
    if test_types.contains(&"download".to_string()) {
        if let Some(ref dl_url) = download_url {
            // Spawn loaded latency task during download
            let bg_client = client.clone();
            let bg_url = latency_url
                .clone()
                .unwrap_or_else(|| "https://cloudflare.com".to_string());
            let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
            let bg_samples = Arc::new(Mutex::new(Vec::new()));
            let bg_samples_clone = bg_samples.clone();

            let bg_task = tokio::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_millis(300));
                loop {
                    tokio::select! {
                        _ = interval.tick() => {
                            let start = Instant::now();
                            if let Ok(resp) = bg_client.head(&bg_url).send().await {
                                if resp.status().is_success() {
                                    let duration = start.elapsed().as_millis() as i64;
                                    bg_samples_clone.lock().unwrap().push(duration);
                                }
                            }
                        }
                        _ = &mut stop_rx => {
                            break;
                        }
                    }
                }
            });

            match ThroughputMeasurer::run_download(
                &client,
                dl_url,
                Duration::from_secs(10),
                10_000_000,
            )
            .await
            {
                Ok((mbps, bytes)) => {
                    run.download_mbps = Some(mbps);
                    run.bytes_downloaded = bytes;
                    let _ = DataBudgetManager::record_usage(&conn, &date_str, bytes, 0);
                }
                Err(err) => {
                    println!("Download performance test failed: {}", err);
                }
            }

            // Stop loaded latency monitoring
            let _ = stop_tx.send(());
            let _ = bg_task.await;

            let mut samples = bg_samples.lock().unwrap().clone();
            if !samples.is_empty() {
                samples.sort_unstable();
                let median = samples[samples.len() / 2];
                run.loaded_latency_ms = Some(median);

                if let Some(idle) = run.latency_ms {
                    let diff = median - idle;
                    run.bufferbloat_ms = Some(if diff > 0 { diff } else { 0 });
                }
            }
        }
    }

    // Perform upload throughput test (limit payload to 5MB)
    if test_types.contains(&"upload".to_string()) {
        if let Some(ref ul_url) = upload_url {
            match ThroughputMeasurer::run_upload(
                &client,
                ul_url,
                Duration::from_secs(10),
                5_000_000,
            )
            .await
            {
                Ok((mbps, bytes)) => {
                    run.upload_mbps = Some(mbps);
                    run.bytes_uploaded = bytes;
                    let _ = DataBudgetManager::record_usage(&conn, &date_str, 0, bytes);
                }
                Err(err) => {
                    println!("Upload performance test failed: {}", err);
                }
            }
        }
    }

    run.status = "completed".to_string();
    run.completed_at = Some(Utc::now().to_rfc3339());

    // Update with final completed state
    conn.execute(
        "UPDATE performance_runs SET
            status = ?1,
            completed_at = ?2,
            latency_ms = ?3,
            jitter_ms = ?4,
            loss_percent = ?5,
            download_mbps = ?6,
            upload_mbps = ?7,
            bytes_downloaded = ?8,
            bytes_uploaded = ?9,
            loaded_latency_ms = ?10,
            bufferbloat_ms = ?11
         WHERE id = ?12",
        params![
            run.status,
            run.completed_at,
            run.latency_ms,
            run.jitter_ms,
            run.loss_percent,
            run.download_mbps,
            run.upload_mbps,
            run.bytes_downloaded as i64,
            run.bytes_uploaded as i64,
            run.loaded_latency_ms,
            run.bufferbloat_ms,
            run.id
        ],
    )
    .map_err(|e| AppError::Generic(format!("DB Update error: {}", e)))?;

    Ok(run)
}

#[tauri::command]
pub fn query_performance_history() -> Result<Vec<PerformanceRun>, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let mut stmt = conn.prepare(
        "SELECT id, benchmark_id, profile_id, status, started_at, completed_at,
                latency_ms, jitter_ms, loss_percent, download_mbps, upload_mbps,
                bytes_downloaded, bytes_uploaded, loaded_latency_ms, bufferbloat_ms
         FROM performance_runs
         ORDER BY started_at DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(PerformanceRun {
            schema_version: 1,
            id: row.get(0)?,
            benchmark_id: row.get(1)?,
            profile_id: row.get(2)?,
            status: row.get(3)?,
            started_at: row.get(4)?,
            completed_at: row.get(5)?,
            latency_ms: row.get(6)?,
            jitter_ms: row.get(7)?,
            loss_percent: row.get(8)?,
            download_mbps: row.get(9)?,
            upload_mbps: row.get(10)?,
            bytes_downloaded: row.get::<_, i64>(11)? as u64,
            bytes_uploaded: row.get::<_, i64>(12)? as u64,
            loaded_latency_ms: row.get(13)?,
            bufferbloat_ms: row.get(14)?,
        })
    })?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r?);
    }
    Ok(list)
}

#[tauri::command]
pub fn get_daily_data_budget(date_str: String) -> Result<(u64, u64), AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let usage = DataBudgetManager::get_daily_usage(&conn, &date_str)
        .map_err(|e| AppError::Generic(format!("DB Query error: {}", e)))?;

    Ok(usage)
}
