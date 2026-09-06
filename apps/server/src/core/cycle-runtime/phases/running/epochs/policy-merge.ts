import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
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
  reason:
    | "function_alignment"
    | "context_ownership"
    | "c_parse"
    | "missing_scores"
    | "no_functions"
    | "majority_fallback_upstream_protected"
    | "majority_fallback_ours_protected"
    | "majority_fallback_conflicting_protected";
  detail: string;
  contestedVotes: { ours: number; upstream: number };
  unresolvedFunctions: string[];
  lostProtectedFunctions: string[];
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

export interface PolicyMergeGitResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export type PolicyMergeGitRunner = (
  worktreePath: string,
  args: string[],
) => Promise<PolicyMergeGitResult>;

export interface PolicyMergeReports {
  ours: unknown;
  upstream: unknown;
  scoreMode: PolicyMergeScoreMode;
  upstreamReportFallbackReason: string | null;
}

export interface PolicyMergeFileLog {
  path: string;
  message: string;
  result: PolicyMergeResult | null;
  wholeFileFallbackReason: string | null;
  upstreamReportFallbackReason: string | null;
}

export interface ApplyScoreMergePolicyInput {
  worktreePath: string;
  baseRevision: string;
  oursRevision: string;
  upstreamRevision: string;
  upstreamChangedFiles: string[];
  locallyChangedFiles: string[];
  reports: PolicyMergeReports;
  runGit: PolicyMergeGitRunner;
}

export interface ApplyScoreMergePolicyResult {
  files: PolicyMergeFileLog[];
  rewrittenPaths: string[];
}

