import React from "react";
import { ArrowsClockwise, Broadcast } from "@phosphor-icons/react";

interface HeaderProps {
  isProbingAll: boolean;
  onProbeAll: () => void;
  testedCount: number;
  totalCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  isProbingAll,
  onProbeAll,
  testedCount,
  totalCount,
}) => {
  return (
    <header className="h-[52px] bg-[var(--color-bg-topbar)] border-b border-[var(--color-border-default)] px-4 flex items-center justify-between shrink-0 select-none">
      
      {/* Engine Status Indicators */}
      <div className="flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-success)] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--color-success)]"></span>
          </span>
          <span className="font-mono font-bold text-[var(--color-success)] flex items-center gap-1.5">
            <Broadcast size={12} weight="fill" />
            ENGINE ONLINE
          </span>
        </div>
        
        <div className="h-3 w-[1px] bg-[var(--color-border-subtle)]" />
        
        <div className="text-[var(--color-text-secondary)] font-mono">
          Profile: <span className="text-[var(--color-text-primary)] font-bold">System Default</span>
        </div>

        <div className="h-3 w-[1px] bg-[var(--color-border-subtle)]" />

        <div className="text-[var(--color-text-muted)] font-mono hidden sm:block">
          Monitored: <span className="text-[var(--color-text-secondary)] font-bold">{totalCount} targets</span>
        </div>
      </div>

      {/* Checking Progress / Status */}
      <div className="flex items-center gap-3">
        {isProbingAll && (
          <span className="text-[10px] text-[var(--color-warning)] font-mono flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[var(--color-warning)] animate-ping" />
            Auditing: {testedCount} / {totalCount} ...
          </span>
        )}

        {/* Primary Retest Button */}
        <button
          onClick={onProbeAll}
          disabled={isProbingAll}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] disabled:bg-[var(--color-bg-app)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] disabled:border-[var(--color-border-subtle)] disabled:opacity-50 text-[var(--color-text-primary)] disabled:text-[var(--color-text-disabled)] font-semibold rounded text-xs transition-all active:scale-[0.98] cursor-pointer"
        >
          <ArrowsClockwise size={11} className={isProbingAll ? "animate-spin" : ""} />
          {isProbingAll ? "Testing All..." : "Run Test All"}
        </button>
      </div>

    </header>
  );
};
