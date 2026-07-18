import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { 
  useTargets, 
  useProbeResults, 
  useGlobalLogs, 
  useIsProbingAll, 
  useProbingTargets, 
  useSelectedTargetId, 
  useShowGlobalLogs, 
  useProbeActions 
} from "../features/probes/store/selectors";
import { subscribeToProbeUpdates } from "../features/probes/events/probeEvents";
import { 
  subscribeToTracerouteStarted,
  subscribeToTracerouteHop,
  subscribeToTracerouteCompleted,
  subscribeToTracerouteCancelled,
  subscribeToTracerouteFailed
} from "../features/traceroute/events/tracerouteEvents";
import { useTracerouteActions } from "../features/traceroute/store/selectors";
import { TracerouteView } from "../features/traceroute/components/TracerouteView";
import { AppShell } from "../components/layout/AppShell";
import { Header } from "../components/layout/Header";
import { TargetGrid } from "../components/targets/TargetGrid";
import { Overview } from "../features/dashboard/components/Overview";
import { Problems } from "../features/dashboard/components/Problems";
import { Settings } from "../features/dashboard/components/Settings";
import { Schedules } from "../features/dashboard/components/Schedules";
import { HistoryLog } from "../features/dashboard/components/HistoryLog";
import { FailedRequests } from "../features/dashboard/components/FailedRequests";
import { Investigations } from "../features/dashboard/components/Investigations";
import { Performance } from "../features/dashboard/components/Performance";
import { Privacy } from "../features/dashboard/components/Privacy";
import { ProbeDetailsDrawer } from "../components/probe-details/ProbeDetailsDrawer";
import { GlobalLogPanel } from "../components/logs/GlobalLogPanel";
import { groupTargetsByCategory } from "../utils/grouping";
import { AnimatePresence } from "framer-motion";
import { CompactDashboard } from "../features/dashboard/components/CompactDashboard";

