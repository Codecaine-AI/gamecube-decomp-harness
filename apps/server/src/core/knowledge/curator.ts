import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openState } from "@server/core/session-runtime/run-state";
import { knowledgeCuratorEnrichmentPath, pastPrsRoot } from "./paths.js";
import type { TrustTier } from "./graph/types.js";
import { arrayValue, ensureParentDir, numberValue, objectValue, readJsonl, shortHash, stringValue, truncate } from "./graph/util.js";

export const KNOWLEDGE_CURATOR_ENRICHMENT_ID = "curator_enrichment";
export const KNOWLEDGE_CURATOR_SCHEMA_VERSION = "knowledge_curator_enrichment_v1";

export type CuratedKnowledgeKind = "worker_lesson" | "pr_lesson" | "source_update_proposal";

export interface CuratedKnowledgeRecord {
  schema_version: typeof KNOWLEDGE_CURATOR_SCHEMA_VERSION;
  id: string;
  kind: CuratedKnowledgeKind;
  status: "accepted" | "proposal" | "rejected";
  trust_tier: TrustTier;
  confidence: number;
  source_path?: string;
  unit?: string;
  symbol?: string;
  title: string;
  text: string;
  evidence_ref: string;
  created_at?: string;
  payload: Record<string, unknown>;
}

export interface CurateKnowledgeOptions {
  repoRoot: string;
  stateDir: string;
  outputPath?: string;
  runId?: string;
  workerLimit?: number;
  prLimit?: number;
  includeStalled?: boolean;
}

export interface CurateKnowledgeResult {
  output_path: string;
  records_written: number;
  worker_lessons: number;
  pr_lessons: number;
  source_update_proposals: number;
  skipped_worker_states: number;
}

export interface AppendCuratedKnowledgeRecordsResult {
  output_path: string;
  records_written: number;
  appended_records: number;
}

export function classifySourceUpdateProposal(input: {
  title?: string;
  text?: string;
  evidence_ref?: string;
  evidence_refs?: string[];
  source_path?: string;
}): Record<string, unknown> | null {
  const targetSourceId = targetSourceForText(`${input.title ?? ""}\n${input.text ?? ""}`);
  if (!targetSourceId) return null;
  return {
    target_source_id: targetSourceId,
    update_kind: sourceUpdateKind(targetSourceId),
    mutation_policy: "proposal_only",
    evidence_refs: input.evidence_refs ?? (input.evidence_ref ? [input.evidence_ref] : []),
    source_path: input.source_path ?? null,
    reason: sourceUpdateReason(targetSourceId),
  };
}

type WorkerStateLessonRow = Record<string, unknown>;

export function curateKnowledgeEnrichments(options: CurateKnowledgeOptions): CurateKnowledgeResult {
  const outputPath = resolve(options.outputPath ?? knowledgeCuratorEnrichmentPath());
  const workerRecords = workerLessonRecords(options);
  const prRecords = prLessonRecords(options);
  const sourceUpdateRecords = sourceUpdateProposalRecords([...workerRecords, ...prRecords]);
  const preservedRecords = preservedCuratorAgentRecords(outputPath);
  const records = dedupeRecords([...workerRecords, ...prRecords, ...sourceUpdateRecords, ...preservedRecords]).sort((left, right) => left.id.localeCompare(right.id));

  ensureParentDir(outputPath);
  writeFileSync(outputPath, records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "", "utf8");

  return {
    output_path: outputPath,
    records_written: records.length,
    worker_lessons: records.filter((record) => record.kind === "worker_lesson").length,
    pr_lessons: records.filter((record) => record.kind === "pr_lesson").length,
    source_update_proposals: records.filter((record) => record.kind === "source_update_proposal").length,
    skipped_worker_states: Number(workerRecords.skipped ?? 0),
  };
}

export function curatedPrRecordsForPostmortem(postmortemPath: string): CuratedKnowledgeRecord[] {
  const postmortem = readJsonObject(postmortemPath);
  if (!Object.keys(postmortem).length) return [];
  return prRecordsFromPostmortem(postmortem, resolve(postmortemPath), {});
}

