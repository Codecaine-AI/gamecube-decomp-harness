import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { agentSharedStateEnrichmentPath } from "../../paths.js";
import { fileEntityId, functionEntityId } from "./code-graph.js";
import type { GraphEdge, GraphEntity, GraphFact, GraphRecords, SearchChunk } from "../types.js";
import { ensureParentDir, filesFingerprint, objectValue, readJson, readJsonlLazy, shortHash, stringValue } from "../util.js";

const SOURCE_ID = "agent_shared_state";
const BOILERPLATE_NOTES = new Set(["completed via workflow finish", "committed via commit apply", "recovered from slug_map (synced to production)"]);

type LessonKind = "tool_issue" | "function_hint";

interface AgentSharedStateLesson {
  kind: LessonKind;
  evidence_ref: string;
}

interface ToolIssueLesson extends AgentSharedStateLesson {
  kind: "tool_issue";
  id: number;
  status: string;
  issue_kind: string;
  tool: string;
  summary: string;
  body?: string;
  functions: string[];
  resolution_note?: string;
  created_at?: string;
  updated_at?: string;
}

interface FunctionHintLesson extends AgentSharedStateLesson {
  kind: "function_hint";
  function_name: string;
  canonical_address?: string;
  legacy_match_percent?: number;
  legacy_status?: string;
  legacy_build_status?: string;
  build_diagnosis?: string;
  note?: string;
  updated_at?: string;
}

type Lesson = ToolIssueLesson | FunctionHintLesson;

interface CurrentFunction {
  entityId: string;
  fileEntityId?: string;
  sourcePath?: string;
  symbol: string;
  unit: string;
  fuzzy?: number;
}

export interface ImportAgentSharedStateOptions {
  inputPath: string;
  outputPath?: string;
}

export interface ImportAgentSharedStateResult {
  input_path: string;
  output_path: string;
  tool_issues: number;
  function_hints: number;
  skipped_audit_log: boolean;
}

export function importAgentSharedStateLessons(options: ImportAgentSharedStateOptions): ImportAgentSharedStateResult {
  const inputPath = resolve(options.inputPath);
  if (!existsSync(inputPath)) throw new Error(`Missing legacy agent state DB: ${inputPath}`);
  const outputPath = resolve(options.outputPath ?? agentSharedStateEnrichmentPath());
  const db = new Database(inputPath, { readonly: true });
  const lessons: Lesson[] = [];
  try {
    for (const row of db
      .query(
        `
          SELECT id, status, kind, tool, summary, body, functions, created_at, updated_at, resolved_at, resolution_note
          FROM tool_issues
          WHERE length(trim(coalesce(summary, ''))) > 0
          ORDER BY
            CASE status WHEN 'open' THEN 0 ELSE 1 END,
            updated_at DESC,
            id DESC
        `,
      )
      .all() as Array<Record<string, unknown>>) {
      const summary = compact(stringValue(row.summary));
      if (!summary) continue;
      lessons.push({
        kind: "tool_issue",
        id: Number(row.id),
        status: compact(stringValue(row.status, "unknown")),
        issue_kind: compact(stringValue(row.kind, "note")),
        tool: compact(stringValue(row.tool, "unknown")),
        summary,
        body: optionalText(row.body),
        functions: functionList(row.functions),
        resolution_note: optionalText(row.resolution_note),
        created_at: unixSecondsToIso(row.created_at),
        updated_at: unixSecondsToIso(row.updated_at ?? row.resolved_at),
        evidence_ref: `legacy-agent-state:tool_issues:${Number(row.id)}`,
      });
    }

    for (const row of db
      .query(
        `
          SELECT function_name, canonical_address, match_percent, status, build_status, build_diagnosis, notes, updated_at
          FROM functions
          WHERE length(trim(coalesce(build_diagnosis, ''))) > 0
             OR length(trim(coalesce(notes, ''))) > 0
          ORDER BY updated_at DESC, function_name
        `,
      )
      .all() as Array<Record<string, unknown>>) {
      const functionName = compact(stringValue(row.function_name));
      if (!functionName) continue;
      const buildDiagnosis = optionalText(row.build_diagnosis);
      const note = usefulNote(row.notes);
      if (!buildDiagnosis && !note) continue;
      lessons.push({
        kind: "function_hint",
        function_name: functionName,
        canonical_address: optionalText(row.canonical_address),
        legacy_match_percent: finiteNumber(row.match_percent),
        legacy_status: optionalText(row.status),
        legacy_build_status: optionalText(row.build_status),
        build_diagnosis: buildDiagnosis,
        note,
        updated_at: unixSecondsToIso(row.updated_at),
        evidence_ref: `legacy-agent-state:functions:${functionName}`,
      });
    }
  } finally {
    db.close();
  }

  ensureParentDir(outputPath);
  writeFileSync(outputPath, `${lessons.map((lesson) => JSON.stringify(lesson)).join("\n")}\n`, "utf8");
  return {
    input_path: inputPath,
    output_path: outputPath,
    tool_issues: lessons.filter((lesson) => lesson.kind === "tool_issue").length,
    function_hints: lessons.filter((lesson) => lesson.kind === "function_hint").length,
    skipped_audit_log: true,
  };
}

