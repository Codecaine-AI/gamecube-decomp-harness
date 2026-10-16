import { EDIT_SCOPE_INSTRUCTION } from "@server/core/validation/edit-scope/edit-scope.js";
import { outOfScopeReadmissionRepairRequest } from "@server/core/harness-runtime/phases/running/workers/worker-cycle.js";
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { initializeDispatchState, releaseDispatch, requestDispatch, StaleLeaseError } from "@server/core/harness-state";
import { seedRunHarness } from "../../../run-state/test-harness.js";
import { createRun } from "@server/core/harness-runtime/run-state";
import { blockingWorkerOutputIntegrationCount, enqueueWorkerOutputIntegration } from "@server/core/harness-runtime/run-state/worker-output-integration.js";
import { runCommand } from "@server/infrastructure/shell";
import { integrationCommitMessage, processWorkerOutputIntegrationQueue } from "./worker-output-queue.js";
import { unitInputsSha256 } from "@server/core/validation/edit-scope/unused-evidence.js";
import { activeUnverifiedMatch, clearUnverifiedMatch, listUnverifiedMatches, recordUnverifiedMatch } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { runConfirmationPass, type ConfirmationPassDeps } from "../epochs/confirmation-pass.js";
import { UNVERIFIED_MATCH_CERTIFICATION_KEY } from "@server/core/validation/steering/unverified-certification.js";
import { recordSteeringRollback } from "@server/core/harness-runtime/run-state/steering.js";

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(repo: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString() || result.stdout.toString());
  return result.stdout.toString().trim();
}

function setupRepo(): string {
  const repo = tempDir("worker-integration-repo-");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src/a.c"), "int value = 0;\n");
  writeFileSync(join(repo, "src/a.h"), "extern int value;\n");
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test User"]);
  git(repo, ["add", "src/a.c", "src/a.h"]);
  git(repo, ["commit", "-m", "baseline"]);
  return repo;
}

function patchFile(dir: string): string {
  const path = join(dir, "worker.patch");
  writeFileSync(
    path,
    [
      "diff --git a/src/a.c b/src/a.c",
      "--- a/src/a.c",
      "+++ b/src/a.c",
      "@@ -1 +1 @@",
      "-int value = 0;",
      "+int value = 1;",
      "",
    ].join("\n"),
  );
  return path;
}

function insertQueued(
  store: StateStore,
  patchPath: string,
  runId: string,
  id = "integration-1",
  checkpointMetadata: Record<string, unknown> = {},
): string {
  const checkpointId = `checkpoint-${id}`;
  store.db
    .query(
      `
        INSERT INTO worker_checkpoints (
          id, worker_state_id, run_id, epoch_id, epoch_target_id,
          target_claim_id, attempt_index, validation_time, hard_gates_passed,
          validation_status, validation_state, patch_path, diff_path, write_set_json, metadata_json
        ) VALUES (?, 'worker-1', ?, 'epoch-1', 'target-1', 'claim-1', 0,
                  '2026-08-11T00:00:00.000Z', 1, 'passed', 'tentative', ?, ?, '["src/a.c"]', ?)
      `,
    )
    .run(checkpointId, runId, patchPath, patchPath, JSON.stringify(checkpointMetadata));
  return enqueueWorkerOutputIntegration(store, {
    runId,
    epochId: "epoch-1",
    epochTargetId: "target-1",
    targetClaimId: "claim-1",
    workerStateId: "worker-1",
    workerCheckpointId: checkpointId,
    targetKey: "unit::symbol",
    metadata: { scoped_checks_passed: true },
  }).id;
}

function integration(store: StateStore, id = "integration-1"): Record<string, unknown> {
  const checkpointId = `checkpoint-${id}`;
  return (store.db.query("SELECT * FROM integration_outcomes WHERE worker_checkpoint_id = ?").get(checkpointId)
    ?? store.db.query("SELECT status FROM jobs WHERE kind = 'integration' AND dedupe_key = ?").get(checkpointId)) as Record<string, unknown>;
}

function acquireLease(store: StateStore, kind: "pr" | "run", workflowId: string, gameId = "test"): string {
  initializeDispatchState(store, { gameId, traceId: `trace-${gameId}` });
  const decision = requestDispatch(store, {
    actor: "operator",
    commandId: `command-${kind}-${workflowId}`,
    correlationId: workflowId,
    kind,
    gameId,
    reason: "worker output integration test",
    workflowId,
  });
  if (decision.queued) throw new Error(`test dispatch unexpectedly queued behind ${decision.blockedBy.lease_id}`);
  return decision.leaseId;
}

