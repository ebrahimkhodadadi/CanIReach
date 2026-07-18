import React from "react";
import { TracerouteHop } from "../types";
import { Copy } from "@phosphor-icons/react";

interface TracerouteHopDetailsProps {
  hop: TracerouteHop;
}

export const TracerouteHopDetails: React.FC<TracerouteHopDetailsProps> = ({ hop }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(hop, null, 2));
  };

  return (
    <div className="p-4 rounded-xl border border-slate-800 bg-[#0d1117]/35 space-y-4 select-text font-sans">
      <div className="flex justify-between items-center select-none">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
          Hop {hop.hop_number} Details
        </h4>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
        >
          <Copy size={12} />
          Copy Hop JSON
        </button>
      </div>

      <div className="space-y-2 text-xs">
        {hop.responses.map((resp, idx) => (
          <div key={idx} className="flex justify-between py-1 border-b border-slate-800/40 font-mono">
            <span className="text-slate-500">Probe {idx + 1}:</span>
            <span className={resp.responded ? "text-slate-200" : "text-rose-400"}>
              {resp.responded 
                ? `${resp.rtt_ms?.toFixed(1)} ms (${resp.hostname || resp.address})` 
                : "Timed out"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
