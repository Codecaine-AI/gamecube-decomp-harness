// Test helper: a temp harness source root laid out like the real history
// (plan §6.9): runner validation summaries, attempt patches (one attempt
// with only the raw patch and its absolute header paths), worker
// final-message files, and orchestrator.sqlite with the real
// worker_checkpoints / worker_state schemas. Modelled on run 4a45af8a,
// worker state 9cbece80, attempt 2: four `(char**)` type_erasing_cast
// warnings, kept with a review_justification. Also returns the read-only
// assertion helpers (`fileManifest`, `expectUntouched`).
import { expect } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { extractHunk } from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/hunks.js";
import { advisoryFingerprint, fullFlaggedLineFromPatch } from "@server/core/validation/qa/advisory-fingerprint.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";

import { LEGACY_HARNESS_ROOT } from "../source-root.js";

export const FIXTURE_GAME = "melee";
export const JEV_MODEL = "typesafe/jev-1.13.0";
export const FIXTURE_TOKEN = "sk-test-ABCDEFGH12345678";

const GM_FILE = "src/melee/gm/gmtoulib.c";
const GM_TARGET = "main/melee/gm/gmtoulib::fn_8018F00C";
const CAST_MESSAGE =
  "Added type-erasing cast `(char**)`. Prefer typed fields, union arms, or helpers when the access can be recovered. Prefer typed fields, union arms, and accessors over pointer math.";
const TYPED_FIELDS = "global_standard:typed-fields-over-pointer-math";

/** Every case the tree holds. The first is the real 4-cast attempt; the others exercise dedupe, grouping and fallbacks. */
export const FIXTURE_CASES = {
  /** Run 4a45af8a attempt 2: four `(char**)` warnings, clean and raw patch, note file with a legacy path and a token. */
  casts: {
    runId: "4a45af8a-9f8c-499b-b375-c0d8e93fc8fd",
    workerStateId: "9cbece80-e52a-46c1-b621-a9eeb5dd2dad",
    attempt: 2,
    checkpointId: "cd9bb24d-9a4f-43d5-b67d-839950f784ff",
    targetKey: GM_TARGET,
    session: "01a04496-1f1f-77c0-990d-11578dade644",
  },
  /** Same worker state, attempt 0: a summary with no llm_review finding. */
  noAdvisories: {
    runId: "4a45af8a-9f8c-499b-b375-c0d8e93fc8fd",
    workerStateId: "9cbece80-e52a-46c1-b621-a9eeb5dd2dad",
    attempt: 0,
    checkpointId: "c4f688ea-3630-4492-bda3-fea42c6ec640",
    session: "01a04493-37ae-7b64-a38c-3f4416dba09c",
  },
  /** Same worker state, attempt 3: the worker edited the first flagged line; only `qa_diff.raw.patch`; note only as agent_note. */
  edited: {
    runId: "4a45af8a-9f8c-499b-b375-c0d8e93fc8fd",
    workerStateId: "9cbece80-e52a-46c1-b621-a9eeb5dd2dad",
    attempt: 3,
    checkpointId: "54f8a125-6f61-4514-bf9c-3dfb0afcfdfb",
    line: "    templates_800[TMPL_US] = *(char**) &lbl_804DA6C4;",
  },
  /**
   * Another worker on the same function, attempt 0: keeps the first flagged
   * line of `casts` twice (one item); its checkpoint has no artifact_path and
   * its final-message file is missing (note from agent_note).
   */
  otherWorker: {
    runId: "5b7e9d10-2c4f-4a8b-9e61-3d2f7a0c8b45",
    workerStateId: "b7e2f0c4-1d3a-4e5b-9c6d-7f8a9b0c1d2e",
    attempt: 0,
    checkpointId: "0e6f5a4b-3c2d-4e1f-8a9b-7c6d5e4f3a2b",
    targetKey: GM_TARGET,
  },
  /** The other worker's attempt 1: no checkpoint row; one readable line, one stale excerpt (unreadable). */
  unmatched: {
    runId: "5b7e9d10-2c4f-4a8b-9e61-3d2f7a0c8b45",
    workerStateId: "b7e2f0c4-1d3a-4e5b-9c6d-7f8a9b0c1d2e",
    attempt: 1,
  },
  /** An unrelated target: one m2c_residue_names warning; plain-prose final message. */
  unrelated: {
    runId: "4a45af8a-9f8c-499b-b375-c0d8e93fc8fd",
    workerStateId: "e1d2c3b4-a596-4877-8695-a4b3c2d1e0f9",
    attempt: 0,
    checkpointId: "6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d",
    targetKey: "main/melee/gr/grmaterial::grMaterial_801C8E08",
    session: "01a05000-aaaa-7bbb-8ccc-0123456789ab",
  },
  /** A live shadow checkpoint (current layout): llm_review_candidate + llm_review_adjudication, no summary. */
  shadow: {
    runId: "7c9d1e2f-3a4b-4c5d-8e6f-9a0b1c2d3e4f",
    workerStateId: "d4c3b2a1-0f9e-4d8c-b7a6-958473625140",
    attempt: 2,
    checkpointId: "f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e1f",
    targetKey: "main/melee/it/itcoin::itCoin_80281A64",
    session: "01a06000-bbbb-7ccc-8ddd-0123456789ab",
  },
} as const;

