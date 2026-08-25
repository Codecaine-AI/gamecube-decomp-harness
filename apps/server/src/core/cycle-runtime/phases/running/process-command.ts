import type { Blocker } from "@server/core/harness-state";
import type { RunInputs } from "@server/core/shared/types";

export interface RunningProcessCommandBody {
  agentTimeoutSeconds?: unknown;
  commandId?: unknown;
  confirmed?: unknown;
  dryRunAgents?: unknown;
  epochConfigureCommand?: unknown;
  goalKind?: unknown;
  goalValue?: unknown;
  graphDbPath?: unknown;
  integrationResolverConcurrency?: unknown;
  maxWorkers?: unknown;
  model?: unknown;
  processName?: unknown;
  gameId?: unknown;
  provider?: unknown;
  reason?: unknown;
  repoRoot?: unknown;
  runId?: unknown;
  stateDir?: unknown;
  thinkingLevel?: unknown;
  usePathOverrides?: unknown;
  workerConfigureCommand?: unknown;
}

export interface RunningProcessGameDefaults {
  dashboard?: {
    agentTimeoutSeconds?: unknown;
    integrationResolverConcurrency?: unknown;
  };
  processName?: unknown;
  gameId?: string;
}

export interface RunningProcessCommandInput {
  body: RunningProcessCommandBody;
  graphDbPath: string;
  noRefillBatch: boolean;
  game: RunningProcessGameDefaults | null;
  repoRoot: string;
  runId: string;
  runInputs: RunInputs;
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

export interface RunningProcessConfigurationConflict {
  blocker: Blocker;
  field: RunningProcessPolicyField;
  requested: unknown;
  stored: unknown;
}

/**
 * Request fields in this list select scheduler behavior and therefore must
 * equal their immutable configuration_snapshot counterparts when supplied.
 * All process command values for these fields are read from the snapshot.
 */
const POLICY_FIELDS = {
  agentTimeoutSeconds: "agent_timeout_seconds",
  dryRunAgents: "dry_run_agents",
  epochConfigureCommand: "epoch_configure_command",
  goalKind: "goal_kind",
  goalValue: "goal_value",
  integrationResolverConcurrency: "integration_resolver_concurrency",
  maxWorkers: "desired_workers",
  model: "model",
  provider: "provider",
  thinkingLevel: "thinking_level",
  workerConfigureCommand: "worker_configure_command",
} as const;

type RunningProcessPolicyField = keyof typeof POLICY_FIELDS;

/**
 * These request fields do not change run policy and may pass through without
 * appearing in configuration_snapshot: routing/identity (runId, gameId),
 * command attribution (commandId, reason, confirmed), managed-process identity
 * (processName), and deployment paths (usePathOverrides, repoRoot, stateDir,
 * graphDbPath).
 */
export const RUNNING_PROCESS_OPERATIONAL_FIELDS = [
  "commandId",
  "confirmed",
  "graphDbPath",
  "processName",
  "gameId",
  "reason",
  "repoRoot",
  "runId",
  "stateDir",
  "usePathOverrides",
] as const satisfies readonly (keyof RunningProcessCommandBody)[];

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

function processName(value: unknown): string {
  const raw = text(value, "melee-live").trim() || "melee-live";
  return raw.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "melee-live";
}

function canonicalJson(value: unknown): string {
  const sort = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(sort);
    if (!child || typeof child !== "object") return child;
    return Object.fromEntries(
      Object.entries(child as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sort(nested)]),
    );
  };
  return JSON.stringify(sort(value));
}

function normalizePolicyValue(field: RunningProcessPolicyField, value: unknown): unknown {
  switch (field) {
    case "agentTimeoutSeconds":
    case "integrationResolverConcurrency":
    case "maxWorkers":
      return intValue(value, 0, 1);
    case "goalValue":
      return numberValue(value, 0);
    case "dryRunAgents":
      return boolValue(value);
    case "epochConfigureCommand":
    case "workerConfigureCommand":
      return text(value).trim();
    case "model":
    case "provider":
    case "thinkingLevel":
    case "goalKind":
      return text(value);
  }
}

