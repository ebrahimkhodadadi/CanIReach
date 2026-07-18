use super::models::{TracerouteHop, TracerouteResult, TracerouteState};
use super::parser::parse_hop_line;
use chrono::Utc;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

pub fn validate_target(target: &str) -> Result<String, String> {
    let clean = target.trim();
    if clean.is_empty() {
        return Err("Target cannot be empty".to_string());
    }

    let host = if clean.starts_with("http://") || clean.starts_with("https://") {
        match reqwest::Url::parse(clean) {
            Ok(u) => u.host_str().ok_or("No host in URL")?.to_string(),
            Err(e) => return Err(format!("Invalid URL: {}", e)),
        }
    } else {
        clean.to_string()
    };

    for c in host.chars() {
        if !c.is_alphanumeric() && c != '.' && c != '-' && c != ':' {
            return Err("Invalid characters in target".to_string());
        }
    }

    Ok(host)
}

#[allow(clippy::too_many_arguments)]
pub async fn run_traceroute(
    app: Option<AppHandle>,
    target_id: String,
    target_name: String,
    destination: String,
    trace_id: String,
    max_hops: u32,
    resolve_hostnames: bool,
    cancel_flag: Arc<AtomicBool>,
) -> Result<TracerouteResult, String> {
    let host = match validate_target(&destination) {
        Ok(h) => h,
        Err(e) => {
            let res = TracerouteResult {
                trace_id: trace_id.clone(),
                target_id: target_id.clone(),
                target_name: target_name.clone(),
                destination: destination.clone(),
                destination_address: None,
                platform: if cfg!(target_os = "windows") {
                    "windows"
                } else {
                    "macos"
                }
                .to_string(),
                method: if cfg!(target_os = "windows") {
                    "system_tracert"
                } else {
                    "system_traceroute"
                }
                .to_string(),
                status: TracerouteState::Failed,
                started_at: Utc::now().to_rfc3339(),
                completed_at: Some(Utc::now().to_rfc3339()),
                duration_ms: Some(0),
                max_hops,
                probes_per_hop: 3,
                completed_hops: 0,
                hops: Vec::new(),
                raw_output: None,
                stderr_output: None,
                error_code: Some("invalid_destination".to_string()),
                error_message: Some(e.clone()),
            };
            if let Some(ref a) = app {
                let _ = a.emit(
                    "traceroute_failed",
                    serde_json::json!({
                        "traceId": trace_id,
                        "targetId": target_id,
                        "timestamp": Utc::now().to_rfc3339(),
                        "error": e
                    }),
                );
            }
            return Ok(res);
        }
    };

    let start_time = Instant::now();
    let started_at = Utc::now().to_rfc3339();

    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
    .to_string();

    let method = if cfg!(target_os = "windows") {
        "system_tracert"
    } else {
        "system_traceroute"
    }
    .to_string();

    // Prepare system utility parameters
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("tracert");
        if !resolve_hostnames {
            c.arg("-d");
        }
        c.args(["-h", &max_hops.to_string(), &host]);
        c
    } else {
        let mut c = Command::new("traceroute");
        if !resolve_hostnames {
            c.arg("-n");
        }
        c.args(["-I", "-m", &max_hops.to_string(), &host]);
        c
    };

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let err_msg = format!("Failed to spawn traceroute process: {}", e);
            let res = TracerouteResult {
                trace_id: trace_id.clone(),
                target_id: target_id.clone(),
                target_name: target_name.clone(),
                destination: destination.clone(),
                destination_address: None,
                platform,
                method,
                status: TracerouteState::Failed,
                started_at,
                completed_at: Some(Utc::now().to_rfc3339()),
                duration_ms: Some(0),
                max_hops,
                probes_per_hop: 3,
                completed_hops: 0,
                hops: Vec::new(),
                raw_output: None,
                stderr_output: Some(err_msg.clone()),
                error_code: Some("process_start_failed".to_string()),
                error_message: Some(err_msg.clone()),
            };
            if let Some(ref a) = app {
                let _ = a.emit(
                    "traceroute_failed",
                    serde_json::json!({
                        "traceId": trace_id,
                        "targetId": target_id,
                        "timestamp": Utc::now().to_rfc3339(),
                        "error": err_msg
                    }),
                );
            }
            return Ok(res);
        }
    };

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let mut reader = BufReader::new(stdout).lines();

    if let Some(ref a) = app {
        let _ = a.emit(
            "traceroute_started",
            serde_json::json!({
                "traceId": trace_id,
                "targetId": target_id,
                "timestamp": Utc::now().to_rfc3339()
            }),
        );
    }

    let mut hops: Vec<TracerouteHop> = Vec::new();
    let mut raw_output_buf = String::new();
    let mut destination_reached = false;
    let mut destination_address = None;

    loop {
        if cancel_flag.load(Ordering::Relaxed) {
            let _ = child.kill().await;
            let duration_ms = start_time.elapsed().as_millis() as u64;
            let result = TracerouteResult {
                trace_id: trace_id.clone(),
                target_id: target_id.clone(),
                target_name: target_name.clone(),
                destination: destination.clone(),
                destination_address,
                platform,
                method,
                status: TracerouteState::Cancelled,
                started_at,
                completed_at: Some(Utc::now().to_rfc3339()),
                duration_ms: Some(duration_ms),
                max_hops,
                probes_per_hop: 3,
                completed_hops: hops.len() as u32,
                hops: hops.clone(),
                raw_output: Some(raw_output_buf.clone()),
                stderr_output: None,
                error_code: Some("cancelled".to_string()),
                error_message: Some("User cancelled traceroute".to_string()),
            };
            if let Some(ref a) = app {
                let _ = a.emit(
                    "traceroute_cancelled",
                    serde_json::json!({
                        "traceId": trace_id,
                        "targetId": target_id,
                        "timestamp": Utc::now().to_rfc3339()
                    }),
                );
            }
            return Ok(result);
        }

        tokio::select! {
            line_res = reader.next_line() => {
                match line_res {
                    Ok(Some(line)) => {
                        raw_output_buf.push_str(&line);
                        raw_output_buf.push('\n');

                        if let Some(mut hop) = parse_hop_line(&line) {
                            let is_dest = hop.responses.iter().any(|resp| {
                                if let Some(ref addr) = resp.address {
                                    addr == &host || addr.contains(&host)
                                } else {
                                    false
                                }
                            });
                            if is_dest {
                                hop.is_destination = true;
                                destination_reached = true;
                                if let Some(ref addr) = hop.address {
                                    destination_address = Some(addr.clone());
                                }
                            }

                            hops.push(hop.clone());

                            if let Some(ref a) = app {
                                let _ = a.emit("traceroute_hop_updated", serde_json::json!({
                                    "traceId": trace_id,
                                    "targetId": target_id,
                                    "hop": hop,
                                    "timestamp": Utc::now().to_rfc3339()
                                }));
                            }

                            if is_dest {
                                let _ = child.kill().await;
                                break;
                            }
                        }
                    }
                    Ok(None) => break,
                    Err(e) => {
                        let duration_ms = start_time.elapsed().as_millis() as u64;
                        let err_msg = e.to_string();
                        let result = TracerouteResult {
                            trace_id: trace_id.clone(),
                            target_id: target_id.clone(),
                            target_name: target_name.clone(),
                            destination: destination.clone(),
                            destination_address,
                            platform,
                            method,
                            status: TracerouteState::Failed,
                            started_at,
                            completed_at: Some(Utc::now().to_rfc3339()),
                            duration_ms: Some(duration_ms),
                            max_hops,
                            probes_per_hop: 3,
                            completed_hops: hops.len() as u32,
                            hops: hops.clone(),
                            raw_output: Some(raw_output_buf.clone()),
                            stderr_output: Some(err_msg.clone()),
                            error_code: Some("malformed_output".to_string()),
                            error_message: Some(err_msg.clone()),
                        };
                        if let Some(ref a) = app {
                            let _ = a.emit("traceroute_failed", serde_json::json!({
                                "traceId": trace_id,
                                "targetId": target_id,
                                "timestamp": Utc::now().to_rfc3339(),
                                "error": err_msg
                            }));
                        }
                        return Ok(result);
                    }
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(50)) => {
            }
        }
    }

    let _status = child.wait().await;
    let duration_ms = start_time.elapsed().as_millis() as u64;

    let final_status = if destination_reached {
        TracerouteState::Completed
    } else {
        TracerouteState::Partial
    };

    let result = TracerouteResult {
        trace_id: trace_id.clone(),
        target_id: target_id.clone(),
        target_name: target_name.clone(),
        destination: destination.clone(),
        destination_address,
        platform,
        method,
        status: final_status,
        started_at,
        completed_at: Some(Utc::now().to_rfc3339()),
        duration_ms: Some(duration_ms),
        max_hops,
        probes_per_hop: 3,
        completed_hops: hops.len() as u32,
        hops,
        raw_output: Some(raw_output_buf),
        stderr_output: None,
        error_code: None,
        error_message: None,
    };

    if let Some(ref a) = app {
        let _ = a.emit(
            "traceroute_completed",
            serde_json::json!({
                "traceId": trace_id,
                "targetId": target_id,
                "result": result,
                "timestamp": Utc::now().to_rfc3339()
            }),
        );
    }

    Ok(result)
}
