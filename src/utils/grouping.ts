import { Target } from "../features/probes/types";

export const groupTargetsByCategory = (targets: Target[]): Record<string, Target[]> => {
  return targets.reduce((acc, target) => {
    const cat = target.category || "Uncategorized";
    if (!acc[cat]) {
      acc[cat] = [];
    }
    acc[cat].push(target);
    return acc;
  }, {} as Record<string, Target[]>);
};
