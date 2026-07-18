import React, { useEffect } from "react";
import { 
  useTargets, 
  useProbeResults, 
  useIsProbingAll, 
  useProbingTargets, 
  useProbeActions 
} from "../../probes/store/selectors";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const CompactDashboard: React.FC = () => {
  const targets = useTargets();
  const probeResults = useProbeResults();
  const isProbingAll = useIsProbingAll();
  const probingTargets = useProbingTargets();
  const { fetchTargets, probeAll, probeOne } = useProbeActions();

  useEffect(() => {
    fetchTargets();
  }, [fetchTargets]);

  // Position restore and clamping on mount
  useEffect(() => {
    const restorePosition = async () => {
      try {
        const win = getCurrentWindow() as any;
        const savedPos = localStorage.getItem("compact_window_position");
        if (savedPos) {
          const { x, y } = JSON.parse(savedPos);
          const monitor = await win.currentMonitor();
          if (monitor) {
            const { position, size } = monitor;
            const minX = position.x;
            const maxX = position.x + size.width - 360;
            const minY = position.y;
            const maxY = position.y + size.height - 450;
            
            const clampedX = Math.max(minX, Math.min(maxX, x));
            const clampedY = Math.max(minY, Math.min(maxY, y));
            
            import("@tauri-apps/api/window").then(async (winMod) => {
              await win.setPosition(new winMod.PhysicalPosition(clampedX, clampedY));
            });
          }
        }
      } catch (e) {
        console.error("Failed to restore position:", e);
      }
    };
    restorePosition();
  }, []);

  // Watch position changes and save
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const listenToMove = async () => {
      try {
        const win = getCurrentWindow() as any;
        unlisten = await win.onMoved(({ payload: pos }: any) => {
          localStorage.setItem("compact_window_position", JSON.stringify({ x: pos.x, y: pos.y }));
        });
      } catch (e) {
        console.error(e);
      }
    };
    listenToMove();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const activeIncidents = targets.filter((t) => {
    const res = probeResults[t.id];
    return res && !probingTargets[t.id] && (res.error || (res.http_status && (res.http_status < 200 || res.http_status >= 400)));
  }).length;

  const handleClose = async () => {
    try {
      const win = getCurrentWindow();
      await win.hide(); // Hide instead of fully closing to allow quick toggle
    } catch (e) {
      console.error(e);
    }
  };

  const handleRetest = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    probeOne(id);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0B1117] text-[#E6EDF3] select-none font-sans overflow-hidden border border-[#263849]">
      {/* Title Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0D151D] border-b border-[#1C2A38] drag-region">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#22D3EE] animate-pulse"></div>
          <span className="text-xs font-semibold tracking-wider text-[#9AAABD] uppercase">CanIReach Mini</span>
        </div>
        <button 
          onClick={handleClose} 
          className="text-[#65778C] hover:text-[#E6EDF3] transition-colors cursor-pointer text-sm font-bold px-1.5 rounded hover:bg-[#1C2A38]"
        >
          ×
        </button>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-3 gap-2 p-3 bg-[#101A24] border-b border-[#1C2A38]">
        <div className="bg-[#111C27] border border-[#1C2A38] p-2 rounded flex flex-col items-center">
          <span className="text-[10px] text-[#9AAABD] uppercase tracking-wider">Targets</span>
          <span className="text-lg font-mono font-bold text-[#E6EDF3]">{targets.length}</span>
        </div>
        <div className={`border p-2 rounded flex flex-col items-center transition-colors ${activeIncidents > 0 ? "bg-[#2A141A] border-[#EF4444]/40" : "bg-[#111C27] border-[#1C2A38]"}`}>
          <span className="text-[10px] text-[#9AAABD] uppercase tracking-wider">Incidents</span>
          <span className={`text-lg font-mono font-bold ${activeIncidents > 0 ? "text-[#EF4444] animate-pulse" : "text-[#22C55E]"}`}>{activeIncidents}</span>
        </div>
        <div className="bg-[#111C27] border border-[#1C2A38] p-2 rounded flex flex-col items-center">
          <span className="text-[10px] text-[#9AAABD] uppercase tracking-wider">Probing</span>
          <span className="text-lg font-mono font-bold text-[#22D3EE]">{Object.keys(probingTargets).length}</span>
        </div>
      </div>

      {/* Targets List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {targets.map((target) => {
          const result = probeResults[target.id];
          const isProbing = probingTargets[target.id];
          
          let statusColor = "bg-slate-500 border-slate-600";
          let statusText = "Pending";
          let latencyStr = "--";
          
          if (isProbing) {
            statusColor = "bg-[#22D3EE] border-[#22D3EE] animate-pulse";
            statusText = "Checking...";
          } else if (result) {
            latencyStr = `${result.latency_ms}ms`;
            if (result.overall_status === "up") {
              statusColor = "bg-[#22C55E] border-[#22C55E]";
              statusText = "Healthy";
            } else if (result.overall_status === "degraded") {
              statusColor = "bg-[#F59E0B] border-[#F59E0B]";
              statusText = "Degraded";
            } else {
              statusColor = "bg-[#EF4444] border-[#EF4444]";
              statusText = "Unreachable";
            }
          }

          return (
            <div 
              key={target.id} 
              onClick={(e) => handleRetest(target.id, e)}
              className="flex items-center justify-between p-2.5 bg-[#111C27] hover:bg-[#162331] border border-[#1C2A38] rounded cursor-pointer transition-all group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full border ${statusColor}`} title={statusText}></span>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold truncate text-[#E6EDF3]">{target.name}</span>
                  <span className="text-[9px] text-[#9AAABD] truncate font-mono">{target.url}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-[#22D3EE]">{latencyStr}</span>
                <button 
                  onClick={(e) => handleRetest(target.id, e)}
                  className="text-[10px] text-[#9AAABD] group-hover:text-[#22D3EE] border border-[#263849] px-1.5 py-0.5 rounded bg-[#0D151D] hover:bg-[#101A24] transition-colors"
                >
                  Retest
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Controls */}
      <div className="p-3 bg-[#0D151D] border-t border-[#1C2A38] flex gap-2">
        <button 
          onClick={() => probeAll()}
          disabled={isProbingAll}
          className="flex-1 py-1.5 bg-[#162331] hover:bg-[#1C2A38] border border-[#263849] rounded text-xs font-semibold tracking-wider uppercase text-[#22D3EE] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
        >
          {isProbingAll ? "Testing All..." : "Run Test All"}
        </button>
      </div>
    </div>
  );
};
