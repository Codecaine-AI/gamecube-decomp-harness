import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineContext } from "@agent-kernel/kernel/agent-definition";
import type { LoaderDeclaration } from "@agent-kernel/kernel/context";
import type { PiPromptBundle, RunGameMetadata } from "@server/core/shared/types";
import { globalStandardsPromptXml } from "@server/core/knowledge";
import { availableToolsPromptXml, type AgentToolRuntimeContext } from "@server/core/tools/index.js";
import {
  renderTemplate,
  stableJson,
  type PromptTemplateValues,
} from "@server/infrastructure/agent-runtime/runtime";
import {
  createInlineAgentContextResolver,
  rootContextLoaderDeclaration,
} from "@server/core/agent-catalog/kernel-context.js";

const loaders = [
  rootContextLoaderDeclaration,
  { kind: "librarian-context", ref: "librarian-context", label: "librarian-context" },
  { kind: "librarian-curation-context", ref: "librarian-curation-context", label: "librarian-curation-context" },
  { kind: "librarian-pr-index-context", ref: "librarian-pr-index-context", label: "librarian-pr-index-context" },
] as const satisfies readonly LoaderDeclaration[];

interface LibrarianPromptBaseOptions {
  game?: RunGameMetadata;
  repoRoot?: string;
  stateDir?: string;
}

export interface LibrarianCondensePromptOptions extends LibrarianPromptBaseOptions {
  door?: "condense";
  librarianBatch: unknown;
}

export interface LibrarianCurationPromptOptions extends LibrarianPromptBaseOptions {
  door: "curation";
  curatorContext: unknown;
}

export interface LibrarianPrIndexingPromptOptions extends LibrarianPromptBaseOptions {
  door: "pr_indexing";
  prContext: unknown;
}

export type LibrarianDoor = "condense" | "curation" | "pr_indexing";
export type LibrarianPromptOptions =
  | LibrarianCondensePromptOptions
  | LibrarianCurationPromptOptions
  | LibrarianPrIndexingPromptOptions;

export const LIBRARIAN_TURN_PROMPT = "Use the injected librarian batch packet. Condense the batch into learnings and attempt overlays and return exactly one JSON object.";

export const LIBRARIAN_CURATION_TURN_PROMPT = [
  "Use the injected librarian curation context packet.",
  "Review the batch and return graph-safe curation decisions as exactly one librarian_v1 JSON object.",
].join(" ");

export const LIBRARIAN_PR_INDEXING_TURN_PROMPT = [
  "Use the injected librarian PR indexing context packet.",
  "Normalize the PR slice into pr_index and return exactly one librarian_v1 JSON object.",
].join(" ");

export const context = defineContext(
  createInlineAgentContextResolver(loaders, LIBRARIAN_TURN_PROMPT),
);

const LIBRARIAN_CONTEXT_TEMPLATE = `<task>
    Condense this librarian batch into evidence-backed learnings and attempt overlays.
    Anchor statements to current symbols and files, and reject unsupported material.
</task>

{{AVAILABLE_TOOLS_XML}}

<librarian_batch>
{{LIBRARIAN_BATCH_JSON}}
</librarian_batch>

<output_contract>
Use this top-level shape:

{{LIBRARIAN_OUTPUT_SCHEMA_JSON}}
</output_contract>

Return exactly one JSON object.`;

const LIBRARIAN_CURATION_CONTEXT_TEMPLATE = `<task>
    Use the librarian curation door to review this batch and return graph-safe curation decisions.
    Promote only evidence-backed reusable records; leave source-owned changes as proposals.
</task>

{{AVAILABLE_TOOLS_XML}}

<curator_context>
{{CURATOR_CONTEXT_JSON}}
</curator_context>

<output_contract>
Return a librarian_v1 object. Populate the top-level accepted_records,
source_update_proposals, and rejected_records fields for this door:

{{LIBRARIAN_OUTPUT_SCHEMA_JSON}}
</output_contract>

Return exactly one JSON object.`;

const LIBRARIAN_PR_INDEX_CONTEXT_TEMPLATE = `<task>
    Use the librarian pr_indexing door to normalize this PR slice into a compact, searchable postmortem and index row.
    Use the loaded PR evidence and standards below. Use listed tools only for targeted questions not answered by the loaded context.
</task>

{{DECOMP_STANDARDS_XML}}

{{AVAILABLE_TOOLS_XML}}

{{PR_CONTEXT_XML}}

<output_contract>
Return a librarian_v1 object. Put the full melee_pr_postmortem_v1 record under the top-level pr_index field:

{{LIBRARIAN_OUTPUT_SCHEMA_JSON}}
</output_contract>

Return exactly one JSON object.`;

