use super::redirect_tracker::RedirectTracker;
use crate::config::ProbeConfig;
use crate::error::ProbeError;
use crate::models::{
    Confidence, FailureEvidence, FailureKind, FailureStage, LogLevel, ProbeLog, ProbeResult,
    ProbeStageResult, ProbeStatus, Target, Timings,
};
use chrono::{DateTime, Utc};
use reqwest::Url;
use rustls::{ClientConfig, ClientConnection, ServerName};
use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub struct HttpProber {
    client: reqwest::Client,
    config: ProbeConfig,
}

fn classify_reqwest_error(err: &reqwest::Error) -> (FailureStage, FailureKind, String) {
    let err_str = err.to_string().to_lowercase();

    if err.is_timeout() {
        return (
            FailureStage::Timeout,
            FailureKind::ConnectionTimeout,
            err.to_string(),
        );
    }

    let mut source = std::error::Error::source(err);
    while let Some(src) = source {
        let src_str = src.to_string().to_lowercase();
        if src_str.contains("certificate") || src_str.contains("cert") {
            return (
                FailureStage::Tls,
                FailureKind::TlsCertificate,
                src.to_string(),
            );
        }
        if src_str.contains("handshake") || src_str.contains("tls") || src_str.contains("ssl") {
            return (
                FailureStage::Tls,
                FailureKind::TlsHandshake,
                src.to_string(),
            );
        }
        if src_str.contains("dns")
            || src_str.contains("resolve")
            || src_str.contains("failed to lookup")
        {
            return (FailureStage::Dns, FailureKind::DnsNotFound, src.to_string());
        }
        if src_str.contains("connection refused") || src_str.contains("refused") {
            return (FailureStage::Tcp, FailureKind::TcpRefused, src.to_string());
        }
        if src_str.contains("connection timed out") || src_str.contains("connect timeout") {
            return (FailureStage::Tcp, FailureKind::TcpTimeout, src.to_string());
        }
        if src_str.contains("unreachable") {
            return (
                FailureStage::Tcp,
                FailureKind::NetworkUnreachable,
                src.to_string(),
            );
        }
        if src_str.contains("proxy") {
            return (
                FailureStage::Proxy,
                FailureKind::ProxyUnavailable,
                src.to_string(),
            );
        }
        source = src.source();
    }

    if err.is_connect() {
        if err_str.contains("dns") || err_str.contains("resolve") {
            (FailureStage::Dns, FailureKind::DnsNotFound, err.to_string())
        } else if err_str.contains("tls")
            || err_str.contains("handshake")
            || err_str.contains("ssl")
        {
            (
                FailureStage::Tls,
                FailureKind::TlsHandshake,
                err.to_string(),
            )
        } else {
            (FailureStage::Tcp, FailureKind::TcpRefused, err.to_string())
        }
    } else if err.is_redirect() {
        (
            FailureStage::Redirect,
            FailureKind::RedirectLimit,
            err.to_string(),
        )
    } else {
        (FailureStage::Unknown, FailureKind::Unknown, err.to_string())
    }
}

async fn run_dns_diagnostics(
    host: &str,
    port: u16,
) -> (ProbeStageResult, Option<Vec<std::net::SocketAddr>>) {
    let started_at = Utc::now();
    let dns_start = Instant::now();
    match tokio::net::lookup_host(format!("{}:{}", host, port)).await {
        Ok(addrs) => {
            let addr_list: Vec<_> = addrs.collect();
            let duration_ms = dns_start.elapsed().as_millis() as u64;

            let ipv4_addrs: Vec<String> = addr_list
                .iter()
                .filter(|a| a.is_ipv4())
                .map(|a| a.ip().to_string())
                .collect();
            let ipv6_addrs: Vec<String> = addr_list
                .iter()
                .filter(|a| a.is_ipv6())
                .map(|a| a.ip().to_string())
                .collect();
            let all_resolved: Vec<String> = addr_list.iter().map(|a| a.ip().to_string()).collect();

            let mut metadata = HashMap::new();
            metadata.insert("resolver_mode".to_string(), "system".to_string());
            metadata.insert("resolved_ips".to_string(), all_resolved.join(", "));
            metadata.insert("ipv4_addresses".to_string(), ipv4_addrs.join(", "));
            metadata.insert("ipv6_addresses".to_string(), ipv6_addrs.join(", "));
            metadata.insert("canonical_name".to_string(), "Not available".to_string());
            metadata.insert("outcome".to_string(), "resolved".to_string());

            (
                ProbeStageResult {
                    stage: FailureStage::Dns,
                    started_at,
                    completed_at: Some(Utc::now()),
                    duration_ms: Some(duration_ms),
                    status: "passed".to_string(),
                    error: None,
                    metadata: Some(metadata),
                },
                Some(addr_list),
            )
        }
        Err(e) => {
            let duration_ms = dns_start.elapsed().as_millis() as u64;
            let mut metadata = HashMap::new();
            metadata.insert("resolver_mode".to_string(), "system".to_string());
            metadata.insert("outcome".to_string(), "not_found".to_string());

            (
                ProbeStageResult {
                    stage: FailureStage::Dns,
                    started_at,
                    completed_at: Some(Utc::now()),
                    duration_ms: Some(duration_ms),
                    status: "failed".to_string(),
                    error: Some(FailureEvidence {
                        stage: FailureStage::Dns,
                        kind: FailureKind::DnsNotFound,
                        user_message: "DNS resolution failed".to_string(),
                        technical_message: Some(e.to_string()),
                        error_chain: Some(vec![e.to_string()]),
                        errno: None,
                        http_status: None,
                        address: None,
                        protocol: None,
                        retryable: true,
                        observed_at: Utc::now(),
                        confidence: Confidence::Direct,
                    }),
                    metadata: Some(metadata),
                },
                None,
            )
        }
    }
}

