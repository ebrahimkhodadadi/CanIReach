import React, { useMemo } from "react";
import { Target, ProbeResult } from "../../probes/types";
import { LiveAnalyzerCard } from "./LiveAnalyzerCard";
import { useContinuousMonitorStore } from "../../continuous-monitor/store/continuousMonitorStore";
import { useFailedRequestsStore } from "../../failed-requests/store/failedRequestsStore";
import { listen } from "@tauri-apps/api/event";
import { mapProbeResultToTargetCheckResult } from "../../../features/monitoring/services/monitoringMapper";
import { 
  Broadcast, 
  Globe, 
  WarningCircle, 
  Gear, 
  ShieldCheck, 
  ArrowRight,
  Clock
} from "@phosphor-icons/react";
import { 
  StatusDot, 
  StatusBadge, 
  MetricCard, 
  Panel, 
  EmptyState 
} from "../../../components/shared/Primitives";

interface OverviewProps {
  targets: Target[];
  probeResults: Record<string, ProbeResult>;
  probingTargets: Record<string, boolean>;
  isProbingAll: boolean;
  onProbeAll: () => void;
  onSelectTab: (tab: string) => void;
  onSelectTarget: (id: string) => void;
}

export const Overview: React.FC<OverviewProps> = ({
  targets,
  probeResults,
  probingTargets,
  isProbingAll,
  onProbeAll,
  onSelectTab,
  onSelectTarget,
}) => {
  const [networkChanged, setNetworkChanged] = React.useState(false);
  const monitorSessions = useContinuousMonitorStore((s) => s.sessions);
  const activeMonitorsCount = Object.values(monitorSessions).filter((s) => s.state === "running").length;
  const failedRequestsStore = useFailedRequestsStore();
  const failedRequestsCount = failedRequestsStore.requests.length;

  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("network-change-detected", () => {
      setNetworkChanged(true);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);
  // Map raw probe results to normalized monitoring results
  const monitoringResults = useMemo(() => {
    return targets.map((t) => {
      const isChecking = !!probingTargets[t.id];
      const res = probeResults[t.id];
      return mapProbeResultToTargetCheckResult(t, res, isChecking);
    });
  }, [targets, probeResults, probingTargets]);

  // Aggregate stats
  const stats = useMemo(() => {
    let healthy = 0;
    let degraded = 0;
    let unreachable = 0;
    let checking = 0;
    let unknown = 0;
    let openProblems = 0;
    let lastCheckedTime: Date | null = null;

    for (const res of monitoringResults) {
      if (res.status === "healthy") healthy++;
      else if (res.status === "degraded") degraded++;
      else if (res.status === "unreachable") unreachable++;
      else if (res.status === "checking") checking++;
      else unknown++;

      if (res.status === "unreachable" || res.status === "degraded") {
        openProblems++;
      }

      if (res.checkedAt && res.checkedAt !== new Date(0).toISOString()) {
        const d = new Date(res.checkedAt);
        if (!lastCheckedTime || d > lastCheckedTime) {
          lastCheckedTime = d;
        }
      }
    }

    return {
      total: targets.length,
      healthy,
      degraded,
      unreachable,
      checking,
      unknown,
      openProblems,
      lastCheck: lastCheckedTime ? lastCheckedTime.toLocaleTimeString() : "Never"
    };
  }, [monitoringResults, targets]);

  // Calculate actual median latency for valid/healthy tests
  const medianLatency = useMemo(() => {
    const latencies = targets
      .map(t => probeResults[t.id])
      .filter(r => r && r.status === "success" && r.latency_ms !== undefined && r.latency_ms > 0)
      .map(r => r!.latency_ms);
      
    if (latencies.length === 0) return "—";
    
    latencies.sort((a, b) => a - b);
    const mid = Math.floor(latencies.length / 2);
    return latencies.length % 2 !== 0 
      ? `${latencies[mid]}ms` 
      : `${Math.round((latencies[mid - 1] + latencies[mid]) / 2)}ms`;
  }, [targets, probeResults]);

  // Extract recent problems list
  const recentProblems = useMemo(() => {
    return monitoringResults
      .filter((res) => res.status === "unreachable" || res.status === "degraded")
      .map((res) => ({
        id: res.targetId,
        name: res.targetName,
        category: res.error?.category || "unknown",
        severity: res.error?.severity || "medium",
        message: res.error?.userMessage || "Connectivity issues detected",
        checkedAt: res.checkedAt
      }))
      .slice(0, 5);
  }, [monitoringResults]);

  // Activity events mapped from current probing states and results
  const recentActivity = useMemo(() => {
    const activity: { id: string; type: string; message: string; time: string }[] = [];

    monitoringResults.forEach((res) => {
      if (res.status === "checking") {
        activity.push({
          id: `checking-${res.targetId}`,
          type: "checking",
          message: `Connectivity check started for ${res.targetName}`,
          time: new Date().toLocaleTimeString()
        });
      } else if (res.checkedAt && res.checkedAt !== new Date(0).toISOString()) {
        if (res.status === "healthy") {
          activity.push({
            id: `healthy-${res.targetId}`,
            type: "healthy",
            message: `Target ${res.targetName} is reachable`,
            time: new Date(res.checkedAt).toLocaleTimeString()
          });
        } else if (res.status === "unreachable") {
          activity.push({
            id: `unreachable-${res.targetId}`,
            type: "unreachable",
            message: `Target ${res.targetName} became unreachable (${res.error?.userMessage || "timeout"})`,
            time: new Date(res.checkedAt).toLocaleTimeString()
          });
        } else if (res.status === "degraded") {
          activity.push({
            id: `degraded-${res.targetId}`,
            type: "degraded",
            message: `Target ${res.targetName} connection is degraded (HTTP status ${res.http?.statusCode})`,
            time: new Date(res.checkedAt).toLocaleTimeString()
          });
        }
      }
    });

    return activity.slice(0, 5);
  }, [monitoringResults]);

  // Health color indicator details
  const healthIndicator = useMemo(() => {
    if (stats.checking > 0) {
      return {
        label: "Checking endpoints...",
        border: "border-[var(--color-warning)]",
        bg: "bg-[var(--color-warning-soft)]",
        color: "text-[var(--color-warning)]",
        desc: "Active probing in progress. Telemetry buffers are updating..."
      };
    }
    if (stats.unreachable > 0) {
      return {
        label: "Critical Problems Open",
        border: "border-[var(--color-danger)]",
        bg: "bg-[var(--color-danger-soft)]",
        color: "text-[var(--color-danger)]",
        desc: `${stats.unreachable} target(s) are completely down or failed checks.`
      };
    }
    if (stats.degraded > 0) {
      return {
        label: "Degraded Connection States",
        border: "border-[var(--color-warning)]",
        bg: "bg-[var(--color-warning-soft)]",
        color: "text-[var(--color-warning)]",
        desc: `${stats.degraded} target(s) returned warning thresholds or HTTP errors.`
      };
    }
    if (stats.healthy > 0) {
      return {
        label: "All Systems Operational",
        border: "border-[var(--color-success)]",
        bg: "bg-[var(--color-success-soft)]",
        color: "text-[var(--color-success)]",
        desc: "All configured endpoints resolved and connected successfully."
      };
    }
    return {
      label: "Console Idle",
      border: "border-[var(--color-border-default)]",
      bg: "bg-[var(--color-bg-panel)]",
      color: "text-[var(--color-text-secondary)]",
      desc: "No metrics collected. Trigger a connectivity check to collect network states."
    };
  }, [stats]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

      {/* Network Connection Change Banner */}
      {networkChanged && (
        <div className="p-4 rounded border border-[var(--color-warning)] bg-[var(--color-warning-soft)] flex items-center justify-between gap-4 select-none animate-pulse">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold tracking-tight text-[var(--color-warning)] flex items-center gap-2">
              <WarningCircle size={16} />
              Network Connection Changed
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              An active interface, VPN route, or gateway address swap was detected. Previous results may no longer represent current status.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setNetworkChanged(false);
                onProbeAll();
              }}
              className="px-3 py-1.5 bg-[var(--color-warning)] text-black font-semibold rounded text-xs transition-all active:scale-[0.98] cursor-pointer"
            >
              Retest Now
            </button>
            <button
              onClick={() => setNetworkChanged(false)}
              className="px-2 py-1.5 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] rounded text-xs transition-all cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 1. Health Status Banner */}
      <div className={`p-4 rounded border flex items-center justify-between gap-4 select-none ${healthIndicator.border} ${healthIndicator.bg}`}>
        <div className="space-y-0.5">
          <span className="text-[9px] uppercase font-bold tracking-wider opacity-60 font-mono text-[var(--color-text-secondary)]">
            Network Health Summary
          </span>
          <h2 className={`text-sm font-bold tracking-tight flex items-center gap-2 ${healthIndicator.color}`}>
            <StatusDot status={stats.unreachable > 0 ? "unreachable" : stats.degraded > 0 ? "degraded" : stats.checking > 0 ? "checking" : stats.healthy > 0 ? "healthy" : "unknown"} />
            {healthIndicator.label}
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">{healthIndicator.desc}</p>
        </div>
        <button
          onClick={onProbeAll}
          disabled={isProbingAll}
          className="px-3 py-1.5 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-semibold rounded text-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
        >
          {isProbingAll ? "Diagnosing Paths..." : "Run Connectivity Check"}
        </button>
      </div>

      {/* 2. KPI Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Total Targets"
          value={stats.total}
          desc="Configured endpoints"
          icon={Globe}
        />
        <MetricCard
          label="Healthy"
          value={stats.healthy}
          desc="Connected successfully"
          color="text-[var(--color-success)]"
          icon={ShieldCheck}
        />
        <MetricCard
          label="Active Problems"
          value={stats.openProblems}
          desc="Degraded or down"
          color={stats.openProblems > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-text-secondary)]"}
          icon={WarningCircle}
        />
        <MetricCard
          label="Median Latency"
          value={medianLatency}
          desc="Successful TCP/HTTP RTT"
          color="text-[var(--color-accent-secondary)]"
          isMono
          icon={Clock}
        />
        <MetricCard
          label="Failed Requests"
          value={failedRequestsCount}
          desc="Logged failures"
          color="text-[var(--color-danger)]"
          icon={WarningCircle}
          onClick={() => onSelectTab("operations")}
        />
        <MetricCard
          label="Active Monitors"
          value={activeMonitorsCount}
          desc="Continuous tests"
          color="text-[var(--color-success)]"
          icon={Broadcast}
        />
      </div>

      {/* Live Stability Analyzer Panel */}
      <LiveAnalyzerCard />

      {/* 3. Endpoint Health Distribution */}
      <div className="console-panel p-4 space-y-3 select-none">
        <div className="flex items-center justify-between w-full border-b border-[var(--color-border-subtle)] pb-1.5">
          <h3 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider font-mono">
            Target Health Distribution
          </h3>
          <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
            Last evaluated: {stats.lastCheck}
          </span>
        </div>

        <div className="space-y-3">
          {/* Segmented Horizontal Bar */}
          <div className="w-full bg-[var(--color-bg-input)] rounded h-2 overflow-hidden flex">
            {stats.total > 0 ? (
              <>
                <div className="bg-[var(--color-success)] h-full transition-all duration-300" style={{ width: `${(stats.healthy / stats.total) * 100}%` }} title="Healthy" />
                <div className="bg-[var(--color-warning)] h-full transition-all duration-300" style={{ width: `${(stats.degraded / stats.total) * 100}%` }} title="Degraded" />
                <div className="bg-[var(--color-danger)] h-full transition-all duration-300" style={{ width: `${(stats.unreachable / stats.total) * 100}%` }} title="Unreachable" />
                <div className="bg-[var(--color-info)] h-full transition-all duration-300 animate-pulse" style={{ width: `${(stats.checking / stats.total) * 100}%` }} title="Checking" />
                <div className="bg-[var(--color-unknown)] h-full transition-all duration-300" style={{ width: `${(stats.unknown / stats.total) * 100}%` }} title="Unknown" />
              </>
            ) : (
              <div className="bg-[var(--color-unknown)] w-full h-full" />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10px] text-[var(--color-text-secondary)] font-mono">
            <span className="flex items-center gap-1.5 cursor-pointer hover:text-[var(--color-text-primary)]" onClick={() => onSelectTab("targets")}>
              <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
              Healthy: {stats.healthy} ({stats.total > 0 ? Math.round((stats.healthy / stats.total) * 100) : 0}%)
            </span>
            <span className="flex items-center gap-1.5 cursor-pointer hover:text-[var(--color-text-primary)]" onClick={() => onSelectTab("problems")}>
              <span className="w-2 h-2 rounded-full bg-[var(--color-warning)]" />
              Degraded: {stats.degraded}
            </span>
            <span className="flex items-center gap-1.5 cursor-pointer hover:text-[var(--color-text-primary)]" onClick={() => onSelectTab("problems")}>
              <span className="w-2 h-2 rounded-full bg-[var(--color-danger)]" />
              Unreachable: {stats.unreachable}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--color-info)] animate-pulse" />
              Checking: {stats.checking}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--color-unknown)]" />
              Unknown: {stats.unknown}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Problems vs Activity split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Open Problems Panel */}
        <Panel 
          title="Open Incidents" 
          icon={WarningCircle}
          heightClass="h-72"
        >
          <div className="space-y-2">
            {recentProblems.length > 0 ? (
              recentProblems.map((prob) => (
                <div
                  key={prob.id}
                  onClick={() => onSelectTarget(prob.id)}
                  className="p-2 border border-[var(--color-border-subtle)] bg-[var(--color-bg-app)]/30 hover:bg-[var(--color-bg-panel-hover)] rounded cursor-pointer flex items-center justify-between gap-3 text-xs transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--color-text-primary)] truncate">{prob.name}</div>
                    <div className="text-[10px] text-[var(--color-text-secondary)] mt-0.5 truncate">{prob.message}</div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <StatusBadge status={prob.severity} className="text-[9px]" />
                    <span className="text-[9px] font-mono text-[var(--color-text-muted)]">{new Date(prob.checkedAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="NO ACTIVE INCIDENTS"
                description="All monitored network endpoints are healthy and resolving correctly."
              />
            )}
          </div>
        </Panel>

        {/* Activity Feed Panel */}
        <Panel 
          title="Active Monitoring Feed" 
          icon={Broadcast}
          heightClass="h-72"
        >
          <div className="space-y-3">
            {recentActivity.length > 0 ? (
              recentActivity.map((act) => {
                let badgeClass = "healthy";
                if (act.type === "unreachable") badgeClass = "unreachable";
                else if (act.type === "degraded") badgeClass = "degraded";

                return (
                  <div key={act.id} className="flex gap-2.5 text-xs leading-normal font-mono border-b border-[var(--color-border-subtle)] pb-2 last:border-0 last:pb-0">
                    <StatusDot status={badgeClass} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[var(--color-text-primary)] text-[11px] font-semibold">{act.message}</p>
                      <span className="text-[9px] text-[var(--color-text-muted)] block mt-0.5">{act.time}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState
                title="NO LOGS AVAILABLE"
                description="Trigger a connectivity check or enable schedules to start streaming realtime telemetry."
              />
            )}
          </div>
        </Panel>

      </div>

      {/* 5. Quick Actions Panel */}
      <div className="console-panel p-4">
        <h3 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3 font-mono border-b border-[var(--color-border-subtle)] pb-1.5 select-none">
          Console Shortcuts
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Connectivity Check", action: onProbeAll, desc: "Probe all endpoints", icon: ShieldCheck },
            { label: "Problems Center", action: () => onSelectTab("problems"), desc: "View incident timeline", icon: WarningCircle },
            { label: "Targets Table", action: () => onSelectTab("targets"), desc: "Manage Category list", icon: Globe },
            { label: "Settings Dashboard", action: () => onSelectTab("settings"), desc: "Edit network profiles", icon: Gear },
            { label: "Failed Requests", action: () => onSelectTab("operations"), desc: "View observed failures", icon: WarningCircle },
            { label: "Continuous Monitors", action: () => onSelectTab("targets"), desc: "Manage active monitors", icon: Broadcast },
          ].map((act, idx) => {
            const Icon = act.icon;
            return (
              <button
                key={idx}
                onClick={act.action}
                className="console-card p-3 text-left transition-all cursor-pointer group flex flex-col justify-between gap-2 h-20"
              >
                <div className="flex items-center justify-between w-full">
                  <Icon size={14} className="text-[var(--color-accent-primary)]" />
                  <ArrowRight size={10} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)] transition-colors" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-[var(--color-text-primary)]">{act.label}</div>
                  <div className="text-[9px] text-[var(--color-text-secondary)] mt-0.5">{act.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
};
