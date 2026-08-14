import type { DashboardAction } from "@/pages/workspace/_lib/types";

export const SESSION_CONTROL_ACTION_IDS: Partial<Record<DashboardAction, string>> = {
  sessionSavePoint: "session.save_point",
  sessionClose: "session.close",
};

export const SESSION_CONTROL_ENDPOINTS: Partial<Record<DashboardAction, string>> = {
  sessionSavePoint: "/api/project-session/save-point",
  sessionClose: "/api/project-session/close",
};

export function sessionConfirmationMessage(action: DashboardAction): string | null {
  if (action !== "sessionClose") return null;
  return "Close this session?\n\nThis is a terminal action. The session will stop accepting workflows; the next baseline sync opens its successor.";
}