export function appendCuratedKnowledgeRecords(outputPath: string, records: CuratedKnowledgeRecord[]): AppendCuratedKnowledgeRecordsResult {
  const resolvedOutputPath = resolve(outputPath);
  const existing = existingCuratedKnowledgeRecords(resolvedOutputPath);
  const next = dedupeRecords([...existing, ...records]).sort((left, right) => left.id.localeCompare(right.id));
  ensureParentDir(resolvedOutputPath);
  writeFileSync(resolvedOutputPath, next.length ? `${next.map((record) => JSON.stringify(record)).join("\n")}\n` : "", "utf8");
  return {
    output_path: resolvedOutputPath,
    records_written: next.length,
    appended_records: records.length,
  };
}

function workerLessonRecords(options: CurateKnowledgeOptions): CuratedKnowledgeRecord[] & { skipped?: number } {
  const records = [] as CuratedKnowledgeRecord[] & { skipped?: number };
  let skipped = 0;
  if (!existsSync(options.stateDir)) {
    records.skipped = 0;
    return records;
  }

  const store = openState(options.stateDir);
  try {
    const limit = nonNegativeLimit(options.workerLimit, 250);
    const where = options.runId ? "WHERE worker_state.run_id = ?" : "";
    const rows = store.db
      .query(
        `
          SELECT
            worker_state.id AS worker_state_id,
            worker_state.run_id,
            worker_state.epoch_id,
            worker_state.epoch_target_id,
            worker_state.target_claim_id,
            worker_state.worker_id,
            worker_state.lifecycle_status,
            worker_state.artifact_dir,
            worker_state.started_at,
            worker_state.ended_at,
            worker_state.baseline_score,
            worker_state.best_checkpoint_id,
            worker_state.best_score,
            worker_state.exact,
            worker_state.timeout_summary,
            worker_state.error_summary,
            worker_state.summary_json,
            epoch_targets.unit,
            epoch_targets.symbol,
            epoch_targets.source_path,
            best.id AS best_checkpoint_id,
            best.validation_status AS best_validation_status,
            best.artifact_path AS best_artifact_path,
            best.patch_path AS best_patch_path,
            best.failure_reasons_json AS best_failure_reasons_json,
            best.metadata_json AS best_metadata_json,
            latest.id AS latest_checkpoint_id,
            latest.validation_status AS latest_validation_status,
            latest.artifact_path AS latest_artifact_path,
            latest.patch_path AS latest_patch_path,
            latest.failure_reasons_json AS latest_failure_reasons_json,
            latest.metadata_json AS latest_metadata_json
          FROM worker_state
          LEFT JOIN epoch_targets ON epoch_targets.id = worker_state.epoch_target_id
          LEFT JOIN worker_checkpoints AS best ON best.id = worker_state.best_checkpoint_id
          LEFT JOIN worker_checkpoints AS latest ON latest.id = (
            SELECT id
            FROM worker_checkpoints
            WHERE worker_checkpoints.worker_state_id = worker_state.id
            ORDER BY validation_time DESC, attempt_index DESC
            LIMIT 1
          )
          ${where}
          ORDER BY COALESCE(worker_state.ended_at, worker_state.started_at) DESC
          LIMIT ?
        `,
      )
      .all(...(options.runId ? [options.runId, limit] : [limit])) as WorkerStateLessonRow[];

    for (const row of rows) {
      const record = workerStateRecordFromRow(row, options);
      if (record) records.push(record);
      else skipped += 1;
    }
  } finally {
    store.db.close();
  }

  records.skipped = skipped;
  return records;
}

