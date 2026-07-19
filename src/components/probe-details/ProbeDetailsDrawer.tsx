import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock, ArrowsClockwise, Copy, Globe, Terminal, FileText, ShareNetwork, Play, Stop, ShieldCheck, Lock } from "@phosphor-icons/react";
import { Target, ProbeResult } from "../../features/probes/types";
import { getStatusDisplayInfo } from "../../utils/status";
import { useTraces, useActiveRuns, useTracerouteActions } from "../../features/traceroute/store/selectors";
import { TraceroutePathGraph } from "../../features/traceroute/components/TraceroutePathGraph";
import { useContinuousMonitorStore } from "../../features/continuous-monitor/store/continuousMonitorStore";
import { ContinuousTestDialog } from "../../features/continuous-monitor/components/ContinuousTestDialog";
import { ContinuousMonitorHistory } from "../../features/continuous-monitor/components/ContinuousMonitorHistory";

interface ProbeDetailsDrawerProps {
  target: Target;
  result: ProbeResult | undefined;
  isProbing: boolean;
  isLoopRunning: boolean;
  onClose: () => void;
  onRetest: () => void;
  onStopProbe: () => void;
  onStartLoop: (intervalMs: number) => void;
  onStartLoopUntilSuccess: (intervalMs: number) => void;
  onStopLoop: () => void;
  initialTab?: "summary" | "timeline" | "path" | "raw";
}

interface StageState {
  label: string;
  state: "Completed" | "Failed" | "Skipped" | "Not measured" | "In progress";
  duration: string;
  detail?: string;
}

