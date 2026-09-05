/**
 * First-class Pi tools for registered decomp analysis tools.
 *
 * These expose source/tool evidence as distinct model affordances. The worker
 * can choose the specific tool whose evidence type matches the question instead
 * of searching through a generic command list.
 */
import { isAbsolute, resolve } from "node:path";
import { runKnowledgeToolApiForContext } from "../runtime/execution.js";
import type { AgentToolRegistration, AgentToolRuntimeContext } from "../types.js";
import { boundedLimit, jsonToolResult } from "../runtime/results.js";
import { mwccDebugCompilerProvisioned } from "./mwcc-debug-capability.js";

const evidenceToolRoles = [
  "worker",
  "pr-splitter",
  "librarian",
  "reconcile",
  "qa-repair",
] as const;

const lookupParameters = {
  type: "object",
  properties: {
    query: { type: "string", description: "Concrete symbol, source path, address, opcode pattern, mismatch symptom, or compiler-shape term." },
    limit: { type: "number", description: "Maximum results to return. Values are clamped to a small safe bound." },
  },
  required: ["query"],
  additionalProperties: false,
};

interface SpecializedToolDefinition {
  id: string;
  toolId: string;
  scriptName: string;
  label: string;
  purpose: string;
  description: string;
  guidance: string;
}

interface KnowledgeApiToolDefinition {
  id: string;
  toolId: string;
  scriptName: string;
  label: string;
  purpose: string;
  description: string;
  guidance: string;
  parameters: Record<string, unknown>;
  executionMode?: "parallel" | "sequential";
  args(params: Record<string, unknown>, context: AgentToolRuntimeContext): string[] | Record<string, unknown>;
  normalizeResult?(result: Record<string, unknown>, params: Record<string, unknown>): Record<string, unknown>;
}

const functionParameters = {
  type: "object",
  properties: {
    function: { type: "string", description: "Function symbol." },
    timeout_seconds: { type: "number", description: "Maximum runtime in seconds." },
  },
  required: ["function"],
  additionalProperties: false,
};

const functionsParameters = {
  type: "object",
  properties: {
    functions: { type: "array", items: { type: "string" }, description: "Function symbols to check." },
    timeout_seconds: { type: "number", description: "Maximum runtime in seconds." },
  },
  required: ["functions"],
  additionalProperties: false,
};

/** Read a required string parameter from a tool call. */
function stringParam(params: Record<string, unknown>, key: string): string {
  return String(params[key] ?? "").trim();
}

/** Read an optional boolean parameter from a tool call. */
function boolParam(params: Record<string, unknown>, key: string): boolean {
  return params[key] === true || params[key] === "true";
}

/** Clamp a numeric parameter without using lookup-result limits. */
function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

