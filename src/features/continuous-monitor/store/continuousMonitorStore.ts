import { create } from "zustand";
import { MonitorSession, MonitorRun, ContinuousMonitorConfig } from "../types";
import {
  startContinuousMonitor,
  stopContinuousMonitor,
  getContinuousMonitorStatus,
  listContinuousMonitors,
  getContinuousMonitorHistory,
} from "../api/continuousMonitorCommands";

interface ContinuousMonitorState {
  sessions: Record<string, MonitorSession>;
  history: Record<string, MonitorRun[]>;
  loading: boolean;

  fetchSessions: () => Promise<void>;
  startMonitor: (targetId: string, config?: ContinuousMonitorConfig) => Promise<void>;
  stopMonitor: (targetId: string) => Promise<void>;
  fetchStatus: (targetId: string) => Promise<void>;
  fetchHistory: (targetId: string) => Promise<void>;
  updateSessionFromEvent: (payload: Record<string, unknown>) => void;
  updateRunFromEvent: (payload: Record<string, unknown>) => void;
}

export const useContinuousMonitorStore = create<ContinuousMonitorState>((set) => ({
  sessions: {},
  history: {},
  loading: false,

  fetchSessions: async () => {
    set({ loading: true });
    try {
      const sessions = await listContinuousMonitors();
      const map: Record<string, MonitorSession> = {};
      sessions.forEach((s) => { map[s.target_id] = s; });
      set({ sessions: map });
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      set({ loading: false });
    }
  },

  startMonitor: async (targetId, config) => {
    try {
      const session = await startContinuousMonitor(targetId, config);
      set((state) => ({
        sessions: { ...state.sessions, [targetId]: session },
      }));
    } catch (err) {
      console.error("Failed to start monitor:", err);
      throw err;
    }
  },

  stopMonitor: async (targetId) => {
    try {
      const session = await stopContinuousMonitor(targetId);
      set((state) => ({
        sessions: { ...state.sessions, [targetId]: session },
      }));
    } catch (err) {
      console.error("Failed to stop monitor:", err);
      throw err;
    }
  },

  fetchStatus: async (targetId) => {
    try {
      const session = await getContinuousMonitorStatus(targetId);
      set((state) => ({
        sessions: {
          ...state.sessions,
          [targetId]: session ?? { ...state.sessions[targetId], state: "stopped" } as MonitorSession,
        },
      }));
    } catch (err) {
      console.error("Failed to fetch status:", err);
    }
  },

  fetchHistory: async (targetId) => {
    try {
      const runs = await getContinuousMonitorHistory(targetId);
      set((state) => ({
        history: { ...state.history, [targetId]: runs },
      }));
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  },

  updateSessionFromEvent: (payload) => {
    const { target_id, state: monitorState } = payload as { target_id: string; state: MonitorSession["state"] };
    set((state) => {
      const existing = state.sessions[target_id];
      if (existing) {
        return {
          sessions: {
            ...state.sessions,
            [target_id]: { ...existing, state: monitorState, updated_at: new Date().toISOString() },
          },
        };
      }
      return state;
    });
  },

  updateRunFromEvent: (payload) => {
    const { target_id, is_healthy } = payload as { target_id: string; is_healthy: boolean };
    set((state) => {
      const existing = state.sessions[target_id];
      if (existing) {
        const updated = {
          ...existing,
          total_runs: existing.total_runs + 1,
          successful_runs: existing.successful_runs + (is_healthy ? 1 : 0),
          failed_runs: existing.failed_runs + (is_healthy ? 0 : 1),
          consecutive_failures: is_healthy ? 0 : existing.consecutive_failures + 1,
          last_run_at: new Date().toISOString(),
        };
        return { sessions: { ...state.sessions, [target_id]: updated } };
      }
      return state;
    });
  },
}));
