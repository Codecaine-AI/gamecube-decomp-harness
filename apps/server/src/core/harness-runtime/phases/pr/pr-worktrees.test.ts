import { MELEE_REQUIRE_PROTOS_PROBE } from "@server/core/game-registry/configure-command.js";
import { beforeAll as beforeBuildTests, afterAll as afterBuildTests } from "bun:test";
// These fixtures exercise local tool behavior. Production defaults to Daytona.
let previousBuildMode: string | undefined;
beforeBuildTests(() => { previousBuildMode = process.env.ORCH_BUILD_EXECUTION; process.env.ORCH_BUILD_EXECUTION = "local"; });
afterBuildTests(() => { if (previousBuildMode === undefined) delete process.env.ORCH_BUILD_EXECUTION; else process.env.ORCH_BUILD_EXECUTION = previousBuildMode; });
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  createPrWorktreeService,
  type CliResult,
  type PrWorktreeGameContext,
  type PrWorktreeServiceDeps,
} from "@server/core/harness-runtime/phases/pr/pr-worktrees.js";
import type { RegressionReport } from "@server/core/validation/objdiff/report.js";
import { openState } from "@server/core/orchestrator-state";
import { listUnverifiedMatches, recordUnverifiedMatch } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { recordSteeringRollback } from "@server/core/harness-runtime/run-state/steering.js";
import { createRun } from "@server/core/harness-runtime/run-state";
import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";

const cleanupPaths: string[] = [];
const ungatedPaths: PrWorktreeGameContext = { game: null, repoRoot: "/repo", stateDir: "/unused-pr-state" };

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  cleanupPaths.push(path);
  return path;
}

function successResult(stdout = ""): CliResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function cleanReport(): RegressionReport {
  return {
    regressions: [],
    brokenMatches: [],
    fuzzyRegressions: [],
    newMatches: [],
    summary: { matchedCodeBytesDelta: 0 },
  } as unknown as RegressionReport;
}

function issuesOutput(messages: string[]): string {
  return [
    `Issues: ${messages.length}`,
    `  src/melee/gm/gmtest.c (${messages.length})`,
    ...messages.map((message, index) => `    ${index + 1}:1: ${message}`),
  ].join("\n");
}

function createService(overrides: Partial<PrWorktreeServiceDeps<PrWorktreeGameContext>> = {}) {
  const deps: PrWorktreeServiceDeps<PrWorktreeGameContext> = {
    branchExists: () => true,
    codeIssuesChecker: async () => ({ status: "clean", output: "", files: [] }),
    isLocalBranchPrRecord: () => true,
    localBranchDiffBase: () => "base-sha",
    outputTail: (value) => value,
    prBranchPathSlug: (branch) => branch.replaceAll("/", "-"),
    prWorkspacePath: (stateDir, _runId, branch) => join(stateDir, branch.replaceAll("/", "-")),
    readRegressionReport: async () => cleanReport(),
    runCli: async () => successResult(),
    runGit: async () => successResult(),
    updatePrRecord: () => null,
    ...overrides,
  };
  return createPrWorktreeService(deps);
}

