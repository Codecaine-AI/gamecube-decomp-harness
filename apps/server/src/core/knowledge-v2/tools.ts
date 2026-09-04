import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { formatLocator, parseLocator, type LocatorKind } from "./locator.js";
import { resolveKnowledgeCheckout } from "./checkout.js";
import type { KnowledgeIndexDb } from "./index/db.js";
import { searchFts, type FtsHit } from "./index/fts.js";
import { searchVector, type VectorHit } from "./index/embeddings/indexer.js";
import {
  createOpenAiEmbeddingProvider,
  resolveOpenAiApiKey,
  type EmbeddingProvider,
} from "./index/embeddings/provider.js";
import {
  createPastPrsArchive,
  type PrArchive,
} from "./index/pr-archive.js";
import type {
  EntityIdentityStatus,
  EntityKind,
  Outcome,
  TargetIdentityStatus,
  TargetKind,
} from "./storage/schema.js";
import type { KnowledgeStore } from "./storage/store.js";
import {
  knowledgeRecord,
  type KnowledgeRecord,
} from "./views/knowledge-record.js";
import {
  targetLedger,
  type TargetLedgerEntry,
} from "./views/target-ledger.js";
import { unitView } from "./views/unit-view.js";

export type KnowledgeV2SearchMode = "keyword" | "vector" | "hybrid";

export interface KnowledgeV2ToolHandles {
  store: KnowledgeStore;
  indexDb: KnowledgeIndexDb;
  embeddingProvider?: EmbeddingProvider;
  checkoutRoot?: string;
  gameId?: string;
  stateDir?: string;
  prArchive?: PrArchive;
}

interface ResultCoverage {
  count: number;
  truncated: boolean;
}

interface SearchCoverage extends ResultCoverage {
  status: "ok";
  mode_requested: KnowledgeV2SearchMode;
  mode_used: KnowledgeV2SearchMode;
  degraded?: "embedding_provider_unavailable";
}

export interface Kv2MissingQueryResult extends ResultCoverage {
  status: "missing_query";
  mode_requested: KnowledgeV2SearchMode;
  mode_used: KnowledgeV2SearchMode;
  degraded?: "embedding_provider_unavailable";
  results: [];
}

interface SearchRanking {
  keyword_rank?: number;
  vector_score?: number;
}

export interface Kv2DiscordSearchParams {
  query: string;
  channel?: string;
  author?: string;
  after?: string;
  before?: string;
  limit?: number;
  mode?: KnowledgeV2SearchMode;
}

export interface Kv2DiscordThreadContext {
  locator: string;
  author: string;
  posted_at: string;
  snippet: string;
}

export interface Kv2DiscordSearchHit extends SearchRanking {
  locator: string;
  author: string;
  posted_at: string;
  snippet: string;
  thread_context: Kv2DiscordThreadContext[];
}

export interface Kv2DiscordSearchResult extends SearchCoverage {
  results: Kv2DiscordSearchHit[];
}

export interface Kv2WikiSearchParams {
  query: string;
  page?: string;
  limit?: number;
  mode?: KnowledgeV2SearchMode;
}

export interface Kv2WikiSearchHit extends SearchRanking {
  locator: string;
  page: string;
  section: string;
  snippet: string;
}

export interface Kv2WikiSearchResult extends SearchCoverage {
  results: Kv2WikiSearchHit[];
}

export interface Kv2PrSearchParams {
  query: string;
  limit?: number;
  mode?: KnowledgeV2SearchMode;
}

export interface Kv2PrSearchHit extends SearchRanking {
  locator: string;
  pr_ref: string;
  subject: string;
  summary_snippet: string;
  discussion_snippet: string;
}

export interface Kv2PrSearchResult extends SearchCoverage {
  results: Kv2PrSearchHit[];
}

export interface Kv2AttemptSearchParams {
  query?: string;
  target_stable_key?: string;
  outcome?: Outcome;
  limit?: number;
}

export interface Kv2AttemptScores {
  baseline: Record<string, unknown>;
  submission: number | null;
}

export interface Kv2NarrativeObservation {
  observation: string;
  reusable_when: string;
}

export interface Kv2AttemptNarrative {
  summary: string;
  observations: Kv2NarrativeObservation[];
}

export interface Kv2AttemptSearchHit {
  locator: string;
  stable_key: string;
  final_outcome: Outcome;
  scores: Kv2AttemptScores;
  description_snippet: string | null;
  hypothesis_snippet: string | null;
  narrative: Kv2AttemptNarrative | null;
}

export interface Kv2AttemptSearchResult extends ResultCoverage {
  status: "ok";
  results: Kv2AttemptSearchHit[];
}

export interface Kv2SubjectRecordParams {
  target_stable_key?: string;
  entity_locator?: string;
}

export interface Kv2TargetStatus {
  target_id: string;
  match_pct: number;
  linked: boolean;
  size: number | null;
  content_hash: string | null;
  report_revision: string;
  updated_at: string;
}

export interface Kv2SubjectLedger {
  entries: TargetLedgerEntry[];
  total_count: number;
  truncated: boolean;
}

export interface Kv2SubjectRecordResult extends ResultCoverage {
  status: "ok" | "invalid_subject" | "not_found";
  record: KnowledgeRecord | null;
  ledger: Kv2SubjectLedger;
  target_status: Kv2TargetStatus | null;
  prior_runs: Kv2PriorRunNarrative[];
}

export interface Kv2PriorRunNarrative {
  worker_run_id: string;
  summary: string | null;
  notable_observations: Kv2NarrativeObservation[];
}

