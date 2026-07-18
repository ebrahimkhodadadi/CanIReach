import React, { useEffect, useState } from "react";
import { 
  listMonitoringSchedules, 
  createMonitoringSchedule, 
  updateMonitoringSchedule, 
  deleteMonitoringSchedule, 
  duplicateMonitoringSchedule, 
  setMonitoringScheduleEnabled,
  runScheduleNow,
  getNetworkProfiles,
  getTargets
} from "../../probes/api/probeCommands";
import { 
  Play, 
  Copy, 
  Trash, 
  Plus, 
  ToggleLeft, 
  ToggleRight,
  Clock,
  Calendar,
  Funnel,
  Gear
} from "@phosphor-icons/react";

export const Schedules: React.FC = () => {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [targets, setTargets] = useState<any[]>([]);
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [scopeType, setScopeType] = useState<"all_enabled_targets" | "selected_targets" | "group">("all_enabled_targets");
  const [selectedTargetsList, setSelectedTargetsList] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [scheduleType, setScheduleType] = useState<"interval" | "daily" | "weekly" | "cron">("interval");
  const [intervalSeconds, setIntervalSeconds] = useState(60);
  const [localTime, setLocalTime] = useState("09:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [cronExpression, setCronExpression] = useState("*/5 * * * *");
  const [networkProfileId, setNetworkProfileId] = useState("");
  const [runPreflight, setRunPreflight] = useState(false);
  const [strictPreflight, setStrictPreflight] = useState(false);
  const [overlapPolicy, setOverlapPolicy] = useState<"skip" | "queue_one" | "cancel_previous">("skip");
  const [missedRunPolicy, setMissedRunPolicy] = useState<"skip" | "run_once_on_resume">("run_once_on_resume");
  const [concurrencyLimit, setConcurrencyLimit] = useState(4);

  const loadData = async () => {
    try {
      const s = await listMonitoringSchedules();
      setSchedules(s);
      const p = await getNetworkProfiles();
      setProfiles(p);
      const t = await getTargets();
      setTargets(t);
    } catch (e) {
      console.error("Failed to load data for schedules:", e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleEnabled = async (id: string, current: boolean) => {
    try {
      const updated = await setMonitoringScheduleEnabled(id, !current);
      setSchedules(updated);
    } catch (e) {
      alert(`Error toggling schedule: ${e}`);
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      await runScheduleNow(id);
      alert("Background run triggered successfully.");
    } catch (e) {
      alert(`Failed to run: ${e}`);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const updated = await duplicateMonitoringSchedule(id);
      setSchedules(updated);
    } catch (e) {
      alert(`Failed to duplicate: ${e}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this schedule?")) return;
    try {
      const updated = await deleteMonitoringSchedule(id);
      setSchedules(updated);
    } catch (e) {
      alert(`Failed to delete: ${e}`);
    }
  };

  const handleOpenAdd = () => {
    setEditingSchedule(null);
    setName("");
    setDescription("");
    setEnabled(true);
    setScopeType("all_enabled_targets");
    setSelectedTargetsList([]);
    setSelectedGroupId("");
    setScheduleType("interval");
    setIntervalSeconds(60);
    setLocalTime("09:00");
    setDaysOfWeek([1, 2, 3, 4, 5]);
    setCronExpression("*/5 * * * *");
    setNetworkProfileId("");
    setRunPreflight(false);
    setStrictPreflight(false);
    setOverlapPolicy("skip");
    setMissedRunPolicy("run_once_on_resume");
    setConcurrencyLimit(4);
    setShowAddDialog(true);
  };

  const handleOpenEdit = (s: any) => {
    setEditingSchedule(s);
    setName(s.name);
    setDescription(s.description || "");
    setEnabled(s.enabled);
    setScopeType(s.scope.type);
    setSelectedTargetsList(s.scope.target_ids || []);
    setSelectedGroupId(s.scope.group_id || "");
    setScheduleType(s.schedule.type);
    if (s.schedule.type === "interval") {
      setIntervalSeconds(s.schedule.interval_seconds || 60);
    } else if (s.schedule.type === "daily") {
      setLocalTime(s.schedule.local_time || "09:00");
    } else if (s.schedule.type === "weekly") {
      setLocalTime(s.schedule.local_time || "09:00");
      setDaysOfWeek(s.schedule.days_of_week || [1, 2, 3, 4, 5]);
    } else if (s.schedule.type === "cron") {
      setCronExpression(s.schedule.expression || "*/5 * * * *");
    }
    setNetworkProfileId(s.network_profile_override_id || "");
    setRunPreflight(s.run_preflight);
    setStrictPreflight(s.strict_preflight_blocking);
    setOverlapPolicy(s.overlap_policy);
    setMissedRunPolicy(s.missed_run_policy);
    setConcurrencyLimit(s.concurrency_limit || 4);
    setShowAddDialog(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const scopeObj = {
      type: scopeType,
      target_ids: scopeType === "selected_targets" ? selectedTargetsList : undefined,
      group_id: scopeType === "group" ? selectedGroupId : undefined,
    };

    const scheduleObj = {
      type: scheduleType,
      interval_seconds: scheduleType === "interval" ? Number(intervalSeconds) : undefined,
      local_time: (scheduleType === "daily" || scheduleType === "weekly") ? localTime : undefined,
      days_of_week: scheduleType === "weekly" ? daysOfWeek : undefined,
      expression: scheduleType === "cron" ? cronExpression : undefined,
      time_zone: "UTC",
    };

    const payload = {
      schema_version: 1,
      id: editingSchedule ? editingSchedule.id : `sch-${Date.now()}`,
      name,
      description: description || null,
      enabled,
      scope: scopeObj,
      schedule: scheduleObj,
      network_profile_override_id: networkProfileId || null,
      run_preflight: runPreflight,
      strict_preflight_blocking: strictPreflight,
      overlap_policy: overlapPolicy,
      missed_run_policy: missedRunPolicy,
      concurrency_limit: Number(concurrencyLimit),
      target_timeout_ms: null,
      batch_timeout_ms: null,
      alert_rule_ids: ["default-rule"],
      created_at: editingSchedule ? editingSchedule.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_run_at: editingSchedule ? editingSchedule.last_run_at : null,
      next_run_at: editingSchedule ? editingSchedule.next_run_at : null,
    };

    try {
      let updated;
      if (editingSchedule) {
        updated = await updateMonitoringSchedule(payload);
      } else {
        updated = await createMonitoringSchedule(payload);
      }
      setSchedules(updated);
      setShowAddDialog(false);
    } catch (err) {
      alert(`Error saving schedule: ${err}`);
    }
  };

  const getScopeLabel = (scope: any) => {
    if (scope.type === "all_enabled_targets") return "All Enabled Targets";
    if (scope.type === "selected_targets") return `${scope.target_ids?.length || 0} selected endpoints`;
    if (scope.type === "group") return `Group: ${scope.group_id}`;
    return scope.type;
  };

  const getScheduleLabel = (s: any) => {
    if (s.type === "interval") return `Every ${s.interval_seconds} seconds`;
    if (s.type === "daily") return `Daily at ${s.local_time}`;
    if (s.type === "weekly") return `Weekly at ${s.local_time} (Days: ${s.days_of_week?.join(",")})`;
    if (s.type === "cron") return `Cron: ${s.expression}`;
    return s.type;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white">Scheduled Monitoring</h2>
          <p className="text-xs text-slate-400">Configure background testing intervals, scopes, and proxy overrides</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-lg shadow-indigo-600/10"
        >
          <Plus size={16} />
          Create Schedule
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {schedules.map((s) => (
          <div key={s.id} className="bg-[#0b1017] border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between hover:border-slate-700/80 transition-all duration-200 shadow-md">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                  s.enabled ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-500 border border-slate-700"
                }`}>
                  {s.enabled ? "Active" : "Disabled"}
                </span>
                <button 
                  onClick={() => handleToggleEnabled(s.id, s.enabled)}
                  className="text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  {s.enabled ? <ToggleRight size={26} className="text-indigo-400" /> : <ToggleLeft size={26} />}
                </button>
              </div>

              <h3 className="text-sm font-bold text-slate-100 mb-1">{s.name}</h3>
              {s.description && <p className="text-xs text-slate-400 mb-4 line-clamp-2">{s.description}</p>}

              <div className="space-y-2 border-t border-slate-800/50 pt-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Funnel size={14} className="text-slate-500" />
                  <span>Scope: <strong className="text-slate-200">{getScopeLabel(s.scope)}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-slate-500" />
                  <span>Trigger: <strong className="text-slate-200">{getScheduleLabel(s.schedule)}</strong></span>
                </div>
                {s.network_profile_override_id && (
                  <div className="flex items-center gap-2">
                    <Gear size={14} className="text-slate-500" />
                    <span>Profile: <strong className="text-indigo-400">{s.network_profile_override_id}</strong></span>
                  </div>
                )}
                {s.next_run_at && (
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-slate-500" />
                    <span>Next Run: <span className="text-slate-300 font-mono text-[10px]">{new Date(s.next_run_at).toLocaleTimeString()}</span></span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800/50 pt-4 mt-4">
              <button
                onClick={() => handleOpenEdit(s)}
                className="text-xs text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 px-2.5 py-1 rounded cursor-pointer transition-all"
              >
                Edit
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleRunNow(s.id)}
                  title="Run Now"
                  className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded cursor-pointer transition-all"
                >
                  <Play size={16} />
                </button>
                <button
                  onClick={() => handleDuplicate(s.id)}
                  title="Duplicate"
                  className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded cursor-pointer transition-all"
                >
                  <Copy size={16} />
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  title="Delete"
                  className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded cursor-pointer transition-all"
                >
                  <Trash size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0b1017] border border-slate-800 rounded-xl w-full max-w-xl max-h-[85vh] overflow-y-auto flex flex-col p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3 mb-4">
              {editingSchedule ? "Edit Schedule" : "Create Monitor Schedule"}
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production Endpoint Health Monitor"
                  className="w-full bg-slate-900/60 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-lg px-3 py-2 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Description (Optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Summarize the intent/interval of this check"
                  className="w-full bg-slate-900/60 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-lg px-3 py-2 text-xs outline-none h-16"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Target Scope</label>
                  <select
                    value={scopeType}
                    onChange={(e: any) => setScopeType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs outline-none"
                  >
                    <option value="all_enabled_targets">All Enabled Targets</option>
                    <option value="selected_targets">Selected Targets</option>
                    <option value="group">Target Group</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Trigger Schedule Type</label>
                  <select
                    value={scheduleType}
                    onChange={(e: any) => setScheduleType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs outline-none"
                  >
                    <option value="interval">Interval (Seconds)</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="cron">Cron Expression</option>
                  </select>
                </div>
              </div>

              {scopeType === "selected_targets" && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Select Targets</label>
                  <div className="border border-slate-800 rounded-lg p-3 bg-slate-950/60 max-h-24 overflow-y-auto space-y-1.5">
                    {targets.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={selectedTargetsList.includes(t.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTargetsList([...selectedTargetsList, t.id]);
                            } else {
                              setSelectedTargetsList(selectedTargetsList.filter(tid => tid !== t.id));
                            }
                          }}
                          className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-600"
                        />
                        {t.name} <span className="text-[10px] text-slate-500 font-mono">({t.url})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {scopeType === "group" && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Select Group ID / Category</label>
                  <input
                    type="text"
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    placeholder="e.g. Critical APIs"
                    className="w-full bg-slate-900/60 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-lg px-3 py-2 text-xs outline-none"
                  />
                </div>
              )}

              {scheduleType === "interval" && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Interval Duration (Seconds)</label>
                  <input
                    type="number"
                    min={10}
                    value={intervalSeconds}
                    onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                    className="w-full bg-slate-900/60 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-lg px-3 py-2 text-xs outline-none"
                  />
                </div>
              )}

              {(scheduleType === "daily" || scheduleType === "weekly") && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Local Run Time (HH:MM)</label>
                  <input
                    type="time"
                    value={localTime}
                    onChange={(e) => setLocalTime(e.target.value)}
                    className="w-full bg-slate-900/60 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-lg px-3 py-2 text-xs outline-none"
                  />
                </div>
              )}

              {scheduleType === "weekly" && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Days of Week</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                      const isSelected = daysOfWeek.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setDaysOfWeek(daysOfWeek.filter(day => day !== d));
                            } else {
                              setDaysOfWeek([...daysOfWeek, d].sort());
                            }
                          }}
                          className={`flex-1 text-[10px] py-1 border rounded font-semibold cursor-pointer transition-all ${
                            isSelected ? "bg-indigo-600/25 border-indigo-500 text-indigo-400" : "bg-slate-900 border-slate-800 text-slate-500"
                          }`}
                        >
                          {labels[d-1]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {scheduleType === "cron" && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Cron Expression</label>
                  <input
                    type="text"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    className="w-full bg-slate-900/60 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-lg px-3 py-2 text-xs outline-none font-mono"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 border-t border-slate-800/50 pt-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Network Profile</label>
                  <select
                    value={networkProfileId}
                    onChange={(e) => setNetworkProfileId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs outline-none"
                  >
                    <option value="">System Default</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Concurrency Limit</label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={concurrencyLimit}
                    onChange={(e) => setConcurrencyLimit(Number(e.target.value))}
                    className="w-full bg-slate-900/60 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-lg px-3 py-2 text-xs outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 border-t border-slate-800/50 pt-4">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={runPreflight}
                    onChange={(e) => setRunPreflight(e.target.checked)}
                    className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-600"
                  />
                  Run Profile Preflight
                </label>
                {runPreflight && (
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={strictPreflight}
                      onChange={(e) => setStrictPreflight(e.target.checked)}
                      className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-600"
                    />
                    Block Schedule if Preflight Fails
                  </label>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddDialog(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg cursor-pointer"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
