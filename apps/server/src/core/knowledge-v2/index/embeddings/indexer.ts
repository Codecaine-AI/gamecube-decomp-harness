import { createHash } from "node:crypto";
import type { KnowledgeStore } from "../../storage/store.js";
import { clearEmbeddingChunks, type KnowledgeIndexDb } from "../db.js";
import {
  chunkWithCounts,
  isEmbeddableText,
  type EmbeddingChunk,
  type EmbeddingKind,
  type PrDiscussionSource,
} from "./chunker.js";
import type { EmbeddingProvider } from "./provider.js";

export interface BuildEmbeddingIndexOptions {
  kinds?: EmbeddingKind[];
  allWikiRevisions?: boolean;
  prArchive?: PrDiscussionSource;
  rebuild?: boolean;
}

export interface BuildEmbeddingIndexResult {
  embedded: number;
  skipped: number;
  skippedEmpty: number;
  byKind: Record<string, { embedded: number; skipped: number; skippedEmpty: number }>;
}

export interface VectorHit {
  locator: string;
  score: number;
  text: string;
}

const EMPTY_PR_ARCHIVE: PrDiscussionSource = {
  getPr: () => undefined,
  getDiscussionBodies: () => [],
};

interface PendingChunk {
  chunk: EmbeddingChunk;
  textHash: string;
}

export async function buildEmbeddingIndex(
  store: KnowledgeStore,
  indexDb: KnowledgeIndexDb,
  provider: EmbeddingProvider,
  options: BuildEmbeddingIndexOptions = {},
): Promise<BuildEmbeddingIndexResult> {
  const kinds = options.kinds ?? ["discord", "wiki", "pr"];
  const result: BuildEmbeddingIndexResult = { embedded: 0, skipped: 0, skippedEmpty: 0, byKind: {} };
  const pending: PendingChunk[] = [];

  for (const kind of kinds) {
    result.byKind[kind] ??= { embedded: 0, skipped: 0, skippedEmpty: 0 };
    if (options.rebuild) clearEmbeddingChunks(indexDb.db, kind);

    const { chunks, skippedEmpty } = chunksForKind(store, kind, options);
    result.skippedEmpty += skippedEmpty;
    result.byKind[kind].skippedEmpty += skippedEmpty;
    for (const chunk of chunks) {
      const textHash = createHash("sha256").update(chunk.text).digest("hex");
      const existing = indexDb.db.query(`SELECT text_hash FROM embedding_chunk
        WHERE kind = ? AND locator = ? AND chunk_seq = ? AND model = ?`)
        .get(chunk.kind, chunk.locator, chunk.chunkSeq, provider.model) as { text_hash: string } | null;
      if (existing?.text_hash === textHash) {
        result.skipped += 1;
        result.byKind[kind].skipped += 1;
      } else {
        pending.push({ chunk, textHash });
      }
    }
  }

  const embeddablePending = pending.filter(({ chunk }) => {
    if (isEmbeddableText(chunk.text)) return true;
    result.skippedEmpty += 1;
    result.byKind[chunk.kind].skippedEmpty += 1;
    return false;
  });

  if (embeddablePending.length === 0) return result;

  const vectors = await provider.embed(embeddablePending.map(({ chunk }) => chunk.text));
  if (vectors.length !== embeddablePending.length) {
    throw new Error(`Embedding provider returned ${vectors.length} vectors for ${embeddablePending.length} texts`);
  }

  const insert = indexDb.db.query(`INSERT OR REPLACE INTO embedding_chunk
    (kind, locator, chunk_seq, text, text_hash, model, dim, vector)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  indexDb.db.transaction(() => {
    for (let index = 0; index < embeddablePending.length; index += 1) {
      const { chunk, textHash } = embeddablePending[index];
      const vector = vectors[index];
      insert.run(
        chunk.kind,
        chunk.locator,
        chunk.chunkSeq,
        chunk.text,
        textHash,
        provider.model,
        vector.length,
        float32ToLittleEndianBuffer(vector),
      );
      result.embedded += 1;
      result.byKind[chunk.kind].embedded += 1;
    }
  })();

  // Stale locators remain until a rebuild. Incremental indexing only replaces current chunks.
  return result;
}

export async function embedQuery(provider: EmbeddingProvider, text: string): Promise<Float32Array> {
  if (!isEmbeddableText(text)) throw new Error("Embedding query text must not be empty");
  const vectors = await provider.embed([text]);
  if (vectors.length !== 1) throw new Error(`Embedding provider returned ${vectors.length} query vectors`);
  return vectors[0];
}

export async function searchVector(
  indexDb: KnowledgeIndexDb,
  source: EmbeddingKind,
  queryText: string,
  topK: number,
  provider: EmbeddingProvider,
): Promise<VectorHit[]> {
  if (topK <= 0) return [];
  const query = await embedQuery(provider, queryText);
  const queryNorm = vectorNorm(query);
  if (queryNorm === 0) return [];

  const rows = indexDb.db.query(`SELECT locator, text, dim, vector FROM embedding_chunk
    WHERE kind = ? AND model = ?`).all(source, provider.model) as Array<{
      locator: string;
      text: string;
      dim: number;
      vector: Uint8Array;
    }>;

  const hits: VectorHit[] = [];
  for (const row of rows) {
    if (row.dim !== query.length || row.vector.byteLength !== row.dim * 4) continue;
    const vector = littleEndianBufferToFloat32(row.vector, row.dim);
    const norm = vectorNorm(vector);
    if (norm === 0) continue;
    let dot = 0;
    for (let index = 0; index < query.length; index += 1) dot += query[index] * vector[index];
    hits.push({ locator: row.locator, score: dot / (queryNorm * norm), text: row.text });
  }

  hits.sort((left, right) => right.score - left.score || left.locator.localeCompare(right.locator));
  return hits.slice(0, topK);
}

function chunksForKind(
  store: KnowledgeStore,
  kind: EmbeddingKind,
  options: BuildEmbeddingIndexOptions,
): { chunks: EmbeddingChunk[]; skippedEmpty: number } {
  return chunkWithCounts(store, kind, {
    allWikiRevisions: options.allWikiRevisions,
    prArchive: options.prArchive ?? EMPTY_PR_ARCHIVE,
  });
}

function float32ToLittleEndianBuffer(vector: Float32Array): Buffer {
  const buffer = Buffer.allocUnsafe(vector.length * 4);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  for (let index = 0; index < vector.length; index += 1) view.setFloat32(index * 4, vector[index], true);
  return buffer;
}

function littleEndianBufferToFloat32(bytes: Uint8Array, dim: number): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vector = new Float32Array(dim);
  for (let index = 0; index < dim; index += 1) vector[index] = view.getFloat32(index * 4, true);
  return vector;
}

function vectorNorm(vector: Float32Array): number {
  let squared = 0;
  for (const value of vector) squared += value * value;
  return Math.sqrt(squared);
}