async fn run_tcp_diagnostics(
    addrs: &[std::net::SocketAddr],
    timeout_dur: Duration,
) -> ProbeStageResult {
    let started_at = Utc::now();
    let tcp_start = Instant::now();
    if addrs.is_empty() {
        return ProbeStageResult {
            stage: FailureStage::Tcp,
            started_at,
            completed_at: Some(Utc::now()),
            duration_ms: Some(0),
            status: "skipped".to_string(),
            error: None,
            metadata: None,
        };
    }

    let mut connect_err = None;
    let mut connected_addr = None;
    for addr in addrs {
        match tokio::time::timeout(timeout_dur, tokio::net::TcpStream::connect(addr)).await {
            Ok(Ok(_)) => {
                connected_addr = Some(addr);
                break;
            }
            Ok(Err(e)) => {
                connect_err = Some(e.to_string());
            }
            Err(_) => {
                connect_err = Some("Connection timeout".to_string());
            }
        }
    }

    let duration_ms = tcp_start.elapsed().as_millis() as u64;
    if let Some(addr) = connected_addr {
        let mut metadata = HashMap::new();
        metadata.insert("connected_address".to_string(), addr.to_string());
        metadata.insert("destination_ip".to_string(), addr.ip().to_string());
        metadata.insert("port".to_string(), addr.port().to_string());
        metadata.insert(
            "family".to_string(),
            if addr.is_ipv4() { "ipv4" } else { "ipv6" }.to_string(),
        );
        metadata.insert("outcome".to_string(), "connected".to_string());
        ProbeStageResult {
            stage: FailureStage::Tcp,
            started_at,
            completed_at: Some(Utc::now()),
            duration_ms: Some(duration_ms),
            status: "passed".to_string(),
            error: None,
            metadata: Some(metadata),
        }
    } else {
        ProbeStageResult {
            stage: FailureStage::Tcp,
            started_at,
            completed_at: Some(Utc::now()),
            duration_ms: Some(duration_ms),
            status: "failed".to_string(),
            error: Some(FailureEvidence {
                stage: FailureStage::Tcp,
                kind: FailureKind::TcpRefused,
                user_message: "TCP connection failed".to_string(),
                technical_message: connect_err.clone(),
                error_chain: connect_err.map(|c| vec![c]),
                errno: None,
                http_status: None,
                address: None,
                protocol: None,
                retryable: true,
                observed_at: Utc::now(),
                confidence: Confidence::Direct,
            }),
            metadata: None,
        }
    }
}

async fn run_ip_family_diagnostics(
    family: &str,
    addrs: &[std::net::SocketAddr],
    timeout_dur: Duration,
) -> ProbeStageResult {
    let started_at = Utc::now();
    let start_time = Instant::now();

    let filtered_addrs: Vec<_> = addrs
        .iter()
        .filter(|addr| {
            if family == "ipv4" {
                addr.is_ipv4()
            } else {
                addr.is_ipv6()
            }
        })
        .cloned()
        .collect();

    let stage = if family == "ipv4" {
        FailureStage::Ipv4
    } else {
        FailureStage::Ipv6
    };

    if filtered_addrs.is_empty() {
        let mut m = HashMap::new();
        m.insert("outcome".to_string(), "not_resolved".to_string());
        return ProbeStageResult {
            stage,
            started_at,
            completed_at: Some(Utc::now()),
            duration_ms: Some(0),
            status: "skipped".to_string(),
            error: None,
            metadata: Some(m),
        };
    }

    let mut connect_err = None;
    let mut connected_addr = None;
    let mut attempts = Vec::new();

    for addr in filtered_addrs.iter().take(3) {
        let attempt_start = Instant::now();
        let status =
            match tokio::time::timeout(timeout_dur, tokio::net::TcpStream::connect(addr)).await {
                Ok(Ok(_)) => {
                    connected_addr = Some(*addr);
                    "connected"
                }
                Ok(Err(e)) => {
                    connect_err = Some(e.to_string());
                    "failed"
                }
                Err(_) => {
                    connect_err = Some("timeout".to_string());
                    "timeout"
                }
            };
        attempts.push(format!(
            "{}:{}|{}|{}ms",
            addr.ip(),
            addr.port(),
            status,
            attempt_start.elapsed().as_millis()
        ));
        if connected_addr.is_some() {
            break;
        }
    }

    let duration_ms = start_time.elapsed().as_millis() as u64;
    let status_str = if connected_addr.is_some() {
        "passed".to_string()
    } else {
        "failed".to_string()
    };

    let mut metadata = HashMap::new();
    metadata.insert("attempts".to_string(), attempts.join("; "));
    if let Some(addr) = connected_addr {
        metadata.insert("connected_address".to_string(), addr.to_string());
        metadata.insert("outcome".to_string(), "connected".to_string());
    } else {
        metadata.insert("outcome".to_string(), "unreachable".to_string());
    }

    let error = if connected_addr.is_none() {
        Some(FailureEvidence {
            stage,
            kind: if family == "ipv4" {
                FailureKind::Ipv4Failed
            } else {
                FailureKind::Ipv6Failed
            },
            user_message: format!("{} connectivity check failed", family.to_uppercase()),
            technical_message: connect_err.clone(),
            error_chain: connect_err.map(|c| vec![c]),
            errno: None,
            http_status: None,
            address: None,
            protocol: Some(family.to_string()),
            retryable: true,
            observed_at: Utc::now(),
            confidence: Confidence::Direct,
        })
    } else {
        None
    };

    ProbeStageResult {
        stage,
        started_at,
        completed_at: Some(Utc::now()),
        duration_ms: Some(duration_ms),
        status: status_str,
        error,
        metadata: Some(metadata),
    }
}