interface CFunctionSpan {
  name: string;
  spliceStart: number;
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

interface SelectedFunction {
  name: string;
  side: PolicyMergeSide;
  span: CFunctionSpan;
}

interface RequiredHelperFailure {
  side: PolicyMergeSide;
  helperNames: string[];
}

type UnalignedReconstruction = {
  kind: "success";
  text: string;
  selectedSides: Map<string, PolicyMergeSide>;
} | {
  kind: "required_helper_failure";
  failure: RequiredHelperFailure;
};

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

function functionDeclarationStart(source: string, boundary: number, nameStart: number): number {
  let index = boundary;
  while (index < nameStart) {
    while (index < nameStart && /\s/.test(source[index]!)) index += 1;
    if (source.startsWith("//", index)) {
      index = source.indexOf("\n", index + 2);
      if (index < 0) return nameStart;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const commentEnd = source.indexOf("*/", index + 2);
      if (commentEnd < 0) return nameStart;
      index = commentEnd + 2;
      continue;
    }
    if (source[index] === "#") {
      let lineEnd = index;
      do {
        lineEnd = source.indexOf("\n", lineEnd + 1);
        if (lineEnd < 0) return nameStart;
      } while (source.slice(index, lineEnd).trimEnd().endsWith("\\"));
      index = lineEnd + 1;
      continue;
    }
    return index;
  }
  return nameStart;
}

function functionHeader(source: string, boundary: number, braceIndex: number): Omit<CFunctionSpan, "end"> | null {
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
  const nameStart = boundary + nameMatch.index;
  return {
    name,
    spliceStart: functionDeclarationStart(source, boundary, nameStart),
    start: boundary + leadingWhitespace,
  };
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
  let active: Omit<CFunctionSpan, "end"> | null = null;

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

function functionSpliceSpan(span: CFunctionSpan): CFunctionSpan {
  return { ...span, start: span.spliceStart };
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

function sourceForSide(input: PolicyMergeInput, side: PolicyMergeSide): string {
  return side === "ours" ? input.oursText : input.upstreamText;
}

function cIdentifiers(source: string): Set<string> {
  const identifiers = new Set<string>();
  let state: "code" | "line_comment" | "block_comment" | "string" | "char" = "code";
  let escaped = false;
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
    if (!/[A-Za-z_]/.test(char)) continue;
    let end = index + 1;
    while (end < source.length && /[A-Za-z0-9_]/.test(source[end]!)) end += 1;
    identifiers.add(source.slice(index, end));
    index = end - 1;
  }
  return identifiers;
}

function sideOnlyReferences(
  input: PolicyMergeInput,
  selected: SelectedFunction,
  spansBySide: Record<PolicyMergeSide, Map<string, CFunctionSpan>>,
): string[] {
  const otherSide: PolicyMergeSide = selected.side === "ours" ? "upstream" : "ours";
  const identifiers = cIdentifiers(functionText(sourceForSide(input, selected.side), selected.span));
  identifiers.delete(selected.name);
  return [...identifiers].filter((name) => spansBySide[selected.side].has(name) && !spansBySide[otherSide].has(name));
}

function includeReferencedSideOnlyFunctions(
  input: PolicyMergeInput,
  selectedByName: Map<string, SelectedFunction>,
  spansBySide: Record<PolicyMergeSide, Map<string, CFunctionSpan>>,
): void {
  const pending = [...selectedByName.values()];
  for (let index = 0; index < pending.length; index += 1) {
    const selected = pending[index]!;
    for (const helperName of sideOnlyReferences(input, selected, spansBySide)) {
      if (selectedByName.has(helperName)) continue;
      const span = spansBySide[selected.side].get(helperName)!;
      const helper = { name: helperName, side: selected.side, span };
      selectedByName.set(helperName, helper);
      pending.push(helper);
    }
  }
}

function requiredHelperFailure(
  input: PolicyMergeInput,
  planned: SelectedFunction[],
  spans: Record<PolicyMergeSide, CFunctionSpan[]>,
  spansBySide: Record<PolicyMergeSide, Map<string, CFunctionSpan>>,
): RequiredHelperFailure | null {
  const outputIndex = new Map(planned.map((selected, index) => [selected.name, index]));
  const invalid = new Map<PolicyMergeSide, Set<string>>();
  for (let index = 0; index < planned.length; index += 1) {
    const selected = planned[index]!;
    for (const helperName of sideOnlyReferences(input, selected, spansBySide)) {
      const helperIndex = outputIndex.get(helperName);
      if (helperIndex !== undefined && helperIndex < index) continue;
      const names = invalid.get(selected.side) ?? new Set<string>();
      names.add(helperName);
      invalid.set(selected.side, names);
    }
  }
  const side = invalid.keys().next().value as PolicyMergeSide | undefined;
  if (!side) return null;
  const helperNames = spans[side]
    .map((span) => span.name)
    .filter((name) => invalid.get(side)!.has(name));
  return { side, helperNames };
}

function resolvedDecisionSide(
  decision: PendingDecision,
  selectedByName: Map<string, SelectedFunction>,
  spansBySide: Record<PolicyMergeSide, Map<string, CFunctionSpan>>,
  defaultSide: PolicyMergeSide,
): PolicyMergeSide {
  const selected = selectedByName.get(decision.functionName);
  if (selected) return selected.side;
  if (decision.policySide) return decision.policySide;
  const inOurs = spansBySide.ours.has(decision.functionName);
  const inUpstream = spansBySide.upstream.has(decision.functionName);
  if (inOurs !== inUpstream) return inOurs ? "upstream" : "ours";
  return defaultSide;
}

/** Splice additions/deletions by name only when shared order and file context agree. */
function reconstructUnalignedFunctions(
  input: PolicyMergeInput,
  ours: CFunctionSpan[],
  upstream: CFunctionSpan[],
  pending: PendingDecision[],
): UnalignedReconstruction | null {
  ours = ours.map(functionSpliceSpan);
  upstream = upstream.map(functionSpliceSpan);
  const oursByName = new Map(ours.map((fn) => [fn.name, fn]));
  const upstreamByName = new Map(upstream.map((fn) => [fn.name, fn]));
  const spansBySide = { ours: oursByName, upstream: upstreamByName };
  if (pending.some((decision) => {
    const side = protectedSide(decision);
    return side !== null && !(side === "ours" ? oursByName : upstreamByName).has(decision.functionName);
  })) return null;
  const commonOurs = ours.filter((fn) => upstreamByName.has(fn.name));
  const commonUpstream = upstream.filter((fn) => oursByName.has(fn.name));
  if (!alignedNames(commonOurs, commonUpstream)) return null;
  const decisions = new Map(pending.map((decision) => [decision.functionName, decision]));
  if (commonOurs.some((span) => !decisions.get(span.name)?.policySide)) return null;

  const prefix = input.oursText.slice(0, ours[0]!.start);
  const suffix = input.oursText.slice(ours.at(-1)!.end);
  if (prefix !== input.upstreamText.slice(0, upstream[0]!.start)
    || suffix !== input.upstreamText.slice(upstream.at(-1)!.end)) return null;
  // Helper declarations and preprocessor context need an owner. Do not guess.
  for (const [source, spans] of [[input.oursText, ours], [input.upstreamText, upstream]] as const) {
    if (spans.some((fn, index) => index > 0 && source.slice(spans[index - 1]!.end, fn.start).trim() !== "")) return null;
  }

  const selectedByName = new Map<string, SelectedFunction>();
  for (const decision of pending) {
    if (!decision.policySide) continue;
    const span = spansBySide[decision.policySide].get(decision.functionName);
    if (span) selectedByName.set(decision.functionName, { name: decision.functionName, side: decision.policySide, span });
  }
  includeReferencedSideOnlyFunctions(input, selectedByName, spansBySide);

  const planned: SelectedFunction[] = [];
  let oursIndex = 0;
  let upstreamIndex = 0;
  for (const common of commonOurs) {
    while (ours[oursIndex]!.name !== common.name) {
      const selected = selectedByName.get(ours[oursIndex++]!.name);
      if (selected) planned.push(selected);
    }
    while (upstream[upstreamIndex]!.name !== common.name) {
      const selected = selectedByName.get(upstream[upstreamIndex++]!.name);
      if (selected) planned.push(selected);
    }
    planned.push(selectedByName.get(common.name)!);
    oursIndex += 1;
    upstreamIndex += 1;
  }
  for (const span of [...ours.slice(oursIndex), ...upstream.slice(upstreamIndex)]) {
    const selected = selectedByName.get(span.name);
    if (selected) planned.push(selected);
  }
  const failure = requiredHelperFailure(input, planned, { ours, upstream }, spansBySide);
  if (failure) return { kind: "required_helper_failure", failure };
  return {
    kind: "success",
    text: prefix + planned.map((selected) => functionText(sourceForSide(input, selected.side), selected.span)).join("\n\n") + suffix,
    selectedSides: new Map([...selectedByName].map(([name, selected]) => [name, selected.side])),
  };
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
      baseText: baseEntry ? functionText(input.baseText, functionSpliceSpan(baseEntry.fn)) : null,
      oursText: oursEntry ? functionText(input.oursText, functionSpliceSpan(oursEntry.fn)) : null,
      upstreamText: upstreamEntry ? functionText(input.upstreamText, functionSpliceSpan(upstreamEntry.fn)) : null,
      oursScore: scoreFor(input.oursScores, name),
      upstreamScore: scoreFor(input.upstreamScores, name),
      scoreMode,
    }));
  }
  return decisions;
}

