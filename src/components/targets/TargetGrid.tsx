import React, { useState, useMemo } from "react";
import { Target, ProbeResult } from "../../features/probes/types";
import { mapProbeResultToTargetCheckResult } from "../../features/monitoring/services/monitoringMapper";
import {
  Play,
  Stop,
  ShareNetwork,
  Funnel,
  XCircle,
  ArrowUp,
  ArrowDown,
  WarningCircle,
  Plus,
  Pencil,
  Trash,
  Copy,
  ToggleLeft,
  ToggleRight,
  DotsThreeVertical,
  CheckSquare,
  Square,
  ArrowsClockwise,
  PushPin,
  PushPinSlash,
  DotsSixVertical
} from "@phosphor-icons/react";
import { useActiveRuns } from "../../features/traceroute/store/selectors";
import { useProbeActions, useProbingCategories } from "../../features/probes/store/selectors";
import { useContinuousMonitorStore } from "../../features/continuous-monitor/store/continuousMonitorStore";
import { ContinuousTestDialog } from "../../features/continuous-monitor/components/ContinuousTestDialog";
import { ContinuousMonitorStatus } from "../../features/continuous-monitor/components/ContinuousMonitorStatus";
import { TargetDialog } from "./TargetDialog";

interface TargetGridProps {
  categories: Record<string, Target[]>;
  probeResults: Record<string, ProbeResult>;
  probingTargets: Record<string, boolean>;
  probeLoops: Record<string, { intervalMs: number; running: boolean; mode: "interval" | "until_success" }>;
  onSelectTarget: (id: string) => void;
  onRetestTarget: (id: string) => void;
  onStopTarget: (id: string) => void;
  onStartUntilSuccess: (id: string) => void;
  onTraceTarget: (id: string) => void;
}

type SortField = "name" | "status" | "latency" | "checked";
type SortOrder = "asc" | "desc";

