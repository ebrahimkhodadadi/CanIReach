import React, { useEffect, useMemo, useState } from "react";
import { TracerouteHop } from "../types";
import { CaretDown, CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import { matchesTableSearch, paginateItems, PaginationControls } from "../../../components/shared/Primitives";

interface TracerouteHopTableProps {
  hops: TracerouteHop[];
  onHopSelect: (hop: TracerouteHop) => void;
  selectedHopNumber: number | null;
}

export const TracerouteHopTable: React.FC<TracerouteHopTableProps> = ({
  hops,
  onHopSelect,
  selectedHopNumber,
}) => {
  const [expandedHops, setExpandedHops] = useState<Record<number, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  useEffect(() => {
    setPage(1);
  }, [hops.length, searchQuery]);

  const filteredHops = useMemo(() => {
    return hops.filter((hop) => {
      const searchableText = [hop.address, hop.hostname, hop.status, hop.hop_number.toString()].join(" ");
      return matchesTableSearch(searchableText, searchQuery);
    });
  }, [hops, searchQuery]);

  const pagedHops = paginateItems(filteredHops, pageSize, page);

  const toggleExpand = (hopNumber: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedHops((prev) => ({
      ...prev,
      [hopNumber]: !prev[hopNumber],
    }));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 border border-slate-800/80 rounded-xl bg-slate-950/20 overflow-hidden font-sans">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-950/30 px-3 py-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-400">Trace hops</span>
        <label className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950/50 px-2.5 py-1 text-[10px] text-slate-400">
          <MagnifyingGlass size={12} className="text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hop"
            className="w-28 bg-transparent outline-none text-slate-200"
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse select-text">
          <thead>
            <tr className="border-b border-slate-800 bg-[#07090e]/70 sticky top-0 z-10 text-[10px] text-slate-500 uppercase tracking-wider font-bold select-none">
              <th className="py-2.5 px-4 w-10 text-center"></th>
              <th className="py-2.5 px-4 w-12 text-center">Hop</th>
              <th className="py-2.5 px-4">IP Address</th>
              <th className="py-2.5 px-4">Hostname</th>
              <th className="py-2.5 px-4">Min RTT</th>
              <th className="py-2.5 px-4">Avg RTT</th>
              <th className="py-2.5 px-4">Max RTT</th>
              <th className="py-2.5 px-4">Loss %</th>
              <th className="py-2.5 px-4">Probes</th>
              <th className="py-2.5 px-4">Status</th>
            </tr>
          </thead>

          <tbody className="text-xs">
            {pagedHops.items.length > 0 ? (
              pagedHops.items.map((hop) => {
                const isSelected = selectedHopNumber === hop.hop_number;
                const isExpanded = !!expandedHops[hop.hop_number];
                const isTimeout = hop.status === "timeout";
                const address = hop.address || "—";
                const hostname = hop.hostname || "—";

                // RTT summary stats based on real probe values
                const rtts = hop.rtt_values_ms || [];
                const minRtt = rtts.length > 0 ? Math.min(...rtts) : null;
                const maxRtt = rtts.length > 0 ? Math.max(...rtts) : null;

                return (
                  <React.Fragment key={hop.hop_number}>
                    <tr
                      onClick={() => onHopSelect(hop)}
                      className={`border-b border-slate-900/60 hover:bg-slate-900/35 cursor-pointer transition-colors ${
                        isSelected ? "bg-indigo-650/10 hover:bg-indigo-650/15" : ""
                      }`}
                    >
                      <td className="py-3 px-2 text-center">
                        <button
                          onClick={(e) => toggleExpand(hop.hop_number, e)}
                          className="p-1 hover:bg-slate-900 rounded text-slate-500 hover:text-slate-350 cursor-pointer"
                        >
                          {isExpanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-center text-slate-400">
                        {hop.hop_number}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-200 truncate max-w-[120px]" title={address}>
                        {address}
                      </td>
                      <td className="py-3 px-4 text-slate-300 truncate max-w-[150px]" title={hostname}>
                        {hostname}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {minRtt !== null ? `${minRtt.toFixed(1)} ms` : "—"}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-200">
                        {hop.rtt_ms !== null ? `${hop.rtt_ms.toFixed(1)} ms` : "—"}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {maxRtt !== null ? `${maxRtt.toFixed(1)} ms` : "—"}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {hop.packet_loss_percent !== null ? `${hop.packet_loss_percent.toFixed(0)}%` : "Not available"}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {rtts.length > 0 ? rtts.map(r => `${r.toFixed(0)}ms`).join(", ") : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase ${
                          isTimeout 
                            ? "bg-rose-500/10 border-rose-500/20 text-rose-400" 
                            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        }`}>
                          {hop.status}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && hop.raw_line && (
                      <tr className="bg-slate-950/40">
                        <td colSpan={10} className="py-2.5 px-6 border-b border-slate-900/60">
                          <div className="flex flex-col gap-1 text-[10px] font-mono text-slate-400 select-all leading-normal">
                            <span className="text-[9px] text-slate-500 font-semibold uppercase">Raw stdout Output line:</span>
                            <pre className="p-2 bg-slate-950 rounded border border-slate-900 overflow-x-auto whitespace-pre-wrap">{hop.raw_line}</pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="text-center py-20 text-slate-500">
                  No trace data available. Select target and click "Start Trace Diagnostics".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <PaginationControls
        currentPage={pagedHops.currentPage}
        totalPages={pagedHops.totalPages}
        totalItems={pagedHops.totalItems}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
};
