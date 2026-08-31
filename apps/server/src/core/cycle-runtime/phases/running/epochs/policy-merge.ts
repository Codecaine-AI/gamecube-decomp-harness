import { EXACT_SCORE, objdiffRowScore } from "@server/core/validation/objdiff/constants.js";

export type PolicyMergeSide = "ours" | "upstream";

export type PolicyMergeScoreMode = "reports" | "upstream-diff-fallback";

export type FunctionScoreMap = Readonly<Record<string, number | null | undefined>>;

export type FunctionMergeReason =
  | "unchanged"
  | "parents_identical"
  | "upstream_exact"
  | "ours_exact"
  | "upstream_higher_score"
  | "ours_higher_score"
  | "score_tie_upstream"
  | "score_missing"
  | "upstream_report_fallback_upstream_changed"
  | "upstream_report_fallback_keep_ours";

export interface FunctionMergeDecision {
  functionName: string;
  /** The side written to the result. A whole-file fallback can override policySide. */
  side: PolicyMergeSide;
  /** The function policy's preferred side before any whole-file fallback. */
  policySide: PolicyMergeSide | null;
  reason: FunctionMergeReason;
  contested: boolean;
  oursChanged: boolean;
  upstreamChanged: boolean;
  oursScore: number | null;
  upstreamScore: number | null;
  upstreamReportFallback: boolean;
}

export interface PolicyMergeFallback {
  side: PolicyMergeSide;
  reason: "function_alignment" | "context_ownership" | "c_parse" | "missing_scores" | "no_functions";
  detail: string;
  contestedVotes: { ours: number; upstream: number };
  unresolvedFunctions: string[];
}

export interface PolicyMergeInput {
  path: string;
  baseText: string;
  oursText: string;
  upstreamText: string;
  oursScores?: FunctionScoreMap;
  upstreamScores?: FunctionScoreMap;
  /**
   * Use upstream-diff-fallback when no upstream report exists for the target
   * revision. It chooses upstream for functions changed from base by upstream,
   * and ours for every other function.
   */
  scoreMode?: PolicyMergeScoreMode;
}

export interface PolicyMergeResult {
  path: string;
  text: string;
  fileTouch: "unchanged" | "ours_only" | "upstream_only" | "both";
  strategy: "ours_whole" | "upstream_whole" | "reconstructed" | "majority_fallback";
  scoreMode: PolicyMergeScoreMode;
  decisions: FunctionMergeDecision[];
  fallback: PolicyMergeFallback | null;
}

interface CFunctionSpan {
  name: string;
  start: number;
  end: number;
}

interface ParsedCFile {
  functions: CFunctionSpan[];
  errors: string[];
}

interface PendingDecision extends Omit<FunctionMergeDecision, "side"> {
  side: PolicyMergeSide | null;
}

const CONTROL_WORDS = new Set(["if", "for", "while", "switch", "return", "sizeof", "__attribute__"]);

function finiteScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function matchingParen(source: string, closeIndex: number): number {
  let depth = 0;
  for (let index = closeIndex; index >= 0; index -= 1) {
    if (source[index] === ")") depth += 1;
    else if (source[index] === "(") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function functionHeader(source: string, boundary: number, braceIndex: number): { name: string; start: number } | null {
  const candidate = source.slice(boundary, braceIndex);
  const trimmedEnd = candidate.trimEnd();
  if (!trimmedEnd.endsWith(")")) return null;
  const closeParen = boundary + trimmedEnd.length - 1;
  const openParen = matchingParen(source, closeParen);
  if (openParen < boundary) return null;
  const beforeParen = source.slice(boundary, openParen);
  const nameMatch = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(beforeParen);
  const name = nameMatch?.[1];
  if (!name || CONTROL_WORDS.has(name)) return null;
  const declarationPrefix = beforeParen.slice(0, nameMatch.index).trim();
  if (!declarationPrefix || /(?:^|\s)(?:typedef|struct|union|enum)\s*$/.test(declarationPrefix) || /=/.test(declarationPrefix)) {
    return null;
  }
  const leadingWhitespace = /^\s*/.exec(candidate)?.[0].length ?? 0;
  return { name, start: boundary + leadingWhitespace };
}

/**
 * Finds ordinary top-level C function definitions. Unsupported or damaged C
 * is reported as ambiguous so callers can use the whole-file fallback.
 */
function parseCFunctionSpans(source: string): ParsedCFile {
  const functions: CFunctionSpan[] = [];
  const errors: string[] = [];
  let state: "code" | "line_comment" | "block_comment" | "string" | "char" = "code";
  let escaped = false;
  let depth = 0;
  let boundary = 0;
  let active: { name: string; start: number } | null = null;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    const next = source[index + 1];
    if (state === "line_comment") {
      if (char === "\n") state = "code";
      continue;
    }
    if (state === "block_comment") {
      if (char === "*" && next === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }
    if (state === "string" || state === "char") {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if ((state === "string" && char === "\"") || (state === "char" && char === "'")) state = "code";
      continue;
    }
    if (char === "/" && next === "/") {
      state = "line_comment";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      state = "block_comment";
      index += 1;
      continue;
    }
    if (char === "\"") {
      state = "string";
      continue;
    }
    if (char === "'") {
      state = "char";
      continue;
    }
    if (char === "{") {
      if (depth === 0) {
        active = functionHeader(source, boundary, index);
        const candidate = source.slice(boundary, index).trim();
        if (!active && candidate.includes("(") && candidate.includes(")") && !candidate.includes("=")) {
          errors.push(`unrecognized top-level definition at byte ${index}`);
        }
      }
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth < 0) {
        errors.push(`unexpected closing brace at byte ${index}`);
        depth = 0;
      }
      if (depth === 0) {
        if (active) functions.push({ ...active, end: index + 1 });
        active = null;
        boundary = index + 1;
      }
      continue;
    }
    if (char === ";" && depth === 0) boundary = index + 1;
  }

  if (depth !== 0) errors.push("unbalanced braces");
  if (state === "block_comment" || state === "string" || state === "char") errors.push(`unterminated ${state}`);
  const names = new Set<string>();
  for (const fn of functions) {
    if (names.has(fn.name)) errors.push(`duplicate function '${fn.name}'`);
    names.add(fn.name);
  }
  return { functions, errors };
}

function functionText(source: string, span: CFunctionSpan): string {
  return source.slice(span.start, span.end);
}

function scoreFor(scores: FunctionScoreMap | undefined, functionName: string): number | null {
  return finiteScore(scores?.[functionName]);
}

function decideFunction(input: {
  name: string;
  baseText: string | null;
  oursText: string | null;
  upstreamText: string | null;
  oursScore: number | null;
  upstreamScore: number | null;
  scoreMode: PolicyMergeScoreMode;
}): PendingDecision {
  const oursChanged = input.oursText !== input.baseText;
  const upstreamChanged = input.upstreamText !== input.baseText;
  const common = {
    functionName: input.name,
    contested: input.oursText !== input.upstreamText && (oursChanged || upstreamChanged),
    oursChanged,
    upstreamChanged,
    oursScore: input.oursScore,
    upstreamScore: input.upstreamScore,
    upstreamReportFallback: input.scoreMode === "upstream-diff-fallback",
  };

  if (input.scoreMode === "upstream-diff-fallback") {
    return upstreamChanged
      ? { ...common, side: "upstream", policySide: "upstream", reason: "upstream_report_fallback_upstream_changed" }
      : { ...common, side: "ours", policySide: "ours", reason: "upstream_report_fallback_keep_ours" };
  }
  if (input.upstreamScore !== null && input.upstreamScore >= EXACT_SCORE) {
    return { ...common, side: "upstream", policySide: "upstream", reason: "upstream_exact" };
  }
  if (input.oursScore !== null && input.oursScore >= EXACT_SCORE) {
    return { ...common, side: "ours", policySide: "ours", reason: "ours_exact" };
  }
  if (input.oursScore !== null && input.upstreamScore !== null) {
    if (input.upstreamScore > input.oursScore) {
      return { ...common, side: "upstream", policySide: "upstream", reason: "upstream_higher_score" };
    }
    if (input.oursScore > input.upstreamScore) {
      return { ...common, side: "ours", policySide: "ours", reason: "ours_higher_score" };
    }
    return { ...common, side: "upstream", policySide: "upstream", reason: "score_tie_upstream" };
  }
  if (input.oursText === input.upstreamText) {
    return { ...common, side: "ours", policySide: "ours", reason: oursChanged ? "parents_identical" : "unchanged" };
  }
  return { ...common, side: null, policySide: null, reason: "score_missing" };
}

function alignedNames(left: CFunctionSpan[], right: CFunctionSpan[]): boolean {
  return left.length === right.length && left.every((fn, index) => fn.name === right[index]?.name);
}

function decisionsForFunctions(input: PolicyMergeInput, parsed: {
  base: ParsedCFile;
  ours: ParsedCFile;
  upstream: ParsedCFile;
}, scoreMode: PolicyMergeScoreMode): PendingDecision[] {
  const baseByName = new Map(parsed.base.functions.map((fn, index) => [fn.name, { fn, index }]));
  const oursByName = new Map(parsed.ours.functions.map((fn, index) => [fn.name, { fn, index }]));
  const upstreamByName = new Map(parsed.upstream.functions.map((fn, index) => [fn.name, { fn, index }]));
  const decisions: PendingDecision[] = [];
  const names = [
    ...parsed.ours.functions.map((fn) => fn.name),
    ...parsed.upstream.functions.map((fn) => fn.name).filter((name) => !oursByName.has(name)),
  ];
  for (const name of names) {
    const oursEntry = oursByName.get(name);
    const upstreamEntry = upstreamByName.get(name);
    const baseEntry = baseByName.get(name);
    decisions.push(decideFunction({
      name,
      baseText: baseEntry ? functionText(input.baseText, baseEntry.fn) : null,
      oursText: oursEntry ? functionText(input.oursText, oursEntry.fn) : null,
      upstreamText: upstreamEntry ? functionText(input.upstreamText, upstreamEntry.fn) : null,
      oursScore: scoreFor(input.oursScores, name),
      upstreamScore: scoreFor(input.upstreamScores, name),
      scoreMode,
    }));
  }
  return decisions;
}

function fallbackResult(input: PolicyMergeInput, scoreMode: PolicyMergeScoreMode, pending: PendingDecision[], fallback: Omit<PolicyMergeFallback, "side" | "contestedVotes" | "unresolvedFunctions">): PolicyMergeResult {
  const contested = pending.filter((decision) => decision.contested);
  const votes = {
    ours: contested.filter((decision) => decision.policySide === "ours").length,
    upstream: contested.filter((decision) => decision.policySide === "upstream").length,
  };
  const side: PolicyMergeSide = votes.ours > votes.upstream ? "ours" : "upstream";
  const unresolvedFunctions = pending.filter((decision) => decision.policySide === null).map((decision) => decision.functionName);
  return {
    path: input.path,
    text: side === "ours" ? input.oursText : input.upstreamText,
    fileTouch: "both",
    strategy: "majority_fallback",
    scoreMode,
    decisions: pending.map((decision) => ({ ...decision, side })),
    fallback: { ...fallback, side, contestedVotes: votes, unresolvedFunctions },
  };
}

function wholeFileResult(input: PolicyMergeInput, scoreMode: PolicyMergeScoreMode, fileTouch: "unchanged" | "ours_only" | "upstream_only", side: PolicyMergeSide): PolicyMergeResult {
  return {
    path: input.path,
    text: side === "ours" ? input.oursText : input.upstreamText,
    fileTouch,
    strategy: side === "ours" ? "ours_whole" : "upstream_whole",
    scoreMode,
    decisions: [],
    fallback: null,
  };
}

/** Applies the boundary policy to one C file using base, ours, and upstream. */
export function mergeCFileByPolicy(input: PolicyMergeInput): PolicyMergeResult {
  const scoreMode = input.scoreMode ?? "reports";
  const oursTouched = input.oursText !== input.baseText;
  const upstreamTouched = input.upstreamText !== input.baseText;
  if (!oursTouched && !upstreamTouched) return wholeFileResult(input, scoreMode, "unchanged", "ours");
  if (oursTouched && !upstreamTouched) return wholeFileResult(input, scoreMode, "ours_only", "ours");
  if (!oursTouched && upstreamTouched) return wholeFileResult(input, scoreMode, "upstream_only", "upstream");

  const parsed = {
    base: parseCFunctionSpans(input.baseText),
    ours: parseCFunctionSpans(input.oursText),
    upstream: parseCFunctionSpans(input.upstreamText),
  };
  const pending = decisionsForFunctions(input, parsed, scoreMode);
  const parseErrors = [...parsed.base.errors, ...parsed.ours.errors, ...parsed.upstream.errors];
  if (parseErrors.length > 0) {
    return fallbackResult(input, scoreMode, pending, {
      reason: "c_parse",
      detail: [...new Set(parseErrors)].join("; "),
    });
  }
  if (parsed.ours.functions.length === 0 || parsed.upstream.functions.length === 0) {
    return fallbackResult(input, scoreMode, pending, {
      reason: "no_functions",
      detail: "one or both parent files have no recognized C function definitions",
    });
  }
  if (!alignedNames(parsed.ours.functions, parsed.upstream.functions)) {
    return fallbackResult(input, scoreMode, pending, {
      reason: "function_alignment",
      detail: `ours=[${parsed.ours.functions.map((fn) => fn.name).join(", ")}], upstream=[${parsed.upstream.functions.map((fn) => fn.name).join(", ")}]`,
    });
  }
  const unresolved = pending.filter((decision) => decision.policySide === null);
  if (unresolved.length > 0) {
    return fallbackResult(input, scoreMode, pending, {
      reason: "missing_scores",
      detail: `missing report score for ${unresolved.map((decision) => decision.functionName).join(", ")}`,
    });
  }

  const selectedSides = pending.map((decision) => decision.policySide!);
  for (let index = 0; index < selectedSides.length - 1; index += 1) {
    if (selectedSides[index] === selectedSides[index + 1]) continue;
    const oursGap = input.oursText.slice(parsed.ours.functions[index]!.end, parsed.ours.functions[index + 1]!.start);
    const upstreamGap = input.upstreamText.slice(parsed.upstream.functions[index]!.end, parsed.upstream.functions[index + 1]!.start);
    if (oursGap !== upstreamGap) {
      return fallbackResult(input, scoreMode, pending, {
        reason: "context_ownership",
        detail: `functions ${pending[index]!.functionName} and ${pending[index + 1]!.functionName} select different sides around different helper/static text`,
      });
    }
  }

  const firstSide = selectedSides[0]!;
  const firstSource = firstSide === "ours" ? input.oursText : input.upstreamText;
  const firstSpans = firstSide === "ours" ? parsed.ours.functions : parsed.upstream.functions;
  let text = firstSource.slice(0, firstSpans[0]!.start);
  for (let index = 0; index < pending.length; index += 1) {
    const decision = pending[index]!;
    const side = decision.policySide!;
    const source = side === "ours" ? input.oursText : input.upstreamText;
    const spans = side === "ours" ? parsed.ours.functions : parsed.upstream.functions;
    text += source.slice(spans[index]!.start, spans[index]!.end);
    if (index < pending.length - 1) {
      const nextSide = selectedSides[index + 1]!;
      if (side === nextSide) {
        text += source.slice(spans[index]!.end, spans[index + 1]!.start);
      } else {
        text += input.oursText.slice(parsed.ours.functions[index]!.end, parsed.ours.functions[index + 1]!.start);
      }
    }
  }
  const lastDecision = pending.at(-1)!;
  const lastSide = lastDecision.policySide!;
  const lastSource = lastSide === "ours" ? input.oursText : input.upstreamText;
  const lastSpans = lastSide === "ours" ? parsed.ours.functions : parsed.upstream.functions;
  text += lastSource.slice(lastSpans.at(-1)!.end);

  return {
    path: input.path,
    text,
    fileTouch: "both",
    strategy: "reconstructed",
    scoreMode,
    decisions: pending.map((decision) => ({ ...decision, side: decision.policySide! })),
    fallback: null,
  };
}

/** Reads objdiff's per-unit function rows into the policy's score map. */
export function functionScoresForUnit(report: unknown, unitName: string): Record<string, number> {
  if (!report || typeof report !== "object") return {};
  const units = Array.isArray((report as { units?: unknown }).units) ? (report as { units: unknown[] }).units : [];
  const unit = units.find((value) => value && typeof value === "object" && (value as { name?: unknown }).name === unitName);
  if (!unit || typeof unit !== "object") return {};
  const functions = Array.isArray((unit as { functions?: unknown }).functions) ? (unit as { functions: unknown[] }).functions : [];
  const scores: Record<string, number> = {};
  for (const value of functions) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const score = objdiffRowScore(row);
    if (typeof row.name === "string" && Number.isFinite(score)) scores[row.name] = score;
  }
  return scores;
}

