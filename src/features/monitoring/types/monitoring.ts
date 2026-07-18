export type TargetStatus =
  | "healthy"
  | "degraded"
  | "unreachable"
  | "unknown"
  | "checking";

export type FailureCategory =
  | "dns"
  | "connection"
  | "timeout"
  | "tls"
  | "http"
  | "redirect"
  | "network"
  | "configuration"
  | "cancelled"
  | "unknown";

export type ProblemSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

export interface NormalizedMonitoringError {
  category: FailureCategory;
  code: string;
  message: string;
  userMessage: string;
  severity: ProblemSeverity;

  stage:
    | "validation"
    | "dns"
    | "connection"
    | "tls"
    | "http"
    | "redirect"
    | "unknown";

  retryable: boolean;
  firstObservedAt?: string;
  lastObservedAt?: string;

  technicalDetails?: string;
  rawError?: string;
}

export interface TargetCheckResult {
  targetId: string;
  targetName: string;
  url: string;

  status: TargetStatus;
  checkedAt: string;
  durationMs?: number;

  dns?: {
    resolved: boolean;
    addresses?: string[];
    durationMs?: number;
  };

  connection?: {
    succeeded: boolean;
    durationMs?: number;
  };

  http?: {
    statusCode?: number;
    statusText?: string;
    finalUrl?: string;
    redirectCount?: number;
    durationMs?: number;
  };

  error?: NormalizedMonitoringError;
}