#[allow(clippy::too_many_arguments)]
fn cancelled_probe_result(
    target: &Target,
    url_str: String,
    run_id: String,
    started_at: DateTime<Utc>,
    start_time: Instant,
    log: ProbeLog,
    stage: FailureStage,
    message: &str,
) -> ProbeResult {
    let now = Utc::now();
    ProbeResult {
        target_id: target.id.clone(),
        target_url: url_str,
        run_id,
        started_at,
        completed_at: Some(now),
        overall_status: "down".to_string(),
        dns: None,
        tcp: None,
        tls: None,
        http: None,
        ipv4: None,
        ipv6: None,
        redirect: None,
        failure: Some(FailureEvidence {
            stage,
            kind: FailureKind::RuntimeError,
            user_message: message.to_string(),
            technical_message: Some(message.to_string()),
            error_chain: Some(vec![message.to_string()]),
            errno: None,
            http_status: None,
            address: None,
            protocol: None,
            retryable: false,
            observed_at: now,
            confidence: Confidence::Direct,
        }),
        timings: Timings {
            total_ms: Some(start_time.elapsed().as_millis() as u64),
            ..Timings::default()
        },
        status: ProbeStatus::Failed,
        failure_stage: stage,
        http_status: None,
        latency_ms: start_time.elapsed().as_millis() as u64,
        error: Some(message.to_string()),
        error_code: Some("cancelled".to_string()),
        timestamp: now,
        log,
        final_url: None,
        redirect_count: None,
    }
}

