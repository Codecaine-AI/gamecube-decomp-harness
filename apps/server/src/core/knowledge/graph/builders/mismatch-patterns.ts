import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { agentSharedStateEnrichmentPath, knowledgeCuratorEnrichmentPath } from "../../paths.js";
import { fileEntityId, functionEntityId } from "./code-graph.js";
import type { GraphEdge, GraphEntity, GraphFact, GraphRecords, SearchChunk, TrustTier } from "../types.js";
import { arrayValue, filesFingerprint, numberValue, objectValue, readJson, readJsonlLazy, shortHash, stableJson, stringValue, truncate } from "../util.js";

const SOURCE_ID = "mismatch_patterns";
const FILE_MENTION_RE = /(?:^|[\s`"'(])((?:src|include|asm|config)\/[A-Za-z0-9_./+@-]+)\b/g;

interface PatternDefinition {
  id: string;
  title: string;
  category: string;
  symptoms: string[];
  tactics: string[];
  terms: string[];
}

interface PatternEvidence {
  id: string;
  kind: string;
  title: string;
  text: string;
  evidenceRef: string;
  sourcePaths: string[];
  unit?: string;
  symbol?: string;
  pr?: number;
  confidence: number;
  trustTier: TrustTier;
}

interface CurrentFunction {
  entityId: string;
  fileEntityId?: string;
  sourcePath?: string;
  symbol: string;
  unit: string;
}

export interface BuildMismatchPatternGraphRecordsOptions {
  agentStateEnrichmentPath?: string;
  knowledgeCuratorEnrichmentPath?: string;
  reportRelPath?: string;
}

const PATTERNS: PatternDefinition[] = [
  {
    id: "stack-frame-layout",
    title: "Stack/frame layout mismatch",
    category: "stack",
    symptoms: ["frame size delta", "stack offset drift", "stwu delta", "local stack home moved"],
    tactics: ["Look for missing inlines, temp lifetime changes, local arrays, PAD_STACK tradeoffs, and source reshaping before keeping padding."],
    terms: ["stack mismatch", "stack frame", "frame size", "stack size", "stack layout", "stack offset", "PAD_STACK", "stwu", "local array"],
  },
  {
    id: "register-allocation-lifetime",
    title: "Register allocation or lifetime mismatch",
    category: "register",
    symptoms: ["saved register set differs", "argument registers swap", "extra mr/addi copy", "allocator cascade"],
    tactics: ["Adjust temp lifetime, declaration order, helper boundaries, accessor reuse, and source expression grouping before chasing bare register names."],
    terms: ["register allocation", "regalloc", "saved register", "callee-saved", "register swap", "register lifetime", "coalescing", "mr ", "addi r", "variable order"],
  },
  {
    id: "inline-helper-boundary",
    title: "Inline/helper boundary mismatch",
    category: "inline",
    symptoms: ["call count differs", "assert strings imply inline", "manual expansion changes codegen"],
    tactics: ["Restore or introduce small static inline helpers when the target shape depends on grouped locals, asserts, callbacks, or accessor lowering."],
    terms: ["inline", "static inline", "helper", "wrapper", "accessor", "macro", "GET_", "assert", "jobj.h", "helper boundary"],
  },
  {
    id: "branch-control-flow-shape",
    title: "Branch/control-flow shape mismatch",
    category: "control-flow",
    symptoms: ["beq/bne polarity differs", "extra or missing branch", "goto/loop shape differs", "ternary emits wrong branch structure"],
    tactics: ["Try condition inversion, early-return hoisting, explicit goto labels, nested ifs, or ternary-to-if rewrites when semantics are already known."],
    terms: ["branch", "control flow", "beq", "bne", "cror", "ternary", "early return", "goto", "null guard", "condition inversion"],
  },
  {
    id: "literal-data-section-layout",
    title: "Literal/data-section layout mismatch",
    category: "data-layout",
    symptoms: [".rodata/.sdata2 changes", "float literal load shape differs", "string/data order shifts"],
    tactics: ["Check extern-vs-literal ownership, constant pool ordering, split boundaries, string ownership, and section ownership before editing logic."],
    terms: ["literal", "constant", "rodata", "sdata2", "sdata", "data section", "constant pool", "float constant", "string literal", "section ownership"],
  },
  {
    id: "type-signature-prototype",
    title: "Type/signature/prototype mismatch",
    category: "type",
    symptoms: ["caller noise after body changes", "wrong return conversion", "unexpected casts or masks", "implicit declaration fallout"],
    tactics: ["Fix headers, prototypes, return types, signedness, pointer/value types, and struct field types before judging body-only diffs."],
    terms: ["prototype", "signature", "return type", "implicit declaration", "u32", "s32", "int versus", "signed", "unsigned", "bool", "field type"],
  },
  {
    id: "split-section-ownership",
    title: "Split or section ownership mismatch",
    category: "split",
    symptoms: ["object boundary wrong", "data belongs to neighboring file", "matching status changes after split"],
    tactics: ["Update splits, symbols, configure status, local/global symbol scope, and moved headers together when ownership evidence changes."],
    terms: ["split", "splits.txt", "symbols.txt", "translation unit", "compilation unit", "file boundary", "object boundary", "resplit", "linking"],
  },
  {
    id: "loop-switch-shape",
    title: "Loop or switch lowering mismatch",
    category: "loop",
    symptoms: ["mtctr/bdnz missing", "unroll shape differs", "switch/fallthrough shape differs"],
    tactics: ["Try do/while, explicit counters, grouped switch cases, fallthrough-preserving structure, or helper extraction when the loop body is understood."],
    terms: ["loop", "mtctr", "bdnz", "unroll", "switch", "fallthrough", "counter", "do/while"],
  },
  {
    id: "struct-layout-field-shape",
    title: "Struct layout or field-shape mismatch",
    category: "struct",
    symptoms: ["field offset differs", "raw padding hides real array/bitfield", "rlwimi or indexed access suggests layout"],
    tactics: ["Prefer evidenced arrays, bitfields, typed padding, and shared struct fixes over local casts when multiple users agree."],
    terms: ["struct", "field offset", "padding", "bitfield", "rlwimi", "array field", "stride", "offset", "layout"],
  },
  {
    id: "negative-tactic-evidence",
    title: "Negative evidence for a matching tactic",
    category: "negative-evidence",
    symptoms: ["known tactic was no-op or misleading for this compiler/repo"],
    tactics: ["Record failed tactics so workers stop retrying stale advice and move to a better-supported hypothesis."],
    terms: ["negative evidence", "misleading", "no-op", "no op", "does not", "not reliable", "failed", "stale", "waste time", "wrong"],
  },
];

export function buildMismatchPatternGraphRecords(repoRoot: string, options: BuildMismatchPatternGraphRecordsOptions = {}): GraphRecords | null {
  const curatorPath = resolve(options.knowledgeCuratorEnrichmentPath ?? knowledgeCuratorEnrichmentPath());
  const agentPath = resolve(options.agentStateEnrichmentPath ?? agentSharedStateEnrichmentPath());
  const inputPaths = [curatorPath, agentPath].filter(existsSync);
  if (inputPaths.length === 0) return null;

  const sourceVersionId = `source-version:${SOURCE_ID}:${shortHash(filesFingerprint(inputPaths))}`;
  const currentFunctions = currentFunctionIndex(repoRoot, options.reportRelPath);
  const buckets = new Map<string, PatternEvidence[]>();

  for (const evidence of curatedEvidence(curatorPath)) {
    for (const pattern of matchingPatterns(evidence.text)) pushBucket(buckets, pattern.id, evidence);
  }
  for (const evidence of agentSharedStateEvidence(agentPath)) {
    for (const pattern of matchingPatterns(evidence.text)) pushBucket(buckets, pattern.id, evidence);
  }

  const entities: GraphEntity[] = [];
  const facts: GraphFact[] = [];
  const edges: GraphEdge[] = [];
  const chunks: SearchChunk[] = [];

  for (const pattern of PATTERNS) {
    const evidenceRows = dedupeEvidence(buckets.get(pattern.id) ?? []);
    if (evidenceRows.length === 0) continue;
    addPattern(pattern, evidenceRows, currentFunctions, sourceVersionId, entities, facts, edges, chunks);
  }

  if (chunks.length === 0) return null;
  return {
    sourceVersion: {
      id: sourceVersionId,
      sourceId: SOURCE_ID,
      contentHash: shortHash(filesFingerprint(inputPaths)),
      sourcePaths: inputPaths,
    },
    entities,
    facts,
    edges,
    chunks,
  };
}

function curatedEvidence(path: string): PatternEvidence[] {
  const rows: PatternEvidence[] = [];
  readJsonlLazy(path, (row) => {
    if (stringValue(row.status) !== "accepted") return;
    const payload = objectValue(row.payload);
    const title = stringValue(row.title);
    const text = [title, stringValue(row.text), stableJson(payload)].filter(Boolean).join("\n");
    rows.push({
      id: stringValue(row.id, shortHash(text)),
      kind: stringValue(row.kind, "curated_knowledge"),
      title,
      text,
      evidenceRef: stringValue(row.evidence_ref, stringValue(row.id)),
      sourcePaths: sourcePathsFor(text, stringValue(row.source_path, stringValue(payload.source_path))),
      unit: stringValue(row.unit) || undefined,
      symbol: stringValue(row.symbol) || undefined,
      pr: finitePr(payload.pr),
      confidence: clamp(numberValue(row.confidence, 0.6), 0.25, 0.95),
      trustTier: trustTierValue(row.trust_tier),
    });
  });
  return rows;
}

function agentSharedStateEvidence(path: string): PatternEvidence[] {
  const rows: PatternEvidence[] = [];
  readJsonlLazy(path, (row) => {
    const kind = stringValue(row.kind);
    if (kind === "tool_issue" && stringValue(row.status) !== "resolved") return;
    const text = [
      stringValue(row.tool),
      stringValue(row.issue_kind),
      stringValue(row.summary),
      stringValue(row.body),
      stringValue(row.resolution_note),
      arrayValue(row.functions).join(" "),
      stringValue(row.function_name),
      stringValue(row.build_diagnosis),
      stringValue(row.note),
    ]
      .filter(Boolean)
      .join("\n");
    if (!text.trim()) return;
    const functions = arrayValue(row.functions).map((value) => String(value)).filter(Boolean);
    rows.push({
      id: stringValue(row.evidence_ref, `${kind}:${shortHash(text)}`),
      kind,
      title: kind === "tool_issue" ? stringValue(row.summary, "Historical tool issue") : `Historical function hint: ${stringValue(row.function_name)}`,
      text,
      evidenceRef: stringValue(row.evidence_ref, kind),
      sourcePaths: sourcePathsFor(text),
      symbol: stringValue(row.function_name, functions[0] ?? "") || undefined,
      confidence: kind === "tool_issue" ? 0.65 : 0.5,
      trustTier: "historical",
    });
  });
  return rows;
}

function addPattern(
  pattern: PatternDefinition,
  evidenceRows: PatternEvidence[],
  currentFunctions: Map<string, CurrentFunction>,
  sourceVersionId: string,
  entities: GraphEntity[],
  facts: GraphFact[],
  edges: GraphEdge[],
  chunks: SearchChunk[],
): void {
  const patternEntity = patternEntityId(pattern.id);
  const payload = {
    id: pattern.id,
    title: pattern.title,
    category: pattern.category,
    symptoms: pattern.symptoms,
    tactics: pattern.tactics,
    terms: pattern.terms,
    evidence_count: evidenceRows.length,
    evidence_refs: evidenceRows.slice(0, 24).map((row) => row.evidenceRef),
  };
  entities.push({
    id: patternEntity,
    entityType: "mismatch_pattern",
    stableKey: pattern.id,
    payload,
  });
  facts.push({
    id: `fact:${SOURCE_ID}:pattern:${pattern.id}`,
    entityId: patternEntity,
    factType: "mismatch_pattern",
    payload,
    confidence: Math.min(0.9, 0.45 + evidenceRows.length * 0.05),
    trustTier: "historical",
    evidenceRef: evidenceRows[0]?.evidenceRef ?? pattern.id,
    sourceVersionId,
  });
  chunks.push({
    id: `chunk:${SOURCE_ID}:pattern:${pattern.id}`,
    sourceId: SOURCE_ID,
    sourceVersionId,
    entityId: patternEntity,
    title: `Mismatch pattern: ${pattern.title}`,
    text: patternText(pattern, evidenceRows),
    evidenceRef: evidenceRows[0]?.evidenceRef ?? pattern.id,
    payload,
  });

  for (const evidence of evidenceRows) {
    addPatternEvidence(pattern, evidence, currentFunctions, sourceVersionId, patternEntity, entities, facts, edges, chunks);
  }
}

function addPatternEvidence(
  pattern: PatternDefinition,
  evidence: PatternEvidence,
  currentFunctions: Map<string, CurrentFunction>,
  sourceVersionId: string,
  patternEntity: string,
  entities: GraphEntity[],
  facts: GraphFact[],
  edges: GraphEdge[],
  chunks: SearchChunk[],
): void {
  const evidenceEntity = `mismatch_pattern_evidence:${shortHash(`${pattern.id}:${evidence.id}`)}`;
  const evidencePayload = {
    pattern_id: pattern.id,
    evidence_id: evidence.id,
    kind: evidence.kind,
    title: evidence.title,
    evidence_ref: evidence.evidenceRef,
    source_paths: evidence.sourcePaths,
    unit: evidence.unit ?? null,
    symbol: evidence.symbol ?? null,
    pr: evidence.pr ?? null,
    text: truncate(evidence.text, 1200),
  };
  entities.push({
    id: evidenceEntity,
    entityType: "mismatch_pattern_evidence",
    stableKey: `${pattern.id}:${evidence.id}`,
    payload: evidencePayload,
  });
  facts.push({
    id: `fact:${SOURCE_ID}:evidence:${shortHash(`${pattern.id}:${evidence.id}`)}`,
    entityId: evidenceEntity,
    factType: "mismatch_pattern_evidence",
    payload: evidencePayload,
    confidence: evidence.confidence,
    trustTier: evidence.trustTier,
    evidenceRef: evidence.evidenceRef,
    sourceVersionId,
  });
  edges.push(edge(patternEntity, "HAS_MISMATCH_PATTERN_EVIDENCE", evidenceEntity, sourceVersionId, evidence.evidenceRef, evidence.confidence));
  if (evidence.pr) {
    const prEntity = `pr:${evidence.pr}`;
    entities.push({ id: prEntity, entityType: "pull_request", stableKey: `pr-${evidence.pr}`, payload: { pr: evidence.pr }, replace: false });
    edges.push(edge(patternEntity, "EVIDENCED_BY_PR", prEntity, sourceVersionId, evidence.evidenceRef, evidence.confidence));
  }

  const current = currentForEvidence(evidence, currentFunctions);
  if (current) {
    edges.push(edge(current.entityId, "FUNCTION_HAS_MISMATCH_PATTERN", patternEntity, sourceVersionId, evidence.evidenceRef, evidence.confidence));
    if (current.fileEntityId && !evidence.sourcePaths.includes(current.sourcePath ?? "")) {
      evidence.sourcePaths.push(current.sourcePath ?? "");
    }
  }

  for (const sourcePath of evidence.sourcePaths) {
    if (!sourcePath) continue;
    const fileEntity = fileEntityId(sourcePath);
    entities.push({ id: fileEntity, entityType: "source_file", stableKey: sourcePath, payload: { source_path: sourcePath }, replace: false });
    edges.push(edge(fileEntity, "HAS_MISMATCH_PATTERN", patternEntity, sourceVersionId, evidence.evidenceRef, evidence.confidence));
    edges.push(edge(fileEntity, "HAS_MISMATCH_PATTERN_EVIDENCE", evidenceEntity, sourceVersionId, evidence.evidenceRef, evidence.confidence));
    chunks.push({
      id: `chunk:${SOURCE_ID}:file:${shortHash(`${pattern.id}:${evidence.id}:${sourcePath}`)}`,
      sourceId: SOURCE_ID,
      sourceVersionId,
      entityId: fileEntity,
      title: `Mismatch pattern for ${sourcePath}: ${pattern.title}`,
      text: `${sourcePath}\n${pattern.title}\n${pattern.symptoms.join("\n")}\n${pattern.tactics.join("\n")}\n${truncate(evidence.text, 1600)}`,
      evidenceRef: evidence.evidenceRef,
      payload: evidencePayload,
    });
  }
}

function matchingPatterns(text: string): PatternDefinition[] {
  const normalized = text.toLowerCase();
  return PATTERNS.filter((pattern) => pattern.terms.some((term) => termMatches(normalized, term)));
}

function termMatches(text: string, term: string): boolean {
  const normalized = term.toLowerCase();
  if (/^[a-z0-9_ -]+$/.test(normalized)) {
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`).test(text);
  }
  return text.includes(normalized);
}

