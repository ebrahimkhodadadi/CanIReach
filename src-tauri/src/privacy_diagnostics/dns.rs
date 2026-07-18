use reqwest::Client;
use std::time::Duration;
use uuid::Uuid;

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
pub struct DnsResolverInfo {
    pub ip: String,
    pub country: Option<String>,
    pub asn: Option<String>,
    pub r#type: Option<String>,
}

pub struct DnsLeakTest;

impl DnsLeakTest {
    pub async fn run_leak_test(
        direct_client: &Client,
        proxy_client: &Client,
        expect_proxy_dns: bool,
    ) -> Result<Vec<DnsResolverInfo>, String> {
        // Generate a unique token for correlation
        let session_id = Uuid::new_v4().to_string();
        let short_id: String = session_id.chars().take(8).collect();

        // 1. Query dynamic host over system/direct path to see direct resolvers
        let direct_host = format!("{}-direct.bash.ws", short_id);
        let _ = tokio::net::lookup_host(format!("{}:80", direct_host)).await;

        // 2. Query dynamic host over proxy path to see proxy resolvers
        if expect_proxy_dns {
            let proxy_host = format!("{}-proxy.bash.ws", short_id);
            // Trigger remote DNS resolution on proxy by initiating a dummy HTTP request
            let _ = proxy_client
                .get(format!("http://{}", proxy_host))
                .send()
                .await;
        }

        // Wait a short duration for DNS logs to propagate
        tokio::time::sleep(Duration::from_millis(1500)).await;

        // 3. Fetch results
        let results_url = format!("https://bash.ws/dnsleak/test/{}?json", short_id);
        let resp = direct_client
            .get(&results_url)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if resp.status().is_success() {
            let resolvers: Vec<DnsResolverInfo> = resp.json().await.map_err(|e| e.to_string())?;
            Ok(resolvers)
        } else {
            Err(format!("DNS Leak API returned status: {}", resp.status()))
        }
    }
}