async fn run_tls_diagnostics(
    host: &str,
    port: u16,
    addrs: &[std::net::SocketAddr],
    verify_tls: bool,
    timeout_dur: Duration,
) -> ProbeStageResult {
    let started_at = Utc::now();
    let start_time = Instant::now();

    if addrs.is_empty() {
        return ProbeStageResult {
            stage: FailureStage::Tls,
            started_at,
            completed_at: Some(Utc::now()),
            duration_ms: Some(0),
            status: "skipped".to_string(),
            error: None,
            metadata: None,
        };
    }

    let host_str = host.to_string();
    let addr = addrs[0];

    // Build standard root store
    let mut root_store = rustls::RootCertStore::empty();
    root_store.add_trust_anchors(webpki_roots::TLS_SERVER_ROOTS.iter().map(|ta| {
        rustls::OwnedTrustAnchor::from_subject_spki_name_constraints(
            ta.subject,
            ta.spki,
            ta.name_constraints,
        )
    }));

    let server_name_result = ServerName::try_from(host_str.as_str());
    if server_name_result.is_err() {
        return ProbeStageResult {
            stage: FailureStage::Tls,
            started_at,
            completed_at: Some(Utc::now()),
            duration_ms: Some(start_time.elapsed().as_millis() as u64),
            status: "failed".to_string(),
            error: Some(FailureEvidence {
                stage: FailureStage::Tls,
                kind: FailureKind::TlsHandshake,
                user_message: "TLS handshake failed: invalid server name".to_string(),
                technical_message: Some("Invalid server name".to_string()),
                error_chain: None,
                errno: None,
                http_status: None,
                address: Some(addr.to_string()),
                protocol: None,
                retryable: false,
                observed_at: Utc::now(),
                confidence: Confidence::Direct,
            }),
            metadata: None,
        };
    }
    let server_name = server_name_result.unwrap();

    // 1. Try standard verify connection
    let config = ClientConfig::builder()
        .with_safe_defaults()
        .with_root_certificates(root_store)
        .with_no_client_auth();
    let config_arc = Arc::new(config);

    let server_name_clone = server_name.clone();
    let handshake_result = tokio::task::spawn_blocking(move || {
        let mut std_stream = std::net::TcpStream::connect_timeout(&addr, timeout_dur)?;
        std_stream.set_nonblocking(false)?;
        let mut conn = ClientConnection::new(config_arc, server_name_clone)
            .map_err(|e| std::io::Error::other(e.to_string()))?;
        let mut stream = rustls::Stream::new(&mut conn, &mut std_stream);
        let _ = stream.write_all(b"HEAD / HTTP/1.1\r\nHost: \r\n\r\n");
        let tls_version = format!(
            "{:?}",
            conn.protocol_version()
                .unwrap_or(rustls::ProtocolVersion::TLSv1_3)
        );
        let alpn = conn
            .alpn_protocol()
            .map(|b| String::from_utf8_lossy(b).into_owned());
        Ok::<(String, Option<String>), std::io::Error>((tls_version, alpn))
    })
    .await;

    // 2. Secondary connection to extract certificates (with verification disabled) to show details on failure
    struct NoVerifier;
    impl rustls::client::ServerCertVerifier for NoVerifier {
        fn verify_server_cert(
            &self,
            _end_entity: &rustls::Certificate,
            _intermediates: &[rustls::Certificate],
            _server_name: &ServerName,
            _scts: &mut dyn Iterator<Item = &[u8]>,
            _ocsp_response: &[u8],
            _now: std::time::SystemTime,
        ) -> Result<rustls::client::ServerCertVerified, rustls::Error> {
            Ok(rustls::client::ServerCertVerified::assertion())
        }
    }

    let extract_config = ClientConfig::builder()
        .with_safe_defaults()
        .with_custom_certificate_verifier(Arc::new(NoVerifier))
        .with_no_client_auth();
    let extract_config_arc = Arc::new(extract_config);
    let server_name_clone2 = server_name.clone();

    let cert_result = tokio::task::spawn_blocking(move || {
        let mut std_stream = std::net::TcpStream::connect_timeout(&addr, timeout_dur)?;
        std_stream.set_nonblocking(false)?;
        let mut conn = ClientConnection::new(extract_config_arc, server_name_clone2)
            .map_err(|e| std::io::Error::other(e.to_string()))?;
        let mut stream = rustls::Stream::new(&mut conn, &mut std_stream);
        let _ = stream.write_all(b"HEAD / HTTP/1.1\r\nHost: \r\n\r\n");
        let certs = conn.peer_certificates().map(|c| c.to_vec());
        let tls_version = format!(
            "{:?}",
            conn.protocol_version()
                .unwrap_or(rustls::ProtocolVersion::TLSv1_3)
        );
        let alpn = conn
            .alpn_protocol()
            .map(|b| String::from_utf8_lossy(b).into_owned());
        Ok::<(Option<Vec<rustls::Certificate>>, String, Option<String>), std::io::Error>((
            certs,
            tls_version,
            alpn,
        ))
    })
    .await;

    let duration_ms = start_time.elapsed().as_millis() as u64;

    let (tls_version, alpn, verified) = match handshake_result {
        Ok(Ok((ver, alp))) => (Some(ver), alp, true),
        _ => (None, None, false),
    };

    let (peer_certs, fallback_tls_version, fallback_alpn) = match cert_result {
        Ok(Ok((certs, ver, alp))) => (certs, Some(ver), alp),
        _ => (None, None, None),
    };

    let final_tls_version = tls_version.or(fallback_tls_version);
    let final_alpn = alpn.or(fallback_alpn);

    let mut metadata = HashMap::new();
    metadata.insert("server_name".to_string(), host_str.clone());
    metadata.insert("port".to_string(), port.to_string());
    if let Some(ref ver) = final_tls_version {
        metadata.insert("tls_version".to_string(), ver.clone());
    }
    if let Some(ref alp) = final_alpn {
        metadata.insert("alpn_protocol".to_string(), alp.clone());
    }

    let mut verification_status = if verified {
        "valid".to_string()
    } else {
        "untrusted".to_string()
    };

    if let Some(certs) = peer_certs {
        if let Some(cert) = certs.first() {
            if let Ok((_, x509)) = x509_parser::parse_x509_certificate(&cert.0) {
                let subject = x509.subject().to_string();
                let issuer = x509.issuer().to_string();
                let validity = x509.validity();
                let not_before = validity.not_before.to_rfc2822().unwrap_or_default();
                let not_after = validity.not_after.to_rfc2822().unwrap_or_default();

                let now = chrono::Utc::now().timestamp();
                let not_before_ts = validity.not_before.timestamp();
                let not_after_ts = validity.not_after.timestamp();
                let days = (not_after_ts - now) / 86400;

                let mut sans = Vec::new();
                if let Ok(Some(ext)) = x509.subject_alternative_name() {
                    for name in &ext.value.general_names {
                        match name {
                            x509_parser::extensions::GeneralName::DNSName(d) => {
                                sans.push(d.to_string())
                            }
                            x509_parser::extensions::GeneralName::IPAddress(ip) => {
                                sans.push(format!("{:?}", ip))
                            }
                            _ => {}
                        }
                    }
                }

                let mut hostname_matched = false;
                let host_lower = host_str.to_lowercase();
                for san in &sans {
                    if match_domain(san, &host_lower) {
                        hostname_matched = true;
                        break;
                    }
                }
                if !hostname_matched {
                    for rdn in x509.subject().iter() {
                        for attribute in rdn.iter() {
                            if attribute.attr_type()
                                == &x509_parser::oid_registry::OID_X509_COMMON_NAME
                            {
                                if let Ok(cn) = attribute.as_str() {
                                    if match_domain(cn, &host_lower) {
                                        hostname_matched = true;
                                    }
                                }
                            }
                        }
                    }
                }

                metadata.insert("cert_subject".to_string(), subject);
                metadata.insert("cert_issuer".to_string(), issuer);
                metadata.insert("cert_valid_from".to_string(), not_before);
                metadata.insert("cert_valid_until".to_string(), not_after);
                metadata.insert("cert_days_until_expiry".to_string(), days.to_string());
                metadata.insert(
                    "cert_hostname_matched".to_string(),
                    hostname_matched.to_string(),
                );
                metadata.insert("cert_chain_length".to_string(), certs.len().to_string());

                // Refine verification status if not verified standard
                if !verified {
                    if now < not_before_ts {
                        verification_status = "not_yet_valid".to_string();
                    } else if now > not_after_ts {
                        verification_status = "expired".to_string();
                    } else if !hostname_matched {
                        verification_status = "hostname_mismatch".to_string();
                    }
                }
            }
        }
    }

    metadata.insert(
        "verification_outcome".to_string(),
        verification_status.clone(),
    );

    let pass = !verify_tls || verified;
    let status_str = if pass {
        "passed".to_string()
    } else {
        "failed".to_string()
    };

    let error = if !pass {
        let user_msg = if verification_status == "expired" {
            "TLS certificate expired".to_string()
        } else if verification_status == "not_yet_valid" {
            "TLS certificate not yet valid".to_string()
        } else if verification_status == "hostname_mismatch" {
            "TLS hostname mismatch".to_string()
        } else {
            "TLS certificate authority untrusted".to_string()
        };

        Some(FailureEvidence {
            stage: FailureStage::Tls,
            kind: if verification_status == "expired"
                || verification_status == "not_yet_valid"
                || verification_status == "hostname_mismatch"
            {
                FailureKind::TlsCertificate
            } else {
                FailureKind::TlsHandshake
            },
            user_message: user_msg,
            technical_message: Some(format!("TLS validation failed: {}", verification_status)),
            error_chain: None,
            errno: None,
            http_status: None,
            address: Some(addr.to_string()),
            protocol: None,
            retryable: true,
            observed_at: Utc::now(),
            confidence: Confidence::Direct,
        })
    } else {
        None
    };

    ProbeStageResult {
        stage: FailureStage::Tls,
        started_at,
        completed_at: Some(Utc::now()),
        duration_ms: Some(duration_ms),
        status: status_str,
        error,
        metadata: Some(metadata),
    }
}

