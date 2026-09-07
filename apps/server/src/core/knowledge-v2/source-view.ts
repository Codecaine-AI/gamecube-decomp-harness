/** Read-only C source projection using syntax nodes and unambiguous KB function identities. */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { parser } from "@lezer/cpp";
import type { SyntaxNode } from "@lezer/common";
import { gameKnowledgeRoot } from "../knowledge/paths.js";
import { inferredNameProblem } from "./naming.js";

export interface SourceName {
  symbol: string;
  stable_key: string;
  source_path: string;
  value: string | null;
  confidence: number | null;
  fact_id: string | null;
  updated_at: string | null;
}

export interface SourceViewOptions {
  path: string;
  source: string;
  names: readonly SourceName[];
  startLine?: number;
  maxLines?: number;
  maxChars?: number;
  knowledgeStatus?: string;
}

export interface SourceViewSymbol {
  canonical: string;
  proposed: string | null;
  confidence: number | null;
  subject: string | null;
  fact_id: string | null;
  fact_updated_at: string | null;
  status: string;
}

export interface SourceView {
  status: "ok" | "line_out_of_range" | "line_too_long" | "file_too_large";
  path: string;
  source_sha256: string;
  start_line: number;
  end_line: number;
  total_lines: number;
  next_line: number | null;
  content: string;
  substitutions: number;
  symbols: SourceViewSymbol[];
  symbols_omitted: number;
  parse_errors: number;
  knowledge_status: string;
}

export const SOURCE_VIEW_MAX_BYTES = 2_000_000;
const DEFAULT_CHARS = 32_000;

export function sourceViewStartLine(source: string, symbol: string, budget: number): number {
  if (source.length < budget / 2) return 1;
  let from = 0;
  parser.parse(source).iterate({ enter(ref) {
    if (ref.name !== "FunctionDefinition") return;
    const declarator = ref.node.getChild("FunctionDeclarator")?.getChild("Identifier");
    if (declarator && source.slice(declarator.from, declarator.to) === symbol) from = ref.from;
  } });
  return Math.max(1, source.slice(0, from).split("\n").length - 12);
}

function bounded(value: number | undefined, fallback: number, low: number, high: number): number {
  return Number.isFinite(value) ? Math.min(high, Math.max(low, Math.floor(value!))) : fallback;
}

function parents(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let parent = node.parent; parent; parent = parent.parent) result.push(parent);
  return result;
}

function functionDeclaration(node: SyntaxNode): SyntaxNode | null {
  // Only a direct function declarator at file scope, never a pointer variable or member.
  if (node.parent?.name !== "FunctionDeclarator" || node.parent.firstChild?.from !== node.from) return null;
  const owner = node.parent.parent;
  return owner && ["Declaration", "FunctionDefinition"].includes(owner.name)
    && owner.parent?.name === "Program" ? owner : null;
}

function isBinding(node: SyntaxNode): boolean {
  let current = node.parent;
  while (current && /Declarator$/.test(current.name)) {
    // The RHS of an initializer is an expression, not a declaration binding.
    if (current.name === "InitDeclarator" && current.firstChild?.to! <= node.from) return false;
    current = current.parent;
  }
  return current !== null && ["Declaration", "ParameterDeclaration", "FieldDeclaration", "TypeDefinition", "Enumerator"].includes(current.name);
}

/** Query canonical identities too, so missing guesses and duplicate symbols cannot silently resolve. */
export function loadSourceNames(source: string, gameId = "melee"): { names: SourceName[]; status: string } {
  const path = resolve(gameKnowledgeRoot(gameId), "knowledge.sqlite");
  if (!existsSync(path)) return { names: [], status: "knowledge_unavailable" };
  const identifiers = [...new Set(source.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])];
  const db = new Database(path, { readonly: true });
  try {
    const names: SourceName[] = [];
    db.exec("BEGIN");
    for (let offset = 0; offset < identifiers.length; offset += 400) {
      const batch = identifiers.slice(offset, offset + 400);
      names.push(...db.query<SourceName, string[]>(`SELECT t.symbol, t.stable_key, e.locator source_path,
        f.value, f.confidence, f.id fact_id, f.updated_at
        FROM target t JOIN entity e ON e.id=t.unit_entity_id
        LEFT JOIN fact f ON f.target_id=t.id AND f.type='inferred_name'
        WHERE t.kind='function' AND t.identity_status='current'
          AND t.symbol IN (${batch.map(() => "?").join(",")})`).all(...batch));
    }
    return { names, status: "available" };
  } finally { db.close(); }
}