function patternText(pattern: PatternDefinition, evidenceRows: PatternEvidence[]): string {
  return [
    pattern.title,
    `category: ${pattern.category}`,
    `symptoms: ${pattern.symptoms.join("; ")}`,
    `tactics: ${pattern.tactics.join("; ")}`,
    `terms: ${pattern.terms.join("; ")}`,
    `evidence_count: ${evidenceRows.length}`,
    ...evidenceRows.slice(0, 12).map((row) => `${row.title}\n${truncate(row.text, 700)}\n${row.evidenceRef}`),
  ].join("\n\n");
}

function currentForEvidence(evidence: PatternEvidence, currentFunctions: Map<string, CurrentFunction>): CurrentFunction | null {
  if (evidence.unit && evidence.symbol) return currentFunctions.get(`${evidence.unit}:${evidence.symbol}`) ?? null;
  if (evidence.symbol) return currentFunctions.get(evidence.symbol) ?? null;
  return null;
}

function currentFunctionIndex(repoRoot: string, reportRelPath = "build/GALE01/report.json"): Map<string, CurrentFunction> {
  const reportPath = resolve(repoRoot, reportRelPath);
  const objdiffPath = resolve(repoRoot, "objdiff.json");
  if (!existsSync(reportPath) || !existsSync(objdiffPath)) return new Map();
  const sourceByUnit = objdiffSourceMap(readJson(objdiffPath));
  const report = readJson(reportPath);
  const index = new Map<string, CurrentFunction>();
  for (const unitValue of arrayValue(report.units)) {
    const unit = objectValue(unitValue);
    const unitName = stringValue(unit.name);
    if (!unitName) continue;
    const sourcePath = stringValue(objectValue(unit.metadata).source_path, sourceByUnit.get(unitName) ?? "");
    for (const fnValue of arrayValue(unit.functions)) {
      const fn = objectValue(fnValue);
      const symbol = stringValue(fn.name);
      if (!symbol) continue;
      const current = {
        entityId: functionEntityId(unitName, symbol),
        fileEntityId: sourcePath ? fileEntityId(sourcePath) : undefined,
        sourcePath: sourcePath || undefined,
        symbol,
        unit: unitName,
      };
      index.set(`${unitName}:${symbol}`, current);
      if (!index.has(symbol)) index.set(symbol, current);
    }
  }
  return index;
}

