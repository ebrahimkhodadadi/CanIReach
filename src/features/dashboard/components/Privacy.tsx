import React, { useState, useEffect, useMemo } from "react";
import { 
  ShieldCheck, 
  Play, 
  Gear, 
  WarningCircle, 
  Check, 
  Info,
  Clock,
  Export,
  Notebook,
  MagnifyingGlass
} from "@phosphor-icons/react";
import { 
  getNetworkProfiles, 
  getPrivacyExpectation, 
  savePrivacyExpectation, 
  startPrivacyAssessment, 
  queryPrivacyAssessments 
} from "../../../features/probes/api/probeCommands";
import { PrivacyAssessment, PrivacyExpectationPolicy, PrivacyFinding, NetworkProfile } from "../../../features/probes/types";
import { matchesTableSearch, paginateItems, PaginationControls } from "../../../components/shared/Primitives";

export const Privacy: React.FC = () => {
  const [profiles, setProfiles] = useState<NetworkProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("system-default");
  
  // Expectation States
  const [policyId, setPolicyId] = useState("");
  const [expectedRouting, setExpectedRouting] = useState("system_behavior");
  const [dnsExpectation, setDnsExpectation] = useState("system_allowed");
  const [ipv6Policy, setIpv6Policy] = useState("allowed");
  const [webrtcExpectation, setWebrtcExpectation] = useState("not_evaluated");
  
  const [assessments, setAssessments] = useState<PrivacyAssessment[]>([]);
  const [activeAssessment, setActiveAssessment] = useState<PrivacyAssessment | null>(null);
  const [findings, setFindings] = useState<PrivacyFinding[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadPolicyForProfile(selectedProfileId);
  }, [selectedProfileId]);

  useEffect(() => {
    setPage(1);
  }, [selectedProfileId]);

  const loadInitialData = async () => {
    try {
      const profileList = await getNetworkProfiles();
      setProfiles(profileList);

      const list = await queryPrivacyAssessments();
      setAssessments(list);
    } catch (e) {
      console.error(e);
      setError("Failed to initialize privacy module");
    }
  };

  const loadPolicyForProfile = async (profileId: string) => {
    try {
      const policy = await getPrivacyExpectation(profileId);
      if (policy) {
        setPolicyId(policy.id);
        setExpectedRouting(policy.expected_routing);
        setDnsExpectation(policy.dns_expectation);
        setIpv6Policy(policy.ipv6_policy);
        setWebrtcExpectation(policy.webrtc_expectation);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSavePolicy = async () => {
    setSavingPolicy(true);
    setError(null);
    try {
      const payload: PrivacyExpectationPolicy = {
        schema_version: 1,
        id: policyId || Math.random().toString(36).substring(7),
        profile_id: selectedProfileId,
        expected_routing: expectedRouting,
        dns_expectation: dnsExpectation,
        ipv6_policy: ipv6Policy,
        webrtc_expectation: webrtcExpectation
      };

      await savePrivacyExpectation(JSON.stringify(payload));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e: any) {
      setError(e.message || "Failed to save expectation policy");
    } finally {
      setSavingPolicy(false);
    }
  };

  // Helper to gather local/reflexive ICE candidates in the WebView
  const gatherIceCandidates = (): Promise<string[]> => {
    return new Promise((resolve) => {
      const candidates: string[] = [];
      try {
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" }
          ]
        });

        pc.createDataChannel("canireach-stun-check");
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            candidates.push(event.candidate.candidate);
          }
        };

        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer))
          .catch(() => {});

        // Wait 2 seconds max for candidates
        setTimeout(() => {
          pc.close();
          resolve(candidates);
        }, 2000);
      } catch (e) {
        resolve([]);
      }
    });
  };

  const runPrivacyDiagnostics = async () => {
    setLoading(true);
    setError(null);
    setFindings([]);
    setActiveAssessment(null);
    
    try {
      // Step 1: WebRTC ICE candidate gathering
      setActiveStage("Gathering WebRTC Candidates...");
      const candidates = await gatherIceCandidates();

      // Step 2: Post expectation policy & run Rust tests
      setActiveStage("Running Egress, DNS Path, and Posture checks...");
      
      const payloadPolicy: PrivacyExpectationPolicy = {
        schema_version: 1,
        id: policyId || Math.random().toString(36).substring(7),
        profile_id: selectedProfileId,
        expected_routing: expectedRouting,
        dns_expectation: dnsExpectation,
        ipv6_policy: ipv6Policy,
        webrtc_expectation: webrtcExpectation
      };

      const result = await startPrivacyAssessment(
        selectedProfileId,
        JSON.stringify(payloadPolicy),
        candidates
      );

      setActiveAssessment(result);
      if (result.findings_json) {
        const parsed: PrivacyFinding[] = JSON.parse(result.findings_json);
        setFindings(parsed);
      }

      // Reload assessments list
      const list = await queryPrivacyAssessments();
      setAssessments(list);
    } catch (e: any) {
      setError(e.message || "Failed to execute privacy diagnostics run");
    } finally {
      setLoading(false);
      setActiveStage(null);
    }
  };

  // Export Sanitized Markdown Report
  const filteredAssessments = useMemo(() => {
    return assessments.filter((assessment) => {
      const searchableText = [assessment.profile_id, assessment.overall_verdict, assessment.status].join(" ");
      return matchesTableSearch(searchableText, searchQuery);
    });
  }, [assessments, searchQuery]);

  const pagedAssessments = paginateItems(filteredAssessments, pageSize, page);

  const exportSanitizedReport = () => {
    if (!activeAssessment) return;

    let md = `# CanIReach Privacy Diagnostics Report\n\n`;
    md += `- **Profile:** ${activeAssessment.profile_id}\n`;
    md += `- **Date/Time:** ${new Date(activeAssessment.started_at).toLocaleString()}\n`;
    md += `- **Verdict:** ${activeAssessment.overall_verdict ?? "All Tests Passed"}\n\n`;
    md += `## Expected Policies\n\n`;
    md += `- **Routing Path:** ${expectedRouting}\n`;
    md += `- **DNS Resolution:** ${dnsExpectation}\n`;
    md += `- **IPv6 Strategy:** ${ipv6Policy}\n`;
    md += `- **WebRTC Policy:** ${webrtcExpectation}\n\n`;
    md += `## Diagnostic Findings\n\n`;

    if (findings.length === 0) {
      md += `*No policy violations or path differences detected.*\n`;
    } else {
      findings.forEach((f, i) => {
        md += `### ${i+1}. [${f.category.toUpperCase()}] ${f.status.replace("_", " ")}\n`;
        md += `- **Severity:** ${f.severity}\n`;
        md += `- **Expected:** ${f.expected_behavior}\n`;
        md += `- **Observed:** ${f.observed_behavior}\n`;
        md += `- **Confidence:** ${f.confidence}\n\n`;
      });
    }

    md += `\n*Note: WebRTC WebView tests only represent CanIReach's WebView runtime environment, not system-wide applications.*\n`;

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canireach_privacy_report_${activeAssessment.id.slice(0, 8)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getVerdictStyles = (verdict: string) => {
    if (verdict.includes("Violations")) return "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]";
    if (verdict.includes("Differences")) return "border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning)]";
    return "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]";
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 space-y-4 bg-[var(--color-bg-app)]">
      
      {/* Header Description */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-default)] pb-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono flex items-center gap-2 select-none">
            <ShieldCheck size={16} className="text-[var(--color-accent-primary)]" />
            Privacy & Leak Posture Diagnostics
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 mt-0.5">
            Audit network paths against privacy expectation policies to detect DNS, SOCKS5H, and IPv6 leaks.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded p-3 flex items-start gap-3 text-[var(--color-danger)] text-xs">
          <WarningCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Settings Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Policy Editor Panel */}
        <div className="lg:col-span-2 border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] rounded p-4 space-y-4">
          <h3 className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2 uppercase font-mono tracking-wider">
            <Gear size={13} className="text-[var(--color-accent-primary)]" />
            Expectation Routing Policy
          </h3>

          <div className="space-y-1.5 w-full max-w-xs pb-1 select-none">
            <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Profile Context</label>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 select-none">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Expected Routing Path</label>
              <select 
                value={expectedRouting} 
                onChange={(e) => setExpectedRouting(e.target.value)}
                className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] transition-colors cursor-pointer"
              >
                <option value="system_behavior">System Behavior / Direct allowed</option>
                <option value="proxy_required">All target traffic must use proxy</option>
                <option value="direct_only">Bypass proxy / Direct routing expected</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Expected DNS Path</label>
              <select 
                value={dnsExpectation}
                onChange={(e) => setDnsExpectation(e.target.value)}
                className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] transition-colors cursor-pointer"
              >
                <option value="system_allowed">System allowed / Local DNS</option>
                <option value="proxy_remote_resolution_required">Remote resolution on proxy required (SOCKS5H)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 select-none">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Expected IPv6 Behavior</label>
              <select 
                value={ipv6Policy}
                onChange={(e) => setIpv6Policy(e.target.value)}
                className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] transition-colors cursor-pointer"
              >
                <option value="allowed">Allowed / Dual-stack egress</option>
                <option value="must_use_proxy">IPv6 must go through proxy</option>
                <option value="forbidden">Disable / Block direct IPv6 fallback</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase font-mono">Expected WebRTC Exposure</label>
              <select 
                value={webrtcExpectation}
                onChange={(e) => setWebrtcExpectation(e.target.value)}
                className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] transition-colors cursor-pointer"
              >
                <option value="not_evaluated">Not Evaluated</option>
                <option value="public_candidates_forbidden">Block Public ICE Candidates / Relay Only</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSavePolicy}
              disabled={savingPolicy}
              className="px-3 py-1.5 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-bold text-xs uppercase font-mono tracking-wider transition-all cursor-pointer"
            >
              {savingPolicy ? "Saving..." : "Save expectation"}
            </button>
            {saveSuccess && (
              <span className="text-[var(--color-success)] text-xs flex items-center gap-1 font-semibold animate-fade-in">
                <Check size={14} /> Expectations Saved
              </span>
            )}
          </div>
        </div>

        {/* Action Panel */}
        <div className="border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] rounded p-4 flex flex-col justify-between select-none">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2 uppercase font-mono tracking-wider">
              <ShieldCheck size={13} className="text-[var(--color-accent-primary)]" />
              Diagnostics Action
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Execute path diagnostics mapping public egress IP, remote DNS leak parameters, dual-stack fallback anomalies, and WebRTC STUN leaks in the local WebView client.
            </p>
          </div>

          <div className="space-y-2 mt-4">
            {activeStage && (
              <div className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] p-3 rounded text-[var(--color-text-primary)] text-xs font-mono text-center flex flex-col items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-[var(--color-accent-primary)] border-t-transparent rounded-full animate-spin" />
                <span>{activeStage}</span>
              </div>
            )}

            <button
              onClick={runPrivacyDiagnostics}
              disabled={loading}
              className="w-full py-2 bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-panel-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] disabled:opacity-50 text-[var(--color-text-primary)] font-bold text-xs uppercase tracking-wider font-mono transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play size={13} weight="fill" className="text-[var(--color-accent-primary-hover)]" />
              {loading ? "Diagnosing Paths..." : "Run Posture Diagnostics"}
            </button>
          </div>
        </div>

      </div>

      {/* Active Run Findings */}
      {activeAssessment && (
        <div className="border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] rounded p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2">
            <h3 className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-2 uppercase font-mono tracking-wider">
              <Notebook size={13} className="text-[var(--color-accent-primary)]" />
              Diagnostics Summary: {activeAssessment.id.slice(0, 8)}
            </h3>
            <button
              onClick={exportSanitizedReport}
              className="flex items-center gap-1.5 text-[11px] text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary-hover)] font-bold font-mono cursor-pointer"
            >
              <Export size={13} /> Export Report (Sanitized)
            </button>
          </div>

          {/* Verdict Card */}
          <div className={`p-3 rounded border font-semibold flex items-center justify-between select-none ${getVerdictStyles(activeAssessment.overall_verdict ?? "")}`}>
            <div>
              <p className="text-[9px] opacity-70 uppercase tracking-wider font-mono">Overall Verdict</p>
              <p className="text-sm font-bold mt-0.5 uppercase tracking-wide font-mono">{activeAssessment.overall_verdict ?? "All Tests Passed"}</p>
            </div>
            <div className="text-[9px] font-mono opacity-80 text-right leading-relaxed">
              Profile: {activeAssessment.profile_id} <br />
              Audit Time: {new Date(activeAssessment.started_at).toLocaleTimeString()}
            </div>
          </div>

          {/* Details Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border-default)] text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wider font-bold select-none">
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Expected Policy</th>
                  <th className="py-2.5 px-3">Observed Path</th>
                  <th className="py-2.5 px-3">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)] text-xs text-[var(--color-text-primary)]">
                {findings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[var(--color-text-muted)] font-mono">
                      No leaks or anomalies observed. Egress path matches expectation.
                    </td>
                  </tr>
                ) : (
                  findings.map((f) => (
                    <tr key={f.id} className="hover:bg-[var(--color-bg-panel-hover)]">
                      <td className="py-3 px-3 font-semibold text-[var(--color-text-primary)] font-mono">{f.category.toUpperCase()}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase font-mono ${
                          f.status === "policy_violation" 
                            ? "text-[var(--color-danger)] bg-[var(--color-danger-soft)] border-[var(--color-danger)]/15" 
                            : "text-[var(--color-warning)] bg-[var(--color-warning-soft)] border-[var(--color-warning)]/15"
                        }`}>
                          {f.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-bold uppercase font-mono ${
                          f.severity === "critical" ? "text-[var(--color-danger)]" : f.severity === "warning" ? "text-[var(--color-warning)]" : "text-[var(--color-info)]"
                        }`}>{f.severity}</span>
                      </td>
                      <td className="py-3 px-3 text-[var(--color-text-secondary)] font-mono">{f.expected_behavior}</td>
                      <td className="py-3 px-3 text-[var(--color-text-primary)] font-mono font-semibold">{f.observed_behavior}</td>
                      <td className="py-3 px-3 text-[var(--color-text-secondary)] font-mono flex items-center gap-1.5">
                        {f.confidence.toUpperCase()}
                        <span className="text-[9px] text-[var(--color-text-muted)] font-normal">(RTT/ASN match)</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-start gap-2.5 text-[10px] text-[var(--color-text-muted)] border-t border-[var(--color-border-subtle)] pt-3 select-none leading-relaxed">
            <Info size={14} className="shrink-0 text-[var(--color-warning)] mt-0.5" />
            <span>Note: WebRTC candidates gathered represent the Tauri WebView environment context only. Actual installed desktop browser behaviour (Chrome/Firefox) may vary depending on extensions and system configurations.</span>
          </div>
        </div>
      )}

      {/* Historical Privacy assessments */}
      <div className="border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] rounded p-4 space-y-4">
        <h3 className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2 uppercase font-mono tracking-wider select-none">
          <Clock size={13} className="text-[var(--color-text-secondary)]" />
          Historical Privacy Assessments
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-input)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)]">
            <MagnifyingGlass size={13} className="text-[var(--color-accent-primary)]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search assessment"
              className="w-36 bg-transparent outline-none text-[var(--color-text-primary)]"
            />
          </label>
        </div>

        <div className="overflow-x-auto max-h-[40vh]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--color-border-default)] text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wider font-bold select-none">
                <th className="py-2.5 px-3">Run ID</th>
                <th className="py-2.5 px-3">Profile</th>
                <th className="py-2.5 px-3">Assessment Date</th>
                <th className="py-2.5 px-3">Verdict</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)] text-xs text-[var(--color-text-primary)]">
              {pagedAssessments.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[var(--color-text-muted)]">
                    No privacy assessments executed.
                  </td>
                </tr>
              ) : (
                pagedAssessments.items.map((a) => (
                  <tr key={a.id} className="hover:bg-[var(--color-bg-panel-hover)]">
                    <td className="py-3 px-3 text-[var(--color-accent-primary-hover)] font-mono">{a.id.slice(0, 8)}</td>
                    <td className="py-3 px-3 text-[var(--color-text-primary)] font-semibold">{a.profile_id}</td>
                    <td className="py-3 px-3 text-[var(--color-text-secondary)] font-mono">{new Date(a.started_at).toLocaleString()}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getVerdictStyles(a.overall_verdict ?? "")}`}>
                        {a.overall_verdict ?? "All Tests Passed"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[var(--color-text-secondary)] font-mono capitalize">{a.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          currentPage={pagedAssessments.currentPage}
          totalPages={pagedAssessments.totalPages}
          totalItems={pagedAssessments.totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>

    </div>
  );
};

export default Privacy;
