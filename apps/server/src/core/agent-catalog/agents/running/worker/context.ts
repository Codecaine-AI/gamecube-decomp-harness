import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineContext } from "@agent-kernel/kernel/agent-definition";
import type { LoaderDeclaration } from "@agent-kernel/kernel/context";
import type {
  PiPromptBundle,
  RunGameMetadata,
} from "@server/core/shared/types";
import {
  fileGraphCard,
  globalStandardsPromptXml,
  graphDbExists,
  openKnowledgeGraph,
  resourceGraphDbPath,
} from "@server/core/knowledge";
import { loadV2TargetCard } from "@server/core/knowledge-v2/card.js";
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
}

export interface WorkerPromptInputXmlOptions {
  packet: Record<string, unknown>;
  repoRoot: string;
  game?: RunGameMetadata;
  contextBudget?: WorkerPromptContextBudget;
  targetSourceText?: string | null;
}

export interface WorkerPromptInputXml {
  targetXml: string;
  firstDiffXml: string;
}

const WORKER_PACKET_CONTEXT_TEMPLATE = `
{{REPAIR_REQUEST_XML}}

{{TARGET_XML}}

{{FIRST_DIFF_XML}}

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
    cdata(inlineText ?? ""),
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
    ),
    "    </target>",
  ]
    .filter(Boolean)
    .join("\n");
}

// Repair attempts must see why the runner rejected the previous return; the
// packet carries repair_request but only rendered blocks reach the agent.
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

function targetContextHints(
  packet: Record<string, unknown>,
  game?: RunGameMetadata,
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
  const card = fromPacket.present
    ? fromPacket.card
    : fileCardFromGraph(sourcePath, game, fromPacket.graphDb);
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

function decompStandardsBudgetXml(contextBudget: WorkerPromptContextBudget): string {
  const mode = WORKER_CONTEXT_BUDGETS[contextBudget].standards;
  if (mode === "full") return globalStandardsPromptXml();
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
  return [
    `    <decomp_standards context_budget="${contextBudget}" compacted="true">`,
    `        <instruction>${xmlText("These are mandatory requirements enforced by lint and review. Repair every finding before an attempt is accepted; if an llm_review advisory is kept, justify it in the attempt summary.")}</instruction>`,
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
  const contextHints = targetContextHints(options.packet, options.game);
  return {
    targetXml: targetXml(
      target,
      baseline,
      contextHints,
      primarySourcePath,
      primarySourceAbs,
      contextBudget,
      options.targetSourceText,
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
  });
  const targetKnowledgeXml = workerTargetKnowledgeXml(
    options.packet,
    options.game,
    contextBudget,
  );
  const values = {
    DECOMP_STANDARDS_XML: decompStandardsBudgetXml(contextBudget),
    FIRST_DIFF_XML: inputXml.firstDiffXml,
    REPAIR_REQUEST_XML: repairRequestXml(options.packet),
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