function workerStateRecordFromRow(row: WorkerStateLessonRow, options: CurateKnowledgeOptions): CuratedKnowledgeRecord | null {
  const lifecycleStatus = stringValue(row.lifecycle_status);
  const bestCheckpointId = stringValue(row.best_checkpoint_id);
  if (!options.includeStalled && lifecycleStatus !== "exact" && !bestCheckpointId) return null;

  const summary = jsonObjectValue(row.summary_json);
  const summaryPath = workerStateSummaryPath(row, summary);
  const target = objectValue(summary.target);
  const sourcePath = stringValue(target.source_path, stringValue(row.source_path));
  const unit = stringValue(target.unit, stringValue(row.unit));
  const symbol = stringValue(target.symbol, stringValue(row.symbol));
  if (!sourcePath && !symbol) return null;

  const facts = arrayValue(summary.facts);
  const blockers = arrayValue(summary.blockers);
  const runnerValidation = runnerValidationFromRow(row, summary);
  const continuationAttempts = objectValue(summary.continuation_attempts);
  const validationStatus = stringValue(runnerValidation.status, "skipped");
  const validationFailed = validationStatus !== "" && validationStatus !== "passed" && validationStatus !== "skipped";
  const selected = lifecycleStatus === "exact" || Boolean(bestCheckpointId);
  const status = selected && !validationFailed ? "accepted" : "proposal";
  const confidence = status === "accepted" ? 0.8 : lifecycleStatus === "error" || validationFailed ? 0.2 : 0.3;
  const summaryText =
    stringValue(summary.summary) ||
    stringValue(row.timeout_summary) ||
    stringValue(row.error_summary) ||
    "Worker state was persisted for curator review.";
  const text = [
    sourcePath,
    unit,
    symbol,
    lifecycleStatus,
    validationStatus,
    summaryText,
    facts.map((fact) => compactJson(fact)).join("\n"),
    blockers.map((blocker) => compactJson(blocker)).join("\n"),
  ]
    .filter(Boolean)
    .join("\n");

  const workerStateId = stringValue(row.worker_state_id, shortHash(`${summaryPath}:${text}`));
  const workerCheckpointId = bestCheckpointId || stringValue(row.latest_checkpoint_id);
  return {
    schema_version: KNOWLEDGE_CURATOR_SCHEMA_VERSION,
    id: `worker_lesson:${workerStateId}`,
    kind: "worker_lesson",
    status,
    trust_tier: "local",
    confidence,
    source_path: sourcePath || undefined,
    unit: unit || undefined,
    symbol: symbol || undefined,
    title: `Worker ${lifecycleStatus || "state"} for ${symbol || sourcePath}`,
    text: truncate(text, 4000),
    evidence_ref: summaryPath || `worker_state:${workerStateId}`,
    created_at: stringValue(row.ended_at, stringValue(row.started_at)) || undefined,
    payload: {
      worker_state_id: workerStateId,
      worker_checkpoint_id: workerCheckpointId || null,
      run_id: stringValue(row.run_id, stringValue(summary.run_id)),
      epoch_id: stringValue(row.epoch_id, stringValue(summary.epoch_id)),
      epoch_target_id: stringValue(row.epoch_target_id, stringValue(summary.epoch_target_id)),
      target_claim_id: stringValue(row.target_claim_id, stringValue(summary.target_claim_id)),
      worker_id: stringValue(row.worker_id, stringValue(summary.worker_id)),
      lifecycle_status: lifecycleStatus,
      validation_status: validationStatus,
      summary: summaryText,
      facts,
      blockers,
      runner_validation: runnerValidation,
      continuation_attempts: continuationAttempts,
      patch_path: stringValue(row.best_patch_path, stringValue(row.latest_patch_path)) || null,
      selected_checkpoint: checkpointPayload(row, "best"),
      latest_checkpoint: checkpointPayload(row, "latest"),
    },
  };
}

function prLessonRecords(options: CurateKnowledgeOptions): CuratedKnowledgeRecord[] {
  const root = pastPrsRoot();
  const indexPath = resolve(root, "library/index.jsonl");
  const records: CuratedKnowledgeRecord[] = [];
  for (const row of readJsonl(indexPath, nonNegativeLimit(options.prLimit, 500))) {
    const postmortemRel = stringValue(row.postmortem_json);
    if (!postmortemRel) continue;
    const postmortemPath = resolve(root, postmortemRel);
    const postmortem = readJsonObject(postmortemPath);
    if (!Object.keys(postmortem).length) continue;
    records.push(...prRecordsFromPostmortem(postmortem, postmortemPath, row));
  }
  return records;
}

