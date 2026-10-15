import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";
import { createRun, openState, startSchedulerEpoch, type StateStore } from "@server/core/harness-runtime/run-state";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import type { HarnessDraftPrPublishResult } from "@server/core/harness-runtime/phases/running/epochs/harness-draft-pr.js";
import { unitInputsSha256 } from "@server/core/validation/edit-scope/unused-evidence.js";
import { runEpochBoundary, type EpochBoundaryParams } from "./epoch-boundary.js";

// Order-and-scope fence: `scope_refused` publications are unpublished and retried, never terminal.
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function git(repoRoot: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

const ORDERING = { mode: "enforce", gatedPaths: ["src/*"] } as const;

function readyFixture() {
  const dir = mkdtempSync(join(tmpdir(), "epoch-boundary-scope-"));
  tempDirs.push(dir);
  const repoRoot = resolve(dir, "repo");
  const stateDir = resolve(dir, "state");
  mkdirSync(resolve(repoRoot, "build/GALE01"), { recursive: true });
  writeFileSync(resolve(repoRoot, "build/GALE01/report.json"), `${JSON.stringify({ measures: { matched_code_percent: 0 }, units: [] })}\n`);
  const store = openState(stateDir);
  seedRunHarness(store, "test", "base-test", repoRoot);
  const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test", repoRoot }, { baseRevision: "base-test" });
  const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
  git(repoRoot, ["init"]);
  git(repoRoot, ["config", "user.email", "epoch@example.invalid"]);
  git(repoRoot, ["config", "user.name", "Epoch test"]);
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "initial"]);
  const base = git(repoRoot, ["rev-parse", "HEAD"]);
  // Two integrations on the branch, each carrying an UNUSED certificate; b's
  // unit changes afterwards, so its certificate is stale at the PR head.
  const commit = (path: string, text: string) => {
    mkdirSync(resolve(repoRoot, "src"), { recursive: true });
    writeFileSync(resolve(repoRoot, path), text);
    git(repoRoot, ["add", path]);
    git(repoRoot, ["commit", "-m", path]);
    return git(repoRoot, ["rev-parse", "HEAD"]);
  };
  const certificate = (fn: string, path: string, text: string) => ({
    unit: "unit", file: path, function: fn, status: "inlined", changed: [], unit_inputs: [path], unit_inputs_sha256: unitInputsSha256([{ path, text }]),
  });
  const integrate = (id: string, integratedRev: string, checks: unknown[]) => {
    const now = new Date().toISOString();
    store.db.query(`INSERT INTO worker_checkpoints (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id, attempt_index, validation_time, validation_status, metadata_json)
      VALUES (?, ?, ?, 'e', 't', ?, 1, ?, 'passed', ?)`).run(id, `ws-${id}`, run.id, `claim-${id}`, now, JSON.stringify({ unused_checks: checks }));
    store.db.query(`INSERT INTO integration_outcomes (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id, worker_checkpoint_id, status, metadata_json, created_at, updated_at)
      VALUES (?, ?, 'e', 't', ?, ?, ?, 'applied', ?, ?, ?)`).run(`io-${id}`, run.id, `claim-${id}`, `ws-${id}`, id, JSON.stringify({ integrated_rev: integratedRev }), now, now);
  };
  integrate("cp-a", commit("src/a.cpp", "a\n"), [certificate("TFoo::a", "src/a.cpp", "a\n")]);
  integrate("cp-b", commit("src/b.cpp", "b\n"), [certificate("TBar::b", "src/b.cpp", "b\n")]);
  integrate("cp-off", "f".repeat(40), [certificate("TOff::c", "src/a.cpp", "a\n")]);
  const head = commit("src/b.cpp", "b changed\n");
  const initial = getHarnessState(store.db, "test")!;
  transitionHarnessState(store.db, { gameId: "test", expectedRevision: initial.identity.revision, commandId: "ready",
    patch: { source: { head, upstream_revision: head }, readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" },
      execution: { desired: "run", workflow: "run", status: "active" }, history: { run_id: run.id } } });
  const globals: GlobalArgs = {
    repoRoot, stateDir, dryRunAgents: false, gameId: "test", provider: "test", model: "test", thinkingLevel: "low",
    game: { gameId: "test", baseRef: base, matching: {}, ordering: ORDERING, validation: { reportPath: "build/GALE01/report.json" } } as never,
  };
  return { dir, store, globals, runId: run.id, epochId: epoch.id, head };
}

