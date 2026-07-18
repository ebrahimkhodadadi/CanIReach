import { useTracerouteStore } from "./tracerouteStore";

export const useTraces = () => useTracerouteStore((s) => s.traces);
export const useActiveRuns = () => useTracerouteStore((s) => s.activeRuns);
export const useSelectedTracerouteTargetId = () => useTracerouteStore((s) => s.selectedTargetId);
export const useMaxHops = () => useTracerouteStore((s) => s.maxHops);
export const useResolveHostnames = () => useTracerouteStore((s) => s.resolveHostnames);

export const useTracerouteActions = () => {
  const setSelectedTargetId = useTracerouteStore((s) => s.setSelectedTargetId);
  const setMaxHops = useTracerouteStore((s) => s.setMaxHops);
  const setResolveHostnames = useTracerouteStore((s) => s.setResolveHostnames);
  const runTrace = useTracerouteStore((s) => s.runTrace);
  const cancelActiveTrace = useTracerouteStore((s) => s.cancelActiveTrace);
  const clearTrace = useTracerouteStore((s) => s.clearTrace);
  const onTraceStarted = useTracerouteStore((s) => s.onTraceStarted);
  const onHopArrived = useTracerouteStore((s) => s.onHopArrived);
  const onTraceCompleted = useTracerouteStore((s) => s.onTraceCompleted);
  const onTraceCancelled = useTracerouteStore((s) => s.onTraceCancelled);
  const onTraceFailed = useTracerouteStore((s) => s.onTraceFailed);

  return {
    setSelectedTargetId,
    setMaxHops,
    setResolveHostnames,
    runTrace,
    cancelActiveTrace,
    clearTrace,
    onTraceStarted,
    onHopArrived,
    onTraceCompleted,
    onTraceCancelled,
    onTraceFailed,
  };
};
