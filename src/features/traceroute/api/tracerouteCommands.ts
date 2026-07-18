import { invoke } from "@tauri-apps/api/core";
import { TracerouteResult } from "../types";

export const startTraceroute = async (
  targetId: string,
  traceId: string,
  maxHops?: number,
  resolveHostnames?: boolean
): Promise<TracerouteResult> => {
  return invoke<TracerouteResult>("start_traceroute", {
    targetId,
    traceId,
    maxHops,
    resolveHostnames,
  });
};

export const cancelTraceroute = async (traceId: string): Promise<void> => {
  return invoke<void>("cancel_traceroute", { traceId });
};