function objdiffSourceMap(objdiff: Record<string, unknown>): Map<string, string> {
  const byUnit = new Map<string, string>();
  for (const unitValue of arrayValue(objdiff.units)) {
    const unit = objectValue(unitValue);
    const name = stringValue(unit.name);
    const sourcePath = stringValue(objectValue(unit.metadata).source_path);
    if (name && sourcePath) byUnit.set(name, sourcePath);
  }
  return byUnit;
}

function pushBucket(buckets: Map<string, PatternEvidence[]>, patternId: string, evidence: PatternEvidence): void {
  const rows = buckets.get(patternId) ?? [];
  rows.push({ ...evidence, sourcePaths: [...evidence.sourcePaths] });
  buckets.set(patternId, rows);
}

function dedupeEvidence(rows: PatternEvidence[]): PatternEvidence[] {
  const byKey = new Map<string, PatternEvidence>();
  for (const row of rows) byKey.set(row.id, row);
  return [...byKey.values()].sort((left, right) => right.confidence - left.confidence || left.title.localeCompare(right.title));
}

function sourcePathsFor(text: string, primary = ""): string[] {
  const paths = [...text.matchAll(FILE_MENTION_RE)].map((match) => match[1].replace(/[),.;:]+$/, ""));
  if (primary) paths.unshift(primary);
  return [...new Set(paths.filter((path) => path.startsWith("src/") || path.startsWith("include/") || path.startsWith("asm/") || path.startsWith("config/")))].sort();
}

function finitePr(value: unknown): number | undefined {
  const pr = typeof value === "number" ? value : Number(value);
  return Number.isFinite(pr) && pr > 0 ? Math.trunc(pr) : undefined;
}

function trustTierValue(value: unknown): TrustTier {
  const tier = stringValue(value, "historical");
  if (tier === "canonical" || tier === "local" || tier === "reference" || tier === "historical" || tier === "external_hint" || tier === "tool_evidence") return tier;
  return "historical";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function patternEntityId(patternId: string): string {
  return `mismatch_pattern:${patternId}`;
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