export function buildAgentSharedStateGraphRecords(repoRoot: string, path = agentSharedStateEnrichmentPath(), reportRelPath?: string): GraphRecords | null {
  const enrichmentPath = resolve(path);
  if (!existsSync(enrichmentPath)) return null;
  const sourceVersionId = `source-version:${SOURCE_ID}:${shortHash(filesFingerprint([enrichmentPath]))}`;
  const currentFunctions = currentFunctionIndex(repoRoot, reportRelPath);
  const entities: GraphEntity[] = [];
  const facts: GraphFact[] = [];
  const edges: GraphEdge[] = [];
  const chunks: SearchChunk[] = [];

  readJsonlLazy(enrichmentPath, (row) => {
    const lesson = row as unknown as Lesson;
    if (lesson.kind === "tool_issue") {
      addToolIssueLesson(lesson, currentFunctions, sourceVersionId, entities, facts, edges, chunks);
    } else if (lesson.kind === "function_hint") {
      addFunctionHintLesson(lesson, currentFunctions, sourceVersionId, entities, facts, edges, chunks);
    }
  });

  return {
    sourceVersion: {
      id: sourceVersionId,
      sourceId: SOURCE_ID,
      contentHash: shortHash(readFileSync(enrichmentPath, "utf8")),
      sourcePaths: [enrichmentPath],
    },
    entities,
    facts,
    edges,
    chunks,
  };
}

function addToolIssueLesson(
  lesson: ToolIssueLesson,
  currentFunctions: Map<string, CurrentFunction>,
  sourceVersionId: string,
  entities: GraphEntity[],
  facts: GraphFact[],
  edges: GraphEdge[],
  chunks: SearchChunk[],
): void {
  const issueEntityId = `historical_tool_issue:${lesson.id}`;
  const payload = lessonPayload(lesson);
  entities.push({
    id: issueEntityId,
    entityType: "historical_tool_issue",
    stableKey: `agent-shared-state:${lesson.id}`,
    payload,
  });
  const text = [
    lesson.tool,
    lesson.issue_kind,
    lesson.status,
    lesson.summary,
    lesson.body,
    lesson.resolution_note ? `Resolution: ${lesson.resolution_note}` : "",
    lesson.functions.join(" "),
  ]
    .filter(Boolean)
    .join("\n");
  chunks.push({
    id: `chunk:${SOURCE_ID}:tool_issue:${lesson.id}`,
    sourceId: SOURCE_ID,
    sourceVersionId,
    entityId: issueEntityId,
    title: `Historical ${lesson.tool} ${lesson.issue_kind}: ${lesson.summary}`,
    text,
    evidenceRef: lesson.evidence_ref,
    payload,
  });
  facts.push({
    id: `fact:${SOURCE_ID}:tool_issue:${lesson.id}`,
    entityId: issueEntityId,
    factType: "historical_tool_issue",
    payload,
    confidence: lesson.status === "resolved" ? 0.65 : 0.55,
    trustTier: "historical",
    evidenceRef: lesson.evidence_ref,
    sourceVersionId,
  });

  for (const symbol of lesson.functions) {
    const current = currentFunctions.get(symbol);
    if (!current) continue;
    edges.push(edge(current.entityId, "MENTIONED_IN_HISTORICAL_TOOL_ISSUE", issueEntityId, sourceVersionId, lesson.evidence_ref, 0.45));
    if (current.fileEntityId) {
      edges.push(edge(current.fileEntityId, "HAS_HISTORICAL_TOOL_LESSON", issueEntityId, sourceVersionId, lesson.evidence_ref, 0.35));
      chunks.push({
        id: `chunk:${SOURCE_ID}:tool_issue:${lesson.id}:file:${shortHash(current.fileEntityId)}`,
        sourceId: SOURCE_ID,
        sourceVersionId,
        entityId: current.fileEntityId,
        title: `Historical tool lesson for ${current.sourcePath}`,
        text: `${current.sourcePath}\n${symbol}\n${text}`,
        evidenceRef: lesson.evidence_ref,
        payload: { ...lesson, linked_function: current },
      });
    }
  }
}

