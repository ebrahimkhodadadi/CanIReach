import { create } from "zustand";
import { TracerouteResult, TracerouteHop } from "../types";
import { startTraceroute, cancelTraceroute } from "../api/tracerouteCommands";
import { useProbeStore } from "../../probes/store/probeStore";

const getTargetName = (targetId: string): string => {
  const targets = useProbeStore.getState().targets;
  const target = targets.find((t) => t.id === targetId);
  return target ? target.name : targetId;
};

const logToConsole = (targetId: string, message: string, level: "INFO" | "WARN" | "ERROR" | "DEBUG") => {
  const targetName = getTargetName(targetId);
  useProbeStore.getState().appendGlobalLogs([{
    timestamp: new Date().toISOString(),
    level,
    message,
    target_name: targetName
  }]);
};

interface TracerouteStore {
  traces: Record<string, TracerouteResult>; // keyed by targetId
  activeRuns: Record<string, string>; // targetId -> traceId
  selectedTargetId: string | null;
  maxHops: number;
  resolveHostnames: boolean;

  setSelectedTargetId: (id: string | null) => void;
  setMaxHops: (hops: number) => void;
  setResolveHostnames: (resolve: boolean) => void;
  runTrace: (targetId: string) => Promise<void>;
  cancelActiveTrace: (targetId: string) => Promise<void>;

  // Event handlers
  onTraceStarted: (payload: { traceId: string; targetId: string }) => void;
  onHopArrived: (payload: { traceId: string; targetId: string; hop: TracerouteHop }) => void;
  onTraceCompleted: (payload: { traceId: string; targetId: string; result: TracerouteResult }) => void;
  onTraceCancelled: (payload: { traceId: string; targetId: string }) => void;
  onTraceFailed: (payload: { traceId: string; targetId: string; error: string }) => void;
  clearTrace: (targetId: string) => void;
}

export const useTracerouteStore = create<TracerouteStore>((set, get) => ({
  traces: {},
  activeRuns: {},
  selectedTargetId: null,
  maxHops: 30,
  resolveHostnames: true,

  setSelectedTargetId: (selectedTargetId) => set({ selectedTargetId }),
  setMaxHops: (maxHops) => set({ maxHops }),
  setResolveHostnames: (resolveHostnames) => set({ resolveHostnames }),

  runTrace: async (targetId) => {
    const { activeRuns, maxHops, resolveHostnames } = get();
    if (activeRuns[targetId]) return; // already running

    const traceId = crypto.randomUUID();
    set((state) => ({
      activeRuns: { ...state.activeRuns, [targetId]: traceId },
    }));

    try {
      await startTraceroute(targetId, traceId, maxHops, resolveHostnames);
    } catch (err) {
      console.error(`Traceroute failed for ${targetId}:`, err);
      set((state) => {
        const nextActive = { ...state.activeRuns };
        delete nextActive[targetId];
        return { activeRuns: nextActive };
      });
    }
  },

  cancelActiveTrace: async (targetId) => {
    const { activeRuns } = get();
    const traceId = activeRuns[targetId];
    if (!traceId) return;

    try {
      await cancelTraceroute(traceId);
    } catch (err) {
      console.error(`Failed to cancel traceroute ${traceId}:`, err);
    }
  },

  onTraceStarted: ({ traceId, targetId }) => {
    logToConsole(targetId, `Traceroute started: ${getTargetName(targetId)}`, "INFO");
    
    set((state) => {
      const initialResult: TracerouteResult = {
        trace_id: traceId,
        target_id: targetId,
        target_name: getTargetName(targetId),
        destination: "",
        destination_address: null,
        platform: "unknown",
        method: "unknown",
        status: "running",
        started_at: new Date().toISOString(),
        completed_at: null,
        duration_ms: null,
        max_hops: state.maxHops,
        probes_per_hop: 3,
        completed_hops: 0,
        destination_reached: false,
        hops: [],
        raw_output: "",
        stderr_output: null,
        error_code: null,
        error_message: null,
      };

      return {
        traces: { ...state.traces, [targetId]: initialResult },
      };
    });
  },

  onHopArrived: ({ traceId, targetId, hop }) => {
    if (hop.status === "timeout") {
      logToConsole(targetId, `Hop ${hop.hop_number} timeout`, "WARN");
    } else {
      logToConsole(
        targetId,
        `Hop ${hop.hop_number} responded: ${hop.address || "—"}, ${hop.rtt_ms?.toFixed(1) || "—"} ms`,
        "INFO"
      );
    }

    set((state) => {
      const current = state.traces[targetId];
      if (!current || current.trace_id !== traceId) return {};

      const nextHops = current.hops.filter((h) => h.hop_number !== hop.hop_number);
      nextHops.push(hop);
      nextHops.sort((a, b) => a.hop_number - b.hop_number);

      const updatedResult: TracerouteResult = {
        ...current,
        hops: nextHops,
        completed_hops: nextHops.length,
        destination_reached: nextHops.some((h) => h.is_destination),
      };

      return {
        traces: { ...state.traces, [targetId]: updatedResult },
      };
    });
  },

  onTraceCompleted: ({ traceId, targetId, result }) => {
    logToConsole(targetId, `Traceroute completed: ${getTargetName(targetId)}, ${result.completed_hops} hops`, "INFO");

    set((state) => {
      const nextActive = { ...state.activeRuns };
      if (nextActive[targetId] === traceId) {
        delete nextActive[targetId];
      }

      return {
        traces: { ...state.traces, [targetId]: result },
        activeRuns: nextActive,
      };
    });
  },

  onTraceCancelled: ({ traceId, targetId }) => {
    logToConsole(targetId, `Traceroute cancelled: ${getTargetName(targetId)}`, "WARN");

    set((state) => {
      const nextActive = { ...state.activeRuns };
      if (nextActive[targetId] === traceId) {
        delete nextActive[targetId];
      }

      const current = state.traces[targetId];
      if (!current || current.trace_id !== traceId) return { activeRuns: nextActive };

      const updatedResult: TracerouteResult = {
        ...current,
        status: "cancelled",
        completed_at: new Date().toISOString(),
      };

      return {
        traces: { ...state.traces, [targetId]: updatedResult },
        activeRuns: nextActive,
      };
    });
  },

  onTraceFailed: ({ traceId, targetId, error }) => {
    logToConsole(targetId, `Traceroute failed: ${error}`, "ERROR");

    set((state) => {
      const nextActive = { ...state.activeRuns };
      if (nextActive[targetId] === traceId) {
        delete nextActive[targetId];
      }

      const current = state.traces[targetId];
      if (!current || current.trace_id !== traceId) return { activeRuns: nextActive };

      const updatedResult: TracerouteResult = {
        ...current,
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: error,
      };

      return {
        traces: { ...state.traces, [targetId]: updatedResult },
        activeRuns: nextActive,
      };
    });
  },

  clearTrace: (targetId) => {
    set((state) => {
      const nextTraces = { ...state.traces };
      delete nextTraces[targetId];
      return { traces: nextTraces };
    });
  },
}));
