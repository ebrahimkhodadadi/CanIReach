import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  Plus, 
  Trash, 
  PlayCircle, 
  ShieldCheck, 
  Warning, 
  CheckCircle, 
  XCircle, 
  Info,
  ArrowClockwise,
  X
} from "@phosphor-icons/react";
import { getTargets, getNetworkProfiles } from "../../probes/api/probeCommands";
import { EmptyState } from "../../../components/shared/Primitives";

export const Investigations: React.FC = () => {
  const [investigations, setInvestigations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  
  // Dialog State
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [baselineProfileId, setBaselineProfileId] = useState("system-default");
  const [selectedComparisonProfiles, setSelectedComparisonProfiles] = useState<string[]>([]);
  
  const [selectedInv, setSelectedInv] = useState<any | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const invs: any[] = await invoke("list_investigations");
      setInvestigations(invs);
      
      const ts = await getTargets();
      setTargets(ts);
      
      const ps = await getNetworkProfiles();
      setProfiles(ps);
    } catch (err) {
      console.error("Failed to load investigations", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const handleCreate = async () => {
    if (!selectedTargetId) {
      alert("Please select a target.");
      return;
    }
    try {
      const created: any = await invoke("create_investigation", {
        targetId: selectedTargetId,
        baselineProfileId: baselineProfileId,
        comparisonProfileIds: selectedComparisonProfiles
      });
      setShowAddDialog(false);
      loadData();
      
      // Auto-start the investigation
      handleStart(created.id);
    } catch (err) {
      alert(`Error creating investigation: ${err}`);
    }
  };

  const handleStart = async (id: string) => {
    setLoading(true);
    try {
      const updated: any = await invoke("start_investigation", { id });
      setSelectedInv(updated);
      loadData();
    } catch (err) {
      alert(`Error running investigation: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this investigation?")) return;
    try {
      await invoke("delete_investigation", { id });
      if (selectedInv?.id === id) {
        setSelectedInv(null);
      }
      loadData();
    } catch (err) {
      alert(`Error deleting investigation: ${err}`);
    }
  };

  const toggleComparisonProfile = (id: string) => {
    if (selectedComparisonProfiles.includes(id)) {
      setSelectedComparisonProfiles(selectedComparisonProfiles.filter(p => p !== id));
    } else {
      setSelectedComparisonProfiles([...selectedComparisonProfiles, id]);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[var(--color-bg-app)] p-4 space-y-4">
      
      {/* Scope notice */}
      <div className="flex items-start gap-3 p-3.5 rounded border border-[var(--color-info)]/20 bg-[var(--color-info-soft)] text-[var(--color-info)] text-xs select-none">
        <ShieldCheck size={18} className="shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold uppercase font-mono tracking-wider text-[10px]">Access Analysis & Attribution Policy</p>
          <p className="text-[var(--color-text-secondary)] leading-relaxed">
            This workspace provides evidence-based analysis of target reachability issues. Attribution defaults to <strong>Unknown</strong> to remain conservative. We do not infer ISP blocks, geofences, or routing policies without direct comparison traces.
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] pb-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">Investigation Workspace</h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Perform staged, cross-profile comparisons to identify root causes of network failures</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] text-[var(--color-text-primary)] transition-all cursor-pointer text-xs"
          >
            <ArrowClockwise size={13} className={loading ? "animate-spin text-[var(--color-accent-primary)]" : ""} /> 
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button
            onClick={() => {
              setSelectedTargetId(targets[0]?.id || "");
              setBaselineProfileId("system-default");
              setSelectedComparisonProfiles([]);
              setShowAddDialog(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] text-[var(--color-text-primary)] transition-all cursor-pointer font-semibold rounded text-xs"
          >
            <Plus size={14} />
            New Investigation
          </button>
        </div>
      </div>

      {/* Main Section split: left list, right details */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        
        {/* Left Side: Investigations list */}
        <div className="lg:col-span-1 border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] rounded p-4 flex flex-col min-h-0 overflow-y-auto">
          <h3 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider font-mono mb-3 border-b border-[var(--color-border-subtle)] pb-1.5">Past Investigations</h3>
          
          <div className="space-y-3">
            {investigations.length === 0 ? (
              <div className="py-10">
                <EmptyState
                  title="NO DATA FOUND"
                  description="No access investigations recorded in history."
                />
              </div>
            ) : (
              investigations.map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => setSelectedInv(inv)}
                  className={`p-3 rounded border transition-all cursor-pointer flex flex-col gap-2 ${
                    selectedInv?.id === inv.id 
                      ? "bg-[var(--color-bg-panel-hover)] border-[var(--color-border-strong)]" 
                      : "bg-[var(--color-bg-input)]/50 border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded font-mono ${
                      inv.status === "completed" ? "bg-[var(--color-success-soft)] text-[var(--color-success)] border border-[var(--color-success)]/10" :
                      inv.status === "running" ? "bg-[var(--color-info-soft)] text-[var(--color-info)] border border-[var(--color-info)]/10 animate-pulse" :
                      inv.status === "failed" ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border border-[var(--color-danger)]/10" :
                      "bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]"
                    }`}>
                      {inv.status}
                    </span>
                    <button 
                      onClick={(e) => handleDelete(inv.id, e)}
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition-colors cursor-pointer"
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                  
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-text-primary)] truncate">{getTargetName(inv.target_id)}</h4>
                    <p className="text-[10px] text-[var(--color-text-secondary)] mt-1">
                      Baseline: <span className="text-[var(--color-text-primary)] font-semibold font-mono">{getProfileName(inv.baseline_profile_id)}</span>
                    </p>
                    <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">
                      Comparisons: <span className="text-[var(--color-text-primary)] font-semibold font-mono">{inv.comparison_profile_ids?.length || 0} profiles</span>
                    </p>
                  </div>
                  
                  {inv.status === "draft" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStart(inv.id);
                      }}
                      className="mt-1 w-full flex items-center justify-center gap-1.5 py-1 rounded bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-semibold text-xs transition-colors cursor-pointer"
                    >
                      <PlayCircle size={13} /> Run Diagnostics
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Detailed Assessment Report */}
        <div className="lg:col-span-2 border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/40 rounded p-4 flex flex-col min-h-0 overflow-y-auto">
          {selectedInv ? (
            <div className="space-y-4">
              
              {/* Verdict Banner */}
              {selectedInv.overall_assessment ? (() => {
                const assess = JSON.parse(selectedInv.overall_assessment);
                return (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3.5 p-4 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel-elevated)]">
                      <div className="w-8 h-8 rounded bg-[var(--color-info-soft)] border border-[var(--color-info)]/10 flex items-center justify-center text-[var(--color-info)] shrink-0">
                        <Info size={16} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider font-mono">Assessment Verdict</h4>
                        <p className="text-sm font-bold text-[var(--color-text-primary)] leading-snug">{assess.verdict}</p>
                        <p className="text-[10px] text-[var(--color-text-secondary)]">
                          Confidence Level: <span className="capitalize font-mono font-bold text-[var(--color-accent-primary)]">{assess.confidence}</span>
                        </p>
                      </div>
                    </div>

                    {/* Explanations section */}
                    {assess.explanations && assess.explanations.length > 0 && (
                      <div className="space-y-1.5">
                        <h4 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider font-mono">Analysis Findings</h4>
                        <div className="p-3.5 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded space-y-1.5 text-xs text-[var(--color-text-primary)] leading-relaxed">
                          {assess.explanations.map((line: string, i: number) => (
                            <p key={i}>{line}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Supporting and Contradicting Signals */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 select-none">
                      <div className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded p-3 space-y-2">
                        <h5 className="text-[10px] uppercase font-bold text-[var(--color-success)] flex items-center gap-1.5 font-mono border-b border-[var(--color-border-subtle)] pb-1">
                          <CheckCircle size={12} /> Supporting Signals
                        </h5>
                        <ul className="space-y-1.5 text-xs text-[var(--color-text-secondary)] list-disc list-inside">
                          {assess.supporting?.map((s: string, idx: number) => (
                            <li key={idx} className="leading-normal">{s}</li>
                          )) || <li className="text-[var(--color-text-muted)] italic list-none">None</li>}
                        </ul>
                      </div>

                      <div className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded p-3 space-y-2">
                        <h5 className="text-[10px] uppercase font-bold text-[var(--color-danger)] flex items-center gap-1.5 font-mono border-b border-[var(--color-border-subtle)] pb-1">
                          <XCircle size={12} /> Contradicting/Limiting
                        </h5>
                        <ul className="space-y-1.5 text-xs text-[var(--color-text-secondary)] list-disc list-inside">
                          {assess.contradicting?.map((s: string, idx: number) => (
                            <li key={idx} className="leading-normal">{s}</li>
                          )) || <li className="text-[var(--color-text-muted)] italic list-none">None</li>}
                        </ul>
                      </div>
                    </div>

                    {/* Side-by-side comparison matrix */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider font-mono">Comparison Matrix</h4>
                      <div className="border border-[var(--color-border-default)] rounded overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-[var(--color-bg-topbar)] text-[10px] uppercase font-bold text-[var(--color-text-secondary)] border-b border-[var(--color-border-default)]">
                              <th className="px-3.5 py-2">Profile</th>
                              <th className="px-3.5 py-2">Status</th>
                              <th className="px-3.5 py-2">HTTP Status</th>
                              <th className="px-3.5 py-2">Latency</th>
                              <th className="px-3.5 py-2">DNS Resolved IPs</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--color-border-subtle)] text-[var(--color-text-primary)]">
                            {/* Baseline Row */}
                            <tr className="bg-[var(--color-accent-primary)]/10">
                              <td className="px-3.5 py-2.5 font-semibold">
                                {getProfileName(assess.baseline.profile_id)} <span className="text-[9px] text-[var(--color-accent-primary-hover)] font-normal font-mono">(Baseline)</span>
                              </td>
                              <td className="px-3.5 py-2.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase font-mono ${
                                  assess.baseline.status === "up" ? "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/10" : "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/10"
                                }`}>
                                  {assess.baseline.status}
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 font-mono font-semibold">
                                {assess.baseline.http_status || "—"}
                              </td>
                              <td className="px-3.5 py-2.5 text-[var(--color-text-secondary)] font-mono">
                                {assess.baseline.latency_ms ? `${assess.baseline.latency_ms} ms` : "—"}
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-[10px] truncate max-w-[200px] text-[var(--color-text-secondary)]" title={assess.baseline.dns}>
                                {assess.baseline.dns || "—"}
                              </td>
                            </tr>
                            
                            {/* Comparison Rows */}
                            {assess.comparisons?.map((c: any, index: number) => (
                              <tr key={index} className="hover:bg-[var(--color-bg-panel-hover)]">
                                <td className="px-3.5 py-2.5 font-semibold text-[var(--color-text-secondary)]">
                                  {getProfileName(c.profile_id)}
                                </td>
                                <td className="px-3.5 py-2.5">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase font-mono ${
                                    c.status === "up" ? "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/10" : "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/10"
                                  }`}>
                                    {c.status}
                                  </span>
                                </td>
                                <td className="px-3.5 py-2.5 font-mono font-semibold">
                                  {c.http_status || "—"}
                                </td>
                                <td className="px-3.5 py-2.5 text-[var(--color-text-secondary)] font-mono">
                                  {c.latency_ms ? `${c.latency_ms} ms` : "—"}
                                </td>
                                <td className="px-3.5 py-2.5 font-mono text-[10px] truncate max-w-[200px] text-[var(--color-text-secondary)]" title={c.dns}>
                                  {c.dns || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Legal / Attribution notice */}
                    <div className="p-3 border border-[var(--color-border-default)] bg-[var(--color-bg-panel-elevated)] rounded space-y-1 select-none">
                      <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Attribution Disclaimer</span>
                      <p className="text-xs font-mono font-bold text-[var(--color-text-secondary)]">Unknown</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
                        To maintain technical neutrality, attribution defaults to unknown. Cross-profile discrepancies can be due to destination geofencing, CDN DNS localisations, network transient faults, or firewall rules.
                      </p>
                    </div>

                  </div>
                );
              })() : (
                <div className="py-12">
                  <EmptyState
                    title="NO VERDICT LOADED"
                    description="Trigger a comparison run on the left sidebar to generate detailed reports."
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="py-12">
              <EmptyState
                title="DIAGNOSTIC ARCHIVE"
                description="Select an investigation from the left sidebar to display reports and comparison matrices."
              />
            </div>
          )}
        </div>

      </div>

      {/* New Investigation Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[440px] bg-[var(--color-bg-panel-elevated)] border border-[var(--color-border-strong)] rounded p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] pb-2.5">
              <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">New Access Investigation</h3>
              <button 
                onClick={() => setShowAddDialog(false)}
                className="p-1 rounded hover:bg-[var(--color-bg-panel-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Warning Message */}
            <div className="flex items-start gap-2.5 p-3 rounded bg-[var(--color-warning-soft)] border border-[var(--color-warning)]/20 text-[var(--color-warning)] text-xs">
              <Warning size={18} className="shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Attribution Scope Warning:</strong> Staged investigations resolve targets via comparison proxies and public paths. Ensure this target host does not resolve to private addresses within internal subnet zones.
              </p>
            </div>

            {/* Inputs */}
            <div className="space-y-3.5 text-xs">
              
              {/* Target Selector */}
              <div className="space-y-1">
                <label className="text-[var(--color-text-secondary)] font-bold font-mono text-[10px] uppercase">Target to Investigate</label>
                <select
                  value={selectedTargetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                  className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] rounded px-2.5 py-1.5 focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer"
                >
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.url})</option>
                  ))}
                </select>
              </div>

              {/* Baseline Selector */}
              <div className="space-y-1">
                <label className="text-[var(--color-text-secondary)] font-bold font-mono text-[10px] uppercase">Baseline Profile</label>
                <select
                  value={baselineProfileId}
                  onChange={(e) => setBaselineProfileId(e.target.value)}
                  className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] rounded px-2.5 py-1.5 focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer"
                >
                  <option value="system-default">System Default</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Comparison list checkboxes */}
              <div className="space-y-1.5">
                <label className="text-[var(--color-text-secondary)] font-bold font-mono text-[10px] uppercase">Comparison Profiles</label>
                <div className="p-3 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded max-h-36 overflow-y-auto space-y-2">
                  {profiles.length === 0 ? (
                    <p className="text-[var(--color-text-muted)] italic text-[11px]">No network profiles defined. Set them up in settings.</p>
                  ) : (
                    profiles.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-[var(--color-text-secondary)] select-none cursor-pointer hover:text-[var(--color-text-primary)] transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedComparisonProfiles.includes(p.id)}
                          onChange={() => toggleComparisonProfile(p.id)}
                          className="rounded border-[var(--color-border-default)] bg-[var(--color-bg-input)] text-[var(--color-accent-primary)] focus:ring-0"
                        />
                        <span className="font-semibold text-xs">{p.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 border-t border-[var(--color-border-strong)] pt-3">
              <button
                onClick={() => setShowAddDialog(false)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-3.5 py-1.5 text-xs font-semibold rounded bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:border-[var(--color-text-primary)] transition-all cursor-pointer"
              >
                Create & Run
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default Investigations;
