use crate::app_state::AppState;
use crate::config::ProfilesLoader;
use crate::error::AppError;
use crate::monitoring::persistence::DbManager;
use crate::privacy_diagnostics::client::build_client_for_profile;
use crate::privacy_diagnostics::dns::DnsLeakTest;
use crate::privacy_diagnostics::egress::discover_public_ip;
use crate::privacy_diagnostics::models::{PrivacyAssessment, PrivacyExpectationPolicy};
use crate::privacy_diagnostics::posture::NetworkPostureScanner;
use crate::privacy_diagnostics::tor::TorExitChecker;
use chrono::Utc;
use rusqlite::params;
use std::time::Duration;
use uuid::Uuid;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct PrivacyFinding {
    pub id: String,
    pub category: String,
    pub status: String,
    pub severity: String,
    pub expected_behavior: String,
    pub observed_behavior: String,
    pub confidence: String,
}

fn is_public_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(addr) => {
            let octets = addr.octets();
            if octets[0] == 10 {
                return false;
            }
            if octets[0] == 172 && (16..=31).contains(&octets[1]) {
                return false;
            }
            if octets[0] == 192 && octets[1] == 168 {
                return false;
            }
            if octets[0] == 169 && octets[1] == 254 {
                return false;
            }
            if octets[0] == 127 {
                return false;
            }
            if octets[0] == 0 {
                return false;
            }
            true
        }
        std::net::IpAddr::V6(addr) => {
            let segments = addr.segments();
            if addr.is_loopback() {
                return false;
            }
            if (segments[0] & 0xfe00) == 0xfc00 {
                return false;
            }
            if (segments[0] & 0xffc0) == 0xfe80 {
                return false;
            }
            if addr.is_multicast() {
                return false;
            }
            true
        }
    }
}

#[tauri::command]
pub fn record_webrtc_candidate(
    state: tauri::State<'_, AppState>,
    session_id: String,
    candidate: String,
) -> Result<(), AppError> {
    let mut lock = state.webrtc_candidates.lock().unwrap();
    lock.entry(session_id).or_default().push(candidate);
    Ok(())
}

