import type { Dashboard, FormState, RunDetails } from "@/lib/format";
import type { DashboardAction } from "@/pages/workspace/_lib/types";

export type DetailsTab = "logs" | "process" | "run";

export interface DetailsRailProps {
  busy: boolean;
  collapsed: boolean;
  dashboard: Dashboard | null;
  form: FormState;
  loadRunDetails: () => void;
  loadingRunDetails: boolean;
  onAction: (action: DashboardAction) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onResizeEnd: () => void;
  onResizeStart: () => void;
  onWidthChange: (width: number) => void;
  runDetails: RunDetails | null;
  setForm: (updates: Partial<FormState>) => void;
  tabRequest?: { nonce: number; tab: DetailsTab } | null;
}

export type RunDetailsControls = Pick<DetailsRailProps, "loadRunDetails" | "loadingRunDetails" | "runDetails">;
export type RunTabProps = Pick<DetailsRailProps, "dashboard" | "form" | "loadRunDetails" | "loadingRunDetails" | "runDetails">;
export type ProcessTabProps = Pick<DetailsRailProps, "busy" | "dashboard" | "form" | "onAction" | "setForm">;
