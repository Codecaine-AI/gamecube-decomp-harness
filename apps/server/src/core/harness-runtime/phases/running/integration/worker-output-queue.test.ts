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