#[tauri::command]
pub async fn start_privacy_assessment(
    state: tauri::State<'_, AppState>,
    profile_id: String,
    expectations_json: String,
    webrtc_candidates: Vec<String>,
) -> Result<PrivacyAssessment, AppError> {
    let started_at = Utc::now().to_rfc3339();
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let policy: PrivacyExpectationPolicy = serde_json::from_str(&expectations_json)
        .map_err(|e| AppError::Generic(format!("Failed to parse expectations policy: {}", e)))?;

    // 1. Resolve network profile
    let profiles = ProfilesLoader::load()
        .map_err(|e| AppError::Generic(format!("Failed to load profiles: {}", e)))?;

    let profile = profiles
        .iter()
        .find(|p| p.id == profile_id)
        .cloned()
        .unwrap_or_else(|| canireach_core::NetworkProfile {
            id: "system-default".to_string(),
            name: "System Default".to_string(),
            description: None,
            is_default: true,
            interface: canireach_core::NetworkInterfaceSelection {
                mode: "system".to_string(),
                interface_id: None,
                source_ipv4: None,
                source_ipv6: None,
            },
            dns: canireach_core::DnsSelection {
                mode: "system".to_string(),
                servers: Vec::new(),
            },
            proxy: canireach_core::ProxySelection {
                mode: "system".to_string(),
                custom_type: None,
                custom_host: None,
                custom_port: None,
                auth_username: None,
                auth_credential_id: None,
                bypass: None,
            },
            ip_preference: "system".to_string(),
            preflight: None,
            created_at: "".to_string(),
            updated_at: "".to_string(),
        });

    // 2. Build direct and proxy HTTP clients
    let proxy_client =
        build_client_for_profile(&profile, Duration::from_secs(5)).map_err(AppError::Generic)?;

    let direct_profile = canireach_core::NetworkProfile {
        id: "direct".to_string(),
        name: "Direct".to_string(),
        description: None,
        is_default: false,
        interface: canireach_core::NetworkInterfaceSelection {
            mode: "system".to_string(),
            interface_id: None,
            source_ipv4: None,
            source_ipv6: None,
        },
        dns: canireach_core::DnsSelection {
            mode: "system".to_string(),
            servers: Vec::new(),
        },
        proxy: canireach_core::ProxySelection {
            mode: "direct".to_string(),
            custom_type: None,
            custom_host: None,
            custom_port: None,
            auth_username: None,
            auth_credential_id: None,
            bypass: None,
        },
        ip_preference: "system".to_string(),
        preflight: None,
        created_at: "".to_string(),
        updated_at: "".to_string(),
    };

    let direct_client = build_client_for_profile(&direct_profile, Duration::from_secs(5))
        .map_err(AppError::Generic)?;

    let mut findings = Vec::new();

    // 3. Egress IP Discovery
    let direct_ipv4 = discover_public_ip(&direct_client, "ipv4").await.ok();
    let direct_ipv6 = discover_public_ip(&direct_client, "ipv6").await.ok();
    let proxy_ipv4 = discover_public_ip(&proxy_client, "ipv4").await.ok();
    let proxy_ipv6 = discover_public_ip(&proxy_client, "ipv6").await.ok();

    // 4. DNS Leak Test
    let expect_proxy_dns = policy.dns_expectation == "proxy_remote_resolution_required";
    let dns_resolvers = DnsLeakTest::run_leak_test(&direct_client, &proxy_client, expect_proxy_dns)
        .await
        .ok()
        .unwrap_or_default();

    // 5. Posture & VPN Check
    let active_vpn_adapters = NetworkPostureScanner::scan_vpn_adapters();

    let is_direct_tor = if let Some(ref ip) = direct_ipv4 {
        TorExitChecker::is_tor_exit_node(&direct_client, ip)
            .await
            .unwrap_or(false)
    } else {
        false
    };

    let is_proxy_tor = if let Some(ref ip) = proxy_ipv4 {
        TorExitChecker::is_tor_exit_node(&direct_client, ip)
            .await
            .unwrap_or(false)
    } else {
        false
    };

    // Aggregate WebRTC candidates from parameter list and memory state
    let mut all_candidates = webrtc_candidates;
    {
        let lock = state.webrtc_candidates.lock().unwrap();
        if let Some(cands) = lock.get(&profile_id) {
            all_candidates.extend(cands.clone());
        }
    }

    // --- POLICY EVALUATION ---

    // A. DNS Path Evaluation
    if policy.dns_expectation == "proxy_remote_resolution_required" {
        if profile.proxy.mode == "custom" && profile.proxy.custom_type.as_deref() == Some("socks5")
        {
            findings.push(PrivacyFinding {
                id: Uuid::new_v4().to_string(),
                category: "dns_path".to_string(),
                status: "policy_violation".to_string(),
                severity: "warning".to_string(),
                expected_behavior: "Remote resolution through proxy (SOCKS5H)".to_string(),
                observed_behavior:
                    "SOCKS5 profile configured without remote resolution, causing local DNS lookup"
                        .to_string(),
                confidence: "high".to_string(),
            });
        }

        if let Some(ref dir_ip) = direct_ipv4 {
            for resolver in &dns_resolvers {
                if resolver.ip == *dir_ip {
                    findings.push(PrivacyFinding {
                        id: Uuid::new_v4().to_string(),
                        category: "dns_path".to_string(),
                        status: "policy_violation".to_string(),
                        severity: "critical".to_string(),
                        expected_behavior: "Remote DNS resolution on proxy server".to_string(),
                        observed_behavior: format!("DNS resolver IP '{}' matches your direct public IP, indicating DNS leak", resolver.ip),
                        confidence: "high".to_string(),
                    });
                }
            }
        }
    }

    // B. IPv6 Bypass Check
    if (policy.ipv6_policy == "must_use_proxy" || policy.ipv6_policy == "forbidden")
        && (profile_id == "system-default" || proxy_ipv6.is_none())
    {
        if let Some(ref ip) = direct_ipv6 {
            findings.push(PrivacyFinding {
                id: Uuid::new_v4().to_string(),
                category: "ipv6_path".to_string(),
                status: "policy_violation".to_string(),
                severity: "critical".to_string(),
                expected_behavior: "IPv6 traffic must pass through configured proxy".to_string(),
                observed_behavior: format!(
                    "Global IPv6 address '{}' resolved directly outside proxy",
                    ip
                ),
                confidence: "high".to_string(),
            });
        }
    }

    // C. Proxy Consistency Check
    if policy.expected_routing == "proxy_required" {
        if profile.proxy.mode == "system" || profile.proxy.mode == "direct" {
            findings.push(PrivacyFinding {
                id: Uuid::new_v4().to_string(),
                category: "proxy_bypass".to_string(),
                status: "policy_violation".to_string(),
                severity: "critical".to_string(),
                expected_behavior: "All connections must use custom proxy".to_string(),
                observed_behavior: "System Default / Direct routing selected".to_string(),
                confidence: "high".to_string(),
            });
        } else if let (Some(ref dir_ip), Some(ref prx_ip)) = (&direct_ipv4, &proxy_ipv4) {
            if dir_ip == prx_ip {
                findings.push(PrivacyFinding {
                    id: Uuid::new_v4().to_string(),
                    category: "proxy_bypass".to_string(),
                    status: "policy_violation".to_string(),
                    severity: "critical".to_string(),
                    expected_behavior: "All target operations must route through proxy".to_string(),
                    observed_behavior: format!(
                        "Direct public IP '{}' is identical to proxy egress IP",
                        dir_ip
                    ),
                    confidence: "high".to_string(),
                });
            }
        }
    }

    // D. WebRTC Exposure Check
    if policy.webrtc_expectation == "public_candidates_forbidden" {
        let mut exposed_public_ips = Vec::new();
        for candidate in &all_candidates {
            let parts: Vec<&str> = candidate.split_whitespace().collect();
            for part in parts {
                if let Ok(ip) = part.parse::<std::net::IpAddr>() {
                    if !ip.is_loopback() && !ip.is_unspecified() && is_public_ip(ip) {
                        exposed_public_ips.push(ip.to_string());
                    }
                }
            }
        }

        if !exposed_public_ips.is_empty() {
            findings.push(PrivacyFinding {
                id: Uuid::new_v4().to_string(),
                category: "webrtc_context".to_string(),
                status: "policy_violation".to_string(),
                severity: "warning".to_string(),
                expected_behavior: "No public ICE candidates expected".to_string(),
                observed_behavior: format!(
                    "Tauri WebView gathered public IP candidates: {}",
                    exposed_public_ips.join(", ")
                ),
                confidence: "high".to_string(),
            });
        }
    }

    // E. Tor checks
    if is_proxy_tor || is_direct_tor {
        findings.push(PrivacyFinding {
            id: Uuid::new_v4().to_string(),
            category: "tor_exit".to_string(),
            status: "difference_observed".to_string(),
            severity: "info".to_string(),
            expected_behavior: "Standard proxy exit node".to_string(),
            observed_behavior: "Egress IP is listed as a Tor Exit Node".to_string(),
            confidence: "high".to_string(),
        });
    }

    // F. Posture adapter checks
    if !active_vpn_adapters.is_empty() {
        findings.push(PrivacyFinding {
            id: Uuid::new_v4().to_string(),
            category: "vpn_posture".to_string(),
            status: "difference_observed".to_string(),
            severity: "info".to_string(),
            expected_behavior: "Clean routing interface".to_string(),
            observed_behavior: format!(
                "Active VPN adapter detected: {}",
                active_vpn_adapters.join(", ")
            ),
            confidence: "medium".to_string(),
        });
    }

    let findings_json = serde_json::to_string(&findings).unwrap_or_default();

    // Assess final verdict
    let overall_verdict = if findings.iter().any(|f| f.status == "policy_violation") {
        "Policy Violations Detected"
    } else if findings.iter().any(|f| f.status == "difference_observed") {
        "Differences Observed"
    } else {
        "All Tests Passed"
    };

    let assessment = PrivacyAssessment {
        schema_version: 1,
        id: Uuid::new_v4().to_string(),
        profile_id: profile_id.clone(),
        status: "completed".to_string(),
        started_at: started_at.clone(),
        completed_at: Some(Utc::now().to_rfc3339()),
        overall_verdict: Some(overall_verdict.to_string()),
        findings_json: Some(findings_json),
    };

    conn.execute(
        "INSERT INTO privacy_assessments (id, profile_id, status, started_at, completed_at, overall_verdict, findings_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            assessment.id,
            assessment.profile_id,
            assessment.status,
            assessment.started_at,
            assessment.completed_at,
            assessment.overall_verdict,
            assessment.findings_json
        ],
    ).map_err(|e| AppError::Generic(format!("Failed to insert privacy assessment: {}", e)))?;

    Ok(assessment)
}

