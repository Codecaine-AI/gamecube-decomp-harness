import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { listSteeringExplainJobs } from "@server/core/harness-runtime/run-state/steering-explain.js";
import { steeringObservation } from "@server/core/harness-runtime/run-state/steering.js";
import { recordUnverifiedMatch } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { runSteeringUnverifiedSweep } from "./steering-unverified-sweep.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const UNIT = "mario/Enemy/x";
const OLD_UNIT = "dolphin/os/OSOld";
/** Unverified rows (and the jobs and observations queued for them) carry the gate's unit, without `mario/`. */
const GATE_UNIT = "Enemy/x";

function fidelity(name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "steering-function-fidelity-v1", unit: UNIT, function: name, base_rev: "base", edits_hash: "e1", variant: "global", revert_ids: ["g1"],
    candidate: { build: "cand", obj_sha256: "aaa", deps_sha256: "d1" },
    sstar: { build: "sstar", obj_sha256: "bbb", deps_sha256: "d2", same_as_candidate: false },
    compiler: { mw_version: "GC/1.2.5", sha256: "c1" }, complete: true, problems: [], input_hash: `in-${name}`,
    ...overrides,
  };
}

function decisionRow(unit: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { unit, name, decision: "unresolved", semantic: "unresolved", analysis: "complete", audit_label: "unresolved", match: { base: 99, candidate: 100, real_only: 99 }, ...extra };
}

/** One check report (`{edits, reduce, mwcc, decision}`) covering the four fixture functions, and a CAPABILITIES copy. */
function fixtures(dir: string): { check: string; capabilities: string } {
  const check = join(dir, "check.json");
  writeFileSync(check, JSON.stringify({
    edits: {}, reduce: {},
    mwcc: {
      functions: [
        { unit: UNIT, name: "distinct__Fv", evidence_sstar: { groups: ["g2"], sstar_vs_candidate: "different" } },
        { unit: UNIT, name: "identical__Fv" },
        { unit: UNIT, name: "nofid__Fv" },
        { unit: OLD_UNIT, name: "old__Fv" },
      ],
    },
    decision: {
      attempt: "unresolved",
      functions: [
        decisionRow(UNIT, "distinct__Fv", { sstar_variant: "global", fidelity: fidelity("distinct__Fv") }),
        decisionRow(UNIT, "identical__Fv", { sstar_variant: "global", fidelity: fidelity("identical__Fv", { sstar: { build: "sstar", obj_sha256: "aaa", deps_sha256: "d2", same_as_candidate: true } }) }),
        decisionRow(UNIT, "nofid__Fv"),
        decisionRow(OLD_UNIT, "old__Fv", { sstar_variant: "global", fidelity: fidelity("old__Fv", { unit: OLD_UNIT, compiler: { mw_version: "GC/1.1p1", sha256: "c0" } }) }),
      ],
    },
  }));
  const capabilities = join(dir, "CAPABILITIES.json");
  writeFileSync(capabilities, JSON.stringify({
    schema: "mwcc-native-capabilities-v1",
    versions: {
      "1.1p1": { points: [], unavailable: { coloring: "byte identity failed (4 units differ)" } },
      "1.2.5": { points: ["vreg_identity", "interference", "coloring", "coalescing"], unavailable: {} },
    },
  }));
  return { check, capabilities };
}

function withSweep(run: (store: StateStore, paths: { check: string; capabilities: string }) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "steering-sweep-"));
  dirs.push(dir);
  const paths = fixtures(dir);
  const store = openState(dir);
  try {
    const unverified = (unit: string, symbol: string, check: string | null = paths.check) => recordUnverifiedMatch(store, {
      gameId: "sms", unit, symbol, analyzedRev: "head-1", baseRev: "base", functionSourceSha: `sha-${symbol}`,
      match: { base: 99, candidate: 100, real_only: 99 }, reasons: ["unresolved"],
      report: { base_rev: "base", check, probe: { function: symbol, symbol, unit, hypotheses: [] } },
    });
    unverified(UNIT, "distinct__Fv");
    unverified(UNIT, "identical__Fv");
    unverified(UNIT, "nofid__Fv");
    unverified(OLD_UNIT, "old__Fv");
    unverified(UNIT, "lost__Fv", join(dir, "missing.json"));
    run(store, paths);
  } finally {
    store.db.close();
  }
}