async function git(repoRoot: string, args: string[]): Promise<CliResult> {
  const process = Bun.spawn(["git", ...args], { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

afterEach(() => {
  for (const path of cleanupPaths.reverse()) rmSync(path, { force: true, recursive: true });
  cleanupPaths.length = 0;
});

describe("PR verification steering holds", () => {
  const MIXED = "src/JSystem/mixed.cpp";
  const CLEAN = "src/JSystem/clean.cpp";
  type HeldEdit = "none" | "newly_exact" | "improved" | "unscored" | "unscored_unnamed";

  /**
   * A real branch whose whole-file patch carries a verified edit and a held
   * edit in mixed.cpp, plus a verified edit alone in clean.cpp. The report
   * reflects exactly what the applied patch left in the baseline worktree.
   */
  /**
   * `reportPrefix`: the objdiff module prefix the report's unit names carry
   * (SMS `mario/`) while steering rows name the unit without it; `mixed`: the
   * mixed file, which the report maps the held unit to by its source path.
   */
  async function fixture(heldEdit: HeldEdit, options: { reportPrefix?: string; mixed?: string } = {}) {
    const MIXED = options.mixed ?? "src/JSystem/mixed.cpp";
    const reportUnit = (unit: string) => `${options.reportPrefix ?? ""}${unit}`;
    const repoRoot = tempDir("pr-held-repo-");
    const stateDir = tempDir("pr-held-state-");
    const baselineWorktree = tempDir("pr-held-baseline-");
    mkdirSync(join(repoRoot, "src/JSystem"), { recursive: true });
    writeFileSync(join(repoRoot, MIXED), "int verified(void) { return 0; }\nint pad0;\nint pad1;\nint pad2;\nint held(void) { return 0; }\n");
    writeFileSync(join(repoRoot, CLEAN), "int clean(void) { return 0; }\n");
    await git(repoRoot, ["init", "-q", "-b", "master"]);
    await git(repoRoot, ["config", "user.email", "test@example.com"]);
    await git(repoRoot, ["config", "user.name", "Test"]);
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-q", "-m", "base"]);
    const baseSha = (await git(repoRoot, ["rev-parse", "HEAD"])).stdout.trim();
    await git(repoRoot, ["switch", "-q", "-c", "pr/sms"]);
    writeFileSync(join(repoRoot, MIXED), "int verified(void) { return 1; }\nint pad0;\nint pad1;\nint pad2;\nint held(void) { return 1; }\n");
    writeFileSync(join(repoRoot, CLEAN), "int clean(void) { return 1; }\n");
    await git(repoRoot, ["commit", "-q", "-am", "branch"]);
    await git(repoRoot, ["worktree", "add", "-q", "--detach", baselineWorktree, baseSha]);

    const store = openState(stateDir);
    try {
      if (heldEdit === "newly_exact") {
        recordUnverifiedMatch(store, {
          gameId: "sms", unit: "JSystem/mixed", symbol: "held", analyzedRev: "pr/sms", baseRev: baseSha,
          sourcePath: MIXED, match: { base: 0, candidate: 100, real_only: null }, reasons: ["unsupported construct"],
        });
      } else if (heldEdit !== "none") {
        recordSteeringRollback(store, {
          gameId: "sms", unit: "JSystem/mixed", symbol: "held", analyzedRev: "pr/sms", baseRev: baseSha,
          initialVerdict: "steering", finalVerdict: "pass", rules: ["steering"], report: {}, status: "reverified",
        });
      }
    } finally {
      store.db.close();
    }

    const sourcePath = (file: string) => heldEdit === "unscored_unnamed" ? "" : file;
    const entry = (unitName: string, itemName: string, file: string, fromPercent: number, toPercent: number) => ({
      unitName, itemName, sourcePath: sourcePath(file), size: 64, fromPercent, toPercent, bytesDelta: 64,
    });
    const service = createService({
      runCli: async (command, cwd) => command[0] === "git" ? git(cwd ?? repoRoot, command.slice(1)) : successResult(),
      runGit: async (root, args) => git(root, args),
      readRegressionReport: async () => {
        const mixed = readFileSync(join(baselineWorktree, MIXED), "utf8").includes("return 1");
        const clean = readFileSync(join(baselineWorktree, CLEAN), "utf8").includes("return 1");
        const newMatches = [
          ...(mixed ? [entry(reportUnit("JSystem/mixed"), "verified", MIXED, 0, 100)] : []),
          ...(mixed && (heldEdit === "newly_exact" || heldEdit === "none") ? [entry(reportUnit("JSystem/mixed"), "held", MIXED, 0, 100)] : []),
          ...(clean ? [entry(reportUnit("JSystem/clean"), "clean", CLEAN, 0, 100)] : []),
        ];
        const improvements = mixed && heldEdit === "improved" ? [entry(reportUnit("JSystem/mixed"), "held", MIXED, 40, 90)] : [];
        return {
          ...cleanReport(), newMatches, improvements,
          summary: { matchedCodeBytesDelta: newMatches.length * 64 },
        } as unknown as RegressionReport;
      },
    });
    const paths: PrWorktreeGameContext = {
      game: { gameId: "sms", kind: "doldecomp-sms", matching: { steeringGate: "enforce" } }, repoRoot, stateDir,
    };
    return { service, paths, baseSha, baselineWorktree, repoRoot };
  }

  const heldCases: Array<{ label: string; heldEdit: Exclude<HeldEdit, "none">; rawNewMatches: number; heldMatches: number }> = [
    { label: "a newly exact unverified match", heldEdit: "newly_exact", rawNewMatches: 3, heldMatches: 1 },
    { label: "a rolled-back function that only improved", heldEdit: "improved", rawNewMatches: 2, heldMatches: 0 },
    { label: "a rolled-back function edited without a score change", heldEdit: "unscored", rawNewMatches: 2, heldMatches: 0 },
    { label: "an unscored held edit whose report rows name no source path", heldEdit: "unscored_unnamed", rawNewMatches: 2, heldMatches: 0 },
  ];

  test.each(heldCases)("verifyShipSet drops a mixed file carrying $label and ships only the clean file", async ({ heldEdit }) => {
    const { service, paths, baseSha, baselineWorktree } = await fixture(heldEdit);

    const status = await service.verifyShipSet(paths, { baseSha, worktreeDir: baselineWorktree }, [MIXED, CLEAN], { sourceRef: "pr/sms" });

    expect(status).toMatchObject({
      status: "pr_ready", shippedFiles: [CLEAN], newMatches: 1, rawNewMatches: 1, heldMatches: 0, matchedCodeBytesDelta: 64,
    });
    expect(Object.keys(status.droppedFiles as object)).toEqual([MIXED]);
    expect((status.droppedFiles as Record<string, string[]>)[MIXED]).toEqual([expect.stringContaining("steering hold JSystem/mixed::held")]);
    const patch = readFileSync(String(status.patchPath), "utf8");
    expect(patch).toContain(CLEAN);
    expect(patch).not.toContain(MIXED);
    expect((await git(baselineWorktree, ["status", "--porcelain"])).stdout).toBe("");
    const observer = openState(paths.stateDir, { migrate: false });
    try {
      // Verification only reads holds; it never clears the evidence behind them.
      expect(listUnverifiedMatches(observer, "sms")).toHaveLength(heldEdit === "newly_exact" ? 1 : 0);
    } finally {
      observer.db.close();
    }
  });

  test.each(heldCases)("verifyPrSliceInBaseline rejects a mixed file patch carrying $label", async ({ heldEdit, rawNewMatches, heldMatches }) => {
    const { service, paths, baseSha, baselineWorktree, repoRoot } = await fixture(heldEdit);
    const patchPath = join(paths.stateDir, "slice.patch");
    writeFileSync(patchPath, (await git(repoRoot, ["diff", "--binary", `${baseSha}..pr/sms`, "--", MIXED, CLEAN])).stdout);

    const result = await service.verifyPrSliceInBaseline({
      paths, sourceRef: "pr/sms", baseSha, baselineWorktree, files: [MIXED, CLEAN], patchPath,
    });

    expect(result.validation).toMatchObject({ status: "failed", rawNewMatches, heldMatches, newMatches: rawNewMatches - heldMatches });
    expect(Object.keys(result.validation.steeringHeldFiles as object)).toEqual([MIXED]);
    expect(() => service.assertSliceVerificationClean("pr/sms", result.validation)).toThrow(`ships held steering edits in ${MIXED}`);
    expect((await git(baselineWorktree, ["status", "--porcelain"])).stdout).toBe("");
  });

  test.each([
    { label: "a newly exact unverified match", heldEdit: "newly_exact" as const, heldMatches: 1 },
    { label: "a rolled-back function that only improved", heldEdit: "improved" as const, heldMatches: 0 },
  ])("SMS report units with the module prefix still find $label held under its short unit", async ({ heldEdit, heldMatches }) => {
    // The report maps `mario/JSystem/mixed` to shared.cpp: no filename fallback can find it, only the unit.
    const SHARED = "src/JSystem/shared.cpp";
    const { service, paths, baseSha, baselineWorktree, repoRoot } = await fixture(heldEdit, { reportPrefix: "mario/", mixed: SHARED });

    const status = await service.verifyShipSet(paths, { baseSha, worktreeDir: baselineWorktree }, [SHARED, CLEAN], { sourceRef: "pr/sms" });
    expect(status).toMatchObject({ status: "pr_ready", shippedFiles: [CLEAN], newMatches: 1, heldMatches: 0, matchedCodeBytesDelta: 64 });
    expect(Object.keys(status.droppedFiles as object)).toEqual([SHARED]);

    const patchPath = join(paths.stateDir, "slice.patch");
    writeFileSync(patchPath, (await git(repoRoot, ["diff", "--binary", `${baseSha}..pr/sms`, "--", SHARED, CLEAN])).stdout);
    const result = await service.verifyPrSliceInBaseline({
      paths, sourceRef: "pr/sms", baseSha, baselineWorktree, files: [SHARED, CLEAN], patchPath,
    });
    const rawNewMatches = heldEdit === "newly_exact" ? 3 : 2;
    // The held new match earns neither a match nor its bytes.
    expect(result.validation).toMatchObject({ status: "failed", rawNewMatches, heldMatches, newMatches: rawNewMatches - heldMatches });
    expect(result.validation.matchedCodeBytesDelta).toBe(rawNewMatches * 64 - heldMatches * 64);
    expect(Object.keys(result.validation.steeringHeldFiles as object)).toEqual([SHARED]);
  });

  test("the same gated patch ships whole when no function in it is held", async () => {
    const { service, paths, baseSha, baselineWorktree, repoRoot } = await fixture("none");

    const status = await service.verifyShipSet(paths, { baseSha, worktreeDir: baselineWorktree }, [MIXED, CLEAN], { sourceRef: "pr/sms" });
    expect(status).toMatchObject({ status: "pr_ready", shippedFiles: [MIXED, CLEAN], newMatches: 3, heldMatches: 0, droppedFiles: {} });

    const patchPath = join(paths.stateDir, "slice.patch");
    writeFileSync(patchPath, (await git(repoRoot, ["diff", "--binary", `${baseSha}..pr/sms`, "--", MIXED, CLEAN])).stdout);
    const result = await service.verifyPrSliceInBaseline({
      paths, sourceRef: "pr/sms", baseSha, baselineWorktree, files: [MIXED, CLEAN], patchPath,
    });
    expect(result.validation).toMatchObject({ status: "passed", newMatches: 3, steeringHeldFiles: {} });
    expect(() => service.assertSliceVerificationClean("pr/sms", result.validation)).not.toThrow();
  });

  test("gated verification fails closed without creating a missing state database", async () => {
    const stateDir = tempDir("pr-credit-missing-state-");
    const baselineWorktree = tempDir("pr-credit-missing-baseline-");
    const paths: PrWorktreeGameContext = {
      game: { gameId: "sms", matching: { steeringGate: "enforce" } }, repoRoot: baselineWorktree, stateDir,
    };
    const service = createService();
    await expect(service.verifyShipSet(paths, {
      baseSha: "trusted-base", worktreeDir: baselineWorktree,
    }, ["src/mixed.cpp"])).rejects.toThrow();
    await expect(service.verifyPrSliceInBaseline({
      paths, baseSha: "trusted-base", baselineWorktree, files: ["src/mixed.cpp"], patchPath: join(stateDir, "slice.patch"),
    })).rejects.toThrow();
    expect(existsSync(join(stateDir, "orchestrator.sqlite"))).toBe(false);
  });
});

describe("PR readiness keeps certified repairs on raw scores", () => {
  const FILE = "src/JSystem/repaired.cpp";
  const UNIT = "JSystem/repaired";

  /** A state DB where a certification-lane checkpoint (unverified 100 -> certified 96) of `JSystem/repaired::fn` landed. */
  async function landedRepairState(certificationUnit = UNIT, targetKey = `${UNIT}::fn`, fresh = true): Promise<string> {
    const stateDir = tempDir("pr-certified-repair-state-");
    const store = openState(stateDir);
    try {
      seedRunHarness(store, "sms", "base-sha", "/repo");
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "sms" }, { baseRevision: "base-sha" });
      store.db.query(`INSERT INTO worker_checkpoints (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id, attempt_index,
          validation_time, hard_gates_passed, validation_status, validation_state, write_set_json, metadata_json)
        VALUES ('cp-1', 'ws-1', ?, 'epoch-1', 'et-1', 'claim-1', 0, 'then', 1, 'passed', 'tentative', '[]', ?)`)
        .run(run.id, JSON.stringify({ certification: { certified: true, kind: "gate_pass", unit: certificationUnit, symbol: "fn", score: 96, certificate_hash: "h", revision: "trusted", progress: "first_certificate", high_water_before: null, lane: "unverified_match" } }));
      store.db.query(`INSERT INTO target_claims (id, run_id, epoch_id, epoch_target_id, worker_id, base_rev, status, claimed_at)
        VALUES ('claim-1', ?, 'epoch-1', 'et-1', 'worker-1', 'claim-base', 'closed', 'then')`).run(run.id);
      store.db.query(`INSERT INTO epoch_targets (id, epoch_id, run_id, target_key, unit, symbol, source_path, size, baseline_score, priority, admission_index, status, admitted_at)
        VALUES ('et-1', 'epoch-1', ?, ?, ?, 'fn', ?, 64, 100, 1, 0, 'finished', 'then')`).run(run.id, targetKey, targetKey.slice(0, targetKey.lastIndexOf("::")), FILE);
      // The landed-content proof the integration queue records (fresh: the gated source landed unchanged).
      store.db.query(`INSERT INTO integration_outcomes (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id, worker_checkpoint_id,
          status, target_key, metadata_json, created_at, updated_at)
        VALUES ('int-1', ?, 'epoch-1', 'et-1', 'claim-1', 'ws-1', 'cp-1', 'applied', ?, ?, 'then', 'then')`)
        .run(run.id, targetKey, JSON.stringify({
          integrated_rev: "landed-rev", pre_apply_rev: "pre-apply",
          steering_content_freshness: { fresh, target_key: targetKey, source_path: FILE, claim_base_rev: "claim-base", pre_apply_rev: "pre-apply", integrated_rev: "landed-rev" },
        }));
    } finally {
      store.db.close();
    }
    return stateDir;
  }

  function repairReport(unitName = UNIT): RegressionReport {
    return {
      ...cleanReport(),
      brokenMatches: [{ unitName, itemName: "fn", sourcePath: FILE, size: 64, fromPercent: 100, toPercent: 96, bytesDelta: -3 }],
    } as unknown as RegressionReport;
  }

  test("a certified repair below the upstream score is held out of the slice with an explicit reason", async () => {
    const stateDir = await landedRepairState();
    const paths: PrWorktreeGameContext = { game: { gameId: "sms", matching: { steeringGate: "enforce" } }, repoRoot: "/repo", stateDir };
    const service = createService({ readRegressionReport: async () => repairReport() });

    const status = await service.verifyShipSet(paths, { baseSha: "base-sha", worktreeDir: tempDir("pr-certified-baseline-") }, [FILE], { sourceRef: "pr/sms" });
    const reasons = Object.values({ ...(status.droppedFiles as object), ...(status.unattributed as object ?? {}) }).flat() as string[];
    expect(status.status).not.toBe("pr_ready");
    expect(reasons).toContain("certified repair below upstream score; not shippable until exact: fn 100.00 -> 96.00 (certified 96.00)");

    const slice = await service.verifyPrSliceInBaseline({
      paths, sourceRef: "pr/sms", baseSha: "base-sha", baselineWorktree: tempDir("pr-certified-slice-"), files: [FILE], patchPath: join(stateDir, "slice.patch"),
    });
    expect(slice.validation).toMatchObject({
      status: "failed", brokenMatches: 1,
      certifiedRepairs: [{ target: `${UNIT}::fn`, fromPercent: 100, toPercent: 96, certifiedScore: 96, reason: "certified repair below upstream score; not shippable until exact" }],
    });
    expect(() => service.assertSliceVerificationClean("pr/sms", slice.validation))
      .toThrow("1 certified repair below upstream score; not shippable until exact (JSystem/repaired::fn 96%)");
  });

  test("a short-unit certification names the module-prefixed report row and integration key as the same repair", async () => {
    const REPORT_UNIT = `mario/${UNIT}`;
    const stateDir = await landedRepairState(UNIT, `${REPORT_UNIT}::fn`);
    const paths: PrWorktreeGameContext = { game: { gameId: "sms", matching: { steeringGate: "enforce" } }, repoRoot: "/repo", stateDir };
    const service = createService({ readRegressionReport: async () => repairReport(REPORT_UNIT) });
    const slice = await service.verifyPrSliceInBaseline({
      paths, sourceRef: "pr/sms", baseSha: "base-sha", baselineWorktree: tempDir("pr-certified-slice-"), files: [FILE], patchPath: join(stateDir, "slice.patch"),
    });
    expect(slice.validation).toMatchObject({
      certifiedRepairs: [{ target: `${REPORT_UNIT}::fn`, fromPercent: 100, toPercent: 96, certifiedScore: 96 }],
    });
  });
});

describe("PR readiness labels only proven certified repairs", () => {
  test("a stale landing, or a source ref the landing is not in, keeps the plain regression reason", async () => {
    const FILE = "src/JSystem/repaired.cpp";
    const UNIT = "JSystem/repaired";
    const report = { ...cleanReport(), brokenMatches: [{ unitName: UNIT, itemName: "fn", sourcePath: FILE, size: 64, fromPercent: 100, toPercent: 96, bytesDelta: -3 }] } as unknown as RegressionReport;
    const seed = (fresh: boolean) => {
      const stateDir = tempDir("pr-certified-stale-");
      const store = openState(stateDir);
      try {
        seedRunHarness(store, "sms", "base-sha", "/repo");
        const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "sms" }, { baseRevision: "base-sha" });
        store.db.query(`INSERT INTO worker_checkpoints (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id, attempt_index,
            validation_time, hard_gates_passed, validation_status, validation_state, write_set_json, metadata_json)
          VALUES ('cp-1', 'ws-1', ?, 'epoch-1', 'et-1', 'claim-1', 0, 'then', 1, 'passed', 'tentative', '[]', ?)`)
          .run(run.id, JSON.stringify({ certification: { certified: true, kind: "gate_pass", unit: UNIT, symbol: "fn", score: 96, lane: "unverified_match" } }));
        store.db.query(`INSERT INTO target_claims (id, run_id, epoch_id, epoch_target_id, worker_id, base_rev, status, claimed_at)
          VALUES ('claim-1', ?, 'epoch-1', 'et-1', 'worker-1', 'claim-base', 'closed', 'then')`).run(run.id);
        store.db.query(`INSERT INTO epoch_targets (id, epoch_id, run_id, target_key, unit, symbol, source_path, size, baseline_score, priority, admission_index, status, admitted_at)
          VALUES ('et-1', 'epoch-1', ?, ?, ?, 'fn', ?, 64, 100, 1, 0, 'finished', 'then')`).run(run.id, `${UNIT}::fn`, UNIT, FILE);
        store.db.query(`INSERT INTO integration_outcomes (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id, worker_checkpoint_id,
            status, target_key, metadata_json, created_at, updated_at)
          VALUES ('int-1', ?, 'epoch-1', 'et-1', 'claim-1', 'ws-1', 'cp-1', 'applied', ?, ?, 'then', 'then')`)
          .run(run.id, `${UNIT}::fn`, JSON.stringify({
            integrated_rev: "landed-rev", pre_apply_rev: "pre-apply",
            steering_content_freshness: { fresh, target_key: `${UNIT}::fn`, source_path: FILE, claim_base_rev: "claim-base", pre_apply_rev: "pre-apply", integrated_rev: "landed-rev" },
          }));
      } finally {
        store.db.close();
      }
      return { game: { gameId: "sms", matching: { steeringGate: "enforce" } }, repoRoot: "/repo", stateDir } as PrWorktreeGameContext;
    };
    const verify = (paths: PrWorktreeGameContext, notAncestor = false) => createService({
      readRegressionReport: async () => report,
      runGit: async (_root, args) => (notAncestor && args[0] === "merge-base" ? { exitCode: 1, stdout: "", stderr: "" } : successResult()),
    }).verifyPrSliceInBaseline({ paths, sourceRef: "pr/sms", baseSha: "base-sha", baselineWorktree: tempDir("pr-certified-stale-slice-"), files: [FILE], patchPath: join(paths.stateDir, "slice.patch") });
    for (const result of [await verify(seed(false)), await verify(seed(true), true)]) {
      expect(result.validation).toMatchObject({ status: "failed", brokenMatches: 1, certifiedRepairs: [] });
    }
  });
});

