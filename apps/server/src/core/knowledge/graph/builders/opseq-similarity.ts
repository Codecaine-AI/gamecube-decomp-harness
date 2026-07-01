import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { codeGraphFunctionsIndexPath, projectRoot, projectSharedToolDataRoot } from "../../paths.js";
import type { GraphEdge, GraphFact, GraphRecords, SearchChunk } from "../types.js";
import { arrayValue, filesFingerprint, numberValue, objectValue, readJson, readJsonl, shortHash, stableJson, stringValue, truncate } from "../util.js";
import { functionEntityId } from "./code-graph.js";

export const OPSEQ_SIMILARITY_SOURCE_ID = "opseq_similarity";

const PROFILE_INDEX_FILES = ["opcode_sequences.jsonl", "opcode_fingerprints.jsonl", "function_shapes.jsonl", "functions.jsonl", "fingerprints.jsonl"] as const;
const NEIGHBOR_INDEX_FILES = ["opcode_neighbors.jsonl", "neighbors.jsonl"] as const;
const DEFAULT_MAX_ANALOGS_PER_FUNCTION = 12;
const SEARCH_ANALOG_LIMIT = 5;

export interface BuildOpseqSimilarityGraphRecordsOptions {
  indexesRoot?: string;
  maxAnalogsPerFunction?: number;
}

interface CurrentFunction {
  entityId: string;
  unit: string;
  symbol: string;
  sourcePath: string;
  address: string;
  fuzzy: number;
  status: string;
}

interface FunctionIndex {
  byEntityId: Map<string, CurrentFunction>;
  byUnitSymbol: Map<string, CurrentFunction>;
  bySourceSymbol: Map<string, CurrentFunction>;
  byAddress: Map<string, CurrentFunction>;
  bySymbol: Map<string, CurrentFunction[]>;
}

interface AnalogEvidence {
  left: CurrentFunction;
  right: CurrentFunction;
  score: number;
  exact: boolean;
  method: string;
  evidenceRef: string;
}

interface AnalogForFunction {
  source: CurrentFunction;
  analog: CurrentFunction;
  score: number;
  exact: boolean;
  evidenceRef: string;
  method: string;
}

