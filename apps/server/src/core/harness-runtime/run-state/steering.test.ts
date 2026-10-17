import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState } from "@server/core/orchestrator-state";
import {
  latestCleanSteeringBackfillRun,
  latestSteeringBackfill,
  latestSteeringProbe,
  latestSteeringRollback,
  listSteeringBackfill,
  listSteeringRollbacks,
  recordSteeringBackfill,
  recordSteeringBackfillRun,
  recordSteeringCoverage,
  recordSteeringObservation,
  recordSteeringRollback,
  steeringCoverageFor,
  steeringCoverageReport,
  steeringObservation,
} from "./steering.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function withStore(run: (store: ReturnType<typeof openState>) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "steering-state-"));
  dirs.push(dir);
  const store = openState(dir);
  try {
    run(store);
  } finally {
    store.db.close();
  }
}

const target = { gameId: "sms", unit: "mario/Enemy/x", symbol: "T::f" };

describe("steering run-state", () => {
  test("latest probe follows the newest observation and the function source hash", () => {
    withStore((store) => {
      recordSteeringObservation(store, { ...target, verdict: "steering_located", mode: "shadow", functionSourceSha: "old", probe: { function: "T::f", unit: target.unit, n: 1 } });
      recordSteeringObservation(store, { ...target, verdict: "steering_located", mode: "shadow", functionSourceSha: "new", probe: { function: "T::f", unit: target.unit, n: 2 } });
      recordSteeringObservation(store, { ...target, verdict: "pass", mode: "shadow", functionSourceSha: "new", probe: null });
      expect(latestSteeringProbe(store, target)?.n).toBe(2);
      expect(latestSteeringProbe(store, { ...target, functionSourceSha: "old" })?.n).toBe(1);
      expect(latestSteeringProbe(store, { ...target, functionSourceSha: "other" })).toBeNull();
      expect(latestSteeringProbe(store, { ...target, symbol: "T::g" })).toBeNull();
    });
  });

  test("backfill rows upsert per function and coverage is bound to its baseline", () => {
    withStore((store) => {
      recordSteeringBackfill(store, { ...target, analyzedRev: "r1", verdict: "steering_located", report: { a: 1 } });
      recordSteeringBackfill(store, { ...target, analyzedRev: "r2", verdict: "pass", applied: true, appliedRev: "r2" });
      expect(listSteeringBackfill(store, "sms")).toMatchObject([{ ...target, unit: "Enemy/x", analyzedRev: "r2", verdict: "pass", applied: true, appliedRev: "r2", report: {} }]);
      expect(listSteeringBackfill(store, "sms", "other")).toEqual([]);

      expect(steeringCoverageFor(store, "sms", target.unit)).toBeNull();
      recordSteeringCoverage(store, { gameId: "sms", unit: target.unit, analyzedRev: "r1", baselineRev: "b1", clean: false });
      expect(steeringCoverageFor(store, "sms", target.unit)).toEqual({ baselineRev: "b1", clean: false, analyzedRev: "r1" });
      recordSteeringCoverage(store, { gameId: "sms", unit: target.unit, analyzedRev: "r2", baselineRev: "b2", clean: true, applied: true });
      expect(steeringCoverageFor(store, "sms", target.unit)).toEqual({ baselineRev: "b2", clean: true, analyzedRev: "r2" });
    });
  });

  test("only clean backfill runs count for the enforce prerequisite, newest first", () => {
    withStore((store) => {
      expect(latestCleanSteeringBackfillRun(store, "sms")).toBeNull();
      recordSteeringBackfillRun(store, { gameId: "sms", baselineRev: "b1", clean: true });
      recordSteeringBackfillRun(store, { gameId: "sms", baselineRev: "b2", clean: false });
      expect(latestCleanSteeringBackfillRun(store, "sms")?.baselineRev).toBe("b1");
      recordSteeringBackfillRun(store, { gameId: "sms", baselineRev: "b3", clean: true });
      expect(latestCleanSteeringBackfillRun(store, "sms")?.baselineRev).toBe("b3");
      expect(latestCleanSteeringBackfillRun(store, "melee")).toBeNull();
    });
  });

  test("a store behind migration 013 reads empty and ignores writes", () => {
    withStore((store) => {
      store.db.exec("DROP TABLE steering_observations; DROP TABLE steering_backfill; DROP TABLE steering_backfill_coverage; DROP TABLE steering_backfill_runs");
      recordSteeringObservation(store, { ...target, verdict: "pass", mode: "shadow" });
      recordSteeringBackfill(store, { ...target, analyzedRev: "r", verdict: "pass" });
      recordSteeringCoverage(store, { gameId: "sms", unit: target.unit, analyzedRev: "r", baselineRev: "b", clean: true });
      recordSteeringBackfillRun(store, { gameId: "sms", baselineRev: "b", clean: true });
      expect(latestSteeringProbe(store, target)).toBeNull();
      expect(listSteeringBackfill(store, "sms")).toEqual([]);
      expect(steeringCoverageFor(store, "sms", target.unit)).toBeNull();
      expect(latestCleanSteeringBackfillRun(store, "sms")).toBeNull();
    });
  });
});