describe("Melee PR verification output without a steering gate", () => {
  const meleeReport = (regressed: boolean): RegressionReport => ({
    ...cleanReport(),
    newMatches: [{ unitName: "main/melee/gm/gmtest", itemName: "gm_80000000", sourcePath: "src/melee/gm/gmtest.c", size: 64, fromPercent: 0, toPercent: 100, bytesDelta: 64 }],
    summary: { matchedCodeBytesDelta: 64 },
    regressions: regressed ? [{ name: null, key: "matched_data_percent", from: 100, to: 90 }] : [],
  } as unknown as RegressionReport);

  function meleeFixture() {
    const stateDir = tempDir("pr-melee-state-");
    const paths: PrWorktreeGameContext = { game: { gameId: "melee", kind: "doldecomp-melee", baseRef: "origin/master" }, repoRoot: "/repo", stateDir };
    return { stateDir, paths, baselineWorktree: tempDir("pr-melee-baseline-") };
  }

  function captureUiLog(): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const spy = spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
    return { lines, restore: () => spy.mockRestore() };
  }

  test("ship-set status and log keep the legacy fields, order and text", async () => {
    const { stateDir, paths, baselineWorktree } = meleeFixture();
    const log = captureUiLog();
    let ready: Record<string, unknown>;
    let blocked: Record<string, unknown>;
    try {
      ready = await createService({ readRegressionReport: async () => meleeReport(false) })
        .verifyShipSet(paths, { baseSha: "base-sha", worktreeDir: baselineWorktree }, ["src/melee/gm/gmtest.c"]);
      blocked = await createService({ readRegressionReport: async () => meleeReport(true) })
        .verifyShipSet(paths, { baseSha: "base-sha", worktreeDir: baselineWorktree }, ["src/melee/gm/gmtest.c"]);
    } finally {
      log.restore();
    }

    expect(Object.keys(ready)).toEqual([
      "status", "baseSha", "files", "rounds", "newMatches", "brokenMatches", "fuzzyRegressions", "metricRegressions",
      "matchedCodeBytesDelta", "issuesCheck", "droppedFiles", "shippedFiles", "patchPath", "checkedAt",
    ]);
    expect(ready).toMatchObject({ status: "pr_ready", newMatches: 1, matchedCodeBytesDelta: 64 });
    expect(Object.keys(blocked)).toEqual([
      "status", "baseSha", "files", "rounds", "newMatches", "brokenMatches", "fuzzyRegressions", "metricRegressions",
      "droppedFiles", "unattributed", "patchPath", "checkedAt",
    ]);
    expect(log.lines).toContain("[ui] ship-set verification: pr_ready (1 confirmed matches, 0 file(s) dropped for rework)\n");
    expect(JSON.parse(readFileSync(join(stateDir, "pr_handoff/ship_status.json"), "utf8"))).toEqual(blocked);
    expect(existsSync(join(stateDir, "orchestrator.sqlite"))).toBe(false);
  });

  test("slice validation keeps the legacy fields and order", async () => {
    const { stateDir, paths, baselineWorktree } = meleeFixture();
    const service = createService({ readRegressionReport: async () => meleeReport(false) });

    const result = await service.verifyPrSliceInBaseline({
      paths, baseSha: "base-sha", baselineWorktree, files: ["src/melee/gm/gmtest.c"], patchPath: join(stateDir, "slice.patch"),
    });

    expect(Object.keys(result.validation)).toEqual([
      "status", "checkedAt", "newMatches", "regressions", "brokenMatches", "fuzzyRegressions", "metricRegressions",
      "matchedCodeBytesDelta", "issuesCheck", "issuesFiles", "issuesOutput",
    ]);
    expect(result.validation).toMatchObject({ status: "passed", newMatches: 1, matchedCodeBytesDelta: 64 });
    expect(existsSync(join(stateDir, "orchestrator.sqlite"))).toBe(false);
  });
});

