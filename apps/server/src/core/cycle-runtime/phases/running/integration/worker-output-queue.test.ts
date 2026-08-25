import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { initializeHarnessState, releaseDispatch, requestDispatch, StaleLeaseError } from "@server/core/harness-state";
import { createRun } from "@server/core/cycle-runtime/run-state";
import { enqueueWorkerOutputIntegration } from "@server/core/cycle-runtime/run-state/worker-output-integration.js";
import { runCommand } from "@server/infrastructure/shell";
import { processWorkerOutputIntegrationQueue } from "./worker-output-queue.js";

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
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test User"]);
  git(repo, ["add", "src/a.c"]);
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

function insertQueued(store: StateStore, patchPath: string, runId: string, id = "integration-1"): string {
  const checkpointId = `checkpoint-${id}`;
  store.db
    .query(
      `
        INSERT INTO worker_checkpoints (
          id, worker_state_id, run_id, epoch_id, epoch_target_id,
          target_claim_id, attempt_index, validation_time, hard_gates_passed,
          validation_status, validation_state, patch_path, diff_path, write_set_json
        ) VALUES (?, 'worker-1', ?, 'epoch-1', 'target-1', 'claim-1', 0,
                  '2026-08-11T00:00:00.000Z', 1, 'passed', 'tentative', ?, ?, '["src/a.c"]')
      `,
    )
    .run(checkpointId, runId, patchPath, patchPath);
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

function acquireLease(store: StateStore, kind: "pr" | "run", workflowId: string): string {
  initializeHarnessState(store, { gameId: "test", traceId: "trace-test" });
  const decision = requestDispatch(store, {
    actor: "operator",
    commandId: `command-${kind}-${workflowId}`,
    correlationId: workflowId,
    kind,
    gameId: "test",
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

  test("a racing sweep that captures the applied content is success, not a silent revert", async () => {
    const stateDir = tempDir("worker-integration-race-state-");
    const store = openState(stateDir);
    try {
      const repo = setupRepo();
      const patchPath = patchFile(stateDir);
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

  test("a stale lease cannot claim or mutate queued checkout work", async () => {
    const stateDir = tempDir("worker-integration-stale-lease-state-");
    const store = openState(stateDir);
    try {
      const repo = setupRepo();
      const patchPath = patchFile(stateDir);
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