/** Clamp a numeric parameter while preserving its fractional component. */
function boundedFloat(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

/** Normalize string-array or comma/space-separated parameters. */
function stringListParam(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Resolve a game-relative path for APIs that read files directly. */
function gamePath(context: AgentToolRuntimeContext, value: string): string {
  if (!value) return "";
  return isAbsolute(value) ? value : resolve(context.repoRoot, value);
}

/** Create a first-class wrapper around one registered knowledge tool API. */
function specializedTool(definition: SpecializedToolDefinition): AgentToolRegistration {
  return {
    id: definition.id,
    purpose: definition.purpose,
    allowedRoles: [...evidenceToolRoles],
    capabilities: ["registered_tool_api", definition.toolId],
    create(context) {
      return {
        name: definition.id,
        label: definition.label,
        description: definition.description,
        promptSnippet: `${definition.id}: ${definition.purpose}`,
        promptGuidelines: [definition.guidance],
        parameters: lookupParameters,
        executionMode: "parallel",
        async execute(_toolCallId, params) {
          const query = String(params.query ?? "").trim();
          if (!query) return jsonToolResult(definition.id, { status: "missing_query" });
          return jsonToolResult(
            definition.id,
            await runKnowledgeToolApiForContext(context, definition.toolId, definition.scriptName, ["--query", query, "--limit", String(boundedLimit(params.limit)), "--json"]),
          );
        },
      };
    },
  };
}

/** Create a first-class wrapper around a non-search knowledge tool API. */
function knowledgeApiTool(definition: KnowledgeApiToolDefinition): AgentToolRegistration {
  return {
    id: definition.id,
    purpose: definition.purpose,
    allowedRoles: [...evidenceToolRoles],
    capabilities: ["registered_tool_api", definition.toolId],
    create(context) {
      return {
        name: definition.id,
        label: definition.label,
        description: definition.description,
        promptSnippet: `${definition.id}: ${definition.purpose}`,
        promptGuidelines: [definition.guidance],
        parameters: definition.parameters,
        executionMode: definition.executionMode ?? "sequential",
        async execute(_toolCallId, params) {
          const args = definition.args(params, context);
          if (!Array.isArray(args)) return jsonToolResult(definition.id, args);
          const result = await runKnowledgeToolApiForContext(context, definition.toolId, definition.scriptName, [...args, "--json"]);
          return jsonToolResult(definition.id, definition.normalizeResult?.(result, params) ?? result);
        },
      };
    },
  };
}

/** Tool for cached MWCC compiler-shape and debug evidence. */
export const mwccDebugLookupToolRegistration = specializedTool({
  id: "mwcc_debug_lookup",
  toolId: "mwcc_debug",
  scriptName: "lookup_dump.py",
  label: "MWCC Debug Lookup",
  purpose: "Look up cached MWCC compiler-shape/debug notes.",
  description: "Search cached MWCC notes about compiler behavior and code-shape patterns. Returns ranked snippets with evidence references, not evidence about the current compile. Use it after the first diff is classified and local source evidence does not explain the compiler shape.",
  guidance: "Use mwcc_debug_lookup only after lighter local/source/tool evidence stops explaining a late compiler-shape mismatch.",
});

/** Tool for running focused checkdiff output for one function. */
export const checkdiffRunToolRegistration = knowledgeApiTool({
  id: "checkdiff_run",
  toolId: "checkdiff",
  scriptName: "run.py",
  label: "Checkdiff Run",
  purpose: "Run focused checkdiff/objdiff output for one function.",
  description: "Compile the owning translation unit and compare one function with its target. Returns focused output; full_diff includes up to 24 mismatch rows with left as target and right as current, but instruction parity can hide strict relocation or data differences. Use it first, after each source edit, and for final function verification.",
  guidance: "Use checkdiff_run after a concrete source edit or mismatch hypothesis needs verifier evidence; prefer it over raw tools/asm-differ/diff.py shell commands and preserve stdout/stderr plus command provenance in the report.",
  parameters: {
    type: "object",
    properties: {
      function: { type: "string", description: "Function symbol to diff." },
      full_diff: { type: "boolean", description: "Return up to 24 mismatching rows with kind and both sides." },
      timeout_seconds: { type: "number", description: "Maximum runtime in seconds." },
    },
    required: ["function"],
    additionalProperties: false,
  },
  args(params, context) {
    const fn = stringParam(params, "function");
    if (!fn) return { status: "missing_function" };
    const args = ["--repo-root", context.repoRoot, "--function", fn, "--timeout-seconds", String(boundedNumber(params.timeout_seconds, 180, 10, 900))];
    if (boolParam(params, "full_diff")) args.push("--full-diff");
    return args;
  },
});

/** Tool for running checkdiff summary mode over multiple functions. */
export const checkdiffSummaryToolRegistration = knowledgeApiTool({
  id: "checkdiff_summary",
  toolId: "checkdiff",
  scriptName: "summary.py",
  label: "Checkdiff Summary",
  purpose: "Run PASS/FAIL checkdiff summaries for one or more functions.",
  description: "Compile the owning translation units for a list of functions and check each one. Returns PASS/FAIL summary lines, not mismatch rows or causes; nested stderr can still report unknown symbols. Use it after a target edit to check affected neighbors or batch final validation.",
  guidance: "Use checkdiff_summary for batch validation or neighbor checks when full diffs are unnecessary; prefer it over raw tools/asm-differ/diff.py shell commands.",
  parameters: functionsParameters,
  args(params, context) {
    const functions = stringListParam(params.functions);
    if (!functions.length) return { status: "missing_functions" };
    return ["--repo-root", context.repoRoot, "--functions", functions.join(","), "--timeout-seconds", String(boundedNumber(params.timeout_seconds, 240, 10, 1200))];
  },
});

/** Tool for compiling one translation unit directly with the exact MWCC build edge. */
export const directCompileTuToolRegistration = knowledgeApiTool({
  id: "direct_compile_tu",
  toolId: "checkdiff",
  scriptName: "direct_compile.py",
  label: "Direct Compile TU",
  purpose: "Compile one function's translation unit through the exact MWCC build rule.",
  description: "Compile one translation unit selected by exactly one of `function` or `unit`, without objdiff. Returns command, status, and candidate-object metadata, but no target comparison; the object is removed unless kept. Use it after a build failure or when later diff tooling needs an object path.",
  guidance: "Use direct_compile_tu to separate compiler/build failures from objdiff mismatches before deeper diagnosis.",
  parameters: {
    type: "object",
    properties: {
      function: { type: "string", description: "Function symbol whose owning unit should compile." },
      unit: { type: "string", description: "Unit path without src/ prefix or .c suffix." },
      keep_object: { type: "boolean", description: "Keep the temporary object path after the API exits." },
    },
    additionalProperties: false,
  },
  args: directCompileTuArgs,
  normalizeResult: annotateIgnoredDirectCompileUnit,
});

/** Build direct-compile arguments, preferring function because it identifies the unit. */
export function directCompileTuArgs(params: Record<string, unknown>, context: AgentToolRuntimeContext): string[] | Record<string, unknown> {
  const fn = stringParam(params, "function");
  const unit = stringParam(params, "unit");
  if (!fn && !unit) return { status: "missing_function_or_unit" };
  const args = ["--repo-root", context.repoRoot];
  if (fn) args.push("--function", fn);
  else args.push("--unit", unit);
  if (boolParam(params, "keep_object")) args.push("--keep-object");
  return args;
}

/** Tell the caller when a redundant unit selector was omitted from the CLI call. */
export function annotateIgnoredDirectCompileUnit(result: Record<string, unknown>, params: Record<string, unknown>): Record<string, unknown> {
  if (!stringParam(params, "function") || !stringParam(params, "unit")) return result;
  return { ...result, note: "unit was ignored because function implies the unit." };
}

/** Tool for scoring an already-built candidate object with objdiff. */
export const objdiffScoreCandidateToolRegistration = knowledgeApiTool({
  id: "objdiff_score_candidate",
  toolId: "objdiff_score",
  scriptName: "score_candidate.py",
  label: "objdiff Score Candidate",
  purpose: "Score a known candidate object for one function against the target object.",
  description: "Score an already-built candidate object for one function against the target object. Returns strict and relaxed score data and percent differences, not instruction rows, source causes, or allocator state. Use it after direct_compile_tu when you need to measure that specific candidate object.",
  guidance: "Use objdiff_score_candidate only when a candidate .o already exists; normal source edit validation should use checkdiff first.",
  parameters: {
    type: "object",
    properties: {
      function: { type: "string", description: "Function symbol to score." },
      candidate_object: { type: "string", description: "Path to candidate .o file." },
      unit: { type: "string", description: "Optional unit path if function lookup should be skipped." },
      timeout_seconds: { type: "number", description: "Maximum runtime in seconds." },
    },
    required: ["function", "candidate_object"],
    additionalProperties: false,
  },
  args(params, context) {
    const fn = stringParam(params, "function");
    const candidate = stringParam(params, "candidate_object");
    if (!fn || !candidate) return { status: "missing_function_or_candidate_object" };
    const args = [
      "--repo-root",
      context.repoRoot,
      "--function",
      fn,
      "--candidate-object",
      gamePath(context, candidate),
      "--timeout-seconds",
      String(boundedNumber(params.timeout_seconds, 60, 5, 300)),
    ];
    const unit = stringParam(params, "unit");
    if (unit) args.push("--unit", unit);
    return args;
  },
});

// Live dump/diagnose calls need the instrumented mwcceppc_debug.exe built per
// toolpacks/gamecube-decomp/_impl/gamecube/mwcc_debug/README.md. Gate them on provisioning so an
// unprovisioned checkout returns structured guidance instead of a script crash
// that the runner would classify as a tool error.
function mwccDebugUnavailablePayload(): Record<string, unknown> {
  return {
    status: "debug_compiler_not_provisioned",
    guidance:
      "The instrumented mwcceppc_debug.exe is not installed in this checkout, so live dump/diagnose evidence is unavailable. Do not retry or report this as a tool error; continue with checkdiff/objdiff, cached mwcc_debug_lookup notes, and source evidence.",
  };
}

/** Tool for live mwcc_debug function pcdump output. */
export const mwccDebugDumpFunctionToolRegistration = knowledgeApiTool({
  id: "mwcc_debug_dump_function",
  toolId: "mwcc_debug",
  scriptName: "dump_function.py",
  label: "MWCC Debug Dump Function",
  purpose: "Dump function-filtered mwcc_debug pcdump evidence for one function.",
  description: "Compile the owning translation unit with instrumented MWCC and extract one function's pcdump section. Returns command status and filtered compiler-pass text, not a target/current diff, and requires the debug compiler. Use it after the first diff identifies a concrete compiler-pass question.",
  guidance: "Use mwcc_debug_dump_function only after lighter evidence shows a compiler-pass question; it can be slow and requires instrumented MWCC.",
  parameters: {
    type: "object",
    properties: {
      function: { type: "string", description: "Function symbol to dump." },
      runner: { type: "string", enum: ["auto", "wibo", "wine"], description: "Execution backend." },
      timeout_seconds: { type: "number", description: "Maximum runtime in seconds." },
    },
    required: ["function"],
    additionalProperties: false,
  },
  args(params, context) {
    const fn = stringParam(params, "function");
    if (!fn) return { status: "missing_function" };
    if (!mwccDebugCompilerProvisioned(context)) return mwccDebugUnavailablePayload();
    return [
      "--repo-root",
      context.repoRoot,
      "--function",
      fn,
      "--runner",
      stringParam(params, "runner") || "auto",
      "--timeout-seconds",
      String(boundedNumber(params.timeout_seconds, 180, 10, 900)),
    ];
  },
});

function mwccDiagnoseTool(id: string, label: string, mode: "stack" | "regflow" | "inlines" | "raw", purpose: string, guidance: string): AgentToolRegistration {
  return knowledgeApiTool({
    id,
    toolId: "mwcc_debug",
    scriptName: "diagnose.py",
    label,
    purpose,
    description:
      mode === "stack"
        ? "Diagnose stack-frame and slot mismatches for one function. Returns target/current frame evidence, offset groups, and possible named locals, but does not prove a source-to-slot mapping or allocator cause. Use it after the first diff classifies a stack or frame residual."
        : mode === "regflow"
          ? "Diagnose one compact register-only mismatch window for a function. Returns operand-value and setup clues for one primary cluster, not full liveness or FPR coloring. Use it after the first diff classifies a register-only residual."
          : mode === "inlines"
            ? "Diagnose whether an inline or helper boundary may explain one function's mismatch. Returns mismatch, register, setup, and call-expansion clues, but cannot prove that extraction improves codegen. Use it after the first diff and other evidence point to an inline boundary."
            : `Run mwcc_diagnose.py ${mode} mode for one function.`,
    guidance,
    parameters: {
      type: "object",
      properties: {
        function: { type: "string", description: "Function symbol to diagnose." },
        runner: { type: "string", enum: ["auto", "wibo", "wine"], description: "Execution backend." },
        show_lines: { type: "boolean", description: "Include detailed mismatch instruction windows when supported." },
        show_mwcc: { type: "boolean", description: "Include raw stack-slot facts for stack mode." },
        timeout_seconds: { type: "number", description: "Maximum runtime in seconds." },
      },
      required: ["function"],
      additionalProperties: false,
    },
    args(params, context) {
      const fn = stringParam(params, "function");
      if (!fn) return { status: "missing_function" };
      if (!mwccDebugCompilerProvisioned(context)) return mwccDebugUnavailablePayload();
      const args = [
        "--repo-root",
        context.repoRoot,
        "--mode",
        mode,
        "--function",
        fn,
        "--runner",
        stringParam(params, "runner") || "auto",
        "--timeout-seconds",
        String(boundedNumber(params.timeout_seconds, 240, 10, 1200)),
      ];
      if (boolParam(params, "show_lines")) args.push("--show-lines");
      if (boolParam(params, "show_mwcc")) args.push("--show-mwcc");
      return args;
    },
  });
}

export const mwccDebugDiagnoseStackToolRegistration = mwccDiagnoseTool(
  "mwcc_debug_diagnose_stack",
  "MWCC Diagnose Stack",
  "stack",
  "Diagnose stack/frame mismatch evidence for one function.",
  "Use mwcc_debug_diagnose_stack when checkdiff shows stack/frame rows or frame-size drift after source-shape and type evidence have been checked.",
);

export const mwccDebugDiagnoseRegflowToolRegistration = mwccDiagnoseTool(
  "mwcc_debug_diagnose_regflow",
  "MWCC Diagnose Regflow",
  "regflow",
  "Return one compact register-only window; not full liveness or FPR coloring.",
  "Use mwcc_debug_diagnose_regflow for late register-only windows; do not use it as a substitute for fixing instruction sequence, calls, types, or source structure first.",
);

export const mwccDebugDiagnoseInlinesToolRegistration = mwccDiagnoseTool(
  "mwcc_debug_diagnose_inlines",
  "MWCC Diagnose Inlines",
  "inlines",
  "Find inline/helper extraction boundaries that might explain a mismatch.",
  "Use mwcc_debug_diagnose_inlines when mismatch evidence suggests helper extraction or inline boundary movement.",
);

export const mwccDebugRawDumpToolRegistration = mwccDiagnoseTool(
  "mwcc_debug_raw_dump",
  "MWCC Raw Dump",
  "raw",
  "Return the raw function-filtered mwcc_debug pcdump.",
  "Use mwcc_debug_raw_dump only when a specific compiler-pass detail is needed and summarized dump/diagnose output is insufficient.",
);

/** Tool for bounded source-permutation search. */
export const sourcePermuterRunToolRegistration = knowledgeApiTool({
  id: "source_permuter_run",
  toolId: "source_permuter",
  scriptName: "run.py",
  label: "Source Permuter Run",
  purpose: "Run a bounded non-mutating source permutation search for one function.",
  description: "Search compiled source mutations in named functions without applying them. Returns the best scalar score, one source diff, and optional replay data, but no target/current instruction rows. Use it on a bounded named region after the first diff is classified, then replay and inspect the candidate with checkdiff_run.",
  guidance: "source_permuter_run runs inside the claim sandbox, defaults to all sandbox cores, and has no cross-worker queue.",
  parameters: {
    type: "object",
    properties: {
      function: { type: "string", description: "Function symbol whose object code is scored." },
      mutate_functions: { type: "array", items: { type: "string" }, description: "Optional functions in the same TU to mutate." },
      max_iters: { type: "number", description: "Maximum compiled candidates." },
      timeout_seconds: { type: "number", description: "Maximum search runtime." },
      jobs: { type: "number", description: "Worker threads, capped by the source-permuter API policy." },
      seed: { type: "number", description: "Random seed." },
      keep_prob: { type: "number", description: "Probability of stacking another mutation." },
      no_narrow: { type: "boolean", description: "Skip post-search narrowing." },
      save_replay: { type: "string", description: "Optional replay JSON path." },
    },
    required: ["function"],
    additionalProperties: false,
  },
  args: sourcePermuterRunArgs,
  normalizeResult: promoteSourcePermuterInvocationFailure,
});

/** Build source-permuter arguments with sandbox auto-parallelism and serial host fallback. */
export function sourcePermuterRunArgs(params: Record<string, unknown>, context: AgentToolRuntimeContext): string[] | Record<string, unknown> {
  const fn = stringParam(params, "function");
  if (!fn) return { status: "missing_function" };
  const args = [
    "--repo-root",
    context.repoRoot,
    "--function",
    fn,
    "--max-iters",
    String(boundedNumber(params.max_iters, 32, 1, 10_000)),
    "--timeout-seconds",
    String(boundedNumber(params.timeout_seconds, 90, 5, 900)),
    "--seed",
    String(boundedNumber(params.seed, 0, 0, 2_147_483_647)),
    "--apply",
    "never",
  ];
  if (params.jobs !== undefined) args.push("--jobs", String(boundedNumber(params.jobs, 1, 1, 16)));
  else if (!context.sandboxHandle) args.push("--jobs", "1");
  const mutateFunctions = stringListParam(params.mutate_functions);
  for (const mutateFn of mutateFunctions) args.push("--mutate-function", mutateFn);
  if (typeof params.keep_prob === "number") args.push("--keep-prob", String(params.keep_prob));
  if (boolParam(params, "no_narrow")) args.push("--no-narrow");
  const saveReplay = stringParam(params, "save_replay");
  if (saveReplay) args.push("--save-replay", gamePath(context, saveReplay));
  return args;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function firstFailureReason(payload: Record<string, unknown>): string {
  for (const key of ["reason", "message", "error", "error_summary", "stderr", "stdout", "parse_error"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Source permuter could not find or parse the requested function at its source path.";
}

/** Promote source-selection failures printed by the adapter into the wrapper result. */
export function promoteSourcePermuterInvocationFailure(result: Record<string, unknown>): Record<string, unknown> {
  const nested = recordValue(result.parsed);
  if (!nested || nested.status === "ok") return result;

  const evidence = [nested.status, nested.reason, nested.message, nested.error, nested.error_summary, nested.stderr, nested.stdout, nested.parse_error, nested.source_path]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  const functionMissing = /function(?:_|[\s-])*not(?:_|[\s-])*found|function[^\n]*not in [^\n]*report\.json|function[^\n]*not found in/i.test(evidence);
  const parseFailed = /(?:parse|parsing|parser)(?:_|[\s-])*(?:failure|failed|error)|(?:failure|failed|error)[^\n]*(?:parse|parsing|parser)/i.test(evidence);
  const hasSourcePath = typeof nested.source_path === "string" || /source(?:_|[\s-])*path|[/\\]src[/\\]|\.c\b/i.test(evidence);
  const sourceParseFailed = parseFailed && hasSourcePath;
  if (!functionMissing && !sourceParseFailed) return result;

  return { ...result, status: "failed", reason: firstFailureReason(nested) };
}

/** Tool for replaying a saved source-permutation recipe without applying it. */
export const sourcePermuterReplayToolRegistration = knowledgeApiTool({
  id: "source_permuter_replay",
  toolId: "source_permuter",
  scriptName: "replay.py",
  label: "Source Permuter Replay",
  purpose: "Replay a saved source-permutation recipe without writing source.",
  description: "Replay a saved source-permuter recipe against current source without applying it. Returns one candidate score and source diff, not its target/current instruction delta. Use it after a promising bounded search, then run checkdiff_run to inspect the residual.",
  guidance: "source_permuter_replay runs inside the claim sandbox, defaults to all sandbox cores, and has no cross-worker queue. Inspect the source diff before applying anything.",
  parameters: {
    type: "object",
    properties: {
      replay: { type: "string", description: "Path to replay JSON recipe." },
      function: { type: "string", description: "Optional function guard." },
      timeout_seconds: { type: "number", description: "Maximum runtime in seconds." },
    },
    required: ["replay"],
    additionalProperties: false,
  },
  args(params, context) {
    const replay = stringParam(params, "replay");
    if (!replay) return { status: "missing_replay" };
    const args = ["--repo-root", context.repoRoot, "--replay", gamePath(context, replay), "--apply", "never", "--timeout-seconds", String(boundedNumber(params.timeout_seconds, 120, 10, 900))];
    const fn = stringParam(params, "function");
    if (fn) args.push("--function", fn);
    return args;
  },
});

/** Tool for previewing one or more source mutation steps as a diff. */
export const sourceMutationPreviewToolRegistration = knowledgeApiTool({
  id: "source_mutation_preview",
  toolId: "source_permuter",
  scriptName: "preview_mutation.py",
  label: "Source Mutation Preview",
  purpose: "Preview tree-sitter source mutation passes as a unified diff.",
  description: "Preview source-mutation passes for one function without writing the file. Returns a unified source diff, but does not compile, score, or check behavior. Use it after classifying the first diff to inspect a mutation idea before spending compile time.",
  guidance: "Use source_mutation_preview to understand a mutation pass before spending compile time; verify any retained idea with source review and checkdiff.",
  parameters: {
    type: "object",
    properties: {
      source_path: { type: "string", description: "Game-relative C source path." },
      function: { type: "string", description: "Function symbol to mutate." },
      pass_name: { type: "string", description: "Optional specific mutation pass." },
      seed: { type: "number", description: "Random seed." },
      steps: { type: "number", description: "Number of stacked mutation steps." },
      no_types: { type: "boolean", description: "Skip clang type oracle." },
      timeout_seconds: { type: "number", description: "Maximum runtime in seconds." },
    },
    required: ["source_path", "function"],
    additionalProperties: false,
  },
  args(params, context) {
    const sourcePath = stringParam(params, "source_path");
    const fn = stringParam(params, "function");
    if (!sourcePath || !fn) return { status: "missing_source_path_or_function" };
    const args = [
      "--repo-root",
      context.repoRoot,
      "--source-path",
      sourcePath,
      "--function",
      fn,
      "--seed",
      String(boundedNumber(params.seed, 1, 0, 2_147_483_647)),
      "--steps",
      String(boundedNumber(params.steps, 1, 1, 20)),
      "--timeout-seconds",
      String(boundedNumber(params.timeout_seconds, 60, 5, 300)),
    ];
    const passName = stringParam(params, "pass_name");
    if (passName) args.push("--pass-name", passName);
    if (boolParam(params, "no_types")) args.push("--no-types");
    return args;
  },
});

/** Tool for looking up clang expression types in one source file. */
export const typeOracleLookupToolRegistration = knowledgeApiTool({
  id: "type_oracle_lookup",
  toolId: "type_oracle",
  scriptName: "inspect.py",
  label: "Type Oracle Lookup",
  purpose: "Look up clang-derived expression types for one source file.",
  description: "Build a libclang type map for expressions and byte spans in one source file. Returns exact or containing current-source type rows, not target types, MWCC codegen, layout, or allocation evidence. Use it after the first diff and before extracting temporaries or changing pointer or value types.",
  guidance: "Use type_oracle_lookup before extracting temporaries or changing pointer/value types; rebuild after source edits because spans are byte-state-specific.",
  parameters: {
    type: "object",
    properties: {
      source_path: { type: "string", description: "Game-relative C source path." },
      expression: { type: "string", description: "Exact expression text to look up." },
      byte_start: { type: "number", description: "Exact expression byte start." },
      byte_end: { type: "number", description: "Exact expression byte end." },
      limit: { type: "number", description: "Maximum rows to return." },
    },
    required: ["source_path"],
    additionalProperties: false,
  },
  args(params, context) {
    const sourcePath = stringParam(params, "source_path");
    if (!sourcePath) return { status: "missing_source_path" };
    const args = ["--repo-root", context.repoRoot, "--source-path", sourcePath, "--limit", String(boundedLimit(params.limit, 20, 100))];
    const expression = stringParam(params, "expression");
    if (expression) args.push("--expression", expression);
    if (params.byte_start !== undefined) args.push("--byte-start", String(boundedNumber(params.byte_start, 0, 0, Number.MAX_SAFE_INTEGER)));
    if (params.byte_end !== undefined) args.push("--byte-end", String(boundedNumber(params.byte_end, 0, 0, Number.MAX_SAFE_INTEGER)));
    return args;
  },
});

/** Tool for inferring struct layout from assembly pointer-register evidence. */
export const structInferFromAsmToolRegistration = knowledgeApiTool({
  id: "struct_infer_from_asm",
  toolId: "struct_infer",
  scriptName: "infer.py",
  label: "Struct Infer From ASM",
  purpose: "Infer candidate struct fields by tracing one pointer register through a function's asm.",
  description: "Run infer_struct.py for a function/register and return a candidate struct skeleton plus trace evidence.",
  guidance: "Use struct_infer_from_asm when a concrete pointer register and offset pattern needs layout evidence; confirm names/types in source and headers.",
  parameters: {
    type: "object",
    properties: {
      function: { type: "string", description: "Function symbol." },
      ptr_reg: { type: "string", description: "Pointer register such as r3 or r29." },
      name: { type: "string", description: "Optional struct name." },
      verbose: { type: "boolean", description: "Include every observed access." },
      timeout_seconds: { type: "number", description: "Maximum runtime in seconds." },
    },
    required: ["function", "ptr_reg"],
    additionalProperties: false,
  },
  args(params, context) {
    const fn = stringParam(params, "function");
    const ptrReg = stringParam(params, "ptr_reg");
    if (!fn || !ptrReg) return { status: "missing_function_or_ptr_reg" };
    const args = ["--repo-root", context.repoRoot, "--function", fn, "--ptr-reg", ptrReg, "--timeout-seconds", String(boundedNumber(params.timeout_seconds, 60, 5, 300))];
    const name = stringParam(params, "name");
    if (name) args.push("--name", name);
    if (boolParam(params, "verbose")) args.push("--verbose");
    return args;
  },
});

/** Tool for generating an m2c scaffold for reading assembly flow. */
export const m2cDecompileToolRegistration = knowledgeApiTool({
  id: "m2c_decompile",
  toolId: "m2c_decomp",
  scriptName: "decompile.py",
  label: "m2c Decompile",
  purpose: "Generate an m2c scaffold for a function or translation unit.",
  description: "Run m2c for a function or translation unit without copying output into source. Returns command status and a C-like scaffold, not authored source, type truth, or match evidence. Use it after the first diff when readable control-flow scaffolding would help form a source hypothesis.",
  guidance: "Use m2c_decompile as a reading aid only; formatting is best-effort, and m2c output must be naturally rewritten and verified before it becomes reviewable source.",
  parameters: {
    type: "object",
    properties: {
      input: { type: "string", description: "Function symbol or translation unit path." },
      no_context: { type: "boolean", description: "Skip context generation." },
      format: { type: "boolean", description: "Format output with clang-format when available." },
      extra_args: { type: "array", items: { type: "string" }, description: "Additional m2c arguments." },
      timeout_seconds: { type: "number", description: "Maximum runtime in seconds." },
    },
    required: ["input"],
    additionalProperties: false,
  },
  args(params, context) {
    const input = stringParam(params, "input");
    if (!input) return { status: "missing_input" };
    const args = ["--repo-root", context.repoRoot, "--input", input, "--timeout-seconds", String(boundedNumber(params.timeout_seconds, 120, 10, 600))];
    if (boolParam(params, "no_context")) args.push("--no-context");
    if (boolParam(params, "format")) args.push("--format");
    for (const extraArg of stringListParam(params.extra_args)) args.push("--extra-arg", extraArg);
    return args;
  },
});

/** Tool for construct-level donor search over pre-indexed target-object windows. */
export const asmWindowSearchToolRegistration = knowledgeApiTool({
  id: "asm_window_search",
  toolId: "asm_window_search",
  scriptName: "window_search.py",
  label: "ASM Window Search",
  purpose: "Find matched donor functions with similar normalized instruction windows.",
  description: "Search indexed target objects for donor functions with similar 32-instruction windows. Returns ranked donor windows with fuzzy-match and embedding scores, not semantic equivalence or safe-to-copy source. Use it after the first diff isolates a construct and whole-function analogs are too broad.",
  guidance: "Use asm_window_search when a specific instruction construct needs a donor; use whole-function graph analogs first for broad similarity.",
  executionMode: "parallel",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Indexed query-function symbol." },
      unit: { type: "string", description: "Optional unit or source-path suffix used to disambiguate the symbol." },
      min_match: { type: "number", description: "Minimum donor fuzzy-match percent. Defaults to 98." },
      all: { type: "boolean", description: "Ignore the minimum fuzzy-match filter." },
      exclude_self_unit: { type: "boolean", description: "Exclude donor functions from the query unit." },
      limit: { type: "number", description: "Maximum donor functions to return." },
    },
    required: ["symbol"],
    additionalProperties: false,
  },
  args(params) {
    const symbol = stringParam(params, "symbol");
    if (!symbol) return { status: "missing_symbol" };
    // DTK target objects cover every function, so the query tokens are already
    // in the host index and no sandbox repo path or fetch step is needed.
    const args = ["--symbol", symbol];
    const unit = stringParam(params, "unit");
    if (unit) args.push("--unit", unit);
    if (params.min_match !== undefined) args.push("--min-match", String(boundedFloat(params.min_match, 98, 0, 100)));
    if (boolParam(params, "all")) args.push("--all");
    if (boolParam(params, "exclude_self_unit")) args.push("--exclude-self-unit");
    if (params.limit !== undefined) args.push("--limit", String(boundedLimit(params.limit)));
    return args;
  },
});

/** Tool for duplicate, near, union, and cast-overlay type-layout evidence. */
export const typeLayoutLookupToolRegistration = knowledgeApiTool({
  id: "type_layout_lookup",
  toolId: "type_layout_lookup",
  scriptName: "layout_lookup.py",
  label: "Type Layout Lookup",
  purpose: "Inspect flattened type layouts, union views, and cast-only overlays.",
  description: "Query indexed record layouts, near matches, union aliases, and cast-overlay flags. Returns mode-specific layout rows, not semantic ownership, current ABI truth, MWCC codegen, or allocation evidence. Use it after the first diff and before changing a record or union type.",
  guidance: "Use type_layout_lookup before changing a record or union type when field ownership, aliasing, or cast-only overlays are unclear.",
  executionMode: "parallel",
  parameters: {
    type: "object",
    properties: {
      record: { type: "string", description: "Optional record name." },
      mode: { type: "string", enum: ["dups", "near", "unions", "casts", "summary"], description: "Type-layout query mode." },
      at: { type: "string", description: "Hex or decimal byte offset for union-member views." },
      prefix: { type: "boolean", description: "Include truncated or prefix-compatible duplicate decodes." },
      limit: { type: "number", description: "Maximum rows to return." },
    },
    additionalProperties: false,
  },
  args(params) {
    // The normal path is fully host-index-side. The resolver fetches only
    // build/ctx.c when a sandbox claim needs to populate its private cache.
    const args: string[] = [];
    const record = stringParam(params, "record");
    const mode = stringParam(params, "mode");
    const at = stringParam(params, "at");
    if (record) args.push("--record", record);
    if (mode) args.push("--mode", mode);
    if (at) args.push("--at", at);
    if (boolParam(params, "prefix")) args.push("--prefix");
    if (params.limit !== undefined) args.push("--limit", String(boundedLimit(params.limit)));
    return args;
  },
});

/** Tool for previewing missing include additions. */
export const includeFixerPreviewToolRegistration = knowledgeApiTool({
  id: "include_fixer_preview",
  toolId: "include_fixer",
  scriptName: "preview.py",
  label: "Include Fixer Preview",
  purpose: "Preview missing include additions for one source file without writing it.",
  description: "Run clang syntax diagnostics and header search to propose include lines and a diff.",
  guidance: "Use include_fixer_preview when compile diagnostics point to undeclared functions; inspect the proposed header ownership before editing.",
  parameters: {
    type: "object",
    properties: {
      source_path: { type: "string", description: "Game-relative C source path." },
    },
    required: ["source_path"],
    additionalProperties: false,
  },
  args(params, context) {
    const sourcePath = stringParam(params, "source_path");
    if (!sourcePath) return { status: "missing_source_path" };
    return ["--repo-root", context.repoRoot, "--source-path", sourcePath];
  },
});

/** Tool for previewing ItemStateTable C definitions from asm labels. */
export const itemStateTablePreviewToolRegistration = knowledgeApiTool({
  id: "item_state_table_preview",
  toolId: "item_state_table",
  scriptName: "preview.py",
  label: "ItemStateTable Preview",
  purpose: "Preview a generated C ItemStateTable definition from an asm data label.",
  description: "Find the owning source/asm files and format an ItemStateTable definition without inserting it.",
  guidance: "Use item_state_table_preview only for item data conversion work; verify data ownership and section impact before applying generated C.",
  parameters: {
    type: "object",
    properties: {
      label: { type: "string", description: "ItemStateTable data label such as it_803F93A8." },
    },
    required: ["label"],
    additionalProperties: false,
  },
  args(params, context) {
    const label = stringParam(params, "label");
    if (!label) return { status: "missing_label" };
    return ["--repo-root", context.repoRoot, "--label", label];
  },
});

/** Tool for scanning source snippets/files for decomp review anti-patterns. */
export const reviewLintScanToolRegistration = knowledgeApiTool({
  id: "review_lint_scan",
  toolId: "review_lint",
  scriptName: "scan.py",
  label: "Review Lint Scan",
  purpose: "Scan source text or a file for decomp review anti-patterns.",
  description: "Scan source text or a file for configured decomp review anti-patterns. Returns findings for type-erasing casts, M2C_FIELD residue, and duplicate typed pointer variables, not proof that code is incorrect. Use it after retained edits and before reporting or final validation.",
  guidance: "Use review_lint_scan before returning edits or during PR review; treat findings as focused review prompts with source context.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Source snippet to scan." },
      file: { type: "string", description: "Game-relative or absolute file to scan." },
      rule: { type: "string", enum: ["all", "type_erasing_casts", "inline_pointer_vars"], description: "Rule group to run." },
    },
    additionalProperties: false,
  },
  args(params, context) {
    const text = String(params.text ?? "");
    const file = stringParam(params, "file");
    if (!text && !file) return { status: "missing_text_or_file" };
    const args = text ? ["--text", text] : ["--file", gamePath(context, file)];
    const rule = stringParam(params, "rule");
    if (rule) args.push("--rule", rule);
    return args;
  },
});

