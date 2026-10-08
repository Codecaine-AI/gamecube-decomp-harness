/**
 * Temp git repo + temp orchestrator store for accepted-advisory tests (plan
 * §6.10, §7.1). The repo plays the harness checkout: an upstream base commit,
 * then worker changes integrated one commit each (apply-on-accept). The store
 * holds one harness run.
 *
 * Acceptance goes through the production L1 enforce path: the attempt's
 * qa_diff.patch (shaped by `rewriteNoIndexDiffPaths`), the real L1 scan, the
 * deferred validation, `buildLlmReviewCandidate`, `adjudicateAdvisories`
 * against a temp node kernel with the kernel's fakes, then
 * `recordWorkerCheckpoint` and `recordAcceptedAdvisories`. Only the
 * integration outcome (status and `metadata.integrated_rev`, as the
 * integration queue records it) is seeded directly.
 *
 * Scans go through `runQaScanDiff` with the real review_lint scanner and the
 * real global standards, run locally (never remote builds), so line numbers,
 * the 240-character excerpt, and `detail` are exactly what L1, L2, and the
 * epoch scan see.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  adjudicateAdvisories,
  buildLlmReviewCandidate,
  type AdvisoryAdjudication,
} from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication";
import { disableNetwork, fakeOk } from "@agent-kernel/kernel/model-nodes/testing";
import {
  bool,
  createAdjudicationHarness,
  extractionAnswer,
  type AdjudicationHarness,
} from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/__fixtures__/adjudication.js";
import {
  applyQaLintToValidation,
  qaLintAdvisoryPartition,
  qaLintFromInvocation,
  rewriteNoIndexDiffPaths,
  type WorkerChangeValidation,
} from "@server/core/agent-catalog/agents/running/worker/change-validation";
import { recordWorkerCheckpoint } from "@server/core/harness-runtime/run-state/worker-state.js";
import { createRun } from "@server/core/harness-runtime/run-state/runs.js";
import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";
import { recordAcceptedAdvisories } from "@server/core/harness-runtime/phases/running/workers/worker-cycle.js";
import { packageRoot } from "@server/core/knowledge";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { runQaScanDiff, type QaScanFinding, type QaScanInvocation, type QaScanProcessRunner, type RunQaScanDiffOptions } from "../scan-diff.js";

export const ADVISORY_FILE = "src/melee/gm/gmadvisory.c";

/** A `type_erasing_cast` line longer than the scanner's 240-character excerpt. */
export const LONG_CAST_LINE =
  "    data = (u8*) gmAdvisory_ResolveFighterEntityTableEntryForTheCurrentlyActiveSlot(gobj, slot, GMADVISORY_KIND_PRIMARY, " +
  "GMADVISORY_FLAG_NONE) + gmAdvisory_ComputeTheOffsetIntoTheAnimationTableForThisEntry(slot, GMADVISORY_TABLE_BASE, GMADVISORY_TABLE_STRIDE, GMADVISORY_TABLE_TAIL);";

/** The upstream version of the advisory file: the accepted line is inserted after `gmAdvisory_Prepare`. */
export const UPSTREAM_ADVISORY_SOURCE = [
  "void gmAdvisory_Init(void) {}",
  "",
  "void gmAdvisory_Load(HSD_GObj* gobj, s32 slot)",
  "{",
  "    u8* data = NULL;",
  "    s32 count = 0;",
  "    s32 limit = 4;",
  "",
  "    gmAdvisory_Prepare(gobj, slot);",
  "    gmAdvisory_Store(gobj, data, count, limit);",
  "}",
  "",
].join("\n");

export const ADVISORY_PREPARE_LINE = "    gmAdvisory_Prepare(gobj, slot);";

/** The worker's version: the long cast line kept right after `gmAdvisory_Prepare` (line 10). */
export const ACCEPTED_ADVISORY_SOURCE = UPSTREAM_ADVISORY_SOURCE.replace(
  `${ADVISORY_PREPARE_LINE}\n`,
  `${ADVISORY_PREPARE_LINE}\n${LONG_CAST_LINE}\n`,
);

export const ADVISORY_JUSTIFICATION = "MWCC emits lbz r0 only through the u8 cast; objdiff 98.1% -> 100%.";

