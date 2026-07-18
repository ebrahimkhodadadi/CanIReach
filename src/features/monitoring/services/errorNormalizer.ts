import { NormalizedMonitoringError, FailureCategory, ProblemSeverity } from "../types/monitoring";
import { ProbeResult } from "../../probes/types";

export const normalizeError = (result: ProbeResult): NormalizedMonitoringError | undefined => {
  if (result.status === "success") {
    return undefined;
  }

  // Determine stage
  let stage: NormalizedMonitoringError["stage"] = "unknown";
  if (result.failure_stage) {
    if (result.failure_stage === "validation") stage = "validation";
    else if (result.failure_stage === "dns") stage = "dns";
    else if (result.failure_stage === "tcp" || result.failure_stage === "proxy") stage = "connection";
    else if (result.failure_stage === "tls") stage = "tls";
    else if (result.failure_stage === "http") stage = "http";
    else if (result.failure_stage === "redirect") stage = "redirect";
  }

  // Default values
  let category: FailureCategory = "unknown";
  let code = "unknown_error";
  let message = result.error || "Unknown request error occurred";
  let userMessage = "Request failed due to an unknown issue";
  let severity: ProblemSeverity = "medium";
  let retryable = true;
  let technicalDetails = result.error || undefined;

  // Use structural failure evidence from backend if available
  if (result.failure) {
    const f = result.failure;
    technicalDetails = f.technical_message || undefined;
    if (f.error_chain && f.error_chain.length > 0) {
      technicalDetails = `${technicalDetails || ""}\n\nError Chain:\n${f.error_chain.map((err, i) => `[${i}] ${err}`).join("\n")}`;
    }

    // Map backend kind to stable error code
    switch (f.kind) {
      case "invalid_url":
        code = "invalid_url";
        category = "configuration";
        severity = "low";
        userMessage = "Invalid URL format";
        retryable = false;
        break;
      case "invalid_hostname":
        code = "invalid_url";
        category = "configuration";
        severity = "low";
        userMessage = "Invalid host name specified";
        retryable = false;
        break;
      case "dns_not_found":
        code = "dns_resolution_failed";
        category = "dns";
        severity = "high";
        userMessage = "DNS resolution failed";
        break;
      case "dns_timeout":
        code = "dns_resolution_failed";
        category = "dns";
        severity = "high";
        userMessage = "DNS lookup timed out";
        break;
      case "dns_server_failure":
        code = "dns_resolution_failed";
        category = "dns";
        severity = "high";
        userMessage = "DNS server returned failure status";
        break;
      case "tcp_refused":
        code = "connection_refused";
        category = "connection";
        severity = "critical";
        userMessage = "Connection refused by destination host";
        break;
      case "tcp_timeout":
        code = "connection_timeout";
        category = "timeout";
        severity = "high";
        userMessage = "TCP connection attempt timed out";
        break;
      case "network_unreachable":
        code = "network_unavailable";
        category = "network";
        severity = "critical";
        userMessage = "Network destination unreachable";
        break;
      case "tls_certificate":
        code = "tls_handshake_failed";
        category = "tls";
        severity = "critical";
        userMessage = "TLS handshake failed: invalid certificate";
        retryable = false;
        break;
      case "tls_handshake":
        code = "tls_handshake_failed";
        category = "tls";
        severity = "high";
        userMessage = "TLS handshake negotiation failed";
        break;
      case "proxy_unavailable":
        code = "proxy_unavailable" as any; // Map to category or custom proxy error
        category = "connection";
        severity = "critical";
        userMessage = "Configured proxy server is unavailable";
        break;
      case "proxy_authentication":
        code = "proxy_unavailable" as any;
        category = "configuration";
        severity = "critical";
        userMessage = "Proxy authentication failed";
        retryable = false;
        break;
      case "http_status":
        category = "http";
        if (f.http_status) {
          if (f.http_status >= 500) {
            code = "http_5xx";
            severity = "high";
            userMessage = `HTTP server returned error response code: ${f.http_status}`;
          } else {
            code = "http_4xx";
            severity = "medium";
            userMessage = `HTTP client request error code: ${f.http_status}`;
          }
        } else {
          code = "http_5xx";
          severity = "medium";
          userMessage = "HTTP server returned error status";
        }
        break;
      case "http_request":
        code = "http_request_failed" as any;
        category = "http";
        severity = "medium";
        userMessage = "HTTP request execution failed";
        break;
      case "redirect_limit":
        code = "redirect_limit_exceeded";
        category = "redirect";
        severity = "low";
        userMessage = "Too many HTTP redirects followed";
        retryable = false;
        break;
      case "connection_timeout":
        code = "request_timeout";
        category = "timeout";
        severity = "high";
        userMessage = "HTTP request execution timed out";
        break;
      case "permission_denied":
        code = "unknown_error";
        category = "network";
        severity = "low";
        userMessage = "Permission denied while initiating request";
        retryable = false;
        break;
      default:
        break;
    }
  } else {
    // Backwards compatibility parsing of text errors
    const errText = (result.error || "").toLowerCase();
    if (errText.includes("dns") || errText.includes("resolve") || errText.includes("lookup")) {
      code = "dns_resolution_failed";
      category = "dns";
      severity = "high";
      userMessage = "DNS resolution failed";
    } else if (errText.includes("refused")) {
      code = "connection_refused";
      category = "connection";
      severity = "critical";
      userMessage = "Connection refused by destination host";
    } else if (errText.includes("connect timeout") || errText.includes("connection timed out")) {
      code = "connection_timeout";
      category = "timeout";
      severity = "high";
      userMessage = "TCP connection attempt timed out";
    } else if (errText.includes("timeout")) {
      code = "request_timeout";
      category = "timeout";
      severity = "high";
      userMessage = "HTTP request execution timed out";
    } else if (errText.includes("tls") || errText.includes("ssl") || errText.includes("handshake") || errText.includes("certificate")) {
      code = "tls_handshake_failed";
      category = "tls";
      severity = "high";
      userMessage = "TLS handshake negotiation failed";
    } else if (errText.includes("redirect")) {
      code = "redirect_limit_exceeded";
      category = "redirect";
      severity = "low";
      userMessage = "Too many HTTP redirects followed";
      retryable = false;
    } else if (result.http_status) {
      category = "http";
      if (result.http_status >= 500) {
        code = "http_5xx";
        severity = "high";
        userMessage = `HTTP server returned error response code: ${result.http_status}`;
      } else {
        code = "http_4xx";
        severity = "medium";
        userMessage = `HTTP client request error code: ${result.http_status}`;
      }
    }
  }

  return {
    category,
    code,
    message,
    userMessage,
    severity,
    stage,
    retryable,
    firstObservedAt: result.timestamp,
    lastObservedAt: result.timestamp,
    technicalDetails,
    rawError: result.error || undefined
  };
};