export function buildOpseqSimilarityGraphRecords(
  repoRoot: string,
  options: BuildOpseqSimilarityGraphRecordsOptions = {},
): GraphRecords | null {
  const indexesRoot = options.indexesRoot ?? defaultOpseqIndexesRoot();
  const profilePaths = existingIndexPaths(indexesRoot, PROFILE_INDEX_FILES);
  const neighborPaths = existingIndexPaths(indexesRoot, NEIGHBOR_INDEX_FILES);
  const sourcePaths = [...profilePaths, ...neighborPaths];
  if (sourcePaths.length === 0 || neighborPaths.length === 0) return null;

  const functions = currentFunctionIndex(repoRootWithFunctionReport(repoRoot));
  if (functions.byEntityId.size === 0) return null;

  const profileAliases = profileFunctionAliases(profilePaths, functions);
  const pairEvidence = new Map<string, AnalogEvidence>();
  for (const path of neighborPaths) {
    for (const row of readJsonl(path)) {
      for (const evidence of analogEvidenceRows(row, path, functions, profileAliases)) {
        if (evidence.left.entityId === evidence.right.entityId) continue;
        const key = pairKey(evidence.left.entityId, evidence.right.entityId);
        const existing = pairEvidence.get(key);
        if (!existing || evidence.score > existing.score) pairEvidence.set(key, evidence);
      }
    }
  }
  if (pairEvidence.size === 0) return null;

  const maxAnalogs = Math.max(1, options.maxAnalogsPerFunction ?? DEFAULT_MAX_ANALOGS_PER_FUNCTION);
  const sourceVersionId = `source-version:${OPSEQ_SIMILARITY_SOURCE_ID}:${shortHash(filesFingerprint(sourcePaths))}`;
  const edges: GraphEdge[] = [];
  const analogsByFunction = new Map<string, AnalogForFunction[]>();

  for (const evidence of pairEvidence.values()) {
    edges.push(edge(evidence, sourceVersionId));
    addAnalog(analogsByFunction, {
      source: evidence.left,
      analog: evidence.right,
      score: evidence.score,
      exact: evidence.exact,
      evidenceRef: evidence.evidenceRef,
      method: evidence.method,
    });
    addAnalog(analogsByFunction, {
      source: evidence.right,
      analog: evidence.left,
      score: evidence.score,
      exact: evidence.exact,
      evidenceRef: evidence.evidenceRef,
      method: evidence.method,
    });
  }

  const facts: GraphFact[] = [];
  const chunks: SearchChunk[] = [];
  for (const [entityId, analogs] of analogsByFunction) {
    analogs.sort(compareAnalogs);
    const source = analogs[0]?.source;
    if (!source) continue;
    const topAnalogs = analogs.slice(0, maxAnalogs);
    const bestScore = topAnalogs[0]?.score ?? 0;
    const bestMatchedScore = analogs.filter((analog) => isMatchedFunction(analog.analog)).reduce((best, analog) => Math.max(best, analog.score), 0);
    const exactAnalogCount = analogs.filter((analog) => analog.exact).length;
    const matchedAnalogCount = analogs.filter((analog) => isMatchedFunction(analog.analog)).length;
    const payload = {
      source: functionPayload(source),
      analog_count: analogs.length,
      best_score: roundScore(bestScore),
      best_matched_score: roundScore(bestMatchedScore),
      exact_analog_count: exactAnalogCount,
      matched_analog_count: matchedAnalogCount,
      top_analogs: topAnalogs.map(analogPayload),
    };
    facts.push({
      id: `fact:opseq_analog_profile:${shortHash(entityId)}`,
      entityId,
      factType: "opseq_analog_profile",
      payload,
      confidence: Math.max(0.2, Math.min(1, bestScore || 0.5)),
      trustTier: "tool_evidence",
      evidenceRef: topAnalogs[0]?.evidenceRef ?? sourcePaths[0],
      sourceVersionId,
    });
    chunks.push({
      id: `chunk:${OPSEQ_SIMILARITY_SOURCE_ID}:${shortHash(entityId)}`,
      sourceId: OPSEQ_SIMILARITY_SOURCE_ID,
      sourceVersionId,
      entityId,
      title: `Opseq analogs: ${source.symbol}`,
      text: truncate(
        [
          source.symbol,
          source.sourcePath,
          "opcode sequence analogs",
          ...topAnalogs.slice(0, SEARCH_ANALOG_LIMIT).map((analog) => `${analog.analog.symbol} ${analog.analog.sourcePath} score ${roundScore(analog.score)}`),
        ].join(" "),
        1200,
      ),
      evidenceRef: topAnalogs[0]?.evidenceRef ?? sourcePaths[0],
      payload,
    });
  }

  return {
    sourceVersion: {
      id: sourceVersionId,
      sourceId: OPSEQ_SIMILARITY_SOURCE_ID,
      contentHash: shortHash(stableJson({ opseq: filesFingerprint(sourcePaths) })),
      sourcePaths,
    },
    entities: [],
    facts,
    edges,
    chunks,
  };
}

function defaultOpseqIndexesRoot(): string {
  return resolve(projectSharedToolDataRoot("melee"), "opseq/indexes");
}

function existingIndexPaths(root: string, names: readonly string[]): string[] {
  return names.map((name) => resolve(root, name)).filter((path) => existsSync(path));
}

function repoRootWithFunctionReport(repoRoot: string): string {
  const requested = resolve(repoRoot);
  if (existsSync(resolve(requested, "build/GALE01/report.json"))) return requested;
  const fallback = resolve(projectRoot("melee"), "checkout");
  if (fallback !== requested && existsSync(resolve(fallback, "build/GALE01/report.json"))) return fallback;
  return requested;
}

