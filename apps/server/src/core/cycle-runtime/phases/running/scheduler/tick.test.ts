import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { initializeHarnessState, requestDispatch } from "@server/core/harness-state";
import { addEvent, createRun, openState, updateRunStatus, type StateStore } from "@server/core/cycle-runtime/run-state";
import { openKnowledgeGraph } from "@server/core/knowledge/graph";
import { writeReportProvenance } from "@server/core/knowledge/graph/storage/metadata.js";
import { ensureSchedulerEpochFromBoard, reconcileOrphanedEpochTargets, runSchedulerTick } from "./tick.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "scheduler-tick-state-"));
  tempDirs.push(dir);
  return dir;
}

function globalsFor(dir: string): GlobalArgs {
  return {
    repoRoot: dir,
    stateDir: dir,
    dryRunAgents: true,
    provider: "test",
    model: "test",
    thinkingLevel: "low",
  };
}

function writeReport(dir: string, candidateCount = 1): string {
  const path = join(dir, "build", "GALE01", "report.json");
  mkdirSync(join(dir, "build", "GALE01"), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      measures: { matched_code_percent: 90 },
      units: Array.from({ length: candidateCount }, (_, index) => ({
        name: `unit-${index}.o`,
        metadata: { source_path: `src/unit-${index}.c` },
        functions: [{ name: `function_${index}`, size: 32, fuzzy_match_percent: 90 }],
      })),
    }),
  );
  return path;
}

function writeProvenance(graphDbPath: string, reportPath: string, sha256?: string): void {
  const graph = openKnowledgeGraph(graphDbPath);
  try {
    writeReportProvenance(graph, {
      path: reportPath,
      mtimeMs: statSync(reportPath).mtimeMs,
      sha256: sha256 ?? createHash("sha256").update(readFileSync(reportPath)).digest("hex"),
      revision: "test-revision",
      matchedCodePercent: 90,
    });
  } finally {
    graph.db.close();
  }
}

function admissionFixture(candidateCount = 1) {
  const dir = tempDir();
  const graphDbPath = join(dir, "graph.sqlite");
  const store = openState(dir);
  const ready = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
  const run = activateRun(store, ready.id);
  return { dir, graphDbPath, run, store, reportPath: writeReport(dir, candidateCount) };
}

