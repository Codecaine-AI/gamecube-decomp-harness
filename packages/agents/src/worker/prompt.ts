import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PiPromptBundle, RunProjectMetadata } from "@decomp-orchestrator/core/types";
import { fileGraphCard, globalStandardsPromptXml, graphDbExists, openKnowledgeGraph, resourceGraphDbPath } from "@decomp-orchestrator/knowledge";
import { readTemplate, renderTemplate, stableJson } from "../runtime/index.js";
import { availableToolsPromptXml } from "../tools/index.js";

export interface WorkerPromptOptions {
  packet: Record<string, unknown>;
  repoRoot: string;
  stateDir: string;
  project?: RunProjectMetadata;
  initialBoardPath: string;
  workerLogDir: string;
}

export interface WorkerPromptInputXmlOptions {
  packet: Record<string, unknown>;
  repoRoot: string;
  project?: RunProjectMetadata;
}

export interface WorkerPromptInputXml {
  targetXml: string;
  baselineXml: string;
  targetGraphFileCardXml: string;
}

function templatePath(name: "system" | "initial_user"): string {
  return fileURLToPath(new URL(`./templates/${name}.md`, import.meta.url));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asRecord).filter((item) => Object.keys(item).length > 0) : [];
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function xmlText(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function xmlAttribute(value: unknown): string {
  return xmlText(value).replace(/"/g, "&quot;");
}

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function optionalAttribute(name: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return ` ${name}="${xmlAttribute(value)}"`;
}

function jsonBlockXml(tag: string, value: unknown, indent = "        "): string {
  return [`${indent}<${tag}>`, "```json", stableJson(value), "```", `${indent}</${tag}>`].join("\n");
}

function compactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const compacted = value.map(compactValue).filter((item) => {
      if (item === null || item === undefined || item === "") return false;
      if (Array.isArray(item)) return item.length > 0;
      if (typeof item === "object") return Object.keys(item as Record<string, unknown>).length > 0;
      return true;
    });
    return compacted;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, entry]) => [key, compactValue(entry)] as const)
        .filter(([, entry]) => {
          if (entry === null || entry === undefined || entry === "") return false;
          if (Array.isArray(entry)) return entry.length > 0;
          if (typeof entry === "object") return Object.keys(entry as Record<string, unknown>).length > 0;
          return true;
        }),
    );
  }
  return value;
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return compactValue(value) as Record<string, unknown>;
}

function stringArray(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => String(item ?? ""))
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function targetFileXml(
  target: Record<string, unknown>,
  baseline: Record<string, unknown>,
  primarySourcePath: string,
  primarySourceAbs: string,
  indent = "    ",
): string {
  const attrs = [
    optionalAttribute("path", primarySourcePath),
    optionalAttribute("unit", optionalString(target.unit)),
    optionalAttribute("symbol", optionalString(target.symbol)),
    optionalAttribute("size", optionalNumber(target.size)),
    optionalAttribute("baseline_match_percent", optionalNumber(baseline.fuzzy_match_percent) ?? optionalNumber(target.fuzzy_match_percent)),
  ].join("");
  if (!primarySourceAbs || !existsSync(primarySourceAbs)) {
    return [
      `${indent}<target_file${attrs}>`,
      `${indent}    <content unavailable="true">${xmlText(primarySourceAbs ? `File not found: ${primarySourceAbs}` : "No target source path provided.")}</content>`,
      `${indent}</target_file>`,
    ].join("\n");
  }
  return [`${indent}<target_file${attrs}>`, cdata(readFileSync(primarySourceAbs, "utf8")), `${indent}</target_file>`].join("\n");
}

function targetXml(target: Record<string, unknown>, baseline: Record<string, unknown>, primarySourcePath: string, primarySourceAbs: string): string {
  return ["    <target>", jsonBlockXml("details_json", target), targetFileXml(target, baseline, primarySourcePath, primarySourceAbs, "        "), "    </target>"].join("\n");
}

function baselineXml(baseline: Record<string, unknown>): string {
  return ["    <baseline>", jsonBlockXml("details_json", baseline), "    </baseline>"].join("\n");
}

