use std::process::Command;

pub struct NetworkPostureScanner;

impl NetworkPostureScanner {
    pub fn scan_vpn_adapters() -> Vec<String> {
        let mut vpn_adapters = Vec::new();

        // Query active adapters via PowerShell
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | Select-Object Name, InterfaceDescription | ConvertTo-Json",
            ])
            .output();

        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            // Parse array or single object representation
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout) {
                let adapters = if let Some(arr) = json.as_array() {
                    arr.clone()
                } else {
                    vec![json]
                };

                for adapter in adapters {
                    let name = adapter
                        .get("Name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_lowercase();
                    let desc = adapter
                        .get("InterfaceDescription")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_lowercase();

                    let keywords = &[
                        "vpn",
                        "tun",
                        "tap",
                        "wireguard",
                        "openvpn",
                        "tailscale",
                        "zerotier",
                        "fortinet",
                        "cisco",
                        "nord",
                        "proton",
                        "expressvpn",
                    ];

                    if keywords
                        .iter()
                        .any(|&k| name.contains(k) || desc.contains(k))
                    {
                        let final_name = adapter
                            .get("Name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        vpn_adapters.push(final_name);
                    }
                }
            }
        }

        vpn_adapters
    }
}
