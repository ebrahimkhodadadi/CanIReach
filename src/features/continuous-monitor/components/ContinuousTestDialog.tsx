import { useState } from "react";
import { X, Play, WarningCircle } from "@phosphor-icons/react";
import { ContinuousMonitorConfig } from "../types";

interface ContinuousTestDialogProps {
  targetName: string;
  onStart: (config: ContinuousMonitorConfig) => void;
  onClose: () => void;
}

export const ContinuousTestDialog: React.FC<ContinuousTestDialogProps> = ({
  targetName,
  onStart,
  onClose,
}) => {
  const [intervalValue, setIntervalValue] = useState(30);
  const [intervalUnit, setIntervalUnit] = useState<"seconds" | "minutes" | "hours">("seconds");
  const [runImmediately, setRunImmediately] = useState(true);
  const [persistAcrossRestart, setPersistAcrossRestart] = useState(false);
  const [pauseWhenOffline, setPauseWhenOffline] = useState(true);
  const [notifyOnFailure, setNotifyOnFailure] = useState(true);
  const [notifyOnRecovery, setNotifyOnRecovery] = useState(true);

  const toSeconds = (val: number, unit: string): number => {
    switch (unit) {
      case "minutes": return val * 60;
      case "hours": return val * 3600;
      default: return val;
    }
  };

  const handleStart = () => {
    const intervalSeconds = toSeconds(intervalValue, intervalUnit);
    if (intervalSeconds < 5) return;

    onStart({
      interval_seconds: intervalSeconds,
      run_immediately: runImmediately,
      persist_across_restart: persistAcrossRestart,
      pause_when_offline: pauseWhenOffline,
      retry_on_network_recovery: true,
      overlap_policy: "skip",
      notify_on_failure: notifyOnFailure,
      notify_on_recovery: notifyOnRecovery,
    });
  };

  const intervalSeconds = toSeconds(intervalValue, intervalUnit);
  const isValid = intervalSeconds >= 5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[440px] bg-[var(--color-bg-panel-elevated)] border border-[var(--color-border-strong)] rounded p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] pb-2.5">
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">Continuous Test</h3>
            <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5 truncate max-w-[300px]">{targetName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-bg-panel-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Interval */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Test Interval</label>
          <div className="flex gap-2">
            <input
              type="number"
              min="5"
              value={intervalValue}
              onChange={(e) => setIntervalValue(parseInt(e.target.value) || 5)}
              className="flex-1 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] font-mono focus:outline-none focus:border-[var(--color-border-strong)]"
            />
            <select
              value={intervalUnit}
              onChange={(e) => setIntervalUnit(e.target.value as "seconds" | "minutes" | "hours")}
              className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] font-mono focus:outline-none cursor-pointer"
            >
              <option value="seconds">Seconds</option>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
            </select>
          </div>
          {!isValid && (
            <p className="text-[10px] text-[var(--color-danger)] flex items-center gap-1">
              <WarningCircle size={12} /> Minimum interval is 5 seconds
            </p>
          )}
        </div>

        {/* Toggles */}
        <div className="space-y-2">
          {[
            { label: "Run immediately on start", value: runImmediately, onChange: setRunImmediately },
            { label: "Persist across app restart", value: persistAcrossRestart, onChange: setPersistAcrossRestart },
            { label: "Pause when offline", value: pauseWhenOffline, onChange: setPauseWhenOffline },
            { label: "Notify on failure", value: notifyOnFailure, onChange: setNotifyOnFailure },
            { label: "Notify on recovery", value: notifyOnRecovery, onChange: setNotifyOnRecovery },
          ].map((toggle) => (
            <label key={toggle.label} className="flex items-center justify-between p-2 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-input)] cursor-pointer hover:border-[var(--color-border-strong)] transition-colors select-none">
              <span className="text-[11px] text-[var(--color-text-secondary)]">{toggle.label}</span>
              <input
                type="checkbox"
                checked={toggle.value}
                onChange={(e) => toggle.onChange(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--color-border-default)] bg-[var(--color-bg-input)] text-[var(--color-accent-primary)] focus:ring-0 cursor-pointer"
              />
            </label>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-[var(--color-border-strong)] pt-3">
          <button onClick={onClose} className="px-3.5 py-1.5 text-xs font-semibold rounded bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] cursor-pointer">
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!isValid}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary-hover)] text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play size={12} weight="fill" /> Start Monitoring
          </button>
        </div>
      </div>
    </div>
  );
};