export interface Kv2EntityLookupParams {
  kind?: EntityKind;
  locator_prefix?: string;
  limit?: number;
}

export interface Kv2EntityLookupHit {
  locator: string;
  kind: EntityKind;
  identity_status: EntityIdentityStatus;
}

export interface Kv2EntityLookupResult extends ResultCoverage {
  status: "ok";
  entities: Kv2EntityLookupHit[];
}

export interface Kv2ResolveLocatorParams {
  locator: string;
}

export interface Kv2ResolvedDiscordMessage {
  id: string;
  channel: string;
  author: string;
  posted_at: string;
  content: string;
  thread_id: string | null;
  ingested_at: string;
}

export interface Kv2ResolvedDiscordContext {
  locator: string;
  author: string;
  posted_at: string;
  content: string;
}

export interface Kv2ResolvedWikiSection {
  id: string;
  page: string;
  section: string;
  mirror_revision: string;
  content: string;
  ingested_at: string;
}

export interface Kv2ResolvedPullRequest {
  id: string;
  target_id: string | null;
  entity_id: string | null;
  pr_ref: string;
  summary: string;
  outcome: Outcome;
  merged_at: string;
}

export interface Kv2ResolvedWorkerRun {
  id: string;
  target_id: string;
  goal: string;
  baseline: Record<string, unknown>;
  run_id: string | null;
  worker_state_id: string | null;
  final_outcome: Outcome;
  error_type: string | null;
  integration: string | null;
  started_at: string;
  ended_at: string | null;
  closed_at: string;
}

export interface Kv2ResolvedSubmission {
  id: string;
  worker_run_id: string;
  seq: number;
  description: string;
  hypothesis: string | null;
  score: number;
  submitted_at: string;
  runtime_ref: string | null;
}

export interface Kv2ResolveLocatorResult extends ResultCoverage {
  status:
    | "ok"
    | "invalid_locator"
    | "path_outside_checkout"
    | "range_past_eof"
    | "not_found";
  kind?: LocatorKind;
  locator: string;
  message?: Kv2ResolvedDiscordMessage;
  thread_context?: Kv2ResolvedDiscordContext[];
  section?: Kv2ResolvedWikiSection;
  pull_request?: Kv2ResolvedPullRequest;
  archived_comment_body?: string;
  worker_run?: Kv2ResolvedWorkerRun;
  submission?: Kv2ResolvedSubmission;
  narrative?: Kv2ResolvedRunNarrative;
  revision?: string;
  path?: string;
  start_line?: number;
  end_line?: number;
  text?: string;
  reason?: string;
  line_count?: number;
}

export interface Kv2ResolvedRunNarrative {
  summary: string;
  notable_observations: unknown;
  narrative: unknown;
}

export interface Kv2UnitContextParams {
  unit_locator?: string;
  target_stable_key?: string;
  pr_limit?: number;
}

export interface Kv2UnitSummary {
  locator: string;
  identity_status: EntityIdentityStatus;
  match_pct: number | null;
}

export interface Kv2UnitMemberTarget {
  stable_key: string;
  kind: TargetKind;
  match_pct: number | null;
  named: boolean;
}

export interface Kv2UnitPullRequest {
  id: string;
  locator: string;
  pr_ref: string;
  summary: string;
  outcome: Outcome;
  merged_at: string;
}

export type Kv2UnitContextResult =
  | (ResultCoverage & {
      status: "ok";
      unit: Kv2UnitSummary;
      members: Kv2UnitMemberTarget[];
      pull_requests: Kv2UnitPullRequest[];
      total_pr_count: number;
    })
  | (ResultCoverage & {
      status: "invalid_subject" | "not_found";
      unit: null;
      members: [];
      pull_requests: [];
      total_pr_count: 0;
    });

interface RankedHit {
  locator: string;
  snippet: string;
  keywordRank?: number;
  vectorScore?: number;
  order: number;
}

interface SearchModeResolution {
  requested: KnowledgeV2SearchMode;
  used: KnowledgeV2SearchMode;
  provider?: EmbeddingProvider;
  degraded?: "embedding_provider_unavailable";
}

interface DiscordRow {
  id: string;
  channel: string;
  author: string;
  posted_at: string;
  content: string;
  thread_id: string | null;
  ingested_at: string;
}

interface WikiRow {
  id: string;
  page: string;
  section: string;
  mirror_revision: string;
  content: string;
  ingested_at: string;
}

interface PrSearchRow {
  id: string;
  target_id: string | null;
  entity_id: string | null;
  pr_ref: string;
  summary: string;
  outcome: Outcome;
  merged_at: string;
  stable_key: string | null;
  entity_locator: string | null;
}

interface AttemptSearchRow {
  run_id: string;
  target_id: string;
  stable_key: string;
  baseline: string | Record<string, unknown>;
  final_outcome: Outcome;
  closed_at: string;
  submission_id: string | null;
  seq: number | null;
  description: string | null;
  hypothesis: string | null;
  score: number | null;
  submitted_at: string | null;
}

interface RunNarrativeRow {
  worker_run_id: string;
  summary: string | null;
  notable_observations: unknown;
  narrative: unknown;
}

interface EntityRow {
  locator: string;
  kind: EntityKind;
  identity_status: EntityIdentityStatus;
}

interface TargetIdentityRow {
  id: string;
  unit_entity_id: string;
}

interface TargetStatusRow {
  target_id: string;
  match_pct: number;
  linked: number;
  size: number | null;
  content_hash: string | null;
  report_revision: string;
  updated_at: string;
}

