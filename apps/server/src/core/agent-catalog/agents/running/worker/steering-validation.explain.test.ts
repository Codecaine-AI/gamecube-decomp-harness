import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { listSteeringExplainJobs, queueSteeringExplainJob } from "@server/core/harness-runtime/run-state/steering-explain.js";
import { latestSteeringProbe } from "@server/core/harness-runtime/run-state/steering.js";
import { steeringExplainToolHash } from "@server/core/harness-runtime/run-state/steering-explain-tool-hash.js";
import type { SteeringFunctionDecision, WorkerSteeringResult } from "@server/core/validation/steering/steering-check.js";
import { recordWorkerSteeringObservations } from "./steering-validation.js";

const UNIT = "mario/Enemy/x";
const SYMBOL = "f__1TFv";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function withStore(run: (store: StateStore, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "steering-explain-hook-"));
  dirs.push(dir);
  const store = openState(dir);
  try {
    run(store, dir);
  } finally {
    store.db.close();
  }
}

function fn(name: string, decision: SteeringFunctionDecision["decision"], extra: Partial<SteeringFunctionDecision> = {}): SteeringFunctionDecision {
  return { unit: UNIT, name, decision, semantic: "unresolved", analysis: "complete", audit_label: decision, match: { base: 99, candidate: 100, real_only: 99 }, ...extra };
}

function result(functions: SteeringFunctionDecision[], artifactPath: string | null = "/out/attempt-2.steering.json"): WorkerSteeringResult {
  return {
    mode: "enforce", error: null, artifactPath, durationMs: 5,
    decision: { attempt: "unresolved", reasons: [], removable_noncosmetic: [], functions, probes: [] },
  };
}

const FIDELITY = { schema: "steering-function-fidelity-v1", input_hash: "fid-1", complete: true, edits_hash: "e1" };

