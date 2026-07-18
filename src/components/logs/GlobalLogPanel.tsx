import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Terminal, Trash, CaretUp, CaretDown, WarningCircle } from "@phosphor-icons/react";
import { GlobalLogStep } from "../../features/probes/store/probeStore";

interface GlobalLogPanelProps {
  logs: GlobalLogStep[];
  onClear: () => void;
  isOpen: boolean;
  onToggle: () => void;
  onTargetSelect: (name: string) => void;
}

export const GlobalLogPanel: React.FC<GlobalLogPanelProps> = ({
  logs,
  onClear,
  isOpen,
  onToggle,
  onTargetSelect,
}) => {
  const [levelFilter, setLevelFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Filter logs
  const filteredLogs = useMemo(() => {
    let result = [...logs];

    if (levelFilter !== "ALL") {
      result = result.filter((l) => l.level === levelFilter);
    }

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (l) =>
          l.message.toLowerCase().includes(query) ||
          l.target_name.toLowerCase().includes(query)
      );
    }

    return result;
  }, [logs, levelFilter, search]);

  // Status counts
  const errorCount = useMemo(() => logs.filter((l) => l.level === "ERROR").length, [logs]);
  const latestMessage = logs.length > 0 ? logs[logs.length - 1] : null;

  // Auto-scroll logic
  useEffect(() => {
    if (isOpen && autoScroll && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, filteredLogs, autoScroll]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-35 flex flex-col bg-[var(--color-bg-app)] border-t border-[var(--color-border-subtle)]">
      
      {/* Console Toggle Bar */}
      <div 
        onClick={onToggle}
        className="px-6 py-2 bg-[var(--color-bg-topbar)] border-b border-[var(--color-border-subtle)] flex items-center justify-between cursor-pointer hover:bg-[var(--color-bg-panel-hover)] select-none shrink-0"
      >
        <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
          <span className="flex items-center gap-1.5 uppercase tracking-wider">
            <Terminal size={14} className="text-indigo-400" />
            Live Logs Stream
          </span>
          {errorCount > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px]">
              <WarningCircle size={10} />
              {errorCount} errors
            </span>
          )}
          {latestMessage && !isOpen && (
            <span className="text-[10px] text-slate-500 truncate max-w-sm font-normal font-mono hidden sm:inline">
              Latest: {latestMessage.target_name}: {latestMessage.message}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOpen ? <CaretDown size={16} /> : <CaretUp size={16} />}
        </div>
      </div>

      {/* Console Area */}
      {isOpen && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 260 }}
          exit={{ height: 0 }}
          className="flex flex-col overflow-hidden"
        >
          {/* Controls Bar */}
          <div className="px-6 py-2 bg-[var(--color-bg-sidebar)] border-b border-[var(--color-border-subtle)] flex flex-wrap items-center gap-3 shrink-0 select-none text-xs text-[var(--color-text-secondary)]">
            
            {/* Level Filter */}
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] rounded px-2 py-1 focus:outline-none focus:border-[var(--color-accent-primary)] cursor-pointer"
            >
              <option value="ALL">All Levels</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
            </select>

            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs..."
              className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] rounded px-2 py-1 focus:outline-none focus:border-[var(--color-accent-primary)]"
            />

            {/* AutoScroll checkbox */}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded border-slate-800 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer"
              />
              Auto-Scroll
            </label>

            {/* Clear button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="flex items-center gap-1 hover:text-slate-200 transition-colors cursor-pointer"
              title="Clear visible logs"
            >
              <Trash size={12} />
              Clear
            </button>

            <div className="ml-auto text-[10px] text-slate-500 font-mono">
              Filtered {filteredLogs.length} / {logs.length} events
            </div>

          </div>

          {/* Log Messages Stream */}
          <div className="flex-1 p-5 overflow-y-auto font-mono text-[11px] space-y-1.5 select-text selection:bg-[var(--color-bg-panel-hover)] bg-[var(--color-bg-panel)]">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log, idx) => {
                const isErr = log.level === "ERROR";
                const isWarn = log.level === "WARN";
                return (
                  <div 
                    key={idx} 
                    onClick={() => onTargetSelect(log.target_name)}
                    className="flex gap-2 leading-relaxed hover:bg-[var(--color-bg-panel-hover)]/40 p-0.5 rounded cursor-pointer transition-colors"
                  >
                    <span className="text-[var(--color-text-muted)] select-none shrink-0">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    {log.target_name && (
                      <span className="text-[var(--color-accent-secondary)] font-bold shrink-0 hover:underline">
                        {log.target_name}:
                      </span>
                    )}
                    <span
                      className={`shrink-0 select-none ${
                        isErr ? "text-[var(--color-danger)] font-bold" : isWarn ? "text-[var(--color-warning)]" : "text-[var(--color-success)]"
                      }`}
                    >
                      [{log.level}]
                    </span>
                    <span className="text-[var(--color-text-primary)] break-all">{log.message}</span>
                  </div>
                );
              })
            ) : (
              <div className="text-slate-600 text-center py-12">
                Log stream idle. Run probes or filters to see events.
              </div>
            )}
            <div ref={consoleEndRef} />
          </div>

        </motion.div>
      )}

    </div>
  );
};
