#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import {
  compareWorkerUnitSnapshots,
  lintWorkerReviewDiff,
  type WorkerUnitScoreSnapshot,
} from "@server/core/agent-catalog/agents/running/worker";
import { defaultWorkerToolProfile } from "@server/core/tools";
import { parse } from "../src/core/project-registry/runtime-options.js";
import { buildPrSplitPlanFromChanges } from "../src/core/session-runtime/phases/pr/jobs/pr-split-plan.js";
import { workerOpenSlots } from "../src/core/session-runtime/phases/running/scheduler/run-loop.js";
import { agentNoteSignalsToolError, workerAttemptRepairReasons } from "../src/core/session-runtime/phases/running/workers/worker-cycle.js";
import { loadKnowledgeBoardSnapshot, openKnowledgeGraph } from "@server/core/knowledge";
import { planRegressionRepair } from "@server/core/session-runtime/phases/running/epochs";
import { evaluatePrPromotion, readRegressionReport } from "@server/core/validation/objdiff/report";
import {
  activeClaimsForSession,
  addEvent,
  admitEpochTargets,
  createRun,
  DEFAULT_WORKER_TTL_SECONDS,
  claimNextEpochTarget,
  closeWorkerState,
  openState,
  admittedTargetCount,
  recordWorkerCheckpoint,
  schedulableTargetCount,
  startSchedulerEpoch,
  updateRunStatus,
} from "@server/core/session-runtime/run-state";
import { listProjects, resolveProject } from "@server/core/project-registry";
import { scoreOrPercent, scorePairLooksPercent } from "../../frontend/src/lib/format.js";
import { loadTrustedReport } from "../src/core/validation/report/trusted-report.js";
import { fetchServer } from "../src/server.js";
import type { TargetCandidate } from "@server/core/shared/types";

type SqlBinding = string | number | bigint | boolean | null | Uint8Array;

interface CommandResult {
  command: string[];
  stdout: string;
  stderr: string;
}

interface AssertionRecord {
  name: string;
  passed: boolean;
}

const packageRoot = resolve(import.meta.dir, "../../..");
const fixtureRoot = resolve(packageRoot, "apps/server/testdata/smoke_repo");
let stateDir = "";
const commands: CommandResult[] = [];
const assertions: AssertionRecord[] = [];

function assertSmoke(name: string, condition: unknown): void {
  const passed = Boolean(condition);
  assertions.push({ name, passed });
  if (!passed) throw new Error(`Smoke assertion failed: ${name}`);
}

