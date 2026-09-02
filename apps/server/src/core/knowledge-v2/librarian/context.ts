import { gameRoot, pastPrsRoot } from "@server/core/knowledge";
import { resolve } from "node:path";

import { resolveCitation } from "../apply/resolver.js";
import {
  buildTargetMaterial,
  buildUnitContext,
  groupedLedger,
  linkedMechanicalEntities,
  loadTargetRow,
  supportingSubjects,
  targetDetail,
  type BackfillApplyScope,
  type BackfillContextOptions,
  type BackfillGroupedLedger,
  type BackfillPassTarget,
  type BackfillSupportingSubject,
  type BackfillTargetMaterial,
  type BackfillUnitContext,
  type TargetRow,
} from "../backfill/context.js";
import {
  flagCodeDrift,
  type DriftEvidenceEntry,
  type DriftReport,
} from "../drift/flagger.js";
import { listPrComments, type ResolvedPrComment } from "../ingest/prs.js";
import { formatLocator, parseLocator } from "../locator.js";
import { symbolTokensFor, tokenize } from "../migration/prioritize.js";
import {
  getRunNarrative,
  movedFromStableKeys,
  type KnowledgeStoreHandle,
} from "../records/index.js";
import type {
  EntityKind,
  EventCause,
  EventKind,
  EventRefKind,
  Integration,
  Outcome,
  SourceKind,
  WorkerErrorType,
} from "../storage/schema.js";
import {
  knowledgeRecord,
  targetLedger,
  type KnowledgeRecord,
} from "../views/index.js";

export type LibrarianPathway =
  | "run_closed"
  | "pr_imported"
  | "regression"
  | "archival_ingest"
  | "drift_recheck";

export interface LibrarianTaskRow {
  id: string;
  pathway: LibrarianPathway;
  payload: string;
  enqueued_at: string;
  started_at: string | null;
  done_at: string | null;
}

export interface LibrarianContextOptions extends BackfillContextOptions {
  prsRoot?: string;
  messageSliceLimit?: number;
  sectionSliceLimit?: number;
}

export type LibrarianTouchedSubject =
  | {
    order: number;
    kind: "entity";
    entity_kind: string;
    entity_locator: string;
    record: KnowledgeRecord;
    drift?: DriftReport;
    material?: BackfillUnitContext;
  }
  | {
    order: number;
    kind: "target";
    target_stable_key: string;
    renamed_from: string[];
    detail: BackfillPassTarget;
    ledger: BackfillGroupedLedger;
    record: KnowledgeRecord;
    drift?: DriftReport;
    material?: BackfillTargetMaterial;
  };

export interface LibrarianTaskContext {
  task: {
    id: string;
    pathway: LibrarianPathway;
    payload: unknown;
    instruction: string;
  };
  object: unknown;
  touched: LibrarianTouchedSubject[];
  supporting: LibrarianSupportingSubject[];
  scope: BackfillApplyScope;
  omitted?: {
    reason: string;
    stable_keys?: string[];
    entity_locators?: string[];
  };
}

export type LibrarianSupportingSubject = BackfillSupportingSubject | {
  kind: "translation_unit";
  entity_locator: string;
  record: KnowledgeRecord;
  material: BackfillUnitContext;
};

export type LibrarianSlicePayload =
  | {
    source: "discord";
    channel_id: string;
    from_id: string;
    to_id: string;
    count: number;
  }
  | { source: "wiki"; pages: string[] };

export const DISCORD_SLICE_LIMIT = 40;
export const WIKI_SLICE_LIMIT = 20;

interface WorkerRunRow {
  id: string;
  target_id: string;
  goal: string;
  baseline: string;
  run_id: string | null;
  final_outcome: Outcome;
  error_type: WorkerErrorType | null;
  integration: Integration | null;
  started_at: string;
  ended_at: string | null;
  closed_at: string;
}

interface SubmissionRow {
  seq: number;
  score: number;
  description: string;
  hypothesis: string | null;
  submitted_at: string;
}

interface PullRequestRow {
  id: string;
  target_id: string | null;
  entity_id: string | null;
  pr_ref: string;
  summary: string;
  outcome: Outcome;
  merged_at: string;
}

interface EntityRow {
  id: string;
  kind: EntityKind;
  locator: string;
}

interface EventRow {
  id: string;
  target_id: string;
  kind: EventKind;
  cause: EventCause | null;
  summary: string;
  created_at: string;
}

interface EventRefRow {
  ref_kind: EventRefKind;
  ref_id: string;
}

interface DiscordRow {
  id: string;
  author: string;
  posted_at: string;
  content: string;
}

interface WikiRow {
  id: string;
  page: string;
  section: string;
  content: string;
}

interface MentionTargetRow extends TargetRow {
  unit_locator: string;
}

interface MentionDescriptor {
  subject: "target" | "entity";
  token: string;
  token_class: "symbol" | "address" | "basename";
  target_id?: string;
  stable_key?: string;
  entity_id?: string;
  entity_locator?: string;
}

interface MentionEntry {
  subject: "target" | "entity";
  stable_key?: string;
  entity_locator?: string;
  token: string;
  token_class: "symbol" | "address" | "basename";
}