function currentFunctionIndex(repoRoot: string): FunctionIndex {
  const index = emptyFunctionIndex();
  const reportPath = resolve(repoRoot, "build/GALE01/report.json");
  if (existsSync(reportPath)) {
    const report = readJson(reportPath);
    for (const unitValue of arrayValue(report.units)) {
      const unit = objectValue(unitValue);
      const unitName = stringValue(unit.name);
      const metadata = objectValue(unit.metadata);
      const sourcePath = stringValue(metadata.source_path, stringValue(metadata.sourcePath));
      for (const fnValue of arrayValue(unit.functions)) {
        const fn = objectValue(fnValue);
        const symbol = stringValue(fn.name, stringValue(fn.symbol));
        if (!unitName || !symbol) continue;
        const fnMetadata = objectValue(fn.metadata);
        addCurrentFunction(index, {
          unit: unitName,
          symbol,
          sourcePath,
          address: formatAddress(fnMetadata.virtual_address ?? fnMetadata.address ?? fn.address),
          fuzzy: numberValue(fn.fuzzy_match_percent, numberValue(fn.fuzzy, 100)),
          status: numberValue(fn.fuzzy_match_percent, numberValue(fn.fuzzy, 100)) >= 100 ? "matched" : "unmatched",
          entityId: functionEntityId(unitName, symbol),
        });
      }
    }
    return index;
  }

  const functionsIndex = codeGraphFunctionsIndexPath();
  for (const row of readJsonl(functionsIndex)) {
    const unit = stringValue(row.unit);
    const symbol = stringValue(row.symbol, stringValue(row.name));
    if (!unit || !symbol) continue;
    const fuzzy = numberValue(row.fuzzy, numberValue(row.fuzzy_match_percent, 100));
    addCurrentFunction(index, {
      unit,
      symbol,
      sourcePath: stringValue(row.sourcePath, stringValue(row.source_path)),
      address: formatAddress(row.address ?? row.virtual_address),
      fuzzy,
      status: stringValue(row.status, fuzzy >= 100 ? "matched" : "unmatched"),
      entityId: functionEntityId(unit, symbol),
    });
  }
  return index;
}

function emptyFunctionIndex(): FunctionIndex {
  return {
    byEntityId: new Map(),
    byUnitSymbol: new Map(),
    bySourceSymbol: new Map(),
    byAddress: new Map(),
    bySymbol: new Map(),
  };
}

function addCurrentFunction(index: FunctionIndex, fn: CurrentFunction): void {
  index.byEntityId.set(fn.entityId, fn);
  index.byUnitSymbol.set(functionKey(fn.unit, fn.symbol), fn);
  if (fn.sourcePath) index.bySourceSymbol.set(functionKey(fn.sourcePath, fn.symbol), fn);
  if (fn.address) index.byAddress.set(normalizeAddress(fn.address), fn);
  const symbols = index.bySymbol.get(fn.symbol) ?? [];
  symbols.push(fn);
  index.bySymbol.set(fn.symbol, symbols);
}

function profileFunctionAliases(paths: string[], functions: FunctionIndex): Map<string, CurrentFunction> {
  const aliases = new Map<string, CurrentFunction>();
  for (const path of paths) {
    for (const row of readJsonl(path)) {
      const fn = resolveFunctionRef(row, functions, aliases) ?? resolveFunctionRef(objectValue(row.payload), functions, aliases);
      if (!fn) continue;
      const ids = [row.id, row.function_id, row.fingerprint_id, row.sequence_id, objectValue(row.payload).id];
      for (const id of ids) {
        const key = stringValue(id);
        if (key) aliases.set(key, fn);
      }
    }
  }
  return aliases;
}

function analogEvidenceRows(
  row: Record<string, unknown>,
  path: string,
  functions: FunctionIndex,
  profileAliases: Map<string, CurrentFunction>,
): AnalogEvidence[] {
  const nestedNeighbors = arrayValue(row.neighbors).map(objectValue).filter((value) => Object.keys(value).length > 0);
  if (nestedNeighbors.length > 0) {
    const base =
      resolveFirstRef(row, ["source", "from", "left", "query", "function", "base"], functions, profileAliases) ??
      resolveFunctionRef(row, functions, profileAliases);
    if (!base) return [];
    return nestedNeighbors
      .map((neighbor) => {
        const analog =
          resolveFirstRef(neighbor, ["target", "to", "right", "neighbor", "analog", "match", "function"], functions, profileAliases) ??
          resolveFunctionRef(neighbor, functions, profileAliases);
        return analog ? evidenceFromRows(base, analog, row, neighbor, path) : null;
      })
      .filter((value): value is AnalogEvidence => Boolean(value));
  }

  const left =
    resolveFirstRef(row, ["source", "from", "left", "a", "query", "function"], functions, profileAliases) ??
    resolveFunctionRef(row, functions, profileAliases);
  const right = resolveFirstRef(row, ["target", "to", "right", "b", "neighbor", "analog", "match"], functions, profileAliases);
  if (!left || !right) return [];
  return [evidenceFromRows(left, right, row, row, path)];
}

function evidenceFromRows(
  left: CurrentFunction,
  right: CurrentFunction,
  row: Record<string, unknown>,
  detail: Record<string, unknown>,
  path: string,
): AnalogEvidence {
  const score = analogScore(row, detail);
  return {
    left,
    right,
    score,
    exact: exactAnalog(row, detail, score),
    method: stringValue(detail.method, stringValue(row.method, stringValue(detail.kind, stringValue(row.kind, "opcode_sequence")))),
    evidenceRef: stringValue(detail.evidence_ref, stringValue(detail.evidenceRef, stringValue(row.evidence_ref, stringValue(row.evidenceRef, path)))),
  };
}

