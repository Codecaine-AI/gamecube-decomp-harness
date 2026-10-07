// `freeze-replay --source-root <dir> --run <id> --worker-state <id> --attempt <n> --out <dir>`
// (plan §6.9, round 2 A4-F6): freezes one historical attempt into a
// committed, sanitized fixture that `replay` runs with no runtime state:
//   manifest.json                 source ids, sha256 of every file (as written and of its source), the freeze command
//   findings.json                 the attempt's llm_review findings (summary.qaLint.findings)
//   qa_diff.patch                 the attempt patch (trimmed to the findings' hunks when over 64 KB)
//   note.txt                      the worker's final message
//   checkpoint.json               the checkpoint row subset adjudication needs
//   fixture-extraction.json       the extraction `--engine replay` answers (deterministic, from the note)
//   fixture-probabilities.jsonl   the probability `--engine replay` answers per warning (fixture values, not model output)
// Absolute paths become `<source-root>/…`, secret-looking environment values
// and token-like strings are replaced. History is read only (source-root.ts).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { isAdvisoryFinding } from "@server/core/validation/qa/advisory-fingerprint.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";

import { assertKnownFlags, integerFlag, numberFlag, requiredFlag, stringFlag, type CalibrationArgs } from "./args.js";
import { fakeExtractCheckpointKnowledge } from "./fake-extractor.js";
import { createSanitizer, type Sanitize } from "./sanitize.js";
import { openSourceRoot, type SourceRoot } from "./source-root.js";
import { sha256Hex } from "./store.js";

export const REPLAY_FIXTURE_FILES = [
  "findings.json",
  "qa_diff.patch",
  "note.txt",
  "checkpoint.json",
  "fixture-extraction.json",
  "fixture-probabilities.jsonl",
] as const;
export const MAX_FIXTURE_FILE_BYTES = 64 * 1024;
/** The probability `--engine replay` answers when `--probability` is not given. */
export const DEFAULT_FIXTURE_PROBABILITY = 0.9;

export interface ReplayFixtureManifest {
  schema: "advisory_replay_fixture_v1";
  source: { game: string; run_id: string; worker_state_id: string; attempt: number; checkpoint_id: string; target_key: string | null };
  /** sha256 of each fixture file as written. */
  files: Record<string, string>;
  /** sha256 of each source as read, before sanitizing (paths sanitized). */
  sources: Record<string, { path: string; sha256: string }>;
  trimmed: string[];
  command: string;
  frozen_at: string;
  notes: string[];
}

/** Advisory ids as adjudicateAdvisories assigns them: A1, A2, … in finding order. */
export function fixtureAdvisoryId(index: number): string {
  return `A${index + 1}`;
}

export interface FixtureProbabilityRow {
  id: string;
  rule_id: string;
  file: string;
  line: number;
  probability: number;
  served_model: null;
  source: "fixture";
}

