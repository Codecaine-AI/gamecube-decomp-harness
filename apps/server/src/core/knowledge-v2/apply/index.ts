/**
 * Librarian apply isolation model: SQLite writes are already serialized by WAL plus
 * immediateTransaction. The shared gate prevents semantic clobbering across parallel
 * passes: curated-entity admissions, merges, and facts serialize through it. All other
 * writes are partitioned by pass scope and need no lock.
 */
import { randomUUID } from "node:crypto";
import {
  admitCuratedEntity,
  clearFact,
  getLiveFact,
  insertLink,
  mergeEntities,
  writeFactWithEvidence,
  type EvidenceInput,
  type FactType,
  type KnowledgeStoreHandle,
  type SourceKind,
  type SubjectRef,
} from "../records/index.js";
import { parseLocator } from "../locator.js";
import { resolvePrComment } from "../ingest/prs.js";
import {
  createCodeFileCache,
  resolveCitation,
  type CodeFileCache,
} from "./resolver.js";

export interface SharedGate {
  run<T>(operation: () => T | Promise<T>): Promise<T>;
}

export function createSharedGate(): SharedGate {
  let tail: Promise<void> = Promise.resolve();
  return {
    run<T>(operation: () => T | Promise<T>): Promise<T> {
      const result = tail.then(operation);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

export interface ApplyOptions {
  scope: {
    targetStableKeys: string[];
    entityLocators: string[];
  };
  sharedWriteGate: SharedGate;
  checkoutRoot: string;
  codeFileCache?: CodeFileCache;
  prsRoot?: string;
  requiredCitation?: { kind: "pr"; prNumber: string };
  headRevision?: string;
  renamedSubjects?: string[];
  driftedFacts?: Array<{ subject: string; type: FactType }>;
  dryRun?: boolean;
  now?: () => string;
}

export type ApplyItemKind = "fact" | "link" | "entity" | "merge" | "follow_up";
export type ApplyAction = "applied" | "rejected" | "skipped";

export const APPLY_REJECT_REASONS = [
  "ambiguous_entity_locator", "ambiguous_target", "code_revision_unresolvable",
  "code_span_out_of_range", "follow_up_cap", "follow_up_in_scope", "internal_error",
  "invalid_confidence", "invalid_entity_kind", "invalid_fact_type", "invalid_kind", "invalid_op",
  "irrelevant_pr_citation", "kind_locator_mismatch", "malformed_envelope", "malformed_locator",
  "mechanical_merge_rejected", "missing_field", "missing_pr_citation", "out_of_scope",
  "pr_comment_not_found", "pr_comments_unavailable", "submission_not_found", "unknown_envelope_key",
  "unresolved_locator", "unresolved_subject",
] as const;
export type ApplyRejectReason = typeof APPLY_REJECT_REASONS[number];

export interface RejectionMessageContext {
  key?: string;
  item?: unknown;
  subject?: string;
  writableSubjects?: string[];
  locator?: string;
  revision?: string;
  headRevision?: string;
  lineCount?: number;
  prNumber?: string;
}

const locatorGrammars = "discord://message/<id>, pr://<n>[/comment/<i>], wiki://<section-id>, attempt://run/<run-id>[/submission/<n>][/transcript/<span>], or code://<revision>/<path>#L<start>-L<end>";
const shown = (value: string | undefined, fallback = "the supplied value"): string => value ?? fallback;

export const REJECTION_MESSAGES: Record<ApplyRejectReason, (context: RejectionMessageContext) => string> = {
  ambiguous_entity_locator: ({ subject }) => `Subject ${shown(subject)} matches more than one entity. Use one canonical, unambiguous entity_locator.`,
  ambiguous_target: ({ subject }) => `Subject ${shown(subject)} matches more than one target. Use the unique current target_stable_key.`,
  code_revision_unresolvable: ({ revision, headRevision }) => `Revision ${shown(revision)} does not resolve in the checkout; every code:// citation must use head_revision ${shown(headRevision, "from the pass context")}, never a report hash.`,
  code_span_out_of_range: ({ locator, lineCount }) => `Code span ${shown(locator)} is outside the file${lineCount === undefined ? "" : `, which has ${lineCount} lines`}. Cite an existing inclusive line range.`,
  follow_up_cap: () => "This pass already accepted 10 follow-ups. Keep the 10 most useful subjects and move this one to a later pass.",
  follow_up_in_scope: ({ subject }) => `Subject ${shown(subject)} is already writable in this pass. Move the proposed work into facts or links, or drop this follow-up.`,
  internal_error: () => "Apply failed while processing this item. Resubmit the item unchanged once; if it fails again, drop it and preserve the finding in a follow-up.",
  invalid_confidence: () => "confidence must be a finite number from 0 through 1. Replace it with a number in that range.",
  invalid_entity_kind: () => "Curated entity kind must be game_concept or pattern. Use one of those kinds or drop the entity.",
  invalid_fact_type: () => "Fact type is invalid. Use purpose, inferred_name, inferred_type, data_flow, state_behavior, or game_mapping.",
  invalid_kind: () => "Citation kind is invalid. Use pr, discord, attempt, wiki, or code and make the locator use the same scheme.",
  invalid_op: () => "Fact op must be write or clear. Use write with a claim, or clear with an empty value.",
  irrelevant_pr_citation: ({ subject, prNumber }) => `The cited PR comment does not name ${shown(subject)} in its body or diff hunk. Cite a relevant comment as pr://${shown(prNumber, "<n>")}/comment/<i>.`,
  kind_locator_mismatch: ({ locator }) => `Citation kind does not match locator ${shown(locator)}. Change the kind to match the locator scheme or replace the locator.`,
  malformed_envelope: () => "The envelope contains an unknown top-level key, so no items can be applied. Return exactly facts, links, entities, merges, and follow_ups, then resubmit this item.",
  malformed_locator: ({ locator }) => `Locator ${shown(locator)} is malformed. Use one of these five grammars: ${locatorGrammars}.`,
  mechanical_merge_rejected: () => "Mechanical entities cannot be merged by a librarian pass. Drop this merge; only game_concept and pattern entities may be merged here.",
  missing_field: () => "This item is missing a required field or has the wrong field shape. Rebuild it from the schema and supply every required field with the declared type.",
  missing_pr_citation: ({ subject, prNumber }) => `No cited PR comment names ${shown(subject)} in its body or diff hunk. Add a relevant citation in the form pr://${shown(prNumber, "<n>")}/comment/<i>.`,
  out_of_scope: ({ subject, writableSubjects = [] }) => `Subject ${shown(subject)} is not a touched subject of this pass; the writable subjects are [${writableSubjects.slice(0, 20).join(", ")}]. Drop this item or move what you learned into follow_ups.`,
  pr_comment_not_found: ({ locator }) => `PR comment ${shown(locator)} was not found in the archive. Replace it with an existing pr://<n>/comment/<i> locator.`,
  pr_comments_unavailable: () => "PR comment records are unavailable for this pass. Drop the PR-dependent item or retry with the PR archive attached.",
  submission_not_found: ({ locator }) => `Attempt submission ${shown(locator)} was not found. Cite an existing attempt://run/<run-id>/submission/<n> record.`,
  unknown_envelope_key: ({ key }) => `Top-level key ${shown(key)} is not allowed. Return exactly the five keys facts, links, entities, merges, and follow_ups.`,
  unresolved_locator: ({ locator }) => `Citation ${shown(locator)} does not resolve to an ingested record. Replace it with an existing source locator or drop the unsupported item.`,
  unresolved_subject: ({ subject }) => `Subject ${shown(subject)} does not resolve to a known target or entity. Use an existing target_stable_key or entity_locator.`,
};

interface ApplyItemResultBase {
  index: number;
  itemKind: ApplyItemKind;
  item: unknown;
}

export type ApplyItemResult = ApplyItemResultBase & (
  | { action: "rejected"; reason: ApplyRejectReason; message: string; note?: never; subject?: never }
  | { action: "skipped"; reason: string; message?: never; note?: never; subject?: never }
  | {
    action: "applied";
    reason?: never;
    message?: never;
    note?: string;
    subject?: ({ targetId: string; targetStableKey: string } | { entityId: string; entityLocator: string });
  }
);

export interface ApplyReport {
  startedAt: string;
  dryRun: boolean;
  items: ApplyItemResult[];
  follow_ups: ApplyItemResult[];
  envelope_rejections: Array<{ key: string; reason: "unknown_envelope_key"; message: string }>;
  counts: {
    applied: number;
    rejected: number;
    skipped: number;
  };
  follow_up_counts: {
    applied: number;
    rejected: number;
    skipped: number;
  };
}

type EntityKind = "translation_unit" | "struct" | "struct_field" | "parameter" | "game_concept" | "pattern";
type CuratedEntityKind = "game_concept" | "pattern";

interface EntityRow {
  id: string;
  kind: EntityKind;
  locator: string;
  identity_status: "active" | "merged" | "retired";
  merged_into_id: string | null;
}

interface ResolvedSubject {
  ref: SubjectRef;
  targetStableKey?: string;
  entityId?: string;
  entityLocator?: string;
  entityKind?: EntityKind;
  curated: boolean;
}

type Resolution<T> = { ok: true; value: T } | { ok: false; reason: ApplyRejectReason };

interface ValidFact {
  subject: Record<string, unknown>;
  type: FactType;
  op: "write" | "clear";
  value: string;
  rationale: string;
  confidence: number;
  evidence: Array<{ kind: SourceKind; locator: string; why: string }>;
}

interface ValidLink {
  from: Record<string, unknown>;
  to: Record<string, unknown>;
  role: string;
  why: string;
  kind: SourceKind;
  locator: string;
}

interface ValidEntity {
  kind: CuratedEntityKind;
  locator: string;
  note: string;
}

interface ValidMerge {
  loserLocator: string;
  winnerLocator: string;
  why: string;
}

interface ValidFollowUp {
  subject: Record<string, unknown>;
  why: string;
}

interface IndexedItem {
  index: number;
  itemKind: ApplyItemKind;
  item: unknown;
}

const FACT_TYPES = new Set<string>([
  "purpose",
  "inferred_name",
  "inferred_type",
  "data_flow",
  "state_behavior",
  "game_mapping",
]);
const SOURCE_KINDS = new Set<string>(["pr", "discord", "attempt", "wiki", "code"]);
const CURATED_KINDS = new Set<string>(["game_concept", "pattern"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string";
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function rawSubjectLabel(item: unknown): string | undefined {
  if (!isRecord(item)) return undefined;
  const candidate = isRecord(item.subject) ? item.subject : isRecord(item.from) ? item.from : undefined;
  if (candidate === undefined) return undefined;
  return typeof candidate.target_stable_key === "string"
    ? candidate.target_stable_key
    : typeof candidate.entity_locator === "string" ? candidate.entity_locator : undefined;
}

function rejected(
  item: IndexedItem,
  reason: ApplyRejectReason,
  context: RejectionMessageContext = {},
): ApplyItemResult {
  return {
    ...item,
    action: "rejected",
    reason,
    message: REJECTION_MESSAGES[reason]({ item: item.item, subject: rawSubjectLabel(item.item), ...context }),
  };
}

function skipped(item: IndexedItem, reason: string): ApplyItemResult {
  return { ...item, action: "skipped", reason };
}

function applied(item: IndexedItem, note?: string): ApplyItemResult {
  return { ...item, action: "applied", ...(note === undefined ? {} : { note }) };
}

function validateSubjectShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const hasTarget = hasString(value, "target_stable_key");
  const hasEntity = hasString(value, "entity_locator");
  return hasTarget !== hasEntity;
}

function validateFact(value: unknown): Resolution<ValidFact> {
  if (!isRecord(value)) return { ok: false, reason: "missing_field" };
  if (!hasOwn(value, "type")
    || !hasOwn(value, "op")
    || !hasOwn(value, "confidence")
    || !validateSubjectShape(value.subject)
    || !hasString(value, "value")
    || !hasString(value, "rationale")
    || !Array.isArray(value.evidence)) {
    return { ok: false, reason: "missing_field" };
  }
  if (typeof value.type !== "string" || !FACT_TYPES.has(value.type)) {
    return { ok: false, reason: "invalid_fact_type" };
  }
  if (value.op !== "write" && value.op !== "clear") {
    return { ok: false, reason: "invalid_op" };
  }
  if (typeof value.confidence !== "number"
    || !Number.isFinite(value.confidence)
    || value.confidence < 0
    || value.confidence > 1) {
    return { ok: false, reason: "invalid_confidence" };
  }
  const evidence: ValidFact["evidence"] = [];
  for (const citation of value.evidence) {
    if (!isRecord(citation)
      || !hasOwn(citation, "kind")
      || !hasString(citation, "locator")
      || !hasString(citation, "why")) {
      return { ok: false, reason: "missing_field" };
    }
    if (typeof citation.kind !== "string" || !SOURCE_KINDS.has(citation.kind)) {
      return { ok: false, reason: "invalid_kind" };
    }
    evidence.push({
      kind: citation.kind as SourceKind,
      locator: citation.locator as string,
      why: citation.why as string,
    });
  }
  return {
    ok: true,
    value: {
      subject: value.subject as Record<string, unknown>,
      type: value.type as FactType,
      op: value.op,
      value: value.value as string,
      rationale: value.rationale as string,
      confidence: value.confidence,
      evidence,
    },
  };
}

function validateLink(value: unknown): Resolution<ValidLink> {
  if (!isRecord(value)
    || !hasOwn(value, "kind")
    || !validateSubjectShape(value.from)
    || !validateSubjectShape(value.to)
    || !hasString(value, "role")
    || !hasString(value, "why")
    || !hasString(value, "locator")) {
    return { ok: false, reason: "missing_field" };
  }
  if (typeof value.kind !== "string" || !SOURCE_KINDS.has(value.kind)) {
    return { ok: false, reason: "invalid_kind" };
  }
  return {
    ok: true,
    value: {
      from: value.from as Record<string, unknown>,
      to: value.to as Record<string, unknown>,
      role: value.role as string,
      why: value.why as string,
      kind: value.kind as SourceKind,
      locator: value.locator as string,
    },
  };
}

function validateEntity(value: unknown): Resolution<ValidEntity> {
  if (!isRecord(value)
    || !hasOwn(value, "kind")
    || !hasString(value, "locator")
    || !hasString(value, "note")) {
    return { ok: false, reason: "missing_field" };
  }
  if (typeof value.kind !== "string" || !CURATED_KINDS.has(value.kind)) {
    return { ok: false, reason: "invalid_entity_kind" };
  }
  return {
    ok: true,
    value: {
      kind: value.kind as CuratedEntityKind,
      locator: value.locator as string,
      note: value.note as string,
    },
  };
}

function validateMerge(value: unknown): Resolution<ValidMerge> {
  if (!isRecord(value)
    || !hasString(value, "loser_locator")
    || !hasString(value, "winner_locator")
    || !hasString(value, "why")) {
    return { ok: false, reason: "missing_field" };
  }
  return {
    ok: true,
    value: {
      loserLocator: value.loser_locator as string,
      winnerLocator: value.winner_locator as string,
      why: value.why as string,
    },
  };
}

function validateFollowUp(value: unknown): Resolution<ValidFollowUp> {
  if (!isRecord(value) || !validateSubjectShape(value.subject)
    || typeof value.why !== "string" || value.why.trim().length === 0) {
    return { ok: false, reason: "missing_field" };
  }
  return { ok: true, value: { subject: value.subject, why: value.why } };
}

function followMergedEntity(store: KnowledgeStoreHandle, row: EntityRow): Resolution<EntityRow> {
  let current = row;
  const visited = new Set<string>();
  while (current.identity_status === "merged") {
    if (current.merged_into_id === null || visited.has(current.id)) {
      return { ok: false, reason: "unresolved_subject" };
    }
    visited.add(current.id);
    const winner = store.db.query<EntityRow, [string]>(
      "SELECT id, kind, locator, identity_status, merged_into_id FROM entity WHERE id = ?",
    ).get(current.merged_into_id);
    if (winner == null) return { ok: false, reason: "unresolved_subject" };
    current = winner;
  }
  return { ok: true, value: current };
}

function resolveEntity(
  store: KnowledgeStoreHandle,
  idOrLocator: string,
  virtualEntities: ReadonlyMap<string, readonly EntityRow[]>,
): Resolution<EntityRow> {
  const byId = store.db.query<EntityRow, [string]>(
    "SELECT id, kind, locator, identity_status, merged_into_id FROM entity WHERE id = ?",
  ).get(idOrLocator);
  if (byId != null) {
    const pendingById = (virtualEntities.get(byId.locator) ?? []).find(({ id }) => id === byId.id);
    return pendingById === undefined
      ? followMergedEntity(store, byId)
      : { ok: true, value: pendingById };
  }

  for (const rows of virtualEntities.values()) {
    const virtualById = rows.find(({ id }) => id === idOrLocator);
    if (virtualById !== undefined) return { ok: true, value: virtualById };
  }

  const storedByLocator = store.db.query<EntityRow, [string]>(
    "SELECT id, kind, locator, identity_status, merged_into_id FROM entity WHERE locator = ? ORDER BY id",
  ).all(idOrLocator);
  const candidates = new Map(storedByLocator.map((row) => [row.id, row]));
  for (const virtual of virtualEntities.get(idOrLocator) ?? []) candidates.set(virtual.id, virtual);
  const byLocator = [...candidates.values()];
  if (byLocator.length > 1) return { ok: false, reason: "ambiguous_entity_locator" };
  if (byLocator.length === 1) return followMergedEntity(store, byLocator[0]);
  return { ok: false, reason: "unresolved_subject" };
}

function resolveSubject(
  store: KnowledgeStoreHandle,
  raw: Record<string, unknown>,
  virtualEntities: ReadonlyMap<string, readonly EntityRow[]>,
): Resolution<ResolvedSubject> {
  if (typeof raw.target_stable_key === "string") {
    const rows = store.db.query<{
      id: string;
      stable_key: string;
      identity_status: string;
    }, [string]>(
      "SELECT id, stable_key, identity_status FROM target WHERE stable_key = ? ORDER BY id",
    ).all(raw.target_stable_key);
    const current = rows.filter((row) => row.identity_status === "current");
    if (current.length > 1 || (current.length === 0 && rows.length > 1)) {
      return { ok: false, reason: "ambiguous_target" };
    }
    const row = current[0] ?? rows[0];
    if (row === undefined) return { ok: false, reason: "unresolved_subject" };
    return {
      ok: true,
      value: {
        ref: { targetId: row.id },
        targetStableKey: row.stable_key,
        curated: false,
      },
    };
  }

  const entity = resolveEntity(store, raw.entity_locator as string, virtualEntities);
  if (!entity.ok) return entity;
  return {
    ok: true,
    value: {
      ref: { entityId: entity.value.id },
      entityId: entity.value.id,
      entityLocator: entity.value.locator,
      entityKind: entity.value.kind,
      curated: CURATED_KINDS.has(entity.value.kind),
    },
  };
}

function subjectIsInScope(subject: ResolvedSubject, options: ApplyOptions): boolean {
  if (subject.curated) return true;
  if (subject.targetStableKey !== undefined) {
    return options.scope.targetStableKeys.includes(subject.targetStableKey);
  }
  return (subject.entityId !== undefined && options.scope.entityLocators.includes(subject.entityId))
    || (subject.entityLocator !== undefined && options.scope.entityLocators.includes(subject.entityLocator));
}

type RequiredCitationResult = { ok: true } | { ok: false; reason: string };

function subjectTerms(store: KnowledgeStoreHandle, subject: ResolvedSubject): string[] {
  if (subject.ref.targetId !== undefined) {
    const target = store.db.query<{ symbol: string; address: string }, [string]>(
      "SELECT symbol, address FROM target WHERE id = ?",
    ).get(subject.ref.targetId);
    if (target === null || target === undefined) return [];
    const addressWithoutPrefix = target.address.replace(/^0x/iu, "");
    return [target.symbol, target.address, addressWithoutPrefix];
  }
  if (subject.entityLocator === undefined) return [];
  const basename = subject.entityLocator.split("/").at(-1) ?? subject.entityLocator;
  return [subject.entityLocator, basename];
}

function checkRequiredCitation(
  store: KnowledgeStoreHandle,
  citations: ReadonlyArray<{ kind: SourceKind; locator: string }>,
  requiredCitation: ApplyOptions["requiredCitation"],
  options: ApplyOptions,
  subjects: readonly ResolvedSubject[],
  factType?: FactType,
): RequiredCitationResult {
  if (requiredCitation === undefined) return { ok: true };
  const renamed = new Set(options.renamedSubjects ?? []);
  const hasRenamedSubject = subjects.some((subject) =>
    subject.targetStableKey !== undefined && renamed.has(subject.targetStableKey));
  const hasHeadCodeCitation = options.headRevision !== undefined && citations.some((citation) => {
    if (citation.kind !== "code") return false;
    try {
      const parsed = parseLocator(citation.locator);
      return parsed.kind === "code" && parsed.revision === options.headRevision;
    } catch {
      return false;
    }
  });
  if (hasRenamedSubject && hasHeadCodeCitation) return { ok: true };
  const hasDriftedFact = factType !== undefined && subjects.some((subject) => {
    const subjectKey = subject.targetStableKey ?? subject.entityLocator;
    return subjectKey !== undefined && options.driftedFacts?.some((drifted) =>
      drifted.subject === subjectKey && drifted.type === factType) === true;
  });
  if (hasDriftedFact && hasHeadCodeCitation) return { ok: true };
  const comments = citations.flatMap((citation) => {
    if (citation.kind !== "pr") return [];
    try {
      const parsed = parseLocator(citation.locator);
      return parsed.kind === "pr"
        && parsed.pullRequestId === requiredCitation.prNumber
        && parsed.commentNumber !== undefined
        ? [parsed.commentNumber]
        : [];
    } catch {
      return [];
    }
  });
  if (comments.length === 0) return { ok: false, reason: "missing_pr_citation" };
  if (options.prsRoot === undefined) return { ok: false, reason: "pr_comments_unavailable" };

  for (const commentNumber of comments) {
    const comment = resolvePrComment(options.prsRoot, Number(requiredCitation.prNumber), commentNumber);
    if (comment === null) return { ok: false, reason: "pr_comment_not_found" };
    const targetText = `${comment.body}\n${comment.diffHunk ?? ""}`.toLocaleLowerCase();
    const entityPath = (comment.path ?? "").toLocaleLowerCase();
    if (subjects.some((subject) => {
      const termsForSubject = subjectTerms(store, subject);
      return termsForSubject.some((term) => {
        const normalized = term.toLocaleLowerCase();
        return targetText.includes(normalized)
          || (subject.ref.entityId !== undefined && entityPath.includes(normalized));
      });
    })) return { ok: true };
  }
  return { ok: false, reason: "irrelevant_pr_citation" };
}

async function applyEntityItem(
  store: KnowledgeStoreHandle,
  item: IndexedItem,
  options: ApplyOptions,
  virtualEntities: Map<string, EntityRow[]>,
): Promise<ApplyItemResult> {
  const valid = validateEntity(item.item);
  if (!valid.ok) return rejected(item, valid.reason);
  const entity = valid.value;
  return options.sharedWriteGate.run(() => {
    const setVirtual = (row: EntityRow): void => {
      const rows = virtualEntities.get(row.locator) ?? [];
      virtualEntities.set(row.locator, [...rows.filter(({ id }) => id !== row.id), row]);
    };
    const pending = (virtualEntities.get(entity.locator) ?? []).find(({ kind }) => kind === entity.kind);
    if (pending?.identity_status === "active") return skipped(item, "already_admitted");
    const existing = store.db.query<EntityRow, [CuratedEntityKind, string]>(
      `SELECT id, kind, locator, identity_status, merged_into_id FROM entity
       WHERE kind = ? AND locator = ?`,
    ).get(entity.kind, entity.locator);
    if (existing?.identity_status === "active") {
      setVirtual(existing);
      return skipped(item, "already_admitted");
    }
    if (options.dryRun) {
      setVirtual({
        id: `${entity.kind}:${entity.locator}`,
        kind: entity.kind,
        locator: entity.locator,
        identity_status: "active",
        merged_into_id: null,
        ...(existing == null ? {} : { id: existing.id }),
      });
      return applied(item);
    }
    const result = admitCuratedEntity(store, { kind: entity.kind, locator: entity.locator });
    const admittedRow: EntityRow = {
      id: result.id,
      kind: entity.kind,
      locator: entity.locator,
      identity_status: "active",
      merged_into_id: null,
    };
    setVirtual(admittedRow);
    return result.admitted ? applied(item) : skipped(item, "already_admitted");
  });
}

async function applyFactItem(
  store: KnowledgeStoreHandle,
  item: IndexedItem,
  options: ApplyOptions,
  startedAt: string,
  virtualEntities: ReadonlyMap<string, readonly EntityRow[]>,
  dryRunFacts: Map<string, { updatedAt: string } | null>,
): Promise<ApplyItemResult> {
  const valid = validateFact(item.item);
  if (!valid.ok) return rejected(item, valid.reason);
  const fact = valid.value;
  const subject = resolveSubject(store, fact.subject, virtualEntities);
  if (!subject.ok) return rejected(item, subject.reason);
  if (!subjectIsInScope(subject.value, options)) return rejected(item, "out_of_scope", {
    subject: subject.value.targetStableKey ?? subject.value.entityLocator,
    writableSubjects: [...options.scope.targetStableKeys, ...options.scope.entityLocators],
  });
  const requiredCitation = checkRequiredCitation(
    store, fact.evidence, options.requiredCitation, options, [subject.value], fact.type,
  );
  if (!requiredCitation.ok) return rejected(item, requiredCitation.reason as ApplyRejectReason, {
    prNumber: options.requiredCitation?.prNumber,
  });

  const evidence: EvidenceInput[] = [];
  for (const citation of fact.evidence) {
    const resolution = resolveCitation(store, citation, {
      checkoutRoot: options.checkoutRoot,
      prsRoot: options.prsRoot,
      codeFileCache: options.codeFileCache,
    });
    if (!resolution.ok) {
      let revision: string | undefined;
      try {
        const parsed = parseLocator(citation.locator);
        if (parsed.kind === "code") revision = parsed.revision;
      } catch {}
      return rejected(item, resolution.reason, {
        locator: citation.locator,
        revision,
        headRevision: options.headRevision,
        lineCount: resolution.lineCount,
      });
    }
    evidence.push({
      id: `evidence:${randomUUID()}`,
      kind: citation.kind,
      locator: citation.locator,
      digest: resolution.digest,
      why: citation.why,
      capturedAt: startedAt,
    });
  }

  const perform = (resolved: ResolvedSubject): ApplyItemResult => {
    const subjectKey = resolved.ref.targetId !== undefined
      ? `target:${resolved.ref.targetId}:${fact.type}`
      : `entity:${resolved.ref.entityId}:${fact.type}`;
    const storedLive = getLiveFact(store, resolved.ref, fact.type);
    const live = options.dryRun && dryRunFacts.has(subjectKey)
      ? dryRunFacts.get(subjectKey) ?? null
      : storedLive;
    if (resolved.curated && live !== null && live.updatedAt > startedAt) {
      return skipped(item, "concurrent_newer_fact");
    }
    if (fact.op === "clear") {
      if (live === null) return skipped(item, "nothing_to_clear");
      if (!options.dryRun) clearFact(store, resolved.ref, fact.type);
      else dryRunFacts.set(subjectKey, null);
      return applied(item);
    }
    const confidenceClamped = fact.confidence > 0.99;
    if (!options.dryRun) {
      writeFactWithEvidence(store, {
        id: `fact:${randomUUID()}`,
        ...resolved.ref,
        type: fact.type,
        value: fact.value,
        rationale: fact.rationale,
        confidence: confidenceClamped ? 0.99 : fact.confidence,
        updatedAt: startedAt,
      }, evidence);
    } else dryRunFacts.set(subjectKey, { updatedAt: startedAt });
    return applied(item, confidenceClamped ? "confidence_clamped_to_0.99" : undefined);
  };

  if (!subject.value.curated) return perform(subject.value);
  return options.sharedWriteGate.run(() => {
    const refreshed = resolveSubject(store, fact.subject, virtualEntities);
    if (!refreshed.ok) return rejected(item, refreshed.reason);
    if (!refreshed.value.curated) return rejected(item, "out_of_scope");
    return perform(refreshed.value);
  });
}

async function applyLinkItem(
  store: KnowledgeStoreHandle,
  item: IndexedItem,
  options: ApplyOptions,
  virtualEntities: ReadonlyMap<string, readonly EntityRow[]>,
  pendingLinks: Set<string>,
): Promise<ApplyItemResult> {
  const valid = validateLink(item.item);
  if (!valid.ok) return rejected(item, valid.reason);
  const link = valid.value;
  const from = resolveSubject(store, link.from, virtualEntities);
  if (!from.ok) return rejected(item, from.reason);
  const to = resolveSubject(store, link.to, virtualEntities);
  if (!to.ok) return rejected(item, to.reason);
  if (!subjectIsInScope(from.value, options) || !subjectIsInScope(to.value, options)) {
    return rejected(item, "out_of_scope", {
      subject: from.value.targetStableKey ?? from.value.entityLocator,
      writableSubjects: [...options.scope.targetStableKeys, ...options.scope.entityLocators],
    });
  }
  const requiredCitation = checkRequiredCitation(
    store, [link], options.requiredCitation, options, [from.value, to.value],
  );
  if (!requiredCitation.ok) return rejected(item, requiredCitation.reason as ApplyRejectReason, {
    prNumber: options.requiredCitation?.prNumber,
  });
  const citation = resolveCitation(store, link, {
    checkoutRoot: options.checkoutRoot,
    prsRoot: options.prsRoot,
    codeFileCache: options.codeFileCache,
  });
  if (!citation.ok) {
    let revision: string | undefined;
    try {
      const parsed = parseLocator(link.locator);
      if (parsed.kind === "code") revision = parsed.revision;
    } catch {}
    return rejected(item, citation.reason, {
      locator: link.locator,
      revision,
      headRevision: options.headRevision,
      lineCount: citation.lineCount,
    });
  }

  const duplicateKey = JSON.stringify([
    from.value.ref.targetId ?? null,
    from.value.ref.entityId ?? null,
    to.value.ref.targetId ?? null,
    to.value.ref.entityId ?? null,
    link.role,
    link.locator,
  ]);
  if (pendingLinks.has(duplicateKey)) return skipped(item, "duplicate");

  const duplicate = store.db.query<{ id: string }, [string | null, string | null, string | null, string | null, string, string]>(
    `SELECT id FROM link
     WHERE from_target_id IS ? AND from_entity_id IS ?
       AND to_target_id IS ? AND to_entity_id IS ?
       AND role = ? AND locator = ? LIMIT 1`,
  ).get(
    from.value.ref.targetId ?? null,
    from.value.ref.entityId ?? null,
    to.value.ref.targetId ?? null,
    to.value.ref.entityId ?? null,
    link.role,
    link.locator,
  );
  if (duplicate != null) return skipped(item, "duplicate");
  if (options.dryRun) {
    pendingLinks.add(duplicateKey);
    return applied(item);
  }

  const inserted = insertLink(store, {
    id: `link:${randomUUID()}`,
    from: from.value.ref,
    to: to.value.ref,
    role: link.role,
    why: link.why,
    kind: link.kind,
    locator: link.locator,
    digest: citation.digest,
  });
  if (inserted) pendingLinks.add(duplicateKey);
  return inserted ? applied(item) : skipped(item, "duplicate");
}

async function applyMergeItem(
  store: KnowledgeStoreHandle,
  item: IndexedItem,
  options: ApplyOptions,
  virtualEntities: ReadonlyMap<string, readonly EntityRow[]>,
): Promise<ApplyItemResult> {
  const valid = validateMerge(item.item);
  if (!valid.ok) return rejected(item, valid.reason);
  return options.sharedWriteGate.run(() => {
    const loser = resolveEntity(store, valid.value.loserLocator, virtualEntities);
    if (!loser.ok) return rejected(item, loser.reason);
    const winner = resolveEntity(store, valid.value.winnerLocator, virtualEntities);
    if (!winner.ok) return rejected(item, winner.reason);
    if (!CURATED_KINDS.has(loser.value.kind) || !CURATED_KINDS.has(winner.value.kind)) {
      return rejected(item, "mechanical_merge_rejected");
    }
    if (loser.value.id === winner.value.id) return skipped(item, "already_merged");
    if (!options.dryRun) mergeEntities(store, loser.value.id, winner.value.id);
    return applied(item);
  });
}

async function applyFollowUpItem(
  store: KnowledgeStoreHandle,
  item: IndexedItem,
  options: ApplyOptions,
  virtualEntities: ReadonlyMap<string, readonly EntityRow[]>,
  acceptedSubjects: Set<string>,
): Promise<ApplyItemResult> {
  const valid = validateFollowUp(item.item);
  if (!valid.ok) return rejected(item, valid.reason);
  const subject = resolveSubject(store, valid.value.subject, virtualEntities);
  if (!subject.ok) return rejected(item, subject.reason);
  const label = subject.value.targetStableKey ?? subject.value.entityLocator;
  if (subjectIsInScope(subject.value, options)) {
    return rejected(item, "follow_up_in_scope", { subject: label });
  }
  const key = subject.value.ref.targetId !== undefined
    ? `target:${subject.value.ref.targetId}`
    : `entity:${subject.value.ref.entityId}`;
  if (acceptedSubjects.has(key)) return skipped(item, "duplicate");
  if (acceptedSubjects.size >= 10) return rejected(item, "follow_up_cap", { subject: label });
  acceptedSubjects.add(key);
  return {
    ...item,
    action: "applied",
    subject: subject.value.ref.targetId !== undefined
      ? { targetId: subject.value.ref.targetId, targetStableKey: subject.value.targetStableKey! }
      : { entityId: subject.value.ref.entityId!, entityLocator: subject.value.entityLocator! },
  };
}

function envelopeItems(proposal: Record<string, unknown>): {
  facts: IndexedItem[];
  links: IndexedItem[];
  entities: IndexedItem[];
  merges: IndexedItem[];
  followUps: IndexedItem[];
} {
  let index = 0;
  const make = (itemKind: ApplyItemKind, values: unknown[]): IndexedItem[] => values.map((item) => ({
    index: index++,
    itemKind,
    item,
  }));
  return {
    facts: make("fact", (proposal.facts as unknown[] | undefined) ?? []),
    links: make("link", (proposal.links as unknown[] | undefined) ?? []),
    entities: make("entity", (proposal.entities as unknown[] | undefined) ?? []),
    merges: make("merge", (proposal.merges as unknown[] | undefined) ?? []),
    followUps: make("follow_up", (proposal.follow_ups as unknown[] | undefined) ?? []),
  };
}

export async function applyLibrarianPass(
  store: KnowledgeStoreHandle,
  proposal: unknown,
  options: ApplyOptions,
): Promise<ApplyReport> {
  const startedAt = options.now?.() ?? new Date().toISOString();
  if (!isRecord(proposal)) throw new TypeError("Malformed librarian pass envelope");
  const envelopeKeys = ["facts", "links", "entities", "merges", "follow_ups"] as const;
  for (const key of envelopeKeys) {
    if (Object.prototype.hasOwnProperty.call(proposal, key) && !Array.isArray(proposal[key])) {
      throw new TypeError(`Malformed librarian pass envelope: ${key} must be an array`);
    }
  }

  const resolvedOptions: ApplyOptions = options.codeFileCache === undefined
    ? { ...options, codeFileCache: createCodeFileCache(options.checkoutRoot) }
    : options;

  const groups = envelopeItems(proposal);
  const unknownKeys = Object.keys(proposal).filter((key) => !envelopeKeys.includes(key as typeof envelopeKeys[number]));
  const envelope_rejections = unknownKeys.map((key) => ({
    key,
    reason: "unknown_envelope_key" as const,
    message: REJECTION_MESSAGES.unknown_envelope_key({ key }),
  }));
  const results = new Map<number, ApplyItemResult>();
  const virtualEntities = new Map<string, EntityRow[]>();
  const dryRunFacts = new Map<string, { updatedAt: string } | null>();
  const pendingLinks = new Set<string>();
  const acceptedFollowUpSubjects = new Set<string>();

  const runItem = async (item: IndexedItem, operation: () => Promise<ApplyItemResult>): Promise<void> => {
    try {
      results.set(item.index, await operation());
    } catch {
      results.set(item.index, rejected(item, "internal_error"));
    }
  };

  if (unknownKeys.length > 0) {
    for (const item of [...groups.facts, ...groups.links, ...groups.entities, ...groups.merges, ...groups.followUps]) {
      results.set(item.index, rejected(item, "malformed_envelope"));
    }
  } else {

  // Admissions run first so later proposal items can target entities admitted by this pass.
  for (const item of groups.entities) {
    await runItem(item, () => applyEntityItem(store, item, resolvedOptions, virtualEntities));
  }
  for (const item of groups.facts) {
    await runItem(item, () => applyFactItem(store, item, resolvedOptions, startedAt, virtualEntities, dryRunFacts));
  }
  for (const item of groups.links) {
    await runItem(item, () => applyLinkItem(store, item, resolvedOptions, virtualEntities, pendingLinks));
  }
  for (const item of groups.merges) {
    await runItem(item, () => applyMergeItem(store, item, resolvedOptions, virtualEntities));
  }
  for (const item of groups.followUps) {
    await runItem(item, () => applyFollowUpItem(
      store, item, resolvedOptions, virtualEntities, acceptedFollowUpSubjects,
    ));
  }
  }

  const orderedResults = [...results.values()].sort((a, b) => a.index - b.index);
  const follow_ups = orderedResults.filter(({ itemKind }) => itemKind === "follow_up");
  const items = orderedResults.filter(({ itemKind }) => itemKind !== "follow_up");
  const count = (values: ApplyItemResult[]) => ({
    applied: values.filter(({ action }) => action === "applied").length,
    rejected: values.filter(({ action }) => action === "rejected").length,
    skipped: values.filter(({ action }) => action === "skipped").length,
  });
  return {
    startedAt,
    dryRun: options.dryRun === true,
    items,
    follow_ups,
    envelope_rejections,
    counts: count(items),
    follow_up_counts: count(follow_ups),
  };
}