function protectedSide(decision: PendingDecision): PolicyMergeSide | null {
  if (decision.policySide === "upstream"
    && (decision.reason === "upstream_exact" || decision.reason === "upstream_report_fallback_upstream_changed")) {
    return "upstream";
  }
  if (decision.policySide === "ours"
    && (decision.reason === "ours_exact"
      || decision.reason === "ours_higher_score"
      || (decision.reason === "upstream_report_fallback_keep_ours" && decision.oursChanged))) {
    return "ours";
  }
  return null;
}

function contestedVotes(pending: PendingDecision[]): { ours: number; upstream: number } {
  const contested = pending.filter((decision) => decision.contested);
  return {
    ours: contested.filter((decision) => decision.policySide === "ours").length,
    upstream: contested.filter((decision) => decision.policySide === "upstream").length,
  };
}

function requiredHelperFallbackResult(
  input: PolicyMergeInput,
  scoreMode: PolicyMergeScoreMode,
  pending: PendingDecision[],
  failure: RequiredHelperFailure,
): PolicyMergeResult {
  const selectedSource = sourceForSide(input, failure.side);
  const spans = {
    ours: parseCFunctionSpans(input.oursText).functions.map(functionSpliceSpan),
    upstream: parseCFunctionSpans(input.upstreamText).functions.map(functionSpliceSpan),
  };
  const selectedSpans = spans[failure.side];
  const lostProtectedFunctions = pending.filter((decision) => {
    const side = protectedSide(decision);
    if (!side) return false;
    const protectedSource = sourceForSide(input, side);
    const protectedTexts = spans[side]
      .filter((span) => span.name === decision.functionName)
      .map((span) => functionText(protectedSource, span));
    const selectedTexts = selectedSpans
      .filter((span) => span.name === decision.functionName)
      .map((span) => functionText(selectedSource, span));
    return protectedTexts.length === 0 || !protectedTexts.some((text) => selectedTexts.includes(text));
  }).map((decision) => decision.functionName);
  return {
    path: input.path,
    text: selectedSource,
    fileTouch: "both",
    strategy: "majority_fallback",
    scoreMode,
    decisions: pending.map((decision) => ({ ...decision, side: failure.side })),
    fallback: {
      side: failure.side,
      reason: "majority_fallback_conflicting_protected",
      detail: `required helpers cannot precede first use: ${failure.helperNames.join(", ")}`,
      contestedVotes: contestedVotes(pending),
      unresolvedFunctions: pending.filter((decision) => decision.policySide === null).map((decision) => decision.functionName),
      lostProtectedFunctions,
    },
  };
}

