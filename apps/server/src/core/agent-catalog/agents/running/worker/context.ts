import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineContext } from "@agent-kernel/kernel/agent-definition";
import type { LoaderDeclaration } from "@agent-kernel/kernel/context";
import type { OrderingMode, StackFramePolicy, SteeringGateMode } from "@server/core/game-registry/resolver.js";
import type { AdvisoryAdjudicationMode } from "@server/core/game-registry/runtime-options.js";
import { gameOrdering, orderingActive } from "@server/core/tools/ordering.js";
import { gameStackFramePolicy } from "@server/core/tools/stack-frame-policy.js";
import { gameSteeringGate, steeringGateActive } from "@server/core/tools/steering-gate.js";
import type {
  PiPromptBundle,
  RunGameMetadata,
} from "@server/core/shared/types";
import {
  fileGraphCard,
  globalStandardsPromptXml,
  hasGameScopedStandards,
  graphDbExists,
  openKnowledgeGraph,
  resourceGraphDbPath,
} from "@server/core/knowledge";
import { withActiveVerification } from "@server/core/knowledge/graph/file-card.js";
import type { FileGraphCard } from "@server/core/knowledge/graph/types.js";
import { loadV2TargetCard } from "@server/core/knowledge-v2/card.js";
import { formatSourceView, renderSourceView, sourceViewForText, sourceViewStartLine, SOURCE_VIEW_MAX_BYTES, type SourceName } from "@server/core/knowledge-v2/source-view.js";
import {
  renderTemplate,
  stableJson,
} from "@server/infrastructure/agent-runtime/runtime";
import {
  createInlineAgentContextResolver,
  defaultKernelTurnPrompt,
  promptKernelContext,
  rootContextLoaderDeclaration,
} from "@server/core/agent-catalog/kernel-context.js";

export type WorkerPromptContextBudget = "full" | "compact" | "minimal";

export const WORKER_TARGET_FILE_INLINE_CHAR_LIMIT = 32_000;
export const WORKER_COMPACT_TARGET_FILE_INLINE_CHAR_LIMIT = 12_000;
export const WORKER_MINIMAL_TARGET_FILE_INLINE_CHAR_LIMIT = 3_000;

const WORKER_CONTEXT_BUDGETS = {
  full: {
    sourceLimit: WORKER_TARGET_FILE_INLINE_CHAR_LIMIT,
    standards: "full",
  },
  compact: {
    sourceLimit: WORKER_COMPACT_TARGET_FILE_INLINE_CHAR_LIMIT,
    standards: "summary",
  },
  minimal: {
    sourceLimit: WORKER_MINIMAL_TARGET_FILE_INLINE_CHAR_LIMIT,
    standards: "minimal",
  },
} as const satisfies Record<
  WorkerPromptContextBudget,
  {
    sourceLimit: number;
    standards: "full" | "summary" | "minimal";
  }
>;

const loaders = [
  rootContextLoaderDeclaration,
  { kind: "worker-packet", ref: "worker-packet", label: "worker-packet" },
] as const satisfies readonly LoaderDeclaration[];

export const context = defineContext(
  createInlineAgentContextResolver(loaders, defaultKernelTurnPrompt("worker")),
);

export interface WorkerPromptOptions {
  packet: Record<string, unknown>;
  repoRoot: string;
  stateDir: string;
  game?: RunGameMetadata;
  initialBoardPath: string;
  workerLogDir: string;
  contextBudget?: WorkerPromptContextBudget;
  /** Sandbox-prefetched target source; undefined keeps local rendering unchanged. */
  targetSourceText?: string | null;
  /** Explicit catalog/test fixtures; real workers load current names from the KB. */
  sourceNames?: readonly SourceName[];
  /** Shadow and enforce ask for the `kept_advisories` note field; omitted renders `off`, today's text. */
  advisoryAdjudication?: AdvisoryAdjudicationMode;
  /** The game's `matching.stackFramePolicy`; omitted resolves it from `game`, else `match_frame` (today's text). */
  stackFramePolicy?: StackFramePolicy;
  /** The game's `matching.steeringGate`; omitted resolves it from `game`, else `off` (today's text). */
  steeringGate?: SteeringGateMode;
  /** The game's `ordering.mode`; omitted resolves it from `game`, else `off` (today's text). */
  ordering?: OrderingMode;
}

/** The stack frame policy the worker prompt renders for. */
export function workerStackFramePolicy(
  options: Pick<WorkerPromptOptions, "game" | "stackFramePolicy">,
): StackFramePolicy {
  return options.stackFramePolicy ?? gameStackFramePolicy(options.game);
}

/** The steering gate mode the worker prompt renders for. */
export function workerSteeringGate(
  options: Pick<WorkerPromptOptions, "game" | "steeringGate">,
): SteeringGateMode {
  return options.steeringGate ?? gameSteeringGate(options.game);
}

/** The ordering mode the worker prompt renders for. */
export function workerOrdering(
  options: Pick<WorkerPromptOptions, "game" | "ordering">,
): OrderingMode {
  return options.ordering ?? gameOrdering(options.game)?.mode ?? "off";
}

