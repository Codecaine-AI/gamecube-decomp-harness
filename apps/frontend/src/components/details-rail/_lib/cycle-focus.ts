import { asObject, text, type Dashboard } from "@/lib/format";
import { harnessStateReadModel } from "@/pages/workspace/_lib/model";

export function detailsRailCycleFocus(dashboard: Dashboard | null): string {
  return harnessStateReadModel(dashboard)?.cycle?.cycle_uuid || text(asObject(dashboard?.cycle).cycleUuid) || "active";
}
