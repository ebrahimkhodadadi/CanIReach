export interface DiagnosticOverrides {
  follow_redirects?: boolean;
  request_method?: "HEAD" | "GET";
  test_ipv4?: boolean;
  test_ipv6?: boolean;
  enable_http2?: boolean;
  enable_http3?: boolean;
}

export interface Target {
  id: string;
  name: string;
  url: string;
  description?: string;
  category?: string;
  group_ids: string[];
  tags: string[];
  enabled: boolean;
  network_profile_id?: string;
  diagnostic_overrides?: DiagnosticOverrides;
  created_at: string;
  updated_at: string;
}

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export interface LogStep {
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface ProbeLog {
  steps: LogStep[];
}

export type ProbeStatus = "success" | "failed" | "timeout";

export type FailureStage =
  | "none"
  | "configuration"
  | "validation"
  | "dns"
  | "tcp"
  | "tls"
  | "proxy"
  | "http"
  | "redirect"
  | "timeout"
  | "ipv4"
  | "ipv6"
  | "runtime"
  | "unknown";

export type FailureKind =
  | "invalid_url"
  | "invalid_hostname"
  | "dns_not_found"
  | "dns_timeout"
  | "dns_server_failure"
  | "tcp_refused"
  | "tcp_timeout"
  | "network_unreachable"
  | "tls_certificate"
  | "tls_handshake"
  | "proxy_unavailable"
  | "proxy_authentication"
  | "http_status"
  | "http_request"
  | "redirect_limit"
  | "connection_timeout"
  | "ipv4_failed"
  | "ipv6_failed"
  | "permission_denied"
  | "runtime_error"
  | "unknown";

export type Confidence = "direct" | "inferred" | "unknown";

export interface FailureEvidence {
  stage: FailureStage;
  kind: FailureKind;
  user_message: string;
  technical_message: string | null;
  error_chain: string[] | null;
  errno: string | null;
  http_status: number | null;
  address: string | null;
  protocol: string | null;
  retryable: boolean;
  observed_at: string;
  confidence: Confidence;
}

export interface ProbeStageResult {
  stage: FailureStage;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: "passed" | "failed" | "skipped" | "timeout";
  error: FailureEvidence | null;
  metadata: Record<string, string> | null;
}

export interface Timings {
  dns_ms: number | null;
  tcp_ms: number | null;
  tls_ms: number | null;
  request_ms: number | null;
  total_ms: number | null;
}

export interface ProbeResult {
  target_id: string;
  target_url: string;
  run_id: string;
  started_at: string;
  completed_at: string | null;
  overall_status: string; // "up" | "degraded" | "down" | "unknown"
  dns: ProbeStageResult | null;
  tcp: ProbeStageResult | null;
  tls: ProbeStageResult | null;
  http: ProbeStageResult | null;
  ipv4: ProbeStageResult | null;
  ipv6: ProbeStageResult | null;
  redirect: ProbeStageResult | null;
  failure: FailureEvidence | null;
  timings: Timings;
  status: ProbeStatus; // Backwards compatibility
  failure_stage: FailureStage; // Backwards compatibility
  http_status: number | null; // Backwards compatibility
  latency_ms: number; // Backwards compatibility
  error: string | null; // Backwards compatibility
  error_code: string | null; // Backwards compatibility
  timestamp: string; // Backwards compatibility
  log: ProbeLog; // Backwards compatibility
  final_url: string | null; // Backwards compatibility
  redirect_count: number | null; // Backwards compatibility
}

export interface FrontendSettings {
  timeout_ms: number;
  connect_timeout_ms: number;
  dns_timeout_ms: number;
  tcp_timeout_ms: number;
  tls_timeout_ms: number;
  redirect_limit: number;
  follow_redirects: boolean;
  prefer_ipv4: boolean;
  prefer_ipv6: boolean;
  enable_ipv4_diagnostics: boolean;
  enable_ipv6_diagnostics: boolean;
  verify_tls: boolean;
  proxy_mode: string;
  proxy_url: string | null;
  user_agent: string;
  retry_count: number;
  retry_delay_ms: number;
  concurrency_limit: number;
}

export interface TargetGroup {
  id: string;
  name: string;
  description?: string;
  color?: string;
  created_at: string;
  updated_at: string;
}

export interface NetworkInterfaceSelection {
  mode: string; // "system" | "interface"
  interface_id?: string;
  source_ipv4?: string;
  source_ipv6?: string;
}

export interface DnsServerConfig {
  id: string;
  name?: string;
  protocol: string; // "udp" | "tcp" | "dot" | "doh"
  address: string;
  port?: number;
  server_name?: string;
  doh_url?: string;
  bootstrap_addresses?: string[];
  enabled: boolean;
}

export interface DnsSelection {
  mode: string; // "system" | "custom"
  servers: DnsServerConfig[];
}

export interface ProxySelection {
  mode: string; // "system" | "direct" | "custom"
  custom_type?: string; // "http" | "https" | "socks5" | "socks5h"
  custom_host?: string;
  custom_port?: number;
  auth_username?: string;
  auth_credential_id?: string;
  bypass?: string[];
}

export interface PreflightProfileSettings {
  run_preflight: boolean;
  timeout_ms: number;
  endpoints: string[];
  min_success_count: number;
}

export interface NetworkProfile {
  id: string;
  name: string;
  description?: string;
  is_default: boolean;
  interface: NetworkInterfaceSelection;
  dns: DnsSelection;
  proxy: ProxySelection;
  ip_preference: string; // "system" | "prefer_ipv4" | "prefer_ipv6" | "ipv4_only" | "ipv6_only"
  preflight?: PreflightProfileSettings;
  created_at: string;
  updated_at: string;
}

export type MonitoringScopeType = "all_enabled_targets" | "selected_targets" | "group";

export interface MonitoringScope {
  type: MonitoringScopeType;
  target_ids?: string[];
  group_id?: string;
}

export type ScheduleDetailsType = "interval" | "daily" | "weekly" | "cron";

export interface ScheduleDetails {
  type: ScheduleDetailsType;
  interval_seconds?: number;
  local_time?: string;
  time_zone?: string;
  days_of_week?: number[];
  expression?: string;
}

export interface MonitoringSchedule {
  schema_version: number;
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  scope: MonitoringScope;
  schedule: ScheduleDetails;
  network_profile_override_id?: string;
  run_preflight: boolean;
  strict_preflight_blocking: boolean;
  overlap_policy: "skip" | "queue_one" | "cancel_previous";
  missed_run_policy: "skip" | "run_once_on_resume";
  concurrency_limit?: number;
  target_timeout_ms?: number;
  batch_timeout_ms?: number;
  alert_rule_ids: string[];
  created_at: string;
  updated_at: string;
  last_run_at?: string;
  next_run_at?: string;
}

export interface HistoricalTargetRun {
  id: string;
  batch_id: string;
  target_id: string;
  status: "healthy" | "degraded" | "unreachable" | "unknown";
  latency_ms: number | null;
  http_status: number | null;
  profile_id: string;
  primary_failure_code?: string;
  technical_evidence?: string;
  started_at: string;
}

export interface MonitoringIncident {
  id: string;
  target_id: string;
  profile_id: string;
  status: "open" | "resolved";
  started_at: string;
  resolved_at?: string;
  acknowledged_at?: string;
  consecutive_failures: number;
  last_observed_at: string;
  title: string;
  summary: string;
}

export interface PrivacyExpectationPolicy {
  schema_version: number;
  id: string;
  profile_id: string;
  expected_routing: string;
  dns_expectation: string;
  ipv6_policy: string;
  webrtc_expectation: string;
}

export interface PrivacyAssessment {
  schema_version: number;
  id: string;
  profile_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  overall_verdict: string | null;
  findings_json: string | null;
}

export interface PrivacyFinding {
  id: string;
  category: string;
  status: string;
  severity: string;
  expected_behavior: string;
  observed_behavior: string;
  confidence: string;
}

export interface PerformanceRun {
  schema_version: number;
  id: string;
  benchmark_id: string | null;
  profile_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  latency_ms: number | null;
  jitter_ms: number | null;
  loss_percent: number | null;
  download_mbps: number | null;
  upload_mbps: number | null;
  bytes_downloaded: number;
  bytes_uploaded: number;
  loaded_latency_ms: number | null;
  bufferbloat_ms: number | null;
}

