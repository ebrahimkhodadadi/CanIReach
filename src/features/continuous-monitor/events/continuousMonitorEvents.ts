import { listen } from "@tauri-apps/api/event";

export const subscribeToContinuousMonitorStateChanged = async (
  callback: (payload: Record<string, unknown>) => void
): Promise<() => void> => {
  return listen<Record<string, unknown>>("continuous-monitor:state-changed", (event) => {
    callback(event.payload);
  });
};

export const subscribeToContinuousMonitorRunCompleted = async (
  callback: (payload: Record<string, unknown>) => void
): Promise<() => void> => {
  return listen<Record<string, unknown>>("continuous-monitor:run-completed", (event) => {
    callback(event.payload);
  });
};