// Keep the condense door's compact output contract focused on condensation;
// schema.json also describes the optional curation and PR-indexing door fields.
const CONDENSE_OUTPUT_SCHEMA = {
  schema_version: "librarian_v1",
  agent_status: "agent_completed",
  summary: "",
  learnings: [
    {
      statement: "",
      subject: { symbol: null, file: null, area: null },
      scope: "symbol | file | area | general",
      origin: "human_extracted | ai_inferred",
      evidence: [{ type: "wiki_section | call_edge | pr_comment | attempt", ref: "" }],
      confidence: 0.0,
    },
  ],
  attempt_overlays: [
    {
      checkpoint_id: "",
      tactics: [{ tactic: "", outcome: "failed | partial | success", at: "" }],
    },
  ],
  verdicts: [{ learning_id: "", verdict: "confirm | refute", reason: "" }],
  rejected: [{ statement: "", reason: "" }],
  confidence: 0.0,
};

function schemaPath(): string {
  return fileURLToPath(new URL("./schema.json", import.meta.url));
}

function sharedOutputSchema(): unknown {
  return JSON.parse(readFileSync(schemaPath(), "utf8"));
}

function toolContext(options: LibrarianPromptOptions): AgentToolRuntimeContext {
  const repoRoot = options.repoRoot ?? ".";
  return {
    role: "librarian",
    cwd: repoRoot,
    repoRoot,
    stateDir: options.stateDir,
    game: options.game,
  };
}

const PR_CONTEXT_FILE_CHAR_LIMIT = 24_000;
const PR_CONTEXT_MAX_LOADED_FILES = 10;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item) => Object.keys(item).length > 0) : [];
}

function typedRecord(value: unknown, kind: string): unknown {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { kind, ...(value as JsonRecord) }
    : value;
}

function typedRecordArray(value: unknown, kind: string): unknown {
  return Array.isArray(value) ? value.map((item) => typedRecord(item, kind)) : value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
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

function jsonBlockXml(tag: string, value: unknown, indent = "    "): string {
  return [`${indent}<${tag}>`, "```json", stableJson(value), "```", `${indent}</${tag}>`].join("\n");
}

function compactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(compactValue)
      .filter((item) => {
        if (item === null || item === undefined || item === "") return false;
        if (Array.isArray(item)) return item.length > 0;
        if (typeof item === "object") return Object.keys(item as JsonRecord).length > 0;
        return true;
      });
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .map(([key, entry]) => [key, compactValue(entry)] as const)
        .filter(([, entry]) => {
          if (entry === null || entry === undefined || entry === "") return false;
          if (Array.isArray(entry)) return entry.length > 0;
          if (typeof entry === "object") return Object.keys(entry as JsonRecord).length > 0;
          return true;
        }),
    );
  }
  return value;
}

function compactObject(value: JsonRecord): JsonRecord {
  return compactValue(value) as JsonRecord;
}

function clippedContent(content: string, limit = PR_CONTEXT_FILE_CHAR_LIMIT): { content: string; truncated: boolean; originalChars: number } {
  if (content.length <= limit) return { content, truncated: false, originalChars: content.length };
  return { content: `${content.slice(0, limit)}\n\n[truncated after ${limit} characters]`, truncated: true, originalChars: content.length };
}

function resolveContextPath(pathValue: string, repoRoot: string): string {
  return isAbsolute(pathValue) ? pathValue : resolve(repoRoot, pathValue);
}

function readLoadedFile(label: string, pathValue: string, repoRoot: string, limit = PR_CONTEXT_FILE_CHAR_LIMIT): JsonRecord {
  const absolutePath = resolveContextPath(pathValue, repoRoot);
  const attrs = compactObject({
    label,
    path: pathValue,
    absolute_path: absolutePath,
  });
  if (!existsSync(absolutePath)) {
    return { ...attrs, unavailable: true, reason: "File not found." };
  }
  const stats = statSync(absolutePath);
  if (!stats.isFile()) {
    return { ...attrs, unavailable: true, reason: "Path is not a file." };
  }
  const loaded = clippedContent(readFileSync(absolutePath, "utf8"), limit);
  return {
    ...attrs,
    original_chars: loaded.originalChars,
    truncated: loaded.truncated,
    content: loaded.content,
  };
}

