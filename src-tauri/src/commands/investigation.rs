use crate::app_state::AppState;
use crate::error::AppError;
use crate::intelligence::models::NetworkInvestigation;
use crate::monitoring::persistence::DbManager;
use rusqlite::params;
use serde_json::json;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn list_investigations() -> Result<Vec<NetworkInvestigation>, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let mut stmt = conn.prepare("SELECT id, target_id, status, baseline_profile_id, comparison_profile_ids, started_at, completed_at, overall_assessment FROM investigations ORDER BY started_at DESC")
        .map_err(|e| AppError::Generic(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            let comp_profiles_str: String = row.get(4)?;
            let comp_profiles: Vec<String> =
                serde_json::from_str(&comp_profiles_str).unwrap_or_default();

            Ok(NetworkInvestigation {
                schema_version: 1,
                id: row.get(0)?,
                target_id: row.get(1)?,
                status: row.get(2)?,
                baseline_profile_id: row.get(3)?,
                comparison_profile_ids: comp_profiles,
                started_at: row.get(5)?,
                completed_at: row.get(6)?,
                overall_assessment: row.get(7)?,
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
pub fn get_investigation(id: String) -> Result<NetworkInvestigation, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    conn.query_row(
        "SELECT id, target_id, status, baseline_profile_id, comparison_profile_ids, started_at, completed_at, overall_assessment
         FROM investigations
         WHERE id = ?1",
        params![id],
        |row| {
            let comp_profiles_str: String = row.get(4)?;
            let comp_profiles: Vec<String> = serde_json::from_str(&comp_profiles_str).unwrap_or_default();

            Ok(NetworkInvestigation {
                schema_version: 1,
                id: row.get(0)?,
                target_id: row.get(1)?,
                status: row.get(2)?,
                baseline_profile_id: row.get(3)?,
                comparison_profile_ids: comp_profiles,
                started_at: row.get(5)?,
                completed_at: row.get(6)?,
                overall_assessment: row.get(7)?,
            })
        },
    ).map_err(|e| AppError::Generic(e.to_string()))
}

#[tauri::command]
pub fn create_investigation(
    target_id: String,
    baseline_profile_id: String,
    comparison_profile_ids: Vec<String>,
) -> Result<NetworkInvestigation, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let id = Uuid::new_v4().to_string();
    let started_at = chrono::Utc::now().to_rfc3339();
    let comp_profiles_str =
        serde_json::to_string(&comparison_profile_ids).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "INSERT INTO investigations (id, target_id, status, baseline_profile_id, comparison_profile_ids, started_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            id,
            target_id,
            "draft",
            baseline_profile_id,
            comp_profiles_str,
            started_at
        ],
    ).map_err(|e| AppError::Generic(e.to_string()))?;

    get_investigation(id)
}