export interface WorkerPromptInputXmlOptions {
  packet: Record<string, unknown>;
  repoRoot: string;
  game?: RunGameMetadata;
  contextBudget?: WorkerPromptContextBudget;
  targetSourceText?: string | null;
  sourceNames?: readonly SourceName[];
  /** The game's `matching.steeringGate`; omitted resolves it from `game`, else `off`. */
  steeringGate?: SteeringGateMode;
}

export interface WorkerPromptInputXml {
  targetXml: string;
  firstDiffXml: string;
}

const WORKER_PACKET_CONTEXT_TEMPLATE = `
{{REPAIR_REQUEST_XML}}

{{TARGET_XML}}

{{FIRST_DIFF_XML}}{{STEERING_PROBE_XML}}{{NOT_READY_CLASSES_XML}}

{{TARGET_KNOWLEDGE_XML}}

{{DECOMP_STANDARDS_XML}}
`;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item) => Object.keys(item).length > 0)
    : [];
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

function jsonBlockXml(
  tag: string,
  value: unknown,
  indent = "        ",
): string {
  return [
    `${indent}<${tag}>`,
    "```json",
    stableJson(value),
    "```",
    `${indent}</${tag}>`,
  ].join("\n");
}

interface TargetContextHints {
  editability: {
    mode: string | null;
    reason: string | null;
  } | null;
  sameFileSymbols: string[];
  relatedFunctions: {
    callers: Array<Record<string, unknown>>;
    callees: Array<Record<string, unknown>>;
    analogs: Array<Record<string, unknown>>;
  } | null;
}

function targetFileXml(
  target: Record<string, unknown>,
  baseline: Record<string, unknown>,
  primarySourcePath: string,
  primarySourceAbs: string,
  contextBudget: WorkerPromptContextBudget,
  targetSourceText?: string | null,
  indent = "    ",
  proposedView?: string,
): string {
  const budget = WORKER_CONTEXT_BUDGETS[contextBudget];
  const fileText = targetSourceText !== undefined
    ? targetSourceText
    : primarySourceAbs && existsSync(primarySourceAbs)
      ? readFileSync(primarySourceAbs, "utf8")
      : null;
  const originalChars = fileText?.length ?? null;
  const truncated = fileText != null && fileText.length > budget.sourceLimit;
  const inlineText = fileText == null
    ? null
    : truncated
      ? truncateTargetSourceForPrompt(fileText, budget.sourceLimit)
      : fileText;
  const attrs = [
    optionalAttribute("path", primarySourcePath),
    optionalAttribute("unit", optionalString(target.unit)),
    optionalAttribute("symbol", optionalString(target.symbol)),
    optionalAttribute("size", optionalNumber(target.size)),
    optionalAttribute(
      "baseline_match_percent",
      optionalNumber(baseline.fuzzy_match_percent) ??
        optionalNumber(target.fuzzy_match_percent),
    ),
    optionalAttribute("context_budget", contextBudget),
    truncated ? optionalAttribute("truncated", "true") : "",
    truncated ? optionalAttribute("original_chars", originalChars) : "",
    truncated ? optionalAttribute("inline_char_limit", budget.sourceLimit) : "",
  ].join("");
  if (fileText == null) {
    return [
      `${indent}<target_file${attrs}>`,
      `${indent}    <content unavailable="true">${xmlText(primarySourceAbs ? `File not found: ${primarySourceAbs}` : "No target source path provided.")}</content>`,
      `${indent}</target_file>`,
    ].join("\n");
  }
  return [
    `${indent}<target_file${attrs}>`,
    ...(proposedView ? ["<proposed_name_view read_only=\"true\">", cdata(proposedView), "</proposed_name_view>"] : [cdata(inlineText ?? "")]),
    `${indent}</target_file>`,
  ].join("\n");
}

function truncateTargetSourceForPrompt(source: string, limit: number): string {
  if (source.length <= limit) return source;
  const markerBudget = 512;
  const sliceBudget = Math.max(1_000, limit - markerBudget);
  const headChars = Math.floor(sliceBudget * 0.55);
  const tailChars = sliceBudget - headChars;
  const omitted = source.length - headChars - tailChars;
  return [
    source.slice(0, headChars).trimEnd(),
    "",
    `[target source truncated after ${limit} characters; ${omitted} characters omitted. The full file is available at the target_file path in the worker checkout. Read the local file before editing code outside this excerpt.]`,
    "",
    source.slice(-tailChars).trimStart(),
  ].join("\n");
}

