import React from "react";
import { ArrowUp, ArrowDown, ArrowRight, WarningCircle } from "@phosphor-icons/react";

// ==========================================
// 1. StatusDot
// ==========================================
interface StatusDotProps {
  status: "healthy" | "degraded" | "unreachable" | "checking" | "unknown" | "disabled" | "not_tested" | string;
  className?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({ status, className = "" }) => {
  const normalizedStatus = status?.toLowerCase() || "unknown";
  
  let statusClass = "unknown";
  if (normalizedStatus === "healthy" || normalizedStatus === "up") statusClass = "healthy";
  else if (normalizedStatus === "degraded") statusClass = "degraded";
  else if (normalizedStatus === "unreachable" || normalizedStatus === "down" || normalizedStatus === "failed") statusClass = "unreachable";
  else if (normalizedStatus === "checking" || normalizedStatus === "testing") statusClass = "checking";

  return <span className={`status-dot ${statusClass} ${className}`} />;
};

// ==========================================
// 2. StatusBadge
// ==========================================
interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, className = "" }) => {
  const normalizedStatus = status?.toLowerCase() || "unknown";
  const displayLabel = label || status;

  let badgeClass = "unknown";
  if (normalizedStatus === "healthy" || normalizedStatus === "up" || normalizedStatus === "success" || normalizedStatus === "passed") {
    badgeClass = "healthy";
  } else if (normalizedStatus === "degraded" || normalizedStatus === "warning") {
    badgeClass = "degraded";
  } else if (normalizedStatus === "unreachable" || normalizedStatus === "down" || normalizedStatus === "failed" || normalizedStatus === "policy_violation") {
    badgeClass = "unreachable";
  } else if (normalizedStatus === "checking" || normalizedStatus === "testing") {
    badgeClass = "checking";
  }

  return (
    <span className={`console-badge ${badgeClass} ${className}`}>
      {displayLabel}
    </span>
  );
};

// ==========================================
// 3. MetricCard
// ==========================================
interface MetricCardProps {
  label: string;
  value: string | number;
  desc?: string;
  trend?: {
    direction: "up" | "down" | "flat";
    value: string;
    positive?: boolean; // green if true, red if false (or inverse depending on context)
  };
  color?: string;
  isMono?: boolean;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  desc,
  trend,
  color = "text-[var(--color-text-primary)]",
  isMono = false,
  icon: Icon,
  onClick,
}) => {
  return (
    <div 
      onClick={onClick}
      className={`console-card p-3.5 flex flex-col justify-between h-24 ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono tracking-wider">
          {label}
        </span>
        {Icon && <Icon size={14} className="text-[var(--color-text-muted)]" />}
      </div>

      <div className="flex items-baseline gap-2 mt-1">
        <span className={`text-xl font-bold font-mono-tabular ${isMono ? "font-mono" : ""} ${color}`}>
          {value}
        </span>
        {trend && (
          <span className={`text-[10px] font-mono font-bold flex items-center gap-0.5 ${
            trend.positive ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"
          }`}>
            {trend.direction === "up" ? <ArrowUp size={10} weight="bold" /> : trend.direction === "down" ? <ArrowDown size={10} weight="bold" /> : null}
            {trend.value}
          </span>
        )}
      </div>

      <span className="text-[10px] text-[var(--color-text-muted)] truncate mt-1">
        {desc}
      </span>
    </div>
  );
};

// ==========================================
// 4. Panel
// ==========================================
interface PanelProps {
  title?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  heightClass?: string;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  icon: Icon,
  actions,
  children,
  className = "",
  heightClass = "",
}) => {
  return (
    <div className={`console-panel flex flex-col overflow-hidden ${heightClass} ${className}`}>
      {title && (
        <div className="px-4 py-2.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-topbar)]/30 flex items-center justify-between shrink-0 select-none">
          <h3 className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-2 font-mono tracking-wide uppercase">
            {Icon && <Icon size={13} className="text-[var(--color-accent-primary)]" />}
            {title}
          </h3>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 min-h-0 relative">
        {children}
      </div>
    </div>
  );
};

// ==========================================
// 5. EmptyState
// ==========================================
interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  icon: Icon = WarningCircle,
}) => {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 select-none">
      <div className="w-10 h-10 rounded-full bg-[var(--color-bg-input)] border border-[var(--color-border-subtle)] flex items-center justify-center mb-3">
        <Icon size={18} className="text-[var(--color-text-muted)]" />
      </div>
      <h4 className="text-xs font-bold text-[var(--color-text-primary)] mb-1 uppercase tracking-wider font-mono">
        {title}
      </h4>
      <p className="text-xs text-[var(--color-text-secondary)] max-w-sm mb-4 leading-normal">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-3 py-1 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-semibold rounded text-xs transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
        >
          {actionLabel}
          <ArrowRight size={10} />
        </button>
      )}
    </div>
  );
};

// ==========================================
// 6. LoadingState
// ==========================================
export const LoadingState: React.FC = () => {
  return (
    <div className="w-full h-full flex flex-col space-y-3 p-4 animate-pulse select-none">
      <div className="h-4 bg-[var(--color-bg-input)] rounded w-1/4" />
      <div className="space-y-2">
        <div className="h-8 bg-[var(--color-bg-input)] rounded" />
        <div className="h-8 bg-[var(--color-bg-input)] rounded" />
        <div className="h-8 bg-[var(--color-bg-input)] rounded" />
      </div>
    </div>
  );
};