function activateRun(store: StateStore, runId: string) {
  initializeHarnessState(store, { gameId: "test", traceId: "trace-game-test" });
  const dispatch = requestDispatch(store, {
    actor: "runner",
    commandId: `command-test-activate-${runId}`,
    correlationId: runId,
    kind: "run",
    gameId: "test",
    reason: "scheduler test",
    workflowId: runId,
  });
  if (dispatch.queued) throw new Error("test dispatch unexpectedly queued");
  return updateRunStatus(store, runId, "active", "test");
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("runSchedulerTick", () => {
  test("refuses admission without creating an epoch when the report is missing", () => {
    const dir = tempDir();
    const store = openState(dir);
    const ready = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
    const run = activateRun(store, ready.id);

    expect(() =>
      ensureSchedulerEpochFromBoard({
        config: { workerPoolSize: 1 },
        globals: globalsFor(dir),
        graphDbPath: join(dir, "graph.sqlite"),
        runId: run.id,
        store,
      }),
    ).toThrow("Epoch admission refused: objdiff report is missing");
    expect(store.db.query("SELECT COUNT(*) AS count FROM epochs WHERE run_id = ?").get(run.id)).toEqual({ count: 0 });
    store.db.close();
  });

  test("refuses admission when the report hash is stale against board provenance", () => {
    const value = admissionFixture();
    const provenancePath = join(value.dir, "epoch_worktree", "build", "GALE01", "report.json");
    mkdirSync(join(value.dir, "epoch_worktree", "build", "GALE01"), { recursive: true });
    writeFileSync(provenancePath, readFileSync(value.reportPath));
    writeProvenance(value.graphDbPath, provenancePath, "0".repeat(64));

    expect(() =>
      ensureSchedulerEpochFromBoard({
        config: { workerPoolSize: 1 },
        globals: globalsFor(value.dir),
        graphDbPath: value.graphDbPath,
        runId: value.run.id,
        store: value.store,
      }),
    ).toThrow(
      `does not match knowledge board provenance (knowledge board was built from ${provenancePath}, expected ${value.reportPath}; report sha256`,
    );
    expect(value.store.db.query("SELECT COUNT(*) AS count FROM epochs WHERE run_id = ?").get(value.run.id)).toEqual({ count: 0 });
    value.store.db.close();
  });

  test("admits the healthy report-backed board unchanged", () => {
    const value = admissionFixture();
    writeProvenance(value.graphDbPath, value.reportPath);

    const result = ensureSchedulerEpochFromBoard({
      config: { workerPoolSize: 1 },
      globals: globalsFor(value.dir),
      graphDbPath: value.graphDbPath,
      runId: value.run.id,
      store: value.store,
    });

    expect(result.admission).toMatchObject({ candidateCount: 1, admitted: 1 });
    expect(result.progress.admitted).toBe(1);
    value.store.db.close();
  });

  test("re-enqueues an orphaned admitted target during an idle epoch pass", () => {
    const value = admissionFixture();
    writeProvenance(value.graphDbPath, value.reportPath);
    const epochResult = ensureSchedulerEpochFromBoard({
      config: { workerPoolSize: 1 },
      globals: globalsFor(value.dir),
      graphDbPath: value.graphDbPath,
      runId: value.run.id,
      store: value.store,
    });
    value.store.db.query("DELETE FROM jobs WHERE kind = 'worker'").run();
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(reconcileOrphanedEpochTargets(value.store, epochResult.epoch, epochResult.progress)).toBe(1);
      expect(reconcileOrphanedEpochTargets(value.store, epochResult.epoch, epochResult.progress)).toBe(0);
      expect(value.store.db.query("SELECT COUNT(*) AS count FROM jobs WHERE kind = 'worker' AND status = 'queued'").get()).toEqual({ count: 1 });
      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledWith(
        `[run-loop] epoch ${epochResult.progress.ordinal}: re-enqueued 1 orphaned admitted target(s)`,
      );
    } finally {
      errorLog.mockRestore();
      value.store.db.close();
    }
  });

  test("admits matching report content from a different provenance path", () => {
    const value = admissionFixture();
    const provenancePath = join(value.dir, "epoch_worktree", "build", "GALE01", "report.json");
    mkdirSync(join(value.dir, "epoch_worktree", "build", "GALE01"), { recursive: true });
    writeFileSync(provenancePath, readFileSync(value.reportPath));
    writeProvenance(value.graphDbPath, provenancePath);
    const infoLog = spyOn(console, "info").mockImplementation(() => {});

    try {
      const result = ensureSchedulerEpochFromBoard({
        config: { workerPoolSize: 1 },
        globals: globalsFor(value.dir),
        graphDbPath: value.graphDbPath,
        runId: value.run.id,
        store: value.store,
      });

      expect(result.admission).toMatchObject({ candidateCount: 1, admitted: 1 });
      expect(infoLog).toHaveBeenCalledTimes(1);
      expect(infoLog).toHaveBeenCalledWith(
        `knowledge board provenance path differs (built from ${provenancePath}); content sha matches`,
      );
    } finally {
      infoLog.mockRestore();
      value.store.db.close();
    }
  });

  test("refuses an admission candidate spike above the configured cap", () => {
    const value = admissionFixture(2);
    writeProvenance(value.graphDbPath, value.reportPath);

    expect(() =>
      ensureSchedulerEpochFromBoard({
        config: { workerPoolSize: 1, candidateCap: 1 },
        globals: globalsFor(value.dir),
        graphDbPath: value.graphDbPath,
        runId: value.run.id,
        store: value.store,
      }),
    ).toThrow("2 candidates exceed the configured absolute cap of 1");
    expect(value.store.db.query("SELECT COUNT(*) AS count FROM epochs WHERE run_id = ?").get(value.run.id)).toEqual({ count: 0 });
    value.store.db.close();
  });

  test("refuses an admission candidate spike above a multiple of recent epochs", () => {
    const value = admissionFixture(5);
    writeProvenance(value.graphDbPath, value.reportPath);
    value.store.db
      .query(
        `INSERT INTO epochs
         (id, run_id, ordinal, worker_pool_size, status, admitted_count, finished_count, routing_summary_json, created_at, closed_at)
         VALUES ('prior-epoch', ?, 1, 1, 'completed', 2, 2, '{}', ?, ?)`,
      )
      .run(value.run.id, new Date().toISOString(), new Date().toISOString());

    expect(() =>
      ensureSchedulerEpochFromBoard({
        config: { workerPoolSize: 1, candidateCap: 100, candidateMultiple: 2 },
        globals: globalsFor(value.dir),
        graphDbPath: value.graphDbPath,
        runId: value.run.id,
        store: value.store,
      }),
    ).toThrow("5 candidates exceed 2x the recent epoch maximum of 2");
    expect(value.store.db.query("SELECT COUNT(*) AS count FROM epochs WHERE run_id = ?").get(value.run.id)).toEqual({ count: 1 });
    value.store.db.close();
  });

  test("handles wake events without starting a new epoch when no-start-epoch is set", async () => {
    const dir = tempDir();
    const store = openState(dir);
    const ready = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
    const run = activateRun(store, ready.id);
    addEvent(store, run.id, "worker_finished", "test", { created_by: "test" });
    store.db.close();

    const result = await runSchedulerTick(
      globalsFor(dir),
      new Map<string, string | true>([
        ["--run-id", run.id],
        ["--no-start-epoch", true],
      ]),
    );

    const nextStore = openState(dir);
    try {
      const row = nextStore.db.query("SELECT COUNT(*) AS count FROM epochs WHERE run_id = ?").get(run.id) as Record<string, unknown>;
      expect(result.schedulerEpoch).toBeUndefined();
      expect(Number(row.count ?? 0)).toBe(0);
      expect(nextStore.db.query("SELECT scheduler_condition FROM runs WHERE id = ?").get(run.id)).toEqual({
        scheduler_condition: "idle",
      });
    } finally {
      nextStore.db.close();
    }
  });
});