describe("apply-on-accept worker output integration", () => {
  test("a clean apply commits immediately and records tentative validation", async () => {
    const stateDir = tempDir("worker-integration-state-");
    const store = openState(stateDir);
    try {
      const repo = setupRepo();
      const patchPath = patchFile(stateDir);
      seedRunHarness(store, "test", "base-test", repo);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      insertQueued(store, patchPath, run.id, "integration-1", {
        out_of_write_set_changes: { paths: [], count: 0, categories: {} },
      });
      const leaseId = acquireLease(store, "run", run.id);

      const result = await processWorkerOutputIntegrationQueue({
        dryRun: false,
        leaseId,
        repoRoot: repo,
        runId: run.id,
        stateDir,
        store,
      });

      expect(result.processed).toHaveLength(1);
      expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "clean_apply" });
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 1;\n");
      expect(Number(git(repo, ["rev-list", "--count", "HEAD"]))).toBe(2);
      expect(result.headRev).toBe(git(repo, ["rev-parse", "HEAD"]));
      expect(result.processed[0].integratedRev).toBe(result.headRev);
      expect(git(repo, ["log", "-1", "--format=%s"])).toContain("worker-integration(");
      expect(git(repo, ["log", "-1", "--format=%s"])).toContain("unit::symbol");
      const row = integration(store);
      expect(String(row.metadata_json)).toContain("integrated_rev");
      expect(
        (store.db.query("SELECT validation_state FROM worker_checkpoints WHERE id = 'checkpoint-integration-1'").get() as Record<string, unknown>)
          .validation_state,
      ).toBe("tentative");
    } finally {
      store.db.close();
    }
  });

  test("a checkpoint with dropped changed paths conflicts before applying its filtered patch", async () => {
    const stateDir = tempDir("worker-integration-write-set-state-");
    const store = openState(stateDir);
    try {
      const repo = setupRepo();
      const patchPath = patchFile(stateDir);
      seedRunHarness(store, "test", "base-test", repo);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      insertQueued(store, patchPath, run.id, "integration-1", {
        out_of_write_set_changes: {
          paths: [{ path: "src/a.h", category: "owning-header" }],
          count: 1,
          categories: { "owning-header": 1 },
        },
      });
      const leaseId = acquireLease(store, "run", run.id);

      const result = await processWorkerOutputIntegrationQueue({
        dryRun: false,
        leaseId,
        repoRoot: repo,
        runId: run.id,
        stateDir,
        store,
      });

      expect(result.processed[0]).toMatchObject({
        status: "conflict",
        disposition: "checkpoint_write_set_mismatch",
        conflictPaths: ["src/a.h"],
      });
      expect(result.processed[0]?.failureReasons[0]).toContain("filtered patch would drop: src/a.h");
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 0;\n");
      expect(readFileSync(join(repo, "src/a.h"), "utf8")).toBe("extern int value;\n");
      expect(Number(git(repo, ["rev-list", "--count", "HEAD"]))).toBe(1);
    } finally {
      store.db.close();
    }
  });

  test("a racing sweep that captures the applied content is success, not a silent revert", async () => {
    const stateDir = tempDir("worker-integration-race-state-");
    const store = openState(stateDir);
    try {
      const repo = setupRepo();
      const patchPath = patchFile(stateDir);
      seedRunHarness(store, "test", "base-test", repo);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      insertQueued(store, patchPath, run.id);
      const leaseId = acquireLease(store, "run", run.id);
      // Simulate a resolver commit / boundary `add -A` landing between the
      // drain's apply and its pathspec commit: the drain's own commit then
      // exits "no changes" while the accepted content is already in HEAD.
      let raced = false;
      const racingRunner: typeof runCommand = async (cwd, command, options) => {
        if (!raced && command[0] === "git" && command[1] === "commit") {
          raced = true;
          git(repo, ["add", "-A"]);
          git(repo, ["commit", "-m", "racing sweep captured applied content"]);
        }
        return runCommand(cwd, command, options);
      };

      const result = await processWorkerOutputIntegrationQueue({
        commandRunner: racingRunner,
        dryRun: false,
        leaseId,
        repoRoot: repo,
        runId: run.id,
        stateDir,
        store,
      });

      expect(raced).toBe(true);
      expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "clean_apply" });
      // The applied content stays in HEAD; no compensation reverse-apply ran.
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 1;\n");
      expect(git(repo, ["status", "--porcelain"])).toBe("");
      expect(Number(git(repo, ["rev-list", "--count", "HEAD"]))).toBe(2);
      expect(result.headRev).toBe(git(repo, ["rev-parse", "HEAD"]));
      expect(integration(store).status).toBe("applied");
    } finally {
      store.db.close();
    }
  });

  test("an apply conflict records the operator-visible conflict item without mutating the tree", async () => {
    const stateDir = tempDir("worker-integration-conflict-state-");
    const store = openState(stateDir);
    try {
      const repo = setupRepo();
      const patchPath = patchFile(stateDir);
      writeFileSync(join(repo, "src/a.c"), "int value = 2;\n");
      git(repo, ["add", "src/a.c"]);
      git(repo, ["commit", "-m", "current side"]);
      seedRunHarness(store, "test", "base-test", repo);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      insertQueued(store, patchPath, run.id);
      const leaseId = acquireLease(store, "run", run.id);

      const result = await processWorkerOutputIntegrationQueue({
        dryRun: false,
        leaseId,
        repoRoot: repo,
        runId: run.id,
        stateDir,
        store,
      });

      expect(result.processed[0]).toMatchObject({ status: "conflict", disposition: "apply_check_failed" });
      expect(result.headRev).toBeNull();
      const row = integration(store);
      expect(row.status).toBe("conflict");
      expect(existsSync(String(row.item_path))).toBe(true);
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 2;\n");
      expect(Number(git(repo, ["rev-list", "--count", "HEAD"]))).toBe(2);
    } finally {
      store.db.close();
    }
  });

  test("reports a landed commit even when the drain throws before it returns headRev", async () => {
    const stateDir = tempDir("worker-integration-on-integrated-state-");
    const store = openState(stateDir);
    try {
      const repo = setupRepo();
      const patchPath = patchFile(stateDir);
      seedRunHarness(store, "test", "base-test", repo);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      insertQueued(store, patchPath, run.id, "integration-1");
      insertQueued(store, patchPath, run.id, "integration-2");
      const leaseId = acquireLease(store, "run", run.id);
      // The run lease is lost right after the first commit, so the drain throws
      // when it revalidates before claiming the second job.
      const losingRunner: typeof runCommand = async (cwd, command, options) => {
        const result = await runCommand(cwd, command, options);
        if (command[0] === "git" && command[1] === "commit") {
          releaseDispatch(store, { actor: "operator", commandId: "command-release-after-commit", correlationId: run.id, leaseId, gameId: "test" });
        }
        return result;
      };
      const integrated: string[] = [];

      await expect(processWorkerOutputIntegrationQueue({
        commandRunner: losingRunner,
        dryRun: false,
        leaseId,
        onIntegrated: (rev) => integrated.push(rev),
        repoRoot: repo,
        runId: run.id,
        stateDir,
        store,
      })).rejects.toBeInstanceOf(StaleLeaseError);

      expect(integrated).toEqual([git(repo, ["rev-parse", "HEAD"])]);
      // Both jobs share a created_at, so which one the drain claims first is not fixed: exactly one lands.
      expect([integration(store, "integration-1").status, integration(store, "integration-2").status].sort()).toEqual(["applied", "queued"]);
    } finally {
      store.db.close();
    }
  });

  test("a stale lease cannot claim or mutate queued checkout work", async () => {
    const stateDir = tempDir("worker-integration-stale-lease-state-");
    const store = openState(stateDir);
    try {
      const repo = setupRepo();
      const patchPath = patchFile(stateDir);
      seedRunHarness(store, "test", "base-test", repo);
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
      insertQueued(store, patchPath, run.id);
      const staleLeaseId = acquireLease(store, "run", run.id);
      releaseDispatch(store, {
        actor: "operator",
        commandId: "command-release-run-1",
        correlationId: run.id,
        leaseId: staleLeaseId,
        gameId: "test",
      });
      const prLeaseId = acquireLease(store, "pr", "campaign-worker-output");

      await expect(
        processWorkerOutputIntegrationQueue({
          dryRun: false,
          leaseId: staleLeaseId,
          repoRoot: repo,
          runId: run.id,
          stateDir,
          store,
        }),
      ).rejects.toBeInstanceOf(StaleLeaseError);

      expect(prLeaseId).not.toBe(staleLeaseId);
      expect(integration(store).status).toBe("queued");
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 0;\n");
      expect(Number(git(repo, ["rev-list", "--count", "HEAD"]))).toBe(1);
    } finally {
      store.db.close();
    }
  });
});

const INLINED_CHECK = {
  unit: "unit",
  file: "src/a.c",
  function: "TChuuHana::rolling(void)",
  status: "inlined",
  changed: [],
  callers: [{
    function: "TNerveChuuHanaRoll::execute(TSpineBase<TLiveActor>*) const",
    before: { status: "exact", match_percent: 86 },
    after: { status: "mismatch", match_percent: 45 },
    delta: -41,
  }],
  base_rev: "base-sha",
  edits_hash: "edits-sha",
  body_sha256: "body-sha",
};
const DEAD_CHECK = { ...INLINED_CHECK, function: "TChuuHana::dead", status: "dead", callers: [] };

const ORDERING_ENFORCE = { mode: "enforce" as const, gatedPaths: ["src/System/MarNameRefGen*.cpp"] };
const ORDERING_SHADOW = { mode: "shadow" as const, gatedPaths: ["src/System/MarNameRefGen*.cpp"] };

function scopeReport(verdict: "pass" | "reject") {
  return {
    identity: { base_rev: "head", patch_sha256: "p", readiness: {} },
    verdict,
    hunks: verdict === "reject"
      ? [{ file: "src/a.h", line: 1, class: "TBossEnemy", verdict: "not_ready", reason: "owner unit is a blank stub", owner_unit: "BossEnemy" }]
      : [{ file: "src/a.c", line: 1, class: "Own", verdict: "own_class", reason: "" }],
    warnings: [],
    limits: { foreign_headers: 0, foreign_header_lines: 0 },
  };
}

interface ScopeCall { args: string[]; overlay: Record<string, string>; unusedChecks: unknown }