async function runCli(args: string[]): Promise<CommandResult> {
  const command = ["bun", "apps/server/src/job-runner.ts", ...args];
  const proc = Bun.spawn(command, {
    cwd: packageRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  const result = { command, stdout, stderr };
  commands.push(result);
  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(" ")}\n${stderr || stdout}`);
  }
  return result;
}

function parseJson<T>(result: CommandResult): T {
  return JSON.parse(result.stdout) as T;
}

function count(store: ReturnType<typeof openState>, sql: string, ...params: SqlBinding[]): number {
  const row = store.db.query(sql).get(...params) as Record<string, unknown>;
  return Number(row.count ?? 0);
}

function workerUnitSnapshot(params: {
  targetScore: number;
  sectionScore?: number;
  otherSectionScore?: number;
  otherFunctionScore?: number;
  unitFuzzy?: number;
}): WorkerUnitScoreSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    unit: "main/melee/ft/chara/ftCommon/ftCo_Bury",
    symbol: "ftCo_800C0D0C",
    sourcePath: "src/melee/ft/chara/ftCommon/ftCo_Bury.c",
    objectTarget: "build/GALE01/src/melee/ft/chara/ftCommon/ftCo_Bury.o",
    metrics: [
      { name: "fuzzy_match_percent", score: params.unitFuzzy ?? params.targetScore },
      { name: "matched_code_percent", score: params.targetScore >= 99.99999 ? 100 : 90 },
    ],
    functions: [
      { name: "ftCo_800C0D0C", score: params.targetScore, size: 552 },
      { name: "ftCo_AlreadyExact", score: params.otherFunctionScore ?? 100, size: 64 },
    ],
    sections: [
      { name: ".text", score: params.unitFuzzy ?? params.targetScore, size: 3456 },
      { name: ".sdata2", score: params.sectionScore ?? 40, size: 24 },
      { name: ".data", score: params.otherSectionScore ?? 100, size: 56 },
    ],
    targetScore: params.targetScore,
  };
}

function createLegacyAgentStateDb(path: string): void {
  const db = new Database(path);
  try {
    db.exec(`
      CREATE TABLE tool_issues (
        id INTEGER PRIMARY KEY,
        status TEXT,
        kind TEXT,
        tool TEXT,
        summary TEXT,
        body TEXT,
        functions TEXT,
        created_at REAL,
        updated_at REAL,
        resolved_at REAL,
        resolution_note TEXT
      );
      CREATE TABLE functions (
        function_name TEXT PRIMARY KEY,
        canonical_address TEXT,
        match_percent REAL,
        status TEXT,
        build_status TEXT,
        build_diagnosis TEXT,
        notes TEXT,
        updated_at REAL
      );
    `);
    db.query(
      `
        INSERT INTO tool_issues
        (id, status, kind, tool, summary, body, functions, created_at, updated_at, resolved_at, resolution_note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      1,
      "resolved",
      "feature",
      "checkdiff",
      "fixture stack frame mismatch lesson",
      "Fixture body says src/melee/ft/chara/ftDemo.c has a stack frame mismatch and register allocation mismatch that should be searched through graph mismatch patterns.",
      JSON.stringify(["ftDemo_Unmatched"]),
      1760000000,
      1760000100,
      1760000100,
      "fixture resolution note for stack frame mismatch evidence",
    );
    db.query(
      `
        INSERT INTO functions
        (function_name, canonical_address, match_percent, status, build_status, build_diagnosis, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      "ftDemo_Unmatched",
      "0x80000000",
      42,
      "in_progress",
      "passing",
      "Fixture build diagnosis for source-shape matching with stack frame mismatch evidence.",
      "Fixture nontrivial function note with register allocation mismatch evidence.",
      1760000200,
    );
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const parsedDefaultState = parse(["--repo-root", fixtureRoot, "status"]);
  assertSmoke("server job default state dir follows command cwd", parsedDefaultState.globals.stateDir === resolve(process.cwd(), ".decomp-orchestrator-state"));
  assertSmoke("server job default state dir does not follow repo root", parsedDefaultState.globals.stateDir !== resolve(fixtureRoot, ".decomp-orchestrator-state"));
  const parsedProject = parse(["--project", "melee", "status"]);
  assertSmoke("server job project flag resolves project identity", parsedProject.globals.project?.projectId === "melee");
  assertSmoke("server job project flag resolves project state dir", parsedProject.globals.stateDir.endsWith("projects/melee/state"));

  const projectWorkspace = await mkdtemp(join(tmpdir(), "decomp-orchestrator-projects-"));
  const projectDir = resolve(projectWorkspace, "projects/fixture");
  const externalRepo = resolve(projectWorkspace, "external-checkout");
  const explicitStateDir = resolve(projectWorkspace, "explicit-state");
  await mkdir(projectDir, { recursive: true });
  await mkdir(externalRepo, { recursive: true });
  await writeFile(
    resolve(projectDir, "project.json"),
    JSON.stringify(
      {
        id: "fixture",
        displayName: "Fixture Project",
        kind: "fixture-decomp",
        repoRoot: "./checkout",
        stateDir: "./state",
        graphDb: "./graph/tracked.sqlite",
        processName: "fixture-live",
        baseRef: "origin/main",
      },
      null,
      2,
    ),
  );
  await writeFile(
    resolve(projectDir, "local.project.json"),
    JSON.stringify(
      {
        repoRoot: externalRepo,
        graphDb: "./graph/local.sqlite",
      },
      null,
      2,
    ),
  );
  const resolvedProject = resolveProject({
    orchestratorRoot: projectWorkspace,
    projectId: "fixture",
    explicitOverrides: { stateDir: explicitStateDir },
  });
  assertSmoke("project resolver preserves descriptor identity", resolvedProject.projectId === "fixture" && resolvedProject.kind === "fixture-decomp");
  assertSmoke("project resolver lets local override repo root win", resolvedProject.repoRoot === externalRepo);
  assertSmoke("project resolver lets explicit state dir win", resolvedProject.stateDir === explicitStateDir);
  assertSmoke("project resolver uses local graph override", resolvedProject.graphDbPath === resolve(projectDir, "graph/local.sqlite"));
  assertSmoke("project resolver reports local override path", resolvedProject.localOverridePath === resolve(projectDir, "local.project.json"));
  assertSmoke("project listing returns configured fixture", listProjects({ orchestratorRoot: projectWorkspace }).some((project) => project.id === "fixture"));
  assertSmoke("project resolver rejects missing ids", (() => {
    try {
      resolveProject({ orchestratorRoot: projectWorkspace, projectId: "missing" });
      return false;
    } catch {
      return true;
    }
  })());

  const trustedReport = await loadTrustedReport(fixtureRoot);
  assertSmoke("ui trusted report reads objdiff report_changes", trustedReport.status === "ready");
  assertSmoke("ui trusted report counts report new matches", trustedReport.counts.newMatches === 1);
  assertSmoke("ui trusted report keeps worker-independent improvements separate", trustedReport.counts.improvements === 1);
  assertSmoke("ui trusted report exposes matched code byte delta", trustedReport.measures?.matchedCodeBytesDelta === 26);
  assertSmoke("ui trusted report exposes PR promotion status", trustedReport.promotion?.status === "pr_ready");
  assertSmoke("ui worker score formatter keeps percent scores as percentages", scoreOrPercent(100, scorePairLooksPercent(99.5, 100, 0.5)) === "100.000%");
  assertSmoke("ui worker score formatter does not percent-format large mismatch counts", scoreOrPercent(894, scorePairLooksPercent(900, 894, 6)) === "894.000");
  assertSmoke("ui worker score formatter rejects lower-is-better local counts", scoreOrPercent(31, scorePairLooksPercent(34, 31, 3)) === "31.000");

  const regressionReport = await readRegressionReport(resolve(fixtureRoot, "build/GALE01/report_changes.json"), "Fixture local report", 30);
  assertSmoke("regression report promotes exact matched progress", regressionReport.promotion.status === "pr_ready");
  assertSmoke("regression report explains exact match promotion evidence", regressionReport.promotion.reasons.some((reason) => reason.includes("new exact match")));
  const partialOnlyInput = {
    regressions: [],
    newMatches: [],
    brokenMatches: [],
    improvements: regressionReport.improvements,
    fuzzyRegressions: [],
    summary: {
      ...regressionReport.summary,
      matchedCodePercentDelta: 0,
      matchedCodeBytesDelta: 0,
      matchedDataPercentDelta: 0,
      matchedDataBytesDelta: 0,
    },
  };
  const partialOnlyPromotion = evaluatePrPromotion(partialOnlyInput);
  assertSmoke("PR promotion gate holds fuzzy-only local wins", partialOnlyPromotion.status === "local_only");
  assertSmoke("PR promotion gate can explicitly allow large fuzzy-only movement", evaluatePrPromotion(partialOnlyInput, { minUnmatchedImprovementBytes: 1 }).status === "pr_ready");
  assertSmoke(
    "PR promotion gate treats zero thresholds as disabled evidence paths",
    evaluatePrPromotion(partialOnlyInput, {
      minNewMatches: 0,
      minMatchedCodeBytesDelta: 0,
      minMatchedDataBytesDelta: 0,
      minUnmatchedImprovementBytes: 0,
    }).status === "local_only",
  );

  const prSplitPlan = buildPrSplitPlanFromChanges(
    [
      { path: "src/melee/it/items/itfoo.c", status: "M", source: "branch" },
      { path: "include/melee/it/itfoo.h", status: "M", source: "branch" },
      { path: "src/melee/gm/gm_demo.c", status: "M", source: "branch" },
      { path: "src/melee/cm/camera.c", status: "M", source: "branch" },
      { path: "src/sysdolphin/baselib/cobj.c", status: "M", source: "branch" },
      { path: "configure.py", status: "M", source: "worktree" },
    ],
    {
      repoRoot: fixtureRoot,
      baseRef: "origin/master",
      headRef: "fixture-head",
      currentBranch: "fixture-branch",
      groupMode: "melee-subsystem",
      maxFilesPerPr: 30,
      branchPrefix: "review",
      titlePrefix: "Melee decomp",
      sliceCheckCommand: "ninja changes_all",
    },
  );
  const prSplitIds = prSplitPlan.slices.map((slice) => slice.id);
  const itemSlice = prSplitPlan.slices.find((slice) => slice.id === "it");
  const configureSlice = prSplitPlan.slices.find((slice) => slice.id === "configure.py");
  assertSmoke("pr-split-plan groups Melee source and headers by subsystem", itemSlice?.pathspecs.length === 2);
  assertSmoke("pr-split-plan marks subsystem slices as unverified independent candidates", itemSlice?.independence.kind === "independent" && itemSlice.independence.verified === false);
  assertSmoke("pr-split-plan creates subsystem slices", ["cm", "gm", "it"].every((id) => prSplitIds.includes(id)));
  assertSmoke("pr-split-plan keeps support code separate from Melee subsystems", prSplitIds.includes("sysdolphin"));
  assertSmoke("pr-split-plan marks root build/config changes as shared prep", configureSlice?.independence.kind === "shared-prep");
  assertSmoke("pr-split-plan emits slice isolation commands", itemSlice?.isolationCommands.some((command) => command.includes("git worktree add")) === true);
  assertSmoke("pr-split-plan records worktree warnings", prSplitPlan.warnings.some((warning) => warning.includes("Worktree changes")));
  assertSmoke("pr-split-plan stays lane-less without a checkpoint", prSplitPlan.lanesApplied === false && prSplitPlan.slices.every((slice) => slice.lane === null));

  const lanePlan = buildPrSplitPlanFromChanges(
    [
      { path: "src/melee/it/items/itfoo.c", status: "M", source: "branch" },
      { path: "include/melee/it/itfoo.h", status: "M", source: "branch" },
      { path: "src/melee/it/items/itbar.c", status: "M", source: "branch" },
    ],
    {
      repoRoot: fixtureRoot,
      baseRef: "origin/master",
      headRef: "fixture-head",
      currentBranch: "fixture-branch",
      groupMode: "melee-subsystem",
      maxFilesPerPr: 30,
      branchPrefix: "review",
      titlePrefix: "Melee decomp",
      sliceCheckCommand: "ninja changes_all",
      lanes: {
        matchPaths: ["src/melee/it/items/itfoo.c"],
        improvementPaths: ["src/melee/it/items/itbar.c"],
      },
    },
  );
  const laneMatchSlice = lanePlan.slices.find((slice) => slice.id === "it");
  const laneLocalSlice = lanePlan.slices.find((slice) => slice.id === "local-it");
  assertSmoke("pr-split-plan applies lanes from checkpoint candidates", lanePlan.lanesApplied === true && lanePlan.slices.length === 2);
  assertSmoke(
    "pr-split-plan match lane carries match and supporting files",
    laneMatchSlice?.lane === "match" && laneMatchSlice.fileCount === 2 && laneMatchSlice.files.some((file) => file.path === "include/melee/it/itfoo.h"),
  );
  assertSmoke(
    "pr-split-plan keeps non-match work in a local-only slice that does not ship",
    laneLocalSlice?.lane === "local" && laneLocalSlice.fileCount === 1 && laneLocalSlice.warnings.some((warning) => warning.includes("do not ship")),
  );

  assertSmoke(
    "worker classifier ignores explicit non-blocking tool issues",
    agentNoteSignalsToolError({
      status: "validation_ready",
      blockers: [
        {
          type: "non_blocking_tool_issue",
          detail: "mwcc_debug_diagnose_regflow could not provide debug compiler trace because mwcceppc_debug.exe is missing.",
          impact: "Did not block normal checkdiff validation.",
        },
      ],
    }).advisory.length === 0,
  );
  assertSmoke(
    "worker classifier ignores optional tool issues that recovered",
    agentNoteSignalsToolError({
      status: "validation_ready",
      blockers: [
        {
          tool: "m2c_decompile --format",
          issue: "Formatting mode failed because clang-format was not found; rerunning without formatting succeeded.",
          impact: "Did not block scaffold evidence.",
        },
      ],
    }).advisory.length === 0,
  );
  assertSmoke(
    "worker classifier still flags blocking tool failures",
    agentNoteSignalsToolError({
      status: "validation_ready",
      blockers: [{ tool: "checkdiff", issue: "checkdiff failed because executable missing" }],
    }).advisory.length > 0,
  );
  assertSmoke(
    "worker classifier keeps explicit tool_error notes lifecycle-fatal",
    agentNoteSignalsToolError({ status: "tool_error" }).fatal.length > 0,
  );
  assertSmoke(
    "worker classifier treats checkpoint note tool-ish summary as advisory only",
    (() => {
      const signals = agentNoteSignalsToolError({
        status: "validation_ready",
        summary: "checkdiff command failed while gathering evidence",
      });
      return signals.fatal.length === 0 && signals.advisory.length > 0;
    })(),
  );
  assertSmoke(
    "worker repair reasons include retained edits when runner validation is skipped",
    workerAttemptRepairReasons({
      writeSetDiffChanged: true,
      runnerValidation: { status: "skipped", reasons: [], qaLint: null },
    }).some((reason) => reason.includes("write_set diff changed")),
  );
  assertSmoke(
    "worker repair reasons include runner validation failure",
    workerAttemptRepairReasons({
      writeSetDiffChanged: false,
      runnerValidation: { status: "failed", reasons: ["post-return check command exited 1"], qaLint: null },
    }).some((reason) => reason.includes("runner validation")),
  );
  assertSmoke(
    "worker repair reasons include build validation failure",
    workerAttemptRepairReasons({
      writeSetDiffChanged: false,
      runnerValidation: { status: "build_failed", reasons: ["post-worker object build exited 1"], qaLint: null },
    }).some((reason) => reason.includes("runner validation")),
  );
  const sectionRegressionValidation = compareWorkerUnitSnapshots({
    before: workerUnitSnapshot({ targetScore: 99.5, sectionScore: 40 }),
    after: workerUnitSnapshot({ targetScore: 100, sectionScore: 25, unitFuzzy: 100 }),
    claimedExact: true,
  });
  assertSmoke("worker change validation blocks same-unit .sdata2 regression", sectionRegressionValidation.status === "same_unit_regression");
  assertSmoke(
    "worker change validation reports regressed section",
    sectionRegressionValidation.regressions?.some((regression) => regression.kind === "section" && regression.item === ".sdata2") === true,
  );
  const unchangedDataValidation = compareWorkerUnitSnapshots({
    before: workerUnitSnapshot({ targetScore: 99.5, sectionScore: 40 }),
    after: workerUnitSnapshot({ targetScore: 100, sectionScore: 40, unitFuzzy: 100 }),
    claimedExact: true,
  });
  assertSmoke("worker change validation allows unchanged imperfect data section", unchangedDataValidation.status === "passed");
  const noOfficialMovementValidation = compareWorkerUnitSnapshots({
    before: workerUnitSnapshot({ targetScore: 99.5, sectionScore: 40, unitFuzzy: 99.5 }),
    after: workerUnitSnapshot({ targetScore: 99.5, sectionScore: 40, unitFuzzy: 99.5 }),
    claimedExact: true,
  });
  assertSmoke("worker change validation rejects exact claims without official score movement", noOfficialMovementValidation.status === "no_official_score_change");
  assertSmoke(
    "worker repair reasons include no official score movement",
    workerAttemptRepairReasons({
      writeSetDiffChanged: true,
      runnerValidation: { ...noOfficialMovementValidation, qaLint: null },
    }).some((reason) => reason.includes("runner validation")),
  );
  const defineAliasLint = lintWorkerReviewDiff(`diff --git a/src/melee/if/textlib.c b/src/melee/if/textlib.c
@@ -1,2 +1,3 @@
+#define devtext_drawlist un_804D6E18
`);
  assertSmoke("worker review lint rejects variable #define aliases", defineAliasLint.status === "failed");
  assertSmoke("worker review lint names define alias rule", defineAliasLint.findings.some((finding) => finding.ruleId === "no-define-alias-global-renames"));
  const duplicateExternLint = lintWorkerReviewDiff(`diff --git a/src/melee/if/textlib.c b/src/melee/if/textlib.c
@@ -1,3 +1,4 @@
 /* 4D6E18 */ extern DevText* devtext_drawlist;
+/* 4D6E18 */ extern DevText* un_804D6E18;
`);
  assertSmoke("worker review lint rejects duplicate address extern aliases", duplicateExternLint.status === "failed");
  assertSmoke("worker review lint names duplicate extern rule", duplicateExternLint.findings.some((finding) => finding.ruleId === "duplicate-address-extern-alias"));
  const cleanDefineLint = lintWorkerReviewDiff(`diff --git a/src/melee/if/textlib.c b/src/melee/if/textlib.c
@@ -1,2 +1,3 @@
+#define TEXTLIB_POOL_SIZE 32
`);
  assertSmoke("worker review lint allows uppercase numeric constants", cleanDefineLint.status === "passed");
  const stringSymbolLint = lintWorkerReviewDiff(`diff --git a/src/melee/mn/mnnamenew.c b/src/melee/mn/mnnamenew.c
@@ -1,3 +1,3 @@
-        (void**) &MenMainBack_Top.joint, "MenMainBack_Top_joint",
+        (void**) &MenMainBack_Top.joint, mnNameNew_803EE38C,
`);
  assertSmoke("worker review lint rejects string literal symbol regressions", stringSymbolLint.status === "failed");
  assertSmoke("worker review lint names string literal symbol rule", stringSymbolLint.findings.some((finding) => finding.ruleId === "no-string-literal-symbol-regression"));
  const cleanStringEditLint = lintWorkerReviewDiff(`diff --git a/src/melee/mn/mnnamenew.c b/src/melee/mn/mnnamenew.c
@@ -1,3 +1,3 @@
-        (void**) &MenMainBack_Top.joint, "MenMainBack_Top_joint",
+        (void**) &MenMainBack_Top.joint, "MenMainBack_Top_model",
`);
  assertSmoke("worker review lint allows string literal to string literal edits", cleanStringEditLint.status === "passed");
  assertSmoke(
    "worker repair reasons include review lint failure",
    workerAttemptRepairReasons({
      writeSetDiffChanged: true,
      runnerValidation: { status: "passed", reasons: [], qaLint: null },
      reviewLint: defineAliasLint,
    }).some((reason) => reason.includes("review lint")),
  );

  assertSmoke(
    "worker slot math refills one completed local worker",
    workerOpenSlots({ maxWorkers: 32, activeWorkers: 31, runningWorkers: 31, activeLocalWorkers: 31 }) === 1,
  );
  assertSmoke(
    "worker slot math guards pending local startups",
    workerOpenSlots({ maxWorkers: 32, activeWorkers: 0, runningWorkers: 32, activeLocalWorkers: 0 }) === 0,
  );
  assertSmoke(
    "worker slot math accounts for external active workers plus local pending workers",
    workerOpenSlots({ maxWorkers: 32, activeWorkers: 20, runningWorkers: 5, activeLocalWorkers: 0 }) === 7,
  );
  const repairEntry = (unitName: string, itemName: string, fromPercent: number, toPercent: number) => ({
    unitName,
    itemName,
    sourcePath: "",
    size: 128,
    fromPercent,
    toPercent,
    bytesDelta: Math.round((128 * (toPercent - fromPercent)) / 100),
  });
  const repairSources = new Map([["GALE01:ft/ft_a", "src/melee/ft/ft_a.c"]]);
  const repairPlan = planRegressionRepair(
    {
      brokenMatches: [repairEntry("GALE01:ft/ft_a", "ftA_Broken", 100, 94)],
      fuzzyRegressions: [repairEntry("GALE01:ft/ft_a", ".data", 90, 88), repairEntry("GALE01:ft/ft_b", "ftB_NoSource", 97, 95)],
      regressions: [],
    },
    { pauseThreshold: 12, repairPriorityBase: 400, requeueLimit: 32, sourcePaths: repairSources },
  );
  assertSmoke(
    "epoch repair plan admits regressed functions with source paths",
    repairPlan.repairCandidates.length === 1 && repairPlan.repairCandidates[0]?.symbol === "ftA_Broken",
  );
  assertSmoke("epoch repair plan outranks board candidates", (repairPlan.repairCandidates[0]?.priority ?? 0) >= 400);
  assertSmoke("epoch repair plan counts sections toward the regression summary", repairPlan.summary.regressedSections === 1);
  assertSmoke("epoch repair plan reports skipped no-source functions", repairPlan.reasons.some((reason: string) => reason.includes("ftB_NoSource")));
  assertSmoke("epoch repair plan does not pause under the threshold", repairPlan.paused === false);
  const pausedPlan = planRegressionRepair(
    {
      brokenMatches: Array.from({ length: 13 }, (_, index) => repairEntry("GALE01:ft/ft_a", `ftA_Regressed_${index}`, 100, 90)),
      fuzzyRegressions: [],
      regressions: [],
    },
    { pauseThreshold: 12, repairPriorityBase: 400, requeueLimit: 32, sourcePaths: repairSources },
  );
  assertSmoke("epoch repair plan pauses above the regression threshold", pausedPlan.paused === true && pausedPlan.repairCandidates.length === 0);

  const workerStateDir = await mkdtemp(join(tmpdir(), "decomp-orchestrator-worker-state-smoke-"));
  const workerStateStore = openState(workerStateDir);
  try {
    const run = createRun(workerStateStore, "matched_code_percent", 100, 4);
    const candidate = (index: number, sourcePath: string, priority: number): TargetCandidate => ({
      unit: `unit_${index}`,
      symbol: `fn_${index}`,
      sourcePath,
      size: 64 + index,
      fuzzy: 99 - index / 100,
      priority,
      reason: `synthetic refill candidate ${index}`,
    });
    const epoch = startSchedulerEpoch(workerStateStore, run.id, {
      size: { mode: "fixed", value: 3 },
      workerPoolSize: 2,
      candidateWindow: 8,
    });
    const admission = admitEpochTargets(workerStateStore, {
      epochId: epoch.id,
      runId: run.id,
      candidates: [candidate(1, "src/shared.c", 100), candidate(2, "src/shared.c", 99), candidate(3, "src/b.c", 98)],
      size: { mode: "fixed", value: 3 },
      workerPoolSize: 2,
    });
    assertSmoke("epoch admission records fixed worker-state batch", admission.admitted === 3);
    assertSmoke("epoch admission exposes admitted targets as schedulable", schedulableTargetCount(workerStateStore, run.id) === 3);
    assertSmoke("epoch admission records available target count", admittedTargetCount(workerStateStore, run.id) === 3);

    const firstClaim = claimNextEpochTarget({
      store: workerStateStore,
      sessionId: run.id,
      workerId: "worker-state-smoke-1",
      baseRev: "smoke-base",
    });
    assertSmoke("worker-state smoke created an active claim", Boolean(firstClaim));
    const defaultLeaseMs = new Date(firstClaim?.ttl ?? "").getTime() - Date.now();
    assertSmoke(
      "worker claim default ttl is 50 minutes",
      defaultLeaseMs > (DEFAULT_WORKER_TTL_SECONDS - 5) * 1000 && defaultLeaseMs <= DEFAULT_WORKER_TTL_SECONDS * 1000,
    );
    const secondClaim = claimNextEpochTarget({
      store: workerStateStore,
      sessionId: run.id,
      workerId: "worker-state-smoke-2",
      baseRev: "smoke-base",
    });
    assertSmoke("same-source epoch target can claim concurrently", Boolean(secondClaim) && firstClaim?.writeSet[0] === secondClaim?.writeSet[0]);
    assertSmoke("worker-state smoke tracks active claims", activeClaimsForSession(workerStateStore, run.id).length === 2);
    const selected = recordWorkerCheckpoint(workerStateStore, {
      workerStateId: firstClaim?.workerStateId ?? "",
      sessionId: run.id,
      epochId: firstClaim?.epochId ?? "",
      epochTargetId: firstClaim?.epochTargetId ?? "",
      targetClaimId: firstClaim?.claimId ?? "",
      attemptIndex: 0,
      oldScore: 98.99,
      newScore: 99.5,
      exactMatch: false,
      hardGatesPassed: true,
      validationStatus: "passed",
      patchPath: join(workerStateDir, "smoke-worker-state.patch"),
    });
    closeWorkerState(workerStateStore, {
      workerStateId: firstClaim?.workerStateId ?? "",
      lifecycleStatus: "error",
      errorSummary: "synthetic smoke worker-state error",
      summary: { selected_checkpoint_id: selected.id },
    });
    addEvent(workerStateStore, run.id, "worker_error", "smoke", {
      worker_state_id: firstClaim?.workerStateId ?? "",
      target_claim_id: firstClaim?.claimId ?? "",
    });
    assertSmoke(
      "worker-state error close closes target claim",
      count(workerStateStore, "SELECT COUNT(*) AS count FROM target_claims WHERE id = ? AND status = 'closed' AND close_reason = 'error'", firstClaim?.claimId ?? "") === 1,
    );
    assertSmoke(
      "worker-state error close preserves selected checkpoint",
      count(workerStateStore, "SELECT COUNT(*) AS count FROM worker_state WHERE id = ? AND lifecycle_status = 'error' AND best_checkpoint_id = ?", firstClaim?.workerStateId ?? "", selected.id) === 1,
    );
    assertSmoke(
      "worker-state error emits worker_error wake event",
      count(workerStateStore, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'worker_error'", run.id) === 1,
    );
  } finally {
    workerStateStore.db.close();
  }

  const rankingRepo = await mkdtemp(join(tmpdir(), "decomp-orchestrator-rank-"));
  await mkdir(join(rankingRepo, "build/GALE01"), { recursive: true });
  await writeFile(
    join(rankingRepo, "build/GALE01/report.json"),
    JSON.stringify({
      measures: { matched_code_percent: 60, matched_functions_percent: 50 },
      units: [
        {
          name: "unit_close",
          metadata: { source_path: "src/close.c" },
          functions: [{ name: "closeHigh", size: 128, fuzzy_match_percent: 99.8 }],
        },
        {
          name: "unit_info",
          metadata: { source_path: "src/info.c" },
          functions: [{ name: "infoRich", size: 128, fuzzy_match_percent: 75 }],
        },
      ],
    }),
  );
  await writeFile(
    join(rankingRepo, "objdiff.json"),
    JSON.stringify({
      units: [
        { name: "unit_close", metadata: { source_path: "src/close.c" } },
        { name: "unit_info", metadata: { source_path: "src/info.c" } },
      ],
    }),
  );
  const rankingGraphPath = join(rankingRepo, "graph.sqlite");
  const rankingGraph = openKnowledgeGraph(rankingGraphPath);
  try {
    const insertFact = rankingGraph.db.query(`
      INSERT INTO graph_facts
      (id, entity_id, fact_type, payload_json, confidence, trust_tier, evidence_ref, resource_version_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertEdge = rankingGraph.db.query(`
      INSERT INTO graph_edges
      (id, from_entity_id, edge_type, to_entity_id, weight, evidence_ref, resource_version_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const version = "source-version:smoke-rank";
    insertFact.run("fact:editability:close", "file:src/close.c", "editability", JSON.stringify({ mode: "editable" }), 1, "canonical", "smoke", version, "accepted");
    insertFact.run("fact:editability:info", "file:src/info.c", "editability", JSON.stringify({ mode: "editable" }), 1, "canonical", "smoke", version, "accepted");
    insertFact.run(
      "fact:file-status:info",
      "file:src/info.c",
      "file_match_status",
      JSON.stringify({
        functions: [
          { symbol: "infoRich", fuzzy: 75 },
          { symbol: "infoMatchedA", fuzzy: 100 },
          { symbol: "infoMatchedB", fuzzy: 100 },
        ],
        unmatched_functions: [
          { symbol: "infoRich", fuzzy: 75 },
          { symbol: "infoNeighborA", fuzzy: 82 },
          { symbol: "infoNeighborB", fuzzy: 88 },
          { symbol: "infoNeighborC", fuzzy: 91 },
        ],
      }),
      1,
      "canonical",
      "smoke",
      version,
      "accepted",
    );
    for (let index = 0; index < 8; index += 1) {
      insertEdge.run(`edge:path:${index}`, "file:src/info.c", "HAS_PATH_FACT", `resource:path:${index}`, 0.7, "smoke", version, "accepted");
    }
    for (let index = 0; index < 4; index += 1) {
      insertEdge.run(`edge:tool:${index}`, "file:src/info.c", "HAS_TOOL_FINDING", `resource:tool:${index}`, 0.7, "smoke", version, "accepted");
      insertEdge.run(`edge:pr:${index}`, "file:src/info.c", "TOUCHED_BY_PR", `pr:${index}`, 1, "smoke", version, "accepted");
    }
    insertEdge.run("edge:hint:0", "file:src/info.c", "HAS_HISTORICAL_FUNCTION_HINT", "legacy_function:infoRich", 0.5, "smoke", version, "accepted");
    insertEdge.run("edge:curated:0", "file:src/info.c", "HAS_CURATED_WORKER_LESSON", "curated_knowledge:info", 0.6, "smoke", version, "accepted");
    insertFact.run("fact:proposal:info", "file:src/info.c", "curated_worker_lesson", JSON.stringify({ summary: "candidate may unlock sibling facts" }), 0.6, "local", "smoke", version, "proposal");
  } finally {
    rankingGraph.db.close();
  }
  const rankedBoard = loadKnowledgeBoardSnapshot(rankingRepo, 2, { graphDbPath: rankingGraphPath });
  const infoRichRank = rankedBoard.candidates.find((candidate) => candidate.symbol === "infoRich")?.rank;
  const closeHighRank = rankedBoard.candidates.find((candidate) => candidate.symbol === "closeHigh")?.rank;
  assertSmoke("graph information gain can outrank higher fuzzy local score", rankedBoard.candidates[0]?.symbol === "infoRich");
  assertSmoke(
    "board rank exposes information-gain components",
    Number(rankedBoard.candidates[0]?.rank?.information_gain_score ?? 0) > Number(rankedBoard.candidates[0]?.rank?.finishability_score ?? 0),
  );
  assertSmoke("board rank exposes completion readiness", Number(infoRichRank?.completion_readiness_score ?? 0) > 0);
  assertSmoke(
    "board rank makes information priority dominate closeness-only work",
    Number(infoRichRank?.information_priority_score ?? 0) > Number(closeHighRank?.high_accuracy_bonus ?? 0),
  );
  assertSmoke("board rank keeps no-information closeness as a low fallback", Number(closeHighRank?.closeness_fallback_score ?? 0) <= 3);
  assertSmoke("board rank spreads no-information closeness fallback", Number(closeHighRank?.closeness_fallback_score ?? 0) > 0);

  stateDir = await mkdtemp(join(tmpdir(), "decomp-orchestrator-smoke-"));
  const commonFlags = ["--repo-root", fixtureRoot, "--state-dir", stateDir, "--dry-run-agents"];
  const smokeGraphSources = "code_graph,past_prs,agent_shared_state,mismatch_patterns";
  const smokeCuratedGraphSources = `${smokeGraphSources},curator_enrichment`;
  const graphDb = join(stateDir, "knowledge-graph.sqlite");
  const legacyAgentStateDb = join(stateDir, "legacy-agent-state.sqlite");
  const legacyAgentStateEnrichment = join(stateDir, "agent-shared-state-lessons.jsonl");
  const emptyCuratorEnrichment = join(stateDir, "empty-knowledge-curator-updates.jsonl");
  createLegacyAgentStateDb(legacyAgentStateDb);
  const kgImportAgentState = parseJson<{ tool_issues: number; function_hints: number; skipped_audit_log: boolean }>(
    await runCli([...commonFlags, "kg-import-agent-state", "--input", legacyAgentStateDb, "--output", legacyAgentStateEnrichment]),
  );
  assertSmoke("kg-import-agent-state extracts historical tool issues", kgImportAgentState.tool_issues === 1);
  assertSmoke("kg-import-agent-state extracts useful function hints", kgImportAgentState.function_hints === 1);
  assertSmoke("kg-import-agent-state skips legacy audit log state", kgImportAgentState.skipped_audit_log);
  const kgRebuild = parseJson<{ indexed_sources: string[]; stats: { entities: number; edges: number; search_chunks: number } }>(
    await runCli([
      ...commonFlags,
      "kg-rebuild-graph",
      "--graph-db",
      graphDb,
      "--agent-state-enrichment",
      legacyAgentStateEnrichment,
      "--knowledge-curator-enrichment",
      emptyCuratorEnrichment,
      "--sources",
      smokeGraphSources,
    ]),
  );
  assertSmoke(
    "kg-rebuild-graph indexes code graph, past PRs, agent state, and mismatch patterns",
    kgRebuild.indexed_sources.includes("code_graph") &&
      kgRebuild.indexed_sources.includes("past_prs") &&
      kgRebuild.indexed_sources.includes("agent_shared_state") &&
      kgRebuild.indexed_sources.includes("mismatch_patterns"),
  );
  assertSmoke("kg-rebuild-graph writes graph entities", kgRebuild.stats.entities > 0);
  assertSmoke("kg-rebuild-graph writes graph edges", kgRebuild.stats.edges > 0);
  assertSmoke("kg-rebuild-graph writes search chunks", kgRebuild.stats.search_chunks > 0);
  const kgFileCard = parseJson<{
    editability: { mode: string };
    functions: unknown[];
    mismatch_patterns: unknown[];
    scheduling_signals: { priority_bonus: number };
  }>(
    await runCli([...commonFlags, "kg-file-card", "--graph-db", graphDb, "--source", "src/melee/ft/chara/ftDemo.c"]),
  );
  assertSmoke("kg-file-card reports fixture file editable", kgFileCard.editability.mode === "editable");
  assertSmoke("kg-file-card includes fixture functions", kgFileCard.functions.length === 2);
  assertSmoke("kg-file-card includes linked mismatch patterns", kgFileCard.mismatch_patterns.length > 0);
  assertSmoke("kg-file-card includes graph scheduling signals", Number.isFinite(kgFileCard.scheduling_signals.priority_bonus));
  const kgSearch = parseJson<{ results: unknown[] }>(
    await runCli([...commonFlags, "kg-search", "--graph-db", graphDb, "--source", "past_prs", "--query", "ftDemo", "--limit", "3"]),
  );
  assertSmoke("kg-search can query past PR source", kgSearch.results.length > 0);
  const kgAgentStateSearch = parseJson<{ results: unknown[] }>(
    await runCli([...commonFlags, "kg-search", "--graph-db", graphDb, "--source", "agent_shared_state", "--query", "fixture stack", "--limit", "3"]),
  );
  assertSmoke("kg-search can query agent shared state enrichment", kgAgentStateSearch.results.length > 0);
  const kgMismatchPatternSearch = parseJson<{ results: unknown[] }>(
    await runCli([...commonFlags, "kg-search", "--graph-db", graphDb, "--source", "mismatch_patterns", "--query", "stack mismatch", "--limit", "3"]),
  );
  assertSmoke("kg-search can query graph-owned mismatch patterns", kgMismatchPatternSearch.results.length > 0);
  const kgRank = parseJson<{ features: unknown[] }>(await runCli([...commonFlags, "kg-rank-features", "--graph-db", graphDb, "--limit", "3"]));
  assertSmoke("kg-rank-features returns fixture candidate features", kgRank.features.length === 1);

  const init = parseJson<{ run: { id: string }; targetCount: number }>(
    await runCli([...commonFlags, "init-run", "--desired-workers", "1", "--candidate-limit", "8", "--goal-kind", "matched_code_percent", "--goal-value", "72"]),
  );
  assertSmoke("init-run snapshots only the imperfect fixture candidate", init.targetCount === 1);

  const tick = parseJson<{ handledEvent: string; schedulerTargetUpdates: number; epochAdmission?: { admitted: number } }>(
    await runCli([...commonFlags, "tick", "--run-id", init.run.id, "--candidate-limit", "8"]),
  );
  assertSmoke("scheduler tick handles the run-start wake event", Boolean(tick.handledEvent));
  assertSmoke("scheduler tick admits the first epoch target", tick.epochAdmission?.admitted === 1);
  const worker = parseJson<{
    claimId: string;
    workerStateId: string;
    epochTargetId: string;
    workerOutput: string;
    workerSystemPrompt: string;
    workerUserPrompt: string;
    workerStatePath: string;
    wakeEvent: string;
  }>(await runCli([...commonFlags, "worker", "--run-id", init.run.id, "--worker-id", "smoke-worker-1"]));
  const status = parseJson<Record<string, unknown>>(await runCli([...commonFlags, "status"]));
  const curatorOutput = join(stateDir, "knowledge_curator_updates.jsonl");
  const kgCurate = parseJson<{ records_written: number; worker_lessons: number; pr_lessons: number }>(
    await runCli([...commonFlags, "kg-curate", "--run-id", init.run.id, "--output", curatorOutput]),
  );
  assertSmoke("kg-curate writes curator enrichment records", kgCurate.records_written > 0);
  assertSmoke("kg-curate extracts worker lessons", kgCurate.worker_lessons === 1);
  assertSmoke("kg-curate extracts PR lessons", kgCurate.pr_lessons > 0);
  const kgCuratedRebuild = parseJson<{ indexed_sources: string[] }>(
    await runCli([
      ...commonFlags,
      "kg-rebuild-graph",
      "--graph-db",
      graphDb,
      "--agent-state-enrichment",
      legacyAgentStateEnrichment,
      "--knowledge-curator-enrichment",
      curatorOutput,
      "--sources",
      smokeCuratedGraphSources,
    ]),
  );
  assertSmoke("kg-rebuild-graph ingests curator enrichment", kgCuratedRebuild.indexed_sources.includes("curator_enrichment"));

  const store = openState(stateDir);
  try {
    const runId = init.run.id;
    assertSmoke("runs row exists", count(store, "SELECT COUNT(*) AS count FROM runs WHERE id = ?", runId) === 1);
    assertSmoke("epoch row exists", count(store, "SELECT COUNT(*) AS count FROM epochs WHERE session_id = ?", runId) === 1);
    assertSmoke("epoch target row exists", count(store, "SELECT COUNT(*) AS count FROM epoch_targets WHERE session_id = ?", runId) === 1);
    assertSmoke("events include run start and worker wake", count(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ?", runId) >= 2);
    assertSmoke("run_started event handled", count(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'run_started' AND handled_at IS NOT NULL", runId) === 1);
    assertSmoke("worker wake remains unhandled", count(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'worker_finished' AND handled_at IS NULL", runId) === 1);
    assertSmoke("worker session row exists", count(store, "SELECT COUNT(*) AS count FROM pi_sessions WHERE run_id = ? AND role = 'worker' AND target_claim_id = ? AND status = 'dry_run'", runId, worker.claimId) === 1);
    assertSmoke("scheduler tick does not create director cycles", count(store, "SELECT COUNT(*) AS count FROM director_cycles WHERE run_id = ?", runId) === 0);
    assertSmoke("target claim closed", count(store, "SELECT COUNT(*) AS count FROM target_claims WHERE id = ? AND status = 'closed'", worker.claimId) === 1);
    assertSmoke("worker state row exists", count(store, "SELECT COUNT(*) AS count FROM worker_state WHERE id = ? AND target_claim_id = ?", worker.workerStateId, worker.claimId) === 1);
    assertSmoke("worker checkpoint row exists", count(store, "SELECT COUNT(*) AS count FROM worker_checkpoints WHERE worker_state_id = ?", worker.workerStateId) >= 1);
  } finally {
    store.db.close();
  }

  const checkpointFixtureDir = join(stateDir, "synthetic-worker-checkpoints");
  await mkdir(checkpointFixtureDir, { recursive: true });
  const exactValidationPath = join(checkpointFixtureDir, "exact.validation.json");
  const exactPatchPath = join(checkpointFixtureDir, "patch.diff");
  const skippedExactValidationPath = join(checkpointFixtureDir, "skipped_exact.validation.json");
  const skippedExactPatchPath = join(checkpointFixtureDir, "patch_skipped_validation.diff");
  const toolErrorValidationPath = join(checkpointFixtureDir, "tool_error.validation.json");
  const improveValidationPath = join(checkpointFixtureDir, "improve.validation.json");
  const improvePatchPath = join(checkpointFixtureDir, "patch_improve.diff");
  const improveBaselinePath = join(checkpointFixtureDir, "baseline_improve.json");
  const tinyImproveValidationPath = join(checkpointFixtureDir, "tiny_improve.validation.json");
  const tinyImprovePatchPath = join(checkpointFixtureDir, "patch_tiny_improve.diff");
  const tinyImproveBaselinePath = join(checkpointFixtureDir, "baseline_tiny_improve.json");
  await writeFile(exactPatchPath, "diff --git a/src/melee/ft/chara/ftDemo.c b/src/melee/ft/chara/ftDemo.c\n");
  await writeFile(skippedExactPatchPath, "diff --git a/src/melee/ft/chara/ftDemo2.c b/src/melee/ft/chara/ftDemo2.c\n");
  await writeFile(improvePatchPath, "diff --git a/src/melee/ft/chara/ftDemo4.c b/src/melee/ft/chara/ftDemo4.c\n");
  await writeFile(tinyImprovePatchPath, "diff --git a/src/melee/ft/chara/ftDemo5.c b/src/melee/ft/chara/ftDemo5.c\n");
  await writeFile(
    improveBaselinePath,
    JSON.stringify({ unit: "main/melee/ft/chara/ftDemo4", symbol: "ftDemo_Improve", functions: [{ name: "ftDemo_Improve", score: 60, size: 512 }], sections: [] }, null, 2),
  );
  await writeFile(
    tinyImproveBaselinePath,
    JSON.stringify({ unit: "main/melee/ft/chara/ftDemo5", symbol: "ftDemo_TinyImprove", functions: [{ name: "ftDemo_TinyImprove", score: 99, size: 512 }], sections: [] }, null, 2),
  );
  const checkpointSeedStore = openState(stateDir);
  try {
    const seedWorkerCheckpoint = async (params: {
      key: string;
      unit: string;
      symbol: string;
      sourcePath: string;
      size: number;
      before: number | null;
      after: number | null;
      exact: boolean;
      hardGatesPassed: boolean;
      validationStatus: string;
      validationPath: string;
      patchPath?: string;
      baselinePath?: string;
      lifecycleStatus: "exact" | "timeout" | "error";
      failureReasons?: string[];
      summary: string;
    }): Promise<void> => {
      const target = {
        unit: params.unit,
        symbol: params.symbol,
        before: params.before,
        after: params.after,
        improved: params.before !== null && params.after !== null ? params.after > params.before : false,
        exact: params.exact,
      };
      const validation = {
        status: params.validationStatus,
        reasons: params.failureReasons ?? [],
        target,
        regressions: [],
        improvements:
          params.before !== null && params.after !== null && params.after > params.before
            ? [{ kind: "function", unit: params.unit, item: params.symbol, before: params.before, after: params.after }]
            : [],
        ...(params.baselinePath ? { baselinePath: params.baselinePath } : {}),
      };
      await writeFile(params.validationPath, JSON.stringify(validation, null, 2));

      const epoch = startSchedulerEpoch(checkpointSeedStore, init.run.id, {
        size: { mode: "fixed", value: 16 },
        workerPoolSize: 16,
        candidateWindow: 16,
      });
      admitEpochTargets(checkpointSeedStore, {
        epochId: epoch.id,
        runId: init.run.id,
        candidates: [
          {
            unit: params.unit,
            symbol: params.symbol,
            sourcePath: params.sourcePath,
            size: params.size,
            fuzzy: params.before ?? 0,
            priority: 100,
            reason: `synthetic ${params.key} checkpoint target`,
          },
        ],
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
      });
      const workerArtifactDir = join(checkpointFixtureDir, params.key);
      const claimed = claimNextEpochTarget({
        store: checkpointSeedStore,
        sessionId: init.run.id,
        workerId: `${params.key}-worker`,
        baseRev: "smoke-base",
        ttlSeconds: DEFAULT_WORKER_TTL_SECONDS,
        artifactDir: workerArtifactDir,
      });
      if (!claimed) throw new Error(`Could not claim synthetic checkpoint target ${params.key}`);
      const checkpointRecord = recordWorkerCheckpoint(checkpointSeedStore, {
        workerStateId: claimed.workerStateId,
        sessionId: init.run.id,
        epochId: claimed.epochId,
        epochTargetId: claimed.epochTargetId,
        targetClaimId: claimed.claimId,
        attemptIndex: 0,
        oldScore: params.before,
        newScore: params.after,
        exactMatch: params.exact,
        hardGatesPassed: params.hardGatesPassed,
        buildStatus: params.validationStatus === "build_failed" ? "not_compiled" : "compiled",
        qaStatus: null,
        objdiffStatus: params.after === null ? null : "available",
        validationStatus: params.validationStatus,
        artifactPath: params.validationPath,
        patchPath: params.patchPath ?? null,
        diffPath: params.patchPath ?? null,
        failureReasons: params.failureReasons ?? [],
        metadata: { runner_validation: validation },
      });
      const statePath = join(workerArtifactDir, "state", "worker_state.json");
      const workerStateSummary = {
        session_id: init.run.id,
        epoch_id: claimed.epochId,
        epoch_target_id: claimed.epochTargetId,
        target_claim_id: claimed.claimId,
        worker_state_id: claimed.workerStateId,
        target: { unit: params.unit, symbol: params.symbol, source_path: params.sourcePath },
        write_set: [params.sourcePath],
        lifecycle_status: params.lifecycleStatus,
        selected_checkpoint_id: params.hardGatesPassed && params.after !== null && params.before !== null && params.after > params.before ? checkpointRecord.id : null,
        selected_score: params.after,
        exact: params.exact && params.hardGatesPassed,
        latest_runner_validation: validation,
        summary: params.summary,
        summary_path: statePath,
        created_at: new Date().toISOString(),
      };
      await mkdir(join(workerArtifactDir, "state"), { recursive: true });
      await writeFile(statePath, JSON.stringify(workerStateSummary, null, 2));
      closeWorkerState(checkpointSeedStore, {
        workerStateId: claimed.workerStateId,
        lifecycleStatus: params.lifecycleStatus,
        timeoutSummary: params.lifecycleStatus === "timeout" ? params.summary : null,
        errorSummary: params.lifecycleStatus === "error" ? params.summary : null,
        summary: workerStateSummary,
      });
    };
    await seedWorkerCheckpoint({
      key: "checkpoint-exact",
      unit: "main/melee/ft/chara/ftDemo",
      symbol: "ftDemo_Exact",
      sourcePath: "src/melee/ft/chara/ftDemo.c",
      size: 32,
      before: 99.5,
      after: 100,
      exact: true,
      hardGatesPassed: true,
      validationStatus: "passed",
      validationPath: exactValidationPath,
      patchPath: exactPatchPath,
      lifecycleStatus: "exact",
      summary: "Synthetic exact match for checkpoint smoke.",
    });
    await seedWorkerCheckpoint({
      key: "checkpoint-skipped-exact",
      unit: "main/melee/ft/chara/ftDemo2",
      symbol: "ftDemo_SkippedExact",
      sourcePath: "src/melee/ft/chara/ftDemo2.c",
      size: 32,
      before: 99.5,
      after: 100,
      exact: true,
      hardGatesPassed: false,
      validationStatus: "skipped",
      validationPath: skippedExactValidationPath,
      patchPath: skippedExactPatchPath,
      lifecycleStatus: "timeout",
      failureReasons: ["runner-owned same-unit validation did not pass"],
      summary: "Synthetic exact-looking checkpoint without runner-owned validation.",
    });
    await seedWorkerCheckpoint({
      key: "checkpoint-tool-error",
      unit: "main/melee/ft/chara/ftDemo3",
      symbol: "ftDemo_ToolError",
      sourcePath: "src/melee/ft/chara/ftDemo3.c",
      size: 32,
      before: null,
      after: null,
      exact: false,
      hardGatesPassed: false,
      validationStatus: "snapshot_unavailable",
      validationPath: toolErrorValidationPath,
      lifecycleStatus: "error",
      failureReasons: ["post-worker unit diff exited 127"],
      summary: "Synthetic tool error for checkpoint smoke.",
    });
    await seedWorkerCheckpoint({
      key: "checkpoint-improve",
      unit: "main/melee/ft/chara/ftDemo4",
      symbol: "ftDemo_Improve",
      sourcePath: "src/melee/ft/chara/ftDemo4.c",
      size: 512,
      before: 60,
      after: 75,
      exact: false,
      hardGatesPassed: true,
      validationStatus: "passed",
      validationPath: improveValidationPath,
      patchPath: improvePatchPath,
      baselinePath: improveBaselinePath,
      lifecycleStatus: "timeout",
      summary: "Synthetic non-exact improvement for checkpoint smoke.",
    });
    await seedWorkerCheckpoint({
      key: "checkpoint-tiny-improve",
      unit: "main/melee/ft/chara/ftDemo5",
      symbol: "ftDemo_TinyImprove",
      sourcePath: "src/melee/ft/chara/ftDemo5.c",
      size: 512,
      before: 99,
      after: 99.4,
      exact: false,
      hardGatesPassed: true,
      validationStatus: "passed",
      validationPath: tinyImproveValidationPath,
      patchPath: tinyImprovePatchPath,
      baselinePath: tinyImproveBaselinePath,
      lifecycleStatus: "timeout",
      summary: "Synthetic sub-floor improvement for checkpoint smoke.",
    });
  } finally {
    checkpointSeedStore.db.close();
  }
  const checkpointOutputDir = join(stateDir, "checkpoint-smoke");
  const checkpoint = parseJson<{
    checkpoint: { summaryPath: string; prCandidatesPath: string; carryForwardPath: string };
    counts: Record<string, number>;
    prCandidates: unknown[];
    improvementCandidates: unknown[];
    carryForwardCount: number;
  }>(await runCli([...commonFlags, "checkpoint-run", "--run-id", init.run.id, "--artifact-dir", checkpointOutputDir]));
  assertSmoke("checkpoint-run allows runner-validated exact match as PR candidate", checkpoint.counts.pr_candidate === 1 && checkpoint.prCandidates.length === 1);
  assertSmoke("checkpoint-run does not promote exact match without runner validation", checkpoint.counts.review_required === 1);
  assertSmoke(
    "checkpoint-run flags validated improvement above the floors as notable",
    checkpoint.counts.improvement_candidate === 1 && checkpoint.improvementCandidates.length === 1,
  );
  assertSmoke("checkpoint-run keeps sub-floor improvement local", checkpoint.counts.deferred_patch === 1);
  assertSmoke(
    "checkpoint-run carries everything except matches forward",
    checkpoint.carryForwardCount === 5 && checkpoint.counts.stalled === 1 && checkpoint.counts.tool_error === 1,
  );
  assertSmoke("checkpoint-run writes checkpoint artifacts", existsSync(checkpoint.checkpoint.summaryPath) && existsSync(checkpoint.checkpoint.prCandidatesPath) && existsSync(checkpoint.checkpoint.carryForwardPath));
  const checkpointStore = openState(stateDir);
  try {
    assertSmoke("checkpoint-run persists checkpoint row", count(checkpointStore, "SELECT COUNT(*) AS count FROM run_checkpoints WHERE run_id = ?", init.run.id) === 1);
    assertSmoke("checkpoint-run persists checkpoint item rows", count(checkpointStore, "SELECT COUNT(*) AS count FROM checkpoint_items WHERE run_id = ?", init.run.id) === 6);
    assertSmoke("checkpoint-run marks exact matches as PR candidates", count(checkpointStore, "SELECT COUNT(*) AS count FROM checkpoint_items WHERE run_id = ? AND disposition = 'pr_candidate' AND exact_match = 1", init.run.id) === 1);
    assertSmoke(
      "checkpoint-run persists improvement candidate disposition",
      count(checkpointStore, "SELECT COUNT(*) AS count FROM checkpoint_items WHERE run_id = ? AND disposition = 'improvement_candidate' AND symbol = 'ftDemo_Improve'", init.run.id) === 1,
    );
    assertSmoke(
      "checkpoint-run keeps tiny improvement as deferred patch",
      count(checkpointStore, "SELECT COUNT(*) AS count FROM checkpoint_items WHERE run_id = ? AND disposition = 'deferred_patch' AND symbol = 'ftDemo_TinyImprove'", init.run.id) === 1,
    );
    assertSmoke(
      "checkpoint-run keeps skipped runner validation out of PR candidates",
      count(
        checkpointStore,
        "SELECT COUNT(*) AS count FROM checkpoint_items WHERE run_id = ? AND disposition = 'review_required' AND symbol = 'ftDemo_SkippedExact'",
        init.run.id,
      ) === 1,
    );
    assertSmoke(
      "checkpoint-run preserves tool error disposition",
      count(checkpointStore, "SELECT COUNT(*) AS count FROM checkpoint_items WHERE run_id = ? AND disposition = 'tool_error' AND symbol = 'ftDemo_ToolError'", init.run.id) === 1,
    );
  } finally {
    checkpointStore.db.close();
  }
  const reworkCheckpoint = parseJson<{
    counts: Record<string, number>;
    prCandidates: unknown[];
    improvementCandidates: unknown[];
  }>(await runCli([...commonFlags, "checkpoint-run", "--run-id", init.run.id, "--rework-symbols", "ftDemo_Exact,ftDemo_Improve"]));
  assertSmoke(
    "checkpoint-run pulls baseline-regressed symbols out of the shipping lanes",
    reworkCheckpoint.counts.needs_rework === 2 &&
      reworkCheckpoint.counts.pr_candidate === 0 &&
      reworkCheckpoint.counts.improvement_candidate === 0 &&
      reworkCheckpoint.prCandidates.length === 0 &&
      reworkCheckpoint.improvementCandidates.length === 0,
  );

  const pausedStore = openState(stateDir);
  try {
    const pausedRun = updateRunStatus(pausedStore, init.run.id, "paused", "smoke");
    assertSmoke("run pause sets non-schedulable paused status", pausedRun.status === "paused");
    const resumedRun = updateRunStatus(pausedStore, init.run.id, "active", "smoke");
    assertSmoke("run resume restores active status", resumedRun.status === "active");
  } finally {
    pausedStore.db.close();
  }

  const recoveryStateDir = await mkdtemp(join(tmpdir(), "decomp-orchestrator-recover-smoke-"));
  const recoveryFlags = ["--repo-root", fixtureRoot, "--state-dir", recoveryStateDir, "--dry-run-agents"];
  const recoveryInit = parseJson<{ run: { id: string } }>(
    await runCli([
      ...recoveryFlags,
      "init-run",
      "--desired-workers",
      "1",
      "--candidate-limit",
      "8",
      "--goal-kind",
      "matched_code_percent",
      "--goal-value",
      "72",
    ]),
  );
  const recoveryStore = openState(recoveryStateDir);
  let recoveryClaimId = "";
  let recoveryWorkerStateId = "";
  try {
    const recoveryEpoch = startSchedulerEpoch(recoveryStore, recoveryInit.run.id, {
      size: { mode: "fixed", value: 1 },
      workerPoolSize: 1,
      candidateWindow: 4,
    });
    admitEpochTargets(recoveryStore, {
      epochId: recoveryEpoch.id,
      runId: recoveryInit.run.id,
      candidates: [
        {
          unit: "unit_recovery",
          symbol: "fn_recovery",
          sourcePath: "src/recovery.c",
          size: 128,
          fuzzy: 80,
          priority: 100,
          reason: "synthetic recovery claim",
        },
      ],
      size: { mode: "fixed", value: 1 },
      workerPoolSize: 1,
    });
    const claimed = claimNextEpochTarget({
      store: recoveryStore,
      sessionId: recoveryInit.run.id,
      workerId: "interrupted-smoke-worker",
      baseRev: "smoke-base",
      ttlSeconds: 3600,
    });
    assertSmoke("recovery smoke created an active claim", Boolean(claimed));
    recoveryClaimId = claimed?.claimId ?? "";
    recoveryWorkerStateId = claimed?.workerStateId ?? "";
  } finally {
    recoveryStore.db.close();
  }
  const recovered = parseJson<{ recoveredClaims: number }>(
    await runCli([...recoveryFlags, "recover-claims", "--run-id", recoveryInit.run.id, "--force", "--reason", "smoke interrupted worker"]),
  );
  const recoveredStore = openState(recoveryStateDir);
  try {
    assertSmoke("recover-claims recovers one active claim", recovered.recoveredClaims === 1);
    assertSmoke(
      "recover-claims closes target claim",
      count(recoveredStore, "SELECT COUNT(*) AS count FROM target_claims WHERE id = ? AND status = 'closed' AND close_reason = 'error'", recoveryClaimId) === 1,
    );
    assertSmoke(
      "recover-claims closes worker state as error",
      count(recoveredStore, "SELECT COUNT(*) AS count FROM worker_state WHERE id = ? AND lifecycle_status = 'error'", recoveryWorkerStateId) === 1,
    );
    assertSmoke("recover-claims emits worker error wake event", count(recoveredStore, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'worker_error' AND handled_at IS NULL", recoveryInit.run.id) === 1);
    assertSmoke("recover-claims leaves no active claims", count(recoveredStore, "SELECT COUNT(*) AS count FROM target_claims WHERE status = 'active'") === 0);

    const nextRecoveryEpoch = startSchedulerEpoch(recoveredStore, recoveryInit.run.id, {
      size: { mode: "fixed", value: 1 },
      workerPoolSize: 1,
      candidateWindow: 4,
    });
    admitEpochTargets(recoveredStore, {
      epochId: nextRecoveryEpoch.id,
      runId: recoveryInit.run.id,
      candidates: [
        {
          unit: "unit_recovery_2",
          symbol: "fn_recovery_2",
          sourcePath: "src/recovery.c",
          size: 128,
          fuzzy: 80,
          priority: 100,
          reason: "synthetic same-path recovery claim",
        },
      ],
      size: { mode: "fixed", value: 1 },
      workerPoolSize: 1,
    });
    const released = claimNextEpochTarget({
      store: recoveredStore,
      sessionId: recoveryInit.run.id,
      workerId: "reused-claim-smoke-worker",
      baseRev: "smoke-base",
      ttlSeconds: 3600,
    });
    assertSmoke("closed worker claim does not block a later same-path claim", Boolean(released));
  } finally {
    recoveredStore.db.close();
  }

  const triggerStateDir = await mkdtemp(join(tmpdir(), "decomp-orchestrator-trigger-smoke-"));
  const triggerFlags = ["--repo-root", fixtureRoot, "--state-dir", triggerStateDir, "--dry-run-agents"];
  const triggerInit = parseJson<{ run: { id: string } }>(
    await runCli([
      ...triggerFlags,
      "init-run",
      "--desired-workers",
      "1",
      "--candidate-limit",
      "8",
      "--goal-kind",
      "matched_code_percent",
      "--goal-value",
      "72",
    ]),
  );
  const triggerRun = parseJson<{
    mode: string;
    stoppedReason: string;
    schedulerTicks: number;
    workersStarted: number;
    workerResults: unknown[];
    workerErrors: unknown[];
    finalStatus: { activeWorkers: number; admittedTargets: number; unhandledEvents: number };
  }>(
    await runCli([
      ...triggerFlags,
      "run-loop",
      "--run-id",
      triggerInit.run.id,
      "--max-workers",
      "1",
      "--max-iterations",
      "16",
      "--max-idle-iterations",
      "1",
      "--idle-sleep-ms",
      "1",
      "--candidate-limit",
      "8",
      "--graph-db",
      graphDb,
    ]),
  );
  const triggerStore = openState(triggerStateDir);
  try {
    assertSmoke("run-loop reports run_loop mode", triggerRun.mode === "run_loop");
    assertSmoke("run-loop rests after bounded idle", triggerRun.stoppedReason === "idle");
    assertSmoke("run-loop handles wake events deterministically", triggerRun.schedulerTicks >= 3);
    assertSmoke("run-loop starts bounded workers for fixture target", triggerRun.workersStarted > 0 && triggerRun.workersStarted <= 16);
    assertSmoke("run-loop captures every worker result", triggerRun.workerResults.length === triggerRun.workersStarted);
    assertSmoke("run-loop has no worker errors", triggerRun.workerErrors.length === 0);
    assertSmoke("run-loop leaves no active workers", triggerRun.finalStatus.activeWorkers === 0);
    assertSmoke("run-loop drains unhandled events", triggerRun.finalStatus.unhandledEvents === 0);
    assertSmoke("run-loop does not record director cycles", count(triggerStore, "SELECT COUNT(*) AS count FROM director_cycles WHERE run_id = ?", triggerInit.run.id) === 0);
    assertSmoke("run-loop records one worker state per started worker", count(triggerStore, "SELECT COUNT(*) AS count FROM worker_state WHERE session_id = ?", triggerInit.run.id) === triggerRun.workersStarted);
    assertSmoke("run-loop handled all wake events", count(triggerStore, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND handled_at IS NULL", triggerInit.run.id) === 0);
  } finally {
    triggerStore.db.close();
  }
  const babysitStateDir = await mkdtemp(join(tmpdir(), "decomp-orchestrator-babysit-smoke-"));
  const babysitFlags = ["--repo-root", fixtureRoot, "--state-dir", babysitStateDir, "--dry-run-agents"];
  const babysitInit = parseJson<{ run: { id: string } }>(
    await runCli([
      ...babysitFlags,
      "init-run",
      "--desired-workers",
      "1",
      "--candidate-limit",
      "8",
      "--goal-kind",
      "matched_code_percent",
      "--goal-value",
      "72",
    ]),
  );
  const babysitRun = parseJson<{
    stoppedReason: string;
    systemCommand: string;
    incidents: number;
    restarts: number;
    systemRuns: Array<{ stdoutPath: string; stderrPath: string; resultPath: string; classification: string; reason: string }>;
    finalStatus: { activeClaims: number; unhandledEvents: number };
  }>(
    await runCli([
      ...babysitFlags,
      "babysit",
      "--run-id",
      babysitInit.run.id,
      "--max-workers",
      "1",
      "--max-iterations",
      "16",
      "--max-idle-iterations",
      "1",
      "--idle-sleep-ms",
      "1",
      "--candidate-limit",
      "8",
    ]),
  );
  const babysitStore = openState(babysitStateDir);
  try {
    assertSmoke("babysit exits after clean bounded child", babysitRun.stoppedReason === "system_clean_exit");
    assertSmoke("babysit defaults to the run-loop child", babysitRun.systemCommand === "run-loop");
    assertSmoke("babysit records one system run", babysitRun.systemRuns.length === 1);
    assertSmoke("babysit child run is clean", babysitRun.systemRuns[0]?.classification === "clean");
    assertSmoke("babysit records no incidents", babysitRun.incidents === 0);
    assertSmoke("babysit performs no incident restarts", babysitRun.restarts === 0);
    assertSmoke("babysit leaves no active claims", babysitRun.finalStatus.activeClaims === 0);
    assertSmoke("babysit drains wake events", babysitRun.finalStatus.unhandledEvents === 0);
    assertSmoke("babysit records bounded worker states", count(babysitStore, "SELECT COUNT(*) AS count FROM worker_state WHERE session_id = ?", babysitInit.run.id) > 0);
    assertSmoke("babysit system stdout artifact exists", existsSync(babysitRun.systemRuns[0]?.stdoutPath ?? ""));
    assertSmoke("babysit system stderr artifact exists", existsSync(babysitRun.systemRuns[0]?.stderrPath ?? ""));
    assertSmoke("babysit system result artifact exists", existsSync(babysitRun.systemRuns[0]?.resultPath ?? ""));
    assertSmoke("babysit child run does not record director cycles", count(babysitStore, "SELECT COUNT(*) AS count FROM director_cycles WHERE run_id = ?", babysitInit.run.id) === 0);
  } finally {
    babysitStore.db.close();
  }

  const initialBoard = resolve(stateDir, "runs", init.run.id, "snapshots", "initial_board.json");
  const smokeSummaryPath = resolve(stateDir, "runs", init.run.id, "smoke_summary.json");
  assertSmoke("initial board snapshot artifact exists", existsSync(initialBoard));
  assertSmoke("worker dry-run artifact exists", existsSync(worker.workerOutput));
  assertSmoke("worker system prompt artifact exists", existsSync(worker.workerSystemPrompt));
  assertSmoke("worker user prompt artifact exists", existsSync(worker.workerUserPrompt));
  assertSmoke("worker state artifact exists", existsSync(worker.workerStatePath));
  assertSmoke("status output includes worker state count", Number(status.workerStates ?? 0) === 1);
  const workerSystemPrompt = readFileSync(worker.workerSystemPrompt, "utf8");
  const workerUserPrompt = readFileSync(worker.workerUserPrompt, "utf8");
  const renderedPrompts = [workerSystemPrompt, workerUserPrompt].join("\n");
  assertSmoke("worker system prompt names target-file edit rule", workerSystemPrompt.includes('&lt;target_file path="..."&gt;'));
  assertSmoke("worker system prompt rejects separate manual regression ledger", workerSystemPrompt.includes("Do not create a separate manual verification ledger"));
  assertSmoke("worker system prompt does not define a report-shaped output contract", !workerSystemPrompt.includes("<output_contract>") && !workerSystemPrompt.includes("Use this top-level shape"));
  assertSmoke("worker system prompt keeps regression reporting runner-owned", workerSystemPrompt.includes("This handoff is not a worker report") && !workerSystemPrompt.includes("local_regression_check"));
  assertSmoke("worker system prompt is compact", workerSystemPrompt.length < 12000);
  assertSmoke(
    "worker system prompt keeps process-oriented workflow phases",
    workerSystemPrompt.includes("<workflow>") &&
      workerSystemPrompt.includes('<phase id="1" name="holistic_file_understanding">') &&
      workerSystemPrompt.includes('<phase id="3" name="hypothesis_generation">'),
  );
  assertSmoke("worker system prompt includes Sudoku board metaphor", workerSystemPrompt.includes("Think like Sudoku"));
  assertSmoke("worker system prompt does not embed standards section", !workerSystemPrompt.includes("<source_standardization_rules>"));
  assertSmoke("worker system prompt forbids unresolved local regressions", workerSystemPrompt.includes("unresolved local regression"));
  assertSmoke(
    "worker user prompt includes complete target and baseline JSON instead of current state JSON",
    workerUserPrompt.includes("<target>") &&
      workerUserPrompt.includes("<baseline") &&
      workerUserPrompt.includes("<details_json>") &&
      workerUserPrompt.includes('"source_path": "src/melee/ft/chara/ftDemo.c"') &&
      workerUserPrompt.includes('"current_scores"') &&
      workerUserPrompt.includes('"fuzzy_match_percent"') &&
      !workerUserPrompt.includes("<current_state_json>") &&
      !workerUserPrompt.includes('"run"') &&
      !workerUserPrompt.includes('"lease"'),
  );
  const injectedStandardsBlock = workerUserPrompt.match(/<decomp_standards\b[\s\S]*?<\/decomp_standards>/)?.[0] ?? "";
  assertSmoke(
    "worker user prompt injects decomp standards as XML",
    injectedStandardsBlock.includes('id="natural-loops"') &&
      injectedStandardsBlock.includes("<description>") &&
      injectedStandardsBlock.includes("<canonical_example") &&
      injectedStandardsBlock.includes("<bad_code>") &&
      injectedStandardsBlock.includes("<preferred_code>"),
  );
  assertSmoke("worker user prompt omits legacy tool/resource catalogs", !workerUserPrompt.includes("<available_pi_tools_json>") && !workerUserPrompt.includes("<available_resources_json>"));
  assertSmoke("worker system prompt describes attempt evaluation", workerSystemPrompt.includes("Evaluate attempts"));
  assertSmoke(
    "worker user prompt includes compact target file XML",
    workerUserPrompt.includes("<target>") &&
      workerUserPrompt.includes("<target_file") &&
      workerUserPrompt.includes('path="src/melee/ft/chara/ftDemo.c"') &&
      workerUserPrompt.includes("baseline_match_percent") &&
      workerUserPrompt.includes("<![CDATA["),
  );
  assertSmoke(
    "worker user prompt includes available tools XML",
    workerUserPrompt.includes("<available_tools>") &&
      workerUserPrompt.includes('<tool_group provider="code_graph" type="target_context">') &&
      workerUserPrompt.includes('name="code_graph_file_card"') &&
      workerUserPrompt.includes('use_when="Get the file card for a specific source file."'),
  );
  assertSmoke(
    "worker user prompt injects compact target graph file card",
    workerUserPrompt.includes("<target_graph_file_card>") &&
      workerUserPrompt.includes('"source": "code_graph_file_card"') &&
      workerUserPrompt.includes('"editability"') &&
      workerUserPrompt.includes('"search_leads"') &&
      workerUserPrompt.includes('"symbols"') &&
      workerUserPrompt.includes('"target_symbol"') &&
      workerUserPrompt.includes('"past_prs"') &&
      workerUserPrompt.includes('"path_facts"') &&
      workerUserPrompt.includes('"follow_up_queries"') &&
      !workerUserPrompt.includes("path_facts_resolve") &&
      !workerUserPrompt.includes('"scheduling_signals"') &&
      !workerUserPrompt.includes('"priority_bonus"'),
  );
  assertSmoke(
    "worker user prompt omits retired short turn instruction",
    !workerUserPrompt.includes("for this claimed target") &&
      !workerUserPrompt.includes("Continue toward exact match"),
  );
  assertSmoke("worker user prompt omits selected context references", !workerUserPrompt.includes("selected_agent_context_references") && !workerUserPrompt.includes("worker_operating_guide"));
  const kernelAgentsResponse = await fetchServer(new Request("http://dashboard.local/api/kernel/agents"));
  const kernelAgentsPayload = (await kernelAgentsResponse.json()) as {
    agents?: Array<{
      name?: string;
      group?: string;
      agentFile?: string;
      tools?: string[];
      renderedPrompt?: { content?: string | null } | null;
      context?: { renderedContext?: string | null; inputs?: Array<{ loaderKind?: string; status?: string }> } | null;
    }>;
    warnings?: string[];
  };
  const kernelAgents = Array.isArray(kernelAgentsPayload.agents) ? kernelAgentsPayload.agents : [];
  const kernelWorker = kernelAgents.find((agent) => agent.name === "worker");
  const kernelIntegrationResolver = kernelAgents.find((agent) => agent.name === "integration-resolver");
  const kernelPrFixer = kernelAgents.find((agent) => agent.name === "pr-fixer");
  const kernelWorkerPrompt = kernelWorker?.renderedPrompt?.content ?? "";
  const kernelWorkerContext = kernelWorker?.context?.renderedContext ?? "";
  const kernelIntegrationResolverPrompt = kernelIntegrationResolver?.renderedPrompt?.content ?? "";
  const kernelIntegrationResolverContext = kernelIntegrationResolver?.context?.renderedContext ?? "";
  const kernelWorkerJson = JSON.stringify(kernelWorker ?? {});
  const kernelPrFixerPrompt = kernelPrFixer?.renderedPrompt?.content ?? "";
  const kernelPrFixerContext = kernelPrFixer?.context?.renderedContext ?? "";
  assertSmoke("dashboard kernel agents endpoint responds", kernelAgentsResponse.ok);
  assertSmoke("dashboard kernel agents endpoint renders all migrated agents", kernelAgents.length === 9);
  assertSmoke("dashboard kernel agents endpoint has no warnings", (kernelAgentsPayload.warnings ?? []).length === 0);
  assertSmoke("dashboard kernel worker catalog entry exists", Boolean(kernelWorker));
  assertSmoke(
    "dashboard kernel integration resolver catalog entry exists",
    Boolean(kernelIntegrationResolver) &&
      kernelIntegrationResolver?.group === "running" &&
      kernelIntegrationResolver?.agentFile === "apps/server/src/core/agent-catalog/agents/running/integration-resolver/agent.ts",
  );
  assertSmoke(
    "dashboard kernel integration resolver catalog has conflict queue context",
    kernelIntegrationResolverContext.includes("<integration_conflict_item>") &&
      kernelIntegrationResolverContext.includes("kernel-viewer-integration-conflict") &&
      kernelIntegrationResolverContext.includes("src/melee/ft/chara/ftDemo.c") &&
      kernelIntegrationResolverPrompt.includes("worker-output integration conflict") &&
      !`${kernelIntegrationResolverPrompt}\n${kernelIntegrationResolverContext}`.includes("{{"),
  );
  assertSmoke(
    "dashboard kernel PR fixer catalog entry exists",
    Boolean(kernelPrFixer) &&
      kernelPrFixer?.group === "pr" &&
      kernelPrFixer?.agentFile === "apps/server/src/core/agent-catalog/agents/pr/fixer/agent.ts",
  );
  assertSmoke("dashboard kernel PR fixer catalog has no raw placeholders", !`${kernelPrFixerPrompt}\n${kernelPrFixerContext}`.includes("{{"));
  assertSmoke("dashboard kernel worker catalog exposes attached tools out of prompt", (kernelWorker?.tools ?? []).length === defaultWorkerToolProfile.length);
  assertSmoke(
    "dashboard kernel worker catalog has no raw placeholders",
    !kernelWorkerJson.includes("{{"),
  );
  assertSmoke(
    "dashboard kernel worker catalog renders sample target file context",
    kernelWorkerContext.includes('<target_file path="src/melee/ft/chara/ftDemo.c"') &&
      kernelWorkerContext.includes('"source_path": "src/melee/ft/chara/ftDemo.c"') &&
      kernelWorkerContext.includes("ftDemo_KernelViewerSample"),
  );
  assertSmoke(
    "dashboard kernel worker catalog keeps target, baseline, tools, and standards",
    kernelWorkerPrompt.includes("=== SYSTEM PROMPT ===") &&
      !kernelWorkerPrompt.includes("=== INITIAL USER PROMPT ===") &&
      !kernelWorkerPrompt.includes("for this claimed target") &&
      kernelWorkerContext.includes("<target>") &&
      kernelWorkerContext.includes("<baseline") &&
      kernelWorkerContext.includes("<target_graph_file_card") &&
      kernelWorkerContext.includes("<details_json>") &&
      kernelWorkerContext.includes('"source": "code_graph_file_card"') &&
      kernelWorkerContext.includes('"source_path": "src/melee/ft/chara/ftDemo.c"') &&
      kernelWorkerContext.includes('"editability"') &&
      kernelWorkerContext.includes('"search_leads"') &&
      kernelWorkerContext.includes('"symbols"') &&
      kernelWorkerContext.includes('"target_symbol"') &&
      kernelWorkerContext.includes('"mismatch_patterns"') &&
      kernelWorkerContext.includes('"past_prs"') &&
      kernelWorkerContext.includes('"path_facts"') &&
      kernelWorkerContext.includes('"follow_up_queries"') &&
      !kernelWorkerContext.includes("path_facts_resolve") &&
      !kernelWorkerContext.includes('"scheduling_signals"') &&
      !kernelWorkerContext.includes('"priority_bonus"') &&
      kernelWorkerContext.includes("<decomp_standards>") &&
      kernelWorkerContext.includes("<available_tools>") &&
      !kernelWorkerContext.includes("<current_state_json>") &&
      !kernelWorkerContext.includes("<available_pi_tools_json>") &&
      !kernelWorkerContext.includes("selected_agent_context_references") &&
      !kernelWorkerContext.includes('"lease"'),
  );
  const workerOutput = readFileSync(worker.workerOutput, "utf8");
  const workerCustomToolsLine = workerOutput
    .split("\n")
    .find((line) => line.startsWith("custom_tools: ")) ?? "";
  const expectedWorkerTools = [...defaultWorkerToolProfile];
  const deprecatedWorkerToolIds = [
    "discord_knowledge_search",
    "ssbm_data_sheet_lookup_address",
    "external_mirrors_search",
    "external_symbol_lookup",
    "path_facts_resolve",
  ];
  assertSmoke("worker dry-run uses gpt-5.5", workerOutput.includes("model: gpt-5.5"));
  assertSmoke("worker dry-run uses medium thinking", workerOutput.includes("thinking: medium"));
  assertSmoke("worker dry-run attaches decomposed Pi tools", expectedWorkerTools.every((toolId) => workerCustomToolsLine.includes(toolId)));
  assertSmoke("worker dry-run omits deprecated/default-injected tools", deprecatedWorkerToolIds.every((toolId) => !workerCustomToolsLine.includes(toolId)));
  assertSmoke("worker dry-run omits old context guide tool", !workerCustomToolsLine.includes("worker_context_get"));
  assertSmoke("worker dry-run omits generic lookup router by default", !workerCustomToolsLine.includes("decomp_lookup"));
  assertSmoke("worker user prompt does not list lookup commands", !workerUserPrompt.includes('"lookup_commands"'));
  assertSmoke("rendered prompts do not reference design doc", !renderedPrompts.includes("decomp-orchestrator-design.html"));
  assertSmoke("rendered prompts do not reference Codex skill paths", !renderedPrompts.includes(".codex/skills"));
  assertSmoke("worker prompt includes structured past PR resources", workerUserPrompt.includes("past_prs"));
  assertSmoke("worker prompt omits deprecated data sheet resources", !workerUserPrompt.includes("ssbm_data_sheet"));
  assertSmoke("rendered prompts do not include director scheduling context", !renderedPrompts.includes("legacy/director/context/scheduling.md"));
  assertSmoke("rendered prompts do not include worker context guide paths", !renderedPrompts.includes("legacy/worker/context/"));
  assertSmoke("worker user prompt does not duplicate Pi tool affordances", !workerUserPrompt.includes("<available_pi_tools_json>"));
  assertSmoke("rendered prompts do not include old worker overview context", !renderedPrompts.includes("legacy/worker/context/overview.md"));
  assertSmoke("rendered prompts do not reference old knowledge references", !renderedPrompts.includes("knowledge/references"));
  assertSmoke("rendered prompts do not reference old knowledge workflows", !renderedPrompts.includes("knowledge/workflows"));
  assertSmoke("rendered prompts do not reference targeted iteration workflow file", !renderedPrompts.includes("workflows/targeted-iteration.md"));
  assertSmoke("rendered prompts omit legacy sweep workflow", !renderedPrompts.includes("melee-decomp-sweep"));
  assertSmoke("worker prompt omits helper command paths", !workerUserPrompt.includes("decomp_context_lookup.py"));
  assertSmoke("worker prompt omits deprecated worker knowledge tools", deprecatedWorkerToolIds.every((toolId) => !workerUserPrompt.includes(toolId)));

  const summary = {
    state_dir: stateDir,
    fixture_root: fixtureRoot,
    run_id: init.run.id,
    commands: commands.map((command) => command.command),
    row_counts: {
      runs: 1,
      epochs: 1,
      epoch_targets: 1,
      events: 2,
      pi_sessions: 1,
      director_cycles: 0,
      target_claims: 1,
      worker_state: 1,
      worker_checkpoints: 1,
    },
    artifacts: {
      initial_board: initialBoard,
      worker_output: worker.workerOutput,
      worker_system_prompt: worker.workerSystemPrompt,
      worker_user_prompt: worker.workerUserPrompt,
      worker_state: worker.workerStatePath,
      smoke_summary: smokeSummaryPath,
    },
    status,
    assertions,
  };
  await writeFile(smokeSummaryPath, JSON.stringify(summary, null, 2));
  assertSmoke("smoke summary artifact exists", existsSync(smokeSummaryPath));

  console.log(JSON.stringify({ ok: true, stateDir, runId: init.run.id, summaryPath: smokeSummaryPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  if (stateDir) console.error(`Smoke state dir: ${stateDir}`);
  process.exit(1);
});