interface BuiltPathwayContext {
  object: unknown;
  touched: LibrarianTouchedSubject[];
  supporting: LibrarianSupportingSubject[];
  scope: BackfillApplyScope;
  omitted?: LibrarianTaskContext["omitted"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsedPayloadForTask(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return payload;
  }
}

function unwrapRetryPayload(payload: string): string {
  const parsed = parsedPayloadForTask(payload);
  if (!isRecord(parsed)
    || !("task_payload" in parsed)
    || typeof parsed.drift_attempts !== "number") {
    return payload;
  }
  return typeof parsed.task_payload === "string"
    ? parsed.task_payload
    : JSON.stringify(parsed.task_payload);
}

function parseStoredJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function instructionFor(pathway: LibrarianPathway): string {
  switch (pathway) {
    case "run_closed":
      return "Work the closed run subjects in order — linked entities first, the target last — researching the submissions and stored narrative across every resource before devising facts.";
    case "pr_imported":
      return "Work the imported PR subjects in order — attributed entities first, attributed targets last — researching the archived discussion and ledgers across every resource before devising facts. Each discussion record carries its path, line, and attached diff hunk; cite the comment that names or is attached to the subject (pr://<n>/comment/<i>), never a CI or unit row, and propose nothing for subjects the discussion never touches.";
    case "regression":
      return "Work the regression subjects in order — linked entities first, the target last — researching the event and every resolved reference before devising facts.";
    case "archival_ingest":
      return "Work the mentioned archival subjects in order — entities first, targets last — researching the bounded source slice across every resource before devising facts.";
    case "drift_recheck":
      return "Work the flagged subjects in order — checking each live fact and every evidence verdict — before devising replacement facts.";
    default:
      throw new TypeError(`Unknown librarian pathway: ${String(pathway)}`);
  }
}

function noOpContext(reason: string): BuiltPathwayContext {
  return {
    object: { error: reason },
    touched: [],
    supporting: [],
    scope: { targetStableKeys: [], entityLocators: [] },
  };
}

function finalizeSubjects(
  subjects: LibrarianTouchedSubject[],
  supporting: LibrarianSupportingSubject[],
  object: unknown,
  omitted?: LibrarianTaskContext["omitted"],
): BuiltPathwayContext {
  const touched = subjects.map((subject, index) => ({ ...subject, order: index + 1 }));
  const scope: BackfillApplyScope = {
    targetStableKeys: touched.flatMap((subject) =>
      subject.kind === "target" ? [subject.target_stable_key] : []),
    entityLocators: touched.flatMap((subject) =>
      subject.kind === "entity" ? [subject.entity_locator] : []),
  };
  return {
    object,
    touched,
    supporting,
    scope,
    ...(omitted === undefined ? {} : { omitted }),
  };
}

function entitySubject(
  store: KnowledgeStoreHandle,
  entity: EntityRow,
  includeUnitMaterial: boolean,
): LibrarianTouchedSubject {
  return {
    order: 0,
    kind: "entity",
    entity_kind: entity.kind,
    entity_locator: entity.locator,
    record: knowledgeRecord(store, { entityId: entity.id }),
    ...(includeUnitMaterial && entity.kind === "translation_unit"
      ? { material: buildUnitContext(store, entity.id) }
      : {}),
  };
}

function targetSubject(
  store: KnowledgeStoreHandle,
  target: TargetRow,
  options: LibrarianContextOptions,
  includeMaterial: boolean,
): LibrarianTouchedSubject {
  return {
    order: 0,
    kind: "target",
    target_stable_key: target.stable_key,
    renamed_from: movedFromStableKeys(store, target.id),
    detail: targetDetail(store, target),
    ledger: groupedLedger(targetLedger(store, target.id)),
    record: knowledgeRecord(store, { targetId: target.id }),
    ...(includeMaterial ? { material: buildTargetMaterial(store, target, options) } : {}),
  };
}

function subjectDrift(
  store: KnowledgeStoreHandle,
  subject: { targetId: string } | { entityId: string },
  options: LibrarianContextOptions,
): DriftReport {
  return flagCodeDrift(store, {
    subject,
    checkoutRoot: resolve(options.checkoutRoot ?? resolve(gameRoot("melee"), "checkout")),
    ...(options.checkoutRev === undefined ? {} : { headRevision: options.checkoutRev }),
  });
}

function compactDrift(report: DriftReport): DriftReport {
  return {
    ...report,
    evidence: report.evidence.filter(({ status }) => status !== "unchanged"),
  };
}

function fullTargetPathwaySubjects(
  store: KnowledgeStoreHandle,
  target: TargetRow,
  options: LibrarianContextOptions,
  includeDrift = false,
): LibrarianTouchedSubject[] {
  const entities = linkedMechanicalEntities(store, target);
  if (!entities.some((entity) => entity.id === target.unit_entity_id)) {
    throw new Error(`Translation unit not found for target: ${target.id}`);
  }
  return [
    ...entities.map((entity) => ({
      ...entitySubject(store, entity, entity.id === target.unit_entity_id),
      ...(includeDrift
        ? { drift: compactDrift(subjectDrift(store, { entityId: entity.id }, options)) }
        : {}),
    })),
    {
      ...targetSubject(store, target, options, true),
      ...(includeDrift
        ? { drift: compactDrift(subjectDrift(store, { targetId: target.id }, options)) }
        : {}),
    },
  ];
}

function deduplicateSupporting(
  groups: BackfillSupportingSubject[][],
): BackfillSupportingSubject[] {
  const seen = new Set<string>();
  const result: BackfillSupportingSubject[] = [];
  for (const group of groups) {
    for (const subject of group) {
      if (seen.has(subject.entity_locator)) continue;
      seen.add(subject.entity_locator);
      result.push(subject);
    }
  }
  return result;
}

function workerRunHeader(row: WorkerRunRow) {
  return {
    id: row.id,
    target_id: row.target_id,
    goal: row.goal,
    baseline: parseStoredJson(row.baseline),
    run_id: row.run_id,
    final_outcome: row.final_outcome,
    error_type: row.error_type,
    integration: row.integration,
    started_at: row.started_at,
    ended_at: row.ended_at,
    closed_at: row.closed_at,
  };
}

function readWorkerRun(store: KnowledgeStoreHandle, runId: string): WorkerRunRow | null {
  return store.db.query<WorkerRunRow, [string]>(`
    SELECT id, target_id, goal, baseline, run_id, final_outcome, error_type, integration,
      started_at, ended_at, closed_at
    FROM worker_run
    WHERE id = ?
  `).get(runId);
}

function runIdFromPayload(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed) throw new Error("run_closed payload is empty");
  if (trimmed.startsWith("attempt://")) {
    const locator = parseLocator(trimmed, "attempt");
    if (locator.kind !== "attempt"
      || locator.submissionSequence !== undefined
      || locator.transcriptSpan !== undefined) {
      throw new Error("run_closed payload must name a worker run");
    }
    return locator.runId;
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("\"")) {
    let value: unknown;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      throw new Error("run_closed payload is malformed");
    }
    if (typeof value === "string" && value.trim()) return value.trim();
    if (isRecord(value)
      && typeof value.worker_run_id === "string"
      && value.worker_run_id.trim()) {
      return value.worker_run_id.trim();
    }
    throw new Error("run_closed payload does not name a worker run");
  }
  return trimmed;
}

