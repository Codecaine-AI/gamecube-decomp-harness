import type { DashboardAction } from "@/pages/workspace/_lib/types";

export const KNOWLEDGE_CONTROL_ACTION_IDS: Partial<Record<DashboardAction, string>> = {
  knowledgeProcess: "knowledge.process",
};

export const KNOWLEDGE_CONTROL_ENDPOINTS: Partial<Record<DashboardAction, string>> = {
  knowledgeProcess: "/api/knowledge/process",
};

export function knowledgeConfirmationMessage(_action: DashboardAction): null {
  return null;
}
