import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { ProbeResult } from "../types";

export const PROBE_UPDATE_EVENT = "probe:update";
export const PROBE_CANCELLED_EVENT = "probe:cancelled";

export const subscribeToProbeUpdates = (
  onUpdate: (result: ProbeResult) => void
): Promise<UnlistenFn> => {
  return listen<ProbeResult>(PROBE_UPDATE_EVENT, (event) => {
    onUpdate(event.payload);
  });
};

export const subscribeToProbeCancelled = (
  onCancelled: (payload: { targetId: string }) => void
): Promise<UnlistenFn> => {
  return listen<{ targetId: string }>(PROBE_CANCELLED_EVENT, (event) => {
    onCancelled(event.payload);
  });
};
