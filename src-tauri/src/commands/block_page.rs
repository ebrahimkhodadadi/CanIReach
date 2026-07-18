use crate::error::AppError;
use crate::intelligence::models::BlockPageSignature;
use crate::monitoring::persistence::DbManager;
use rusqlite::params;

#[tauri::command]
pub fn list_block_page_signatures() -> Result<Vec<BlockPageSignature>, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let mut stmt = conn
        .prepare("SELECT id, name, enabled, match_json FROM block_page_signatures")
        .map_err(|e| AppError::Generic(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            let match_json_str: String = row.get(3)?;
            let match_json = serde_json::from_str(&match_json_str).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    3,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?;

            Ok(BlockPageSignature {
                id: row.get(0)?,
                name: row.get(1)?,
                enabled: row.get::<_, i32>(2)? != 0,
                match_json,
            })
        })
        .map_err(|e| AppError::Generic(e.to_string()))?;

    let mut results = Vec::new();
    for r in rows {
        results.push(r.map_err(|e| AppError::Generic(e.to_string()))?);
    }

    // Return default built-in signatures if table is empty
    if results.is_empty() {
        let default_sig = BlockPageSignature {
            id: "default-blockpage".to_string(),
            name: "Generic Host Block / Filter Match".to_string(),
            enabled: true,
            match_json: crate::intelligence::models::BlockPageMatchCondition {
                status_codes: Some(vec![403, 451]),
                header_contains: None,
                title_contains: Some(vec![
                    "blocked".to_string(),
                    "access denied".to_string(),
                    "restricted".to_string(),
                ]),
                body_text_contains: Some(vec![
                    "filtering policy".to_string(),
                    "access to this website is restricted".to_string(),
                ]),
                redirect_host_patterns: None,
            },
        };
        results.push(default_sig);
    }

    Ok(results)
}

#[tauri::command]
pub fn create_block_page_signature(
    sig: BlockPageSignature,
) -> Result<Vec<BlockPageSignature>, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let match_json_str =
        serde_json::to_string(&sig.match_json).map_err(|e| AppError::Generic(e.to_string()))?;

    conn.execute(
        "INSERT INTO block_page_signatures (id, name, enabled, match_json)
         VALUES (?1, ?2, ?3, ?4)",
        params![sig.id, sig.name, sig.enabled as i32, match_json_str],
    )
    .map_err(|e| AppError::Generic(e.to_string()))?;

    list_block_page_signatures()
}

#[tauri::command]
pub fn update_block_page_signature(
    sig: BlockPageSignature,
) -> Result<Vec<BlockPageSignature>, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let match_json_str =
        serde_json::to_string(&sig.match_json).map_err(|e| AppError::Generic(e.to_string()))?;

    conn.execute(
        "UPDATE block_page_signatures
         SET name = ?2, enabled = ?3, match_json = ?4
         WHERE id = ?1",
        params![sig.id, sig.name, sig.enabled as i32, match_json_str],
    )
    .map_err(|e| AppError::Generic(e.to_string()))?;

    list_block_page_signatures()
}

#[tauri::command]
pub fn delete_block_page_signature(id: String) -> Result<Vec<BlockPageSignature>, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    conn.execute(
        "DELETE FROM block_page_signatures WHERE id = ?1",
        params![id],
    )
    .map_err(|e| AppError::Generic(e.to_string()))?;

    list_block_page_signatures()
}
