import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { objdiffRowScore } from "@server/core/validation/objdiff/constants.js";
import {
  gitFileText,
  mergeNonCContestedFile,
  normalizeSourcePath,
  policyContestedPaths,
  takeUpstreamFileWhole,
  type ApplyScoreMergePolicyInput,
  type PolicyMergeFileLog,
} from "./policy-merge.js";

/**
 * The certified sync rule (`matching.syncMergePolicy: "certified"`, SMS), the
 * harness port of the 2026-10-17 manual SMS sync (`sms-sync-c`, scripts
 * `funcsplice.py` and `policy_overrides.py`).
 *
 * Per function in a conflicting hunk of a contested source file, and per
 * function both sides changed in such a file:
 * 1. upstream wins by default;
 * 2. ours wins only when every report symbol of the function is gate-certified
 *    (a pass at ours itself, no unverified or rollback hold) and scores
 *    strictly higher than upstream's;
 * 3. an uncertified ours that scores higher loses and is recorded as an open
 *    target (`UNCERTIFIED_DISPLACED_REASON`);
 * 4. a fabricated stub (an empty or comment-only body) never beats upstream;
 *    declaration-only and comment-only ours hunks resolve to upstream;
 * 5. everything else keeps git's merge exactly: no helper is reverted, dropped
 *    or deduplicated. A merged tree that no longer builds goes to the boundary
 *    build fixer, else the operator (recorded with the decisions).
 *
 * Functions are identified by signature and lexical scope (namespaces,
 * preprocessor branches); one the merge must keep but the merged text lacks
 * goes beside a neighbour of its own scope, or to the operator.
 * Conflicting header hunks resolve to upstream (renames, accessors, version
 * `#if` blocks stay upstream's). A file whose function boundaries cannot be
 * resolved stops the merge for an operator, with the certification status of
 * the file's differing functions in the message.
 */

export type SyncCertificationStatus = "certified" | "unverified" | "rollback_held" | "uncertified" | "never_gated";

export interface SyncCertification {
  status: SyncCertificationStatus;
  /** The latest steering verdict when one exists (`pass`, `unresolved`, `gate_pass`, ...). */
  verdict: string | null;
}

/**
 * Certification of one report function (report unit, mangled symbol) at our
 * pinned pre-merge head. `functionKey` (the source signature key) lets the
 * reader bind evidence to the function's own text when its file changed.
 */
export type SyncCertificationLookup = (target: { unit: string; symbol: string; sourcePath: string; functionKey?: string }) => SyncCertification;

/** Every function is uncertified: the rule then always lets upstream win a conflict. */
export const NO_SYNC_CERTIFICATION: SyncCertificationLookup = () => ({ status: "never_gated", verdict: null });

export const UNCERTIFIED_DISPLACED_REASON = "uncertified ours displaced by upstream";

export type CertifiedDecisionCategory = "ours_only_change" | "upstream_only_change" | "both_changed" | "header_hunks";

export type CertifiedDecisionResult = "ours" | "upstream" | "merged" | "dropped";

export type CertifiedDecisionReason =
  | "certified_ours_higher"
  | "uncertified_ours_displaced"
  | "upstream_not_lower"
  | "ours_fabricated_stub"
  | "score_missing"
  | "ours_only_change"
  | "ours_only_change_upstream_higher"
  | "upstream_only_change"
  | "parents_identical"
  | "upstream_only"
  | "ours_only_addition"
  | "upstream_removed"
  | "outside_conflict"
  | "header_hunk_upstream";

export interface CertifiedSymbolEvidence {
  unit: string;
  symbol: string;
  oursScore: number | null;
  upstreamScore: number | null;
  certification: SyncCertification;
}

/** One row of the sync's decision record (`function-decisions.tsv`). */
export interface CertifiedFunctionDecision {
  path: string;
  /** Source-level key: qualified name and parameter count (`TAnimalBase::perform/2`). */
  function: string;
  category: CertifiedDecisionCategory;
  /** The text the merged file holds for the function. */
  result: CertifiedDecisionResult;
  reason: CertifiedDecisionReason;
  /** Overlapped by a conflicting hunk. The rule also decides functions both sides changed elsewhere in the file (`certifiedRuleDecided`). */
  inConflict: boolean;
  symbols: CertifiedSymbolEvidence[];
  /** Ours scored higher but was not certified: an open target, requeued by the boundary. */
  displaced: boolean;
  note: string;
}

// ---------------------------------------------------------------------------
// Source blocks (port of fslib.blocks): top-level brace blocks of C/C++ with a
// function-like header. Namespaces and `extern "C"` are transparent.

interface SourceBlock {
  start: number;
  /** Exclusive line index. */
  end: number;
  header: string;
  key: string;
  /** Its lexical scope: enclosing namespaces and preprocessor branches (`namespace JGeometry>if VERSION == 0`); part of its key. */
  scope: string;
}

/**
 * One line without comments, twice over: `masked` blanks string and char
 * literals (for syntax scanning: braces, parentheses, semicolons) and
 * `literal` keeps them; both have the same length, so positions found in
 * one slice the other. Literal-only changes are real changes.
 */
function codeViews(line: string, state: { blockComment: boolean }): { masked: string; literal: string } {
  let masked = "";
  let literal = "";
  let index = 0;
  while (index < line.length) {
    if (state.blockComment) {
      const close = line.indexOf("*/", index);
      if (close < 0) break;
      state.blockComment = false;
      index = close + 2;
      continue;
    }
    const char = line[index]!;
    // A comment still separates tokens (`return/**/foo()` is not `returnfoo()`):
    // a block comment becomes one space, a line comment a newline.
    if (line.startsWith("//", index)) {
      masked += "\n";
      literal += "\n";
      break;
    }
    if (line.startsWith("/*", index)) {
      state.blockComment = true;
      masked += " ";
      literal += " ";
      index += 2;
      continue;
    }
    if (char === "\"" || char === "'") {
      let end = index + 1;
      while (end < line.length && line[end] !== char) end += line[end] === "\\" ? 2 : 1;
      end = Math.min(end + 1, line.length);
      const text = line.slice(index, end);
      literal += text;
      masked += char + "_".repeat(Math.max(0, text.length - 2)) + (text.length > 1 ? char : "");
      index = end;
      continue;
    }
    masked += char;
    literal += char;
    index += 1;
  }
  return { masked, literal };
}

