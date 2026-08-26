import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { stringArg } from "@server/core/game-registry/runtime-options.js";
import {
  appendManifestRows,
  loadBackfillManifest,
  runLibrarianBatch,
  type BackfillManifestRow,
  type PlannedBatch,
} from "./librarian-backfill.js";
import { appendLearnings, defaultLedgerPath } from "@server/core/knowledge/ledger.js";

function requiredArg(args: Map<string, string | true>, name: string): string {
  const value = stringArg(args, name, "").trim();
  if (!value) throw new Error(`kg-librarian-batch requires ${name} <path>`);
  return resolve(value);
}

function readBatchFile(path: string): { batch: PlannedBatch; payload: Record<string, unknown> } {
  if (!existsSync(path)) throw new Error(`Batch file not found: ${path}`);
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const batch = value?.batch as Partial<PlannedBatch> | undefined;
  const payload = value?.payload;
  if (!batch || typeof batch.batch_id !== "string" || typeof batch.source !== "string" || !batch.descriptor) {
    throw new Error(`Invalid batch in ${path}`);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`Invalid payload in ${path}`);
  }
  return { batch: batch as PlannedBatch, payload: payload as Record<string, unknown> };
}

export async function kgLibrarianBatch(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  seams: { runBatch?: typeof runLibrarianBatch } = {},
): Promise<void> {
  const batchFile = requiredArg(args, "--batch-file");
  const outputDir = requiredArg(args, "--output-dir");
  const runId = stringArg(args, "--run-id", "").trim();
  const ledgerPath = resolve(stringArg(args, "--ledger-path", defaultLedgerPath(globals.game?.gameId ?? "melee")));
  const manifestValue = stringArg(args, "--manifest-path", "").trim();
  const manifestPath = manifestValue ? resolve(manifestValue) : null;
  const { batch, payload } = readBatchFile(batchFile);
  const outcome = await (seams.runBatch ?? runLibrarianBatch)({ batch, payload, globals, outputDir, runId });
  const appendResult = outcome.failed || globals.dryRunAgents
    ? null
    : appendLearnings(ledgerPath, outcome.records);

  if (manifestPath && !globals.dryRunAgents) {
    const prior = loadBackfillManifest(manifestPath).get(batch.batch_id);
    const row: BackfillManifestRow = {
      batch_id: batch.batch_id,
      source: batch.source,
      status: outcome.failed ? "failed" : "done",
      attempts: (prior?.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
      output_counts: outcome.outputCounts,
      descriptor: batch.descriptor,
      error: outcome.failed
        ? outcome.parseError ?? (outcome.validationErrors.length ? `validation: ${outcome.validationErrors.slice(0, 3).join("; ")}` : "unknown failure")
        : null,
    };
    appendManifestRows(manifestPath, [row]);
  }

  console.log(JSON.stringify({
    command: "kg-librarian-batch",
    batch_id: batch.batch_id,
    failed: outcome.failed,
    learnings_appended: appendResult?.appended_records ?? 0,
    validation_errors: outcome.validationErrors,
    error: outcome.parseError,
    output_path: outcome.result?.outputPath ?? null,
  }));
  if (outcome.failed) process.exitCode = 1;
}
