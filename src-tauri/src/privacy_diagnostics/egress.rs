use reqwest::Client;

pub async fn discover_public_ip(client: &Client, ip_family: &str) -> Result<String, String> {
    let url = match ip_family {
        "ipv4" => "https://api4.ipify.org",
        "ipv6" => "https://api6.ipify.org",
        _ => "https://api.ipify.org",
    };

    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        let ip = resp.text().await.map_err(|e| e.to_string())?;
        Ok(ip.trim().to_string())
    } else {
        Err(format!("HTTP error status: {}", resp.status()))
    }
}