/** The worker's final note keeps the cast; the fake extraction maps it to finding A1. */
export const KEPT_ADVISORY_NOTE = JSON.stringify({
  status: "validation_ready",
  summary: "typed the table load through the cast the original binary needs",
  kept_advisories: [{ rule_id: "type_erasing_cast", file: ADVISORY_FILE, line: 10, justification: ADVISORY_JUSTIFICATION }],
});

export interface L1Acceptance {
  /** The id recordWorkerCheckpoint gave the attempt's checkpoint. */
  checkpointId: string;
  patchText: string;
  /** The L1 (worker surface, diff-file) scan of the attempt's patch. */
  l1Findings: QaScanFinding[];
  /** The enforce validation before adjudication (advisoryGate "pending" for an advisory-only scan). */
  validation: WorkerChangeValidation;
  adjudication: AdvisoryAdjudication;
  /** What recordAcceptedAdvisories wrote. */
  acceptedFingerprints: string[];
}

export interface WorkerChangeResult extends L1Acceptance {
  integratedRev: string;
}

export interface AdvisoryRepo {
  root: string;
  repoRoot: string;
  stateDir: string;
  store: StateStore;
  runId: string;
  /** The upstream base every L2 and epoch scan diffs against. */
  baseRev: string;
  git(...args: string[]): string;
  head(): string;
  read(rel: string): string;
  write(rel: string, text: string): void;
  /** Stage everything and commit; returns the new HEAD. */
  commit(message: string): string;
  /** A worker attempt's qa_diff.patch for `rel` going from `before` to `after`, built the way L1 builds it. */
  workerPatch(rel: string, before: string, after: string): string;
  /** The L2 scan: committed diff plus worktree edits against the upstream base, PR-gate surface. */
  scanL2(overrides?: Partial<RunQaScanDiffOptions>): Promise<QaScanInvocation>;
  /** The epoch observability scan of a worktree's committed HEAD against the upstream base. */
  scanEpoch(worktreeDir: string): Promise<QaScanInvocation>;
  /**
   * One enforce attempt at L1 through production code: the real L1 scan of
   * `patchText`, deferred validation, the candidate, inline adjudication
   * against `adjudicator`'s kernel, then the checkpoint and its
   * `accepted_advisory` rows (written only for a pass).
   */
  adjudicateAtL1(params: { patchText: string; noteText: string; adjudicator: AdjudicationHarness }): Promise<L1Acceptance>;
  recordIntegration(checkpointId: string, integratedRev: string, preApplyRev: string, status?: "applied" | "resolved"): void;
  /** An enforce attempt against HEAD (adjudicateAtL1), then apply-on-accept as one integration commit. */
  integrateWorkerChange(params: { rel: string; after: string; noteText: string; adjudicator: AdjudicationHarness }): Promise<WorkerChangeResult>;
  close(): void;
}