function stripCode(line: string, state: { blockComment: boolean }): string {
  const out: string[] = [];
  let index = 0;
  while (index < line.length) {
    if (state.blockComment) {
      const close = line.indexOf("*/", index);
      if (close < 0) return out.join("");
      state.blockComment = false;
      index = close + 2;
      continue;
    }
    const char = line[index]!;
    // Comments keep token boundaries: a block comment is one space, a line comment a newline.
    if (line.startsWith("//", index)) {
      out.push("\n");
      break;
    }
    if (line.startsWith("/*", index)) {
      state.blockComment = true;
      out.push(" ");
      index += 2;
      continue;
    }
    if (char === "\"" || char === "'") {
      index += 1;
      while (index < line.length && line[index] !== char) index += line[index] === "\\" ? 2 : 1;
      index += 1;
      out.push("\"\"");
      continue;
    }
    out.push(char);
    index += 1;
  }
  return out.join("");
}

const TRANSPARENT = /^\s*(namespace\b[^{]*|extern\s*"C"\s*)\{\s*$/;

/** Index of the `)` closing the `(` at `open`, or -1. */
function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    else if (text[index] === ")" && --depth === 0) return index;
  }
  return -1;
}

/** Splits at top-level commas (outside `<>`, `()`, `[]`, `{}`). */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if ("<([{".includes(char)) depth += 1;
    else if (">)]}".includes(char)) depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  parts.push(current);
  return parts;
}

const TYPE_WORDS = new Set(["void", "bool", "char", "short", "int", "long", "float", "double", "signed", "unsigned", "const", "volatile", "struct", "class", "union", "enum", "typename", "wchar_t"]);

function compactType(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\s*([*&,<>()[\]])\s*/g, "$1").trim();
}

/** A parameter's type: default value and parameter name removed, spacing normalised (`JKRHeap* param_1` -> `JKRHeap*`). */
export function parameterType(param: string): string {
  let text = param.replace(/\s+/g, " ").trim();
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if ("<([{".includes(char)) depth += 1;
    else if (">)]}".includes(char)) depth -= 1;
    else if (char === "=" && depth === 0) {
      text = text.slice(0, index).trim();
      break;
    }
  }
  if (text === "..." || text.includes("(")) return compactType(text);
  const arrays = /(?:\s*\[[^\]]*\])+$/.exec(text);
  const suffix = arrays ? arrays[0].replace(/\s+/g, "") : "";
  if (arrays) text = text.slice(0, arrays.index).trim();
  const named = /^(.*[\w>*&\]])\s*\b([A-Za-z_]\w*)$/.exec(text);
  if (named && !TYPE_WORDS.has(named[2]!) && !named[1]!.endsWith("::")
    && !/^(?:(?:const|volatile|struct|class|union|enum|typename|signed|unsigned)\s*)+$/.test(named[1]!.trim())) {
    text = named[1]!;
  }
  return compactType(text) + suffix;
}

/**
 * A function's identity: qualified name, normalised parameter types and
 * cv-qualifiers (`TFoo::get(int,const TVec3<f>&)const`), so overloads never
 * share a key. Null for operators and headers it cannot read.
 */
export function functionSignatureKey(header: string): string | null {
  const open = header.indexOf("(");
  if (open < 0 || /\boperator\b/.test(header)) return null;
  const close = closingParen(header, open);
  if (close < 0) return null;
  const prefix = header.slice(0, open).trimEnd();
  const name = /([~\w:]+(?:<[^<>]*>)?(?:::[~\w]+)*)$/.exec(prefix)?.[1];
  if (!name) return null;
  const params = header.slice(open + 1, close).trim();
  if (/^[A-Z_][A-Z0-9_]*$/.test(name)) return `${name}:${(splitTopLevel(params)[0] ?? "").trim()}`;
  const types = !params || params === "void" ? [] : splitTopLevel(params).map(parameterType);
  // Qualifiers between `)` and a constructor's initialiser list.
  const tail = header.slice(close + 1).replace(/:(?!:)[\s\S]*$/, "");
  const qualifiers = ["const", "volatile"].filter((word) => new RegExp(`\\b${word}\\b`).test(tail)).join(" ");
  return `${name}(${types.join(",")})${qualifiers}`;
}

/** Name and parameter count of a signature key (`TFoo::beta(int)` -> `TFoo::beta`, 1); macro keys have no count. */
export function signatureNameAndArity(key: string): { name: string; arity: number | null; types: string[] | null } {
  const bare = unscopedKey(key);
  const open = bare.indexOf("(");
  if (open < 0) return { name: bare, arity: null, types: null };
  const params = bare.slice(open + 1, bare.lastIndexOf(")"));
  const types = params ? splitTopLevel(params) : [];
  return { name: bare.slice(0, open), arity: types.length, types };
}

/** A top-level brace block the rule does not map to a function: class bodies, data, operators. */
interface UnmappedBlock {
  start: number;
  end: number;
  header: string;
  key: string;
  scope: string;
  /** Holds executable code (a function body: inline members, an operator). */
  codeBearing: boolean;
}

function innerCodeBearing(lines: string[], start: number, end: number): boolean {
  const state = { blockComment: false };
  const code = lines.slice(start, end).map((line) => stripCode(line, state)).join("\n");
  const inner = code.slice(code.indexOf("{") + 1, code.lastIndexOf("}"));
  return /\)\s*(?:(?:const|volatile|noexcept|override)\b\s*)*\{/.test(inner);
}

