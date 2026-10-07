// `shadow-export`: turns live shadow results (`worker_checkpoints.metadata_json
// .llm_review_adjudication`, plan §6.4) into calibration data (plan §6.9):
// one item per adjudicated advisory with a fingerprint, the worker note, an
// extraction record from the adjudication's justification, and a replay run
// file (`runs/<served model>/<iso>.shadow.jsonl`) with the recorded decision
// probabilities. Reads `--source-root` read-only; writes only under `--dir`.
import { join } from "node:path";

import type {
  AdjudicatedAdvisory,
  AdvisoryAdjudication,
  LlmReviewCandidate,
} from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/types.js";
import { fullFlaggedLineFromPatch, normalizeAdvisoryPath } from "@server/core/validation/qa/advisory-fingerprint.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";

import { assertKnownFlags, requiredFlag, stringFlag, type CalibrationArgs } from "./args.js";
import {
  assertOutsideSourceRoot,
  byId,
  calibrationFinding,
  calibrationItemId,
  codeFactsOfRow,
  finiteOrNull,
  isRecord,
  isScanFinding,
  mergeNotes,
  normalizePatchHeaders,
  noteRecord,
  readCheckpointNote,
  readRecordedText,
  referencedNoteKeys,
  type CheckpointRow,
} from "./build-dataset.js";
import { baseGroupKey } from "./groups.js";
import { assertNoShortSecrets, createSanitizer, type Sanitize } from "./sanitize.js";
import { openSourceRoot, type SourceRoot } from "./source-root.js";
import { appendJsonl, calibrationPaths, DEFAULT_CALIBRATION_DIR, latestById, readJsonl, writeJsonl } from "./store.js";
import type { CalibrationItem, CodeFacts, ExtractionRecord, NoteRecord, ProbabilityRow } from "./types.js";

/** Abstains whose probability is not a model answer. */
const NO_PROBABILITY_REASONS = new Set(["engine-error", "refusal"]);

type ShadowCheckpointRow = Omit<CheckpointRow, "artifact_path"> & { target_key: string | null };

export interface ShadowExport {
  items: CalibrationItem[];
  notes: NoteRecord[];
  /** Extraction records for every exported item (written only for items without one). */
  extractions: ExtractionRecord[];
  /** Probability rows per served model. */
  runs: Map<string, ProbabilityRow[]>;
  stats: {
    checkpoints: number;
    advisories: number;
    /** Adjudicated advisories without a fingerprint (unreadable flagged line). */
    unfingerprinted: number;
    items: number;
    notes: number;
  };
}

function parse(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isAdjudication(value: unknown): value is AdvisoryAdjudication {
  return isRecord(value) && value.schema === "llm_review_adjudication_v1" && Array.isArray(value.advisories);
}

function isAdjudicated(value: unknown): value is AdjudicatedAdvisory {
  return (
    isRecord(value) &&
    (value.severity === "warning" || value.severity === "info") &&
    typeof value.rule_id === "string" &&
    typeof value.file === "string" &&
    Number.isSafeInteger(value.line) &&
    typeof value.excerpt === "string"
  );
}

function candidateFinding(candidate: Partial<LlmReviewCandidate> | null, advisory: AdjudicatedAdvisory): QaScanFinding | null {
  if (!candidate || !Array.isArray(candidate.advisories)) return null;
  const file = normalizeAdvisoryPath(advisory.file);
  for (const entry of candidate.advisories) {
    const finding = isRecord(entry) ? entry.finding : null;
    if (isScanFinding(finding) && finding.rule_id === advisory.rule_id && finding.line === advisory.line && normalizeAdvisoryPath(finding.file) === file) {
      return finding;
    }
  }
  return null;
}

function candidateCodeFacts(candidate: Partial<LlmReviewCandidate> | null): CodeFacts | null {
  const facts = candidate?.code_facts;
  if (!isRecord(facts)) return null;
  return { exact: facts.exact === true, old_score: finiteOrNull(facts.old_score), new_score: finiteOrNull(facts.new_score) };
}

/** `runs/` subpath of a model ref: provider segments kept, anything unsafe replaced. */
export function modelRunDir(model: string): string[] {
  const segments = model
    .split("/")
    .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, "_"))
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..");
  return segments.length > 0 ? segments : ["unknown"];
}