/** Tool for previewing or applying an isolated .sdata2 ordering helper. */
export const reviewLintSdata2OrderHelperToolRegistration = knowledgeApiTool({
  id: "review_lint_sdata2_order_helper",
  toolId: "review_lint",
  scriptName: "sdata2_order_helper.py",
  label: "Sdata2 Order Helper",
  purpose: "Generate or explicitly apply an isolated helper that forces .sdata2 float/double ordering from the reference object.",
  description: "Preview or explicitly install a helper that forces reference .sdata2 float and double order. Returns the proposed change and optional validation, but does not fix instruction mismatches or other data defects. Use it only after the first diff shows a pure .sdata2 ordering residual and inline literals are restored.",
  guidance: "Use only after restoring inline numeric literals and confirming the remaining mismatch is .sdata2 float/double order. Preview first; pass apply=true only when this helper is the intended source edit.",
  parameters: {
    type: "object",
    properties: {
      source: { type: "string", description: "Game-relative or absolute source file path." },
      unit: { type: "string", description: "Unit path without src/ prefix or .c suffix." },
      symbols: { type: "array", items: { type: "string" }, description: "Reference .sdata2 symbol names to include. Defaults to all entries." },
      name: { type: "string", description: "Generated helper function name." },
      apply: { type: "boolean", description: "Write or replace the helper in source. Defaults to false preview mode." },
      validate: { type: "boolean", description: "After apply, direct-compile the TU and compare .sdata2 order." },
      prefer_named_macros: { type: "boolean", description: "Emit known game macros such as S32_TO_F32 instead of raw double literals." },
    },
    additionalProperties: false,
  },
  args(params, context) {
    const source = stringParam(params, "source");
    const unit = stringParam(params, "unit");
    if (!source && !unit) return { status: "missing_source_or_unit" };
    const args = ["--repo-root", context.repoRoot];
    if (source) args.push("--source", gamePath(context, source));
    else args.push("--unit", unit);
    for (const symbol of stringListParam(params.symbols)) args.push("--symbol", symbol);
    const name = stringParam(params, "name");
    if (name) args.push("--name", name);
    if (boolParam(params, "apply")) args.push("--apply");
    if (boolParam(params, "validate")) args.push("--validate");
    if (boolParam(params, "prefer_named_macros")) args.push("--prefer-named-macros");
    return args;
  },
});

