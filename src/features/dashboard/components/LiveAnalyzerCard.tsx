import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Pulse, Clock, ShieldCheck, WarningCircle, Broadcast } from "@phosphor-icons/react";

interface AnalyzerSnapshot {
  status: string;
  currentLatency: number;
  currentJitter: number;
  currentDnsLatency: number;
  currentLoss: number;
  stabilityScore: number;
  activeInterface: string;
  ip4Available: boolean;
  ip6Available: boolean;
}

interface AnalyzerSample {
  createdAt: string;
  latencyMs: number;
  jitterMs: number;
  dnsLatencyMs: number;
  packetLoss: number;
  availability: number;
  stabilityScore: number;
}

export const LiveAnalyzerCard: React.FC = () => {
  const [snapshot, setSnapshot] = useState<AnalyzerSnapshot>({
    status: "off",
    currentLatency: 0,
    currentJitter: 0,
    currentDnsLatency: 0,
    currentLoss: 0,
    stabilityScore: 100,
    activeInterface: "Ethernet/Wi-Fi",
    ip4Available: true,
    ip6Available: false,
  });

  const [history, setHistory] = useState<AnalyzerSample[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const snap: AnalyzerSnapshot = await invoke("get_analyzer_snapshot", { dummy: null });
        setSnapshot(snap);

        const samples: AnalyzerSample[] = await invoke("get_analyzer_samples", { limit: 20 });
        setHistory(samples);
      } catch (err) {
        console.error("Failed to load analyzer states:", err);
      } finally {
        setLoading(false);
      }
    };

    init();

    let unlisten: (() => void) | undefined;
    listen<AnalyzerSnapshot>("analyzer-snapshot-changed", (event) => {
      setSnapshot(event.payload);
      setHistory((prev) => {
        const newHistory = [
          ...prev,
          {
            createdAt: new Date().toISOString(),
            latencyMs: event.payload.currentLatency,
            jitterMs: event.payload.currentJitter,
            dnsLatencyMs: event.payload.currentDnsLatency,
            packetLoss: event.payload.currentLoss,
            availability: 100 - event.payload.currentLoss,
            stabilityScore: event.payload.stabilityScore,
          },
        ];
        return newHistory.slice(-20);
      });
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleToggle = async () => {
    try {
      if (snapshot.status === "running") {
        await invoke("stop_analyzer", { dummy: null });
        setSnapshot((prev) => ({ ...prev, status: "off" }));
      } else {
        await invoke("start_analyzer", { dummy: null });
        setSnapshot((prev) => ({ ...prev, status: "running" }));
      }
    } catch (err) {
      console.error("Failed to toggle analyzer state:", err);
    }
  };

  if (loading) {
    return (
      <div className="console-panel p-4 flex items-center justify-center h-40">
        <span className="text-xs text-[var(--color-text-secondary)] font-mono">Loading stability telemetry...</span>
      </div>
    );
  }

  const isRunning = snapshot.status === "running";
  const scoreColor = snapshot.stabilityScore >= 90
    ? "text-[var(--color-success)]"
    : snapshot.stabilityScore >= 70
      ? "text-[var(--color-warning)]"
      : "text-[var(--color-danger)]";

  return (
    <div className="console-panel p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2 select-none">
        <div className="flex items-center gap-2">
          <Broadcast size={14} className={`text-[var(--color-accent-primary)] ${isRunning ? "animate-pulse" : ""}`} />
          <h3 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider font-mono">
            Live Network Stability Analyzer
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border ${
              isRunning
                ? "border-[var(--color-success)] text-[var(--color-success)] bg-[var(--color-success-soft)]"
                : "border-[var(--color-border-strong)] text-[var(--color-text-secondary)] bg-[var(--color-bg-input)]"
            }`}
          >
            {isRunning ? "Monitoring Active" : "Disabled"}
          </span>
          <button
            onClick={handleToggle}
            className="px-2 py-1 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-strong)] text-[10px] font-semibold text-[var(--color-text-primary)] rounded transition-all cursor-pointer"
          >
            {isRunning ? "Stop Monitor" : "Enable Monitor"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-center gap-4 bg-[var(--color-bg-app)]/30 border border-[var(--color-border-subtle)] rounded p-3 select-none">
          <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
            <svg className="absolute w-full h-full transform -rotate-90">
              <circle cx="32" cy="32" r="28" fill="transparent" stroke="var(--color-bg-input)" strokeWidth="4" />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="transparent"
                stroke="currentColor"
                strokeWidth="4"
                className={`${scoreColor} transition-all duration-500`}
                strokeDasharray="175.9"
                strokeDashoffset={175.9 - (175.9 * snapshot.stabilityScore) / 100}
              />
            </svg>
            <span className="text-sm font-bold font-mono tracking-tight">{Math.round(snapshot.stabilityScore)}</span>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-[var(--color-text-primary)]">Stability Rating</div>
            <div className="text-[9px] text-[var(--color-text-secondary)] mt-0.5 leading-normal">
              Based on rolling latency, jitter variance, and resolver lookup consistency metrics.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 col-span-2">
          {[
            { label: "Connection Latency", value: isRunning ? `${snapshot.currentLatency.toFixed(1)}ms` : "—", desc: "Canary RTT", icon: Clock },
            { label: "Rolling Jitter", value: isRunning ? `${snapshot.currentJitter.toFixed(1)}ms` : "—", desc: "Variance scale", icon: Pulse },
            { label: "DNS Resolve", value: isRunning ? `${snapshot.currentDnsLatency.toFixed(1)}ms` : "—", desc: "Resolver delay", icon: ShieldCheck },
            { label: "Packet Loss", value: isRunning ? `${snapshot.currentLoss}%` : "—", desc: "Canary failure", icon: WarningCircle },
          ].map((sig, idx) => {
            const Icon = sig.icon;
            return (
              <div key={idx} className="p-2 border border-[var(--color-border-subtle)] rounded flex items-center gap-2 select-none bg-[var(--color-bg-app)]/10">
                <Icon size={12} className="text-[var(--color-text-secondary)] shrink-0" />
                <div>
                  <div className="text-[8px] text-[var(--color-text-muted)] uppercase tracking-wider font-mono">{sig.label}</div>
                  <div className="text-xs font-mono font-bold text-[var(--color-text-primary)] mt-0.5">{sig.value}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isRunning && history.length > 0 && (
        <div className="space-y-1.5 select-none">
          <div className="text-[8px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider font-mono">
            Latency History Sparkline (Last 20 checks)
          </div>
          <div className="h-12 border border-[var(--color-border-subtle)] rounded bg-[var(--color-bg-app)]/20 p-1 flex items-end gap-1 overflow-hidden">
            {history.map((h, i) => {
              const maxVal = Math.max(...history.map((s) => s.latencyMs), 100);
              const heightPercent = (h.latencyMs / maxVal) * 100;
              const barColor = h.latencyMs >= 300 ? "bg-[var(--color-danger)]" : h.latencyMs >= 100 ? "bg-[var(--color-warning)]" : "bg-[var(--color-accent-primary)]";
              return (
                <div
                  key={i}
                  className={`flex-1 ${barColor} rounded-t transition-all duration-300`}
                  style={{ height: `${Math.max(heightPercent, 10)}%` }}
                  title={`${Math.round(h.latencyMs)}ms`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
