import type { DashboardAction } from "@/pages/workspace/_lib/types";

export const CYCLE_CONTROL_ACTION_IDS: Partial<Record<DashboardAction, string>> = {
  cycleSavePoint: "cycle.save_point",
  cycleClose: "cycle.close",
};

export const CYCLE_CONTROL_ENDPOINTS: Partial<Record<DashboardAction, string>> = {
  cycleSavePoint: "/api/cycle/save-point",
  cycleClose: "/api/cycle/close",
};

export function cycleConfirmationMessage(action: DashboardAction): string | null {
  if (action !== "cycleClose") return null;
  return "Close this cycle?\n\nThis is a terminal action. The cycle will stop accepting workflows; the next baseline sync opens its successor.";
}
