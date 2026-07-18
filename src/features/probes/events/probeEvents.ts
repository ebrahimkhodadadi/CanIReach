import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { ProbeResult } from "../types";

export const PROBE_UPDATE_EVENT = "probe:update";

export const subscribeToProbeUpdates = (
  onUpdate: (result: ProbeResult) => void
): Promise<UnlistenFn> => {
  return listen<ProbeResult>(PROBE_UPDATE_EVENT, (event) => {
    onUpdate(event.payload);
  });
};