/** Tool for capturing live MWCC register-allocator state for one function. */
export const mwccAllocSnapshotToolRegistration = knowledgeApiTool({
  id: "mwcc_alloc_snapshot",
  toolId: "mwcc_alloc",
  scriptName: "snapshot.py",
  label: "MWCC Allocator Snapshot",
  purpose: "Capture live MWCC register-allocator/coloring state for one function.",
  description: "Capture selected PCode or GPR-only allocator coloring for one function under stock MWCC; pair mode captures two stages of one compile. Returns blocks or GPR color, interference, and simplify-order data, not FPR coloring, retail comparison, source identities, or live intervals. Use it after a full diff isolates a register-only GPR residual.",
  guidance: "Use this as last-resort register-shape evidence only after checkdiff/mwcc_debug_lookup and source-shape evidence stall on a register-allocation-only mismatch. GPR coloring only; no FPR coloring; before/after are two stages of one compile, not candidate vs target. A call takes minutes because the compile runs under qemu, so batch your questions. pair captures the snapshots you can feed to mwcc_alloc_compare.",
  parameters: {
    type: "object",
    properties: {
      unit: { type: "string", description: "Workspace-relative translation unit path." },
      function: { type: "string", description: "Function symbol to capture." },
      capture: { type: "string", enum: ["pcode", "coloring", "pair"], description: "Allocator state to capture. Defaults to pair." },
      timeout_seconds: { type: "number", description: "Maximum runtime in seconds." },
    },
    required: ["unit", "function"],
    additionalProperties: false,
  },
  executionMode: "sequential",
  args(params, context) {
    const unit = stringParam(params, "unit");
    const fn = stringParam(params, "function");
    if (!unit || !fn) return { status: "missing_unit_or_function" };
    const capture = stringParam(params, "capture") || "pair";
    return ["--repo-root", context.repoRoot, "--unit", unit, "--function", fn, "--capture", capture, "--timeout-seconds", String(boundedNumber(params.timeout_seconds, 900, 60, 1800))];
  },
});