function targetXml(
  target: Record<string, unknown>,
  baseline: Record<string, unknown>,
  contextHints: TargetContextHints,
  primarySourcePath: string,
  primarySourceAbs: string,
  contextBudget: WorkerPromptContextBudget,
  targetSourceText?: string | null,
  proposedView?: string,
): string {
  const editabilityXml = contextHints.editability
    ? `        <editability${optionalAttribute("mode", contextHints.editability.mode)}${optionalAttribute("reason", contextHints.editability.reason)}/>`
    : "";
  const sameFileSymbolsXml = contextHints.sameFileSymbols.length
    ? [
        "        <same_file_symbols>",
        ...contextHints.sameFileSymbols.map(
          (symbol) => `            <symbol>${xmlText(symbol)}</symbol>`,
        ),
        "        </same_file_symbols>",
      ].join("\n")
    : "";
  const related = contextHints.relatedFunctions;
  const relatedFunctionsXml = related &&
      (related.callers.length || related.callees.length || related.analogs.length)
    ? [
        "        <related_functions>",
        ...related.callers.map(
          (item) => `            <caller${optionalAttribute("symbol", optionalString(item.symbol))}${optionalAttribute("unit", optionalString(item.unit))}${optionalAttribute("matched", typeof item.matched === "boolean" ? item.matched : null)}/>`,
        ),
        ...related.callees.map(
          (item) => `            <callee${optionalAttribute("symbol", optionalString(item.symbol))}${optionalAttribute("unit", optionalString(item.unit))}${optionalAttribute("matched", typeof item.matched === "boolean" ? item.matched : null)}/>`,
        ),
        ...related.analogs.map(
          (item) => `            <analog${optionalAttribute("symbol", optionalString(item.symbol))}${optionalAttribute("unit", optionalString(item.unit))}${optionalAttribute("fuzzy_match_percent", optionalNumber(item.fuzzy_match_percent))}${optionalAttribute("score", optionalNumber(item.score))}${optionalAttribute("exact_match", typeof item.exact_match === "boolean" ? item.exact_match : null)}/>`,
        ),
        "        </related_functions>",
      ].join("\n")
    : "";
  const targetAttrs = [
    optionalAttribute("context_budget", contextBudget),
    optionalAttribute("fuzzy_match_percent", optionalNumber(target.fuzzy_match_percent)),
    optionalAttribute("size", optionalNumber(target.size)),
    optionalAttribute("baseline_fuzzy_match_percent", optionalNumber(baseline.fuzzy_match_percent)),
    contextBudget === "full"
      ? ""
      : optionalAttribute("note", "compact retry budget: read local files for full source"),
  ].join("");
  return [
    `    <target${targetAttrs}>`,
    editabilityXml,
    sameFileSymbolsXml,
    relatedFunctionsXml,
    jsonBlockXml("details_json", target),
    targetFileXml(
      target,
      baseline,
      primarySourcePath,
      primarySourceAbs,
      contextBudget,
      targetSourceText,
      "        ",
      proposedView,
    ),
    "    </target>",
  ]
    .filter(Boolean)
    .join("\n");
}

// Repair attempts must see why the runner rejected the previous return; the
// packet carries repair_request but only rendered blocks reach the agent.
/**
 * The newest steering probe for this target (`packet.steering_probe`, set at
 * claim time from a previous attempt's gate result), or "" when absent or the
 * game's steering gate is off.
 */
export function steeringProbeXml(packet: Record<string, unknown>, steeringGate: SteeringGateMode | null | undefined): string {
  if (!steeringGateActive(steeringGate)) return "";
  const probe = asRecord(packet.steering_probe);
  if (Object.keys(probe).length === 0) return "";
  const fn = optionalString(probe.function);
  const unit = optionalString(probe.unit);
  return [
    `    <steering_probe${fn ? ` function="${xmlAttribute(fn)}"` : ""}${unit ? ` unit="${xmlAttribute(unit)}"` : ""}>`,
    `        <instruction>${xmlText("A previous attempt on this target matched through steering edits. The probe lists those edits, the match without them, hypotheses for the real cause, and evidence. Find the real construct; do not resubmit the steering edits.")}</instruction>`,
    jsonBlockXml("probe_json", probe),
    "    </steering_probe>",
  ].join("\n");
}

function percent(value: unknown): string | null {
  const n = optionalNumber(value);
  return n === null ? null : `${Number(n.toFixed(2))}%`;
}

/** The standing instruction, one clause per broken rule; steering's is the default. */
function previousAttemptInstruction(kinds: string[]): string {
  const parts = [
    "Do not repeat these edits or reintroduce the removed code.",
    ...(kinds.includes("dead_unused_body")
      ? ["Keep the upstream stub; give the body back only if `steering_check.py unused-test` shows a same-TU caller gets worse when it is emptied."]
      : []),
    ...(kinds.includes("out_of_order") ? ["Leave the code that needs undecompiled classes until their units are decompiled."] : []),
    ...(kinds.includes("steering") || kinds.every((kind) => kind !== "dead_unused_body" && kind !== "out_of_order")
      ? ["Search for what the original source really had (the real inline, type, call or construct), or leave the function nonmatching."]
      : []),
  ];
  return parts.join(" ");
}

/** One sentence: how the function got its earlier match and what the backfill did about it. */
function previousAttemptSummary(attempt: Record<string, unknown>, kinds: string[]): string {
  const match = asRecord(attempt.match);
  const withSteering = percent(match.with_steering);
  const realOnly = percent(match.real_only);
  const applied = attempt.applied === true;
  const tricks = [
    ...(kinds.includes("steering") ? ["behaviour-identical steering edits"] : []),
    ...(kinds.includes("dead_unused_body") ? ["a body for a map-UNUSED function the original never inlined (dead code)"] : []),
    ...(kinds.includes("out_of_order") ? ["code that needs classes whose units are not decompiled yet"] : []),
  ];
  const how = tricks.length > 0 ? tricks.join(" and ") : "edits the steering gate could not certify";
  const reached = withSteering ? `reached ${withSteering}` : "matched";
  const action = applied
    ? "The steering backfill rolled it back and removed that code"
    : "The steering backfill rejected it; that code is to be removed";
  const after = realOnly ? `; the real-only match left is ${realOnly}` : "";
  return `A previous attempt ${reached} only through ${how}. ${action}${after}.`;
}

