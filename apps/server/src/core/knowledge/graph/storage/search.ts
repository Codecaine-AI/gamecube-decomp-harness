import { sql } from "drizzle-orm";
import { graphPayload } from "../payloads.js";
import type { SearchResult } from "../types.js";
import { truncate } from "../util.js";
import type { KnowledgeGraphStore } from "./store.js";

interface SearchRow {
  id: string;
  source_id: string;
  entity_id: string | null;
  title: string;
  text: string;
  evidence_ref: string;
  payload_json: string | null;
  trust_tier: SearchResult["trust_tier"] | null;
}

export function searchKnowledgeGraph(
  store: KnowledgeGraphStore,
  params: { query: string; sourceId?: string; limit: number; activeSourcesOnly?: boolean },
): SearchResult[] {
  const queryText = params.query.trim();
  if (!queryText) return [];
  const terms = searchTerms(queryText);
  const candidateLimit = Math.max(params.limit * 25, 100);
  const rows = store.hasFts && terms.length > 0
    ? ftsSearchRows(store, terms, params.sourceId, candidateLimit, params.activeSourcesOnly)
    : likeSearchRows(store, queryText, terms, params.sourceId, candidateLimit, params.activeSourcesOnly);

  return rows
    .map((row) => scoredSearchResult(row, queryText, terms))
    .sort((left, right) => right.score - left.score || left.textLength - right.textLength || left.result.title.localeCompare(right.result.title))
    .slice(0, params.limit)
    .map((row) => row.result);
}

function ftsSearchRows(
  store: KnowledgeGraphStore,
  terms: string[],
  sourceId: string | undefined,
  limit: number,
  activeSourcesOnly = false,
): SearchRow[] {
  const ftsQuery = terms.map((term) => `"${term}"`).join(" OR ");
  return store.orm.all<SearchRow>(sql`
    SELECT
      search_chunks.id,
      search_chunks.source_id,
      search_chunks.entity_id,
      search_chunks.title,
      search_chunks.text,
      search_chunks.evidence_ref,
      search_chunks.payload_json,
      knowledge_sources.trust_tier
    FROM search_chunks_fts
    JOIN search_chunks ON search_chunks.id = search_chunks_fts.id
    LEFT JOIN knowledge_sources ON knowledge_sources.id = search_chunks.source_id
    WHERE search_chunks_fts MATCH ${ftsQuery}
      ${sourceId ? sql`AND search_chunks.source_id = ${sourceId}` : sql``}
      ${activeSourcesOnly ? sql`AND (knowledge_sources.id IS NULL OR COALESCE(json_extract(knowledge_sources.descriptor_json, '$.active'), 1) != 0)` : sql``}
    LIMIT ${limit}
  `);
}

function likeSearchRows(
  store: KnowledgeGraphStore,
  queryText: string,
  terms: string[],
  sourceId: string | undefined,
  limit: number,
  activeSourcesOnly = false,
): SearchRow[] {
  const clauses = terms.length
    ? terms.map((term) => sql`(lower(search_chunks.title) LIKE ${`%${escapeLike(term)}%`} ESCAPE '\' OR lower(search_chunks.text) LIKE ${`%${escapeLike(term)}%`} ESCAPE '\')`)
    : [sql`(search_chunks.title LIKE ${`%${queryText}%`} OR search_chunks.text LIKE ${`%${queryText}%`})`];
  return store.orm.all<SearchRow>(sql`
    SELECT
      search_chunks.id,
      search_chunks.source_id,
      search_chunks.entity_id,
      search_chunks.title,
      search_chunks.text,
      search_chunks.evidence_ref,
      search_chunks.payload_json,
      knowledge_sources.trust_tier
    FROM search_chunks
    LEFT JOIN knowledge_sources ON knowledge_sources.id = search_chunks.source_id
    WHERE (${sql.join(clauses, sql` OR `)})
      ${sourceId ? sql`AND search_chunks.source_id = ${sourceId}` : sql``}
      ${activeSourcesOnly ? sql`AND (knowledge_sources.id IS NULL OR COALESCE(json_extract(knowledge_sources.descriptor_json, '$.active'), 1) != 0)` : sql``}
    ORDER BY length(search_chunks.text) ASC
    LIMIT ${limit}
  `);
}

function scoredSearchResult(
  row: SearchRow,
  queryText: string,
  terms: string[],
): { result: SearchResult; score: number; textLength: number } {
  const title = String(row.title ?? "");
  const text = String(row.text ?? "");
  const lowerTitle = title.toLowerCase();
  const lowerText = text.toLowerCase();
  const lowerQuery = queryText.toLowerCase();
  let score = 0;
  if (lowerTitle.includes(lowerQuery)) score += 12;
  if (lowerText.includes(lowerQuery)) score += 8;
  for (const term of terms) {
    if (lowerTitle.includes(term)) score += 4;
    if (lowerText.includes(term)) score += 2;
  }
  const payload = graphPayload(row.payload_json);
  return {
    result: {
      source_id: String(row.source_id ?? ""),
      result_id: String(row.id ?? ""),
      title,
      snippet: searchSnippet(text, [lowerQuery, ...terms]),
      evidence_ref: String(row.evidence_ref ?? ""),
      entity_id: row.entity_id == null ? undefined : String(row.entity_id),
      confidence: Math.min(0.95, 0.35 + score * 0.04),
      trust_tier: (row.trust_tier ?? "historical") as SearchResult["trust_tier"],
      status: typeof payload.status === "string" ? payload.status : undefined,
      origin: typeof payload.origin === "string" ? payload.origin : undefined,
      source_confidence: typeof payload.confidence === "number" ? payload.confidence : undefined,
    },
    score,
    textLength: text.length,
  };
}

function searchTerms(queryText: string): string[] {
  const seen = new Set<string>();
  for (const term of queryText.toLowerCase().split(/[^a-z0-9_]+/)) {
    if (term.length < 2 || seen.has(term)) continue;
    seen.add(term);
  }
  return [...seen];
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function searchSnippet(text: string, needles: string[]): string {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const lowerText = normalizedText.toLowerCase();
  const found = needles
    .filter(Boolean)
    .map((needle) => lowerText.indexOf(needle))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (found === undefined) return truncate(normalizedText, 360);
  const start = Math.max(0, found - 90);
  const end = Math.min(normalizedText.length, found + 270);
  return `${start > 0 ? "..." : ""}${truncate(normalizedText.slice(start, end), 360)}${end < normalizedText.length ? "..." : ""}`;
}
