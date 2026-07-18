import React, { useState, useMemo } from "react";
import { Target } from "../../probes/types";
import { TracerouteHop } from "../types";
import { useTraces, useActiveRuns } from "../store/selectors";
import { useTracerouteActions } from "../store/selectors";
import { TraceroutePathGraph } from "./TraceroutePathGraph";
import { TracerouteHopTable } from "./TracerouteHopTable";
import { TracerouteHopDetails } from "./TracerouteHopDetails";
import { Play, Stop, Broom, Terminal } from "@phosphor-icons/react";

interface TracerouteViewProps {
  targets: Target[];
}

export const TracerouteView: React.FC<TracerouteViewProps> = ({ targets }) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [localMaxHops, setLocalMaxHops] = useState<number>(30);
  const [localResolve, setLocalResolve] = useState<boolean>(true);
  const [selectedHop, setSelectedHop] = useState<TracerouteHop | null>(null);
  const [showRawOutput, setShowRawOutput] = useState<boolean>(false);

  const traces = useTraces();
  const activeRuns = useActiveRuns();
  const { runTrace, cancelActiveTrace, clearTrace, setMaxHops, setResolveHostnames } = useTracerouteActions();

  const currentResult = useMemo(() => {
    if (!selectedTargetId) return undefined;
    return traces[selectedTargetId];
  }, [traces, selectedTargetId]);

  const activeRunId = useMemo(() => {
    if (!selectedTargetId) return undefined;
    return activeRuns[selectedTargetId];
  }, [activeRuns, selectedTargetId]);

  const isProbing = !!activeRunId;

  const handleStartTrace = () => {
    if (!selectedTargetId) return;
    setSelectedHop(null);
    setMaxHops(localMaxHops);
    setResolveHostnames(localResolve);
    runTrace(selectedTargetId);
  };

  const handleCancelTrace = () => {
    if (!selectedTargetId) return;
    cancelActiveTrace(selectedTargetId);
  };

  const handleClearTrace = () => {
    if (!selectedTargetId) return;
    setSelectedHop(null);
    clearTrace(selectedTargetId);
  };

  const groupedTargets = useMemo(() => {
    const groups: Record<string, Target[]> = {};
    targets.forEach((t) => {
      const cat = t.category || "Uncategorized";
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(t);
    });
    return groups;
  }, [targets]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--color-bg-app)] p-4 space-y-4 overflow-hidden select-none font-sans">
      
      {/* Header */}
      <div className="border-b border-[var(--color-border-default)] pb-3 shrink-0">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">Path Diagnostics & Traceroutes</h2>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Stream hop-by-hop latency and packet loss diagnostics on-demand</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/30 shrink-0">
        
        {/* Target Selector */}
        <div className="flex flex-col gap-1 select-none">
          <label className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">Diagnostics Target</label>
          <select
            value={selectedTargetId}
            onChange={(e) => {
              setSelectedTargetId(e.target.value);
              setSelectedHop(null);
            }}
            disabled={isProbing}
            className="px-2.5 py-1.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-input)] text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)] cursor-pointer min-w-[200px]"
          >
            <option value="">Select a target...</option>
            {Object.entries(groupedTargets).map(([category, list]) => (
              <optgroup key={category} label={category} className="bg-[var(--color-bg-panel-elevated)] font-semibold font-sans">
                {list.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[var(--color-bg-input)]">
                    {t.name} ({t.url})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Max Hops */}
        <div className="flex flex-col gap-1 select-none">
          <label className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">Max Hops (1-64)</label>
          <input
            type="number"
            min={1}
            max={64}
            value={localMaxHops}
            onChange={(e) => setLocalMaxHops(Math.max(1, Math.min(64, parseInt(e.target.value) || 30)))}
            disabled={isProbing}
            className="px-2.5 py-1.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-input)] text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)] w-20 font-mono"
          />
        </div>

        {/* Resolve DNS */}
        <div className="flex items-center gap-2 mt-5 select-none">
          <input
            type="checkbox"
            id="resolveDns"
            checked={localResolve}
            onChange={(e) => setLocalResolve(e.target.checked)}
            disabled={isProbing}
            className="rounded border-[var(--color-border-default)] bg-[var(--color-bg-input)] text-[var(--color-accent-primary)] focus:ring-0 h-4 w-4 cursor-pointer"
          />
          <label htmlFor="resolveDns" className="text-xs text-[var(--color-text-secondary)] cursor-pointer select-none font-semibold">
            Resolve Hostnames
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-end gap-2.5 h-full mt-5 ml-auto select-none">
          {!isProbing ? (
            <button
              onClick={handleStartTrace}
              disabled={!selectedTargetId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] disabled:opacity-50 text-[var(--color-text-primary)] font-semibold rounded text-xs transition-colors cursor-pointer"
            >
              <Play size={12} weight="fill" className="text-[var(--color-accent-primary-hover)]" />
              Start Trace
            </button>
          ) : (
            <button
              onClick={handleCancelTrace}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-danger-soft)] hover:bg-[var(--color-danger)]/25 border border-[var(--color-danger)]/25 text-[var(--color-danger)] rounded text-xs font-semibold cursor-pointer animate-pulse"
            >
              <Stop size={12} weight="fill" />
              Cancel Trace
            </button>
          )}

          <button
            onClick={handleClearTrace}
            disabled={isProbing || !currentResult}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] disabled:opacity-50 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded text-xs font-semibold cursor-pointer"
            title="Clear Diagnostics Data"
          >
            <Broom size={12} />
            Clear
          </button>
        </div>

      </div>

      {/* Summary Box */}
      {currentResult && (
        <div className="p-3 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/30 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs shrink-0 select-text">
          <div>
            <span className="text-[9px] text-[var(--color-text-muted)] block uppercase font-mono font-bold">Platform</span>
            <span className="font-mono text-[var(--color-text-primary)] font-semibold uppercase">{currentResult.platform}</span>
          </div>
          <div>
            <span className="text-[9px] text-[var(--color-text-muted)] block uppercase font-mono font-bold">Method</span>
            <span className="font-mono text-[var(--color-text-primary)] font-semibold uppercase">{currentResult.method}</span>
          </div>
          <div>
            <span className="text-[9px] text-[var(--color-text-muted)] block uppercase font-mono font-bold">Destination reached</span>
            <span className="font-mono text-[var(--color-text-primary)] font-semibold">
              {currentResult.destination_reached ? "Destination responded" : "Route incomplete"}
            </span>
          </div>
          <div>
            <span className="text-[9px] text-[var(--color-text-muted)] block uppercase font-mono font-bold">Duration</span>
            <span className="font-mono text-[var(--color-text-primary)] font-semibold">
              {currentResult.duration_ms !== null ? `${(currentResult.duration_ms / 1000).toFixed(1)}s` : "—"}
            </span>
          </div>
          <div>
            <span className="text-[9px] text-[var(--color-text-muted)] block uppercase font-mono font-bold">Destination IP</span>
            <span className="font-mono text-[var(--color-text-primary)] font-semibold truncate block" title={currentResult.destination_address || ""}>
              {currentResult.destination_address || "—"}
            </span>
          </div>
        </div>
      )}

      {/* Main Workspace Split */}
      <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0">
        
        {/* Left Side: Path Graph & Selection Details */}
        <div className="w-full md:w-80 flex flex-col gap-4 shrink-0 overflow-y-auto">
          <TraceroutePathGraph
            hops={currentResult?.hops || []}
            isProbing={isProbing}
            destinationReached={currentResult?.destination_reached || false}
          />

          {selectedHop && (
            <TracerouteHopDetails hop={selectedHop} />
          )}

          {currentResult?.raw_output && (
            <div className="border border-[var(--color-border-default)] rounded overflow-hidden shrink-0">
              <button
                onClick={() => setShowRawOutput(!showRawOutput)}
                className="w-full flex items-center justify-between p-2.5 bg-[var(--color-bg-panel)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Terminal size={13} />
                  Raw Output Console
                </span>
                <span>{showRawOutput ? "Hide" : "Show"}</span>
              </button>
              {showRawOutput && (
                <div className="p-2.5 bg-[var(--color-bg-input)] border-t border-[var(--color-border-default)] text-[10px] font-mono text-[var(--color-text-primary)] overflow-auto whitespace-pre select-all max-h-[160px]">
                  {currentResult.raw_output}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Hop Table */}
        <div className="flex-1 flex flex-col min-h-0">
          <TracerouteHopTable
            hops={currentResult?.hops || []}
            onHopSelect={setSelectedHop}
            selectedHopNumber={selectedHop?.hop_number || null}
          />
        </div>

      </div>

    </div>
  );
};