/** Top-level function blocks keyed by signature (`#n` for repeats), the other blocks, and unbalanced-brace errors. */
export function topLevelFunctionBlocks(lines: string[]): { blocks: SourceBlock[]; unmapped: UnmappedBlock[]; errors: string[] } {
  const state = { blockComment: false };
  const raw: Array<Omit<SourceBlock, "key">> = [];
  // Open namespaces / extern "C" (part of a block's scope).
  const transparent: Array<{ label: string }> = [];
  // Top-level `#if` nesting: each open conditional's directive and current branch.
  const conditionals: Array<{ open: string; branch: string }> = [];
  const directive = (text: string) => text.trim().replace(/^#\s*/, "").replace(/\s+/g, " ");
  const errors: string[] = [];
  let depth = 0;
  let gapStart = 0;
  let openLine = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const code = stripCode(line, state);
    if (depth === 0 && line.trimStart().startsWith("#")) {
      const text = directive(stripCode(line, { blockComment: false }));
      const word = /^(\w+)/.exec(text)?.[1] ?? "";
      if (word === "if" || word === "ifdef" || word === "ifndef") conditionals.push({ open: text, branch: text });
      else if ((word === "elif" || word === "else") && conditionals.length > 0) conditionals.at(-1)!.branch = `${conditionals.at(-1)!.open}/${text}`;
      else if (word === "endif") conditionals.pop();
      gapStart = index + 1;
      continue;
    }
    if (depth === 0 && TRANSPARENT.test(code)) {
      const namespace = /^\s*namespace\s*([\w:]*)\s*\{/.exec(code);
      transparent.push(namespace
        ? { label: `namespace ${namespace[1] || "(anonymous)"}` }
        : { label: "extern C" });
      gapStart = index + 1;
      continue;
    }
    for (const char of code) {
      if (char === "{") {
        if (depth === 0) openLine = index;
        depth += 1;
      } else if (char === "}") {
        if (depth === 0 && transparent.length > 0) {
          transparent.pop();
          gapStart = index + 1;
          continue;
        }
        depth -= 1;
        if (depth < 0) {
          errors.push(`unexpected closing brace at line ${index + 1}`);
          depth = 0;
          continue;
        }
        if (depth === 0) {
          let headerStart = gapStart;
          while (headerStart < openLine && !lines[headerStart]!.trim()) headerStart += 1;
          let header = lines.slice(headerStart, openLine + 1).map((part) => stripCode(part, { blockComment: false })).join(" ");
          if (header.includes("{")) header = header.slice(0, header.indexOf("{"));
          raw.push({
            start: headerStart, end: index + 1, header: header.trim(),
            scope: [...transparent.map((entry) => entry.label), ...conditionals.map((open) => open.branch)].join(">"),
          });
          gapStart = index + 1;
        }
      } else if (char === ";" && depth === 0) {
        gapStart = index + 1;
      }
    }
  }
  if (depth !== 0) errors.push("unbalanced braces");
  if (state.blockComment) errors.push("unterminated block comment");

  const blocks: SourceBlock[] = [];
  const unmapped: UnmappedBlock[] = [];
  for (const block of raw) {
    const header = block.header;
    const scoped = (key: string) => block.scope ? `${key}@[${block.scope}]` : key;
    const beforeParen = header.split("(")[0] ?? "";
    // `operator==` and friends carry `=` before the parameters: never data.
    const isOperator = /\boperator\b/.test(beforeParen);
    const dataOrType = !isOperator && (!header.includes("(") || /\b(class|struct|union|enum)\b/.test(beforeParen) || /=\s*$/.test(header) || beforeParen.includes("="));
    const signature = dataOrType ? null : functionSignatureKey(header);
    if (signature) {
      blocks.push({ ...block, key: scoped(signature) });
      continue;
    }
    const isData = !isOperator && (/=\s*$/.test(header) || beforeParen.includes("="));
    unmapped.push({
      ...block,
      key: scoped(`{${compactType(header)}}`),
      codeBearing: !dataOrType || (!isData && innerCodeBearing(lines, block.start, block.end)),
    });
  }
  for (const list of [blocks, unmapped] as Array<Array<{ key: string }>>) {
    const seen = new Map<string, number>();
    for (const block of list) {
      const count = (seen.get(block.key) ?? 0) + 1;
      seen.set(block.key, count);
      if (count > 1) block.key = `${block.key}#${count}`;
    }
  }
  return { blocks, unmapped, errors };
}

/**
 * The executable part of a block: a class, struct or union body's member
 * function bodies (with their headers), else the whole block; comments,
 * strings and whitespace normalised.
 */
const LITERAL = /"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?/g;

/** Whitespace and access labels normalised outside string and char literals; literals byte for byte. */
function normalizeOutsideLiterals(text: string): string {
  let out = "";
  let last = 0;
  const code = (part: string) => part.replace(/\b(?:public|private|protected)\s*:/g, "").replace(/\s+/g, " ");
  for (const match of text.matchAll(LITERAL)) {
    out += code(text.slice(last, match.index)) + match[0];
    last = match.index! + match[0].length;
  }
  return (out + code(text.slice(last))).trim();
}

function executableText(lines: string[], header: string): string {
  const state = { blockComment: false };
  const views = lines.map((line) => codeViews(line, state));
  const masked = views.map((view) => view.masked).join("\n");
  const literal = views.map((view) => view.literal).join("\n");
  const beforeParen = header.split("(")[0] ?? "";
  const container = !header.includes("(") || /\b(class|struct|union)\b/.test(beforeParen);
  const normal = normalizeOutsideLiterals;
  if (!container) return normal(literal);
  const open = masked.indexOf("{") + 1;
  const inner = masked.slice(open, masked.lastIndexOf("}"));
  const pieces: string[] = [];
  let depth = 0;
  let statement = 0;
  let body: number | null = null;
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index]!;
    if (char === "{") {
      if (depth === 0 && /\)\s*(?:(?:const|volatile|noexcept|override)\b\s*)*$/.test(inner.slice(statement, index))) body = statement;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        if (body !== null) pieces.push(normal(literal.slice(open + body, open + index + 1)));
        body = null;
        statement = index + 1;
      }
    } else if (char === ";" && depth === 0) statement = index + 1;
  }
  return pieces.join("\n");
}

/**
 * Code the rule cannot map to a function (class bodies with inline members,
 * operators, and, with `includeFunctions`, every function: a header's inline
 * functions have no report evidence) where a conflict changed ours' version.
 * The rule never resolves those silently: the file goes to the operator.
 */