export interface HistoryTreeOptions {
  /** Default "melee". */
  game?: string;
  /**
   * Leave every row in a non-empty `orchestrator.sqlite-wal` beside an
   * unflushed database (a writer that never checkpointed), with no `-shm`.
   * Default: WAL mode, checkpointed, so the WAL is empty (the real tree's state).
   */
  unflushedWal?: boolean;
  /** Bytes of an extra file diff appended to the 4-cast attempt's `qa_diff.patch` (for size-limit tests). Default 0. */
  castsPatchPadding?: number;
}

export interface HistoryTree {
  root: string;
  game: string;
  runId: string;
  workerStateId: string;
  attempt: number;
  checkpointId: string;
  targetKey: string;
  /** The four `type_erasing_cast` findings of the 4-cast attempt, as its summary records them. */
  findings: QaScanFinding[];
  /** That attempt's worker final message: holds a legacy absolute path and a token-like string. */
  noteText: string;
  /** That attempt's `qa_diff.patch` text. */
  patchText: string;
  paths: {
    stateDir: string;
    orchestratorDb: string;
    workerStateDir: string;
    runnerValidationDir: string;
    summary: string;
    patch: string;
    rawPatch: string;
    note: string;
  };
  cleanup(): void;
}

const CASTS_PATCH = [
  `diff --git a/${GM_FILE} b/${GM_FILE}`,
  `--- a/${GM_FILE}`,
  `+++ b/${GM_FILE}`,
  "@@ -1866,10 +1866,10 @@ void fn_8018F00C(char* dest, s32 slot_id)",
  "     char* tmpl_800;",
  "     char* tmpl_900;",
  " ",
  "-    templates_800[0] = lbl_804DA6C4;",
  "-    templates_900[0] = lbl_804DA6CC;",
  "-    templates_800[1] = lbl_804DA6C8;",
  "-    templates_900[1] = lbl_804DA6D0;",
  "+    templates_800[0] = *(char**) &lbl_804DA6C4;",
  "+    templates_900[0] = *(char**) &lbl_804DA6CC;",
  "+    templates_800[1] = *(char**) &lbl_804DA6C8;",
  "+    templates_900[1] = *(char**) &lbl_804DA6D0;",
  " ",
  "     tmpl_800 = templates_800[!!lbLang_IsSavedLanguageUS()];",
  "     tmpl_900 = templates_900[!!lbLang_IsSavedLanguageUS()];",
  "",
].join("\n");

const EDITED_PATCH = [
  `diff --git a/${GM_FILE} b/${GM_FILE}`,
  `--- a/${GM_FILE}`,
  `+++ b/${GM_FILE}`,
  "@@ -1866,10 +1866,10 @@ void fn_8018F00C(char* dest, s32 slot_id)",
  "     char* tmpl_800;",
  "     char* tmpl_900;",
  " ",
  "-    templates_800[0] = lbl_804DA6C4;",
  `+${FIXTURE_CASES.edited.line}`,
  "     templates_900[0] = lbl_804DA6CC;",
  "     templates_800[1] = lbl_804DA6C8;",
  "     templates_900[1] = lbl_804DA6D0;",
  " ",
  "     tmpl_800 = templates_800[!!lbLang_IsSavedLanguageUS()];",
  "     tmpl_900 = templates_900[!!lbLang_IsSavedLanguageUS()];",
  "",
].join("\n");

function otherWorkerPatch(elseLine: string): string {
  return [
    `diff --git a/${GM_FILE} b/${GM_FILE}`,
    `--- a/${GM_FILE}`,
    `+++ b/${GM_FILE}`,
    "@@ -1868,8 +1868,8 @@ void fn_8018F00C(char* dest, s32 slot_id)",
    "     char* tmpl_900;",
    " ",
    "     if (lbLang_IsSavedLanguageUS()) {",
    "-        templates_800[0] = lbl_804DA6C4;",
    "+        templates_800[0] = *(char**) &lbl_804DA6C4;",
    "     } else {",
    "-        templates_800[0] = lbl_804DA6C8;",
    `+${elseLine}`,
    "     }",
    "     sp14 = templates_800[0];",
    "",
  ].join("\n");
}

const GR_FILE = "src/melee/gr/grmaterial.c";
const UNRELATED_PATCH = [
  `diff --git a/${GR_FILE} b/${GR_FILE}`,
  `--- a/${GR_FILE}`,
  `+++ b/${GR_FILE}`,
  "@@ -397,6 +397,7 @@ void grMaterial_801C8E08(HSD_GObj* gobj)",
  " {",
  "     Ground* gp = GET_GROUND(gobj);",
  "     HSD_JObj* jobj = gp->gv.material.jobj;",
  "+    GXColor sp114;",
  " ",
  "     grMaterial_801C8CFC(gobj);",
  "     HSD_JObjSetFlags(jobj, JOBJ_HIDDEN);",
  "",
].join("\n");

