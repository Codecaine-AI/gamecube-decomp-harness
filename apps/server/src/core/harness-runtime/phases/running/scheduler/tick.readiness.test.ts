import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import type { ResolvedGame } from "@server/core/game-registry/resolver.js";
import { initializeDispatchState, requestDispatch } from "@server/core/harness-state";
import {
  addEvent,
  createRun,
  epochTargetNotReadyClasses,
  loadEpochTargetReadiness,
  openState,
  schedulerEpochProgress,
  updateRunStatus,
  type StateStore,
} from "@server/core/harness-runtime/run-state";
import { openKnowledgeGraph } from "@server/core/knowledge/graph";
import { writeReportProvenance } from "@server/core/knowledge/graph/storage/metadata.js";
import type { TargetReadiness } from "@server/core/shared/types/index.js";
import { clearReadinessCache, expectedReadinessIdentity, latestReadinessArtifact, readinessBoardFields, type EpochReadiness } from "./readiness.js";
import { writeReadinessRepo } from "./readiness.test-fixture.js";
import { ensureSchedulerEpochFromBoard, isReadinessBlockedOnly, refreshReadinessArtifact, runSchedulerTick } from "./tick.js";

const KOOPA = { class: "TKoopa", owner_unit: "main/Enemy/Koopa", kind: "construct" };
const REGISTRY = "main/System/MarNameRefGen_Enemy::getNameRef";
const CALLER = "main/Map/MapObj::spawnKoopa";
const PLAIN = "main/Map/MapObj::update";
const GATED = ["src/System/MarNameRefGen*.cpp"];
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => clearReadinessCache());

function writeReport(dir: string, functions: Array<{ unit: string; source: string; symbol: string }>): string {
  const path = join(dir, "build", "GALE01", "report.json");
  mkdirSync(join(dir, "build", "GALE01"), { recursive: true });
  const units = new Map<string, { name: string; metadata: { source_path: string }; functions: unknown[] }>();
  for (const fn of functions) {
    const unit = units.get(fn.unit) ?? { name: fn.unit, metadata: { source_path: fn.source }, functions: [] };
    unit.functions.push({ name: fn.symbol, size: 32, fuzzy_match_percent: 50 });
    units.set(fn.unit, unit);
  }
  writeFileSync(path, JSON.stringify({ measures: { matched_code_percent: 10 }, units: [...units.values()] }));
  return path;
}

const registryFn = { unit: "main/System/MarNameRefGen_Enemy", source: "src/System/MarNameRefGen_Enemy.cpp", symbol: "getNameRef" };
const callerFn = { unit: "main/Map/MapObj", source: "src/Map/MapObj.cpp", symbol: "spawnKoopa" };
const plainFn = { unit: "main/Map/MapObj", source: "src/Map/MapObj.cpp", symbol: "update" };

function fixture(functions: Array<{ unit: string; source: string; symbol: string }>) {
  const dir = mkdtempSync(join(tmpdir(), "scheduler-readiness-"));
  tempDirs.push(dir);
  const graphDbPath = join(dir, "graph.sqlite");
  const store = openState(dir);
  seedRunHarness(store);
  const ready = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
  initializeDispatchState(store, { gameId: "test", traceId: "trace-game-test" });
  requestDispatch(store, { actor: "runner", commandId: `command-activate-${ready.id}`, correlationId: ready.id, kind: "run", gameId: "test", reason: "readiness test", workflowId: ready.id });
  const run = updateRunStatus(store, ready.id, "active", "test");
  const reportPath = writeReport(dir, functions);
  const graph = openKnowledgeGraph(graphDbPath);
  try {
    writeReportProvenance(graph, {
      path: reportPath, mtimeMs: statSync(reportPath).mtimeMs,
      sha256: createHash("sha256").update(readFileSync(reportPath)).digest("hex"),
      revision: "test-revision", matchedCodePercent: 10,
    });
  } finally {
    graph.db.close();
  }
  return { dir, graphDbPath, store, run };
}

function globalsFor(dir: string, game?: ResolvedGame): GlobalArgs {
  return { repoRoot: dir, stateDir: dir, dryRunAgents: true, provider: "test", model: "test", thinkingLevel: "low", ...(game ? { game } : {}) };
}

