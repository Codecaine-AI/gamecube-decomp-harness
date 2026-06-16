#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import {
  compareWorkerUnitSnapshots,
  evaluateWorkerReportAcceptance,
  isWorkerReportType,
  lintWorkerReviewDiff,
  workerReturnRepairReasons,
  type WorkerUnitScoreSnapshot,
} from "@decomp-orchestrator/agents/worker";
import { defaultWorkerToolProfile } from "@decomp-orchestrator/agents/tools";
import { loadBoardSnapshot } from "@decomp-orchestrator/core/board";
import { parse } from "../apps/cli/src/cli/args.js";
import { buildPrSplitPlanFromChanges } from "../apps/cli/src/cli/commands/pr-split-plan.js";
import { evaluateReplanDecision, refillQueueFromBoard, workerOpenSlots } from "../apps/cli/src/cli/commands/trigger-agent.js";
import { agentReportSignalsToolError, finalWorkerReportType } from "../apps/cli/src/cli/commands/worker.js";
import { loadKnowledgeBoardSnapshot, openKnowledgeGraph } from "@decomp-orchestrator/knowledge";
import { planRegressionRepair } from "@decomp-orchestrator/core/epoch";
import { evaluatePrPromotion, readRegressionReport } from "@decomp-orchestrator/core/objdiff/report";
import {
  createRun,
  DEFAULT_WORKER_TTL_SECONDS,
  leaseNextQueuedTarget,
  openState,
  prioritizeQueuedTargets,
  queuedTargetCount,
  recordWorkerReport,
  refillQueuedTargets,
  schedulableTargetCount,
  updateRunStatus,
} from "@decomp-orchestrator/core/state";
import { listProjects, resolveProject } from "@decomp-orchestrator/core";
import { scoreOrPercent, scorePairLooksPercent } from "@decomp-orchestrator/ui-contract";
import { loadTrustedReport } from "../apps/dashboard-server/src/trusted-report.js";
import { fetchAgentViewerServer } from "../apps/agent-viewer/src/server.js";
import { promptStats } from "../apps/agent-viewer/src/lib/promptStats.js";
import type { TargetCandidate } from "@decomp-orchestrator/core/types";

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

const packageRoot = resolve(import.meta.dir, "..");
const fixtureRoot = resolve(packageRoot, "testdata/smoke_repo");
let stateDir = "";
const commands: CommandResult[] = [];
const assertions: AssertionRecord[] = [];

function assertSmoke(name: string, condition: unknown): void {
  const passed = Boolean(condition);
  assertions.push({ name, passed });
  if (!passed) throw new Error(`Smoke assertion failed: ${name}`);
}

