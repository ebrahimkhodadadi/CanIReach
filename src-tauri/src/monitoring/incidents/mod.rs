use crate::monitoring::models::run::MonitoringIncident;
use rusqlite::{params, Connection};
use uuid::Uuid;

pub struct IncidentEngine;

impl IncidentEngine {
    pub fn process_run(
        conn: &Connection,
        target_id: &str,
        profile_id: &str,
        new_status: &str,
        _run_id: &str,
        target_name: &str,
    ) -> Result<Option<MonitoringIncident>, rusqlite::Error> {
        // 1. Check if there is an active open incident for this target and profile
        let mut stmt = conn.prepare(
            "SELECT id, target_id, profile_id, status, started_at, resolved_at, acknowledged_at,
                    consecutive_failures, last_observed_at, title, summary
             FROM incidents
             WHERE target_id = ?1 AND profile_id = ?2 AND status = 'open'
             LIMIT 1",
        )?;

        let active_incident = stmt.query_row(params![target_id, profile_id], |row| {
            Ok(MonitoringIncident {
                id: row.get(0)?,
                target_id: row.get(1)?,
                profile_id: row.get(2)?,
                status: row.get(3)?,
                started_at: row.get(4)?,
                resolved_at: row.get(5)?,
                acknowledged_at: row.get(6)?,
                consecutive_failures: row.get(7)?,
                last_observed_at: row.get(8)?,
                title: row.get(9)?,
                summary: row.get(10)?,
            })
        });

        match active_incident {
            Ok(mut incident) => {
                // There is an open incident
                if new_status == "healthy" {
                    // Success! Check if we can resolve the incident (we use a simple 1-consecutive-success threshold or count successes)
                    // For simplicity, resolve immediately on first healthy run
                    incident.status = "resolved".to_string();
                    incident.resolved_at = Some(chrono::Utc::now().to_rfc3339());
                    incident.last_observed_at = chrono::Utc::now().to_rfc3339();

                    conn.execute(
                        "UPDATE incidents
                         SET status = ?1, resolved_at = ?2, last_observed_at = ?3
                         WHERE id = ?4",
                        params![
                            incident.status,
                            incident.resolved_at,
                            incident.last_observed_at,
                            incident.id
                        ],
                    )?;

                    Ok(Some(incident))
                } else {
                    // Still failing. Update last observed time
                    incident.last_observed_at = chrono::Utc::now().to_rfc3339();
                    incident.consecutive_failures += 1;

                    conn.execute(
                        "UPDATE incidents
                         SET last_observed_at = ?1, consecutive_failures = ?2
                         WHERE id = ?3",
                        params![
                            incident.last_observed_at,
                            incident.consecutive_failures,
                            incident.id
                        ],
                    )?;

                    Ok(None)
                }
            }
            Err(_) => {
                // No open incident
                if new_status == "unreachable" || new_status == "degraded" {
                    // Create a new open incident!
                    let id = Uuid::new_v4().to_string();
                    let now = chrono::Utc::now().to_rfc3339();
                    let title = format!("Outage detected on {}", target_name);
                    let summary = format!(
                        "Target endpoint {} became {} using network profile {}.",
                        target_name, new_status, profile_id
                    );

                    let new_incident = MonitoringIncident {
                        id: id.clone(),
                        target_id: target_id.to_string(),
                        profile_id: profile_id.to_string(),
                        status: "open".to_string(),
                        started_at: now.clone(),
                        resolved_at: None,
                        acknowledged_at: None,
                        consecutive_failures: 1,
                        last_observed_at: now.clone(),
                        title,
                        summary,
                    };

                    conn.execute(
                        "INSERT INTO incidents (id, target_id, profile_id, status, started_at, consecutive_failures, last_observed_at, title, summary)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                        params![
                            new_incident.id,
                            new_incident.target_id,
                            new_incident.profile_id,
                            new_incident.status,
                            new_incident.started_at,
                            new_incident.consecutive_failures,
                            new_incident.last_observed_at,
                            new_incident.title,
                            new_incident.summary
                        ],
                    )?;

                    Ok(Some(new_incident))
                } else {
                    // Target is healthy and no open incident, do nothing
                    Ok(None)
                }
            }
        }
    }
}