function lessonPayload(lesson: Lesson): Record<string, unknown> {
  return { ...lesson };
}

function addFunctionHintLesson(
  lesson: FunctionHintLesson,
  currentFunctions: Map<string, CurrentFunction>,
  sourceVersionId: string,
  entities: GraphEntity[],
  facts: GraphFact[],
  edges: GraphEdge[],
  chunks: SearchChunk[],
): void {
  const current = currentFunctions.get(lesson.function_name);
  const entityId = current?.entityId ?? `legacy_function:${lesson.function_name}`;
  if (!current) {
    entities.push({
      id: entityId,
      entityType: "legacy_function",
      stableKey: lesson.function_name,
      payload: { function_name: lesson.function_name, canonical_address: lesson.canonical_address },
      replace: false,
    });
  }
  const payload = { ...lesson, current_function: current };
  facts.push({
    id: `fact:${SOURCE_ID}:function_hint:${shortHash(lesson.function_name)}`,
    entityId,
    factType: "historical_function_hint",
    payload,
    confidence: 0.5,
    trustTier: "historical",
    evidenceRef: lesson.evidence_ref,
    sourceVersionId,
  });
  const text = [
    lesson.function_name,
    lesson.canonical_address,
    lesson.legacy_status,
    lesson.legacy_build_status,
    lesson.build_diagnosis,
    lesson.note,
  ]
    .filter(Boolean)
    .join("\n");
  chunks.push({
    id: `chunk:${SOURCE_ID}:function_hint:${shortHash(lesson.function_name)}`,
    sourceId: SOURCE_ID,
    sourceVersionId,
    entityId: current?.fileEntityId ?? entityId,
    title: `Historical function hint: ${lesson.function_name}`,
    text,
    evidenceRef: lesson.evidence_ref,
    payload,
  });
  if (current?.fileEntityId) {
    edges.push(edge(current.fileEntityId, "HAS_HISTORICAL_FUNCTION_HINT", entityId, sourceVersionId, lesson.evidence_ref, 0.35));
  }
}

function currentFunctionIndex(repoRoot: string, reportRelPath = "build/GALE01/report.json"): Map<string, CurrentFunction> {
  const reportPath = resolve(repoRoot, reportRelPath);
  const objdiffPath = resolve(repoRoot, "objdiff.json");
  if (!existsSync(reportPath) || !existsSync(objdiffPath)) return new Map();
  const sourceByUnit = objdiffSourceMap(readJson(objdiffPath));
  const report = readJson(reportPath);
  const index = new Map<string, CurrentFunction>();
  for (const unitValue of Array.isArray(report.units) ? report.units : []) {
    const unit = objectValue(unitValue);
    const unitName = stringValue(unit.name);
    if (!unitName) continue;
    const sourcePath = stringValue(objectValue(unit.metadata).source_path, sourceByUnit.get(unitName) ?? "");
    for (const fnValue of Array.isArray(unit.functions) ? unit.functions : []) {
      const fn = objectValue(fnValue);
      const symbol = stringValue(fn.name);
      if (!symbol) continue;
      index.set(symbol, {
        entityId: functionEntityId(unitName, symbol),
        fileEntityId: sourcePath ? fileEntityId(sourcePath) : undefined,
        sourcePath: sourcePath || undefined,
        symbol,
        unit: unitName,
        fuzzy: finiteNumber(fn.fuzzy_match_percent),
      });
    }
  }
  return index;
}

function objdiffSourceMap(objdiff: Record<string, unknown>): Map<string, string> {
  const byUnit = new Map<string, string>();
  for (const unitValue of Array.isArray(objdiff.units) ? objdiff.units : []) {
    const unit = objectValue(unitValue);
    const name = stringValue(unit.name);
    const sourcePath = stringValue(objectValue(unit.metadata).source_path);
    if (name && sourcePath) byUnit.set(name, sourcePath);
  }
  return byUnit;
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

function functionList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => compact(String(item))).filter(Boolean);
  const raw = compact(stringValue(value));
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => compact(String(item))).filter(Boolean);
    } catch {
      return [];
    }
  }
  return raw
    .split(/[,;\s]+/)
    .map((item) => compact(item))
    .filter(Boolean);
}

function usefulNote(value: unknown): string | undefined {
  const note = optionalText(value);
  if (!note) return undefined;
  return BOILERPLATE_NOTES.has(note.toLowerCase()) ? undefined : note;
}

function optionalText(value: unknown): string | undefined {
  const text = compact(stringValue(value));
  return text ? text : undefined;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function unixSecondsToIso(value: unknown): string | undefined {
  const seconds = finiteNumber(value);
  if (seconds === undefined) return undefined;
  return new Date(seconds * 1000).toISOString();
}
