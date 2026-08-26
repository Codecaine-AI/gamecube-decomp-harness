import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context";
import { runMeleeKernelPiAgent as runPiAgent } from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import {
  integrationResolverPrompt,
  validateIntegrationResolverAgentResult,
} from "@server/core/agent-catalog/agents/running/integration-resolver";
import { artifactTimestamp, parseJsonObject } from "@server/infrastructure/agent-runtime/runtime";
import {
  addEvent,
  addPiSession,
  getWorkerOutputIntegration,
  updateWorkerOutputIntegration,
  type StateStore,
  type WorkerOutputIntegrationRecord,
} from "@server/core/cycle-runtime/run-state";
import { openState } from "@server/core/cycle-runtime/run-state";
import { requireLease } from "@server/core/harness-state";
import { knowledgeCycleSessionId } from "@server/core/knowledge/jobs/cycle-session.js";
import { runCommand } from "@server/infrastructure/shell";
import { integrationCommitMessage } from "./worker-output-queue.js";
import { gameMetadata, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function recordValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)[key];
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "";
}

function itemString(item: unknown, ...keys: string[]): string {
  for (const key of keys) {
    const value = stringValue(recordValue(item, key));
    if (value) return value;
  }
  return "";
}

function recordIntegrationResolverCycle(globals: GlobalArgs, runId: string, result: Awaited<ReturnType<typeof runPiAgent>>): void {
  if (!runId) return;
  const store = openState(globals.stateDir);
  try {
    addPiSession({
      store,
      runId,
      role: "integration-resolver",
      sessionId: result.sessionId,
      sessionFile: result.sessionFile,
      provider: globals.provider,
      model: globals.model,
      thinkingLevel: globals.thinkingLevel,
      status: result.failed || result.providerError ? "failed" : result.dryRun ? "dry_run" : "succeeded",
      outputPath: result.outputPath,
    });
  } finally {
    store.db.close();
  }
}

function pathLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "patch failed") return false;
  return trimmed.includes("/") || /\.[A-Za-z0-9_+-]+$/.test(trimmed);
}

/**
 * The resolver agent hand-merges the live repoRoot but never commits; the
 * harness commits the merged state after the resolved outcome is persisted.
 * The original patch is never requeued: re-applying it on top of the merged
 * tree would conflict again and livelock the resolve loop.
 */
interface ResolvedIntegrationCommit {
  committedSha: string | null;
  warning: string | null;
  /** "committed" | "no_tree_change" (agent kept the incumbent or made no edits) | "commit_failed" */
  resolution: "committed" | "no_tree_change" | "commit_failed";
}

async function commitResolvedIntegration(params: {
  store: StateStore;
  repoRoot: string;
  leaseId: string;
  record: WorkerOutputIntegrationRecord;
}): Promise<ResolvedIntegrationCommit> {
  const paths = [...new Set([...params.record.writeSet, ...params.record.conflictPaths].map((path) => path.trim()).filter(pathLike))];
  if (paths.length === 0) {
    return { committedSha: null, warning: "resolved integration has no path-like write set to commit", resolution: "commit_failed" };
  }
  const revalidate = (): void => {
    if (params.leaseId) requireLease(params.store, params.leaseId);
  };
  const status = await runCommand(params.repoRoot, ["git", "status", "--porcelain", "--", ...paths]);
  if (status.exitCode !== 0) {
    return { committedSha: null, warning: `resolved integration status failed: ${status.stderr || status.stdout}`, resolution: "commit_failed" };
  }
  if (!status.stdout.trim()) return { committedSha: null, warning: null, resolution: "no_tree_change" };
  revalidate();
  const stage = await runCommand(params.repoRoot, ["git", "add", "--", ...paths]);
  if (stage.exitCode !== 0) {
    return { committedSha: null, warning: `resolved integration git add failed: ${stage.stderr || stage.stdout}`, resolution: "commit_failed" };
  }
  revalidate();
  const commit = await runCommand(params.repoRoot, [
    "git",
    "commit",
    "--no-verify",
    "-m",
    `${integrationCommitMessage(params.record)} (conflict resolved)`,
    "--",
    ...paths,
  ]);
  if (commit.exitCode !== 0) {
    return { committedSha: null, warning: `resolved integration git commit failed: ${commit.stderr || commit.stdout}`, resolution: "commit_failed" };
  }
  const head = await runCommand(params.repoRoot, ["git", "rev-parse", "HEAD"]);
  return head.exitCode === 0 && head.stdout.trim()
    ? { committedSha: head.stdout.trim(), warning: null, resolution: "committed" }
    : { committedSha: null, warning: `resolved integration could not resolve HEAD: ${head.stderr || head.stdout}`, resolution: "commit_failed" };
}

