import { invoke } from "@tauri-apps/api/core";
import { MonitorSession, MonitorRun, ContinuousMonitorConfig } from "../types";

export const startContinuousMonitor = async (
  targetId: string,
  config?: ContinuousMonitorConfig
): Promise<MonitorSession> => {
  return invoke<MonitorSession>("start_continuous_monitor", {
    targetId,
    configJson: config ? JSON.stringify(config) : null,
  });
};

export const stopContinuousMonitor = async (targetId: string): Promise<MonitorSession> => {
  return invoke<MonitorSession>("stop_continuous_monitor", { targetId });
};

export const getContinuousMonitorStatus = async (
  targetId: string
): Promise<MonitorSession | null> => {
  return invoke<MonitorSession | null>("get_continuous_monitor_status", { targetId });
};

export const listContinuousMonitors = async (): Promise<MonitorSession[]> => {
  return invoke<MonitorSession[]>("list_continuous_monitors");
};

export const getContinuousMonitorHistory = async (
  targetId: string,
  limit?: number,
  offset?: number
): Promise<MonitorRun[]> => {
  return invoke<MonitorRun[]>("get_continuous_monitor_history", {
    targetId,
    limit: limit ?? 50,
    offset: offset ?? 0,
  });
};
