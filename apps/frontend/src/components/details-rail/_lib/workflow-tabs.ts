import type { CycleTab } from "@/routing";

export const DETAILS_WORKFLOW_TABS: ReadonlyArray<{ id: CycleTab; label: string }> = [
  { id: "sync", label: "Sync" },
  { id: "run", label: "Run" },
  { id: "pr", label: "PR" },
];