interface UnitPrRow {
  id: string;
  pr_ref: string;
  summary: string;
  outcome: Outcome;
  merged_at: string;
}

const DEFAULT_SNIPPET_CHARACTERS = 400;
const SNIPPET_TRUNCATION_MARKER = "…<truncated>";
const MAX_CODE_LINES = 120;
const SEARCH_NARRATIVE_SUMMARY_CHARACTERS = 600;
const SEARCH_NARRATIVE_OBSERVATION_CHARACTERS = 300;
const RESOLVED_NARRATIVE_CHARACTERS = 6_000;

/** Truncate a tool-search snippet while making any omitted text explicit. */
export function truncateKnowledgeSnippet(
  value: string,
  maxCharacters = DEFAULT_SNIPPET_CHARACTERS,
): string {
  if (value.length <= maxCharacters) return value;
  const keep = Math.max(0, maxCharacters - SNIPPET_TRUNCATION_MARKER.length);
  return `${value.slice(0, keep).trimEnd()}${SNIPPET_TRUNCATION_MARKER}`;
}

/** Search Discord messages without modifying the store or derived index. */
export async function kv2DiscordSearch(
  handles: KnowledgeV2ToolHandles,
  params: Kv2DiscordSearchParams,
): Promise<Kv2DiscordSearchResult | Kv2MissingQueryResult> {
  const query = normalizedString(params.query);
  const mode = resolveSearchMode(handles, params.mode);
  if (!query) return missingQueryResult(mode);
  const limit = normalizedLimit(params.limit, 12);
  const results = await collectMappedSearchHits(
    handles.indexDb,
    "discord",
    query,
    limit + 1,
    mode,
    (hit): Kv2DiscordSearchHit | undefined => {
      const parsed = parseExpectedLocator(hit.locator, "discord");
      if (!parsed || parsed.kind !== "discord") return undefined;
      const row = handles.store.db.query<DiscordRow, [string]>(
        "SELECT * FROM discord_message WHERE id = ?",
      ).get(parsed.messageId);
      if (!row) return undefined;
      if (params.channel !== undefined && row.channel !== params.channel) return undefined;
      if (params.author !== undefined && row.author !== params.author) return undefined;
      if (params.after !== undefined && row.posted_at < params.after) return undefined;
      if (params.before !== undefined && row.posted_at > params.before) return undefined;
      return {
        locator: hit.locator,
        author: row.author,
        posted_at: row.posted_at,
        snippet: truncateKnowledgeSnippet(hit.snippet || row.content),
        thread_context: discordWindow(handles.store, row, 2).rows
          .filter((context) => context.id !== row.id)
          .map((context) => ({
            locator: formatLocator({ kind: "discord", messageId: context.id }),
            author: context.author,
            posted_at: context.posted_at,
            snippet: truncateKnowledgeSnippet(context.content),
          })),
        ...rankingFields(hit),
      };
    },
  );

  return searchResult(mode, results, limit);
}

/** Search the newest mirrored wiki sections without modifying either database. */
export async function kv2WikiSearch(
  handles: KnowledgeV2ToolHandles,
  params: Kv2WikiSearchParams,
): Promise<Kv2WikiSearchResult | Kv2MissingQueryResult> {
  const query = normalizedString(params.query);
  const mode = resolveSearchMode(handles, params.mode);
  if (!query) return missingQueryResult(mode);
  const limit = normalizedLimit(params.limit, 8);
  const results = await collectMappedSearchHits(
    handles.indexDb,
    "wiki",
    query,
    limit + 1,
    mode,
    (hit): Kv2WikiSearchHit | undefined => {
      const parsed = parseExpectedLocator(hit.locator, "wiki");
      if (!parsed || parsed.kind !== "wiki") return undefined;
      const row = latestWikiRow(handles.store, parsed.sectionId);
      if (!row) return undefined;
      if (params.page !== undefined && row.page !== params.page) return undefined;
      return {
        locator: hit.locator,
        page: row.page,
        section: row.section,
        snippet: truncateKnowledgeSnippet(hit.snippet || row.content),
        ...rankingFields(hit),
      };
    },
  );

  return searchResult(mode, results, limit);
}

/** Search pull-request summaries and archived discussion without writing indexes. */
export async function kv2PrSearch(
  handles: KnowledgeV2ToolHandles,
  params: Kv2PrSearchParams,
): Promise<Kv2PrSearchResult | Kv2MissingQueryResult> {
  const query = normalizedString(params.query);
  const mode = resolveSearchMode(handles, params.mode);
  if (!query) return missingQueryResult(mode);
  const limit = normalizedLimit(params.limit, 10);
  const archive = handles.prArchive ?? createPastPrsArchive();
  const results = await collectMappedSearchHits(
    handles.indexDb,
    "pr",
    query,
    limit + 1,
    mode,
    (hit): Kv2PrSearchHit | undefined => {
      const parsed = parseExpectedLocator(hit.locator, "pr");
      if (!parsed || parsed.kind !== "pr") return undefined;
      const row = handles.store.db.query<PrSearchRow, [string]>(`
        SELECT p.*, t.stable_key, e.locator AS entity_locator
        FROM pull_request p
        LEFT JOIN target t ON t.id = p.target_id
        LEFT JOIN entity e ON e.id = p.entity_id
        WHERE p.id = ?
      `).get(parsed.pullRequestId);
      if (!row) return undefined;
      const discussions = archiveDiscussions(archive, row.pr_ref, row.id);
      const discussion = parsed.commentNumber === undefined
        ? discussions.join("\n\n")
        : discussions[parsed.commentNumber] ?? "";
      return {
        locator: hit.locator,
        pr_ref: row.pr_ref,
        subject: row.stable_key ?? row.entity_locator ?? "unknown",
        summary_snippet: truncateKnowledgeSnippet(row.summary),
        discussion_snippet: truncateKnowledgeSnippet(discussion || hit.snippet),
        ...rankingFields(hit),
      };
    },
  );

  return searchResult(mode, results, limit);
}

