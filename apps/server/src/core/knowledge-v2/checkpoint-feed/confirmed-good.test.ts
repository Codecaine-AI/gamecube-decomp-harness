import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { planRegressionRepair } from "@server/core/harness-runtime/phases/running/epochs/settlement.js";
import { addEvent } from "@server/core/harness-runtime/run-state";
import { readRegressionReport } from "@server/core/validation/objdiff/report.js";

import {
  alwaysAncestor,
  createFeedFixture,
  improvingReport,
  metrics,
  REAL_REPORT_PATH,
  seedCheckpoint,
  seedSettledEpoch,
  writeJson,
  type FeedFixture,
} from "./__fixtures__/feed-fixture.js";
import { confirmationPassRanForEpoch, evaluateConfirmedGood, sha256Hex, type ConfirmedGoodVerdict } from "./confirmed-good.js";

const fixtures: FeedFixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

function fixture(name: string): FeedFixture {
  const f = createFeedFixture(name);
  fixtures.push(f);
  return f;
}

function evaluate(f: FeedFixture, checkpointId: string, isAncestor = alwaysAncestor): Promise<ConfirmedGoodVerdict> {
  return evaluateConfirmedGood(f.store, checkpointId, { repoRoot: f.repoRoot, isAncestor });
}

function rejection(verdict: ConfirmedGoodVerdict): { rule: number; reason: string } {
  if (verdict.confirmed) throw new Error("expected the checkpoint to be excluded");
  return { rule: verdict.rule, reason: verdict.reason };
}

/** An epoch whose frozen report is `report`, with checkpoints for `targets` (unit, function). */
function epochWithReport(
  f: FeedFixture,
  epochId: string,
  report: unknown,
  targets: Array<{ id: string; unit: string; symbol: string }>,
): void {
  const reportChangesPath = writeJson(join(f.root, "epochs", epochId), "report_changes.json", report);
  seedSettledEpoch(f, { id: epochId, runId: "run-a", reportChangesPath });
  for (const target of targets) seedCheckpoint(f, { id: target.id, epochId, runId: "run-a", unit: target.unit, symbol: target.symbol });
}

/** 40 units with one broken function each; function i loses 41 - i percent, so the 35th in byte order loses 6. */
function fortyRegressions(): Record<string, unknown> {
  return {
    units: Array.from({ length: 40 }, (_, index) => {
      const i = index + 1;
      return {
        name: `unit/u${i}`,
        functions: [{ name: `fn_${i}`, from: { fuzzy_match_percent: 100, size: "100" }, to: { fuzzy_match_percent: 100 - (41 - i), size: "100" } }],
      };
    }),
  };
}

