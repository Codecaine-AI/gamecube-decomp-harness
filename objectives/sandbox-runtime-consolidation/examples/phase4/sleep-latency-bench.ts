import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { DaytonaSandboxProvider } from "../../../../apps/server/src/core/job-queue/sandbox.ts";
import { loadLocalEnv } from "../../../../apps/server/src/infrastructure/env/local.ts";

const SNAPSHOT = "melee-sandbox-poc-20260818-trimmed";
const LABELS = { poc: "sleep-bench" };
const CYCLES = 10;
const EXEC_TIMEOUT_MS = 30_000;

// Worker provisioning grants the default 30-minute worker deadline plus its
// 30-minute teardown cushion. DaytonaSandboxProvider also disables automatic
// stopping (autoStopInterval: 0); auto-delete is left disabled so stop/start
// cycles preserve the sandbox until the explicit finally-block deletion.
const DEFAULT_WORKER_TTL_SECONDS = 30 * 60;
const TTL_MINUTES = Math.ceil(DEFAULT_WORKER_TTL_SECONDS / 60) + 30;

interface CycleResult {
  cycle: number;
  stop_complete_ms: number;
  start_complete_ms: number;
  start_to_first_exec_ms: number;
}

interface MetricSummary {
  min: number;
  median: number;
  max: number;
}

function elapsedMs(start: number): number {
  return Number((performance.now() - start).toFixed(3));
}

function summarize(values: number[]): MetricSummary {
  if (values.length === 0) throw new Error("cannot summarize an empty metric");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
  return {
    min: sorted[0]!,
    median: Number(median.toFixed(3)),
    max: sorted.at(-1)!,
  };
}

async function main(): Promise<void> {
  loadLocalEnv();
  const provider = new DaytonaSandboxProvider();

  const stale = await provider.listByLabels(LABELS);
  for (const sandbox of stale) {
    await provider.delete(sandbox.sandboxId, "reconciliation");
    console.error(JSON.stringify({ stale_sandbox_deleted: sandbox.sandboxId }));
  }

  let sandboxId: string | undefined;
  try {
    // SandboxCreateParams still carries the resource class used by fake and
    // non-snapshot callers. The Daytona provider intentionally does not send
    // it because Daytona rejects resources when creating from a snapshot.
    const handle = await provider.create({
      snapshot: SNAPSHOT,
      labels: LABELS,
      ttlMinutes: TTL_MINUTES,
    } as Parameters<DaytonaSandboxProvider["create"]>[0]);
    sandboxId = handle.sandboxId;

    const cycles: CycleResult[] = [];
    for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
      const stopStarted = performance.now();
      await handle.stop();
      const stopCompleteMs = elapsedMs(stopStarted);

      const startStarted = performance.now();
      await handle.start();
      const startCompleteMs = elapsedMs(startStarted);
      const exec = await handle.exec(["bash", "-lc", "true"], { timeoutMs: EXEC_TIMEOUT_MS });
      if (exec.exitCode !== 0) {
        throw new Error(`cycle ${cycle} first exec failed (${exec.exitCode}): ${exec.stderr || exec.stdout}`);
      }

      cycles.push({
        cycle,
        stop_complete_ms: stopCompleteMs,
        start_complete_ms: startCompleteMs,
        start_to_first_exec_ms: elapsedMs(startStarted),
      });
    }

    const report = {
      snapshot: SNAPSHOT,
      labels: LABELS,
      sandbox_id: sandboxId,
      cycles,
      summary: {
        stop_complete_ms: summarize(cycles.map((cycle) => cycle.stop_complete_ms)),
        start_complete_ms: summarize(cycles.map((cycle) => cycle.start_complete_ms)),
        start_to_first_exec_ms: summarize(cycles.map((cycle) => cycle.start_to_first_exec_ms)),
      },
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    const reportPath = fileURLToPath(new URL("./sleep_latency_bench.json", import.meta.url));
    await writeFile(reportPath, json, "utf8");
    process.stdout.write(json);
  } finally {
    if (sandboxId) {
      try {
        await provider.delete(sandboxId, "settlement");
        console.error(JSON.stringify({ sandbox_id: sandboxId, deleted: true }));
      } catch (error) {
        console.error(JSON.stringify({
          sandbox_id: sandboxId,
          deleted: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }
  }
}

await main();