/** Preserve original line numbers; source text, source symbols, and KB facts are never mutated. */
export function renderSourceView(options: SourceViewOptions): SourceView {
  const { source, path } = options;
  const totalLines = source.split("\n").length;
  const start = bounded(options.startLine, 1, 1, Number.MAX_SAFE_INTEGER);
  const maxLines = bounded(options.maxLines, 240, 1, 2000);
  const budget = bounded(options.maxChars, DEFAULT_CHARS, 1500, 64_000);
  const result: SourceView = {
    status: "ok", path, source_sha256: createHash("sha256").update(source).digest("hex"),
    start_line: start, end_line: start - 1, total_lines: totalLines, next_line: null,
    content: "", substitutions: 0, symbols: [], symbols_omitted: 0, parse_errors: 0,
    knowledge_status: options.knowledgeStatus ?? "available",
  };
  if (Buffer.byteLength(source) > SOURCE_VIEW_MAX_BYTES) return { ...result, status: "file_too_large" };
  if (start > totalLines) return { ...result, status: "line_out_of_range" };
  const overhead = formatSourceView({ ...result, next_line: totalLines }).length + 160;
  const identifiers: SyntaxNode[] = [];
  const errors: Array<{ from: number; to: number }> = [];
  const macros = new Set<string>();
  const allWords = new Set(source.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  const tree = parser.parse(source);
  tree.iterate({ enter(ref) {
    const node = ref.node;
    if (node.type.isError) {
      result.parse_errors++;
      const owner = parents(node).find((parent) => ["FunctionDefinition", "Declaration"].includes(parent.name));
      errors.push(owner ? { from: owner.from, to: owner.to } : { from: node.from, to: node.to });
    }
    if (node.name === "PreprocDirective") {
      const match = /^\s*#\s*(?:define|undef)\s+([A-Za-z_]\w*)/.exec(source.slice(node.from, node.to));
      if (match) macros.add(match[1]);
    }
    if (node.name === "Identifier") identifiers.push(node);
  } });

  const shadowed = new Set<string>();
  const declarations = new Map<string, SyntaxNode[]>();
  for (const node of identifiers) {
    if (parents(node).some((parent) => parent.name.startsWith("Preproc"))) continue;
    const name = source.slice(node.from, node.to);
    const declaration = functionDeclaration(node);
    if (declaration) declarations.set(name, [...declarations.get(name) ?? [], declaration]);
    else if (isBinding(node)) shadowed.add(name);
  }
  const groups = new Map<string, SourceName[]>();
  for (const name of options.names) groups.set(name.symbol, [...groups.get(name.symbol) ?? [], name]);
  const decisions = new Map<string, SourceViewSymbol>();
  for (const [canonical, candidates] of groups) {
    const local = candidates.filter((candidate) => candidate.source_path === path);
    const choices = local.length ? local : candidates;
    const match = choices.length === 1 ? choices[0] : null;
    let status = match ? "no_guess" : "ambiguous_identity";
    if (match?.value) status = inferredNameProblem(match.value, { targetKind: "function", symbol: canonical }) ? "invalid_guess" : "substituted";
    if (match && !local.length && (declarations.get(canonical) ?? []).some((node) =>
      node.name === "FunctionDefinition" || /^\s*static\b/.test(source.slice(node.from, node.to)))) status = "different_file_binding";
    if (shadowed.has(canonical)) status = "shadowed_binding";
    if (macros.has(canonical) || (match?.value && macros.has(match.value))) status = "macro_binding";
    if (match?.value && allWords.has(match.value) && match.value !== canonical) status = "name_collision";
    decisions.set(canonical, {
      canonical, proposed: match?.value ?? null, confidence: match?.confidence ?? null,
      subject: match?.stable_key ?? null, fact_id: match?.fact_id ?? null,
      fact_updated_at: match?.updated_at ?? null, status,
    });
  }
  const aliasGroups = new Map<string, SourceViewSymbol[]>();
  for (const decision of decisions.values()) if (decision.status === "substituted" && decision.proposed) {
    aliasGroups.set(decision.proposed, [...aliasGroups.get(decision.proposed) ?? [], decision]);
  }
  for (const group of aliasGroups.values()) if (group.length > 1) for (const decision of group) decision.status = "name_collision";

  const lines = source.split("\n");
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") lineStarts.push(i + 1);
  const occurrences = new Map<number, Array<{ from: number; to: number; decision: SourceViewSymbol }>>();
  let lineIndex = 0;
  for (const node of identifiers) {
    while (lineIndex + 1 < lineStarts.length && lineStarts[lineIndex + 1] <= node.from) lineIndex++;
    const ancestors = parents(node);
    if (ancestors.some((parent) => parent.name.startsWith("Preproc"))) continue;
    if (ancestors.some((parent) => ["LabeledStatement", "GotoStatement", "ScopedIdentifier", "NamespaceDefinition", "ClassSpecifier", "StructSpecifier", "UnionSpecifier"].includes(parent.name))) continue;
    const canonical = source.slice(node.from, node.to);
    const known = decisions.get(canonical);
    const isCall = node.parent?.name === "CallExpression" && node.parent.firstChild?.from === node.from;
    if (!known && !isCall && !functionDeclaration(node)) continue;
    let decision: SourceViewSymbol = known ?? { canonical, proposed: null, confidence: null, subject: null, fact_id: null, fact_updated_at: null, status: "no_kb_identity" };
    if (errors.some((error) => node.from >= error.from && node.to <= error.to)) decision = { ...decision, status: "parse_uncertain" };
    const list = occurrences.get(lineIndex) ?? [];
    list.push({ from: node.from - lineStarts[lineIndex], to: node.to - lineStarts[lineIndex], decision });
    occurrences.set(lineIndex, list);
  }

  const seen = new Map<string, SourceViewSymbol>();
  const rendered: string[] = [];
  let usedChars = 0;
  for (let index = start - 1; index < Math.min(lines.length, start - 1 + maxLines); index++) {
    const edits = occurrences.get(index) ?? [];
    const nextSymbols = new Map(seen);
    let line = lines[index];
    let substitutions = 0;
    for (const edit of [...edits].reverse()) {
      nextSymbols.set(`${edit.decision.canonical}:${edit.decision.status}`, edit.decision);
      if (edit.decision.status === "substituted") {
        line = line.slice(0, edit.from) + edit.decision.proposed! + line.slice(edit.to);
        substitutions++;
      }
    }
    // Reserve the full footer for substitutions. Unknown identities are capped separately.
    const footerCost = [...nextSymbols.values()].filter((entry) => entry.proposed).reduce((n, entry) => n + symbolLine(entry).length + 1, 0);
    if (usedChars + line.length + footerCost + overhead > budget) break;
    for (const [key, value] of nextSymbols) seen.set(key, value);
    rendered.push(line);
    usedChars += line.length + 1;
    result.substitutions += substitutions;
    result.end_line = index + 1;
  }
  if (!rendered.length) return { ...result, status: "line_too_long" };
  result.content = rendered.join("\n");
  result.next_line = result.end_line < totalLines ? result.end_line + 1 : null;
  const named = [...seen.values()].filter((entry) => entry.proposed);
  const unknown = [...seen.values()].filter((entry) => !entry.proposed);
  let room = budget - usedChars - named.reduce((n, entry) => n + symbolLine(entry).length + 1, 0) - overhead;
  result.symbols = named;
  for (const entry of unknown) {
    const cost = symbolLine(entry).length + 1;
    if (room >= cost) { result.symbols.push(entry); room -= cost; }
    else result.symbols_omitted++;
  }
  return result;
}

function symbolLine(symbol: SourceViewSymbol): string {
  return `${symbol.canonical} -> ${symbol.proposed ?? "[unchanged]"} | ${symbol.status}${symbol.confidence === null ? "" : ` | confidence ${symbol.confidence}`}${symbol.subject ? ` | ${symbol.subject}` : ""}`;
}

export function formatSourceView(view: SourceView): string {
  return [
    `Proposed-name reading view: ${view.path} | lines ${view.start_line}-${view.end_line}/${view.total_lines} | ${view.status}`,
    `Source SHA-256: ${view.source_sha256}`,
    "Names are hypotheses. Edit/read canonical source before patching; use original symbols in tools and citations. Lines match the source; columns may differ.",
    "Coverage: function names only. Fields, parameters, data-section labels, comments, strings, and preprocessor directives stay unchanged.",
    `Knowledge: ${view.knowledge_status}; parse errors: ${view.parse_errors}; substitutions: ${view.substitutions}.`,
    view.content,
    "Symbols in this excerpt (canonical -> proposed):",
    ...view.symbols.map(symbolLine),
    ...(view.symbols_omitted ? [`${view.symbols_omitted} unchanged symbols omitted from footer.`] : []),
    ...(view.status === "line_too_long" ? ["This line and its symbol map exceed the reading budget. Read the canonical file for this region, or request a later start_line."] : []),
    ...(view.next_line ? [`Continue with knowledge_render_file path=${JSON.stringify(view.path)} start_line=${view.next_line}.`] : []),
  ].join("\n");
}

export function sourceViewForText(path: string, source: string, options: Omit<SourceViewOptions, "path" | "source" | "names"> & { gameId?: string } = {}): SourceView {
  try {
    if (Buffer.byteLength(source) > SOURCE_VIEW_MAX_BYTES) return renderSourceView({ ...options, path, source, names: [] });
    const knowledge = loadSourceNames(source, options.gameId);
    return renderSourceView({ ...options, path, source, names: knowledge.names, knowledgeStatus: knowledge.status });
  } catch {
    return renderSourceView({ ...options, path, source, names: [], knowledgeStatus: "knowledge_unavailable" });
  }
}
