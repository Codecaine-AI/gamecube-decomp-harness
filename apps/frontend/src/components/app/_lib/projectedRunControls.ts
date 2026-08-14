import type { DashboardAction } from "@/pages/workspace/_lib/types";

export const RUN_CONTROL_ACTIONS = {
  start: "runStart",
  pause: "runPause",
  resume: "runResume",
  hardStop: "runHardStop",
  cancel: "runCancel",
  recover: "runRecover",
} as const satisfies Record<"start" | "pause" | "resume" | "hardStop" | "cancel" | "recover", DashboardAction>;

export const RUN_CONTROL_ACTION_IDS: Partial<Record<DashboardAction, string>> = {
  runStart: "run.start",
  runPause: "run.pause",
  runResume: "run.resume",
  runHardStop: "run.hard_stop",
  runCancel: "run.cancel",
  runRecover: "run.recover",
};

export const RUN_CONTROL_ENDPOINTS = {
  runStart: "/api/process/start",
  runPause: "/api/run/pause",
  runResume: "/api/run/resume",
  runHardStop: "/api/run/hard-stop",
  runCancel: "/api/run/cancel",
  runRecover: "/api/run/recover",
} as const satisfies Partial<Record<DashboardAction, string>>;
