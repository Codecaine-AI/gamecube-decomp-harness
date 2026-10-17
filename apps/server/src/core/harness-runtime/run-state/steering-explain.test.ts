import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  claimSteeringExplainJobs,
  failSteeringExplainJob,
  finishSteeringExplainJob,
  liveSweepExplainJob,
  listSteeringExplainJobs,
  queueSteeringExplainJob,
  releaseSteeringExplainJob,
  retrySteeringExplainJob,
  singleChangeUnverifiedKeys,
  steeringExplainJob,
} from "./steering-explain.js";
import { recordSteeringObservation, setSteeringObservationProbe, steeringObservation } from "./steering.js";
import { unitKeyedHas } from "./unit-key.js";
import { recordUnverifiedMatch } from "./unverified-matches.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function withStore(run: (store: StateStore) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "steering-explain-state-"));
  dirs.push(dir);
  const store = openState(dir);
  try {
    run(store);
  } finally {
    store.db.close();
  }
}

const target = { gameId: "sms", unit: "mario/Enemy/x", symbol: "f__1TFv" };
/** The steering state stores the gate's unit: the report's without the `mario/` module prefix. */
const GATE_UNIT = "Enemy/x";
const job = (observationId: number, inputHash = "h1") => ({ ...target, observationId, inputHash, toolHash: "t1" });
const T0 = new Date("2026-10-17T00:00:00.000Z");
const later = (ms: number) => new Date(T0.getTime() + ms);
const claimBy = (owner: string, extra: Partial<Parameters<typeof claimSteeringExplainJobs>[1]> = {}) =>
  ({ limit: 5, maxAttempts: 2, owner, leaseMs: 1_000, now: T0, ...extra });

