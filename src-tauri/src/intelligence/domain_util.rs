/// Simple domain extraction and normalization utilities.
/// Does NOT use a full Public Suffix List — uses hardcoded common TLDs with fallback.

/// Common registrable domain suffixes (2-part TLDs)
const TWO_PART_TLDS: &[&str] = &[
    "co.uk", "co.jp", "co.kr", "co.nz", "co.za", "co.in",
    "com.au", "com.br", "com.cn", "com.co", "com.mx", "com.sg", "com.tw",
    "org.uk", "net.au",
    "gov.uk", "gov.au", "gov.in",
    "ac.uk", "ac.jp",
    "or.jp", "ne.jp",
    "com.ar", "com.tr", "com.sa",
];

/// Extract hostname from a URL or plain hostname string.
pub fn extract_host(input: &str) -> String {
    let s = input.trim();
    // Strip scheme
    let s = s.strip_prefix("https://").or_else(|| s.strip_prefix("http://")).unwrap_or(s);
    // Strip path
    let s = s.split('/').next().unwrap_or(s);
    // Strip port
    let s = s.split(':').next().unwrap_or(s);
    s.to_lowercase()
}

/// Extract registrable domain from a hostname.
/// e.g. "api.github.com" → "github.com"
/// e.g. "storage.googleapis.com" → "googleapis.com"
/// e.g. "service.example.co.uk" → "example.co.uk"
/// e.g. "localhost" → "localhost"
/// e.g. "192.168.1.1" → "192.168.1.1"
pub fn registrable_domain(host: &str) -> String {
    let host = host.trim().to_lowercase();

    if host.is_empty() {
        return host;
    }

    // IP addresses — return as-is
    if is_ip_address(&host) {
        return host;
    }

    // localhost and single-label
    if !host.contains('.') {
        return host;
    }

    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() <= 2 {
        return host;
    }

    // Check for 2-part TLD (e.g. example.co.uk)
    if parts.len() >= 3 {
        let suffix_2part = format!("{}.{}", parts[parts.len() - 2], parts[parts.len() - 1]);
        if TWO_PART_TLDS.contains(&suffix_2part.as_str()) {
            if parts.len() >= 4 {
                return format!("{}.{}", parts[parts.len() - 3], suffix_2part);
            }
            return suffix_2part;
        }
    }

    // Default: last 2 parts
    format!("{}.{}", parts[parts.len() - 2], parts[parts.len() - 1])
}

/// Check if a string looks like an IP address (v4 or v6)
pub fn is_ip_address(host: &str) -> bool {
    // Simple IPv4 check
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() == 4 {
        return parts.iter().all(|p| p.parse::<u8>().is_ok());
    }
    // Simple IPv6 check (contains colons)
    if host.contains(':') && !host.contains('/') {
        return true;
    }
    false
}

/// Classify failure category from operation_type and error details
pub fn classify_failure_category(operation_type: &str, failure_code: Option<&str>) -> String {
    match operation_type {
        "dns" => match failure_code {
            Some(code) if code.contains("Timeout") => "dns_timeout".to_string(),
            Some(code) if code.contains("NotFound") || code.contains("Name") => {
                "dns_not_found".to_string()
            }
            _ => "dns_failure".to_string(),
        },
        "tcp" => match failure_code {
            Some(code) if code.contains("Timeout") => "connection_timeout".to_string(),
            Some(code) if code.contains("Refused") => "connection_refused".to_string(),
            Some(code) if code.contains("Reset") => "connection_reset".to_string(),
            Some(code) if code.contains("Unreachable") => "network_unreachable".to_string(),
            _ => "connection_failure".to_string(),
        },
        "tls" => match failure_code {
            Some(code) if code.contains("Certificate") => "certificate_failure".to_string(),
            Some(code) if code.contains("Timeout") => "tls_timeout".to_string(),
            _ => "tls_handshake".to_string(),
        },
        "http" => match failure_code {
            Some(code) if code.contains("Timeout") => "connection_timeout".to_string(),
            _ => "http_error".to_string(),
        },
        _ => "unknown".to_string(),
    }
}

/// Classify severity from failure category and HTTP status
pub fn classify_severity(failure_category: &str, http_status: Option<u16>) -> String {
    // HTTP-specific severity
    if let Some(status) = http_status {
        if status == 451 {
            return "critical".to_string();
        }
        if status == 403 || status == 401 {
            return "high".to_string();
        }
        if status >= 500 {
            return "high".to_string();
        }
        if status == 429 {
            return "medium".to_string();
        }
        if status == 404 {
            return "low".to_string();
        }
    }

    match failure_category {
        "dns_failure" | "dns_timeout" | "dns_not_found" => "high".to_string(),
        "connection_refused" | "connection_timeout" | "connection_reset"
        | "network_unreachable" => "high".to_string(),
        "tls_handshake" | "certificate_failure" | "tls_timeout" => "critical".to_string(),
        "http_error" => "medium".to_string(),
        _ => "medium".to_string(),
    }
}

/// Derive a user-friendly failure reason string
pub fn derive_failure_reason(
    _operation_type: &str,
    failure_code: Option<&str>,
    summary: &str,
) -> String {
    if let Some(code) = failure_code {
        return code.replace('_', " ");
    }
    // Fallback to a cleaned-up summary
    summary.to_string()
}