/** Search structured worker attempts, optionally narrowed by their FTS record. */
export function kv2AttemptSearch(
  handles: KnowledgeV2ToolHandles,
  params: Kv2AttemptSearchParams,
): Kv2AttemptSearchResult {
  const limit = normalizedLimit(params.limit, 10);
  const query = normalizedString(params.query);
  let matchingRunIds: Set<string> | undefined;
  if (query) {
    matchingRunIds = new Set(
      searchFts(handles.indexDb, "attempt", query, {
        limit: ftsRowCount(handles.indexDb, "attempt"),
      })
        .flatMap((hit) => {
          const parsed = parseExpectedLocator(hit.locator, "attempt");
          return parsed?.kind === "attempt" ? [parsed.runId] : [];
        }),
    );
  }

  const rows = handles.store.db.query<AttemptSearchRow, []>(`
    SELECT w.id AS run_id, w.target_id, t.stable_key, w.baseline,
      w.final_outcome, w.closed_at, s.id AS submission_id, s.seq,
      s.description, s.hypothesis, s.score, s.submitted_at
    FROM worker_run w
    JOIN target t ON t.id = w.target_id
    LEFT JOIN submission s ON s.worker_run_id = w.id
    ORDER BY w.closed_at DESC, w.id, s.seq DESC
  `).all();
  const results: Kv2AttemptSearchHit[] = [];
  const includedRunIds = new Set<string>();
  for (const row of rows) {
    if (matchingRunIds && !matchingRunIds.has(row.run_id)) continue;
    if (params.target_stable_key !== undefined && row.stable_key !== params.target_stable_key) continue;
    if (params.outcome !== undefined && row.final_outcome !== params.outcome) continue;
    if (includedRunIds.has(row.run_id)) continue;
    includedRunIds.add(row.run_id);
    results.push({
      locator: formatLocator({
        kind: "attempt",
        runId: row.run_id,
        submissionSequence: row.seq ?? undefined,
      }),
      stable_key: row.stable_key,
      final_outcome: row.final_outcome,
      scores: {
        baseline: parseJsonRecord(row.baseline),
        submission: row.score,
      },
      description_snippet: row.description === null
        ? null
        : truncateKnowledgeSnippet(row.description),
      hypothesis_snippet: row.hypothesis === null
        ? null
        : truncateKnowledgeSnippet(row.hypothesis),
      narrative: searchNarrative(handles.store, row.run_id),
    });
    if (results.length > limit) break;
  }
  return {
    status: "ok",
    results: results.slice(0, limit),
    count: Math.min(results.length, limit),
    truncated: results.length > limit,
  };
}

/** Read one target or entity record, including bounded target history. */
export function kv2SubjectRecord(
  handles: KnowledgeV2ToolHandles,
  params: Kv2SubjectRecordParams,
): Kv2SubjectRecordResult {
  const stableKey = normalizedString(params.target_stable_key);
  const entityLocator = normalizedString(params.entity_locator);
  if ((stableKey === undefined) === (entityLocator === undefined)) {
    return emptySubject("invalid_subject");
  }

  if (stableKey !== undefined) {
    const target = handles.store.db.query<TargetIdentityRow, [string]>(`
      SELECT id, unit_entity_id FROM target
      WHERE stable_key = ?
      ORDER BY identity_status = 'current' DESC, id
      LIMIT 1
    `).get(stableKey);
    if (!target) return emptySubject("not_found");
    const ledgerEntries = targetLedger(handles.store, target.id);
    const ledgerLimit = 10;
    const statusRow = handles.store.db.query<TargetStatusRow, [string]>(
      "SELECT * FROM target_status WHERE target_id = ?",
    ).get(target.id);
    const status: Kv2TargetStatus | null = statusRow
      ? { ...statusRow, linked: statusRow.linked === 1 }
      : null;
    return {
      status: "ok",
      record: canonicalKnowledgeRecord(
        knowledgeRecord(handles.store, { targetId: target.id }),
      ),
      ledger: {
        entries: ledgerEntries.slice(0, ledgerLimit),
        total_count: ledgerEntries.length,
        truncated: ledgerEntries.length > ledgerLimit,
      },
      target_status: status,
      prior_runs: priorRunNarratives(handles.store, target.id),
      count: 1,
      truncated: ledgerEntries.length > ledgerLimit,
    };
  }

  const entity = handles.store.db.query<{ id: string }, [string]>(`
    SELECT id FROM entity
    WHERE locator = ?
    ORDER BY identity_status = 'active' DESC, id
    LIMIT 1
  `).get(entityLocator!);
  if (!entity) return emptySubject("not_found");
  return {
    status: "ok",
    record: canonicalKnowledgeRecord(
      knowledgeRecord(handles.store, { entityId: entity.id }),
    ),
    ledger: { entries: [], total_count: 0, truncated: false },
    target_status: null,
    prior_runs: [],
    count: 1,
    truncated: false,
  };
}