// `UNVERIFIED_MATCH_STATE` / `UNVERIFIED_MATCH_LABEL` (run-state/unverified-matches.ts), kept
// literal so the prompt module does not load the state store.
const UNVERIFIED_MATCH_STATE = "unverified_match";
const UNVERIFIED_MATCH_LABEL = "100% unverified";

/** What happened: the code reaches 100% but the gate could not verify it is real. */
function unverifiedMatchSummary(attempt: Record<string, unknown>): string {
  const match = asRecord(attempt.match);
  const candidate = percent(match.candidate) ?? "100%";
  const realOnly = percent(match.real_only);
  const reduced = realOnly ? ` The reduced candidate reaches ${realOnly}.` : "";
  return `This function's code reaches ${candidate}, but the steering gate could not verify that it is real code: it could neither prove the match real nor attribute it to steering. It is marked "${UNVERIFIED_MATCH_LABEL}": not done and not counted as matched.${reduced}`;
}

const UNVERIFIED_MATCH_INSTRUCTION = [
  "Keep the parts that are real code.",
  "Find what each unexplained edit below stands for: the real inline, type, call or construct the original had, or evidence (`real_code_evidence`) that it is the original's code.",
  "Produce a version the steering gate certifies: separate real fixes from steering in their own statements and remove every steering edit. Resubmitting the same code leaves it unverified.",
].join(" ");

/**
 * The `unverified_match` variant ("100% unverified"): the function's active
 * `steering_unverified_matches` row, its match, the edits the gate could not
 * explain and the gate's reasons.
 */
function unverifiedMatchXml(attempt: Record<string, unknown>): string {
  const match = asRecord(attempt.match);
  const edits = asRecordArray(attempt.unexplained_edits).filter((edit) => optionalString(edit.file));
  const reasons = Array.isArray(attempt.reasons) ? attempt.reasons.filter((reason): reason is string => typeof reason === "string" && reason !== "") : [];
  const hints = asRecordArray(attempt.hints).filter((hint) => optionalString(hint.cause));
  const attrs = [
    optionalAttribute("variant", UNVERIFIED_MATCH_STATE),
    optionalAttribute("function", optionalString(attempt.symbol)),
    optionalAttribute("unit", optionalString(attempt.unit)),
    optionalAttribute("decision", optionalString(attempt.decision)),
    optionalAttribute("analyzed_rev", optionalString(attempt.analyzed_rev)?.slice(0, 12)),
  ].join("");
  const matchAttrs = [
    optionalAttribute("base", percent(match.base)),
    optionalAttribute("candidate", percent(match.candidate)),
    optionalAttribute("real_only", percent(match.real_only)),
  ].join("");
  return [
    `    <previous_attempt${attrs}>`,
    `        <what_happened>${xmlText(unverifiedMatchSummary(attempt))}</what_happened>`,
    `        <instruction>${xmlText(UNVERIFIED_MATCH_INSTRUCTION)}</instruction>`,
    ...(matchAttrs ? [`        <match${matchAttrs} />`] : []),
    ...(edits.length > 0
      ? [
          "        <unexplained_edits>",
          ...edits.map((edit) => {
            const shapes = Array.isArray(edit.shapes) ? edit.shapes.filter((shape) => typeof shape === "string").join(",") : "";
            const where = `${edit.file}${optionalNumber(edit.line) !== null ? `:${edit.line}` : ""}`;
            const body = [
              ...(optionalString(edit.before) ? [`                <base>${xmlText(edit.before)}</base>`] : []),
              ...(optionalString(edit.after) ? [`                <unexplained>${xmlText(edit.after)}</unexplained>`] : []),
            ];
            const open = `            <edit at="${xmlAttribute(where)}"${optionalAttribute("status", optionalString(edit.status))}${optionalAttribute("shapes", shapes)}`;
            return body.length > 0 ? [`${open}>`, ...body, "            </edit>"].join("\n") : `${open} />`;
          }),
          "        </unexplained_edits>",
        ]
      : []),
    ...reasons.map((reason) => `        <gate_reason>${xmlText(reason)}</gate_reason>`),
    ...hints.map((hint) => `        <hint cause="${xmlAttribute(hint.cause)}"${optionalAttribute("how_to_check", optionalString(hint.how_to_check))}>${xmlText(hint.why ?? "")}</hint>`),
    "    </previous_attempt>",
  ].join("\n");
}

/**
 * What the steering backfill found for this function in an earlier run
 * (`packet.previous_attempt`, attached at claim time from its
 * `steering_backfill` row, or its `unverified_match` row), or "" when absent
 * or the steering gate is off.
 */