describe("production baseline tracing", () => {
  test.each([
    ["doldecomp-sms", "python3 configure.py --wrapper build/tools/wibo"],
    ["doldecomp-melee", `python3 configure.py ${MELEE_REQUIRE_PROTOS_PROBE} --wrapper build/tools/wibo`],
  ])("uses the configure command for %s", async (kind, expectedConfigureCommand) => {
    const repoRoot = tempDir("pr-baseline-configure-repo-");
    const stateDir = tempDir("pr-baseline-configure-state-");
    const baseSha = `base-${kind}-${basename(stateDir)}`;
    const worktreeDir = resolve(tmpdir(), `melee-baseline-${baseSha}`);
    cleanupPaths.push(worktreeDir);
    mkdirSync(resolve(worktreeDir, "build/tools"), { recursive: true });
    writeFileSync(resolve(worktreeDir, "build/tools/wibo"), "wibo", "utf8");
    const commands: string[][] = [];
    const service = createService({
      runCli: async (command) => {
        commands.push(command);
        if (command[0] === "ninja") {
          mkdirSync(resolve(worktreeDir, "build/GALE01"), { recursive: true });
          writeFileSync(resolve(worktreeDir, "build/GALE01/baseline.json"), "{}", "utf8");
        }
        return successResult();
      },
      runGit: async () => successResult(`${baseSha}\n`),
    });

    await service.rebuildProductionBaseline(
      { game: { baseRef: "origin/main", kind }, repoRoot, stateDir },
      undefined,
      {
        workflowId: "pr-handoff:run-1",
        correlationId: "pr-handoff:run-1",
        gameEventId: "game-event-acquired",
        causedByEventId: "game-event-requested",
      },
    );

    expect(commands[0]).toEqual(["/bin/sh", "-c", expectedConfigureCommand]);
  });

  test("carries one owning-workflow linkage unchanged into started and completed events", async () => {
    const repoRoot = tempDir("pr-baseline-repo-");
    const stateDir = tempDir("pr-baseline-state-");
    const baseSha = `base-${basename(stateDir)}`;
    const worktreeDir = resolve(tmpdir(), `melee-baseline-${baseSha}`);
    cleanupPaths.push(worktreeDir);
    mkdirSync(resolve(worktreeDir, "build/GALE01"), { recursive: true });
    writeFileSync(resolve(worktreeDir, "build/GALE01/baseline.json"), "{}", "utf8");
    const events: unknown[] = [];
    const service = createService({
      runGit: async () => successResult(`${baseSha}\n`),
      submitWorkflowEvent: async (_paths, input) => {
        events.push(input);
        return null;
      },
    });
    const productionLinkage = {
      workflowId: "pr-handoff:run-1",
      correlationId: "pr-handoff:run-1",
      gameEventId: "game-event-acquired",
      causedByEventId: "game-event-requested",
    };

    await service.rebuildProductionBaseline(
      { game: { baseRef: "origin/main" }, repoRoot, stateDir },
      undefined,
      productionLinkage,
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      operation: "rebuildProductionBaseline",
      status: "started",
      correlationId: productionLinkage.correlationId,
      gameEventId: productionLinkage.gameEventId,
      causedByEventId: productionLinkage.causedByEventId,
    });
    expect(events[1]).toMatchObject({
      operation: "rebuildProductionBaseline",
      status: "completed",
      correlationId: productionLinkage.correlationId,
      gameEventId: productionLinkage.gameEventId,
      causedByEventId: productionLinkage.causedByEventId,
    });
  });

  test("rejects absent or mismatched owning-workflow linkage before baseline side effects", async () => {
    const sideEffects: string[] = [];
    const paths = {
      game: { baseRef: "origin/main" },
      repoRoot: tempDir("pr-baseline-reject-repo-"),
      stateDir: tempDir("pr-baseline-reject-state-"),
    };
    const service = createService({
      runCli: async () => {
        sideEffects.push("cli");
        return successResult();
      },
      runGit: async () => {
        sideEffects.push("git");
        return successResult("base-sha\n");
      },
      submitWorkflowEvent: async () => {
        sideEffects.push("event");
        return null;
      },
    });

    await expect(service.rebuildProductionBaseline(paths)).rejects.toThrow(
      "Production baseline tracing requires durable PR dispatch linkage",
    );
    await expect(service.rebuildProductionBaseline(paths, undefined, {
      workflowId: "pr-handoff:run-1",
      correlationId: "pr-handoff:run-2",
      gameEventId: "game-event-acquired",
      causedByEventId: "game-event-requested",
    })).rejects.toThrow(
      "Production baseline trace correlation pr-handoff:run-2 does not match owning PR workflow pr-handoff:run-1",
    );
    expect(sideEffects).toEqual([]);
  });
});