/** The probability row of a decided warning; null for info advisories and undecided warnings. */
function probabilityRow(id: string, advisory: AdjudicatedAdvisory, adjudication: AdvisoryAdjudication): ProbabilityRow | null {
  if (advisory.severity !== "warning") return null;
  const probability = finiteOrNull(advisory.probability);
  if (!isRecord(advisory.decision) && probability === null) return null;
  const abstainReason = typeof advisory.abstain_reason === "string" ? advisory.abstain_reason : undefined;
  const served = advisory.decision?.served_model ?? adjudication.model?.served ?? null;
  return {
    id,
    probability: abstainReason !== undefined && NO_PROBABILITY_REASONS.has(abstainReason) ? null : probability,
    served_model: typeof served === "string" && served ? served : null,
    ...(abstainReason !== undefined && { abstain_reason: abstainReason }),
  };
}

/** Reads every adjudicated checkpoint under `source`. Read-only. */
export function collectShadowResults(opts: { source: SourceRoot; sanitize: Sanitize; now?: string }): ShadowExport {
  const { source, sanitize } = opts;
  const now = opts.now ?? new Date().toISOString();
  const items = new Map<string, CalibrationItem>();
  const notes = new Map<string, NoteRecord>();
  const extractions = new Map<string, ExtractionRecord>();
  const runs = new Map<string, ProbabilityRow[]>();
  const seenRows = new Set<string>();
  const stats = { checkpoints: 0, advisories: 0, unfingerprinted: 0, items: 0, notes: 0 };
  const store = source.openOrchestratorDb();
  try {
    const rows = store.db
      .query<ShadowCheckpointRow, []>(`
        SELECT c.id, c.run_id, c.worker_state_id, c.attempt_index, c.old_score, c.new_score, c.exact_match, c.metadata_json,
          w.target_key
        FROM worker_checkpoints c LEFT JOIN worker_state w ON w.id = c.worker_state_id
        WHERE instr(c.metadata_json, '"llm_review_adjudication"') > 0
          AND CASE WHEN json_valid(c.metadata_json)
                THEN json_extract(c.metadata_json, '$.llm_review_adjudication.schema') = 'llm_review_adjudication_v1'
                ELSE 0 END
        ORDER BY c.validation_time, c.id`)
      .all();
    for (const row of rows) {
      const metadata = parse(row.metadata_json);
      if (!isRecord(metadata) || !isAdjudication(metadata.llm_review_adjudication)) continue;
      const adjudication = metadata.llm_review_adjudication;
      const candidate = isRecord(metadata.llm_review_candidate) ? (metadata.llm_review_candidate as Partial<LlmReviewCandidate>) : null;
      stats.checkpoints += 1;

      const targetKey = row.target_key ?? `ws:${row.worker_state_id}`;
      const codeFacts = candidateCodeFacts(candidate) ?? codeFactsOfRow(row);
      const note = readCheckpointNote(source, metadata, candidate?.agent_output_path);
      const patchText = readRecordedText(source, candidate?.scan_path);
      const files = adjudication.advisories.filter(isAdjudicated).map((advisory) => advisory.file);
      const patch = patchText?.trim() ? normalizePatchHeaders(patchText, files) : null;
      const extractionOk = adjudication.extraction?.status === "ok";

      let produced = false;
      for (const advisory of adjudication.advisories) {
        if (!isAdjudicated(advisory)) continue;
        stats.advisories += 1;
        if (typeof advisory.fingerprint !== "string" || !advisory.fingerprint) {
          stats.unfingerprinted += 1;
          continue;
        }
        const id = calibrationItemId(advisory.fingerprint, row.id);
        produced = true;
        if (items.has(id)) continue;
        const scanned = candidateFinding(candidate, advisory);
        const fullLine = (patch === null ? null : fullFlaggedLineFromPatch(patch, advisory.file, advisory.line, advisory.excerpt)) ?? advisory.excerpt;
        const finding = calibrationFinding({
          rule_id: advisory.rule_id,
          severity: advisory.severity,
          standard_id: advisory.standard_id ?? scanned?.standard_id ?? null,
          file: advisory.file,
          line: advisory.line,
          excerpt: advisory.excerpt,
          message: scanned?.message ?? "",
          ...(scanned?.detail !== undefined && { detail: scanned.detail }),
        });
        items.set(id, {
          schema: "advisory_calibration_item_v1",
          id,
          source: "shadow",
          synthetic: false,
          fingerprint: advisory.fingerprint,
          checkpoint_id: row.id,
          run_id: row.run_id,
          worker_state_id: row.worker_state_id,
          attempt_index: row.attempt_index,
          target_key: targetKey,
          finding,
          full_line: fullLine,
          hunk: typeof advisory.hunk === "string" ? sanitize(advisory.hunk) : null,
          note_key: note ? row.id : null,
          code_facts: codeFacts,
          group_key: baseGroupKey(targetKey, advisory.rule_id, fullLine),
        });
        // An extraction that failed says nothing about the note, so only a successful one is recorded.
        if (extractionOk) {
          const justification = typeof advisory.justification === "string" && advisory.justification.trim() ? sanitize(advisory.justification) : null;
          extractions.set(id, {
            id,
            justification,
            evidence: Array.isArray(advisory.evidence) ? advisory.evidence.filter((e) => typeof e === "string").map(sanitize) : [],
            kept: justification !== null,
            structured_field_used: adjudication.extraction.structured_field_used === true,
            source: "shadow",
            ...(adjudication.extraction.run_id !== undefined && { run_id: adjudication.extraction.run_id }),
            extracted_at: now,
          });
        }
        const probability = probabilityRow(id, advisory, adjudication);
        if (probability && !seenRows.has(id)) {
          seenRows.add(id);
          const model = probability.served_model ?? (adjudication.model?.requested || "unknown");
          let list = runs.get(model);
          if (!list) runs.set(model, (list = []));
          list.push(probability);
        }
      }
      if (produced && note) {
        notes.set(row.id, noteRecord(row.id, { checkpointId: row.id, workerStateId: row.worker_state_id, attempt: row.attempt_index }, note, sanitize));
      }
    }
  } finally {
    store.close();
  }
  stats.items = items.size;
  stats.notes = notes.size;
  return {
    items: [...items.values()].sort(byId),
    notes: [...notes.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    extractions: [...extractions.values()].sort(byId),
    runs: new Map([...runs.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([model, list]) => [model, list.sort(byId)])),
    stats,
  };
}

export interface ShadowExportResult {
  dir: string;
  export: ShadowExport;
  /** Extraction records appended (items that had none). */
  appendedExtractions: number;
  /** Replay run files written, one per served model. */
  runFiles: string[];
}

/** `2026-10-07T14-03-11Z`: an ISO timestamp safe in a file name. */
export function runFileStamp(date: Date = new Date()): string {
  return date.toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
}

export async function shadowExportCommand(args: CalibrationArgs, print: (line: string) => void = console.log): Promise<ShadowExportResult> {
  assertKnownFlags(args, ["--source-root", "--game", "--dir"]);
  const source = openSourceRoot(requiredFlag(args, "--source-root"), stringFlag(args, "--game") ?? "melee");
  const paths = calibrationPaths(stringFlag(args, "--dir") ?? DEFAULT_CALIBRATION_DIR);
  assertOutsideSourceRoot([paths.dir, paths.candidates, paths.notes, paths.extractions, paths.runs], source, args.command);
  const date = new Date();
  const sanitize = createSanitizer({ sourceRoot: source.root });
  const exported = collectShadowResults({ source, sanitize, now: date.toISOString() });
  assertNoShortSecrets(sanitize, `advisory-calibration ${args.command}`);

  // A history item for the same advisory and checkpoint wins: it carries the summary's finding and the attempt hunk.
  const merged = new Map<string, CalibrationItem>(readJsonl<CalibrationItem>(paths.candidates).map((row) => [row.id, row]));
  for (const item of exported.items) if (merged.get(item.id)?.source !== "history") merged.set(item.id, item);
  const items = [...merged.values()].sort(byId);
  writeJsonl(paths.candidates, items);
  writeJsonl(paths.notes, mergeNotes(readJsonl<NoteRecord>(paths.notes), exported.notes, referencedNoteKeys(items, paths.synthetic)));

  const known = latestById(readJsonl<ExtractionRecord>(paths.extractions));
  let appendedExtractions = 0;
  for (const record of exported.extractions) {
    if (known.has(record.id)) continue;
    appendJsonl(paths.extractions, record);
    appendedExtractions += 1;
  }

  const stamp = runFileStamp(date);
  const runFiles: string[] = [];
  for (const [model, rows] of exported.runs) {
    const file = join(paths.runs, ...modelRunDir(model), `${stamp}.shadow.jsonl`);
    assertOutsideSourceRoot(file, source, args.command);
    writeJsonl(file, rows);
    runFiles.push(file);
  }

  const s = exported.stats;
  const probabilityRows = [...exported.runs.values()].reduce((sum, rows) => sum + rows.length, 0);
  print(
    `shadow-export: ${s.checkpoints} adjudicated checkpoints, ${s.advisories} advisories (${s.unfingerprinted} without fingerprint), ` +
      `${s.items} items, ${s.notes} notes, ${appendedExtractions} extractions appended, ` +
      `${probabilityRows} probability rows in ${runFiles.length} run files → ${paths.dir}`,
  );
  return { dir: paths.dir, export: exported, appendedExtractions, runFiles };
}