function prRecordsFromPostmortem(postmortem: Record<string, unknown>, postmortemPath: string, row: Record<string, unknown>): CuratedKnowledgeRecord[] {
  const records: CuratedKnowledgeRecord[] = [];
  const pr = objectValue(postmortem.pr);
  const prNumber = numberValue(pr.number, numberValue(row.pr));
  const title = stringValue(pr.title, stringValue(row.title, `PR ${prNumber}`));
  const keyFiles = arrayValue(postmortem.key_files).map(objectValue);
  const fileTargets = keyFiles.length > 0 ? keyFiles : [{ path: "" }];
  for (const keyFile of fileTargets) {
    const sourcePath = stringValue(keyFile.path);
    const lessonText = prLessonText(postmortem, sourcePath);
    if (!lessonText.trim()) continue;
    const agentStatus = stringValue(postmortem.agent_status);
    const accepted = agentStatus === "agent_completed";
    records.push({
      schema_version: KNOWLEDGE_CURATOR_SCHEMA_VERSION,
      id: `pr_lesson:${prNumber}:${shortHash(`${sourcePath}:${lessonText}`)}`,
      kind: "pr_lesson",
      status: accepted ? "accepted" : "proposal",
      trust_tier: "historical",
      confidence: accepted ? clampConfidence(numberValue(postmortem.confidence, 0.65)) : 0.35,
      source_path: sourcePath || undefined,
      title: `Curated PR ${prNumber} lesson${sourcePath ? ` for ${sourcePath}` : ""}`,
      text: truncate(`${title}\n${lessonText}`, 4000),
      evidence_ref: postmortemPath,
      created_at: stringValue(pr.merged_at, stringValue(pr.created_at)) || undefined,
      payload: {
        pr: prNumber,
        title,
        url: stringValue(pr.url),
        agent_status: agentStatus,
        source_path: sourcePath || null,
        key_file_role: stringValue(keyFile.role) || null,
        summary: stringValue(postmortem.summary),
        decomp_lessons: arrayValue(postmortem.decomp_lessons),
        assembly_or_matching_tactics: arrayValue(postmortem.assembly_or_matching_tactics),
        naming_conventions: arrayValue(postmortem.naming_conventions),
        review_feedback: arrayValue(postmortem.review_feedback),
        searchable_terms: arrayValue(postmortem.searchable_terms),
      },
    });
  }
  return records;
}

export function sourceUpdateProposalRecords(records: CuratedKnowledgeRecord[]): CuratedKnowledgeRecord[] {
  const proposals: CuratedKnowledgeRecord[] = [];
  for (const record of records) {
    const targetSourceId = targetSourceForRecord(record);
    if (!targetSourceId) continue;
    proposals.push({
      schema_version: KNOWLEDGE_CURATOR_SCHEMA_VERSION,
      id: `source_update_proposal:${targetSourceId}:${shortHash(`${record.id}:${record.text}`)}`,
      kind: "source_update_proposal",
      status: "proposal",
      trust_tier: record.trust_tier,
      confidence: Math.min(record.confidence, 0.45),
      source_path: record.source_path,
      unit: record.unit,
      symbol: record.symbol,
      title: `Review ${targetSourceId} update from ${record.kind}`,
      text: truncate(record.text, 2000),
      evidence_ref: record.evidence_ref,
      created_at: record.created_at,
      payload: {
        target_source_id: targetSourceId,
        update_kind: sourceUpdateKind(targetSourceId),
        parent_record_id: record.id,
        mutation_policy: "proposal_only",
        evidence_refs: [record.evidence_ref],
        source_path: record.source_path ?? null,
        reason: sourceUpdateReason(targetSourceId),
      },
    });
  }
  return proposals;
}

function existingCuratedKnowledgeRecords(path: string): CuratedKnowledgeRecord[] {
  if (!existsSync(path)) return [];
  const records: CuratedKnowledgeRecord[] = [];
  for (const row of readJsonl(path, 1_000_000)) {
    if (isCuratedKnowledgeRecord(row)) records.push(row);
  }
  return records;
}

function preservedCuratorAgentRecords(path: string): CuratedKnowledgeRecord[] {
  return existingCuratedKnowledgeRecords(path).filter(
    (record) =>
      record.id.startsWith("source_update_proposal:curator_agent:") ||
      record.id.startsWith("source_update_proposal:preship_reviewer:"),
  );
}

