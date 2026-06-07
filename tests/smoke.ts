#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { evaluateWorkerReportAcceptance, workerReturnRepairReasons } from "../src/agents/worker/index.js";
import { buildPrSplitPlanFromChanges } from "../src/cli/commands/pr-split-plan.js";
import { evaluateReplanDecision, workerOpenSlots } from "../src/cli/commands/trigger-agent.js";
import {
  createRun,
  leaseNextQueuedTarget,
  openState,
  prioritizeQueuedTargets,
  queuedTargetCount,
  refillQueuedTargets,
  schedulableTargetCount,
} from "../src/state/index.js";
import type { TargetCandidate } from "../src/types/index.js";

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
  const command = ["bun", "src/bin/decomp-orchestrator.ts", ...args];
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
      "fixture prototype lesson",
      "Fixture body says prototype evidence should be searched through the graph enrichment.",
      JSON.stringify(["ftDemo_Unmatched"]),
      1760000000,
      1760000100,
      1760000100,
      "fixture resolution note",
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
      "Fixture build diagnosis for source-shape matching.",
      "Fixture nontrivial function note.",
      1760000200,
    );
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
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
    refillStore.db
      .query("UPDATE queue SET status = 'reported' WHERE target_id = (SELECT id FROM targets WHERE run_id = ? AND unit = ? AND symbol = ?)")
      .run(run.id, "unit_1", "fn_1");
    refillStore.db.query("UPDATE targets SET status = 'reported' WHERE run_id = ? AND unit = ? AND symbol = ?").run(run.id, "unit_1", "fn_1");
    const directorRequeued = prioritizeQueuedTargets(refillStore, run.id, [candidate(1, "src/a.c", 101)]);
    assertSmoke("director target packets can requeue an attempted target", directorRequeued === 1);
    assertSmoke("director requeue restores queued target count", queuedTargetCount(refillStore, run.id) === 4);

    const leased = leaseNextQueuedTarget({
      store: refillStore,
      runId: run.id,
      workerId: "refill-lock-smoke-worker",
      baseRev: "smoke-base",
      ttlSeconds: 3600,
    });
    assertSmoke("queue refill smoke created an active lease", Boolean(leased));
    const lockedSource = String(leased?.target.source_path ?? "");
    const secondRefill = refillQueuedTargets(
      refillStore,
      run.id,
      [candidate(6, lockedSource, 95), candidate(7, "src/e.c", 94)],
      { targetSize: 5, minSchedulableSources: 4 },
    );
    assertSmoke("queue refill skips active locked sources", secondRefill.skippedLockedSource === 1);
    assertSmoke("queue refill adds fresh unlocked work", secondRefill.inserted === 1);
  } finally {
    refillStore.db.close();
  }

  stateDir = await mkdtemp(join(tmpdir(), "decomp-orchestrator-smoke-"));
  const commonFlags = ["--repo-root", fixtureRoot, "--state-dir", stateDir, "--dry-run-agents"];
  const graphDb = join(stateDir, "knowledge-graph.sqlite");
  const legacyAgentStateDb = join(stateDir, "legacy-agent-state.sqlite");
  const legacyAgentStateEnrichment = join(stateDir, "agent-shared-state-lessons.jsonl");
  createLegacyAgentStateDb(legacyAgentStateDb);
  const kgImportAgentState = parseJson<{ tool_issues: number; function_hints: number; skipped_audit_log: boolean }>(
    await runCli([...commonFlags, "kg-import-agent-state", "--input", legacyAgentStateDb, "--output", legacyAgentStateEnrichment]),
  );
  assertSmoke("kg-import-agent-state extracts historical tool issues", kgImportAgentState.tool_issues === 1);
  assertSmoke("kg-import-agent-state extracts useful function hints", kgImportAgentState.function_hints === 1);
  assertSmoke("kg-import-agent-state skips legacy audit log state", kgImportAgentState.skipped_audit_log);
  const kgRebuild = parseJson<{ indexed_sources: string[]; stats: { entities: number; edges: number; search_chunks: number } }>(
    await runCli([...commonFlags, "kg-rebuild-graph", "--graph-db", graphDb, "--agent-state-enrichment", legacyAgentStateEnrichment]),
  );
  assertSmoke(
    "kg-rebuild-graph indexes code graph, past PRs, and agent shared state enrichment",
    kgRebuild.indexed_sources.includes("code_graph") &&
      kgRebuild.indexed_sources.includes("past_prs") &&
      kgRebuild.indexed_sources.includes("agent_shared_state"),
  );
  assertSmoke("kg-rebuild-graph writes graph entities", kgRebuild.stats.entities > 0);
  assertSmoke("kg-rebuild-graph writes graph edges", kgRebuild.stats.edges > 0);
  assertSmoke("kg-rebuild-graph writes search chunks", kgRebuild.stats.search_chunks > 0);
  const kgFileCard = parseJson<{ editability: { mode: string }; functions: unknown[]; scheduling_signals: { priority_bonus: number } }>(
    await runCli([...commonFlags, "kg-file-card", "--graph-db", graphDb, "--source", "src/melee/ft/chara/ftDemo.c"]),
  );
  assertSmoke("kg-file-card reports fixture file editable", kgFileCard.editability.mode === "editable");
  assertSmoke("kg-file-card includes fixture functions", kgFileCard.functions.length === 2);
  assertSmoke("kg-file-card includes graph scheduling signals", Number.isFinite(kgFileCard.scheduling_signals.priority_bonus));
  const kgSearch = parseJson<{ results: unknown[] }>(
    await runCli([...commonFlags, "kg-search", "--graph-db", graphDb, "--source", "past_prs", "--query", "ftDemo", "--limit", "3"]),
  );
  assertSmoke("kg-search can query past PR source", kgSearch.results.length > 0);
  const kgAgentStateSearch = parseJson<{ results: unknown[] }>(
    await runCli([...commonFlags, "kg-search", "--graph-db", graphDb, "--source", "agent_shared_state", "--query", "fixture prototype", "--limit", "3"]),
  );
  assertSmoke("kg-search can query agent shared state enrichment", kgAgentStateSearch.results.length > 0);
  const kgRank = parseJson<{ features: unknown[] }>(await runCli([...commonFlags, "kg-rank-features", "--graph-db", graphDb, "--limit", "3"]));
  assertSmoke("kg-rank-features returns fixture candidate features", kgRank.features.length === 1);

  const init = parseJson<{ run: { id: string }; targetCount: number }>(
    await runCli([...commonFlags, "init-run", "--desired-workers", "1", "--candidate-limit", "8", "--goal-kind", "matched_code_percent", "--goal-value", "72"]),
  );
  assertSmoke("init-run queues only the imperfect fixture function", init.targetCount === 1);

  const tick = parseJson<{ directorOutput: string; directorCycleId: string; directorSystemPrompt: string; directorUserPrompt: string }>(
    await runCli([...commonFlags, "tick", "--run-id", init.run.id, "--candidate-limit", "8"]),
  );
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
    assertSmoke("director session row exists", count(store, "SELECT COUNT(*) AS count FROM pi_sessions WHERE run_id = ? AND role = 'director' AND status = 'dry_run'", runId) === 1);
    assertSmoke("worker session row exists", count(store, "SELECT COUNT(*) AS count FROM pi_sessions WHERE run_id = ? AND role = 'worker' AND lease_id = ? AND status = 'dry_run'", runId, worker.leaseId) === 1);
    assertSmoke("director cycle row exists", count(store, "SELECT COUNT(*) AS count FROM director_cycles WHERE run_id = ?", runId) === 1);
    assertSmoke("lease row exists", count(store, "SELECT COUNT(*) AS count FROM leases WHERE id = ? AND status = 'released_stalled'", worker.leaseId) === 1);
    assertSmoke("released lease removes file lock row", count(store, "SELECT COUNT(*) AS count FROM file_locks WHERE lease_id = ?", worker.leaseId) === 0);
    assertSmoke("worker report row exists", count(store, "SELECT COUNT(*) AS count FROM worker_reports WHERE lease_id = ? AND report_type = 'stalled_no_useful_guess'", worker.leaseId) === 1);
  } finally {
    store.db.close();
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
    stoppedReason: string;
    directorTicks: number;
    workersStarted: number;
    workerResults: unknown[];
    workerErrors: unknown[];
    finalStatus: { activeWorkers: number; queuedTargets: number; unhandledEvents: number };
  }>(
    await runCli([
      ...triggerFlags,
      "trigger-agent",
      "--run-id",
      triggerInit.run.id,
      "--max-workers",
      "1",
      "--max-iterations",
      "5",
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
    assertSmoke("trigger-agent rests after bounded idle", triggerRun.stoppedReason === "idle");
    assertSmoke("trigger-agent wakes director for run, low-pool, and worker events", triggerRun.directorTicks === 3);
    assertSmoke("trigger-agent starts one worker for fixture target", triggerRun.workersStarted === 1);
    assertSmoke("trigger-agent captures worker result", triggerRun.workerResults.length === 1);
    assertSmoke("trigger-agent has no worker errors", triggerRun.workerErrors.length === 0);
    assertSmoke("trigger-agent leaves no active workers", triggerRun.finalStatus.activeWorkers === 0);
    assertSmoke("trigger-agent drains unhandled events", triggerRun.finalStatus.unhandledEvents === 0);
    assertSmoke("trigger-agent records three director cycles", count(triggerStore, "SELECT COUNT(*) AS count FROM director_cycles WHERE run_id = ?", triggerInit.run.id) === 3);
    assertSmoke("trigger-agent records one worker report", count(triggerStore, "SELECT COUNT(*) AS count FROM worker_reports") === 1);
    assertSmoke("trigger-agent handled all wake events", count(triggerStore, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND handled_at IS NULL", triggerInit.run.id) === 0);
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
      "5",
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
    assertSmoke("babysit records three director cycles", count(babysitStore, "SELECT COUNT(*) AS count FROM director_cycles WHERE run_id = ?", babysitInit.run.id) === 3);
  } finally {
    babysitStore.db.close();
  }

  const initialBoard = resolve(stateDir, "runs", init.run.id, "snapshots", "initial_board.json");
  const smokeSummaryPath = resolve(stateDir, "runs", init.run.id, "smoke_summary.json");
  assertSmoke("initial board snapshot artifact exists", existsSync(initialBoard));
  assertSmoke("director dry-run artifact exists", existsSync(tick.directorOutput));
  assertSmoke("director system prompt artifact exists", existsSync(tick.directorSystemPrompt));
  assertSmoke("director user prompt artifact exists", existsSync(tick.directorUserPrompt));
  assertSmoke("worker dry-run artifact exists", existsSync(worker.workerOutput));
  assertSmoke("worker system prompt artifact exists", existsSync(worker.workerSystemPrompt));
  assertSmoke("worker user prompt artifact exists", existsSync(worker.workerUserPrompt));
  assertSmoke("worker report artifact exists", existsSync(worker.workerReport));
  assertSmoke("status output includes worker report count", Number(status.workerReports ?? 0) === 1);
  const directorSystemPrompt = readFileSync(tick.directorSystemPrompt, "utf8");
  const directorUserPrompt = readFileSync(tick.directorUserPrompt, "utf8");
  const workerSystemPrompt = readFileSync(worker.workerSystemPrompt, "utf8");
  const workerUserPrompt = readFileSync(worker.workerUserPrompt, "utf8");
  const renderedPrompts = [directorSystemPrompt, directorUserPrompt, workerSystemPrompt, workerUserPrompt].join("\n");
  assertSmoke("director system prompt names director role", directorSystemPrompt.includes("director Pi agent"));
  assertSmoke("director system prompt embeds scheduling rules", directorSystemPrompt.includes("Do not schedule already exact 100% complete files"));
  assertSmoke("director user prompt includes current state", directorUserPrompt.includes("<current_state_json>"));
  assertSmoke("worker system prompt names lease write-set rule", workerSystemPrompt.includes("write_set"));
  assertSmoke("worker system prompt requires local regression ledger", workerSystemPrompt.includes("local regression ledger"));
  assertSmoke("worker system prompt has local regression output contract", workerSystemPrompt.includes("local_regression_check"));
  assertSmoke("worker user prompt forbids unresolved local regressions", workerUserPrompt.includes("unresolved local regression"));
  assertSmoke("worker user prompt includes primary source path", workerUserPrompt.includes("src/melee/ft/chara/ftDemo.c"));
  assertSmoke("director dry-run uses gpt-5.5", readFileSync(tick.directorOutput, "utf8").includes("model: gpt-5.5"));
  assertSmoke("director dry-run uses medium thinking", readFileSync(tick.directorOutput, "utf8").includes("thinking: medium"));
  assertSmoke("worker dry-run uses gpt-5.5", readFileSync(worker.workerOutput, "utf8").includes("model: gpt-5.5"));
  assertSmoke("worker dry-run uses medium thinking", readFileSync(worker.workerOutput, "utf8").includes("thinking: medium"));
  assertSmoke("rendered prompts do not reference design doc", !renderedPrompts.includes("decomp-orchestrator-design.html"));
  assertSmoke("rendered prompts do not reference Codex skill paths", !renderedPrompts.includes(".codex/skills"));
  assertSmoke("rendered prompts include structured past PR index", renderedPrompts.includes("decomp-orchestrator/knowledge/sources/past_prs/data/prs/index.jsonl"));
  assertSmoke("rendered prompts include data sheet resources", renderedPrompts.includes("knowledge/sources/ssbm_data_sheet/data/csv"));
  assertSmoke("rendered prompts include agent context manifest", renderedPrompts.includes("decomp-orchestrator/src/agents/context/manifest.json"));
  assertSmoke("rendered prompts do not include director scheduling context", !renderedPrompts.includes("src/agents/director/context/scheduling.md"));
  assertSmoke("rendered prompts include worker operating context", renderedPrompts.includes("src/agents/worker/context/operating-guide.md"));
  assertSmoke("rendered prompts do not include old worker overview context", !renderedPrompts.includes("src/agents/worker/context/overview.md"));
  assertSmoke("rendered prompts do not reference old knowledge references", !renderedPrompts.includes("knowledge/references"));
  assertSmoke("rendered prompts do not reference old knowledge workflows", !renderedPrompts.includes("knowledge/workflows"));
  assertSmoke("rendered prompts do not reference targeted iteration workflow file", !renderedPrompts.includes("workflows/targeted-iteration.md"));
  assertSmoke("rendered prompts omit legacy sweep workflow", !renderedPrompts.includes("melee-decomp-sweep"));
  assertSmoke("rendered prompts include decomp context helper", renderedPrompts.includes("decomp_context_lookup.py"));

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
      pi_sessions: 2,
      director_cycles: 1,
      leases: 1,
      file_locks: 0,
      worker_reports: 1,
    },
    artifacts: {
      initial_board: initialBoard,
      director_output: tick.directorOutput,
      director_system_prompt: tick.directorSystemPrompt,
      director_user_prompt: tick.directorUserPrompt,
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
