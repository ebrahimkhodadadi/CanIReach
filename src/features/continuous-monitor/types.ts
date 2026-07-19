export interface ContinuousMonitorConfig {
  interval_seconds: number;
  run_immediately: boolean;
  persist_across_restart: boolean;
  pause_when_offline: boolean;
  retry_on_network_recovery: boolean;
  overlap_policy: string;
  notify_on_failure: boolean;
  notify_on_recovery: boolean;
}

export interface MonitorSession {
  id: string;
  target_id: string;
  config: ContinuousMonitorConfig;
  state: "idle" | "running" | "paused" | "stopped";
  started_at: string | null;
  stopped_at: string | null;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  consecutive_failures: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonitorRun {
  id: string;
  session_id: string;
  target_id: string;
  run_index: number;
  status: string;
  latency_ms: number | null;
  http_status: number | null;
  error_category: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}
