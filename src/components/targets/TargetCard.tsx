import { motion } from "framer-motion";
import { Clock, Play } from "@phosphor-icons/react";
import { Target, ProbeResult } from "../../features/probes/types";
import { getStatusDisplayInfo } from "../../utils/status";

interface TargetCardProps {
  target: Target;
  result: ProbeResult | undefined;
  isProbing: boolean;
  onSelect: () => void;
  onRetest: () => void;
}

export const TargetCard: React.FC<TargetCardProps> = ({
  target,
  result,
  isProbing,
  onSelect,
  onRetest,
}) => {
  const statusInfo = getStatusDisplayInfo(isProbing, result);

  return (
    <motion.div
      layoutId={`card-${target.id}`}
      onClick={onSelect}
      className={`group relative flex items-center justify-between p-3 monitor-card cursor-pointer select-none overflow-hidden ${statusInfo.bg}`}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-r from-transparent via-slate-800/10 to-transparent pointer-events-none transition-opacity duration-300" />
      
      <div className="flex items-center gap-2.5 min-w-0 z-10">
        <span className="text-sm shrink-0">{statusInfo.emoji}</span>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">
            {target.name}
          </h3>
          <p className="text-[10px] text-slate-500 truncate mt-0.5 font-mono">
            {target.url}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0 z-10">
        {result && !isProbing && (
          <div className="flex items-center gap-2 text-right">
            {result.http_status && (
              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${statusInfo.badgeColor}`}>
                {result.http_status}
              </span>
            )}
            {result.latency_ms > 0 && (
              <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                <Clock size={10} className="text-slate-500" />
                {result.latency_ms}ms
              </span>
            )}
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onRetest();
          }}
          disabled={isProbing}
          className="p-1 rounded bg-[#1e293b] hover:bg-[#334155] border border-[#334155] text-slate-300 hover:text-white transition-all cursor-pointer"
          title="Retest target"
        >
          <Play size={10} weight="fill" className={isProbing ? "animate-spin" : ""} />
        </button>
      </div>
    </motion.div>
  );
};
