import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { projectRoot, projectSharedToolDataRoot } from "../../paths.js";
import type { GraphEdge, GraphFact, GraphRecords, SearchChunk } from "../types.js";
import { arrayValue, filesFingerprint, numberValue, objectValue, readJson, readJsonl, shortHash, stableJson, stringValue, truncate } from "../util.js";
import { functionEntityId } from "./code-graph.js";

export const CALL_GRAPH_SOURCE_ID = "call_graph";

const DEFAULT_MAX_PEERS_PER_FUNCTION = 12;
const MAX_PROFILE_PEERS = 12;

export interface BuildCallGraphEdgeRecordsOptions {
  indexesRoot?: string;
  maxPeersPerFunction?: number;
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
  bySymbol: Map<string, CurrentFunction[]>;
}

interface CallObservation {
  caller: CurrentFunction;
  calleeSymbol: string;
  callee: CurrentFunction | null;
  count: number;
  evidenceRef: string;
}

interface DataRefObservation {
  caller: CurrentFunction;
  refSymbol: string;
  refKind: string;
  target: CurrentFunction | null;
  count: number;
  evidenceRef: string;
}

interface PeerSummary {
  symbol: string;
  unit?: string;
  source_path?: string;
  count: number;
  resolved: boolean;
}

interface DataRefSummary {
  symbol: string;
  ref_kind: string;
  count: number;
}

interface EdgeEvidence {
  fromEntityId: string;
  toEntityId: string;
  count: number;
  evidenceRef: string;
}

export function buildCallGraphEdgeRecords(
  repoRoot: string,
  options: BuildCallGraphEdgeRecordsOptions = {},
): GraphRecords | null {
  const indexesRoot = options.indexesRoot ?? defaultCallGraphIndexesRoot();
  const callsPath = resolve(indexesRoot, "calls.jsonl");
  if (!existsSync(callsPath)) return null;
  const dataRefsPath = resolve(indexesRoot, "data_refs.jsonl");
  const sourcePaths = [callsPath, ...(existsSync(dataRefsPath) ? [dataRefsPath] : [])];

  const functions = currentFunctionIndex(repoRootWithFunctionReport(repoRoot));
  if (functions.byEntityId.size === 0) return null;

  const calls = callObservations(callsPath, functions);
  const dataRefs = existsSync(dataRefsPath) ? dataRefObservations(dataRefsPath, functions) : [];
  const sourceVersionId = `source-version:${CALL_GRAPH_SOURCE_ID}:${shortHash(filesFingerprint(sourcePaths))}`;
  const maxPeers = Math.min(MAX_PROFILE_PEERS, Math.max(1, options.maxPeersPerFunction ?? DEFAULT_MAX_PEERS_PER_FUNCTION));

  const outgoingCalls = groupByCaller(calls);
  const incomingCalls = groupByCallee(calls);
  const refsByCaller = groupDataRefsByCaller(dataRefs);
  const profileFunctions = new Map<string, CurrentFunction>();
  for (const observation of calls) profileFunctions.set(observation.caller.entityId, observation.caller);
  for (const observation of dataRefs) profileFunctions.set(observation.caller.entityId, observation.caller);

  const edges = buildEdges(calls, dataRefs, sourceVersionId);
  const facts: GraphFact[] = [];
  const chunks: SearchChunk[] = [];
  for (const source of [...profileFunctions.values()].sort(compareFunctions)) {
    const callees = summarizeCallees(outgoingCalls.get(source.entityId) ?? []);
    const callers = summarizeCallers(incomingCalls.get(source.entityId) ?? []);
    const refs = summarizeDataRefs(refsByCaller.get(source.entityId) ?? []);
    const topCallees = callees.slice(0, maxPeers);
    const topCallers = callers.slice(0, maxPeers);
    const topDataRefs = refs.slice(0, maxPeers);
    const evidenceRef = profileEvidenceRef(
      outgoingCalls.get(source.entityId) ?? [],
      incomingCalls.get(source.entityId) ?? [],
      refsByCaller.get(source.entityId) ?? [],
      callsPath,
    );
    const payload = {
      source: functionPayload(source),
      callee_count: callees.length,
      caller_count: callers.length,
      data_ref_count: refs.length,
      unresolved_callee_count: callees.filter((callee) => !callee.resolved).length,
      top_callees: topCallees,
      top_callers: topCallers,
      top_data_refs: topDataRefs,
    };
    facts.push({
      id: `fact:call_graph_profile:${shortHash(source.entityId)}`,
      entityId: source.entityId,
      factType: "call_graph_profile",
      payload,
      confidence: 0.9,
      trustTier: "tool_evidence",
      evidenceRef,
      sourceVersionId,
    });
    chunks.push({
      id: `chunk:${CALL_GRAPH_SOURCE_ID}:${shortHash(source.entityId)}`,
      sourceId: CALL_GRAPH_SOURCE_ID,
      sourceVersionId,
      entityId: source.entityId,
      title: `Call graph: ${source.symbol}`,
      text: truncate(
        [
          source.symbol,
          source.sourcePath,
          `calls: ${topCallees.map((callee) => callee.symbol).join(" ")}`,
          `called by: ${topCallers.map((caller) => caller.symbol).join(" ")}`,
          `data refs: ${topDataRefs.map((ref) => ref.symbol).join(" ")}`,
        ].join(" "),
        1200,
      ),
      evidenceRef,
      payload,
    });
  }

  return {
    sourceVersion: {
      id: sourceVersionId,
      sourceId: CALL_GRAPH_SOURCE_ID,
      contentHash: shortHash(stableJson({ call_graph: filesFingerprint(sourcePaths) })),
      sourcePaths,
    },
    entities: [],
    facts,
    edges,
    chunks,
  };
}

