import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { checkoutRoot, knowledgeSourcesRoot } from "../paths.js";
import type { GraphEdge, GraphEntity, GraphFact, GraphRecords, SearchChunk } from "./types.js";
import { arrayValue, filesFingerprint, numberValue, objectValue, readJson, readJsonl, shortHash, stableJson, stringValue } from "./util.js";

interface FunctionRecord {
  unit: string;
  sourcePath: string;
  symbol: string;
  size: number;
  fuzzy: number;
  address: string;
}

interface FileRecord {
  sourcePath: string;
  units: Set<string>;
  functions: FunctionRecord[];
  declaredFunctionCount?: number;
  declaredMatchedFunctionCount?: number;
  declaredUnmatchedFunctionCount?: number;
}

export function buildCodeGraphRecords(repoRoot: string): GraphRecords {
  const reportPath = resolve(repoRoot, "build/GALE01/report.json");
  const objdiffPath = resolve(repoRoot, "objdiff.json");
  if (!existsSync(reportPath) || !existsSync(objdiffPath)) return buildCodeGraphRecordsFromIndexes(reportPath, objdiffPath);

  const sourceByUnit = objdiffSourceMap(readJson(objdiffPath));
  const report = readJson(reportPath);
  const sourceVersionId = `source-version:code_graph:${shortHash(filesFingerprint([reportPath, objdiffPath]))}`;
  const entities: GraphEntity[] = [];
  const facts: GraphFact[] = [];
  const edges: GraphEdge[] = [];
  const chunks: SearchChunk[] = [];
  const files = new Map<string, FileRecord>();

  for (const unitValue of arrayValue(report.units)) {
    const unit = objectValue(unitValue);
    const unitName = stringValue(unit.name);
    if (!unitName) continue;
    const metadata = objectValue(unit.metadata);
    const sourcePath = stringValue(metadata.source_path, sourceByUnit.get(unitName) ?? "");
    const unitEntity = unitEntityId(unitName);
    entities.push({
      id: unitEntity,
      entityType: "object_unit",
      stableKey: unitName,
      payload: { unit: unitName, source_path: sourcePath },
    });
    if (sourcePath) {
      const file = getFile(files, sourcePath);
      file.units.add(unitName);
      edges.push(edge(fileEntityId(sourcePath), "COMPILES_TO", unitEntity, sourceVersionId, `objdiff:${unitName}`, 1));
    }

    for (const fnValue of arrayValue(unit.functions)) {
      const fn = objectValue(fnValue);
      const symbol = stringValue(fn.name);
      if (!symbol) continue;
      const size = numberValue(fn.size);
      const fuzzy = numberValue(fn.fuzzy_match_percent, 100);
      const fnMetadata = objectValue(fn.metadata);
      const address = formatAddress(fnMetadata.virtual_address);
      const functionRecord: FunctionRecord = { unit: unitName, sourcePath, symbol, size, fuzzy, address };
      const functionEntity = functionEntityId(unitName, symbol);
      entities.push({
        id: functionEntity,
        entityType: "function",
        stableKey: `${unitName}:${symbol}`,
        payload: { ...functionRecord },
      });
      facts.push({
        id: `fact:function_status:${shortHash(`${unitName}:${symbol}`)}`,
        entityId: functionEntity,
        factType: "function_status",
        payload: { ...functionRecord },
        confidence: 1,
        trustTier: "canonical",
        evidenceRef: `${reportPath}#${unitName}:${symbol}`,
        sourceVersionId,
      });
      edges.push(edge(unitEntity, "CONTAINS", functionEntity, sourceVersionId, `report:${unitName}:${symbol}`, 1));
      if (sourcePath) getFile(files, sourcePath).functions.push(functionRecord);
    }
  }

  for (const file of files.values()) {
    const unmatched = file.functions.filter((fn) => fn.fuzzy < 100);
    const matched = file.functions.filter((fn) => fn.fuzzy >= 100);
    const editability =
      file.functions.length === 0
        ? { mode: "unknown", reason: "No functions were found for this source file in the report." }
        : unmatched.length === 0
          ? { mode: "read_only_complete", reason: "Every known function in this file is exact 100%; use as reference evidence only." }
          : { mode: "editable", reason: `${unmatched.length} unmatched function(s) remain in this source file.` };
    const payload = {
      source_path: file.sourcePath,
      units: [...file.units].sort(),
      function_count: file.functions.length,
      unmatched_function_count: unmatched.length,
      matched_function_count: matched.length,
      editability,
    };
    entities.push({
      id: fileEntityId(file.sourcePath),
      entityType: "source_file",
      stableKey: file.sourcePath,
      payload,
    });
    facts.push({
      id: `fact:file_status:${shortHash(file.sourcePath)}`,
      entityId: fileEntityId(file.sourcePath),
      factType: "file_match_status",
      payload: {
        ...payload,
        unmatched_functions: unmatched.map((fn) => ({ symbol: fn.symbol, fuzzy: fn.fuzzy, size: fn.size, unit: fn.unit, address: fn.address })),
        functions: file.functions.map((fn) => ({ symbol: fn.symbol, fuzzy: fn.fuzzy, size: fn.size, unit: fn.unit, address: fn.address })),
      },
      confidence: 1,
      trustTier: "canonical",
      evidenceRef: reportPath,
      sourceVersionId,
    });
    facts.push({
      id: `fact:editability:${shortHash(file.sourcePath)}`,
      entityId: fileEntityId(file.sourcePath),
      factType: "editability",
      payload: editability,
      confidence: 1,
      trustTier: "canonical",
      evidenceRef: reportPath,
      sourceVersionId,
    });
    chunks.push({
      id: `chunk:code_graph:file:${shortHash(file.sourcePath)}`,
      sourceId: "code_graph",
      sourceVersionId,
      entityId: fileEntityId(file.sourcePath),
      title: `Code graph: ${file.sourcePath}`,
      text: `${file.sourcePath} ${[...file.units].join(" ")} ${file.functions.map((fn) => fn.symbol).join(" ")}`,
      evidenceRef: reportPath,
      payload,
    });
  }

  if (resolve(repoRoot) === checkoutRoot()) {
    writeJsonl(
      resolve(knowledgeSourcesRoot(), "code_graph/indexes/files.jsonl"),
      [...files.values()].map((file) => ({
        source_path: file.sourcePath,
        units: [...file.units].sort(),
        function_count: file.functions.length,
        matched_function_count: file.functions.filter((fn) => fn.fuzzy >= 100).length,
        unmatched_function_count: file.functions.filter((fn) => fn.fuzzy < 100).length,
      })),
    );
    writeJsonl(
      resolve(knowledgeSourcesRoot(), "code_graph/indexes/functions.jsonl"),
      [...files.values()].flatMap((file) => file.functions.map((fn) => ({ ...fn }))),
    );
  }

  return {
    sourceVersion: {
      id: sourceVersionId,
      sourceId: "code_graph",
      contentHash: shortHash(stableJson({ report: filesFingerprint([reportPath]), objdiff: filesFingerprint([objdiffPath]) })),
      sourcePaths: [reportPath, objdiffPath],
    },
    entities,
    facts,
    edges,
    chunks,
  };
}

