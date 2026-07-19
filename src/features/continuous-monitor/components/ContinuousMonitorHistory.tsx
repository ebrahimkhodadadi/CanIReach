import { useEffect } from "react";
import { ArrowClockwise, X, WarningCircle, CheckCircle } from "@phosphor-icons/react";
import { useContinuousMonitorStore } from "../store/continuousMonitorStore";

interface ContinuousMonitorHistoryProps {
  targetId: string;
  targetName: string;
  onClose: () => void;
}

export const ContinuousMonitorHistory: React.FC<ContinuousMonitorHistoryProps> = ({
  targetId,
  targetName,
  onClose,
}) => {
  const { history, sessions, fetchHistory } = useContinuousMonitorStore();
  const runs = history[targetId] || [];
  const session = sessions[targetId];

  useEffect(() => {
    fetchHistory(targetId);
  }, [targetId, fetchHistory]);

  const uptime = session && session.total_runs > 0
    ? Math.round((session.successful_runs / session.total_runs) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm">
      <div className="w-[550px] h-full bg-[var(--color-bg-panel-elevated)] border-l border-[var(--color-border-strong)] p-5 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] pb-3 mb-4">
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">Monitor History</h3>
            <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5 truncate max-w-[400px]">{targetName}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => fetchHistory(targetId)} className="p-1.5 rounded bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] cursor-pointer"><ArrowClockwise size={13} /></button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--color-bg-panel-hover)] text-[var(--color-text-secondary)] cursor-pointer"><X size={16} /></button>
          </div>
        </div>

        {/* Stats */}
        {session && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: "Total Runs", value: String(session.total_runs) },
              { label: "Uptime", value: `${uptime}%` },
              { label: "Consecutive Failures", value: String(session.consecutive_failures) },
              { label: "Avg Latency", value: runs.length > 0 ? `${Math.round(runs.filter(r => r.latency_ms).reduce((sum, r) => sum + (r.latency_ms || 0), 0) / runs.filter(r => r.latency_ms).length)}ms` : "\u2014" },
            ].map((stat) => (
              <div key={stat.label} className="p-2.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]">
                <span className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase font-mono block">{stat.label}</span>
                <span className="text-sm font-bold font-mono text-[var(--color-text-primary)] mt-0.5 block">{stat.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Run history table */}
        <div className="flex-1 overflow-y-auto border border-[var(--color-border-default)] rounded bg-[var(--color-bg-panel)]/40">
          {runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--color-text-muted)]">
              <WarningCircle size={24} className="mb-2" />
              <p className="text-xs">No run history available.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-topbar)] text-[10px] uppercase font-bold text-[var(--color-text-secondary)] sticky top-0">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Latency</th>
                  <th className="px-3 py-2">HTTP</th>
                  <th className="px-3 py-2">Error</th>
                  <th className="px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)] text-xs">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-[var(--color-bg-panel-hover)] transition-colors">
                    <td className="px-3 py-2 font-mono text-[var(--color-text-muted)]">{run.run_index}</td>
                    <td className="px-3 py-2">
                      <span className={`flex items-center gap-1 text-[10px] font-bold font-mono ${
                        run.status === "healthy" ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"
                      }`}>
                        {run.status === "healthy" ? <CheckCircle size={10} /> : <WarningCircle size={10} />}
                        {run.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[var(--color-text-secondary)]">
                      {run.latency_ms ? `${run.latency_ms}ms` : "\u2014"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[var(--color-text-secondary)]">
                      {run.http_status || "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] text-[10px] truncate max-w-[150px]" title={run.error_message || ""}>
                      {run.error_category || "\u2014"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[var(--color-text-muted)]">
                      {new Date(run.started_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