export const App: React.FC = () => {
  const [windowLabel, setWindowLabel] = useState<string>("main");

  useEffect(() => {
    try {
      import("@tauri-apps/api/window").then((mod) => {
        setWindowLabel(mod.getCurrentWindow().label);
      });
    } catch (e) {
      console.warn("Could not retrieve window label:", e);
    }
  }, []);

  const targets = useTargets();
  const probeResults = useProbeResults();
  const globalLogs = useGlobalLogs();
  const isProbingAll = useIsProbingAll();
  const probingTargets = useProbingTargets();

  if (windowLabel === "compact") {
    return <CompactDashboard />;
  }
  const selectedTargetId = useSelectedTargetId();
  const showGlobalLogs = useShowGlobalLogs();

  const {
    fetchTargets,
    probeAll,
    probeOne,
    handleProbeUpdate,
    setSelectedTargetId,
    setShowGlobalLogs,
    clearLogs,
    fetchGroups,
    fetchProfiles,
  } = useProbeActions();

  const {
    onTraceStarted,
    onHopArrived,
    onTraceCompleted,
    onTraceCancelled,
    onTraceFailed,
  } = useTracerouteActions();

  const [activeTab, setActiveTab] = useState<string>("overview");
  const [drawerInitialTab, setDrawerInitialTab] = useState<"summary" | "timeline" | "path" | "raw">("summary");

  const handleSelectTarget = (id: string) => {
    setDrawerInitialTab("summary");
    setSelectedTargetId(id);
  };

  const handleTraceTarget = (id: string) => {
    setDrawerInitialTab("path");
    setSelectedTargetId(id);
  };

  // Subscribe to Traceroute events with proper cleanups!
  useEffect(() => {
    let unlistenStarted: (() => void) | null = null;
    let unlistenHop: (() => void) | null = null;
    let unlistenCompleted: (() => void) | null = null;
    let unlistenCancelled: (() => void) | null = null;
    let unlistenFailed: (() => void) | null = null;

    subscribeToTracerouteStarted((payload) => {
      onTraceStarted(payload);
    }).then((unlisten) => { unlistenStarted = unlisten; });

    subscribeToTracerouteHop((payload) => {
      onHopArrived(payload);
    }).then((unlisten) => { unlistenHop = unlisten; });

    subscribeToTracerouteCompleted((payload) => {
      onTraceCompleted(payload);
    }).then((unlisten) => { unlistenCompleted = unlisten; });

    subscribeToTracerouteCancelled((payload) => {
      onTraceCancelled(payload);
    }).then((unlisten) => { unlistenCancelled = unlisten; });

    subscribeToTracerouteFailed((payload) => {
      onTraceFailed(payload);
    }).then((unlisten) => { unlistenFailed = unlisten; });

    return () => {
      if (unlistenStarted) unlistenStarted();
      if (unlistenHop) unlistenHop();
      if (unlistenCompleted) unlistenCompleted();
      if (unlistenCancelled) unlistenCancelled();
      if (unlistenFailed) unlistenFailed();
    };
  }, [onTraceStarted, onHopArrived, onTraceCompleted, onTraceCancelled, onTraceFailed]);

  // Load targets, groups and profiles on mount
  useEffect(() => {
    fetchTargets();
    fetchGroups();
    fetchProfiles();

    // Request notification permission
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [fetchTargets, fetchGroups, fetchProfiles]);

  // Subscribe to Alert Notifications
  useEffect(() => {
    let unlistenOpened: (() => void) | null = null;
    let unlistenResolved: (() => void) | null = null;

    listen<any>("alert:incident_opened", (event) => {
      const { title, summary } = event.payload;
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(title, { body: summary });
      }
    }).then((unlisten) => {
      unlistenOpened = unlisten;
    });

    listen<any>("alert:incident_resolved", (event) => {
      const { title, summary } = event.payload;
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(title, { body: summary });
      }
    }).then((unlisten) => {
      unlistenResolved = unlisten;
    });

    return () => {
      if (unlistenOpened) unlistenOpened();
      if (unlistenResolved) unlistenResolved();
    };
  }, []);

  // Subscribe to Tauri real-time event updates with proper cleanup!
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    subscribeToProbeUpdates((result) => {
      handleProbeUpdate(result);
    })
      .then((unlisten) => {
        unlistenFn = unlisten;
      })
      .catch((err) => {
        console.error("Failed to subscribe to probe updates:", err);
      });

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [handleProbeUpdate]);

  // Calculate problem count
  const problemsCount = targets.filter((t) => {
    const res = probeResults[t.id];
    return res && !probingTargets[t.id] && (res.error || (res.http_status && (res.http_status < 200 || res.http_status >= 400)));
  }).length;

  const testedCount = Object.keys(probeResults).length;
  const totalCount = targets.length;

  // Group targets by category
  const categories = groupTargetsByCategory(targets);

  const selectedTarget = targets.find((t) => t.id === selectedTargetId);
  const selectedResult = selectedTargetId ? probeResults[selectedTargetId] : undefined;

  // Select target from log click-through
  const handleTargetSelectFromLog = (name: string) => {
    const target = targets.find((t) => t.name === name || t.id === name);
    if (target) {
      setSelectedTargetId(target.id);
    }
  };

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab} problemsCount={problemsCount}>
      
      {/* Header */}
      <Header
        isProbingAll={isProbingAll}
        onProbeAll={probeAll}
        testedCount={testedCount}
        totalCount={totalCount}
      />

      {/* Main Area based on Active Tab */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden pb-10">
        {activeTab === "overview" && (
          <Overview
            targets={targets}
            probeResults={probeResults}
            probingTargets={probingTargets}
            isProbingAll={isProbingAll}
            onProbeAll={probeAll}
            onSelectTab={setActiveTab}
            onSelectTarget={handleSelectTarget}
          />
        )}
        {activeTab === "targets" && (
          <TargetGrid
            categories={categories}
            probeResults={probeResults}
            probingTargets={probingTargets}
            onSelectTarget={handleSelectTarget}
            onRetestTarget={probeOne}
            onTraceTarget={handleTraceTarget}
          />
        )}
        {activeTab === "problems" && (
          <Problems
            targets={targets}
            probeResults={probeResults}
            probingTargets={probingTargets}
            onSelectTarget={handleSelectTarget}
            onRetestTarget={probeOne}
          />
        )}
        {activeTab === "path" && <TracerouteView targets={targets} />}
        {activeTab === "settings" && <Settings />}
        {activeTab === "schedules" && <Schedules />}
        {activeTab === "history" && <HistoryLog />}
        {activeTab === "operations" && <FailedRequests />}
        {activeTab === "investigations" && <Investigations />}
        {activeTab === "performance" && <Performance />}
        {activeTab === "privacy" && <Privacy />}
      </div>

      {/* Details Side Drawer */}
      <AnimatePresence>
        {selectedTargetId && selectedTarget && (
          <ProbeDetailsDrawer
            target={selectedTarget}
            result={selectedResult}
            isProbing={!!probingTargets[selectedTarget.id]}
            onClose={() => setSelectedTargetId(null)}
            onRetest={() => probeOne(selectedTarget.id)}
            initialTab={drawerInitialTab}
          />
        )}
      </AnimatePresence>

      {/* Global Logs Bottom Panel */}
      <GlobalLogPanel
        logs={globalLogs}
        onClear={clearLogs}
        isOpen={showGlobalLogs}
        onToggle={() => setShowGlobalLogs(!showGlobalLogs)}
        onTargetSelect={handleTargetSelectFromLog}
      />

    </AppShell>
  );
};

export default App;