async function runCli(args: string[]): Promise<CommandResult> {
  const command = ["bun", "apps/cli/src/bin/decomp-orchestrator.ts", ...args];
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
  assertSmoke("cli default state dir follows command cwd", parsedDefaultState.globals.stateDir === resolve(process.cwd(), ".decomp-orchestrator-state"));
  assertSmoke("cli default state dir does not follow repo root", parsedDefaultState.globals.stateDir !== resolve(fixtureRoot, ".decomp-orchestrator-state"));
  const parsedProject = parse(["--project", "melee", "status"]);
  assertSmoke("cli project flag resolves project identity", parsedProject.globals.project?.projectId === "melee");
  assertSmoke("cli project flag resolves project state dir", parsedProject.globals.stateDir.endsWith("projects/melee/state"));

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

  const cleanWorkerProgress = evaluateWorkerReportAcceptance({
    agentReport: {
      report_type: "progress",
      lease: {
        write_set_checked: true,
        edited_paths: ["src/a.c"],
      },
      local_regression_check: {
        status: "passed",
        baseline_artifact: "baseline.md",
        final_artifact: "final.md",
        target_regression: false,
        neighbor_regressions: [],
      },
    },
    reportType: "progress",
    writeSet: ["src/a.c"],
  });
  assertSmoke("worker progress acceptance gate accepts clean regression evidence", cleanWorkerProgress.accepted);
  assertSmoke("worker report type accepts tool_error", isWorkerReportType("tool_error"));
  assertSmoke("worker progress acceptance gate preserves clean progress type", cleanWorkerProgress.effectiveReportType === "progress");
  const blockedWorkerProgress = evaluateWorkerReportAcceptance({
    agentReport: {
      report_type: "progress",
      lease: {
        write_set_checked: true,
        edited_paths: ["src/a.c"],
      },
      local_regression_check: {
        status: "blocked_unknown",
        baseline_artifact: "baseline.md",
        final_artifact: "final.md",
        target_regression: false,
        neighbor_regressions: [],
      },
    },
    reportType: "progress",
    writeSet: ["src/a.c"],
  });
  assertSmoke("worker progress acceptance gate rejects blocked regression checks", !blockedWorkerProgress.accepted);
  assertSmoke("worker progress acceptance gate downgrades unsafe progress", blockedWorkerProgress.effectiveReportType === "stalled_no_useful_guess");
  const outsideWriteSetProgress = evaluateWorkerReportAcceptance({
    agentReport: {
      report_type: "score_candidate",
      lease: {
        write_set_checked: true,
        edited_paths: ["src/outside.c"],
      },
      local_regression_check: {
        status: "passed",
        baseline_artifact: "baseline.md",
        final_artifact: "final.md",
        target_regression: false,
        neighbor_regressions: [],
      },
    },
    reportType: "score_candidate",
    writeSet: ["src/a.c"],
  });
  assertSmoke("worker progress acceptance gate rejects edits outside the lease", !outsideWriteSetProgress.accepted);
  const missingArtifactProgress = evaluateWorkerReportAcceptance({
    agentReport: {
      report_type: "progress",
      lease: {
        write_set_checked: true,
        edited_paths: ["src/a.c"],
      },
      local_regression_check: {
        status: "passed",
        baseline_artifact: "missing-baseline.md",
        final_artifact: "missing-final.md",
        target_regression: false,
        neighbor_regressions: [],
      },
    },
    reportType: "progress",
    writeSet: ["src/a.c"],
    artifactExists: () => false,
  });
  assertSmoke("worker progress acceptance gate rejects missing validation artifacts", !missingArtifactProgress.accepted);
  const stdoutEvidenceProgress = evaluateWorkerReportAcceptance({
    agentReport: {
      report_type: "progress",
      lease: {
        write_set_checked: true,
        edited_paths: ["src/a.c"],
      },
      local_regression_check: {
        status: "passed",
        baseline_artifact: "checkdiff_run fn_a: FAIL (99.9%)",
        final_artifact: "checkdiff_summary fn_a: PASS (100.00000%)",
        target_regression: false,
        neighbor_regressions: [],
      },
    },
    reportType: "progress",
    writeSet: ["src/a.c"],
    artifactExists: () => false,
  });
  assertSmoke("worker progress acceptance gate accepts stdout validation evidence", stdoutEvidenceProgress.accepted);
  const slashEvidenceProgress = evaluateWorkerReportAcceptance({
    agentReport: {
      report_type: "progress",
      lease: {
        write_set_checked: true,
        edited_paths: ["src/a.c"],
      },
      local_regression_check: {
        status: "passed",
        baseline_artifact: "Baseline task reported 97.74039%, but current local checkdiff supersedes it.",
        final_artifact: "checkdiff_summary target and adjacent fn_a/fn_b PASS",
        target_regression: false,
        neighbor_regressions: [],
      },
    },
    reportType: "progress",
    writeSet: ["src/a.c"],
    artifactExists: () => false,
  });
  assertSmoke("worker progress acceptance gate accepts slash-separated stdout evidence", slashEvidenceProgress.accepted);
  const structuredEvidenceProgress = evaluateWorkerReportAcceptance({
    agentReport: {
      report_type: "progress",
      lease: {
        write_set_checked: true,
        edited_paths: [],
      },
      local_regression_check: {
        status: "passed",
        baseline_artifact: { injected_baseline: "99.9% fuzzy match" },
        final_artifact: { stdout: "checkdiff_run fn_a: PASS (100.00000%)" },
        target_regression: false,
        neighbor_regressions: [],
      },
    },
    reportType: "progress",
    writeSet: ["src/a.c"],
    artifactExists: () => false,
  });
  assertSmoke("worker progress acceptance gate accepts structured validation evidence", structuredEvidenceProgress.accepted);
  assertSmoke(
    "worker classifier ignores explicit non-blocking tool issues",
    agentReportSignalsToolError({
      report_type: "stalled_no_useful_guess",
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
    agentReportSignalsToolError({
      report_type: "stalled_no_useful_guess",
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
    agentReportSignalsToolError({
      report_type: "stalled_no_useful_guess",
      blockers: [{ tool: "checkdiff", issue: "checkdiff failed because executable missing" }],
    }).advisory.length > 0,
  );
  assertSmoke(
    "worker classifier keeps explicit tool_error report types pool-fatal",
    agentReportSignalsToolError({ report_type: "tool_error" }).fatal.length > 0,
  );
  assertSmoke(
    "worker classifier treats needs_fact tool-ish text as advisory only",
    (() => {
      const signals = agentReportSignalsToolError({
        report_type: "needs_fact",
        needed_fact: "need to know why the checkdiff command failed for this unit",
        summary: "checkdiff command failed while gathering evidence",
      });
      return signals.fatal.length === 0 && signals.advisory.length > 0;
    })(),
  );
  assertSmoke(
    "worker final report type maps exhausted non-tool repair to needs_rework",
    finalWorkerReportType({
      errorClassification: null,
      repairExhausted: true,
      acceptanceGate: cleanWorkerProgress,
    }) === "needs_rework",
  );
  assertSmoke(
    "worker final report type maps runner validation failures to needs_rework",
    finalWorkerReportType({
      errorClassification: {
        kind: "runner_validation_failed",
        summary: "Runner validation failed.",
        reasons: ["post-return check command exited 1"],
      },
      repairExhausted: true,
      acceptanceGate: cleanWorkerProgress,
    }) === "needs_rework",
  );
  assertSmoke(
    "worker final report type preserves real tool errors",
    finalWorkerReportType({
      errorClassification: {
        kind: "agent_reported_tool_error",
        summary: "Worker reported a tool/build/validation failure.",
        reasons: ["agent report_type is tool_error"],
      },
      repairExhausted: false,
      acceptanceGate: cleanWorkerProgress,
    }) === "tool_error",
  );
  assertSmoke(
    "worker final report type maps provider_error classification to provider_error",
    finalWorkerReportType({
      errorClassification: {
        kind: "provider_error",
        summary: "LLM provider failed before the worker produced a report: Request timed out.",
        reasons: ["Request timed out."],
      },
      repairExhausted: false,
      acceptanceGate: cleanWorkerProgress,
    }) === "provider_error",
  );
  assertSmoke(
    "worker post-return gate asks for repair on failed acceptance",
    workerReturnRepairReasons({
      acceptanceGate: blockedWorkerProgress,
      writeSetDiffChanged: false,
      runnerValidation: { status: "skipped", reasons: [] },
    }).some((reason) => reason.includes("acceptance gate")),
  );
  assertSmoke(
    "worker post-return gate asks for repair on unaccepted retained edits",
    workerReturnRepairReasons({
      acceptanceGate: {
        intendedReportType: "stalled_no_useful_guess",
        effectiveReportType: "stalled_no_useful_guess",
        accepted: true,
        reasons: [],
      },
      writeSetDiffChanged: true,
      runnerValidation: { status: "skipped", reasons: [] },
    }).some((reason) => reason.includes("write_set diff changed")),
  );
  assertSmoke(
    "worker post-return gate asks for repair on runner validation failure",
    workerReturnRepairReasons({
      acceptanceGate: cleanWorkerProgress,
      writeSetDiffChanged: false,
      runnerValidation: { status: "failed", reasons: ["post-return check command exited 1"] },
    }).some((reason) => reason.includes("runner validation")),
  );
  assertSmoke(
    "worker post-return gate asks for repair on build validation failure",
    workerReturnRepairReasons({
      acceptanceGate: cleanWorkerProgress,
      writeSetDiffChanged: false,
      runnerValidation: { status: "build_failed", reasons: ["post-worker object build exited 1"] },
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
    "worker post-return gate asks for repair on no official score movement",
    workerReturnRepairReasons({
      acceptanceGate: cleanWorkerProgress,
      writeSetDiffChanged: true,
      runnerValidation: noOfficialMovementValidation,
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
    "worker post-return gate asks for repair on review lint failure",
    workerReturnRepairReasons({
      acceptanceGate: cleanWorkerProgress,
      writeSetDiffChanged: true,
      runnerValidation: { status: "passed", reasons: [] },
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
  const replanPolicy = {
    activeLowWatermark: 24,
    blockedQueueReplan: true,
    longTailReplanMs: 300_000,
    queueLowWatermark: 32,
    replanCooldownMs: 300_000,
    replanIntervalMs: 0,
    schedulableLowWatermark: 32,
  };
  const replanState = { lastPeriodicReplanMs: 0, lastReplanRequestMs: -1_000_000, longTailSinceMs: null, nowMs: 1_000_000 };
  assertSmoke(
    "replan policy wakes on blocked queue pressure",
    evaluateReplanDecision(
      {
        activeWorkers: 7,
        blockedQueuedTargets: 7,
        candidateLimit: 128,
        candidateWindow: 512,
        maxWorkers: 32,
        openSlots: 25,
        queuedTargets: 7,
        queueTargetSize: 128,
        runningWorkers: 7,
        schedulableTargets: 0,
      },
      replanPolicy,
      replanState,
    )?.reason === "blocked_queue_pressure",
  );
  assertSmoke(
    "replan policy wakes before the queued pool drains",
    evaluateReplanDecision(
      {
        activeWorkers: 32,
        blockedQueuedTargets: 0,
        candidateLimit: 128,
        candidateWindow: 512,
        maxWorkers: 32,
        openSlots: 0,
        queuedTargets: 16,
        queueTargetSize: 128,
        runningWorkers: 32,
        schedulableTargets: 16,
      },
      replanPolicy,
      replanState,
    )?.reason === "queue_low_watermark",
  );
  assertSmoke(
    "replan policy wakes when deterministic queue refill exhausts",
    evaluateReplanDecision(
      {
        activeWorkers: 32,
        blockedQueuedTargets: 56,
        candidateLimit: 128,
        candidateWindow: 512,
        maxWorkers: 32,
        openSlots: 0,
        queuedTargets: 123,
        queueTargetSize: 128,
        runningWorkers: 32,
        schedulableTargets: 45,
      },
      replanPolicy,
      {
        ...replanState,
        lastQueueRefill: {
          candidateCount: 512,
          inserted: 0,
          minSchedulableSources: 32,
          queuedAfter: 123,
          queuedBefore: 126,
          refreshed: 0,
          schedulableAfter: 45,
          schedulableBefore: 45,
          skippedExisting: 512,
          skippedLockedSource: 0,
          skippedMissingSource: 0,
          targetSize: 128,
        },
      },
    )?.reason === "queue_refill_exhausted",
  );
  assertSmoke(
    "replan policy does not wake an idle empty run",
    evaluateReplanDecision(
      {
        activeWorkers: 0,
        blockedQueuedTargets: 0,
        candidateLimit: 128,
        candidateWindow: 512,
        maxWorkers: 32,
        openSlots: 32,
        queuedTargets: 0,
        queueTargetSize: 128,
        runningWorkers: 0,
        schedulableTargets: 0,
      },
      replanPolicy,
      replanState,
    ) == null,
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
    "epoch repair plan requeues regressed functions with source paths",
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

  const refillStateDir = await mkdtemp(join(tmpdir(), "decomp-orchestrator-refill-smoke-"));
  const refillStore = openState(refillStateDir);
  try {
    const run = createRun(refillStore, "matched_code_percent", 100, 4);
    const candidate = (index: number, sourcePath: string, priority: number): TargetCandidate => ({
      unit: `unit_${index}`,
      symbol: `fn_${index}`,
      sourcePath,
      size: 64 + index,
      fuzzy: 99 - index / 100,
      priority,
      reason: `synthetic refill candidate ${index}`,
    });
    const firstRefill = refillQueuedTargets(
      refillStore,
      run.id,
      [candidate(1, "src/a.c", 100), candidate(2, "src/a.c", 99), candidate(3, "src/b.c", 98), candidate(4, "src/c.c", 97), candidate(5, "src/d.c", 96)],
      { targetSize: 4, minSchedulableSources: 4 },
    );
    assertSmoke("queue refill fills toward target size", firstRefill.inserted === 4);
    assertSmoke("queue refill prefers distinct schedulable sources", schedulableTargetCount(refillStore, run.id) === 4);
    assertSmoke("queue refill records queued target count", queuedTargetCount(refillStore, run.id) === 4);
    const priorityRefresh = refillQueuedTargets(refillStore, run.id, [candidate(1, "src/a.c", 77)], { targetSize: 4, minSchedulableSources: 4 });
    const refreshedQueueRow = refillStore.db
      .query(
        `
          SELECT queue.priority AS priority
          FROM queue
          JOIN targets ON targets.id = queue.target_id
          WHERE queue.run_id = ? AND targets.unit = ? AND targets.symbol = ? AND queue.status = 'queued'
        `,
      )
      .get(run.id, "unit_1", "fn_1") as Record<string, unknown> | undefined;
    assertSmoke("queue refill refreshes queued priority from the latest board", priorityRefresh.refreshed === 1 && Number(refreshedQueueRow?.priority) === 77);
    refillStore.db
      .query("UPDATE queue SET status = 'reported' WHERE target_id = (SELECT id FROM targets WHERE run_id = ? AND unit = ? AND symbol = ?)")
      .run(run.id, "unit_1", "fn_1");
    refillStore.db.query("UPDATE targets SET status = 'reported' WHERE run_id = ? AND unit = ? AND symbol = ?").run(run.id, "unit_1", "fn_1");
    const schedulerRequeued = prioritizeQueuedTargets(refillStore, run.id, [candidate(1, "src/a.c", 101)]);
    assertSmoke("scheduler priority routing can requeue an attempted target", schedulerRequeued === 1);
    assertSmoke("scheduler requeue restores queued target count", queuedTargetCount(refillStore, run.id) === 4);

    const leased = leaseNextQueuedTarget({
      store: refillStore,
      runId: run.id,
      workerId: "refill-lock-smoke-worker",
      baseRev: "smoke-base",
    });
    assertSmoke("queue refill smoke created an active lease", Boolean(leased));
    const defaultLeaseMs = new Date(leased?.ttl ?? "").getTime() - Date.now();
    assertSmoke(
      "worker lease default ttl is 50 minutes",
      defaultLeaseMs > (DEFAULT_WORKER_TTL_SECONDS - 5) * 1000 && defaultLeaseMs <= DEFAULT_WORKER_TTL_SECONDS * 1000,
    );
    const lockedSource = String(leased?.target.source_path ?? "");
    const secondRefill = refillQueuedTargets(
      refillStore,
      run.id,
      [candidate(6, lockedSource, 95), candidate(7, "src/e.c", 94)],
      { targetSize: 5, minSchedulableSources: 4 },
    );
    assertSmoke("queue refill skips active locked sources", secondRefill.skippedLockedSource === 1);
    assertSmoke("queue refill adds fresh unlocked work", secondRefill.inserted === 1);
    recordWorkerReport({
      store: refillStore,
      runId: run.id,
      leaseId: leased?.leaseId ?? "",
      reportType: "tool_error",
      summaryPath: join(refillStateDir, "tool-error-worker-report.json"),
      payload: {
        report_type: "tool_error",
        error: { kind: "smoke_tool_error", reasons: ["synthetic smoke tool error"] },
      },
    });
    assertSmoke(
      "tool_error worker report releases lease as error",
      count(refillStore, "SELECT COUNT(*) AS count FROM leases WHERE id = ? AND status = 'released_error'", leased?.leaseId ?? "") === 1,
    );
    assertSmoke(
      "tool_error worker report emits worker_error wake event",
      count(refillStore, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'worker_error'", run.id) === 1,
    );
  } finally {
    refillStore.db.close();
  }

  const adaptiveRefillRepo = await mkdtemp(join(tmpdir(), "decomp-orchestrator-adaptive-refill-repo-"));
  const adaptiveRefillStateDir = await mkdtemp(join(tmpdir(), "decomp-orchestrator-adaptive-refill-state-"));
  await mkdir(join(adaptiveRefillRepo, "build/GALE01"), { recursive: true });
  await writeFile(
    join(adaptiveRefillRepo, "build/GALE01/report.json"),
    JSON.stringify({
      measures: { matched_code_percent: 60, matched_functions_percent: 50 },
      units: [1, 2, 3, 4, 5, 6].map((index) => ({
        name: `unit_adaptive_${index}`,
        metadata: { source_path: `src/adaptive_${index}.c` },
        functions: [{ name: `adaptive_${index}`, size: 128, fuzzy_match_percent: 99.9 - index / 100 }],
      })),
    }),
  );
  await writeFile(
    join(adaptiveRefillRepo, "objdiff.json"),
    JSON.stringify({
      units: [1, 2, 3, 4, 5, 6].map((index) => ({ name: `unit_adaptive_${index}`, metadata: { source_path: `src/adaptive_${index}.c` } })),
    }),
  );
  const adaptiveRefillStore = openState(adaptiveRefillStateDir);
  try {
    const run = createRun(adaptiveRefillStore, "matched_code_percent", 100, 4);
    const exhaustedWindow = loadBoardSnapshot(adaptiveRefillRepo, 4);
    const initialTargets = exhaustedWindow.candidates.map((candidate) => ({
      ...candidate,
      reason: `initial adaptive candidate ${candidate.symbol}`,
    }));
    const insertedInitial = refillQueuedTargets(adaptiveRefillStore, run.id, initialTargets, { targetSize: 4, minSchedulableSources: 4 });
    assertSmoke("adaptive refill smoke initially fills the configured window", insertedInitial.inserted === 4);
    adaptiveRefillStore.db.query("UPDATE queue SET status = 'reported' WHERE run_id = ?").run(run.id);
    adaptiveRefillStore.db.query("UPDATE targets SET status = 'reported' WHERE run_id = ?").run(run.id);

    const adaptiveRefill = refillQueueFromBoard({
      globals: {
        repoRoot: adaptiveRefillRepo,
        stateDir: adaptiveRefillStateDir,
        dryRunAgents: true,
        provider: "dry-run",
        model: "dry-run",
        thinkingLevel: "low",
      },
      policy: replanPolicy,
      runId: run.id,
      snapshot: {
        activeWorkers: 4,
        blockedQueuedTargets: 0,
        candidateLimit: 4,
        candidateWindow: 4,
        maxWorkers: 4,
        openSlots: 4,
        queuedTargets: 0,
        queueTargetSize: 4,
        runningWorkers: 4,
        schedulableTargets: 0,
      },
      store: adaptiveRefillStore,
    });
    assertSmoke("adaptive queue refill scans past an exhausted candidate window", adaptiveRefill?.inserted === 2);
    assertSmoke("adaptive queue refill records the deeper scan count", adaptiveRefill?.candidateCount === 6);
    assertSmoke("adaptive queue refill queues fresh deeper candidates", queuedTargetCount(adaptiveRefillStore, run.id) === 2);
  } finally {
    adaptiveRefillStore.db.close();
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
  assertSmoke("init-run queues only the imperfect fixture function", init.targetCount === 1);

  const tick = parseJson<{ handledEvent: string; schedulerTargetUpdates: number; queueRefill: { inserted: number; refreshed: number } }>(
    await runCli([...commonFlags, "tick", "--run-id", init.run.id, "--candidate-limit", "8"]),
  );
  assertSmoke("scheduler tick handles the run-start wake event", Boolean(tick.handledEvent));
  const worker = parseJson<{
    leaseId: string;
    workerOutput: string;
    workerSystemPrompt: string;
    workerUserPrompt: string;
    workerReport: string;
    wakeEvent: string;
  }>(await runCli([...commonFlags, "worker", "--run-id", init.run.id, "--worker-id", "smoke-worker-1", "--report-type", "stalled_no_useful_guess"]));
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
    ]),
  );
  assertSmoke("kg-rebuild-graph ingests curator enrichment", kgCuratedRebuild.indexed_sources.includes("curator_enrichment"));

  const store = openState(stateDir);
  try {
    const runId = init.run.id;
    assertSmoke("runs row exists", count(store, "SELECT COUNT(*) AS count FROM runs WHERE id = ?", runId) === 1);
    assertSmoke("targets row exists", count(store, "SELECT COUNT(*) AS count FROM targets WHERE run_id = ?", runId) === 1);
    assertSmoke("queue row exists", count(store, "SELECT COUNT(*) AS count FROM queue WHERE run_id = ?", runId) === 1);
    assertSmoke("events include run start and worker wake", count(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ?", runId) >= 2);
    assertSmoke("run_started event handled", count(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'run_started' AND handled_at IS NOT NULL", runId) === 1);
    assertSmoke("worker wake remains unhandled", count(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'worker_stalled' AND handled_at IS NULL", runId) === 1);
    assertSmoke("worker session row exists", count(store, "SELECT COUNT(*) AS count FROM pi_sessions WHERE run_id = ? AND role = 'worker' AND lease_id = ? AND status = 'dry_run'", runId, worker.leaseId) === 1);
    assertSmoke("scheduler tick does not create director cycles", count(store, "SELECT COUNT(*) AS count FROM director_cycles WHERE run_id = ?", runId) === 0);
    assertSmoke("lease row exists", count(store, "SELECT COUNT(*) AS count FROM leases WHERE id = ? AND status = 'released_stalled'", worker.leaseId) === 1);
    assertSmoke("released lease removes file lock row", count(store, "SELECT COUNT(*) AS count FROM file_locks WHERE lease_id = ?", worker.leaseId) === 0);
    assertSmoke("worker report row exists", count(store, "SELECT COUNT(*) AS count FROM worker_reports WHERE lease_id = ? AND report_type = 'stalled_no_useful_guess'", worker.leaseId) === 1);
  } finally {
    store.db.close();
  }

  const exactReportDir = join(stateDir, "synthetic-exact-report");
  await mkdir(exactReportDir, { recursive: true });
  const exactSummaryPath = join(exactReportDir, "worker_report.json");
  const exactPatchPath = join(exactReportDir, "patch.diff");
  const skippedExactSummaryPath = join(exactReportDir, "worker_report_skipped_validation.json");
  const skippedExactPatchPath = join(exactReportDir, "patch_skipped_validation.diff");
  const toolErrorSummaryPath = join(exactReportDir, "worker_report_tool_error.json");
  const toolErrorBlockerPath = join(exactReportDir, "worker_report_tool_error_blocker.json");
  const improveSummaryPath = join(exactReportDir, "worker_report_improve.json");
  const improvePatchPath = join(exactReportDir, "patch_improve.diff");
  const improveBaselinePath = join(exactReportDir, "baseline_improve.json");
  const tinyImproveSummaryPath = join(exactReportDir, "worker_report_tiny_improve.json");
  const tinyImprovePatchPath = join(exactReportDir, "patch_tiny_improve.diff");
  const tinyImproveBaselinePath = join(exactReportDir, "baseline_tiny_improve.json");
  await writeFile(exactPatchPath, "diff --git a/src/melee/ft/chara/ftDemo.c b/src/melee/ft/chara/ftDemo.c\n");
  await writeFile(skippedExactPatchPath, "diff --git a/src/melee/ft/chara/ftDemo2.c b/src/melee/ft/chara/ftDemo2.c\n");
  await writeFile(improvePatchPath, "diff --git a/src/melee/ft/chara/ftDemo4.c b/src/melee/ft/chara/ftDemo4.c\n");
  await writeFile(tinyImprovePatchPath, "diff --git a/src/melee/ft/chara/ftDemo5.c b/src/melee/ft/chara/ftDemo5.c\n");
  await writeFile(
    exactSummaryPath,
    JSON.stringify(
      {
        run_id: init.run.id,
        lease_id: "checkpoint-exact-lease",
        target: {
          unit: "main/melee/ft/chara/ftDemo",
          symbol: "ftDemo_Exact",
          source_path: "src/melee/ft/chara/ftDemo.c",
        },
        write_set: ["src/melee/ft/chara/ftDemo.c"],
        report_type: "score_candidate",
        summary: "Synthetic exact match for checkpoint smoke.",
        agent_report: {
          patch_path: exactPatchPath,
          attempts: [
            {
              description: "Synthetic exact-match attempt.",
              old_score: 99.5,
              new_score: 100,
              delta: 0.5,
              artifact_path: "synthetic-objdiff.json",
            },
          ],
        },
        acceptance_gate: {
          accepted: true,
          intendedReportType: "score_candidate",
          effectiveReportType: "score_candidate",
          reasons: [],
        },
        runner_validation: {
          status: "passed",
          reasons: [],
          target: {
            unit: "main/melee/ft/chara/ftDemo",
            symbol: "ftDemo_Exact",
            before: 99.5,
            after: 100,
            improved: true,
            exact: true,
          },
          regressions: [],
          improvements: [
            {
              kind: "function",
              unit: "main/melee/ft/chara/ftDemo",
              item: "ftDemo_Exact",
              before: 99.5,
              after: 100,
            },
          ],
        },
        repair_attempts: {
          exhausted: false,
        },
        created_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  await writeFile(
    skippedExactSummaryPath,
    JSON.stringify(
      {
        run_id: init.run.id,
        lease_id: "checkpoint-skipped-exact-lease",
        target: {
          unit: "main/melee/ft/chara/ftDemo2",
          symbol: "ftDemo_SkippedExact",
          source_path: "src/melee/ft/chara/ftDemo2.c",
        },
        write_set: ["src/melee/ft/chara/ftDemo2.c"],
        report_type: "score_candidate",
        summary: "Synthetic exact match without runner-owned validation.",
        agent_report: {
          patch_path: skippedExactPatchPath,
          attempts: [
            {
              description: "Synthetic exact-match attempt with skipped runner validation.",
              old_score: 99.5,
              new_score: 100,
              delta: 0.5,
              artifact_path: "synthetic-worker-local-objdiff.json",
            },
          ],
        },
        acceptance_gate: {
          accepted: true,
          intendedReportType: "score_candidate",
          effectiveReportType: "score_candidate",
          reasons: [],
        },
        runner_validation: {
          status: "skipped",
          reasons: ["legacy report without runner-owned same-unit validation"],
        },
        repair_attempts: {
          exhausted: false,
        },
        created_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  await writeFile(
    toolErrorSummaryPath,
    JSON.stringify(
      {
        run_id: init.run.id,
        lease_id: "checkpoint-tool-error-lease",
        target: {
          unit: "main/melee/ft/chara/ftDemo3",
          symbol: "ftDemo_ToolError",
          source_path: "src/melee/ft/chara/ftDemo3.c",
        },
        write_set: ["src/melee/ft/chara/ftDemo3.c"],
        report_type: "tool_error",
        result: "no_progress",
        stop_reason: "stalled",
        needed_fact: null,
        summary: "Synthetic tool error for checkpoint smoke.",
        error: {
          kind: "runner_validation_snapshot_unavailable",
          reasons: ["post-worker unit diff exited 127"],
        },
        runner_validation: {
          status: "snapshot_unavailable",
          reasons: ["post-worker unit diff exited 127"],
        },
        repair_attempts: {
          exhausted: true,
        },
        created_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  await writeFile(
    toolErrorBlockerPath,
    JSON.stringify(
      {
        reason: "tool_error",
        note: "Synthetic tool error for checkpoint smoke.",
      },
      null,
      2,
    ),
  );
  const improvementSummary = (params: {
    leaseId: string;
    unit: string;
    symbol: string;
    sourcePath: string;
    before: number;
    after: number;
    patchPath: string;
    baselinePath: string;
  }): string =>
    JSON.stringify(
      {
        run_id: init.run.id,
        lease_id: params.leaseId,
        target: { unit: params.unit, symbol: params.symbol, source_path: params.sourcePath },
        write_set: [params.sourcePath],
        report_type: "progress",
        summary: "Synthetic non-exact improvement for checkpoint smoke.",
        agent_report: {
          patch_path: params.patchPath,
          attempts: [
            {
              description: "Synthetic improvement attempt.",
              old_score: params.before,
              new_score: params.after,
              delta: params.after - params.before,
              artifact_path: "synthetic-objdiff.json",
            },
          ],
        },
        acceptance_gate: { accepted: true, intendedReportType: "progress", effectiveReportType: "progress", reasons: [] },
        runner_validation: {
          status: "passed",
          reasons: [],
          target: { unit: params.unit, symbol: params.symbol, before: params.before, after: params.after, improved: true, exact: false },
          regressions: [],
          improvements: [{ kind: "function", unit: params.unit, item: params.symbol, before: params.before, after: params.after }],
          baselinePath: params.baselinePath,
        },
        repair_attempts: { exhausted: false },
        created_at: new Date().toISOString(),
      },
      null,
      2,
    );
  await writeFile(
    improveBaselinePath,
    JSON.stringify({ unit: "main/melee/ft/chara/ftDemo4", symbol: "ftDemo_Improve", functions: [{ name: "ftDemo_Improve", score: 60, size: 512 }], sections: [] }, null, 2),
  );
  await writeFile(
    improveSummaryPath,
    improvementSummary({
      leaseId: "checkpoint-improve-lease",
      unit: "main/melee/ft/chara/ftDemo4",
      symbol: "ftDemo_Improve",
      sourcePath: "src/melee/ft/chara/ftDemo4.c",
      before: 60,
      after: 75,
      patchPath: improvePatchPath,
      baselinePath: improveBaselinePath,
    }),
  );
  await writeFile(
    tinyImproveBaselinePath,
    JSON.stringify({ unit: "main/melee/ft/chara/ftDemo5", symbol: "ftDemo_TinyImprove", functions: [{ name: "ftDemo_TinyImprove", score: 99, size: 512 }], sections: [] }, null, 2),
  );
  await writeFile(
    tinyImproveSummaryPath,
    improvementSummary({
      leaseId: "checkpoint-tiny-improve-lease",
      unit: "main/melee/ft/chara/ftDemo5",
      symbol: "ftDemo_TinyImprove",
      sourcePath: "src/melee/ft/chara/ftDemo5.c",
      before: 99,
      after: 99.4,
      patchPath: tinyImprovePatchPath,
      baselinePath: tinyImproveBaselinePath,
    }),
  );
  const checkpointSeedStore = openState(stateDir);
  try {
    const createdAt = new Date().toISOString();
    checkpointSeedStore.db
      .query(
        "INSERT INTO targets (id, run_id, unit, symbol, source_path, size, fuzzy, status, priority, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "checkpoint-exact-target",
        init.run.id,
        "main/melee/ft/chara/ftDemo",
        "ftDemo_Exact",
        "src/melee/ft/chara/ftDemo.c",
        32,
        99.5,
        "reported",
        100,
        "synthetic exact checkpoint target",
        createdAt,
      );
    checkpointSeedStore.db
      .query("INSERT INTO queue (id, run_id, target_id, priority, reason, status, created_at, leased_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("checkpoint-exact-queue", init.run.id, "checkpoint-exact-target", 100, "synthetic exact checkpoint target", "reported", createdAt, createdAt);
    checkpointSeedStore.db
      .query("INSERT INTO leases (id, queue_id, worker_id, base_rev, write_set_hash, worktree_path, ttl, heartbeat_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("checkpoint-exact-lease", "checkpoint-exact-queue", "checkpoint-exact-worker", "smoke-base", "synthetic", null, createdAt, createdAt, "released_complete");
    checkpointSeedStore.db
      .query("INSERT INTO worker_reports (id, lease_id, report_type, summary_path, facts_path, blocker_path, patch_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("checkpoint-exact-report", "checkpoint-exact-lease", "score_candidate", exactSummaryPath, null, null, exactPatchPath, createdAt);
    checkpointSeedStore.db
      .query(
        "INSERT INTO targets (id, run_id, unit, symbol, source_path, size, fuzzy, status, priority, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "checkpoint-skipped-exact-target",
        init.run.id,
        "main/melee/ft/chara/ftDemo2",
        "ftDemo_SkippedExact",
        "src/melee/ft/chara/ftDemo2.c",
        32,
        99.5,
        "reported",
        100,
        "synthetic skipped-validation checkpoint target",
        createdAt,
      );
    checkpointSeedStore.db
      .query("INSERT INTO queue (id, run_id, target_id, priority, reason, status, created_at, leased_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "checkpoint-skipped-exact-queue",
        init.run.id,
        "checkpoint-skipped-exact-target",
        100,
        "synthetic skipped-validation checkpoint target",
        "reported",
        createdAt,
        createdAt,
      );
    checkpointSeedStore.db
      .query("INSERT INTO leases (id, queue_id, worker_id, base_rev, write_set_hash, worktree_path, ttl, heartbeat_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "checkpoint-skipped-exact-lease",
        "checkpoint-skipped-exact-queue",
        "checkpoint-skipped-exact-worker",
        "smoke-base",
        "synthetic",
        null,
        createdAt,
        createdAt,
        "released_complete",
      );
    checkpointSeedStore.db
      .query("INSERT INTO worker_reports (id, lease_id, report_type, summary_path, facts_path, blocker_path, patch_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "checkpoint-skipped-exact-report",
        "checkpoint-skipped-exact-lease",
        "score_candidate",
        skippedExactSummaryPath,
        null,
        null,
        skippedExactPatchPath,
        createdAt,
      );
    checkpointSeedStore.db
      .query(
        "INSERT INTO targets (id, run_id, unit, symbol, source_path, size, fuzzy, status, priority, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "checkpoint-tool-error-target",
        init.run.id,
        "main/melee/ft/chara/ftDemo3",
        "ftDemo_ToolError",
        "src/melee/ft/chara/ftDemo3.c",
        32,
        88.5,
        "reported",
        100,
        "synthetic tool-error checkpoint target",
        createdAt,
      );
    checkpointSeedStore.db
      .query("INSERT INTO queue (id, run_id, target_id, priority, reason, status, created_at, leased_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "checkpoint-tool-error-queue",
        init.run.id,
        "checkpoint-tool-error-target",
        100,
        "synthetic tool-error checkpoint target",
        "reported",
        createdAt,
        createdAt,
      );
    checkpointSeedStore.db
      .query("INSERT INTO leases (id, queue_id, worker_id, base_rev, write_set_hash, worktree_path, ttl, heartbeat_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "checkpoint-tool-error-lease",
        "checkpoint-tool-error-queue",
        "checkpoint-tool-error-worker",
        "smoke-base",
        "synthetic",
        null,
        createdAt,
        createdAt,
        "released_error",
      );
    checkpointSeedStore.db
      .query("INSERT INTO worker_reports (id, lease_id, report_type, summary_path, facts_path, blocker_path, patch_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "checkpoint-tool-error-report",
        "checkpoint-tool-error-lease",
        "tool_error",
        toolErrorSummaryPath,
        null,
        toolErrorBlockerPath,
        null,
        createdAt,
      );
    const seedImprovementRows = (params: { key: string; unit: string; symbol: string; sourcePath: string; fuzzy: number; summaryPath: string; patchPath: string }): void => {
      checkpointSeedStore.db
        .query(
          "INSERT INTO targets (id, run_id, unit, symbol, source_path, size, fuzzy, status, priority, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(`${params.key}-target`, init.run.id, params.unit, params.symbol, params.sourcePath, 512, params.fuzzy, "reported", 100, `synthetic ${params.key} checkpoint target`, createdAt);
      checkpointSeedStore.db
        .query("INSERT INTO queue (id, run_id, target_id, priority, reason, status, created_at, leased_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(`${params.key}-queue`, init.run.id, `${params.key}-target`, 100, `synthetic ${params.key} checkpoint target`, "reported", createdAt, createdAt);
      checkpointSeedStore.db
        .query("INSERT INTO leases (id, queue_id, worker_id, base_rev, write_set_hash, worktree_path, ttl, heartbeat_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(`${params.key}-lease`, `${params.key}-queue`, `${params.key}-worker`, "smoke-base", "synthetic", null, createdAt, createdAt, "released_complete");
      checkpointSeedStore.db
        .query("INSERT INTO worker_reports (id, lease_id, report_type, summary_path, facts_path, blocker_path, patch_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(`${params.key}-report`, `${params.key}-lease`, "progress", params.summaryPath, null, null, params.patchPath, createdAt);
    };
    seedImprovementRows({
      key: "checkpoint-improve",
      unit: "main/melee/ft/chara/ftDemo4",
      symbol: "ftDemo_Improve",
      sourcePath: "src/melee/ft/chara/ftDemo4.c",
      fuzzy: 60,
      summaryPath: improveSummaryPath,
      patchPath: improvePatchPath,
    });
    seedImprovementRows({
      key: "checkpoint-tiny-improve",
      unit: "main/melee/ft/chara/ftDemo5",
      symbol: "ftDemo_TinyImprove",
      sourcePath: "src/melee/ft/chara/ftDemo5.c",
      fuzzy: 99,
      summaryPath: tinyImproveSummaryPath,
      patchPath: tinyImprovePatchPath,
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
  let recoveryLeaseId = "";
  try {
    const leased = leaseNextQueuedTarget({
      store: recoveryStore,
      runId: recoveryInit.run.id,
      workerId: "interrupted-smoke-worker",
      baseRev: "smoke-base",
      ttlSeconds: 3600,
    });
    assertSmoke("recovery smoke created an active lease", Boolean(leased));
    recoveryLeaseId = leased?.leaseId ?? "";
  } finally {
    recoveryStore.db.close();
  }
  const recovered = parseJson<{ recoveredLeases: number }>(
    await runCli([...recoveryFlags, "recover-leases", "--run-id", recoveryInit.run.id, "--force", "--reason", "smoke interrupted worker"]),
  );
  const recoveredStore = openState(recoveryStateDir);
  try {
    assertSmoke("recover-leases recovers one active lease", recovered.recoveredLeases === 1);
    assertSmoke("recover-leases releases lease", count(recoveredStore, "SELECT COUNT(*) AS count FROM leases WHERE id = ? AND status = 'released_stalled'", recoveryLeaseId) === 1);
    assertSmoke("recover-leases writes worker report row", count(recoveredStore, "SELECT COUNT(*) AS count FROM worker_reports WHERE lease_id = ? AND report_type = 'stalled_no_useful_guess'", recoveryLeaseId) === 1);
    assertSmoke("recover-leases emits worker stalled wake event", count(recoveredStore, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'worker_stalled' AND handled_at IS NULL", recoveryInit.run.id) === 1);
    assertSmoke("recover-leases leaves no active leases", count(recoveredStore, "SELECT COUNT(*) AS count FROM leases WHERE status = 'active'") === 0);
    assertSmoke("recover-leases removes recovered file lock", count(recoveredStore, "SELECT COUNT(*) AS count FROM file_locks WHERE lease_id = ?", recoveryLeaseId) === 0);
    recoveredStore.db
      .query("UPDATE queue SET status = 'queued', leased_at = NULL WHERE id = (SELECT queue_id FROM leases WHERE id = ?)")
      .run(recoveryLeaseId);
    recoveredStore.db
      .query(
        `
          UPDATE targets
          SET status = 'queued'
          WHERE id = (
            SELECT queue.target_id
            FROM queue
            JOIN leases ON leases.queue_id = queue.id
            WHERE leases.id = ?
          )
        `,
      )
      .run(recoveryLeaseId);
    const released = leaseNextQueuedTarget({
      store: recoveredStore,
      runId: recoveryInit.run.id,
      workerId: "reused-lock-smoke-worker",
      baseRev: "smoke-base",
      ttlSeconds: 3600,
    });
    assertSmoke("released file lock does not block a later lease for the same path", Boolean(released));
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
    finalStatus: { activeWorkers: number; queuedTargets: number; unhandledEvents: number };
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
    ]),
  );
  const triggerStore = openState(triggerStateDir);
  try {
    assertSmoke("run-loop reports run_loop mode", triggerRun.mode === "run_loop");
    assertSmoke("run-loop rests after bounded idle", triggerRun.stoppedReason === "idle");
    assertSmoke("run-loop handles wake events deterministically", triggerRun.schedulerTicks >= 3);
    assertSmoke("run-loop starts one worker for fixture target", triggerRun.workersStarted === 1);
    assertSmoke("run-loop captures worker result", triggerRun.workerResults.length === 1);
    assertSmoke("run-loop has no worker errors", triggerRun.workerErrors.length === 0);
    assertSmoke("run-loop leaves no active workers", triggerRun.finalStatus.activeWorkers === 0);
    assertSmoke("run-loop drains unhandled events", triggerRun.finalStatus.unhandledEvents === 0);
    assertSmoke("run-loop does not record director cycles", count(triggerStore, "SELECT COUNT(*) AS count FROM director_cycles WHERE run_id = ?", triggerInit.run.id) === 0);
    assertSmoke("run-loop records one worker report", count(triggerStore, "SELECT COUNT(*) AS count FROM worker_reports") === 1);
    assertSmoke("run-loop handled all wake events", count(triggerStore, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND handled_at IS NULL", triggerInit.run.id) === 0);
  } finally {
    triggerStore.db.close();
  }
  const triggerAliasRun = parseJson<{ mode: string }>(
    await runCli([
      ...triggerFlags,
      "trigger-agent",
      "--run-id",
      triggerInit.run.id,
      "--max-workers",
      "0",
      "--max-iterations",
      "1",
      "--max-idle-iterations",
      "1",
      "--idle-sleep-ms",
      "1",
      "--candidate-limit",
      "8",
    ]),
  );
  assertSmoke("trigger-agent remains a run-loop compatibility alias", triggerAliasRun.mode === "run_loop");

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
    finalStatus: { activeLeases: number; unhandledEvents: number; workerReports: number };
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
    assertSmoke("babysit leaves no active leases", babysitRun.finalStatus.activeLeases === 0);
    assertSmoke("babysit drains wake events", babysitRun.finalStatus.unhandledEvents === 0);
    assertSmoke("babysit records one worker report", babysitRun.finalStatus.workerReports === 1);
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
  assertSmoke("worker report artifact exists", existsSync(worker.workerReport));
  assertSmoke("status output includes worker report count", Number(status.workerReports ?? 0) === 1);
  const workerSystemPrompt = readFileSync(worker.workerSystemPrompt, "utf8");
  const workerUserPrompt = readFileSync(worker.workerUserPrompt, "utf8");
  const renderedPrompts = [workerSystemPrompt, workerUserPrompt].join("\n");
  assertSmoke("worker system prompt names target-file edit rule", workerSystemPrompt.includes('<target_file path="...">'));
  assertSmoke("worker system prompt requires local regression ledger", workerSystemPrompt.includes("local regression ledger"));
  assertSmoke("worker system prompt has local regression output contract", workerSystemPrompt.includes("local_regression_check"));
  assertSmoke("worker system prompt is compact", workerSystemPrompt.length < 12000);
  assertSmoke("worker system prompt keeps structured workflow phases", workerSystemPrompt.includes("<workflow>") && workerSystemPrompt.includes('<phase id="1" name="understand_task">'));
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
    injectedStandardsBlock.includes('<standard id="natural-loops">') && injectedStandardsBlock.includes("<do>") && injectedStandardsBlock.includes("<do_not>"),
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
    "worker user prompt injects compact target graph file card at bottom",
    workerUserPrompt.includes("<target_graph_file_card>") &&
      workerUserPrompt.includes('"source": "code_graph_file_card"') &&
      workerUserPrompt.includes('"editability"') &&
      workerUserPrompt.includes('"search_leads"') &&
      workerUserPrompt.includes('"symbols"') &&
      workerUserPrompt.includes('"target_symbol"') &&
      workerUserPrompt.includes('"past_prs"') &&
      workerUserPrompt.includes('"path_facts"') &&
      workerUserPrompt.includes('"follow_up_queries"') &&
      workerUserPrompt.includes('"path_facts_resolve"') &&
      !workerUserPrompt.includes('"scheduling_signals"') &&
      !workerUserPrompt.includes('"priority_bonus"') &&
      workerUserPrompt.trimEnd().endsWith("</target_graph_file_card>"),
  );
  assertSmoke("worker user prompt omits selected context references", !workerUserPrompt.includes("selected_agent_context_references") && !workerUserPrompt.includes("worker_operating_guide"));
  const agentViewerResponse = await fetchAgentViewerServer(new Request("http://agent-viewer.local/api/agents/render?agent=worker&source=sample"));
  const agentViewerPreview = (await agentViewerResponse.json()) as {
    context?: Record<string, unknown>;
    systemPrompt?: string;
    systemStats?: { tokens: number; unresolvedPlaceholders: string[] };
    userPrompt?: string;
    userStats?: { tokens: number; unresolvedPlaceholders: string[] };
  };
  const agentViewerWorkerPrompt = agentViewerPreview.userPrompt ?? "";
  const agentViewerSystemPrompt = agentViewerPreview.systemPrompt ?? "";
  const agentViewerAttachedTools = Array.isArray(agentViewerPreview.context?.attached_tools) ? agentViewerPreview.context.attached_tools : [];
  assertSmoke("agent viewer sample worker render exposes attached tools out of prompt", agentViewerAttachedTools.length === defaultWorkerToolProfile.length);
  assertSmoke(
    "agent viewer sample worker stats are calculated after prompt hydration",
    agentViewerPreview.userStats?.tokens === promptStats(agentViewerWorkerPrompt).tokens &&
      agentViewerPreview.systemStats?.tokens === promptStats(agentViewerSystemPrompt).tokens &&
      agentViewerPreview.userStats.unresolvedPlaceholders.length === 0 &&
      agentViewerPreview.systemStats.unresolvedPlaceholders.length === 0,
  );
  assertSmoke(
    "agent viewer sample worker prompt renders fixture target file content",
    agentViewerResponse.ok &&
      agentViewerWorkerPrompt.includes('<target_file path="src/melee/ft/chara/ftDemo.c"') &&
      agentViewerWorkerPrompt.includes("void ftDemo_Unmatched(void) {}") &&
      !agentViewerWorkerPrompt.includes('unavailable="true"'),
  );
  assertSmoke(
    "agent viewer sample worker prompt keeps target, baseline, and standards",
    agentViewerWorkerPrompt.includes("<target>") &&
      agentViewerWorkerPrompt.includes("<baseline") &&
      agentViewerWorkerPrompt.includes("<target_graph_file_card") &&
      agentViewerWorkerPrompt.includes("<details_json>") &&
      agentViewerWorkerPrompt.includes('"source_path": "src/melee/ft/chara/ftDemo.c"') &&
      agentViewerWorkerPrompt.includes('"current_scores"') &&
      agentViewerWorkerPrompt.includes('"search_leads"') &&
      agentViewerWorkerPrompt.includes('"same_file_symbols"') &&
      agentViewerWorkerPrompt.includes('"same_file_functions"') &&
      agentViewerWorkerPrompt.includes('"mismatch_patterns"') &&
      agentViewerWorkerPrompt.includes('"Stack/frame layout mismatch"') &&
      agentViewerWorkerPrompt.includes('"resources"') &&
      agentViewerWorkerPrompt.includes('"path_facts"') &&
      agentViewerWorkerPrompt.includes('"Fighter character source style"') &&
      agentViewerWorkerPrompt.includes('"past_prs"') &&
      agentViewerWorkerPrompt.includes('"follow_up_queries"') &&
      !agentViewerWorkerPrompt.includes('"scheduling_signals"') &&
      !agentViewerWorkerPrompt.includes('"priority_bonus"') &&
      agentViewerWorkerPrompt.includes("<decomp_standards>") &&
      agentViewerWorkerPrompt.includes("<available_tools>") &&
      !agentViewerWorkerPrompt.includes("<current_state_json>") &&
      !agentViewerWorkerPrompt.includes("<available_pi_tools_json>") &&
      !agentViewerWorkerPrompt.includes("selected_agent_context_references") &&
      !agentViewerWorkerPrompt.includes('"lease"'),
  );
  const workerOutput = readFileSync(worker.workerOutput, "utf8");
  const workerCustomToolsLine = workerOutput
    .split("\n")
    .find((line) => line.startsWith("custom_tools: ")) ?? "";
  const expectedWorkerTools = [...defaultWorkerToolProfile];
  assertSmoke("worker dry-run uses gpt-5.5", workerOutput.includes("model: gpt-5.5"));
  assertSmoke("worker dry-run uses medium thinking", workerOutput.includes("thinking: medium"));
  assertSmoke("worker dry-run attaches decomposed Pi tools", expectedWorkerTools.every((toolId) => workerCustomToolsLine.includes(toolId)));
  assertSmoke("worker dry-run omits old context guide tool", !workerCustomToolsLine.includes("worker_context_get"));
  assertSmoke("worker dry-run omits generic lookup router by default", !workerCustomToolsLine.includes("decomp_lookup"));
  assertSmoke("worker user prompt does not list lookup commands", !workerUserPrompt.includes('"lookup_commands"'));
  assertSmoke("rendered prompts do not reference design doc", !renderedPrompts.includes("decomp-orchestrator-design.html"));
  assertSmoke("rendered prompts do not reference Codex skill paths", !renderedPrompts.includes(".codex/skills"));
  assertSmoke("worker prompt includes structured past PR resources", workerUserPrompt.includes("past_prs"));
  assertSmoke("worker prompt includes data sheet resources", workerUserPrompt.includes("ssbm_data_sheet"));
  assertSmoke("rendered prompts do not include director scheduling context", !renderedPrompts.includes("packages/agents/src/director/context/scheduling.md"));
  assertSmoke("rendered prompts do not include worker context guide paths", !renderedPrompts.includes("packages/agents/src/worker/context/"));
  assertSmoke("worker user prompt does not duplicate Pi tool affordances", !workerUserPrompt.includes("<available_pi_tools_json>"));
  assertSmoke("rendered prompts do not include old worker overview context", !renderedPrompts.includes("packages/agents/src/worker/context/overview.md"));
  assertSmoke("rendered prompts do not reference old knowledge references", !renderedPrompts.includes("knowledge/references"));
  assertSmoke("rendered prompts do not reference old knowledge workflows", !renderedPrompts.includes("knowledge/workflows"));
  assertSmoke("rendered prompts do not reference targeted iteration workflow file", !renderedPrompts.includes("workflows/targeted-iteration.md"));
  assertSmoke("rendered prompts omit legacy sweep workflow", !renderedPrompts.includes("melee-decomp-sweep"));
  assertSmoke("worker prompt omits helper command paths", !workerUserPrompt.includes("decomp_context_lookup.py"));

  const summary = {
    state_dir: stateDir,
    fixture_root: fixtureRoot,
    run_id: init.run.id,
    commands: commands.map((command) => command.command),
    row_counts: {
      runs: 1,
      targets: 1,
      queue: 1,
      events: 2,
      pi_sessions: 1,
      director_cycles: 0,
      leases: 1,
      file_locks: 0,
      worker_reports: 1,
    },
    artifacts: {
      initial_board: initialBoard,
      worker_output: worker.workerOutput,
      worker_system_prompt: worker.workerSystemPrompt,
      worker_user_prompt: worker.workerUserPrompt,
      worker_report: worker.workerReport,
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
