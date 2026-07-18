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
                            request_metadata, response_metadata
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
                request_metadata, response_metadata
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
            })
        },
    )
    .map_err(|e| AppError::Generic(e.to_string()))
}
