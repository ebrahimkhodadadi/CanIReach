import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise,
  X,
  Funnel,
  ShieldCheck,
  FileText,
  MagnifyingGlass,
  Plus,
  Eye,
  Trash,
} from "@phosphor-icons/react";
import {
  useFailedRequestsStore,
} from "../../failed-requests/store/failedRequestsStore";
import {
  getDomainSuggestions,
  addDomainToTargets,
} from "../../probes/api/probeCommands";
import { MetricCard, PaginationControls, paginateItems } from "../../../components/shared/Primitives";
import type { SourceType, FailureSeverity } from "../../failed-requests/types";

const SOURCE_BADGES: Record<SourceType, { label: string; color: string }> = {
  canireach_probe: { label: "CanIReach Probe", color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20" },
  system_observation: { label: "System", color: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
  proxy_capture: { label: "Proxy", color: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
};

const SEVERITY_BADGES: Record<FailureSeverity, string> = {
  critical: "bg-rose-500/15 text-rose-400 border-rose-500/20",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  low: "bg-slate-500/15 text-slate-400 border-slate-500/20",
};

export const FailedRequests: React.FC = () => {
  const {
    requests,
    loading,
    filters,
    selectedRequest,
    page,
    pageSize,
    fetchRequests,
    setFilters,
    setPage,
    setSelectedRequest,
    clearFilters,
    clearAll,
  } = useFailedRequestsStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [addDialogSuggestions, setAddDialogSuggestions] = useState<string[]>([]);
  const [addDialogTarget, setAddDialogTarget] = useState("");

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleRefresh = () => {
    fetchRequests();
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (q.trim()) {
      setFilters({ ...filters, host: q.trim() });
    } else {
      const { host, ...rest } = filters;
      setFilters(rest);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters };
    if (value) {
      (newFilters as any)[key] = value;
    } else {
      delete (newFilters as any)[key];
    }
    setFilters(newFilters);
  };

  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests;
    const q = searchQuery.toLowerCase();
    return requests.filter(
      (r) =>
        r.host?.toLowerCase().includes(q) ||
        r.registrable_domain?.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q)
    );
  }, [requests, searchQuery]);

  const paged = paginateItems(filteredRequests, pageSize, page);

  const stats = useMemo(() => {
    const total = requests.length;
    const critical = requests.filter((r) => r.severity === "critical").length;
    const high = requests.filter((r) => r.severity === "high").length;
    const medium = requests.filter((r) => r.severity === "medium").length;
    const low = requests.filter((r) => r.severity === "low").length;
    return { total, critical, high, medium, low };
  }, [requests]);

  const handleAddDomain = async (host: string) => {
    try {
      const suggestions = await getDomainSuggestions(host);
      setAddDialogSuggestions(suggestions);
      setAddDialogTarget(suggestions[0] || host);
      setShowAddDialog(true);
    } catch (err) {
      console.error("Failed to get domain suggestions:", err);
    }
  };

  const handleConfirmAddDomain = async () => {
    try {
      await addDomainToTargets(addDialogTarget);
      setShowAddDialog(false);
    } catch (err: any) {
      alert(err?.message || "Failed to add domain");
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[var(--color-bg-app)] p-4 space-y-4">
      {/* Privacy Notice */}
      <div className="flex items-start gap-3 p-3.5 rounded border border-[var(--color-info)]/20 bg-[var(--color-info-soft)] text-[var(--color-info)] select-none">
        <ShieldCheck size={18} className="shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-bold uppercase font-mono tracking-wider text-[10px]">Observation Scope</p>
          <p className="text-[var(--color-text-secondary)] leading-relaxed">
            This registry displays network operations initiated by CanIReach diagnostics. Each row identifies its source and visibility level. HTTPS paths/headers are never fabricated when only connection metadata is available.
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] pb-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">Failed Requests Registry</h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Observed network failures with source attribution and visibility levels</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center justify-center p-1.5 rounded bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] text-[var(--color-text-primary)] cursor-pointer transition-colors active:scale-95 disabled:opacity-50"
          title="Refresh"
        >
          <ArrowClockwise size={13} className={loading ? "animate-spin" : ""} />
        </button>
        <button
          onClick={() => setShowClearConfirm(true)}
          disabled={loading || requests.length === 0}
          className="flex items-center gap-1 px-2 py-1.5 rounded bg-[var(--color-bg-input)] hover:bg-[var(--color-danger-soft)] border border-[var(--color-border-default)] hover:border-[var(--color-danger)]/30 text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] cursor-pointer transition-colors text-[10px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          title="Clear all failure records"
        >
          <Trash size={12} />
          Clear All
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 select-none">
        <MetricCard label="Total Failures" value={stats.total} desc="Logged failures" />
        <MetricCard label="Critical" value={stats.critical} desc="TLS / blocking" color="text-[var(--color-danger)]" />
        <MetricCard label="High" value={stats.high} desc="DNS / connection" color="text-orange-400" />
        <MetricCard label="Medium" value={stats.medium} desc="HTTP errors" color="text-[var(--color-warning)]" />
        <MetricCard label="Low" value={stats.low} desc="Minor issues" color="text-[var(--color-text-secondary)]" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-[var(--color-bg-panel)]/30 border border-[var(--color-border-default)] rounded p-2.5 shrink-0 select-none">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] font-mono">
          <Funnel size={14} className="text-[var(--color-accent-primary)]" />
          <span>Filters:</span>
        </div>
        <label className="flex items-center gap-2 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-input)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)]">
          <MagnifyingGlass size={13} className="text-[var(--color-accent-primary)]" />
          <input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search host / domain"
            className="w-36 bg-transparent outline-none text-[var(--color-text-primary)]"
          />
        </label>
        <select
          value={filters.source_type || ""}
          onChange={(e) => handleFilterChange("source_type", e.target.value)}
          className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-xs text-[var(--color-text-primary)] rounded px-2.5 py-1 focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer font-mono"
        >
          <option value="">All Sources</option>
          <option value="canireach_probe">CanIReach Probe</option>
          <option value="system_observation">System</option>
          <option value="proxy_capture">Proxy</option>
        </select>
        <select
          value={filters.failure_category || ""}
          onChange={(e) => handleFilterChange("failure_category", e.target.value)}
          className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-xs text-[var(--color-text-primary)] rounded px-2.5 py-1 focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer font-mono"
        >
          <option value="">All Categories</option>
          <option value="dns_failure">DNS Failure</option>
          <option value="dns_timeout">DNS Timeout</option>
          <option value="connection_refused">Connection Refused</option>
          <option value="connection_timeout">Connection Timeout</option>
          <option value="connection_reset">Connection Reset</option>
          <option value="tls_handshake">TLS Handshake</option>
          <option value="certificate_failure">Certificate</option>
          <option value="http_error">HTTP Error</option>
        </select>
        <select
          value={filters.severity || ""}
          onChange={(e) => handleFilterChange("severity", e.target.value)}
          className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-xs text-[var(--color-text-primary)] rounded px-2.5 py-1 focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer font-mono"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button
          onClick={() => { clearFilters(); setSearchQuery(""); }}
          className="text-[10px] text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary-hover)] font-bold flex items-center gap-1 cursor-pointer select-none"
        >
          <X size={12} /> Reset
        </button>
      </div>

      {/* Table */}
      <div className="border border-[var(--color-border-default)] rounded bg-[var(--color-bg-panel)]/40 overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto flex-1 min-h-[240px] max-h-[50vh] sm:max-h-[55vh]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-topbar)] text-[10px] uppercase font-bold text-[var(--color-text-secondary)] tracking-wider">
                <th className="px-4 py-2.5">Source</th>
                <th className="px-4 py-2.5">Host / Domain</th>
                <th className="px-4 py-2.5">Operation</th>
                <th className="px-4 py-2.5">Failure</th>
                <th className="px-4 py-2.5">Severity</th>
                <th className="px-4 py-2.5">Duration</th>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)] text-xs text-[var(--color-text-primary)]">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--color-text-muted)]">Loading failures...</td></tr>
              ) : filteredRequests.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--color-text-muted)] font-medium">No failures match current filters.</td></tr>
              ) : (
                paged.items.map((op) => {
                  const sourceBadge = SOURCE_BADGES[op.source_type] || SOURCE_BADGES.canireach_probe;
                  const sevBadge = SEVERITY_BADGES[op.severity] || SEVERITY_BADGES.medium;
                  return (
                    <tr key={op.id} className="hover:bg-[var(--color-bg-panel-hover)] transition-all duration-100">
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${sourceBadge.color}`}>{sourceBadge.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[var(--color-text-primary)] truncate max-w-[200px]" title={op.host || op.summary}>{op.host || "—"}</div>
                        {op.registrable_domain && op.registrable_domain !== op.host && (
                          <div className="text-[9px] text-[var(--color-text-muted)] font-mono mt-0.5">{op.registrable_domain}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="capitalize font-mono px-1.5 py-0.5 rounded bg-[var(--color-bg-input)] text-[var(--color-accent-primary)] border border-[var(--color-border-subtle)] text-[10px]">
                          {op.operation_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold border font-mono">
                          {op.failure_category.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase font-mono ${sevBadge}`}>{op.severity}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--color-text-secondary)]">
                        {op.duration_ms ? `${op.duration_ms} ms` : "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)] font-mono">
                        {new Date(op.started_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedRequest(op)}
                            className="p-1 rounded bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
                            title="View details"
                          >
                            <Eye size={12} />
                          </button>
                          {op.host && (
                            <button
                              onClick={() => handleAddDomain(op.host!)}
                              className="p-1 rounded bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-success)] cursor-pointer"
                              title="Add domain to targets"
                            >
                              <Plus size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          currentPage={paged.currentPage}
          totalPages={paged.totalPages}
          totalItems={paged.totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>

      {/* Details Drawer */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-[500px] h-full bg-[var(--color-bg-panel-elevated)] border-l border-[var(--color-border-strong)] p-5 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex flex-col min-h-0 flex-1 space-y-5">
              <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] pb-3">
                <div>
                  <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">Failure Details</h3>
                  <p className="text-[10px] text-[var(--color-text-muted)] font-mono mt-0.5">{selectedRequest.id}</p>
                </div>
                <button onClick={() => setSelectedRequest(null)} className="p-1 rounded hover:bg-[var(--color-bg-panel-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer">
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs text-[var(--color-text-primary)]">
                <div className="grid grid-cols-2 gap-3 bg-[var(--color-bg-panel)] border border-[var(--color-border-default)] rounded p-3 select-none">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Source</span>
                    <p className="font-mono mt-0.5">{SOURCE_BADGES[selectedRequest.source_type]?.label || selectedRequest.source_type}</p>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Visibility</span>
                    <p className="font-mono mt-0.5">{selectedRequest.visibility_level}</p>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Host</span>
                    <p className="font-mono mt-0.5">{selectedRequest.host || "—"}</p>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Domain</span>
                    <p className="font-mono mt-0.5">{selectedRequest.registrable_domain || "—"}</p>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Duration</span>
                    <p className="font-mono mt-0.5">{selectedRequest.duration_ms ? `${selectedRequest.duration_ms} ms` : "N/A"}</p>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Severity</span>
                    <p className="font-mono mt-0.5 uppercase">{selectedRequest.severity}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Summary</span>
                  <div className="p-3 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded leading-relaxed">
                    {selectedRequest.summary}
                  </div>
                </div>
                {selectedRequest.failure_reason && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Failure Reason</span>
                    <div className="p-3 bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 text-[var(--color-danger)] font-mono rounded font-semibold">
                      {selectedRequest.failure_reason}
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono flex items-center gap-1.5">
                    <FileText size={12} /> Metadata
                  </span>
                  <pre className="p-3 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded font-mono text-[10px] overflow-x-auto max-h-40">
                    {selectedRequest.request_metadata ? JSON.stringify(JSON.parse(selectedRequest.request_metadata), null, 2) : "// No request metadata recorded"}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Domain Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[400px] bg-[var(--color-bg-panel-elevated)] border border-[var(--color-border-strong)] rounded p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] pb-2">
              <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">Add Domain to Targets</h3>
              <button onClick={() => setShowAddDialog(false)} className="p-1 rounded hover:bg-[var(--color-bg-panel-hover)] text-[var(--color-text-secondary)] cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <p className="text-[var(--color-text-secondary)]">Select what to add as a monitoring target:</p>
              {addDialogSuggestions.map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer hover:text-[var(--color-text-primary)] transition-colors">
                  <input type="radio" name="domain" value={s} checked={addDialogTarget === s} onChange={() => setAddDialogTarget(s)} className="accent-[var(--color-accent-primary)]" />
                  <span className="font-mono font-semibold">{s}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAddDialog(false)} className="flex-1 py-2 bg-slate-900 border border-slate-800 text-slate-350 font-bold rounded text-xs cursor-pointer">Cancel</button>
              <button onClick={handleConfirmAddDomain} className="flex-1 py-2 bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary-hover)] text-white font-bold rounded text-xs cursor-pointer">Add Target</button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[380px] bg-[var(--color-bg-panel-elevated)] border border-[var(--color-border-strong)] rounded p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] pb-2">
              <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">Clear All Records</h3>
              <button onClick={() => setShowClearConfirm(false)} className="p-1 rounded hover:bg-[var(--color-bg-panel-hover)] text-[var(--color-text-secondary)] cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              This will permanently delete all {requests.length} failure records from the registry. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] font-bold rounded text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await clearAll();
                  setShowClearConfirm(false);
                }}
                className="flex-1 py-2 bg-[var(--color-danger)] hover:bg-[var(--color-danger)]/80 text-white font-bold rounded text-xs cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FailedRequests;
