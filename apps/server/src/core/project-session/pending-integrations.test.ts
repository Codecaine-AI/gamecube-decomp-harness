import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { eventsForSubject } from "@server/core/project-state/events.js";
import { createProjectSession } from "./store.js";
import { listSessionTimeline, recordEpochCompleted } from "./timeline.js";
import {
  epochIntegrationCommitMessage,
  epochIntegrationMarker,
  listPendingIntegrations,
  preparePendingIntegration,
  reconcilePendingIntegrationAttempt,
  reconcilePendingIntegrations,
  recordPendingIntegrationFailure,
} from "./pending-integrations.js";

const stores: StateStore[] = [];
const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function git(repoRoot: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr) || new TextDecoder().decode(result.stdout));
  }
  return new TextDecoder().decode(result.stdout).trim();
}

function fixture(): {
  store: StateStore;
  repoRoot: string;
  branch: string;
  parentSha: string;
} {
  const stateDir = tempDir("pending-integrations-state-");
  const repoRoot = tempDir("pending-integrations-repo-");
  git(repoRoot, ["init", "-q"]);
  git(repoRoot, [
    "-c",
    "user.name=Pending Integration Test",
    "-c",
    "user.email=pending@example.invalid",
    "commit",
    "--allow-empty",
    "-qm",
    "baseline",
  ]);
  const parentSha = git(repoRoot, ["rev-parse", "HEAD"]);
  const branch = git(repoRoot, ["branch", "--show-current"]);
  const store = openState(stateDir);
  stores.push(store);
  store.db
    .query(
      `INSERT INTO runs (
         id, goal_kind, goal_value, desired_workers, status, created_at,
         project_id, project_repo_root, session_uuid, head_revision
       ) VALUES (
         'run-1', 'matched_code_percent', 100, 1, 'active', '2026-08-12T12:00:00.000Z',
         'melee', ?, 'session-1', ?
       )`,
    )
    .run(repoRoot, parentSha);
  createProjectSession(store.db, {
    projectId: "melee",
    sessionUuid: "session-1",
    id: "project-session:session-1",
    baseSha: parentSha,
    activeRunId: "run-1",
    correlationId: "run-1",
    commandId: "command-session-open",
    openingSyncId: "sync-open-1",
    traceId: "trace-session-1",
    worktreeIdentity: repoRoot,
    now: "2026-08-12T12:00:00.000Z",
  });
  store.db
    .query(
      `INSERT INTO epochs (
         id, run_id, ordinal, size_mode, worker_pool_size, candidate_window,
         status, routing_summary_json, created_at
       ) VALUES ('epoch-1', 'run-1', 1, 'fixed', 1, 1, 'active', '{}', ?)`,
    )
    .run("2026-08-12T12:01:00.000Z");
  return { store, repoRoot, branch, parentSha };
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("pending epoch integrations", () => {
  test("uses one exact stable trailer and persists pre-commit identity", () => {
    const { store, branch, parentSha } = fixture();
    expect(epochIntegrationMarker("epoch-1")).toBe("Epoch-Integration: epoch-1");
    expect(epochIntegrationCommitMessage("epoch(run-1): checkpoint", "epoch-1")).toBe(
      "epoch(run-1): checkpoint\n\nEpoch-Integration: epoch-1",
    );

    preparePendingIntegration(store, {
      runId: "run-1",
      epochId: "epoch-1",
      branch,
      parentSha,
      createdAt: "2026-08-12T12:02:00.000Z",
    });
    expect(listPendingIntegrations(store)).toEqual([
      {
        runId: "run-1",
        epochId: "epoch-1",
        branch,
        parentSha,
        messageMarker: "Epoch-Integration: epoch-1",
        createdAt: "2026-08-12T12:02:00.000Z",
        attempt: 1,
        status: "prepared",
        failureReason: null,
        failedAt: null,
      },
    ]);
  });

  test("preparation is idempotent and advances only a retained failed attempt", () => {
    const { store, branch, parentSha } = fixture();
    const first = preparePendingIntegration(store, {
      runId: "run-1",
      epochId: "epoch-1",
      branch,
      parentSha,
    });
    expect(preparePendingIntegration(store, {
      runId: "run-1",
      epochId: "epoch-1",
      branch,
      parentSha,
    })).toEqual(first);
    expect(() => preparePendingIntegration(store, {
      runId: "run-1",
      epochId: "epoch-1",
      branch,
      parentSha: "f".repeat(40),
    })).toThrow("different git identity");

    recordPendingIntegrationFailure(store, {
      runId: "run-1",
      epochId: "epoch-1",
      attempt: 1,
      reason: "known git commit failure",
      occurredAt: "2026-08-12T12:02:30.000Z",
    });
    const retry = preparePendingIntegration(store, {
      runId: "run-1",
      epochId: "epoch-1",
      branch,
      parentSha,
      createdAt: "2026-08-12T12:03:00.000Z",
    });
    expect(retry).toMatchObject({ attempt: 2, status: "prepared", failureReason: null, failedAt: null });
  });

  test("live epoch finalization deletes its prepare row in the lineage transaction", () => {
    const { store, repoRoot, branch, parentSha } = fixture();
    preparePendingIntegration(store, { runId: "run-1", epochId: "epoch-1", branch, parentSha });
    git(repoRoot, [
      "-c",
      "user.name=Pending Integration Test",
      "-c",
      "user.email=pending@example.invalid",
      "commit",
      "--allow-empty",
      "-qm",
      epochIntegrationCommitMessage("epoch boundary", "epoch-1"),
    ]);
    const integrationCommit = git(repoRoot, ["rev-parse", "HEAD"]);

    recordEpochCompleted(store, {
      projectId: "melee",
      epochId: "epoch-1",
      runId: "run-1",
      integrationCommit,
      commandId: "command-epoch-live",
      actor: "runner",
    });

    expect(listPendingIntegrations(store)).toEqual([]);
    expect(listSessionTimeline(store.db, "session-1")[0]?.payload).toMatchObject({
      integration_commit: integrationCommit,
    });
  });

  test("reconciliation finds the marker and advances lineage to the later branch tip", () => {
    const { store, repoRoot, branch, parentSha } = fixture();
    preparePendingIntegration(store, { runId: "run-1", epochId: "epoch-1", branch, parentSha });
    git(repoRoot, [
      "-c",
      "user.name=Pending Integration Test",
      "-c",
      "user.email=pending@example.invalid",
      "commit",
      "--allow-empty",
      "-qm",
      epochIntegrationCommitMessage("epoch boundary", "epoch-1"),
    ]);
    const markedCommit = git(repoRoot, ["rev-parse", "HEAD"]);
    git(repoRoot, [
      "-c",
      "user.name=Pending Integration Test",
      "-c",
      "user.email=pending@example.invalid",
      "commit",
      "--allow-empty",
      "-qm",
      "confirmation adjustment",
    ]);
    const branchTip = git(repoRoot, ["rev-parse", "HEAD"]);
    expect(branchTip).not.toBe(markedCommit);
    store.db
      .query("UPDATE epochs SET status = 'error', boundary_status = 'error', closed_at = ? WHERE id = 'epoch-1'")
      .run("2026-08-12T12:02:30.000Z");

    expect(reconcilePendingIntegrations(store, { now: "2026-08-12T12:03:00.000Z" })).toEqual({
      completed: [{ runId: "run-1", epochId: "epoch-1", commitSha: branchTip }],
    });

    expect(listPendingIntegrations(store)).toEqual([]);
    expect(store.db.query("SELECT status, boundary_status, closed_at FROM epochs WHERE id = 'epoch-1'").get()).toEqual({
      status: "completed",
      boundary_status: "success",
      closed_at: "2026-08-12T12:02:30.000Z",
    });
    expect(listSessionTimeline(store.db, "session-1")[0]?.payload).toMatchObject({
      epoch_id: "epoch-1",
      integration_commit: branchTip,
      new_head: branchTip,
    });
    expect(eventsForSubject(store.db, "run", "run-1").at(-1)?.eventType).toBe("run.epoch_integrated");
    expect(store.db.query("SELECT head_revision FROM runs WHERE id = 'run-1'").get()).toEqual({
      head_revision: branchTip,
    });
  });

  test("epoch retry reconciles a retained late commit instead of creating a colliding attempt", () => {
    const { store, repoRoot, branch, parentSha } = fixture();
    preparePendingIntegration(store, { runId: "run-1", epochId: "epoch-1", branch, parentSha });
    git(repoRoot, [
      "-c",
      "user.name=Pending Integration Test",
      "-c",
      "user.email=pending@example.invalid",
      "commit",
      "--allow-empty",
      "-qm",
      epochIntegrationCommitMessage("epoch boundary before late failure", "epoch-1"),
    ]);
    const commitSha = git(repoRoot, ["rev-parse", "HEAD"]);
    store.db
      .query("UPDATE epochs SET status = 'error', boundary_status = 'error', closed_at = ? WHERE id = 'epoch-1'")
      .run("2026-08-12T12:03:00.000Z");

    expect(reconcilePendingIntegrationAttempt(store, {
      runId: "run-1",
      epochId: "epoch-1",
      now: "2026-08-12T12:04:00.000Z",
    })).toEqual({
      status: "completed",
      completed: { runId: "run-1", epochId: "epoch-1", commitSha },
    });
    expect(listPendingIntegrations(store)).toEqual([]);
    expect(store.db.query("SELECT status, boundary_status FROM epochs WHERE id = 'epoch-1'").get()).toEqual({
      status: "completed",
      boundary_status: "success",
    });
    expect(listSessionTimeline(store.db, "session-1")).toHaveLength(1);
    expect(eventsForSubject(store.db, "run", "run-1").filter((event) => event.eventType === "run.epoch_integrated")).toHaveLength(1);
  });

  test("git failure evidence and its failed boundary survive a process crash", () => {
    const { store, branch, parentSha } = fixture();
    preparePendingIntegration(store, { runId: "run-1", epochId: "epoch-1", branch, parentSha });

    recordPendingIntegrationFailure(store, {
      runId: "run-1",
      epochId: "epoch-1",
      attempt: 1,
      reason: "epoch integration git commit failed: simulated crash",
      occurredAt: "2026-08-12T12:04:00.000Z",
    });
    const stateDir = store.stateDir;
    store.db.close();
    stores.splice(stores.indexOf(store), 1);
    const reopened = openState(stateDir);
    stores.push(reopened);

    expect(listPendingIntegrations(reopened)).toEqual([
      expect.objectContaining({
        epochId: "epoch-1",
        runId: "run-1",
        attempt: 1,
        status: "failed",
        failureReason: "epoch integration git commit failed: simulated crash",
        failedAt: "2026-08-12T12:04:00.000Z",
      }),
    ]);
    expect(reopened.db.query("SELECT status, boundary_status, closed_at FROM epochs WHERE id = 'epoch-1'").get()).toEqual({
      status: "error",
      boundary_status: "integration_commit_failed",
      closed_at: "2026-08-12T12:04:00.000Z",
    });
    expect(listSessionTimeline(reopened.db, "session-1")).toEqual([]);
    expect(eventsForSubject(reopened.db, "run", "run-1")).toEqual([]);
    expect(preparePendingIntegration(reopened, {
      runId: "run-1",
      epochId: "epoch-1",
      branch,
      parentSha,
    })).toMatchObject({ attempt: 2, status: "prepared" });
  });

  test("missing commit reconciliation retains failed attempt evidence", () => {
    const { store, branch, parentSha } = fixture();
    preparePendingIntegration(store, { runId: "run-1", epochId: "epoch-1", branch, parentSha });

    expect(() =>
      reconcilePendingIntegrations(store, { runId: "run-1", now: "2026-08-12T12:04:00.000Z" }),
    ).toThrow("Pending integration commit not found for run run-1, epoch epoch-1");
    expect(listPendingIntegrations(store)).toEqual([
      expect.objectContaining({ epochId: "epoch-1", attempt: 1, status: "failed" }),
    ]);
  });
});
