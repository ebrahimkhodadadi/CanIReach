use crate::monitoring::models::run::MonitoringIncident;
use rusqlite::{params, Connection};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub struct AlertEngine;

impl AlertEngine {
    pub fn trigger_alert(
        app: Option<&AppHandle>,
        conn: &Connection,
        incident: &MonitoringIncident,
        event_type: &str, // "incident_opened" | "incident_resolved"
    ) -> Result<(), rusqlite::Error> {
        let alert_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        // 1. Persist alert delivery log
        conn.execute(
            "INSERT INTO alert_deliveries (id, incident_id, rule_id, event_type, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                alert_id,
                incident.id,
                "default-rule", // Rule ID placeholder
                event_type,
                "delivered",
                now
            ],
        )?;

        // 1b. Log into persistent local Notification Center
        let severity = if event_type == "incident_opened" {
            "critical"
        } else {
            "info"
        };
        let notif_id = Uuid::new_v4().to_string();
        let dedup_key = format!("{}-{}", incident.id, event_type);

        let _ = conn.execute(
            "INSERT INTO notifications (
                id, type, severity, created_at, read_at, title, summary,
                target_id, profile_id, run_id, incident_id, problem_id,
                delivery_state, deduplication_key
             ) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8, NULL, ?9, NULL, 'delivered', ?10)
             ON CONFLICT(deduplication_key) DO UPDATE SET created_at = ?4",
            params![
                notif_id,
                event_type,
                severity,
                now,
                incident.title,
                incident.summary,
                incident.target_id,
                incident.profile_id,
                incident.id,
                dedup_key,
            ],
        );

        // 2. Emit event to frontend to show notification
        let event_name = match event_type {
            "incident_opened" => "alert:incident_opened",
            "incident_resolved" => "alert:incident_resolved",
            _ => "alert:generic",
        };

        let payload = serde_json::json!({
            "alert_id": alert_id,
            "incident_id": incident.id,
            "target_id": incident.target_id,
            "profile_id": incident.profile_id,
            "title": incident.title,
            "summary": incident.summary,
            "status": incident.status,
            "started_at": incident.started_at,
            "resolved_at": incident.resolved_at,
        });

        if let Some(a) = app {
            let _ = a.emit(event_name, payload);
        }

        Ok(())
    }
}