function fakeScopeRunner(response: { exitCode: number; stdout: string; stderr?: string }) {
  const calls: ScopeCall[] = [];
  const runner = async (args: string[]) => {
    const overlayDir = args[args.indexOf("--overlay-dir") + 1];
    const overlay: Record<string, string> = {};
    const aPath = join(overlayDir ?? "", "src/a.c");
    if (overlayDir && existsSync(aPath)) overlay["src/a.c"] = readFileSync(aPath, "utf8");
    const unusedIndex = args.indexOf("--unused-checks");
    const unusedChecks = unusedIndex >= 0 ? JSON.parse(readFileSync(args[unusedIndex + 1]!, "utf8")) : null;
    calls.push({ args, overlay, unusedChecks });
    return { exitCode: response.exitCode, stdout: response.stdout, stderr: response.stderr ?? "" };
  };
  return { calls, runner };
}

function checkpointRow(store: StateStore, id = "integration-1"): Record<string, unknown> {
  return store.db.query("SELECT * FROM worker_checkpoints WHERE id = ?").get(`checkpoint-${id}`) as Record<string, unknown>;
}

async function setupRun(
  prefix: string,
  checkpointMetadata: Record<string, unknown> = {},
  options: { gameId?: string; configurationSnapshot?: Record<string, unknown> } = {},
) {
  const stateDir = tempDir(prefix);
  const store = openState(stateDir);
  const repo = setupRepo();
  const patchPath = patchFile(stateDir);
  const gameId = options.gameId ?? "test";
  seedRunHarness(store, gameId, "base-test", repo);
  const run = createRun(store, "matched_code_percent", 100, 1, { gameId }, {
    baseRevision: "base-test",
    ...(options.configurationSnapshot ? { configurationSnapshot: options.configurationSnapshot } : {}),
  });
  const jobId = insertQueued(store, patchPath, run.id, "integration-1", checkpointMetadata);
  store.db.query("UPDATE worker_checkpoints SET selected = 1 WHERE id = 'checkpoint-integration-1'").run();
  const leaseId = acquireLease(store, "run", run.id, gameId);
  return { stateDir, store, repo, run, jobId, leaseId };
}

describe("integration Evidence-Inlined trailers", () => {
  test("inlined UNUSED evidence becomes trailers after an unchanged subject", async () => {
    const { stateDir, store, repo, run, jobId, leaseId } = await setupRun("worker-integration-trailers-", { unused_checks: [INLINED_CHECK, DEAD_CHECK] });
    try {
      const result = await processWorkerOutputIntegrationQueue({ dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store });

      expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "clean_apply" });
      const subject = integrationCommitMessage({ id: jobId, targetKey: "unit::symbol", workerCheckpointId: "checkpoint-integration-1" });
      expect(git(repo, ["log", "-1", "--format=%s"])).toBe(subject);
      const expected = "Evidence-Inlined: TChuuHana::rolling -> TNerveChuuHanaRoll::execute (86.0% -> 45.0% when emptied)";
      expect(git(repo, ["log", "-1", "--format=%B"])).toBe(`${subject}\n\n${expected}`);
      expect(git(repo, ["log", "-1", "--format=%(trailers:key=Evidence-Inlined,valueonly)"]))
        .toBe("TChuuHana::rolling -> TNerveChuuHanaRoll::execute (86.0% -> 45.0% when emptied)");
      const parsed = Bun.spawnSync(["git", "interpret-trailers", "--parse"], { stdin: Buffer.from(git(repo, ["log", "-1", "--format=%B"])) });
      expect(parsed.stdout.toString().trim()).toBe(expected);
    } finally {
      store.db.close();
    }
  });

  test("no inlined evidence leaves the single-line message", async () => {
    const { stateDir, store, repo, run, leaseId } = await setupRun("worker-integration-no-trailers-", { unused_checks: [DEAD_CHECK] });
    try {
      await processWorkerOutputIntegrationQueue({ dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store });

      expect(git(repo, ["log", "-1", "--format=%B"])).toBe(git(repo, ["log", "-1", "--format=%s"]));
      expect(git(repo, ["log", "-1", "--format=%(trailers)"])).toBe("");
    } finally {
      store.db.close();
    }
  });

  test("content already captured by HEAD neither crashes nor adds an empty commit", async () => {
    const { stateDir, store, repo, run, leaseId } = await setupRun("worker-integration-trailers-race-", { unused_checks: [INLINED_CHECK] });
    try {
      let raced = false;
      const racingRunner: typeof runCommand = async (cwd, command, options) => {
        if (!raced && command[0] === "git" && command[1] === "commit") {
          raced = true;
          git(repo, ["add", "-A"]);
          git(repo, ["commit", "-m", "racing sweep captured applied content"]);
        }
        return runCommand(cwd, command, options);
      };

      const result = await processWorkerOutputIntegrationQueue({ commandRunner: racingRunner, dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store });

      expect(raced).toBe(true);
      expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "clean_apply" });
      expect(Number(git(repo, ["rev-list", "--count", "HEAD"]))).toBe(2);
      expect(git(repo, ["log", "-1", "--format=%s"])).toBe("racing sweep captured applied content");
      expect(result.headRev).toBe(git(repo, ["rev-parse", "HEAD"]));
    } finally {
      store.db.close();
    }
  });
});