function resolveFirstRef(
  row: Record<string, unknown>,
  prefixes: string[],
  functions: FunctionIndex,
  profileAliases: Map<string, CurrentFunction>,
): CurrentFunction | null {
  for (const prefix of prefixes) {
    const nested = row[prefix];
    if (nested !== undefined) {
      const resolved = resolveFunctionRef(nested, functions, profileAliases);
      if (resolved) return resolved;
    }
    const prefixed = prefixedRef(row, prefix);
    if (prefixed) {
      const resolved = resolveFunctionRef(prefixed, functions, profileAliases);
      if (resolved) return resolved;
    }
  }
  return null;
}

function prefixedRef(row: Record<string, unknown>, prefix: string): Record<string, unknown> | null {
  const aliases = prefix === "target" ? ["target", "dst"] : [prefix];
  const ref: Record<string, unknown> = {};
  for (const alias of aliases) {
    for (const [field, key] of [
      ["id", `${alias}_id`],
      ["entity_id", `${alias}_entity_id`],
      ["function_entity_id", `${alias}_function_entity_id`],
      ["unit", `${alias}_unit`],
      ["symbol", `${alias}_symbol`],
      ["symbol", `${alias}_name`],
      ["source_path", `${alias}_source_path`],
      ["source_path", `${alias}_sourcePath`],
      ["address", `${alias}_address`],
    ] as const) {
      if (row[key] !== undefined) ref[field] = row[key];
    }
  }
  return Object.keys(ref).length > 0 ? ref : null;
}

function resolveFunctionRef(
  value: unknown,
  functions: FunctionIndex,
  profileAliases: Map<string, CurrentFunction>,
): CurrentFunction | null {
  if (typeof value === "string") {
    const alias = profileAliases.get(value);
    if (alias) return alias;
    const parsed = parseUnitSymbolId(value);
    if (parsed) return functions.byUnitSymbol.get(functionKey(parsed.unit, parsed.symbol)) ?? null;
    if (value.startsWith("function:")) return functions.byEntityId.get(value) ?? null;
    const byAddress = functions.byAddress.get(normalizeAddress(value));
    if (byAddress) return byAddress;
    const bySymbol = functions.bySymbol.get(value);
    return bySymbol && bySymbol.length === 1 ? bySymbol[0] : null;
  }

  const row = objectValue(value);
  if (Object.keys(row).length === 0) return null;
  const entityId = stringValue(row.entity_id, stringValue(row.function_entity_id));
  if (entityId && functions.byEntityId.has(entityId)) return functions.byEntityId.get(entityId) ?? null;

  const id = stringValue(row.id, stringValue(row.function_id, stringValue(row.fingerprint_id, stringValue(row.sequence_id))));
  if (id) {
    const alias = profileAliases.get(id);
    if (alias) return alias;
    if (id.startsWith("function:") && functions.byEntityId.has(id)) return functions.byEntityId.get(id) ?? null;
    const parsed = parseUnitSymbolId(id);
    if (parsed) {
      const fn = functions.byUnitSymbol.get(functionKey(parsed.unit, parsed.symbol));
      if (fn) return fn;
    }
  }

  const unit = stringValue(row.unit, stringValue(row.object_unit));
  const symbol = stringValue(row.symbol, stringValue(row.name, stringValue(row.function, stringValue(row.function_name))));
  if (unit && symbol) {
    const byUnitSymbol = functions.byUnitSymbol.get(functionKey(unit, symbol));
    if (byUnitSymbol) return byUnitSymbol;
  }
  const sourcePath = stringValue(row.source_path, stringValue(row.sourcePath));
  if (sourcePath && symbol) {
    const bySourceSymbol = functions.bySourceSymbol.get(functionKey(sourcePath, symbol));
    if (bySourceSymbol) return bySourceSymbol;
  }
  const address = normalizeAddress(formatAddress(row.address ?? row.virtual_address ?? row.function_address));
  if (address) {
    const byAddress = functions.byAddress.get(address);
    if (byAddress) return byAddress;
  }
  if (symbol) {
    const bySymbol = functions.bySymbol.get(symbol);
    if (bySymbol && bySymbol.length === 1) return bySymbol[0];
  }
  return resolveFunctionRef(row.payload, functions, profileAliases);
}

