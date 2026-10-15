import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState } from "@server/core/orchestrator-state";
import {
  latestCleanSteeringBackfillRun,
  latestSteeringProbe,
  listSteeringBackfill,
  recordSteeringBackfill,
  recordSteeringBackfillRun,
  recordSteeringCoverage,
  recordSteeringObservation,
  steeringCoverageFor,
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
      expect(listSteeringBackfill(store, "sms")).toMatchObject([{ ...target, analyzedRev: "r2", verdict: "pass", applied: true, appliedRev: "r2", report: {} }]);
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
