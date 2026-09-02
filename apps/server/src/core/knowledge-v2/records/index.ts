import type { Database } from "bun:sqlite";
import { immediateTransaction } from "../storage/transaction.js";
import type { IntegrationDetail } from "../storage/schema.js";

export interface KnowledgeStoreHandle {
  db: Database;
}

export type SubjectRef =
  | { targetId: string; entityId?: never }
  | { targetId?: never; entityId: string };

export type FactType = "purpose" | "inferred_name" | "inferred_type" | "data_flow" | "state_behavior" | "game_mapping";
export type SourceKind = "pr" | "discord" | "attempt" | "wiki" | "code";

export type FactInput = SubjectRef & {
  id: string;
  type: FactType;
  value: string;
  rationale: string;
  confidence: number;
  updatedAt?: string;
};

export interface EvidenceInput {
  id: string;
  kind: SourceKind;
  locator: string;
  digest?: string | null;
  why: string;
  capturedAt?: string;
}

export interface WorkerRunInput {
  id: string;
  targetId: string;
  goal: string;
  baseline: string;
  runId?: string | null;
  workerStateId?: string | null;
  finalOutcome: "match" | "improvement" | "no_change" | "error";
  errorType?: "build_failure" | "tool_failure" | "timeout" | "worker_crash" | null;
  integration?: "integrated" | "conflicted" | null;
  integrationDetail?: IntegrationDetail | null;
  startedAt: string;
  endedAt?: string | null;
  closedAt: string;
}

export interface SubmissionInput {
  id: string;
  seq: number;
  description: string;
  hypothesis?: string | null;
  score: number;
  submittedAt: string;
  runtimeRef?: string | null;
}

export interface RunNarrativeInput {
  workerRunId: string;
  summary: string;
  notableObservations: readonly unknown[];
  narrative: unknown;
  producedBy: "live" | "backfill";
  createdAt?: string;
}

export interface RunNarrativeRow {
  workerRunId: string;
  summary: string;
  notableObservations: unknown[];
  narrative: unknown;
  producedBy: "live" | "backfill";
  createdAt: string;
}

export interface EventInput {
  id: string;
  targetId: string;
  kind: "regression" | "note";
  cause?: "merge_conflict" | "upstream_change" | null;
  summary: string;
  createdAt?: string;
}

export interface EventRefInput {
  refKind: "worker_run" | "epoch" | "pr" | "commit";
  refId: string;
}

export interface DiscordMessageInput {
  id: string;
  channel: string;
  author: string;
  postedAt: string;
  content: string;
  threadId?: string | null;
  ingestedAt?: string;
}

export interface WikiSectionInput {
  id: string;
  page: string;
  section: string;
  mirrorRevision: string;
  content: string;
  ingestedAt?: string;
}

export type PullRequestEntryInput = SubjectRef & {
  id: string;
  prRef: string;
  summary: string;
  outcome: "match" | "improvement" | "no_change" | "error";
  mergedAt: string;
};

export interface IndexTaskInput {
  id: string;
  pathway: "run_closed" | "pr_imported" | "regression" | "archival_ingest" | "drift_recheck";
  payload: string;
  enqueuedAt?: string;
}

function now(): string {
  return new Date().toISOString();
}

