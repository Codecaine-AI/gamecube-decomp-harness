import type { CycleFocus } from "@/routing";
import type { CycleView } from "@/pages/workspace/_lib/types";

export function activeCycleFocus(view: Pick<CycleView, "activeCycleId" | "mode">): CycleFocus {
  return view.activeCycleId || "active";
}
