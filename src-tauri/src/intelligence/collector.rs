use crate::intelligence::models::NetworkOperationRecord;
use rusqlite::{params, Connection};
use uuid::Uuid;

pub struct FailedRequestRegistry;

impl FailedRequestRegistry {
    pub fn record_operation(
        conn: &Connection,
        record: NetworkOperationRecord,
    ) -> Result<(), rusqlite::Error> {
        // Redact metadata values for security
        let req_meta = record.request_metadata.map(|r| Self::sanitize_metadata(&r));
        let res_meta = record
            .response_metadata
            .map(|r| Self::sanitize_metadata(&r));

        conn.execute(
            "INSERT INTO network_operations (
                id, run_id, batch_id, target_id, profile_id, operation_type, status,
                started_at, completed_at, duration_ms, failure_code, summary,
                request_metadata, response_metadata,
                source_type, visibility_level, host, registrable_domain,
                destination_ip, destination_port, protocol, http_status_code,
                failure_category, failure_reason, severity, occurrence_count,
                first_seen_at, last_seen_at, related_target_id, metadata_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                       ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30)",
            params![
                record.id,
                record.run_id,
                record.batch_id,
                record.target_id,
                record.profile_id,
                record.operation_type,
                record.status,
                record.started_at,
                record.completed_at,
                record.duration_ms.map(|d| d as i64),
                record.failure_code,
                record.summary,
                req_meta,
                res_meta,
                record.source_type,
                record.visibility_level,
                record.host,
                record.registrable_domain,
                record.destination_ip,
                record.destination_port.map(|p| p as i64),
                record.protocol,
                record.http_status_code.map(|c| c as i64),
                record.failure_category,
                record.failure_reason,
                record.severity,
                record.occurrence_count as i32,
                record.first_seen_at,
                record.last_seen_at,
                record.related_target_id,
                record.metadata_json,
            ],
        )?;

