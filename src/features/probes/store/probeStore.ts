import { create } from "zustand";
import { Target, ProbeResult, LogStep, TargetGroup, NetworkProfile } from "../types";
import {
  getTargets,
  createTarget,
  updateTarget,
  deleteTarget,
  duplicateTarget,
  setTargetEnabled,
  getTargetGroups,
  createTargetGroup,
  updateTargetGroup,
  deleteTargetGroup,
  getNetworkProfiles,
  createNetworkProfile,
  updateNetworkProfile,
  deleteNetworkProfile,
  setDefaultNetworkProfile,
  probeAll,
  probeOne,
} from "../api/probeCommands";

export interface GlobalLogStep extends LogStep {
  target_name: string;
}

interface ProbeState {
  targets: Target[];
  probeResults: Record<string, ProbeResult>;
  globalLogs: GlobalLogStep[];
  isProbingAll: boolean;
  probingTargets: Record<string, boolean>;
  selectedTargetId: string | null;
  showGlobalLogs: boolean;

  // Groups and Profiles
  groups: TargetGroup[];
  profiles: NetworkProfile[];
  activeProfileId: string | null;

  fetchTargets: () => Promise<void>;
  runProbeAll: () => Promise<void>;
  runProbeOne: (targetId: string) => Promise<void>;
  handleProbeUpdate: (result: ProbeResult) => void;
  setSelectedTargetId: (id: string | null) => void;
  setShowGlobalLogs: (show: boolean) => void;
  clearLogs: () => void;
  appendGlobalLogs: (steps: GlobalLogStep[]) => void;

  // CRUD actions
  addTarget: (target: Target) => Promise<void>;
  editTarget: (target: Target) => Promise<void>;
  deleteTarget: (id: string) => Promise<void>;
  duplicateTarget: (id: string) => Promise<void>;
  toggleTargetEnabled: (id: string, enabled: boolean) => Promise<void>;

  fetchGroups: () => Promise<void>;
  addGroup: (group: TargetGroup) => Promise<void>;
  editGroup: (group: TargetGroup) => Promise<void>;
  removeGroup: (id: string) => Promise<void>;

  fetchProfiles: () => Promise<void>;
  addProfile: (profile: NetworkProfile) => Promise<void>;
  editProfile: (profile: NetworkProfile) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  setDefaultProfile: (id: string) => Promise<void>;
}

