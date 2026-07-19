use crate::error::AppError;
use crate::intelligence::models::NetworkOperationRecord;
use crate::monitoring::persistence::DbManager;
use rusqlite::params;

#[tauri::command]
pub fn query_network_operations(
    limit: Option<u32>,
    offset: Option<u32>,
    operation_type: Option<String>,
    status: Option<String>,
) -> Result<Vec<NetworkOperationRecord>, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let limit_val = limit.unwrap_or(50);
    let offset_val = offset.unwrap_or(0);

    let mut query = "SELECT id, run_id, batch_id, target_id, profile_id, operation_type, status,
                            started_at, completed_at, duration_ms, failure_code, summary,
                            request_metadata, response_metadata,
                            source_type, visibility_level, host, registrable_domain,
                            destination_ip, destination_port, protocol, http_status_code,
                            failure_category, failure_reason, severity, occurrence_count,
                            first_seen_at, last_seen_at, related_target_id, metadata_json
                     FROM network_operations
                     WHERE 1=1"
        .to_string();

    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();
    let mut param_idx = 1;

    if let Some(ref op_type) = operation_type {
        query.push_str(&format!(" AND operation_type = ?{}", param_idx));
        params_vec.push(rusqlite::types::Value::Text(op_type.clone()));
        param_idx += 1;
    }

    if let Some(ref st) = status {
        query.push_str(&format!(" AND status = ?{}", param_idx));
        params_vec.push(rusqlite::types::Value::Text(st.clone()));
        param_idx += 1;
    }

    query.push_str(&format!(
        " ORDER BY started_at DESC LIMIT ?{} OFFSET ?{}",
        param_idx,
        param_idx + 1
    ));
    params_vec.push(rusqlite::types::Value::Integer(limit_val as i64));
    params_vec.push(rusqlite::types::Value::Integer(offset_val as i64));

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| AppError::Generic(e.to_string()))?;

    // Bind parameters
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|v| v as &dyn rusqlite::ToSql)
        .collect();

    let rows = stmt
        .query_map(&*params_refs, |row| {
            Ok(NetworkOperationRecord {
                schema_version: 1,
                id: row.get(0)?,
                run_id: row.get(1)?,
                batch_id: row.get(2)?,
                target_id: row.get(3)?,
                profile_id: row.get(4)?,
                operation_type: row.get(5)?,
                status: row.get(6)?,
                started_at: row.get(7)?,
                completed_at: row.get(8)?,
                duration_ms: row.get::<_, Option<i64>>(9)?.map(|d| d as u64),
                failure_code: row.get(10)?,
                summary: row.get(11)?,
                request_metadata: row.get(12)?,
                response_metadata: row.get(13)?,
                source_type: row.get::<_, Option<String>>(14)?.unwrap_or_else(|| "canireach_probe".to_string()),
                visibility_level: row.get::<_, Option<String>>(15)?.unwrap_or_else(|| "application_instrumented".to_string()),
                host: row.get(16)?,
                registrable_domain: row.get(17)?,
                destination_ip: row.get(18)?,
                destination_port: row.get::<_, Option<i64>>(19)?.map(|p| p as u16),
                protocol: row.get(20)?,
                http_status_code: row.get::<_, Option<i64>>(21)?.map(|c| c as u16),
                failure_category: row.get::<_, Option<String>>(22)?.unwrap_or_else(|| "unknown".to_string()),
                failure_reason: row.get(23)?,
                severity: row.get::<_, Option<String>>(24)?.unwrap_or_else(|| "medium".to_string()),
                occurrence_count: row.get::<_, Option<i32>>(25)?.unwrap_or(1) as u32,
                first_seen_at: row.get(26)?,
                last_seen_at: row.get(27)?,
                related_target_id: row.get(28)?,
                metadata_json: row.get(29)?,
            })
        })
        .map_err(|e| AppError::Generic(e.to_string()))?;

    let mut results = Vec::new();
    for r in rows {
        results.push(r.map_err(|e| AppError::Generic(e.to_string()))?);
    }
    Ok(results)
}