async function persistIntegrationResolverResult(params: {
  globals: GlobalArgs;
  runId: string;
  itemId: string;
  leaseId: string;
  summaryPath: string;
  parsedOutputPath: string;
  outputPath: string;
  validationErrors: string[];
  result: ReturnType<typeof validateIntegrationResolverAgentResult>["result"];
}): Promise<{ status: string | null; committedSha: string | null }> {
  if (!params.runId) return { status: null, committedSha: null };
  const store = openState(params.globals.stateDir);
  try {
    const row = getWorkerOutputIntegration(store, params.itemId);
    if (!row) return { status: null, committedSha: null };
    const status = params.validationErrors.length > 0 || !params.result ? "resolver_failed" : params.result.outcome;
    const updated = updateWorkerOutputIntegration(store, params.itemId, {
      status,
      disposition: params.result?.outcome ?? "resolver_failed",
      summaryPath: params.summaryPath,
      metadata: {
        resolver_output_path: params.outputPath,
        resolver_parsed_output_path: params.parsedOutputPath,
        resolver_validation_errors: params.validationErrors,
        resolver_result: params.result,
      },
      resolvedAt: status === "resolved" ? new Date().toISOString() : null,
    });
    addEvent(store, params.runId, "worker_integration_resolved", "integration-resolver", {
      id: updated.id,
      status: updated.status,
      disposition: updated.disposition,
      worker_state_id: updated.workerStateId,
      worker_checkpoint_id: updated.workerCheckpointId,
      summary_path: params.summaryPath,
      parsed_output_path: params.parsedOutputPath,
    });
    let committedSha: string | null = null;
    if (status === "resolved") {
      const commit = await commitResolvedIntegration({
        store,
        repoRoot: params.globals.repoRoot,
        leaseId: params.leaseId,
        record: updated,
      });
      committedSha = commit.committedSha;
      if (commit.warning) console.error(`[integration-resolver] ${commit.warning}`);
      updateWorkerOutputIntegration(store, params.itemId, {
        metadata: {
          validation_state: "tentative",
          resolved_commit: commit.committedSha,
          resolution: commit.resolution,
          ...(commit.warning ? { resolved_commit_warning: commit.warning } : {}),
        },
      });
      if (updated.workerCheckpointId) {
        store.db.query("UPDATE worker_checkpoints SET validation_state = 'tentative' WHERE id = ?").run(updated.workerCheckpointId);
      }
    }
    return { status, committedSha };
  } finally {
    store.db.close();
  }
}

export interface IntegrationResolveResult {
  itemId: string;
  status: string | null;
  /** Harness-side commit of the resolver's hand-merged state, when created. */
  committedSha: string | null;
}

