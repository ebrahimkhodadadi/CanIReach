import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  ArrowClockwise, 
  X,
  Funnel,
  ShieldCheck,
  FileText
} from "@phosphor-icons/react";
import { getTargets, getNetworkProfiles } from "../../probes/api/probeCommands";
import { MetricCard } from "../../../components/shared/Primitives";

export const FailedRequests: React.FC = () => {
  const [operations, setOperations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  
  // Filters
  const [opTypeFilter, setOpTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  
  const [selectedOp, setSelectedOp] = useState<any | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const ops: any[] = await invoke("query_network_operations", {
        limit: 100,
        offset: 0,
        operationType: opTypeFilter || undefined,
        status: statusFilter || undefined
      });
      setOperations(ops);

      const ts = await getTargets();
      setTargets(ts);

      const ps = await getNetworkProfiles();
      setProfiles(ps);
    } catch (err) {
      console.error("Failed to load operations", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [opTypeFilter, statusFilter]);

  const getTargetName = (id?: string) => {
    if (!id) return "Unknown Target";
    const found = targets.find(t => t.id === id);
    return found ? found.name : id;
  };

  const getProfileName = (id?: string) => {
    if (!id) return "System Default";
    if (id === "system-default") return "System Default";
    const found = profiles.find(p => p.id === id);
    return found ? found.name : id;
  };

  // Helper to calculate statistics
  const stats = {
    total: operations.length,
    dns: operations.filter(o => o.operation_type === "dns").length,
    tcp: operations.filter(o => o.operation_type === "tcp").length,
    tls: operations.filter(o => o.operation_type === "tls").length,
    http: operations.filter(o => o.operation_type === "http").length,
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[var(--color-bg-app)] p-4 space-y-4">
      
      {/* 1. Permanent Scope / Privacy Notice Banner */}
      <div className="flex items-start gap-3 p-3.5 rounded border border-[var(--color-info)]/20 bg-[var(--color-info-soft)] text-[var(--color-info)] select-none">
        <ShieldCheck size={18} className="shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-bold uppercase font-mono tracking-wider text-[10px]">Privacy-Preserving Access Analysis Scope</p>
          <p className="text-[var(--color-text-secondary)] leading-relaxed">
            This registry displays isolated network operations generated exclusively by CanIReach. It does not monitor traffic from external operating system processes. All HTTP Authorization credentials, cookie strings, and proxy handshakes are automatically redacted at the core layer.
          </p>
        </div>
      </div>

      {/* 2. Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] pb-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">Failed Operations Registry</h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Review and inspect failed diagnostic steps initiated by the application</p>
        </div>
        <button 
          onClick={loadData}
          disabled={loading}
          className="flex items-center justify-center p-1.5 rounded bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] text-[var(--color-text-primary)] cursor-pointer transition-colors active:scale-95 disabled:opacity-50"
          title="Refresh Registry"
        >
          <ArrowClockwise size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* 3. Stats Widgets */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 select-none">
        <MetricCard
          label="Total Failures"
          value={stats.total}
          desc="Logged registry errors"
        />
        <MetricCard
          label="DNS Resolves"
          value={stats.dns}
          desc="Unresolved hostname steps"
          color="text-[var(--color-warning)]"
        />
        <MetricCard
          label="TCP Resets"
          value={stats.tcp}
          desc="Timeouts & socket failures"
          color="text-[var(--color-danger)]"
        />
        <MetricCard
          label="TLS Shakes"
          value={stats.tls}
          desc="Negotiation handshakes"
          color="text-[var(--color-purple)]"
        />
        <MetricCard
          label="HTTP Errors"
          value={stats.http}
          desc="Bad response status logs"
          color="text-[var(--color-accent-secondary)]"
        />
      </div>

      {/* 4. Filters Box */}
      <div className="flex flex-wrap items-center gap-3 bg-[var(--color-bg-panel)]/30 border border-[var(--color-border-default)] rounded p-2.5 shrink-0 select-none">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] font-mono">
          <Funnel size={14} className="text-[var(--color-accent-primary)]" />
          <span>Filters:</span>
        </div>
        
        {/* Operation Type Filter */}
        <select 
          value={opTypeFilter} 
          onChange={(e) => setOpTypeFilter(e.target.value)}
          className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-xs text-[var(--color-text-primary)] rounded px-2.5 py-1 focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer font-mono"
        >
          <option value="">All Types</option>
          <option value="dns">DNS Resolution</option>
          <option value="tcp">TCP Connection</option>
          <option value="tls">TLS Handshake</option>
          <option value="http">HTTP Request</option>
        </select>

        {/* Status Filter */}
        <select 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-xs text-[var(--color-text-primary)] rounded px-2.5 py-1 focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer font-mono"
        >
          <option value="">All Statuses</option>
          <option value="failed">Failed</option>
          <option value="timed_out">Timed Out</option>
          <option value="suspicious">Suspicious</option>
        </select>
      </div>

      {/* 5. Operations List Table */}
      <div className="border border-[var(--color-border-default)] rounded bg-[var(--color-bg-panel)]/40 overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-topbar)] text-[10px] uppercase font-bold text-[var(--color-text-secondary)] tracking-wider">
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-4 py-2.5">Target</th>
                <th className="px-4 py-2.5">Profile</th>
                <th className="px-4 py-2.5">Operation</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Duration</th>
                <th className="px-4 py-2.5">Summary / Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)] text-xs text-[var(--color-text-primary)]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[var(--color-text-muted)]">
                    Loading recorded failures...
                  </td>
                </tr>
              ) : operations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[var(--color-text-muted)] font-medium">
                    No failed network operations match current filters.
                  </td>
                </tr>
              ) : (
                operations.map((op) => (
                  <tr 
                    key={op.id} 
                    onClick={() => setSelectedOp(op)}
                    className="hover:bg-[var(--color-bg-panel-hover)] cursor-pointer transition-all duration-100"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-[var(--color-text-muted)] font-mono">
                      {new Date(op.started_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[var(--color-text-primary)]">
                      {getTargetName(op.target_id)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {getProfileName(op.profile_id)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="capitalize font-mono px-1.5 py-0.5 rounded bg-[var(--color-bg-input)] text-[var(--color-accent-primary)] border border-[var(--color-border-subtle)] text-[10px]">
                        {op.operation_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase font-mono ${
                        op.status === "timed_out" ? "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]/20" :
                        op.status === "suspicious" ? "bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info)]/20" :
                        "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/20"
                      }`}>
                        {op.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--color-text-secondary)]">
                      {op.duration_ms ? `${op.duration_ms} ms` : "—"}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-[var(--color-text-secondary)]" title={op.summary}>
                      {op.summary}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Operation Details Drawer/Modal */}
      {selectedOp && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-[500px] h-full bg-[var(--color-bg-panel-elevated)] border-l border-[var(--color-border-strong)] p-5 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex flex-col min-h-0 flex-1 space-y-5">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] pb-3">
                <div>
                  <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">Operation Details</h3>
                  <p className="text-[10px] text-[var(--color-text-muted)] font-mono mt-0.5">{selectedOp.id}</p>
                </div>
                <button 
                  onClick={() => setSelectedOp(null)}
                  className="p-1 rounded hover:bg-[var(--color-bg-panel-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Scrollable details */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs text-[var(--color-text-primary)]">
                <div className="grid grid-cols-2 gap-3 bg-[var(--color-bg-panel)] border border-[var(--color-border-default)] rounded p-3 select-none">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Operation Type</span>
                    <p className="font-mono text-[var(--color-text-primary)] mt-0.5 capitalize">{selectedOp.operation_type}</p>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Status</span>
                    <p className="font-mono text-[var(--color-text-primary)] mt-0.5 uppercase">{selectedOp.status}</p>
                  </div>
                  <div className="mt-2">
                    <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Duration</span>
                    <p className="text-[var(--color-text-primary)] mt-0.5 font-mono">{selectedOp.duration_ms ? `${selectedOp.duration_ms} ms` : "N/A"}</p>
                  </div>
                  <div className="mt-2">
                    <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Started At</span>
                    <p className="text-[var(--color-text-primary)] mt-0.5 font-mono">{new Date(selectedOp.started_at).toLocaleString()}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Summary</span>
                  <div className="p-3 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded text-[var(--color-text-primary)] leading-relaxed">
                    {selectedOp.summary}
                  </div>
                </div>

                {selectedOp.failure_code && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">OS Error / Failure Code</span>
                    <div className="p-3 bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 text-[var(--color-danger)] font-mono rounded font-semibold">
                      {selectedOp.failure_code}
                    </div>
                  </div>
                )}

                {/* Metadata JSON views (read-only, sanitized) */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono flex items-center gap-1.5">
                      <FileText size={12} /> Request Context
                    </span>
                    <pre className="p-3 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded font-mono text-[10px] text-[var(--color-accent-primary-hover)] overflow-x-auto max-h-40">
                      {selectedOp.request_metadata ? 
                        JSON.stringify(JSON.parse(selectedOp.request_metadata), null, 2) : 
                        "// No request metadata recorded"
                      }
                    </pre>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono flex items-center gap-1.5">
                      <FileText size={12} /> Response Context
                    </span>
                    <pre className="p-3 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded font-mono text-[10px] text-[var(--color-success)] overflow-x-auto max-h-40">
                      {selectedOp.response_metadata ? 
                        JSON.stringify(JSON.parse(selectedOp.response_metadata), null, 2) : 
                        "// No response metadata recorded"
                      }
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default FailedRequests;