function buildRunClosedContext(
  store: KnowledgeStoreHandle,
  payload: string,
  options: LibrarianContextOptions,
): BuiltPathwayContext {
  const runId = runIdFromPayload(payload);
  const run = readWorkerRun(store, runId);
  if (!run) throw new Error(`Worker run not found: ${runId}`);
  const target = loadTargetRow(store, run.target_id);
  if (!target) throw new Error(`Target not found for worker run: ${runId}`);

  const submissions = store.db.query<SubmissionRow, [string]>(`
    SELECT seq, score, description, hypothesis, submitted_at
    FROM submission
    WHERE worker_run_id = ?
    ORDER BY seq
  `).all(run.id).map((submission) => ({
    ...submission,
    locator: formatLocator({
      kind: "attempt",
      runId: run.id,
      submissionSequence: submission.seq,
    }),
  }));
  const storedNarrative = getRunNarrative(store, run.id);
  const narrative = storedNarrative === null ? null : {
    summary: storedNarrative.summary,
    notable_observations: storedNarrative.notableObservations,
    narrative: storedNarrative.narrative,
  };
  const object = {
    worker_run: workerRunHeader(run),
    submissions,
    narrative,
    ...(narrative === null
      ? { narrative_unavailable: { reason: "run narrative not found" } }
      : {}),
    integration: run.integration,
  };
  return finalizeSubjects(
    fullTargetPathwaySubjects(store, target, options, true),
    supportingSubjects(store, target.id),
    object,
  );
}

function pullRequestRows(store: KnowledgeStoreHandle, payload: string): PullRequestRow[] {
  let value: unknown;
  try {
    value = JSON.parse(payload) as unknown;
  } catch {
    throw new Error("pr_imported payload is not valid JSON");
  }
  if (!Array.isArray(value) || value.length === 0
    || value.some((id) => typeof id !== "string" || id.trim() === "")) {
    throw new Error("pr_imported payload must be a non-empty array of pull request ids");
  }
  const select = store.db.query<PullRequestRow, [string]>(`
    SELECT id, target_id, entity_id, pr_ref, summary, outcome, merged_at
    FROM pull_request
    WHERE id = ?
  `);
  return value.map((id) => {
    const row = select.get(id as string);
    if (!row) throw new Error(`Pull request row not found: ${String(id)}`);
    return row;
  });
}

function prNumberForRows(rows: PullRequestRow[]): number {
  const refs = new Set(rows.map((row) => row.pr_ref));
  if (refs.size !== 1) throw new Error("pr_imported rows do not share one pr_ref");
  const prRef = rows[0]!.pr_ref;
  const fromRef = /#(\d+)/.exec(prRef);
  if (fromRef) {
    const parsed = Number(fromRef[1]);
    if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid PR number in: ${prRef}`);
    return parsed;
  }
  const numbers = new Set(rows.flatMap((row) => {
    const match = /(?:^|\b)pr-(\d+)(?:--|\b)/.exec(row.id);
    return match ? [Number(match[1])] : [];
  }));
  if (numbers.size !== 1) throw new Error(`Unable to derive PR number from: ${prRef}`);
  const parsed = [...numbers][0]!;
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid PR number in: ${prRef}`);
  return parsed;
}

function ciSummaryMetrics(summary: string): {
  before_pct: number | null;
  after_pct: number | null;
  delta_pct: number | null;
  bytes: number | null;
} {
  const match = /([+-]?\d+(?:\.\d+)?)\s*%\s*(?:->|→)\s*([+-]?\d+(?:\.\d+)?)\s*%\s*\(\s*([+\-−]?\d[\d,]*)\s+bytes?\s*\)/i.exec(summary);
  if (!match) {
    return { before_pct: null, after_pct: null, delta_pct: null, bytes: null };
  }
  const before = Number(match[1]);
  const after = Number(match[2]);
  const bytes = Number(match[3]!.replace("−", "-").replaceAll(",", ""));
  if (![before, after, bytes].every(Number.isFinite)) {
    return { before_pct: null, after_pct: null, delta_pct: null, bytes: null };
  }
  return {
    before_pct: before,
    after_pct: after,
    delta_pct: Number((after - before).toFixed(6)),
    bytes,
  };
}

