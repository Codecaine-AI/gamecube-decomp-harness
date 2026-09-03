import { resolve } from "node:path";

export const MELEE_KERNEL_ID = "melee-decomp-orchestrator";
export const MELEE_KERNEL_DISPLAY_NAME = "Melee Decomp Orchestrator";
export const MELEE_DASHBOARD_PROCESS_NAME = "melee-live";

export interface AppKernelMarkerConfig {
  sessionBinding: string;
  lifecycle: string;
  subagentLink: string;
}

export const MELEE_KERNEL_MARKER_CONFIG = Object.freeze({
  sessionBinding: "agent-kernel:session-binding",
  lifecycle: "agent-kernel:pi-lifecycle",
  subagentLink: "agent-kernel:subagent-link",
} satisfies AppKernelMarkerConfig);

export const DEFAULT_PI_SESSIONS_DIR_NAME = ".pi-sessions";

export interface AppKernelBridgeConfig {
  kernelId: string;
  displayName: string;
  processName: string;
  workingDir: string;
  piSessionsDir: string;
  markerConfig: AppKernelMarkerConfig;
  appBaseUrl?: string | null;
  appTraceUrlTemplate?: string | null;
  genericTraceUrlTemplate?: string | null;
  metadata: Record<string, unknown>;
}

export interface CreateAppKernelBridgeConfigInput {
  kernelId?: string;
  displayName?: string;
  processName?: string;
  workingDir?: string;
  piSessionsDir?: string;
  markerConfig?: Partial<AppKernelMarkerConfig>;
  appBaseUrl?: string | null;
  appTraceUrlTemplate?: string | null;
  genericTraceUrlTemplate?: string | null;
  metadata?: Record<string, unknown>;
}

export function createAppKernelBridgeConfig(
  input: CreateAppKernelBridgeConfigInput = {},
): AppKernelBridgeConfig {
  const workingDir = input.workingDir ?? process.cwd();
  const piSessionsDir = input.piSessionsDir ?? resolve(workingDir, DEFAULT_PI_SESSIONS_DIR_NAME);

  return {
    kernelId: input.kernelId ?? MELEE_KERNEL_ID,
    displayName: input.displayName ?? MELEE_KERNEL_DISPLAY_NAME,
    processName: input.processName ?? MELEE_DASHBOARD_PROCESS_NAME,
    workingDir,
    piSessionsDir,
    markerConfig: {
      ...MELEE_KERNEL_MARKER_CONFIG,
      ...input.markerConfig,
    },
    appBaseUrl: input.appBaseUrl ?? null,
    appTraceUrlTemplate: input.appTraceUrlTemplate ?? null,
    genericTraceUrlTemplate: input.genericTraceUrlTemplate ?? null,
    metadata: {
      processName: input.processName ?? MELEE_DASHBOARD_PROCESS_NAME,
      ...input.metadata,
    },
  };
}