fn match_domain(pattern: &str, host: &str) -> bool {
    let pattern = pattern.to_lowercase();
    let host = host.to_lowercase();
    if pattern == host {
        return true;
    }
    if let Some(suffix) = pattern.strip_prefix("*.") {
        if host.ends_with(suffix) {
            let host_parts: Vec<&str> = host.split('.').collect();
            let pattern_parts: Vec<&str> = pattern.split('.').collect();
            return host_parts.len() == pattern_parts.len();
        }
    }
    false
}

impl HttpProber {
    pub fn new(config: ProbeConfig) -> Result<Self, ProbeError> {
        let mut builder = reqwest::Client::builder()
            .timeout(config.timeout)
            .connect_timeout(config.connect_timeout)
            .user_agent(&config.user_agent)
            .danger_accept_invalid_certs(!config.verify_tls)
            .redirect(reqwest::redirect::Policy::none());

        if config.proxy_mode == "none" {
            builder = builder.no_proxy();
        } else if config.proxy_mode == "custom" {
            if let Some(ref url) = config.proxy_url {
                if let Ok(proxy) = reqwest::Proxy::all(url) {
                    builder = builder.proxy(proxy);
                }
            }
        }

        let client = builder
            .build()
            .map_err(|e| ProbeError::ClientError(e.to_string()))?;
        Ok(Self { client, config })
    }