function buildCodeGraphRecordsFromIndexes(reportPath: string, objdiffPath: string): GraphRecords {
  const filesIndex = resolve(knowledgeSourcesRoot(), "code_graph/indexes/files.jsonl");
  const functionsIndex = resolve(knowledgeSourcesRoot(), "code_graph/indexes/functions.jsonl");
  if (!existsSync(filesIndex) || !existsSync(functionsIndex)) {
    const missing = [reportPath, objdiffPath, filesIndex, functionsIndex].filter((path) => !existsSync(path));
    throw new Error(`Missing code graph inputs: ${missing.join(", ")}`);
  }

  const sourceVersionId = `source-version:code_graph:${shortHash(filesFingerprint([filesIndex, functionsIndex]))}`;
  const entities: GraphEntity[] = [];
  const facts: GraphFact[] = [];
  const edges: GraphEdge[] = [];
  const chunks: SearchChunk[] = [];
  const files = new Map<string, FileRecord>();
  const seenUnits = new Set<string>();
  const seenCompileEdges = new Set<string>();

  for (const row of readJsonl(filesIndex)) {
    const sourcePath = stringValue(row.source_path, stringValue(row.sourcePath));
    if (!sourcePath) continue;
    const file = getFile(files, sourcePath);
    file.declaredFunctionCount = numberValue(row.function_count, file.declaredFunctionCount ?? 0);
    file.declaredMatchedFunctionCount = numberValue(row.matched_function_count, file.declaredMatchedFunctionCount ?? 0);
    file.declaredUnmatchedFunctionCount = numberValue(row.unmatched_function_count, file.declaredUnmatchedFunctionCount ?? 0);
    for (const unit of arrayValue(row.units).map((value) => String(value)).filter(Boolean)) {
      file.units.add(unit);
      addUnitEntity(entities, seenUnits, unit, sourcePath);
      addCompileEdge(edges, seenCompileEdges, sourcePath, unit, sourceVersionId, filesIndex);
    }
  }

  for (const row of readJsonl(functionsIndex)) {
    const unit = stringValue(row.unit);
    const sourcePath = stringValue(row.sourcePath, stringValue(row.source_path));
    const symbol = stringValue(row.symbol);
    if (!sourcePath || !symbol) continue;
    const functionRecord: FunctionRecord = {
      unit,
      sourcePath,
      symbol,
      size: numberValue(row.size),
      fuzzy: numberValue(row.fuzzy, 100),
      address: formatAddress(row.address),
    };
    const file = getFile(files, sourcePath);
    if (unit) {
      file.units.add(unit);
      addUnitEntity(entities, seenUnits, unit, sourcePath);
      addCompileEdge(edges, seenCompileEdges, sourcePath, unit, sourceVersionId, functionsIndex);
    }
    file.functions.push(functionRecord);

    if (!unit) continue;
    const functionEntity = functionEntityId(unit, symbol);
    entities.push({
      id: functionEntity,
      entityType: "function",
      stableKey: `${unit}:${symbol}`,
      payload: { ...functionRecord },
    });
    facts.push({
      id: `fact:function_status:${shortHash(`${unit}:${symbol}`)}`,
      entityId: functionEntity,
      factType: "function_status",
      payload: { ...functionRecord },
      confidence: 1,
      trustTier: "canonical",
      evidenceRef: `${functionsIndex}#${unit}:${symbol}`,
      sourceVersionId,
    });
    edges.push(edge(unitEntityId(unit), "CONTAINS", functionEntity, sourceVersionId, `code_graph_index:${unit}:${symbol}`, 1));
  }

  addFileRecords(files, entities, facts, chunks, sourceVersionId, filesIndex);

  return {
    sourceVersion: {
      id: sourceVersionId,
      sourceId: "code_graph",
      contentHash: shortHash(stableJson({ files: filesFingerprint([filesIndex]), functions: filesFingerprint([functionsIndex]) })),
      sourcePaths: [filesIndex, functionsIndex],
    },
    entities,
    facts,
    edges,
    chunks,
  };
}