function readinessFor(mode: "shadow" | "enforce", functions: Record<string, TargetReadiness>, rev = "rev-1"): EpochReadiness {
  return {
    mode, gatedPaths: GATED, rev,
    load: {
      ok: true,
      index: {
        identity: { repo: "/repo", rev, version: "GALE01", target_stamp: "t", map_sha: "m", policy_hash: "p" },
        functions: new Map(Object.entries(functions)),
        summary: { blocked: 0, deferred: 0, ready: 0, unresolved_classes: 0 },
      },
    },
  };
}

const notReady = (state: "blocked" | "deferred"): TargetReadiness => ({ state, unmet: [KOOPA], unresolved: [] });
const READY: TargetReadiness = { state: "ready", unmet: [], unresolved: [] };

function admit(f: ReturnType<typeof fixture>, readiness?: EpochReadiness) {
  return ensureSchedulerEpochFromBoard({
    config: { workerPoolSize: 1 },
    globals: globalsFor(f.dir),
    graphDbPath: f.graphDbPath,
    runId: f.run.id,
    store: f.store,
    ...(readiness ? { readiness } : {}),
  });
}

function count(store: StateStore, sql: string, ...params: string[]): number {
  return Number((store.db.query(sql).get(...params) as { count: number }).count);
}

function parkedEvents(store: StateStore, runId: string) {
  return store.db.query("SELECT handled_at, payload_json FROM events WHERE run_id = ? AND event_type = 'epoch_admission_parked'").all(runId) as Array<{ handled_at: string | null; payload_json: string }>;
}

