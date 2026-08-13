import { existsSync } from "node:fs";
import {
  listStandardsSliceFiles,
  readOrderedSliceRecords,
  standardsOrderPath,
  standardsSlicesRoot,
} from "../../standards-files.js";
import { sourceStorageRoot } from "../../paths.js";
import type { GraphEdge, GraphEntity, GraphFact, GraphRecords, SearchChunk } from "../types.js";
import { arrayValue, filesFingerprint, shortHash, stableJson, stringValue, truncate } from "../util.js";
import { fileEntityId } from "./code-graph.js";

const SOURCE_ID = "decomp_standards";
const FILE_MENTION_RE = /(?:^|[\s`"'(])((?:src|include|asm|config)\/[A-Za-z0-9_./+@-]+)\b/g;

/** Build graph records for the compact accepted standards and their examples. */
export function buildDecompStandardsGraphRecords(): GraphRecords | null {
  const slicesRoot = standardsSlicesRoot(sourceStorageRoot(SOURCE_ID));
  const standards = readOrderedSliceRecords(slicesRoot, "standards.jsonl", "standards");
  const examples = readOrderedSliceRecords(slicesRoot, "examples.jsonl", "examples");
  const sourcePaths = [
    standardsOrderPath(slicesRoot),
    ...listStandardsSliceFiles(slicesRoot, "standards.jsonl"),
    ...listStandardsSliceFiles(slicesRoot, "examples.jsonl"),
  ].filter(existsSync);
  if (standards.length === 0 || sourcePaths.length === 0) return null;

  const examplesByStandard = new Map<string, Record<string, unknown>[]>();
  for (const { record } of examples) {
    const standardId = stringValue(record.standard_id);
    if (!standardId) continue;
    const rows = examplesByStandard.get(standardId) ?? [];
    rows.push(record);
    examplesByStandard.set(standardId, rows);
  }

  const sourceVersionId = `source-version:${SOURCE_ID}:${shortHash(filesFingerprint(sourcePaths))}`;
  const entities: GraphEntity[] = [];
  const facts: GraphFact[] = [];
  const edges: GraphEdge[] = [];
  const chunks: SearchChunk[] = [];

  for (const { record, file } of standards) {
    const standardId = stringValue(record.id) || shortHash(stableJson(record));
    const title = stringValue(record.title, standardId);
    const standardExamples = examplesByStandard.get(standardId) ?? [];
    const text = standardText(record, standardExamples);
    const evidenceRef = arrayValue(record.evidence_refs).map(String).filter(Boolean).join(";") || file;
    const resourceEntityId = `resource:${SOURCE_ID}:${shortHash(standardId)}`;
    const linkedFiles = linkedSourcePaths(text);
    const payload = {
      source_id: SOURCE_ID,
      standard_id: standardId,
      title,
      record,
      examples: standardExamples,
      linked_file_paths: linkedFiles,
      evidence_ref: evidenceRef,
    };

    entities.push({
      id: resourceEntityId,
      entityType: "decomp_standard",
      stableKey: standardId,
      payload,
    });
    facts.push({
      id: `fact:${SOURCE_ID}:${shortHash(standardId)}`,
      entityId: resourceEntityId,
      factType: "decomp_standard",
      payload,
      confidence: 0.9,
      trustTier: "reference",
      evidenceRef,
      sourceVersionId,
    });
    chunks.push({
      id: `chunk:${SOURCE_ID}:${shortHash(standardId)}`,
      sourceId: SOURCE_ID,
      sourceVersionId,
      entityId: resourceEntityId,
      title: `Decomp standard: ${title}`,
      text: truncate(text, 8000),
      evidenceRef,
      payload,
    });
    for (const sourcePath of linkedFiles) {
      const fileId = fileEntityId(sourcePath);
      entities.push({
        id: fileId,
        entityType: "source_file",
        stableKey: sourcePath,
        payload: { source_path: sourcePath },
        replace: false,
      });
      edges.push({
        id: `edge:HAS_DECOMP_STANDARD:${shortHash(`${sourcePath}:${standardId}`)}`,
        fromEntityId: fileId,
        edgeType: "HAS_DECOMP_STANDARD",
        toEntityId: resourceEntityId,
        weight: 0.9,
        evidenceRef,
        sourceVersionId,
        status: "accepted",
      });
    }
  }

  return {
    sourceVersion: {
      id: sourceVersionId,
      sourceId: SOURCE_ID,
      contentHash: shortHash(filesFingerprint(sourcePaths)),
      sourcePaths,
    },
    entities,
    facts,
    edges,
    chunks,
  };
}

function standardText(record: Record<string, unknown>, examples: Record<string, unknown>[]): string {
  return [
    record.title,
    record.summary,
    record.family,
    record.disposition,
    record.qa_enforcement,
    ...arrayValue(record.qa_rule_ids),
    ...arrayValue(record.do),
    ...arrayValue(record.do_not),
    ...arrayValue(record.evidence_refs),
    ...examples.flatMap((example) => [
      example.id,
      example.qa_rule_id,
      example.severity,
      example.bad_pattern,
      example.preferred_shape,
      ...arrayValue(example.description),
      example.evidence_ref,
    ]),
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

function linkedSourcePaths(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(FILE_MENTION_RE)) paths.add(match[1].replace(/[),.;:]+$/, ""));
  return [...paths].sort();
}