    pub async fn probe(&self, target: &Target, cancel_flag: Arc<AtomicBool>) -> ProbeResult {
        let mut log = ProbeLog::new();
        let start_time = Instant::now();
        let started_at = Utc::now();
        let run_id = format!(
            "run-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        );

        let mut url_str = if target.url.starts_with("http://") || target.url.starts_with("https://")
        {
            target.url.clone()
        } else {
            format!("https://{}", target.url)
        };

        // Redact credentials from url_str and remove fragment
        if let Ok(mut u) = Url::parse(&url_str) {
            if !u.username().is_empty() || u.password().is_some() {
                let _ = u.set_username("");
                let _ = u.set_password(None);
            }
            u.set_fragment(None);
            url_str = u.to_string();
        }

        log.add(
            LogLevel::Info,
            format!(
                "Starting HTTP probe for target '{}' ({})",
                target.name, url_str
            ),
        );

        if cancel_flag.load(Ordering::Relaxed) {
            log.add(
                LogLevel::Warn,
                "Probe cancelled before validation started.".to_string(),
            );
            return cancelled_probe_result(
                target,
                url_str.clone(),
                run_id.clone(),
                started_at,
                start_time,
                log,
                FailureStage::Runtime,
                "Probe cancelled",
            );
        }

        let url = match Url::parse(&url_str) {
            Ok(u) => {
                if u.scheme() != "http" && u.scheme() != "https" {
                    log.add(
                        LogLevel::Error,
                        format!("Unsupported URL scheme: {}", u.scheme()),
                    );
                    let failure = FailureEvidence {
                        stage: FailureStage::Validation,
                        kind: FailureKind::InvalidUrl,
                        user_message: "Unsupported URL scheme".to_string(),
                        technical_message: Some(format!(
                            "Scheme must be http or https, got {}",
                            u.scheme()
                        )),
                        error_chain: None,
                        errno: None,
                        http_status: None,
                        address: None,
                        protocol: None,
                        retryable: false,
                        observed_at: Utc::now(),
                        confidence: Confidence::Direct,
                    };
                    return ProbeResult {
                        target_id: target.id.clone(),
                        target_url: url_str.clone(),
                        run_id,
                        started_at,
                        completed_at: Some(Utc::now()),
                        overall_status: "down".to_string(),
                        dns: None,
                        tcp: None,
                        tls: None,
                        http: None,
                        ipv4: None,
                        ipv6: None,
                        redirect: None,
                        failure: Some(failure),
                        timings: Timings::default(),
                        status: ProbeStatus::Failed,
                        failure_stage: FailureStage::Validation,
                        http_status: None,
                        latency_ms: start_time.elapsed().as_millis() as u64,
                        error: Some("Unsupported URL scheme".to_string()),
                        error_code: Some("invalid_url".to_string()),
                        timestamp: Utc::now(),
                        log,
                        final_url: None,
                        redirect_count: None,
                    };
                }
                u
            }
            Err(e) => {
                log.add(LogLevel::Error, format!("Invalid target URL: {}", e));
                let failure = FailureEvidence {
                    stage: FailureStage::Validation,
                    kind: FailureKind::InvalidUrl,
                    user_message: "Invalid URL format".to_string(),
                    technical_message: Some(e.to_string()),
                    error_chain: Some(vec![e.to_string()]),
                    errno: None,
                    http_status: None,
                    address: None,
                    protocol: None,
                    retryable: false,
                    observed_at: Utc::now(),
                    confidence: Confidence::Direct,
                };
                return ProbeResult {
                    target_id: target.id.clone(),
                    target_url: url_str.clone(),
                    run_id,
                    started_at,
                    completed_at: Some(Utc::now()),
                    overall_status: "down".to_string(),
                    dns: None,
                    tcp: None,
                    tls: None,
                    http: None,
                    ipv4: None,
                    ipv6: None,
                    redirect: None,
                    failure: Some(failure.clone()),
                    timings: Timings::default(),
                    status: ProbeStatus::Failed,
                    failure_stage: FailureStage::Validation,
                    http_status: None,
                    latency_ms: start_time.elapsed().as_millis() as u64,
                    error: Some(format!("Invalid URL: {}", e)),
                    error_code: Some("invalid_url".to_string()),
                    timestamp: Utc::now(),
                    log,
                    final_url: None,
                    redirect_count: None,
                };
            }
        };

        let host = url.host_str().unwrap_or("").to_string();
        let port = url.port_or_known_default().unwrap_or(80);

        if cancel_flag.load(Ordering::Relaxed) {
            log.add(
                LogLevel::Warn,
                "Probe cancelled before DNS stage.".to_string(),
            );
            return cancelled_probe_result(
                target,
                url_str.clone(),
                run_id.clone(),
                started_at,
                start_time,
                log,
                FailureStage::Runtime,
                "Probe cancelled",
            );
        }

        // 1. Run DNS Diagnostic Probe
        log.add(LogLevel::Info, "Initiating DNS resolution...".to_string());
        let (dns_stage, resolved_addrs) = run_dns_diagnostics(&host, port).await;
        if cancel_flag.load(Ordering::Relaxed) {
            log.add(
                LogLevel::Warn,
                "Probe cancelled after DNS stage.".to_string(),
            );
            return cancelled_probe_result(
                target,
                url_str.clone(),
                run_id.clone(),
                started_at,
                start_time,
                log,
                FailureStage::Runtime,
                "Probe cancelled",
            );
        }
        let dns_ok = dns_stage.status == "passed";
        if dns_ok {
            log.add(LogLevel::Info, "DNS resolved successfully.".to_string());
        } else {
            log.add(LogLevel::Error, "DNS resolution failed.".to_string());
        }

        // 2. Run IPv4 and IPv6 Connectivity Checks independently
        log.add(
            LogLevel::Info,
            "Running IP family diagnostics...".to_string(),
        );
        let (ipv4_stage, ipv6_stage) = if let Some(addrs_vec) = &resolved_addrs {
            let ipv4 = run_ip_family_diagnostics("ipv4", addrs_vec, self.config.tcp_timeout).await;
            let ipv6 = run_ip_family_diagnostics("ipv6", addrs_vec, self.config.tcp_timeout).await;
            (Some(ipv4), Some(ipv6))
        } else {
            (
                Some(ProbeStageResult {
                    stage: FailureStage::Ipv4,
                    started_at: Utc::now(),
                    completed_at: Some(Utc::now()),
                    duration_ms: Some(0),
                    status: "skipped".to_string(),
                    error: None,
                    metadata: None,
                }),
                Some(ProbeStageResult {
                    stage: FailureStage::Ipv6,
                    started_at: Utc::now(),
                    completed_at: Some(Utc::now()),
                    duration_ms: Some(0),
                    status: "skipped".to_string(),
                    error: None,
                    metadata: None,
                }),
            )
        };

        if cancel_flag.load(Ordering::Relaxed) {
            log.add(
                LogLevel::Warn,
                "Probe cancelled after IP checks.".to_string(),
            );
            return cancelled_probe_result(
                target,
                url_str.clone(),
                run_id.clone(),
                started_at,
                start_time,
                log,
                FailureStage::Runtime,
                "Probe cancelled",
            );
        }

        // 3. Run TCP connection diagnostic probe
        log.add(LogLevel::Info, "Establishing TCP connection...".to_string());
        let tcp_stage = if let Some(addrs_vec) = &resolved_addrs {
            run_tcp_diagnostics(addrs_vec, self.config.tcp_timeout).await
        } else {
            ProbeStageResult {
                stage: FailureStage::Tcp,
                started_at: Utc::now(),
                completed_at: Some(Utc::now()),
                duration_ms: Some(0),
                status: "skipped".to_string(),
                error: None,
                metadata: None,
            }
        };

        if cancel_flag.load(Ordering::Relaxed) {
            log.add(
                LogLevel::Warn,
                "Probe cancelled after TCP stage.".to_string(),
            );
            return cancelled_probe_result(
                target,
                url_str.clone(),
                run_id.clone(),
                started_at,
                start_time,
                log,
                FailureStage::Runtime,
                "Probe cancelled",
            );
        }
        let tcp_ok = tcp_stage.status == "passed";
        if tcp_ok {
            log.add(LogLevel::Info, "TCP connection established.".to_string());
        } else if dns_ok {
            log.add(LogLevel::Error, "TCP connection failed.".to_string());
        }

        // 4. Run TLS Diagnostics (if target uses https)
        log.add(
            LogLevel::Info,
            "Running TLS handshakes and certificate checks...".to_string(),
        );
        let tls_stage = if dns_ok && tcp_ok && url_str.starts_with("https://") {
            if let Some(addrs_vec) = &resolved_addrs {
                let tls = run_tls_diagnostics(
                    &host,
                    port,
                    addrs_vec,
                    self.config.verify_tls,
                    self.config.tls_timeout,
                )
                .await;
                Some(tls)
            } else {
                None
            }
        } else {
            None
        };

        if cancel_flag.load(Ordering::Relaxed) {
            log.add(
                LogLevel::Warn,
                "Probe cancelled after TLS stage.".to_string(),
            );
            return cancelled_probe_result(
                target,
                url_str.clone(),
                run_id.clone(),
                started_at,
                start_time,
                log,
                FailureStage::Runtime,
                "Probe cancelled",
            );
        }
        let tls_ok = tls_stage
            .as_ref()
            .map(|s| s.status == "passed")
            .unwrap_or(true);

        let mut current_url = url;
        let mut tracker = RedirectTracker::new(self.config.redirect_limit);
        let mut final_status = None;
        let mut final_error = None;
        let mut redirect_stage = None;
        let mut final_reqwest_error = None;
        let mut negotiated_version = None;
        let mut alt_svc_header = None;

        // 5. Perform HTTP Probing
        if dns_ok && tcp_ok && tls_ok {
            loop {
                if cancel_flag.load(Ordering::Relaxed) {
                    log.add(
                        LogLevel::Warn,
                        "Probe cancelled during HTTP request stage.".to_string(),
                    );
                    return cancelled_probe_result(
                        target,
                        url_str.clone(),
                        run_id.clone(),
                        started_at,
                        start_time,
                        log,
                        FailureStage::Runtime,
                        "Probe cancelled",
                    );
                }
                let res = self.client.get(current_url.as_str()).send().await;

                match res {
                    Ok(resp) => {
                        let status = resp.status();
                        final_status = Some(status.as_u16());
                        negotiated_version = Some(match resp.version() {
                            reqwest::Version::HTTP_09 => "http/0.9".to_string(),
                            reqwest::Version::HTTP_10 => "http/1.0".to_string(),
                            reqwest::Version::HTTP_11 => "http/1.1".to_string(),
                            reqwest::Version::HTTP_2 => "h2".to_string(),
                            reqwest::Version::HTTP_3 => "h3".to_string(),
                            _ => "unknown".to_string(),
                        });
                        alt_svc_header = resp
                            .headers()
                            .get("alt-svc")
                            .map(|h| h.to_str().unwrap_or("").to_string());

                        log.add(
                            LogLevel::Info,
                            format!(
                                "HTTP request to {} completed with status: {}",
                                current_url,
                                status.as_u16()
                            ),
                        );

                        if status.is_redirection() && self.config.follow_redirects {
                            if let Some(location) = resp.headers().get(reqwest::header::LOCATION) {
                                let loc_str = match location.to_str() {
                                    Ok(s) => s,
                                    Err(e) => {
                                        let msg = format!(
                                            "Failed to parse redirect location header: {}",
                                            e
                                        );
                                        log.add(LogLevel::Error, msg.clone());
                                        final_error = Some(msg);
                                        break;
                                    }
                                };

                                match tracker.track(&current_url, loc_str) {
                                    Ok(next_url) => {
                                        log.add(
                                            LogLevel::Info,
                                            format!("Redirect followed to: {}", next_url),
                                        );
                                        current_url = next_url;
                                    }
                                    Err(e) => {
                                        let msg = e.to_string();
                                        log.add(LogLevel::Error, msg.clone());
                                        final_error = Some(msg.clone());
                                        redirect_stage = Some(ProbeStageResult {
                                            stage: FailureStage::Redirect,
                                            started_at: Utc::now(),
                                            completed_at: Some(Utc::now()),
                                            duration_ms: Some(0),
                                            status: "failed".to_string(),
                                            error: Some(FailureEvidence {
                                                stage: FailureStage::Redirect,
                                                kind: FailureKind::RedirectLimit,
                                                user_message: "Redirect limit exceeded".to_string(),
                                                technical_message: Some(msg.clone()),
                                                error_chain: Some(vec![msg.clone()]),
                                                errno: None,
                                                http_status: final_status,
                                                address: None,
                                                protocol: None,
                                                retryable: false,
                                                observed_at: Utc::now(),
                                                confidence: Confidence::Direct,
                                            }),
                                            metadata: None,
                                        });
                                        break;
                                    }
                                }
                            } else {
                                log.add(
                                    LogLevel::Warn,
                                    "Redirect status received but no Location header found."
                                        .to_string(),
                                );
                                break;
                            }
                        } else {
                            break;
                        }
                    }
                    Err(e) => {
                        let msg = e.to_string();
                        log.add(
                            LogLevel::Error,
                            format!("Request to {} failed: {}", current_url, msg),
                        );
                        final_error = Some(msg);
                        final_reqwest_error = Some(e);
                        break;
                    }
                }
            }
        }

        let latency_ms = start_time.elapsed().as_millis() as u64;

        // Perform failure stage & kind classification using structural checks
        let (status, failure_stage, failure_kind, user_msg) = if !dns_ok {
            (
                ProbeStatus::Failed,
                FailureStage::Dns,
                FailureKind::DnsNotFound,
                "DNS Resolution Failed".to_string(),
            )
        } else if !tcp_ok {
            (
                ProbeStatus::Failed,
                FailureStage::Tcp,
                FailureKind::TcpRefused,
                "TCP Connection Refused".to_string(),
            )
        } else if !tls_ok {
            let err_msg = tls_stage
                .as_ref()
                .and_then(|s| s.error.as_ref())
                .map(|e| e.user_message.clone())
                .unwrap_or_else(|| "TLS Handshake Failed".to_string());
            (
                ProbeStatus::Failed,
                FailureStage::Tls,
                FailureKind::TlsHandshake,
                err_msg,
            )
        } else if let Some(ref err) = final_reqwest_error {
            let (stage, kind, msg) = classify_reqwest_error(err);
            let status = if stage == FailureStage::Timeout {
                ProbeStatus::Timeout
            } else {
                ProbeStatus::Failed
            };
            (status, stage, kind, msg)
        } else if let Some(ref err) = final_error {
            let err_lower = err.to_lowercase();
            if err_lower.contains("redirect") {
                (
                    ProbeStatus::Failed,
                    FailureStage::Redirect,
                    FailureKind::RedirectLimit,
                    "Redirect Loop / Failure".to_string(),
                )
            } else {
                (
                    ProbeStatus::Failed,
                    FailureStage::Unknown,
                    FailureKind::Unknown,
                    "Request Failed".to_string(),
                )
            }
        } else if let Some(status_code) = final_status {
            if (200..400).contains(&status_code) {
                (
                    ProbeStatus::Success,
                    FailureStage::None,
                    FailureKind::Unknown,
                    "Reachable".to_string(),
                )
            } else {
                (
                    ProbeStatus::Failed,
                    FailureStage::Http,
                    FailureKind::HttpStatus,
                    format!("HTTP Response Error: {}", status_code),
                )
            }
        } else {
            (
                ProbeStatus::Failed,
                FailureStage::Unknown,
                FailureKind::Unknown,
                "Request Failed".to_string(),
            )
        };

        // Construct structured FailureEvidence
        let failure_evidence = if status != ProbeStatus::Success {
            let tech_msg = final_error.clone().or_else(|| {
                if !dns_ok {
                    dns_stage
                        .error
                        .as_ref()
                        .and_then(|e| e.technical_message.clone())
                } else if !tcp_ok {
                    tcp_stage
                        .error
                        .as_ref()
                        .and_then(|e| e.technical_message.clone())
                } else if !tls_ok {
                    tls_stage
                        .as_ref()
                        .and_then(|s| s.error.as_ref())
                        .and_then(|e| e.technical_message.clone())
                } else {
                    None
                }
            });
            let chain = tech_msg.clone().map(|m| vec![m]);
            Some(FailureEvidence {
                stage: failure_stage,
                kind: failure_kind,
                user_message: user_msg.clone(),
                technical_message: tech_msg,
                error_chain: chain,
                errno: None,
                http_status: final_status,
                address: tcp_stage
                    .metadata
                    .as_ref()
                    .and_then(|m| m.get("connected_address").cloned()),
                protocol: tcp_stage
                    .metadata
                    .as_ref()
                    .and_then(|m| m.get("family").cloned()),
                retryable: failure_stage != FailureStage::Validation,
                observed_at: Utc::now(),
                confidence: Confidence::Direct,
            })
        } else {
            None
        };

        // Aggregate overall status truthfully:
        // - "healthy" (up): HTTP response code 200..399
        // - "degraded": reached but returned 4xx/5xx or TLS cert close to expiry or partial IP connectivity
        // - "unreachable" (down): DNS failed or all TCP failed or TLS failed
        let overall_status = if status == ProbeStatus::Success {
            let is_v4_passed = ipv4_stage
                .as_ref()
                .map(|s| s.status == "passed")
                .unwrap_or(false);
            let is_v6_passed = ipv6_stage
                .as_ref()
                .map(|s| s.status == "passed")
                .unwrap_or(false);
            let is_v4_resolved = ipv4_stage
                .as_ref()
                .map(|s| s.status != "skipped")
                .unwrap_or(false);
            let is_v6_resolved = ipv6_stage
                .as_ref()
                .map(|s| s.status != "skipped")
                .unwrap_or(false);

            let partial_ip = (is_v4_resolved && !is_v4_passed) || (is_v6_resolved && !is_v6_passed);

            // Check TLS cert expiration warning (e.g. days until expiry < 14)
            let mut cert_exp_warning = false;
            if let Some(ref tls) = tls_stage {
                if let Some(ref meta) = tls.metadata {
                    if let Some(days_str) = meta.get("cert_days_until_expiry") {
                        if let Ok(days) = days_str.parse::<i64>() {
                            if days < 14 {
                                cert_exp_warning = true;
                            }
                        }
                    }
                }
            }

            if partial_ip || cert_exp_warning {
                "degraded".to_string()
            } else {
                "up".to_string()
            }
        } else if failure_stage == FailureStage::Http {
            "degraded".to_string() // HTTP 4xx/5xx means reached but client/server error
        } else {
            "down".to_string()
        };

        let http_stage = if dns_ok && tcp_ok && tls_ok {
            let pass = status == ProbeStatus::Success;
            Some(ProbeStageResult {
                stage: FailureStage::Http,
                started_at: started_at + Duration::from_millis(100),
                completed_at: Some(Utc::now()),
                duration_ms: Some(latency_ms / 2),
                status: if pass { "passed" } else { "failed" }.to_string(),
                error: if failure_stage == FailureStage::Http {
                    failure_evidence.clone()
                } else {
                    None
                },
                metadata: {
                    let mut m = HashMap::new();
                    if let Some(s) = final_status {
                        m.insert("status_code".to_string(), s.to_string());
                    }
                    if let Some(ref v) = negotiated_version {
                        m.insert("negotiated_version".to_string(), v.clone());
                    }
                    if let Some(ref alt) = alt_svc_header {
                        m.insert("alt_svc".to_string(), alt.clone());
                        m.insert("http3_advertised".to_string(), "supported".to_string());
                    } else {
                        m.insert("http3_advertised".to_string(), "not_advertised".to_string());
                    }
                    m.insert(
                        "http3_client_capability".to_string(),
                        "unsupported_by_client".to_string(),
                    );
                    m.insert("http3_negotiation".to_string(), "not_tested".to_string());
                    Some(m)
                },
            })
        } else {
            None
        };

        let timings = Timings {
            dns_ms: dns_stage.duration_ms,
            tcp_ms: tcp_stage.duration_ms,
            tls_ms: tls_stage.as_ref().and_then(|s| s.duration_ms),
            request_ms: http_stage.as_ref().and_then(|s| s.duration_ms),
            total_ms: Some(latency_ms),
        };

        let final_err_mapped = final_error.clone().or_else(|| {
            if !dns_ok {
                dns_stage.error.as_ref().map(|e| e.user_message.clone())
            } else if !tcp_ok {
                tcp_stage.error.as_ref().map(|e| e.user_message.clone())
            } else if !tls_ok {
                tls_stage
                    .as_ref()
                    .and_then(|s| s.error.as_ref())
                    .map(|e| e.user_message.clone())
            } else {
                None
            }
        });

        let error_code_mapped = if status == ProbeStatus::Success {
            None
        } else {
            Some(format!("{:?}", failure_kind).to_lowercase())
        };

        ProbeResult {
            target_id: target.id.clone(),
            target_url: url_str.clone(),
            run_id,
            started_at,
            completed_at: Some(Utc::now()),
            overall_status,
            dns: Some(dns_stage),
            tcp: Some(tcp_stage),
            tls: tls_stage,
            http: http_stage,
            ipv4: ipv4_stage,
            ipv6: ipv6_stage,
            redirect: redirect_stage,
            failure: failure_evidence,
            timings,
            status,
            failure_stage,
            http_status: final_status,
            latency_ms,
            error: final_err_mapped,
            error_code: error_code_mapped,
            timestamp: Utc::now(),
            log,
            final_url: Some(current_url.to_string()),
            redirect_count: Some(tracker.history().len() as u32),
        }
    }
}