const IT_FILE = "src/melee/it/itcoin.c";
const SHADOW_PATCH = [
  `diff --git a/${IT_FILE} b/${IT_FILE}`,
  `--- a/${IT_FILE}`,
  `+++ b/${IT_FILE}`,
  "@@ -120,7 +120,10 @@ void itCoin_80281A64(Item_GObj* gobj)",
  " {",
  "     Item* ip = GET_ITEM(gobj);",
  "     f32 scale;",
  " ",
  "-    scale = ip->xDD4_itemVar.coin.scale;",
  "+    scale = *(f32*) ((u8*) ip + 0xDD4);",
  "+    ip->x40_vel.x = *(f32*) &lbl_804D8A10;",
  "+    ip->x40_vel.y = *(f32*) &lbl_804D8A14;",
  "+    s32 sp1C = 0;",
  "     ip->scl = scale;",
  " }",
  "",
].join("\n");

function castFinding(line: number, excerpt: string, cast = "(char**)"): QaScanFinding {
  return {
    detail: { cast, llm_review: true },
    excerpt,
    file: GM_FILE,
    line,
    message: CAST_MESSAGE.replace("(char**)", cast),
    rule_id: "type_erasing_cast",
    severity: "warning",
    standard_id: TYPED_FIELDS,
  };
}

function residueFinding(file: string, line: number, excerpt: string, name: string, llmReview: boolean): QaScanFinding {
  return {
    detail: { kind: "stack_slot_name", ...(llmReview && { llm_review: true }), name },
    excerpt,
    file,
    line,
    message: `Stack-slot local name \`${name}\` looks like m2c residue. Use a source role name when the role is known. Use semantic names only when the role is evidenced.`,
    rule_id: "m2c_residue_names",
    severity: "warning",
    standard_id: "global_standard:conservative-naming",
  };
}

export const CASTS_FINDINGS: QaScanFinding[] = [
  castFinding(1869, "templates_800[0] = *(char**) &lbl_804DA6C4;"),
  castFinding(1870, "templates_900[0] = *(char**) &lbl_804DA6CC;"),
  castFinding(1871, "templates_800[1] = *(char**) &lbl_804DA6C8;"),
  castFinding(1872, "templates_900[1] = *(char**) &lbl_804DA6D0;"),
];

/** Legacy layout (`games/<g>/state/`) under the old checkout root, as the summaries and raw patches record it. */
function legacyDir(game: string, runId: string, workerStateId: string): string {
  return `${LEGACY_HARNESS_ROOT}games/${game}/state/runs/${runId}/worker_state/${workerStateId}`;
}

/** Current layout under the old checkout root, as worker_checkpoints records artifact and output paths. */
function recordedDir(game: string, runId: string, workerStateId: string): string {
  return `${LEGACY_HARNESS_ROOT}games/${game}/runtime/state/runs/${runId}/worker_state/${workerStateId}`;
}

/** `qa_diff.raw.patch`: both sides named by absolute path, with git's trailing tab on the file headers. */
function rawPatchOf(clean: string, game: string, runId: string, workerStateId: string, attempt: number): string {
  const base = `${legacyDir(game, runId, workerStateId).slice(1)}/runner_validation`;
  const before = (file: string) => `${base}/pre_worker_source/${file}`;
  const after = (file: string) => `${base}/attempt-${attempt}.qa_current/${file}`;
  return clean
    .split("\n")
    .flatMap((line) => {
      let match = /^diff --git a\/(\S+) b\/\S+$/.exec(line);
      if (match) return [`diff --git a/${before(match[1]!)} b/${after(match[1]!)}`, "index e0da7dd1..7c2eed9c 100644"];
      match = /^--- a\/(\S+)$/.exec(line);
      if (match) return [`--- a/${before(match[1]!)}\t`];
      match = /^\+\+\+ b\/(\S+)$/.exec(line);
      if (match) return [`+++ b/${after(match[1]!)}\t`];
      return [line];
    })
    .join("\n");
}

function paddingDiff(bytes: number): string {
  const lines: string[] = [];
  let size = 0;
  for (let i = 0; size < bytes; i += 1) {
    const line = `+/* padding line ${String(i).padStart(6, "0")}: unrelated generated table entry */`;
    lines.push(line);
    size += line.length + 1;
  }
  const file = "src/melee/gm/gmtoulib_data.c";
  return [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, `@@ -10,0 +11,${lines.length} @@`, ...lines, ""].join("\n");
}