#[tauri::command]
pub async fn start_investigation(
    state: State<'_, AppState>,
    id: String,
) -> Result<NetworkInvestigation, AppError> {
    let investigation = get_investigation(id.clone())?;

    // Set status to running
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    conn.execute(
        "UPDATE investigations SET status = 'running' WHERE id = ?1",
        params![id],
    )
    .map_err(|e| AppError::Generic(e.to_string()))?;

    // Find Target
    let target = {
        let targets_lock = state.targets.lock().unwrap();
        targets_lock
            .iter()
            .find(|t| t.id == investigation.target_id)
            .cloned()
    };

    let target = match target {
        Some(t) => t,
        None => {
            conn.execute(
                "UPDATE investigations SET status = 'failed' WHERE id = ?1",
                params![id],
            )
            .ok();
            return Err(AppError::Generic(format!(
                "Target with id '{}' not found",
                investigation.target_id
            )));
        }
    };

    // Staged Comparison logic
    // 1. Probe using Baseline profile
    let mut target_baseline = target.clone();
    target_baseline.network_profile_id = if investigation.baseline_profile_id == "system-default" {
        None
    } else {
        Some(investigation.baseline_profile_id.clone())
    };

    let engine = state.engine.lock().await;
    let baseline_result = engine.probe_one(&target_baseline).await;

    // 2. Probe using Comparison Profiles
    let mut comparison_results = Vec::new();
    for comp_profile_id in &investigation.comparison_profile_ids {
        let mut target_comp = target.clone();
        target_comp.network_profile_id = if comp_profile_id == "system-default" {
            None
        } else {
            Some(comp_profile_id.clone())
        };
        let comp_result = engine.probe_one(&target_comp).await;
        comparison_results.push((comp_profile_id.clone(), comp_result));
    }

    // 3. Compare evidence & classify anomalies
    let mut supporting_signals = Vec::new();
    let mut contradicting_signals = Vec::new();
    let mut explanations = Vec::new();
    let mut confidence = "none";
    let mut overall_verdict = "Healthy";

    let baseline_ok = baseline_result.overall_status == "up";

    // Check for direct vs proxy difference
    let mut proxy_succeeded = false;
    for (profile_id, result) in &comparison_results {
        if result.overall_status == "up" && !baseline_ok {
            proxy_succeeded = true;
            supporting_signals.push(format!(
                "Access succeeded through comparison context ({})",
                profile_id
            ));
        }
    }

    if !baseline_ok {
        overall_verdict = "Path-specific access difference observed";
        confidence = "medium";

        supporting_signals.push("Direct path connection timed out or failed".to_string());
        if proxy_succeeded {
            supporting_signals.push("Proxy tunnel succeeded".to_string());
        }

        explanations.push("Possible explanations:".to_string());
        explanations.push("- Path-specific routing failure".to_string());
        explanations.push("- Firewall or middlebox policy".to_string());
        explanations.push("- Regional access restriction".to_string());
    } else {
        contradicting_signals.push("Baseline path succeeded".to_string());
    }

    let assessment_json = json!({
        "verdict": overall_verdict,
        "confidence": confidence,
        "supporting": supporting_signals,
        "contradicting": contradicting_signals,
        "explanations": explanations,
        "baseline": {
            "profile_id": investigation.baseline_profile_id,
            "status": baseline_result.overall_status,
            "dns": baseline_result.dns.as_ref()
                .and_then(|d| d.metadata.as_ref())
                .and_then(|m| m.get("resolved_ips"))
                .cloned()
                .unwrap_or_default(),
            "http_status": baseline_result.http_status,
            "latency_ms": baseline_result.latency_ms,
        },
        "comparisons": comparison_results.iter().map(|(pid, r)| {
            json!({
                "profile_id": pid,
                "status": r.overall_status,
                "dns": r.dns.as_ref()
                    .and_then(|d| d.metadata.as_ref())
                    .and_then(|m| m.get("resolved_ips"))
                    .cloned()
                    .unwrap_or_default(),
                "http_status": r.http_status,
                "latency_ms": r.latency_ms,
            })
        }).collect::<Vec<_>>(),
    });

    let completed_at = chrono::Utc::now().to_rfc3339();
    let assessment_str = serde_json::to_string(&assessment_json).unwrap_or_default();

    conn.execute(
        "UPDATE investigations
         SET status = 'completed', completed_at = ?2, overall_assessment = ?3
         WHERE id = ?1",
        params![id, completed_at, assessment_str],
    )
    .map_err(|e| AppError::Generic(e.to_string()))?;

    get_investigation(id)
}

#[tauri::command]
pub fn cancel_investigation(id: String) -> Result<NetworkInvestigation, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    conn.execute(
        "UPDATE investigations SET status = 'failed', overall_assessment = '{\"error\": \"Cancelled by user\"}' WHERE id = ?1",
        params![id],
    ).map_err(|e| AppError::Generic(e.to_string()))?;

    get_investigation(id)
}

#[tauri::command]
pub fn delete_investigation(id: String) -> Result<(), AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    conn.execute("DELETE FROM investigations WHERE id = ?1", params![id])
        .map_err(|e| AppError::Generic(e.to_string()))?;

    Ok(())
}