const localProcessRunner: QaScanProcessRunner = async (cwd, command, env) => {
  const proc = Bun.spawn(command, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
};

/**
 * The temp root is registered for removal before any setup step runs: a
 * failing step closes whatever store was opened, removes the root, and
 * rethrows. `close()` is idempotent.
 */
export function createAdvisoryRepo(): AdvisoryRepo {
  const root = mkdtempSync(join(tmpdir(), "advisory-repo-"));
  let openedStore: StateStore | null = null;
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    try {
      openedStore?.db.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
  try {
    return buildAdvisoryRepo(root, (store) => { openedStore = store; }, close);
  } catch (error) {
    close();
    throw error;
  }
}

function buildAdvisoryRepo(root: string, onStoreOpened: (store: StateStore) => void, close: () => void): AdvisoryRepo {
  const repoRoot = join(root, "repo");
  const stateDir = join(root, "state");
  mkdirSync(repoRoot, { recursive: true });

  const git = (...args: string[]): string => {
    const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString() || result.stdout.toString()}`);
    return result.stdout.toString().trim();
  };
  const write = (rel: string, text: string): void => {
    mkdirSync(dirname(resolve(repoRoot, rel)), { recursive: true });
    writeFileSync(resolve(repoRoot, rel), text);
  };
  const read = (rel: string): string => readFileSync(resolve(repoRoot, rel), "utf8");
  const head = (): string => git("rev-parse", "HEAD");
  const commit = (message: string): string => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
    return head();
  };

  git("init", "-q", "-b", "main");
  git("config", "user.email", "advisory@example.invalid");
  git("config", "user.name", "Advisory Replay");
  git("config", "commit.gpgsign", "false");
  write(ADVISORY_FILE, UPSTREAM_ADVISORY_SOURCE);
  const baseRev = commit("upstream base");

  const store = openState(stateDir);
  onStoreOpened(store);
  seedRunHarness(store, "melee", baseRev, repoRoot);
  const runId = createRun(store, "matched_code_percent", 100, 1, { gameId: "melee", repoRoot }, { baseRevision: baseRev }).id;

  const scan = (options: Partial<RunQaScanDiffOptions>): Promise<QaScanInvocation> =>
    runQaScanDiff({
      repoRoot,
      orchestratorRoot: packageRoot(),
      game: { gameId: "melee" },
      processRunner: localProcessRunner,
      ...options,
    });

  let attempts = 0;
  const workerPatch = (rel: string, before: string, after: string): string => {
    const dir = mkdtempSync(join(root, "attempt-"));
    for (const [side, text] of [["pre", before], ["post", after]] as const) {
      mkdirSync(dirname(join(dir, side, rel)), { recursive: true });
      writeFileSync(join(dir, side, rel), text);
    }
    const diff = Bun.spawnSync(["git", "diff", "--no-index", "--no-color", join(dir, "pre", rel), join(dir, "post", rel)], { stdout: "pipe", stderr: "pipe" });
    if (diff.exitCode !== 0 && diff.exitCode !== 1) throw new Error(`git diff --no-index failed: ${diff.stderr.toString()}`);
    return `${rewriteNoIndexDiffPaths(diff.stdout.toString(), rel)}\n`;
  };

  const adjudicateAtL1 = async ({ patchText, noteText, adjudicator }: { patchText: string; noteText: string; adjudicator: AdjudicationHarness }): Promise<L1Acceptance> => {
    attempts += 1;
    const workerStateId = `worker-state-${attempts}`;
    const scanPath = join(root, `attempt-${attempts}.qa_diff.patch`);
    writeFileSync(scanPath, patchText);
    const invocation = await scan({ diffFile: scanPath, surface: "worker" });
    if (invocation.toolError !== null) throw new Error(`L1 scan failed: ${invocation.toolError}`);
    const scanned = qaLintFromInvocation(invocation, scanPath);
    const qaLint = { ...scanned, advisory: qaLintAdvisoryPartition(scanned) };
    const validation: WorkerChangeValidation = {
      ...applyQaLintToValidation(
        { status: "passed", reasons: [], target: { unit: "main/melee/gm/gmadvisory", symbol: "gmAdvisory_Load", before: 98.1, after: 100, improved: true, exact: true } },
        qaLint,
        { deferAdvisories: true },
      ),
      preQa: { status: "passed", reasons: [] },
    };
    const candidate = buildLlmReviewCandidate({
      mode: "enforce",
      requestedMode: "enforce",
      validation,
      reviewLint: null,
      outOfWriteSetChanges: [],
      kernel: { run_id: adjudicator.parentRunId, container_id: adjudicator.temp.tempDb.containerId, pi_session_id: "worker-pi-session" },
      attemptIndex: 0,
      agentOutputPath: null,
      patchText,
    });
    const adjudication = await adjudicateAdvisories({
      kernel: adjudicator.temp.kernel,
      candidate,
      noteText,
      patchText,
      signal: AbortSignal.timeout(30_000),
      requestIdPrefix: `attempt:${workerStateId}:0`,
      config: adjudicator.config,
      budgetMs: 30_000,
    });
    const checkpoint = recordWorkerCheckpoint(store, {
      workerStateId,
      runId,
      epochId: "epoch-1",
      epochTargetId: `epoch-target-${attempts}`,
      targetClaimId: `claim-${attempts}`,
      attemptIndex: 0,
      oldScore: 98.1,
      newScore: 100,
      exactMatch: true,
      hardGatesPassed: adjudication.verdict === "pass",
      qaStatus: qaLint.status,
      validationStatus: adjudication.verdict === "pass" ? "passed" : "failed",
      patchPath: scanPath,
      metadata: { llm_review_candidate: candidate, llm_review_adjudication: adjudication },
      authority: { host: "advisory-replay" },
    });
    const acceptedFingerprints = adjudication.verdict === "pass"
      ? recordAcceptedAdvisories(store, { checkpointId: checkpoint.id, runId, adjudication, patchText })
      : [];
    return { checkpointId: checkpoint.id, patchText, l1Findings: invocation.result?.findings ?? [], validation, adjudication, acceptedFingerprints };
  };

  const recordIntegration = (checkpointId: string, integratedRev: string, preApplyRev: string, status: "applied" | "resolved" = "applied"): void => {
    const at = new Date().toISOString();
    const checkpoint = store.db.query("SELECT epoch_id, epoch_target_id, target_claim_id, worker_state_id FROM worker_checkpoints WHERE id = ?")
      .get(checkpointId) as { epoch_id: string; epoch_target_id: string; target_claim_id: string; worker_state_id: string };
    store.db.query(`INSERT INTO integration_outcomes
      (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id, worker_checkpoint_id, status, disposition, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      `integration-${checkpointId}`,
      runId,
      checkpoint.epoch_id,
      checkpoint.epoch_target_id,
      checkpoint.target_claim_id,
      checkpoint.worker_state_id,
      checkpointId,
      status,
      status === "applied" ? "clean_apply" : "resolved",
      JSON.stringify({ validation_state: "tentative", pre_apply_rev: preApplyRev, integrated_rev: integratedRev }),
      at,
      at,
    );
  };

  return {
    root,
    repoRoot,
    stateDir,
    store,
    runId,
    baseRev,
    git,
    head,
    read,
    write,
    commit,
    workerPatch,
    scanL2: (overrides = {}) => scan({ baseRef: baseRev, includeWorktree: true, surface: "pr_gate", ...overrides }),
    scanEpoch: (worktreeDir) => scan({ repoRoot: worktreeDir, baseRef: baseRev, worktreeId: "epoch" }),
    adjudicateAtL1,
    recordIntegration,
    async integrateWorkerChange({ rel, after, noteText, adjudicator }) {
      const preApplyRev = head();
      const accepted = await adjudicateAtL1({ patchText: workerPatch(rel, read(rel), after), noteText, adjudicator });
      write(rel, after);
      const integratedRev = commit(`integrate ${accepted.checkpointId}`);
      recordIntegration(accepted.checkpointId, integratedRev, preApplyRev);
      return { ...accepted, integratedRev };
    },
    close,
  };
}

export interface AcceptedAdvisoryScenario {
  repo: AdvisoryRepo;
  adjudicator: AdjudicationHarness;
  /** Epoch 1: the long cast line accepted at L1 through enforce (p = 0.93) and integrated as one commit. */
  accepted: WorkerChangeResult;
  /** Idempotent: closes the repo, then the adjudication kernel, and restores the network guard last. */
  teardown(): void;
}

/**
 * `createAdvisoryRepo` plus an enforce adjudication harness, with epoch 1
 * already integrated. The network is disabled for the scenario's lifetime;
 * a failing setup step tears down whatever was created and rethrows.
 */
export async function createAcceptedAdvisoryScenario(): Promise<AcceptedAdvisoryScenario> {
  const restoreNetwork = disableNetwork();
  let repo: AdvisoryRepo | undefined;
  let adjudicator: AdjudicationHarness | undefined;
  let tornDown = false;
  const teardown = (): void => {
    if (tornDown) return;
    tornDown = true;
    try {
      repo?.close();
    } finally {
      try {
        adjudicator?.cleanup();
      } finally {
        restoreNetwork();
      }
    }
  };
  try {
    repo = createAdvisoryRepo();
    adjudicator = await createAdjudicationHarness({
      calls: () => fakeOk(extractionAnswer({ A1: ADVISORY_JUSTIFICATION })),
      decisions: () => bool(0.93),
    });
    const accepted = await repo.integrateWorkerChange({ rel: ADVISORY_FILE, after: ACCEPTED_ADVISORY_SOURCE, noteText: KEPT_ADVISORY_NOTE, adjudicator });
    return { repo, adjudicator, accepted, teardown };
  } catch (error) {
    teardown();
    throw error;
  }
}