/** List public entity identities without exposing their internal database ids. */
export function kv2EntityLookup(
  handles: KnowledgeV2ToolHandles,
  params: Kv2EntityLookupParams,
): Kv2EntityLookupResult {
  const limit = normalizedLimit(params.limit, 20);
  const locatorPrefix = params.locator_prefix ?? "";
  const rows = handles.store.db.query<EntityRow, []>(`
    SELECT locator, kind, identity_status
    FROM entity
    ORDER BY locator, kind
  `).all().filter((row) =>
    (params.kind === undefined || row.kind === params.kind)
      && row.locator.startsWith(locatorPrefix),
  );
  return {
    status: "ok",
    entities: rows.slice(0, limit),
    count: Math.min(rows.length, limit),
    truncated: rows.length > limit,
  };
}

/** Resolve one canonical evidence locator to its read-only source material. */
export function kv2ResolveLocator(
  handles: KnowledgeV2ToolHandles,
  params: Kv2ResolveLocatorParams,
): Kv2ResolveLocatorResult {
  const input = normalizedString(params.locator) ?? "";
  let parsed: ReturnType<typeof parseLocator>;
  try {
    parsed = parseLocator(input);
  } catch {
    return { status: "invalid_locator", locator: input, count: 0, truncated: false };
  }
  const locator = formatLocator(parsed);

  switch (parsed.kind) {
    case "discord": {
      const message = handles.store.db.query<DiscordRow, [string]>(
        "SELECT * FROM discord_message WHERE id = ?",
      ).get(parsed.messageId);
      if (!message) return notFound(locator);
      const window = discordWindow(handles.store, message, 3);
      return {
        status: "ok",
        kind: "discord",
        locator,
        message,
        thread_context: window.rows
          .filter((row) => row.id !== message.id)
          .map((row) => ({
            locator: formatLocator({ kind: "discord", messageId: row.id }),
            author: row.author,
            posted_at: row.posted_at,
            content: row.content,
          })),
        count: 1,
        truncated: window.truncated,
      };
    }
    case "wiki": {
      const section = handles.store.db.query<WikiRow, [string]>(
        "SELECT * FROM wiki_section WHERE id = ?",
      ).get(parsed.sectionId);
      if (!section) return notFound(locator);
      return {
        status: "ok",
        kind: "wiki",
        locator,
        section,
        count: 1,
        truncated: false,
      };
    }
    case "pr": {
      const pullRequest = handles.store.db.query<Kv2ResolvedPullRequest, [string]>(
        "SELECT * FROM pull_request WHERE id = ?",
      ).get(parsed.pullRequestId);
      if (!pullRequest) return notFound(locator);
      const result: Kv2ResolveLocatorResult = {
        status: "ok",
        kind: "pr",
        locator,
        pull_request: pullRequest,
        count: 1,
        truncated: false,
      };
      if (parsed.commentNumber !== undefined) {
        const archive = handles.prArchive ?? createPastPrsArchive();
        const bodies = archiveDiscussions(archive, pullRequest.pr_ref, pullRequest.id);
        const body = bodies[parsed.commentNumber];
        if (body === undefined) return notFound(locator);
        result.archived_comment_body = body;
      }
      return result;
    }
    case "attempt": {
      const rawRun = handles.store.db.query<Omit<Kv2ResolvedWorkerRun, "baseline"> & { baseline: string | Record<string, unknown> }, [string]>(
        "SELECT * FROM worker_run WHERE id = ?",
      ).get(parsed.runId);
      if (!rawRun) return notFound(locator);
      const workerRun: Kv2ResolvedWorkerRun = {
        ...rawRun,
        baseline: parseJsonRecord(rawRun.baseline),
      };
      const narrative = resolvedRunNarrative(handles.store, parsed.runId);
      if (parsed.submissionSequence === undefined) {
        return {
          status: "ok",
          kind: "attempt",
          locator,
          worker_run: workerRun,
          narrative,
          count: 1,
          truncated: false,
        };
      }
      const submission = handles.store.db.query<Kv2ResolvedSubmission, [string, number]>(`
        SELECT * FROM submission WHERE worker_run_id = ? AND seq = ?
      `).get(parsed.runId, parsed.submissionSequence);
      if (!submission) return notFound(locator);
      return {
        status: "ok",
        kind: "attempt",
        locator,
        worker_run: workerRun,
        submission,
        narrative,
        count: 1,
        truncated: false,
      };
    }
    case "code":
      return resolveCodeLocator(handles, locator, parsed);
  }
}

/** Read a bounded translation-unit view and its newest directly attributed PRs. */
export function kv2UnitContext(
  handles: KnowledgeV2ToolHandles,
  params: Kv2UnitContextParams,
): Kv2UnitContextResult {
  const unitLocator = normalizedString(params.unit_locator);
  const stableKey = normalizedString(params.target_stable_key);
  if ((unitLocator === undefined) === (stableKey === undefined)) return emptyUnit("invalid_subject");

  let unitEntityId: string | undefined;
  if (unitLocator !== undefined) {
    unitEntityId = handles.store.db.query<{ id: string }, [string]>(`
      SELECT id FROM entity
      WHERE kind = 'translation_unit' AND locator = ?
      ORDER BY identity_status = 'active' DESC, id
      LIMIT 1
    `).get(unitLocator)?.id;
  } else {
    unitEntityId = handles.store.db.query<{ unit_entity_id: string }, [string]>(`
      SELECT unit_entity_id FROM target
      WHERE stable_key = ?
      ORDER BY identity_status = 'current' DESC, id
      LIMIT 1
    `).get(stableKey!)?.unit_entity_id;
  }
  if (!unitEntityId) return emptyUnit("not_found");

  const view = unitView(handles.store).find((row) => row.unit.id === unitEntityId);
  if (!view) return emptyUnit("not_found");
  const prLimit = normalizedLimit(params.pr_limit, 15);
  const prRows = handles.store.db.query<UnitPrRow, [string]>(`
    SELECT id, pr_ref, summary, outcome, merged_at
    FROM pull_request
    WHERE entity_id = ?
    ORDER BY merged_at DESC, id
  `).all(unitEntityId);
  const pullRequests = prRows.slice(0, prLimit).map((row) => ({
    id: row.id,
    locator: formatLocator({ kind: "pr", pullRequestId: row.id }),
    pr_ref: row.pr_ref,
    summary: row.summary,
    outcome: row.outcome,
    merged_at: row.merged_at,
  }));
  return {
    status: "ok",
    unit: {
      locator: view.unit.locator,
      identity_status: view.unit.identityStatus,
      match_pct: view.matchPct,
    },
    members: view.targets.map((target) => ({
      stable_key: target.stableKey,
      kind: target.kind,
      match_pct: target.status?.matchPct ?? null,
      named: target.symbol !== null,
    })),
    pull_requests: pullRequests,
    total_pr_count: prRows.length,
    count: pullRequests.length,
    truncated: prRows.length > prLimit,
  };
}

