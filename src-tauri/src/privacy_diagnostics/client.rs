use canireach_core::NetworkProfile;
use reqwest::Client;
use std::time::Duration;

pub fn build_client_for_profile(
    profile: &NetworkProfile,
    timeout: Duration,
) -> Result<Client, String> {
    let mut builder = Client::builder()
        .timeout(timeout)
        .connect_timeout(timeout)
        .user_agent("CanIReach/1.0 (Privacy Diagnostics)")
        .danger_accept_invalid_certs(true) // Ensure diagnostics complete even on self-signed certs
        .redirect(reqwest::redirect::Policy::none());

    // Apply Proxy Configuration
    match profile.proxy.mode.as_str() {
        "direct" => {
            builder = builder.no_proxy();
        }
        "system" => {
            // standard reqwest configuration honors system default proxy automatically
        }
        "custom" => {
            if let (Some(ref p_type), Some(ref host), Some(port)) = (
                &profile.proxy.custom_type,
                &profile.proxy.custom_host,
                profile.proxy.custom_port,
            ) {
                let proto = p_type.to_lowercase();
                let proxy_url = format!("{}://{}:{}", proto, host, port);
                match reqwest::Proxy::all(&proxy_url) {
                    Ok(proxy) => {
                        builder = builder.proxy(proxy);
                    }
                    Err(e) => {
                        return Err(format!(
                            "Failed to build proxy from URL '{}': {}",
                            proxy_url, e
                        ));
                    }
                }
            }
        }
        _ => {}
    }

    // Apply Interface/Source IP Binding if specified
    if profile.interface.mode == "interface" {
        if let Some(ref ipv4_str) = profile.interface.source_ipv4 {
            if let Ok(ip) = ipv4_str.parse::<std::net::IpAddr>() {
                builder = builder.local_address(ip);
            }
        }
        if let Some(ref ipv6_str) = profile.interface.source_ipv6 {
            if let Ok(ip) = ipv6_str.parse::<std::net::IpAddr>() {
                builder = builder.local_address(ip);
            }
        }
    }

    builder.build().map_err(|e| e.to_string())
}
