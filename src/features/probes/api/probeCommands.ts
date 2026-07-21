import { invoke } from "@tauri-apps/api/core";
import { Target, ProbeResult, FrontendSettings, TargetGroup, NetworkProfile, PerformanceRun, PrivacyAssessment, PrivacyExpectationPolicy } from "../types";

// Target CRUD
export const getTargets = async (): Promise<Target[]> => {
  return invoke<Target[]>("get_targets");
};

export const createTarget = async (target: Target): Promise<Target[]> => {
  return invoke<Target[]>("create_target", { target });
};

export const updateTarget = async (target: Target): Promise<Target[]> => {
  return invoke<Target[]>("update_target", { target });
};

export const deleteTarget = async (id: string): Promise<Target[]> => {
  return invoke<Target[]>("delete_target", { id });
};

export const duplicateTarget = async (id: string): Promise<Target[]> => {
  return invoke<Target[]>("duplicate_target", { id });
};

export const setTargetEnabled = async (id: string, enabled: boolean): Promise<Target[]> => {
  return invoke<Target[]>("set_target_enabled", { id, enabled });
};

export const toggleTargetPin = async (id: string): Promise<Target[]> => {
  return invoke<Target[]>("toggle_target_pin", { id });
};

export const reorderTargets = async (orderedIds: string[]): Promise<Target[]> => {
  return invoke<Target[]>("reorder_targets", { orderedIds });
};

// Target Groups CRUD
export const getTargetGroups = async (): Promise<TargetGroup[]> => {
  return invoke<TargetGroup[]>("get_target_groups");
};

export const createTargetGroup = async (group: TargetGroup): Promise<TargetGroup[]> => {
  return invoke<TargetGroup[]>("create_target_group", { group });
};

export const updateTargetGroup = async (group: TargetGroup): Promise<TargetGroup[]> => {
  return invoke<TargetGroup[]>("update_target_group", { group });
};

export const deleteTargetGroup = async (id: string): Promise<TargetGroup[]> => {
  return invoke<TargetGroup[]>("delete_target_group", { id });
};

// Network Profiles CRUD
export const getNetworkProfiles = async (): Promise<NetworkProfile[]> => {
  return invoke<NetworkProfile[]>("get_network_profiles");
};

export const createNetworkProfile = async (profile: NetworkProfile): Promise<NetworkProfile[]> => {
  return invoke<NetworkProfile[]>("create_network_profile", { profile });
};

export const updateNetworkProfile = async (profile: NetworkProfile): Promise<NetworkProfile[]> => {
  return invoke<NetworkProfile[]>("update_network_profile", { profile });
};

export const deleteNetworkProfile = async (id: string): Promise<NetworkProfile[]> => {
  return invoke<NetworkProfile[]>("delete_network_profile", { id });
};

export const setDefaultNetworkProfile = async (id: string): Promise<NetworkProfile[]> => {
  return invoke<NetworkProfile[]>("set_default_network_profile", { id });
};

// Engine and Settings
export const probeAll = async (): Promise<ProbeResult[]> => {
  return invoke<ProbeResult[]>("probe_all");
};

export const probeByCategory = async (category: string): Promise<ProbeResult[]> => {
  return invoke<ProbeResult[]>("probe_by_category", { category });
};

export const probeOne = async (targetId: string): Promise<ProbeResult> => {
  return invoke<ProbeResult>("probe_one", { targetId });
};

export const cancelProbe = async (targetId: string): Promise<void> => {
  return invoke<void>("cancel_probe", { targetId });
};

export const cancelAllProbes = async (): Promise<void> => {
  return invoke<void>("cancel_all_probes");
};

export const getSettings = async (): Promise<FrontendSettings> => {
  return invoke<FrontendSettings>("get_settings");
};

export const saveSettings = async (settings: FrontendSettings): Promise<void> => {
  return invoke<void>("save_settings", { settings });
};

// Schedules CRUD
export const listMonitoringSchedules = async (): Promise<any[]> => {
  return invoke<any[]>("list_monitoring_schedules");
};

export const createMonitoringSchedule = async (schedule: any): Promise<any[]> => {
  return invoke<any[]>("create_monitoring_schedule", { schedule });
};

export const updateMonitoringSchedule = async (schedule: any): Promise<any[]> => {
  return invoke<any[]>("update_monitoring_schedule", { schedule });
};

export const deleteMonitoringSchedule = async (id: string): Promise<any[]> => {
  return invoke<any[]>("delete_monitoring_schedule", { id });
};

