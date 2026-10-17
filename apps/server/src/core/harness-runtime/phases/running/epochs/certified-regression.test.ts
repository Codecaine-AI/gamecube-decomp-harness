import { afterAll as afterBuildTests, beforeAll as beforeBuildTests } from "bun:test";
// The settlement fixture runs a fake local ninja. Production defaults to Daytona.
let previousBuildMode: string | undefined;
beforeBuildTests(() => { previousBuildMode = process.env.ORCH_BUILD_EXECUTION; process.env.ORCH_BUILD_EXECUTION = "local"; });
afterBuildTests(() => { if (previousBuildMode === undefined) delete process.env.ORCH_BUILD_EXECUTION; else process.env.ORCH_BUILD_EXECUTION = previousBuildMode; });
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandResult, WorkspaceExec } from "@server/infrastructure/shell";
import { initializeDispatchState, requestDispatch } from "@server/core/harness-state";
import { initializeHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import { latestDashboardArtifactPayload, openState, type StateStore } from "@server/core/orchestrator-state";
import {
  admitEpochTargets,
  claimNextEpochTarget,
  createRun,
  recordWorkerCheckpoint,
  startSchedulerEpoch,
} from "@server/core/harness-runtime/run-state";
import { CHECKPOINT_CERTIFICATION_KEY, certifiedBaseline } from "@server/core/harness-runtime/run-state/certification.js";
import { activeUnverifiedMatch, recordUnverifiedMatch } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { enqueueWorkerOutputIntegration } from "@server/core/harness-runtime/run-state/worker-output-integration.js";
import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";
import { validateWorkerChange, type WorkerChangeBaseline, type WorkerUnitScoreSnapshot } from "@server/core/agent-catalog/agents/running/worker/change-validation.js";
import { unverifiedMatchCertification } from "@server/core/agent-catalog/agents/running/worker/steering-validation.js";
import type { SteeringRunner } from "@server/core/validation/steering/steering-check.js";
import { buildRegressionReport } from "@server/core/validation/objdiff/report.js";
import { UNVERIFIED_MATCH_CERTIFICATION_KEY } from "@server/core/validation/steering/unverified-certification.js";
import { commitWorkerAttemptCertification, workerAttemptCertification, workerCertificationLane } from "../workers/worker-certification.js";
import { processWorkerOutputIntegrationQueue } from "../integration/worker-output-queue.js";
import { applyVerificationJudgements, judgeMasterBreakageGate, judgeRegressionReport, verificationJudgements } from "./certified-regression.js";
import { isCleanGlobalRegression } from "./confirmation-pass.js";
import { runEpochSettlement } from "./settlement.js";
import { useHostReportPlacement } from "@server/core/agent-catalog/agents/running/worker/host-report-placement.test-support.js";
import { CERTIFIED_INPUTS_KEY, certifiedInputsFromGate } from "@server/core/validation/steering/certified-inputs.js";
import { syncCertificationReader } from "./sync-certification.js";
import { createHash } from "node:crypto";

// The validation step's fake workspace serves whole objdiff reports: explicit host report placement.
useHostReportPlacement();

const GAME = "test";
const UNIT = "a";
const SYMBOL = "repaired";
const NEIGHBOUR = "neighbour";
const SOURCE = "src/a.c";
const OBJECT = "build/GALE01/src/a.o";
/** A header the unit's compile reads; the certified build read H0. */
const HEADER = "include/a.h";
const HEADER_H0 = "extern int shared;\n";
const REPAIRED = "int repaired(void) { return 0; /* real */ }\n";
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0).reverse()) rmSync(path, { recursive: true, force: true });
});

function git(repo: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString() || result.stdout.toString());
  return result.stdout.toString().trim();
}

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(dir);
  return dir;
}

/**
 * A git repo whose trusted base T has the real code, then U (the claim base)
 * with the unexplained 100% version the backfill marked `unverified_match`;
 * a harness at U with one claimed target, the row, and a run lease.
 */
function setup() {
  const root = tempDir("certified-settlement-");
  const repo = join(root, "repo");
  const stateDir = join(root, "state");
  const binDir = join(root, "bin");
  mkdirSync(join(repo, "src"), { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(repo, "build.ninja"), "# fake build\n");
  writeFileSync(join(repo, SOURCE), "int repaired(void) { return 0; }\n");
  mkdirSync(join(repo, "include"), { recursive: true });
  writeFileSync(join(repo, HEADER), HEADER_H0);
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Certified Test"]);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "trusted base"]);
  const trusted = git(repo, ["rev-parse", "HEAD"]);
  writeFileSync(join(repo, SOURCE), "int repaired(void) { int unexplained = 0; return unexplained; }\n");
  git(repo, ["commit", "-am", "unexplained 100%"]);
  const claimBase = git(repo, ["rev-parse", "HEAD"]);

  const store = openState(stateDir);
  initializeHarnessState(store.db, { gameId: GAME, worktree: repo, configurationRevision: "test", commandId: "init" });
  transitionHarnessState(store.db, {
    gameId: GAME, expectedRevision: 0, commandId: "seed",
    patch: { readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" }, source: { head: claimBase, upstream_revision: claimBase } },
  });
  const run = createRun(store, "matched_code_percent", 100, 1, { gameId: GAME, repoRoot: repo }, { baseRevision: claimBase });
  initializeDispatchState(store, { gameId: GAME, traceId: `trace-${run.id}` });
  const dispatch = requestDispatch(store, {
    actor: "operator", commandId: `command-${run.id}`, correlationId: run.id, kind: "run", gameId: GAME, reason: "certified settlement", workflowId: run.id,
  });
  if (dispatch.queued) throw new Error("lease queued");
  const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
  admitEpochTargets(store, {
    epochId: epoch.id, runId: run.id, workerPoolSize: 1,
    candidates: [{ kind: "function", unit: UNIT, symbol: SYMBOL, sourcePath: SOURCE, size: 64, fuzzy: 100 }],
  });
  const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: claimBase, ttlSeconds: 1800 })!;
  recordUnverifiedMatch(store, {
    gameId: GAME, unit: UNIT, symbol: SYMBOL, analyzedRev: claimBase, baseRev: trusted, sourcePath: SOURCE,
    match: { base: 90, candidate: 100, real_only: 92 }, reasons: ["IR oracle failed for the unit"],
  });
  return { root, repo, stateDir, binDir, store, run, epoch, claim, trusted, claimBase, leaseId: dispatch.leaseId };
}

