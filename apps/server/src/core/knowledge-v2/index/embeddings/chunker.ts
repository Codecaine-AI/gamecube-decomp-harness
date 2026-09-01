import { formatLocator } from "../../locator.js";
import type { KnowledgeStore } from "../../storage/store.js";

export type EmbeddingKind = "discord" | "wiki" | "pr";

export interface EmbeddingChunk {
  kind: EmbeddingKind;
  locator: string;
  chunkSeq: number;
  text: string;
}

export interface PartitionedEmbeddingChunks {
  chunks: EmbeddingChunk[];
  skippedEmpty: number;
}

export interface PrDiscussionSource {
  getPr(prRef: string): { title?: string; body?: string } | undefined;
  getDiscussionBodies(prRef: string): string[];
}

export const WIKI_CHUNK_MAX_CHARS = 6000;

export function isEmbeddableText(text: string): boolean {
  return text.trim().length > 0;
}

export function partitionEmbeddableChunks(chunks: EmbeddingChunk[]): PartitionedEmbeddingChunks {
  const embeddable = chunks.filter((chunk) => isEmbeddableText(chunk.text));
  return { chunks: embeddable, skippedEmpty: chunks.length - embeddable.length };
}

interface DiscordRow {
  id: string;
  channel: string;
  posted_at: string;
  content: string;
  thread_id: string | null;
}

export function chunkDiscord(store: KnowledgeStore): EmbeddingChunk[] {
  return chunkDiscordWithCounts(store).chunks;
}

function chunkDiscordWithCounts(store: KnowledgeStore): PartitionedEmbeddingChunks {
  const rows = store.db.query<DiscordRow, []>(`
    SELECT id, channel, posted_at, content, thread_id
    FROM discord_message
    ORDER BY posted_at, id
  `).all();
  const windows = new Map<string, DiscordRow[]>();

  for (const row of rows) {
    const key = row.thread_id === null
      ? `channel\u0000${row.channel}`
      : `thread\u0000${row.thread_id}`;
    const window = windows.get(key);
    if (window === undefined) windows.set(key, [row]);
    else window.push(row);
  }

  const chunks: EmbeddingChunk[] = rows.map((row) => {
    const key = row.thread_id === null
      ? `channel\u0000${row.channel}`
      : `thread\u0000${row.thread_id}`;
    const window = windows.get(key)!;
    const index = window.indexOf(row);
    return {
      kind: "discord",
      locator: formatLocator({ kind: "discord", messageId: row.id }),
      chunkSeq: 0,
      text: window.slice(Math.max(0, index - 5), index + 6)
        .map((message) => message.content)
        .join("\n"),
    };
  });
  return partitionEmbeddableChunks(chunks);
}

interface WikiRow {
  id: string;
  content: string;
}

function splitWikiContent(content: string): string[] {
  if (content.length <= WIKI_CHUNK_MAX_CHARS) return [content];

  const chunks: string[] = [];
  let offset = 0;
  while (offset < content.length) {
    const remaining = content.length - offset;
    if (remaining <= WIKI_CHUNK_MAX_CHARS) {
      chunks.push(content.slice(offset));
      break;
    }

    const candidate = content.slice(offset, offset + WIKI_CHUNK_MAX_CHARS);
    const newline = candidate.lastIndexOf("\n");
    const space = candidate.lastIndexOf(" ");
    const length = newline >= 0 ? newline + 1 : space >= 0 ? space + 1 : WIKI_CHUNK_MAX_CHARS;
    chunks.push(content.slice(offset, offset + length));
    offset += length;
  }
  return chunks;
}

export function chunkWiki(
  store: KnowledgeStore,
  options: { allRevisions?: boolean } = {},
): EmbeddingChunk[] {
  return chunkWikiWithCounts(store, options).chunks;
}

