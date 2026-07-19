import React, { useState, useEffect } from "react";
import { X, Sliders } from "@phosphor-icons/react";
import { Target } from "../../features/probes/types";
import { useProbeActions, useGroups } from "../../features/probes/store/selectors";

interface TargetDialogProps {
  isOpen: boolean;
  target?: Target;
  onClose: () => void;
}

export const TargetDialog: React.FC<TargetDialogProps> = ({ isOpen, target, onClose }) => {
  const groups = useGroups();
  const { addTarget, editTarget } = useProbeActions();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced overrides
  const [requestMethod, setRequestMethod] = useState<"GET" | "HEAD">("HEAD");
  const [followRedirects, setFollowRedirects] = useState(true);
  const [testIpv4, setTestIpv4] = useState(true);
  const [testIpv6, setTestIpv6] = useState(true);
  const [enableHttp2, setEnableHttp2] = useState(true);
  const [enableHttp3, setEnableHttp3] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setName(target.name);
      setUrl(target.url);
      setDescription(target.description || "");
      setCategory(target.category || "");
      setSelectedGroups(target.group_ids || []);
      setEnabled(target.enabled);
      
      const ovr = target.diagnostic_overrides;
      setRequestMethod(ovr?.request_method || "HEAD");
      setFollowRedirects(ovr?.follow_redirects !== false);
      setTestIpv4(ovr?.test_ipv4 !== false);
      setTestIpv6(ovr?.test_ipv6 !== false);
      setEnableHttp2(ovr?.enable_http2 !== false);
      setEnableHttp3(ovr?.enable_http3 === true);
    } else {
      setName("");
      setUrl("");
      setDescription("");
      setCategory("");
      setSelectedGroups([]);
      setEnabled(true);
      setRequestMethod("HEAD");
      setFollowRedirects(true);
      setTestIpv4(true);
      setTestIpv6(true);
      setEnableHttp2(true);
      setEnableHttp3(false);
    }
    setError(null);
  }, [target, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!url.trim()) {
      setError("URL or Hostname is required");
      return;
    }

    // Basic URL cleanup
    let cleanUrl = url.trim();
    if (cleanUrl.includes("://")) {
      try {
        const parsed = new URL(cleanUrl);
        if (parsed.username || parsed.password) {
          setError("URL contains credentials. Please remove them for security.");
          return;
        }
      } catch (err) {
        setError("Invalid URL format");
        return;
      }
    }

    const payload: Target = {
      id: target?.id || cleanUrl.replace(/[^a-zA-Z0-9.-]/g, "-").toLowerCase(),
      name: name.trim(),
      url: cleanUrl,
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      group_ids: selectedGroups,
      tags: [],
      enabled,
      pinned: target?.pinned ?? false,
      sort_order: target?.sort_order ?? 0,
      diagnostic_overrides: showAdvanced ? {
        request_method: requestMethod,
        follow_redirects: followRedirects,
        test_ipv4: testIpv4,
        test_ipv6: testIpv6,
        enable_http2: enableHttp2,
        enable_http3: enableHttp3
      } : undefined,
      created_at: target?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      if (target) {
        await editTarget(payload);
      } else {
        await addTarget(payload);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save target");
    }
  };

  const toggleGroup = (groupId: string) => {
    if (selectedGroups.includes(groupId)) {
      setSelectedGroups(selectedGroups.filter(g => g !== groupId));
    } else {
      setSelectedGroups([...selectedGroups, groupId]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#0d1117] border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between bg-[#07090e]/30">
          <h3 className="text-sm font-bold text-white">
            {target ? "Edit Endpoint Target" : "Add New Endpoint Target"}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-900 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 font-medium">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-slate-400 font-semibold block">Target Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GitHub API"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-semibold block">Hostname / URL *</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g. api.github.com or https://api.github.com"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-semibold block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes or details"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 h-16 resize-none focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold block">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. APIs"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950/20 mt-4">
              <div>
                <span className="text-slate-400 font-semibold block">Enabled</span>
                <span className="text-[10px] text-slate-500">Include in monitoring tests</span>
              </div>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-600 bg-slate-950 border border-slate-800 focus:ring-0 cursor-pointer"
              />
            </div>
          </div>

          {/* Groups Selection */}
          <div className="space-y-1.5">
            <label className="text-slate-400 font-semibold block">Groups</label>
            <div className="flex flex-wrap gap-2">
              {groups.map((group) => {
                const isSelected = selectedGroups.includes(group.id);
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    style={{ borderColor: isSelected ? group.color || "#4f46e5" : "#1e293b" }}
                    className={`px-2.5 py-1 rounded-full border text-[10px] font-medium transition-all cursor-pointer ${
                      isSelected 
                        ? "bg-indigo-500/5 text-slate-200 font-semibold"
                        : "bg-slate-950 text-slate-500 hover:border-slate-700"
                    }`}
                  >
                    {group.name}
                  </button>
                );
              })}
              {groups.length === 0 && (
                <span className="text-slate-500 text-[10px]">No groups configured. Create one in dashboard.</span>
              )}
            </div>
          </div>

          {/* Advanced Diagnostic Overrides Toggle */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-350 font-bold select-none cursor-pointer"
            >
              <Sliders size={14} />
              {showAdvanced ? "Hide Advanced Diagnostic Overrides" : "Show Advanced Diagnostic Overrides"}
            </button>
          </div>

          {showAdvanced && (
            <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-950/20 space-y-3 animate-fadeIn">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold block">Request Method</label>
                  <select
                    value={requestMethod}
                    onChange={(e) => setRequestMethod(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none cursor-pointer"
                  >
                    <option value="HEAD">HEAD (Fast / Safe)</option>
                    <option value="GET">GET (Full request)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-slate-950/40">
                  <span className="text-slate-400">Follow Redirects</span>
                  <input
                    type="checkbox"
                    checked={followRedirects}
                    onChange={(e) => setFollowRedirects(e.target.checked)}
                    className="w-4.5 h-4.5 rounded accent-indigo-600 cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-2 rounded bg-slate-950/40">
                  <span className="text-slate-400">Test IPv4</span>
                  <input
                    type="checkbox"
                    checked={testIpv4}
                    onChange={(e) => setTestIpv4(e.target.checked)}
                    className="w-4.5 h-4.5 rounded accent-indigo-600 cursor-pointer"
                  />
                </div>
                
                <div className="flex items-center justify-between p-2 rounded bg-slate-950/40">
                  <span className="text-slate-400">Test IPv6</span>
                  <input
                    type="checkbox"
                    checked={testIpv6}
                    onChange={(e) => setTestIpv6(e.target.checked)}
                    className="w-4.5 h-4.5 rounded accent-indigo-600 cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-2 rounded bg-slate-950/40">
                  <span className="text-slate-400">Enable HTTP/2</span>
                  <input
                    type="checkbox"
                    checked={enableHttp2}
                    onChange={(e) => setEnableHttp2(e.target.checked)}
                    className="w-4.5 h-4.5 rounded accent-indigo-600 cursor-pointer"
                  />
                </div>
                
                <div className="flex items-center justify-between p-2 rounded bg-slate-950/40">
                  <span className="text-slate-400">Enable HTTP/3</span>
                  <input
                    type="checkbox"
                    checked={enableHttp3}
                    onChange={(e) => setEnableHttp3(e.target.checked)}
                    className="w-4.5 h-4.5 rounded accent-indigo-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-4 border-t border-slate-800/80 flex gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-slate-900 border border-slate-800 text-slate-350 font-bold rounded-lg hover:bg-slate-850 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg cursor-pointer"
            >
              {target ? "Save Changes" : "Create Target"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