function loadedFilesFromInline(contextValue: JsonRecord): JsonRecord[] {
  return asRecordArray(contextValue.loaded_files).map((file, index) => {
    const label = optionalString(file.label) ?? optionalString(file.name) ?? `loaded_file_${index + 1}`;
    const contentValue = optionalString(file.content) ?? optionalString(file.text) ?? "";
    const loaded = clippedContent(contentValue);
    return compactObject({
      label,
      path: optionalString(file.path),
      media_type: optionalString(file.media_type),
      source: optionalString(file.source),
      original_chars: file.original_chars ?? loaded.originalChars,
      truncated: Boolean(file.truncated) || loaded.truncated,
      content: loaded.content,
    });
  });
}

function loadedFilesFromLocalSlicePaths(contextValue: JsonRecord, repoRoot: string): JsonRecord[] {
  const localSlicePaths = asRecord(contextValue.local_slice_paths);
  return Object.entries(localSlicePaths)
    .slice(0, PR_CONTEXT_MAX_LOADED_FILES)
    .map(([label, pathValue]) => optionalString(pathValue) && readLoadedFile(label, optionalString(pathValue) ?? "", repoRoot))
    .filter((file): file is JsonRecord => Boolean(file));
}

function knownSliceFileCandidates(contextValue: JsonRecord): Array<{ label: string; path: string }> {
  const source = asRecord(contextValue.source);
  const sliceDir = optionalString(source.slice_dir);
  if (!sliceDir) return [];
  return [
    { label: "raw_pr_json", path: `${sliceDir}/raw/pr.json` },
    { label: "raw_diff", path: `${sliceDir}/raw/diff.diff` },
    { label: "human_pr_text", path: `${sliceDir}/extracted/human_pr_text.md` },
    { label: "review_comments", path: `${sliceDir}/extracted/review_comments.md` },
    { label: "changed_files", path: `${sliceDir}/extracted/changed_files.jsonl` },
    { label: "text_corpus", path: `${sliceDir}/extracted/text_corpus.jsonl` },
    { label: "counts", path: `${sliceDir}/counts.json` },
    { label: "activity", path: `${sliceDir}/activity.json` },
  ];
}

function dedupeLoadedFiles(files: JsonRecord[]): JsonRecord[] {
  const seen = new Set<string>();
  const deduped: JsonRecord[] = [];
  for (const file of files) {
    const key = optionalString(file.path) ?? optionalString(file.label) ?? String(deduped.length);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(file);
    if (deduped.length >= PR_CONTEXT_MAX_LOADED_FILES) break;
  }
  return deduped;
}

function loadedFilesFromContext(contextValue: JsonRecord, repoRoot: string): JsonRecord[] {
  const inlineFiles = loadedFilesFromInline(contextValue);
  const pathFiles = inlineFiles.length ? [] : loadedFilesFromLocalSlicePaths(contextValue, repoRoot);
  const knownFiles =
    inlineFiles.length || pathFiles.length
      ? []
      : knownSliceFileCandidates(contextValue)
          .filter((candidate) => existsSync(resolveContextPath(candidate.path, repoRoot)))
          .map((candidate) => readLoadedFile(candidate.label, candidate.path, repoRoot));
  return dedupeLoadedFiles([...inlineFiles, ...pathFiles, ...knownFiles]);
}

function loadedFilesXml(contextValue: JsonRecord, repoRoot: string): string {
  const files = loadedFilesFromContext(contextValue, repoRoot);
  if (!files.length) return '    <loaded_files count="0" />';
  const lines = [`    <loaded_files count="${files.length}">`];
  for (const file of files) {
    const contentValue = optionalString(file.content) ?? "";
    const attrs = [
      optionalAttribute("label", optionalString(file.label)),
      optionalAttribute("path", optionalString(file.path)),
      optionalAttribute("media_type", optionalString(file.media_type)),
      optionalAttribute("truncated", file.truncated === undefined ? null : String(Boolean(file.truncated))),
      optionalAttribute("original_chars", file.original_chars),
      optionalAttribute("unavailable", file.unavailable === undefined ? null : String(Boolean(file.unavailable))),
    ].join("");
    lines.push(`        <file${attrs}>`);
    if (file.unavailable) {
      lines.push(`            <reason>${xmlText(file.reason)}</reason>`);
    } else {
      lines.push(cdata(contentValue));
    }
    lines.push("        </file>");
  }
  lines.push("    </loaded_files>");
  return lines.join("\n");
}

function prMetadata(contextValue: JsonRecord): JsonRecord {
  return compactObject({
    schema_version: contextValue.schema_version,
    object_id: contextValue.object_id,
    generated_at: contextValue.generated_at,
    context_source: contextValue.context_source,
    game: contextValue.game,
    source: contextValue.source,
    pr: typedRecord(contextValue.pr, "pr"),
    counts: contextValue.counts,
    activity: typedRecord(contextValue.activity, "activity_event"),
    initial_classification: contextValue.initial_classification,
    changed_files: contextValue.changed_files,
    review_feedback_examples: typedRecordArray(contextValue.review_feedback_examples, "pr_comment"),
    intake_focus: contextValue.intake_focus,
  });
}

