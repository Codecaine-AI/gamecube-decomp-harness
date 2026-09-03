import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { gameRoot, gameSharedToolDataRoot } from "../../paths.js";
import type { GraphEdge, GraphFact, GraphRecords, SearchChunk } from "../types.js";
import {
  arrayValue,
  filesFingerprint,
  numberValue,
  objectValue,
  readJson,
  readJsonl,
  shortHash,
  stableJson,
  stringValue,
  truncate,
} from "../util.js";
import { functionEntityId } from "./code-graph.js";

export const GHIDRA_XREFS_SOURCE_ID = "ghidra_xrefs";

const MAX_PROFILE_REFS = 16;

export interface BuildGhidraXrefGraphRecordsOptions {
  indexesRoot?: string;
  maxRefsPerFunction?: number;
  reportRelPath?: string;
  gameId?: string;
}

interface CurrentFunction {
  entityId: string;
  unit: string;
  symbol: string;
  sourcePath: string;
  address: string;
  startAddress: number | null;
  endAddress: number | null;
  fuzzy: number;
  status: string;
}

interface FunctionIndex {
  bySymbol: Map<string, CurrentFunction[]>;
  byAddress: Map<number, CurrentFunction>;
  ranges: CurrentFunction[];
}

interface XrefObservation {
  id: string;
  fromAddress: string;
  toAddress: string;
  fromSymbol: string;
  toSymbol: string;
  refType: string;
  isCall: boolean;
  isData: boolean;
  text: string;
  evidenceRef: string;
  source: CurrentFunction;
  target: CurrentFunction | null;
}

interface XrefSummary {
  symbol: string;
  address: string;
  ref_type: string;
  resolved: boolean;
  unit?: string;
  source_path?: string;
  evidence_ref: string;
}

export function buildGhidraXrefGraphRecords(
  repoRoot: string,
  options: BuildGhidraXrefGraphRecordsOptions = {},
): GraphRecords | null {
  const indexesRoot = options.indexesRoot ?? resolve(gameSharedToolDataRoot(options.gameId), "ghidra/indexes");
  const xrefsPath = resolve(indexesRoot, "xrefs.jsonl");
  if (!existsSync(xrefsPath)) return null;

  const functions = currentFunctionIndex(repoRootWithFunctionReport(repoRoot, options.reportRelPath, options.gameId), options.reportRelPath);
  if (functions.ranges.length === 0) return null;

  const observations = xrefObservations(xrefsPath, functions);
  const sourceVersionId = `source-version:${GHIDRA_XREFS_SOURCE_ID}:${shortHash(filesFingerprint([xrefsPath]))}`;
  const maxRefs = Math.min(MAX_PROFILE_REFS, Math.max(1, options.maxRefsPerFunction ?? MAX_PROFILE_REFS));
  const bySource = new Map<string, XrefObservation[]>();
  for (const observation of observations) {
    const current = bySource.get(observation.source.entityId) ?? [];
    current.push(observation);
    bySource.set(observation.source.entityId, current);
  }

  const facts: GraphFact[] = [];
  const chunks: SearchChunk[] = [];
  for (const [entityId, xrefs] of [...bySource.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const source = xrefs[0].source;
    const calls = xrefs.filter((xref) => xref.isCall);
    const dataRefs = xrefs.filter((xref) => xref.isData);
    const otherRefs = xrefs.filter((xref) => !xref.isCall && !xref.isData);
    const payload = {
      source: functionPayload(source),
      xref_count: xrefs.length,
      call_count: calls.length,
      data_ref_count: dataRefs.length,
      other_ref_count: otherRefs.length,
      resolved_target_count: xrefs.filter((xref) => xref.target).length,
      top_calls: calls.slice(0, maxRefs).map(xrefSummary),
      top_data_refs: dataRefs.slice(0, maxRefs).map(xrefSummary),
      top_other_refs: otherRefs.slice(0, maxRefs).map(xrefSummary),
    };
    const evidenceRef = xrefs[0].evidenceRef;
    facts.push({
      id: `fact:${GHIDRA_XREFS_SOURCE_ID}:${shortHash(entityId)}`,
      entityId,
      factType: "ghidra_xref_profile",
      payload,
      confidence: 0.85,
      trustTier: "tool_evidence",
      evidenceRef,
      sourceVersionId,
    });
    chunks.push({
      id: `chunk:${GHIDRA_XREFS_SOURCE_ID}:${shortHash(entityId)}`,
      sourceId: GHIDRA_XREFS_SOURCE_ID,
      sourceVersionId,
      entityId,
      title: `Ghidra xrefs: ${source.symbol}`,
      text: truncate(
        [
          source.symbol,
          source.sourcePath,
          `calls: ${calls.slice(0, maxRefs).map(targetLabel).join(" ")}`,
          `data refs: ${dataRefs.slice(0, maxRefs).map(targetLabel).join(" ")}`,
          `other refs: ${otherRefs.slice(0, maxRefs).map(targetLabel).join(" ")}`,
        ].join(" "),
        1600,
      ),
      evidenceRef,
      payload,
    });
  }

  return {
    sourceVersion: {
      id: sourceVersionId,
      sourceId: GHIDRA_XREFS_SOURCE_ID,
      contentHash: shortHash(stableJson({ ghidra_xrefs: filesFingerprint([xrefsPath]) })),
      sourcePaths: [xrefsPath],
    },
    entities: [],
    facts,
    edges: graphEdges(observations, sourceVersionId),
    chunks,
  };
}

function repoRootWithFunctionReport(repoRoot: string, reportRelPath = "build/GALE01/report.json", gameId?: string): string {
  const requested = resolve(repoRoot);
  if (existsSync(resolve(requested, reportRelPath))) return requested;
  const fallback = resolve(gameRoot(gameId), "checkout");
  if (fallback !== requested && existsSync(resolve(fallback, reportRelPath))) return fallback;
  return requested;
}

function currentFunctionIndex(repoRoot: string, reportRelPath = "build/GALE01/report.json"): FunctionIndex {
  const index: FunctionIndex = { bySymbol: new Map(), byAddress: new Map(), ranges: [] };
  const reportPath = resolve(repoRoot, reportRelPath);
  if (!existsSync(reportPath)) return index;

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
      const startAddress = parseAddress(fnMetadata.virtual_address ?? fnMetadata.address ?? fn.address);
      const size = Math.max(0, numberValue(fn.size, numberValue(fnMetadata.size)));
      const fuzzy = numberValue(fn.fuzzy_match_percent, numberValue(fn.fuzzy, 100));
      const current: CurrentFunction = {
        entityId: functionEntityId(unitName, symbol),
        unit: unitName,
        symbol,
        sourcePath,
        address: formatAddress(startAddress),
        startAddress,
        endAddress: startAddress === null ? null : startAddress + Math.max(1, size),
        fuzzy,
        status: fuzzy >= 100 ? "matched" : "unmatched",
      };
      const sameSymbol = index.bySymbol.get(symbol) ?? [];
      sameSymbol.push(current);
      index.bySymbol.set(symbol, sameSymbol);
      if (startAddress !== null) index.byAddress.set(startAddress, current);
      index.ranges.push(current);
    }
  }
  index.ranges.sort((left, right) => (left.startAddress ?? Number.MAX_SAFE_INTEGER) - (right.startAddress ?? Number.MAX_SAFE_INTEGER));
  return index;
}