function cappedDiscussion(comments: ResolvedPrComment[]): {
  discussion: Array<{
    locator: string;
    author: string;
    created_at: string;
    kind: string;
    body: string;
    path?: string;
    line?: string;
    diff_hunk?: string;
  }>;
  discussion_truncated?: { total: number; kept: number };
} {
  let kept = comments;
  if (comments.length > 40) {
    const bodyIndex = comments.findIndex((comment) => comment.kind === "pr_body");
    const mandatory = bodyIndex < 0 ? [] : [bodyIndex];
    const ranked = comments
      .map((comment, index) => ({ comment, index }))
      .filter(({ index }) => index !== bodyIndex)
      .sort((left, right) =>
        right.comment.body.length - left.comment.body.length || left.index - right.index)
      .slice(0, 40 - mandatory.length)
      .map(({ index }) => index);
    const selected = new Set([...mandatory, ...ranked]);
    kept = comments.filter((_, index) => selected.has(index));
  }
  const discussion = kept.map((comment) => {
    const diffHunk = comment.diffHunk === undefined
      ? undefined
      : comment.diffHunk.length > 1500
        ? `…${comment.diffHunk.slice(-1500)}`
        : comment.diffHunk;
    return {
      locator: comment.locator,
      author: comment.author,
      created_at: comment.createdAt,
      kind: comment.kind,
      body: comment.body,
      ...(comment.path === undefined ? {} : { path: comment.path }),
      ...(comment.line === undefined ? {} : { line: comment.line }),
      ...(diffHunk === undefined ? {} : { diff_hunk: diffHunk }),
    };
  });
  return {
    discussion,
    ...(comments.length > 40
      ? { discussion_truncated: { total: comments.length, kept: discussion.length } }
      : {}),
  };
}

function buildPrImportedContext(
  store: KnowledgeStoreHandle,
  payload: string,
  options: LibrarianContextOptions,
): BuiltPathwayContext {
  const rows = pullRequestRows(store, payload);
  const prRef = rows[0]!.pr_ref;
  const prNumber = prNumberForRows(rows);
  const comments = listPrComments(
    options.prsRoot ?? resolve(pastPrsRoot(), "prs"),
    prNumber,
  );
  const bodyComment = comments.find((comment) => comment.kind === "pr_body");
  const discussion = cappedDiscussion(comments);

  const targetCandidates = new Map<string, {
    target: TargetRow;
    delta_pct: number | null;
    bytes: number | null;
    first_index: number;
  }>();
  const entityCandidates = new Map<string, EntityRow>();
  const ciRows: Array<Record<string, unknown>> = [];
  const unitRows: Array<Record<string, unknown>> = [];

  rows.forEach((row, index) => {
    const locator = formatLocator({ kind: "pr", pullRequestId: row.id });
    if (row.target_id !== null) {
      const target = loadTargetRow(store, row.target_id);
      if (!target) throw new Error(`Target not found for pull request row: ${row.id}`);
      const metrics = ciSummaryMetrics(row.summary);
      ciRows.push({
        locator,
        target_stable_key: target.stable_key,
        summary: row.summary,
        outcome: row.outcome,
        ...metrics,
      });
      const existing = targetCandidates.get(target.id);
      const candidate = {
        target,
        ...metrics,
        first_index: existing?.first_index ?? index,
      };
      if (!existing || compareTargetRank(candidate, existing) < 0) {
        targetCandidates.set(target.id, candidate);
      }
      return;
    }
    if (row.entity_id === null) throw new Error(`Pull request row has no subject: ${row.id}`);
    const entity = store.db.query<EntityRow, [string]>(`
      SELECT id, kind, locator FROM entity WHERE id = ?
    `).get(row.entity_id);
    if (!entity) throw new Error(`Entity not found for pull request row: ${row.id}`);
    unitRows.push({
      locator,
      entity_locator: entity.locator,
      summary: row.summary,
      outcome: row.outcome,
    });
    if (!entityCandidates.has(entity.id)) entityCandidates.set(entity.id, entity);
  });

  const targetsInPayloadOrder = [...targetCandidates.values()]
    .sort((left, right) => left.first_index - right.first_index);
  const rankedTargets = [...targetCandidates.values()].sort(compareTargetRank);
  const capped = rankedTargets.length > 12;
  const includedTargets = capped ? rankedTargets.slice(0, 12) : targetsInPayloadOrder;
  const omittedTargets = capped ? rankedTargets.slice(12) : [];

  const touched = [
    ...[...entityCandidates.values()].map((entity) => ({
      ...entitySubject(store, entity, entity.kind === "translation_unit"),
      drift: compactDrift(subjectDrift(store, { entityId: entity.id }, options)),
    })),
    ...includedTargets.map(({ target }) => ({
      ...targetSubject(store, target, options, true),
      drift: compactDrift(subjectDrift(store, { targetId: target.id }, options)),
    })),
  ];
  const supporting = deduplicateSupporting(
    includedTargets.map(({ target }) => supportingSubjects(store, target.id)),
  );
  const title = bodyComment?.title ?? null;
  const object = {
    pr_ref: prRef,
    pr_number: prNumber,
    title,
    body: bodyComment?.body ?? null,
    discussion: discussion.discussion,
    ...(discussion.discussion_truncated === undefined
      ? {}
      : { discussion_truncated: discussion.discussion_truncated }),
    ci_rows: ciRows,
    unit_rows: unitRows,
  };
  return finalizeSubjects(
    touched,
    supporting,
    object,
    capped
      ? {
        reason: "pr_target_cap",
        stable_keys: omittedTargets.map(({ target }) => target.stable_key),
      }
      : undefined,
  );
}

function compareTargetRank(
  left: { target: TargetRow; delta_pct: number | null; bytes: number | null },
  right: { target: TargetRow; delta_pct: number | null; bytes: number | null },
): number {
  const leftDelta = left.delta_pct === null ? -1 : Math.abs(left.delta_pct);
  const rightDelta = right.delta_pct === null ? -1 : Math.abs(right.delta_pct);
  const leftBytes = left.bytes === null ? -1 : Math.abs(left.bytes);
  const rightBytes = right.bytes === null ? -1 : Math.abs(right.bytes);
  return rightDelta - leftDelta
    || rightBytes - leftBytes
    || left.target.stable_key.localeCompare(right.target.stable_key);
}