function defaultCallGraphIndexesRoot(): string {
  return resolve(projectSharedToolDataRoot("melee"), "callgraph/indexes");
}

function repoRootWithFunctionReport(repoRoot: string): string {
  const requested = resolve(repoRoot);
  if (existsSync(resolve(requested, "build/GALE01/report.json"))) return requested;
  const fallback = resolve(projectRoot("melee"), "checkout");
  if (fallback !== requested && existsSync(resolve(fallback, "build/GALE01/report.json"))) return fallback;
  return requested;
}

function currentFunctionIndex(repoRoot: string): FunctionIndex {
  const index: FunctionIndex = {
    byEntityId: new Map(),
    byUnitSymbol: new Map(),
    bySymbol: new Map(),
  };
  const reportPath = resolve(repoRoot, "build/GALE01/report.json");
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
      const fuzzy = numberValue(fn.fuzzy_match_percent, numberValue(fn.fuzzy, 100));
      const current: CurrentFunction = {
        entityId: functionEntityId(unitName, symbol),
        unit: unitName,
        symbol,
        sourcePath,
        address: formatAddress(fnMetadata.virtual_address ?? fnMetadata.address ?? fn.address),
        fuzzy,
        status: fuzzy >= 100 ? "matched" : "unmatched",
      };
      index.byEntityId.set(current.entityId, current);
      index.byUnitSymbol.set(functionKey(unitName, symbol), current);
      const sameSymbol = index.bySymbol.get(symbol) ?? [];
      sameSymbol.push(current);
      index.bySymbol.set(symbol, sameSymbol);
    }
  }
  return index;
}

