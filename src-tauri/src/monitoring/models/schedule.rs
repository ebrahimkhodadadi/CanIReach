use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum MonitoringScope {
    #[serde(rename = "all_enabled_targets")]
    AllEnabledTargets,
    #[serde(rename = "selected_targets")]
    SelectedTargets { target_ids: Vec<String> },
    #[serde(rename = "group")]
    Group { group_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum ScheduleDetails {
    #[serde(rename = "interval")]
    Interval { interval_seconds: u32 },
    #[serde(rename = "daily")]
    Daily {
        local_time: String,
        time_zone: String,
    },
    #[serde(rename = "weekly")]
    Weekly {
        days_of_week: Vec<u32>,
        local_time: String,
        time_zone: String,
    },
    #[serde(rename = "cron")]
    Cron {
        expression: String,
        time_zone: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MonitoringSchedule {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub scope: MonitoringScope,
    pub schedule: ScheduleDetails,
    pub network_profile_override_id: Option<String>,
    pub run_preflight: bool,
    pub strict_preflight_blocking: bool,
    pub overlap_policy: String, // "skip" | "queue_one" | "cancel_previous"
    pub missed_run_policy: String, // "skip" | "run_once_on_resume"
    pub concurrency_limit: Option<u32>,
    pub target_timeout_ms: Option<u32>,
    pub batch_timeout_ms: Option<u32>,
    pub alert_rule_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_run_at: Option<String>,
    pub next_run_at: Option<String>,
}

impl MonitoringSchedule {
    pub fn calculate_next_run(
        &self,
        from_time: chrono::DateTime<chrono::Utc>,
    ) -> Option<chrono::DateTime<chrono::Utc>> {
        if !self.enabled {
            return None;
        }

        match &self.schedule {
            ScheduleDetails::Interval { interval_seconds } => {
                let seconds = *interval_seconds as i64;
                if seconds <= 0 {
                    return None;
                }
                Some(from_time + chrono::Duration::seconds(seconds))
            }
            ScheduleDetails::Daily { local_time, .. } => {
                // Simplified timezone daily schedule (defaults to local/system offsets or direct UTC offset calculation)
                // parse "HH:MM"
                let parts: Vec<&str> = local_time.split(':').collect();
                if parts.len() != 2 {
                    return None;
                }
                let hour: u32 = parts[0].parse().unwrap_or(0);
                let minute: u32 = parts[1].parse().unwrap_or(0);

                // Construct next run time for today or tomorrow
                let mut next = from_time
                    .with_hour(hour)?
                    .with_minute(minute)?
                    .with_second(0)?
                    .with_nanosecond(0)?;

                if next <= from_time {
                    next += chrono::Duration::days(1);
                }
                Some(next)
            }
            ScheduleDetails::Weekly {
                days_of_week,
                local_time,
                ..
            } => {
                let parts: Vec<&str> = local_time.split(':').collect();
                if parts.len() != 2 {
                    return None;
                }
                let hour: u32 = parts[0].parse().unwrap_or(0);
                let minute: u32 = parts[1].parse().unwrap_or(0);

                let next = from_time
                    .with_hour(hour)?
                    .with_minute(minute)?
                    .with_second(0)?
                    .with_nanosecond(0)?;

                // Find next day matching days_of_week (1 = Monday, 7 = Sunday)
                let current_day = from_time.weekday().number_from_monday();

                let mut days_to_add = 7;
                for &day in days_of_week {
                    let diff = if day >= current_day {
                        day - current_day
                    } else {
                        day + 7 - current_day
                    };

                    if diff == 0 && next > from_time {
                        days_to_add = 0;
                        break;
                    } else if diff > 0 && diff < days_to_add {
                        days_to_add = diff;
                    }
                }

                if days_to_add == 7 && next <= from_time {
                    days_to_add = 7;
                } else if days_to_add == 7 {
                    // fallback
                    days_to_add = 1;
                }

                Some(next + chrono::Duration::days(days_to_add as i64))
            }
            ScheduleDetails::Cron { .. } => {
                // Fallback interval (e.g. 5 minutes) for simplicity if cron parser not used
                Some(from_time + chrono::Duration::minutes(5))
            }
        }
    }
}
use chrono::Datelike;
use chrono::Timelike;
