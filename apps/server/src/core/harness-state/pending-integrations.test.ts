import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { createRun, startSchedulerEpoch } from "@server/core/harness-runtime/run-state";
import { eventsForSubject } from "@server/core/harness-state/events.js";
import { initializeHarnessState, transitionHarnessState, getHarnessState, getHarnessTimeline } from "@server/core/harness-state/state.js";
import { canonicalHarnessSessionId, activeHarnessSessionId } from "./session.js";
import { recordEpochCompleted } from "./epoch-integration.js";
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
  runId: string;
  epochId: string;
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
  initializeHarnessState(store.db, { gameId: "melee", harnessId: "harness-1", worktree: repoRoot,
    configurationRevision: "config-1", commandId: "initialize" });
  transitionHarnessState(store.db, { gameId: "melee", expectedRevision: 0, commandId: "initial-sync",
    patch: { source: { head: parentSha } } });
  const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "melee", repoRoot }, {
    baseRevision: parentSha,
  });
  const epoch = startSchedulerEpoch(store, run.id, {
    workerPoolSize: 1,
  });
  return { store, repoRoot, branch, parentSha, runId: run.id, epochId: epoch.id };
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("pending epoch integrations", () => {
  test("uses one exact stable trailer and persists pre-commit identity", () => {
    const { store, branch, parentSha, runId, epochId } = fixture();
    expect(epochIntegrationMarker(epochId)).toBe(`Epoch-Integration: ${epochId}`);
    expect(epochIntegrationCommitMessage(`epoch(${runId}): checkpoint`, epochId)).toBe(
      `epoch(${runId}): checkpoint\n\nEpoch-Integration: ${epochId}`,
    );

    preparePendingIntegration(store, {
      runId,
      epochId,
      branch,
      parentSha,
      createdAt: "2026-08-12T12:02:00.000Z",
    });
    expect(listPendingIntegrations(store)).toEqual([
      {
        runId,
        epochId,
        branch,
        parentSha,
        messageMarker: `Epoch-Integration: ${epochId}`,
        createdAt: "2026-08-12T12:02:00.000Z",
        attempt: 1,
        status: "prepared",
        failureReason: null,
        failedAt: null,
      },
    ]);
  });

  test("preparation is idempotent and advances only a retained failed attempt", () => {
    const { store, branch, parentSha, runId, epochId } = fixture();
    const first = preparePendingIntegration(store, {
      runId,
      epochId,
      branch,
      parentSha,
    });
    expect(preparePendingIntegration(store, {
      runId,
      epochId,
      branch,
      parentSha,
    })).toEqual(first);
    expect(() => preparePendingIntegration(store, {
      runId,
      epochId,
      branch,
      parentSha: "f".repeat(40),
    })).toThrow("different git identity");

    recordPendingIntegrationFailure(store, {
      runId,
      epochId,
      attempt: 1,
      reason: "known git commit failure",
      occurredAt: "2026-08-12T12:02:30.000Z",
    });
    const retry = preparePendingIntegration(store, {
      runId,
      epochId,
      branch,
      parentSha,
      createdAt: "2026-08-12T12:03:00.000Z",
    });
    expect(retry).toMatchObject({ attempt: 2, status: "prepared", failureReason: null, failedAt: null });
  });

  test("live epoch finalization deletes its prepare row in the lineage transaction", () => {
    const { store, repoRoot, branch, parentSha, runId, epochId } = fixture();
    preparePendingIntegration(store, { runId, epochId, branch, parentSha });
    git(repoRoot, [
      "-c",
      "user.name=Pending Integration Test",
      "-c",
      "user.email=pending@example.invalid",
      "commit",
      "--allow-empty",
      "-qm",
      epochIntegrationCommitMessage("epoch boundary", epochId),
    ]);
    const integrationCommit = git(repoRoot, ["rev-parse", "HEAD"]);

    recordEpochCompleted(store, {
      gameId: "melee",
      epochId,
      runId,
      integrationCommit,
      commandId: "command-epoch-live",
      correlationId: runId,
      actor: "runner",
    });

    expect(listPendingIntegrations(store)).toEqual([]);
    expect(getHarnessTimeline(store.db, "melee")[0]?.evidence).toMatchObject({
      integration_commit: integrationCommit,
    });
  });

  test("reconciliation finds the marker and advances lineage to the later branch tip", () => {
    const { store, repoRoot, branch, parentSha, runId, epochId } = fixture();
    preparePendingIntegration(store, { runId, epochId, branch, parentSha });
    git(repoRoot, [
      "-c",
      "user.name=Pending Integration Test",
      "-c",
      "user.email=pending@example.invalid",
      "commit",
      "--allow-empty",
      "-qm",
      epochIntegrationCommitMessage("epoch boundary", epochId),
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
      .query("UPDATE epochs SET status = 'error', boundary_status = 'error', closed_at = ? WHERE id = ?")
      .run("2026-08-12T12:02:30.000Z", epochId);

    expect(reconcilePendingIntegrations(store, { now: "2026-08-12T12:03:00.000Z" })).toEqual({
      completed: [{ runId, epochId, commitSha: branchTip, attempt: 1 }],
    });

    expect(listPendingIntegrations(store)).toEqual([]);
    expect(store.db.query("SELECT status, boundary_status, closed_at FROM epochs WHERE id = ?").get(epochId)).toEqual({
      status: "error",
      boundary_status: "error",
      closed_at: "2026-08-12T12:02:30.000Z",
    });
    expect(getHarnessTimeline(store.db, "melee")[0]?.evidence).toMatchObject({
      epoch_id: epochId,
      integration_commit: branchTip,
      new_head: branchTip,
    });
    expect(eventsForSubject(store.db, "run", runId).at(-1)?.eventType).toBe("run.epoch_integrated");
    expect(store.db.query("SELECT head_revision FROM runs WHERE id = ?").get(runId)).toEqual({
      head_revision: branchTip,
    });
  });

  test("epoch retry reconciles a retained late commit instead of creating a colliding attempt", () => {
    const { store, repoRoot, branch, parentSha, runId, epochId } = fixture();
    preparePendingIntegration(store, { runId, epochId, branch, parentSha });
    git(repoRoot, [
      "-c",
      "user.name=Pending Integration Test",
      "-c",
      "user.email=pending@example.invalid",
      "commit",
      "--allow-empty",
      "-qm",
      epochIntegrationCommitMessage("epoch boundary before late failure", epochId),
    ]);
    const commitSha = git(repoRoot, ["rev-parse", "HEAD"]);
    store.db
      .query("UPDATE epochs SET status = 'error', boundary_status = 'error', closed_at = ? WHERE id = ?")
      .run("2026-08-12T12:03:00.000Z", epochId);

    expect(reconcilePendingIntegrationAttempt(store, {
      runId,
      epochId,
      now: "2026-08-12T12:04:00.000Z",
    })).toEqual({
      status: "completed",
      completed: { runId, epochId, commitSha, attempt: 1 },
    });
    expect(listPendingIntegrations(store)).toEqual([]);
    expect(store.db.query("SELECT status, boundary_status FROM epochs WHERE id = ?").get(epochId)).toEqual({
      status: "error",
      boundary_status: "error",
    });
    expect(getHarnessTimeline(store.db, "melee")).toHaveLength(1);
    expect(eventsForSubject(store.db, "run", runId).filter((event) => event.eventType === "run.epoch_integrated")).toHaveLength(1);
  });

  test("git failure evidence and its failed boundary survive a process crash", () => {
    const { store, branch, parentSha, runId, epochId } = fixture();
    preparePendingIntegration(store, { runId, epochId, branch, parentSha });

    recordPendingIntegrationFailure(store, {
      runId,
      epochId,
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
        epochId,
        runId,
        attempt: 1,
        status: "failed",
        failureReason: "epoch integration git commit failed: simulated crash",
        failedAt: "2026-08-12T12:04:00.000Z",
      }),
    ]);
    expect(reopened.db.query("SELECT status, boundary_status, closed_at FROM epochs WHERE id = ?").get(epochId)).toEqual({
      status: "error",
      boundary_status: "integration_commit_failed",
      closed_at: "2026-08-12T12:04:00.000Z",
    });
    expect(getHarnessTimeline(reopened.db, "melee")).toEqual([]);
    expect(eventsForSubject(reopened.db, "run", runId).filter((event) => event.eventType === "run.epoch_integrated")).toEqual([]);
    expect(preparePendingIntegration(reopened, {
      runId,
      epochId,
      branch,
      parentSha,
    })).toMatchObject({ attempt: 2, status: "prepared" });
  });

  test("missing commit reconciliation retains failed attempt evidence", () => {
    const { store, branch, parentSha, runId, epochId } = fixture();
    preparePendingIntegration(store, { runId, epochId, branch, parentSha });

    expect(() =>
      reconcilePendingIntegrations(store, { runId, now: "2026-08-12T12:04:00.000Z" }),
    ).toThrow(`Pending integration commit not found for run ${runId}, epoch ${epochId}`);
    expect(listPendingIntegrations(store)).toEqual([
      expect.objectContaining({ epochId, attempt: 1, status: "failed" }),
    ]);
  });
});

