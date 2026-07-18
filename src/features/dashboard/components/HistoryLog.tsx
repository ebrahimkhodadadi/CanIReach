import React, { useEffect, useState } from "react";
import { 
  queryMonitoringHistory, 
  getHistorySummary, 
  deleteMonitoringHistory,
  getTargets
} from "../../probes/api/probeCommands";
import { 
  CheckCircle, 
  XCircle, 
  WarningCircle, 
  Trash,
  Database,
  Timer,
  ChartBar,
  CaretDown,
  CaretUp
} from "@phosphor-icons/react";
import { MetricCard } from "../../../components/shared/Primitives";

export const HistoryLog: React.FC = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({
    total_runs: 0,
    passed_runs: 0,
    failed_runs: 0,
    open_incidents: 0,
    average_latency_ms: 0,
    uptime_percentage: 100
  });
  
  const [targets, setTargets] = useState<any[]>([]);
  const [targetFilter, setTargetFilter] = useState("");
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const h = await queryMonitoringHistory(targetFilter || undefined, limit, offset);
      setHistory(h);
      const s = await getHistorySummary();
      setSummary(s);
      const t = await getTargets();
      setTargets(t);
    } catch (e) {
      console.error("Failed to load history data:", e);
    }
  };

  useEffect(() => {
    loadData();
  }, [targetFilter, limit, offset]);

  const handleClearHistory = async () => {
    if (!confirm("Are you sure you want to permanently delete all monitoring history, batches, incidents, and alert logs?")) return;
    try {
      await deleteMonitoringHistory();
      await loadData();
    } catch (e) {
      alert(`Failed to clear: ${e}`);
    }
  };

  const getTargetName = (id: string) => {
    return targets.find(t => t.id === id)?.name || id;
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString();
    } catch {
      return isoString;
    }
  };

  const toggleExpandRun = (id: string) => {
    if (expandedRunId === id) {
      setExpandedRunId(null);
    } else {
      setExpandedRunId(id);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[var(--color-bg-app)] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] pb-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">Monitoring Logs & Diagnostics</h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">View detailed historical runs, protocol timing evidence, and incident reports</p>
        </div>
        <button
          onClick={handleClearHistory}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--color-danger-soft)] hover:bg-[var(--color-danger)]/20 border border-[var(--color-danger)]/25 text-[var(--color-danger)] rounded text-xs font-semibold cursor-pointer"
        >
          <Trash size={13} />
          Clear History
        </button>
      </div>

      {/* Stats Summary Widgets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 select-none">
        <MetricCard
          label="Total Runs"
          value={summary.total_runs}
          desc="Database audit runs"
          icon={Database}
        />
        <MetricCard
          label="Uptime Ratio"
          value={`${summary.uptime_percentage.toFixed(2)}%`}
          desc="Egress availability success"
          color="text-[var(--color-success)]"
          icon={ChartBar}
        />
        <MetricCard
          label="Average Latency"
          value={`${summary.average_latency_ms.toFixed(1)}ms`}
          desc="Median timing averages"
          color="text-[var(--color-accent-secondary)]"
          isMono
          icon={Timer}
        />
        <MetricCard
          label="Active Incidents"
          value={summary.open_incidents}
          desc="Ongoing unreachability problems"
          color={summary.open_incidents > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-text-secondary)]"}
          icon={WarningCircle}
        />
      </div>

      {/* Filter Toolbar */}
      <div className="flex items-center justify-between gap-4 bg-[var(--color-bg-panel)]/30 border border-[var(--color-border-default)] rounded p-2.5 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)] font-mono">Filter Target:</span>
          <select
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
            className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] rounded px-2.5 py-1 text-xs outline-none cursor-pointer focus:border-[var(--color-border-strong)]"
          >
            <option value="">All Targets</option>
            {targets.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2.5 text-xs text-[var(--color-text-secondary)] font-mono">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-2 py-1 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded hover:bg-[var(--color-bg-panel-hover)] disabled:opacity-40 cursor-pointer"
          >
            Prev
          </button>
          <span>Page {Math.floor(offset / limit) + 1}</span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={history.length < limit}
            className="px-2 py-1 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded hover:bg-[var(--color-bg-panel-hover)] disabled:opacity-40 cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>

      {/* History Log Table */}
      <div className="border border-[var(--color-border-default)] rounded bg-[var(--color-bg-panel)]/40 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-topbar)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
              <th className="py-2.5 px-4">Endpoint</th>
              <th className="py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4">Latency</th>
              <th className="py-2.5 px-4">HTTP Status</th>
              <th className="py-2.5 px-4">Profile</th>
              <th className="py-2.5 px-4">Error Code</th>
              <th className="py-2.5 px-4">Observed Time</th>
              <th className="py-2.5 px-4 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-subtle)] text-xs text-[var(--color-text-primary)]">
            {history.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-[var(--color-text-muted)] font-medium">
                  No historical monitor records found.
                </td>
              </tr>
            ) : (
              history.map((run) => {
                const isExpanded = expandedRunId === run.id;
                return (
                  <React.Fragment key={run.id}>
                    <tr 
                      onClick={() => toggleExpandRun(run.id)}
                      className="hover:bg-[var(--color-bg-panel-hover)] transition-all cursor-pointer"
                    >
                      <td className="py-3 px-4 font-bold text-[var(--color-text-primary)]">
                        {getTargetName(run.target_id)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`flex items-center gap-1.5 font-semibold font-mono text-[11px] ${
                          run.status === "healthy" ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"
                        }`}>
                          {run.status === "healthy" ? <CheckCircle size={14} /> : <XCircle size={14} />}
                          {run.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        {run.latency_ms !== null ? `${run.latency_ms} ms` : "—"}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        {run.http_status || "—"}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] bg-[var(--color-bg-input)] px-1.5 py-0.5 rounded text-[var(--color-accent-primary)] border border-[var(--color-border-subtle)]">
                          {run.profile_id}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[10px] text-[var(--color-warning)] font-semibold">
                        {run.primary_failure_code || "—"}
                      </td>
                      <td className="py-3 px-4 text-[var(--color-text-secondary)] font-mono text-[10px]">
                        {formatTime(run.started_at)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isExpanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-[var(--color-bg-input)]/30">
                        <td colSpan={8} className="p-4 border-t border-b border-[var(--color-border-subtle)]">
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider font-mono">Protocol Timing Evidence Snapshot</h4>
                            {run.technical_evidence ? (
                              <pre className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-[10px] text-[var(--color-text-primary)] font-mono p-3 rounded overflow-x-auto max-h-60">
                                {JSON.stringify(JSON.parse(run.technical_evidence), null, 2)}
                              </pre>
                            ) : (
                              <p className="text-[11px] text-[var(--color-text-muted)]">No protocol timing data logged.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
