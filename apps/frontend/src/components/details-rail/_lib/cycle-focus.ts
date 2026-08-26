import { activeCycleFocus } from "@/pages/workspace/cycles/_lib/cycleRoute";
import type { CycleView } from "@/pages/workspace/_lib/types";

export function detailsRailCycleFocus(view: CycleView): string {
  return activeCycleFocus(view);
}