// Repair attempts must see why the runner rejected the previous return; the
// packet carries repair_request but only rendered blocks reach the agent.
function repairRequestXml(packet: Record<string, unknown>): string {
  const repair = asRecord(packet.repair_request);
  if (Object.keys(repair).length === 0) return "";
  return ["    <repair_request>", jsonBlockXml("details_json", repair), "    </repair_request>"].join("\n");
}

function functionName(fn: Record<string, unknown>): string {
  return optionalString(fn.name) ?? optionalString(fn.symbol) ?? optionalString(fn.function_name) ?? optionalString(fn.id) ?? "";
}

function compactFunction(fn: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: functionName(fn),
    symbol: optionalString(fn.symbol),
    unit: optionalString(fn.unit),
    size: optionalNumber(fn.size),
    fuzzy_match_percent: optionalNumber(fn.fuzzy_match_percent) ?? optionalNumber(fn.match_percent) ?? optionalNumber(fn.fuzzy),
    status: optionalString(fn.status),
    build_status: optionalString(fn.build_status),
    reason: optionalString(fn.reason),
  });
}

function compactMismatchPattern(pattern: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    pattern_id: optionalString(pattern.pattern_id) ?? optionalString(pattern.id),
    title: optionalString(pattern.title),
    category: optionalString(pattern.category),
    symptoms: stringArray(pattern.symptoms, 4),
    tactics: stringArray(pattern.tactics, 4),
    evidence_count: optionalNumber(pattern.evidence_count),
    evidence_refs: stringArray(pattern.linked_evidence_refs, 4),
    linked_evidence: asRecordArray(pattern.linked_evidence)
      .slice(0, 3)
      .map((evidence) =>
        compactObject({
          title: optionalString(evidence.title),
          kind: optionalString(evidence.kind),
          evidence_ref: optionalString(evidence.evidence_ref),
          unit: optionalString(evidence.unit),
          symbol: optionalString(evidence.symbol),
          pr: evidence.pr ?? null,
        }),
      ),
  });
}

function compactTouchingPr(pr: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    pr: pr.pr ?? pr.number ?? pr.id ?? null,
    title: optionalString(pr.title) ?? optionalString(pr.summary),
    author: optionalString(pr.author),
    merged_at: optionalString(pr.merged_at) ?? optionalString(pr.date),
    role: optionalString(pr.role),
  });
}

function compactResourceHit(hit: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    source_id: optionalString(hit.source_id),
    title: optionalString(hit.title),
    evidence_ref: optionalString(hit.evidence_ref),
  });
}

function compactPathFact(fact: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: optionalString(fact.id),
    title: optionalString(fact.title),
    directory: optionalString(fact.directory),
    strength: optionalString(fact.strength),
    summary: optionalString(fact.summary),
    evidence_refs: stringArray(fact.evidence_refs, 4),
    watched_paths: stringArray(fact.watched_paths, 4),
    slice_ref: fact.slice_ref ?? null,
  });
}

function fileCardFromPacket(packet: Record<string, unknown>): {
  card: Record<string, unknown>;
  graphDb: string | null;
  pathFacts: Record<string, unknown>;
  status: string | null;
  reason: string | null;
} {
  const knowledgeContext = asRecord(packet.knowledge_context);
  const rawFileCard = asRecord(knowledgeContext.file_card);
  const nestedFileCard = asRecord(rawFileCard.file_card);
  return {
    card: Object.keys(nestedFileCard).length ? nestedFileCard : rawFileCard,
    graphDb: optionalString(knowledgeContext.graph_db),
    pathFacts: asRecord(knowledgeContext.path_facts),
    status: optionalString(knowledgeContext.status),
    reason: optionalString(knowledgeContext.reason),
  };
}

