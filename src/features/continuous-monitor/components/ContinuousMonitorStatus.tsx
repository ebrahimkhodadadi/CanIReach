import { Pause, Square, Spinner } from "@phosphor-icons/react";
import { MonitorSession } from "../types";

interface ContinuousMonitorStatusProps {
  session: MonitorSession | null;
  onStop: () => void;
}

const STATE_CONFIG: Record<string, { color: string; label: string; icon: typeof Square }> = {
  running: { color: "text-emerald-400", label: "Running", icon: Spinner },
  paused: { color: "text-amber-400", label: "Paused", icon: Pause },
  stopped: { color: "text-slate-500", label: "Stopped", icon: Square },
  idle: { color: "text-slate-500", label: "Idle", icon: Square },
};

export const ContinuousMonitorStatus: React.FC<ContinuousMonitorStatusProps> = ({
  session,
  onStop,
}) => {
  if (!session || session.state === "stopped" || session.state === "idle") {
    return null;
  }

  const config = STATE_CONFIG[session.state] || STATE_CONFIG.idle;
  const Icon = config.icon;
  const uptime = session.total_runs > 0
    ? Math.round((session.successful_runs / session.total_runs) * 100)
    : 0;

  return (
    <div className="flex items-center gap-2 text-[9px] font-mono select-none">
      <span className={`flex items-center gap-1 ${config.color} ${session.state === "running" ? "animate-pulse" : ""}`}>
        <Icon size={10} weight="fill" className={session.state === "running" ? "animate-spin" : ""} />
        {config.label}
      </span>
      <span className="text-[var(--color-text-muted)]">
        {session.total_runs} runs · {uptime}% uptime
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onStop(); }}
        className="p-0.5 rounded hover:bg-[var(--color-danger-soft)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] cursor-pointer"
        title="Stop continuous test"
      >
        <Square size={8} weight="fill" />
      </button>
    </div>
  );
};
