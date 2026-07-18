use super::models::{HopResponse, HopStatus, TracerouteHop};

pub fn parse_hop_line(line: &str) -> Option<TracerouteHop> {
    let line_trimmed = line.trim();
    if line_trimmed.is_empty() {
        return None;
    }

    let tokens: Vec<&str> = line_trimmed.split_whitespace().collect();
    if tokens.is_empty() {
        return None;
    }

    // Try to parse first token as hop number
    let hop_number = tokens[0].parse::<u32>().ok()?;

    let mut times = Vec::new();
    let mut addr_tokens = Vec::new();
    let mut i = 1;

    // Parse times (usually 3 times on Windows)
    while i < tokens.len() {
        let token = tokens[i];
        if token == "*" {
            times.push(None);
            i += 1;
        } else if token == "<1" && i + 1 < tokens.len() && tokens[i + 1].starts_with("ms") {
            times.push(Some(0.5));
            i += 2;
        } else if let Ok(t) = token.parse::<f64>() {
            if i + 1 < tokens.len() && tokens[i + 1].starts_with("ms") {
                times.push(Some(t));
                i += 2;
            } else {
                addr_tokens.push(token);
                i += 1;
            }
        } else {
            addr_tokens.push(token);
            i += 1;
        }
    }

    if times.is_empty() {
        return None;
    }

    let address_str = addr_tokens.join(" ");
    let address_str = address_str.trim();

    let mut responses = Vec::new();
    let is_timeout = address_str.is_empty()
        || address_str.contains("timed out")
        || address_str.contains("Zeitüberschreitung")
        || address_str.contains("*")
        || times.iter().all(|t| t.is_none());

    if is_timeout {
        for _ in 0..times.len().max(3) {
            responses.push(HopResponse {
                address: None,
                hostname: None,
                rtt_ms: None,
                responded: false,
                timed_out: true,
            });
        }
    } else {
        let mut hostname = None;
        let mut address = None;

        if let Some(start_bracket) = address_str.find('[') {
            if let Some(end_bracket) = address_str[start_bracket..].find(']') {
                let ip = &address_str[start_bracket + 1..start_bracket + end_bracket];
                let host = &address_str[..start_bracket].trim();
                address = Some(ip.to_string());
                hostname = Some(host.to_string());
            }
        } else if let Some(start_paren) = address_str.find('(') {
            if let Some(end_paren) = address_str[start_paren..].find(')') {
                let ip = &address_str[start_paren + 1..start_paren + end_paren];
                let host = &address_str[..start_paren].trim();
                address = Some(ip.to_string());
                hostname = Some(host.to_string());
            }
        } else {
            address = Some(address_str.to_string());
            hostname = None;
        }

        for time in times {
            if let Some(t) = time {
                responses.push(HopResponse {
                    address: address.clone(),
                    hostname: hostname.clone(),
                    rtt_ms: Some(t),
                    responded: true,
                    timed_out: false,
                });
            } else {
                responses.push(HopResponse {
                    address: None,
                    hostname: None,
                    rtt_ms: None,
                    responded: false,
                    timed_out: true,
                });
            }
        }
    }

    let valid_rtts: Vec<f64> = responses.iter().filter_map(|r| r.rtt_ms).collect();
    let total_attempts = responses.len();
    let failed_attempts = responses.iter().filter(|r| !r.responded).count();
    let packet_loss_percent = if total_attempts > 0 {
        (failed_attempts as f64 / total_attempts as f64) * 100.0
    } else {
        0.0
    };

    let status = if packet_loss_percent < 100.0 {
        HopStatus::Responded
    } else {
        HopStatus::Timeout
    };

    let address_res = responses
        .iter()
        .find(|r| r.address.is_some())
        .and_then(|r| r.address.clone());
    let hostname_res = responses
        .iter()
        .find(|r| r.hostname.is_some())
        .and_then(|r| r.hostname.clone());

    let rtt_values_ms = if valid_rtts.is_empty() {
        None
    } else {
        Some(valid_rtts)
    };

    let avg_rtt_ms = if let Some(ref rtts) = rtt_values_ms {
        let sum: f64 = rtts.iter().sum();
        Some(sum / rtts.len() as f64)
    } else {
        None
    };

    Some(TracerouteHop {
        hop_number,
        address: address_res,
        hostname: hostname_res,
        status,
        rtt_ms: avg_rtt_ms,
        rtt_values_ms,
        packet_loss_percent: Some(packet_loss_percent),
        timeout_count: Some(failed_attempts as u32),
        raw_line: Some(line.to_string()),
        error_message: None,
        responses,
        is_destination: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_hop() {
        let line = "  1    1 ms    2 ms    1 ms  192.168.1.1";
        let hop = parse_hop_line(line).unwrap();
        assert_eq!(hop.hop_number, 1);
        assert_eq!(hop.responses.len(), 3);
        assert_eq!(hop.responses[0].address, Some("192.168.1.1".to_string()));
        assert_eq!(hop.responses[0].rtt_ms, Some(1.0));
        assert_eq!(hop.packet_loss_percent, Some(0.0));
        assert_eq!(hop.status, HopStatus::Responded);
    }

    #[test]
    fn test_parse_timed_out_hop() {
        let line = "  3    *        *        *     Request timed out.";
        let hop = parse_hop_line(line).unwrap();
        assert_eq!(hop.hop_number, 3);
        assert_eq!(hop.responses.len(), 3);
        assert!(hop.responses[0].timed_out);
        assert_eq!(hop.packet_loss_percent, Some(100.0));
        assert_eq!(hop.status, HopStatus::Timeout);
    }

    #[test]
    fn test_parse_host_and_ip() {
        let line = "  4   12 ms   11 ms   13 ms  google.com [142.250.180.14]";
        let hop = parse_hop_line(line).unwrap();
        assert_eq!(hop.hop_number, 4);
        assert_eq!(hop.responses[0].address, Some("142.250.180.14".to_string()));
        assert_eq!(hop.responses[0].hostname, Some("google.com".to_string()));
        assert_eq!(hop.status, HopStatus::Responded);
    }
}