export const useProbeStore = create<ProbeState>((set, get) => ({
  targets: [],
  probeResults: {},
  globalLogs: [],
  isProbingAll: false,
  probingTargets: {},
  selectedTargetId: null,
  showGlobalLogs: false,

  groups: [],
  profiles: [],
  activeProfileId: null,

  fetchTargets: async () => {
    try {
      const targets = await getTargets();
      set({ targets });
    } catch (err) {
      console.error("Store failed to fetch targets:", err);
    }
  },

  runProbeAll: async () => {
    const { targets } = get();
    // Only probe targets that are enabled
    const enabledTargets = targets.filter(t => t.enabled);
    if (enabledTargets.length === 0) return;

    const probingState = enabledTargets.reduce((acc, t) => {
      acc[t.id] = true;
      return acc;
    }, {} as Record<string, boolean>);

    set({
      isProbingAll: true,
      probingTargets: probingState,
    });

    try {
      await probeAll();
    } catch (err) {
      console.error("Store failed to probe all:", err);
    } finally {
      set({ isProbingAll: false });
    }
  },

  runProbeOne: async (targetId) => {
    set((state) => ({
      probingTargets: {
        ...state.probingTargets,
        [targetId]: true,
      },
    }));

    try {
      await probeOne(targetId);
    } catch (err) {
      console.error(`Store failed to probe target ${targetId}:`, err);
      set((state) => ({
        probingTargets: {
          ...state.probingTargets,
          [targetId]: false,
        },
      }));
    }
  },

  handleProbeUpdate: (result) => {
    const { targets } = get();
    const target = targets.find((t) => t.id === result.target_id);
    const targetName = target ? target.name : result.target_id;

    const newGlobalSteps: GlobalLogStep[] = result.log.steps.map((step) => ({
      ...step,
      target_name: targetName,
    }));

    set((state) => {
      const updatedGlobalLogs = [...state.globalLogs, ...newGlobalSteps].slice(-500);

      return {
        probeResults: {
          ...state.probeResults,
          [result.target_id]: result,
        },
        probingTargets: {
          ...state.probingTargets,
          [result.target_id]: false,
        },
        globalLogs: updatedGlobalLogs,
      };
    });
  },

  setSelectedTargetId: (selectedTargetId) => set({ selectedTargetId }),
  setShowGlobalLogs: (showGlobalLogs) => set({ showGlobalLogs }),
  clearLogs: () => set({ globalLogs: [] }),
  appendGlobalLogs: (steps) => set((state) => ({ globalLogs: [...state.globalLogs, ...steps].slice(-500) })),

  // Target CRUD implementations
  addTarget: async (target) => {
    try {
      const targets = await createTarget(target);
      set({ targets });
    } catch (err) {
      console.error("Failed to create target:", err);
      throw err;
    }
  },

  editTarget: async (target) => {
    try {
      const targets = await updateTarget(target);
      set({ targets });
    } catch (err) {
      console.error("Failed to update target:", err);
      throw err;
    }
  },

  deleteTarget: async (id) => {
    try {
      const targets = await deleteTarget(id);
      set((state) => {
        const newResults = { ...state.probeResults };
        delete newResults[id];
        return { targets, probeResults: newResults };
      });
    } catch (err) {
      console.error("Failed to delete target:", err);
      throw err;
    }
  },

  duplicateTarget: async (id) => {
    try {
      const targets = await duplicateTarget(id);
      set({ targets });
    } catch (err) {
      console.error("Failed to duplicate target:", err);
      throw err;
    }
  },

  toggleTargetEnabled: async (id, enabled) => {
    try {
      const targets = await setTargetEnabled(id, enabled);
      set({ targets });
    } catch (err) {
      console.error("Failed to toggle target enabled status:", err);
      throw err;
    }
  },

  // Groups CRUD implementations
  fetchGroups: async () => {
    try {
      const groups = await getTargetGroups();
      set({ groups });
    } catch (err) {
      console.error("Failed to fetch groups:", err);
    }
  },

  addGroup: async (group) => {
    try {
      const groups = await createTargetGroup(group);
      set({ groups });
    } catch (err) {
      console.error("Failed to add group:", err);
      throw err;
    }
  },

  editGroup: async (group) => {
    try {
      const groups = await updateTargetGroup(group);
      set({ groups });
    } catch (err) {
      console.error("Failed to edit group:", err);
      throw err;
    }
  },

  removeGroup: async (id) => {
    try {
      const groups = await deleteTargetGroup(id);
      set({ groups });
      // Reload targets because target-to-group assignments change
      const targets = await getTargets();
      set({ targets });
    } catch (err) {
      console.error("Failed to remove group:", err);
      throw err;
    }
  },

  // Profiles CRUD implementations
  fetchProfiles: async () => {
    try {
      const profiles = await getNetworkProfiles();
      const defaultProfile = profiles.find(p => p.is_default);
      set({
        profiles,
        activeProfileId: defaultProfile ? defaultProfile.id : (profiles[0]?.id || null)
      });
    } catch (err) {
      console.error("Failed to fetch profiles:", err);
    }
  },

  addProfile: async (profile) => {
    try {
      const profiles = await createNetworkProfile(profile);
      set({ profiles });
    } catch (err) {
      console.error("Failed to add profile:", err);
      throw err;
    }
  },

  editProfile: async (profile) => {
    try {
      const profiles = await updateNetworkProfile(profile);
      set({ profiles });
    } catch (err) {
      console.error("Failed to edit profile:", err);
      throw err;
    }
  },

  removeProfile: async (id) => {
    try {
      const profiles = await deleteNetworkProfile(id);
      set({ profiles });
      // Reload targets because target network_profile_id assignments change
      const targets = await getTargets();
      set({ targets });
    } catch (err) {
      console.error("Failed to remove profile:", err);
      throw err;
    }
  },

  setDefaultProfile: async (id) => {
    try {
      const profiles = await setDefaultNetworkProfile(id);
      set({ profiles, activeProfileId: id });
    } catch (err) {
      console.error("Failed to set default profile:", err);
      throw err;
    }
  },
}));