describe("integration order-and-scope gate", () => {
  test("enforce rejects out of scope without touching HEAD, index or worktree", async () => {
    const { stateDir, store, repo, run, leaseId } = await setupRun("worker-integration-scope-reject-", { unused_checks: [INLINED_CHECK] });
    try {
      const head = git(repo, ["rev-parse", "HEAD"]);
      const fake = fakeScopeRunner({ exitCode: 0, stdout: JSON.stringify(scopeReport("reject")) });

      const result = await processWorkerOutputIntegrationQueue({
        dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store,
        ordering: ORDERING_ENFORCE, editScopeRunner: fake.runner,
      });

      expect(result.processed[0]).toMatchObject({ status: "rejected", disposition: "rejected_out_of_scope", integratedRev: null });
      expect(result.processed[0]?.failureReasons[0]).toContain("TBossEnemy (not_ready, owner BossEnemy)");
      expect(result.headRev).toBeNull();
      // The checker saw the patch over HEAD through the overlay, with the bound evidence.
      expect(fake.calls).toHaveLength(1);
      const args = fake.calls[0]!.args;
      expect(args.slice(0, 4)).toEqual(["check", "--repo", repo, "--base-rev"]);
      expect(args[4]).toBe(head);
      expect(fake.calls[0]!.overlay["src/a.c"]).toBe("int value = 1;\n");
      expect(fake.calls[0]!.unusedChecks).toEqual([INLINED_CHECK]);
      expect(args).toContain("--json");
      // The checker refuses to run without a policy: the integration gate always passes the game's.
      expect(args[args.indexOf("--policy-json") + 1]).toBe(JSON.stringify({ gatedPaths: ORDERING_ENFORCE.gatedPaths }));
      // No partial apply.
      expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
      expect(git(repo, ["status", "--porcelain"])).toBe("");
      expect(git(repo, ["diff", "--cached", "--name-only"])).toBe("");
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 0;\n");
      // Terminal, non-blocking, checkpoint deselected with the reason recorded.
      const row = integration(store);
      expect(row).toMatchObject({ status: "rejected", disposition: "rejected_out_of_scope" });
      expect(row.resolved_at).toBeTruthy();
      expect(JSON.parse(String(row.metadata_json)).edit_scope.verdict).toBe("reject");
      const checkpoint = checkpointRow(store);
      expect(Number(checkpoint.selected)).toBe(0);
      const checkpointMeta = JSON.parse(String(checkpoint.metadata_json));
      expect(checkpointMeta.integration_rejection.disposition).toBe("rejected_out_of_scope");
      expect(checkpointMeta.integration_rejection.reason).toContain("edit_scope:");
      expect(checkpointMeta.unused_checks).toEqual([INLINED_CHECK]);
      expect(blockingWorkerOutputIntegrationCount(store, run.id)).toBe(0);
      expect((store.db.query("SELECT status FROM jobs WHERE kind = 'integration'").get() as { status: string }).status).toBe("succeeded");
      const events = store.db.query("SELECT COUNT(*) n FROM events WHERE event_type = 'worker_integration_rejected'").get() as { n: number };
      expect(events.n).toBe(1);
      // The re-admitted target's next claim starts with the rejection reason and the fence instruction.
      const targetKey = String(row.target_key);
      const repair = outOfScopeReadmissionRepairRequest(store, run.id, targetKey)!;
      expect(repair).toMatchObject({ source: "integration_rejected_out_of_scope", rejected_output_id: String(row.id) });
      expect((repair.reasons as string[])[0]).toContain("TBossEnemy (not_ready, owner BossEnemy)");
      expect(String(repair.instruction)).toEndWith(EDIT_SCOPE_INSTRUCTION);
      expect(outOfScopeReadmissionRepairRequest(store, run.id, "other::target")).toBeNull();
    } finally {
      store.db.close();
    }
  });

  test("enforce fails closed when the checker cannot run", async () => {
    const { stateDir, store, repo, run, leaseId } = await setupRun("worker-integration-scope-error-");
    try {
      const fake = fakeScopeRunner({ exitCode: 2, stdout: "", stderr: "{\"error\":\"missing_objects\"}" });

      const result = await processWorkerOutputIntegrationQueue({
        dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store,
        ordering: ORDERING_ENFORCE, editScopeRunner: fake.runner,
      });

      expect(result.processed[0]).toMatchObject({ status: "rejected", disposition: "rejected_out_of_scope" });
      expect(result.processed[0]?.failureReasons[0]).toContain("could not run");
      expect(fake.calls[0]!.args).not.toContain("--unused-checks");
      expect(Number(git(repo, ["rev-list", "--count", "HEAD"]))).toBe(1);
      expect(Number(checkpointRow(store).selected)).toBe(0);
    } finally {
      store.db.close();
    }
  });

  test("shadow records the verdict and applies normally", async () => {
    const { stateDir, store, repo, run, leaseId } = await setupRun("worker-integration-scope-shadow-");
    try {
      const fake = fakeScopeRunner({ exitCode: 0, stdout: JSON.stringify(scopeReport("reject")) });

      const result = await processWorkerOutputIntegrationQueue({
        dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store,
        ordering: ORDERING_SHADOW, editScopeRunner: fake.runner,
      });

      expect(fake.calls).toHaveLength(1);
      expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "clean_apply" });
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 1;\n");
      expect(Number(git(repo, ["rev-list", "--count", "HEAD"]))).toBe(2);
      const scope = JSON.parse(String(integration(store).metadata_json)).edit_scope;
      expect(scope).toMatchObject({ mode: "shadow", verdict: "reject" });
      expect(scope.problem).toContain("TBossEnemy");
      expect(Number(checkpointRow(store).selected)).toBe(1);
    } finally {
      store.db.close();
    }
  });

  test("off never runs the checker: explicit null, or a resolved game without ordering (Melee)", async () => {
    for (const variant of [{ ordering: null }, { gameId: "melee" }] as const) {
      const { stateDir, store, repo, run, leaseId } = await setupRun("worker-integration-scope-off-", {}, "gameId" in variant ? { gameId: variant.gameId } : {});
      try {
        const fake = fakeScopeRunner({ exitCode: 0, stdout: JSON.stringify(scopeReport("reject")) });

        const result = await processWorkerOutputIntegrationQueue({
          dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store,
          ...("ordering" in variant ? { ordering: variant.ordering } : {}), editScopeRunner: fake.runner,
        });

        expect(fake.calls).toHaveLength(0);
        expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "clean_apply" });
        const metadata = JSON.parse(String(integration(store).metadata_json));
        expect(metadata.edit_scope).toBeUndefined();
        expect(metadata.ordering_unresolved).toBeUndefined();
      } finally {
        store.db.close();
      }
    }
  });

  test("an unresolved game descriptor records ordering_unresolved and applies when the run did not record enforce", async () => {
    // Game "test" has no descriptor, so the run's ordering policy is unknown.
    const { stateDir, store, repo, run, leaseId } = await setupRun("worker-integration-scope-unresolved-");
    try {
      const fake = fakeScopeRunner({ exitCode: 0, stdout: JSON.stringify(scopeReport("reject")) });

      const result = await processWorkerOutputIntegrationQueue({
        dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store, editScopeRunner: fake.runner,
      });

      expect(fake.calls).toHaveLength(0);
      expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "clean_apply" });
      expect(JSON.parse(String(integration(store).metadata_json)).ordering_unresolved).toContain("ordering_unresolved: the ordering policy of game test is unknown");
      expect(Number(git(repo, ["rev-list", "--count", "HEAD"]))).toBe(2);
    } finally {
      store.db.close();
    }
  });

  test("an unresolved game descriptor rejects when the run's stored configuration says enforce", async () => {
    const { stateDir, store, repo, run, leaseId } = await setupRun("worker-integration-scope-unresolved-enforce-", {}, {
      configurationSnapshot: { desired_workers: 1, goal_kind: "matched_code_percent", goal_value: 100, ordering: { mode: "enforce" } },
    });
    try {
      const head = git(repo, ["rev-parse", "HEAD"]);
      const fake = fakeScopeRunner({ exitCode: 0, stdout: JSON.stringify(scopeReport("pass")) });

      const result = await processWorkerOutputIntegrationQueue({
        dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store, editScopeRunner: fake.runner,
      });

      expect(fake.calls).toHaveLength(0);
      expect(result.processed[0]).toMatchObject({ status: "rejected", disposition: "rejected_out_of_scope" });
      expect(result.processed[0]?.failureReasons[0]).toContain("ordering_unresolved");
      expect(JSON.parse(String(integration(store).metadata_json)).ordering_unresolved).toContain("ordering_unresolved");
      expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
      expect(git(repo, ["status", "--porcelain"])).toBe("");
      expect(Number(checkpointRow(store).selected)).toBe(0);
      expect(blockingWorkerOutputIntegrationCount(store, run.id)).toBe(0);
    } finally {
      store.db.close();
    }
  });

  test("a crash between the rejection and job completion re-claims without re-applying", async () => {
    const { stateDir, store, repo, run, jobId, leaseId } = await setupRun("worker-integration-scope-crash-");
    try {
      const head = git(repo, ["rev-parse", "HEAD"]);
      const fake = fakeScopeRunner({ exitCode: 0, stdout: JSON.stringify(scopeReport("reject")) });
      const drain = () => processWorkerOutputIntegrationQueue({
        dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store,
        ordering: ORDERING_ENFORCE, editScopeRunner: fake.runner,
      });
      await drain();
      // The state a crash after the rejection transaction leaves behind: the
      // outcome is terminal but the job never completed and its lease expired.
      store.db.query("UPDATE jobs SET status = 'claimed', lease_expires_at = '2000-01-01T00:00:00.000Z' WHERE job_id = ?").run(jobId);
      expect(blockingWorkerOutputIntegrationCount(store, run.id)).toBe(1);

      const rerun = await drain();

      expect(rerun.processed[0]).toMatchObject({ status: "rejected", disposition: "rejected_out_of_scope", integratedRev: null });
      expect(fake.calls).toHaveLength(1);
      expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
      expect(git(repo, ["status", "--porcelain"])).toBe("");
      expect((store.db.query("SELECT status FROM jobs WHERE job_id = ?").get(jobId) as { status: string }).status).toBe("succeeded");
      expect(blockingWorkerOutputIntegrationCount(store, run.id)).toBe(0);
      const events = store.db.query("SELECT COUNT(*) n FROM events WHERE event_type = 'worker_integration_rejected'").get() as { n: number };
      expect(events.n).toBe(1);
      // Restart: a fresh store handle sees the same terminal state and nothing to drain.
      store.db.close();
      const reopened = openState(stateDir);
      try {
        const again = await processWorkerOutputIntegrationQueue({
          dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store: reopened,
          ordering: ORDERING_ENFORCE, editScopeRunner: fake.runner,
        });
        expect(again.processed).toHaveLength(0);
        expect(integration(reopened)).toMatchObject({ status: "rejected", disposition: "rejected_out_of_scope" });
      } finally {
        reopened.db.close();
      }
    } finally {
      try { store.db.close(); } catch { /* closed above */ }
    }
  });
});