function callObservations(path: string, functions: FunctionIndex): CallObservation[] {
  const observations: CallObservation[] = [];
  for (const row of readJsonl(path)) {
    const payload = objectValue(row.payload);
    const unit = stringValue(row.unit, stringValue(payload.unit));
    const symbol = stringValue(row.symbol, stringValue(payload.symbol));
    const calleeSymbol = stringValue(row.callee_symbol, stringValue(payload.callee_symbol));
    const caller = unit && symbol ? functions.byUnitSymbol.get(functionKey(unit, symbol)) : undefined;
    if (!caller || !calleeSymbol) continue;
    observations.push({
      caller,
      calleeSymbol,
      callee: resolveUniqueSymbol(calleeSymbol, functions),
      count: numberValue(row.count, numberValue(payload.count, 1)),
      evidenceRef: stringValue(row.evidence_ref, stringValue(row.evidenceRef, stringValue(payload.evidence_ref, path))),
    });
  }
  return observations;
}

function dataRefObservations(path: string, functions: FunctionIndex): DataRefObservation[] {
  const observations: DataRefObservation[] = [];
  for (const row of readJsonl(path)) {
    const payload = objectValue(row.payload);
    const unit = stringValue(row.unit, stringValue(payload.unit));
    const symbol = stringValue(row.symbol, stringValue(payload.symbol));
    const refSymbol = stringValue(row.ref_symbol, stringValue(payload.ref_symbol));
    const caller = unit && symbol ? functions.byUnitSymbol.get(functionKey(unit, symbol)) : undefined;
    if (!caller || !refSymbol) continue;
    observations.push({
      caller,
      refSymbol,
      refKind: stringValue(row.ref_kind, stringValue(payload.ref_kind, "data")),
      target: resolveUniqueSymbol(refSymbol, functions),
      count: numberValue(row.count, numberValue(payload.count, 1)),
      evidenceRef: stringValue(row.evidence_ref, stringValue(row.evidenceRef, stringValue(payload.evidence_ref, path))),
    });
  }
  return observations;
}

function resolveUniqueSymbol(symbol: string, functions: FunctionIndex): CurrentFunction | null {
  const matches = functions.bySymbol.get(symbol);
  return matches?.length === 1 ? matches[0] : null;
}

function groupByCaller(calls: CallObservation[]): Map<string, CallObservation[]> {
  const grouped = new Map<string, CallObservation[]>();
  for (const call of calls) addGrouped(grouped, call.caller.entityId, call);
  return grouped;
}

function groupByCallee(calls: CallObservation[]): Map<string, CallObservation[]> {
  const grouped = new Map<string, CallObservation[]>();
  for (const call of calls) {
    if (call.callee) addGrouped(grouped, call.callee.entityId, call);
  }
  return grouped;
}

function groupDataRefsByCaller(refs: DataRefObservation[]): Map<string, DataRefObservation[]> {
  const grouped = new Map<string, DataRefObservation[]>();
  for (const ref of refs) addGrouped(grouped, ref.caller.entityId, ref);
  return grouped;
}

function addGrouped<T>(grouped: Map<string, T[]>, key: string, value: T): void {
  const values = grouped.get(key) ?? [];
  values.push(value);
  grouped.set(key, values);
}

function buildEdges(calls: CallObservation[], refs: DataRefObservation[], sourceVersionId: string): GraphEdge[] {
  const callEdges = new Map<string, EdgeEvidence>();
  for (const call of calls) {
    if (!call.callee) continue;
    addEdgeEvidence(callEdges, call.caller.entityId, call.callee.entityId, call.count, call.evidenceRef);
  }
  const dataRefEdges = new Map<string, EdgeEvidence>();
  for (const ref of refs) {
    if (ref.refKind !== "function_pointer" || !ref.target) continue;
    addEdgeEvidence(dataRefEdges, ref.caller.entityId, ref.target.entityId, ref.count, ref.evidenceRef);
  }
  return [
    ...[...callEdges.values()].map((evidence) => graphEdge("CALLS", evidence, sourceVersionId)),
    ...[...dataRefEdges.values()].map((evidence) => graphEdge("REFERENCES_DATA", evidence, sourceVersionId)),
  ];
}