/** Every publication passes the re-validated evidence file, bound to the published head. */
function expectUnusedEvidence(input: Record<string, unknown>, head: string): void {
  expect(input.commitSha).toBe(head);
  const path = input.unusedChecksPath as string;
  expect(path).toContain(`pr_unused_checks_${head}.json`);
  const file = JSON.parse(readFileSync(path, "utf8"));
  expect(file.head).toBe(head);
  expect(file.unused_checks.map((check: { function: string }) => check.function)).toEqual(["TFoo::a"]);
  expect(input.unusedChecksStale).toEqual([expect.stringContaining("stale certificate for TBar::b")]);
}

type Fixture = ReturnType<typeof readyFixture>;

function params(value: Fixture, dependencies: EpochBoundaryParams["dependencies"]): EpochBoundaryParams {
  return {
    store: value.store,
    globals: value.globals,
    args: new Map(),
    runId: value.runId,
    leaseId: `lease-${value.runId}`,
    trigger: "test boundary",
    schedulerEpochId: value.epochId,
    epochOrdinal: 1,
    config: {
      epochConfigureCommand: "true",
      epochLinkPaths: [],
      epochPauseThreshold: 12,
      epochRequeueLimit: 32,
      harnessDraftPrEnabled: true,
      ciParityEnabled: false,
      preCommitGateEnabled: false,
      preCommitAutofixEnabled: false,
      boundarySyncEnabled: false,
      breakageGateEnabled: false,
      boundaryBuildFixerEnabled: true,
      fullKgMaintenanceMode: "skip",
      writeSetFlags: { writeSetWidening: "off" },
      schedulerEpochConfig: { workerPoolSize: 1, freshReportGate: false },
      graphDbPath: resolve(value.dir, "missing-graph.sqlite"),
      epochWorktreeDir: resolve(value.dir, "epoch-worktree"),
      boundaryRetry: { enabled: true, maxAttempts: 5, baseMs: 120_000, maxMs: 1_800_000 },
    },
    reportKnowledgeProgress: () => () => {},
    dependencies,
  };
}

function refused(head: string): HarnessDraftPrPublishResult {
  return {
    baseBranch: "master", baseRef: "origin/master", commitSha: head, created: false, runId: "run", title: "t",
    status: "scope_refused", reason: "edit_scope: TFoo (not_ready, owner unit_b) at src/a.cpp:3",
    scopeCheck: {
      mode: "enforce", headSha: head, baseRef: "origin/master", unusedChecksPath: null, artifactPath: null, durationMs: 1, verdict: "reject",
      problem: "edit_scope: TFoo (not_ready, owner unit_b) at src/a.cpp:3", error: null,
      rejected_hunks: [{ file: "src/a.cpp", line: 3, class: "TFoo", verdict: "not_ready", reason: "" }],
      warnings: ["split suggested: TBar"], pr_size: null, same_pr_prerequisites: ["TBar"],
    },
  };
}

function publishEvents(store: StateStore): Record<string, unknown>[] {
  return (store.db.query("SELECT payload_json FROM events WHERE event_type = 'draft_pr_publish' ORDER BY rowid").all() as { payload_json: string }[])
    .map((row) => JSON.parse(row.payload_json));
}