function objdiffSourceMap(objdiff: Record<string, unknown>): Map<string, string> {
  const byUnit = new Map<string, string>();
  for (const unitValue of arrayValue(objdiff.units)) {
    const unit = objectValue(unitValue);
    const metadata = objectValue(unit.metadata);
    const name = stringValue(unit.name);
    const sourcePath = stringValue(metadata.source_path);
    if (name && sourcePath) byUnit.set(name, sourcePath);
  }
  return byUnit;
}

function getFile(files: Map<string, FileRecord>, sourcePath: string): FileRecord {
  const existing = files.get(sourcePath);
  if (existing) return existing;
  const created: FileRecord = { sourcePath, units: new Set<string>(), functions: [] };
  files.set(sourcePath, created);
  return created;
}

function addUnitEntity(entities: GraphEntity[], seenUnits: Set<string>, unit: string, sourcePath: string): void {
  if (seenUnits.has(unit)) return;
  seenUnits.add(unit);
  entities.push({
    id: unitEntityId(unit),
    entityType: "object_unit",
    stableKey: unit,
    payload: { unit, source_path: sourcePath },
  });
}

function addCompileEdge(
  edges: GraphEdge[],
  seenCompileEdges: Set<string>,
  sourcePath: string,
  unit: string,
  sourceVersionId: string,
  evidenceRef: string,
): void {
  const key = `${sourcePath}:${unit}`;
  if (seenCompileEdges.has(key)) return;
  seenCompileEdges.add(key);
  edges.push(edge(fileEntityId(sourcePath), "COMPILES_TO", unitEntityId(unit), sourceVersionId, evidenceRef, 1));
}