#[tauri::command]
pub fn get_network_operation(id: String) -> Result<NetworkOperationRecord, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    conn.query_row(
        "SELECT id, run_id, batch_id, target_id, profile_id, operation_type, status,
                started_at, completed_at, duration_ms, failure_code, summary,
                request_metadata, response_metadata,
                source_type, visibility_level, host, registrable_domain,
                destination_ip, destination_port, protocol, http_status_code,
                failure_category, failure_reason, severity, occurrence_count,
                first_seen_at, last_seen_at, related_target_id, metadata_json
         FROM network_operations
         WHERE id = ?1",
        params![id],
        |row| {
            Ok(NetworkOperationRecord {
                schema_version: 1,
                id: row.get(0)?,
                run_id: row.get(1)?,
                batch_id: row.get(2)?,
                target_id: row.get(3)?,
                profile_id: row.get(4)?,
                operation_type: row.get(5)?,
                status: row.get(6)?,
                started_at: row.get(7)?,
                completed_at: row.get(8)?,
                duration_ms: row.get::<_, Option<i64>>(9)?.map(|d| d as u64),
                failure_code: row.get(10)?,
                summary: row.get(11)?,
                request_metadata: row.get(12)?,
                response_metadata: row.get(13)?,
                source_type: row.get::<_, Option<String>>(14)?.unwrap_or_else(|| "canireach_probe".to_string()),
                visibility_level: row.get::<_, Option<String>>(15)?.unwrap_or_else(|| "application_instrumented".to_string()),
                host: row.get(16)?,
                registrable_domain: row.get(17)?,
                destination_ip: row.get(18)?,
                destination_port: row.get::<_, Option<i64>>(19)?.map(|p| p as u16),
                protocol: row.get(20)?,
                http_status_code: row.get::<_, Option<i64>>(21)?.map(|c| c as u16),
                failure_category: row.get::<_, Option<String>>(22)?.unwrap_or_else(|| "unknown".to_string()),
                failure_reason: row.get(23)?,
                severity: row.get::<_, Option<String>>(24)?.unwrap_or_else(|| "medium".to_string()),
                occurrence_count: row.get::<_, Option<i32>>(25)?.unwrap_or(1) as u32,
                first_seen_at: row.get(26)?,
                last_seen_at: row.get(27)?,
                related_target_id: row.get(28)?,
                metadata_json: row.get(29)?,
            })
        },
    )
    .map_err(|e| AppError::Generic(e.to_string()))
}