describe("epoch boundary publication under the order-and-scope fence", () => {
  test("settlement branch records scope_refused as unpublished, then recovery retries until published", async () => {
    const value = readyFixture();
    const outcomes: HarnessDraftPrPublishResult["status"][] = ["scope_refused", "updated"];
    const inputs: Record<string, unknown>[] = [];
    let admissions = 0;
    try {
      const sync = async () => {
        const current = getHarnessState(value.store.db, "test")!;
        transitionHarnessState(value.store.db, { gameId: "test", expectedRevision: current.identity.revision, commandId: `sync-${Date.now()}-${Math.random()}`,
          patch: { execution: { workflow: "none", status: "idle", blockers: [] } },
          boundary: { eventId: `sync-${Math.random()}`, kind: "sync_completed", outcome: "no_source_change", epochId: value.epochId } });
        return { changed: false, headSha: value.head, plan: { drifted: false } } as never;
      };
      const publishHarnessDraftPr = async (input: Record<string, unknown>) => {
        inputs.push(input);
        const status = outcomes.shift() ?? "updated";
        return status === "scope_refused" ? refused(value.head) : ({ status, commitSha: value.head } as never);
      };
      const first = await runEpochBoundary(params(value, {
        reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
        runEpochSettlement: async () => ({ commitSha: value.head, label: "epoch-1", matchedCodePercent: 90, qaGate: null, regressions: { regressedFunctions: 0 },
          repair: { paused: false, requeued: 0, reasons: [] }, savePointId: "save", durationMs: 1, worktreeDir: value.dir, artifactDir: value.dir, scoreDelta: 0,
          savePointEvidence: { status: "recorded", savePointId: "save", artifactPaths: [], commitSha: value.head } }) as never,
        runBoundarySync: sync,
        publishHarnessDraftPr: publishHarnessDraftPr as never,
        ensureSchedulerEpochFromBoard: (() => {
          if (++admissions === 1) throw new Error("Epoch admission refused");
          return { epoch: { id: "next" }, progress: { ordinal: 2, admitted: 0, available: 0 } };
        }) as never,
      }));
      expect(first.ok).toBe(false);
      expect(inputs).toHaveLength(1);
      expect(inputs[0]!.ordering).toEqual(ORDERING);
      expectUnusedEvidence(inputs[0]!, value.head);
      expect(publishEvents(value.store).at(-1)).toMatchObject({
        status: "skipped", reason: "scope_refused", head_sha: value.head,
        scope_problem: expect.stringContaining("TFoo"),
        scope_check: { mode: "enforce", verdict: "reject", warnings: ["split suggested: TBar"] },
      });

      // Recovery (pending integration attempt completed): scope_refused is not "published", so it reruns.
      const recovery = params(value, {
        runBoundarySync: sync,
        reconcilePendingIntegrationAttempt: () => ({ status: "completed", completed: { epochId: value.epochId, commitSha: value.head, attempt: 1 } }) as never,
        publishHarnessDraftPr: publishHarnessDraftPr as never,
        ensureSchedulerEpochFromBoard: (() => ({ epoch: { id: "next" }, progress: { ordinal: 2, admitted: 0, available: 0 } })) as never,
      });
      const retry = await runEpochBoundary(recovery);
      expect(retry.error).toBeUndefined();
      expect(inputs).toHaveLength(2);
      expect(inputs[1]!.ordering).toEqual(ORDERING);
      expectUnusedEvidence(inputs[1]!, value.head);
      expect(publishEvents(value.store).at(-1)).toMatchObject({ status: "finished", head_sha: value.head });

      value.store.db.run("UPDATE events SET created_at = ? WHERE run_id = ?", [new Date().toISOString(), value.runId]);
      expect((await runEpochBoundary(recovery)).error).toBeUndefined();
      expect(inputs).toHaveLength(2);
    } finally { value.store.db.close(); }
  });

  test("recovery branch records scope_refused and retries it on the next recovery", async () => {
    const value = readyFixture();
    const outcomes: HarnessDraftPrPublishResult["status"][] = ["scope_refused", "scope_refused", "updated"];
    let publishes = 0;
    try {
      const recovery = params(value, {
        runBoundarySync: async () => ({ changed: false, headSha: value.head, plan: { drifted: false } }) as never,
        reconcilePendingIntegrationAttempt: () => ({ status: "completed", completed: { epochId: value.epochId, commitSha: value.head, attempt: 1 } }) as never,
        publishHarnessDraftPr: (async () => {
          publishes++;
          const status = outcomes.shift() ?? "updated";
          return status === "scope_refused" ? refused(value.head) : { status, commitSha: value.head };
        }) as never,
        ensureSchedulerEpochFromBoard: (() => ({ epoch: { id: "next" }, progress: { ordinal: 2, admitted: 0, available: 0 } })) as never,
      });
      for (const expected of [1, 2, 3]) {
        value.store.db.run("UPDATE events SET created_at = ? WHERE run_id = ?", [new Date().toISOString(), value.runId]);
        const outcome = await runEpochBoundary(recovery);
        expect(outcome.error).toBeUndefined();
        expect(outcome.reconciled).toBe(true);
        expect(publishes).toBe(expected);
      }
      const statuses = publishEvents(value.store).map((event) => `${event.status}:${event.reason ?? ""}`);
      expect(statuses).toEqual(["skipped:scope_refused", "skipped:scope_refused", "finished:"]);
      value.store.db.run("UPDATE events SET created_at = ? WHERE run_id = ?", [new Date().toISOString(), value.runId]);
      expect((await runEpochBoundary(recovery)).error).toBeUndefined();
      expect(publishes).toBe(3);
    } finally { value.store.db.close(); }
  });
});