function policySnapshotValue(
  field: RunningProcessPolicyField,
  configurationSnapshot: Record<string, unknown>,
): unknown {
  const key = POLICY_FIELDS[field];
  const value = configurationSnapshot[key];
  if (value === undefined) throw new Error(`Run configuration_snapshot is missing policy field ${key}`);
  return normalizePolicyValue(field, value);
}

export function runningProcessConfigurationConflicts(
  body: RunningProcessCommandBody,
  runInputs: RunInputs,
  runId: string,
): RunningProcessConfigurationConflict[] {
  const conflicts: RunningProcessConfigurationConflict[] = [];
  for (const field of Object.keys(POLICY_FIELDS) as RunningProcessPolicyField[]) {
    if (body[field] === undefined) continue;
    const requested = normalizePolicyValue(field, body[field]);
    const stored = policySnapshotValue(field, runInputs.configuration_snapshot);
    if (canonicalJson(requested) === canonicalJson(stored)) continue;
    conflicts.push({
      blocker: {
        code: "run_configuration_conflict",
        message: `Requested ${field} conflicts with immutable run configuration ${POLICY_FIELDS[field]}.`,
        source_kind: "run",
        source_id: runId,
        recoverable: false,
      },
      field,
      requested,
      stored,
    });
  }
  return conflicts;
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
  const { body, graphDbPath, noRefillBatch, game, repoRoot, runId, runInputs, serverJobPath, stateDir } = input;
  const configuration = runInputs.configuration_snapshot;
  const conflicts = runningProcessConfigurationConflicts(body, runInputs, runId);
  if (conflicts.length > 0) {
    throw new Error(`Run ${runId} process request conflicts with its immutable configuration: ${conflicts.map((conflict) => conflict.field).join(", ")}`);
  }

  const name = processName(game?.processName ?? body.processName);
  const provider = text(policySnapshotValue("provider", configuration));
  const model = text(policySnapshotValue("model", configuration));
  const thinkingLevel = text(policySnapshotValue("thinkingLevel", configuration));
  const maxWorkers = Number(policySnapshotValue("maxWorkers", configuration));
  const integrationResolverConcurrency = Number(policySnapshotValue("integrationResolverConcurrency", configuration));
  const workerConfigureCommand = String(policySnapshotValue("workerConfigureCommand", configuration));
  const epochConfigureCommand = String(policySnapshotValue("epochConfigureCommand", configuration));
  const agentTimeoutSeconds = Number(policySnapshotValue("agentTimeoutSeconds", configuration));

  const command = ["bun", serverJobPath];
  if (game?.gameId) command.push("--game", game.gameId);
  command.push("--repo-root", repoRoot, "--state-dir", stateDir, "--provider", provider, "--model", model, "--thinking-level", thinkingLevel);
  if (Boolean(policySnapshotValue("dryRunAgents", configuration))) command.push("--dry-run-agents");
  command.push("--agent-timeout-seconds", String(agentTimeoutSeconds));
  command.push(
    "run-loop",
    "--max-workers",
    String(maxWorkers),
    "--integration-resolver-concurrency",
    String(integrationResolverConcurrency),
    "--graph-db",
    graphDbPath,
  );
  if (workerConfigureCommand) command.push("--worker-configure-command", workerConfigureCommand);
  if (epochConfigureCommand) command.push("--epoch-configure-command", epochConfigureCommand);
  if (noRefillBatch) {
    command.push("--no-epoch-cycle", "--no-blocked-queue-replan", "--max-idle-iterations", "3");
  }
  if (runId) command.push("--run-id", runId);
  return { command, graphDbPath, maxWorkers, name, repoRoot, runId, stateDir };
}