function xrefObservations(path: string, functions: FunctionIndex): XrefObservation[] {
  const observations: XrefObservation[] = [];
  for (const row of readJsonl(path)) {
    const fromAddress = stringValue(row.from_address);
    const toAddress = stringValue(row.to_address);
    const fromSymbol = stringValue(row.from_symbol);
    const toSymbol = stringValue(row.to_symbol);
    const source = resolveFunction(fromSymbol, fromAddress, functions, true);
    if (!source) continue;
    const id = stringValue(row.id, `xref:${fromAddress}:${toAddress}`);
    observations.push({
      id,
      fromAddress,
      toAddress,
      fromSymbol,
      toSymbol,
      refType: stringValue(row.ref_type, "UNKNOWN"),
      isCall: row.is_call === true,
      isData: row.is_data === true,
      text: stringValue(row.text),
      evidenceRef: stringValue(row.evidence_ref, `${path}#${id}`),
      source,
      target: resolveFunction(toSymbol, toAddress, functions, false),
    });
  }
  return observations.sort((left, right) => left.source.entityId.localeCompare(right.source.entityId) || left.id.localeCompare(right.id));
}

function resolveFunction(symbol: string, address: string, functions: FunctionIndex, containing: boolean): CurrentFunction | null {
  const symbolMatches = symbol ? functions.bySymbol.get(symbol) : undefined;
  if (symbolMatches?.length === 1) return symbolMatches[0];
  const numericAddress = parseAddress(address);
  if (numericAddress === null) return null;
  const exact = functions.byAddress.get(numericAddress);
  if (exact) return exact;
  if (!containing) return null;
  return functions.ranges.find((fn) => fn.startAddress !== null && fn.endAddress !== null && numericAddress >= fn.startAddress && numericAddress < fn.endAddress) ?? null;
}

function graphEdges(observations: XrefObservation[], sourceVersionId: string): GraphEdge[] {
  return observations.flatMap((observation) => {
    if (!observation.target || (!observation.isCall && !observation.isData)) return [];
    const edgeType = observation.isCall ? "CALLS" : "REFERENCES_DATA";
    return [{
      id: `edge:${GHIDRA_XREFS_SOURCE_ID}:${edgeType}:${shortHash(`${observation.id}:${observation.source.entityId}:${observation.target.entityId}`)}`,
      fromEntityId: observation.source.entityId,
      edgeType,
      toEntityId: observation.target.entityId,
      weight: 0.75,
      evidenceRef: observation.evidenceRef,
      sourceVersionId,
      status: "accepted",
    } satisfies GraphEdge];
  });
}

function xrefSummary(xref: XrefObservation): XrefSummary {
  return {
    symbol: targetLabel(xref),
    address: xref.toAddress,
    ref_type: xref.refType,
    resolved: Boolean(xref.target),
    ...(xref.target ? { unit: xref.target.unit, source_path: xref.target.sourcePath } : {}),
    evidence_ref: xref.evidenceRef,
  };
}

function targetLabel(xref: XrefObservation): string {
  return xref.toSymbol || xref.toAddress || "unknown";
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

function parseAddress(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number.parseInt(value, value.trim().toLowerCase().startsWith("0x") ? 16 : 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAddress(value: number | null): string {
  return value === null ? "" : `0x${value.toString(16).toUpperCase().padStart(8, "0")}`;
}