function fileCardFromGraph(sourcePath: string, project?: RunProjectMetadata, graphDbOverride?: string | null): { card: Record<string, unknown>; graphDb: string | null; status: string; reason: string | null } {
  const graphDb = graphDbOverride || project?.graphDbPath || resourceGraphDbPath();
  if (!sourcePath) return { card: {}, graphDb, status: "missing_source_path", reason: "No target source_path is available." };
  if (!graphDbExists(graphDb)) return { card: {}, graphDb, status: "graph_missing", reason: "Knowledge graph DB is not available." };
  const store = openKnowledgeGraph(graphDb);
  try {
    return { card: fileGraphCard(store, sourcePath) as unknown as Record<string, unknown>, graphDb, status: "ready", reason: null };
  } catch (error) {
    return { card: {}, graphDb, status: "failed", reason: error instanceof Error ? error.message : String(error) };
  } finally {
    store.db.close();
  }
}

function compactTargetGraphFileCard(packet: Record<string, unknown>, project?: RunProjectMetadata): Record<string, unknown> {
  const target = asRecord(packet.target);
  const sourcePath = String(target.source_path ?? "");
  const fromPacket = fileCardFromPacket(packet);
  const loaded = Object.keys(fromPacket.card).length ? { ...fromPacket, status: fromPacket.status ?? "ready" } : fileCardFromGraph(sourcePath, project, fromPacket.graphDb);
  const card = loaded.card;
  if (!Object.keys(card).length) {
    return compactObject({
      status: loaded.status ?? "unavailable",
      source: "code_graph_file_card",
      graph_db: loaded.graphDb,
      source_path: sourcePath,
      reason: loaded.reason,
      has_graph_context: false,
      search_leads: {
        symbols: compactObject({
          source_path: sourcePath,
        }),
        follow_up_queries: [
          compactObject({ tool: "code_graph_file_card", source_path: sourcePath }),
          compactObject({ tool: "code_graph_search", query: sourcePath }),
          compactObject({ tool: "path_facts_resolve", source_path: sourcePath }),
        ],
      },
      no_context_note: loaded.reason ?? "No graph context is attached to this target source path.",
    });
  }

  const functions = asRecordArray(card.functions).map(compactFunction).filter((fn) => Object.keys(fn).length > 0);
  const targetSymbol = optionalString(target.symbol);
  const targetFunction = functions.find((fn) => functionName(fn) === targetSymbol || optionalString(fn.symbol) === targetSymbol) ?? null;
  const sameFileFunctions = functions.filter((fn) => fn !== targetFunction).slice(0, 10);
  const prHistory = asRecord(card.pr_history);
  const mismatchPatterns = asRecordArray(card.mismatch_patterns).slice(0, 6).map(compactMismatchPattern);
  const touchingPrs = asRecordArray(prHistory.touching_prs).slice(0, 6).map(compactTouchingPr);
  const resourceHits = asRecordArray(card.resource_hits).slice(0, 8).map(compactResourceHit);
  const pathFacts = asRecordArray(fromPacket.pathFacts.facts).slice(0, 5).map(compactPathFact);
  const unitNames = asRecordArray(card.units)
    .map((unit) => optionalString(unit.unit) ?? optionalString(unit.name))
    .filter((unit): unit is string => Boolean(unit));
  const sameFileSymbols = sameFileFunctions
    .map((fn) => optionalString(fn.symbol) ?? functionName(fn))
    .filter(Boolean)
    .slice(0, 10);
  const mismatchQueries = mismatchPatterns
    .map((pattern) => optionalString(pattern.title))
    .filter((title): title is string => Boolean(title))
    .slice(0, 4);
  const followUpQueries = [
    compactObject({ tool: "code_graph_file_card", source_path: sourcePath }),
    compactObject({ tool: "code_graph_search", query: [sourcePath, targetSymbol].filter(Boolean).join(" ") }),
    compactObject({ tool: "past_prs_search", query: [sourcePath, targetSymbol].filter(Boolean).join(" ") }),
    ...(mismatchQueries.length ? [compactObject({ tool: "mismatch_db_search", query: mismatchQueries.join(" OR ") })] : []),
    compactObject({ tool: "path_facts_resolve", source_path: sourcePath }),
  ];

  return compactObject({
    status: "ready",
    source: "code_graph_file_card",
    authority: "Graph-derived context. Current source, headers, objdiff, and validation output outrank this summary.",
    graph_db: loaded.graphDb,
    source_path: optionalString(card.source_path) ?? sourcePath,
    has_graph_context: Boolean(
      functions.length > 0 || mismatchPatterns.length > 0 || touchingPrs.length > 0 || resourceHits.length > 0 || pathFacts.length > 0,
    ),
    editability: asRecord(card.editability),
    search_leads: {
      symbols: {
        source_path: optionalString(card.source_path) ?? sourcePath,
        units: unitNames.slice(0, 8),
        target_symbol: targetSymbol,
        same_file_symbols: sameFileSymbols,
      },
      target_function: targetFunction,
      same_file_functions: sameFileFunctions,
      mismatch_patterns: mismatchPatterns,
      past_prs: {
        touching_prs: touchingPrs,
        search_terms: [targetSymbol, sourcePath, ...mismatchQueries].filter(Boolean).slice(0, 8),
      },
      resources: resourceHits,
      path_facts: pathFacts,
      review_risks: asRecordArray(prHistory.review_risks).slice(0, 6),
      tactics: asRecordArray(prHistory.tactics).slice(0, 6),
      follow_up_queries: followUpQueries,
    },
    no_context_note:
      functions.length === 0 && mismatchPatterns.length === 0 && touchingPrs.length === 0 && resourceHits.length === 0 && pathFacts.length === 0
        ? "Graph file card had no attached functions, patterns, PRs, resources, or path facts for this source path."
        : null,
  });
}