export function previousAttemptXml(packet: Record<string, unknown>, steeringGate: SteeringGateMode | null | undefined): string {
  if (!steeringGateActive(steeringGate)) return "";
  const attempt = asRecord(packet.previous_attempt);
  if (Object.keys(attempt).length === 0) return "";
  if (attempt.variant === UNVERIFIED_MATCH_STATE) return unverifiedMatchXml(attempt);
  const rules = asRecordArray(attempt.rules);
  const kinds = rules.map((rule) => String(rule.kind ?? ""));
  const match = asRecord(attempt.match);
  const edits = asRecordArray(attempt.removed_edits).filter((edit) => optionalString(edit.file));
  const reasons = Array.isArray(attempt.reasons) ? attempt.reasons.filter((reason): reason is string => typeof reason === "string" && reason !== "") : [];
  const hints = asRecordArray(attempt.hints).filter((hint) => optionalString(hint.cause));
  const attrs = [
    optionalAttribute("function", optionalString(attempt.symbol)),
    optionalAttribute("unit", optionalString(attempt.unit)),
    optionalAttribute("decision", optionalString(attempt.decision)),
    optionalAttribute("analyzed_rev", optionalString(attempt.analyzed_rev)?.slice(0, 12)),
  ].join("");
  const matchAttrs = [
    optionalAttribute("base", percent(match.base)),
    optionalAttribute("with_steering", percent(match.with_steering)),
    optionalAttribute("real_only", percent(match.real_only)),
  ].join("");
  return [
    `    <previous_attempt${attrs}>`,
    `        <what_happened>${xmlText(previousAttemptSummary(attempt, kinds))}</what_happened>`,
    `        <instruction>${xmlText(previousAttemptInstruction(kinds))}</instruction>`,
    ...(matchAttrs ? [`        <match${matchAttrs} />`] : []),
    ...(edits.length > 0
      ? [
          "        <removed_edits>",
          ...edits.map((edit) => {
            const shapes = Array.isArray(edit.shapes) ? edit.shapes.filter((shape) => typeof shape === "string").join(",") : "";
            const where = `${edit.file}${optionalNumber(edit.line) !== null ? `:${edit.line}` : ""}`;
            const body = [
              ...(optionalString(edit.before) ? [`                <base>${xmlText(edit.before)}</base>`] : []),
              ...(optionalString(edit.after) ? [`                <removed>${xmlText(edit.after)}</removed>`] : []),
            ];
            const open = `            <edit at="${xmlAttribute(where)}"${optionalAttribute("shapes", shapes)}`;
            return body.length > 0 ? [`${open}>`, ...body, "            </edit>"].join("\n") : `${open} />`;
          }),
          "        </removed_edits>",
        ]
      : []),
    ...reasons.map((reason) => `        <gate_reason>${xmlText(reason)}</gate_reason>`),
    ...hints.map((hint) => `        <hint cause="${xmlAttribute(hint.cause)}"${optionalAttribute("how_to_check", optionalString(hint.how_to_check))}>${xmlText(hint.why ?? "")}</hint>`),
    ...rules.map((rule) => {
      const ruling = asRecord(rule.ruling);
      const quote = optionalString(ruling.quote);
      const lines = [
        `        <rule name="${xmlAttribute(rule.name ?? rule.kind)}">`,
        `            <summary>${xmlText(rule.summary ?? "")}</summary>`,
        ...(quote
          ? [`            <maintainer_quote${optionalAttribute("reviewer", optionalString(ruling.reviewer))}${optionalAttribute("pr", optionalString(ruling.pr))}${optionalAttribute("ruling", optionalString(ruling.id))}>${xmlText(quote)}</maintainer_quote>`]
          : []),
        ...(optionalString(ruling.rule) ? [`            <ruling_rule>${xmlText(ruling.rule)}</ruling_rule>`] : []),
        "        </rule>",
      ];
      return lines.join("\n");
    }),
    "    </previous_attempt>",
  ].join("\n");
}

/**
 * The classes the target needs whose units are not decompiled
 * (`packet.not_ready_classes`, else `packet.target.not_ready_classes`: the
 * readiness entry's `unmet`, attached by the scheduler), or "" when there are
 * none or ordering is off.
 */
export function notReadyClassesXml(packet: Record<string, unknown>, ordering: OrderingMode | null | undefined): string {
  if (!orderingActive(ordering)) return "";
  const raw = Array.isArray(packet.not_ready_classes) ? packet.not_ready_classes : asRecord(packet.target).not_ready_classes;
  const rows = asRecordArray(raw).filter((row) => optionalString(row.class));
  if (rows.length === 0) return "";
  return [
    "    <not_ready_classes>",
    `        <instruction>${xmlText("Do not construct or declare these; their units are not decompiled.")}</instruction>`,
    ...rows.map((row) => `        <class name="${xmlAttribute(row.class)}"${optionalAttribute("owner_unit", optionalString(row.owner_unit))}${optionalAttribute("kind", optionalString(row.kind))} />`),
    "    </not_ready_classes>",
  ].join("\n");
}

function repairRequestXml(packet: Record<string, unknown>): string {
  const repair = asRecord(packet.repair_request);
  if (Object.keys(repair).length === 0) return "";
  return [
    "    <repair_request>",
    jsonBlockXml("details_json", repair),
    "    </repair_request>",
  ].join("\n");
}

function functionName(fn: Record<string, unknown>): string {
  return (
    optionalString(fn.name) ??
    optionalString(fn.symbol) ??
    optionalString(fn.function_name) ??
    optionalString(fn.id) ??
    ""
  );
}