function addFileRecords(
  files: Map<string, FileRecord>,
  entities: GraphEntity[],
  facts: GraphFact[],
  chunks: SearchChunk[],
  sourceVersionId: string,
  evidenceRef: string,
): void {
  for (const file of files.values()) {
    const unmatched = file.functions.filter((fn) => fn.fuzzy < 100);
    const matched = file.functions.filter((fn) => fn.fuzzy >= 100);
    const functionCount = file.functions.length || file.declaredFunctionCount || 0;
    const unmatchedCount = file.functions.length ? unmatched.length : file.declaredUnmatchedFunctionCount || 0;
    const matchedCount = file.functions.length ? matched.length : file.declaredMatchedFunctionCount || Math.max(0, functionCount - unmatchedCount);
    const editability =
      functionCount === 0
        ? { mode: "unknown", reason: "No functions were found for this source file in the code graph index." }
        : unmatchedCount === 0
          ? { mode: "read_only_complete", reason: "Every known function in this file is exact 100%; use as reference evidence only." }
          : { mode: "editable", reason: `${unmatchedCount} unmatched function(s) remain in this source file.` };
    const payload = {
      source_path: file.sourcePath,
      units: [...file.units].sort(),
      function_count: functionCount,
      unmatched_function_count: unmatchedCount,
      matched_function_count: matchedCount,
      editability,
    };
    entities.push({
      id: fileEntityId(file.sourcePath),
      entityType: "source_file",
      stableKey: file.sourcePath,
      payload,
    });
    facts.push({
      id: `fact:file_status:${shortHash(file.sourcePath)}`,
      entityId: fileEntityId(file.sourcePath),
      factType: "file_match_status",
      payload: {
        ...payload,
        unmatched_functions: unmatched.map((fn) => ({ symbol: fn.symbol, fuzzy: fn.fuzzy, size: fn.size, unit: fn.unit, address: fn.address })),
        functions: file.functions.map((fn) => ({ symbol: fn.symbol, fuzzy: fn.fuzzy, size: fn.size, unit: fn.unit, address: fn.address })),
      },
      confidence: 1,
      trustTier: "canonical",
      evidenceRef,
      sourceVersionId,
    });
    facts.push({
      id: `fact:editability:${shortHash(file.sourcePath)}`,
      entityId: fileEntityId(file.sourcePath),
      factType: "editability",
      payload: editability,
      confidence: 1,
      trustTier: "canonical",
      evidenceRef,
      sourceVersionId,
    });
    chunks.push({
      id: `chunk:code_graph:file:${shortHash(file.sourcePath)}`,
      sourceId: "code_graph",
      sourceVersionId,
      entityId: fileEntityId(file.sourcePath),
      title: `Code graph: ${file.sourcePath}`,
      text: `${file.sourcePath} ${[...file.units].join(" ")} ${file.functions.map((fn) => fn.symbol).join(" ")}`,
      evidenceRef,
      payload,
    });
  }
}

function formatAddress(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return `0x${value.toString(16).toUpperCase().padStart(8, "0")}`;
  if (typeof value === "string" && /^\d+$/.test(value)) return `0x${Number(value).toString(16).toUpperCase().padStart(8, "0")}`;
  return typeof value === "string" ? value : "";
}

export function fileEntityId(sourcePath: string): string {
  return `file:${sourcePath}`;
}

export function unitEntityId(unit: string): string {
  return `unit:${unit}`;
}

export function functionEntityId(unit: string, symbol: string): string {
  return `function:${unit}:${symbol}`;
}

function edge(from: string, type: string, to: string, sourceVersionId: string, evidenceRef: string, weight: number): GraphEdge {
  return {
    id: `edge:${type}:${shortHash(`${from}:${to}:${evidenceRef}`)}`,
    fromEntityId: from,
    edgeType: type,
    toEntityId: to,
    weight,
    evidenceRef,
    sourceVersionId,
  };
}

function writeJsonl(path: string, rows: Array<Record<string, unknown>>): void {
  mkdirSync(dirname(path), { recursive: true });
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(path, body ? `${body}\n` : "", "utf8");
}