function isCuratedKnowledgeRecord(value: unknown): value is CuratedKnowledgeRecord {
  const record = objectValue(value);
  const kind = stringValue(record.kind);
  const status = stringValue(record.status);
  return (
    record.schema_version === KNOWLEDGE_CURATOR_SCHEMA_VERSION &&
    typeof record.id === "string" &&
    (kind === "worker_lesson" || kind === "pr_lesson" || kind === "source_update_proposal") &&
    (status === "accepted" || status === "proposal" || status === "rejected") &&
    typeof record.title === "string" &&
    typeof record.text === "string" &&
    typeof record.evidence_ref === "string" &&
    Boolean(objectValue(record.payload))
  );
}

function targetSourceForRecord(record: CuratedKnowledgeRecord): string | null {
  return targetSourceForText(`${record.title}\n${record.text}`);
}

function targetSourceForText(value: string): string | null {
  const text = value.toLowerCase();
  if (/\b(global standard|decomp standard|qa standard|review standard|standards source|global rule)\b/i.test(text)) {
    return "decomp_standards";
  }
  return null;
}

function sourceUpdateKind(targetSourceId: string): string {
  if (targetSourceId === "decomp_standards") return "global_standard";
  return "source_update";
}

function sourceUpdateReason(targetSourceId: string): string {
  if (targetSourceId === "decomp_standards") return "Evidence proposes a broad decomp/review standard; standards source owner should review before changing global injected rules.";
  return "Evidence references source-like terms; source owner should review before mutating registered source data.";
}

function prLessonText(postmortem: Record<string, unknown>, sourcePath: string): string {
  const parts = [
    stringValue(postmortem.summary),
    sourcePath,
    labeledArray("Decomp lessons", postmortem.decomp_lessons),
    labeledArray("Matching tactics", postmortem.assembly_or_matching_tactics),
    labeledArray("Naming", postmortem.naming_conventions),
    labeledArray("Review", postmortem.review_feedback),
    labeledArray("Terms", postmortem.searchable_terms),
  ];
  return parts.filter(Boolean).join("\n");
}

function labeledArray(label: string, value: unknown): string {
  const items = arrayValue(value)
    .map((item) => String(item).trim())
    .filter(Boolean);
  return items.length ? `${label}: ${items.join("; ")}` : "";
}

function jsonObjectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return objectValue(JSON.parse(value) as unknown);
  } catch {
    return {};
  }
}

function stringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function workerStateSummaryPath(row: Record<string, unknown>, summary: Record<string, unknown>): string {
  const explicit = stringValue(summary.summary_path);
  if (explicit) return explicit;
  const artifactDir = stringValue(row.artifact_dir);
  return artifactDir ? resolve(artifactDir, "state", "worker_state.json") : "";
}

function checkpointPayload(row: Record<string, unknown>, prefix: "best" | "latest"): Record<string, unknown> | null {
  const id = stringValue(row[`${prefix}_checkpoint_id`]);
  if (!id) return null;
  return {
    id,
    validation_status: stringValue(row[`${prefix}_validation_status`]),
    artifact_path: stringValue(row[`${prefix}_artifact_path`]) || null,
    patch_path: stringValue(row[`${prefix}_patch_path`]) || null,
    failure_reasons: stringArrayValue(row[`${prefix}_failure_reasons_json`]),
    metadata: jsonObjectValue(row[`${prefix}_metadata_json`]),
  };
}

function runnerValidationFromRow(row: Record<string, unknown>, summary: Record<string, unknown>): Record<string, unknown> {
  for (const prefix of ["best", "latest"] as const) {
    const artifact = readJsonObject(stringValue(row[`${prefix}_artifact_path`]));
    if (stringValue(artifact.status)) return artifact;
    const metadata = jsonObjectValue(row[`${prefix}_metadata_json`]);
    const metadataValidation = objectValue(metadata.runner_validation);
    if (stringValue(metadataValidation.status)) return metadataValidation;
  }
  return objectValue(summary.latest_runner_validation);
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!path || !existsSync(path)) return {};
  try {
    return objectValue(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch {
    return {};
  }
}

function compactJson(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  return JSON.stringify(value);
}

function nonNegativeLimit(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function dedupeRecords(records: CuratedKnowledgeRecord[]): CuratedKnowledgeRecord[] {
  const byId = new Map<string, CuratedKnowledgeRecord>();
  for (const record of records) byId.set(record.id, record);
  return [...byId.values()];
}