export async function integrationResolve(globals: GlobalArgs, args: Map<string, string | true>): Promise<IntegrationResolveResult> {
  const itemFile = stringArg(args, "--item-file", "");
  if (!itemFile) throw new Error("integration-resolve requires --item-file <integration-conflict-item.json>");
  if (!existsSync(itemFile)) throw new Error(`Integration conflict item file does not exist: ${itemFile}`);
  const queueSummaryFile = stringArg(args, "--queue-summary-file", "");
  if (queueSummaryFile && !existsSync(queueSummaryFile)) throw new Error(`Integration queue summary file does not exist: ${queueSummaryFile}`);

  const item = readJsonFile(itemFile);
  const queueSummary = queueSummaryFile ? readJsonFile(queueSummaryFile) : {};
  const runId = stringArg(args, "--run-id", itemString(item, "run_id", "runId"));
  const itemId = itemString(item, "id", "queue_item_id", "queueItemId") || "integration-item";
  const epochId = itemString(item, "epoch_id", "epochId") || "active";
  const claimId = itemString(item, "target_claim_id", "targetClaimId", "claim_id", "claimId") || itemId;
  const targetId = itemString(item, "epoch_target_id", "epochTargetId", "target_id", "targetId");
  const outputDir = resolve(stringArg(args, "--output-dir", "") || resolve(globals.stateDir, "integration_resolver", artifactTimestamp()));
  await mkdir(outputDir, { recursive: true });

  const result = await runPiAgent({
    role: "integration-resolver",
    cwd: globals.repoRoot,
    prompt: integrationResolverPrompt({
      integrationItem: item,
      queueSummary,
      repoRoot: globals.repoRoot,
      stateDir: globals.stateDir,
      game: gameMetadata(globals),
    }),
    outputDir,
    dryRun: globals.dryRunAgents,
    provider: globals.provider,
    model: globals.model,
    thinkingLevel: globals.thinkingLevel,
    timeoutMs: globals.agentTimeoutSeconds ? globals.agentTimeoutSeconds * 1000 : undefined,
    toolContext: {
      repoRoot: globals.repoRoot,
      stateDir: globals.stateDir,
      game: globals.game,
    },
    kernelContext: createMeleeKernelSpawnContext({
      kind: "worker-integration",
      gameId: globals.game?.gameId ?? globals.gameId,
      sessionId: knowledgeCycleSessionId({
        globals,
        gameId: globals.game?.gameId ?? globals.gameId,
        fallback: runId || `integration-${itemId}`,
      }),
      runId: runId || undefined,
      epochId,
      claimId,
      itemId,
      targetId,
      phase: "integration",
      workingDir: globals.repoRoot,
      metadata: {
        itemFile,
        queueSummaryFile: queueSummaryFile || null,
        itemId,
        conflictGroupId: itemString(item, "conflict_group_id", "conflictGroupId") || null,
      },
    }),
  });
  recordIntegrationResolverCycle(globals, runId, result);

  const parsed = result.dryRun || result.failed || result.providerError
    ? { object: null, error: result.error ?? result.providerError ?? (result.dryRun ? "dry-run" : "agent failed") }
    : parseJsonObject(result.rawText);
  const validated = parsed.object ? validateIntegrationResolverAgentResult(parsed.object) : { result: null, errors: [parsed.error ?? "agent output was not parsed"] };
  const parsedOutputPath = resolve(outputDir, "agent_result.json");
  await writeFile(parsedOutputPath, `${JSON.stringify({ parsed: parsed.object, validation_errors: validated.errors }, null, 2)}\n`);

  const summary = {
    role: "integration-resolver",
    run_id: runId || null,
    item_id: itemId,
    dry_run: result.dryRun ?? false,
    failed: result.failed ?? false,
    provider_error: result.providerError ?? null,
    output_dir: outputDir,
    output_path: result.outputPath,
    system_prompt_path: result.systemPromptPath,
    user_prompt_path: result.userPromptPath,
    parsed_output_path: parsedOutputPath,
    parse_error: parsed.error ?? null,
    validation_errors: validated.errors,
    result: validated.result,
  };
  const summaryPath = resolve(outputDir, "integration_resolver_summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  const persisted = await persistIntegrationResolverResult({
    globals,
    runId,
    itemId,
    leaseId: stringArg(args, "--lease-id", "").trim(),
    summaryPath,
    parsedOutputPath,
    outputPath: result.outputPath,
    validationErrors: validated.errors,
    result: validated.result,
  });
  console.log(JSON.stringify({ ...summary, resolved_commit: persisted.committedSha }, null, 2));
  return { itemId, status: persisted.status, committedSha: persisted.committedSha };
}
