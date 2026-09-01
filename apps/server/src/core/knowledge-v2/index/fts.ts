import type { KnowledgeStore } from "../storage/store.js";
import { formatLocator } from "../locator.js";
import {
  clearFtsTable,
  FTS_TABLE_BY_SOURCE,
  type FtsSource,
  type KnowledgeIndexDb,
} from "./db.js";
import { createPastPrsArchive, type PrArchive } from "./pr-archive.js";

export interface BuildFtsOptions {
  allWikiRevisions?: boolean;
  prArchive?: PrArchive;
}

interface DiscordRow {
  id: string;
  content: string;
}

interface WikiRow {
  id: string;
  content: string;
}

interface PullRequestRow {
  id: string;
  pr_ref: string;
  summary: string;
}

interface WorkerRunRow {
  id: string;
}

interface SubmissionRow {
  worker_run_id: string;
  hypothesis: string;
  description: string;
}

export function buildDiscordFts(store: KnowledgeStore, indexDb: KnowledgeIndexDb): number {
  clearFtsTable(indexDb.db, "discord");
  const rows = store.db.query<DiscordRow, []>("SELECT id, content FROM discord_message").all();
  const insert = indexDb.db.query("INSERT INTO discord_fts (id, content) VALUES (?, ?)");
  indexDb.db.transaction(() => {
    for (const row of rows) {
      insert.run(formatLocator({ kind: "discord", messageId: row.id }), row.content);
    }
  })();
  return rows.length;
}

export function buildWikiFts(
  store: KnowledgeStore,
  indexDb: KnowledgeIndexDb,
  options: BuildFtsOptions = {},
): number {
  clearFtsTable(indexDb.db, "wiki");
  const sql = options.allWikiRevisions
    ? "SELECT id, content FROM wiki_section"
    : `SELECT id, content FROM (
        SELECT id, content, ROW_NUMBER() OVER (
          PARTITION BY page, section
          ORDER BY ingested_at DESC, mirror_revision DESC
        ) AS revision_rank
        FROM wiki_section
      ) WHERE revision_rank = 1`;
  const rows = store.db.query<WikiRow, []>(sql).all();
  const insert = indexDb.db.query("INSERT INTO wiki_fts (id, content) VALUES (?, ?)");
  indexDb.db.transaction(() => {
    for (const row of rows) {
      insert.run(formatLocator({ kind: "wiki", sectionId: row.id }), row.content);
    }
  })();
  return rows.length;
}

export function buildPrFts(
  store: KnowledgeStore,
  indexDb: KnowledgeIndexDb,
  options: BuildFtsOptions = {},
): number {
  clearFtsTable(indexDb.db, "pr");
  const archive = options.prArchive ?? createPastPrsArchive();
  const rows = store.db
    .query<PullRequestRow, []>("SELECT id, pr_ref, summary FROM pull_request")
    .all();
  const insert = indexDb.db.query(
    "INSERT INTO pr_fts (id, title, body, discussion) VALUES (?, ?, ?, ?)",
  );
  indexDb.db.transaction(() => {
    for (const row of rows) {
      const entry = archive.getPr(row.pr_ref) ?? archive.getPr(row.id);
      insert.run(
        formatLocator({ kind: "pr", pullRequestId: row.id }),
        entry?.title ?? row.pr_ref,
        entry?.body ?? row.summary,
        archive.getDiscussionBodies(row.pr_ref).join("\n\n"),
      );
    }
  })();
  return rows.length;
}

export function buildAttemptFts(store: KnowledgeStore, indexDb: KnowledgeIndexDb): number {
  clearFtsTable(indexDb.db, "attempt");
  const runs = store.db.query<WorkerRunRow, []>("SELECT id FROM worker_run").all();
  const submissions = store.db.query<SubmissionRow, []>(
    `SELECT worker_run_id, hypothesis, description
     FROM submission
     WHERE hypothesis IS NOT NULL
     ORDER BY worker_run_id, seq`,
  ).all();
  const hypothesesByRun = new Map<string, string[]>();
  for (const submission of submissions) {
    const hypotheses = hypothesesByRun.get(submission.worker_run_id) ?? [];
    hypotheses.push(`${submission.hypothesis}\n${submission.description}`);
    hypothesesByRun.set(submission.worker_run_id, hypotheses);
  }
  const insert = indexDb.db.query(
    "INSERT INTO attempt_fts (id, hypotheses, transcript) VALUES (?, ?, ?)",
  );
  indexDb.db.transaction(() => {
    for (const run of runs) {
      // Transcript indexing is deferred until run-state artifacts are part of knowledge-v2.
      insert.run(
        formatLocator({ kind: "attempt", runId: run.id }),
        (hypothesesByRun.get(run.id) ?? []).join("\n\n"),
        "",
      );
    }
  })();
  return runs.length;
}

export function buildAllFts(
  store: KnowledgeStore,
  indexDb: KnowledgeIndexDb,
  options: BuildFtsOptions = {},
): Record<FtsSource, number> {
  return {
    discord: buildDiscordFts(store, indexDb),
    wiki: buildWikiFts(store, indexDb, options),
    pr: buildPrFts(store, indexDb, options),
    attempt: buildAttemptFts(store, indexDb),
  };
}

export interface FtsHit {
  locator: string;
  snippet: string;
  rank: number;
}

interface FtsHitRow {
  locator: string;
  snippet: string;
  rank: number;
}

export function searchFts(
  indexDb: KnowledgeIndexDb,
  source: FtsSource,
  query: string,
  filters: { limit?: number } = {},
): FtsHit[] {
  const terms = query.split(/\s+/u).filter(Boolean);
  if (terms.length === 0) throw new Error("empty FTS search query");
  const match = terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" ");
  const table = FTS_TABLE_BY_SOURCE[source];
  return indexDb.db.query<FtsHitRow, [string, number]>(
    `SELECT id AS locator, snippet(${table}, -1, '[', ']', '…', 12) AS snippet, rank
     FROM ${table}
     WHERE ${table} MATCH ?
     ORDER BY rank
     LIMIT ?`,
  ).all(match, filters.limit ?? 20);
}
