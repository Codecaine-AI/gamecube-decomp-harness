// Test fixture for the checkpoint feed: a temp orchestrator store, a temp
// knowledge store, and helpers that seed settled epochs, frozen reports and
// integrated checkpoints with their evidence files.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { addEvent, openState, type StateStore } from "@server/core/harness-runtime/run-state";
import { ensureModelNodeLaneState } from "@server/core/model-node-work/catch-up.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";

import { openKnowledgeStore, type KnowledgeStore } from "../../storage/store.js";

export const REAL_REPORT_PATH = join(
  import.meta.dir,
  "../../../../../../../objectives/sms-symbol-order-cleanup/artifacts/round3-tooldata-report_changes.json",
);

export const UNIT = "main/melee/lb/lbsnap";
export const SYMBOL = "lbSnap_8001DA5C";
export const TARGET_KEY = `${UNIT}::${SYMBOL}`;
export const SOURCE_PATH = "src/melee/lb/lbsnap.c";

export const PATCH = [
  `diff --git a/${SOURCE_PATH} b/${SOURCE_PATH}`,
  `--- a/${SOURCE_PATH}`,
  `+++ b/${SOURCE_PATH}`,
  "@@ -10,3 +10,6 @@ void lbSnap_8001DA5C(void)",
  " {",
  "+    templates_800[0] = *(char**) &lbl_804DA6C4;",
  "+    u32 sp1C = *(u32*) &lbl_804DA6C8;",
  "+    f32 sp20 = 0.0f;",
  "     return;",
  " }",
  "",
].join("\n");

export const NOTE = [
  "Matched lbSnap_8001DA5C.",
  "Hoisting the loop bound into a local freed r31 for the counter; objdiff 100%.",
  "kept_advisories:",
  "- rule_id: type_erasing_cast, line 11: MWCC loads lbl_804DA6C4 through r13 only with the char** view.",
  "- rule_id: stack_local_name, line 13: sp20 keeps the stack offset 0x20.",
].join("\n");

export const WARNING_FINDING: QaScanFinding = {
  rule_id: "type_erasing_cast", severity: "warning", file: SOURCE_PATH, line: 11,
  excerpt: "templates_800[0] = *(char**) &lbl_804DA6C4;", message: "Added type-erasing cast `(char**)`.",
  standard_id: "casts", detail: { llm_review: true, cast: "(char**)" },
};

export const INFO_FINDING: QaScanFinding = {
  rule_id: "stack_local_name", severity: "info", file: SOURCE_PATH, line: 13,
  excerpt: "f32 sp20 = 0.0f;", message: "spNN local name.",
  standard_id: null, detail: { llm_review: true, name: "sp20" },
};

/** A deterministic finding the model never sees. */
export const DETERMINISTIC_FINDING: QaScanFinding = {
  rule_id: "missing_include", severity: "warning", file: SOURCE_PATH, line: 10,
  excerpt: "{", message: "Deterministic lint.", standard_id: null,
};

export interface FeedFixture {
  root: string;
  stateDir: string;
  repoRoot: string;
  knowledgeRoot: string;
  store: StateStore;
  globals: GlobalArgs;
  openKnowledge(): KnowledgeStore;
  cleanup(): void;
}

export function createFeedFixture(name = "feed"): FeedFixture {
  const root = mkdtempSync(join(tmpdir(), `checkpoint-feed-${name}-`));
  const stateDir = join(root, "state");
  const repoRoot = join(root, "repo");
  const knowledgeRoot = join(root, "knowledge");
  mkdirSync(repoRoot, { recursive: true });
  const store = openState(stateDir);
  return {
    root,
    stateDir,
    repoRoot,
    knowledgeRoot,
    store,
    globals: { repoRoot, stateDir, gameId: "melee", dryRunAgents: false, provider: "test", model: "test", thinkingLevel: "medium" },
    openKnowledge: () => openKnowledgeStore({ knowledgeRoot }),
    cleanup() {
      store.db.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

/** The knowledge lane started this long ago in the fixture's state directory. */
export function enableKnowledgeLane(store: StateStore, at = ago(3_600_000)): void {
  ensureModelNodeLaneState(store, "checkpoint_knowledge", at);
}

export function seedRun(store: StateStore, id: string): void {
  store.db.query(`INSERT OR IGNORE INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, game_id, revision, trace_id)
    VALUES (?, 'matched_percent', 100, 1, 'active', ?, 'melee', 0, ?)`).run(id, ago(7_200_000), `trace-${id}`);
}

export function writeJson(dir: string, name: string, value: unknown): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value, null, 2));
  return path;
}