describe("confirmed-good selection", () => {
  test("confirmed-good: an applied checkpoint of a settled epoch with no decrease is confirmed, epoch-settled", async () => {
    const f = fixture("happy");
    const { reportChangesPath } = seedSettledEpoch(f, { id: "epoch-1", runId: "run-a" });
    seedCheckpoint(f, { id: "cp-1", epochId: "epoch-1", runId: "run-a" });

    const verdict = await evaluate(f, "cp-1");
    if (!verdict.confirmed) throw new Error(`not confirmed: ${verdict.reason}`);
    expect(verdict.checkpoint).toMatchObject({
      checkpointId: "cp-1",
      integrationId: "integration-cp-1",
      epochId: "epoch-1",
      integratedRev: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      savePointId: "epoch-save-point-epoch-1",
      savePointCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      confirmation: "epoch-settled",
      target: { key: "main/melee/lb/lbsnap::lbSnap_8001DA5C", unit: "main/melee/lb/lbsnap", function: "lbSnap_8001DA5C" },
    });
    expect(verdict.checkpoint.reportChangesSha256).toBe(sha256Hex(readFileSync(reportChangesPath!)));
  });

  test("confirmed-good: rules 1 and 2 need an applied integration with its revision and a completed epoch with its save point", async () => {
    const f = fixture("rules-1-2");
    seedSettledEpoch(f, { id: "epoch-1", runId: "run-a" });
    seedCheckpoint(f, { id: "cp-conflict", epochId: "epoch-1", runId: "run-a", integrationStatus: "conflict" });
    seedCheckpoint(f, { id: "cp-no-rev", epochId: "epoch-1", runId: "run-a", integratedRev: null, symbol: "fn_no_rev" });
    seedSettledEpoch(f, { id: "epoch-open", runId: "run-a", status: "active", closedAt: null });
    seedCheckpoint(f, { id: "cp-open", epochId: "epoch-open", runId: "run-a" });
    seedSettledEpoch(f, { id: "epoch-unsaved", runId: "run-a", savePoint: false });
    seedCheckpoint(f, { id: "cp-unsaved", epochId: "epoch-unsaved", runId: "run-a" });

    expect(rejection(await evaluate(f, "cp-missing"))).toEqual({ rule: 1, reason: "checkpoint-missing" });
    expect(rejection(await evaluate(f, "cp-conflict"))).toEqual({ rule: 1, reason: "integration-not-applied" });
    expect(rejection(await evaluate(f, "cp-no-rev"))).toEqual({ rule: 1, reason: "integrated-rev-missing" });
    expect(rejection(await evaluate(f, "cp-open"))).toEqual({ rule: 2, reason: "epoch-not-settled" });
    expect(rejection(await evaluate(f, "cp-unsaved"))).toEqual({ rule: 2, reason: "save-point-missing" });
  });

  test("confirmed-good: regressed target beyond the requeue limit is excluded", async () => {
    const f = fixture("requeue-limit");
    const report = fortyRegressions();
    epochWithReport(f, "epoch-1", report, [{ id: "cp-35", unit: "unit/u35", symbol: "fn_35" }]);

    // The settlement's repair plan stops at its requeue limit and never names the 35th regression.
    const parsed = await readRegressionReport(writeJson(join(f.root, "parsed"), "report.json", report), "fixture", 50);
    const sourcePaths = new Map(Array.from({ length: 40 }, (_, index) => [`unit/u${index + 1}`, `src/u${index + 1}.c`]));
    const plan = planRegressionRepair(parsed, { pauseThreshold: 0, requeueLimit: 32, sourcePaths });
    expect(plan.repairCandidates).toHaveLength(32);
    expect(plan.repairCandidates.map((candidate) => candidate.symbol)).not.toContain("fn_35");

    const verdict = await evaluate(f, "cp-35");
    expect(rejection(verdict)).toEqual({ rule: 4, reason: "regressed" });
    expect(verdict.confirmed ? null : verdict.detail?.decreases).toEqual([
      { kind: "function", row: "fn_35", metric: "fuzzy_match_percent", from: "100", to: "94" },
    ]);
  });

  test("confirmed-good: regressed entry without a source mapping is excluded", async () => {
    const f = fixture("no-source-map");
    const report = {
      units: [{
        name: "unit/unmapped",
        functions: [{ name: "fn_unmapped", from: { fuzzy_match_percent: 90, size: "64" }, to: { fuzzy_match_percent: 70, size: "64" } }],
      }],
    };
    epochWithReport(f, "epoch-1", report, [{ id: "cp-unmapped", unit: "unit/unmapped", symbol: "fn_unmapped" }]);

    // Without a source path the repair plan skips the regression entirely.
    const parsed = await readRegressionReport(writeJson(join(f.root, "parsed"), "report.json", report), "fixture", 50);
    const plan = planRegressionRepair(parsed, { pauseThreshold: 0, requeueLimit: 32, sourcePaths: new Map() });
    expect(plan.repairCandidates).toEqual([]);

    expect(rejection(await evaluate(f, "cp-unmapped"))).toEqual({ rule: 4, reason: "regressed" });
  });

  test("confirmed-good: a regressed section of the same unit excludes; a reverted integration excludes; a missing report fails closed for the epoch", async () => {
    const f = fixture("section-revert-missing");
    const sectionDrop = improvingReport();
    const unit = (sectionDrop.units as Array<Record<string, unknown>>)[0]!;
    unit.sections = [{ name: ".data", from: { fuzzy_match_percent: 100, size: "32" }, to: { fuzzy_match_percent: 50, size: "32" } }];
    epochWithReport(f, "epoch-section", sectionDrop, [{ id: "cp-section", unit: "main/melee/lb/lbsnap", symbol: "lbSnap_8001DA5C" }]);
    const verdict = await evaluate(f, "cp-section");
    expect(rejection(verdict)).toEqual({ rule: 4, reason: "regressed" });
    expect(verdict.confirmed ? null : verdict.detail?.decreases).toEqual([
      { kind: "section", row: ".data", metric: "fuzzy_match_percent", from: "100", to: "50" },
    ]);

    // Reverted by the confirmation pass: rejected, validation_state regressed.
    seedSettledEpoch(f, { id: "epoch-reverted", runId: "run-a" });
    seedCheckpoint(f, {
      id: "cp-reverted", epochId: "epoch-reverted", runId: "run-a", integrationStatus: "rejected", validationState: "regressed",
      integrationMetadata: { confirmation: { validation_state: "regressed", revert_revision: "cccccccc" } },
    });
    expect(rejection(await evaluate(f, "cp-reverted"))).toEqual({ rule: 1, reason: "integration-not-applied" });

    // Rewritten history: the integrated revision is not in the save point's commit (a real git repository).
    const git = (...args: string[]) => {
      const result = Bun.spawnSync(["git", "-C", f.repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
      if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
      return result.stdout.toString().trim();
    };
    git("init", "-q");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "base");
    const base = git("rev-parse", "HEAD");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "integration");
    const integrated = git("rev-parse", "HEAD");
    git("reset", "-q", "--hard", base);
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "epoch save point");
    const savePoint = git("rev-parse", "HEAD");
    seedSettledEpoch(f, { id: "epoch-git", runId: "run-a", commitSha: savePoint });
    seedCheckpoint(f, { id: "cp-dropped", epochId: "epoch-git", runId: "run-a", integratedRev: integrated });
    seedCheckpoint(f, { id: "cp-kept", epochId: "epoch-git", runId: "run-a", integratedRev: base, symbol: "fn_kept" });
    const real = (id: string) => evaluateConfirmedGood(f.store, id, { repoRoot: f.repoRoot });
    expect(rejection(await real("cp-dropped"))).toEqual({ rule: 3, reason: "not-ancestor" });
    expect((await real("cp-kept")).confirmed).toBe(true);
    // An unknown revision cannot be checked: fail closed.
    seedCheckpoint(f, { id: "cp-unknown-rev", epochId: "epoch-git", runId: "run-a", integratedRev: "d".repeat(40), symbol: "fn_unknown" });
    expect(rejection(await real("cp-unknown-rev"))).toEqual({ rule: 3, reason: "ancestry-unverifiable" });

    // A missing report: every checkpoint of the epoch fails closed, as does a save point without a report path.
    seedSettledEpoch(f, { id: "epoch-missing", runId: "run-a", reportChangesPath: join(f.root, "nowhere", "report_changes.json") });
    seedCheckpoint(f, { id: "cp-missing-1", epochId: "epoch-missing", runId: "run-a" });
    seedCheckpoint(f, { id: "cp-missing-2", epochId: "epoch-missing", runId: "run-a", symbol: "fn_other" });
    seedSettledEpoch(f, { id: "epoch-no-path", runId: "run-a", reportChangesPath: null });
    seedCheckpoint(f, { id: "cp-no-path", epochId: "epoch-no-path", runId: "run-a" });
    for (const id of ["cp-missing-1", "cp-missing-2", "cp-no-path"]) {
      expect(rejection(await evaluate(f, id))).toEqual({ rule: 4, reason: "evidence-missing" });
    }
  });

  test("confirmed-good: a .text-only regression excludes", async () => {
    const f = fixture("text-only");
    const report = {
      units: [{
        name: "main/melee/lb/lbsnap",
        from: { matched_code: "200", size: "400" },
        to: { matched_code: "240", size: "400" },
        sections: [{ name: ".text", from: { fuzzy_match_percent: 91.5, size: "400" }, to: { fuzzy_match_percent: 90.25, size: "400" } }],
        functions: [{ name: "lbSnap_8001DA5C", from: { fuzzy_match_percent: 60, size: "64" }, to: { fuzzy_match_percent: 100, size: "64" } }],
      }],
    };
    epochWithReport(f, "epoch-1", report, [{ id: "cp-text", unit: "main/melee/lb/lbsnap", symbol: "lbSnap_8001DA5C" }]);

    // The parsed regression arrays skip .text, so they see nothing here.
    const parsed = await readRegressionReport(writeJson(join(f.root, "parsed"), "report.json", report), "fixture", 50);
    expect([...parsed.brokenMatches, ...parsed.fuzzyRegressions]).toEqual([]);

    const verdict = await evaluate(f, "cp-text");
    expect(rejection(verdict)).toEqual({ rule: 4, reason: "regressed" });
    expect(verdict.confirmed ? null : verdict.detail?.decreases).toEqual([
      { kind: "section", row: ".text", metric: "fuzzy_match_percent", from: "91.5", to: "90.25" },
    ]);
  });

  test("confirmed-good: report {} / null / units not an array / a row without a name / a non-numeric percentage / \"12.5\" as matched_code / \"-4\" as size → evidence-invalid for every checkpoint of the epoch", async () => {
    const f = fixture("invalid");
    const base = () => improvingReport() as { units: Array<Record<string, any>> };
    const variants: Array<[string, unknown]> = [
      ["empty object", {}],
      ["null", null],
      ["units not an array", { units: { name: "main/melee/lb/lbsnap" } }],
      ["unnamed function row", (() => { const r = base(); r.units[0]!.functions.push({ from: metrics(1, 1) }); return r; })()],
      ["non-numeric percentage", (() => { const r = base(); r.units[0]!.to.fuzzy_match_percent = "high"; return r; })()],
      ["12.5 as matched_code", (() => { const r = base(); r.units[0]!.to.matched_code = "12.5"; return r; })()],
      ["-4 as size", (() => { const r = base(); r.units[0]!.sections[0].from.size = "-4"; return r; })()],
      ["not JSON", "{\"units\": ["],
      ["no unit for the target", improvingReport("main/melee/other", "other_fn")],
    ];
    for (const [index, [label, report]] of variants.entries()) {
      const epochId = `epoch-${index}`;
      epochWithReport(f, epochId, report, [
        { id: `cp-${index}-a`, unit: "main/melee/lb/lbsnap", symbol: "lbSnap_8001DA5C" },
        { id: `cp-${index}-b`, unit: "main/melee/lb/lbsnap", symbol: "lbSnap_other" },
      ]);
      for (const id of [`cp-${index}-a`, `cp-${index}-b`]) {
        expect({ label, ...rejection(await evaluate(f, id)) }).toEqual({ label, rule: 4, reason: "evidence-invalid" });
      }
    }
  });

  test("confirmed-good on the committed real Objdiff report", async () => {
    const f = fixture("real-report");
    const realBytes = readFileSync(REAL_REPORT_PATH, "utf8");
    const real = JSON.parse(realBytes) as { units: Array<Record<string, any>> };
    // The committed report carries byte counts as strings.
    expect(real.units[0]!.from.matched_code).toBe("12344");
    const targets = [
      { id: "cp-marnameref", unit: "mario/System/MarNameRefGen", symbol: "__sinit_MarNameRefGen_cpp" },
      { id: "cp-cube", unit: "mario/Camera/CubeManagerBase", symbol: "__ct__16TCubeManagerBaseFPCcUc" },
    ];
    epochWithReport(f, "epoch-real", realBytes, targets);
    for (const target of targets) {
      const verdict = await evaluate(f, target.id);
      expect({ id: target.id, confirmed: verdict.confirmed }).toEqual({ id: target.id, confirmed: true });
    }

    // The same report with one unit's matched_code down by one byte beyond 2^53: equal as numbers, lower as BigInt.
    const cube = real.units.find((unit) => unit.name === "mario/Camera/CubeManagerBase")!;
    cube.from.matched_code = "9007199254740993";
    cube.to.matched_code = "9007199254740992";
    expect(Number(cube.to.matched_code) < Number(cube.from.matched_code)).toBe(false);
    epochWithReport(f, "epoch-mutated", real, [
      { id: "cp-marnameref-2", unit: "mario/System/MarNameRefGen", symbol: "__sinit_MarNameRefGen_cpp" },
      { id: "cp-cube-2", unit: "mario/Camera/CubeManagerBase", symbol: "__ct__16TCubeManagerBaseFPCcUc" },
    ]);
    expect((await evaluate(f, "cp-marnameref-2")).confirmed).toBe(true);
    const cubeVerdict = await evaluate(f, "cp-cube-2");
    expect(rejection(cubeVerdict)).toEqual({ rule: 4, reason: "regressed" });
    expect(cubeVerdict.confirmed ? null : cubeVerdict.detail?.decreases).toEqual([
      { kind: "unit", row: "mario/Camera/CubeManagerBase", metric: "matched_code", from: "9007199254740993", to: "9007199254740992" },
    ]);
  });

  test("confirmed-good: requires confirmed when the bisect ran", async () => {
    const f = fixture("bisect");
    seedSettledEpoch(f, { id: "epoch-1", runId: "run-a" });
    const passed = { confirmation: { validation_state: "confirmed", build_id: "abc", finished_at: "2026-10-07T00:00:00Z" } };
    seedCheckpoint(f, { id: "cp-confirmed", epochId: "epoch-1", runId: "run-a", validationState: "confirmed", metadata: passed, integrationMetadata: passed });
    seedCheckpoint(f, { id: "cp-regressed", epochId: "epoch-1", runId: "run-a", validationState: "regressed", symbol: "fn_regressed" });
    seedCheckpoint(f, {
      id: "cp-unattributed", epochId: "epoch-1", runId: "run-a", symbol: "fn_unattributed",
      integrationMetadata: { confirmation: { validation_state: "tentative" } },
    });
    seedCheckpoint(f, { id: "cp-no-pass", epochId: "epoch-1", runId: "run-a", symbol: "fn_no_pass" });

    const confirmed = await evaluate(f, "cp-confirmed");
    expect(confirmed.confirmed && confirmed.checkpoint.confirmation).toBe("bisect");
    expect(rejection(await evaluate(f, "cp-regressed"))).toEqual({ rule: 5, reason: "not-confirmed-by-confirmation-pass" });
    expect(rejection(await evaluate(f, "cp-unattributed"))).toEqual({ rule: 5, reason: "not-confirmed-by-confirmation-pass" });
    // Nothing records a pass for this epoch or this checkpoint: settled without a pass.
    const noPass = await evaluate(f, "cp-no-pass");
    expect(noPass.confirmed && noPass.checkpoint.confirmation).toBe("epoch-settled");
  });

  test("confirmed-good: an unattributed confirmation pass of the epoch excludes its tentative checkpoints", async () => {
    const f = fixture("unattributed");
    // The settlement's own progress for the epoch, labelled by its ordinal: the pass started, then warned unattributed.
    const { ordinal } = seedSettledEpoch(f, { id: "epoch-pass", runId: "run-a" });
    seedCheckpoint(f, { id: "cp-left-tentative", epochId: "epoch-pass", runId: "run-a" });
    seedCheckpoint(f, { id: "cp-confirmed-by-pass", epochId: "epoch-pass", runId: "run-a", symbol: "fn_confirmed", validationState: "confirmed" });
    const progress = (label: string, status: string, extra: Record<string, unknown> = {}) =>
      addEvent(f.store, "run-a", "epoch_checkpoint_progress", "epoch-cycle", { label, phase: "confirmation_pass", status, message: "", ...extra });
    progress(`epoch-${ordinal}`, "started");
    progress(`epoch-${ordinal}`, "warning", { confirmation: { status: "unattributed", confirmedIds: [], regressedId: null } });
    expect(confirmationPassRanForEpoch(f.store, "epoch-pass")).toBe(true);
    expect(rejection(await evaluate(f, "cp-left-tentative"))).toEqual({ rule: 5, reason: "not-confirmed-by-confirmation-pass" });
    const confirmed = await evaluate(f, "cp-confirmed-by-pass");
    expect(confirmed.confirmed && confirmed.checkpoint.confirmation).toBe("bisect");

    // The next epoch of the same run: its pass only waited for a baseline, and the earlier epoch's events are not its own.
    const next = seedSettledEpoch(f, { id: "epoch-waited", runId: "run-a" });
    seedCheckpoint(f, { id: "cp-waited", epochId: "epoch-waited", runId: "run-a", symbol: "fn_waited" });
    progress(`epoch-${next.ordinal}`, "skipped");
    progress(`epoch-${next.ordinal}-pr-sync`, "started");
    expect(confirmationPassRanForEpoch(f.store, "epoch-waited")).toBe(false);
    const waited = await evaluate(f, "cp-waited");
    expect(waited.confirmed && waited.checkpoint.confirmation).toBe("epoch-settled");

    // The settled-evidence record of a Sync boundary carries the pass result too.
    const synced = seedSettledEpoch(f, { id: "epoch-synced", runId: "run-b" });
    seedCheckpoint(f, { id: "cp-synced", epochId: "epoch-synced", runId: "run-b", symbol: "fn_synced" });
    addEvent(f.store, "run-b", "epoch_checkpoint_progress", "run-loop", {
      phase: "epoch_settled_evidence", epoch_id: "epoch-synced", attempt: 1, result: { confirmation: { status: "unattributed" } },
    });
    expect(synced.ordinal).toBe(1);
    expect(rejection(await evaluate(f, "cp-synced"))).toEqual({ rule: 5, reason: "not-confirmed-by-confirmation-pass" });
  });

  test("confirmed-good: inconsistent stored confirmation states fail closed", async () => {
    const f = fixture("inconsistent");
    seedSettledEpoch(f, { id: "epoch-1", runId: "run-a" });
    const state = (validation_state: string) => ({ confirmation: { validation_state } });
    // The integration says confirmed, the checkpoint row is still tentative.
    seedCheckpoint(f, { id: "cp-row-tentative", epochId: "epoch-1", runId: "run-a", integrationMetadata: state("confirmed") });
    // The checkpoint row says confirmed, its integration was recorded regressed.
    seedCheckpoint(f, { id: "cp-integration-regressed", epochId: "epoch-1", runId: "run-a", symbol: "fn_b", validationState: "confirmed", integrationMetadata: state("regressed") });
    // The checkpoint metadata says confirmed, the row says tentative.
    seedCheckpoint(f, { id: "cp-metadata-only", epochId: "epoch-1", runId: "run-a", symbol: "fn_c", metadata: state("confirmed") });
    for (const id of ["cp-row-tentative", "cp-integration-regressed", "cp-metadata-only"]) {
      expect({ id, ...rejection(await evaluate(f, id)) }).toEqual({ id, rule: 5, reason: "not-confirmed-by-confirmation-pass" });
    }
  });
});
