import type {
  AppWorkflowTraceStatus,
  SubmitAppWorkflowTraceEventInput,
} from "@server/infrastructure/kernel/bridge/workflow-trace";
import type { PreparingPhaseState } from "@server/core/cycle";
import { getLatestRun, openState } from "@server/core/cycle-runtime/run-state";
import type { GameSummary, ResolvedGame } from "@server/core/game-registry";
import { uiLog } from "@server/infrastructure/logging/ui-log";
import type { ReportRunOptions, ReportRunResult } from "@server/core/validation/report";
import type { BoundarySavePointResult } from "@server/core/cycle-runtime/phases/pr/save-points-runtime";

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

export interface PreparingRuntimeGameContext {
  graphDbPath: string;
  game: ResolvedGame | null;
  repoRoot: string;
  stateDir: string;
  usePathOverrides?: boolean;
}

export interface PreparingRuntimeWorkflowEventInput {
  kind: SubmitAppWorkflowTraceEventInput["kind"];
  operation: string;
  status?: AppWorkflowTraceStatus;
  sessionId?: string | null;
  runId?: string | null;
  prId?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  gameEventId?: string;
  causedByEventId?: string | null;
}

export interface PreparingRuntimeState {
  freshRunActive: boolean;
  gameSyncActive: boolean;
}

export interface PreparingRuntimeDeps {
  activeCyclePrBlockers: (stateDir: string) => string[];
  beginOperation: (name: string, label: string, stepNames: string[]) => void;
  boundarySavePoint: (paths: PreparingRuntimeGameContext, trigger: string, cycleUuid: string, label?: string) => Promise<BoundarySavePointResult>;
  endOperation: (error?: unknown) => void;
  hasActiveProcess: (stateDir: string) => { active: boolean; name?: unknown };
  kernelDatabaseUrl?: () => string | null;
  kernelEnabled?: () => Promise<boolean>;
  operationStep: (stepName: string, detail?: string) => void;
  operationStepDetail: (stepName: string, detail: string) => void;
  packageRoot: string;
  gameToSummary: (game: ResolvedGame) => GameSummary;
  resolveDashboardGame: (input: JsonObject, options: { useDefaultGame?: boolean }) => PreparingRuntimeGameContext;
  runCli: (command: string[], cwd?: string) => Promise<CliResult>;
  runGit: (repoRoot: string, args: string[], options?: { check?: boolean; failureHint?: string }) => Promise<CliResult>;
  runReport?: (repoRoot: string, options?: ReportRunOptions) => Promise<ReportRunResult>;
  serverJobPath: string;
  sourceRoot: (sourceId: string) => string;
  submitWorkflowEvent: (paths: PreparingRuntimeGameContext, input: PreparingRuntimeWorkflowEventInput) => Promise<JsonObject | null>;
}

export interface GitSyncResult {
  afterRef: string;
  baseRef?: string;
  beforeRef: string;
  branch: string;
  mergedPrs: number[];
  cycleBranch?: string;
  cycleCurrentWorktreePath?: string;
  cycleRootPath?: string;
  cycleWorktreePath?: string;
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

export function serverJobPrefix(paths: PreparingRuntimeGameContext, serverJobPath: string): string[] {
  const command = ["bun", serverJobPath];
  if (paths.game) command.push("--game", paths.game.gameId);
  command.push("--repo-root", paths.repoRoot, "--state-dir", paths.stateDir);
  return command;
}

export function appendPostmortemContextArgs(
  command: string[],
  paths: PreparingRuntimeGameContext,
  runId = "",
  kernelDatabaseUrl?: string | null,
): void {
  command.push("--orchestrator-state-dir", paths.stateDir);
  const resolvedRunId = runId || latestRunId(paths.stateDir);
  if (resolvedRunId) command.push("--orchestrator-run-id", resolvedRunId);
  if (paths.game) command.push("--orchestrator-project-id", paths.game.gameId);
  if (kernelDatabaseUrl) command.push("--orchestrator-kernel-database-url", kernelDatabaseUrl);
}

export async function prPostmortemMode(deps: PreparingRuntimeDeps, dryRunAgents: boolean): Promise<"scaffold" | "pi"> {
  if (dryRunAgents) return "scaffold";
  if (!deps.kernelEnabled) return "scaffold";
  try {
    if (await deps.kernelEnabled()) return "pi";
  } catch (error) {
    uiLog("stderr", `agent-kernel status check failed; PR postmortems will use scaffold mode: ${error instanceof Error ? error.message : String(error)}`);
  }
  uiLog("ui", "agent-kernel unavailable; PR postmortems will use scaffold mode");
  return "scaffold";
}

export async function runFreshStep(
  deps: PreparingRuntimeDeps,
  steps: FreshRunStep[],
  name: string,
  command: string[],
  cwd: string,
): Promise<void> {
  uiLog("ui", `${name} started: ${command.join(" ")}`);
  const result = await deps.runCli(command, cwd);
  uiLog("ui", `${name} exit=${result.exitCode}`);
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