export interface EpochSeed {
  id: string;
  runId: string;
  closedAt?: string | null;
  status?: string;
  /** Default true. */
  savePoint?: boolean;
  commitSha?: string | null;
  /** Default: a report with no decrease for the default target, written under the fixture. */
  reportChangesPath?: string | null;
  /**
   * What the settlement recorded about the confirmation pass. Default
   * "not-run": the settled-evidence record of a boundary whose pass is off
   * (production today), whose result has no `confirmation`. "ran" records a
   * pass result; "none" records nothing (status unknown).
   */
  confirmationPass?: "not-run" | "ran" | "none";
}

/** Objdiff metric values with string byte counts, like real output. */
export function metrics(fuzzy: number, matchedCode: number, size = 400): Record<string, unknown> {
  return { fuzzy_match_percent: fuzzy, matched_code: String(matchedCode), matched_code_percent: (matchedCode / size) * 100, size: String(size) };
}

/** A report whose only unit is the default target's, improved with nothing lower. */
export function improvingReport(unit = UNIT, symbol = SYMBOL): Record<string, unknown> {
  return {
    from: { fuzzy_match_percent: 50, matched_code: "100" },
    to: { fuzzy_match_percent: 51, matched_code: "140" },
    units: [{
      name: unit,
      from: metrics(80, 200),
      to: metrics(90, 240),
      sections: [{ name: ".text", from: { fuzzy_match_percent: 80, size: "400" }, to: { fuzzy_match_percent: 90, size: "400" } }],
      functions: [{ name: symbol, from: { fuzzy_match_percent: 60, size: "64" }, to: { fuzzy_match_percent: 100, size: "64" } }],
    }],
  };
}

/** Seeds the epoch (the run's next ordinal, as `startSchedulerEpoch` numbers them) and, by default, its save point. */
export function seedSettledEpoch(f: FeedFixture, seed: EpochSeed): { reportChangesPath: string | null; ordinal: number } {
  seedRun(f.store, seed.runId);
  const closedAt = seed.closedAt === undefined ? ago(60_000) : seed.closedAt;
  const ordinal = f.store.db.query<{ ordinal: number }, [string]>(
    "SELECT COALESCE(MAX(ordinal), 0) + 1 AS ordinal FROM epochs WHERE run_id = ?",
  ).get(seed.runId)!.ordinal;
  f.store.db.query(`INSERT INTO epochs (id, run_id, ordinal, worker_pool_size, status, created_at, closed_at)
    VALUES (?, ?, ?, 1, ?, ?, ?)`).run(seed.id, seed.runId, ordinal, seed.status ?? "completed", ago(3_600_000), closedAt);
  const reportChangesPath = seed.reportChangesPath === undefined
    ? writeJson(join(f.root, "epochs", seed.id), "report_changes.json", improvingReport())
    : seed.reportChangesPath;
  if (seed.savePoint !== false) {
    f.store.db.query(`INSERT INTO save_points (id, campaign_id, run_id, trigger_kind, commit_sha, report_changes_path, payload_json, created_at)
      VALUES (?, 'campaign', ?, 'epoch_finish', ?, ?, '{}', ?)`).run(
      `epoch-save-point-${seed.id}`, seed.runId, seed.commitSha === undefined ? "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" : seed.commitSha,
      reportChangesPath, closedAt ?? ago(60_000),
    );
  }
  if (seed.status === undefined || seed.status === "completed") {
    const recorded = seed.confirmationPass ?? "not-run";
    if (recorded !== "none") {
      addEvent(f.store, seed.runId, "epoch_checkpoint_progress", "run-loop", {
        phase: "epoch_settled_evidence",
        epoch_id: seed.id,
        attempt: 1,
        result: {
          commitSha: seed.commitSha ?? "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          savePoint: { ok: seed.savePoint !== false, savePointId: `epoch-save-point-${seed.id}`, blockerRaised: false },
          ...(recorded === "ran" ? { confirmation: { status: "confirmed", confirmedIds: [], regressedId: null } } : {}),
        },
      });
    }
  }
  return { reportChangesPath, ordinal };
}