export const ProbeDetailsDrawer: React.FC<ProbeDetailsDrawerProps> = ({
  target,
  result,
  isProbing,
  isLoopRunning,
  onClose,
  onRetest,
  onStopProbe,
  onStartLoop,
  onStartLoopUntilSuccess,
  onStopLoop,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<"summary" | "timeline" | "path" | "raw">("summary");
  const [copied, setCopied] = useState(false);
  const [loopIntervalValue, setLoopIntervalValue] = useState("5");
  const [loopIntervalUnit, setLoopIntervalUnit] = useState<"seconds" | "minutes" | "hours">("seconds");
  const statusInfo = getStatusDisplayInfo(isProbing, result);

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const traces = useTraces();
  const activeRuns = useActiveRuns();
  const { runTrace, cancelActiveTrace } = useTracerouteActions();

  const traceResult = traces[target.id];
  const activeRunId = activeRuns[target.id];
  const isTracing = !!activeRunId;

  const { sessions: monitorSessions, startMonitor, stopMonitor, fetchHistory } = useContinuousMonitorStore();
  const [showContinuousDialog, setShowContinuousDialog] = useState(false);
  const [showMonitorHistory, setShowMonitorHistory] = useState(false);
  const monitorSession = monitorSessions[target.id] || null;

  const loopIntervalMs = useMemo(() => {
    const value = Number(loopIntervalValue);
    if (!Number.isFinite(value) || value <= 0) {
      return 5000;
    }

    const factor = loopIntervalUnit === "minutes" ? 60_000 : loopIntervalUnit === "hours" ? 3_600_000 : 1_000;
    return Math.max(1000, Math.round(value * factor));
  }, [loopIntervalValue, loopIntervalUnit]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Determine timeline stages dynamically
  const stages: StageState[] = (() => {
    if (isProbing) {
      return [
        { label: "Queued", state: "Completed", duration: "" },
        { label: "DNS Resolution", state: "In progress", duration: "" },
        { label: "IPv4 Connection Check", state: "Not measured", duration: "" },
        { label: "IPv6 Connection Check", state: "Not measured", duration: "" },
        { label: "TCP Connection", state: "Not measured", duration: "" },
        { label: "TLS Handshake", state: "Not measured", duration: "" },
        { label: "HTTP Probe", state: "Not measured", duration: "" },
        { label: "Completed", state: "In progress", duration: "" }
      ];
    }

    if (!result) {
      return [
        { label: "Queued", state: "Not measured", duration: "" },
        { label: "DNS Resolution", state: "Not measured", duration: "" },
        { label: "IPv4 Connection Check", state: "Not measured", duration: "" },
        { label: "IPv6 Connection Check", state: "Not measured", duration: "" },
        { label: "TCP Connection", state: "Not measured", duration: "" },
        { label: "TLS Handshake", state: "Not measured", duration: "" },
        { label: "HTTP Probe", state: "Not measured", duration: "" },
        { label: "Completed", state: "Not measured", duration: "" }
      ];
    }

    const getStageState = (stageKey: "dns" | "tcp" | "tls" | "http" | "redirect" | "ipv4" | "ipv6"): StageState => {
      const stage = result[stageKey];
      const labels = {
        dns: "DNS Resolution",
        ipv4: "IPv4 Connect Check",
        ipv6: "IPv6 Connect Check",
        tcp: "TCP Connection",
        tls: "TLS Handshake",
        http: "HTTP Probe",
        redirect: "HTTP Redirects"
      };
      
      if (!stage) {
        return { label: labels[stageKey], state: "Not measured", duration: "" };
      }
      
      let state: StageState["state"] = "Not measured";
      if (stage.status === "passed") state = "Completed";
      else if (stage.status === "failed") state = "Failed";
      else if (stage.status === "skipped") state = "Skipped";
      else if (stage.status === "timeout") state = "Failed";
      
      let duration = stage.duration_ms !== null ? `${stage.duration_ms} ms` : "";
      
      let detail = "";
      if (stageKey === "dns" && stage.metadata?.resolved_ips) {
        detail = `Resolved: ${stage.metadata.resolved_ips}`;
      } else if (stageKey === "tcp" && stage.metadata?.connected_address) {
        detail = `Connected address: ${stage.metadata.connected_address}`;
      } else if (stageKey === "ipv4" && stage.metadata?.outcome) {
        detail = `IPv4 status: ${stage.metadata.outcome} (${stage.metadata.attempts || ""})`;
      } else if (stageKey === "ipv6" && stage.metadata?.outcome) {
        detail = `IPv6 status: ${stage.metadata.outcome} (${stage.metadata.attempts || ""})`;
      } else if (stageKey === "tls" && stage.metadata?.tls_version) {
        detail = `TLS: ${stage.metadata.tls_version}, ALPN: ${stage.metadata.alpn_protocol || "none"}, Verification: ${stage.metadata.verification_outcome || "unknown"}`;
      } else if (stageKey === "http" && stage.metadata?.status_code) {
        detail = `Negotiated: ${stage.metadata.negotiated_version || "HTTP/1.1"}, Status: ${stage.metadata.status_code}`;
      }
      
      return { label: labels[stageKey], state, duration, detail };
    };

    const dnsStage = getStageState("dns");
    const ipv4Stage = getStageState("ipv4");
    const ipv6Stage = getStageState("ipv6");
    const tcpStage = getStageState("tcp");
    const tlsStage = getStageState("tls");
    const httpStage = getStageState("http");

    const finalStage: StageState = {
      label: "Completed",
      state: result.status === "success" ? "Completed" : "Failed",
      duration: result.timings.total_ms !== null ? `${result.timings.total_ms} ms` : ""
    };

    return [
      { label: "Queued", state: "Completed" as const, duration: "" },
      dnsStage,
      ipv4Stage,
      ipv6Stage,
      tcpStage,
      tlsStage,
      httpStage,
      finalStage
    ];
  })();

  return (
    <>
      {/* Scrim */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/40 z-40 cursor-pointer"
      />

      {/* Drawer */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 26, stiffness: 220 }}
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[460px] bg-[#0d1117] border-l border-slate-800 shadow-2xl z-50 flex flex-col select-text"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between shrink-0 bg-[#07090e]/30">
          <div>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
              {target.category}
            </span>
            <h2 className="text-md font-bold text-white mt-1.5 truncate max-w-[320px]" title={target.name}>
              {target.name}
            </h2>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-[320px]" title={target.url}>
              {target.url}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-900 transition-colors text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800/80 px-4 py-1 shrink-0 bg-[#07090e]/15 text-xs select-none">
          {[
            { id: "summary", label: "Summary", icon: Globe },
            { id: "timeline", label: "Timeline", icon: Terminal },
            { id: "path", label: "Path Trace", icon: ShareNetwork },
            { id: "raw", label: "Raw JSON", icon: FileText }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-all cursor-pointer ${
                  isActive
                    ? "border-indigo-500 text-indigo-400 font-semibold"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable Workspace */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "summary" && (
            <div className="space-y-4">
              
              {/* Quick Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border border-slate-800/60 bg-slate-900/10">
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">Status</span>
                  <span className="text-xs font-bold text-slate-200 mt-1 block">
                    {statusInfo.emoji} {statusInfo.text}
                  </span>
                </div>
                <div className="p-3 rounded-lg border border-slate-800/60 bg-slate-900/10">
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">Response Latency</span>
                  <span className="text-xs font-mono font-bold text-slate-200 mt-1 block flex items-center gap-1">
                    <Clock size={12} className="text-slate-500" />
                    {result ? `${result.latency_ms} ms` : "Not available"}
                  </span>
                </div>
              </div>

              {/* IP Family Connection status comparison */}
              {result && (
                <div className="p-4 rounded-xl border border-slate-800/60 bg-slate-900/15 space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">IP Address Connectivity</h4>
                  
                  <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                    <div className="p-2.5 rounded border border-slate-800/80 bg-slate-950/40">
                      <span className="text-slate-500 text-[10px] uppercase font-bold block mb-1">IPv4 Status</span>
                      {result.ipv4 ? (
                        <div>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase ${
                            result.ipv4.status === "passed"
                              ? "bg-emerald-500/15 text-emerald-450 border-emerald-500/20"
                              : result.ipv4.status === "skipped"
                              ? "bg-slate-900 text-slate-500 border-slate-800"
                              : "bg-rose-500/15 text-rose-450 border-rose-500/20"
                          }`}>
                            {result.ipv4.metadata?.outcome || result.ipv4.status}
                          </span>
                          {result.ipv4.metadata?.connected_address && (
                            <div className="text-[10px] text-slate-400 mt-2 truncate" title={result.ipv4.metadata.connected_address}>
                              {result.ipv4.metadata.connected_address}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600">Not checked</span>
                      )}
                    </div>

                    <div className="p-2.5 rounded border border-slate-800/80 bg-slate-950/40">
                      <span className="text-slate-500 text-[10px] uppercase font-bold block mb-1">IPv6 Status</span>
                      {result.ipv6 ? (
                        <div>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase ${
                            result.ipv6.status === "passed"
                              ? "bg-emerald-500/15 text-emerald-450 border-emerald-500/20"
                              : result.ipv6.status === "skipped"
                              ? "bg-slate-900 text-slate-500 border-slate-800"
                              : "bg-rose-500/15 text-rose-450 border-rose-500/20"
                          }`}>
                            {result.ipv6.metadata?.outcome || result.ipv6.status}
                          </span>
                          {result.ipv6.metadata?.connected_address && (
                            <div className="text-[10px] text-slate-400 mt-2 truncate" title={result.ipv6.metadata.connected_address}>
                              {result.ipv6.metadata.connected_address}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600">Not checked</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TLS Handshake and Certificate Inspection summary */}
              {result?.tls && result.tls.status !== "skipped" && (
                <div className="p-4 rounded-xl border border-slate-800/60 bg-slate-900/15 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <Lock size={12} className="text-indigo-400" />
                      TLS Certificate Diagnostics
                    </h4>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border uppercase ${
                      result.tls.metadata?.verification_outcome === "valid"
                        ? "bg-emerald-500/15 text-emerald-450 border-emerald-500/20"
                        : "bg-rose-500/15 text-rose-450 border-rose-500/20"
                    }`}>
                      {result.tls.metadata?.verification_outcome || "unknown"}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Negotiated:</span>
                      <span className="font-mono text-slate-300">
                        {result.tls.metadata?.tls_version || "Not available"}
                        {result.tls.metadata?.alpn_protocol && ` (${result.tls.metadata.alpn_protocol})`}
                      </span>
                    </div>

                    {result.tls.metadata?.cert_subject && (
                      <div className="pt-2 border-t border-slate-850 space-y-1 font-mono text-[10px] leading-normal text-slate-400">
                        <div>
                          <span className="text-slate-500">Subject: </span>
                          <span className="text-slate-300 break-all">{result.tls.metadata.cert_subject}</span>
                        </div>
                        {result.tls.metadata.cert_issuer && (
                          <div>
                            <span className="text-slate-500">Issuer: </span>
                            <span className="text-slate-300 break-all">{result.tls.metadata.cert_issuer}</span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 mt-1.5 text-[9px] text-slate-500">
                          <div>Valid From: <span className="text-slate-400">{result.tls.metadata.cert_valid_from}</span></div>
                          <div>Valid Until: <span className="text-slate-400">{result.tls.metadata.cert_valid_until}</span></div>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[9px]">
                          <div>Days to Expiry: <span className={`font-bold ${
                            Number(result.tls.metadata.cert_days_until_expiry) < 14 ? "text-amber-450" : "text-slate-400"
                          }`}>{result.tls.metadata.cert_days_until_expiry}</span></div>
                          <div>SNI Match: <span className="text-slate-400">{result.tls.metadata.cert_hostname_matched === "true" ? "Yes" : "No"}</span></div>
                          <div>Chain Length: <span className="text-slate-400">{result.tls.metadata.cert_chain_length}</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Protocol negotiation and HTTP diagnostic summary */}
              {result?.http && result.http.status !== "skipped" && (
                <div className="p-4 rounded-xl border border-slate-800/60 bg-slate-900/15 space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <ShieldCheck size={12} className="text-indigo-400" />
                    Application Layer diagnostics
                  </h4>

                  <div className="space-y-1.5 text-xs font-mono text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">HTTP Protocol version:</span>
                      <span className="text-slate-300 uppercase font-bold">
                        {result.http.metadata?.negotiated_version || "HTTP/1.1"}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">HTTP/3 support (QUIC):</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                        result.http.metadata?.http3_advertised === "supported"
                          ? "bg-emerald-500/15 text-emerald-450 border-emerald-500/20"
                          : "bg-slate-900 text-slate-500 border-slate-800"
                      }`}>
                        {result.http.metadata?.http3_advertised === "supported" ? "Server Advertised" : "Not Advertised"}
                      </span>
                    </div>

                    {result.http.metadata?.alt_svc && (
                      <div className="mt-1 p-2 rounded bg-slate-950/40 border border-slate-850 text-slate-500 break-all" title={result.http.metadata.alt_svc}>
                        Alt-Svc: {result.http.metadata.alt_svc}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Technical Details */}
              {result && (
                <div className="p-4 rounded-xl border border-slate-800/60 bg-slate-900/15 space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Diagnostic Summary</h4>
                  
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Failure Stage:</span>
                      <span className="font-mono text-slate-300 uppercase text-[10px]">{result.failure_stage}</span>
                    </div>
                    {result.failure?.kind && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Failure Kind:</span>
                        <span className="font-mono text-rose-455 text-[10px]">{result.failure.kind}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500">HTTP Status:</span>
                      <span className="font-mono text-slate-300">{result.http_status || "Not available"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Redirects followed:</span>
                      <span className="font-mono text-slate-300">{result.redirect_count !== null ? result.redirect_count : "Not available"}</span>
                    </div>
                    {result.final_url && (
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500 shrink-0">Final URL:</span>
                        <span className="font-mono text-slate-300 truncate" title={result.final_url}>{result.final_url}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tested At:</span>
                      <span className="font-mono text-slate-300">{new Date(result.timestamp).toLocaleString()}</span>
                    </div>

                    {/* Rich failure evidence */}
                    {result.failure && (
                      <div className="pt-3 border-t border-slate-800/40 space-y-2">
                        <span className="text-rose-450 font-bold block">Failure Evidence:</span>
                        <div className="space-y-1.5 font-mono text-[10px] text-rose-350 bg-rose-500/5 p-3 rounded border border-rose-500/10 leading-normal">
                          <div className="font-semibold text-rose-400">{result.failure.user_message}</div>
                          {result.failure.technical_message && (
                            <div className="opacity-90 break-all mt-1">{result.failure.technical_message}</div>
                          )}
                          {result.failure.error_chain && result.failure.error_chain.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-rose-500/10 space-y-1">
                              <div className="text-slate-500 text-[9px] uppercase font-bold">Error Chain:</div>
                              {result.failure.error_chain.map((err, i) => (
                                <div key={i} className="flex gap-1">
                                  <span className="text-rose-500/50">[{i}]</span>
                                  <span className="break-all text-slate-300">{err}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {(result.failure.address || result.failure.protocol) && (
                            <div className="mt-2 pt-2 border-t border-rose-500/10 grid grid-cols-2 gap-2 text-slate-400 text-[9px]">
                              {result.failure.address && <div>Address: <span className="text-slate-300">{result.failure.address}</span></div>}
                              {result.failure.protocol && <div>Protocol: <span className="text-slate-300 uppercase">{result.failure.protocol}</span></div>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Backwards compatibility error fallback */}
                    {!result.failure && result.error && (
                      <div className="pt-2 border-t border-slate-800/40">
                        <span className="text-rose-455 font-bold block mb-1">Error message:</span>
                        <div className="font-mono text-[10px] text-rose-350 bg-rose-500/5 p-2 rounded border border-rose-500/10 break-all select-all leading-normal">
                          {result.error}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Hypotheses for blocks */}
              {result?.error && (
                <div className="p-4 rounded-xl border border-rose-500/10 bg-rose-500/5 text-xs text-rose-350 leading-relaxed">
                  <strong>Diagnostic Recommendation:</strong> Connection failed at the {result.failure_stage.toUpperCase()} layer. Review the timeline for DNS, TCP, or TLS specifics. Run traceroute below to isolate network route interruptions.
                </div>
              )}

              {/* Continuous Monitor Section */}
              <div className="space-y-2">
                <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] font-mono">Continuous Monitor</span>
                {monitorSession && monitorSession.state !== "stopped" ? (
                  <div className="p-3 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-[var(--color-success)] font-bold">● {monitorSession.state.toUpperCase()}</span>
                      <span className="text-[9px] text-[var(--color-text-muted)] font-mono">{monitorSession.total_runs} runs · {monitorSession.config.interval_seconds}s interval</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { stopMonitor(target.id); }}
                        className="px-2 py-1 bg-[var(--color-danger-soft)] hover:bg-[var(--color-danger)]/20 border border-[var(--color-danger)]/20 text-[var(--color-danger)] text-[10px] font-bold rounded cursor-pointer"
                      >
                        Stop Monitor
                      </button>
                      <button
                        onClick={() => { fetchHistory(target.id); setShowMonitorHistory(true); }}
                        className="px-2 py-1 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] text-[10px] font-bold rounded cursor-pointer"
                      >
                        View History
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowContinuousDialog(true)}
                    className="w-full p-2 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] border-dashed text-[var(--color-text-secondary)] hover:text-[var(--color-success)] text-[10px] font-bold rounded cursor-pointer transition-colors"
                  >
                    Start Continuous Test
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === "timeline" && (
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Diagnostic Timeline</h4>
              
              <div className="space-y-4 pl-2">
                {stages.map((stg, idx) => {
                  let badgeStyle = "bg-slate-900 text-slate-500 border-slate-800";

                  if (stg.state === "Completed") {
                    badgeStyle = "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
                  } else if (stg.state === "Failed") {
                    badgeStyle = "bg-rose-500/15 text-rose-400 border-rose-500/20";
                  } else if (stg.state === "In progress") {
                    badgeStyle = "bg-amber-500/15 text-amber-400 border-amber-500/20 animate-pulse";
                  } else if (stg.state === "Skipped") {
                    badgeStyle = "bg-slate-950 text-slate-650 border-slate-900";
                  }

                  return (
                    <div key={idx} className="border border-slate-800/40 p-3 rounded-lg bg-slate-900/5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">{stg.label}</span>
                        <div className="flex items-center gap-2">
                          {stg.duration && (
                            <span className="text-[10px] font-mono text-slate-500">{stg.duration}</span>
                          )}
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${badgeStyle}`}>
                            {stg.state}
                          </span>
                        </div>
                      </div>
                      {stg.detail && (
                        <div className="text-[10px] font-mono text-slate-500 break-all leading-normal">
                          {stg.detail}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "path" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center select-none">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Traceroute Diagnostics
                </h4>
                
                {isTracing ? (
                  <button
                    onClick={() => cancelActiveTrace(target.id)}
                    className="flex items-center gap-1 text-[10px] text-rose-450 hover:text-rose-400 font-semibold cursor-pointer"
                  >
                    <Stop size={12} weight="fill" />
                    Cancel Trace
                  </button>
                ) : (
                  <button
                    onClick={() => runTrace(target.id)}
                    className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-350 font-semibold cursor-pointer"
                  >
                    <Play size={12} weight="fill" />
                    Run Trace
                  </button>
                )}
              </div>

              {traceResult && (
                <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/20 grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400">
                  <div>Platform: <span className="text-slate-200 uppercase">{traceResult.platform}</span></div>
                  <div>Method: <span className="text-slate-200 uppercase">{traceResult.method}</span></div>
                  <div>Status: <span className="text-slate-200 uppercase">{traceResult.status}</span></div>
                  <div>Hops: <span className="text-slate-200">{traceResult.completed_hops}</span></div>
                  {traceResult.error_message && (
                    <div className="col-span-2 text-rose-400">Error: {traceResult.error_message}</div>
                  )}
                </div>
              )}

              <TraceroutePathGraph
                hops={traceResult?.hops || []}
                isProbing={isTracing}
                destinationReached={traceResult?.destination_reached || false}
              />
            </div>
          )}

          {activeTab === "raw" && (
            <div className="space-y-2 relative h-full flex flex-col">
              <div className="flex justify-between items-center select-none shrink-0">
                <span className="text-[10px] text-slate-500 font-mono">Serialized Result Object</span>
                <button
                  onClick={() => copyToClipboard(JSON.stringify({ target, result }, null, 2))}
                  className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-350 font-semibold cursor-pointer"
                >
                  <Copy size={12} />
                  {copied ? "Copied!" : "Copy JSON"}
                </button>
              </div>
              <pre className="flex-1 bg-slate-950 p-4 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-300 overflow-auto select-all leading-normal max-h-[400px]">
                {JSON.stringify({ target, result }, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-800 bg-[#07090e]/40 shrink-0 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
            <input
              value={loopIntervalValue}
              onChange={(e) => setLoopIntervalValue(e.target.value)}
              inputMode="numeric"
              min={1}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
              placeholder="Interval"
            />
            <select
              value={loopIntervalUnit}
              onChange={(e) => setLoopIntervalUnit(e.target.value as "seconds" | "minutes" | "hours")}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="seconds">Seconds</option>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
            </select>
            <button
              onClick={() => onStartLoopUntilSuccess(loopIntervalMs)}
              className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 cursor-pointer hover:bg-emerald-500/15"
            >
              Start Until OK
            </button>
            {isLoopRunning ? (
              <button
                onClick={onStopLoop}
                className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 cursor-pointer hover:bg-rose-500/15"
              >
                Stop Loop
              </button>
            ) : (
              <button
                onClick={() => onStartLoop(loopIntervalMs)}
                className="rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-300 cursor-pointer hover:bg-indigo-500/15"
              >
                Start Loop
              </button>
            )}
          </div>

          {result?.error && (
            <button
              onClick={() => copyToClipboard(result.error || "")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-semibold rounded-lg text-xs transition-all active:scale-[0.99] cursor-pointer"
            >
              <Copy size={14} />
              Copy Error
            </button>
          )}
          
          <button
            onClick={isProbing ? onStopProbe : onRetest}
            className={`flex-1 flex items-center justify-center gap-2 py-2 font-semibold rounded-lg text-xs shadow-lg transition-all active:scale-[0.99] cursor-pointer ${
              isProbing
                ? "bg-rose-600 hover:bg-rose-500 text-white"
                : "bg-indigo-600 hover:bg-indigo-500 text-white"
            }`}
          >
            {isProbing ? <Stop size={14} weight="fill" /> : <ArrowsClockwise size={14} className={isLoopRunning ? "animate-spin" : ""} />}
            {isProbing ? "Stop Current Probe" : "Retest Endpoint Now"}
          </button>
        </div>

      </motion.div>

      {/* Continuous Test Dialog */}
      {showContinuousDialog && (
        <ContinuousTestDialog
          targetName={target.name}
          onStart={(config) => {
            startMonitor(target.id, config);
            setShowContinuousDialog(false);
          }}
          onClose={() => setShowContinuousDialog(false)}
        />
      )}

      {/* Monitor History Drawer */}
      {showMonitorHistory && (
        <ContinuousMonitorHistory
          targetId={target.id}
          targetName={target.name}
          onClose={() => setShowMonitorHistory(false)}
        />
      )}
    </>
  );
};
