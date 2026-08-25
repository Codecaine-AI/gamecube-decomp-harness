import type { AppRoute } from "@/routing";
import type { Dashboard, FormState, RunDetails } from "@/lib/format";
import type { ImprovedMode, WorkMode } from "@/pages/workspace/cycles/active/subphases/run/components/work-tables";
import type { DashboardAction, CycleView, WorkspaceNav } from "@/pages/workspace/_lib/types";

export interface CyclesPageProps {
  busy: boolean;
  dashboard: Dashboard | null;
  form: FormState;
  improvedMode: ImprovedMode;
  improvedPage: number;
  loadRunDetails: () => void;
  loadingRunDetails: boolean;
  nav: WorkspaceNav;
  onAction: (action: DashboardAction) => void;
  onOpenPr: (branch: string) => void;
  onPrepareLocalPr: (branch: string) => void;
  onSetReviewState: (branch: string, subState: string) => void;
  route: Extract<AppRoute, { kind: "workspace" }>;
  runDetails: RunDetails | null;
  setForm: (updates: Partial<FormState>) => void;
  setImprovedMode: (mode: ImprovedMode) => void;
  setImprovedPage: (page: number | ((page: number) => number)) => void;
  setWorkMode: (mode: WorkMode) => void;
  view: CycleView;
  workMode: WorkMode;
}