function resolveSearchMode(
  handles: KnowledgeV2ToolHandles,
  value: KnowledgeV2SearchMode | undefined,
): SearchModeResolution {
  const requested = value === "vector" || value === "hybrid" ? value : "keyword";
  if (requested === "keyword") return { requested, used: requested };
  if (handles.embeddingProvider) {
    return { requested, used: requested, provider: handles.embeddingProvider };
  }
  const apiKey = resolveOpenAiApiKey();
  if (apiKey) {
    return {
      requested,
      used: requested,
      provider: createOpenAiEmbeddingProvider({ apiKey }),
    };
  }
  return {
    requested,
    used: "keyword",
    degraded: "embedding_provider_unavailable",
  };
}

async function collectMappedSearchHits<T>(
  indexDb: KnowledgeIndexDb,
  source: "discord" | "wiki" | "pr",
  query: string,
  desiredCount: number,
  mode: SearchModeResolution,
  map: (hit: RankedHit) => T | undefined,
): Promise<T[]> {
  const capacity = searchCapacity(indexDb, source, mode);
  let candidateLimit = Math.min(Math.max(1, desiredCount), Math.max(1, capacity));
  for (;;) {
    const ranked = await searchRankedHits(
      indexDb,
      source,
      query,
      candidateLimit,
      mode,
    );
    const mapped = ranked.flatMap((hit) => {
      const result = map(hit);
      return result === undefined ? [] : [result];
    });
    if (
      mapped.length >= desiredCount
      || candidateLimit >= capacity
      || (mode.used === "keyword" && ranked.length < candidateLimit)
    ) {
      return mapped;
    }
    candidateLimit = Math.min(capacity, candidateLimit * 2);
  }
}

function searchCapacity(
  indexDb: KnowledgeIndexDb,
  source: "discord" | "wiki" | "pr",
  mode: SearchModeResolution,
): number {
  const keywordCount = mode.used === "keyword" || mode.used === "hybrid"
    ? ftsRowCount(indexDb, source)
    : 0;
  const vectorCount = mode.used === "vector" || mode.used === "hybrid"
    ? indexDb.db.query<{ count: number }, [string, string]>(`
        SELECT count(*) AS count FROM embedding_chunk
        WHERE kind = ? AND model = ?
      `).get(source, mode.provider!.model)?.count ?? 0
    : 0;
  return keywordCount + vectorCount;
}

function ftsRowCount(
  indexDb: KnowledgeIndexDb,
  source: "discord" | "wiki" | "pr" | "attempt",
): number {
  const table = {
    discord: "discord_fts",
    wiki: "wiki_fts",
    pr: "pr_fts",
    attempt: "attempt_fts",
  }[source];
  return indexDb.db.query<{ count: number }, []>(
    `SELECT count(*) AS count FROM ${table}`,
  ).get()?.count ?? 0;
}

async function searchRankedHits(
  indexDb: KnowledgeIndexDb,
  source: "discord" | "wiki" | "pr",
  query: string,
  limit: number,
  mode: SearchModeResolution,
): Promise<RankedHit[]> {
  const keywordHits = mode.used === "keyword" || mode.used === "hybrid"
    ? searchFts(indexDb, source, query, { limit })
    : [];
  const vectorHits = mode.used === "vector" || mode.used === "hybrid"
    ? await searchVector(indexDb, source, query, limit, mode.provider!)
    : [];
  if (mode.used === "keyword") return keywordHits.map(keywordRankedHit);
  if (mode.used === "vector") return dedupeVectorHits(vectorHits).map(vectorRankedHit);
  return mergeHybridHits(keywordHits, vectorHits).slice(0, limit);
}

function keywordRankedHit(hit: FtsHit, index: number): RankedHit {
  return {
    locator: canonicalLocator(hit.locator),
    snippet: hit.snippet,
    keywordRank: hit.rank,
    order: index,
  };
}

function vectorRankedHit(hit: VectorHit, index: number): RankedHit {
  return {
    locator: canonicalLocator(hit.locator),
    snippet: hit.text,
    vectorScore: hit.score,
    order: index,
  };
}

function dedupeVectorHits(hits: VectorHit[]): VectorHit[] {
  const byLocator = new Map<string, VectorHit>();
  for (const hit of hits) {
    const locator = canonicalLocator(hit.locator);
    const current = byLocator.get(locator);
    if (!current || hit.score > current.score) byLocator.set(locator, { ...hit, locator });
  }
  return [...byLocator.values()].sort((left, right) =>
    right.score - left.score || left.locator.localeCompare(right.locator));
}