function fileCardFromPacket(packet: Record<string, unknown>): {
  present: boolean;
  card: Record<string, unknown>;
  graphDb: string | null;
} {
  const knowledgeContext = asRecord(packet.knowledge_context);
  const rawFileCard = asRecord(knowledgeContext.file_card);
  const nestedFileCard = asRecord(rawFileCard.file_card);
  const card = Object.keys(nestedFileCard).length ? nestedFileCard : rawFileCard;
  return {
    present: Object.keys(card).length > 0,
    card,
    graphDb: optionalString(knowledgeContext.graph_db),
  };
}

function fileCardFromGraph(
  sourcePath: string,
  game?: RunGameMetadata,
  graphDbOverride?: string | null,
): Record<string, unknown> {
  const graphDb =
    graphDbOverride || game?.graphDbPath || resourceGraphDbPath();
  if (!sourcePath || !graphDbExists(graphDb)) return {};

  const store = openKnowledgeGraph(graphDb);
  try {
    return fileGraphCard(store, sourcePath) as unknown as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  } finally {
    store.db.close();
  }
}

/**
 * The worker's own target when it is an active `unverified_match` (the board's
 * `target.verification`, or the claim's `previous_attempt` variant), else null.
 */
function unverifiedOwnTarget(packet: Record<string, unknown>): { unit: string; symbol: string } | null {
  const target = asRecord(packet.target);
  const unit = optionalString(target.unit);
  const symbol = optionalString(target.symbol);
  if (!unit || !symbol) return null;
  const attempt = asRecord(packet.previous_attempt);
  const marked = target.verification === UNVERIFIED_MATCH_STATE
    || (attempt.variant === UNVERIFIED_MATCH_STATE && (optionalString(attempt.symbol) ?? symbol) === symbol);
  return marked ? { unit, symbol } : null;
}

/**
 * Steering-gated games: the file card with the current verification state
 * overlaid. The packet's card, or one read from a graph built before the
 * backfill recorded the row, can call the target's file `read_only_complete`
 * ("reference evidence only") when every raw score is 100%; an unverified
 * target is not done, so its file is editable. Functions the graph already
 * labels unverified stay counted. Gate off (Melee): the card as stored.
 */
function verifiedFileCard(
  card: Record<string, unknown>,
  packet: Record<string, unknown>,
  steeringGate: SteeringGateMode,
): Record<string, unknown> {
  if (!steeringGateActive(steeringGate) || Object.keys(card).length === 0) return card;
  const own = unverifiedOwnTarget(packet);
  if (!own) return card;
  return withActiveVerification(card as unknown as FileGraphCard, [own], { sameFile: true }) as unknown as Record<string, unknown>;
}

function targetContextHints(
  packet: Record<string, unknown>,
  game?: RunGameMetadata,
  steeringGate: SteeringGateMode = gameSteeringGate(game),
): TargetContextHints {
  const target = asRecord(packet.target);
  const sourcePath = optionalString(target.source_path) ?? "";
  const targetSymbol = optionalString(target.symbol);
  const fromPacket = fileCardFromPacket(packet);
  const relatedFunctions = asRecord(asRecord(packet.knowledge_context).related_functions);
  const related = Object.keys(relatedFunctions).length
    ? {
        callers: asRecordArray(relatedFunctions.callers).slice(0, 8),
        callees: asRecordArray(relatedFunctions.callees).slice(0, 8),
        analogs: asRecordArray(relatedFunctions.analogs).slice(0, 4),
      }
    : null;
  const card = verifiedFileCard(
    fromPacket.present
      ? fromPacket.card
      : fileCardFromGraph(sourcePath, game, fromPacket.graphDb),
    packet,
    steeringGate,
  );
  if (Object.keys(card).length === 0) {
    return { editability: null, sameFileSymbols: [], relatedFunctions: related };
  }

  const editability = asRecord(card.editability);
  const editabilityMode = optionalString(editability.mode);
  const editabilityReason = optionalString(editability.reason);
  const sameFileSymbols = [
    ...new Set(
      asRecordArray(card.functions)
        .map(functionName)
        .filter((symbol) => symbol && symbol !== targetSymbol),
    ),
  ].slice(0, 12);

  return {
    editability:
      editabilityMode || editabilityReason
        ? { mode: editabilityMode, reason: editabilityReason }
        : null,
    sameFileSymbols,
    relatedFunctions: related,
  };
}

const FIRST_DIFF_CHAR_LIMITS = {
  full: 4_000,
  compact: 2_000,
  minimal: 800,
} as const satisfies Record<WorkerPromptContextBudget, number>;