function addEdgeEvidence(
  edges: Map<string, EdgeEvidence>,
  fromEntityId: string,
  toEntityId: string,
  count: number,
  evidenceRef: string,
): void {
  const key = `${fromEntityId}\u0000${toEntityId}`;
  const existing = edges.get(key);
  if (existing) {
    existing.count += count;
    return;
  }
  edges.set(key, { fromEntityId, toEntityId, count, evidenceRef });
}

function graphEdge(type: "CALLS" | "REFERENCES_DATA", evidence: EdgeEvidence, sourceVersionId: string): GraphEdge {
  return {
    id: `edge:${type}:${shortHash(`${evidence.fromEntityId}:${evidence.toEntityId}`)}`,
    fromEntityId: evidence.fromEntityId,
    edgeType: type,
    toEntityId: evidence.toEntityId,
    weight: Math.min(1, 0.25 + 0.25 * evidence.count),
    evidenceRef: evidence.evidenceRef,
    sourceVersionId,
    status: "accepted",
  };
}

function summarizeCallees(calls: CallObservation[]): PeerSummary[] {
  const summaries = new Map<string, PeerSummary>();
  for (const call of calls) {
    const key = call.callee?.entityId ?? `unresolved:${call.calleeSymbol}`;
    const existing = summaries.get(key);
    if (existing) {
      existing.count += call.count;
      continue;
    }
    summaries.set(key, peerSummary(call.calleeSymbol, call.callee, call.count));
  }
  return [...summaries.values()].sort(comparePeerSummaries);
}

function summarizeCallers(calls: CallObservation[]): PeerSummary[] {
  const summaries = new Map<string, PeerSummary>();
  for (const call of calls) {
    const existing = summaries.get(call.caller.entityId);
    if (existing) {
      existing.count += call.count;
      continue;
    }
    summaries.set(call.caller.entityId, peerSummary(call.caller.symbol, call.caller, call.count));
  }
  return [...summaries.values()].sort(comparePeerSummaries);
}

function peerSummary(symbol: string, fn: CurrentFunction | null, count: number): PeerSummary {
  if (!fn) return { symbol, count, resolved: false };
  return {
    symbol,
    unit: fn.unit,
    source_path: fn.sourcePath,
    count,
    resolved: true,
  };
}

function summarizeDataRefs(refs: DataRefObservation[]): DataRefSummary[] {
  const summaries = new Map<string, DataRefSummary>();
  for (const ref of refs) {
    const key = `${ref.refKind}\u0000${ref.refSymbol}`;
    const existing = summaries.get(key);
    if (existing) {
      existing.count += ref.count;
      continue;
    }
    summaries.set(key, { symbol: ref.refSymbol, ref_kind: ref.refKind, count: ref.count });
  }
  return [...summaries.values()].sort((left, right) => right.count - left.count || left.symbol.localeCompare(right.symbol) || left.ref_kind.localeCompare(right.ref_kind));
}

function comparePeerSummaries(left: PeerSummary, right: PeerSummary): number {
  return right.count - left.count || Number(right.resolved) - Number(left.resolved) || left.symbol.localeCompare(right.symbol);
}

function compareFunctions(left: CurrentFunction, right: CurrentFunction): number {
  return left.symbol.localeCompare(right.symbol) || left.unit.localeCompare(right.unit);
}

function profileEvidenceRef(
  outgoing: CallObservation[],
  incoming: CallObservation[],
  refs: DataRefObservation[],
  fallback: string,
): string {
  return outgoing[0]?.evidenceRef ?? incoming[0]?.evidenceRef ?? refs[0]?.evidenceRef ?? fallback;
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

function functionKey(unit: string, symbol: string): string {
  return `${unit}\u0000${symbol}`;
}

function formatAddress(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return `0x${value.toString(16).toUpperCase().padStart(8, "0")}`;
  if (typeof value === "string" && /^\d+$/.test(value)) return `0x${Number(value).toString(16).toUpperCase().padStart(8, "0")}`;
  return typeof value === "string" ? value : "";
}