export function unmappedCodeConflicts(input: {
  merged: string[];
  ranges: Array<[number, number]>;
  ours: string[];
  base: string[];
  includeFunctions: boolean;
}): string[] {
  const parse = (lines: string[]) => {
    const parsed = topLevelFunctionBlocks(lines);
    const code = [...parsed.unmapped.filter((block) => block.codeBearing), ...(input.includeFunctions ? parsed.blocks : [])];
    return new Map(code.map((block) => [block.key, block]));
  };
  const [X, O, B] = [parse(input.merged), parse(input.ours), parse(input.base)];
  // Only executable code counts: a class body's declarations may follow upstream.
  const text = (lines: string[], block: { start: number; end: number; header: string } | undefined) => block ? executableText(lines.slice(block.start, block.end), block.header) : null;
  const inHunk = (block: { start: number; end: number }) => input.ranges.some(([start, end]) =>
    (start < end && block.start < end && start < block.end) || (start === end && block.start < start && start < block.end));
  const found: string[] = [];
  for (const [key, block] of O) {
    const ours = text(input.ours, block);
    if (ours === text(input.base, B.get(key))) continue;
    const merged = X.get(key);
    if (!merged || (text(input.merged, merged) !== ours && inHunk(merged))) found.push(key);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Conflict markers (`git merge-tree`, or `git merge-file`), any labels, merge or diff3 style.

const isMark = (line: string, mark: string) => line === mark || line.startsWith(`${mark} `);

interface ResolvedConflicts {
  lines: string[];
  /** Line ranges in `lines` the upstream side of each hunk occupies. */
  ranges: Array<[number, number]>;
  oursTexts: string[][];
  error: string | null;
}

/** Every hunk resolved to upstream's side (what `git merge -X theirs` writes for the file). */
function resolveConflictsToUpstream(text: string): ResolvedConflicts {
  const lines: string[] = [];
  const ranges: Array<[number, number]> = [];
  const oursTexts: string[][] = [];
  let state: "none" | "ours" | "base" | "upstream" = "none";
  let ours: string[] = [];
  let upstream: string[] = [];
  for (const line of text.split("\n")) {
    if (state === "none" && isMark(line, "<<<<<<<")) {
      state = "ours";
      ours = [];
      upstream = [];
    } else if (state === "ours" && isMark(line, "|||||||")) {
      state = "base";
    } else if ((state === "ours" || state === "base") && line === "=======") {
      state = "upstream";
    } else if (state === "upstream" && isMark(line, ">>>>>>>")) {
      ranges.push([lines.length, lines.length + upstream.length]);
      oursTexts.push(ours);
      lines.push(...upstream);
      state = "none";
    } else if (state === "ours") ours.push(line);
    else if (state === "upstream") upstream.push(line);
    else if (state === "none") lines.push(line);
  }
  return { lines, ranges, oursTexts, error: state === "none" ? null : "unterminated conflict hunk" };
}

// ---------------------------------------------------------------------------
// Report evidence: source keys to objdiff symbols (mangled), via demangled names.

interface ReportFunctionRow {
  unit: string;
  symbol: string;
  demangled: string | null;
  score: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** The report's function rows of the unit compiled from `sourcePath` (metadata wins; else `src/<unit minus main/>`). */
export function reportFunctionRows(report: unknown, sourcePath: string): ReportFunctionRow[] {
  const wanted = normalizeSourcePath(sourcePath);
  const units = Array.isArray(asRecord(report).units) ? asRecord(report).units as unknown[] : [];
  const unit = units.map(asRecord).find((candidate) => {
    const metadataPath = asRecord(candidate.metadata).source_path;
    if (typeof metadataPath === "string") return normalizeSourcePath(metadataPath) === wanted;
    return typeof candidate.name === "string"
      && `src/${candidate.name.replace(/^main\//, "")}` === wanted.replace(/\.[^./]+$/, "");
  });
  if (!unit || typeof unit.name !== "string") return [];
  const functions = Array.isArray(unit.functions) ? unit.functions as unknown[] : [];
  return functions.map(asRecord).flatMap((row) => {
    if (typeof row.name !== "string") return [];
    const demangled = asRecord(row.metadata).demangled_name;
    // Objdiff omits zero-valued scores: a listed function without one scored 0.
    return [{ unit: unit.name as string, symbol: row.name, demangled: typeof demangled === "string" ? demangled : null, score: objdiffRowScore(row, 0) }];
  });
}

/** The named namespaces enclosing a key's function (from its lexical scope). */
function keyNamespaces(key: string): string[] {
  const bare = key.replace(/#\d+$/, "");
  const at = bare.indexOf("@[");
  if (at < 0 || !bare.endsWith("]")) return [];
  return bare.slice(at + 2, -1).split(">")
    .filter((part) => part.startsWith("namespace ") && part !== "namespace (anonymous)")
    .flatMap((part) => part.slice("namespace ".length).split("::"));
}

/**
 * Report rows of a source key, bound by its full qualification: the enclosing
 * namespaces plus the written name (`A::f` for `f` inside `namespace A`) must
 * equal the demangled name; exact parameter types pick an overload, else the
 * parameter count. When only a suffix matches (a `using` directive) or the
 * count fits several overloads, the binding is `ambiguous`: the rule never
 * decides on it.
 */
function rowsForKey(rows: ReportFunctionRow[], key: string): { rows: ReportFunctionRow[]; ambiguous: string | null } {
  const { name, arity, types } = signatureNameAndArity(key);
  const qualified = [...keyNamespaces(key), name].join("::");
  const baseOf = (row: ReportFunctionRow) => {
    const display = row.demangled ?? row.symbol;
    return display.includes("(") ? display.slice(0, display.indexOf("(")) : display;
  };
  let named = rows.filter((row) => baseOf(row) === qualified);
  if (named.length === 0) {
    named = rows.filter((row) => baseOf(row).endsWith(`::${qualified}`));
    const bases = [...new Set(named.map(baseOf))];
    if (bases.length > 1) return { rows: named, ambiguous: `report functions ${bases.join(", ")} all end in ${qualified}` };
  }
  if (arity === null) return { rows: named, ambiguous: null };
  const signature = (row: ReportFunctionRow) => row.demangled ? signatureNameAndArity(functionSignatureKey(row.demangled) ?? "") : null;
  const exact = named.filter((row) => signature(row)?.types?.join(",") === types!.join(","));
  if (exact.length > 0) return { rows: exact, ambiguous: null };
  const byArity = named.filter((row) => row.demangled === null || signature(row)?.arity === arity);
  const overloads = [...new Set(byArity.map((row) => row.demangled ?? row.symbol))];
  if (overloads.length > 1) return { rows: byArity, ambiguous: `overloads ${overloads.join(", ")} of ${qualified} match by parameter count only` };
  return { rows: byArity, ambiguous: null };
}

// ---------------------------------------------------------------------------
// The rule.

interface SideDecision {
  side: "ours" | "upstream" | "drop";
  reason: CertifiedDecisionReason;
  displaced: boolean;
}

/** Empty or comment-only body: never a real decompilation. */
export function isFabricatedStub(functionText: string): boolean {
  const state = { blockComment: false };
  const code = functionText.split("\n").map((line) => stripCode(line, state)).join("\n");
  const open = code.indexOf("{");
  const close = code.lastIndexOf("}");
  return open >= 0 && close > open && code.slice(open + 1, close).trim() === "";
}

/** Rule 1-4 for a function both sides changed. */
export function decideBothChanged(oursText: string, evidence: CertifiedSymbolEvidence[]): SideDecision {
  if (isFabricatedStub(oursText)) return { side: "upstream", reason: "ours_fabricated_stub", displaced: false };
  if (evidence.length === 0) return { side: "upstream", reason: "score_missing", displaced: false };
  const higher = (item: CertifiedSymbolEvidence) => item.oursScore !== null && item.upstreamScore !== null && item.oursScore > item.upstreamScore;
  if (evidence.every((item) => higher(item) && item.certification.status === "certified")) {
    return { side: "ours", reason: "certified_ours_higher", displaced: false };
  }
  if (evidence.some((item) => higher(item) && item.certification.status !== "certified")) {
    return { side: "upstream", reason: "uncertified_ours_displaced", displaced: true };
  }
  if (evidence.some((item) => item.oursScore === null || item.upstreamScore === null)) {
    return { side: "upstream", reason: "score_missing", displaced: false };
  }
  return { side: "upstream", reason: "upstream_not_lower", displaced: false };
}

export interface CertifiedFileInput {
  path: string;
  /** The file with git's conflict markers (ours first, upstream second), as `git merge-tree` writes it. */
  conflictedText: string;
  baseText: string;
  oursText: string;
  upstreamText: string;
  evidence: (key: string) => CertifiedSymbolEvidence[];
  /** Why the key's report evidence cannot be bound for sure (null: it can). The rule never decides on it. */
  ambiguity?: (key: string) => string | null;
}

export interface CertifiedFileResult {
  text: string;
  hunks: number;
  decisions: CertifiedFunctionDecision[];
  /** Function boundaries could not be resolved: the file needs an operator. */
  error: string | null;
}

function joined(lines: string[], block: SourceBlock | undefined): string | null {
  return block ? lines.slice(block.start, block.end).join("\n") : null;
}

/** A key without its repeat (`#n`) and preprocessor scope (`@[...]`) suffixes. */
export function unscopedKey(key: string): string {
  const bare = key.replace(/#\d+$/, "");
  const scope = bare.indexOf("@[");
  return scope >= 0 && bare.endsWith("]") ? bare.slice(0, scope) : bare;
}

/** Function-level resolution of one conflicted C/C++ source (port of funcsplice.py with the certified rule). */
export function spliceCertifiedFile(input: CertifiedFileInput): CertifiedFileResult {
  const resolved = resolveConflictsToUpstream(input.conflictedText);
  const failed = (error: string): CertifiedFileResult => ({ text: input.conflictedText, hunks: resolved.ranges.length, decisions: [], error });
  if (resolved.error) return failed(resolved.error);
  const X = resolved.lines;
  const O = input.oursText.split("\n");
  const B = input.baseText.split("\n");
  const U = input.upstreamText.split("\n");
  const parsed = { X: topLevelFunctionBlocks(X), O: topLevelFunctionBlocks(O), B: topLevelFunctionBlocks(B), U: topLevelFunctionBlocks(U) };
  const errors = (["X", "O", "B", "U"] as const).flatMap((side) => parsed[side].errors.map((error) => `${side === "X" ? "merged" : side === "O" ? "ours" : side === "B" ? "base" : "upstream"}: ${error}`));
  if (errors.length > 0) return failed(errors.join("; "));
  const unsupported = unmappedCodeConflicts({ merged: X, ranges: resolved.ranges, ours: O, base: B, includeFunctions: false });
  if (unsupported.length > 0) return failed(`conflicting code the rule cannot map to a function: ${unsupported.join(", ")}`);
  const byKey = (blocks: SourceBlock[]) => new Map(blocks.map((block) => [block.key, block]));
  const mX = byKey(parsed.X.blocks);
  const mO = byKey(parsed.O.blocks);
  const mB = byKey(parsed.B.blocks);
  const mU = byKey(parsed.U.blocks);
  const text = {
    X: (key: string) => joined(X, mX.get(key)),
    O: (key: string) => joined(O, mO.get(key)),
    B: (key: string) => joined(B, mB.get(key)),
    U: (key: string) => joined(U, mU.get(key)),
  };

  // Functions overlapped by a hunk, or whose ours header sits only inside a hunk.
  const touched = new Set<string>();
  for (const [start, end] of resolved.ranges) {
    for (const block of parsed.X.blocks) {
      if ((start < end && block.start < end && start < block.end) || (start === end && block.start < start && start < block.end)) touched.add(block.key);
    }
  }
  for (const ours of resolved.oursTexts) {
    for (const block of topLevelFunctionBlocks(ours).blocks) if (mO.has(block.key)) touched.add(block.key);
  }

  const categoryOf = (key: string): CertifiedDecisionCategory | null => {
    const [o, b, u] = [text.O(key), text.B(key), text.U(key)];
    if (o === u) return null;
    if (u === b) return "ours_only_change";
    if (o === b) return "upstream_only_change";
    return "both_changed";
  };

  const decided = new Map<string, SideDecision>();
  const evidenceByKey = new Map<string, CertifiedSymbolEvidence[]>();
  const ambiguous = new Map<string, string>();
  const evidence = (key: string) => {
    if (!evidenceByKey.has(key)) evidenceByKey.set(key, input.evidence(key));
    // Consulted for a decision: an unsure binding sends the file to the operator.
    const ambiguity = input.ambiguity?.(key);
    if (ambiguity && !ambiguous.has(key)) ambiguous.set(key, ambiguity);
    return evidenceByKey.get(key)!;
  };
  for (const key of [...touched].sort()) {
    const [inU, inO, inB] = [mU.has(key), mO.has(key), mB.has(key)];
    let decision: SideDecision;
    if (inU && inO && inB && text.U(key) === text.B(key)) {
      // Ours-only change: git keeps it, unless upstream's (base) text scores strictly higher.
      const lower = evidence(key).some((item) => item.oursScore !== null && item.upstreamScore !== null && item.upstreamScore > item.oursScore);
      decision = lower
        ? { side: "upstream", reason: "ours_only_change_upstream_higher", displaced: false }
        : { side: "ours", reason: "ours_only_change", displaced: false };
    } else if (inU && inO && inB && text.O(key) === text.B(key)) {
      decision = { side: "upstream", reason: "upstream_only_change", displaced: false };
    } else if (inU && inO && !inB && text.O(key) === text.U(key)) {
      decision = { side: "upstream", reason: "parents_identical", displaced: false };
    } else if (inU && inO) {
      decision = decideBothChanged(text.O(key)!, evidence(key));
    } else if (inU) {
      decision = { side: "upstream", reason: "upstream_only", displaced: false };
    } else if (inO && !inB) {
      decision = { side: "ours", reason: "ours_only_addition", displaced: false };
    } else if (inO && inB) {
      decision = { side: "drop", reason: "upstream_removed", displaced: false };
    } else {
      continue;
    }
    decided.set(key, decision);
  }
  // As in the manual sync, the rule also covers every function of a conflicted
  // file that both sides changed, even where git merged the two edits without a
  // hunk. Ours-only edits outside the hunks stay exactly as git merged them; a
  // merged tree that no longer builds goes to the boundary build fixer or the operator.
  for (const key of [...new Set([...mO.keys(), ...mU.keys()])].sort()) {
    if (decided.has(key) || !mO.has(key) || !mU.has(key)) continue;
    if (categoryOf(key) === "both_changed") decided.set(key, decideBothChanged(text.O(key)!, evidence(key)));
  }

  // An ours-only addition the hunks resolved away (its lines split across hunks, so no
  // hunk holds its header) is still ours: git would have kept it.
  for (const key of mO.keys()) {
    if (!decided.has(key) && !mX.has(key) && !mB.has(key) && !mU.has(key)) decided.set(key, { side: "ours", reason: "ours_only_addition", displaced: false });
  }

  if (ambiguous.size > 0) {
    return failed(`ambiguous report evidence: ${[...ambiguous].map(([key, why]) => `${key} (${why})`).join("; ")}`);
  }

  const replacements = new Map<string, string[] | null>();
  // A function the merged text lacks goes next to a neighbour of its own scope
  // (namespaces and preprocessor branches): after its nearest preceding one, else
  // before its nearest following one. Without such a neighbour it goes to the operator.
  const inserts: Array<{ key: string; lines: string[]; after: string | null; before: string | null }> = [];
  for (const [key, decision] of decided) {
    const lines = decision.side === "drop"
      ? null
      : decision.side === "ours" ? O.slice(mO.get(key)!.start, mO.get(key)!.end) : U.slice(mU.get(key)!.start, mU.get(key)!.end);
    const current = mX.get(key);
    if (current) {
      if (lines !== null && lines.join("\n") === X.slice(current.start, current.end).join("\n")) continue;
      replacements.set(key, lines);
      continue;
    }
    if (lines === null) continue;
    const source = decision.side === "upstream" ? parsed.U.blocks : parsed.O.blocks;
    const index = source.findIndex((block) => block.key === key);
    const scope = source[index]!.scope;
    const sameScope = (block: SourceBlock) => block.scope === scope && mX.has(block.key) && mX.get(block.key)!.scope === scope;
    const after = source.slice(0, index).reverse().find(sameScope)?.key ?? null;
    const before = after ? null : source.slice(index + 1).find(sameScope)?.key ?? null;
    if (!after && !before) return failed(`no place in scope [${scope || "file"}] to keep ${key}`);
    inserts.push({ key, lines, after, before });
  }

  const out: string[] = [];
  let position = 0;
  for (const block of [...parsed.X.blocks].sort((left, right) => left.start - right.start)) {
    out.push(...X.slice(position, block.start));
    for (const insert of inserts) if (insert.before === block.key) out.push(...insert.lines, "");
    const replacement = replacements.has(block.key) ? replacements.get(block.key)! : X.slice(block.start, block.end);
    if (replacement !== null) out.push(...replacement);
    position = block.end;
    for (const insert of inserts) if (insert.after === block.key) out.push("", ...insert.lines);
  }
  out.push(...X.slice(position));

  // Record what the merged file actually holds for every function either side changed.
  const final = topLevelFunctionBlocks(out);
  const mFinal = byKey(final.blocks);
  const decisions: CertifiedFunctionDecision[] = [];
  const keys = [...new Set([...mO.keys(), ...mU.keys()])].sort();
  for (const key of keys) {
    const category = categoryOf(key);
    if (!category) continue;
    const held = joined(out, mFinal.get(key));
    const result: CertifiedDecisionResult = held === null ? "dropped" : held === text.U(key) ? "upstream" : held === text.O(key) ? "ours" : "merged";
    const decision = decided.get(key);
    const symbols = evidenceByKey.get(key) ?? input.evidence(key);
    decisions.push({
      path: input.path,
      function: key,
      category,
      result,
      reason: decision?.reason ?? "outside_conflict",
      inConflict: touched.has(key),
      symbols,
      displaced: Boolean(decision?.displaced) && result !== "ours",
      note: decision?.displaced && result !== "ours" ? UNCERTIFIED_DISPLACED_REASON : "",
    });
  }
  return { text: out.join("\n"), hunks: resolved.ranges.length, decisions, error: null };
}

// ---------------------------------------------------------------------------
// Applying the rule to a merge in progress.

const SOURCE_FILE = /\.(?:c|cc|cpp|cxx|C)$/;
const HEADER_FILE = /\.(?:h|hh|hpp|hxx|inc|inl)$/i;

export interface ApplyCertifiedMergePolicyInput extends ApplyScoreMergePolicyInput {
  certification: SyncCertificationLookup;
  /**
   * A file the rule cannot resolve: `throw` (boundary sync, the merge aborts for
   * an operator) or `leave_unmerged` (operator sync, whose merge keeps git's
   * conflict stages: the file stays for the operator, with its certification).
   */
  unresolvable?: "throw" | "leave_unmerged";
}

export interface ApplyCertifiedMergePolicyResult {
  files: PolicyMergeFileLog[];
  rewrittenPaths: string[];
  decisions: CertifiedFunctionDecision[];
}

/** `git merge-tree --write-tree` of ours and upstream: conflicted files keep their markers. Null when git cannot. */
async function conflictMergeTree(input: ApplyCertifiedMergePolicyInput): Promise<string | null> {
  const result = await input.runGit(input.worktreePath, ["merge-tree", "--write-tree", "--no-messages", input.oursRevision, input.upstreamRevision]);
  if (result.exitCode !== 0 && result.exitCode !== 1) return null;
  const tree = result.stdout.split("\n", 1)[0]?.trim() ?? "";
  return /^[0-9a-f]{40,64}$/.test(tree) ? tree : null;
}

/** Fallback when the merge tree has no copy of the path (an older git, a rename): `git merge-file`. */
async function mergeFileText(
  input: ApplyCertifiedMergePolicyInput,
  path: string,
  sides: Record<"base" | "ours" | "upstream", { text: string; exists: boolean }>,
): Promise<string> {
  const scratch = await mkdtemp(join(tmpdir(), "certified-merge-"));
  try {
    const paths = { ours: join(scratch, "ours"), base: join(scratch, "base"), upstream: join(scratch, "upstream") };
    await Promise.all([writeFile(paths.ours, sides.ours.text), writeFile(paths.base, sides.base.exists ? sides.base.text : ""), writeFile(paths.upstream, sides.upstream.text)]);
    const merged = await input.runGit(input.worktreePath, ["merge-file", "-p", "-L", "ours", "-L", "base", "-L", "upstream", paths.ours, paths.base, paths.upstream]);
    if (merged.exitCode === null || merged.exitCode < 0 || merged.exitCode > 127) {
      throw new Error(`certified merge three-way merge for ${path} failed: ${(merged.stderr || merged.stdout).trim()}`);
    }
    return merged.stdout;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function formatScore(value: number | null): string {
  return value === null ? "-" : String(value);
}

/** The certification of every report function whose score differs between the parents (for an operator). */
function certificationSummary(input: ApplyCertifiedMergePolicyInput, path: string): string {
  const ours = reportFunctionRows(input.reports.ours, path);
  const upstream = new Map(reportFunctionRows(input.reports.upstream, path).map((row) => [row.symbol, row.score]));
  const rows = ours
    .filter((row) => upstream.get(row.symbol) !== row.score)
    .map((row) => {
      const certification = input.certification({ unit: row.unit, symbol: row.symbol, sourcePath: path });
      const status = certification.status === "certified" ? "certified"
        : `uncertified:${certification.status === "uncertified" ? certification.verdict ?? "unknown" : certification.status}`;
      return `${row.demangled ?? row.symbol} [${status}] ours=${row.score} upstream=${formatScore(upstream.get(row.symbol) ?? null)}`;
    });
  if (rows.length === 0) return "no report function differs";
  return rows.length > 20 ? `${rows.slice(0, 20).join("; ")}; ... ${rows.length - 20} more` : rows.join("; ");
}

/** The rule (not git's merge) decided the function's text. */
export function certifiedRuleDecided(decision: CertifiedFunctionDecision): boolean {
  return decision.reason !== "outside_conflict";
}

function certifiedFileMessage(path: string, hunks: number, decisions: CertifiedFunctionDecision[], strategy: string): string {
  const list = (filter: (decision: CertifiedFunctionDecision) => boolean) =>
    decisions.filter(filter).map((decision) => `${decision.function}(${decision.reason})`).join(", ");
  const conflicted = certifiedRuleDecided;
  const displaced = decisions.filter((decision) => decision.displaced).map((decision) => decision.function);
  return `${path}: strategy=${strategy} hunks=${hunks} ours=[${list((decision) => conflicted(decision) && decision.result === "ours")}] `
    + `upstream=[${list((decision) => conflicted(decision) && decision.result === "upstream")}]`
    + (displaced.length > 0 ? ` displaced=[${displaced.join(", ")}]` : "");
}

/** Applies the certified rule to every path both sides changed, during a `--no-commit` merge. */
export async function applyCertifiedMergePolicy(input: ApplyCertifiedMergePolicyInput): Promise<ApplyCertifiedMergePolicyResult> {
  // The hunks `git merge` itself conflicts on (ort, histogram diff): the merge in
  // progress resolved them with `-X theirs`, so read the marked files from a merge tree.
  const tree = await conflictMergeTree(input);
  const files: PolicyMergeFileLog[] = [];
  const rewrittenPaths: string[] = [];
  const decisions: CertifiedFunctionDecision[] = [];
  const log = (path: string, message: string, extra: Partial<PolicyMergeFileLog> = {}): void => {
    files.push({ path, message, result: null, wholeFileFallbackReason: null, upstreamReportFallbackReason: input.reports.upstreamReportFallbackReason, ...extra });
  };
  /** The operator path: left unmerged with its certification (operator sync), else the merge stops. */
  const toOperator = async (path: string, detail: string): Promise<void> => {
    const summary = certificationSummary(input, path);
    if (input.unresolvable === "leave_unmerged") {
      const unmerged = await input.runGit(input.worktreePath, ["ls-files", "-u", "--", path]);
      if (unmerged.exitCode === 0 && unmerged.stdout.trim() !== "") {
        log(path, `${path}: strategy=operator (${detail}) certification=[${summary}]`, { operatorCertification: summary });
        return;
      }
    }
    throw new Error(`certified merge cannot resolve ${path} (${detail}); resolve it for operator review. Certification: ${summary}`);
  };
  for (const path of policyContestedPaths(input)) {
    if (!SOURCE_FILE.test(path) && !HEADER_FILE.test(path)) {
      // Data, configuration and build files keep the line-merge / operator path.
      const merged = await mergeNonCContestedFile(input, path);
      files.push(merged.entry);
      if (merged.rewritten) rewrittenPaths.push(path);
      continue;
    }
    const [base, ours, upstream] = await Promise.all([
      gitFileText(input.runGit, input.worktreePath, input.baseRevision, path),
      gitFileText(input.runGit, input.worktreePath, input.oursRevision, path),
      gitFileText(input.runGit, input.worktreePath, input.upstreamRevision, path),
    ]);
    const unavailable = [base, ours, upstream].map((side, index) => side.error ? `${["base", "ours", "upstream"][index]}: ${side.error}` : null).filter(Boolean);
    if (unavailable.length > 0) {
      throw new Error(`certified merge cannot read parent text for ${path} (${unavailable.join("; ")}); refusing to discard accepted local changes`);
    }
    if ((ours.exists === base.exists && ours.text === base.text) || (ours.exists === upstream.exists && ours.text === upstream.text)) {
      await takeUpstreamFileWhole(input.runGit, input.worktreePath, input.upstreamRevision, path);
      log(path, `${path}: strategy=upstream_whole (ours unchanged or identical)`, { wholeFileFallbackReason: "ours unchanged from base or identical to upstream" });
      continue;
    }
    if (!ours.exists || !upstream.exists) {
      await toOperator(path, `${ours.exists ? "upstream" : "ours"} deleted the file while the other side changed it`);
      continue;
    }
    const shown = tree ? await input.runGit(input.worktreePath, ["show", `${tree}:${path}`]) : null;
    const mergedText = shown?.exitCode === 0 ? shown.stdout : await mergeFileText(input, path, { base, ours, upstream });
    const conflicted = resolveConflictsToUpstream(mergedText).ranges.length > 0;
    if (!conflicted) {
      await writeFile(resolve(input.worktreePath, path), mergedText);
      rewrittenPaths.push(path);
      log(path, `${path}: strategy=three_way_merge (no conflicting hunk)`, { textMergeReason: "clean three-way merge" });
      continue;
    }
    if (HEADER_FILE.test(path)) {
      const headerResolved = resolveConflictsToUpstream(mergedText);
      if (headerResolved.error) throw new Error(`certified merge cannot read the conflict hunks of ${path} (${headerResolved.error}); resolve it for operator review`);
      // Declaration-only and comment-only hunks go to upstream; conflicting code (inline functions, members) to the operator.
      const unsupported = unmappedCodeConflicts({
        merged: headerResolved.lines, ranges: headerResolved.ranges, ours: ours.text.split("\n"), base: (base.exists ? base.text : "").split("\n"), includeFunctions: true,
      });
      if (unsupported.length > 0) {
        await toOperator(path, `conflicting header code the rule cannot decide: ${unsupported.join(", ")}`);
        continue;
      }
      await writeFile(resolve(input.worktreePath, path), headerResolved.lines.join("\n"));
      rewrittenPaths.push(path);
      const decision: CertifiedFunctionDecision = {
        path, function: "(header hunks)", category: "header_hunks", result: "upstream", reason: "header_hunk_upstream",
        inConflict: true, symbols: [], displaced: false, note: `${headerResolved.ranges.length} conflicting hunk(s) resolved to upstream`,
      };
      decisions.push(decision);
      log(path, `${path}: strategy=header_hunks_upstream hunks=${headerResolved.ranges.length}`, { certified: { hunks: headerResolved.ranges.length, decisions: [decision] } });
      continue;
    }
    const oursRows = reportFunctionRows(input.reports.ours, path);
    const upstreamRows = reportFunctionRows(input.reports.upstream, path);
    const upstreamScores = new Map(upstreamRows.map((row) => [row.symbol, row.score]));
    const oursScores = new Map(oursRows.map((row) => [row.symbol, row.score]));
    const spliced = spliceCertifiedFile({
      path,
      conflictedText: mergedText,
      baseText: base.exists ? base.text : "",
      oursText: ours.text,
      upstreamText: upstream.text,
      ambiguity: (key) => {
        const matched = rowsForKey(oursRows, key);
        return (matched.rows.length > 0 ? matched : rowsForKey(upstreamRows, key)).ambiguous;
      },
      evidence: (key) => {
        const matched = rowsForKey(oursRows, key);
        const rows = (matched.rows.length > 0 ? matched : rowsForKey(upstreamRows, key)).rows;
        return [...new Map(rows.map((row) => [row.symbol, row])).values()].map((row) => ({
          unit: row.unit,
          symbol: row.symbol,
          oursScore: oursScores.get(row.symbol) ?? null,
          upstreamScore: input.reports.scoreMode === "reports" ? upstreamScores.get(row.symbol) ?? null : null,
          certification: input.certification({ unit: row.unit, symbol: row.symbol, sourcePath: path, functionKey: key }),
        }));
      },
    });
    if (spliced.error) {
      await toOperator(path, spliced.error);
      continue;
    }
    await writeFile(resolve(input.worktreePath, path), spliced.text);
    rewrittenPaths.push(path);
    decisions.push(...spliced.decisions);
    log(path, certifiedFileMessage(path, spliced.hunks, spliced.decisions, "certified_splice"), { certified: { hunks: spliced.hunks, decisions: spliced.decisions } });
  }
  return { files, rewrittenPaths, decisions };
}

// ---------------------------------------------------------------------------
// The decision record persisted with the sync.

export const DECISION_RECORD_COLUMNS = ["file", "function", "category", "result", "reason", "ours", "upstream", "merged", "gate", "symbol", "in_conflict", "note"] as const;

/** `function-decisions.tsv`: one row per (function, report symbol); `merged` from the recomputed report when given. */
export function certifiedDecisionsTsv(decisions: CertifiedFunctionDecision[], mergedReport?: unknown): string {
  const mergedScores = new Map<string, Map<string, number>>();
  const merged = (path: string, symbol: string): string => {
    if (mergedReport === undefined) return "";
    if (!mergedScores.has(path)) mergedScores.set(path, new Map(reportFunctionRows(mergedReport, path).map((row) => [row.symbol, row.score])));
    const score = mergedScores.get(path)!.get(symbol);
    return score === undefined ? "-" : String(score);
  };
  const clean = (value: string) => value.replace(/[\t\r\n]+/g, " ");
  const rows: string[] = [DECISION_RECORD_COLUMNS.join("\t")];
  for (const decision of decisions) {
    const common = [decision.path, decision.function, decision.category, decision.result, decision.reason];
    const symbols = decision.symbols.length > 0 ? decision.symbols : [null];
    for (const symbol of symbols) {
      rows.push([
        ...common,
        symbol ? formatScore(symbol.oursScore) : "-",
        symbol ? formatScore(symbol.upstreamScore) : "-",
        symbol ? merged(decision.path, symbol.symbol) : "",
        symbol ? (symbol.certification.verdict ? `${symbol.certification.status}:${symbol.certification.verdict}` : symbol.certification.status) : "-",
        symbol?.symbol ?? "-",
        decision.inConflict ? "1" : "0",
        decision.note,
      ].map((value) => clean(String(value))).join("\t"));
    }
  }
  return `${rows.join("\n")}\n`;
}
