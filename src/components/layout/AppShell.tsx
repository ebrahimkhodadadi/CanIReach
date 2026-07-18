import React, { useState } from "react";
import { 
  Globe, 
  Broadcast, 
  Warning, 
  Gear,
  ShareNetwork,
  Clock,
  Calendar,
  WarningCircle,
  ShieldCheck,
  Gauge,
  CaretLeft,
  CaretRight
} from "@phosphor-icons/react";

import LogoImage from "../../assets/logo.png";

interface AppShellProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
  problemsCount: number;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  onTabChange,
  children,
  problemsCount,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navigationGroups = [
    {
      title: "MONITOR",
      items: [
        { id: "overview", label: "Overview", icon: Broadcast },
        { id: "targets", label: "Targets Table", icon: Globe },
        { id: "schedules", label: "Schedules", icon: Calendar },
        { id: "history", label: "History Log", icon: Clock },
      ]
    },
    {
      title: "ANALYZE",
      items: [
        { id: "operations", label: "Failed Requests", icon: WarningCircle },
        { id: "problems", label: "Problems", icon: Warning, badge: problemsCount },
        { id: "investigations", label: "Investigations", icon: ShieldCheck },
        { id: "path", label: "Path Diagnostics", icon: ShareNetwork },
        { id: "performance", label: "Performance", icon: Gauge },
        { id: "privacy", label: "Privacy Leaks", icon: ShieldCheck },
      ]
    },
    {
      title: "SYSTEM",
      items: [
        { id: "settings", label: "Settings", icon: Gear },
      ]
    }
  ];

  return (
    <div className="flex min-h-screen bg-[var(--color-bg-app)] text-[var(--color-text-primary)] font-sans select-none overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={`bg-[var(--color-bg-sidebar)] border-r border-[var(--color-border-default)] flex flex-col shrink-0 transition-all duration-200 relative ${
          isCollapsed ? "w-14" : "w-56"
        }`}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-10 w-6 h-6 rounded-full bg-[var(--color-bg-panel-elevated)] border border-[var(--color-border-strong)] flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer z-40 transition-colors"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <CaretRight size={12} weight="bold" /> : <CaretLeft size={12} weight="bold" />}
        </button>

        {/* Branding header */}
        <div className="p-4 border-b border-[var(--color-border-default)] flex items-center gap-3 h-[52px] overflow-hidden shrink-0">
          <img src={LogoImage} alt="CanIReach Logo" className="w-6 h-6 rounded shrink-0 object-contain" />
          {!isCollapsed && (
            <div className="min-w-0">
              <h1 className="text-xs font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-1.5 truncate">
                CanIReach
                <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-[var(--color-accent-primary-hover)]/10 text-[var(--color-accent-primary-hover)] border border-[var(--color-accent-primary)]/20 shrink-0">
                  v1.0
                </span>
              </h1>
            </div>
          )}
        </div>

        {/* Navigation list */}
        <nav className="flex-1 p-2 overflow-y-auto space-y-4">
          {navigationGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              {!isCollapsed && (
                <div className="text-[9px] font-mono tracking-wider text-[var(--color-text-muted)] font-semibold px-2.5 pt-2 uppercase">
                  {group.title}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onTabChange(item.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-medium transition-all duration-100 cursor-pointer relative group ${
                        isActive
                          ? "bg-[var(--color-bg-panel-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)]"
                          : "border border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-panel-hover)]"
                      }`}
                      title={isCollapsed ? item.label : undefined}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-[var(--color-accent-primary)] rounded-r" />
                      )}
                      
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon size={14} className="shrink-0" weight={isActive ? "fill" : "regular"} />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </div>

                      {item.badge !== undefined && item.badge > 0 && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                          item.id === "problems" 
                            ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border border-[var(--color-danger-soft)]" 
                            : "bg-[var(--color-bg-input)] text-[var(--color-text-secondary)]"
                        }`}>
                          {!isCollapsed ? item.badge : "!"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-[var(--color-border-default)] text-[9px] text-[var(--color-text-muted)] font-mono text-center shrink-0 overflow-hidden">
          {isCollapsed ? "rc.1" : "v1.0.0-rc.1"}
        </div>
      </aside>

      {/* Main Workspace Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {children}
      </div>
    </div>
  );
};

export default AppShell;
