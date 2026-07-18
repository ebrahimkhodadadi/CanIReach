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
                request_metadata, response_metadata
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
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
                record.duration_ms,
                record.failure_code,
                record.summary,
                req_meta,
                res_meta
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

        // 1. Record DNS step if failed
        if let Some(ref dns) = result.dns {
            if dns.status == "failed" || dns.status == "timeout" {
                let id = Uuid::new_v4().to_string();
                let summary = format!(
                    "DNS resolution failed for target host: {}",
                    result.target_url
                );
                let failure_code = dns.error.as_ref().map(|e| format!("{:?}", e.kind));

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
                };
                Self::record_operation(conn, op)?;
            }
        }

        Ok(())
    }
}
