import { TargetCheckResult, TargetStatus } from "../types/monitoring";
import { Target, ProbeResult } from "../../probes/types";
import { normalizeError } from "./errorNormalizer";

export const mapProbeResultToTargetCheckResult = (
  target: Target,
  result: ProbeResult | undefined,
  isChecking: boolean
): TargetCheckResult => {
  if (isChecking) {
    return {
      targetId: target.id,
      targetName: target.name,
      url: target.url,
      status: "checking",
      checkedAt: new Date().toISOString()
    };
  }

  if (!result) {
    return {
      targetId: target.id,
      targetName: target.name,
      url: target.url,
      status: "unknown",
      checkedAt: new Date(0).toISOString()
    };
  }

  // Determine TargetStatus
  let status: TargetStatus = "unknown";
  if (result.status === "success") {
    const code = result.http_status;
    if (code && code >= 200 && code < 400) {
      status = "healthy";
    } else {
      status = "degraded";
    }
  } else {
    status = "unreachable";
  }

  // Normalize DNS details
  const dnsDetail = result.dns ? {
    resolved: result.dns.status === "passed",
    addresses: result.dns.metadata?.resolved_ips?.split(", ").filter(Boolean),
    durationMs: result.dns.duration_ms !== null ? result.dns.duration_ms : undefined
  } : undefined;

  // Normalize connection details
  const connectionDetail = result.tcp ? {
    succeeded: result.tcp.status === "passed",
    durationMs: result.tcp.duration_ms !== null ? result.tcp.duration_ms : undefined
  } : undefined;

  // Normalize HTTP details
  const httpDetail = result.http ? {
    statusCode: result.http_status !== null ? result.http_status : undefined,
    statusText: result.http.metadata?.status_code ? `HTTP ${result.http.metadata.status_code}` : undefined,
    finalUrl: result.final_url !== null ? result.final_url : undefined,
    redirectCount: result.redirect_count !== null ? result.redirect_count : undefined,
    durationMs: result.http.duration_ms !== null ? result.http.duration_ms : undefined
  } : undefined;

  return {
    targetId: target.id,
    targetName: target.name,
    url: target.url,
    status,
    checkedAt: result.timestamp,
    durationMs: result.latency_ms,
    dns: dnsDetail,
    connection: connectionDetail,
    http: httpDetail,
    error: normalizeError(result)
  };
};
