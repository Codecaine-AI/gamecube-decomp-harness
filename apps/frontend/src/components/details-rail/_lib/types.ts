import type { Dashboard, RunDetails } from "@/lib/format";
import type { DashboardAction } from "@/pages/workspace/_lib/types";

export type DetailsTab = "logs" | "process" | "run";

export interface DetailsRailProps {
  busy: boolean;
  collapsed: boolean;
  dashboard: Dashboard | null;
  loadRunDetails: () => void;
  loadingRunDetails: boolean;
  onAction: (action: DashboardAction) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onResizeEnd: () => void;
  onResizeStart: () => void;
  onWidthChange: (width: number) => void;
  runDetails: RunDetails | null;
  tabRequest?: { nonce: number; tab: DetailsTab } | null;
}

export type RunDetailsControls = Pick<DetailsRailProps, "loadRunDetails" | "loadingRunDetails" | "runDetails">;
export type RunTabProps = Pick<DetailsRailProps, "dashboard" | "loadRunDetails" | "loadingRunDetails" | "runDetails">;
export type ProcessTabProps = Pick<DetailsRailProps, "busy" | "dashboard" | "onAction">;