describe("steering run-state unit names (gate units vs report units)", () => {
  const rollback = { analyzedRev: "r1", initialVerdict: "steering_located", finalVerdict: "pass", rules: ["steering"], report: {} };

  test("SMS: a report-named (mario/) write is stored canonical and found by either spelling", () => {
    withStore((store) => {
      const observation = recordSteeringObservation(store, { ...target, verdict: "steering_located", mode: "enforce", probe: { function: "T::f", unit: "Enemy/x" } })!;
      recordSteeringBackfill(store, { ...target, analyzedRev: "r1", verdict: "unresolved" });
      recordSteeringCoverage(store, { gameId: "sms", unit: target.unit, analyzedRev: "r1", baselineRev: "b1", clean: true, report: { built: true } });
      recordSteeringRollback(store, { ...target, ...rollback });
      expect(steeringObservation(store, observation)?.unit).toBe("Enemy/x");
      expect(store.db.query("SELECT DISTINCT unit FROM steering_backfill UNION SELECT unit FROM steering_rollbacks UNION SELECT unit FROM steering_backfill_coverage UNION SELECT unit FROM steering_observations").all())
        .toEqual([{ unit: "Enemy/x" }]);
      for (const unit of ["Enemy/x", "mario/Enemy/x"]) {
        expect(latestSteeringProbe(store, { gameId: "sms", unit, symbol: "T::f" })).toMatchObject({ unit: "Enemy/x" });
        expect(latestSteeringBackfill(store, { gameId: "sms", unit, symbol: "T::f" })).toMatchObject({ unit: "Enemy/x", verdict: "unresolved" });
        expect(listSteeringBackfill(store, "sms", unit)).toHaveLength(1);
        expect(steeringCoverageFor(store, "sms", unit)).toEqual({ baselineRev: "b1", clean: true, analyzedRev: "r1" });
        expect(steeringCoverageReport(store, "sms", unit)).toEqual({ built: true });
        expect(latestSteeringRollback(store, { gameId: "sms", unit, symbol: "T::f" })).toMatchObject({ unit: "Enemy/x", finalVerdict: "pass" });
        expect(listSteeringRollbacks(store, "sms", unit)).toHaveLength(1);
      }
      expect(latestSteeringBackfill(store, { gameId: "sms", unit: "Enemy/y", symbol: "T::f" })).toBeNull();
      expect(steeringCoverageFor(store, "sms", "mario/Enemy/y")).toBeNull();
    });
  });

  test("SMS: a legacy prefixed row is read by the short unit and the next upsert keeps one canonical row", () => {
    withStore((store) => {
      store.db.query(`INSERT INTO steering_backfill (game_id, unit, symbol, analyzed_rev, verdict, applied, report_json, recorded_at)
                      VALUES ('sms', 'mario/Enemy/x', 'T::f', 'r0', 'unresolved', 0, '{}', '2026-01-01T00:00:00.000Z')`).run();
      store.db.query(`INSERT INTO steering_backfill_coverage (game_id, unit, analyzed_rev, baseline_rev, clean, applied, report_json, recorded_at)
                      VALUES ('sms', 'mario/Enemy/x', 'r0', 'b0', 0, 0, '{}', '2026-01-01T00:00:00.000Z')`).run();
      expect(latestSteeringBackfill(store, { gameId: "sms", unit: "Enemy/x", symbol: "T::f" })).toMatchObject({ unit: "Enemy/x", analyzedRev: "r0" });
      expect(steeringCoverageFor(store, "sms", "Enemy/x")).toEqual({ baselineRev: "b0", clean: false, analyzedRev: "r0" });
      recordSteeringBackfill(store, { gameId: "sms", unit: "Enemy/x", symbol: "T::f", analyzedRev: "r1", verdict: "pass" });
      recordSteeringCoverage(store, { gameId: "sms", unit: "Enemy/x", analyzedRev: "r1", baselineRev: "b1", clean: true });
      expect(store.db.query("SELECT unit, analyzed_rev FROM steering_backfill").all()).toEqual([{ unit: "Enemy/x", analyzed_rev: "r1" }]);
      expect(store.db.query("SELECT unit, analyzed_rev FROM steering_backfill_coverage").all()).toEqual([{ unit: "Enemy/x", analyzed_rev: "r1" }]);
    });
  });

  test("Melee (no module prefixes): units are stored and matched exactly as written", () => {
    withStore((store) => {
      const melee = { gameId: "melee", unit: "mario/Enemy/x", symbol: "T::f" };
      recordSteeringBackfill(store, { ...melee, analyzedRev: "r1", verdict: "pass" });
      recordSteeringCoverage(store, { gameId: "melee", unit: melee.unit, analyzedRev: "r1", baselineRev: "b1", clean: true });
      recordSteeringRollback(store, { ...melee, ...rollback });
      expect(latestSteeringBackfill(store, melee)).toMatchObject({ unit: "mario/Enemy/x" });
      expect(latestSteeringRollback(store, melee)).toMatchObject({ unit: "mario/Enemy/x" });
      expect(steeringCoverageFor(store, "melee", melee.unit)).toMatchObject({ baselineRev: "b1" });
      expect(latestSteeringBackfill(store, { ...melee, unit: "Enemy/x" })).toBeNull();
      expect(latestSteeringRollback(store, { ...melee, unit: "Enemy/x" })).toBeNull();
      expect(steeringCoverageFor(store, "melee", "Enemy/x")).toBeNull();
    });
  });
});
