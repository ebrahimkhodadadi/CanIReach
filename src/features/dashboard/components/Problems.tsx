import React, { useState, useMemo, useEffect } from "react";
import { Target, ProbeResult } from "../../probes/types";
import { normalizeError } from "../../../features/monitoring/services/errorNormalizer";
import { Play, Funnel, ArrowDown, ArrowUp, XCircle, WarningCircle, Check, SealCheck } from "@phosphor-icons/react";
import { listIncidents, acknowledgeIncident } from "../../probes/api/probeCommands";
import { EmptyState, paginateItems, PaginationControls } from "../../../components/shared/Primitives";

interface ProblemsProps {
  targets: Target[];
  probeResults: Record<string, ProbeResult>;
  probingTargets: Record<string, boolean>;
  onSelectTarget: (id: string) => void;
  onRetestTarget: (id: string) => void;
}

type SortField = "severity" | "lastObserved" | "target";
type SortOrder = "asc" | "desc";

export const Problems: React.FC<ProblemsProps> = ({
  targets,
  probeResults,
  probingTargets,
  onSelectTarget,
  onRetestTarget,
}) => {
  // Filters and sorting states
  const [activeProblemsTab, setActiveProblemsTab] = useState<"realtime" | "incidents">("realtime");
  const [incidents, setIncidents] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("OPEN"); // "OPEN" | "RESOLVED" | "ALL"
  const [sortField, setSortField] = useState<SortField>("severity");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const loadIncidents = async () => {
    try {
      const data = await listIncidents();
      setIncidents(data);
    } catch (e) {
      console.error("Failed to load incidents:", e);
    }
  };

  useEffect(() => {
    if (activeProblemsTab === "incidents") {
      loadIncidents();
    }
  }, [activeProblemsTab]);

  useEffect(() => {
    setPage(1);
  }, [activeProblemsTab, searchQuery, severityFilter, categoryFilter, statusFilter, sortField, sortOrder]);

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeIncident(id);
      await loadIncidents();
    } catch (e) {
      alert(`Failed to acknowledge: ${e}`);
    }
  };

  // Normalize all problem items
  const allProblems = useMemo(() => {
    const list: { target: Target; result: ProbeResult; error: any }[] = [];
    targets.forEach((t) => {
      const res = probeResults[t.id];
      if (res) {
        const error = normalizeError(res);
        if (error) {
          list.push({ target: t, result: res, error });
        }
      }
    });
    return list;
  }, [targets, probeResults]);

  // Aggregate list of categories for filter dropdown
  const categoryList = useMemo(() => {
    const set = new Set<string>();
    allProblems.forEach((p) => {
      if (p.error?.category) {
        set.add(p.error.category);
      }
    });
    return Array.from(set);
  }, [allProblems]);

  // Filter and Sort problems list
  const processedProblems = useMemo(() => {
    let result = [...allProblems];

    // Search query
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (p) =>
          p.target.name.toLowerCase().includes(query) ||
          p.target.url.toLowerCase().includes(query) ||
          p.error?.userMessage?.toLowerCase().includes(query)
      );
    }

    // Severity filter
    if (severityFilter !== "ALL") {
      result = result.filter((p) => p.error?.severity.toUpperCase() === severityFilter);
    }

    // Category filter
    if (categoryFilter !== "ALL") {
      result = result.filter((p) => p.error?.category === categoryFilter);
    }

    // Status filter
    if (statusFilter === "OPEN") {
      result = result.filter((p) => !probingTargets[p.target.id]);
    } else if (statusFilter === "RESOLVED") {
      // For this session, resolved items could be targets that passed recently but had errors
      result = result.filter((p) => {
        const currentRes = probeResults[p.target.id];
        return currentRes && currentRes.status === "success";
      });
    }

    // Sort problems
    result.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      if (sortField === "target") {
        valA = a.target.name.toLowerCase();
        valB = b.target.name.toLowerCase();
      } else if (sortField === "lastObserved") {
        valA = new Date(a.result.timestamp).getTime();
        valB = new Date(b.result.timestamp).getTime();
      } else if (sortField === "severity") {
        const severityWeight = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
        valA = severityWeight[a.error?.severity as keyof typeof severityWeight] || 0;
        valB = severityWeight[b.error?.severity as keyof typeof severityWeight] || 0;
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [allProblems, searchQuery, severityFilter, categoryFilter, statusFilter, sortField, sortOrder, probeResults, probingTargets]);

  const pagedProblems = paginateItems(processedProblems, pageSize, page);
  const pagedIncidents = paginateItems(incidents, pageSize, page);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSeverityFilter("ALL");
    setCategoryFilter("ALL");
    setStatusFilter("OPEN");
    setSortField("severity");
    setSortOrder("desc");
  };

  // Summary Counters based on current status
  const counters = useMemo(() => {
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    allProblems.forEach((p) => {
      const sev = p.error?.severity;
      if (sev === "critical") critical++;
      else if (sev === "high") high++;
      else if (sev === "medium") medium++;
      else if (sev === "low") low++;
    });

    return {
      total: allProblems.length,
      critical,
      high,
      medium,
      low
    };
  }, [allProblems]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--color-bg-app)] p-4 space-y-4 overflow-hidden">
      
      {/* Problems Header */}
      <div className="border-b border-[var(--color-border-default)] pb-2 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">Problems Workspace</h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Diagnose and manage observed connection failures across your endpoints</p>
        </div>
        <div className="flex bg-[var(--color-bg-input)] border border-[var(--color-border-default)] p-0.5 rounded">
          <button
            onClick={() => setActiveProblemsTab("realtime")}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
              activeProblemsTab === "realtime" ? "bg-[var(--color-bg-panel-elevated)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            Realtime Issues
          </button>
          <button
            onClick={() => setActiveProblemsTab("incidents")}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
              activeProblemsTab === "incidents" ? "bg-[var(--color-bg-panel-elevated)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            Database Incidents ({incidents.filter(i => i.status === "open").length})
          </button>
        </div>
      </div>

      {/* Counters widgets */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0 select-none">
        {[
          { label: "Total Observed Issues", count: counters.total, color: "text-[var(--color-text-primary)] border-[var(--color-border-default)] bg-[var(--color-bg-panel)]" },
          { label: "Critical", count: counters.critical, color: "text-[var(--color-danger)] border-[var(--color-danger)]/20 bg-[var(--color-danger-soft)]" },
          { label: "High Severity", count: counters.high, color: "text-[var(--color-orange)] border-[var(--color-orange)]/20 bg-[var(--color-orange-soft)]" },
          { label: "Medium Severity", count: counters.medium, color: "text-[var(--color-warning)] border-[var(--color-warning)]/20 bg-[var(--color-warning-soft)]" },
          { label: "Low / Info", count: counters.low, color: "text-[var(--color-text-secondary)] border-[var(--color-border-default)] bg-[var(--color-bg-panel)]" }
        ].map((item, idx) => (
          <div key={idx} className={`p-3 rounded border flex flex-col ${item.color}`}>
            <span className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">{item.label}</span>
            <span className="text-lg font-bold font-mono mt-1">{item.count}</span>
          </div>
        ))}
      </div>

      {activeProblemsTab === "realtime" ? (
        <>
          {/* Filters workspace bar */}
          <div className="p-3 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/30 shrink-0 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <Funnel size={14} className="text-[var(--color-accent-primary)]" />
                <span className="font-semibold">Filter Workspace:</span>
              </div>
              
              <button
                onClick={clearFilters}
                className="text-[10px] text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary-hover)] font-bold flex items-center gap-1 cursor-pointer select-none"
              >
                <XCircle size={12} />
                Reset Filters
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {/* Search bar */}
              <input
                type="text"
                placeholder="Search target domain or error message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)]"
              />

              {/* Severity filter */}
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                {categoryList.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.toUpperCase()}
                  </option>
                ))}
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer"
              >
                <option value="OPEN">Open Problems</option>
                <option value="RESOLVED">Resolved Problems</option>
                <option value="ALL">All Records</option>
              </select>
            </div>
          </div>

          {/* Problems table */}
          <div className="flex-1 overflow-y-auto border border-[var(--color-border-default)] rounded bg-[var(--color-bg-panel)]/40">
            {processedProblems.length > 0 ? (
              <table className="w-full text-left border-collapse select-text">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#07090e]/70 sticky top-0 z-10 text-[10px] text-slate-500 uppercase tracking-wider font-bold select-none">
                    <th 
                      className="py-2.5 px-4 w-24 cursor-pointer hover:text-slate-300 transition-colors"
                      onClick={() => handleSort("severity")}
                    >
                      <div className="flex items-center gap-1">
                        Severity
                        {sortField === "severity" && (sortOrder === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                      </div>
                    </th>
                    <th 
                      className="py-2.5 px-4 cursor-pointer hover:text-slate-300 transition-colors"
                      onClick={() => handleSort("target")}
                    >
                      <div className="flex items-center gap-1">
                        Endpoint
                        {sortField === "target" && (sortOrder === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                      </div>
                    </th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4">Layer Code</th>
                    <th className="py-2.5 px-4">Diagnostic Message</th>
                    <th 
                      className="py-2.5 px-4 cursor-pointer hover:text-slate-300 transition-colors"
                      onClick={() => handleSort("lastObserved")}
                    >
                      <div className="flex items-center gap-1">
                        Last Observed
                        {sortField === "lastObserved" && (sortOrder === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                      </div>
                    </th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {pagedProblems.items.map(({ target, result, error }) => {
                    const isProbing = !!probingTargets[target.id];
                    
                    let severityStyle = "bg-[var(--color-unknown-soft)] text-[var(--color-unknown)] border-[var(--color-unknown)]/20";
                    if (error.severity === "critical" || error.severity === "high") {
                      severityStyle = "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/25";
                    } else if (error.severity === "medium") {
                      severityStyle = "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]/25";
                    }

                    return (
                      <tr
                        key={target.id}
                        onClick={() => onSelectTarget(target.id)}
                        className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-panel-hover)] cursor-pointer transition-colors text-xs select-none group"
                      >
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase font-mono ${severityStyle}`}>
                            {error.severity}
                          </span>
                        </td>
                        
                        <td className="py-3 px-4 font-semibold text-[var(--color-text-primary)]">
                          <div className="truncate max-w-xs group-hover:text-white transition-colors" title={target.name}>
                            {target.name}
                          </div>
                          <div className="text-[10px] text-[var(--color-text-secondary)] font-mono truncate max-w-xs mt-0.5" title={target.url}>
                            {target.url}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-[var(--color-text-secondary)] font-medium">
                          <span className="px-1.5 py-0.5 rounded bg-[var(--color-bg-input)] border border-[var(--color-border-subtle)] text-[9px] uppercase font-mono text-[var(--color-text-secondary)]">
                            {error.category}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono text-[var(--color-danger)] font-semibold text-[10px]">
                          {error.code}
                        </td>

                        <td className="py-3 px-4 text-[var(--color-text-secondary)] max-w-xs truncate" title={error.userMessage}>
                          {error.userMessage}
                        </td>

                        <td className="py-3 px-4 text-[var(--color-text-muted)] font-mono text-[10px]">
                          {new Date(result.timestamp).toLocaleTimeString()}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRetestTarget(target.id);
                            }}
                            disabled={isProbing}
                            className="p-1 rounded bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer disabled:opacity-55"
                            title="Retest problem"
                          >
                            <Play size={10} weight="fill" className={isProbing ? "animate-spin" : ""} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="py-12">
                <EmptyState
                  title="NO PROBLEMS FOUND"
                  description="No connection failures or alerts match your selected filters."
                />
              </div>
            )}
          </div>
          <PaginationControls
            currentPage={pagedProblems.currentPage}
            totalPages={pagedProblems.totalPages}
            totalItems={pagedProblems.totalItems}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </>
      ) : (
        /* Database Incidents table */
        <div className="flex-1 overflow-y-auto border border-[var(--color-border-default)] rounded bg-[var(--color-bg-panel)]/40">
          {incidents.length > 0 ? (
            <table className="w-full text-left border-collapse select-text">
              <thead>
                <tr className="border-b border-slate-800 bg-[#07090e]/70 sticky top-0 z-10 text-[10px] text-slate-500 uppercase tracking-wider font-bold select-none">
                  <th className="py-2.5 px-4">Title</th>
                  <th className="py-2.5 px-4">Summary</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Failures</th>
                  <th className="py-2.5 px-4">Started At</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60 text-xs text-slate-350">
                {pagedIncidents.items.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-900/25 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-200">{inc.title}</td>
                    <td className="py-3 px-4 text-slate-400">{inc.summary}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        inc.status === "open" ? "bg-rose-500/10 text-rose-450 border-rose-500/20" : "bg-emerald-500/10 text-emerald-450 border-emerald-500/20"
                      }`}>
                        {inc.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px]">{inc.consecutive_failures} runs</td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[10px]">
                      {new Date(inc.started_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {inc.status === "open" && !inc.acknowledged_at ? (
                        <button
                          onClick={() => handleAcknowledge(inc.id)}
                          className="px-2 py-1 text-[10px] font-bold bg-amber-950/40 hover:bg-amber-900/60 text-amber-400 border border-amber-900/30 rounded cursor-pointer transition-all"
                        >
                          Acknowledge
                        </button>
                      ) : inc.acknowledged_at ? (
                        <span className="flex items-center justify-end gap-1 text-[10px] text-slate-500 font-semibold">
                          <Check size={12} /> Acknowledged
                        </span>
                      ) : (
                        <span className="flex items-center justify-end gap-1 text-[10px] text-emerald-500 font-semibold">
                          <SealCheck size={12} /> Resolved
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 select-none space-y-2">
              <WarningCircle size={24} className="text-slate-650" />
              <p className="text-xs">No background incidents logged in the database.</p>
            </div>
          )}
        </div>
      )}
      {activeProblemsTab === "incidents" && (
        <PaginationControls
          currentPage={pagedIncidents.currentPage}
          totalPages={pagedIncidents.totalPages}
          totalItems={pagedIncidents.totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}

    </div>
  );
};
