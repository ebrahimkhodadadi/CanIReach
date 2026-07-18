import React, { useState, useEffect } from "react";
import { 
  Gauge, 
  ArrowDown, 
  ArrowUp, 
  Clock, 
  Calendar, 
  Play, 
  WarningCircle,
  Lightning,
  Sparkle
} from "@phosphor-icons/react";
import { 
  startPerformanceRun, 
  queryPerformanceHistory, 
  getDailyDataBudget, 
  getNetworkProfiles 
} from "../../../features/probes/api/probeCommands";
import { PerformanceRun, NetworkProfile } from "../../../features/probes/types";
import { EmptyState } from "../../../components/shared/Primitives";

export const Performance: React.FC = () => {
  const [profiles, setProfiles] = useState<NetworkProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("system-default");
  
  // Custom target endpoints
  const [latencyUrl, setLatencyUrl] = useState("https://cloudflare.com");
  const [downloadUrl, setDownloadUrl] = useState("https://speed.cloudflare.com/__down?bytes=5000000"); // 5MB limit
  const [uploadUrl, setUploadUrl] = useState("https://speed.cloudflare.com/__up");
  
  const [testTypes, setTestTypes] = useState<string[]>(["latency", "download", "upload"]);
  const [history, setHistory] = useState<PerformanceRun[]>([]);
  const [activeRun, setActiveRun] = useState<PerformanceRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [dailyBudget, setDailyBudget] = useState<[number, number]>([0, 0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const profileList = await getNetworkProfiles();
      setProfiles(profileList);

      const hist = await queryPerformanceHistory();
      setHistory(hist);

      const today = new Date().toISOString().split("T")[0];
      const budget = await getDailyDataBudget(today);
      setDailyBudget(budget);
    } catch (e: any) {
      console.error(e);
      setError("Failed to initialize performance data");
    }
  };

  const handleTestTypeToggle = (type: string) => {
    if (testTypes.includes(type)) {
      setTestTypes(testTypes.filter(t => t !== type));
    } else {
      setTestTypes([...testTypes, type]);
    }
  };

  const runBenchmark = async () => {
    if (testTypes.length === 0) {
      setError("Select at least one test type to execute");
      return;
    }

    setLoading(true);
    setError(null);
    setActiveRun(null);

    try {
      // Optimistically check data budget
      const today = new Date().toISOString().split("T")[0];
      const currentUsage = dailyBudget[0] + dailyBudget[1];
      if (currentUsage >= 100_000_000 && testTypes.some(t => t === "download" || t === "upload")) {
        throw new Error("Daily data budget (100MB) exceeded. High-bandwidth tests disabled.");
      }

      const run = await startPerformanceRun(
        selectedProfileId,
        testTypes.includes("latency") ? latencyUrl : null,
        testTypes.includes("download") ? downloadUrl : null,
        testTypes.includes("upload") ? uploadUrl : null,
        testTypes
      );

      setActiveRun(run);
      // Reload history and budget usage
      const hist = await queryPerformanceHistory();
      setHistory(hist);

      const budget = await getDailyDataBudget(today);
      setDailyBudget(budget);
    } catch (e: any) {
      setError(e.message || "Failed to execute performance test");
    } finally {
      setLoading(false);
    }
  };

  const getBufferbloatColor = (ms: number) => {
    if (ms < 30) return "text-[var(--color-success)] bg-[var(--color-success-soft)] border-[var(--color-success)]/20";
    if (ms < 100) return "text-[var(--color-warning)] bg-[var(--color-warning-soft)] border-[var(--color-warning)]/20";
    return "text-[var(--color-danger)] bg-[var(--color-danger-soft)] border-[var(--color-danger)]/20";
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Generate SVG points for charts
  const renderSpeedChart = () => {
    const runs = history.filter(r => r.download_mbps || r.upload_mbps).slice(0, 10).reverse();
    if (runs.length < 2) {
      return (
        <div className="h-full flex items-center justify-center text-[var(--color-text-muted)] text-xs font-mono select-none">
          Insufficient data points to render historical charts
        </div>
      );
    }

    const maxSpeed = Math.max(...runs.map(r => Math.max(r.download_mbps || 0, r.upload_mbps || 0)), 10);
    const width = 500;
    const height = 150;
    const padding = 20;

    const getX = (index: number) => padding + (index * (width - padding * 2)) / (runs.length - 1);
    const getY = (speed: number) => height - padding - (speed * (height - padding * 2)) / maxSpeed;

    let dlPoints = "";
    let ulPoints = "";

    runs.forEach((run, i) => {
      const x = getX(i);
      if (run.download_mbps) dlPoints += `${dlPoints === "" ? "M" : "L"} ${x} ${getY(run.download_mbps)} `;
      if (run.upload_mbps) ulPoints += `${ulPoints === "" ? "M" : "L"} ${x} ${getY(run.upload_mbps)} `;
    });

    return (
      <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`}>
        {/* Grid lines */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--color-border-default)" strokeWidth={1} />
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="var(--color-border-default)" strokeDasharray="4 4" strokeWidth={1} />

        {/* Speed lines */}
        {dlPoints && <path d={dlPoints} fill="none" stroke="var(--color-accent-primary)" strokeWidth={2} />}
        {ulPoints && <path d={ulPoints} fill="none" stroke="var(--color-accent-secondary)" strokeWidth={2} />}

        {/* Data points */}
        {runs.map((run, i) => (
          <g key={run.id}>
            {run.download_mbps && (
              <circle cx={getX(i)} cy={getY(run.download_mbps)} r={3} fill="var(--color-accent-primary)" />
            )}
            {run.upload_mbps && (
              <circle cx={getX(i)} cy={getY(run.upload_mbps)} r={3} fill="var(--color-accent-secondary)" />
            )}
          </g>
        ))}
      </svg>
    );
  };

  const totalUsedBytes = dailyBudget[0] + dailyBudget[1];
  const budgetPercentage = Math.min((totalUsedBytes / 100_000_000) * 100, 100);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 space-y-4 bg-[var(--color-bg-app)]">
      
      {/* Header Description */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] pb-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono flex items-center gap-2">
            <Gauge size={16} className="text-[var(--color-accent-primary)]" />
            Performance Diagnostics
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Measure network latency, packet loss, bufferbloat, and connection throughput across network profiles.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] px-3 py-1.5 rounded select-none">
          <Lightning size={14} className="text-[var(--color-success)] animate-pulse" />
          <span className="text-xs text-[var(--color-text-primary)] font-mono font-bold">Real-time Benchmarks</span>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded p-3 flex items-start gap-3 text-[var(--color-danger)] text-xs">
          <WarningCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Run controls panel */}
        <div className="lg:col-span-2 border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] rounded p-4 flex flex-col space-y-4">
          <h3 className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2 uppercase font-mono tracking-wider">
            <Play size={13} className="text-[var(--color-accent-primary)]" />
            Configure Benchmark
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Select Network Profile</label>
              <select 
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] transition-colors cursor-pointer"
              >
                <option value="system-default">System Default</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Latency Target URL</label>
              <input 
                type="text"
                value={latencyUrl}
                onChange={(e) => setLatencyUrl(e.target.value)}
                className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] transition-colors font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Download Target (5MB Payload)</label>
              <input 
                type="text"
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] transition-colors font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Upload Target (POST)</label>
              <input 
                type="text"
                value={uploadUrl}
                onChange={(e) => setUploadUrl(e.target.value)}
                className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] transition-colors font-mono"
              />
            </div>
          </div>

          {/* Test Type Selectors */}
          <div className="flex flex-wrap gap-2.5 pt-1 select-none">
            {["latency", "download", "upload"].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTestTypeToggle(type)}
                className={`px-3 py-1 rounded text-xs font-bold font-mono border transition-all cursor-pointer ${
                  testTypes.includes(type)
                    ? "bg-[var(--color-accent-primary)]/10 border-[var(--color-accent-primary)]/40 text-[var(--color-accent-primary-hover)]"
                    : "bg-[var(--color-bg-input)] border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
                }`}
              >
                {type.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={runBenchmark}
            disabled={loading}
            className="w-full py-2 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] text-[var(--color-text-primary)] disabled:opacity-50 font-bold text-xs uppercase tracking-wider font-mono transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Lightning size={14} weight="fill" className="text-[var(--color-accent-secondary)]" />
            )}
            {loading ? "Running Diagnostics..." : "Execute Benchmarks"}
          </button>
        </div>

        {/* Budget usage panel */}
        <div className="border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] rounded p-4 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2 uppercase font-mono tracking-wider">
              <Gauge size={13} className="text-[var(--color-danger)]" />
              Daily Bandwidth Budget
            </h3>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-[var(--color-text-secondary)]">Egress Consumption</span>
                <span className="text-[var(--color-text-primary)] font-mono">{formatBytes(totalUsedBytes)} / 100 MB</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[var(--color-bg-input)] overflow-hidden border border-[var(--color-border-default)]">
                <div 
                  className={`h-full rounded transition-all duration-500 ${
                    budgetPercentage > 80 ? "bg-[var(--color-danger)]" : budgetPercentage > 50 ? "bg-[var(--color-warning)]" : "bg-[var(--color-accent-primary)]"
                  }`}
                  style={{ width: `${budgetPercentage}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center bg-[var(--color-bg-input)] border border-[var(--color-border-subtle)] p-2.5 rounded select-none">
              <div>
                <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-bold font-mono">Downloaded</p>
                <p className="text-xs font-bold text-[var(--color-text-primary)] font-mono mt-0.5">{formatBytes(dailyBudget[0])}</p>
              </div>
              <div>
                <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-bold font-mono">Uploaded</p>
                <p className="text-xs font-bold text-[var(--color-text-primary)] font-mono mt-0.5">{formatBytes(dailyBudget[1])}</p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 text-[10px] text-[var(--color-text-muted)] border-t border-[var(--color-border-subtle)] pt-3 mt-4 select-none leading-relaxed">
            <WarningCircle size={14} className="shrink-0 text-[var(--color-warning)] mt-0.5" />
            <span>High-bandwidth benchmarks are capped at 100MB daily to protect metered mobile egress networks.</span>
          </div>
        </div>
      </div>

      {/* Active run result widgets */}
      {(activeRun || loading) && (
        <div className="border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] rounded p-4 space-y-4">
          <h3 className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2 uppercase font-mono tracking-wider">
            <Sparkle size={13} className="text-[var(--color-warning)]" />
            Run Results: {activeRun ? activeRun.id.slice(0, 8) : "Diagnosing..."}
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 select-none">
            
            {/* Latency card */}
            <div className="bg-[var(--color-bg-input)] border border-[var(--color-border-subtle)] p-3 rounded flex flex-col justify-between h-20">
              <span className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">Median Latency</span>
              <span className="text-lg font-bold text-[var(--color-text-primary)] font-mono">
                {activeRun?.latency_ms !== undefined && activeRun.latency_ms !== null ? `${activeRun.latency_ms} ms` : "—"}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                Jit: {activeRun?.jitter_ms ?? "—"}ms | Loss: {activeRun?.loss_percent ?? "—"}%
              </span>
            </div>

            {/* Bufferbloat card */}
            <div className="bg-[var(--color-bg-input)] border border-[var(--color-border-subtle)] p-3 rounded flex flex-col justify-between h-20">
              <span className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">Bufferbloat</span>
              <span className="text-lg font-bold text-[var(--color-text-primary)] font-mono">
                {activeRun?.bufferbloat_ms !== undefined && activeRun.bufferbloat_ms !== null ? `${activeRun.bufferbloat_ms} ms` : "—"}
              </span>
              <span className="text-[10px] mt-0.5">
                {activeRun?.bufferbloat_ms !== undefined && activeRun.bufferbloat_ms !== null ? (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border font-mono ${getBufferbloatColor(activeRun.bufferbloat_ms)}`}>
                    {activeRun.bufferbloat_ms < 30 ? "LOW" : activeRun.bufferbloat_ms < 100 ? "MODERATE" : "HIGH"}
                  </span>
                ) : (
                  "—"
                )}
              </span>
            </div>

            {/* Download speed card */}
            <div className="bg-[var(--color-bg-input)] border border-[var(--color-border-subtle)] p-3 rounded flex flex-col justify-between h-20">
              <span className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono flex items-center gap-1">
                <ArrowDown size={12} className="text-[var(--color-accent-primary)]" />
                Download Speed
              </span>
              <span className="text-lg font-bold text-[var(--color-text-primary)] font-mono">
                {activeRun?.download_mbps !== undefined && activeRun.download_mbps !== null ? `${activeRun.download_mbps.toFixed(2)} Mbps` : "—"}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                Data: {activeRun ? formatBytes(activeRun.bytes_downloaded) : "—"}
              </span>
            </div>

            {/* Upload speed card */}
            <div className="bg-[var(--color-bg-input)] border border-[var(--color-border-subtle)] p-3 rounded flex flex-col justify-between h-20">
              <span className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono flex items-center gap-1">
                <ArrowUp size={12} className="text-[var(--color-accent-secondary)]" />
                Upload Speed
              </span>
              <span className="text-lg font-bold text-[var(--color-text-primary)] font-mono">
                {activeRun?.upload_mbps !== undefined && activeRun.upload_mbps !== null ? `${activeRun.upload_mbps.toFixed(2)} Mbps` : "—"}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                Data: {activeRun ? formatBytes(activeRun.bytes_uploaded) : "—"}
              </span>
            </div>

          </div>
        </div>
      )}

      {/* Historical charts and list logs */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        
        {/* Historical line chart */}
        <div className="xl:col-span-2 border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] rounded p-4 space-y-4">
          <h3 className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2 uppercase font-mono tracking-wider">
            <Gauge size={13} className="text-[var(--color-accent-primary)]" />
            Egress Quality & Speed Trend
          </h3>
          <div className="h-44 w-full flex items-center justify-center p-2">
            {renderSpeedChart()}
          </div>
          <div className="flex items-center justify-center gap-6 text-[10px] font-bold font-mono select-none">
            <span className="flex items-center gap-1.5 text-[var(--color-accent-primary-hover)]">
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent-primary)]" />
              Download Speed (Mbps)
            </span>
            <span className="flex items-center gap-1.5 text-[var(--color-accent-secondary)]">
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent-secondary)]" />
              Upload Speed (Mbps)
            </span>
          </div>
        </div>

        {/* History runs log */}
        <div className="border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] rounded p-4 flex flex-col min-h-[250px]">
          <h3 className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2 mb-3 uppercase font-mono tracking-wider select-none">
            <Clock size={13} className="text-[var(--color-text-secondary)]" />
            Execution Logs
          </h3>

          <div className="flex-1 overflow-y-auto space-y-2 max-h-56 pr-1">
            {history.length === 0 ? (
              <div className="py-10">
                <EmptyState
                  title="NO RUNS LOGGED"
                  description="No historical performance executions found."
                />
              </div>
            ) : (
              history.map((run) => (
                <div key={run.id} className="bg-[var(--color-bg-input)]/50 border border-[var(--color-border-subtle)] p-2 rounded flex items-center justify-between hover:border-[var(--color-border-default)] transition-colors select-none">
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-bold text-[var(--color-text-primary)] font-mono">
                      {run.profile_id}
                    </p>
                    <p className="text-[9px] text-[var(--color-text-muted)] flex items-center gap-1 font-mono">
                      <Calendar size={10} />
                      {new Date(run.started_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right font-mono space-y-0.5">
                    {run.download_mbps && (
                      <p className="text-[10px] text-[var(--color-accent-primary-hover)] font-bold">{run.download_mbps.toFixed(1)} ↓</p>
                    )}
                    {run.latency_ms && (
                      <p className="text-[9px] text-[var(--color-text-muted)]">{run.latency_ms}ms | BB: {run.bufferbloat_ms ?? 0}ms</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

export default Performance;
