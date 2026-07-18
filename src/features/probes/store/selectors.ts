import { useProbeStore } from "./probeStore";

export const useTargets = () => useProbeStore((s) => s.targets);
export const useProbeResults = () => useProbeStore((s) => s.probeResults);
export const useGlobalLogs = () => useProbeStore((s) => s.globalLogs);
export const useIsProbingAll = () => useProbeStore((s) => s.isProbingAll);
export const useProbingTargets = () => useProbeStore((s) => s.probingTargets);
export const useProbeLoops = () => useProbeStore((s) => s.probeLoops);
export const useSelectedTargetId = () => useProbeStore((s) => s.selectedTargetId);
export const useShowGlobalLogs = () => useProbeStore((s) => s.showGlobalLogs);

export const useGroups = () => useProbeStore((s) => s.groups);
export const useProfiles = () => useProbeStore((s) => s.profiles);
export const useActiveProfileId = () => useProbeStore((s) => s.activeProfileId);

export const useProbeActions = () => {
  const fetchTargets = useProbeStore((s) => s.fetchTargets);
  const probeAll = useProbeStore((s) => s.runProbeAll);
  const probeOne = useProbeStore((s) => s.runProbeOne);
  const stopProbeAll = useProbeStore((s) => s.stopProbeAll);
  const startProbeLoop = useProbeStore((s) => s.startProbeLoop);
  const startProbeLoopUntilSuccess = useProbeStore((s) => s.startProbeLoopUntilSuccess);
  const stopProbeLoop = useProbeStore((s) => s.stopProbeLoop);
  const handleProbeUpdate = useProbeStore((s) => s.handleProbeUpdate);
  const handleProbeCancelled = useProbeStore((s) => s.handleProbeCancelled);
  const setSelectedTargetId = useProbeStore((s) => s.setSelectedTargetId);
  const setShowGlobalLogs = useProbeStore((s) => s.setShowGlobalLogs);
  const clearLogs = useProbeStore((s) => s.clearLogs);
  const appendGlobalLogs = useProbeStore((s) => s.appendGlobalLogs);

  // CRUD actions
  const addTarget = useProbeStore((s) => s.addTarget);
  const editTarget = useProbeStore((s) => s.editTarget);
  const deleteTarget = useProbeStore((s) => s.deleteTarget);
  const duplicateTarget = useProbeStore((s) => s.duplicateTarget);
  const toggleTargetEnabled = useProbeStore((s) => s.toggleTargetEnabled);

  const fetchGroups = useProbeStore((s) => s.fetchGroups);
  const addGroup = useProbeStore((s) => s.addGroup);
  const editGroup = useProbeStore((s) => s.editGroup);
  const removeGroup = useProbeStore((s) => s.removeGroup);

  const fetchProfiles = useProbeStore((s) => s.fetchProfiles);
  const addProfile = useProbeStore((s) => s.addProfile);
  const editProfile = useProbeStore((s) => s.editProfile);
  const removeProfile = useProbeStore((s) => s.removeProfile);
  const setDefaultProfile = useProbeStore((s) => s.setDefaultProfile);

  return {
    fetchTargets,
    probeAll,
    probeOne,
    stopProbeAll,
    startProbeLoop,
    startProbeLoopUntilSuccess,
    stopProbeLoop,
    handleProbeUpdate,
    handleProbeCancelled,
    setSelectedTargetId,
    setShowGlobalLogs,
    clearLogs,
    appendGlobalLogs,
    addTarget,
    editTarget,
    deleteTarget,
    duplicateTarget,
    toggleTargetEnabled,
    fetchGroups,
    addGroup,
    editGroup,
    removeGroup,
    fetchProfiles,
    addProfile,
    editProfile,
    removeProfile,
    setDefaultProfile,
  };
};
