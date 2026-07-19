import React, { useState, useEffect } from "react";
import {
  FloppyDisk,
  Check,
  WarningCircle,
  Globe,
  Users,
  Gear,
  Trash,
  Pencil,
  PlusCircle,
  ArrowClockwise,
  Broadcast
} from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getSettings, saveSettings } from "../../../features/probes/api/probeCommands";
import { FrontendSettings, TargetGroup, NetworkProfile, DnsServerConfig } from "../../../features/probes/types";
import { useGroups, useProfiles, useProbeActions } from "../../../features/probes/store/selectors";

export const Settings: React.FC = () => {
  // Store actions
  const groups = useGroups();
  const profiles = useProfiles();
  const {
    addGroup,
    editGroup,
    removeGroup,
    addProfile,
    editProfile,
    removeProfile,
    setDefaultProfile,
  } = useProbeActions();

  // Settings states
  const [settings, setSettings] = useState<FrontendSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // App Reset Verification states
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

  const handleResetApp = async () => {
    if (confirmText !== "RESET CANIREACH") return;
    try {
      setResetting(true);
      await invoke("reset_application");
    } catch (e) {
      setError(String(e));
      setResetting(false);
    }
  };

  // Sub-tabs
  const [subTab, setSubTab] = useState<"engine" | "profiles" | "groups" | "updates" | "reset" | "monitoring">("engine");

  // Updates state
  const [updateState, setUpdateState] = useState<{
    status: 'idle' | 'checking' | 'upToDate' | 'available' | 'downloading' | 'downloaded' | 'verifying' | 'readyToInstall' | 'installing' | 'failed';
    currentVersion: string;
    availableVersion: string | null;
    downloadProgress: number | null;
    error: string | null;
  }>({
    status: "idle",
    currentVersion: "0.1.0",
    availableVersion: null,
    downloadProgress: null,
    error: null
  });

  useEffect(() => {
    // Hydrate current state from backend
    const hydrateState = async () => {
      try {
        const state = await invoke<any>("get_update_state");
        setUpdateState(state);
      } catch (e) {
        console.error("Failed to hydrate updater state:", e);
      }
    };
    hydrateState();

    // Listen to changes
    let unlisten: (() => void) | null = null;
    const setupListener = async () => {
      unlisten = await listen<any>("update-state-changed", (event) => {
        setUpdateState(event.payload);
      });
    };
    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleCheckUpdates = async () => {
    try {
      const state = await invoke<any>("check_for_updates");
      setUpdateState(state);
    } catch (e: any) {
      setUpdateState(prev => ({
        ...prev,
        status: "failed",
        error: e.message || String(e)
      }));
    }
  };

  const handleStartUpdate = async () => {
    try {
      await invoke("download_and_install_update");
    } catch (e: any) {
      setUpdateState(prev => ({
        ...prev,
        status: "failed",
        error: e.message || String(e)
      }));
    }
  };

  // Targets Group Form State
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [groupColor, setGroupColor] = useState("#4f46e5");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // Network Profiles Form State
  const [profileName, setProfileName] = useState("");
  const [profileDesc, setProfileDesc] = useState("");
  const [profileIsDefault, setProfileIsDefault] = useState(false);
  
  // Interface selection
  const [interfaceMode, setInterfaceMode] = useState<"system" | "interface">("system");
  const [interfaceId, setInterfaceId] = useState("");
  const [sourceIpv4, setSourceIpv4] = useState("");
  const [sourceIpv6, setSourceIpv6] = useState("");

  // IP Preference
  const [ipPreference, setIpPreference] = useState<string>("system");

  // DNS
  const [dnsMode, setDnsMode] = useState<"system" | "custom">("system");
  const [dnsServers, setDnsServers] = useState<DnsServerConfig[]>([]);
  const [newDnsAddr, setNewDnsAddr] = useState("");
  const [newDnsProto, setNewDnsProto] = useState("udp");

  // Proxy
  const [proxyMode, setProxyMode] = useState<"system" | "direct" | "custom">("system");
  const [proxyType, setProxyType] = useState("socks5");
  const [proxyHost, setProxyHost] = useState("");
  const [proxyPort, setProxyPort] = useState<number>(10888);

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await getSettings();
      setSettings(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load settings from backend");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof FrontendSettings, value: any) => {
    if (!settings) return;
    setSettings({
      ...settings,
      [field]: value
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      setSaving(true);
      setError(null);
      await saveSettings(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  // Group Form submission
  const handleGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    const payload: TargetGroup = {
      id: editingGroupId || groupName.trim().replace(/[^a-zA-Z0-9]/g, "-").toLowerCase(),
      name: groupName.trim(),
      description: groupDesc.trim() || undefined,
      color: groupColor,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      if (editingGroupId) {
        await editGroup(payload);
      } else {
        await addGroup(payload);
      }
      setGroupName("");
      setGroupDesc("");
      setGroupColor("#4f46e5");
      setEditingGroupId(null);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to save target group");
    }
  };

  const startEditGroup = (g: TargetGroup) => {
    setEditingGroupId(g.id);
    setGroupName(g.name);
    setGroupDesc(g.description || "");
    setGroupColor(g.color || "#4f46e5");
  };

  // Profile Form submission
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) return;

    const payload: NetworkProfile = {
      id: editingProfileId || profileName.trim().replace(/[^a-zA-Z0-9]/g, "-").toLowerCase(),
      name: profileName.trim(),
      description: profileDesc.trim() || undefined,
      is_default: profileIsDefault,
      interface: {
        mode: interfaceMode,
        interface_id: interfaceId.trim() || undefined,
        source_ipv4: sourceIpv4.trim() || undefined,
        source_ipv6: sourceIpv6.trim() || undefined
      },
      dns: {
        mode: dnsMode,
        servers: dnsServers
      },
      proxy: {
        mode: proxyMode,
        custom_type: proxyMode === "custom" ? proxyType : undefined,
        custom_host: proxyMode === "custom" ? proxyHost.trim() : undefined,
        custom_port: proxyMode === "custom" ? proxyPort : undefined
      },
      ip_preference: ipPreference,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      if (editingProfileId) {
        await editProfile(payload);
      } else {
        await addProfile(payload);
      }
      resetProfileForm();
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to save profile");
    }
  };

  const startEditProfile = (p: NetworkProfile) => {
    setEditingProfileId(p.id);
    setProfileName(p.name);
    setProfileDesc(p.description || "");
    setProfileIsDefault(p.is_default);

    setInterfaceMode(p.interface.mode as any);
    setInterfaceId(p.interface.interface_id || "");
    setSourceIpv4(p.interface.source_ipv4 || "");
    setSourceIpv6(p.interface.source_ipv6 || "");

    setIpPreference(p.ip_preference);

    setDnsMode(p.dns.mode as any);
    setDnsServers(p.dns.servers);

    setProxyMode(p.proxy.mode as any);
    setProxyType(p.proxy.custom_type || "socks5");
    setProxyHost(p.proxy.custom_host || "");
    setProxyPort(p.proxy.custom_port || 10888);
  };

  const resetProfileForm = () => {
    setEditingProfileId(null);
    setProfileName("");
    setProfileDesc("");
    setProfileIsDefault(false);
    setInterfaceMode("system");
    setInterfaceId("");
    setSourceIpv4("");
    setSourceIpv6("");
    setIpPreference("system");
    setDnsMode("system");
    setDnsServers([]);
    setProxyMode("system");
    setProxyType("socks5");
    setProxyHost("");
    setProxyPort(10888);
  };

  const addDnsServer = () => {
    if (!newDnsAddr.trim()) return;
    const newServer: DnsServerConfig = {
      id: Math.random().toString(36).substring(7),
      address: newDnsAddr.trim(),
      protocol: newDnsProto,
      enabled: true
    };
    setDnsServers([...dnsServers, newServer]);
    setNewDnsAddr("");
  };

  const removeDnsServer = (id: string) => {
    setDnsServers(dnsServers.filter(s => s.id !== id));
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-[var(--color-text-secondary)] bg-[var(--color-bg-app)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-5 h-5 border-2 border-[var(--color-accent-primary)] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold font-mono">Loading system configurations...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col p-4 space-y-4 bg-[var(--color-bg-app)] select-none text-xs">
      
      {/* Title */}
      <div className="border-b border-[var(--color-border-default)] pb-3 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">Configuration Center</h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Manage engine settings, network profiles and endpoint groups</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 border border-[var(--color-danger)]/25 bg-[var(--color-danger-soft)] p-3 rounded text-[var(--color-danger)] text-xs shrink-0 select-text">
          <WarningCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Sub-tabs Selection */}
      <div className="flex bg-[var(--color-bg-input)] border border-[var(--color-border-default)] p-0.5 rounded gap-1 shrink-0">
        {[
          { id: "engine", label: "Engine Settings", icon: Gear },
          { id: "profiles", label: "Network Profiles", icon: Globe },
          { id: "groups", label: "Endpoint Groups", icon: Users },
          { id: "updates", label: "Software Updates", icon: ArrowClockwise },
          { id: "monitoring", label: "Monitoring", icon: Broadcast },
          { id: "reset", label: "Reset App", icon: Trash }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setSubTab(tab.id as any);
                setError(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                isActive 
                  ? "bg-[var(--color-bg-panel-elevated)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)]" 
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-panel-hover)]"
              }`}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Configuration View content */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {subTab === "engine" && settings && (
          <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
            
            {/* Timings and Performance */}
            <section className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/40 space-y-1.5">
                  <label className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">Concurrency Limit</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={settings.concurrency_limit}
                    onChange={(e) => handleInputChange("concurrency_limit", parseInt(e.target.value) || 5)}
                    className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] font-mono w-full focus:outline-none focus:border-[var(--color-border-strong)]"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] font-mono leading-relaxed">Maximum concurrent tasks.</p>
                </div>

                <div className="p-3.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/40 space-y-1.5">
                  <label className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">Max Redirects</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={settings.redirect_limit}
                    onChange={(e) => handleInputChange("redirect_limit", parseInt(e.target.value) || 10)}
                    className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] font-mono w-full focus:outline-none focus:border-[var(--color-border-strong)]"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] font-mono leading-relaxed">Safety limit resolving redirect loops.</p>
                </div>

                <div className="p-3.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/40 space-y-1.5">
                  <label className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">Connect Timeout (ms)</label>
                  <input
                    type="number"
                    min="100"
                    max="60000"
                    value={settings.connect_timeout_ms}
                    onChange={(e) => handleInputChange("connect_timeout_ms", parseInt(e.target.value) || 5000)}
                    className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] font-mono w-full focus:outline-none focus:border-[var(--color-border-strong)]"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] font-mono leading-relaxed">TCP connection timeout threshold.</p>
                </div>

                <div className="p-3.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/40 space-y-1.5">
                  <label className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">Total Timeout (ms)</label>
                  <input
                    type="number"
                    min="100"
                    max="60000"
                    value={settings.timeout_ms}
                    onChange={(e) => handleInputChange("timeout_ms", parseInt(e.target.value) || 10000)}
                    className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] font-mono w-full focus:outline-none focus:border-[var(--color-border-strong)]"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] font-mono leading-relaxed">Total socket payload read stream timeout.</p>
                </div>

                <div className="p-3.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/40 space-y-1.5">
                  <label className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">DNS Timeout (ms)</label>
                  <input
                    type="number"
                    min="100"
                    max="60000"
                    value={settings.dns_timeout_ms}
                    onChange={(e) => handleInputChange("dns_timeout_ms", parseInt(e.target.value) || 3000)}
                    className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] font-mono w-full focus:outline-none focus:border-[var(--color-border-strong)]"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] font-mono leading-relaxed">Name server lookup response limit.</p>
                </div>

                <div className="p-3.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/40 space-y-1.5">
                  <label className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">TCP Timeout (ms)</label>
                  <input
                    type="number"
                    min="100"
                    max="60000"
                    value={settings.tcp_timeout_ms}
                    onChange={(e) => handleInputChange("tcp_timeout_ms", parseInt(e.target.value) || 3000)}
                    className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] font-mono w-full focus:outline-none focus:border-[var(--color-border-strong)]"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] font-mono leading-relaxed">Socket connectivity audit limit.</p>
                </div>

                <div className="p-3.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/40 space-y-1.5">
                  <label className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">TLS Timeout (ms)</label>
                  <input
                    type="number"
                    min="100"
                    max="60000"
                    value={settings.tls_timeout_ms}
                    onChange={(e) => handleInputChange("tls_timeout_ms", parseInt(e.target.value) || 3000)}
                    className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] font-mono w-full focus:outline-none focus:border-[var(--color-border-strong)]"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] font-mono leading-relaxed">TLS verification handshake limit.</p>
                </div>

                <div className="p-3.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/40 space-y-1.5">
                  <label className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">Retry Count</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={settings.retry_count}
                    onChange={(e) => handleInputChange("retry_count", parseInt(e.target.value) || 1)}
                    className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] font-mono w-full focus:outline-none focus:border-[var(--color-border-strong)]"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] font-mono leading-relaxed">Number of retries after a fail step.</p>
                </div>

                <div className="p-3.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/40 space-y-1.5">
                  <label className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">Retry Delay (ms)</label>
                  <input
                    type="number"
                    min="100"
                    max="10000"
                    value={settings.retry_delay_ms}
                    onChange={(e) => handleInputChange("retry_delay_ms", parseInt(e.target.value) || 500)}
                    className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] font-mono w-full focus:outline-none focus:border-[var(--color-border-strong)]"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] font-mono leading-relaxed">Cooldown interval between failures.</p>
                </div>
              </div>
            </section>

            {/* Save bar */}
            <div className="flex items-center gap-3 pt-3 border-t border-[var(--color-border-subtle)]">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-bold text-xs uppercase font-mono tracking-wider transition-colors cursor-pointer"
              >
                <FloppyDisk size={13} />
                {saving ? "Saving configurations..." : "Save configurations"}
              </button>
              {saveSuccess && (
                <span className="text-[var(--color-success)] text-xs flex items-center gap-1 font-semibold animate-fade-in select-none">
                  <Check size={14} /> Settings Saved
                </span>
              )}
            </div>

          </form>
        )}

        {subTab === "profiles" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* List Profiles */}
            <div className="lg:col-span-1 space-y-3.5">
              <h3 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider font-mono flex items-center gap-1">
                <Globe size={13} className="text-[var(--color-accent-primary)]" />
                Network Profiles
              </h3>

              <div className="space-y-2.5">
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => startEditProfile(p)}
                    className={`p-3 rounded border cursor-pointer transition-all flex flex-col justify-between ${
                      editingProfileId === p.id 
                        ? "bg-[var(--color-bg-panel-hover)] border-[var(--color-border-strong)]" 
                        : "bg-[var(--color-bg-panel)]/40 border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[var(--color-text-primary)] text-xs">{p.name}</span>
                          {p.is_default && (
                            <span className="text-[9px] bg-[var(--color-success-soft)] text-[var(--color-success)] border border-[var(--color-success)]/10 font-bold font-mono px-1 rounded uppercase">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-[var(--color-text-muted)] font-mono mt-0.5">{p.id}</p>
                      </div>

                      <div className="flex gap-2">
                        {!p.is_default && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDefaultProfile(p.id);
                            }}
                            className="text-[9px] font-bold font-mono border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            Set Default
                          </button>
                        )}
                        {p.id !== "system-default" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeProfile(p.id);
                              if (editingProfileId === p.id) resetProfileForm();
                            }}
                            className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] cursor-pointer p-0.5 hover:bg-[var(--color-danger-soft)] rounded transition-colors"
                          >
                            <Trash size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {p.description && (
                      <p className="text-[10px] text-[var(--color-text-secondary)] mt-1.5 leading-normal">{p.description}</p>
                    )}

                    {/* Quick Config Specs */}
                    <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-[var(--color-border-subtle)] text-[9px] text-[var(--color-text-muted)] font-mono select-none">
                      <div>
                        <span className="text-[var(--color-text-muted)] opacity-60 block">IP prefer</span>
                        <span className="text-[var(--color-text-primary)] font-bold">{p.ip_preference}</span>
                      </div>
                      <div>
                        <span className="text-[var(--color-text-muted)] opacity-60 block">DNS mode</span>
                        <span className="text-[var(--color-text-primary)] font-bold">{p.dns.mode}</span>
                      </div>
                      <div>
                        <span className="text-[var(--color-text-muted)] opacity-60 block">Proxy mode</span>
                        <span className="text-[var(--color-text-primary)] font-bold">{p.proxy.mode}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Profile Config Form */}
            <form onSubmit={handleProfileSubmit} className="lg:col-span-2 p-4 border border-[var(--color-border-default)] rounded bg-[var(--color-bg-panel)]/40 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2 select-none">
                <h4 className="text-[10px] font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">
                  {editingProfileId ? "Edit Profile Settings" : "Configure Custom Network Profile"}
                </h4>
                {editingProfileId && (
                  <button
                    type="button"
                    onClick={resetProfileForm}
                    className="text-[10px] text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary-hover)] font-bold cursor-pointer"
                  >
                    Reset Form
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Profile Name</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="e.g. SOCKS5 Workspace"
                    className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)]"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-input)] mt-5 select-none">
                  <span className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Set Default Profile</span>
                  <input
                    type="checkbox"
                    checked={profileIsDefault}
                    onChange={(e) => setProfileIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--color-border-default)] bg-[var(--color-bg-input)] text-[var(--color-accent-primary)] focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Description</label>
                <input
                  type="text"
                  value={profileDesc}
                  onChange={(e) => setProfileDesc(e.target.value)}
                  placeholder="Describe this profile's routing strategy"
                  className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)]"
                />
              </div>

              {/* Advanced Network settings inside Form */}
              <div className="p-3.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)]/20 space-y-4">
                <h5 className="font-bold text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono border-b border-[var(--color-border-subtle)] pb-1 select-none">Network Routing overrides</h5>

                {/* Interface Binding */}
                <div className="space-y-2 select-none">
                  <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Outbound Socket IP Binding</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInterfaceMode("system")}
                      className={`p-2 rounded border text-left cursor-pointer transition-all ${
                        interfaceMode === "system"
                          ? "border-[var(--color-border-strong)] bg-[var(--color-bg-panel-elevated)] text-[var(--color-text-primary)]"
                          : "border-[var(--color-border-default)] bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      <div className="font-bold font-mono text-[10px] uppercase">System Default</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInterfaceMode("interface")}
                      className={`p-2 rounded border text-left cursor-pointer transition-all ${
                        interfaceMode === "interface"
                          ? "border-[var(--color-border-strong)] bg-[var(--color-bg-panel-elevated)] text-[var(--color-text-primary)]"
                          : "border-[var(--color-border-default)] bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      <div className="font-bold font-mono text-[10px] uppercase">Custom Interface Bind</div>
                    </button>
                  </div>

                  {interfaceMode === "interface" && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-2 bg-[var(--color-bg-input)] border border-[var(--color-border-subtle)] rounded animate-fadeIn text-[11px]">
                      <div className="space-y-1">
                        <span>Interface Name/ID</span>
                        <input
                          type="text"
                          value={interfaceId}
                          onChange={(e) => setInterfaceId(e.target.value)}
                          placeholder="e.g. eth0, wlan0"
                          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <span>Source IPv4</span>
                        <input
                          type="text"
                          value={sourceIpv4}
                          onChange={(e) => setSourceIpv4(e.target.value)}
                          placeholder="e.g. 192.168.1.100"
                          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <span>Source IPv6</span>
                        <input
                          type="text"
                          value={sourceIpv6}
                          onChange={(e) => setSourceIpv6(e.target.value)}
                          placeholder="e.g. fe80::..."
                          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* IP preference */}
                <div className="space-y-2 select-none">
                  <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Internet Protocol Preference</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "system", label: "System Default" },
                      { id: "ipv4", label: "Force IPv4" },
                      { id: "ipv6", label: "Force IPv6" }
                    ].map((pref) => (
                      <button
                        key={pref.id}
                        type="button"
                        onClick={() => setIpPreference(pref.id)}
                        className={`p-2 rounded border text-center cursor-pointer transition-all ${
                          ipPreference === pref.id
                            ? "border-[var(--color-border-strong)] bg-[var(--color-bg-panel-elevated)] text-[var(--color-text-primary)]"
                            : "border-[var(--color-border-default)] bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                        }`}
                      >
                        <div className="font-bold font-mono text-[9px] uppercase">{pref.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* DNS configuration */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono block select-none">DNS Resolution Profile</label>
                  <div className="grid grid-cols-2 gap-2 select-none">
                    <button
                      type="button"
                      onClick={() => setDnsMode("system")}
                      className={`p-2 rounded border text-left cursor-pointer transition-all ${
                        dnsMode === "system"
                          ? "border-[var(--color-border-strong)] bg-[var(--color-bg-panel-elevated)] text-[var(--color-text-primary)]"
                          : "border-[var(--color-border-default)] bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      <div className="font-bold font-mono text-[10px] uppercase">System DNS</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDnsMode("custom")}
                      className={`p-2 rounded border text-left cursor-pointer transition-all ${
                        dnsMode === "custom"
                          ? "border-[var(--color-border-strong)] bg-[var(--color-bg-panel-elevated)] text-[var(--color-text-primary)]"
                          : "border-[var(--color-border-default)] bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      <div className="font-bold font-mono text-[10px] uppercase">Custom Name Servers</div>
                    </button>
                  </div>

                  {dnsMode === "custom" && (
                    <div className="p-2.5 bg-[var(--color-bg-input)] border border-[var(--color-border-subtle)] rounded space-y-2.5 animate-fadeIn">
                      {/* Active DNS servers list */}
                      {dnsServers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto select-none">
                          {dnsServers.map((server) => (
                            <span 
                              key={server.id} 
                              className="px-2 py-0.5 rounded bg-[var(--color-bg-panel)] border border-[var(--color-border-default)] text-[10px] font-mono text-[var(--color-text-primary)] flex items-center gap-1.5"
                            >
                              <span className="text-[8px] uppercase font-bold text-[var(--color-accent-secondary)]">{server.protocol}</span>
                              {server.address}
                              <button 
                                type="button"
                                onClick={() => removeDnsServer(server.id)}
                                className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] font-bold cursor-pointer"
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Add DNS input */}
                      <div className="flex gap-2">
                        <select
                          value={newDnsProto}
                          onChange={(e) => setNewDnsProto(e.target.value)}
                          className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2 py-1 text-[var(--color-text-secondary)] cursor-pointer outline-none font-mono"
                        >
                          <option value="udp">UDP</option>
                          <option value="tcp">TCP</option>
                          <option value="doh">DoH</option>
                          <option value="dot">DoT</option>
                        </select>
                        <input
                          type="text"
                          value={newDnsAddr}
                          onChange={(e) => setNewDnsAddr(e.target.value)}
                          placeholder="e.g. 8.8.8.8"
                          className="flex-1 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] font-mono outline-none"
                        />
                        <button
                          type="button"
                          onClick={addDnsServer}
                          className="p-1 rounded bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] cursor-pointer"
                        >
                          <PlusCircle size={15} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Proxy Settings */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono block select-none">Proxy Configuration Mode</label>
                  <div className="grid grid-cols-3 gap-2 select-none">
                    {[
                      { id: "system", label: "System Proxy" },
                      { id: "direct", label: "No Proxy (Direct)" },
                      { id: "custom", label: "Manual Proxy config" }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setProxyMode(mode.id as any)}
                        className={`p-2 rounded border text-center cursor-pointer transition-all ${
                          proxyMode === mode.id
                            ? "border-[var(--color-border-strong)] bg-[var(--color-bg-panel-elevated)] text-[var(--color-text-primary)]"
                            : "border-[var(--color-border-default)] bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                        }`}
                      >
                        <div className="font-bold font-mono text-[9px] uppercase">{mode.label}</div>
                      </button>
                    ))}
                  </div>

                  {proxyMode === "custom" && (
                    <div className="grid grid-cols-3 gap-2 p-2 bg-[var(--color-bg-input)] border border-[var(--color-border-subtle)] rounded animate-fadeIn text-[11px]">
                      <div className="space-y-1">
                        <span>Proxy Type</span>
                        <select
                          value={proxyType}
                          onChange={(e) => setProxyType(e.target.value)}
                          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] outline-none font-mono cursor-pointer"
                        >
                          <option value="socks5">SOCKS5</option>
                          <option value="socks5h">SOCKS5H (Remote DNS)</option>
                          <option value="http">HTTP</option>
                          <option value="https">HTTPS</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <span>Host Address</span>
                        <input
                          type="text"
                          value={proxyHost}
                          onChange={(e) => setProxyHost(e.target.value)}
                          placeholder="e.g. 127.0.0.1"
                          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <span>Port Number</span>
                        <input
                          type="number"
                          value={proxyPort}
                          onChange={(e) => setProxyPort(parseInt(e.target.value) || 1080)}
                          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] outline-none font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>

              </div>

              <button
                type="submit"
                className="w-full py-2 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:border-[var(--color-text-primary)] font-bold text-xs uppercase font-mono tracking-wider transition-colors cursor-pointer select-none"
              >
                {editingProfileId ? "Save Profile Settings" : "Create Network Profile"}
              </button>
            </form>
          </div>
        )}

        {subTab === "groups" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
            {/* List Groups */}
            <div className="space-y-3.5">
              <h3 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider font-mono flex items-center gap-1 select-none">
                <Users size={13} className="text-[var(--color-accent-primary)]" />
                Endpoint Groups
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {groups.map((g) => (
                  <div
                    key={g.id}
                    className="p-3 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/45 flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between select-none">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: g.color || "#4f46e5" }}
                        />
                        <span className="font-bold text-[var(--color-text-primary)] text-xs">{g.name}</span>
                      </div>

                      <div className="flex gap-1.5">
                        <button
                          onClick={() => startEditGroup(g)}
                          className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-panel-hover)] rounded p-0.5 cursor-pointer"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => removeGroup(g.id)}
                          className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] rounded p-0.5 cursor-pointer"
                        >
                          <Trash size={12} />
                        </button>
                      </div>
                    </div>

                    {g.description && (
                      <p className="text-[10px] text-[var(--color-text-secondary)] mt-2 line-clamp-2">{g.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Group Form */}
            <form onSubmit={handleGroupSubmit} className="p-4 border border-[var(--color-border-default)] rounded bg-[var(--color-bg-panel)]/40 space-y-4 h-fit">
              <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2 select-none">
                <h4 className="text-[10px] font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">
                  {editingGroupId ? "Edit Endpoint Group" : "Create Endpoint Group"}
                </h4>
                {editingGroupId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingGroupId(null);
                      setGroupName("");
                      setGroupDesc("");
                      setGroupColor("#4f46e5");
                    }}
                    className="text-[10px] text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary-hover)] font-bold cursor-pointer"
                  >
                    Reset Form
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Group Name</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Database Nodes"
                  className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Description</label>
                <textarea
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                  placeholder="Notes about these targets (optional)"
                  className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] h-16 resize-none focus:outline-none focus:border-[var(--color-border-strong)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono font-mono">Label Color Indicator</label>
                <div className="flex gap-2.5 items-center">
                  <input
                    type="color"
                    value={groupColor}
                    onChange={(e) => setGroupColor(e.target.value)}
                    className="bg-transparent border border-[var(--color-border-default)] rounded w-10 h-7 p-0.5 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={groupColor}
                    onChange={(e) => setGroupColor(e.target.value)}
                    className="flex-1 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-secondary)] font-mono outline-none focus:border-[var(--color-border-strong)]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:border-[var(--color-text-primary)] font-bold text-xs uppercase font-mono tracking-wider transition-colors cursor-pointer select-none"
              >
                {editingGroupId ? "Save Changes" : "Create Group"}
              </button>
            </form>
          </div>
        )}

        {subTab === "updates" && (
          <div className="space-y-6 max-w-2xl">
            <div className="p-4 border border-[var(--color-border-default)] rounded bg-[var(--color-bg-panel)]/40 space-y-4">
              <div className="flex items-start justify-between border-b border-[var(--color-border-subtle)] pb-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)] font-mono uppercase">Software Version</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-[var(--color-text-secondary)]">Current build version:</span>
                    <code className="text-xs font-bold text-[var(--color-accent-primary)] font-mono">{updateState.currentVersion}</code>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Release Channel</span>
                  <div className="mt-1 flex items-center gap-1.5 px-2 py-0.5 rounded border border-[var(--color-border-strong)] bg-[var(--color-bg-panel-elevated)]">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-mono text-[var(--color-text-primary)] uppercase tracking-wider font-bold">Stable</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 py-2 select-none">
                {updateState.status === "idle" && (
                  <p className="text-xs text-[var(--color-text-secondary)]">Check for newer versions of CanIReach over secure HTTPS channels.</p>
                )}
                {updateState.status === "checking" && (
                  <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                    <div className="w-3 h-3 rounded-full border-2 border-[var(--color-border-strong)] border-t-transparent animate-spin" />
                    <span>Checking for new update packages on distribution endpoints...</span>
                  </div>
                )}
                {updateState.status === "upToDate" && (
                  <div className="flex items-center gap-2 text-xs text-emerald-500 font-semibold bg-emerald-500/5 border border-emerald-500/10 p-3 rounded">
                    <Check size={16} />
                    <span>You are fully up to date! CanIReach is running the latest production build.</span>
                  </div>
                )}
                {updateState.status === "available" && (
                  <div className="border border-[var(--color-border-strong)] bg-[var(--color-bg-panel-elevated)] p-4 rounded space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase font-mono">Update Available</h4>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                          A newer version is ready: <code className="font-bold text-[var(--color-accent-primary)] font-mono">{updateState.availableVersion}</code>
                        </p>
                      </div>
                      <button
                        onClick={handleStartUpdate}
                        className="px-3.5 py-1.5 bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary-hover)] border border-[var(--color-border-strong)] text-[var(--color-bg-panel)] font-bold text-xs uppercase font-mono tracking-wider transition-colors cursor-pointer rounded"
                      >
                        Download & Install
                      </button>
                    </div>
                  </div>
                )}
                {updateState.status === "downloading" && (
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[var(--color-text-secondary)] font-semibold">Downloading update files...</span>
                      <span className="font-bold text-[var(--color-text-primary)] font-mono">
                        {updateState.downloadProgress ? `${Math.round(updateState.downloadProgress * 100)}%` : "0%"}
                      </span>
                    </div>
                    <div className="w-full bg-[var(--color-bg-input)] rounded-full h-1.5 overflow-hidden border border-[var(--color-border-default)]">
                      <div
                        className="bg-[var(--color-accent-primary)] h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${(updateState.downloadProgress || 0) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
                {updateState.status === "readyToInstall" && (
                  <div className="flex items-center justify-between border border-emerald-500/25 bg-emerald-500/5 p-4 rounded">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase font-mono">Update Downloaded</h4>
                      <p className="text-xs text-[var(--color-text-secondary)]">The update will be automatically applied next time the application is launched.</p>
                    </div>
                  </div>
                )}
                {updateState.status === "failed" && (
                  <div className="border border-[var(--color-danger)]/25 bg-[var(--color-danger-soft)] p-4 rounded space-y-2 select-text">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-danger)]">
                      <WarningCircle size={16} />
                      <span>Update action failed</span>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-secondary)] font-mono leading-relaxed bg-[var(--color-bg-input)] p-2 rounded border border-[var(--color-border-default)]">
                      {updateState.error || "An unknown error occurred during update operations."}
                    </p>
                  </div>
                )}
              </div>

              {updateState.status !== "checking" && updateState.status !== "downloading" && updateState.status !== "readyToInstall" && (
                <button
                  onClick={handleCheckUpdates}
                  className="py-2 px-4 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-bold text-xs uppercase font-mono tracking-wider transition-colors cursor-pointer select-none rounded"
                >
                  Check for Updates
                </button>
              )}
            </div>

            <div className="p-4 border border-[var(--color-border-default)] rounded bg-[var(--color-bg-panel)]/20 space-y-2">
              <h4 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase font-mono tracking-wider">Updates Settings</h4>
              <div className="flex items-center justify-between text-xs py-1 select-none opacity-50 cursor-not-allowed">
                <div>
                  <p className="font-semibold text-[var(--color-text-primary)]">Automatically Check for Updates</p>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Periodically verify update availability in the background</p>
                </div>
                <div className="w-8 h-4 rounded-full bg-[var(--color-accent-primary)] relative p-0.5 transition-colors">
                  <div className="w-3 h-3 rounded-full bg-[var(--color-bg-panel)] absolute right-0.5 top-0.5 transition-transform" />
                </div>
              </div>
            </div>
          </div>
        )}

        {subTab === "reset" && (
          <div className="space-y-6 max-w-2xl">
            <div className="p-4 border border-[var(--color-danger)]/30 rounded bg-[var(--color-danger-soft)] space-y-4">
              <div className="border-b border-[var(--color-danger)]/20 pb-4">
                <h3 className="text-sm font-bold text-[var(--color-danger)] font-mono uppercase flex items-center gap-2">
                  <WarningCircle size={16} />
                  DANGER ZONE: RESET CONFIGURATIONS & DATABASE
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
                  Resetting CanIReach will completely clean all settings, databases, profiles, custom targets, and monitoring histories.
                </p>
              </div>

              <div className="space-y-2 py-1 select-none">
                <p className="text-xs text-[var(--color-text-primary)] font-semibold">This action cannot be undone. The following will be permanently deleted:</p>
                <ul className="list-disc list-inside text-xs text-[var(--color-text-secondary)] space-y-1 font-mono pl-2">
                  <li>Custom Target Configurations (targets.json)</li>
                  <li>SQLite Probing History Database (history.db)</li>
                  <li>Custom Network Profiles and DNS Servers</li>
                  <li>Local Engine Performance Configurations (settings.json)</li>
                </ul>
              </div>

              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <p className="text-xs text-[var(--color-text-primary)]">
                    Type <code className="font-bold font-mono px-1 rounded bg-[var(--color-bg-input)] text-[var(--color-danger)] font-semibold">RESET CANIREACH</code> below to verify:
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="RESET CANIREACH"
                    className="w-full bg-[var(--color-bg-input)] border border-[var(--color-danger)]/30 rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] font-mono focus:outline-none focus:border-[var(--color-danger)]"
                  />
                </div>

                <button
                  onClick={handleResetApp}
                  disabled={confirmText !== "RESET CANIREACH" || resetting}
                  className={`w-full py-2 border font-bold text-xs uppercase font-mono tracking-wider transition-colors cursor-pointer select-none rounded flex items-center justify-center gap-2 ${
                    confirmText === "RESET CANIREACH" && !resetting
                      ? "bg-[var(--color-danger)] text-black border-[var(--color-danger)] hover:bg-red-400 active:scale-[0.99]"
                      : "bg-[var(--color-bg-input)] border-[var(--color-border-default)] text-[var(--color-text-disabled)] cursor-not-allowed"
                  }`}
                >
                  <Trash size={13} />
                  {resetting ? "Resetting application..." : "Reset CanIReach & Restart"}
                </button>
              </div>
            </div>
          </div>
        )}

        {subTab === "monitoring" && (
          <div className="space-y-4 max-w-2xl">
            <section className="space-y-4">
              <h3 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider font-mono border-b border-[var(--color-border-subtle)] pb-2">
                Continuous Monitor Defaults
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/40 space-y-1.5">
                  <label className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">Default Interval (seconds)</label>
                  <input
                    type="number"
                    min="5"
                    value={30}
                    readOnly
                    className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] font-mono w-full opacity-60"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] font-mono">Minimum 5 seconds. Configure per-target in the test dialog.</p>
                </div>
                <div className="p-3.5 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]/40 space-y-1.5">
                  <label className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase font-mono">Minimum Allowed Interval</label>
                  <input
                    type="number"
                    min="1"
                    value={5}
                    readOnly
                    className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs text-[var(--color-text-primary)] font-mono w-full opacity-60"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] font-mono">Hard minimum enforced by the backend scheduler.</p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider font-mono border-b border-[var(--color-border-subtle)] pb-2">
                Observation Scope
              </h3>
              <div className="p-3.5 rounded border border-[var(--color-info)]/20 bg-[var(--color-info-soft)] text-xs text-[var(--color-text-secondary)] space-y-1.5">
                <p className="font-bold text-[var(--color-info)] uppercase font-mono text-[10px]">Current Capabilities</p>
                <ul className="list-disc list-inside space-y-1 leading-relaxed">
                  <li>CanIReach records failures from its own diagnostic probes</li>
                  <li>Each failure identifies its source and visibility level</li>
                  <li>HTTPS paths and headers are not captured without explicit proxy mode</li>
                  <li>System-wide passive monitoring is not available in this version</li>
                </ul>
              </div>
            </section>
          </div>
        )}
      </div>

    </div>
  );
};