function chunkWikiWithCounts(
  store: KnowledgeStore,
  options: { allRevisions?: boolean } = {},
): PartitionedEmbeddingChunks {
  const rows = options.allRevisions
    ? store.db.query<WikiRow, []>(`
        SELECT id, content
        FROM wiki_section
        ORDER BY page, section, ingested_at, mirror_revision, id
      `).all()
    : store.db.query<WikiRow, []>(`
        SELECT id, content
        FROM (
          SELECT id, content,
            ROW_NUMBER() OVER (
              PARTITION BY page, section
              ORDER BY ingested_at DESC, mirror_revision DESC, id DESC
            ) AS revision_rank
          FROM wiki_section
        )
        WHERE revision_rank = 1
        ORDER BY id
      `).all();

  const chunks = rows.flatMap((row) => splitWikiContent(row.content).map((text, chunkSeq) => ({
    kind: "wiki" as const,
    locator: formatLocator({ kind: "wiki", sectionId: row.id }),
    chunkSeq,
    text,
  })));
  return partitionEmbeddableChunks(chunks);
}

interface PullRequestRow {
  id: string;
  pr_ref: string;
  summary: string;
}

export function chunkPr(store: KnowledgeStore, archive: PrDiscussionSource): EmbeddingChunk[] {
  return chunkPrWithCounts(store, archive).chunks;
}

function chunkPrWithCounts(
  store: KnowledgeStore,
  archive: PrDiscussionSource,
): PartitionedEmbeddingChunks {
  const rows = store.db.query<PullRequestRow, []>(`
    SELECT id, pr_ref, summary
    FROM pull_request
    ORDER BY id
  `).all();
  const chunks: EmbeddingChunk[] = [];

  for (const row of rows) {
    const archived = archive.getPr(row.pr_ref) ?? archive.getPr(row.id);
    chunks.push({
      kind: "pr",
      locator: formatLocator({ kind: "pr", pullRequestId: row.id }),
      chunkSeq: 0,
      text: `${archived?.title ?? ""}\n\n${archived?.body ?? row.summary}`,
    });

    let pendingText = "";
    let pendingIndex = -1;
    const commentsByRef = archive.getDiscussionBodies(row.pr_ref);
    const comments = commentsByRef.length > 0
      ? commentsByRef
      : archive.getDiscussionBodies(row.id);
    for (let index = 0; index < comments.length; index += 1) {
      const comment = comments[index];
      if (comment.length >= 200) {
        if (pendingIndex >= 0) {
          chunks.push(commentChunk(row.id, pendingIndex, pendingText));
          pendingText = "";
          pendingIndex = -1;
        }
        chunks.push(commentChunk(row.id, index, comment));
        continue;
      }

      if (pendingIndex < 0) pendingIndex = index;
      pendingText = pendingText.length === 0 ? comment : `${pendingText}\n\n${comment}`;
      if (pendingText.length >= 200) {
        chunks.push(commentChunk(row.id, pendingIndex, pendingText));
        pendingText = "";
        pendingIndex = -1;
      }
    }
    if (pendingIndex >= 0) chunks.push(commentChunk(row.id, pendingIndex, pendingText));
  }

  return partitionEmbeddableChunks(chunks);
}

export function chunkWithCounts(
  store: KnowledgeStore,
  kind: EmbeddingKind,
  options: { allWikiRevisions?: boolean; prArchive?: PrDiscussionSource } = {},
): PartitionedEmbeddingChunks {
  switch (kind) {
    case "discord":
      return chunkDiscordWithCounts(store);
    case "wiki":
      return chunkWikiWithCounts(store, { allRevisions: options.allWikiRevisions });
    case "pr":
      return chunkPrWithCounts(store, options.prArchive ?? {
        getPr: () => undefined,
        getDiscussionBodies: () => [],
      });
  }
}

function commentChunk(pullRequestId: string, commentNumber: number, text: string): EmbeddingChunk {
  return {
    kind: "pr",
    locator: formatLocator({ kind: "pr", pullRequestId, commentNumber }),
    chunkSeq: 0,
    text,
  };
}