describe("steering-unverified-sweep", () => {
  test("the inventory classes each unverified row and never shows an unavailable one as a delta", () => {
    withSweep((store, paths) => {
      const inventory = runSteeringUnverifiedSweep({ store, gameId: "sms", capabilitiesPath: paths.capabilities });
      expect(inventory).toMatchObject({ schema: "steering-unverified-inventory-v1", gameId: "sms", total: 5, counts: { distinct: 1, identical: 1, unavailable: 3 } });
      const by = Object.fromEntries(inventory.rows.map((row) => [row.symbol, row]));
      expect(by["distinct__Fv"]).toEqual({ unit: GATE_UNIT, symbol: "distinct__Fv", class: "distinct", variant: "global", ablations: [{ variant: "evidence_sstar", label: "ablation" }] });
      expect(by["identical__Fv"]).toMatchObject({ class: "identical", ablations: [] });
      expect(by["nofid__Fv"]).toMatchObject({ class: "unavailable", reason: "no fidelity record" });
      expect(by["old__Fv"]).toMatchObject({ class: "unavailable", reason: "byte identity failed (4 units differ)" });
      expect(by["lost__Fv"]).toMatchObject({ class: "unavailable", reason: expect.stringContaining("check report missing or unreadable") });
      // Inventory alone queues nothing.
      expect(listSteeringExplainJobs(store, { gameId: "sms" })).toEqual([]);
    });
  });

  test("--queue records an observation and queues the gate job for the distinct row only, once", () => {
    withSweep((store, paths) => {
      const inventory = runSteeringUnverifiedSweep({ store, gameId: "sms", capabilitiesPath: paths.capabilities, queue: true });
      expect(inventory.rows.find((row) => row.symbol === "distinct__Fv")!.queued).toEqual({ gate: true, ablations: 0 });
      expect(inventory.rows.filter((row) => row.queued)).toHaveLength(1);
      const jobs = listSteeringExplainJobs(store, { gameId: "sms" });
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        unit: GATE_UNIT, symbol: "distinct__Fv", source: "sweep", label: "gate", variant: "global", inputHash: "in-distinct__Fv",
        inputs: { check: paths.check, baseRev: "base" }, fidelity: { input_hash: "in-distinct__Fv" },
      });
      expect(steeringObservation(store, jobs[0]!.observationId)).toMatchObject({
        unit: GATE_UNIT, symbol: "distinct__Fv", mode: "shadow", verdict: "unresolved", analysis: "complete",
        attemptRef: "unverified-sweep:head-1", baseRev: "base", functionSourceSha: "sha-distinct__Fv",
        probe: { function: "distinct__Fv", unit: UNIT },
      });

      const again = runSteeringUnverifiedSweep({ store, gameId: "sms", capabilitiesPath: paths.capabilities, queue: true });
      expect(again.rows.find((row) => row.symbol === "distinct__Fv")!.queued).toEqual({ gate: false, ablations: 0 });
      expect(listSteeringExplainJobs(store, { gameId: "sms" })).toHaveLength(1);
      expect(store.db.query("SELECT COUNT(*) AS count FROM steering_observations").get()).toEqual({ count: 1 });
    });
  });

  test("--ablations queues each other S* variant as an ablation on the gate job's observation", () => {
    withSweep((store, paths) => {
      runSteeringUnverifiedSweep({ store, gameId: "sms", capabilitiesPath: paths.capabilities, queue: true });
      const later = runSteeringUnverifiedSweep({ store, gameId: "sms", capabilitiesPath: paths.capabilities, queue: true, ablations: true });
      expect(later.rows.find((row) => row.symbol === "distinct__Fv")!.queued).toEqual({ gate: false, ablations: 1 });
      const [gate, ablation] = listSteeringExplainJobs(store, { gameId: "sms" });
      expect(ablation).toMatchObject({
        label: "ablation", variant: "evidence_sstar", observationId: gate!.observationId,
        inputHash: createHash("sha256").update("in-distinct__Fv:evidence_sstar").digest("hex"),
      });
      runSteeringUnverifiedSweep({ store, gameId: "sms", capabilitiesPath: paths.capabilities, queue: true, ablations: true });
      expect(listSteeringExplainJobs(store, { gameId: "sms" })).toHaveLength(2);
    });
  });
});

describe("backfill function report", () => {
  test("keeps the decide row's fidelity input hash, so ranking can tell a re-run's changed inputs", async () => {
    const { parseSteeringDecision } = await import("@server/core/validation/steering/steering-check.js");
    const { steeringFunctionReport } = await import("./steering-gate.js");
    const raw = {
      decision: {
        attempt: "unresolved", reasons: [], removable_noncosmetic: [], probes: [],
        functions: [{ unit: "u1", name: "g", decision: "unresolved", semantic: "unresolved", analysis: "complete", audit_label: "x",
          match: { base: 99, candidate: 100, real_only: 99 }, groups: [], fidelity: { input_hash: "fid-1" } }],
      },
      reduce: { groups: [] },
    };
    const decision = parseSteeringDecision(raw)!;
    const fn = { unit: "u1", name: "g", initial: "unresolved" as const, final: "unresolved" as const, applied: false, match: { base: 99, candidate: 100, real_only: 99 } };
    const report = steeringFunctionReport({ baseRev: "base", initial: { raw, decision, path: "/r/check.json" }, recheck: null, fn, provisional: false, probe: null });
    expect(report.fidelity_input_hash).toBe("fid-1");
    const legacy = { ...raw, decision: { ...raw.decision, functions: [{ ...raw.decision.functions[0]!, fidelity: undefined }] } };
    expect(steeringFunctionReport({ baseRev: "base", initial: { raw: legacy, decision, path: "/r/check.json" }, recheck: null, fn, provisional: false, probe: null }))
      .not.toHaveProperty("fidelity_input_hash");
  });
});