function normalizeSourcePath(path: string): string {
  const normalized = path.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  const sourceIndex = normalized.indexOf("src/");
  return sourceIndex >= 0 ? normalized.slice(sourceIndex) : normalized;
}

function sourcePathFromUnitName(unitName: string): string {
  let path = normalizeSourcePath(unitName).replace(/^main\//, "");
  if (path.endsWith(".o")) path = `${path.slice(0, -2)}.c`;
  else if (!path.endsWith(".c")) path = `${path}.c`;
  return path.startsWith("src/") ? path : `src/${path}`;
}

/**
 * Resolves a report unit by source path. Report metadata wins; older reports
 * without metadata derive src/<unit>.c after removing a leading main/.
 */
export function functionScoresForSourcePath(report: unknown, sourcePath: string): Record<string, number> {
  if (!report || typeof report !== "object") return {};
  const units = Array.isArray((report as { units?: unknown }).units) ? (report as { units: unknown[] }).units : [];
  const wanted = normalizeSourcePath(sourcePath);
  let derivedMatch: string | null = null;
  for (const value of units) {
    if (!value || typeof value !== "object") continue;
    const unit = value as { name?: unknown; metadata?: unknown };
    if (typeof unit.name !== "string") continue;
    const metadata = unit.metadata && typeof unit.metadata === "object" ? unit.metadata as { source_path?: unknown } : null;
    if (typeof metadata?.source_path === "string") {
      if (normalizeSourcePath(metadata.source_path) === wanted) return functionScoresForUnit(report, unit.name);
      continue;
    }
    if (sourcePathFromUnitName(unit.name) === wanted) derivedMatch = unit.name;
  }
  return derivedMatch ? functionScoresForUnit(report, derivedMatch) : {};
}