function conflictingProtectedResult(
  input: PolicyMergeInput,
  scoreMode: PolicyMergeScoreMode,
  pending: PendingDecision[],
): PolicyMergeResult | null {
  const protectedByName = new Map<string, PendingDecision>();
  for (const decision of pending) {
    if (protectedSide(decision) !== null && !protectedByName.has(decision.functionName)) {
      protectedByName.set(decision.functionName, decision);
    }
  }
  const protectedDecisions = [...protectedByName.values()];
  const oursProtected = protectedDecisions.filter((decision) => protectedSide(decision) === "ours");
  const upstreamProtected = protectedDecisions.filter((decision) => protectedSide(decision) === "upstream");
  if (oursProtected.length === 0 || upstreamProtected.length === 0) return null;

  const contextSide: PolicyMergeSide = oursProtected.length > upstreamProtected.length ? "ours" : "upstream";
  const spans = {
    ours: parseCFunctionSpans(input.oursText).functions.map(functionSpliceSpan),
    upstream: parseCFunctionSpans(input.upstreamText).functions.map(functionSpliceSpan),
  };
  const spansBySide = {
    ours: new Map(spans.ours.map((span) => [span.name, span])),
    upstream: new Map(spans.upstream.map((span) => [span.name, span])),
  };
  const uniqueSpan = (side: PolicyMergeSide, functionName: string) => {
    const matches = spans[side].filter((span) => span.name === functionName);
    return matches.length === 1 ? matches[0]! : null;
  };
  const missingProtected = protectedDecisions.filter((decision) => {
    const side = protectedSide(decision)!;
    const contextMatches = spans[contextSide].filter((span) => span.name === decision.functionName);
    return !uniqueSpan(side, decision.functionName) || contextMatches.length > 1;
  });
  if (missingProtected.length > 0) {
    const selectedSource = contextSide === "ours" ? input.oursText : input.upstreamText;
    const lostProtectedFunctions = protectedDecisions.filter((decision) => {
      const side = protectedSide(decision)!;
      const protectedSource = side === "ours" ? input.oursText : input.upstreamText;
      const protectedTexts = spans[side]
        .filter((span) => span.name === decision.functionName)
        .map((span) => functionText(protectedSource, span));
      const selectedTexts = spans[contextSide]
        .filter((span) => span.name === decision.functionName)
        .map((span) => functionText(selectedSource, span));
      return protectedTexts.length === 0 || !protectedTexts.some((text) => selectedTexts.includes(text));
    }).map((decision) => decision.functionName);
    return {
      path: input.path,
      text: selectedSource,
      fileTouch: "both",
      strategy: "majority_fallback",
      scoreMode,
      decisions: pending.map((decision) => ({ ...decision, side: contextSide })),
      fallback: {
        side: contextSide,
        reason: "majority_fallback_conflicting_protected",
        detail: `protected function text not uniquely locatable for ${missingProtected.map((decision) => decision.functionName).join(", ")}`,
        contestedVotes: contestedVotes(pending),
        unresolvedFunctions: pending.filter((decision) => decision.policySide === null).map((decision) => decision.functionName),
        lostProtectedFunctions,
      },
    };
  }

  const contextSource = contextSide === "ours" ? input.oursText : input.upstreamText;
  const contextSpans = spans[contextSide];
  const contextNames = new Set(contextSpans.map((span) => span.name));
  const decisions = new Map(pending.map((decision) => [decision.functionName, decision]));
  const selectedByName = new Map<string, SelectedFunction>();
  for (const contextSpan of contextSpans) {
    const side = decisions.get(contextSpan.name)?.policySide;
    const selectedSpan = side ? spansBySide[side].get(contextSpan.name) : contextSpan;
    if (selectedSpan) {
      const selectedSide = side ?? contextSide;
      selectedByName.set(contextSpan.name, { name: contextSpan.name, side: selectedSide, span: selectedSpan });
    }
  }
  for (const decision of pending) {
    if (contextNames.has(decision.functionName) || !decision.policySide) continue;
    const span = spansBySide[decision.policySide].get(decision.functionName);
    if (span) selectedByName.set(decision.functionName, { name: decision.functionName, side: decision.policySide, span });
  }
  includeReferencedSideOnlyFunctions(input, selectedByName, spansBySide);

  const otherSide: PolicyMergeSide = contextSide === "ours" ? "upstream" : "ours";
  const insertions = new Map<string, SelectedFunction[]>();
  const trailing: SelectedFunction[] = [];
  for (let index = 0; index < spans[otherSide].length; index += 1) {
    const span = spans[otherSide][index]!;
    if (contextNames.has(span.name)) continue;
    const selected = selectedByName.get(span.name);
    if (!selected || selected.side !== otherSide) continue;
    const nextCommon = spans[otherSide].slice(index + 1).find((candidate) => contextNames.has(candidate.name));
    if (!nextCommon) {
      trailing.push(selected);
      continue;
    }
    const before = insertions.get(nextCommon.name) ?? [];
    before.push(selected);
    insertions.set(nextCommon.name, before);
  }

  let cursor = 0;
  let text = "";
  const planned: SelectedFunction[] = [];
  for (const contextSpan of contextSpans) {
    text += contextSource.slice(cursor, contextSpan.start);
    const before = insertions.get(contextSpan.name) ?? [];
    if (before.length > 0) {
      text += `${before.map((selected) => functionText(sourceForSide(input, selected.side), selected.span)).join("\n\n")}\n\n`;
      planned.push(...before);
    }
    const selected = selectedByName.get(contextSpan.name);
    if (selected) {
      text += functionText(sourceForSide(input, selected.side), selected.span);
      planned.push(selected);
    }
    cursor = contextSpan.end;
  }
  if (trailing.length > 0) {
    text += `\n\n${trailing.map((selected) => functionText(sourceForSide(input, selected.side), selected.span)).join("\n\n")}`;
    planned.push(...trailing);
  }
  text += contextSource.slice(cursor);

  const failure = requiredHelperFailure(input, planned, spans, spansBySide);
  if (failure) return requiredHelperFallbackResult(input, scoreMode, pending, failure);

  return {
    path: input.path,
    text,
    fileTouch: "both",
    strategy: "reconstructed",
    scoreMode,
    decisions: pending.map((decision) => ({
      ...decision,
      side: resolvedDecisionSide(decision, selectedByName, spansBySide, contextSide),
    })),
    fallback: null,
  };
}