describe("recordWorkerSteeringObservations queues compiler-delta explain jobs", () => {
  test("a non-pass decide row queues exactly one job keyed by its fidelity input hash; pass rows queue none", () => {
    withStore((store) => {
      const rows = [fn(SYMBOL, "unresolved", { sstar_variant: "evidence_sstar", fidelity: FIDELITY }), fn("g__Fv", "pass")];
      expect(recordWorkerSteeringObservations(store, { result: result(rows), gameId: "sms", unit: UNIT, symbol: SYMBOL, baseRev: "rev-1" })).toBe(2);
      const jobs = listSteeringExplainJobs(store, { gameId: "sms" });
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        unit: "Enemy/x", symbol: SYMBOL, inputHash: "fid-1", toolHash: steeringExplainToolHash(), // stored without `mario/` variant: "evidence_sstar", status: "queued",
        source: "observation", label: "gate", fidelity: FIDELITY,
        inputs: { edits: "/out/attempt-2.steering.edits.json", mwcc: "/out/attempt-2.steering.mwcc.json", decision: "/out/attempt-2.steering.decision.json", baseRev: "rev-1" },
      });
      // The same (observation, inputs, tool) never duplicates.
      expect(queueSteeringExplainJob(store, { observationId: jobs[0]!.observationId, gameId: "sms", unit: UNIT, symbol: SYMBOL, inputHash: "fid-1", toolHash: jobs[0]!.toolHash }).queued).toBe(false);
      // Each recording is a new observation, so a second attempt queues its own job.
      recordWorkerSteeringObservations(store, { result: result(rows), gameId: "sms", unit: UNIT, symbol: SYMBOL, baseRev: "rev-1" });
      const again = listSteeringExplainJobs(store, { gameId: "sms" });
      expect(again).toHaveLength(2);
      expect(again[1]!.observationId).not.toBe(again[0]!.observationId);
    });
  });

  test("without a fidelity record the input hash falls back to the edits hash", () => {
    withStore((store, dir) => {
      const artifact = join(dir, "attempt-0.steering.json");
      writeFileSync(join(dir, "attempt-0.steering.edits.json"), JSON.stringify({ edits_hash: "abc" }));
      recordWorkerSteeringObservations(store, { result: result([fn(SYMBOL, "steering_located")], artifact), gameId: "sms", unit: UNIT, symbol: SYMBOL });
      const [job] = listSteeringExplainJobs(store, { gameId: "sms" });
      expect(job).toMatchObject({ inputHash: createHash("sha256").update("no-fidelity:abc").digest("hex"), variant: null, fidelity: {} });
    });
  });

  test("a decision-less result and an all-pass result queue none", () => {
    withStore((store) => {
      const failed: WorkerSteeringResult = { mode: "enforce", error: "budget", artifactPath: null, durationMs: 1, decision: null };
      expect(recordWorkerSteeringObservations(store, { result: failed, gameId: "sms", unit: UNIT, symbol: SYMBOL })).toBe(1);
      recordWorkerSteeringObservations(store, { result: result([fn(SYMBOL, "pass")]), gameId: "sms", unit: UNIT, symbol: SYMBOL });
      expect(listSteeringExplainJobs(store, { gameId: "sms" })).toEqual([]);
    });
  });

  test("a store behind migration 018 still records the observations", () => {
    withStore((store) => {
      store.db.exec("DROP TABLE steering_explain_jobs");
      expect(recordWorkerSteeringObservations(store, { result: result([fn(SYMBOL, "unresolved", { fidelity: FIDELITY })]), gameId: "sms", unit: UNIT, symbol: SYMBOL })).toBe(1);
      expect(store.db.query("SELECT COUNT(*) AS count FROM steering_observations").get()).toEqual({ count: 1 });
    });
  });

  test("a trusted-base rejection after a claim-base pass records its own observation, queues its explain job, and owns the target's probe", () => {
    withStore((store) => {
      const claimBase = result([fn(SYMBOL, "pass")], "/out/attempt-3.steering.json");
      claimBase.decision!.attempt = "pass";
      const trustedProbe = { function: "T::f", symbol: SYMBOL, unit: UNIT, hypotheses: [{ cause: "trusted base" }] };
      const trustedFidelity = { ...FIDELITY, input_hash: "fid-trusted", base_rev: "trusted-rev" };
      const trusted = result([fn(SYMBOL, "unresolved", { sstar_variant: "global", fidelity: trustedFidelity })], "/out/unverified-baseline/attempt-3.steering.json");
      trusted.decision!.probes = [trustedProbe];
      const recorded = recordWorkerSteeringObservations(store, {
        result: claimBase, gameId: "sms", unit: UNIT, symbol: SYMBOL, runId: "run-1", attemptRef: "cp-1", baseRev: "claim-rev", sourceSha: "sha-1",
        trustedBaseline: { result: trusted, trustedBaseRev: "trusted-rev" },
      });
      // The return value counts the claim-base run's rows.
      expect(recorded).toBe(1);
      const observations = store.db.query("SELECT id, base_rev, verdict, run_id, attempt_ref, function_source_sha FROM steering_observations ORDER BY id").all();
      expect(observations).toEqual([
        { id: expect.any(Number), base_rev: "claim-rev", verdict: "pass", run_id: "run-1", attempt_ref: "cp-1", function_source_sha: "sha-1" },
        { id: expect.any(Number), base_rev: "trusted-rev", verdict: "unresolved", run_id: "run-1", attempt_ref: "cp-1", function_source_sha: "sha-1" },
      ]);
      const jobs = listSteeringExplainJobs(store, { gameId: "sms" });
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        observationId: (observations[1] as { id: number }).id, inputHash: "fid-trusted", fidelity: trustedFidelity,
        inputs: {
          edits: "/out/unverified-baseline/attempt-3.steering.edits.json", mwcc: "/out/unverified-baseline/attempt-3.steering.mwcc.json",
          decision: "/out/unverified-baseline/attempt-3.steering.decision.json", baseRev: "trusted-rev",
        },
      });
      expect(latestSteeringProbe(store, { gameId: "sms", unit: UNIT, symbol: SYMBOL, functionSourceSha: "sha-1" })).toEqual(trustedProbe);
    });
  });
});
