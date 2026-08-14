import type { DashboardAction } from "@/pages/workspace/_lib/types";

/** Compatibility actions are intentionally excluded from the canonical action inventory. */
export const PR_COMPATIBILITY_ACTION_IDS: Partial<Record<DashboardAction, string>> = {
  prAdoptLegacy: "pr.adopt_legacy",
};

export const PR_COMPATIBILITY_ENDPOINTS: Partial<Record<DashboardAction, string>> = {
  prAdoptLegacy: "/api/pr/adopt-legacy",
};
