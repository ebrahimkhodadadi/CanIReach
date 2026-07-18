use canireach_core::{FailureEvidence, ProbeResult, ProbeStageResult};
use chrono::Utc;
use tauri::{AppHandle, Emitter};

pub const PROBE_UPDATE_EVENT: &str = "probe:update";

pub fn emit_probe_update(app: Option<&AppHandle>, result: ProbeResult) {
    if let Some(a) = app {
        let _ = a.emit(PROBE_UPDATE_EVENT, result.clone());

        // Also emit using standard probe:completed event
        let run_id = result.run_id.clone();
        let target_id = result.target_id.clone();
        let _ = a.emit(
            "probe:completed",
            serde_json::json!({
                "runId": run_id,
                "targetId": target_id,
                "result": result,
                "timestamp": Utc::now().to_rfc3339()
            }),
        );
    }
}

pub fn emit_probe_started(app: Option<&AppHandle>, run_id: &str, target_id: &str) {
    if let Some(a) = app {
        let _ = a.emit(
            "probe:started",
            serde_json::json!({
                "runId": run_id,
                "targetId": target_id,
                "timestamp": Utc::now().to_rfc3339()
            }),
        );
    }
}

pub fn emit_probe_stage_started(
    app: Option<&AppHandle>,
    run_id: &str,
    target_id: &str,
    stage: &str,
) {
    if let Some(a) = app {
        let _ = a.emit(
            "probe:stage-started",
            serde_json::json!({
                "runId": run_id,
                "targetId": target_id,
                "stage": stage,
                "timestamp": Utc::now().to_rfc3339()
            }),
        );
    }
}

pub fn emit_probe_stage_completed(
    app: Option<&AppHandle>,
    run_id: &str,
    target_id: &str,
    stage: &str,
    result: &ProbeStageResult,
) {
    if let Some(a) = app {
        let _ = a.emit(
            "probe:stage-completed",
            serde_json::json!({
                "runId": run_id,
                "targetId": target_id,
                "stage": stage,
                "result": result,
                "timestamp": Utc::now().to_rfc3339()
            }),
        );
    }
}

pub fn emit_probe_failed(
    app: Option<&AppHandle>,
    run_id: &str,
    target_id: &str,
    error: &FailureEvidence,
) {
    if let Some(a) = app {
        let _ = a.emit(
            "probe:failed",
            serde_json::json!({
                "runId": run_id,
                "targetId": target_id,
                "error": error,
                "timestamp": Utc::now().to_rfc3339()
            }),
        );
    }
}

pub fn emit_probe_cancelled(app: Option<&AppHandle>, run_id: &str, target_id: &str) {
    if let Some(a) = app {
        let _ = a.emit(
            "probe:cancelled",
            serde_json::json!({
                "runId": run_id,
                "targetId": target_id,
                "timestamp": Utc::now().to_rfc3339()
            }),
        );
    }
}