export function writeFactWithEvidence(
  store: KnowledgeStoreHandle,
  fact: FactInput,
  evidenceRows: readonly EvidenceInput[],
): void {
  immediateTransaction(store.db, () => {
    const existing = fact.targetId !== undefined
      ? store.db.query<{ id: string }, [string, FactType]>("SELECT id FROM fact WHERE target_id = ? AND type = ?").get(fact.targetId, fact.type)
      : store.db.query<{ id: string }, [string, FactType]>("SELECT id FROM fact WHERE entity_id = ? AND type = ?").get(fact.entityId, fact.type);
    const factId = existing?.id ?? fact.id;
    const updatedAt = fact.updatedAt ?? now();

    if (existing) {
      store.db.query(`UPDATE fact SET value = ?, rationale = ?, confidence = ?, updated_at = ? WHERE id = ?`).run(
        fact.value, fact.rationale, fact.confidence, updatedAt, factId,
      );
      store.db.query("DELETE FROM evidence WHERE fact_id = ?").run(factId);
    } else {
      store.db.query(`INSERT INTO fact (id, target_id, entity_id, type, value, rationale, confidence, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        factId, fact.targetId ?? null, fact.entityId ?? null, fact.type, fact.value, fact.rationale, fact.confidence, updatedAt,
      );
    }

    const insertEvidence = store.db.query(`INSERT INTO evidence
      (id, fact_id, kind, locator, digest, why, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const evidence of evidenceRows) {
      insertEvidence.run(evidence.id, factId, evidence.kind, evidence.locator, evidence.digest ?? null, evidence.why, evidence.capturedAt ?? now());
    }
  });
}

export function clearFact(store: KnowledgeStoreHandle, subject: SubjectRef, type: FactType): boolean {
  const result = subject.targetId !== undefined
    ? store.db.query("DELETE FROM fact WHERE target_id = ? AND type = ?").run(subject.targetId, type)
    : store.db.query("DELETE FROM fact WHERE entity_id = ? AND type = ?").run(subject.entityId, type);
  return result.changes > 0;
}

export function insertWorkerRun(store: KnowledgeStoreHandle, run: WorkerRunInput, submissions: readonly SubmissionInput[]): void {
  immediateTransaction(store.db, () => {
    store.db.query(`INSERT INTO worker_run
      (id, target_id, goal, baseline, run_id, worker_state_id, final_outcome, error_type, integration, integration_detail, started_at, ended_at, closed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      run.id, run.targetId, run.goal, run.baseline, run.runId ?? null, run.workerStateId ?? null, run.finalOutcome,
      run.errorType ?? null, run.integration ?? null, run.integrationDetail == null ? null : JSON.stringify(run.integrationDetail),
      run.startedAt, run.endedAt ?? null, run.closedAt,
    );
    const insertSubmission = store.db.query(`INSERT INTO submission
      (id, worker_run_id, seq, description, hypothesis, score, submitted_at, runtime_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const submission of submissions) {
      insertSubmission.run(submission.id, run.id, submission.seq, submission.description, submission.hypothesis ?? null,
        submission.score, submission.submittedAt, submission.runtimeRef ?? null);
    }
  });
}

export function updateWorkerRunIntegration(
  store: KnowledgeStoreHandle,
  id: string,
  integration: "integrated" | "conflicted" | null,
  detail: IntegrationDetail | null,
): boolean {
  return store.db.query("UPDATE worker_run SET integration = ?, integration_detail = ? WHERE id = ?").run(
    integration,
    detail == null ? null : JSON.stringify(detail),
    id,
  ).changes > 0;
}

export function insertRunNarrative(store: KnowledgeStoreHandle, narrative: RunNarrativeInput): void {
  store.db.query(`INSERT INTO run_narrative
    (worker_run_id, summary, notable_observations, narrative, produced_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    narrative.workerRunId,
    narrative.summary,
    JSON.stringify(narrative.notableObservations),
    JSON.stringify(narrative.narrative),
    narrative.producedBy,
    narrative.createdAt ?? now(),
  );
}

export function getRunNarrative(store: KnowledgeStoreHandle, workerRunId: string): RunNarrativeRow | null {
  const row = store.db.query<{
    worker_run_id: string;
    summary: string;
    notable_observations: string;
    narrative: string;
    produced_by: "live" | "backfill";
    created_at: string;
  }, [string]>(`SELECT worker_run_id, summary, notable_observations, narrative, produced_by, created_at
    FROM run_narrative WHERE worker_run_id = ?`).get(workerRunId);
  if (!row) return null;

  const parseStoredJson = <T>(value: string): T => {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  };

  return {
    workerRunId: row.worker_run_id,
    summary: row.summary,
    notableObservations: parseStoredJson<unknown[]>(row.notable_observations),
    narrative: parseStoredJson<unknown>(row.narrative),
    producedBy: row.produced_by,
    createdAt: row.created_at,
  };
}

export function insertEvent(store: KnowledgeStoreHandle, event: EventInput, refs: readonly EventRefInput[]): void {
  immediateTransaction(store.db, () => {
    store.db.query("INSERT INTO event (id, target_id, kind, cause, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      event.id, event.targetId, event.kind, event.cause ?? null, event.summary, event.createdAt ?? now(),
    );
    const insertRef = store.db.query("INSERT INTO event_ref (event_id, ref_kind, ref_id) VALUES (?, ?, ?)");
    for (const ref of refs) insertRef.run(event.id, ref.refKind, ref.refId);
  });
}

export function insertDiscordMessages(store: KnowledgeStoreHandle, messages: readonly DiscordMessageInput[]): void {
  immediateTransaction(store.db, () => {
    const insert = store.db.query(`INSERT INTO discord_message
      (id, channel, author, posted_at, content, thread_id, ingested_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const message of messages) {
      insert.run(message.id, message.channel, message.author, message.postedAt, message.content, message.threadId ?? null, message.ingestedAt ?? now());
    }
  });
}

export function insertWikiSections(store: KnowledgeStoreHandle, sections: readonly WikiSectionInput[]): void {
  immediateTransaction(store.db, () => {
    const insert = store.db.query(`INSERT INTO wiki_section
      (id, page, section, mirror_revision, content, ingested_at) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const section of sections) {
      insert.run(section.id, section.page, section.section, section.mirrorRevision, section.content, section.ingestedAt ?? now());
    }
  });
}

export function insertPullRequestEntries(store: KnowledgeStoreHandle, entries: readonly PullRequestEntryInput[]): void {
  immediateTransaction(store.db, () => {
    const insert = store.db.query(`INSERT INTO pull_request
      (id, target_id, entity_id, pr_ref, summary, outcome, merged_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const entry of entries) {
      insert.run(
        entry.id,
        entry.targetId ?? null,
        entry.entityId ?? null,
        entry.prRef,
        entry.summary,
        entry.outcome,
        entry.mergedAt,
      );
    }
  });
}

export function advanceWatermark(store: KnowledgeStoreHandle, source: "pr" | "discord" | "wiki" | "attempt", position: string): void {
  store.db.query(`INSERT INTO source_watermark (source, position, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (source) DO UPDATE SET position = excluded.position, updated_at = excluded.updated_at`).run(source, position, now());
}

export function enqueueIndexTask(store: KnowledgeStoreHandle, task: IndexTaskInput): void {
  store.db.query("INSERT INTO index_task (id, pathway, payload, enqueued_at) VALUES (?, ?, ?, ?)").run(
    task.id, task.pathway, task.payload, task.enqueuedAt ?? now(),
  );
}

export function claimIndexTask(store: KnowledgeStoreHandle, id: string, startedAt = now()): boolean {
  return store.db.query("UPDATE index_task SET started_at = ? WHERE id = ? AND started_at IS NULL AND done_at IS NULL").run(startedAt, id).changes > 0;
}

export function completeIndexTask(store: KnowledgeStoreHandle, id: string, doneAt = now()): boolean {
  return store.db.query("UPDATE index_task SET done_at = ? WHERE id = ? AND started_at IS NOT NULL AND done_at IS NULL").run(doneAt, id).changes > 0;
}

/** Release a claimed, unfinished task back to the queue (dry run, failed pass). */
export function releaseIndexTask(store: KnowledgeStoreHandle, id: string): boolean {
  return store.db.query("UPDATE index_task SET started_at = NULL WHERE id = ? AND started_at IS NOT NULL AND done_at IS NULL").run(id).changes > 0;
}

export function stampSubjectIndexed(store: KnowledgeStoreHandle, subject: SubjectRef, indexedAt = now()): void {
  if (subject.targetId !== undefined) {
    store.db.query(`INSERT INTO subject_index_state (target_id, entity_id, indexed_at) VALUES (?, NULL, ?)
      ON CONFLICT (target_id) WHERE target_id IS NOT NULL DO UPDATE SET indexed_at = excluded.indexed_at`).run(subject.targetId, indexedAt);
    return;
  }
  store.db.query(`INSERT INTO subject_index_state (target_id, entity_id, indexed_at) VALUES (NULL, ?, ?)
    ON CONFLICT (entity_id) WHERE entity_id IS NOT NULL DO UPDATE SET indexed_at = excluded.indexed_at`).run(subject.entityId, indexedAt);
}

// --- ingest additions (additive; used by knowledge-v2/ingest) ---

export function getWatermark(
  store: KnowledgeStoreHandle,
  source: "pr" | "discord" | "wiki" | "attempt",
): string | null {
  return store.db.query<{ position: string }, [typeof source]>(
    "SELECT position FROM source_watermark WHERE source = ?",
  ).get(source)?.position ?? null;
}

export interface TargetRowInput {
  id: string;
  kind: "function" | "data";
  unit: string;
  unitEntityId: string;
  symbol: string;
  stableKey: string;
  address: string;
  identityStatus: "current" | "moved" | "unresolved" | "retired";
  reportRevision: string;
}

export function insertTargets(store: KnowledgeStoreHandle, rows: readonly TargetRowInput[]): void {
  immediateTransaction(store.db, () => {
    const insert = store.db.query(`INSERT INTO target
      (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const row of rows) {
      insert.run(
        row.id,
        row.kind,
        row.unit,
        row.unitEntityId,
        row.symbol,
        row.stableKey,
        row.address,
        row.identityStatus,
        row.reportRevision,
      );
    }
  });
}

export function refreshTargetFromReport(
  store: KnowledgeStoreHandle,
  id: string,
  fields: { address?: string | null; identityStatus: "current"; reportRevision: string },
): void {
  store.db.query(`UPDATE target
    SET identity_status = 'current', report_revision = ?, address = COALESCE(?, address)
    WHERE id = ?`).run(fields.reportRevision, fields.address ?? null, id);
}

export function markTargetIdentity(
  store: KnowledgeStoreHandle,
  id: string,
  identityStatus: "moved" | "unresolved" | "retired",
  reportRevision: string,
): void {
  store.db.query("UPDATE target SET identity_status = ?, report_revision = ? WHERE id = ?").run(
    identityStatus,
    reportRevision,
    id,
  );
}

export interface TargetStatusInput {
  targetId: string;
  matchPct: number;
  linked: boolean;
  size?: number | null;
  contentHash?: string | null;
  reportRevision: string;
  updatedAt?: string;
}

export function upsertTargetStatuses(store: KnowledgeStoreHandle, rows: readonly TargetStatusInput[]): void {
  immediateTransaction(store.db, () => {
    const upsert = store.db.query(`INSERT INTO target_status
      (target_id, match_pct, linked, size, content_hash, report_revision, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (target_id) DO UPDATE SET
        match_pct = excluded.match_pct,
        linked = excluded.linked,
        size = excluded.size,
        content_hash = excluded.content_hash,
        report_revision = excluded.report_revision,
        updated_at = excluded.updated_at`);
    for (const row of rows) {
      upsert.run(
        row.targetId,
        row.matchPct,
        row.linked,
        row.size ?? null,
        row.contentHash ?? null,
        row.reportRevision,
        row.updatedAt ?? now(),
      );
    }
  });
}

export interface EntityRowInput {
  id: string;
  kind: "translation_unit" | "struct" | "struct_field" | "parameter" | "game_concept" | "pattern";
  locator: string;
  parentEntityId?: string | null;
}

export function insertEntitiesIfMissing(store: KnowledgeStoreHandle, rows: readonly EntityRowInput[]): number {
  return immediateTransaction(store.db, () => {
    const insert = store.db.query(`INSERT INTO entity
      (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
      VALUES (?, ?, ?, ?, 'active', NULL)
      ON CONFLICT (kind, locator) DO NOTHING`);
    let inserted = 0;
    for (const row of rows) {
      inserted += insert.run(row.id, row.kind, row.locator, row.parentEntityId ?? null).changes;
    }
    return inserted;
  });
}

export function updatePullRequestNarrative(
  store: KnowledgeStoreHandle,
  id: string,
  summary: string,
  outcome: "match" | "improvement" | "no_change" | "error",
): boolean {
  // DELIBERATE EXCEPTION to pull_request immutability: reserved for the librarian apply layer to
  // replace the mechanical "[mechanical] ..." placeholder summary with narrative.
  return store.db.query("UPDATE pull_request SET summary = ?, outcome = ? WHERE id = ?").run(
    summary,
    outcome,
    id,
  ).changes > 0;
}

interface LinkInput {
  id: string;
  from: SubjectRef;
  to: SubjectRef;
  role: string;
  why: string;
  kind: SourceKind;
  locator: string;
  digest?: string | null;
}

export function insertLink(store: KnowledgeStoreHandle, link: LinkInput): boolean {
  return immediateTransaction(store.db, () => {
    const fromTargetId = link.from.targetId ?? null;
    const fromEntityId = link.from.entityId ?? null;
    const toTargetId = link.to.targetId ?? null;
    const toEntityId = link.to.entityId ?? null;
    const duplicate = store.db.query<{ id: string }, [string | null, string | null, string | null, string | null, string, string]>(`SELECT id FROM link
      WHERE from_target_id IS ? AND from_entity_id IS ?
        AND to_target_id IS ? AND to_entity_id IS ?
        AND role = ? AND locator = ?
      LIMIT 1`).get(fromTargetId, fromEntityId, toTargetId, toEntityId, link.role, link.locator);
    if (duplicate) return false;

    store.db.query(`INSERT INTO link
      (id, from_target_id, from_entity_id, to_target_id, to_entity_id, role, why, kind, locator, digest)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      link.id,
      fromTargetId,
      fromEntityId,
      toTargetId,
      toEntityId,
      link.role,
      link.why,
      link.kind,
      link.locator,
      link.digest ?? null,
    );
    return true;
  });
}

type CuratedEntityKind = "game_concept" | "pattern";

interface CuratedEntityInput {
  kind: CuratedEntityKind;
  locator: string;
  parentEntityId?: string | null;
}

interface CuratedEntityResult {
  id: string;
  admitted: boolean;
}

export function admitCuratedEntity(store: KnowledgeStoreHandle, entity: CuratedEntityInput): CuratedEntityResult {
  return immediateTransaction(store.db, () => {
    const existing = store.db.query<{ id: string; identityStatus: "active" | "merged" | "retired" }, [CuratedEntityKind, string]>(`SELECT
      id,
      identity_status AS identityStatus
      FROM entity
      WHERE kind = ? AND locator = ?`).get(entity.kind, entity.locator);
    if (existing?.identityStatus === "active") return { id: existing.id, admitted: false };

    if (existing) {
      store.db.query(`UPDATE entity
        SET parent_entity_id = ?, identity_status = 'active', merged_into_id = NULL
        WHERE id = ?`).run(entity.parentEntityId ?? null, existing.id);
      return { id: existing.id, admitted: true };
    }

    const id = `${entity.kind}:${entity.locator}`;
    store.db.query(`INSERT INTO entity
      (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
      VALUES (?, ?, ?, ?, 'active', NULL)`).run(id, entity.kind, entity.locator, entity.parentEntityId ?? null);
    return { id, admitted: true };
  });
}

interface LiveFactRow {
  id: string;
  targetId: string | null;
  entityId: string | null;
  type: FactType;
  value: string;
  rationale: string;
  confidence: number;
  updatedAt: string;
}

export function getLiveFact(
  store: KnowledgeStoreHandle,
  subject: SubjectRef,
  type: FactType,
): LiveFactRow | null {
  const row = subject.targetId !== undefined
    ? store.db.query<LiveFactRow, [string, FactType]>(`SELECT
        id,
        target_id AS targetId,
        entity_id AS entityId,
        type,
        value,
        rationale,
        confidence,
        updated_at AS updatedAt
        FROM fact
        WHERE target_id = ? AND type = ?`).get(subject.targetId, type)
    : store.db.query<LiveFactRow, [string, FactType]>(`SELECT
        id,
        target_id AS targetId,
        entity_id AS entityId,
        type,
        value,
        rationale,
        confidence,
        updated_at AS updatedAt
        FROM fact
        WHERE entity_id = ? AND type = ?`).get(subject.entityId, type);
  return row ?? null;
}

interface MergeEntitiesResult {
  factsFolded: number;
  linksRepointed: number;
  linksDeduplicated: number;
}

export function mergeEntities(
  store: KnowledgeStoreHandle,
  loserEntityId: string,
  winnerEntityId: string,
): MergeEntitiesResult {
  return immediateTransaction(store.db, () => {
    if (loserEntityId === winnerEntityId) throw new Error("Cannot merge an entity into itself");

    type MergeEntityRow = {
      id: string;
      kind: string;
      identityStatus: "active" | "merged" | "retired";
      mergedIntoId: string | null;
    };
    const selectEntity = store.db.query<MergeEntityRow, [string]>(`SELECT
      id,
      kind,
      identity_status AS identityStatus,
      merged_into_id AS mergedIntoId
      FROM entity
      WHERE id = ?`);
    const loser = selectEntity.get(loserEntityId);
    const winner = selectEntity.get(winnerEntityId);
    if (!loser || !winner) throw new Error("Cannot merge missing entities");
    if (!(["game_concept", "pattern"] as string[]).includes(loser.kind)
      || !(["game_concept", "pattern"] as string[]).includes(winner.kind)) {
      throw new Error("Cannot merge mechanical entities");
    }
    if (winner.identityStatus === "merged") throw new Error("Merge winner must resolve to an active or retired entity");
    if (loser.identityStatus === "merged") {
      if (loser.mergedIntoId === winnerEntityId) {
        return { factsFolded: 0, linksRepointed: 0, linksDeduplicated: 0 };
      }
      throw new Error("Merge loser already points to another entity");
    }
    if (winner.identityStatus === "retired") {
      store.db.query(`UPDATE entity
        SET identity_status = 'active', merged_into_id = NULL
        WHERE id = ?`).run(winnerEntityId);
    }

    const loserFacts = store.db.query<LiveFactRow, [string]>(`SELECT
      id,
      target_id AS targetId,
      entity_id AS entityId,
      type,
      value,
      rationale,
      confidence,
      updated_at AS updatedAt
      FROM fact
      WHERE entity_id = ?`).all(loserEntityId);
    for (const loserFact of loserFacts) {
      const winnerFact = store.db.query<{ id: string }, [string, FactType]>(
        "SELECT id FROM fact WHERE entity_id = ? AND type = ?",
      ).get(winnerEntityId, loserFact.type);
      if (!winnerFact) {
        store.db.query("UPDATE fact SET entity_id = ? WHERE id = ?").run(winnerEntityId, loserFact.id);
        continue;
      }

      store.db.query("DELETE FROM evidence WHERE fact_id = ?").run(winnerFact.id);
      store.db.query(`UPDATE fact
        SET value = ?, rationale = ?, confidence = ?, updated_at = ?
        WHERE id = ?`).run(
        loserFact.value,
        loserFact.rationale,
        loserFact.confidence,
        loserFact.updatedAt,
        winnerFact.id,
      );
      store.db.query("UPDATE evidence SET fact_id = ? WHERE fact_id = ?").run(winnerFact.id, loserFact.id);
      store.db.query("DELETE FROM fact WHERE id = ?").run(loserFact.id);
    }

    type MergeLinkRow = {
      id: string;
      fromTargetId: string | null;
      fromEntityId: string | null;
      toTargetId: string | null;
      toEntityId: string | null;
      role: string;
      locator: string;
    };
    const loserLinks = store.db.query<MergeLinkRow, [string, string]>(`SELECT
      id,
      from_target_id AS fromTargetId,
      from_entity_id AS fromEntityId,
      to_target_id AS toTargetId,
      to_entity_id AS toEntityId,
      role,
      locator
      FROM link
      WHERE from_entity_id = ? OR to_entity_id = ?`).all(loserEntityId, loserEntityId);
    let linksRepointed = 0;
    let linksDeduplicated = 0;
    for (const link of loserLinks) {
      const fromEntityId = link.fromEntityId === loserEntityId ? winnerEntityId : link.fromEntityId;
      const toEntityId = link.toEntityId === loserEntityId ? winnerEntityId : link.toEntityId;
      const duplicate = store.db.query<{ id: string }, [string, string | null, string | null, string | null, string | null, string, string]>(`SELECT id FROM link
        WHERE id <> ?
          AND from_target_id IS ? AND from_entity_id IS ?
          AND to_target_id IS ? AND to_entity_id IS ?
          AND role = ? AND locator = ?
        LIMIT 1`).get(
        link.id,
        link.fromTargetId,
        fromEntityId,
        link.toTargetId,
        toEntityId,
        link.role,
        link.locator,
      );
      if (duplicate) {
        store.db.query("DELETE FROM link WHERE id = ?").run(link.id);
        linksDeduplicated += 1;
        continue;
      }

      store.db.query("UPDATE link SET from_entity_id = ?, to_entity_id = ? WHERE id = ?").run(
        fromEntityId,
        toEntityId,
        link.id,
      );
      linksRepointed += 1;
    }

    store.db.query(`UPDATE entity
      SET identity_status = 'merged', merged_into_id = ?
      WHERE id = ?`).run(winnerEntityId, loserEntityId);
    return { factsFolded: loserFacts.length, linksRepointed, linksDeduplicated };
  });
}