const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Keeps each file's headers and only the hunks whose new-file range holds a finding line. */
export function trimPatchToFindings(patch: string, findings: readonly QaScanFinding[]): string {
  const wanted = new Map<string, number[]>();
  for (const f of findings) wanted.set(f.file, [...(wanted.get(f.file) ?? []), f.line]);
  const out: string[] = [];
  let header: string[] = [];
  let headerEmitted = false;
  let fileLines: number[] | undefined;
  let hunk: string[] = [];
  let keep = false;
  let oldLeft = 0;
  let newLeft = 0;
  const flush = () => {
    if (hunk.length > 0 && keep) {
      if (!headerEmitted) out.push(...header);
      headerEmitted = true;
      out.push(...hunk);
    }
    hunk = [];
    keep = false;
  };
  for (const line of patch.split("\n")) {
    if (oldLeft > 0 || newLeft > 0) {
      // Inside a hunk body: counts, not prefixes, decide where it ends ("--- x" may be a removed line).
      hunk.push(line);
      if (line.startsWith("+")) newLeft -= 1;
      else if (line.startsWith("-")) oldLeft -= 1;
      else if (!line.startsWith("\\")) {
        oldLeft -= 1;
        newLeft -= 1;
      }
      continue;
    }
    if (line.startsWith("\\") && hunk.length > 0) {
      hunk.push(line);
      continue;
    }
    const match = HUNK_HEADER.exec(line);
    if (match) {
      flush();
      oldLeft = match[1] === undefined ? 1 : Number(match[1]);
      const start = Number(match[2]);
      newLeft = match[3] === undefined ? 1 : Number(match[3]);
      hunk = [line];
      keep = fileLines?.some((n) => n >= start && n < start + newLeft) ?? false;
      continue;
    }
    flush();
    if (line.startsWith("diff --git") || (line.startsWith("--- ") && header.some((h) => h.startsWith("+++ ")))) {
      header = [line];
      headerEmitted = false;
      fileLines = undefined;
      continue;
    }
    if (line.startsWith("+++ ")) {
      let path = line.slice(4).trim();
      if (path.startsWith("b/")) path = path.slice(2);
      fileLines = wanted.get(path);
    }
    if (line !== "") header.push(line);
  }
  flush();
  return `${out.join("\n")}\n`;
}

function cap(text: string, max = MAX_FIXTURE_FILE_BYTES): string {
  return Buffer.byteLength(text) <= max ? text : `${text.slice(0, max - 64)}\n… [trimmed to ${max} bytes]\n`;
}

/** Raw patches record absolute paths into the attempt's scan copies; reduce them to repo-relative paths. */
function normalizeRawPatchPaths(patch: string): string {
  return patch.replace(/^(---|\+\+\+) ([ab])\/.*?\/(?:pre_worker_source|attempt-\d+\.qa_current)\/(.*?)\t?$/gm, "$1 $2/$3");
}

interface CheckpointRow {
  id: string;
  run_id: string;
  worker_state_id: string;
  attempt_index: number;
  old_score: number | null;
  new_score: number | null;
  delta: number | null;
  exact_match: number;
  qa_status: string | null;
  validation_status: string;
  artifact_path: string | null;
  metadata_json: string;
}

export interface FreezeReplayOptions {
  source: SourceRoot;
  runId: string;
  workerStateId: string;
  attempt: number;
  outDir: string;
  probability?: number;
  sanitize?: Sanitize;
  /** Recorded in the manifest (already sanitized by the caller or not: it is sanitized here). */
  command?: string;
}