function fallbackResult(input: PolicyMergeInput, scoreMode: PolicyMergeScoreMode, pending: PendingDecision[], fallback: Omit<PolicyMergeFallback, "side" | "contestedVotes" | "unresolvedFunctions" | "lostProtectedFunctions">): PolicyMergeResult {
  const votes = contestedVotes(pending);
  const protectedSides = new Set(pending.map(protectedSide).filter((side): side is PolicyMergeSide => side !== null));
  const protectedFallbackSide = protectedSides.size === 1 ? [...protectedSides][0]! : null;
  const side: PolicyMergeSide = protectedFallbackSide ?? (votes.upstream >= votes.ours ? "upstream" : "ours");
  const unresolvedFunctions = pending.filter((decision) => decision.policySide === null).map((decision) => decision.functionName);
  const protectedReason = protectedFallbackSide === "upstream"
    ? "majority_fallback_upstream_protected" as const
    : protectedFallbackSide === "ours" ? "majority_fallback_ours_protected" as const : null;
  return {
    path: input.path,
    text: side === "ours" ? input.oursText : input.upstreamText,
    fileTouch: "both",
    strategy: "majority_fallback",
    scoreMode,
    decisions: pending.map((decision) => ({ ...decision, side })),
    fallback: {
      ...fallback,
      ...(protectedReason ? {
        reason: protectedReason,
        detail: `${fallback.reason}: ${fallback.detail}`,
      } : {}),
      side,
      contestedVotes: votes,
      unresolvedFunctions,
      lostProtectedFunctions: [],
    },
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
    const protectedResult = conflictingProtectedResult(input, scoreMode, pending);
    if (protectedResult) return protectedResult;
    return fallbackResult(input, scoreMode, pending, {
      reason: "c_parse",
      detail: [...new Set(parseErrors)].join("; "),
    });
  }
  if (parsed.ours.functions.length === 0 || parsed.upstream.functions.length === 0) {
    const protectedResult = conflictingProtectedResult(input, scoreMode, pending);
    if (protectedResult) return protectedResult;
    return fallbackResult(input, scoreMode, pending, {
      reason: "no_functions",
      detail: "one or both parent files have no recognized C function definitions",
    });
  }
  if (!alignedNames(parsed.ours.functions, parsed.upstream.functions)) {
    const reconstruction = reconstructUnalignedFunctions(input, parsed.ours.functions, parsed.upstream.functions, pending);
    if (reconstruction?.kind === "required_helper_failure") {
      return requiredHelperFallbackResult(input, scoreMode, pending, reconstruction.failure);
    }
    if (reconstruction?.kind === "success") {
      const spansBySide = {
        ours: new Map(parsed.ours.functions.map((span) => [span.name, span])),
        upstream: new Map(parsed.upstream.functions.map((span) => [span.name, span])),
      };
      const selectedByName = new Map([...reconstruction.selectedSides].flatMap(([name, side]) => {
        const span = spansBySide[side].get(name);
        return span ? [[name, { name, side, span }] as const] : [];
      }));
      return {
        path: input.path,
        text: reconstruction.text,
        fileTouch: "both",
        strategy: "reconstructed",
        scoreMode,
        decisions: pending.map((decision) => ({
          ...decision,
          side: resolvedDecisionSide(decision, selectedByName, spansBySide, "upstream"),
        })),
        fallback: null,
      };
    }
    const protectedResult = conflictingProtectedResult(input, scoreMode, pending);
    if (protectedResult) return protectedResult;
    return fallbackResult(input, scoreMode, pending, {
      reason: "function_alignment",
      detail: `ours=[${parsed.ours.functions.map((fn) => fn.name).join(", ")}], upstream=[${parsed.upstream.functions.map((fn) => fn.name).join(", ")}]`,
    });
  }
  const protectedResult = conflictingProtectedResult(input, scoreMode, pending);
  if (protectedResult) return protectedResult;
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

function gitOutput(result: PolicyMergeGitResult): string {
  return (result.stderr || result.stdout || "no output").trim();
}

async function checkedPolicyGit(
  runGit: PolicyMergeGitRunner,
  worktreePath: string,
  args: string[],
  operation: string,
): Promise<string> {
  const result = await runGit(worktreePath, args);
  if (result.exitCode !== 0) throw new Error(`policy merge ${operation} failed: ${gitOutput(result)}`);
  return result.stdout.trim();
}

async function gitFileText(
  runGit: PolicyMergeGitRunner,
  worktreePath: string,
  revision: string,
  path: string,
): Promise<{ text: string; exists: boolean; error: string | null }> {
  const exists = await runGit(worktreePath, ["cat-file", "-e", `${revision}:${path}`]);
  if (exists.exitCode !== 0) return { text: "", exists: false, error: null };
  const result = await runGit(worktreePath, ["show", `${revision}:${path}`]);
  return result.exitCode === 0
    ? { text: result.stdout, exists: true, error: null }
    : { text: "", exists: true, error: gitOutput(result) };
}

export function policyMergeFileMessage(entry: Omit<PolicyMergeFileLog, "message">): string {
  const wholeFileFallback = entry.wholeFileFallbackReason
    ? ` fallback=whole_file_upstream:${entry.wholeFileFallbackReason.replace(/\s+/g, " ").trim()}`
    : "";
  const reportFallback = entry.upstreamReportFallbackReason
    ? ` upstream-report-fallback=${entry.upstreamReportFallbackReason.replace(/\s+/g, " ").trim()}`
    : "";
  if (!entry.result) {
    return `${entry.path}: ours=[] upstream=[whole-file] strategy=majority_fallback${wholeFileFallback}${reportFallback}`;
  }
  const functions = (side: PolicyMergeSide) => entry.result!.decisions
    .filter((decision) => decision.side === side)
    .map((decision) => `${decision.functionName}(${decision.reason})`)
    .join(", ");
  const fallback = entry.result.fallback
    ? ` fallback=${entry.result.fallback.reason}:${entry.result.fallback.side}`
    : "";
  const fallbackDetail = entry.result.fallback?.reason === "majority_fallback_conflicting_protected"
    ? ` detail=[${entry.result.fallback.detail.replace(/\s+/g, " ").trim()}]`
    : "";
  const lostProtected = entry.result.fallback?.lostProtectedFunctions.length
    ? ` lost-protected=[${entry.result.fallback.lostProtectedFunctions.join(", ")}]`
    : "";
  return `${entry.path}: ours=[${functions("ours")}] upstream=[${functions("upstream")}] strategy=${entry.result.strategy}${fallback}${fallbackDetail}${lostProtected}${reportFallback}`;
}

async function takeUpstreamFileWhole(
  runGit: PolicyMergeGitRunner,
  worktreePath: string,
  upstreamRevision: string,
  path: string,
): Promise<void> {
  const existsUpstream = await runGit(worktreePath, ["cat-file", "-e", `${upstreamRevision}:${path}`]);
  if (existsUpstream.exitCode === 0) {
    await checkedPolicyGit(
      runGit,
      worktreePath,
      ["restore", `--source=${upstreamRevision}`, "--staged", "--worktree", "--", path],
      `whole-file upstream fallback for ${path}`,
    );
    return;
  }
  await checkedPolicyGit(
    runGit,
    worktreePath,
    ["rm", "-f", "--ignore-unmatch", "--", path],
    `upstream deletion fallback for ${path}`,
  );
}

export function policyContestedPaths(input: {
  upstreamChangedFiles: string[];
  locallyChangedFiles: string[];
}): string[] {
  const localFiles = new Set(input.locallyChangedFiles);
  return input.upstreamChangedFiles.filter((path) => localFiles.has(path));
}

/** Applies the score policy to every path changed on both sides of a merge. */
export async function applyScoreMergePolicy(
  input: ApplyScoreMergePolicyInput,
): Promise<ApplyScoreMergePolicyResult> {
  const contestedPaths = policyContestedPaths(input);
  const files: PolicyMergeFileLog[] = [];
  const rewrittenPaths: string[] = [];
  for (const path of contestedPaths) {
    if (!path.endsWith(".c")) {
      await takeUpstreamFileWhole(input.runGit, input.worktreePath, input.upstreamRevision, path);
      const partial = {
        path,
        result: null,
        wholeFileFallbackReason: "non-C contested file",
        upstreamReportFallbackReason: input.reports.upstreamReportFallbackReason,
      };
      files.push({ ...partial, message: policyMergeFileMessage(partial) });
      continue;
    }
    const [base, ours, upstream] = await Promise.all([
      gitFileText(input.runGit, input.worktreePath, input.baseRevision, path),
      gitFileText(input.runGit, input.worktreePath, input.oursRevision, path),
      gitFileText(input.runGit, input.worktreePath, input.upstreamRevision, path),
    ]);
    if (base.error || ours.error || upstream.error) {
      await takeUpstreamFileWhole(input.runGit, input.worktreePath, input.upstreamRevision, path);
      const unavailable = [
        base.error ? `base: ${base.error}` : null,
        ours.error ? `ours: ${ours.error}` : null,
        upstream.error ? `upstream: ${upstream.error}` : null,
      ].filter((value): value is string => value !== null).join("; ");
      const partial = {
        path,
        result: null,
        wholeFileFallbackReason: `parent text unavailable (${unavailable})`,
        upstreamReportFallbackReason: input.reports.upstreamReportFallbackReason,
      };
      files.push({ ...partial, message: policyMergeFileMessage(partial) });
      continue;
    }
    const result = mergeCFileByPolicy({
      path,
      baseText: base.text,
      oursText: ours.text,
      upstreamText: upstream.text,
      oursScores: functionScoresForSourcePath(input.reports.ours, path),
      upstreamScores: functionScoresForSourcePath(input.reports.upstream, path),
      scoreMode: input.reports.scoreMode,
    });
    const partial = {
      path,
      result,
      wholeFileFallbackReason: null,
      upstreamReportFallbackReason: input.reports.upstreamReportFallbackReason,
    };
    files.push({ ...partial, message: policyMergeFileMessage(partial) });
    let mergedText = "";
    try {
      mergedText = await readFile(resolve(input.worktreePath, path), "utf8");
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (mergedText !== result.text) {
      const selectedSide = result.fallback?.side
        ?? (result.strategy === "ours_whole" ? "ours" : result.strategy === "upstream_whole" ? "upstream" : null);
      const selectedParentMissing = selectedSide === "ours"
        ? !ours.exists
        : selectedSide === "upstream" ? !upstream.exists : false;
      if (selectedParentMissing && result.text === "") {
        await rm(resolve(input.worktreePath, path), { force: true });
      } else {
        await writeFile(resolve(input.worktreePath, path), result.text);
      }
      rewrittenPaths.push(path);
    }
  }
  return { files, rewrittenPaths };
}