export interface CheckpointSeed {
  id: string;
  epochId: string;
  runId: string;
  unit?: string;
  symbol?: string;
  sourcePath?: string;
  integrationStatus?: string;
  integratedRev?: string | null;
  validationState?: string;
  exact?: boolean;
  delta?: number | null;
  findings?: QaScanFinding[];
  /** Extra checkpoint metadata (e.g. `llm_review_candidate`, `llm_review_adjudication`). */
  metadata?: Record<string, unknown>;
  integrationMetadata?: Record<string, unknown>;
  /** Overrides the evidence file paths; null leaves the path unset. */
  notePath?: string | null;
  patchPath?: string | null;
  runnerSummaryPath?: string | null;
}

export interface SeededCheckpoint {
  id: string;
  integrationId: string;
  workerStateId: string;
  notePath: string | null;
  patchPath: string | null;
  runnerSummaryPath: string | null;
}

/** An integrated checkpoint with its epoch target, worker state, integration and evidence files. */
export function seedCheckpoint(f: FeedFixture, seed: CheckpointSeed): SeededCheckpoint {
  const unit = seed.unit ?? UNIT;
  const symbol = seed.symbol ?? SYMBOL;
  const targetKey = `${unit}::${symbol}`;
  const sourcePath = seed.sourcePath ?? SOURCE_PATH;
  const workerStateId = `ws-${seed.id}`;
  const epochTargetId = `et-${seed.id}`;
  const claimId = `claim-${seed.id}`;
  const dir = join(f.root, "attempts", seed.id);
  mkdirSync(dir, { recursive: true });
  const notePath = seed.notePath === undefined ? writeJson(dir, "attempt-1.agent_output.txt", NOTE) : seed.notePath;
  const patchPath = seed.patchPath === undefined ? writeJson(dir, "attempt-1.write_set.diff", PATCH) : seed.patchPath;
  const runnerSummaryPath = seed.runnerSummaryPath === undefined
    ? writeJson(dir, "attempt-1.runner.json", {
      status: "passed",
      qaLint: { status: "warnings", exitCode: 2, findings: seed.findings ?? [WARNING_FINDING, INFO_FINDING, DETERMINISTIC_FINDING], scanPath: null, toolError: null },
    })
    : seed.runnerSummaryPath;
  const at = ago(120_000);
  f.store.db.query(`INSERT INTO epoch_targets (id, epoch_id, run_id, target_key, unit, symbol, source_path, size,
      baseline_score, priority, admission_index, status, admitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 64, 10, 1, 0, 'finished', ?)`).run(epochTargetId, seed.epochId, seed.runId, targetKey, unit, symbol, sourcePath, at);
  f.store.db.query(`INSERT INTO worker_state (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_id, target_key,
      lifecycle_status, started_at, ended_at)
    VALUES (?, ?, ?, ?, ?, 'worker-1', ?, 'finished', ?, ?)`).run(workerStateId, seed.runId, seed.epochId, epochTargetId, claimId, targetKey, at, at);
  const metadata = {
    agent_output_path: notePath,
    agent_note: { status: "matched", summary: "Matched lbSnap_8001DA5C." },
    ...seed.metadata,
  };
  const delta = seed.delta === undefined ? 1 : seed.delta;
  f.store.db.query(`INSERT INTO worker_checkpoints (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id,
      attempt_index, validation_time, old_score, new_score, delta, exact_match, qa_status, validation_status, validation_state,
      artifact_path, patch_path, diff_path, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, 60, ?, ?, ?, 'warnings', 'passed', ?, ?, ?, ?, ?)`).run(
    seed.id, workerStateId, seed.runId, seed.epochId, epochTargetId, claimId, at,
    60 + (delta ?? 0), delta, seed.exact ? 1 : 0, seed.validationState ?? "tentative",
    runnerSummaryPath, patchPath, patchPath, JSON.stringify(metadata),
  );
  const integrationId = `integration-${seed.id}`;
  const integrationMetadata = {
    validation_state: "tentative",
    ...(seed.integratedRev === null ? {} : { integrated_rev: seed.integratedRev ?? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
    ...seed.integrationMetadata,
  };
  f.store.db.query(`INSERT INTO integration_outcomes (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id,
      worker_checkpoint_id, status, target_key, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    integrationId, seed.runId, seed.epochId, epochTargetId, claimId, workerStateId, seed.id,
    seed.integrationStatus ?? "applied", targetKey, JSON.stringify(integrationMetadata), at, at,
  );
  return { id: seed.id, integrationId, workerStateId, notePath, patchPath, runnerSummaryPath };
}

/** Seeds the knowledge target, worker run and the submission whose runtime_ref is the checkpoint. */
export function seedKnowledgeSubmission(
  knowledge: KnowledgeStore,
  input: { checkpointId: string; workerStateId: string; unit?: string; symbol?: string; seq?: number },
): { workerRunId: string; submissionId: string; targetId: string } {
  const unit = input.unit ?? UNIT;
  const symbol = input.symbol ?? SYMBOL;
  const targetId = `target:function:${unit}:${symbol}`;
  const unitEntityId = `entity:translation_unit:${SOURCE_PATH}`;
  knowledge.db.query(`INSERT OR IGNORE INTO entity (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
    VALUES (?, 'translation_unit', ?, NULL, 'active', NULL)`).run(unitEntityId, SOURCE_PATH);
  knowledge.db.query(`INSERT OR IGNORE INTO target (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES (?, 'function', ?, ?, ?, ?, '0x8001DA5C', 'current', 'fixture-rev')`).run(targetId, unit, unitEntityId, symbol, `${unit}:${symbol}`);
  knowledge.db.query(`INSERT OR IGNORE INTO target_status (target_id, match_pct, linked, size, content_hash, report_revision, updated_at)
    VALUES (?, 100, 1, 64, 'sha256:fixture', 'fixture-rev', '2026-08-30T00:00:00.000Z')`).run(targetId);
  const workerRunId = `run:${input.workerStateId}`;
  const seq = input.seq ?? 1;
  const submissionId = `${workerRunId}:sub:${seq}`;
  knowledge.db.query(`INSERT INTO worker_run (id, target_id, goal, baseline, run_id, worker_state_id, final_outcome, error_type,
      integration, started_at, ended_at, closed_at)
    VALUES (?, ?, 'Match the target', '{}', 'run-a', ?, 'match', NULL, 'integrated',
      '2026-08-29T00:00:00.000Z', '2026-08-29T00:05:00.000Z', '2026-08-29T00:06:00.000Z')`).run(workerRunId, targetId, input.workerStateId);
  knowledge.db.query(`INSERT INTO submission (id, worker_run_id, seq, description, hypothesis, score, submitted_at, runtime_ref)
    VALUES (?, ?, ?, 'checkpoint scored 100', NULL, 100, '2026-08-29T00:04:00.000Z', ?)`).run(submissionId, workerRunId, seq, input.checkpointId);
  return { workerRunId, submissionId, targetId };
}

export const alwaysAncestor = async (): Promise<boolean> => true;