function firstDiffXml(
  packet: Record<string, unknown>,
  contextBudget: WorkerPromptContextBudget,
): string {
  const firstDiff = asRecord(packet.first_diff);
  if (firstDiff.status !== "available") {
    const rawReason =
      optionalString(firstDiff.reason) ?? "First diff was not captured.";
    const reasonCharLimit = Math.floor(
      (FIRST_DIFF_CHAR_LIMITS[contextBudget] - 100) / 6,
    );
    const reason =
      rawReason.length > reasonCharLimit
        ? `${rawReason.slice(0, reasonCharLimit - 3)}...`
        : rawReason;
    return `    <first_diff status="unavailable" reason="${xmlAttribute(reason)}"/>`;
  }

  const sourceRows = asRecordArray(firstDiff.rows).slice(0, 40);
  const rowLimit = contextBudget === "minimal" ? 6 : 40;
  const rowTextLimit =
    contextBudget === "full" ? 240 : contextBudget === "compact" ? 120 : 48;
  let rowTextWasTruncated = false;
  let rows = sourceRows.slice(0, rowLimit).map((row) => {
    const text = optionalString(row.text) ?? "";
    if (text.length <= rowTextLimit) return row;
    rowTextWasTruncated = true;
    return { ...row, text: `${text.slice(0, rowTextLimit - 3)}...` };
  });
  let truncated =
    firstDiff.truncated === true ||
    asRecordArray(firstDiff.rows).length > sourceRows.length ||
    rows.length < sourceRows.length ||
    rowTextWasTruncated;

  const counts = Object.entries(asRecord(firstDiff.row_counts_by_kind))
    .filter(([, count]) => typeof count === "number" && Number.isFinite(count))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 20);
  const summary = counts.length
    ? `row_counts_by_kind: ${counts
        .map(([kind, count]) => `${kind}=${count}`)
        .join(", ")}`
    : "row_counts_by_kind: none";

  const render = (): string => {
    const attrs = [
      ' status="available"',
      optionalAttribute("score", optionalNumber(firstDiff.score)),
      optionalAttribute("rows", rows.length),
      optionalAttribute("truncated", truncated ? "true" : "false"),
    ].join("");
    const rowLines = rows.map((row) => {
      const side = row.side === "right" ? "right" : "left";
      const address =
        optionalString(row.address) ??
        (typeof row.address === "number" && Number.isFinite(row.address)
          ? String(row.address)
          : "?");
      const kind = optionalString(row.kind) ?? "UNKNOWN";
      const text = optionalString(row.text);
      return `        ${xmlText(
        `${side} ${address}: ${kind}${text ? ` ${text}` : ""}`,
      )}`;
    });
    return [
      `    <first_diff${attrs}>`,
      `        ${xmlText(summary)}`,
      ...rowLines,
      "    </first_diff>",
    ].join("\n");
  };

  let rendered = render();
  while (rendered.length > FIRST_DIFF_CHAR_LIMITS[contextBudget] && rows.length) {
    rows = rows.slice(0, -1);
    truncated = true;
    rendered = render();
  }
  return rendered;
}

const V2_CARD_BUDGET_CAPS = {
  full: { ledgerEntries: 20, links: 8, priorRuns: 3, acceptedPrs: 3 },
  compact: { ledgerEntries: 8, links: 4, priorRuns: 2, acceptedPrs: 2 },
  minimal: { ledgerEntries: 3, links: 2, priorRuns: 1, acceptedPrs: 1 },
} as const satisfies Record<
  WorkerPromptContextBudget,
  {
    ledgerEntries: number;
    links: number;
    priorRuns: number;
    acceptedPrs: number;
  }
>;

function projectV2TargetCard(
  card: Record<string, unknown>,
  contextBudget: WorkerPromptContextBudget,
): Record<string, unknown> {
  if (
    contextBudget === "full" ||
    optionalString(card.context_budget) === contextBudget
  ) {
    return card;
  }

  const caps = V2_CARD_BUDGET_CAPS[contextBudget];
  const ledger = asRecord(card.ledger);
  return {
    ...card,
    context_budget: contextBudget,
    ledger: {
      ...ledger,
      entries: Array.isArray(ledger.entries)
        ? ledger.entries.slice(0, caps.ledgerEntries)
        : [],
    },
    links: Array.isArray(card.links)
      ? card.links.slice(0, caps.links)
      : [],
    ...(Array.isArray(card.prior_runs)
      ? { prior_runs: card.prior_runs.slice(0, caps.priorRuns) }
      : {}),
    ...(Array.isArray(card.accepted_prs)
      ? { accepted_prs: card.accepted_prs.slice(0, caps.acceptedPrs) }
      : {}),
  };
}

function workerTargetKnowledgeXml(
  packet: Record<string, unknown>,
  game: RunGameMetadata | undefined,
  contextBudget: WorkerPromptContextBudget,
): string {
  const packetCard = asRecord(
    asRecord(packet.knowledge_context).knowledge_card_v2,
  );
  const target = asRecord(packet.target);
  const unit = optionalString(target.unit);
  const loadedCard =
    Object.keys(packetCard).length > 0
      ? packetCard
      : unit
        ? loadV2TargetCard({
            gameId: game?.gameId,
            unit,
            symbol: optionalString(target.symbol) ?? null,
            budget: contextBudget,
          })
        : null;
  if (!loadedCard) {
    const reason = unit
      ? "No target history was found."
      : "The target unit is unavailable, so history could not be loaded.";
    return `    <target_knowledge unavailable="true" reason="${xmlAttribute(reason)}"/>`;
  }

  const card = projectV2TargetCard(
    loadedCard as unknown as Record<string, unknown>,
    contextBudget,
  );
  return [
    `    <target_knowledge context_budget="${contextBudget}">`,
    jsonBlockXml("details_json", card),
    "    </target_knowledge>",
  ].join("\n");
}