#[tauri::command]
pub fn query_privacy_assessments() -> Result<Vec<PrivacyAssessment>, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let mut stmt = conn.prepare(
        "SELECT id, profile_id, status, started_at, completed_at, overall_verdict, findings_json
         FROM privacy_assessments
         ORDER BY started_at DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(PrivacyAssessment {
            schema_version: 1,
            id: row.get(0)?,
            profile_id: row.get(1)?,
            status: row.get(2)?,
            started_at: row.get(3)?,
            completed_at: row.get(4)?,
            overall_verdict: row.get(5)?,
            findings_json: row.get(6)?,
        })
    })?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r?);
    }
    Ok(list)
}

#[tauri::command]
pub fn get_privacy_expectation(
    profile_id: String,
) -> Result<Option<PrivacyExpectationPolicy>, AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let mut stmt = conn.prepare(
        "SELECT id, profile_id, expected_routing, dns_expectation, ipv6_policy, webrtc_expectation
         FROM privacy_expectations
         WHERE profile_id = ?1",
    )?;

    let mut rows = stmt.query(params![profile_id])?;

    if let Some(row) = rows.next()? {
        Ok(Some(PrivacyExpectationPolicy {
            schema_version: 1,
            id: row.get(0)?,
            profile_id: row.get(1)?,
            expected_routing: row.get(2)?,
            dns_expectation: row.get(3)?,
            ipv6_policy: row.get(4)?,
            webrtc_expectation: row.get(5)?,
        }))
    } else {
        Ok(Some(PrivacyExpectationPolicy {
            schema_version: 1,
            id: Uuid::new_v4().to_string(),
            profile_id: profile_id.clone(),
            expected_routing: "system_behavior".to_string(),
            dns_expectation: "system_allowed".to_string(),
            ipv6_policy: "allowed".to_string(),
            webrtc_expectation: "not_evaluated".to_string(),
        }))
    }
}

#[tauri::command]
pub fn save_privacy_expectation(policy_json: String) -> Result<(), AppError> {
    let conn = DbManager::get_connection()
        .map_err(|e| AppError::Generic(format!("Failed to open DB: {}", e)))?;

    let policy: PrivacyExpectationPolicy = serde_json::from_str(&policy_json)
        .map_err(|e| AppError::Generic(format!("Failed to parse policy JSON: {}", e)))?;

    conn.execute(
        "INSERT INTO privacy_expectations (id, profile_id, expected_routing, dns_expectation, ipv6_policy, webrtc_expectation)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
            expected_routing = excluded.expected_routing,
            dns_expectation = excluded.dns_expectation,
            ipv6_policy = excluded.ipv6_policy,
            webrtc_expectation = excluded.webrtc_expectation",
        params![
            policy.id,
            policy.profile_id,
            policy.expected_routing,
            policy.dns_expectation,
            policy.ipv6_policy,
            policy.webrtc_expectation
        ],
    ).map_err(|e| AppError::Generic(format!("Failed to save privacy expectation: {}", e)))?;

    Ok(())
}
