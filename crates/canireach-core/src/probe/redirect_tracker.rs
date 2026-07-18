use crate::error::ProbeError;
use reqwest::Url;

pub struct RedirectTracker {
    limit: usize,
    history: Vec<Url>,
}

impl RedirectTracker {
    pub fn new(limit: usize) -> Self {
        Self {
            limit,
            history: Vec::new(),
        }
    }

    pub fn track(&mut self, current: &Url, location: &str) -> Result<Url, ProbeError> {
        if self.history.len() >= self.limit {
            return Err(ProbeError::RedirectError(format!(
                "Redirect limit of {} exceeded",
                self.limit
            )));
        }
        let next_url = current.join(location).map_err(|e| {
            ProbeError::RedirectError(format!("Failed to resolve redirect URL: {}", e))
        })?;
        self.history.push(next_url.clone());
        Ok(next_url)
    }

    pub fn history(&self) -> &[Url] {
        &self.history
    }
}
