import { normalizeCandidateRerankMode } from "./board/index.js";

export interface RunningProcessCommandBody {
  agentTimeoutSeconds?: unknown;
  candidateRerank?: unknown;
  candidateWindow?: unknown;
  dryRunAgents?: unknown;
  epochSize?: unknown;
  epochConfigureCommand?: unknown;
  integrationResolverConcurrency?: unknown;
  maxWorkers?: unknown;
  model?: unknown;
  processName?: unknown;
  provider?: unknown;
  runId?: unknown;
  thinkingLevel?: unknown;
  workerConfigureCommand?: unknown;
}

export interface RunningProcessProjectDefaults {
  dashboard?: {
    agentTimeoutSeconds?: unknown;
    candidateRerank?: unknown;
    candidateWindow?: unknown;
    epochSize?: unknown;
    integrationResolverConcurrency?: unknown;
  };
  processName?: unknown;
  projectId?: string;
}

export interface RunningProcessCommandInput {
  body: RunningProcessCommandBody;
  graphDbPath: string;
  noRefillBatch: boolean;
  project: RunningProcessProjectDefaults | null;
  repoRoot: string;
  runId: string;
  serverJobPath: string;
  stateDir: string;
}

export interface RunningProcessCommandPlan {
  command: string[];
  graphDbPath: string;
  maxWorkers: number;
  name: string;
  repoRoot: string;
  runId: string;
  stateDir: string;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function intValue(value: unknown, fallback: number, min = 0): number {
  const parsed = Math.trunc(numberValue(value, fallback));
  return Math.max(min, parsed);
}

function boolValue(value: unknown): boolean {
  return value === true || value === "true";
}

function candidateWindowValue(value: unknown, fallback: unknown): number {
  return intValue(value, intValue(fallback, 64, 1), 1);
}

function processName(value: unknown): string {
  const raw = text(value, "melee-live").trim() || "melee-live";
  return raw.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "melee-live";
}

export function runningScheduling(maxWorkersValue: unknown): {
  maxWorkers: number;
} {
  const maxWorkers = intValue(maxWorkersValue, 16, 1);
  return {
    maxWorkers,
  };
}

export function buildRunningProcessCommand(input: RunningProcessCommandInput): RunningProcessCommandPlan {
  const { body, graphDbPath, noRefillBatch, project, repoRoot, runId, serverJobPath, stateDir } = input;
  const name = processName(project?.processName ?? body.processName);
  const provider = text(body.provider, "codex-lb");
  const model = text(body.model, "gpt-5.5");
  const thinkingLevel = text(body.thinkingLevel, "xhigh");
  const normalScheduling = runningScheduling(body.maxWorkers);
  const maxWorkers = normalScheduling.maxWorkers;
  const epochSize = noRefillBatch ? "1" : text(body.epochSize, String(project?.dashboard?.epochSize ?? "64"));
  const candidateWindowFallback = project?.dashboard?.candidateWindow ?? (Number.isFinite(Number(epochSize)) ? epochSize : "64");
  const candidateWindow = candidateWindowValue(body.candidateWindow, candidateWindowFallback);
  const candidateRerank = normalizeCandidateRerankMode(body.candidateRerank ?? project?.dashboard?.candidateRerank);
  const integrationResolverConcurrency = intValue(body.integrationResolverConcurrency, intValue(project?.dashboard?.integrationResolverConcurrency, 4, 1), 1);
  const workerConfigureCommand = text(body.workerConfigureCommand).trim();
  const epochConfigureCommand = text(body.epochConfigureCommand).trim();
  const agentTimeoutSeconds = intValue(
    body.agentTimeoutSeconds,
    intValue(project?.dashboard?.agentTimeoutSeconds, 1800, 1),
    1,
  );

  const command = ["bun", serverJobPath];
  if (project?.projectId) command.push("--project", project.projectId);
  command.push("--repo-root", repoRoot, "--state-dir", stateDir, "--provider", provider, "--model", model, "--thinking-level", thinkingLevel);
  if (boolValue(body.dryRunAgents)) command.push("--dry-run-agents");
  command.push("--agent-timeout-seconds", String(agentTimeoutSeconds));
  command.push(
    "babysit",
    "--max-workers",
    String(maxWorkers),
    "--epoch-size",
    epochSize,
    ...(noRefillBatch ? [] : ["--candidate-window", String(candidateWindow), "--candidate-rerank", candidateRerank]),
    "--integration-resolver-concurrency",
    String(integrationResolverConcurrency),
    "--graph-db",
    graphDbPath,
    "--force-recover-claims",
  );
  if (workerConfigureCommand) command.push("--worker-configure-command", workerConfigureCommand);
  if (epochConfigureCommand) command.push("--epoch-configure-command", epochConfigureCommand);
  if (noRefillBatch) {
    command.push("--no-epoch-cycle", "--no-blocked-queue-replan", "--max-idle-iterations", "3");
  }
  if (runId) command.push("--run-id", runId);
  return { command, graphDbPath, maxWorkers, name, repoRoot, runId, stateDir };
}