function decompStandardsBudgetXml(
  contextBudget: WorkerPromptContextBudget,
  game: RunGameMetadata | undefined,
  advisoryAdjudication: AdvisoryAdjudicationMode,
): string {
  const mode = WORKER_CONTEXT_BUDGETS[contextBudget].standards;
  // Games with their own standards always get the full composed XML; a
  // global-only set can be summarized under tighter budgets.
  if (mode === "full" || (game?.gameId && hasGameScopedStandards({ gameId: game.gameId }))) {
    return globalStandardsPromptXml({ gameId: game?.gameId }, { advisoryAdjudication });
  }
  const rules =
    mode === "summary"
      ? [
          "Local style and original-author source shapes are required; deviating source is rejected.",
          "Nearby solved source evidence is required before any broad rewrite.",
          "Destructive resets are not allowed; pre-existing dirty work must be preserved.",
          "Retained edits must be validated with runner/checkdiff/build/review evidence.",
          "Hand-packing strings/data when normal source ownership is available is rejected.",
        ]
      : [
          "Local style, pre-existing dirty work, and runner evidence are required.",
          "Read local standards/source if a choice is ambiguous.",
        ];
  const keptAdvisoryRecord = advisoryAdjudication === "off" ? "the attempt summary" : "`kept_advisories`";
  return [
    `    <decomp_standards context_budget="${contextBudget}" compacted="true">`,
    `        <instruction>${xmlText(`These are mandatory requirements enforced by lint and review. Repair every finding before an attempt is accepted; if an llm_review advisory is kept, justify it in ${keptAdvisoryRecord}.`)}</instruction>`,
    ...rules.map((rule) => `        <rule>${xmlText(rule)}</rule>`),
    "    </decomp_standards>",
  ].join("\n");
}

export function workerPromptInputXml(
  options: WorkerPromptInputXmlOptions,
): WorkerPromptInputXml {
  const contextBudget = options.contextBudget ?? "full";
  const target = (options.packet.target ?? {}) as Record<string, unknown>;
  const baseline = asRecord(options.packet.baseline);
  const primarySourcePath = String(target.source_path ?? "");
  const primarySourceAbs = primarySourcePath
    ? resolve(options.repoRoot, primarySourcePath)
    : "";
  const contextHints = targetContextHints(options.packet, options.game, options.steeringGate ?? gameSteeringGate(options.game));
  const source = options.targetSourceText !== undefined ? options.targetSourceText
    : primarySourceAbs && existsSync(primarySourceAbs) ? readFileSync(primarySourceAbs, "utf8") : null;
  let proposedView: string | undefined;
  if (source !== null && Buffer.byteLength(source) <= SOURCE_VIEW_MAX_BYTES) {
    const viewOptions = {
      maxChars: WORKER_CONTEXT_BUDGETS[contextBudget].sourceLimit,
      maxLines: 2000,
      startLine: sourceViewStartLine(source, String(target.symbol ?? ""), WORKER_CONTEXT_BUDGETS[contextBudget].sourceLimit),
    };
    const view = options.sourceNames
      ? renderSourceView({ ...viewOptions, path: primarySourcePath, source, names: options.sourceNames })
      : sourceViewForText(primarySourcePath, source, { ...viewOptions, gameId: options.game?.gameId });
    if (view.substitutions > 0) proposedView = formatSourceView(view);
  }
  return {
    targetXml: targetXml(
      target,
      baseline,
      contextHints,
      primarySourcePath,
      primarySourceAbs,
      contextBudget,
      source,
      proposedView,
    ),
    firstDiffXml: firstDiffXml(options.packet, contextBudget),
  };
}

export function buildWorkerKernelContext(
  options: WorkerPromptOptions,
): NonNullable<PiPromptBundle["kernelContext"]> {
  const contextBudget = options.contextBudget ?? "full";
  const inputXml = workerPromptInputXml({
    packet: options.packet,
    repoRoot: options.repoRoot,
    game: options.game,
    contextBudget,
    targetSourceText: options.targetSourceText,
    sourceNames: options.sourceNames,
    steeringGate: workerSteeringGate(options),
  });
  const targetKnowledgeXml = workerTargetKnowledgeXml(
    options.packet,
    options.game,
    contextBudget,
  );
  const steeringGate = workerSteeringGate(options);
  const steeringBlocks = [previousAttemptXml(options.packet, steeringGate), steeringProbeXml(options.packet, steeringGate)].filter(Boolean);
  const notReadyClasses = notReadyClassesXml(options.packet, workerOrdering(options));
  const values = {
    DECOMP_STANDARDS_XML: decompStandardsBudgetXml(contextBudget, options.game, options.advisoryAdjudication ?? "off"),
    FIRST_DIFF_XML: inputXml.firstDiffXml,
    REPAIR_REQUEST_XML: repairRequestXml(options.packet),
    // Joined to the first diff so absent steering blocks leave the context byte-identical.
    STEERING_PROBE_XML: steeringBlocks.map((block) => `\n\n${block}`).join(""),
    NOT_READY_CLASSES_XML: notReadyClasses ? `\n\n${notReadyClasses}` : "",
    TARGET_XML: inputXml.targetXml,
    TARGET_KNOWLEDGE_XML: targetKnowledgeXml,
  };
  const workerPacketContext = renderTemplate(
    WORKER_PACKET_CONTEXT_TEMPLATE,
    values,
  ).trim();
  return promptKernelContext(
    workerPacketContext,
    [
      {
        loaderKind: "worker-packet",
        inputRef: "worker-packet",
        content: workerPacketContext,
      },
    ],
    defaultKernelTurnPrompt("worker"),
  );
}

export default context;
