use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum LogLevel {
    Info,
    Warn,
    Error,
    Debug,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogStep {
    pub timestamp: DateTime<Utc>,
    pub level: LogLevel,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProbeLog {
    pub steps: Vec<LogStep>,
}

impl ProbeLog {
    pub fn new() -> Self {
        Self { steps: Vec::new() }
    }

    pub fn add(&mut self, level: LogLevel, message: String) {
        self.steps.push(LogStep {
            timestamp: Utc::now(),
            level,
            message,
        });
    }
}

impl Default for ProbeLog {
    fn default() -> Self {
        Self::new()
    }
}