function parseUnitSymbolId(value: string): { unit: string; symbol: string } | null {
  const normalized = value.replace(/^(?:function_shape|opcode_sequence|fingerprint|function):/, "");
  const separator = normalized.lastIndexOf(":");
  if (separator <= 0 || separator >= normalized.length - 1) return null;
  return {
    unit: normalized.slice(0, separator),
    symbol: normalized.slice(separator + 1),
  };
}

function analogScore(row: Record<string, unknown>, detail: Record<string, unknown>): number {
  for (const value of [
    detail.score,
    detail.similarity,
    detail.opseq_score,
    detail.jaccard,
    detail.weight,
    row.score,
    row.similarity,
    row.opseq_score,
    row.jaccard,
    row.weight,
  ]) {
    const parsed = normalizedScore(value);
    if (parsed !== null) return parsed;
  }
  const distance = numberValue(detail.distance, numberValue(row.distance, Number.NaN));
  if (Number.isFinite(distance) && distance >= 0) return roundScore(1 / (1 + distance));
  return 0.5;
}

function normalizedScore(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = numberValue(value, Number.NaN);
  if (!Number.isFinite(parsed)) return null;
  if (parsed > 1 && parsed <= 100) return roundScore(parsed / 100);
  return roundScore(Math.max(0, Math.min(1, parsed)));
}

function exactAnalog(row: Record<string, unknown>, detail: Record<string, unknown>, score: number): boolean {
  for (const value of [detail.exact, detail.exact_match, detail.is_exact, row.exact, row.exact_match, row.is_exact]) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string" && /^(?:true|yes|1)$/i.test(value)) return true;
  }
  const kind = `${stringValue(detail.match_kind, stringValue(row.match_kind))} ${stringValue(detail.kind, stringValue(row.kind))}`;
  return /\b(?:exact|identical|duplicate)\b/i.test(kind) || score >= 0.999;
}

function addAnalog(analogsByFunction: Map<string, AnalogForFunction[]>, analog: AnalogForFunction): void {
  const values = analogsByFunction.get(analog.source.entityId) ?? [];
  values.push(analog);
  analogsByFunction.set(analog.source.entityId, values);
}

function compareAnalogs(left: AnalogForFunction, right: AnalogForFunction): number {
  return (
    right.score - left.score ||
    Number(right.exact) - Number(left.exact) ||
    Number(isMatchedFunction(right.analog)) - Number(isMatchedFunction(left.analog)) ||
    left.analog.symbol.localeCompare(right.analog.symbol)
  );
}

function analogPayload(analog: AnalogForFunction): Record<string, unknown> {
  return {
    ...functionPayload(analog.analog),
    score: roundScore(analog.score),
    exact_match: analog.exact,
    matched: isMatchedFunction(analog.analog),
    method: analog.method,
    evidence_ref: analog.evidenceRef,
  };
}

function functionPayload(fn: CurrentFunction): Record<string, unknown> {
  return {
    entity_id: fn.entityId,
    unit: fn.unit,
    source_path: fn.sourcePath,
    symbol: fn.symbol,
    address: fn.address,
    fuzzy: fn.fuzzy,
    status: fn.status,
  };
}

function isMatchedFunction(fn: CurrentFunction): boolean {
  return fn.status === "matched" || fn.fuzzy >= 100;
}

function edge(evidence: AnalogEvidence, sourceVersionId: string): GraphEdge {
  const [fromEntityId, toEntityId] = [evidence.left.entityId, evidence.right.entityId].sort();
  return {
    id: `edge:ANALOGOUS_TO:${shortHash(`${fromEntityId}:${toEntityId}:opseq`)}`,
    fromEntityId,
    edgeType: "ANALOGOUS_TO",
    toEntityId,
    weight: roundScore(evidence.score),
    evidenceRef: evidence.evidenceRef,
    sourceVersionId,
    status: "accepted",
  };
}

function pairKey(left: string, right: string): string {
  return [left, right].sort().join("\u0000");
}

function functionKey(left: string, right: string): string {
  return `${left}\u0000${right}`;
}

function formatAddress(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return `0x${value.toString(16).toUpperCase().padStart(8, "0")}`;
  if (typeof value === "string" && /^\d+$/.test(value)) return `0x${Number(value).toString(16).toUpperCase().padStart(8, "0")}`;
  return typeof value === "string" ? value : "";
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function roundScore(value: number): number {
  return Number(value.toFixed(4));
}