#[tauri::command]
pub fn query_failed_requests(
    limit: Option<u32>,
    offset: Option<u32>,
    source_type: Option<String>,
    host: Option<String>,
    failure_category: Option<String>,
    severity: Option<String>,
) -> Result<Vec<NetworkOperationRecord>, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let limit_val = limit.unwrap_or(50);
    let offset_val = offset.unwrap_or(0);

    let mut query = "SELECT id, run_id, batch_id, target_id, profile_id, operation_type, status,
                            started_at, completed_at, duration_ms, failure_code, summary,
                            request_metadata, response_metadata,
                            source_type, visibility_level, host, registrable_domain,
                            destination_ip, destination_port, protocol, http_status_code,
                            failure_category, failure_reason, severity, occurrence_count,
                            first_seen_at, last_seen_at, related_target_id, metadata_json
                     FROM network_operations
                     WHERE status != 'succeeded'"
        .to_string();

    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();
    let mut param_idx = 1;

    if let Some(ref st) = source_type {
        query.push_str(&format!(" AND source_type = ?{}", param_idx));
        params_vec.push(rusqlite::types::Value::Text(st.clone()));
        param_idx += 1;
    }
    if let Some(ref h) = host {
        query.push_str(&format!(
            " AND (host LIKE ?{} OR registrable_domain LIKE ?{})",
            param_idx, param_idx
        ));
        let pattern = format!("%{}%", h);
        params_vec.push(rusqlite::types::Value::Text(pattern.clone()));
        params_vec.push(rusqlite::types::Value::Text(pattern));
        param_idx += 2;
    }
    if let Some(ref fc) = failure_category {
        query.push_str(&format!(" AND failure_category = ?{}", param_idx));
        params_vec.push(rusqlite::types::Value::Text(fc.clone()));
        param_idx += 1;
    }
    if let Some(ref sv) = severity {
        query.push_str(&format!(" AND severity = ?{}", param_idx));
        params_vec.push(rusqlite::types::Value::Text(sv.clone()));
        param_idx += 1;
    }

    query.push_str(&format!(
        " ORDER BY started_at DESC LIMIT ?{} OFFSET ?{}",
        param_idx,
        param_idx + 1
    ));
    params_vec.push(rusqlite::types::Value::Integer(limit_val as i64));
    params_vec.push(rusqlite::types::Value::Integer(offset_val as i64));

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| AppError::Generic(e.to_string()))?;

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|v| v as &dyn rusqlite::ToSql)
        .collect();

    let rows = stmt
        .query_map(&*params_refs, |row| {
            Ok(NetworkOperationRecord {
                schema_version: 1,
                id: row.get(0)?,
                run_id: row.get(1)?,
                batch_id: row.get(2)?,
                target_id: row.get(3)?,
                profile_id: row.get(4)?,
                operation_type: row.get(5)?,
                status: row.get(6)?,
                started_at: row.get(7)?,
                completed_at: row.get(8)?,
                duration_ms: row.get::<_, Option<i64>>(9)?.map(|d| d as u64),
                failure_code: row.get(10)?,
                summary: row.get(11)?,
                request_metadata: row.get(12)?,
                response_metadata: row.get(13)?,
                source_type: row.get::<_, Option<String>>(14)?
                    .unwrap_or_else(|| "canireach_probe".to_string()),
                visibility_level: row.get::<_, Option<String>>(15)?
                    .unwrap_or_else(|| "application_instrumented".to_string()),
                host: row.get(16)?,
                registrable_domain: row.get(17)?,
                destination_ip: row.get(18)?,
                destination_port: row.get::<_, Option<i64>>(19)?.map(|p| p as u16),
                protocol: row.get(20)?,
                http_status_code: row.get::<_, Option<i64>>(21)?.map(|c| c as u16),
                failure_category: row.get::<_, Option<String>>(22)?
                    .unwrap_or_else(|| "unknown".to_string()),
                failure_reason: row.get(23)?,
                severity: row.get::<_, Option<String>>(24)?
                    .unwrap_or_else(|| "medium".to_string()),
                occurrence_count: row.get::<_, Option<i32>>(25)?.unwrap_or(1) as u32,
                first_seen_at: row.get(26)?,
                last_seen_at: row.get(27)?,
                related_target_id: row.get(28)?,
                metadata_json: row.get(29)?,
            })
        })
        .map_err(|e| AppError::Generic(e.to_string()))?;

    let mut results = Vec::new();
    for r in rows {
        results.push(r.map_err(|e| AppError::Generic(e.to_string()))?);
    }
    Ok(results)
}

#[tauri::command]
pub fn get_domain_suggestions(host: String) -> Result<Vec<String>, AppError> {
    let h = crate::intelligence::domain_util::extract_host(&host);
    let rd = crate::intelligence::domain_util::registrable_domain(&h);
    let mut suggestions = Vec::new();
    if !h.is_empty() {
        suggestions.push(h);
    }
    if rd != suggestions.first().map(|s| s.as_str()).unwrap_or("") {
        suggestions.push(rd);
    }
    Ok(suggestions)
}

use crate::config::TargetLoader;

#[tauri::command]
pub fn add_domain_to_targets(
    host: String,
    name: Option<String>,
    category: Option<String>,
) -> Result<Vec<canireach_core::Target>, AppError> {
    let h = crate::intelligence::domain_util::extract_host(&host);
    if h.is_empty() {
        return Err(AppError::Generic("Invalid host".to_string()));
    }

    // Check for existing target with same host/url
    let targets = crate::config::TargetLoader::load()?;
    let exists = targets.iter().any(|t| t.url == h || t.id == h);
    if exists {
        return Err(AppError::Generic(format!(
            "Target already exists for host: {}",
            h
        )));
    }

    let display_name = name.unwrap_or_else(|| h.clone());
    let cat = category.unwrap_or_else(|| "Observed Domains".to_string());

    let new_target = canireach_core::Target {
        id: h.clone(),
        name: display_name,
        url: h,
        description: Some("Added from observed network requests".to_string()),
        category: Some(cat),
        group_ids: Vec::new(),
        tags: vec!["observed".to_string()],
        enabled: true,
        network_profile_id: None,
        diagnostic_overrides: None,
        pinned: false,
        sort_order: 0,
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };

    let mut targets = targets;
    targets.push(new_target);
    TargetLoader::save(&targets)?;
    Ok(targets)
}

#[tauri::command]
pub fn clear_network_operations() -> Result<u64, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let count = conn
        .execute("DELETE FROM network_operations", [])
        .map_err(|e| AppError::Generic(e.to_string()))?;

    Ok(count as u64)
}