describe("harness epoch integration", () => {
  test("reconciles without any cycle and retains one immutable boundary on replay", () => {
    const { store, repoRoot, branch, parentSha, runId, epochId } = fixture();
    expect(activeHarnessSessionId(store.db, "melee")).toBe("harness-1");
    expect(store.db.query("SELECT name FROM sqlite_schema WHERE name = 'cycles'").get()).toBeNull();
    expect((store.db.query("PRAGMA table_info(runs)").all() as Array<{ name: string }>).some(column => column.name === "cycle_uuid")).toBe(false);
    expect(canonicalHarnessSessionId({ db: store.db, gameId: "melee", fallback: "fallback" })).toBe("harness-1");
    preparePendingIntegration(store, { runId, epochId, branch, parentSha });
    git(repoRoot, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", epochIntegrationCommitMessage("checkpoint", epochId)]);
    const commitSha = git(repoRoot, ["rev-parse", "HEAD"]);
    expect(reconcilePendingIntegrations(store).completed).toEqual([{ runId, epochId, commitSha, attempt: 1 }]);
    expect(listPendingIntegrations(store)).toEqual([]);
    expect(getHarnessState(store.db, "melee")?.source.head).toBe(commitSha);
    expect(store.db.query("SELECT head_revision FROM runs WHERE id = ?").get(runId)).toEqual({ head_revision: commitSha });
    recordEpochCompleted(store, { gameId: "melee", runId, epochId, integrationCommit: commitSha,
      commandId: "replay", correlationId: runId, actor: "runner" });
    expect(getHarnessTimeline(store.db, "melee")).toHaveLength(1);
    expect(() => recordEpochCompleted(store, { gameId: "melee", runId, epochId, integrationCommit: parentSha,
      commandId: "conflicting-replay", correlationId: runId, actor: "runner" })).toThrow("different run or integration commit");
    expect(getHarnessState(store.db, "melee")?.source.head).toBe(commitSha);
  });

  test("rejects another game's boundary before writing state", () => {
    const { store, parentSha, runId, epochId } = fixture();
    expect(() => recordEpochCompleted(store, { gameId: "other", runId, epochId, integrationCommit: parentSha,
      commandId: "wrong-game", correlationId: runId, actor: "runner" })).toThrow("does not belong");
    expect(getHarnessTimeline(store.db, "melee")).toEqual([]);
  });
});

test("missing commits roll back head, event, and pending integration acceptance", () => {
  const { store, branch, parentSha, runId, epochId } = fixture();
  preparePendingIntegration(store, { runId, epochId, branch, parentSha });
  const before = getHarnessState(store.db, "melee");
  expect(() => recordEpochCompleted(store, { gameId: "melee", runId, epochId,
    integrationCommit: "f".repeat(40), commandId: "missing-commit", correlationId: runId, actor: "runner" })).toThrow("does not exist");
  expect(getHarnessState(store.db, "melee")).toEqual(before);
  expect(getHarnessTimeline(store.db, "melee")).toEqual([]);
  expect(listPendingIntegrations(store)).toHaveLength(1);
  expect(eventsForSubject(store.db, "run", runId).filter(event => event.eventType === "run.epoch_integrated")).toEqual([]);
});

test("session identity never resolves ownership from another game", () => {
  const { store } = fixture();
  expect(activeHarnessSessionId(store.db, "unknown")).toBeNull();
  expect(canonicalHarnessSessionId({ db: store.db, gameId: "unknown", fallback: "explicit-operation" })).toBe("explicit-operation");
  expect(activeHarnessSessionId(store.db, " melee ")).toBe("harness-1");
});
