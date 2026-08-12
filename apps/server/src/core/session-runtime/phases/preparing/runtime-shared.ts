import type {
  MeleeWorkflowTraceStatus,
  SubmitMeleeWorkflowTraceEventInput,
} from "@server/infrastructure/kernel/bridge/workflow-trace";
import type { PreparingPhaseState } from "@server/core/project-session";
import { getLatestRun, openState } from "@server/core/session-runtime/run-state";
import type { ProjectSummary, ResolvedProject } from "@server/core/project-registry";
import type { ProcessLogLine } from "@server/infrastructure/process-control/managed-process-controller";
import type { ReportRunOptions, ReportRunResult } from "@server/core/validation/report";
import type { BoundarySavePointResult } from "@server/core/session-runtime/phases/pr/save-points-runtime";

export type JsonObject = Record<string, unknown>;

export interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface FreshRunStep extends CliResult {
  command: string[];
  cwd: string;
  name: string;
}

export interface PreparingRuntimeProjectContext {
  graphDbPath: string;
  project: ResolvedProject | null;
  repoRoot: string;
  stateDir: string;
  usePathOverrides?: boolean;
}

export interface PreparingRuntimeWorkflowEventInput {
  kind: SubmitMeleeWorkflowTraceEventInput["kind"];
  operation: string;
  status?: MeleeWorkflowTraceStatus;
  sessionId?: string | null;
  runId?: string | null;
  prId?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PreparingRuntimeState {
  freshRunActive: boolean;
  projectSyncActive: boolean;
}

export interface PreparingRuntimeDeps {
  activeSessionPrBlockers: (stateDir: string) => string[];
  appendLog: (stream: ProcessLogLine["stream"], text: string) => void;
  beginOperation: (name: string, label: string, stepNames: string[]) => void;
  boundarySavePoint: (paths: PreparingRuntimeProjectContext, trigger: string, label?: string) => Promise<BoundarySavePointResult>;
  endOperation: (error?: unknown) => void;
  hasActiveProcess: (stateDir: string) => { active: boolean; name?: unknown };
  kernelDatabaseUrl?: () => string | null;
  kernelEnabled?: () => Promise<boolean>;
  operationStep: (stepName: string, detail?: string) => void;
  operationStepDetail: (stepName: string, detail: string) => void;
  packageRoot: string;
  projectToSummary: (project: ResolvedProject) => ProjectSummary;
  resolveDashboardProject: (input: JsonObject, options: { useDefaultProject?: boolean }) => PreparingRuntimeProjectContext;
  runCli: (command: string[], cwd?: string) => Promise<CliResult>;
  runGit: (repoRoot: string, args: string[], options?: { check?: boolean; failureHint?: string }) => Promise<CliResult>;
  runReport?: (repoRoot: string, options?: ReportRunOptions) => Promise<ReportRunResult>;
  serverJobPath: string;
  sourceRoot: (sourceId: string) => string;
  submitWorkflowEvent: (paths: PreparingRuntimeProjectContext, input: PreparingRuntimeWorkflowEventInput) => Promise<JsonObject | null>;
}

export interface GitSyncResult {
  afterRef: string;
  baseRef?: string;
  beforeRef: string;
  branch: string;
  mainWorktreePath?: string;
  mergedPrs: number[];
  sessionBranch?: string;
  sessionCurrentWorktreePath?: string;
  sessionRootPath?: string;
  sessionWorktreePath?: string;
  steps: JsonObject[];
  upstreamWorktreePath?: string;
}

export function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

export function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function boolValue(value: unknown): boolean {
  return value === true || value === "true";
}

export function outputTail(textValue: string, maxLength = 2000): string {
  if (textValue.length <= maxLength) return textValue;
  return `...${textValue.slice(textValue.length - maxLength)}`;
}

export function parseCliJsonOutput(stdout: string): JsonObject {
  const trimmed = stdout.trim();
  if (!trimmed) return {};
  try {
    return asObject(JSON.parse(trimmed));
  } catch {
    return {};
  }
}

export function latestRunId(stateDir: string): string {
  const store = openState(stateDir);
  try {
    return getLatestRun(store)?.id ?? "";
  } finally {
    store.db.close();
  }
}

export function serverJobPrefix(paths: PreparingRuntimeProjectContext, serverJobPath: string): string[] {
  const command = ["bun", serverJobPath];
  if (paths.project) command.push("--project", paths.project.projectId);
  command.push("--repo-root", paths.repoRoot, "--state-dir", paths.stateDir);
  return command;
}

export function appendPostmortemContextArgs(
  command: string[],
  paths: PreparingRuntimeProjectContext,
  runId = "",
  kernelDatabaseUrl?: string | null,
): void {
  command.push("--orchestrator-state-dir", paths.stateDir);
  const resolvedRunId = runId || latestRunId(paths.stateDir);
  if (resolvedRunId) command.push("--orchestrator-run-id", resolvedRunId);
  if (paths.project) command.push("--orchestrator-project-id", paths.project.projectId);
  if (kernelDatabaseUrl) command.push("--orchestrator-kernel-database-url", kernelDatabaseUrl);
}

export async function prPostmortemMode(deps: PreparingRuntimeDeps, dryRunAgents: boolean): Promise<"scaffold" | "pi"> {
  if (dryRunAgents) return "scaffold";
  if (!deps.kernelEnabled) return "scaffold";
  try {
    if (await deps.kernelEnabled()) return "pi";
  } catch (error) {
    deps.appendLog("stderr", `agent-kernel status check failed; PR postmortems will use scaffold mode: ${error instanceof Error ? error.message : String(error)}`);
  }
  deps.appendLog("ui", "agent-kernel unavailable; PR postmortems will use scaffold mode");
  return "scaffold";
}

export async function runFreshStep(
  deps: PreparingRuntimeDeps,
  steps: FreshRunStep[],
  name: string,
  command: string[],
  cwd: string,
): Promise<void> {
  deps.appendLog("ui", `${name} started: ${command.join(" ")}`);
  const result = await deps.runCli(command, cwd);
  deps.appendLog("ui", `${name} exit=${result.exitCode}`);
  const step = {
    name,
    command,
    cwd,
    exitCode: result.exitCode,
    stdout: outputTail(result.stdout, 4000),
    stderr: outputTail(result.stderr, 4000),
  };
  steps.push(step);
  if (result.exitCode !== 0) {
    throw new Error(`${name} failed (${result.exitCode ?? "signal"}): ${outputTail(result.stderr || result.stdout || "no output")}`);
  }
}

export type PreparingSubphase = PreparingPhaseState["subphase"];