export function parseSlicePayload(payload: string): LibrarianSlicePayload | null {
  let value: unknown;
  try {
    value = JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  if (value.source === "discord") {
    if (typeof value.channel_id !== "string"
      || typeof value.from_id !== "string"
      || typeof value.to_id !== "string"
      || value.channel_id.trim() === ""
      || !/^\d+$/.test(value.from_id)
      || !/^\d+$/.test(value.to_id)
      || !Number.isSafeInteger(value.count)
      || (value.count as number) < 0) {
      return null;
    }
    if (BigInt(value.from_id) > BigInt(value.to_id)) return null;
    return {
      source: "discord",
      channel_id: value.channel_id,
      from_id: value.from_id,
      to_id: value.to_id,
      count: value.count as number,
    };
  }
  if (value.source === "wiki"
    && Array.isArray(value.pages)
    && value.pages.every((page) => typeof page === "string")) {
    return { source: "wiki", pages: value.pages as string[] };
  }
  return null;
}

export function splitSlicePayload(
  store: KnowledgeStoreHandle,
  payload: LibrarianSlicePayload,
): string[] {
  if (payload.source === "wiki") {
    if (payload.pages.length <= WIKI_SLICE_LIMIT) return [];
    const children: string[] = [];
    for (let index = 0; index < payload.pages.length; index += WIKI_SLICE_LIMIT) {
      children.push(JSON.stringify({
        source: "wiki",
        pages: payload.pages.slice(index, index + WIKI_SLICE_LIMIT),
      } satisfies LibrarianSlicePayload));
    }
    return children;
  }
  const ids = store.db.query<{ id: string }, [string, string]>(`
    SELECT id
    FROM discord_message
    WHERE CAST(id AS INTEGER) BETWEEN CAST(? AS INTEGER) AND CAST(? AS INTEGER)
    ORDER BY CAST(id AS INTEGER), id
  `).all(payload.from_id, payload.to_id).map(({ id }) => id);
  if (ids.length <= DISCORD_SLICE_LIMIT) return [];
  const children: string[] = [];
  for (let index = 0; index < ids.length; index += DISCORD_SLICE_LIMIT) {
    const chunk = ids.slice(index, index + DISCORD_SLICE_LIMIT);
    children.push(JSON.stringify({
      source: "discord",
      channel_id: payload.channel_id,
      from_id: chunk[0]!,
      to_id: chunk.at(-1)!,
      count: chunk.length,
    } satisfies LibrarianSlicePayload));
  }
  return children;
}

function archivalRows(
  store: KnowledgeStoreHandle,
  payload: LibrarianSlicePayload,
  options: LibrarianContextOptions,
): {
  records: Array<{
    locator: string;
    content: string;
    author?: string;
    posted_at?: string;
    page?: string;
    section?: string;
  }>;
  truncated: boolean;
} {
  if (payload.source === "discord") {
    const limit = options.messageSliceLimit ?? DISCORD_SLICE_LIMIT;
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("Invalid message slice limit");
    const rows = store.db.query<DiscordRow, [string, string, number]>(`
      SELECT id, author, posted_at, content
      FROM discord_message
      WHERE CAST(id AS INTEGER) BETWEEN CAST(? AS INTEGER) AND CAST(? AS INTEGER)
      ORDER BY posted_at, CAST(id AS INTEGER), id
      LIMIT ?
    `).all(payload.from_id, payload.to_id, limit + 1);
    return {
      records: rows.slice(0, limit).map((row) => ({
        locator: formatLocator({ kind: "discord", messageId: row.id }),
        author: row.author,
        posted_at: row.posted_at,
        content: row.content,
      })),
      truncated: rows.length > limit,
    };
  }

  const limit = options.sectionSliceLimit ?? WIKI_SLICE_LIMIT;
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("Invalid wiki section slice limit");
  if (payload.pages.length === 0) return { records: [], truncated: false };
  const placeholders = payload.pages.map(() => "?").join(", ");
  const rows = store.db.query<WikiRow, Array<string | number>>(`
    SELECT id, page, section, content
    FROM wiki_section
    WHERE page IN (${placeholders})
      OR CASE WHEN instr(id, '~') > 0
        THEN substr(id, 1, instr(id, '~') - 1)
        ELSE id
      END IN (${placeholders})
    ORDER BY page, section, id
    LIMIT ?
  `).all(...payload.pages, ...payload.pages, limit + 1);
  return {
    records: rows.slice(0, limit).map((row) => ({
      locator: formatLocator({ kind: "wiki", sectionId: row.id }),
      page: row.page,
      section: row.section,
      content: row.content,
    })),
    truncated: rows.length > limit,
  };
}

function addTokenDescriptor(
  index: Map<string, MentionDescriptor[]>,
  token: string,
  descriptor: MentionDescriptor,
): void {
  const existing = index.get(token) ?? [];
  existing.push(descriptor);
  index.set(token, existing);
}

function finalLocatorSegment(locator: string): string {
  return locator.split(/[/#:\\]/).filter(Boolean).at(-1) ?? locator;
}

function buildMentionMap(
  store: KnowledgeStoreHandle,
  records: Array<{ locator: string; content: string }>,
): {
  mentionMap: Array<{ locator: string; mentions: MentionEntry[] }>;
  targets: Map<string, { row: TargetRow; records: Set<string> }>;
  entities: Map<string, { row: EntityRow; records: Set<string> }>;
} {
  const tokenIndex = new Map<string, MentionDescriptor[]>();
  const addressIndex = new Map<string, MentionDescriptor[]>();
  const targetRows = store.db.query<MentionTargetRow, []>(`
    SELECT t.id, t.kind, t.unit, t.unit_entity_id, t.symbol, t.stable_key, t.address,
      t.identity_status, t.report_revision, e.locator AS unit_locator
    FROM target t
    JOIN entity e ON e.id = t.unit_entity_id
    ORDER BY t.stable_key, t.id
  `).all();
  for (const target of targetRows) {
    const classes = symbolTokensFor({ symbol: target.symbol, unit: target.unit_locator });
    for (const token of classes.symbolTokens) {
      addTokenDescriptor(tokenIndex, token, {
        subject: "target",
        target_id: target.id,
        stable_key: target.stable_key,
        token,
        token_class: "symbol",
      });
    }
    for (const token of classes.unitTokens) {
      addTokenDescriptor(tokenIndex, token, {
        subject: "target",
        target_id: target.id,
        stable_key: target.stable_key,
        token,
        token_class: "basename",
      });
    }
    if (target.address !== null) {
      const canonical = target.address.toLowerCase().replace(/^0x/, "");
      addTokenDescriptor(addressIndex, canonical, {
        subject: "target",
        target_id: target.id,
        stable_key: target.stable_key,
        token: target.address,
        token_class: "address",
      });
    }
  }

  const entityRows = store.db.query<EntityRow, []>(`
    SELECT id, kind, locator
    FROM entity
    WHERE kind IN ('translation_unit', 'struct', 'struct_field', 'parameter')
    ORDER BY locator, id
  `).all();
  for (const entity of entityRows) {
    const token = finalLocatorSegment(entity.locator);
    if (!token || !tokenize(token).has(token)) continue;
    addTokenDescriptor(tokenIndex, token, {
      subject: "entity",
      entity_id: entity.id,
      entity_locator: entity.locator,
      token,
      token_class: "basename",
    });
  }

  const targetById = new Map(targetRows.map((row) => [row.id, row]));
  const entityById = new Map(entityRows.map((row) => [row.id, row]));
  const targets = new Map<string, { row: TargetRow; records: Set<string> }>();
  const entities = new Map<string, { row: EntityRow; records: Set<string> }>();
  const mentionMap = records.map((record) => {
    const descriptors: MentionDescriptor[] = [];
    const tokens = tokenize(record.content);
    for (const token of tokens) descriptors.push(...(tokenIndex.get(token) ?? []));
    for (const match of record.content.matchAll(
      /(?<![A-Za-z0-9_])(?:0x)?([0-9A-Fa-f]+)(?![A-Za-z0-9_])/gi,
    )) {
      descriptors.push(...(addressIndex.get(match[1]!.toLowerCase()) ?? []));
    }

    const seen = new Set<string>();
    const mentions: MentionEntry[] = [];
    for (const descriptor of descriptors) {
      const subjectKey = descriptor.subject === "target"
        ? `target:${descriptor.target_id}`
        : `entity:${descriptor.entity_id}`;
      const mentionKey = `${subjectKey}:${descriptor.token_class}:${descriptor.token}`;
      if (seen.has(mentionKey)) continue;
      seen.add(mentionKey);
      mentions.push({
        subject: descriptor.subject,
        ...(descriptor.stable_key === undefined
          ? {}
          : { stable_key: descriptor.stable_key }),
        ...(descriptor.entity_locator === undefined
          ? {}
          : { entity_locator: descriptor.entity_locator }),
        token: descriptor.token,
        token_class: descriptor.token_class,
      });
      if (descriptor.subject === "target") {
        const target = targetById.get(descriptor.target_id!);
        if (!target) continue;
        const tally = targets.get(target.id) ?? { row: target, records: new Set<string>() };
        tally.records.add(record.locator);
        targets.set(target.id, tally);
      } else {
        const entity = entityById.get(descriptor.entity_id!);
        if (!entity) continue;
        const tally = entities.get(entity.id) ?? { row: entity, records: new Set<string>() };
        tally.records.add(record.locator);
        entities.set(entity.id, tally);
      }
    }
    return { locator: record.locator, mentions };
  });
  return { mentionMap, targets, entities };
}

function buildArchivalIngestContext(
  store: KnowledgeStoreHandle,
  rawPayload: string,
  options: LibrarianContextOptions,
): BuiltPathwayContext {
  const payload = parseSlicePayload(rawPayload);
  if (!payload) throw new Error("archival_ingest payload is malformed");
  const loaded = archivalRows(store, payload, options);
  if (loaded.records.length === 0) throw new Error("Archival slice contains no records");
  const mentions = buildMentionMap(store, loaded.records);
  const rankedTargets = [...mentions.targets.values()].sort((left, right) =>
    right.records.size - left.records.size
    || left.row.stable_key.localeCompare(right.row.stable_key));
  const includedTargets = rankedTargets.slice(0, 12);
  const omittedTargets = rankedTargets.slice(12);
  const mentionedEntities = [...mentions.entities.values()].sort((left, right) =>
    left.row.locator.localeCompare(right.row.locator) || left.row.id.localeCompare(right.row.id));
  const touched = [
    ...mentionedEntities.map(({ row, records }) =>
      entitySubject(store, row, row.kind === "translation_unit" && records.size >= 2)),
    ...includedTargets.map(({ row, records }) =>
      targetSubject(store, row, options, records.size >= 2)),
  ];
  const supporting = deduplicateSupporting(
    includedTargets.map(({ row }) => supportingSubjects(store, row.id)),
  );
  return finalizeSubjects(
    touched,
    supporting,
    {
      source: payload.source,
      slice: payload,
      records: loaded.records,
      truncated: loaded.truncated,
      mention_map: mentions.mentionMap,
    },
    omittedTargets.length === 0
      ? undefined
      : {
        reason: "mention_cap",
        stable_keys: omittedTargets.map(({ row }) => row.stable_key),
      },
  );
}

function regressionPayload(payload: string):
  | { targetId: string; eventId?: never }
  | { targetId?: never; eventId: string } {
  const trimmed = payload.trim();
  if (!trimmed) throw new Error("regression payload is empty");
  if (trimmed.startsWith("{") || trimmed.startsWith("\"")) {
    let value: unknown;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      throw new Error("regression payload is malformed");
    }
    if (typeof value === "string" && value.trim()) return { targetId: value.trim() };
    if (isRecord(value)
      && typeof value.target_id === "string"
      && value.target_id.trim()) {
      return { targetId: value.target_id.trim() };
    }
    if (isRecord(value)
      && typeof value.event_id === "string"
      && value.event_id.trim()) {
      return { eventId: value.event_id.trim() };
    }
    throw new Error("regression payload does not name a target or event");
  }
  return { targetId: trimmed };
}

function resolvedEventRef(
  store: KnowledgeStoreHandle,
  ref: EventRefRow,
  targetId: string,
): Record<string, unknown> {
  if (ref.ref_kind === "worker_run") {
    const run = readWorkerRun(store, ref.ref_id);
    return {
      ref_kind: ref.ref_kind,
      ref_id: ref.ref_id,
      resolved: run === null ? null : workerRunHeader(run),
      ...(run === null ? { reason: "worker_run not found" } : {}),
    };
  }
  if (ref.ref_kind === "pr") {
    const numericRef = /(\d+)$/.exec(ref.ref_id)?.[1] ?? ref.ref_id;
    const row = store.db.query<PullRequestRow, [string, string, string, string, string]>(`
      SELECT id, target_id, entity_id, pr_ref, summary, outcome, merged_at
      FROM pull_request
      WHERE id = ? OR pr_ref = ? OR pr_ref = ? OR pr_ref = ?
      ORDER BY CASE WHEN target_id = ? THEN 0 ELSE 1 END, merged_at DESC, id
      LIMIT 1
    `).get(
      ref.ref_id,
      ref.ref_id,
      `pr://${numericRef}`,
      `melee#${numericRef}`,
      targetId,
    );
    return {
      ref_kind: ref.ref_kind,
      ref_id: ref.ref_id,
      resolved: row,
      ...(row === null ? { reason: "pull_request not found" } : {}),
    };
  }
  return {
    ref_kind: ref.ref_kind,
    ref_id: ref.ref_id,
    resolved: null,
    reason: `unsupported event ref kind: ${ref.ref_kind}`,
  };
}

function buildRegressionContext(
  store: KnowledgeStoreHandle,
  rawPayload: string,
  options: LibrarianContextOptions,
): BuiltPathwayContext {
  const payload = regressionPayload(rawPayload);
  const event = payload.eventId === undefined
    ? store.db.query<EventRow, [string]>(`
      SELECT id, target_id, kind, cause, summary, created_at
      FROM event
      WHERE target_id = ? AND kind = 'regression'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).get(payload.targetId)
    : store.db.query<EventRow, [string]>(`
      SELECT id, target_id, kind, cause, summary, created_at
      FROM event
      WHERE id = ? AND kind = 'regression'
    `).get(payload.eventId);
  if (!event) throw new Error("Regression event not found");
  const target = loadTargetRow(store, event.target_id);
  if (!target) throw new Error(`Target not found for regression event: ${event.id}`);
  const refs = store.db.query<EventRefRow, [string]>(`
    SELECT ref_kind, ref_id
    FROM event_ref
    WHERE event_id = ?
    ORDER BY ref_kind, ref_id
  `).all(event.id).map((ref) => resolvedEventRef(store, ref, event.target_id));
  return finalizeSubjects(
    fullTargetPathwaySubjects(store, target, options),
    supportingSubjects(store, target.id),
    { event, refs },
  );
}

function driftSubject(
  store: KnowledgeStoreHandle,
  payload: string,
): { target: TargetRow; entity?: never } | { target?: never; entity: EntityRow } {
  const trimmed = payload.trim();
  if (!trimmed) throw new Error("drift_recheck payload is empty");
  if (trimmed.startsWith("{") || trimmed.startsWith("\"")) {
    let value: unknown;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      throw new Error("drift_recheck payload is malformed");
    }
    if (typeof value === "string" && value.trim()) {
      return driftSubject(store, value.trim());
    }
    if (!isRecord(value)) throw new Error("drift_recheck payload does not name a subject");
    const targetId = typeof value.target_id === "string" && value.target_id.trim()
      ? value.target_id.trim()
      : null;
    const entityId = typeof value.entity_id === "string" && value.entity_id.trim()
      ? value.entity_id.trim()
      : null;
    if ((targetId === null) === (entityId === null)) {
      throw new Error("drift_recheck payload must name exactly one subject");
    }
    if (targetId !== null) {
      const target = loadTargetRow(store, targetId);
      if (!target) throw new Error(`Target not found: ${targetId}`);
      return { target };
    }
    const entity = store.db.query<EntityRow, [string]>(`
      SELECT id, kind, locator FROM entity WHERE id = ?
    `).get(entityId!);
    if (!entity) throw new Error(`Entity not found: ${entityId}`);
    return { entity };
  }

  const target = loadTargetRow(store, trimmed);
  if (target) return { target };
  const entities = store.db.query<EntityRow, [string]>(`
    SELECT id, kind, locator
    FROM entity
    WHERE locator = ?
    ORDER BY id
  `).all(trimmed);
  if (entities.length === 0) throw new Error(`Subject not found: ${trimmed}`);
  if (entities.length > 1) throw new Error(`Entity locator is ambiguous: ${trimmed}`);
  return { entity: entities[0]! };
}

function buildDriftRecheckContext(
  store: KnowledgeStoreHandle,
  rawPayload: string,
  options: LibrarianContextOptions,
): BuiltPathwayContext {
  const parsedPayload = parsedPayloadForTask(rawPayload);
  if (isRecord(parsedPayload) && Array.isArray(parsedPayload.subjects)) {
    const unit = typeof parsedPayload.unit === "string" && parsedPayload.unit.trim()
      ? parsedPayload.unit.trim()
      : null;
    const unitEntityId = typeof parsedPayload.unit_entity_id === "string"
      && parsedPayload.unit_entity_id.trim()
      ? parsedPayload.unit_entity_id.trim()
      : null;
    if (unit === null || unitEntityId === null || parsedPayload.subjects.length === 0) {
      throw new Error("batched drift_recheck payload must name a unit and subjects");
    }
    const unitEntity = store.db.query<EntityRow, [string]>(`
      SELECT id, kind, locator FROM entity WHERE id = ?
    `).get(unitEntityId);
    if (!unitEntity || unitEntity.kind !== "translation_unit") {
      throw new Error(`Translation unit not found: ${unitEntityId}`);
    }
    const entries = parsedPayload.subjects.map((value) => {
      if (!isRecord(value)) throw new Error("batched drift_recheck subject is malformed");
      return buildDriftSubjectContext(store, driftSubject(store, JSON.stringify(value)), options);
    });
    const touched = entries
      .map(({ touched }) => touched)
      .sort((left, right) => left.kind === right.kind ? 0 : left.kind === "entity" ? -1 : 1);
    return finalizeSubjects(touched, [{
      kind: "translation_unit",
      entity_locator: unitEntity.locator,
      record: knowledgeRecord(store, { entityId: unitEntity.id }),
      material: buildUnitContext(store, unitEntity.id),
    }], {
      unit,
      unit_entity_id: unitEntity.id,
      reason: typeof parsedPayload.reason === "string" ? parsedPayload.reason : "drift",
      subjects: entries.map(({ object }) => object),
    });
  }

  const subject = driftSubject(store, rawPayload);
  const rename = isRecord(parsedPayload)
    ? {
      ...(typeof parsedPayload.renamed_from === "string"
        ? { renamed_from: parsedPayload.renamed_from }
        : {}),
      ...(typeof parsedPayload.previous_target_id === "string"
        ? { previous_target_id: parsedPayload.previous_target_id }
        : {}),
    }
    : {};
  const built = buildDriftSubjectContext(store, subject, options);
  const supporting = subject.target === undefined
    ? []
    : supportingSubjects(store, subject.target.id);
  return finalizeSubjects([built.touched], supporting, {
    ...built.object,
    ...rename,
  });
}

function buildDriftSubjectContext(
  store: KnowledgeStoreHandle,
  subject: { target: TargetRow; entity?: never } | { target?: never; entity: EntityRow },
  options: LibrarianContextOptions,
): { touched: LibrarianTouchedSubject; object: Record<string, unknown> } {
  const record = subject.target === undefined
    ? knowledgeRecord(store, { entityId: subject.entity.id })
    : knowledgeRecord(store, { targetId: subject.target.id });
  if (record.subject === null) throw new Error("Drift subject not found");
  const drift = subjectDrift(
    store,
    subject.target === undefined
      ? { entityId: subject.entity.id }
      : { targetId: subject.target.id },
    options,
  );
  const driftByEvidenceId = new Map<string, DriftEvidenceEntry>(
    drift.evidence.map((entry) => [entry.evidence_id, entry]),
  );
  const resolverOptions = {
    checkoutRoot: resolve(options.checkoutRoot ?? resolve(gameRoot("melee"), "checkout")),
    prsRoot: options.prsRoot ?? resolve(pastPrsRoot(), "prs"),
  };
  const flaggedFacts = Object.values(record.facts).flatMap((fact) => fact === undefined ? [] : [{
    type: fact.type,
    value: fact.value,
    confidence: fact.confidence,
    updated_at: fact.updatedAt,
    evidence: fact.evidence.map((evidence) => {
      const driftEntry = driftByEvidenceId.get(evidence.id);
      return {
        kind: evidence.kind,
        locator: evidence.locator,
        why: evidence.why,
        digest: evidence.digest,
        resolver_verdict: resolveCitation(store, {
          kind: evidence.kind as SourceKind,
          locator: evidence.locator,
        }, resolverOptions),
        ...(driftEntry === undefined
          ? {}
          : {
            drift_status: driftEntry.status,
            ...(driftEntry.head_digest === undefined
              ? {}
              : { head_digest: driftEntry.head_digest }),
            ...(driftEntry.head_locator === undefined
              ? {}
              : { head_locator: driftEntry.head_locator }),
          }),
      };
    }),
  }]);
  const touched = subject.target === undefined
    ? entitySubject(
      store,
      subject.entity,
      subject.entity.kind === "translation_unit",
    )
    : targetSubject(store, subject.target, options, true);
  return {
    touched,
    object: {
      subject: record.subject,
      drift,
      flagged_facts: flaggedFacts,
    },
  };
}

export function buildTaskContext(
  store: KnowledgeStoreHandle,
  task: LibrarianTaskRow,
  options: LibrarianContextOptions = {},
): LibrarianTaskContext {
  const instruction = instructionFor(task.pathway);
  const payload = unwrapRetryPayload(task.payload);
  let built: BuiltPathwayContext;
  try {
    switch (task.pathway) {
      case "run_closed":
        built = buildRunClosedContext(store, payload, options);
        break;
      case "pr_imported":
        built = buildPrImportedContext(store, payload, options);
        break;
      case "regression":
        built = buildRegressionContext(store, payload, options);
        break;
      case "archival_ingest":
        built = buildArchivalIngestContext(store, payload, options);
        break;
      case "drift_recheck":
        built = buildDriftRecheckContext(store, payload, options);
        break;
      default:
        throw new TypeError(`Unknown librarian pathway: ${String(task.pathway)}`);
    }
  } catch (error) {
    built = noOpContext(errorMessage(error));
  }
  return {
    task: {
      id: task.id,
      pathway: task.pathway,
      payload: parsedPayloadForTask(payload),
      instruction,
    },
    ...built,
  };
}