export const TargetGrid: React.FC<TargetGridProps> = ({
  categories,
  probeResults,
  probingTargets,
  probeLoops,
  onSelectTarget,
  onRetestTarget,
  onStopTarget,
  onStartUntilSuccess,
  onTraceTarget,
}) => {
  const activeRuns = useActiveRuns();
  const { deleteTarget, duplicateTarget, toggleTargetEnabled, toggleTargetPin, reorderTargets, probeOne, probeByCategory } = useProbeActions();
  const probingCategories = useProbingCategories();

  const [localSearch, setLocalSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [catFilter, setCatFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<Target | undefined>(undefined);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Drag and drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Continuous monitor dialog state
  const [continuousDialogTarget, setContinuousDialogTarget] = useState<Target | null>(null);
  const { sessions: monitorSessions, startMonitor, stopMonitor } = useContinuousMonitorStore();

  // Extract all targets into flat list
  const allTargets = useMemo(() => {
    return Object.values(categories).flat();
  }, [categories]);

  // Dynamic list of categories
  const categoryList = useMemo(() => {
    return Object.keys(categories);
  }, [categories]);

  // Map to normalized monitoring results
  const normalizedTargets = useMemo(() => {
    return allTargets.map((target) => {
      const isChecking = !!probingTargets[target.id];
      const res = probeResults[target.id];
      return {
        target,
        result: mapProbeResultToTargetCheckResult(target, res, isChecking),
        rawResult: res
      };
    });
  }, [allTargets, probeResults, probingTargets]);

  // Filter and Sort targets
  const processedTargets = useMemo(() => {
    let result = [...normalizedTargets];

    // Search filter
    const search = localSearch.trim().toLowerCase();
    if (search) {
      result = result.filter(
        (item) =>
          item.target.name.toLowerCase().includes(search) ||
          item.target.url.toLowerCase().includes(search)
      );
    }

    // Category filter
    if (catFilter !== "ALL") {
      result = result.filter((item) => item.target.category === catFilter);
    }

    // Status filter
    if (statusFilter !== "ALL") {
      result = result.filter((item) => {
        if (statusFilter === "HEALTHY") return item.result.status === "healthy";
        if (statusFilter === "DEGRADED") return item.result.status === "degraded";
        if (statusFilter === "UNREACHABLE") return item.result.status === "unreachable";
        if (statusFilter === "CHECKING") return item.result.status === "checking";
        if (statusFilter === "UNKNOWN") return item.result.status === "unknown";
        return true;
      });
    }

    // Separate pinned and unpinned
    const pinned = result.filter((item) => item.target.pinned);
    const unpinned = result.filter((item) => !item.target.pinned);

    // Sort pinned by sort_order
    pinned.sort((a, b) => (a.target.sort_order ?? 0) - (b.target.sort_order ?? 0));

    // Sort unpinned by existing logic
    unpinned.sort((a, b) => {
      const testedA = !!a.rawResult;
      const testedB = !!b.rawResult;

      if (testedA !== testedB) {
        return testedA ? -1 : 1;
      }

      let valA: any = "";
      let valB: any = "";

      if (sortField === "name") {
        valA = a.target.name.toLowerCase();
        valB = b.target.name.toLowerCase();
      } else if (sortField === "status") {
        const statusWeight = { healthy: 5, degraded: 4, checking: 3, unknown: 2, unreachable: 1 };
        valA = statusWeight[a.result.status] || 0;
        valB = statusWeight[b.result.status] || 0;
      } else if (sortField === "latency") {
        valA = a.result.durationMs !== undefined ? a.result.durationMs : Infinity;
        valB = b.result.durationMs !== undefined ? b.result.durationMs : Infinity;
      } else if (sortField === "checked") {
        valA = new Date(a.result.checkedAt).getTime();
        valB = new Date(b.result.checkedAt).getTime();
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return [...pinned, ...unpinned];
  }, [normalizedTargets, localSearch, statusFilter, catFilter, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const clearFilters = () => {
    setLocalSearch("");
    setStatusFilter("ALL");
    setCatFilter("ALL");
    setSortField("name");
    setSortOrder("asc");
    setDraggedId(null);
    setDragOverId(null);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === processedTargets.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(processedTargets.map(t => t.target.id));
    }
  };

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkDelete = async () => {
    try {
      for (const id of selectedIds) {
        await deleteTarget(id);
      }
      setSelectedIds([]);
      setConfirmBulkDelete(false);
    } catch (err) {
      console.error("Bulk delete failed:", err);
    }
  };

  const handleBulkRetest = async () => {
    for (const id of selectedIds) {
      probeOne(id).catch(err => console.error(err));
    }
    setSelectedIds([]);
  };

  const handleDeleteOne = async (id: string) => {
    try {
      await deleteTarget(id);
      setConfirmDeleteId(null);
    } catch (err) {
      console.error("Delete target failed:", err);
    }
  };

  const handleEditTarget = (target: Target, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTarget(target);
    setIsDialogOpen(true);
    setActiveMenuId(null);
  };

  const handleDuplicateTarget = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await duplicateTarget(id);
      setActiveMenuId(null);
    } catch (err) {
      console.error("Failed to duplicate target:", err);
    }
  };

  const handleToggleEnabled = async (id: string, current: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleTargetEnabled(id, !current);
    } catch (err) {
      console.error("Failed to toggle enabled status:", err);
    }
  };

  const handleTogglePin = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleTargetPin(id);
    } catch (err) {
      console.error("Failed to toggle pin:", err);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== draggedId) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");

    if (!sourceId || sourceId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    // Build new order: take current processedTargets order, move source to target position
    const currentIds = processedTargets.map((item) => item.target.id);
    const sourceIndex = currentIds.indexOf(sourceId);
    const targetIndex = currentIds.indexOf(targetId);

    if (sourceIndex === -1 || targetIndex === -1) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const newIds = [...currentIds];
    newIds.splice(sourceIndex, 1);
    newIds.splice(targetIndex, 0, sourceId);

    setDraggedId(null);
    setDragOverId(null);

    try {
      await reorderTargets(newIds);
    } catch (err) {
      console.error("Failed to reorder targets:", err);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const getStatusBadgeStyle = (status: string, enabled: boolean) => {
    if (!enabled) return "bg-slate-900 text-slate-650 border-slate-900 opacity-60";
    switch (status) {
      case "healthy":
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
      case "degraded":
        return "bg-amber-500/15 text-amber-400 border-amber-500/20";
      case "unreachable":
        return "bg-rose-500/15 text-rose-400 border-rose-500/20";
      case "checking":
        return "bg-blue-500/15 text-blue-400 border-blue-500/20 animate-pulse";
      default:
        return "bg-slate-900 text-slate-500 border-slate-800";
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--color-bg-app)] p-4 space-y-4 overflow-hidden">
      
      {/* Title */}
      <div className="border-b border-[var(--color-border-default)] pb-3 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">Endpoint Targets Workspace</h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Monitor, search, filter and run manual reachability diagnostics on targets</p>
        </div>

        <button
          onClick={() => {
            setEditingTarget(undefined);
            setIsDialogOpen(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-semibold rounded text-xs transition-all active:scale-[0.98] cursor-pointer"
        >
          <Plus size={14} />
          Add Target
        </button>
      </div>

      {/* Filter workspace */}
      <div className="p-3 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/30 shrink-0 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <Funnel size={14} className="text-[var(--color-accent-primary)]" />
            <span className="font-semibold">Filter targets list:</span>
          </div>
          
          <button
            onClick={clearFilters}
            className="text-[10px] text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary-hover)] font-bold flex items-center gap-1 cursor-pointer select-none"
          >
            <XCircle size={12} />
            Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Search target name or URL..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)]"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="HEALTHY">Healthy</option>
            <option value="DEGRADED">Degraded</option>
            <option value="UNREACHABLE">Unreachable</option>
            <option value="CHECKING">Checking</option>
            <option value="UNKNOWN">Unknown</option>
          </select>

          <div className="flex items-center gap-2">
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {categoryList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            {catFilter !== "ALL" && (
              <button
                onClick={() => probeByCategory(catFilter)}
                disabled={probingCategories[catFilter]}
                className="px-2 py-1 bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary-hover)] disabled:opacity-50 text-white rounded text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1 whitespace-nowrap"
              >
                <Play size={10} weight="fill" className={probingCategories[catFilter] ? "animate-spin" : ""} />
                {probingCategories[catFilter] ? "Testing..." : "Test Category"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.length > 0 && (
        <div className="p-3 bg-indigo-950/20 border border-indigo-900/40 rounded-lg flex items-center justify-between text-xs animate-fadeIn shrink-0">
          <span className="font-semibold text-indigo-300">{selectedIds.length} targets selected</span>
          <div className="flex gap-2">
            <button
              onClick={handleBulkRetest}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
            >
              Retest Selected
            </button>
            <button
              onClick={() => setConfirmBulkDelete(true)}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
            >
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Targets Table */}
      <div className="flex-1 overflow-auto border border-[#1e293b] rounded bg-[#0f141c]/40 relative">
        {processedTargets.length > 0 ? (
          <table className="w-full text-left border-collapse select-text">
            <thead>
              <tr className="border-b border-[#1e293b] bg-[#0c1017] sticky top-0 z-10 text-[10px] text-slate-500 uppercase tracking-wider font-bold select-none">
                <th className="py-3 px-2 w-6"></th>
                <th className="py-3 px-4 w-10">
                  <button onClick={toggleSelectAll} className="text-slate-400 hover:text-white cursor-pointer">
                    {selectedIds.length === processedTargets.length ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </th>
                <th 
                  className="py-3 px-4 w-28 cursor-pointer hover:text-slate-300 transition-colors"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center gap-1">
                    Status
                    {sortField === "status" && (sortOrder === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                  </div>
                </th>
                <th 
                  className="py-3 px-4 cursor-pointer hover:text-slate-300 transition-colors"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    Target
                    {sortField === "name" && (sortOrder === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                  </div>
                </th>
                <th className="py-3 px-4 w-32">Category</th>
                <th className="py-3 px-4 w-28">Monitor</th>
                <th
                  className="py-3 px-4 w-24 cursor-pointer hover:text-slate-300 transition-colors"
                  onClick={() => handleSort("latency")}
                >
                  <div className="flex items-center gap-1">
                    Latency
                    {sortField === "latency" && (sortOrder === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                  </div>
                </th>
                <th className="py-3 px-4 w-20">HTTP</th>
                <th 
                  className="py-3 px-4 w-28 cursor-pointer hover:text-slate-300 transition-colors"
                  onClick={() => handleSort("checked")}
                >
                  <div className="flex items-center gap-1">
                    Last Checked
                    {sortField === "checked" && (sortOrder === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                  </div>
                </th>
                <th className="py-3 px-4 max-w-xs">Problem Description</th>
                <th className="py-3 px-4 text-right w-28">Actions</th>
              </tr>
            </thead>

            <tbody>
              {processedTargets.map(({ target, result }) => {
                const isProbing = result.status === "checking";
                const isTracing = !!activeRuns[target.id];
                const loopState = probeLoops[target.id];
                const isLoopRunning = !!loopState?.running;
                const isUntilSuccess = loopState?.mode === "until_success";
                const isSelected = selectedIds.includes(target.id);

                return (
                  <tr
                    key={target.id}
                    onClick={() => onSelectTarget(target.id)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, target.id)}
                    onDragOver={(e) => handleDragOver(e, target.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, target.id)}
                    onDragEnd={handleDragEnd}
                    className={`border-b border-[#1e293b]/70 hover:bg-[#131a24]/80 cursor-pointer transition-colors text-xs select-none group ${
                      !target.enabled ? "opacity-60" : ""
                    } ${isSelected ? "bg-indigo-950/10" : ""} ${
                      draggedId === target.id ? "opacity-40" : ""
                    } ${dragOverId === target.id ? "border-t-2 border-t-indigo-500" : ""}`}
                  >
                    <td className="py-3.5 px-2 w-6">
                      <button
                        className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing"
                        title="Drag to reorder"
                      >
                        <DotsSixVertical size={12} />
                      </button>
                    </td>
                    <td className="py-3.5 px-4" onClick={(e) => toggleSelectOne(target.id, e)}>
                      <button className="text-slate-500 hover:text-indigo-400 cursor-pointer">
                        {isSelected ? <CheckSquare size={14} className="text-indigo-500" /> : <Square size={14} />}
                      </button>
                    </td>

                    <td className="py-3.5 px-4 font-semibold">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase font-mono ${getStatusBadgeStyle(result.status, target.enabled)}`}>
                        {target.enabled ? result.status : "disabled"}
                      </span>
                    </td>
                    
                    <td className="py-3.5 px-4 font-semibold text-slate-200">
                      <div className="truncate max-w-xs group-hover:text-white transition-colors" title={target.name}>
                        {target.name}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-xs mt-0.5" title={target.url}>
                        {target.url}
                      </div>
                    </td>

                    {/* Continuous Monitor Status */}
                    <td className="py-3.5 px-4">
                      <ContinuousMonitorStatus
                        session={monitorSessions[target.id] || null}
                        onStop={() => stopMonitor(target.id)}
                      />
                    </td>

                    <td className="py-3.5 px-4 text-slate-400 font-medium">
                      <span className="px-1.5 py-0.5 rounded bg-[#080b10] border border-[#1e293b] text-[9px] font-mono text-slate-400">
                        {target.category || "—"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      {isProbing ? (
                        <span className="text-amber-400 animate-pulse">testing...</span>
                      ) : result.durationMs !== undefined && target.enabled ? (
                        `${result.durationMs} ms`
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono">
                      {isProbing || !target.enabled ? (
                        "—"
                      ) : result.http?.statusCode !== undefined ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          result.http.statusCode >= 200 && result.http.statusCode < 400
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-rose-500/20 text-rose-350"
                        }`}>
                          {result.http.statusCode}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-500 font-mono text-[10px]">
                      {result.checkedAt && result.checkedAt !== new Date(0).toISOString() && target.enabled
                        ? new Date(result.checkedAt).toLocaleTimeString()
                        : "Never"}
                    </td>

                    <td className="py-3.5 px-4 text-rose-455/90 font-mono max-w-xs truncate text-[10px]">
                      {isProbing || !target.enabled ? "" : result.error?.userMessage || "—"}
                    </td>

                    <td className="py-3.5 px-4 text-right flex items-center justify-end gap-1.5 relative">
                      {/* Pin/Unpin button */}
                      <button
                        onClick={(e) => handleTogglePin(target.id, e)}
                        className={`p-1 rounded cursor-pointer transition-colors ${
                          target.pinned
                            ? "text-amber-400 hover:text-amber-300"
                            : "text-slate-600 hover:text-slate-400"
                        }`}
                        title={target.pinned ? "Unpin target" : "Pin to top"}
                      >
                        {target.pinned ? <PushPin size={12} weight="fill" /> : <PushPinSlash size={12} />}
                      </button>

                      {/* Enable/Disable Toggle button */}
                      <button
                        onClick={(e) => handleToggleEnabled(target.id, target.enabled, e)}
                        className="text-slate-450 hover:text-white cursor-pointer transition-colors p-1"
                        title={target.enabled ? "Disable target" : "Enable target"}
                      >
                        {target.enabled ? (
                          <ToggleRight size={18} className="text-indigo-500" />
                        ) : (
                          <ToggleLeft size={18} className="text-slate-600" />
                        )}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isProbing || isLoopRunning) {
                            onStopTarget(target.id);
                          } else {
                            onRetestTarget(target.id);
                          }
                        }}
                        disabled={!target.enabled && !isProbing && !isLoopRunning}
                        className={`p-1 rounded border transition-all cursor-pointer disabled:opacity-55 ${
                          isProbing || isLoopRunning
                            ? "bg-[var(--color-danger-soft)] border-[var(--color-danger)]/25 text-[var(--color-danger)] hover:border-[var(--color-danger)]"
                            : "bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                        }`}
                        title={isProbing || isLoopRunning ? "Stop running test" : "Retest endpoint"}
                      >
                        {isProbing || isLoopRunning ? <Stop size={10} weight="fill" /> : <Play size={10} weight="fill" className={isProbing ? "animate-spin" : ""} />}
                      </button>

                      {!isLoopRunning && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartUntilSuccess(target.id);
                          }}
                          disabled={!target.enabled}
                          className="p-1 rounded bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer disabled:opacity-55"
                          title={isUntilSuccess ? "Until-success loop running" : "Test until OK"}
                        >
                          <ArrowsClockwise size={10} weight="fill" className={isUntilSuccess ? "animate-spin text-[var(--color-accent-primary)]" : ""} />
                        </button>
                      )}
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onTraceTarget(target.id);
                        }}
                        disabled={!target.enabled}
                        className={`p-1 rounded border transition-all cursor-pointer ${
                          isTracing
                            ? "bg-[var(--color-danger-soft)] border-[var(--color-danger)] text-[var(--color-danger)]"
                            : "bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-panel-hover)]"
                        }`}
                        title="Run Traceroute"
                      >
                        <ShareNetwork size={10} weight={isTracing ? "fill" : "regular"} className={isTracing ? "animate-pulse" : ""} />
                      </button>

                      {/* Dropdown Menu Toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === target.id ? null : target.id);
                        }}
                        className="p-1 rounded hover:bg-[var(--color-bg-panel-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
                      >
                        <DotsThreeVertical size={14} weight="bold" />
                      </button>

                      {/* Dropdown Options */}
                      {activeMenuId === target.id && (
                        <div className="absolute right-4 top-10 bg-[var(--color-bg-panel-elevated)] border border-[var(--color-border-strong)] rounded shadow-xl py-1 z-35 w-28 text-left text-[11px] font-semibold animate-fadeIn">
                          <button
                            onClick={(e) => handleEditTarget(target, e)}
                            className="w-full px-3 py-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-panel-hover)] hover:text-[var(--color-text-primary)] flex items-center gap-1.5 cursor-pointer"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                          <button
                            onClick={(e) => handleDuplicateTarget(target.id, e)}
                            className="w-full px-3 py-1.5 text-slate-300 hover:bg-indigo-600 hover:text-white flex items-center gap-1.5 cursor-pointer"
                          >
                            <Copy size={12} />
                            Duplicate
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                              setContinuousDialogTarget(target);
                            }}
                            className="w-full px-3 py-1.5 text-emerald-400 hover:bg-emerald-900 hover:text-white flex items-center gap-1.5 cursor-pointer"
                          >
                            <ArrowsClockwise size={12} />
                            Continuous Test
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(target.id);
                              setActiveMenuId(null);
                            }}
                            className="w-full px-3 py-1.5 text-rose-450 hover:bg-rose-650 hover:text-white flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash size={12} />
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 select-none space-y-2">
            <WarningCircle size={24} className="text-slate-650" />
            <p className="text-xs">No configuration targets match your active filters.</p>
          </div>
        )}
      </div>

      {/* Target CRUD Dialog */}
      <TargetDialog
        isOpen={isDialogOpen}
        target={editingTarget}
        onClose={() => {
          setIsDialogOpen(false);
          setEditingTarget(undefined);
        }}
      />

      {/* Delete Target Confirmation Dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-5 max-w-sm w-full text-xs space-y-4 shadow-2xl select-none">
            <h3 className="text-sm font-bold text-white">Confirm Target Deletion</h3>
            <p className="text-slate-400 leading-relaxed">
              Are you sure you want to permanently delete this target configuration? This action is immediate and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2 bg-slate-900 border border-slate-800 text-slate-350 font-bold rounded-lg hover:bg-slate-850 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteOne(confirmDeleteId)}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Target Confirmation Dialog */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-5 max-w-sm w-full text-xs space-y-4 shadow-2xl select-none">
            <h3 className="text-sm font-bold text-white font-mono">Confirm Bulk Deletion</h3>
            <p className="text-slate-400 leading-relaxed">
              Are you sure you want to permanently delete all <strong className="text-white">{selectedIds.length}</strong> selected targets? This action is immediate and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmBulkDelete(false)}
                className="flex-1 py-2 bg-slate-900 border border-slate-800 text-slate-350 font-bold rounded-lg hover:bg-slate-850 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg cursor-pointer"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Continuous Test Dialog */}
      {continuousDialogTarget && (
        <ContinuousTestDialog
          targetName={continuousDialogTarget.name}
          onStart={(config) => {
            startMonitor(continuousDialogTarget.id, config);
            setContinuousDialogTarget(null);
          }}
          onClose={() => setContinuousDialogTarget(null)}
        />
      )}

    </div>
  );
};