describe("integration UNUSED certificates bind to unit content", () => {
  const PAD = Array.from({ length: 8 }, (_, index) => `/* pad ${index} */`);
  const baseText = ["int value = 0;", ...PAD, "int caller(void) { return 1; }", ""].join("\n");
  const certifiedText = ["int value = 1;", ...PAD, "int caller(void) { return 1; }", ""].join("\n");

  /** Claim base with a.c; the worker patch rewrites line 1; HEAD then moves by `move`. */
  async function setupMoved(prefix: string, move: (repo: string) => void) {
    const ctx = await setupRun(prefix);
    const { repo, stateDir, store } = ctx;
    writeFileSync(join(repo, "src/a.c"), baseText);
    git(repo, ["commit", "-am", "claim base"]);
    writeFileSync(join(repo, "src/a.c"), certifiedText);
    const patchPath = join(stateDir, "worker.patch");
    writeFileSync(patchPath, `${git(repo, ["diff"])}\n`);
    git(repo, ["checkout", "--", "src/a.c"]);
    move(repo);
    const certificate = {
      ...INLINED_CHECK,
      unit_inputs: ["src/a.c"],
      unit_inputs_sha256: unitInputsSha256([{ path: "src/a.c", text: certifiedText }]),
    };
    store.db.query("UPDATE worker_checkpoints SET metadata_json = ? WHERE id = 'checkpoint-integration-1'").run(JSON.stringify({ unused_checks: [certificate] }));
    return { ...ctx, certificate };
  }

  const unusedReject = {
    ...scopeReport("pass"),
    verdict: "reject",
    hunks: [{ file: "src/a.c", line: 1, class: null, verdict: "unused_unverified", reason: "UNUSED reconstruction without a bound inlined check" }],
  };

  test("a caller change in the same unit makes the certificate stale: withheld from the checker and rejected with re-certify", async () => {
    for (const response of [unusedReject, scopeReport("pass")]) {
      const { stateDir, store, repo, run, leaseId } = await setupMoved("worker-integration-unused-stale-", (r) => {
        writeFileSync(join(r, "src/a.c"), baseText.replace("return 1;", "return 2;"));
        git(r, ["commit", "-am", "another output changed the caller"]);
      });
      try {
        const head = git(repo, ["rev-parse", "HEAD"]);
        const fake = fakeScopeRunner({ exitCode: 0, stdout: JSON.stringify(response) });

        const result = await processWorkerOutputIntegrationQueue({
          dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store,
          ordering: ORDERING_ENFORCE, editScopeRunner: fake.runner,
        });

        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0]!.unusedChecks).toEqual([]);
        expect(result.processed[0]).toMatchObject({ status: "rejected", disposition: "rejected_out_of_scope" });
        expect(result.processed[0]?.failureReasons[0]).toContain("stale certificate for TChuuHana::rolling(void)");
        expect(result.processed[0]?.failureReasons[0]).toContain("Re-certify");
        expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
        expect(git(repo, ["status", "--porcelain"])).toBe("");
        const scope = JSON.parse(String(checkpointRow(store).metadata_json)).integration_rejection.edit_scope;
        expect(scope.unused_stale).toHaveLength(1);
        expect(scope.unused_stale[0].reason).toContain("re-certify");
      } finally {
        store.db.close();
      }
    }
  });

  test("HEAD moved by an unrelated unit keeps the certificate fresh and passes it to the checker", async () => {
    const { stateDir, store, repo, run, leaseId, certificate } = await setupMoved("worker-integration-unused-fresh-", (r) => {
      writeFileSync(join(r, "src/b.c"), "int other = 3;\n");
      git(r, ["add", "src/b.c"]);
      git(r, ["commit", "-m", "another output in a different unit"]);
    });
    try {
      const fake = fakeScopeRunner({ exitCode: 0, stdout: JSON.stringify(scopeReport("pass")) });

      const result = await processWorkerOutputIntegrationQueue({
        dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store,
        ordering: ORDERING_ENFORCE, editScopeRunner: fake.runner,
      });

      expect(fake.calls[0]!.unusedChecks).toEqual([certificate]);
      expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "clean_apply" });
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe(certifiedText);
      expect(JSON.parse(String(integration(store).metadata_json)).edit_scope.unused_stale).toEqual([]);
      expect(git(repo, ["log", "-1", "--format=%(trailers:key=Evidence-Inlined,valueonly)"])).toContain("TChuuHana::rolling -> TNerveChuuHanaRoll::execute");
    } finally {
      store.db.close();
    }
  });

  /** A certificate over the full dependency set: the patched source, an unpatched header H, and an absent path. */
  function withDependencies(store: StateStore, certificate: Record<string, unknown>) {
    const inputs = ["src/a.c", "src/a.h", "include/generated_missing.h"];
    const dependencyCertificate = {
      ...certificate,
      unit_inputs: inputs,
      unit_inputs_sha256: unitInputsSha256([
        { path: "src/a.c", text: certifiedText },
        { path: "src/a.h", text: "extern int value;\n" },
        { path: "include/generated_missing.h", text: null },
      ]),
    };
    store.db.query("UPDATE worker_checkpoints SET metadata_json = ? WHERE id = 'checkpoint-integration-1'").run(JSON.stringify({ unused_checks: [dependencyCertificate] }));
    return dependencyCertificate;
  }

  test("a header the certified patch did not change, changed later in HEAD, makes the certificate stale", async () => {
    const { stateDir, store, repo, run, leaseId, certificate } = await setupMoved("worker-integration-unused-header-stale-", (r) => {
      writeFileSync(join(r, "src/a.h"), "extern int value;\nextern int caller(void);\n");
      git(r, ["commit", "-am", "another output changed the header"]);
    });
    try {
      withDependencies(store, certificate);
      const head = git(repo, ["rev-parse", "HEAD"]);
      const fake = fakeScopeRunner({ exitCode: 0, stdout: JSON.stringify(scopeReport("pass")) });

      const result = await processWorkerOutputIntegrationQueue({
        dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store,
        ordering: ORDERING_ENFORCE, editScopeRunner: fake.runner,
      });

      expect(fake.calls[0]!.unusedChecks).toEqual([]);
      expect(result.processed[0]).toMatchObject({ status: "rejected", disposition: "rejected_out_of_scope" });
      expect(result.processed[0]?.failureReasons[0]).toContain("src/a.h");
      expect(result.processed[0]?.failureReasons[0]).toContain("re-certify");
      expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
      expect(git(repo, ["status", "--porcelain"])).toBe("");
    } finally {
      store.db.close();
    }
  });

  test("unchanged dependencies (patched source from the overlay, header from HEAD, absent path) stay fresh", async () => {
    const { stateDir, store, repo, run, leaseId, certificate } = await setupMoved("worker-integration-unused-header-fresh-", (r) => {
      writeFileSync(join(r, "src/b.c"), "int other = 3;\n");
      git(r, ["add", "src/b.c"]);
      git(r, ["commit", "-m", "another output in a different unit"]);
    });
    try {
      const dependencyCertificate = withDependencies(store, certificate);
      const fake = fakeScopeRunner({ exitCode: 0, stdout: JSON.stringify(scopeReport("pass")) });

      const result = await processWorkerOutputIntegrationQueue({
        dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store,
        ordering: ORDERING_ENFORCE, editScopeRunner: fake.runner,
      });

      expect(fake.calls[0]!.unusedChecks).toEqual([dependencyCertificate]);
      expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "clean_apply" });
    } finally {
      store.db.close();
    }
  });
});

