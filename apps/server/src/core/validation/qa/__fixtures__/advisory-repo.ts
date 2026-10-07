/**
 * Temp git repo + temp orchestrator store for accepted-advisory tests (plan
 * §6.10, §7.1). The repo plays the harness checkout: an upstream base commit,
 * then worker changes integrated one commit each (apply-on-accept). The store
 * holds one harness run with the rows the enforce path writes: the worker
 * checkpoint, its `accepted_advisory` rows, and the `integration_outcomes`
 * row carrying `metadata.integrated_rev`.
 *
 * Scans go through `runQaScanDiff` with the real review_lint scanner and the
 * real global standards, run locally (never remote builds), so line numbers,
 * the 240-character excerpt, and `detail` are exactly what L1, L2, and the
 * epoch scan see.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRun } from "@server/core/harness-runtime/run-state/runs.js";
import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";
import { packageRoot } from "@server/core/knowledge";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  advisoryFingerprint,
  fullFlaggedLineFromPatch,
  isAdvisoryFinding,
  normalizeAdvisoryCode,
} from "../advisory-fingerprint.js";
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

const THRESHOLDS_JSON = JSON.stringify({ passAt: 0.85, failAt: 0.15, qualification: "enforcement-qualified" });

export interface AcceptedAdvisoryRow {
  fingerprint: string;
  checkpointId: string;
  fullLine: string;
  occurrences: number;
}

export interface WorkerChangeResult {
  checkpointId: string;
  patchText: string;
  /** The L1 (worker surface, diff-file) scan of the attempt's patch. */
  l1Findings: QaScanFinding[];
  accepted: AcceptedAdvisoryRow[];
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
  /** A worker attempt patch for `rel` going from `before` to `after`, shaped like the L1 `qa_diff.patch`. */
  workerPatch(rel: string, before: string, after: string): string;
  /** The L1 scan of an attempt patch (`--diff-file`, worker surface). */
  scanPatch(patchText: string): Promise<QaScanInvocation>;
  /** The L2 scan: committed diff plus worktree edits against the upstream base, PR-gate surface. */
  scanL2(overrides?: Partial<RunQaScanDiffOptions>): Promise<QaScanInvocation>;
  /** The epoch observability scan of a worktree's committed HEAD against the upstream base. */
  scanEpoch(worktreeDir: string): Promise<QaScanInvocation>;
  recordCheckpoint(checkpointId: string, patchText: string): void;
  /** The `accepted_advisory` rows the enforce path writes after a passing adjudication of `findings`. */
  acceptAdvisories(checkpointId: string, patchText: string, findings: QaScanFinding[]): AcceptedAdvisoryRow[];
  recordIntegration(checkpointId: string, integratedRev: string, preApplyRev: string, status?: "applied" | "resolved"): void;
  /**
   * One worker checkpoint end to end: its patch against HEAD, the L1 scan,
   * the checkpoint row, acceptance of every L1 advisory warning when
   * `accept` is set, then apply-on-accept as one integration commit.
   */
  integrateWorkerChange(params: { checkpointId: string; rel: string; after: string; accept: boolean }): Promise<WorkerChangeResult>;
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

