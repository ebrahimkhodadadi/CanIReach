use reqwest::Client;
use std::collections::HashSet;

pub struct TorExitChecker;

impl TorExitChecker {
    pub async fn is_tor_exit_node(client: &Client, ip: &str) -> Result<bool, String> {
        let url = "https://check.torproject.org/torbulkexitlist";
        let resp = client.get(url).send().await.map_err(|e| e.to_string())?;

        if resp.status().is_success() {
            let body = resp.text().await.map_err(|e| e.to_string())?;
            let exit_nodes: HashSet<&str> = body.lines().map(|line| line.trim()).collect();
            Ok(exit_nodes.contains(ip))
        } else {
            Err(format!(
                "Failed to retrieve Tor list. Status: {}",
                resp.status()
            ))
        }
    }
}