describe("integration records landed content freshness for rollback-only targets", () => {
  const claimed = ["int value = 0;", ...Array.from({ length: 12 }, (_, index) => `// context ${index}`), "int f(void) { return 1; }", ""].join("\n");
  const newerF = claimed.replace("return 1;", "return 2;");

  async function setupRollbackLanding() {
    // A later enforced own-target pass, with no unverified_match certification.
    const ctx = await setupRun("worker-integration-rollback-content-", {
      runner_validation: {
        status: "passed",
        steering: {
          mode: "enforce", error: null, artifactPath: null, durationMs: 1,
          decision: {
            attempt: "pass", reasons: [], removable_noncosmetic: [], probes: [], violations: [], unused_checks: [], order_checks: [],
            functions: [{
              unit: "unit", name: "symbol", decision: "pass", semantic: "clean", analysis: "complete", audit_label: "clean",
              match: { base: 90, candidate: 100, real_only: 100 }, groups: ["g1"],
            }],
            units: [{ unit: "unit", built: true, compared: true }],
          },
        },
      },
    });
    const { store, repo, stateDir, run } = ctx;
    writeFileSync(join(repo, "src/a.c"), claimed);
    git(repo, ["commit", "-qam", "claim base"]);
    const claimBaseRev = git(repo, ["rev-parse", "HEAD"]);
    writeFileSync(join(repo, "src/a.c"), claimed.replace("value = 0", "value = 1"));
    writeFileSync(join(stateDir, "worker.patch"), `${git(repo, ["diff"])}\n`);
    writeFileSync(join(repo, "src/a.c"), claimed);
    store.db.query(`
      INSERT INTO epoch_targets (id, epoch_id, run_id, target_key, unit, symbol, source_path, size, baseline_score, priority, admission_index, status, admitted_at)
      VALUES ('target-1', 'epoch-1', ?, 'unit::symbol', 'unit', 'symbol', 'src/a.c', 16, 90, 1, 0, 'claimed', '2026-08-10T00:00:00.000Z')
    `).run(run.id);
    store.db.query(`
      INSERT INTO target_claims (id, run_id, epoch_id, epoch_target_id, worker_id, base_rev, status, claimed_at)
      VALUES ('claim-1', ?, 'epoch-1', 'target-1', 'worker-1', ?, 'active', '2026-08-10T00:00:00.000Z')
    `).run(run.id, claimBaseRev);
    const rollbackId = recordSteeringRollback(store, {
      gameId: "test", unit: "unit", symbol: "symbol", analyzedRev: claimBaseRev, baseRev: claimBaseRev,
      initialVerdict: "steering_located", finalVerdict: "pass", rules: ["steering"], report: {}, status: "reverified",
    });
    store.db.query("UPDATE steering_rollbacks SET recorded_at = ?, updated_at = ? WHERE id = ?")
      .run("2026-08-10T00:00:00.000Z", "2026-08-10T00:00:00.000Z", rollbackId);
    store.db.query("UPDATE worker_checkpoints SET new_score = 100, exact_match = 1 WHERE id = 'checkpoint-integration-1'").run();
    return { ...ctx, claimBaseRev };
  }

  test("non-overlapping committed, staged and unstaged source edits land but have stale evidence; unchanged source stays fresh", async () => {
    for (const change of ["none", "commit", "staged", "unstaged", "other-file"] as const) {
      const { store, repo, stateDir, run, leaseId, claimBaseRev } = await setupRollbackLanding();
      try {
        if (change === "commit" || change === "staged" || change === "unstaged") writeFileSync(join(repo, "src/a.c"), newerF);
        if (change === "commit") git(repo, ["commit", "-qam", "intervening non-overlapping f edit"]);
        if (change === "staged") git(repo, ["add", "src/a.c"]);
        if (change === "other-file") {
          writeFileSync(join(repo, "src/a.h"), "extern int value;\nextern int other;\n");
          git(repo, ["commit", "-qam", "unrelated header edit"]);
        }
        const preApplyRev = git(repo, ["rev-parse", "HEAD"]);
        const result = await processWorkerOutputIntegrationQueue({ dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store, ordering: null });
        const fresh = change === "none" || change === "other-file";
        const landed = (fresh ? claimed : newerF).replace("value = 0", "value = 1");
        expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "clean_apply" });
        expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe(landed);
        const head = git(repo, ["rev-parse", "HEAD"]);
        const metadata = JSON.parse(String(integration(store).metadata_json));
        expect(metadata.steering_content_freshness).toEqual({
          fresh, target_key: "unit::symbol", source_path: "src/a.c", claim_base_rev: claimBaseRev,
          pre_apply_rev: preApplyRev, integrated_rev: head,
          ...(!fresh ? { reason: "src/a.c differs from the claim base before the apply" } : {}),
        });
        expect(metadata).toMatchObject({ pre_apply_rev: preApplyRev, integrated_rev: head });
        expect(checkpointRow(store).new_score).toBe(100);
        expect(activeUnverifiedMatch(store, { gameId: "test", unit: "unit", symbol: "symbol" })).toBeNull();
      } finally {
        store.db.close();
      }
    }
  }, 30_000);

  test("a working-tree restoration cannot hide changed committed source at the accepted pre-apply revision", async () => {
    const { store, repo, stateDir, run, leaseId, claimBaseRev } = await setupRollbackLanding();
    try {
      writeFileSync(join(repo, "src/a.c"), newerF);
      git(repo, ["commit", "-qam", "intervening f edit"]);
      const preApplyRev = git(repo, ["rev-parse", "HEAD"]);
      // The whole file on disk equals the claim base, but HEAD still has the intervening edit.
      writeFileSync(join(repo, "src/a.c"), claimed);
      const result = await processWorkerOutputIntegrationQueue({ dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store, ordering: null });
      expect(result.processed[0]?.status).toBe("applied");
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe(claimed.replace("value = 0", "value = 1"));
      expect(JSON.parse(String(integration(store).metadata_json)).steering_content_freshness).toEqual({
        fresh: false, target_key: "unit::symbol", source_path: "src/a.c", claim_base_rev: claimBaseRev,
        pre_apply_rev: preApplyRev, integrated_rev: git(repo, ["rev-parse", "HEAD"]),
        reason: "src/a.c changed between the claim base and the pre-apply revision",
      });
    } finally {
      store.db.close();
    }
  });

  test("missing immutable claim base or source at that base records stale evidence without rejecting the apply", async () => {
    for (const missing of ["claim-base", "source-at-base"] as const) {
      const { store, repo, stateDir, run, leaseId } = await setupRollbackLanding();
      try {
        const claimBaseRev = missing === "claim-base" ? null : git(repo, ["rev-parse", "HEAD"]);
        store.db.query("UPDATE target_claims SET base_rev = ? WHERE id = 'claim-1'").run(claimBaseRev);
        if (missing === "source-at-base") store.db.query("UPDATE epoch_targets SET source_path = 'src/missing.c' WHERE id = 'target-1'").run();
        const preApplyRev = git(repo, ["rev-parse", "HEAD"]);
        const result = await processWorkerOutputIntegrationQueue({ dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store, ordering: null });
        expect(result.processed[0]?.status).toBe("applied");
        expect(JSON.parse(String(integration(store).metadata_json)).steering_content_freshness).toEqual({
          fresh: false, target_key: "unit::symbol", source_path: missing === "claim-base" ? "src/a.c" : "src/missing.c", claim_base_rev: claimBaseRev,
          pre_apply_rev: preApplyRev, integrated_rev: git(repo, ["rev-parse", "HEAD"]),
          reason: missing === "claim-base" ? "the target claim has no usable base revision" : `src/missing.c is not in the claim base ${claimBaseRev}`,
        });
      } finally {
        store.db.close();
      }
    }
  });
});