describe("steering explain jobs", () => {
  test("queueing is idempotent on (observation, input hash, tool hash)", () => {
    withStore((store) => {
      const first = queueSteeringExplainJob(store, { ...job(1), variant: "global", fidelity: { input_hash: "h1" }, inputs: { edits: "/e.json" } });
      expect(first).toEqual({ id: expect.any(Number), queued: true });
      expect(queueSteeringExplainJob(store, job(1))).toEqual({ id: first.id, queued: false });
      expect(queueSteeringExplainJob(store, job(1, "h2")).queued).toBe(true);
      const row = steeringExplainJob(store, first.id!);
      expect(row).toMatchObject({ status: "queued", attempts: 0, source: "observation", label: "gate", variant: "global", fidelity: { input_hash: "h1" }, inputs: { edits: "/e.json" } });
      expect(listSteeringExplainJobs(store, { gameId: "sms" })).toHaveLength(2);
    });
  });

  test("a claim takes each queued row once under its owner, and retries stop at maxAttempts", () => {
    withStore((store) => {
      const { id } = queueSteeringExplainJob(store, job(1));
      queueSteeringExplainJob(store, job(2));
      const claimed = claimSteeringExplainJobs(store, claimBy("a", { gameId: "sms", limit: 1 }));
      expect(claimed.map((row) => [row.id, row.status, row.attempts, row.claimOwner, row.claimExpiresAt])).toEqual([[id!, "running", 1, "a", later(1_000).toISOString()]]);
      expect(claimSteeringExplainJobs(store, claimBy("a")).map((row) => row.observationId)).toEqual([2]);
      expect(claimSteeringExplainJobs(store, claimBy("b"))).toEqual([]);

      expect(retrySteeringExplainJob(store, id!, { error: "boom", maxAttempts: 2, owner: "b" })).toBeNull();
      expect(retrySteeringExplainJob(store, id!, { error: "boom", maxAttempts: 2, owner: "a" })).toBe("queued");
      expect(claimSteeringExplainJobs(store, claimBy("a", { observationId: 1 })).map((row) => row.attempts)).toEqual([2]);
      expect(retrySteeringExplainJob(store, id!, { error: "boom again", maxAttempts: 2, owner: "a" })).toBe("failed");
      expect(steeringExplainJob(store, id!)).toMatchObject({ status: "failed", error: "boom again", attempts: 2 });
    });
  });

  test("a dead runner's claim is reclaimed after its lease; the first owner's late finish is refused and leaves the probe", () => {
    withStore((store) => {
      const observationId = recordSteeringObservation(store, { ...target, verdict: "unresolved", mode: "enforce", probe: { function: "f", unit: target.unit } })!;
      const { id } = queueSteeringExplainJob(store, { ...job(observationId), fidelity: { input_hash: "h1" } });
      expect(claimSteeringExplainJobs(store, claimBy("dead", { maxAttempts: 3 }))).toHaveLength(1);
      // The runner dies: within its lease nobody else takes the job, and it still counts as live.
      expect(claimSteeringExplainJobs(store, claimBy("b", { maxAttempts: 3, now: later(500) }))).toEqual([]);
      const reclaimed = claimSteeringExplainJobs(store, claimBy("b", { maxAttempts: 3, now: later(1_000) }));
      expect(reclaimed.map((row) => [row.id, row.claimOwner, row.attempts])).toEqual([[id!, "b", 2]]);

      const delta = { summary_lines: ["+1 node"], changes: [{}] };
      expect(finishSteeringExplainJob(store, id!, { compilerDelta: { summary_lines: ["stale"], changes: [] }, owner: "dead", probe: () => ({ stale: true }) })).toBe(false);
      expect(failSteeringExplainJob(store, id!, { error: "late", owner: "dead" })).toBe(false);
      expect(steeringObservation(store, observationId)!.probe).toEqual({ function: "f", unit: target.unit });
      expect(finishSteeringExplainJob(store, id!, { compilerDelta: delta, owner: "b", probe: (existing) => ({ ...existing, compiler_delta: delta }) })).toBe(true);
      expect(steeringExplainJob(store, id!)).toMatchObject({ status: "done", compilerDelta: delta, claimExpiresAt: null });
      expect(steeringObservation(store, observationId)!.probe).toEqual({ function: "f", unit: target.unit, compiler_delta: delta });
      expect(finishSteeringExplainJob(store, id!, { compilerDelta: delta, owner: "b" })).toBe(false);
    });
  });

  test("an expired claim at its last attempt fails with a lease error, and a gate job's probe says why", () => {
    withStore((store) => {
      const observationId = recordSteeringObservation(store, { ...target, verdict: "unresolved", mode: "enforce" })!;
      const { id } = queueSteeringExplainJob(store, job(observationId));
      const ablation = queueSteeringExplainJob(store, { ...job(observationId, "h-ab"), label: "ablation" }).id!;
      claimSteeringExplainJobs(store, claimBy("dead", { maxAttempts: 1 }));
      expect(claimSteeringExplainJobs(store, claimBy("b", { maxAttempts: 1, now: later(2_000) }))).toEqual([]);
      expect(steeringExplainJob(store, id!)).toMatchObject({ status: "failed", error: "lease expired" });
      expect(steeringExplainJob(store, ablation)).toMatchObject({ status: "failed", error: "lease expired" });
      expect(steeringObservation(store, observationId)!.probe).toEqual({
        function: target.symbol, symbol: target.symbol, unit: GATE_UNIT, compiler_delta: { unavailable: "explain job failed: lease expired" },
      });
    });
  });

  test("a claim released at shutdown is queued again with its attempt counted, or failed at its last attempt", () => {
    withStore((store) => {
      const observationId = recordSteeringObservation(store, { ...target, verdict: "unresolved", mode: "enforce" })!;
      const { id } = queueSteeringExplainJob(store, job(observationId));
      claimSteeringExplainJobs(store, claimBy("a", { maxAttempts: 2 }));
      expect(releaseSteeringExplainJob(store, id!, { owner: "b", error: "cancelled at shutdown", maxAttempts: 2 })).toBeNull();
      expect(releaseSteeringExplainJob(store, id!, { owner: "a", error: "cancelled at shutdown", maxAttempts: 2 })).toBe("queued");
      expect(steeringExplainJob(store, id!)).toMatchObject({ status: "queued", attempts: 1, claimOwner: null, claimExpiresAt: null, error: "cancelled at shutdown" });
      expect(steeringObservation(store, observationId)!.probe).toBeNull();
      claimSteeringExplainJobs(store, claimBy("a", { maxAttempts: 2 }));
      expect(releaseSteeringExplainJob(store, id!, { owner: "a", error: "cancelled at shutdown", maxAttempts: 2 })).toBe("failed");
      expect(steeringExplainJob(store, id!)).toMatchObject({ status: "failed", attempts: 2 });
      expect(steeringObservation(store, observationId)!.probe).toMatchObject({ compiler_delta: { unavailable: "explain job failed: cancelled at shutdown" } });
    });
  });

  test("a failed gate job never overwrites a measured delta on the probe", () => {
    withStore((store) => {
      const measured = { function: "f", unit: target.unit, compiler_delta: { summary_lines: ["+1 node"], changes: [{}] } };
      const observationId = recordSteeringObservation(store, { ...target, verdict: "unresolved", mode: "enforce", probe: measured })!;
      const { id } = queueSteeringExplainJob(store, job(observationId));
      claimSteeringExplainJobs(store, claimBy("a"));
      expect(failSteeringExplainJob(store, id!, { error: "x", owner: "a" })).toBe(true);
      expect(steeringObservation(store, observationId)!.probe).toEqual(measured);
    });
  });

  test("a live sweep job is found by target, inputs and tool; an expired claim is not live", () => {
    withStore((store) => {
      const { id } = queueSteeringExplainJob(store, { ...job(1), source: "sweep" });
      const key = { ...target, inputHash: "h1", toolHash: "t1" };
      expect(liveSweepExplainJob(store, key)?.id).toBe(id!);
      expect(liveSweepExplainJob(store, { ...key, toolHash: "t2" })).toBeNull();
      expect(liveSweepExplainJob(store, { ...key, label: "ablation" })).toBeNull();
      claimSteeringExplainJobs(store, claimBy("a"));
      expect(liveSweepExplainJob(store, { ...key, now: later(500) })?.id).toBe(id!);
      expect(liveSweepExplainJob(store, { ...key, now: later(1_000) })).toBeNull();
      failSteeringExplainJob(store, id!, { error: "x", owner: "a" });
      expect(liveSweepExplainJob(store, key)).toBeNull();
    });
  });

  test("single-change keys: the latest done sweep gate job measured for the active row's current identity", () => {
    withStore((store) => {
      // The row's report names the gate inputs its verdict came from; a job measured them when its input hash is `h<observation>`.
      const inputsOf = new Map<string, string>();
      const unverified = (symbol: string, sha: string | null = "cur", check = "/reports/check-2.json") => recordUnverifiedMatch(store, {
        gameId: "sms", unit: target.unit, symbol, analyzedRev: "r", baseRev: "trusted", functionSourceSha: sha,
        match: { base: 99, candidate: 100, real_only: 99 }, reasons: [],
        report: { check, base_rev: "base-2", fidelity_input_hash: inputsOf.get(symbol) ?? `inputs-of-${symbol}` },
      });
      // "ablated" has a job but no active row: it never ranks.
      const active = new Set(["one", "two", "unavail", "later", "refreshed", "rechecked", "rebased", "unbound", "attempt", "rerun"]);
      for (const symbol of active) unverified(symbol);
      unverified("unhashed", null);
      const done = (symbol: string, delta: Record<string, unknown>, options: {
        label?: "gate" | "ablation"; sha?: string | null; check?: string; baseRev?: string; bound?: boolean; source?: "sweep" | "observation";
      } = {}) => {
        const observationId = recordSteeringObservation(store, { ...target, symbol, verdict: "unresolved", mode: "shadow", functionSourceSha: options.sha === undefined ? "cur" : options.sha })!;
        const inputHash = `h${observationId}`;
        const { id } = queueSteeringExplainJob(store, {
          ...target, symbol, observationId, inputHash, toolHash: "t", label: options.label ?? "gate", source: options.source ?? "sweep",
          inputs: { check: options.check ?? "/reports/check-2.json" },
          fidelity: { input_hash: options.bound === false ? "other" : inputHash, base_rev: options.baseRev ?? "base-2" },
        });
        claimSteeringExplainJobs(store, { limit: 1, maxAttempts: 3, owner: "o", leaseMs: 60_000, observationId });
        expect(finishSteeringExplainJob(store, id!, { compilerDelta: delta, owner: "o" })).toBe(true);
        if (!active.has(symbol) && symbol !== "unhashed") return;
        inputsOf.set(symbol, inputHash);
        unverified(symbol, symbol === "unhashed" ? null : "cur"); // the backfill row for exactly these inputs
      };
      const one = { summary_lines: ["a"], changes: [{ kind: "x" }] };
      done("one", one);
      done("two", { summary_lines: ["a", "b"], changes: [{}, {}] });
      done("unavail", { unavailable: "reconstruction: missing" });
      done("ablated", one);
      done("later", one);
      done("later", { summary_lines: ["a", "b"], changes: [{}, {}] });
      done("two", one, { label: "ablation" });
      // Old deltas never rank a refreshed target: another source, or the same source with other inputs.
      done("refreshed", one, { sha: "old" });
      done("rechecked", one, { check: "/reports/check-1.json" }); // unchanged source, an older backfill report
      done("rebased", one, { baseRev: "base-1" }); // unchanged source, another base (other headers, other S*)
      done("unbound", one, { bound: false }); // the job's input hash is not its fidelity record's
      done("attempt", one, { source: "observation" }); // a worker attempt's delta measures the attempt, not the row
      done("unhashed", one, { sha: null });
      done("rerun", one);
      // A backfill re-run overwrote the same report path with changed inputs: same source, base and path.
      // Canonical keys; the board's report-named (mario/) key finds them too.
      expect(singleChangeUnverifiedKeys(store, "sms").has(`${GATE_UNIT}::rerun`)).toBe(true);
      expect(unitKeyedHas(singleChangeUnverifiedKeys(store, "sms"), `${target.unit}::rerun`)).toBe(true);
      inputsOf.set("rerun", "inputs-after-rerun");
      unverified("rerun", "cur", "/reports/check-2.json");
      expect([...singleChangeUnverifiedKeys(store, "sms")]).toEqual([`${GATE_UNIT}::one`]);
      expect(unitKeyedHas(singleChangeUnverifiedKeys(store, "sms"), `mario/Enemy/other::one`)).toBe(false);
    });
  });

  test("observations return their id, read back, and take a probe idempotently", () => {
    withStore((store) => {
      const id = recordSteeringObservation(store, { ...target, verdict: "unresolved", mode: "shadow", probe: { function: "f", unit: target.unit } });
      expect(typeof id).toBe("number");
      const probe = { function: "f", unit: target.unit, compiler_delta: { unavailable: "no traced build" } };
      setSteeringObservationProbe(store, id!, probe);
      setSteeringObservationProbe(store, id!, probe);
      expect(steeringObservation(store, id!)).toMatchObject({ id, verdict: "unresolved", probe });
      expect(steeringObservation(store, id! + 100)).toBeNull();
    });
  });

  test("a store behind migration 018 reads empty and ignores writes", () => {
    withStore((store) => {
      store.db.exec("DROP TABLE steering_explain_jobs");
      expect(queueSteeringExplainJob(store, job(1))).toEqual({ id: null, queued: false });
      expect(claimSteeringExplainJobs(store, claimBy("a"))).toEqual([]);
      expect(retrySteeringExplainJob(store, 1, { error: "x", maxAttempts: 3, owner: "a" })).toBeNull();
      expect(finishSteeringExplainJob(store, 1, { compilerDelta: {}, owner: "a" })).toBe(false);
      expect(failSteeringExplainJob(store, 1, { error: "x", owner: "a" })).toBe(false);
      expect(listSteeringExplainJobs(store, { gameId: "sms" })).toEqual([]);
      expect(steeringExplainJob(store, 1)).toBeNull();
      expect(singleChangeUnverifiedKeys(store, "sms").size).toBe(0);
      expect(liveSweepExplainJob(store, { ...target, inputHash: "h", toolHash: "t" })).toBeNull();
    });
  });
});