function unitSnapshot(scores: Record<string, number>): WorkerUnitScoreSnapshot {
  return {
    schemaVersion: 1, capturedAt: "2026-10-17T00:00:00.000Z", unit: UNIT, symbol: SYMBOL, sourcePath: SOURCE, objectTarget: OBJECT,
    metrics: [], functions: Object.entries(scores).map(([name, score]) => ({ name, score, size: 64 })), sections: [], targetScore: scores[SYMBOL] ?? null,
  };
}

/** The attempt's sandbox: the objdiff unit report after the edit. */
function sandbox(after: Record<string, number>): WorkspaceExec {
  const report = JSON.stringify({ left: { sections: [], symbols: Object.entries(after).map(([name, score]) => ({ name, match_percent: score, size: 64, instructions: [] })) } });
  return {
    exec: async (command: string[]): Promise<CommandResult> => {
      if (command[0] === "build/tools/objdiff-cli") return { exitCode: 0, stdout: report, stderr: "" };
      if (command[0] === "cat") return { exitCode: 1, stdout: "", stderr: "absent" };
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  } as WorkspaceExec;
}

/** steering_check.py: both the claim-base and the trusted-base run pass the target's own edited row. */
function certifyingGate(): SteeringRunner {
  const decide = {
    attempt: "pass", reasons: [], removable_noncosmetic: [], probes: [], units: [{ unit: UNIT, built: true, compared: true }],
    functions: [{ unit: UNIT, name: SYMBOL, decision: "pass", semantic: "clean", analysis: "complete", audit_label: "real", match: { base: 100, candidate: 96, real_only: 96 }, groups: ["g1"] }],
  };
  const runner: SteeringRunner = async (args) => {
    const step = args[0]!;
    const outputs: Record<string, unknown> = {
      edits: { tool: "steering_check", version: 1, base_rev: "x", edits_hash: "h1", files: [{ path: SOURCE, base_exists: true, cand_exists: true, base_text: "a\n", cand_text: "b\n" }] },
      reduce: { edits_hash: "h1", analysis: "complete", groups: [{ id: "g1", status: "kept", edit_ids: ["e1"] }] },
      mwcc: {
        edits_hash: "h1", functions: [{ unit: UNIT, name: SYMBOL, sstar_vs_candidate: "code" }], errors: [],
        // What the candidate compile read (its depfile): the repaired source and the header at H0.
        fidelity: { units: { [UNIT]: {
          builds: { cand: { depfile: "ok", deps: { [SOURCE]: sha256(REPAIRED), [HEADER]: sha256(HEADER_H0) }, obj_sha256: "o" } },
          compile: { mw_version: "GC/1.2.5", cflags: "-O4", compiler: { sha256: "c" } },
        } } },
      },
      decide,
    };
    const out = args.indexOf("--out");
    if (out >= 0) {
      writeFileSync(args[out + 1]!, JSON.stringify(outputs[step]));
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    return { exitCode: 0, stdout: JSON.stringify(outputs[step]), stderr: "" };
  };
  runner.uploadToSandbox = async () => undefined;
  return runner;
}

const REPAIR_PATCH = [
  `diff --git a/${SOURCE} b/${SOURCE}`, `--- a/${SOURCE}`, `+++ b/${SOURCE}`, "@@ -1 +1 @@",
  "-int repaired(void) { int unexplained = 0; return unexplained; }", `+${REPAIRED.trimEnd()}`, "",
].join("\n");

/** Validation, checkpoint and integration of the certified repair, as the worker cycle and the integration queue run them. */
/** `landBeforeIntegration`: another worker's allowed edit, committed between gating and this integration. */
async function certifyAndIntegrate(f: ReturnType<typeof setup>, landBeforeIntegration?: () => void) {
  const outputDir = join(f.root, "validation");
  const unverified = activeUnverifiedMatch(f.store, { gameId: GAME, unit: UNIT, symbol: SYMBOL });
  const lane = workerCertificationLane({
    store: f.store, gateEnforced: true, gameId: GAME, unit: UNIT, symbol: SYMBOL, sourcePath: SOURCE, claimBaseRev: f.claimBase, unverified,
    prove: async () => "not a restoration",
  });
  const baseline: WorkerChangeBaseline = { status: "available", reasons: [], snapshot: unitSnapshot({ [SYMBOL]: 100, [NEIGHBOUR]: 100 }), firstDiff: null, objectTarget: OBJECT };
  const validation = await validateWorkerChange({
    repoRoot: "/work/sms", hostRepoRoot: f.repo, outputDir, attemptIndex: 0, baseline,
    target: { unit: UNIT, symbol: SYMBOL, source_path: SOURCE }, dryRun: false, shouldRun: true, claimedExact: true,
    validation: { reportPath: "build/GALE01/report.json" },
    microGateFlags: { sectionParity: false, undefinedSymbols: false, bannedIdioms: false, formatting: false, symbolValidation: false },
    postAttemptDiffText: REPAIR_PATCH, baseRevision: f.claimBase, workspaceExec: sandbox({ [SYMBOL]: 96, [NEIGHBOUR]: 100 }), stackFramePolicy: "match_frame",
    steeringGate: {
      mode: "enforce", baseRev: f.claimBase, hostRepoRoot: f.repo, cacheDir: join(outputDir, "cache"), runner: certifyingGate(),
      unverifiedTarget: { unit: UNIT, symbol: SYMBOL, baseRev: unverified!.baseRev },
    },
    certificationLane: lane,
  });
  const certification = workerAttemptCertification({
    store: f.store, validation, gateEnforced: true, gameId: GAME, unit: UNIT, symbol: SYMBOL, claimBaseRev: f.claimBase, unverified,
    measuredBaselineScore: 100, diffText: REPAIR_PATCH,
  });
  const unverifiedCertification = certification?.unverifiedCertification
    ?? unverifiedMatchCertification({ validation, gameId: GAME, unit: UNIT, symbol: SYMBOL, baseRev: f.claimBase });
  const patchPath = join(f.root, "repair.patch");
  writeFileSync(patchPath, REPAIR_PATCH);
  const checkpoint = recordWorkerCheckpoint(f.store, {
    authority: { host: "certified-settlement-test" },
    workerStateId: f.claim.workerStateId, runId: f.run.id, epochId: f.claim.epochId, epochTargetId: f.claim.epochTargetId, targetClaimId: f.claim.claimId,
    attemptIndex: 0, oldScore: validation.target?.before ?? null, newScore: validation.target?.after ?? null,
    exactMatch: Boolean(validation.target?.exact), hardGatesPassed: validation.status === "passed", validationStatus: validation.status,
    patchPath, diffPath: patchPath, writeSet: [SOURCE],
    ...(certification?.improvement ? { certifiedImprovement: certification.improvement } : {}),
    metadata: {
      ...(unverifiedCertification ? { [UNVERIFIED_MATCH_CERTIFICATION_KEY]: unverifiedCertification } : {}),
      ...(certification ? { [CHECKPOINT_CERTIFICATION_KEY]: certification.metadata } : {}),
      [CERTIFIED_INPUTS_KEY]: await certifiedInputsFromGate(validation.steering, UNIT, GAME),
    },
  });
  commitWorkerAttemptCertification({
    store: f.store, certification, checkpoint, gameId: GAME, unverified, measuredBaselineScore: 100, grant: true, runId: f.run.id, targetClaimId: f.claim.claimId,
  });
  enqueueWorkerOutputIntegration(f.store, {
    runId: f.run.id, epochId: f.claim.epochId, epochTargetId: f.claim.epochTargetId, targetClaimId: f.claim.claimId,
    workerStateId: f.claim.workerStateId, workerCheckpointId: checkpoint.id, targetKey: `${UNIT}::${SYMBOL}`, patchPath, diffPath: patchPath, writeSet: [SOURCE],
    metadata: { scoped_checks_passed: true },
  });
  landBeforeIntegration?.();
  const integrated = await processWorkerOutputIntegrationQueue({
    dryRun: false, leaseId: f.leaseId, repoRoot: f.repo, runId: f.run.id, stateDir: f.stateDir, store: f.store, ordering: null,
  });
  return { validation, checkpoint, integrated };
}

/** The epoch's objdiff report and report changes (`repaired` from -> to; `neighbour` at 100 throughout unless given). */
async function settle(f: ReturnType<typeof setup>, params: { label: string; from: number; to: number; neighbourTo?: number }) {
  const fn = (name: string, size: number, from: number, to: number) => ({ name, from: { fuzzy_match_percent: from, size: String(size) }, to: { fuzzy_match_percent: to, size: String(size) } });
  const neighbourTo = params.neighbourTo ?? 100;
  const matched = (repaired: number, neighbour: number) => (repaired >= 100 ? 24 : 0) + (neighbour >= 100 ? 16 : 0);
  const measures = (repaired: number, neighbour: number) => ({ total_code: "40", matched_code: String(matched(repaired, neighbour)), matched_code_percent: matched(repaired, neighbour) / 40 * 100, fuzzy_match_percent: (repaired * 24 + neighbour * 16) / 40 });
  const report = {
    units: [{ name: UNIT, metadata: { source_path: SOURCE }, functions: [
      { name: SYMBOL, size: "24", fuzzy_match_percent: params.to }, { name: NEIGHBOUR, size: "16", fuzzy_match_percent: neighbourTo },
    ], sections: [] }],
    measures: measures(params.to, neighbourTo),
  };
  const changes = {
    from: measures(params.from, 100),
    to: report.measures,
    units: [{ name: UNIT, metadata: { source_path: SOURCE }, from: measures(params.from, 100), to: report.measures, functions: [fn(SYMBOL, 24, params.from, params.to), fn(NEIGHBOUR, 16, 100, neighbourTo)], sections: [] }],
  };
  const ninja = join(f.binDir, "ninja");
  writeFileSync(ninja, `#!/bin/sh
mkdir -p build/GALE01
if [ "\${3:-}" = "build/GALE01/report.json" ]; then
  printf '%s\\n' '${JSON.stringify(report)}' > build/GALE01/report.json
  exit 0
fi
printf '%s\\n' '${JSON.stringify(changes)}' > build/GALE01/report_changes.json
`);
  chmodSync(ninja, 0o755);
  const oldPath = process.env.PATH;
  const oldReuse = process.env.ORCH_REPORT_REUSE;
  process.env.PATH = `${f.binDir}:${oldPath ?? ""}`;
  delete process.env.ORCH_REPORT_REUSE;
  try {
    const result = await runEpochSettlement(f.store, f.run.id, f.repo, f.stateDir, {
      boundaryBuildFixerEnabled: false, configureCommand: "", epochId: f.epoch.id, gameId: GAME, label: params.label, leaseId: f.leaseId,
      linkCompleteUnitsEnabled: false, linkPaths: [], preCommitAutofixEnabled: false, steeringGate: "enforce", worktreeDir: join(f.root, `worktree-${params.label}`),
    });
    const trusted = latestDashboardArtifactPayload(f.store, { runId: f.run.id, artifactType: "trusted_report", artifactKey: "current" });
    const prReport = readFileSync(join(result.artifactDir, "pr_report.md"), "utf8");
    return { result, trusted, prReport };
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldReuse === undefined) delete process.env.ORCH_REPORT_REUSE;
    else process.env.ORCH_REPORT_REUSE = oldReuse;
  }
}

function names(rows: unknown): string[] {
  return (Array.isArray(rows) ? rows : []).map((row) => String((row as { itemName?: unknown }).itemName));
}

describe("an unverified target is judged against its certified baseline at settlement", () => {
  test("unverified 100 -> certified 96: validated, checkpointed, integrated and settled at 96 with no regression flag", async () => {
    const f = setup();
    try {
      const { validation, checkpoint, integrated } = await certifyAndIntegrate(f);
      // Validation: the lane kept the lower certified score; the checkpoint is selectable and certified.
      expect(validation.status).toBe("passed");
      expect(validation.certificationLane?.outcome).toBe("certified");
      expect(checkpoint.selectable).toBe(true);
      expect(certifiedBaseline(f.store, { gameId: GAME, unit: UNIT, symbol: SYMBOL })?.certifiedScore).toBe(96);
      // Integration: applied, and the certified version cleared the unverified state.
      expect(integrated.processed[0]).toMatchObject({ status: "applied" });
      expect(activeUnverifiedMatch(f.store, { gameId: GAME, unit: UNIT, symbol: SYMBOL })).toBeNull();
      expect(readFileSync(join(f.repo, SOURCE), "utf8")).toContain("/* real */");
      // Sync sees the landing at ours as certified.
      const sync = await syncCertificationReader(f.store, { gameId: GAME, steeringGate: "enforce" }, f.repo);
      expect(sync({ unit: UNIT, symbol: SYMBOL, sourcePath: SOURCE })).toMatchObject({ status: "certified", verdict: "gate_pass" });

      // Settlement: 100 (uncertified) -> 96 (certified) is no broken match, readmission or pause.
      const { result, trusted, prReport } = await settle(f, { label: "epoch-1", from: 100, to: 96 });
      expect(result.regressions).toMatchObject({ brokenMatches: 0, fuzzyRegressions: 0, regressedFunctions: 0 });
      expect(result.repair).toMatchObject({ paused: false, planned: 0 });
      expect(names(trusted.brokenMatches)).not.toContain(SYMBOL);
      expect(names(trusted.fuzzyRegressions)).not.toContain(SYMBOL);
      expect(prReport).toContain(`\`${SYMBOL}\`: 100% -> 96% (certified baseline 96%)`);
      expect(result.reportMeasures?.fuzzy_match_percent).toBeCloseTo((96 * 24 + 100 * 16) / 40);

      // The next epoch: certified 96 -> 94 on the same target is a regression again.
      const dropped = await settle(f, { label: "epoch-2", from: 96, to: 94 });
      expect(dropped.result.regressions).toMatchObject({ fuzzyRegressions: 1, regressedFunctions: 1 });
      expect(names(dropped.trusted.fuzzyRegressions)).toContain(SYMBOL);
      expect(dropped.result.repair.planned).toBe(1);
    } finally {
      f.store.db.close();
    }
  });

  test("in the same epoch, a drop below the certified baseline and any other function's regression are still caught", async () => {
    const f = setup();
    try {
      await certifyAndIntegrate(f);
      const below = await settle(f, { label: "epoch-1", from: 100, to: 94 });
      expect(below.result.regressions).toMatchObject({ brokenMatches: 1, regressedFunctions: 1 });
      expect(names(below.trusted.brokenMatches)).toEqual([SYMBOL]);
      const neighbour = await settle(f, { label: "epoch-1b", from: 100, to: 96, neighbourTo: 90 });
      expect(names(neighbour.trusted.brokenMatches)).toEqual([NEIGHBOUR]);
      expect(neighbour.result.repair.planned).toBe(1);
    } finally {
      f.store.db.close();
    }
  });
});

describe("a certificate gated over a header another worker changed before it landed", () => {
  test("the landing is stale: the hold stays, sync treats it as unverified, settlement flags 100 -> 96", async () => {
    const f = setup();
    try {
      const { checkpoint, integrated } = await certifyAndIntegrate(f, () => {
        // H1: an allowed header edit lands between this certificate's gate and its integration.
        writeFileSync(join(f.repo, HEADER), "extern int shared;\nextern int added;\n");
        git(f.repo, ["commit", "-qam", "another worker's header edit"]);
      });
      expect(checkpoint.selectable).toBe(true);
      expect(integrated.processed[0]).toMatchObject({ status: "applied" });
      const metadata = JSON.parse(String((f.store.db.query("SELECT metadata_json FROM integration_outcomes").get() as { metadata_json: string }).metadata_json));
      expect(metadata.steering_content_freshness).toMatchObject({ fresh: false, compile_inputs: { checked: 2, changed: [HEADER] } });
      expect(metadata.unverified_match).toMatchObject({ cleared: false, compile_inputs_changed: [HEADER] });
      // No clearance, no certified landing.
      expect(activeUnverifiedMatch(f.store, { gameId: GAME, unit: UNIT, symbol: SYMBOL })).not.toBeNull();
      const sync = await syncCertificationReader(f.store, { gameId: GAME, steeringGate: "enforce" }, f.repo);
      expect(sync({ unit: UNIT, symbol: SYMBOL, sourcePath: SOURCE }).status).not.toBe("certified");
      const head = git(f.repo, ["rev-parse", "HEAD"]);
      expect((await verificationJudgements({ store: f.store, gameId: GAME, scope: "upstream", measuredRev: head, isAncestor: async () => true })).size).toBe(0);
      const { result, trusted } = await settle(f, { label: "epoch-1", from: 100, to: 96 });
      expect(result.regressions.regressedFunctions).toBe(1);
      expect([...names(trusted.brokenMatches), ...names(trusted.fuzzyRegressions)]).toContain(SYMBOL);
    } finally {
      f.store.db.close();
    }
  });
});

describe("a still-unverified target without a lane integration", () => {
  test("an unrelated integration that drops it from 100 to 90 is flagged at settlement", async () => {
    const f = setup();
    try {
      const { result, trusted } = await settle(f, { label: "epoch-1", from: 100, to: 90 });
      expect(activeUnverifiedMatch(f.store, { gameId: GAME, unit: UNIT, symbol: SYMBOL })).not.toBeNull();
      expect(result.regressions.regressedFunctions).toBe(1);
      // The progress view lists an unverified function leaving 100% with the fuzzy regressions (it was never a match).
      expect([...names(trusted.brokenMatches), ...names(trusted.fuzzyRegressions)]).toContain(SYMBOL);
      expect(result.repair.planned).toBe(1);
    } finally {
      f.store.db.close();
    }
  });
});

describe("applyVerificationJudgements", () => {
  // Unit `a`: `repaired` (24 bytes) and `neighbour` (16 bytes) in a 40-byte .text.
  function changes(params: { repaired: [number, number]; neighbour?: [number, number]; textTo?: number }) {
    const [rFrom, rTo] = params.repaired;
    const [nFrom, nTo] = params.neighbour ?? [100, 100];
    const side = (r: number, n: number, text?: number) => ({
      total_code: "40",
      fuzzy_match_percent: (r * 24 + n * 16) / 40,
      matched_code_percent: ((r >= 100 ? 24 : 0) + (n >= 100 ? 16 : 0)) / 40 * 100,
      complete_code_percent: r >= 100 && n >= 100 ? 100 : 0,
      ...(text === undefined ? {} : { text }),
    });
    const from = side(rFrom, nFrom);
    const to = side(rTo, nTo);
    const textTo = params.textTo ?? to.fuzzy_match_percent;
    return {
      from, to,
      units: [{
        name: UNIT, from, to,
        functions: [
          { name: SYMBOL, from: { fuzzy_match_percent: rFrom, size: "24" }, to: { fuzzy_match_percent: rTo, size: "24" } },
          { name: NEIGHBOUR, from: { fuzzy_match_percent: nFrom, size: "16" }, to: { fuzzy_match_percent: nTo, size: "16" } },
        ],
        sections: [{ name: ".text", from: { fuzzy_match_percent: from.fuzzy_match_percent, size: "40" }, to: { fuzzy_match_percent: textTo, size: "40" } }],
      }],
    };
  }
  const held = new Map([[`${UNIT}::${SYMBOL}`, { kind: "certified" as const, score: 96 }]]);
  const judge = (raw: ReturnType<typeof changes>, withRaw = true) => applyVerificationJudgements(buildRegressionReport(raw, "Epoch", 50), held, withRaw ? raw : undefined);

  test("sets aside a held certified repair and the totals only it moved; the confirmation pass sees a clean global", () => {
    const raw = changes({ repaired: [100, 96] });
    expect(isCleanGlobalRegression(buildRegressionReport(raw, "Epoch", 50))).toBe(false);
    const judged = judge(raw);
    expect(judged.brokenMatches).toEqual([]);
    expect(judged.regressions).toEqual([]);
    expect(isCleanGlobalRegression(judged)).toBe(true);
    expect(judged.verificationSetAside).toEqual([expect.objectContaining({ itemName: SYMBOL, verification: "certified_baseline_held", certifiedBaseline: 96 })]);
  });

  test("an independent .text loss in the repaired unit is still a regression", () => {
    // Reviewer repro: the repair accounts for 4 points on 24 of 40 bytes (2.4); .text fell 80.
    const judged = judge(changes({ repaired: [100, 96], textTo: 20 }));
    expect(judged.brokenMatches).toEqual([]);
    expect(judged.regressions.map((change) => change.name)).toEqual([`${UNIT}::.text`]);
    expect(isCleanGlobalRegression(judged)).toBe(false);
  });

  test("without the raw sizes nothing beyond the function's own row is attributed", () => {
    const judged = judge(changes({ repaired: [100, 96] }), false);
    expect(judged.brokenMatches).toEqual([]);
    expect(judged.regressions.some((change) => change.name === null)).toBe(true);
    expect(judged.regressions.some((change) => change.name === SYMBOL)).toBe(false);
    expect(isCleanGlobalRegression(judged)).toBe(false);
  });

  test("keeps a drop below the certified score, other functions, and the totals they move", () => {
    const below = judge(changes({ repaired: [100, 94] }));
    expect(below.brokenMatches.map((row) => row.itemName)).toEqual([SYMBOL]);
    const other = judge(changes({ repaired: [100, 96], neighbour: [100, 80] }));
    expect(other.brokenMatches.map((row) => row.itemName)).toEqual([NEIGHBOUR]);
    expect(other.regressions.some((change) => change.name === UNIT)).toBe(true);
    expect(other.regressions.some((change) => change.name === null)).toBe(true);
    expect(isCleanGlobalRegression(other)).toBe(false);
    const report = buildRegressionReport(changes({ repaired: [100, 96] }), "Epoch", 50);
    expect(applyVerificationJudgements(report, new Map())).toBe(report);
  });
});

/**
 * A synthetic landing: a lane checkpoint certified at `score`, its claim and
 * epoch target, and an applied integration at `integratedRev` carrying a
 * landed-content proof (`fresh` unless overridden) bound to them.
 */
function landSyntheticRepair(store: StateStore, runId: string, params: {
  id?: string;
  certUnit: string;
  targetKey: string;
  score: number;
  integratedRev: string;
  proof?: Record<string, unknown> | null;
}): void {
  const id = params.id ?? "1";
  store.db.query(`INSERT INTO worker_checkpoints (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id, attempt_index,
      validation_time, hard_gates_passed, validation_status, validation_state, write_set_json, metadata_json)
    VALUES (?, 'ws-1', ?, 'epoch-1', ?, ?, 0, 'then', 1, 'passed', 'confirmed', '[]', ?)`)
    .run(`cp-${id}`, runId, `et-${id}`, `claim-${id}`, JSON.stringify({ [CHECKPOINT_CERTIFICATION_KEY]: {
      certified: true, kind: "gate_pass", unit: params.certUnit, symbol: SYMBOL, score: params.score, lane: "unverified_match",
    } }));
  store.db.query(`INSERT INTO target_claims (id, run_id, epoch_id, epoch_target_id, worker_id, base_rev, status, claimed_at)
    VALUES (?, ?, 'epoch-1', ?, 'worker-1', 'claim-base', 'closed', 'then')`).run(`claim-${id}`, runId, `et-${id}`);
  store.db.query(`INSERT INTO epoch_targets (id, epoch_id, run_id, target_key, unit, symbol, source_path, size, baseline_score, priority, admission_index, status, admitted_at)
    VALUES (?, 'epoch-1', ?, ?, ?, ?, 'src/a.c', 24, 100, 1, 0, 'finished', 'then')`)
    .run(`et-${id}`, runId, params.targetKey, params.targetKey.slice(0, params.targetKey.lastIndexOf("::")), SYMBOL);
  const proof = params.proof === undefined
    ? { fresh: true, target_key: params.targetKey, source_path: "src/a.c", claim_base_rev: "claim-base", pre_apply_rev: "pre-apply", integrated_rev: params.integratedRev }
    : params.proof;
  store.db.query(`INSERT INTO integration_outcomes (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id, worker_checkpoint_id,
      status, target_key, metadata_json, created_at, updated_at)
    VALUES (?, ?, 'epoch-1', ?, ?, 'ws-1', ?, 'applied', ?, ?, 'then', 'then')`)
    .run(`int-${id}`, runId, `et-${id}`, `claim-${id}`, `cp-${id}`, params.targetKey, JSON.stringify({
      integrated_rev: params.integratedRev, pre_apply_rev: "pre-apply", ...(proof ? { steering_content_freshness: proof } : {}),
    }));
}

/** Ancestry over a fixed set of commits: `edges` maps each commit to its parent. */
function ancestry(edges: Record<string, string>) {
  return async (ancestor: string, descendant: string) => {
    for (let rev: string | undefined = descendant; rev; rev = edges[rev]) if (rev === ancestor) return true;
    return false;
  };
}

describe("verificationJudgements and the master breakage gate", () => {
  test("only a landed lane integration of the target is a baseline; a still-unverified row alone is ordinary; Melee has none", async () => {
    const f = setup();
    try {
      const isAncestor = async (ancestor: string, descendant: string) =>
        Bun.spawnSync(["git", "-C", f.repo, "merge-base", "--is-ancestor", ancestor, descendant]).exitCode === 0;
      const upstream = () => ({ store: f.store, gameId: GAME, scope: "upstream" as const, measuredRev: git(f.repo, ["rev-parse", "HEAD"]), isAncestor });
      expect((await verificationJudgements(upstream())).size).toBe(0);
      await certifyAndIntegrate(f);
      expect(await verificationJudgements(upstream())).toEqual(new Map([[`${UNIT}::${SYMBOL}`, { kind: "certified", score: 96 }]]));
      expect((await verificationJudgements({ ...upstream(), gameId: "melee" })).size).toBe(0);
      // Without the measured revision, provenance is unknown: nothing is excused.
      expect((await verificationJudgements({ ...upstream(), measuredRev: null })).size).toBe(0);
      // Epoch scope: landed after the epoch's start head, so it is this epoch's; from the integration commit on, it is ordinary.
      const head = git(f.repo, ["rev-parse", "HEAD"]);
      expect((await verificationJudgements({ ...upstream(), scope: "epoch", sinceRev: f.claimBase })).get(`${UNIT}::${SYMBOL}`)).toEqual({ kind: "certified", score: 96 });
      expect((await verificationJudgements({ ...upstream(), scope: "epoch", sinceRev: head })).has(`${UNIT}::${SYMBOL}`)).toBe(false);

      const gate = { status: "breakage", reasons: [] as string[], breakages: [{ unitName: UNIT, itemName: SYMBOL, toPercent: 96, kind: "function" }] };
      const gateOptions = { store: f.store, gameId: GAME, steeringGateActive: true, measuredRev: head, isAncestor };
      expect(await judgeMasterBreakageGate(gate, gateOptions)).toMatchObject({ status: "clean", breakages: [] });
      expect(await judgeMasterBreakageGate(gate, { ...gateOptions, steeringGateActive: false })).toBe(gate);
      const below = { ...gate, breakages: [{ ...gate.breakages[0]!, toPercent: 94 }] };
      expect((await judgeMasterBreakageGate(below, gateOptions)).status).toBe("breakage");
    } finally {
      f.store.db.close();
    }
  });

  test("a still-unverified function another integration lowers is judged against its current score", async () => {
    const f = setup();
    try {
      // No lane integration landed: the active unverified row alone sets nothing aside.
      expect(activeUnverifiedMatch(f.store, { gameId: GAME, unit: UNIT, symbol: SYMBOL })).not.toBeNull();
      const report = buildRegressionReport({
        units: [{ name: UNIT, functions: [{ name: SYMBOL, from: { fuzzy_match_percent: 100, size: "24" }, to: { fuzzy_match_percent: 90, size: "24" } }], sections: [] }],
      }, "Epoch", 50);
      const isAncestor = async () => true;
      const judged = await judgeRegressionReport(report, { store: f.store, gameId: GAME, scope: "epoch", sinceRev: f.claimBase, measuredRev: "head", isAncestor });
      expect(judged.brokenMatches.map((row) => row.itemName)).toEqual([SYMBOL]);
      expect(isCleanGlobalRegression(judged)).toBe(false);
      expect((await judgeMasterBreakageGate(
        { status: "breakage", reasons: [], breakages: [{ unitName: UNIT, itemName: SYMBOL, toPercent: 90, kind: "function" }] },
        { store: f.store, gameId: GAME, steeringGateActive: true, measuredRev: "head", isAncestor },
      )).status).toBe("breakage");
    } finally {
      f.store.db.close();
    }
  });
});

describe("module-prefixed report units (SMS)", () => {
  const REPORT_UNIT = "mario/Animal/AnimalBase";
  const STEERING_UNIT = "Animal/AnimalBase";

  /** A landed lane integration whose certification names the short unit and whose target key is the report's (prefixed) key. */
  function landedPrefixedRepair(gameId: string): StateStore {
    const store = openState(tempDir("certified-prefix-"));
    seedRunHarness(store, gameId, "base-sha", "/repo");
    const run = createRun(store, "matched_code_percent", 100, 1, { gameId }, { baseRevision: "base-sha" });
    landSyntheticRepair(store, run.id, { certUnit: STEERING_UNIT, targetKey: `${REPORT_UNIT}::${SYMBOL}`, score: 96, integratedRev: "landed-rev" });
    return store;
  }

  const report = () => buildRegressionReport({
    units: [{ name: REPORT_UNIT, functions: [{ name: SYMBOL, from: { fuzzy_match_percent: 100, size: "24" }, to: { fuzzy_match_percent: 96, size: "24" } }], sections: [] }],
  }, "Epoch", 50);

  test("a short-unit certification of a prefixed target is a certified repair, not a regression", async () => {
    const store = landedPrefixedRepair("sms");
    try {
      const provenance = { measuredRev: "landed-rev", isAncestor: async () => true };
      const judgements = await verificationJudgements({ store, gameId: "sms", scope: "upstream", ...provenance });
      expect([...judgements.keys()]).toEqual([`${STEERING_UNIT}::${SYMBOL}`]);
      const judged = await judgeRegressionReport(report(), { store, gameId: "sms", scope: "upstream", ...provenance });
      expect(judged.brokenMatches).toEqual([]);
      expect(judged.verificationSetAside?.map((row) => `${row.unitName}::${row.itemName}`)).toEqual([`${REPORT_UNIT}::${SYMBOL}`]);
      const gate = { status: "breakage", reasons: [] as string[], breakages: [{ unitName: REPORT_UNIT, itemName: SYMBOL, toPercent: 96, kind: "function" }] };
      expect(await judgeMasterBreakageGate(gate, { store, gameId: "sms", steeringGateActive: true, ...provenance })).toMatchObject({ status: "clean", breakages: [] });
    } finally {
      store.db.close();
    }
  });

  test("a game without module prefixes (Melee) still compares units exactly", async () => {
    const store = landedPrefixedRepair("melee");
    try {
      const provenance = { measuredRev: "landed-rev", isAncestor: async () => true };
      expect((await verificationJudgements({ store, gameId: "melee", scope: "upstream", ...provenance })).size).toBe(0);
      expect((await judgeRegressionReport(report(), { store, gameId: "melee", scope: "upstream", ...provenance })).brokenMatches.map((row) => row.itemName)).toEqual([SYMBOL]);
    } finally {
      store.db.close();
    }
  });
});

describe("only fresh landings in the measured tree excuse a regression", () => {
  const KEY = `${UNIT}::${SYMBOL}`;
  const report = () => buildRegressionReport({
    units: [{ name: UNIT, functions: [{ name: SYMBOL, from: { fuzzy_match_percent: 100, size: "24" }, to: { fuzzy_match_percent: 96, size: "24" } }], sections: [] }],
  }, "Epoch", 50);

  function store(): { store: StateStore; runId: string } {
    const opened = openState(tempDir("certified-provenance-"));
    seedRunHarness(opened, GAME, "base-sha", "/repo");
    return { store: opened, runId: createRun(opened, "matched_code_percent", 100, 1, { gameId: GAME }, { baseRevision: "base-sha" }).id };
  }

  // start <- landed <- measured on the kept branch; start <- discarded on a branch the measured tree never had.
  const isAncestor = ancestry({ landed: "start", measured: "landed", discarded: "start" });

  test("a stale landing (content applied over changed source, or no bound proof) does not excuse 100 -> 96", async () => {
    for (const proof of [
      { fresh: false, target_key: KEY, source_path: "src/a.c", claim_base_rev: "claim-base", pre_apply_rev: "pre-apply", integrated_rev: "landed", reason: "src/a.c changed" },
      null,
      { fresh: true, target_key: KEY, source_path: "src/other.c", claim_base_rev: "claim-base", pre_apply_rev: "pre-apply", integrated_rev: "landed" },
      { fresh: true, target_key: KEY, source_path: "src/a.c", claim_base_rev: "claim-base", pre_apply_rev: "pre-apply", integrated_rev: "elsewhere" },
    ]) {
      const { store: db, runId } = store();
      try {
        landSyntheticRepair(db, runId, { certUnit: UNIT, targetKey: KEY, score: 96, integratedRev: "landed", proof });
        const judged = await judgeRegressionReport(report(), { store: db, gameId: GAME, scope: "epoch", sinceRev: "start", measuredRev: "measured", isAncestor });
        expect(judged.brokenMatches.map((row) => row.itemName)).toEqual([SYMBOL]);
      } finally {
        db.db.close();
      }
    }
  });

  test("a fresh landing in the measured tree excuses it; a discarded-branch 96% certificate or unknown provenance does not", async () => {
    const { store: db, runId } = store();
    try {
      landSyntheticRepair(db, runId, { certUnit: UNIT, targetKey: KEY, score: 96, integratedRev: "landed" });
      const epoch = { store: db, gameId: GAME, scope: "epoch" as const, sinceRev: "start", isAncestor };
      expect((await judgeRegressionReport(report(), { ...epoch, measuredRev: "measured" })).brokenMatches).toEqual([]);
      expect((await judgeRegressionReport(report(), { ...epoch, measuredRev: null })).brokenMatches.map((row) => row.itemName)).toEqual([SYMBOL]);
      const failing = { ...epoch, measuredRev: "measured", isAncestor: async () => { throw new Error("git unavailable"); } };
      expect((await judgeRegressionReport(report(), failing)).brokenMatches.map((row) => row.itemName)).toEqual([SYMBOL]);
    } finally {
      db.db.close();
    }
    const discarded = store();
    try {
      landSyntheticRepair(discarded.store, discarded.runId, { certUnit: UNIT, targetKey: KEY, score: 96, integratedRev: "discarded" });
      for (const scope of ["epoch", "upstream"] as const) {
        const judged = await judgeRegressionReport(report(), { store: discarded.store, gameId: GAME, scope, sinceRev: "start", measuredRev: "measured", isAncestor });
        expect(judged.brokenMatches.map((row) => row.itemName)).toEqual([SYMBOL]);
        expect(isCleanGlobalRegression(judged)).toBe(false);
      }
    } finally {
      discarded.store.db.close();
    }
  });
});