describe("readiness-aware admission", () => {
  test("enforce: a mixed frontier admits ready targets first, then deferred ones; blocked ones never enter the epoch, and the epoch still closes", () => {
    const f = fixture([registryFn, callerFn, plainFn]);
    try {
      const result = admit(f, readinessFor("enforce", { [REGISTRY]: notReady("blocked"), [CALLER]: notReady("deferred"), [PLAIN]: READY }));
      if (isReadinessBlockedOnly(result)) throw new Error("expected an epoch");
      const rows = f.store.db.query("SELECT id, target_key, admission_index, reason FROM epoch_targets WHERE epoch_id = ? ORDER BY admission_index").all(result.epoch.id) as Array<{ id: string; target_key: string; reason: string | null }>;
      expect(rows.map((row) => row.target_key)).toEqual([PLAIN, CALLER]);
      expect(rows[0]?.reason).toBeNull();
      // The worker packet's <not_ready_classes> come from the admitted target.
      expect(epochTargetNotReadyClasses(f.store, rows[1]!.id)).toEqual([KOOPA]);
      expect(loadEpochTargetReadiness(f.store, rows[1]!.id)).toEqual({ state: "deferred", unmet: [KOOPA], unresolved: [] });
      expect(epochTargetNotReadyClasses(f.store, rows[0]!.id)).toEqual([]);

      const artifact = latestReadinessArtifact(f.store, f.run.id)!;
      expect(artifact).toMatchObject({ mode: "enforce", rev: "rev-1", parked: false, epochId: result.epoch.id });
      expect((artifact.blocked as Array<{ key: string }>).map((row) => row.key)).toEqual([REGISTRY]);
      expect((artifact.deferred as Array<{ key: string; unmet: unknown[] }>)).toMatchObject([{ key: CALLER, unmet: [KOOPA] }]);
      expect(readinessBoardFields(f.store, f.run.id)).toMatchObject({ blocked: [{ key: REGISTRY }], deferred: [{ key: CALLER }] });

      f.store.db.query("UPDATE epoch_targets SET status = 'finished' WHERE epoch_id = ?").run(result.epoch.id);
      expect(schedulerEpochProgress(f.store, result.epoch.id)).toMatchObject({ admitted: 2, remaining: 0 });
    } finally {
      f.store.db.close();
    }
  });

  test("blocked-only parks before any epoch exists, records it once, and survives a restart", () => {
    const f = fixture([registryFn]);
    const blocked = readinessFor("enforce", { [REGISTRY]: notReady("blocked") });
    let reopened: StateStore | null = null;
    try {
      const result = admit(f, blocked);
      expect(isReadinessBlockedOnly(result)).toBe(true);
      if (!isReadinessBlockedOnly(result)) return;
      expect(result.blocked.map((row) => row.key)).toEqual([REGISTRY]);
      expect(count(f.store, "SELECT COUNT(*) AS count FROM epochs WHERE run_id = ?", f.run.id)).toBe(0);
      expect(count(f.store, "SELECT COUNT(*) AS count FROM jobs WHERE kind = 'worker'")).toBe(0);
      const events = parkedEvents(f.store, f.run.id);
      expect(events).toHaveLength(1);
      expect(events[0]?.handled_at).not.toBeNull();
      expect(JSON.parse(events[0]!.payload_json)).toMatchObject({ reason: "readiness_blocked_only", blocked: [REGISTRY], rev: "rev-1" });
      expect(latestReadinessArtifact(f.store, f.run.id)).toMatchObject({ parked: true });

      // Retrying with unchanged readiness stays parked without duplicate records.
      expect(isReadinessBlockedOnly(admit(f, blocked))).toBe(true);
      expect(parkedEvents(f.store, f.run.id)).toHaveLength(1);

      // Restart: a fresh store sees the same parked state and still creates no epoch.
      f.store.db.close();
      reopened = openState(f.dir);
      const again = ensureSchedulerEpochFromBoard({ config: { workerPoolSize: 1 }, globals: globalsFor(f.dir), graphDbPath: f.graphDbPath, runId: f.run.id, store: reopened, readiness: blocked });
      expect(isReadinessBlockedOnly(again)).toBe(true);
      expect(count(reopened, "SELECT COUNT(*) AS count FROM epochs WHERE run_id = ?", f.run.id)).toBe(0);
      expect(parkedEvents(reopened, f.run.id)).toHaveLength(1);
    } finally {
      (reopened ?? f.store).db.close();
    }
  });

  test("resume recomputes readiness: once the class is ready the registry function is admitted", () => {
    const f = fixture([registryFn]);
    try {
      expect(isReadinessBlockedOnly(admit(f, readinessFor("enforce", { [REGISTRY]: notReady("blocked") })))).toBe(true);
      const unblocked = admit(f, readinessFor("enforce", { [REGISTRY]: { state: "ready", unmet: [], unresolved: [] } }, "rev-2"));
      if (isReadinessBlockedOnly(unblocked)) throw new Error("expected an epoch");
      expect(unblocked.admission?.admitted).toBe(1);
      expect(latestReadinessArtifact(f.store, f.run.id)).toMatchObject({ rev: "rev-2", parked: false, blocked: [] });
    } finally {
      f.store.db.close();
    }
  });

  test("enforce with readiness unavailable parks gated functions and admits the rest", () => {
    const f = fixture([registryFn, plainFn]);
    try {
      const result = admit(f, { mode: "enforce", gatedPaths: GATED, rev: "rev-1", load: { ok: false, kind: "timeout", error: "timeout: slow" } });
      if (isReadinessBlockedOnly(result)) throw new Error("expected an epoch");
      expect(result.admission?.admitted).toBe(1);
      expect(latestReadinessArtifact(f.store, f.run.id)).toMatchObject({ unavailable: "timeout: slow", blocked: [{ key: REGISTRY, reason: "readiness_unavailable" }] });
    } finally {
      f.store.db.close();
    }
  });

  test("shadow admits everything in report order and only records would-block / would-defer", () => {
    const f = fixture([registryFn, callerFn, plainFn]);
    try {
      const result = admit(f, readinessFor("shadow", { [REGISTRY]: notReady("blocked"), [CALLER]: notReady("deferred"), [PLAIN]: READY }));
      if (isReadinessBlockedOnly(result)) throw new Error("expected an epoch");
      const keys = (f.store.db.query("SELECT target_key FROM epoch_targets WHERE epoch_id = ? ORDER BY admission_index").all(result.epoch.id) as Array<{ target_key: string }>).map((row) => row.target_key);
      expect(keys).toEqual([REGISTRY, CALLER, PLAIN]);
      const artifact = latestReadinessArtifact(f.store, f.run.id)!;
      expect((artifact.wouldBlock as Array<{ key: string }>).map((row) => row.key)).toEqual([REGISTRY]);
      expect((artifact.wouldDefer as Array<{ key: string }>).map((row) => row.key)).toEqual([CALLER]);
      expect(artifact.blocked).toEqual([]);
    } finally {
      f.store.db.close();
    }
  });

  test("without readiness, admission and stored state are unchanged (Melee)", () => {
    const f = fixture([registryFn, plainFn]);
    try {
      const result = admit(f);
      if (isReadinessBlockedOnly(result)) throw new Error("expected an epoch");
      expect(result.admission?.admitted).toBe(2);
      expect(count(f.store, "SELECT COUNT(*) AS count FROM epoch_targets WHERE reason IS NOT NULL")).toBe(0);
      expect(count(f.store, "SELECT COUNT(*) AS count FROM dashboard_artifacts WHERE artifact_type = 'readiness'")).toBe(0);
      expect(readinessBoardFields(f.store, f.run.id)).toEqual({});
    } finally {
      f.store.db.close();
    }
  });

  test("refreshReadinessArtifact records readiness at a new revision without creating an epoch", () => {
    const f = fixture([registryFn, plainFn]);
    try {
      const recorded = refreshReadinessArtifact({ globals: globalsFor(f.dir), graphDbPath: f.graphDbPath, runId: f.run.id, store: f.store,
        readiness: readinessFor("enforce", { [REGISTRY]: notReady("blocked"), [PLAIN]: READY }, "rev-after-sync") });
      expect(recorded).toBe(true);
      expect(count(f.store, "SELECT COUNT(*) AS count FROM epochs WHERE run_id = ?", f.run.id)).toBe(0);
      expect(latestReadinessArtifact(f.store, f.run.id)).toMatchObject({ rev: "rev-after-sync", parked: false, blocked: [{ key: REGISTRY }] });
    } finally {
      f.store.db.close();
    }
  });

  test("the scheduler tick loads readiness itself and handles blocked-only without creating an epoch", async () => {
    const f = fixture([registryFn]);
    addEvent(f.store, f.run.id, "worker_finished", "test", { created_by: "test" });
    f.store.db.close();
    const game = {
      matching: { stackFramePolicy: "match_frame", steeringGate: "shadow" },
      ordering: { mode: "enforce", gatedPaths: GATED },
      validation: { reportPath: "build/GALE01/report.json" },
    } as unknown as ResolvedGame;
    const { rev } = writeReadinessRepo(f.dir, { version: "GALE01", units: ["main/System/MarNameRefGen_Enemy"] });
    const calls: string[][] = [];
    const result = await runSchedulerTick(globalsFor(f.dir, game), new Map<string, string | true>([["--run-id", f.run.id], ["--graph-db", f.graphDbPath]]), {
      readinessRev: rev,
      readinessRunner: async (args) => {
        calls.push(args);
        const arg = (flag: string) => args[args.indexOf(flag) + 1]!;
        const probe = expectedReadinessIdentity({ repoRoot: arg("--repo"), rev: arg("--rev"), version: arg("--version"), policy: JSON.parse(arg("--policy-json")) });
        if (!probe.ok) throw new Error(probe.error);
        return {
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify({
            identity: probe.identity,
            functions: { [REGISTRY]: { state: "blocked", unmet: [KOOPA], unresolved: [] } },
            summary: { blocked: 1, deferred: 0, ready: 0, unresolved_classes: 0 },
          }),
        };
      },
    });
    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({ status: "readiness_blocked_only", readinessBlocked: 1, schedulerTargetUpdates: 0 });
    const store = openState(f.dir);
    try {
      expect(count(store, "SELECT COUNT(*) AS count FROM epochs WHERE run_id = ?", f.run.id)).toBe(0);
      expect(count(store, "SELECT COUNT(*) AS count FROM events WHERE id = ? AND handled_at IS NOT NULL", String(result.handledEvent))).toBe(1);
      expect(latestReadinessArtifact(store, f.run.id)).toMatchObject({ rev, parked: true, unavailable: null, identity: { rev, version: "GALE01" } });
    } finally {
      store.db.close();
    }
  });
});
