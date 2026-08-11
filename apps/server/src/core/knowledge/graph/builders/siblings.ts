import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { projectRoot } from "../../paths.js";
import type { GraphEdge, GraphFact, GraphRecords, SearchChunk } from "../types.js";
import { arrayValue, filesFingerprint, numberValue, objectValue, readJson, shortHash, stableJson, stringValue, truncate } from "../util.js";
import { functionEntityId } from "./code-graph.js";

export const SIBLINGS_SOURCE_ID = "siblings";

const DEFAULT_MAX_GROUP_SIZE = 12;
const MAX_SIBLINGS_IN_PAYLOAD = 12;

export interface BuildSiblingGraphRecordsOptions {
  rulesPath?: string;
  maxGroupSize?: number;
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

interface SiblingFamily {
  family: string;
  prefix: string;
  wikiTitles: string[];
}

interface FamilyFunction {
  fn: CurrentFunction;
  family: SiblingFamily;
  stem: string;
}

interface SiblingForFunction {
  source: FamilyFunction;
  sibling: FamilyFunction;
  clonePair: boolean;
}

export function buildSiblingGraphRecords(
  repoRoot: string,
  options: BuildSiblingGraphRecordsOptions = {},
): GraphRecords | null {
  const rulesPath = options.rulesPath ?? defaultSiblingRulesPath();
  if (!existsSync(rulesPath)) return null;

  const reportPath = functionReportPath(repoRoot);
  if (!existsSync(reportPath)) return null;

  const functions = currentFunctionIndex(reportPath);
  if (functions.length === 0) return null;

  const rules = readJson(rulesPath);
  const families = siblingFamilies(rules);
  const clonePairs = clonePairKeys(rules);
  const groups = familyFunctionGroups(functions, families);
  const maxGroupSize = Math.max(1, Math.floor(options.maxGroupSize ?? DEFAULT_MAX_GROUP_SIZE));
  const sourcePaths = [rulesPath, reportPath];
  const sourceVersionId = `source-version:${SIBLINGS_SOURCE_ID}:${shortHash(filesFingerprint(sourcePaths))}`;
  const edgeByPair = new Map<string, GraphEdge>();
  const siblingsByFunction = new Map<string, Map<string, SiblingForFunction>>();

  for (const group of groups.values()) {
    if (group.length > maxGroupSize) continue;
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      const left = group[leftIndex];
      if (!left) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const right = group[rightIndex];
        if (!right || left.family.family === right.family.family || left.fn.entityId === right.fn.entityId) continue;
        const clonePair = clonePairs.has(pairKey(left.family.family, right.family.family));
        addEdge(edgeByPair, left, right, clonePair, sourceVersionId, rulesPath);
        addSibling(siblingsByFunction, { source: left, sibling: right, clonePair });
        addSibling(siblingsByFunction, { source: right, sibling: left, clonePair });
      }
    }
  }

  const facts: GraphFact[] = [];
  const chunks: SearchChunk[] = [];
  for (const [entityId, siblingMap] of [...siblingsByFunction.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const siblings = [...siblingMap.values()].sort(compareSiblings);
    const source = siblings[0]?.source;
    if (!source) continue;
    const topSiblings = siblings.slice(0, MAX_SIBLINGS_IN_PAYLOAD);
    const payload = {
      source: functionPayload(source.fn),
      family: source.family.family,
      stem: source.stem,
      sibling_count: siblings.length,
      siblings: topSiblings.map(siblingPayload),
      wiki_titles: source.family.wikiTitles,
    };
    facts.push({
      id: `fact:sibling_profile:${shortHash(entityId)}`,
      entityId,
      factType: "sibling_profile",
      payload,
      confidence: 0.7,
      trustTier: "tool_evidence",
      evidenceRef: rulesPath,
      sourceVersionId,
    });
    chunks.push({
      id: `chunk:${SIBLINGS_SOURCE_ID}:${shortHash(entityId)}`,
      sourceId: SIBLINGS_SOURCE_ID,
      sourceVersionId,
      entityId,
      title: `Siblings: ${source.fn.symbol}`,
      text: truncate(
        [
          source.fn.symbol,
          source.fn.sourcePath,
          `family: ${source.family.family}`,
          `stem: ${source.stem}`,
          "siblings:",
          ...topSiblings.map(({ sibling }) => `${sibling.fn.symbol} ${sibling.fn.sourcePath}`),
        ].join(" "),
        1200,
      ),
      evidenceRef: rulesPath,
      payload,
    });
  }

  return {
    sourceVersion: {
      id: sourceVersionId,
      sourceId: SIBLINGS_SOURCE_ID,
      contentHash: shortHash(stableJson({ siblings: filesFingerprint(sourcePaths) })),
      sourcePaths,
    },
    entities: [],
    facts,
    edges: [...edgeByPair.values()].sort((left, right) => left.id.localeCompare(right.id)),
    chunks,
  };
}

function defaultSiblingRulesPath(): string {
  return resolve(projectRoot("melee"), "knowledge/config/sibling_rules.json");
}

