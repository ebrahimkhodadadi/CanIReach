export type SourceType = "canireach_probe" | "system_observation" | "proxy_capture";
export type VisibilityLevel = "application_instrumented" | "connection_metadata_only" | "dns_observed" | "full_http_request";
export type FailureCategory =
  | "dns_failure" | "dns_timeout" | "dns_not_found"
  | "connection_refused" | "connection_timeout" | "connection_reset" | "network_unreachable" | "connection_failure"
  | "tls_handshake" | "certificate_failure" | "tls_timeout"
  | "http_error"
  | "unknown";
export type FailureSeverity = "critical" | "high" | "medium" | "low";

export interface FailedRequestRecord {
  schema_version: number;
  id: string;
  run_id: string | null;
  batch_id: string | null;
  target_id: string | null;
  profile_id: string | null;
  operation_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  failure_code: string | null;
  summary: string;
  request_metadata: string | null;
  response_metadata: string | null;
  // Enriched fields
  source_type: SourceType;
  visibility_level: VisibilityLevel;
  host: string | null;
  registrable_domain: string | null;
  destination_ip: string | null;
  destination_port: number | null;
  protocol: string | null;
  http_status_code: number | null;
  failure_category: FailureCategory;
  failure_reason: string | null;
  severity: FailureSeverity;
  occurrence_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  related_target_id: string | null;
  metadata_json: string | null;
}

export interface FailedRequestFilters {
  source_type?: SourceType;
  host?: string;
  failure_category?: FailureCategory;
  severity?: FailureSeverity;
}