function summaryJson(input: {
  game: string;
  runId: string;
  workerStateId: string;
  attempt: number;
  unit: string;
  symbol: string;
  before: number;
  after: number;
  exact: boolean;
  findings: QaScanFinding[];
}): string {
  const rv = `${legacyDir(input.game, input.runId, input.workerStateId)}/runner_validation`;
  const prefix = `${rv}/attempt-${input.attempt}`;
  const advisories = input.findings.length;
  return `${JSON.stringify(
    {
      status: advisories > 0 ? "failed" : "passed",
      reasons: advisories > 0 ? [`qa lint found ${advisories} QA finding(s) requiring repair (gate exit 2)`] : [],
      target: {
        unit: input.unit,
        symbol: input.symbol,
        before: input.before,
        after: input.after,
        improved: input.after > input.before,
        exact: input.exact,
      },
      regressions: [],
      improvements: [{ kind: "function", unit: input.unit, item: input.symbol, before: input.before, after: input.after }],
      summaryPath: `${prefix}.runner_validation.summary.json`,
      reportPath: `${prefix}.unit_snapshot.json`,
      baselinePath: `${rv}/pre_worker_unit_snapshot.json`,
      exitCode: 0,
      stdoutPath: `${prefix}.object_build.stdout.txt`,
      diffPath: `${prefix}.unit_diff.json`,
      qaLint: {
        status: advisories > 0 ? "warnings" : "passed",
        exitCode: advisories > 0 ? 2 : 0,
        findings: input.findings,
        scanPath: `${prefix}.qa_diff.patch`,
        toolError: null,
      },
      microGates: { status: "passed", results: [], reasons: [] },
      postReturnCheck: { status: "skipped", reasons: ["no --post-return-check-command configured"] },
    },
    null,
    2,
  )}\n`;
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

const SCHEMA = `
  CREATE TABLE worker_checkpoints (
    id TEXT PRIMARY KEY,
    worker_state_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    epoch_id TEXT NOT NULL,
    epoch_target_id TEXT NOT NULL,
    target_claim_id TEXT NOT NULL,
    attempt_index INTEGER NOT NULL,
    validation_time TEXT NOT NULL,
    old_score REAL,
    new_score REAL,
    delta REAL,
    exact_match INTEGER NOT NULL DEFAULT 0,
    hard_gates_passed INTEGER NOT NULL DEFAULT 0,
    improved_over_baseline INTEGER NOT NULL DEFAULT 0,
    selectable INTEGER NOT NULL DEFAULT 0,
    selected INTEGER NOT NULL DEFAULT 0,
    build_status TEXT,
    qa_status TEXT,
    objdiff_status TEXT,
    validation_status TEXT NOT NULL,
    validation_state TEXT NOT NULL DEFAULT 'tentative',
    artifact_path TEXT,
    patch_path TEXT,
    diff_path TEXT,
    write_set_json TEXT NOT NULL DEFAULT '[]',
    failure_reasons_json TEXT NOT NULL DEFAULT '[]',
    metadata_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX worker_checkpoints_state_selectable
    ON worker_checkpoints (worker_state_id, selectable, exact_match, new_score, validation_time);
  CREATE TABLE worker_state (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    epoch_id TEXT NOT NULL,
    epoch_target_id TEXT NOT NULL,
    target_claim_id TEXT NOT NULL UNIQUE,
    worker_id TEXT NOT NULL,
    target_key TEXT NOT NULL,
    lifecycle_status TEXT NOT NULL,
    write_set_json TEXT NOT NULL DEFAULT '[]',
    write_set_entries_json TEXT NOT NULL DEFAULT '[]',
    worker_session_ids_json TEXT NOT NULL DEFAULT '[]',
    artifact_dir TEXT,
    worktree_path TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    baseline_score REAL,
    best_checkpoint_id TEXT,
    best_score REAL,
    exact INTEGER NOT NULL DEFAULT 0,
    timeout_summary TEXT,
    error_summary TEXT,
    summary_json TEXT NOT NULL DEFAULT '{}'
  );
`;

interface WorkerStateRow {
  id: string;
  runId: string;
  targetKey: string;
  artifactDir: string;
}

interface CheckpointSeed {
  id: string;
  workerStateId: string;
  runId: string;
  attempt: number;
  oldScore: number;
  newScore: number;
  exact: boolean;
  artifactPath: string | null;
  metadata: Record<string, unknown>;
}

function seedDatabase(db: Database, workerStates: WorkerStateRow[], checkpoints: CheckpointSeed[]): void {
  db.exec(SCHEMA);
  const insertState = db.query(`
    INSERT INTO worker_state (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_id, target_key, lifecycle_status, artifact_dir, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'timeout', ?, '2026-08-27T13:54:00.000Z')`);
  for (const state of workerStates) {
    insertState.run(state.id, state.runId, `epoch-${state.runId}`, `et-${state.id}`, `claim-${state.id}`, `runloop-${state.id.slice(0, 8)}`, state.targetKey, state.artifactDir);
  }
  const insertCheckpoint = db.query(`
    INSERT INTO worker_checkpoints (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id, attempt_index, validation_time,
      old_score, new_score, delta, exact_match, qa_status, validation_status, artifact_path, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'warnings', 'failed', ?, ?)`);
  for (const [index, checkpoint] of checkpoints.entries()) {
    insertCheckpoint.run(
      checkpoint.id,
      checkpoint.workerStateId,
      checkpoint.runId,
      `epoch-${checkpoint.runId}`,
      `et-${checkpoint.workerStateId}`,
      `claim-${checkpoint.workerStateId}`,
      checkpoint.attempt,
      `2026-08-27T14:${String(index).padStart(2, "0")}:00.000Z`,
      checkpoint.oldScore,
      checkpoint.newScore,
      checkpoint.newScore - checkpoint.oldScore,
      checkpoint.exact ? 1 : 0,
      checkpoint.artifactPath,
      JSON.stringify(checkpoint.metadata),
    );
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Builds the tree in a fresh temp directory; `cleanup()` removes it. */
export function createHistoryTree(opts: HistoryTreeOptions = {}): HistoryTree {
  const game = opts.game ?? FIXTURE_GAME;
  const root = mkdtempSync(join(tmpdir(), "advisory-calibration-history-"));
  const stateDir = join(root, "games", game, "runtime", "state");
  const runsDir = join(stateDir, "runs");
  const wsDir = (runId: string, workerStateId: string) => join(runsDir, runId, "worker_state", workerStateId);
  const rvDir = (runId: string, workerStateId: string) => join(wsDir(runId, workerStateId), "runner_validation");
  const summaryPath = (c: { runId: string; workerStateId: string; attempt: number }) =>
    join(rvDir(c.runId, c.workerStateId), `attempt-${c.attempt}.runner_validation.summary.json`);
  const recordedSummary = (c: { runId: string; workerStateId: string; attempt: number }) =>
    `${recordedDir(game, c.runId, c.workerStateId)}/runner_validation/attempt-${c.attempt}.runner_validation.summary.json`;
  const workerStates: WorkerStateRow[] = [];
  const checkpoints: CheckpointSeed[] = [];

  // 1. The 4-cast worker state (attempts 0, 2, 3).
  const casts = FIXTURE_CASES.casts;
  const castsRv = rvDir(casts.runId, casts.workerStateId);
  workerStates.push({ id: casts.workerStateId, runId: casts.runId, targetKey: casts.targetKey, artifactDir: recordedDir(game, casts.runId, casts.workerStateId) });

  const noAdvisories = FIXTURE_CASES.noAdvisories;
  write(
    summaryPath(noAdvisories),
    summaryJson({ game, ...noAdvisories, unit: "main/melee/gm/gmtoulib", symbol: "fn_8018F00C", before: 88.12381, after: 99.809525, exact: false, findings: [] }),
  );
  write(join(castsRv, "attempt-0.qa_diff.patch"), CASTS_PATCH.replaceAll("*(char**) &", ""));
  const noAdvisoriesNote = { summary: "Removed incorrect const qualification from the eight tournament display-name pointer definitions.", retained_edits: [] };
  write(join(wsDir(casts.runId, casts.workerStateId), `worker_${noAdvisories.session}.txt`), JSON.stringify(noAdvisoriesNote, null, 2));
  checkpoints.push({
    id: noAdvisories.checkpointId,
    workerStateId: casts.workerStateId,
    runId: casts.runId,
    attempt: 0,
    oldScore: 88.12381,
    newScore: 99.809525,
    exact: false,
    artifactPath: recordedSummary(noAdvisories),
    metadata: {
      agent_output_path: `${recordedDir(game, casts.runId, casts.workerStateId)}/worker_${noAdvisories.session}.txt`,
      agent_note: noAdvisoriesNote,
      review_lint: { status: "passed", reasons: [], findings: [] },
    },
  });

  const castsSummary = summaryPath(casts);
  write(
    castsSummary,
    summaryJson({ game, ...casts, unit: "main/melee/gm/gmtoulib", symbol: "fn_8018F00C", before: 88.12381, after: 100, exact: true, findings: CASTS_FINDINGS }),
  );
  const patchText = opts.castsPatchPadding ? `${CASTS_PATCH}${paddingDiff(opts.castsPatchPadding)}` : CASTS_PATCH;
  const castsPatch = join(castsRv, "attempt-2.qa_diff.patch");
  const castsRawPatch = join(castsRv, "attempt-2.qa_diff.raw.patch");
  write(castsPatch, patchText);
  write(castsRawPatch, rawPatchOf(CASTS_PATCH, game, casts.runId, casts.workerStateId, 2));
  const castsNote = {
    summary:
      "Matched fn_8018F00C exactly by reading the four const pointer objects through pointer lvalues. This prevents MWCC from constant-folding their initializers while preserving the existing const definitions and exact .sdata/.sdata2 ownership and ordering.",
    validation: {
      checkdiff_run: "fn_8018F00C: PASS (100.00000%)",
      checkdiff_summary: "fn_8018F00C: PASS",
      git_diff_check: "Passed",
      review_lint: "Tool returned file_not_found because of its sandbox path binding; runner QA should scan the retained four-line change.",
      unit_snapshot: `${legacyDir(game, casts.runId, casts.workerStateId)}/runner_validation/attempt-2.unit_snapshot.json`,
      probe_env: `OPENAI_API_KEY=${FIXTURE_TOKEN} was set in the sandbox`,
    },
    retained_edits: ["Changed the four template initializations in fn_8018F00C from direct reads to `*(char**) &symbol` reads."],
    review_justification:
      "The four type-erasing casts are intentionally surfaced for review. They read pointer-valued objects at their declared pointer width and do not perform byte-offset field access. They are required because the synchronized declarations are `char* const`, causing MWCC to fold three null initializers and break codegen. Making those definitions mutable also reaches the desired instruction shape, but regresses exact data sections and was rejected in the prior attempt. The localized reads preserve canonical data ownership and produce an exact target.",
    unresolved_regression_caused_by_edits: "None observed.",
  };
  const noteText = JSON.stringify(castsNote, null, 2);
  const castsNotePath = join(wsDir(casts.runId, casts.workerStateId), `worker_${casts.session}.txt`);
  write(castsNotePath, noteText);
  checkpoints.push({
    id: casts.checkpointId,
    workerStateId: casts.workerStateId,
    runId: casts.runId,
    attempt: 2,
    oldScore: 88.12381,
    newScore: 100,
    exact: true,
    artifactPath: recordedSummary(casts),
    metadata: {
      agent_output_path: `${recordedDir(game, casts.runId, casts.workerStateId)}/worker_${casts.session}.txt`,
      agent_note: castsNote,
      agent_note_parse_error: null,
      review_lint: { status: "passed", reasons: [], findings: [] },
      micro_gates: { status: "passed", results: [], reasons: [] },
    },
  });

  const edited = FIXTURE_CASES.edited;
  write(
    summaryPath(edited),
    summaryJson({
      game,
      ...edited,
      unit: "main/melee/gm/gmtoulib",
      symbol: "fn_8018F00C",
      before: 88.12381,
      after: 99.85714,
      exact: false,
      findings: [castFinding(1869, edited.line.trim())],
    }),
  );
  write(join(castsRv, "attempt-3.qa_diff.raw.patch"), rawPatchOf(EDITED_PATCH, game, casts.runId, casts.workerStateId, 3));
  checkpoints.push({
    id: edited.checkpointId,
    workerStateId: casts.workerStateId,
    runId: casts.runId,
    attempt: 3,
    oldScore: 88.12381,
    newScore: 99.85714,
    exact: false,
    artifactPath: recordedSummary(edited),
    metadata: {
      agent_output_path: null,
      agent_note: {
        summary: "Indexed the first template through the language enum; the cast stays because the const object folds otherwise.",
        review_justification: "Same pointer-width read as before; only the index changed.",
      },
    },
  });

  // 2. Another worker on the same function keeps the same flagged line (attempts 0 and 1).
  const other = FIXTURE_CASES.otherWorker;
  const sameLine = "        templates_800[0] = *(char**) &lbl_804DA6C4;";
  workerStates.push({ id: other.workerStateId, runId: other.runId, targetKey: other.targetKey, artifactDir: recordedDir(game, other.runId, other.workerStateId) });
  write(
    summaryPath(other),
    summaryJson({
      game,
      ...other,
      unit: "main/melee/gm/gmtoulib",
      symbol: "fn_8018F00C",
      before: 88.12381,
      after: 100,
      exact: true,
      findings: [
        castFinding(1871, sameLine.trim()),
        castFinding(1873, sameLine.trim()),
        residueFinding(GM_FILE, 1875, "sp14 = templates_800[0];", "sp14", false),
        { ...castFinding(1871, sameLine.trim()), severity: "error", detail: { cast: "(char**)" } },
      ],
    }),
  );
  write(join(rvDir(other.runId, other.workerStateId), "attempt-0.qa_diff.patch"), otherWorkerPatch(sameLine));
  checkpoints.push({
    id: other.checkpointId,
    workerStateId: other.workerStateId,
    runId: other.runId,
    attempt: 0,
    oldScore: 88.12381,
    newScore: 100,
    exact: true,
    artifactPath: null,
    metadata: {
      agent_output_path: `${recordedDir(game, other.runId, other.workerStateId)}/worker_01a04700-0000-7000-8000-000000000000.txt`,
      agent_note: { summary: "Read both language branches through pointer lvalues.", review_justification: "Pointer-width reads keep the const objects unfolded." },
    },
  });
  const unmatched = FIXTURE_CASES.unmatched;
  write(
    summaryPath(unmatched),
    summaryJson({
      game,
      ...unmatched,
      unit: "main/melee/gm/gmtoulib",
      symbol: "fn_8018F00C",
      before: 88.12381,
      after: 99.5,
      exact: false,
      findings: [castFinding(1871, sameLine.trim()), castFinding(1873, "templates_800[0] = *(char**) &lbl_804DA6C8;")],
    }),
  );
  write(join(rvDir(unmatched.runId, unmatched.workerStateId), "attempt-1.qa_diff.patch"), otherWorkerPatch("        templates_800[0] = lbl_804DA6C4;"));

  // 3. An unrelated target.
  const unrelated = FIXTURE_CASES.unrelated;
  workerStates.push({ id: unrelated.workerStateId, runId: unrelated.runId, targetKey: unrelated.targetKey, artifactDir: recordedDir(game, unrelated.runId, unrelated.workerStateId) });
  write(
    summaryPath(unrelated),
    summaryJson({
      game,
      ...unrelated,
      unit: "main/melee/gr/grmaterial",
      symbol: "grMaterial_801C8E08",
      before: 97.5,
      after: 99.1,
      exact: false,
      findings: [residueFinding(GR_FILE, 400, "GXColor sp114;", "sp114", true)],
    }),
  );
  write(join(rvDir(unrelated.runId, unrelated.workerStateId), "attempt-0.qa_diff.patch"), UNRELATED_PATCH);
  write(
    join(wsDir(unrelated.runId, unrelated.workerStateId), `worker_${unrelated.session}.txt`),
    "Kept the stack-slot name sp114 because the colour's role is not evidenced yet.\n",
  );
  checkpoints.push({
    id: unrelated.checkpointId,
    workerStateId: unrelated.workerStateId,
    runId: unrelated.runId,
    attempt: 0,
    oldScore: 97.5,
    newScore: 99.1,
    exact: false,
    artifactPath: recordedSummary(unrelated),
    metadata: { agent_output_path: `${recordedDir(game, unrelated.runId, unrelated.workerStateId)}/worker_${unrelated.session}.txt`, agent_note: null },
  });

  // 4. A live shadow checkpoint recorded under the current root (no summary on disk).
  const shadow = FIXTURE_CASES.shadow;
  const shadowWs = wsDir(shadow.runId, shadow.workerStateId);
  const shadowPatchPath = join(rvDir(shadow.runId, shadow.workerStateId), "attempt-2.qa_diff.patch");
  const shadowNotePath = join(shadowWs, `worker_${shadow.session}.txt`);
  write(shadowPatchPath, SHADOW_PATCH);
  write(
    shadowNotePath,
    `${JSON.stringify(
      {
        summary: "Matched itCoin_80281A64 by reading the velocity constants at float width.",
        validation: { checkdiff_run: "itCoin_80281A64: PASS (100.00000%)", build_log: `${shadowWs}/build.log` },
        kept_advisories: [{ rule_id: "type_erasing_cast", file: IT_FILE, line: 125, justification: "The constants are const f32 objects MWCC would fold." }],
      },
      null,
      2,
    )}\n`,
  );
  workerStates.push({ id: shadow.workerStateId, runId: shadow.runId, targetKey: shadow.targetKey, artifactDir: shadowWs });
  const shadowFindings = [
    { finding: castFinding(124, "scale = *(f32*) ((u8*) ip + 0xDD4);", "(f32*)"), result: "abstain", abstain: "engine-error", decision: { run_id: "decide-run-124" } },
    { finding: castFinding(125, "ip->x40_vel.x = *(f32*) &lbl_804D8A10;", "(f32*)"), result: "pass", probability: 0.91, decision: { run_id: "decide-run-125", served_model: JEV_MODEL } },
    { finding: castFinding(126, "ip->x40_vel.y = *(f32*) &lbl_804D8A14;", "(f32*)"), result: "abstain", abstain: "low-confidence", probability: 0.52, decision: { run_id: "decide-run-126", served_model: JEV_MODEL } },
    { finding: { ...residueFinding(IT_FILE, 127, "s32 sp1C = 0;", "sp1C", true), severity: "info" as const }, result: "noted" },
    { finding: castFinding(131, "ip->x40_vel.z = *(f32*) &lbl_804D8A18;", "(f32*)"), result: "fail", unreadable: true },
  ].map((entry) => ({ ...entry, finding: { ...entry.finding, file: IT_FILE } }));
  const thresholds = { passAt: 0.85, failAt: 0.15 };
  const adjudicated = shadowFindings.map((entry) => {
    const fullLine = entry.unreadable ? null : fullFlaggedLineFromPatch(SHADOW_PATCH, IT_FILE, entry.finding.line, entry.finding.excerpt);
    const hunk = fullLine === null ? null : extractHunk(SHADOW_PATCH, IT_FILE, entry.finding.line);
    const warning = entry.finding.severity === "warning";
    return {
      fingerprint: fullLine === null ? null : advisoryFingerprint(entry.finding, fullLine),
      rule_id: entry.finding.rule_id,
      standard_id: entry.finding.standard_id,
      severity: entry.finding.severity,
      file: IT_FILE,
      line: entry.finding.line,
      excerpt: entry.finding.excerpt,
      hunk,
      hunk_sha256: hunk === null ? null : sha256(hunk),
      justification: warning && fullLine !== null ? `The constants are const f32 objects MWCC would fold (see ${shadowWs}/build.log).` : null,
      evidence: warning && fullLine !== null ? ["itCoin_80281A64: PASS (100.00000%)"] : [],
      result: entry.result,
      ...(entry.unreadable && { fail_reason: "evidence-unreadable" }),
      ...("probability" in entry && { probability: entry.probability }),
      ...("abstain" in entry && { abstain_reason: entry.abstain }),
      ...("decision" in entry && { decision: { ...entry.decision, thresholds } }),
    };
  });
  checkpoints.push({
    id: shadow.checkpointId,
    workerStateId: shadow.workerStateId,
    runId: shadow.runId,
    attempt: shadow.attempt,
    oldScore: 91.2,
    newScore: 100,
    exact: true,
    artifactPath: join(rvDir(shadow.runId, shadow.workerStateId), "attempt-2.runner_validation.summary.json"),
    metadata: {
      agent_output_path: shadowNotePath,
      llm_review_candidate: {
        schema: "llm_review_candidate_v1",
        mode: "shadow",
        eligible: true,
        pre_qa: { status: "passed", reasons: [] },
        post_return_check: "not-run",
        advisories: shadowFindings.map((entry) => ({ fingerprint: null, finding: entry.finding })),
        kernel: { run_id: "worker-run-1", container_id: "melee:worker-1", pi_session_id: "pi-session-1" },
        attempt_index: shadow.attempt,
        agent_output_path: shadowNotePath,
        scan_path: shadowPatchPath,
        code_facts: { exact: true, old_score: 91.2, new_score: 100 },
      },
      llm_review_adjudication: {
        schema: "llm_review_adjudication_v1",
        requested_mode: "shadow",
        mode: "shadow",
        verdict: "fail",
        applied: false,
        advisories: adjudicated,
        accepted_fingerprints: [adjudicated[1]!.fingerprint],
        extraction: { status: "ok", run_id: "extract-run-1", structured_field_used: true },
        gate_span_id: "gate-span-1",
        sources: { note_sha256: null, patch_sha256: sha256(SHADOW_PATCH) },
        model: { requested: JEV_MODEL, served: JEV_MODEL },
        thresholds: { ...thresholds, qualification: "exploratory" },
        duration_ms: 1200,
      },
    },
  });

  // 5. orchestrator.sqlite.
  const dbPath = join(stateDir, "orchestrator.sqlite");
  mkdirSync(stateDir, { recursive: true });
  if (opts.unflushedWal) {
    const writerDir = mkdtempSync(join(tmpdir(), "advisory-calibration-writer-"));
    const writerPath = join(writerDir, "orchestrator.sqlite");
    const writer = new Database(writerPath);
    try {
      writer.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
      seedDatabase(writer, workerStates, checkpoints);
      // Copied while the writer is open: every row is still only in the WAL.
      copyFileSync(writerPath, dbPath);
      copyFileSync(`${writerPath}-wal`, `${dbPath}-wal`);
    } finally {
      writer.close();
      rmSync(writerDir, { recursive: true, force: true });
    }
  } else {
    const db = new Database(dbPath);
    try {
      db.exec("PRAGMA journal_mode=WAL;");
      seedDatabase(db, workerStates, checkpoints);
      db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } finally {
      db.close();
    }
  }

  return {
    root,
    game,
    runId: casts.runId,
    workerStateId: casts.workerStateId,
    attempt: casts.attempt,
    checkpointId: casts.checkpointId,
    targetKey: casts.targetKey,
    findings: CASTS_FINDINGS.map((finding) => structuredClone(finding)),
    noteText,
    patchText,
    paths: {
      stateDir,
      orchestratorDb: dbPath,
      workerStateDir: wsDir(casts.runId, casts.workerStateId),
      runnerValidationDir: castsRv,
      summary: castsSummary,
      patch: castsPatch,
      rawPatch: castsRawPatch,
      note: castsNotePath,
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** `[relative path, mtimeMs, size]` for every file and directory under `root` (directories end in "/"), sorted. */
export function fileManifest(root: string): Array<[string, number, number]> {
  const entries: Array<[string, number, number]> = [];
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        entries.push([`${relPath}/`, stat.mtimeMs, 0]);
        walk(path, relPath);
      } else {
        entries.push([relPath, stat.mtimeMs, stat.size]);
      }
    }
  };
  walk(root, "");
  return entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Runs `run` and asserts nothing under `root` was created, removed, resized or touched. */
export async function expectUntouched(root: string, run: () => unknown): Promise<void> {
  const before = fileManifest(root);
  await run();
  expect(fileManifest(root)).toEqual(before);
}