        Ok(())
    }

    fn sanitize_metadata(meta_str: &str) -> String {
        // Parse JSON and remove sensitive headers/credentials
        if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(meta_str) {
            if let Some(headers) = json.get_mut("headers").and_then(|h| h.as_object_mut()) {
                headers.remove("authorization");
                headers.remove("cookie");
                headers.remove("set-cookie");
                headers.remove("proxy-authorization");
            }
            serde_json::to_string(&json).unwrap_or_else(|_| meta_str.to_string())
        } else {
            meta_str.to_string()
        }
    }

    pub fn record_from_probe_result(
        conn: &Connection,
        result: &canireach_core::ProbeResult,
        batch_id: Option<&str>,
        profile_id: &str,
    ) -> Result<(), rusqlite::Error> {
        let run_id = result.run_id.clone();
        let target_id = result.target_id.clone();
        let host = Some(extract_simple_domain(&result.target_url));
        let registrable_domain = host.clone();
        let now = chrono::Utc::now().to_rfc3339();

        // 1. Record DNS step if failed
        if let Some(ref dns) = result.dns {
            if dns.status == "failed" || dns.status == "timeout" {
                let id = Uuid::new_v4().to_string();
                let summary = format!(
                    "DNS resolution failed for target host: {}",
                    result.target_url
                );
                let failure_code = dns.error.as_ref().map(|e| format!("{:?}", e.kind));
                let failure_category = classify_failure_from_stage("dns", &dns.status);
                let severity = classify_severity_from_failure(&failure_category);

                let op = NetworkOperationRecord {
                    schema_version: 1,
                    id,
                    run_id: Some(run_id.clone()),
                    batch_id: batch_id.map(|s| s.to_string()),
                    target_id: Some(target_id.clone()),
                    profile_id: Some(profile_id.to_string()),
                    operation_type: "dns".to_string(),
                    status: if dns.status == "timeout" {
                        "timed_out".to_string()
                    } else {
                        "failed".to_string()
                    },
                    started_at: dns.started_at.to_rfc3339(),
                    completed_at: dns.completed_at.map(|t| t.to_rfc3339()),
                    duration_ms: dns.duration_ms,
                    failure_code,
                    summary,
                    request_metadata: None,
                    response_metadata: None,
                    source_type: "canireach_probe".to_string(),
                    visibility_level: "application_instrumented".to_string(),
                    host: host.clone(),
                    registrable_domain: registrable_domain.clone(),
                    destination_ip: None,
                    destination_port: None,
                    protocol: None,
                    http_status_code: None,
                    failure_category,
                    failure_reason: None,
                    severity,
                    occurrence_count: 1,
                    first_seen_at: Some(dns.started_at.to_rfc3339()),
                    last_seen_at: Some(dns.completed_at.map(|t| t.to_rfc3339()).unwrap_or_else(|| now.clone())),
                    related_target_id: Some(target_id.clone()),
                    metadata_json: None,
                };
                Self::record_operation(conn, op)?;
            }
        }

        // 2. Record TCP step if failed
        if let Some(ref tcp) = result.tcp {
            if tcp.status == "failed" || tcp.status == "timeout" {
                let id = Uuid::new_v4().to_string();
                let summary = format!(
                    "TCP connection establishment failed for: {}",
                    result.target_url
                );
                let failure_code = tcp.error.as_ref().map(|e| format!("{:?}", e.kind));
                let failure_category = classify_failure_from_stage("tcp", &tcp.status);
                let severity = classify_severity_from_failure(&failure_category);

                let op = NetworkOperationRecord {
                    schema_version: 1,
                    id,
                    run_id: Some(run_id.clone()),
                    batch_id: batch_id.map(|s| s.to_string()),
                    target_id: Some(target_id.clone()),
                    profile_id: Some(profile_id.to_string()),
                    operation_type: "tcp".to_string(),
                    status: if tcp.status == "timeout" {
                        "timed_out".to_string()
                    } else {
                        "failed".to_string()
                    },
                    started_at: tcp.started_at.to_rfc3339(),
                    completed_at: tcp.completed_at.map(|t| t.to_rfc3339()),
                    duration_ms: tcp.duration_ms,
                    failure_code,
                    summary,
                    request_metadata: None,
                    response_metadata: None,
                    source_type: "canireach_probe".to_string(),
                    visibility_level: "application_instrumented".to_string(),
                    host: host.clone(),
                    registrable_domain: registrable_domain.clone(),
                    destination_ip: None,
                    destination_port: None,
                    protocol: None,
                    http_status_code: None,
                    failure_category,
                    failure_reason: None,
                    severity,
                    occurrence_count: 1,
                    first_seen_at: Some(tcp.started_at.to_rfc3339()),
                    last_seen_at: Some(tcp.completed_at.map(|t| t.to_rfc3339()).unwrap_or_else(|| now.clone())),
                    related_target_id: Some(target_id.clone()),
                    metadata_json: None,
                };
                Self::record_operation(conn, op)?;
            }
        }

        // 3. Record TLS step if failed
        if let Some(ref tls) = result.tls {
            if tls.status == "failed" || tls.status == "timeout" {
                let id = Uuid::new_v4().to_string();
                let summary = format!("TLS handshake failed for: {}", result.target_url);
                let failure_code = tls.error.as_ref().map(|e| format!("{:?}", e.kind));
                let failure_category = classify_failure_from_stage("tls", &tls.status);
                let severity = classify_severity_from_failure(&failure_category);

                let op = NetworkOperationRecord {
                    schema_version: 1,
                    id,
                    run_id: Some(run_id.clone()),
                    batch_id: batch_id.map(|s| s.to_string()),
                    target_id: Some(target_id.clone()),
                    profile_id: Some(profile_id.to_string()),
                    operation_type: "tls".to_string(),
                    status: if tls.status == "timeout" {
                        "timed_out".to_string()
                    } else {
                        "failed".to_string()
                    },
                    started_at: tls.started_at.to_rfc3339(),
                    completed_at: tls.completed_at.map(|t| t.to_rfc3339()),
                    duration_ms: tls.duration_ms,
                    failure_code,
                    summary,
                    request_metadata: None,
                    response_metadata: None,
                    source_type: "canireach_probe".to_string(),
                    visibility_level: "application_instrumented".to_string(),
                    host: host.clone(),
                    registrable_domain: registrable_domain.clone(),
                    destination_ip: None,
                    destination_port: None,
                    protocol: None,
                    http_status_code: None,
                    failure_category,
                    failure_reason: None,
                    severity,
                    occurrence_count: 1,
                    first_seen_at: Some(tls.started_at.to_rfc3339()),
                    last_seen_at: Some(tls.completed_at.map(|t| t.to_rfc3339()).unwrap_or_else(|| now.clone())),
                    related_target_id: Some(target_id.clone()),
                    metadata_json: None,
                };
                Self::record_operation(conn, op)?;
            }
        }

        // 4. Record HTTP step if failed
        if let Some(ref http) = result.http {
            if http.status == "failed" || http.status == "timeout" {
                let id = Uuid::new_v4().to_string();
                let summary = format!("HTTP request execution failed: {}", result.target_url);
                let failure_code = http.error.as_ref().map(|e| format!("{:?}", e.kind));
                let failure_category = classify_failure_from_stage("http", &http.status);
                let severity = classify_severity_from_failure(&failure_category);

                let op = NetworkOperationRecord {
                    schema_version: 1,
                    id,
                    run_id: Some(run_id.clone()),
                    batch_id: batch_id.map(|s| s.to_string()),
                    target_id: Some(target_id.clone()),
                    profile_id: Some(profile_id.to_string()),
                    operation_type: "http".to_string(),
                    status: if http.status == "timeout" {
                        "timed_out".to_string()
                    } else {
                        "failed".to_string()
                    },
                    started_at: http.started_at.to_rfc3339(),
                    completed_at: http.completed_at.map(|t| t.to_rfc3339()),
                    duration_ms: http.duration_ms,
                    failure_code,
                    summary,
                    request_metadata: None,
                    response_metadata: None,
                    source_type: "canireach_probe".to_string(),
                    visibility_level: "application_instrumented".to_string(),
                    host: host.clone(),
                    registrable_domain: registrable_domain.clone(),
                    destination_ip: None,
                    destination_port: None,
                    protocol: None,
                    http_status_code: None,
                    failure_category,
                    failure_reason: None,
                    severity,
                    occurrence_count: 1,
                    first_seen_at: Some(http.started_at.to_rfc3339()),
                    last_seen_at: Some(http.completed_at.map(|t| t.to_rfc3339()).unwrap_or_else(|| now.clone())),
                    related_target_id: Some(target_id.clone()),
                    metadata_json: None,
                };
                Self::record_operation(conn, op)?;
            }
        }

        Ok(())
    }
}

fn extract_simple_domain(url: &str) -> String {
    let stripped = url.trim_start_matches("http://").trim_start_matches("https://");
    stripped.split('/').next().unwrap_or(stripped)
        .split(':').next().unwrap_or(stripped)
        .to_string()
}

fn classify_failure_from_stage(stage: &str, status: &str) -> String {
    match stage {
        "dns" => if status == "timeout" { "dns_timeout" } else { "dns_failure" },
        "tcp" => if status == "timeout" { "connection_timeout" } else { "connection_refused" },
        "tls" => "tls_handshake",
        "http" => if status == "timeout" { "connection_timeout" } else { "http_error" },
        _ => "unknown",
    }.to_string()
}

fn classify_severity_from_failure(category: &str) -> String {
    match category {
        "dns_failure" | "dns_timeout" => "high",
        "connection_refused" | "connection_timeout" => "high",
        "tls_handshake" => "critical",
        "http_error" => "medium",
        _ => "medium",
    }.to_string()
}