function mergeHybridHits(keywordHits: FtsHit[], vectorHits: VectorHit[]): RankedHit[] {
  const merged = new Map<string, RankedHit>();
  keywordHits.forEach((hit, index) => {
    const candidate = keywordRankedHit(hit, index * 2);
    merged.set(candidate.locator, candidate);
  });
  dedupeVectorHits(vectorHits).forEach((hit, index) => {
    const candidate = vectorRankedHit(hit, index * 2 + 1);
    const current = merged.get(candidate.locator);
    if (!current) {
      merged.set(candidate.locator, candidate);
      return;
    }
    current.vectorScore = candidate.vectorScore;
    current.order = Math.min(current.order, candidate.order);
    if (!current.snippet) current.snippet = candidate.snippet;
  });
  return [...merged.values()].sort((left, right) =>
    left.order - right.order || left.locator.localeCompare(right.locator));
}

function canonicalLocator(locator: string): string {
  return formatLocator(parseLocator(locator));
}

function canonicalKnowledgeRecord(record: KnowledgeRecord): KnowledgeRecord {
  for (const fact of Object.values(record.facts)) {
    if (!fact) continue;
    for (const evidence of fact.evidence) {
      evidence.locator = formatLocator(parseLocator(evidence.locator, evidence.kind));
    }
  }
  for (const link of record.links) {
    link.locator = formatLocator(parseLocator(link.locator, link.kind));
  }
  return record;
}

function parseExpectedLocator(locator: string, kind: LocatorKind): ReturnType<typeof parseLocator> | undefined {
  try {
    return parseLocator(canonicalLocator(locator), kind);
  } catch {
    return undefined;
  }
}

function searchResult<T>(
  mode: SearchModeResolution,
  results: T[],
  limit: number,
): SearchCoverage & { results: T[] } {
  return {
    status: "ok",
    mode_requested: mode.requested,
    mode_used: mode.used,
    degraded: mode.degraded,
    results: results.slice(0, limit),
    count: Math.min(results.length, limit),
    truncated: results.length > limit,
  };
}

function missingQueryResult(mode: SearchModeResolution): Kv2MissingQueryResult {
  return {
    status: "missing_query",
    mode_requested: mode.requested,
    mode_used: mode.used,
    degraded: mode.degraded,
    results: [],
    count: 0,
    truncated: false,
  };
}

function rankingFields(hit: RankedHit): SearchRanking {
  return {
    keyword_rank: hit.keywordRank,
    vector_score: hit.vectorScore,
  };
}

function discordWindow(
  store: KnowledgeStore,
  message: DiscordRow,
  radius: number,
): { rows: DiscordRow[]; truncated: boolean } {
  const rows = message.thread_id === null
    ? store.db.query<DiscordRow, [string]>(`
        SELECT * FROM discord_message
        WHERE channel = ? AND thread_id IS NULL
        ORDER BY posted_at, id
      `).all(message.channel)
    : store.db.query<DiscordRow, [string]>(`
        SELECT * FROM discord_message
        WHERE thread_id = ?
        ORDER BY posted_at, id
      `).all(message.thread_id);
  const index = rows.findIndex((row) => row.id === message.id);
  if (index < 0) return { rows: [message], truncated: false };
  const start = Math.max(0, index - radius);
  const end = Math.min(rows.length, index + radius + 1);
  return {
    rows: rows.slice(start, end),
    truncated: start > 0 || end < rows.length,
  };
}

function latestWikiRow(store: KnowledgeStore, id: string): WikiRow | null {
  return store.db.query<WikiRow, [string]>(`
    SELECT w.* FROM wiki_section w
    WHERE w.id = ?
      AND NOT EXISTS (
        SELECT 1 FROM wiki_section newer
        WHERE newer.page = w.page AND newer.section = w.section
          AND (
            newer.ingested_at > w.ingested_at
            OR (newer.ingested_at = w.ingested_at AND newer.mirror_revision > w.mirror_revision)
          )
      )
  `).get(id) ?? null;
}

function archiveDiscussions(archive: PrArchive, prRef: string, id: string): string[] {
  const byRef = archive.getDiscussionBodies(prRef);
  return byRef.length > 0 ? byRef : archive.getDiscussionBodies(id);
}

function resolveCodeLocator(
  handles: KnowledgeV2ToolHandles,
  locator: string,
  parsed: Extract<ReturnType<typeof parseLocator>, { kind: "code" }>,
): Kv2ResolveLocatorResult {
  if (
    isAbsolute(parsed.path)
    || parsed.path.split(/[\\/]/u).some((segment) => segment === "..")
  ) {
    return outsideCheckout(locator);
  }
  if (parsed.endLine < parsed.startLine) {
    return {
      status: "invalid_locator",
      locator,
      reason: "end_line_before_start_line",
      count: 0,
      truncated: false,
    };
  }

  const checkoutRoot = resolve(handles.checkoutRoot ?? resolveKnowledgeCheckout({
    gameId: handles.gameId ?? "melee",
    stateDir: handles.stateDir,
  }).checkoutRoot);
  const candidate = resolve(checkoutRoot, parsed.path);
  if (!pathInside(checkoutRoot, candidate)) return outsideCheckout(locator);

  let realRoot: string;
  let realCandidate: string;
  try {
    realRoot = realpathSync(checkoutRoot);
    realCandidate = realpathSync(candidate);
    if (!statSync(realCandidate).isFile()) return notFound(locator);
  } catch {
    return notFound(locator);
  }
  if (!pathInside(realRoot, realCandidate)) return outsideCheckout(locator);

  let contents: string;
  try {
    contents = readFileSync(realCandidate, "utf8");
  } catch {
    return notFound(locator);
  }
  const lines = splitFileLines(contents);
  if (parsed.startLine > lines.length || parsed.endLine > lines.length) {
    return {
      status: "range_past_eof",
      locator,
      line_count: lines.length,
      count: 0,
      truncated: false,
    };
  }
  const emittedEndLine = Math.min(parsed.endLine, parsed.startLine + MAX_CODE_LINES - 1);
  const selected = lines.slice(parsed.startLine - 1, emittedEndLine);
  return {
    status: "ok",
    kind: "code",
    locator,
    revision: parsed.revision,
    path: parsed.path,
    start_line: parsed.startLine,
    end_line: emittedEndLine,
    text: selected.join("\n"),
    count: selected.length,
    truncated: emittedEndLine < parsed.endLine,
  };
}

