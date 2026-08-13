import type { DashboardAction } from "@/pages/workspace/_lib/types";

export const RUN_CONTROL_ACTIONS = {
  pause: "runPause",
  hardStop: "runHardStop",
} as const satisfies Record<"pause" | "hardStop", DashboardAction>;

export const RUN_CONTROL_ENDPOINTS = {
  runPause: "/api/run/pause",
  runHardStop: "/api/run/hard-stop",
} as const satisfies Partial<Record<DashboardAction, string>>;