export const duplicateMonitoringSchedule = async (id: string): Promise<any[]> => {
  return invoke<any[]>("duplicate_monitoring_schedule", { id });
};

export const setMonitoringScheduleEnabled = async (id: string, enabled: boolean): Promise<any[]> => {
  return invoke<any[]>("set_monitoring_schedule_enabled", { id, enabled });
};

export const runScheduleNow = async (id: string): Promise<void> => {
  return invoke<void>("run_schedule_now", { id });
};

export const pauseScheduledMonitoring = async (): Promise<void> => {
  return invoke<void>("pause_scheduled_monitoring");
};

export const resumeScheduledMonitoring = async (): Promise<void> => {
  return invoke<void>("resume_scheduled_monitoring");
};

export const getSchedulerStatus = async (): Promise<{ paused: boolean }> => {
  return invoke<{ paused: boolean }>("get_scheduler_status");
};

// History & Incidents
export const queryMonitoringHistory = async (targetId?: string, limit?: number, offset?: number): Promise<any[]> => {
  return invoke<any[]>("query_monitoring_history", { targetId, limit, offset });
};

export const getHistorySummary = async (): Promise<any> => {
  return invoke<any>("get_history_summary");
};

export const deleteMonitoringHistory = async (): Promise<void> => {
  return invoke<void>("delete_monitoring_history");
};

export const listIncidents = async (status?: string): Promise<any[]> => {
  return invoke<any[]>("list_incidents", { status });
};

export const acknowledgeIncident = async (id: string): Promise<void> => {
  return invoke<void>("acknowledge_incident", { id });
};

// Performance Commands
export const startPerformanceRun = async (
  profileId: string,
  latencyUrl: string | null,
  downloadUrl: string | null,
  uploadUrl: string | null,
  testTypes: string[]
): Promise<PerformanceRun> => {
  return invoke<PerformanceRun>("start_performance_run", {
    profileId,
    latencyUrl,
    downloadUrl,
    uploadUrl,
    testTypes,
  });
};

export const queryPerformanceHistory = async (): Promise<PerformanceRun[]> => {
  return invoke<PerformanceRun[]>("query_performance_history");
};

export const getDailyDataBudget = async (dateStr: string): Promise<[number, number]> => {
  return invoke<[number, number]>("get_daily_data_budget", { dateStr });
};

// Privacy Commands
export const startPrivacyAssessment = async (
  profileId: string,
  expectationsJson: string,
  webrtcCandidates: string[]
): Promise<PrivacyAssessment> => {
  return invoke<PrivacyAssessment>("start_privacy_assessment", {
    profileId,
    expectationsJson,
    webrtcCandidates,
  });
};

export const queryPrivacyAssessments = async (): Promise<PrivacyAssessment[]> => {
  return invoke<PrivacyAssessment[]>("query_privacy_assessments");
};

export const getPrivacyExpectation = async (profileId: string): Promise<PrivacyExpectationPolicy | null> => {
  return invoke<PrivacyExpectationPolicy | null>("get_privacy_expectation", { profileId });
};

export const savePrivacyExpectation = async (policyJson: string): Promise<void> => {
  return invoke<void>("save_privacy_expectation", { policyJson });
};

export const recordWebrtcCandidate = async (sessionId: string, candidate: string): Promise<void> => {
  return invoke<void>("record_webrtc_candidate", { sessionId, candidate });
};

// Failed Requests Enhanced API
import { FailedRequestRecord, FailedRequestFilters } from "../../failed-requests/types";

export const queryFailedRequests = async (
  limit?: number,
  offset?: number,
  filters?: FailedRequestFilters
): Promise<FailedRequestRecord[]> => {
  return invoke<FailedRequestRecord[]>("query_failed_requests", {
    limit: limit ?? 50,
    offset: offset ?? 0,
    sourceType: filters?.source_type,
    host: filters?.host,
    failureCategory: filters?.failure_category,
    severity: filters?.severity,
  });
};

export const getDomainSuggestions = async (host: string): Promise<string[]> => {
  return invoke<string[]>("get_domain_suggestions", { host });
};

export const addDomainToTargets = async (
  host: string,
  name?: string,
  category?: string
): Promise<any[]> => {
  return invoke<any[]>("add_domain_to_targets", { host, name, category });
};

// Clear failed requests
export const clearNetworkOperations = async (): Promise<number> => {
  return invoke<number>("clear_network_operations");
};