function splitFileLines(contents: string): string[] {
  if (contents.length === 0) return [];
  const lines = contents.split(/\r\n|\n|\r/u);
  if (/\r\n$|[\n\r]$/u.test(contents)) lines.pop();
  return lines;
}

function pathInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function outsideCheckout(locator: string): Kv2ResolveLocatorResult {
  return {
    status: "path_outside_checkout",
    locator,
    count: 0,
    truncated: false,
  };
}

function notFound(locator: string): Kv2ResolveLocatorResult {
  return { status: "not_found", locator, count: 0, truncated: false };
}

function emptySubject(status: "invalid_subject" | "not_found"): Kv2SubjectRecordResult {
  return {
    status,
    record: null,
    ledger: { entries: [], total_count: 0, truncated: false },
    target_status: null,
    prior_runs: [],
    count: 0,
    truncated: false,
  };
}

function searchNarrative(store: KnowledgeStore, workerRunId: string): Kv2AttemptNarrative | null {
  const row = store.db.query<RunNarrativeRow, [string]>(`
    SELECT worker_run_id, summary, notable_observations, narrative
    FROM run_narrative WHERE worker_run_id = ?
  `).get(workerRunId);
  if (!row) return null;
  return {
    summary: truncateKnowledgeSnippet(row.summary ?? "", SEARCH_NARRATIVE_SUMMARY_CHARACTERS),
    observations: parseNarrativeObservations(row.notable_observations, 3),
  };
}

function priorRunNarratives(store: KnowledgeStore, targetId: string): Kv2PriorRunNarrative[] {
  const rows = store.db.query<RunNarrativeRow, [string]>(`
    SELECT w.id AS worker_run_id, n.summary, n.notable_observations, n.narrative
    FROM worker_run w
    LEFT JOIN run_narrative n ON n.worker_run_id = w.id
    WHERE w.target_id = ?
    ORDER BY w.closed_at DESC, w.id
    LIMIT 3
  `).all(targetId);
  return rows.map((row) => ({
    worker_run_id: row.worker_run_id,
    summary: row.summary === null || row.summary === undefined
      ? null
      : truncateKnowledgeSnippet(row.summary, SEARCH_NARRATIVE_SUMMARY_CHARACTERS),
    notable_observations: parseNarrativeObservations(row.notable_observations, 3),
  }));
}

function resolvedRunNarrative(
  store: KnowledgeStore,
  workerRunId: string,
): Kv2ResolvedRunNarrative | undefined {
  const row = store.db.query<RunNarrativeRow, [string]>(`
    SELECT worker_run_id, summary, notable_observations, narrative
    FROM run_narrative WHERE worker_run_id = ?
  `).get(workerRunId);
  if (!row) return undefined;
  const result: Kv2ResolvedRunNarrative = {
    summary: truncateKnowledgeSnippet(row.summary ?? "", 1_000),
    notable_observations: parseNarrativeObservations(row.notable_observations, 5),
    narrative: boundedJsonValue(row.narrative, 3_000),
  };
  if (JSON.stringify(result).length <= RESOLVED_NARRATIVE_CHARACTERS) return result;
  return {
    ...result,
    narrative: truncateKnowledgeSnippet(JSON.stringify(result.narrative), 1_000),
  };
}

function parseNarrativeObservations(value: unknown, limit: number): Kv2NarrativeObservation[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (item === null || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.observation !== "string" || typeof record.reusable_when !== "string") return [];
    return [{
      observation: truncateKnowledgeSnippet(record.observation, SEARCH_NARRATIVE_OBSERVATION_CHARACTERS),
      reusable_when: truncateKnowledgeSnippet(record.reusable_when, SEARCH_NARRATIVE_OBSERVATION_CHARACTERS),
    }];
  }).slice(0, limit);
}

function boundedJsonValue(value: unknown, maxCharacters: number): unknown {
  const parsed = parseJsonValue(value);
  const serialized = JSON.stringify(parsed);
  return serialized.length <= maxCharacters
    ? parsed
    : truncateKnowledgeSnippet(serialized, maxCharacters);
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function emptyUnit(status: "invalid_subject" | "not_found"): Kv2UnitContextResult {
  return {
    status,
    unit: null,
    members: [],
    pull_requests: [],
    total_pr_count: 0,
    count: 0,
    truncated: false,
  };
}

function parseJsonRecord(value: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof value !== "string") return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizedLimit(value: unknown, fallback: number, maximum = 100): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(value)));
}