function evidenceExcerptsXml(contextValue: JsonRecord): string {
  const excerptFields = [
    ["human_pr_text_excerpt", contextValue.human_text_excerpt],
    ["review_comments_excerpt", contextValue.review_comments_excerpt],
    ["diff_excerpt", contextValue.diff_excerpt],
  ] as const;
  const lines = ["    <evidence_excerpts>"];
  for (const [tag, value] of excerptFields) {
    const excerpt = optionalString(value);
    if (!excerpt) continue;
    lines.push(`        <${tag}>`);
    lines.push(cdata(excerpt));
    lines.push(`        </${tag}>`);
  }
  lines.push("    </evidence_excerpts>");
  return lines.join("\n");
}

export function prContextPromptXml(options: { prContext: unknown; repoRoot?: string }): string {
  const contextValue = asRecord(options.prContext);
  const repoRoot = options.repoRoot ?? ".";
  const attrs = [optionalAttribute("schema_version", contextValue.schema_version), optionalAttribute("object_id", contextValue.object_id)].join("");
  return [`<pr_context${attrs}>`, jsonBlockXml("metadata_json", prMetadata(contextValue)), evidenceExcerptsXml(contextValue), loadedFilesXml(contextValue, repoRoot), "</pr_context>"].join("\n");
}

function buildCondenseKernelContext(options: LibrarianCondensePromptOptions): NonNullable<PiPromptBundle["kernelContext"]> {
  const renderedContext = renderTemplate(LIBRARIAN_CONTEXT_TEMPLATE, {
    AVAILABLE_TOOLS_XML: availableToolsPromptXml(toolContext(options)),
    LIBRARIAN_BATCH_JSON: stableJson(options.librarianBatch),
    LIBRARIAN_OUTPUT_SCHEMA_JSON: stableJson(CONDENSE_OUTPUT_SCHEMA),
  } as unknown as PromptTemplateValues);
  return {
    turnPrompt: LIBRARIAN_TURN_PROMPT,
    renderedContext,
    inputs: [
      {
        loaderKind: "librarian-context",
        inputRef: "librarian-context",
        content: renderedContext,
      },
    ],
  };
}

function buildCurationKernelContext(options: LibrarianCurationPromptOptions): NonNullable<PiPromptBundle["kernelContext"]> {
  const renderedContext = renderTemplate(LIBRARIAN_CURATION_CONTEXT_TEMPLATE, {
    AVAILABLE_TOOLS_XML: availableToolsPromptXml(toolContext(options)),
    CURATOR_CONTEXT_JSON: stableJson(options.curatorContext),
    LIBRARIAN_OUTPUT_SCHEMA_JSON: stableJson(sharedOutputSchema()),
  } as unknown as PromptTemplateValues);
  return {
    turnPrompt: LIBRARIAN_CURATION_TURN_PROMPT,
    renderedContext,
    inputs: [
      {
        loaderKind: "librarian-curation-context",
        inputRef: "librarian-curation-context",
        content: renderedContext,
      },
    ],
  };
}

function buildPrIndexingKernelContext(options: LibrarianPrIndexingPromptOptions): NonNullable<PiPromptBundle["kernelContext"]> {
  const renderedContext = renderTemplate(LIBRARIAN_PR_INDEX_CONTEXT_TEMPLATE, {
    AVAILABLE_TOOLS_XML: availableToolsPromptXml(toolContext(options)),
    DECOMP_STANDARDS_XML: globalStandardsPromptXml(),
    PR_CONTEXT_XML: prContextPromptXml({ prContext: options.prContext, repoRoot: options.repoRoot }),
    LIBRARIAN_OUTPUT_SCHEMA_JSON: stableJson(sharedOutputSchema()),
  } as unknown as PromptTemplateValues);
  return {
    turnPrompt: LIBRARIAN_PR_INDEXING_TURN_PROMPT,
    renderedContext,
    inputs: [
      {
        loaderKind: "librarian-pr-index-context",
        inputRef: "librarian-pr-index-context",
        content: renderedContext,
      },
    ],
  };
}

export function buildLibrarianKernelContext(options: LibrarianPromptOptions): NonNullable<PiPromptBundle["kernelContext"]> {
  if (options.door === "curation") return buildCurationKernelContext(options);
  if (options.door === "pr_indexing") return buildPrIndexingKernelContext(options);
  return buildCondenseKernelContext(options);
}

export default context;