export function freezeReplay(opts: FreezeReplayOptions): ReplayFixtureManifest {
  const { source, runId, workerStateId, attempt } = opts;
  const outRel = relative(source.root, resolve(opts.outDir));
  if (outRel === "" || (!outRel.startsWith("..") && !isAbsolute(outRel))) {
    throw new Error(`freeze-replay: --out ${opts.outDir} is inside --source-root; history is read-only`);
  }
  const sanitize = opts.sanitize ?? createSanitizer({ sourceRoot: source.root });
  const runDir = join(source.runsDir, runId);
  const workerDir = join(runDir, "worker_state", workerStateId);
  if (!existsSync(runDir)) throw new Error(`freeze-replay: run ${runId} not found under ${source.runsDir}`);
  if (!existsSync(workerDir)) throw new Error(`freeze-replay: worker state ${workerStateId} not found in run ${runId}`);
  const validationDir = join(workerDir, "runner_validation");
  const summaryPath = join(validationDir, `attempt-${attempt}.runner_validation.summary.json`);
  const summaryText = source.readText(summaryPath);
  if (summaryText === null) throw new Error(`freeze-replay: no runner validation summary for attempt ${attempt}`);
  const summary = JSON.parse(summaryText) as { qaLint?: { findings?: QaScanFinding[] } };
  const findings = (summary.qaLint?.findings ?? []).filter(isAdvisoryFinding);
  if (findings.length === 0) throw new Error(`freeze-replay: attempt ${attempt} has no llm_review findings`);

  let patchPath = join(validationDir, `attempt-${attempt}.qa_diff.patch`);
  let patchText = source.readText(patchPath);
  let rawPatch = false;
  if (patchText === null) {
    patchPath = join(validationDir, `attempt-${attempt}.qa_diff.raw.patch`);
    patchText = source.readText(patchPath);
    rawPatch = true;
  }
  if (patchText === null) throw new Error(`freeze-replay: attempt ${attempt} has no qa_diff patch`);

  const store = source.openOrchestratorDb();
  let row: CheckpointRow | null;
  let targetKey: string | null;
  try {
    row = store.db
      .query(
        `SELECT id, run_id, worker_state_id, attempt_index, old_score, new_score, delta, exact_match, qa_status,
                validation_status, artifact_path, metadata_json
           FROM worker_checkpoints WHERE worker_state_id = ? AND attempt_index = ?`,
      )
      .get(workerStateId, attempt) as CheckpointRow | null;
    const state = store.db.query("SELECT target_key FROM worker_state WHERE id = ?").get(workerStateId) as { target_key: string } | null;
    targetKey = state?.target_key ?? null;
  } finally {
    store.close();
  }
  if (!row) throw new Error(`freeze-replay: no checkpoint row for worker state ${workerStateId} attempt ${attempt}`);
  if (row.run_id !== runId) throw new Error(`freeze-replay: checkpoint ${row.id} belongs to run ${row.run_id}, not ${runId}`);
  const metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;

  const outputPath = typeof metadata.agent_output_path === "string" ? source.rebase(metadata.agent_output_path) : null;
  const outputText = outputPath ? source.readText(outputPath) : null;
  const noteSource = outputText !== null ? "agent_output" : "agent_note";
  const noteRaw = outputText ?? (metadata.agent_note !== undefined && metadata.agent_note !== null ? JSON.stringify(metadata.agent_note, null, 2) : null);
  if (noteRaw === null) throw new Error(`freeze-replay: checkpoint ${row.id} has neither an agent output file nor an agent note`);

  const trimmed: string[] = [];
  let patchOut = sanitize(rawPatch ? normalizeRawPatchPaths(patchText) : patchText);
  if (Buffer.byteLength(patchOut) > MAX_FIXTURE_FILE_BYTES) {
    patchOut = cap(trimPatchToFindings(patchOut, findings));
    trimmed.push("qa_diff.patch");
  }
  let noteOut = sanitize(noteRaw);
  if (Buffer.byteLength(noteOut) > MAX_FIXTURE_FILE_BYTES) {
    noteOut = cap(noteOut);
    trimmed.push("note.txt");
  }
  const findingsOut = JSON.parse(sanitize(JSON.stringify(findings))) as QaScanFinding[];
  const checkpointOut = JSON.parse(
    sanitize(
      JSON.stringify({
        id: row.id,
        run_id: row.run_id,
        worker_state_id: row.worker_state_id,
        attempt_index: row.attempt_index,
        target_key: targetKey,
        old_score: row.old_score,
        new_score: row.new_score,
        delta: row.delta,
        exact_match: row.exact_match === 1,
        qa_status: row.qa_status,
        validation_status: row.validation_status,
        agent_note: metadata.agent_note ?? null,
        metadata_keys: Object.keys(metadata).sort(),
      }),
    ),
  ) as Record<string, unknown>;
  const refs = findingsOut.map((f, index) => ({
    id: fixtureAdvisoryId(index),
    rule_id: f.rule_id,
    severity: f.severity as "warning" | "info",
    file: f.file,
    line: f.line,
    excerpt: f.excerpt,
    message: f.message,
  }));
  const extraction = { source: "fixture", ...fakeExtractCheckpointKnowledge(noteOut, refs) };
  const probability = opts.probability ?? DEFAULT_FIXTURE_PROBABILITY;
  const probabilities: FixtureProbabilityRow[] = refs
    .filter((ref) => ref.severity === "warning")
    .map((ref) => ({ id: ref.id, rule_id: ref.rule_id, file: ref.file, line: ref.line, probability, served_model: null, source: "fixture" }));

  const contents: Record<(typeof REPLAY_FIXTURE_FILES)[number], string> = {
    "findings.json": `${JSON.stringify(findingsOut, null, 2)}\n`,
    "qa_diff.patch": patchOut,
    "note.txt": noteOut.endsWith("\n") ? noteOut : `${noteOut}\n`,
    "checkpoint.json": `${JSON.stringify(checkpointOut, null, 2)}\n`,
    "fixture-extraction.json": `${JSON.stringify(extraction, null, 2)}\n`,
    "fixture-probabilities.jsonl": probabilities.map((r) => `${JSON.stringify(r)}\n`).join(""),
  };
  mkdirSync(opts.outDir, { recursive: true });
  const files: Record<string, string> = {};
  for (const name of REPLAY_FIXTURE_FILES) {
    writeFileSync(join(opts.outDir, name), contents[name]);
    files[name] = sha256Hex(contents[name]);
  }
  const shown = (path: string) => sanitize(path);
  const manifest: ReplayFixtureManifest = {
    schema: "advisory_replay_fixture_v1",
    source: { game: source.game, run_id: runId, worker_state_id: workerStateId, attempt, checkpoint_id: row.id, target_key: targetKey },
    files,
    sources: {
      summary: { path: shown(summaryPath), sha256: sha256Hex(summaryText) },
      patch: { path: shown(patchPath), sha256: sha256Hex(patchText) },
      note: { path: shown(outputPath ?? `${row.id}:metadata.agent_note`), sha256: sha256Hex(noteRaw) },
      checkpoint: { path: "<source-root>/" + source.relative(source.orchestratorDbPath) + `#worker_checkpoints/${row.id}`, sha256: sha256Hex(row.metadata_json) },
    },
    trimmed,
    command: sanitize(
      opts.command ??
        `advisory-calibration freeze-replay --source-root ${source.root} --game ${source.game} --run ${runId} --worker-state ${workerStateId} --attempt ${attempt} --out ${opts.outDir}`,
    ),
    frozen_at: new Date().toISOString(),
    notes: [
      `note.txt is the worker's final message (${noteSource === "agent_output" ? "agent_output_path" : "metadata.agent_note"}).`,
      "fixture-extraction.json and fixture-probabilities.jsonl are deterministic fixture values for --engine replay, not model output.",
    ],
  };
  writeFileSync(join(opts.outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function freezeReplayCommand(args: CalibrationArgs, print: (line: string) => void = console.log): Promise<ReplayFixtureManifest> {
  assertKnownFlags(args, ["--source-root", "--game", "--run", "--worker-state", "--attempt", "--out", "--probability"]);
  const attempt = integerFlag(args, "--attempt");
  if (attempt === undefined) throw new Error("advisory-calibration freeze-replay: --attempt is required");
  const probability = numberFlag(args, "--probability");
  if (probability !== undefined && (probability < 0 || probability > 1)) throw new Error("advisory-calibration freeze-replay: --probability must be in [0, 1]");
  const source = openSourceRoot(requiredFlag(args, "--source-root"), stringFlag(args, "--game") ?? "melee");
  const outDir = resolve(requiredFlag(args, "--out"));
  const manifest = freezeReplay({
    source,
    runId: requiredFlag(args, "--run"),
    workerStateId: requiredFlag(args, "--worker-state"),
    attempt,
    outDir,
    ...(probability !== undefined && { probability }),
    command: `advisory-calibration freeze-replay --source-root ${source.root} --game ${source.game} --run ${requiredFlag(args, "--run")} --worker-state ${requiredFlag(args, "--worker-state")} --attempt ${attempt} --out ${requiredFlag(args, "--out")}`,
  });
  print(`freeze-replay: ${Object.keys(manifest.files).length} files → ${outDir}${manifest.trimmed.length ? ` (trimmed: ${manifest.trimmed.join(", ")})` : ""}`);
  return manifest;
}
