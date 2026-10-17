import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { recordSteeringBackfill, recordSteeringCoverage, recordSteeringRollback } from "@server/core/harness-runtime/run-state/steering.js";
import { recordUnverifiedMatch } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { unitFidelityInputs } from "@server/core/validation/jobs/steering-gate.js";
import { steeringUnitCandidates, syncCertificationReader } from "./sync-certification.js";

const dirs: string[] = [];
const stores: StateStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function store(): { store: StateStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "sync-certification-"));
  dirs.push(dir);
  const opened = openState(dir);
  stores.push(opened);
  return { store: opened, dir };
}

const SOURCE = "src/Animal/AnimalBase.cpp";
const REPORT_UNIT = "mario/Animal/AnimalBase";
const STEERING_UNIT = "Animal/AnimalBase";

describe("sync certification reader", () => {
  test("report units map to the steering unit names", () => {
    expect(steeringUnitCandidates(REPORT_UNIT, SOURCE)).toEqual([REPORT_UNIT, STEERING_UNIT]);
    expect(steeringUnitCandidates("main/melee/ty/toy", "src/melee/ty/toy.c")).toEqual(["main/melee/ty/toy", "melee/ty/toy"]);
    // Only the game's known module prefix is stripped: a source path elsewhere still finds the short unit on SMS...
    expect(steeringUnitCandidates(REPORT_UNIT, "src/Animal/Shared.cpp", "sms")).toEqual([REPORT_UNIT, STEERING_UNIT, "Animal/Shared"]);
    // ...and nothing else: Melee keeps its first path component, and no SMS unit loses one that is not `mario`.
    expect(steeringUnitCandidates("main/melee/ty/toy", "src/other.c", "melee")).toEqual(["main/melee/ty/toy", "other"]);
    expect(steeringUnitCandidates(STEERING_UNIT, "src/other.c", "sms")).toEqual([STEERING_UNIT, REPORT_UNIT, "other"]);
  });

  test("certified needs a pass and no hold; unverified, rollback-held, unresolved and never-gated are not", async () => {
    const { store: state, dir } = store();
    recordSteeringBackfill(state, { gameId: "sms", unit: STEERING_UNIT, symbol: "passed", analyzedRev: "rev-A", verdict: "pass" });
    recordSteeringBackfill(state, { gameId: "sms", unit: STEERING_UNIT, symbol: "unresolved", analyzedRev: "rev-A", verdict: "unresolved" });
    recordSteeringBackfill(state, { gameId: "sms", unit: STEERING_UNIT, symbol: "held", analyzedRev: "rev-A", verdict: "pass" });
    recordUnverifiedMatch(state, {
      gameId: "sms", unit: STEERING_UNIT, symbol: "held", analyzedRev: "rev-A", baseRev: "base",
      match: { base: 90, candidate: 100, real_only: 96 }, reasons: ["oracle failed"],
    });
    recordSteeringRollback(state, {
      gameId: "sms", unit: STEERING_UNIT, symbol: "rolled", analyzedRev: "rev-0", initialVerdict: "steering_located", finalVerdict: "pass", rules: ["steering"], report: {},
    });
    // Every revision is ours and every file unchanged: this case is about holds and verdicts.
    const sameEverywhere = (args: string[]) => ({ exitCode: 0, stdout: args[0] === "rev-parse" ? "same" : "" });
    const lookup = await syncCertificationReader(state, { gameId: "sms", steeringGate: "enforce" }, dir, { git: sameEverywhere });
    const status = (symbol: string) => lookup({ unit: REPORT_UNIT, symbol, sourcePath: SOURCE });
    expect(status("passed")).toEqual({ status: "certified", verdict: "pass" });
    expect(status("held")).toEqual({ status: "unverified", verdict: "unverified_match" });
    expect(status("rolled")).toEqual({ status: "rollback_held", verdict: "steering_rollback" });
    expect(status("unresolved")).toEqual({ status: "uncertified", verdict: "unresolved" });
    expect(status("unknown")).toEqual({ status: "never_gated", verdict: null });
  });

  test("only a fresh pass at ours certifies; an ancestor's pass does not, even with unchanged recorded inputs (review H3 #1)", async () => {
    const { store: state, dir } = store();
    const git = (...args: string[]) => {
      const result = Bun.spawnSync(["git", "-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
      return result.stdout.toString().trim();
    };
    const put = (path: string, text: string) => {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), text);
    };
    git("init", "-q", "-b", "main");
    put(SOURCE, "void f()\n{\n}\n");
    git("add", "-A");
    git("commit", "-q", "-m", "A");
    const revA = git("rev-parse", "HEAD");
    const unchangedInputs = { [SOURCE]: createHash("sha256").update("void f()\n{\n}\n").digest("hex") };
    git("checkout", "-q", "-b", "divergent");
    put("include/F.h", "#define X 1\n");
    git("add", "-A");
    git("commit", "-q", "-m", "D");
    const revD = git("rev-parse", "HEAD");
    git("checkout", "-q", "main");
    // B adds a header that may shadow another include path: nothing recorded changed.
    put("include/F.h", "#define X 2\n");
    git("add", "-A");
    git("commit", "-q", "-m", "B");
    const ours = git("rev-parse", "HEAD");

    const record = (unit: string, symbol: string, analyzedRev: string, verdict = "pass") => {
      recordSteeringBackfill(state, { gameId: "sms", unit, symbol, analyzedRev, verdict });
      recordSteeringCoverage(state, { gameId: "sms", unit, analyzedRev, baselineRev: analyzedRev, clean: true, report: { fidelity_inputs: { deps: unchangedInputs } } });
    };
    record("Animal/Fresh", "fresh", ours);
    record("Animal/Ancestor", "ancestor", revA);
    record("Animal/Divergent", "divergent", revD);
    record("Animal/Failed", "failed_at_ours", ours, "unresolved");
    state.db.exec("PRAGMA foreign_keys = OFF");
    state.db.query(`INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, game_id) VALUES ('run', 'x', 0, 1, 'stopped', '2026-01-01', 'sms')`).run();
    // Landed gate-pass certificates: credited only with a bound landed-content proof, integrated at ours.
    const land = (symbol: string, integratedRev: string, proof: Record<string, unknown> | null) => {
      state.db.query(`INSERT INTO epoch_targets (id, epoch_id, run_id, target_key, unit, symbol, source_path, size, baseline_score, priority, admission_index, status, admitted_at)
        VALUES (?, 'e', 'run', ?, ?, ?, ?, 4, 0, 0, 0, 'finished', '2026-01-01')`).run(`t-${symbol}`, `${REPORT_UNIT}::${symbol}`, REPORT_UNIT, symbol, SOURCE);
      state.db.query(`INSERT INTO target_claims (id, run_id, epoch_id, epoch_target_id, worker_id, base_rev, status, claimed_at)
        VALUES (?, 'run', 'e', ?, 'w', 'claim-base', 'closed', '2026-01-01')`).run(`c-${symbol}`, `t-${symbol}`);
      state.db.query(`INSERT INTO worker_checkpoints (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id, attempt_index, validation_time, validation_status, metadata_json)
        VALUES (?, 'w', 'run', 'e', ?, ?, 0, '2026-01-01', 'passed', ?)`).run(`cp-${symbol}`, `t-${symbol}`, `c-${symbol}`, JSON.stringify({ certification: { certified: true, kind: "gate_pass", unit: STEERING_UNIT, symbol, score: 100 } }));
      state.db.query(`INSERT INTO integration_outcomes (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id, worker_checkpoint_id, status, target_key, metadata_json, created_at, updated_at)
        VALUES (?, 'run', 'e', ?, ?, 'w', ?, 'applied', ?, ?, '2026-01-01', '2026-01-01')`).run(`io-${symbol}`, `t-${symbol}`, `c-${symbol}`, `cp-${symbol}`, `${REPORT_UNIT}::${symbol}`, JSON.stringify({
          integrated_rev: integratedRev, pre_apply_rev: "pre-apply",
          ...(proof ? { steering_content_freshness: proof } : {}),
        }));
    };
    const proof = (symbol: string, integratedRev: string, overrides: Record<string, unknown> = {}) => ({
      fresh: true, target_key: `${REPORT_UNIT}::${symbol}`, source_path: SOURCE, claim_base_rev: "claim-base", pre_apply_rev: "pre-apply", integrated_rev: integratedRev, ...overrides,
    });
    land("landed_at_ours", ours, proof("landed_at_ours", ours));
    land("landed_before", revA, proof("landed_before", revA));
    // The gated source A was applied onto changed source B: the landing is not what the gate certified.
    land("landed_stale", ours, proof("landed_stale", ours, { fresh: false }));
    land("landed_unproven", ours, null);
    land("landed_other_base", ours, proof("landed_other_base", ours, { claim_base_rev: "another-base" }));
    land("landed_other_target", ours, proof("landed_other_target", ours, { target_key: `${REPORT_UNIT}::someone_else` }));

    const lookup = await syncCertificationReader(state, { gameId: "sms", steeringGate: "enforce" }, dir, { oursRevision: ours });
    const status = (unit: string, symbol: string) => lookup({ unit: `mario/${unit}`, symbol, sourcePath: `src/${unit}.cpp` });
    expect(status("Animal/Fresh", "fresh")).toEqual({ status: "certified", verdict: "pass" });
    expect(status("Animal/Ancestor", "ancestor")).toEqual({ status: "uncertified", verdict: `pass@${revA.slice(0, 10)} (not a backfill at ours)` });
    expect(status("Animal/Divergent", "divergent").status).toBe("uncertified");
    expect(status("Animal/Failed", "failed_at_ours")).toEqual({ status: "uncertified", verdict: "unresolved" });
    expect(status("Animal/AnimalBase", "landed_at_ours")).toEqual({ status: "certified", verdict: "gate_pass" });
    expect(status("Animal/AnimalBase", "landed_before").status).toBe("never_gated");
    for (const symbol of ["landed_stale", "landed_unproven", "landed_other_base", "landed_other_target"]) {
      expect({ symbol, status: status("Animal/AnimalBase", symbol).status }).toEqual({ symbol, status: "never_gated" });
    }
    const unpinned = await syncCertificationReader(state, { gameId: "sms", steeringGate: "enforce" }, dir, { oursRevision: "0".repeat(40) });
    expect(unpinned({ unit: "mario/Animal/Fresh", symbol: "fresh", sourcePath: "src/Animal/Fresh.cpp" }).status).toBe("uncertified");
  });

  test("the gate still records each unit's candidate compile inputs on its coverage row (audit evidence)", () => {
    const raw = (depfile: string) => ({ mwcc: { fidelity: { units: { [STEERING_UNIT]: {
      builds: { cand: { depfile, deps: { [SOURCE]: "a".repeat(64) }, deps_sha256: "d".repeat(64) } },
      compile: { mw_version: "GC/1.2.5", cflags: "-O4,p", compiler: { sha256: "c".repeat(64) } },
    } } } } });
    expect(unitFidelityInputs(raw("ok"), STEERING_UNIT)).toEqual({
      deps: { [SOURCE]: "a".repeat(64) }, deps_sha256: "d".repeat(64),
      compile: { mw_version: "GC/1.2.5", cflags: "-O4,p", compiler_sha256: "c".repeat(64) },
    });
    expect(unitFidelityInputs(raw("depfile not written"), STEERING_UNIT)).toBeNull();
    expect(unitFidelityInputs({}, STEERING_UNIT)).toBeNull();
  });

  test("a game without an active gate certifies nothing (Melee)", async () => {
    const { store: state, dir } = store();
    recordSteeringBackfill(state, { gameId: "melee", unit: "melee/ty/toy", symbol: "fn", analyzedRev: "rev-A", verdict: "pass" });
    for (const steeringGate of ["off", undefined]) {
      const lookup = await syncCertificationReader(state, { gameId: "melee", steeringGate }, dir);
      expect(lookup({ unit: "main/melee/ty/toy", symbol: "fn", sourcePath: "src/melee/ty/toy.c" }).status).toBe("never_gated");
    }
  });
});