describe("integration clears a certified unverified_match", () => {
  // insertQueued's target key is `unit::symbol`.
  const target = { gameId: "test", unit: "unit", symbol: "symbol" };
  const certified = {
    [UNVERIFIED_MATCH_CERTIFICATION_KEY]: {
      kind: "unverified_match", game_id: "test", unit: "unit", symbol: "symbol", mode: "enforce", decision: "pass", base_rev: "base-test", artifact_path: null,
    },
  };

  function markUnverified(store: StateStore): void {
    recordUnverifiedMatch(store, { ...target, analyzedRev: "analyzed", baseRev: "base-test", sourcePath: "src/a.c", match: { base: 96, candidate: 100, real_only: 98 }, reasons: ["IR oracle failed for the unit"] });
  }

  // The checkpoint's certification, with what the worker recorded about its claim (`claim_base_rev`).
  function certify(store: StateStore, extra: Record<string, unknown>): void {
    store.db.query("UPDATE worker_checkpoints SET metadata_json = ? WHERE id = 'checkpoint-integration-1'")
      .run(JSON.stringify({ [UNVERIFIED_MATCH_CERTIFICATION_KEY]: { ...certified[UNVERIFIED_MATCH_CERTIFICATION_KEY], ...extra } }));
  }

  function unverifiedRow(store: StateStore): Record<string, unknown> {
    return store.db.query("SELECT * FROM steering_unverified_matches WHERE game_id = 'test' AND unit = 'unit' AND symbol = 'symbol'").get() as Record<string, unknown>;
  }

  function clearedBy(store: StateStore): unknown {
    return unverifiedRow(store).cleared_by;
  }

  // An approved widening on the claim makes its integration a blame candidate
  // of the epoch confirmation pass.
  function widenClaim(store: StateStore, runId: string): void {
    store.db.query(
      `INSERT INTO write_set_widenings (id, run_id, epoch_id, target_claim_id, worker_state_id, attempt_index, category, rung, status, created_at)
       VALUES ('widening-1', ?, 'epoch-1', 'claim-1', 'worker-1', 0, 'header', 1, 'approved', '2026-08-11T00:00:00.000Z')`,
    ).run(runId);
  }

  // The live revert settlement performs: reverse-apply the blamed patch and commit.
  function revertIn(repo: string): ConfirmationPassDeps["revertLive"] {
    return async (candidate) => {
      git(repo, ["apply", "--reverse", candidate.patchPath!]);
      git(repo, ["commit", "-am", "confirmation: revert"]);
      return { ok: true, revision: git(repo, ["rev-parse", "HEAD"]) };
    };
  }

  // The epoch confirmation pass on a dirty global whose probe blames the widened integration.
  function confirmDirtyEpoch(store: StateStore, runId: string, revertLive: ConfirmationPassDeps["revertLive"]) {
    return runConfirmationPass({
      enabled: true,
      store,
      runId,
      global: { clean: false, buildId: "epoch-build", reportPath: "/reports/dirty.json", regressionPaths: ["src/a.c"] },
      deps: { probeWithout: async () => true, revertLive, now: () => "2026-08-12T00:00:00.000Z" },
    });
  }

  test("a clean apply of the certified checkpoint clears the target's row", async () => {
    const { stateDir, store, repo, run, leaseId } = await setupRun("worker-integration-unverified-", certified);
    try {
      markUnverified(store);
      certify(store, { claim_base_rev: git(repo, ["rev-parse", "HEAD"]) });
      const result = await processWorkerOutputIntegrationQueue({ dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store, ordering: null });
      expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "clean_apply" });
      expect(activeUnverifiedMatch(store, target)).toBeNull();
      expect(clearedBy(store)).toBe(`integration:${result.processed[0]!.id}`);
      // The certifying revision is the integration commit: saved revisions before it stay held.
      expect(unverifiedRow(store).cleared_rev).toBe(git(repo, ["rev-parse", "HEAD"]));
    } finally {
      store.db.close();
    }
  });

  test("the clear holds only while the certification's base is the row's current trusted base or an ancestor of it", async () => {
    const cases = [
      // The backfill at H measured from B marked the target; a pass measured from H treats B..H as trusted.
      { name: "later base", certifiedAt: "H", rowAt: "B", cleared: false },
      { name: "base git cannot place", certifiedAt: "unknown", rowAt: "B", cleared: false },
      // Re-based since the checkpoint to an older trusted base: the certification no longer covers the row.
      { name: "row re-based to an ancestor since the checkpoint", certifiedAt: "B", rowAt: "A", cleared: false },
      { name: "ancestor of the row's base", certifiedAt: "B", rowAt: "H", cleared: true },
    ] as const;
    const outcomes = [];
    for (const { name, certifiedAt, rowAt } of cases) {
      const { stateDir, store, repo, run, leaseId } = await setupRun("worker-integration-unverified-base-", certified);
      try {
        // A (the repo's baseline) -> B -> H, each touching only the header the patch leaves alone.
        const revs: Record<string, string> = { A: git(repo, ["rev-parse", "HEAD"]), unknown: "0000000000000000000000000000000000000000" };
        for (const [rev, text] of [["B", "extern int value; /* B */\n"], ["H", "extern int value; /* H */\n"]] as const) {
          writeFileSync(join(repo, "src/a.h"), text);
          git(repo, ["commit", "-qam", rev]);
          revs[rev] = git(repo, ["rev-parse", "HEAD"]);
        }
        // The worker claimed at H; only the trusted base its target-only run used varies.
        certify(store, { base_rev: revs[certifiedAt], claim_base_rev: revs.H });
        recordUnverifiedMatch(store, { ...target, analyzedRev: revs.H!, baseRev: revs[rowAt], sourcePath: "src/a.c", match: { base: 96, candidate: 100, real_only: 98 }, reasons: ["IR oracle failed for the unit"] });
        const result = await processWorkerOutputIntegrationQueue({ dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store, ordering: null });
        outcomes.push({
          name,
          status: result.processed[0]?.status,
          cleared: activeUnverifiedMatch(store, target) === null,
          clearedBy: clearedBy(store) ?? null,
          rowBase: unverifiedRow(store).base_rev === revs[rowAt],
        });
      } finally {
        store.db.close();
      }
    }
    expect(outcomes.map(({ clearedBy: by, ...outcome }) => ({ ...outcome, clearedByIntegration: typeof by === "string" && by.startsWith("integration:") })))
      .toEqual(cases.map(({ name, cleared }) => ({ name, status: "applied", cleared, clearedByIntegration: cleared, rowBase: true })));
  });

  test("the clear needs the target's whole source to be the claim base's when the patch lands", async () => {
    // f is far from the patched line: every edit below applies cleanly beside the patch.
    const claimed = ["int value = 0;", "", "", "", "", "", "", "int f(void) { return 1; }", ""].join("\n");
    const newerF = claimed.replace("return 1;", "return 2;");
    const contextPatch = ["diff --git a/src/a.c b/src/a.c", "--- a/src/a.c", "+++ b/src/a.c", "@@ -1,4 +1,4 @@", "-int value = 0;", "+int value = 1;", " ", " ", " ", ""].join("\n");
    const cases = [
      { name: "unchanged since the claim", change: "none", cleared: true },
      // Another integration changed f without touching the patch; a backfill re-recorded it from the same base.
      { name: "non-overlapping commit, re-recorded", change: "commit", cleared: false },
      { name: "staged edit", change: "staged", cleared: false },
      { name: "unstaged edit", change: "unstaged", cleared: false },
      { name: "no claim base in the certification", change: "no-claim-base", cleared: false },
    ] as const;
    const outcomes = [];
    for (const { name, change } of cases) {
      const { stateDir, store, repo, run, leaseId } = await setupRun("worker-integration-unverified-fresh-", certified);
      try {
        writeFileSync(join(repo, "src/a.c"), claimed);
        git(repo, ["commit", "-qam", "claim base"]);
        writeFileSync(join(stateDir, "worker.patch"), contextPatch);
        markUnverified(store);
        certify(store, change === "no-claim-base" ? {} : { claim_base_rev: git(repo, ["rev-parse", "HEAD"]) });
        if (change !== "none" && change !== "no-claim-base") writeFileSync(join(repo, "src/a.c"), newerF);
        if (change === "staged") git(repo, ["add", "src/a.c"]);
        if (change === "commit") {
          git(repo, ["commit", "-qam", "newer f"]);
          recordUnverifiedMatch(store, { ...target, analyzedRev: git(repo, ["rev-parse", "HEAD"]), baseRev: "base-test", sourcePath: "src/a.c", match: { base: 96, candidate: 100, real_only: 98 }, reasons: ["IR oracle failed for the unit"] });
        }
        const result = await processWorkerOutputIntegrationQueue({ dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store, ordering: null });
        outcomes.push({
          name,
          status: result.processed[0]?.status,
          landed: readFileSync(join(repo, "src/a.c"), "utf8") === (change === "none" || change === "no-claim-base" ? claimed : newerF).replace("value = 0", "value = 1"),
          cleared: activeUnverifiedMatch(store, target) === null,
        });
      } finally {
        store.db.close();
      }
    }
    expect(outcomes).toEqual(cases.map(({ name, cleared }) => ({ name, status: "applied", landed: true, cleared })));
  });

  test("a conflicting certified output, or a clean apply without the certification, keeps the row", async () => {
    const conflict = await setupRun("worker-integration-unverified-conflict-", certified);
    try {
      markUnverified(conflict.store);
      writeFileSync(join(conflict.repo, "src/a.c"), "int value = 2;\n");
      git(conflict.repo, ["commit", "-am", "current side"]);
      const result = await processWorkerOutputIntegrationQueue({ dryRun: false, leaseId: conflict.leaseId, repoRoot: conflict.repo, runId: conflict.run.id, stateDir: conflict.stateDir, store: conflict.store, ordering: null });
      expect(result.processed[0]).toMatchObject({ status: "conflict" });
      expect(activeUnverifiedMatch(conflict.store, target)).not.toBeNull();
    } finally {
      conflict.store.db.close();
    }

    const uncertified = await setupRun("worker-integration-unverified-plain-");
    try {
      markUnverified(uncertified.store);
      const result = await processWorkerOutputIntegrationQueue({ dryRun: false, leaseId: uncertified.leaseId, repoRoot: uncertified.repo, runId: uncertified.run.id, stateDir: uncertified.stateDir, store: uncertified.store, ordering: null });
      expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "clean_apply" });
      expect(activeUnverifiedMatch(uncertified.store, target)).not.toBeNull();
    } finally {
      uncertified.store.db.close();
    }
  });

  test("the epoch revert of the clearing integration makes the row active again, as recorded", async () => {
    const { stateDir, store, repo, run, leaseId } = await setupRun("worker-integration-unverified-revert-", certified);
    try {
      markUnverified(store);
      certify(store, { claim_base_rev: git(repo, ["rev-parse", "HEAD"]) });
      const recorded = unverifiedRow(store);
      const applied = await processWorkerOutputIntegrationQueue({ dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store, ordering: null });
      const integrationId = applied.processed[0]!.id;
      expect(clearedBy(store)).toBe(`integration:${integrationId}`);
      widenClaim(store, run.id);

      // Blamed, but the code could not be rolled back: the accepted version stands.
      const unreverted = await confirmDirtyEpoch(store, run.id, async () => ({ ok: false, error: "reverse apply check failed" }));
      expect(unreverted.status).toBe("unattributed");
      expect(activeUnverifiedMatch(store, target)).toBeNull();

      const reverted = await confirmDirtyEpoch(store, run.id, revertIn(repo));
      expect(reverted).toMatchObject({ status: "regressed", regressedId: integrationId });
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 0;\n");
      expect(unverifiedRow(store)).toEqual(recorded);
      expect(activeUnverifiedMatch(store, target)?.match.candidate).toBe(100);
    } finally {
      store.db.close();
    }
  });

  test("the epoch revert leaves rows another pass cleared, or re-recorded and certified since, cleared", async () => {
    const { stateDir, store, repo, run, leaseId } = await setupRun("worker-integration-unverified-revert-scope-", certified);
    try {
      markUnverified(store);
      certify(store, { claim_base_rev: git(repo, ["rev-parse", "HEAD"]) });
      const other = { ...target, symbol: "other" };
      recordUnverifiedMatch(store, { ...other, analyzedRev: "analyzed", match: { base: 50, candidate: 100, real_only: null }, reasons: ["no steering located"] });
      expect(clearUnverifiedMatch(store, { ...other, clearedBy: "integration:another-integration" })).toBeTrue();
      const applied = await processWorkerOutputIntegrationQueue({ dryRun: false, leaseId, repoRoot: repo, runId: run.id, stateDir, store, ordering: null });
      expect(clearedBy(store)).toBe(`integration:${applied.processed[0]!.id}`);
      // Since the apply, a backfill re-recorded the target and a certified unit passed it.
      recordUnverifiedMatch(store, { ...target, analyzedRev: "rescanned", match: { base: 96, candidate: 100, real_only: 100 }, reasons: ["IR oracle failed for the unit"] });
      expect(clearUnverifiedMatch(store, { ...target, clearedBy: "backfill:rev-2" })).toBeTrue();
      widenClaim(store, run.id);

      const reverted = await confirmDirtyEpoch(store, run.id, revertIn(repo));
      expect(reverted.status).toBe("regressed");
      expect(clearedBy(store)).toBe("backfill:rev-2");
      expect(listUnverifiedMatches(store, "test")).toEqual([]);
    } finally {
      store.db.close();
    }
  });
});
