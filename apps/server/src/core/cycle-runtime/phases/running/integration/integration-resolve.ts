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
import { addEvent, addPiSession, getWorkerOutputIntegration, updateWorkerOutputIntegration } from "@server/core/cycle-runtime/run-state";
import { openState } from "@server/core/cycle-runtime/run-state";
import { requeueJob } from "@server/core/job-queue/kernel.js";
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

function persistIntegrationResolverResult(params: {
  globals: GlobalArgs;
  runId: string;
  itemId: string;
  summaryPath: string;
  parsedOutputPath: string;
  outputPath: string;
  validationErrors: string[];
  result: ReturnType<typeof validateIntegrationResolverAgentResult>["result"];
}): void {
  if (!params.runId) return;
  const store = openState(params.globals.stateDir);
  try {
    const row = getWorkerOutputIntegration(store, params.itemId);
    if (!row) return;
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
    if (status === "resolved" && updated.workerCheckpointId) {
      requeueJob(store, {
        kind: "integration",
        dedupeKey: updated.workerCheckpointId,
      });
    }
  } finally {
    store.db.close();
  }
}

export async function integrationResolve(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
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
      sessionId: runId || `integration-${itemId}`,
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
  persistIntegrationResolverResult({
    globals,
    runId,
    itemId,
    summaryPath,
    parsedOutputPath,
    outputPath: result.outputPath,
    validationErrors: validated.errors,
    result: validated.result,
  });
  console.log(JSON.stringify(summary, null, 2));
}