export function createAdvisoryRepo(): AdvisoryRepo {
  const root = mkdtempSync(join(tmpdir(), "advisory-repo-"));
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

  let patchCount = 0;
  const workerPatch = (rel: string, before: string, after: string): string => {
    const dir = mkdtempSync(join(root, "attempt-"));
    for (const [side, text] of [["pre", before], ["post", after]] as const) {
      mkdirSync(dirname(join(dir, side, rel)), { recursive: true });
      writeFileSync(join(dir, side, rel), text);
    }
    const diff = Bun.spawnSync(["git", "diff", "--no-index", "--no-color", join("pre", rel), join("post", rel)], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    if (diff.exitCode !== 0 && diff.exitCode !== 1) throw new Error(`git diff --no-index failed: ${diff.stderr.toString()}`);
    return diff.stdout.toString().replaceAll(`a/pre/${rel}`, `a/${rel}`).replaceAll(`b/post/${rel}`, `b/${rel}`);
  };

  const scanPatch = (patchText: string): Promise<QaScanInvocation> => {
    patchCount += 1;
    const diffFile = join(root, `attempt-${patchCount}.qa_diff.patch`);
    writeFileSync(diffFile, patchText);
    return scan({ diffFile, surface: "worker" });
  };

  const recordCheckpoint = (checkpointId: string, patchText: string): void => {
    const patchPath = join(root, `${checkpointId}.qa_diff.patch`);
    writeFileSync(patchPath, patchText);
    store.db.query(`INSERT INTO worker_checkpoints
      (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id, attempt_index, validation_time,
       old_score, new_score, delta, exact_match, hard_gates_passed, selectable, selected, qa_status, validation_status, patch_path, metadata_json)
      VALUES (?, ?, ?, 'epoch-1', 'epoch-target', ?, 1, ?, 10, 11, 1, 0, 1, 1, 1, 'warnings', 'valid', ?, ?)`).run(
      checkpointId,
      `worker-${checkpointId}`,
      runId,
      `claim-${checkpointId}`,
      new Date().toISOString(),
      patchPath,
      JSON.stringify({ qa_status_effective: "clean" }),
    );
  };

  const acceptAdvisories = (checkpointId: string, patchText: string, findings: QaScanFinding[]): AcceptedAdvisoryRow[] => {
    // One row per fingerprint; `occurrences` counts its physical lines in the patch.
    const byFingerprint = new Map<string, { row: AcceptedAdvisoryRow; finding: QaScanFinding }>();
    for (const finding of findings) {
      if (!isAdvisoryFinding(finding) || finding.severity !== "warning") continue;
      const fullLine = fullFlaggedLineFromPatch(patchText, finding.file, finding.line, finding.excerpt);
      if (fullLine === null) throw new Error(`flagged line ${finding.file}:${finding.line} is not an added line of the patch`);
      const fingerprint = advisoryFingerprint(finding, fullLine);
      const entry = byFingerprint.get(fingerprint);
      if (entry) entry.row.occurrences += 1;
      else byFingerprint.set(fingerprint, { row: { fingerprint, checkpointId, fullLine: normalizeAdvisoryCode(fullLine), occurrences: 1 }, finding });
    }
    for (const { row, finding } of byFingerprint.values()) {
      store.db.query(`INSERT INTO accepted_advisory
        (fingerprint, checkpoint_id, run_id, rule_id, file, full_line, occurrences, decision_run_id, probability, served_model, thresholds_json, accepted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.97, 'jev-1.13.0', ?, ?)`).run(
        row.fingerprint,
        checkpointId,
        runId,
        finding.rule_id,
        finding.file,
        row.fullLine,
        row.occurrences,
        `decision-${checkpointId}`,
        THRESHOLDS_JSON,
        new Date().toISOString(),
      );
    }
    return [...byFingerprint.values()].map((entry) => entry.row);
  };

  const recordIntegration = (checkpointId: string, integratedRev: string, preApplyRev: string, status: "applied" | "resolved" = "applied"): void => {
    const at = new Date().toISOString();
    store.db.query(`INSERT INTO integration_outcomes
      (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id, worker_checkpoint_id, status, disposition, metadata_json, created_at, updated_at)
      VALUES (?, ?, 'epoch-1', 'epoch-target', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      `integration-${checkpointId}`,
      runId,
      `claim-${checkpointId}`,
      `worker-${checkpointId}`,
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
    scanPatch,
    scanL2: (overrides = {}) => scan({ baseRef: baseRev, includeWorktree: true, surface: "pr_gate", ...overrides }),
    scanEpoch: (worktreeDir) => scan({ repoRoot: worktreeDir, baseRef: baseRev, worktreeId: "epoch" }),
    recordCheckpoint,
    acceptAdvisories,
    recordIntegration,
    async integrateWorkerChange({ checkpointId, rel, after, accept }) {
      const preApplyRev = head();
      const patchText = workerPatch(rel, read(rel), after);
      const l1 = await scanPatch(patchText);
      if (l1.toolError !== null) throw new Error(`L1 scan failed: ${l1.toolError}`);
      const l1Findings = l1.result?.findings ?? [];
      recordCheckpoint(checkpointId, patchText);
      const accepted = accept ? acceptAdvisories(checkpointId, patchText, l1Findings) : [];
      write(rel, after);
      const integratedRev = commit(`integrate ${checkpointId}`);
      recordIntegration(checkpointId, integratedRev, preApplyRev);
      return { checkpointId, patchText, l1Findings, accepted, integratedRev };
    },
    close() {
      store.db.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