describe("PR support-file worktrees", () => {
  test("readyLocalPrSource accepts declared support files and includes them in the patch diff", async () => {
    const stateDir = tempDir("pr-worktrees-ready-");
    const commands: string[][] = [];
    const service = createService({
      runGit: async (_repoRoot, args) => {
        commands.push(args);
        if (args[0] === "rev-parse") return successResult("head-sha\n");
        if (args[0] === "diff" && args[1] === "--name-only") {
          return successResult("src/melee/gm/gmtest.c\ninclude/melee/gr/ground.h\n");
        }
        if (args[0] === "diff" && args[1] === "--binary") return successResult("binary patch\n");
        return successResult();
      },
    });

    const source = await service.readyLocalPrSource({
      baseSha: "base-sha",
      branch: "pr-split/gm",
      files: ["src/melee/gm/gmtest.c"],
      supportFiles: ["include/melee/gr/ground.h", "include/melee/gr/ground.h"],
      record: { local: { status: "local_only" } },
      repoRoot: "/repo",
      stateDir,
    });

    expect(source?.commitSha).toBe("head-sha");
    expect(commands).toContainEqual([
      "diff",
      "--binary",
      "base-sha..pr-split/gm",
      "--",
      "src/melee/gm/gmtest.c",
      "include/melee/gr/ground.h",
    ]);
  });

  test("readyLocalPrSource still rejects every undeclared changed file with the correct manifest message", async () => {
    const stateDir = tempDir("pr-worktrees-manifest-");
    let binaryDiffCalls = 0;
    const serviceForChanged = (changedFiles: string) =>
      createService({
        runGit: async (_repoRoot, args) => {
          if (args[0] === "rev-parse") return successResult("head-sha\n");
          if (args[0] === "diff" && args[1] === "--name-only") return successResult(changedFiles);
          if (args[0] === "diff" && args[1] === "--binary") binaryDiffCalls += 1;
          return successResult("binary patch\n");
        },
      });
    const common = {
      baseSha: "base-sha",
      branch: "pr-split/gm",
      files: ["src/melee/gm/gmtest.c"],
      record: { local: { status: "local_only" } },
      repoRoot: "/repo",
      stateDir,
    };

    await expect(
      serviceForChanged("src/melee/gm/gmtest.c\ninclude/melee/gr/ground.h\nconfig/stray.yml\n").readyLocalPrSource({
        ...common,
        supportFiles: ["include/melee/gr/ground.h"],
      }),
    ).rejects.toThrow(
      "Local PR branch pr-split/gm changes file(s) outside the PR manifest (files + declared support files): config/stray.yml. Re-plan or move those edits before opening.",
    );

    await expect(serviceForChanged("src/melee/gm/gmtest.c\nconfig/stray.yml\n").readyLocalPrSource(common)).rejects.toThrow(
      "Local PR branch pr-split/gm changes file(s) outside the PR manifest: config/stray.yml. Re-plan or move those edits before opening.",
    );
    expect(binaryDiffCalls).toBe(0);
  });

  test("a rejected manifest can be explicitly re-planned with the support path", async () => {
    const stateDir = tempDir("pr-worktrees-replan-");
    const service = createService({
      runGit: async (_repoRoot, args) => {
        if (args[0] === "rev-parse") return successResult("head-sha\n");
        if (args[0] === "diff" && args[1] === "--name-only") {
          return successResult("src/melee/gm/gmtest.c\ninclude/melee/gr/ground.h\n");
        }
        return successResult("binary patch\n");
      },
    });
    const common = {
      baseSha: "base-sha",
      branch: "pr-split/gm",
      files: ["src/melee/gm/gmtest.c"],
      record: { local: { status: "local_only" } },
      repoRoot: "/repo",
      stateDir,
    };

    await expect(service.readyLocalPrSource(common)).rejects.toThrow("outside the PR manifest");
    await expect(
      service.readyLocalPrSource({ ...common, supportFiles: ["include/melee/gr/ground.h"] }),
    ).resolves.toMatchObject({ commitSha: "head-sha" });
  });

  test("verifyPrSliceInBaseline applies primary and support files together", async () => {
    const commands: string[][] = [];
    const service = createService({
      runCli: async (command) => {
        commands.push(command);
        return successResult();
      },
    });

    await service.verifyPrSliceInBaseline({
      paths: ungatedPaths,
      baseSha: "base-sha",
      baselineWorktree: "/baseline",
      files: ["src/melee/gm/gmtest.c"],
      supportFiles: ["include/melee/gr/ground.h"],
      patchPath: "/tmp/slice.patch",
    });

    expect(commands[0]).toEqual([
      "git",
      "apply",
      "--include=src/melee/gm/gmtest.c",
      "--include=include/melee/gr/ground.h",
      "/tmp/slice.patch",
    ]);
  });

  test("check-issues parity accepts only diagnostics already present on pristine master", async () => {
    const checks = [
      { status: "issues" as const, output: issuesOutput(["pre-existing warning"]), files: ["src/melee/gm/gmtest.c"] },
      { status: "issues" as const, output: issuesOutput(["pre-existing warning"]), files: ["src/melee/gm/gmtest.c"] },
    ];
    const service = createService({ codeIssuesChecker: async () => checks.shift()! });

    const result = await service.verifyPrSliceInBaseline({
      paths: ungatedPaths,
      baseSha: "0123456789abcdef",
      baselineWorktree: "/baseline",
      files: ["src/melee/gm/gmtest.c"],
      patchPath: "/tmp/slice.patch",
    });

    expect(result.issues.status).toBe("clean");
    expect(result.issues.output).toContain("master-parity: every reported issue is pre-existing on pristine 0123456789");
  });

  test("check-issues parity rejects a new diagnostic and excess duplicate", async () => {
    const checks = [
      {
        status: "issues" as const,
        output: issuesOutput(["pre-existing warning", "pre-existing warning", "new clang failure"]),
        files: ["src/melee/gm/gmtest.c"],
      },
      { status: "issues" as const, output: issuesOutput(["pre-existing warning"]), files: ["src/melee/gm/gmtest.c"] },
    ];
    const service = createService({ codeIssuesChecker: async () => checks.shift()! });

    const result = await service.verifyPrSliceInBaseline({
      paths: ungatedPaths,
      baseSha: "base-sha",
      baselineWorktree: "/baseline",
      files: ["src/melee/gm/gmtest.c"],
      patchPath: "/tmp/slice.patch",
    });

    expect(result.issues.status).toBe("issues");
    expect(result.issues.output).toContain("new clang failure");
    expect(result.issues.output.match(/pre-existing warning/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test("check-issues parity treats an excess duplicate as a new slice issue", async () => {
    const checks = [
      {
        status: "issues" as const,
        output: issuesOutput(["same diagnostic", "same diagnostic"]),
        files: ["src/melee/gm/gmtest.c"],
      },
      { status: "issues" as const, output: issuesOutput(["same diagnostic"]), files: ["src/melee/gm/gmtest.c"] },
    ];
    const service = createService({ codeIssuesChecker: async () => checks.shift()! });

    const result = await service.verifyPrSliceInBaseline({
      paths: ungatedPaths,
      baseSha: "base-sha",
      baselineWorktree: "/baseline",
      files: ["src/melee/gm/gmtest.c"],
      patchPath: "/tmp/slice.patch",
    });

    expect(result.issues.status).toBe("issues");
    expect(result.issues.output).toContain("new vs pristine baseline:\nsrc/melee/gm/gmtest.c :: same diagnostic");
  });

  test("check-issues parity fails closed when diagnostics or pristine cleanup cannot be verified", async () => {
    const unparsable = createService({
      codeIssuesChecker: async () => ({ status: "issues", output: "Issues: 1\nunexpected format", files: [] }),
    });
    await expect(
      unparsable.verifyPrSliceInBaseline({
        paths: ungatedPaths,
        baseSha: "base-sha",
        baselineWorktree: "/baseline",
        files: ["src/melee/gm/gmtest.c"],
        patchPath: "/tmp/slice.patch",
      }),
    ).rejects.toThrow("could not be parsed for pristine-master parity");

    const cleanupFailure = createService({
      codeIssuesChecker: async () => ({ status: "clean", output: "", files: [] }),
      runCli: async (command) => command[0] === "git" && command[1] === "reset"
        ? { exitCode: 1, stdout: "", stderr: "reset failed" }
        : successResult(),
    });
    await expect(
      cleanupFailure.verifyPrSliceInBaseline({
        paths: ungatedPaths,
        baseSha: "base-sha",
        baselineWorktree: "/baseline",
        files: ["src/melee/gm/gmtest.c"],
        patchPath: "/tmp/slice.patch",
      }),
    ).rejects.toThrow("could not restore pristine baseline");
  });

  test("prepareLocalPrWorkspace and publishPatchToFork apply support files", async () => {
    const stateDir = tempDir("pr-worktrees-include-");
    const commands: string[][] = [];
    const service = createService({
      runCli: async (command) => {
        commands.push(command);
        return successResult();
      },
      runGit: async (_repoRoot, args) => successResult(args[0] === "rev-parse" ? "head-sha\n" : ""),
    });
    const files = ["src/melee/gm/gmtest.c"];
    const supportFiles = ["include/melee/gr/ground.h"];

    await service.prepareLocalPrWorkspace({
      baseSha: "base-sha",
      branch: "pr-split/gm",
      files,
      supportFiles,
      force: false,
      patchPath: "/tmp/slice.patch",
      record: {},
      repoRoot: "/repo",
      runId: "run-1",
      stateDir,
      title: "test",
    });
    await service.publishPatchToFork({
      baseSha: "base-sha",
      branch: "pr-split/gm-test-support",
      files,
      supportFiles,
      patchPath: "/tmp/slice.patch",
      repoRoot: "/repo",
      title: "test",
    });

    const applyCommands = commands.filter((command) => command[0] === "git" && command[1] === "apply");
    expect(applyCommands).toHaveLength(2);
    for (const command of applyCommands) {
      expect(command).toContain("--include=src/melee/gm/gmtest.c");
      expect(command).toContain("--include=include/melee/gr/ground.h");
    }
  });

  test("verifySupportMergeOrder invokes merge-tree in both orders for a clean overlapping pair", async () => {
    const commands: string[][] = [];
    const service = createService({
      runGit: async (_repoRoot, args) => {
        commands.push(args);
        return successResult("0123456789012345678901234567890123456789\n");
      },
    });

    const summary = await service.verifySupportMergeOrder({
      repoRoot: "/repo",
      branch: "pr-split/gm",
      sliceId: "gm",
      files: ["src/melee/gm/gmtest.c"],
      supportFiles: ["include/melee/gr/ground.h"],
      others: [
        {
          branch: "pr-split/gr",
          sliceId: "gr",
          files: ["include/melee/gr/ground.h"],
          supportFiles: [],
        },
      ],
    });

    expect(summary).toEqual({ checkedPairs: 1, conflicts: [], skipped: [] });
    expect(commands).toEqual([
      ["merge-tree", "--write-tree", "--name-only", "pr-split/gm", "pr-split/gr"],
      ["merge-tree", "--write-tree", "--name-only", "pr-split/gr", "pr-split/gm"],
    ]);
  });

  test("verifySupportMergeOrder rejects a conflicting pair with both slice identities and the file", async () => {
    const commands: string[][] = [];
    const service = createService({
      runGit: async (_repoRoot, args) => {
        commands.push(args);
        return {
          exitCode: 1,
          stdout: "0123456789012345678901234567890123456789\ninclude/melee/gr/ground.h\n\nCONFLICT (content): Merge conflict in include/melee/gr/ground.h\n",
          stderr: "",
        };
      },
    });

    await expect(
      service.verifySupportMergeOrder({
        repoRoot: "/repo",
        branch: "pr-split/gm",
        sliceId: "gm",
        files: ["src/melee/gm/gmtest.c"],
        supportFiles: ["include/melee/gr/ground.h"],
        others: [
          {
            branch: "pr-split/gr",
            sliceId: "gr",
            files: ["src/melee/gr/ground.c"],
            supportFiles: ["include/melee/gr/ground.h"],
          },
        ],
      }),
    ).rejects.toThrow(
      "Merge-order conflict: slice gm (branch pr-split/gm) and slice gr (branch pr-split/gr) both change include/melee/gr/ground.h with non-identical, overlapping hunks.",
    );
    expect(commands).toHaveLength(2);
  });

  test("verifySupportMergeOrder rejects order-dependent result trees", async () => {
    let calls = 0;
    const service = createService({
      runGit: async () => {
        calls += 1;
        return successResult(calls === 1 ? "1111111111111111111111111111111111111111\n" : "2222222222222222222222222222222222222222\n");
      },
    });

    await expect(
      service.verifySupportMergeOrder({
        repoRoot: "/repo",
        branch: "pr-split/gm",
        sliceId: "gm",
        files: ["src/melee/gm/gmtest.c"],
        supportFiles: ["include/melee/gr/ground.h"],
        others: [{
          branch: "pr-split/gr",
          sliceId: "gr",
          files: ["src/melee/gr/ground.c"],
          supportFiles: ["include/melee/gr/ground.h"],
        }],
      }),
    ).rejects.toThrow("slice gm (branch pr-split/gm) and slice gr (branch pr-split/gr) produce different trees");
  });

  test("verifySupportMergeOrder hard-errors when a selected prepared branch is missing", async () => {
    const service = createService({ branchExists: (_repoRoot, branch) => branch !== "pr-split/gr" });

    await expect(
      service.verifySupportMergeOrder({
        repoRoot: "/repo",
        branch: "pr-split/gm",
        sliceId: "gm",
        files: ["src/melee/gm/gmtest.c"],
        supportFiles: ["include/melee/gr/ground.h"],
        others: [{
          branch: "pr-split/gr",
          sliceId: "gr",
          files: ["include/melee/gr/ground.h"],
          supportFiles: [],
        }],
      }),
    ).rejects.toThrow("cannot resolve prepared slice gr (branch pr-split/gr)");
  });

  test("real merge-tree accepts mirror and zero-overlap hunks, then names a true conflict", async () => {
    const repoRoot = tempDir("pr-merge-tree-real-");
    mkdirSync(join(repoRoot, "include/melee/gr"), { recursive: true });
    mkdirSync(join(repoRoot, "src/melee/gm"), { recursive: true });
    mkdirSync(join(repoRoot, "src/melee/gr"), { recursive: true });
    writeFileSync(join(repoRoot, "include/melee/gr/ground.h"), "line one\nline two\nline three\n");
    writeFileSync(join(repoRoot, "src/melee/gm/gmtest.c"), "int gm_base;\n");
    writeFileSync(join(repoRoot, "src/melee/gr/ground.c"), "int gr_base;\n");
    await git(repoRoot, ["init", "-q", "-b", "master"]);
    await git(repoRoot, ["config", "user.email", "test@example.com"]);
    await git(repoRoot, ["config", "user.name", "Test"]);
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-q", "-m", "base"]);

    await git(repoRoot, ["switch", "-q", "-c", "pr-split/gm"]);
    writeFileSync(join(repoRoot, "include/melee/gr/ground.h"), "mirror declaration\nline one\nline two\nline three\n");
    writeFileSync(join(repoRoot, "src/melee/gm/gmtest.c"), "int gm_match;\n");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-q", "-m", "gm"]);

    await git(repoRoot, ["switch", "-q", "master"]);
    await git(repoRoot, ["switch", "-q", "-c", "pr-split/gr-mirror"]);
    writeFileSync(join(repoRoot, "include/melee/gr/ground.h"), "mirror declaration\nline one\nline two\nline three\n");
    writeFileSync(join(repoRoot, "src/melee/gr/ground.c"), "int gr_match;\n");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-q", "-m", "gr mirror"]);

    await git(repoRoot, ["switch", "-q", "master"]);
    await git(repoRoot, ["switch", "-q", "-c", "pr-split/gr-disjoint"]);
    writeFileSync(join(repoRoot, "include/melee/gr/ground.h"), "line one\nline two\nline three\ndisjoint declaration\n");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-q", "-m", "gr disjoint"]);

    await git(repoRoot, ["switch", "-q", "master"]);
    await git(repoRoot, ["switch", "-q", "-c", "pr-split/gr-conflict"]);
    writeFileSync(join(repoRoot, "include/melee/gr/ground.h"), "conflicting declaration\nline one\nline two\nline three\n");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-q", "-m", "gr conflict"]);

    const service = createService({ runGit: git });
    const current = {
      repoRoot,
      branch: "pr-split/gm",
      sliceId: "gm",
      files: ["src/melee/gm/gmtest.c"],
      supportFiles: ["include/melee/gr/ground.h"],
    };
    await expect(service.verifySupportMergeOrder({
      ...current,
      others: [{
        branch: "pr-split/gr-mirror",
        sliceId: "gr-mirror",
        files: ["src/melee/gr/ground.c"],
        supportFiles: ["include/melee/gr/ground.h"],
      }],
    })).resolves.toMatchObject({ checkedPairs: 1 });
    await expect(service.verifySupportMergeOrder({
      ...current,
      others: [{
        branch: "pr-split/gr-disjoint",
        sliceId: "gr-disjoint",
        files: ["include/melee/gr/ground.h"],
        supportFiles: [],
      }],
    })).resolves.toMatchObject({ checkedPairs: 1 });
    await expect(service.verifySupportMergeOrder({
      ...current,
      others: [{
        branch: "pr-split/gr-conflict",
        sliceId: "gr-conflict",
        files: ["include/melee/gr/ground.h"],
        supportFiles: [],
      }],
    })).rejects.toThrow("slice gm (branch pr-split/gm) and slice gr-conflict (branch pr-split/gr-conflict) both change include/melee/gr/ground.h");
  });
});
