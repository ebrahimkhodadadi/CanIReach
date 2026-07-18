export type TracerouteState =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "timeout"
  | "cancelled"
  | "unavailable";

export type HopStatus = "responded" | "timeout" | "unreachable" | "unknown";

export interface HopResponse {
  address: string | null;
  hostname: string | null;
  rtt_ms: number | null;
  responded: boolean;
  timed_out: boolean;
}

export interface TracerouteHop {
  hop_number: number;
  address: string | null;
  hostname: string | null;
  status: HopStatus;
  rtt_ms: number | null;
  rtt_values_ms: number[] | null;
  packet_loss_percent: number | null;
  timeout_count: number | null;
  raw_line: string | null;
  error_message: string | null;
  responses: HopResponse[];
  is_destination: boolean;
}

export interface TracerouteResult {
  trace_id: string;
  target_id: string;
  target_name: string;
  destination: string;
  destination_address: string | null;
  platform: string;
  method: string;
  status: TracerouteState;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  max_hops: number;
  probes_per_hop: number;
  completed_hops: number;
  destination_reached: boolean;
  hops: TracerouteHop[];
  raw_output: string | null;
  stderr_output: string | null;
  error_code: string | null;
  error_message: string | null;
}