function functionReportPath(repoRoot: string): string {
  const requested = resolve(repoRoot, "build/GALE01/report.json");
  if (existsSync(requested)) return requested;
  return resolve(projectRoot("melee"), "checkout/build/GALE01/report.json");
}

function currentFunctionIndex(reportPath: string): CurrentFunction[] {
  const functions: CurrentFunction[] = [];
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
      functions.push({
        entityId: functionEntityId(unitName, symbol),
        unit: unitName,
        symbol,
        sourcePath,
        address: formatAddress(fnMetadata.virtual_address ?? fnMetadata.address ?? fn.address),
        fuzzy,
        status: fuzzy >= 100 ? "matched" : "unmatched",
      });
    }
  }
  return functions;
}

function siblingFamilies(rules: Record<string, unknown>): SiblingFamily[] {
  return arrayValue(rules.families)
    .map(objectValue)
    .map((row) => ({
      family: stringValue(row.family),
      prefix: stringValue(row.prefix),
      wikiTitles: stringArray(row.wiki_titles),
    }))
    .filter((family) => family.family.length > 0 && family.prefix.length > 0);
}

function clonePairKeys(rules: Record<string, unknown>): Set<string> {
  const pairs = new Set<string>();
  for (const pairValue of arrayValue(rules.clone_pairs)) {
    const pair = arrayValue(pairValue);
    const left = stringValue(pair[0]);
    const right = stringValue(pair[1]);
    if (left && right && left !== right) pairs.add(pairKey(left, right));
  }
  return pairs;
}

function familyFunctionGroups(functions: CurrentFunction[], families: SiblingFamily[]): Map<string, FamilyFunction[]> {
  const groups = new Map<string, FamilyFunction[]>();
  for (const fn of functions) {
    for (const family of families) {
      const marker = `${family.prefix}_`;
      if (!fn.symbol.startsWith(marker)) continue;
      const stem = siblingStem(fn.symbol.slice(marker.length));
      if (!stem || /^[0-9A-Fa-f]+$/.test(stem)) continue;
      const group = groups.get(stem) ?? [];
      group.push({ fn, family, stem });
      groups.set(stem, group);
    }
  }
  return groups;
}

function siblingStem(value: string): string {
  return value.replace(/_(80[0-9A-Fa-f]{6})$/, "").replace(/_[0-9A-Fa-f]{8}$/, "");
}

function addEdge(
  edges: Map<string, GraphEdge>,
  left: FamilyFunction,
  right: FamilyFunction,
  clonePair: boolean,
  sourceVersionId: string,
  evidenceRef: string,
): void {
  const [fromEntityId, toEntityId] = [left.fn.entityId, right.fn.entityId].sort();
  const key = pairKey(fromEntityId, toEntityId);
  const candidate: GraphEdge = {
    id: `edge:SIBLING_OF:${shortHash(`${fromEntityId}:${toEntityId}:siblings`)}`,
    fromEntityId,
    edgeType: "SIBLING_OF",
    toEntityId,
    weight: clonePair ? 0.9 : 0.7,
    evidenceRef,
    sourceVersionId,
    status: "accepted",
  };
  const existing = edges.get(key);
  if (!existing || candidate.weight > existing.weight) edges.set(key, candidate);
}

function addSibling(siblingsByFunction: Map<string, Map<string, SiblingForFunction>>, sibling: SiblingForFunction): void {
  const siblings = siblingsByFunction.get(sibling.source.fn.entityId) ?? new Map<string, SiblingForFunction>();
  const existing = siblings.get(sibling.sibling.fn.entityId);
  if (!existing || (!existing.clonePair && sibling.clonePair)) siblings.set(sibling.sibling.fn.entityId, sibling);
  siblingsByFunction.set(sibling.source.fn.entityId, siblings);
}

function compareSiblings(left: SiblingForFunction, right: SiblingForFunction): number {
  return (
    Number(right.clonePair) - Number(left.clonePair) ||
    left.sibling.fn.symbol.localeCompare(right.sibling.fn.symbol) ||
    left.sibling.fn.sourcePath.localeCompare(right.sibling.fn.sourcePath) ||
    left.sibling.family.family.localeCompare(right.sibling.family.family)
  );
}

function siblingPayload(sibling: SiblingForFunction): Record<string, unknown> {
  return {
    symbol: sibling.sibling.fn.symbol,
    unit: sibling.sibling.fn.unit,
    source_path: sibling.sibling.fn.sourcePath,
    family: sibling.sibling.family.family,
    fuzzy: sibling.sibling.fn.fuzzy,
    status: sibling.sibling.fn.status,
    clone_pair: sibling.clonePair,
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

function pairKey(left: string, right: string): string {
  return [left, right].sort().join("\u0000");
}

function stringArray(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : [];
  return arrayValue(value).map((entry) => stringValue(entry)).filter(Boolean);
}

function formatAddress(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return `0x${value.toString(16).toUpperCase().padStart(8, "0")}`;
  if (typeof value === "string" && /^\d+$/.test(value)) return `0x${Number(value).toString(16).toUpperCase().padStart(8, "0")}`;
  return typeof value === "string" ? value : "";
}
