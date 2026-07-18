import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { TracerouteHop, TracerouteResult } from "../types";

export interface TracerouteHopEvent {
  traceId: string;
  targetId: string;
  hop: TracerouteHop;
  timestamp: string;
}

export interface TracerouteCompletedEvent {
  traceId: string;
  targetId: string;
  result: TracerouteResult;
  timestamp: string;
}

export interface TracerouteFailedEvent {
  traceId: string;
  targetId: string;
  error: string;
  timestamp: string;
}

export const subscribeToTracerouteStarted = (
  onStarted: (payload: { traceId: string; targetId: string }) => void
): Promise<UnlistenFn> => {
  return listen<{ traceId: string; targetId: string }>("traceroute_started", (e) => onStarted(e.payload));
};

export const subscribeToTracerouteHop = (
  onHop: (payload: TracerouteHopEvent) => void
): Promise<UnlistenFn> => {
  return listen<TracerouteHopEvent>("traceroute_hop_updated", (e) => onHop(e.payload));
};

export const subscribeToTracerouteCompleted = (
  onCompleted: (payload: TracerouteCompletedEvent) => void
): Promise<UnlistenFn> => {
  return listen<TracerouteCompletedEvent>("traceroute_completed", (e) => onCompleted(e.payload));
};

export const subscribeToTracerouteCancelled = (
  onCancelled: (payload: { traceId: string; targetId: string }) => void
): Promise<UnlistenFn> => {
  return listen<{ traceId: string; targetId: string }>("traceroute_cancelled", (e) => onCancelled(e.payload));
};

export const subscribeToTracerouteFailed = (
  onFailed: (payload: TracerouteFailedEvent) => void
): Promise<UnlistenFn> => {
  return listen<TracerouteFailedEvent>("traceroute_failed", (e) => onFailed(e.payload));
};
