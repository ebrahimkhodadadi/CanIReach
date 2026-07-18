import React from "react";
import { TracerouteHop } from "../types";
import { WarningCircle, CheckCircle, Question } from "@phosphor-icons/react";

interface TraceroutePathGraphProps {
  hops: TracerouteHop[];
  isProbing: boolean;
  destinationReached: boolean;
}

export const TraceroutePathGraph: React.FC<TraceroutePathGraphProps> = ({
  hops,
  isProbing,
  destinationReached,
}) => {
  return (
    <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/20 space-y-4 select-none font-sans">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Network Path Graph</h3>

      <div className="flex flex-col gap-3 min-h-[120px] max-h-[360px] overflow-y-auto pr-2">
        {/* Local Machine */}
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-400 shrink-0">
            LOC
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-slate-200">Local Machine</span>
            <span className="text-[10px] text-slate-500 font-mono">Gateway Interface</span>
          </div>
        </div>

        {hops.length > 0 ? (
          hops.map((hop) => {
            const isTimeout = hop.status === "timeout";
            const isPartial = hop.packet_loss_percent !== null && hop.packet_loss_percent > 0 && hop.packet_loss_percent < 100;
            const address = hop.address || "—";
            const hostname = hop.hostname || "";

            let nodeColor = "border-emerald-500/30 bg-emerald-500/5 text-emerald-400";
            let statusIcon = <CheckCircle size={10} />;
            
            if (isTimeout) {
              nodeColor = "border-rose-500/20 bg-rose-500/5 text-rose-400";
              statusIcon = <WarningCircle size={10} />;
            } else if (isPartial) {
              nodeColor = "border-amber-500/30 bg-amber-500/5 text-amber-400";
              statusIcon = <Question size={10} />;
            }

            // Dotted connector if intermediate hop timed out
            const connectorStyle = isTimeout
              ? "border-l-2 border-dashed border-rose-500/20"
              : "border-l-2 border-slate-800";

            return (
              <div key={hop.hop_number} className="relative flex flex-col pl-3">
                <div className={`absolute left-[11px] -top-3 w-0 h-3 ${connectorStyle}`} />

                <div className="flex items-center gap-3 mt-2">
                  <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${nodeColor}`}>
                    {hop.hop_number}
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-slate-300 truncate max-w-[200px]" title={hostname || address}>
                        {hostname || address}
                      </span>
                      {hostname && (
                        <span className="text-[9px] text-slate-500 font-mono truncate max-w-[150px]" title={address}>
                          ({address})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono mt-0.5">
                      {hop.rtt_ms !== null && (
                        <span>RTT: {hop.rtt_ms.toFixed(1)}ms</span>
                      )}
                      {hop.packet_loss_percent !== null && (
                        <span>Loss: {hop.packet_loss_percent.toFixed(0)}%</span>
                      )}
                      <span className="flex items-center gap-0.5">
                        {statusIcon}
                        <span className="capitalize">{hop.status}</span>
                      </span>
                      {hop.is_destination && (
                        <span className="px-1 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[8px] font-bold uppercase font-sans">
                          Destination
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-xs py-10">
            {isProbing ? "Probing path..." : "No traceroute active. Start trace to map network path."}
          </div>
        )}

        {hops.length > 0 && !isProbing && (
          <div className="relative pl-3 flex flex-col">
            <div className="absolute left-[11px] -top-3 w-0.5 h-3 bg-slate-800" />
            <div className="flex items-center gap-3 mt-2">
              <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                destinationReached 
                  ? "bg-emerald-500/15 border-emerald-500/20 text-emerald-400" 
                  : "bg-slate-900 border-slate-800 text-slate-500"
              }`}>
                {destinationReached ? <CheckCircle size={14} /> : <WarningCircle size={14} />}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-slate-200">
                  {destinationReached ? "Destination Reached" : "Trace Incomplete"}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {destinationReached ? "Diagnostic path complete" : "Last hops timed out / filtered"}
                </span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
