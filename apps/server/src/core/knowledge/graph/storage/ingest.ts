import { sql } from "drizzle-orm";
import type { GraphEntity, GraphFact, GraphRecords, SearchChunk, SourceDescriptor, ToolDescriptor } from "../types.js";
import { graphEdges, graphEntities, graphFacts, knowledgeSources, knowledgeTools, resourceVersions, searchChunks } from "./schema.js";
import type { KnowledgeGraphStore } from "./store.js";

const INSERT_CHUNK_SIZE = 500;

export function resetKnowledgeGraph(store: KnowledgeGraphStore): void {
  store.db.run("DELETE FROM knowledge_graph_metadata");
  store.orm.transaction((tx) => {
    tx.delete(knowledgeSources).run();
    tx.delete(knowledgeTools).run();
    tx.delete(resourceVersions).run();
    tx.delete(graphEntities).run();
    tx.delete(graphFacts).run();
    tx.delete(graphEdges).run();
    tx.delete(searchChunks).run();
    if (store.hasFts) tx.run(sql`DELETE FROM search_chunks_fts`);
  });
}

export function upsertSourceDescriptor(store: KnowledgeGraphStore, source: SourceDescriptor): void {
  const updatedAt = new Date().toISOString();
  store.orm
    .insert(knowledgeSources)
    .values({
      id: source.id,
      kind: source.kind,
      title: source.title,
      trustTier: source.trust_tier,
      freshness: source.freshness,
      descriptorJson: source,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: knowledgeSources.id,
      set: {
        kind: sql`excluded.kind`,
        title: sql`excluded.title`,
        trustTier: sql`excluded.trust_tier`,
        freshness: sql`excluded.freshness`,
        descriptorJson: sql`excluded.descriptor_json`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .run();
}

export function upsertToolDescriptor(store: KnowledgeGraphStore, tool: ToolDescriptor): void {
  const updatedAt = new Date().toISOString();
  store.orm
    .insert(knowledgeTools)
    .values({
      id: tool.id,
      title: tool.title,
      trustTier: tool.trust_tier,
      descriptorJson: tool,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: knowledgeTools.id,
      set: {
        title: sql`excluded.title`,
        trustTier: sql`excluded.trust_tier`,
        descriptorJson: sql`excluded.descriptor_json`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .run();
}

export function insertGraphRecords(store: KnowledgeGraphStore, records: GraphRecords): void {
  const indexedAt = new Date().toISOString();
  const entityRows = records.entities.map((entity) => graphEntityRow(entity, indexedAt));
  const replaceEntityRows = entityRows.filter((row) => row.replace);
  const ignoreEntityRows = entityRows.filter((row) => !row.replace);
  const factRows = records.facts.map(graphFactRow);
  const edgeRows = records.edges.map(graphEdgeRow);
  const chunkRows = records.chunks.map((chunk) => searchChunkRow(records.sourceVersion.sourceId, chunk));

  const insertFts = store.hasFts
    ? store.db.query("INSERT INTO search_chunks_fts (id, source_id, entity_id, title, text, evidence_ref) VALUES (?, ?, ?, ?, ?, ?)")
    : null;

  store.orm.transaction((tx) => {
    tx.insert(resourceVersions)
      .values({
        id: records.sourceVersion.id,
        sourceId: records.sourceVersion.sourceId,
        contentHash: records.sourceVersion.contentHash,
        indexedAt,
        sourcePathsJson: records.sourceVersion.sourcePaths,
      })
      .onConflictDoUpdate({
        target: resourceVersions.id,
        set: {
          sourceId: sql`excluded.source_id`,
          contentHash: sql`excluded.content_hash`,
          indexedAt: sql`excluded.indexed_at`,
          sourcePathsJson: sql`excluded.source_paths_json`,
        },
      })
      .run();

    for (const rows of chunked(replaceEntityRows, INSERT_CHUNK_SIZE)) {
      tx.insert(graphEntities)
        .values(rows.map(({ replace, ...row }) => row))
        .onConflictDoUpdate({
          target: graphEntities.id,
          set: {
            entityType: sql`excluded.entity_type`,
            stableKey: sql`excluded.stable_key`,
            payloadJson: sql`excluded.payload_json`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .run();
    }
    for (const rows of chunked(ignoreEntityRows, INSERT_CHUNK_SIZE)) {
      tx.insert(graphEntities)
        .values(rows.map(({ replace, ...row }) => row))
        .onConflictDoNothing({ target: graphEntities.id })
        .run();
    }
    for (const rows of chunked(factRows, INSERT_CHUNK_SIZE)) {
      tx.insert(graphFacts)
        .values(rows)
        .onConflictDoUpdate({
          target: graphFacts.id,
          set: {
            entityId: sql`excluded.entity_id`,
            factType: sql`excluded.fact_type`,
            payloadJson: sql`excluded.payload_json`,
            confidence: sql`excluded.confidence`,
            trustTier: sql`excluded.trust_tier`,
            evidenceRef: sql`excluded.evidence_ref`,
            resourceVersionId: sql`excluded.resource_version_id`,
            status: sql`excluded.status`,
          },
        })
        .run();
    }
    for (const rows of chunked(edgeRows, INSERT_CHUNK_SIZE)) {
      tx.insert(graphEdges)
        .values(rows)
        .onConflictDoUpdate({
          target: graphEdges.id,
          set: {
            fromEntityId: sql`excluded.from_entity_id`,
            edgeType: sql`excluded.edge_type`,
            toEntityId: sql`excluded.to_entity_id`,
            weight: sql`excluded.weight`,
            evidenceRef: sql`excluded.evidence_ref`,
            resourceVersionId: sql`excluded.resource_version_id`,
            status: sql`excluded.status`,
          },
        })
        .run();
    }
    for (const rows of chunked(chunkRows, INSERT_CHUNK_SIZE)) {
      tx.insert(searchChunks)
        .values(rows)
        .onConflictDoUpdate({
          target: searchChunks.id,
          set: {
            sourceId: sql`excluded.source_id`,
            sourceVersionId: sql`excluded.source_version_id`,
            entityId: sql`excluded.entity_id`,
            title: sql`excluded.title`,
            text: sql`excluded.text`,
            evidenceRef: sql`excluded.evidence_ref`,
            payloadJson: sql`excluded.payload_json`,
          },
        })
        .run();
    }
    for (const chunk of records.chunks) {
      insertFts?.run(chunk.id, chunk.sourceId, chunk.entityId ?? null, chunk.title, chunk.text, chunk.evidenceRef);
    }
  });
}

function graphEntityRow(entity: GraphEntity, updatedAt: string) {
  return {
    id: entity.id,
    entityType: entity.entityType,
    stableKey: entity.stableKey,
    payloadJson: entity.payload,
    updatedAt,
    replace: entity.replace !== false,
  };
}

function graphFactRow(fact: GraphFact) {
  return {
    id: fact.id,
    entityId: fact.entityId,
    factType: fact.factType,
    payloadJson: fact.payload,
    confidence: fact.confidence,
    trustTier: fact.trustTier,
    evidenceRef: fact.evidenceRef,
    resourceVersionId: fact.sourceVersionId,
    status: fact.status ?? "accepted",
  };
}

function graphEdgeRow(edge: GraphRecords["edges"][number]) {
  return {
    id: edge.id,
    fromEntityId: edge.fromEntityId,
    edgeType: edge.edgeType,
    toEntityId: edge.toEntityId,
    weight: edge.weight,
    evidenceRef: edge.evidenceRef,
    resourceVersionId: edge.sourceVersionId,
    status: edge.status ?? "accepted",
  };
}

function searchChunkRow(sourceId: string, chunk: SearchChunk) {
  return {
    id: chunk.id,
    sourceId,
    sourceVersionId: chunk.sourceVersionId,
    entityId: chunk.entityId ?? null,
    title: chunk.title,
    text: chunk.text,
    evidenceRef: chunk.evidenceRef,
    payloadJson: chunk.payload,
  };
}

function chunked<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}