function targetGraphFileCardXml(packet: Record<string, unknown>, project?: RunProjectMetadata): string {
  const compactCard = compactTargetGraphFileCard(packet, project);
  const status = optionalString(compactCard.status);
  const unavailable = status && status !== "ready" ? ' unavailable="true"' : "";
  return [`    <target_graph_file_card${unavailable}>`, jsonBlockXml("details_json", compactCard), "    </target_graph_file_card>"].join("\n");
}

export function workerPromptInputXml(options: WorkerPromptInputXmlOptions): WorkerPromptInputXml {
  const target = (options.packet.target ?? {}) as Record<string, unknown>;
  const baseline = asRecord(options.packet.baseline);
  const primarySourcePath = String(target.source_path ?? "");
  const primarySourceAbs = primarySourcePath ? resolve(options.repoRoot, primarySourcePath) : "";
  return {
    targetXml: targetXml(target, baseline, primarySourcePath, primarySourceAbs),
    baselineXml: baselineXml(baseline),
    targetGraphFileCardXml: targetGraphFileCardXml(options.packet, options.project),
  };
}

export function workerPrompt(options: WorkerPromptOptions): PiPromptBundle {
  const systemTemplatePath = templatePath("system");
  const userTemplatePath = templatePath("initial_user");
  const inputXml = workerPromptInputXml({ packet: options.packet, repoRoot: options.repoRoot, project: options.project });
  const toolContext = {
    role: "worker" as const,
    cwd: options.repoRoot,
    repoRoot: options.repoRoot,
    stateDir: options.stateDir,
    project: options.project,
    packet: options.packet,
    initialBoardPath: options.initialBoardPath,
    workerLogDir: options.workerLogDir,
  };
  const values = {
    AVAILABLE_TOOLS_XML: availableToolsPromptXml(toolContext),
    BASELINE_XML: inputXml.baselineXml,
    DECOMP_STANDARDS_XML: globalStandardsPromptXml(),
    REPAIR_REQUEST_XML: repairRequestXml(options.packet),
    TARGET_GRAPH_FILE_CARD_XML: inputXml.targetGraphFileCardXml,
    TARGET_XML: inputXml.targetXml,
  };
  return {
    systemPrompt: renderTemplate(readTemplate(systemTemplatePath), values),
    userPrompt: renderTemplate(readTemplate(userTemplatePath), values),
    systemTemplatePath,
    userTemplatePath,
  };
}
