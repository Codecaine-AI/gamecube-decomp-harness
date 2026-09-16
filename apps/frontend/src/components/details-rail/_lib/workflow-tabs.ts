import type { WorkflowTab } from "@/routing";

export const DETAILS_WORKFLOW_TABS: ReadonlyArray<{ id: WorkflowTab; label: string }> = [
  { id: "sync", label: "Sync" },
  { id: "run", label: "Run" },
  { id: "pr", label: "PR" },
];