/** Tool for comparing two MWCC coloring snapshots. */
export const mwccAllocCompareToolRegistration = knowledgeApiTool({
  id: "mwcc_alloc_compare",
  toolId: "mwcc_alloc",
  scriptName: "compare.py",
  label: "MWCC Coloring Compare",
  purpose: "Diff two MWCC coloring snapshots per virtual register.",
  description: "Compare two GPR allocator coloring snapshots. Returns added, removed, or changed virtual registers with color, graph, neighbor, and simplify-order deltas, not retail comparison, FPR coloring, source identities, or causal proof. Use it after mwcc_alloc_snapshot returns the two stage paths for a register-only GPR residual.",
  guidance: "Feed it the before/after paths returned by mwcc_alloc_snapshot. GPR coloring only; no FPR coloring; before/after are two stages of one compile, not candidate vs target. Deltas show interference, physical-register, and simplify-order movement.",
  parameters: {
    type: "object",
    properties: {
      before: { type: "string", description: "Workspace-relative path to the before snapshot JSON." },
      after: { type: "string", description: "Workspace-relative path to the after snapshot JSON." },
    },
    required: ["before", "after"],
    additionalProperties: false,
  },
  executionMode: "parallel",
  args(params, context) {
    const before = stringParam(params, "before");
    const after = stringParam(params, "after");
    if (!before || !after) return { status: "missing_before_or_after" };
    return ["--repo-root", context.repoRoot, "--before", before, "--after", after];
  },
});

/** All callable decomp capability wrappers, reusable across profiles. */
export const capabilityToolRegistrations = [
  mwccDebugLookupToolRegistration,
  checkdiffRunToolRegistration,
  checkdiffSummaryToolRegistration,
  directCompileTuToolRegistration,
  objdiffScoreCandidateToolRegistration,
  mwccDebugDumpFunctionToolRegistration,
  mwccDebugDiagnoseStackToolRegistration,
  mwccDebugDiagnoseRegflowToolRegistration,
  mwccDebugDiagnoseInlinesToolRegistration,
  mwccDebugRawDumpToolRegistration,
  sourcePermuterRunToolRegistration,
  sourcePermuterReplayToolRegistration,
  sourceMutationPreviewToolRegistration,
  typeOracleLookupToolRegistration,
  structInferFromAsmToolRegistration,
  m2cDecompileToolRegistration,
  asmWindowSearchToolRegistration,
  typeLayoutLookupToolRegistration,
  includeFixerPreviewToolRegistration,
  itemStateTablePreviewToolRegistration,
  reviewLintScanToolRegistration,
  reviewLintSdata2OrderHelperToolRegistration,
  mwccAllocSnapshotToolRegistration,
  mwccAllocCompareToolRegistration,
] as const;
