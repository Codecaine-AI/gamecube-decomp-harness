import { fileURLToPath } from "node:url";
import {
  bulletList,
  definePrompt,
  item,
  orderedList,
  renderXmlMarkdown,
  section,
  usesContext,
} from "@server/core/agent-catalog/prompt-kit-compat";
import type { PiPromptBundle } from "@server/core/shared/types";
import {
  buildPrSplitterKernelContext,
  PR_SPLITTER_TURN_PROMPT,
  type PrSplitterPromptOptions,
} from "./context.js";
export { type PrSplitterPromptOptions } from "./context.js";

export const PR_SPLITTER_SCHEMA_VERSION = "melee_pr_splitter_plan_v1";

export type PrSplitterLane = "match" | "local" | null;
export type PrSplitterIndependenceKind = "independent" | "shared-prep" | "stacked" | "needs-merge";

export interface PrSplitterSlice {
  id: string;
  display_name: string;
  title: string;
  lane: PrSplitterLane;
  scope: string;
  files: string[];
  depends_on: string[];
  independence_kind: PrSplitterIndependenceKind;
  review_focus: string;
  pr_body_summary: string;
  risks: string[];
  validation_notes: string[];
}

export interface PrSplitterPlan {
  schema_version: typeof PR_SPLITTER_SCHEMA_VERSION;
  slices: PrSplitterSlice[];
  warnings: string[];
  rationale: string;
  confidence: number;
}

function agentFilePath(): string {
  return fileURLToPath(new URL("./agent.ts", import.meta.url));
}

export const prompt = definePrompt({
  id: "melee.pr-splitter.system",
  title: "Melee PR Splitter System Prompt",
  archetype: "workflow",
  nodes: [
    section("goal", [
      "You are the PR splitter agent for the Melee decomp orchestrator.",
      "Turn deterministic handoff evidence into a reviewer-friendly PR series. Decide slice grouping, order, titles, descriptions, dependencies, and review focus.",
    ]),
    section("context_contract", [
      usesContext("pr-split-context", {
        instructions: [
          "Use the injected deterministic handoff evidence, available tools, decomp standards, and output schema as the authoritative planning packet.",
          "Preserve runner-owned lane and ship-filter facts exactly.",
        ],
      }),
    ]),
    section("authority_boundary", [
      bulletList([
        "You are a planner only. Do not edit source code.",
        "Do not decide whether a file ships. Lanes and ship-filter facts are runner evidence.",
        "Do not invent files. Every changed file in the input must appear exactly once in your output.",
        "Keep match-lane files in match-lane slices and local-only files in local-only slices. Do not mix lanes in one slice.",
        "Respect max-files-per-PR as a hard review ceiling. If a slice must exceed it, mark `independence_kind` as `needs-merge`, explain why, and add a warning.",
        "Prefer the fewest comfortable PRs, not the fullest PRs. Split by semantic review scope, dependency order, and maintainer risk.",
        "Shared prep, declarations, generated/config/support surfaces, and files that affect several subsystems should land before dependent subsystem slices or be called out as stacked.",
        "A slice is only truly independent after the runner applies it to a fresh worktree and runs the configured isolation checks. Your independence field is a planning hypothesis, not proof.",
        "If evidence is insufficient, keep the deterministic grouping and add warnings.",
      ]),
    ]),
    section("planning_heuristics", [
      bulletList([
        "Group files that a reviewer must understand together.",
        "Split large directories into subdirectories or topics when review size or risk demands it.",
        "Order shared prep first, then independent match PRs, then stacked follow-ups, then local-only carry-forward slices.",
        "Write PR-body summaries that explain what changed, why the slice is shaped this way, and which validations the operator must run.",
      ]),
    ]),
    section("output", [
      orderedList([
        "Return exactly one JSON object matching the injected output schema.",
        "Do not wrap the JSON object in Markdown.",
        item("The plan must include:", [
          bulletList(["slices", "warnings", "rationale", "confidence"]),
        ]),
      ]),
    ]),
  ],
});

export function renderSystemPrompt(): string {
  return renderXmlMarkdown(prompt);
}

function promptFilePath(): string {
  return fileURLToPath(new URL("./prompt.ts", import.meta.url));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function laneValue(value: unknown): PrSplitterLane | undefined {
  if (value === null) return null;
  if (value === "match" || value === "local") return value;
  return undefined;
}

function independenceValue(value: unknown): PrSplitterIndependenceKind | null {
  if (value === "independent" || value === "shared-prep" || value === "stacked" || value === "needs-merge") return value;
  return null;
}

function validateSlice(value: unknown, index: number, errors: string[]): PrSplitterSlice | null {
  const label = `slices[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return null;
  }
  const id = stringValue(value.id);
  const displayName = stringValue(value.display_name);
  const title = stringValue(value.title);
  const lane = laneValue(value.lane);
  const scope = stringValue(value.scope);
  const files = stringArray(value.files);
  const dependsOn = stringArray(value.depends_on);
  const independenceKind = independenceValue(value.independence_kind);
  const reviewFocus = stringValue(value.review_focus);
  const prBodySummary = stringValue(value.pr_body_summary);
  const risks = stringArray(value.risks);
  const validationNotes = stringArray(value.validation_notes);

  if (!id) errors.push(`${label}.id must be a non-empty string`);
  if (!displayName) errors.push(`${label}.display_name must be a non-empty string`);
  if (!title) errors.push(`${label}.title must be a non-empty string`);
  if (lane === undefined) errors.push(`${label}.lane must be "match", "local", or null`);
  if (!scope) errors.push(`${label}.scope must be a non-empty string`);
  if (!files || files.length === 0) errors.push(`${label}.files must be a non-empty string array`);
  if (!dependsOn) errors.push(`${label}.depends_on must be a string array`);
  if (!independenceKind) errors.push(`${label}.independence_kind is invalid`);
  if (typeof value.review_focus !== "string") errors.push(`${label}.review_focus must be a string`);
  if (typeof value.pr_body_summary !== "string") errors.push(`${label}.pr_body_summary must be a string`);
  if (!risks) errors.push(`${label}.risks must be a string array`);
  if (!validationNotes) errors.push(`${label}.validation_notes must be a string array`);
  if (errors.length > 0 || lane === undefined || !files || !dependsOn || !independenceKind || !risks || !validationNotes) return null;

  return {
    id,
    display_name: displayName,
    title,
    lane,
    scope,
    files,
    depends_on: dependsOn,
    independence_kind: independenceKind,
    review_focus: reviewFocus,
    pr_body_summary: prBodySummary,
    risks,
    validation_notes: validationNotes,
  };
}

export function validatePrSplitterPlan(value: unknown): { plan: PrSplitterPlan | null; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) return { plan: null, errors: ["plan must be a JSON object"] };
  if (value.schema_version !== PR_SPLITTER_SCHEMA_VERSION) errors.push(`schema_version must be "${PR_SPLITTER_SCHEMA_VERSION}"`);
  if (!Array.isArray(value.slices) || value.slices.length === 0) errors.push("slices must be a non-empty array");
  const warnings = stringArray(value.warnings);
  if (!warnings) errors.push("warnings must be a string array");
  const rationale = stringValue(value.rationale);
  if (typeof value.rationale !== "string") errors.push("rationale must be a string");
  const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence) ? value.confidence : NaN;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) errors.push("confidence must be a number from 0 to 1");
  const slices = Array.isArray(value.slices) ? value.slices.map((slice, index) => validateSlice(slice, index, errors)) : [];
  if (errors.length > 0 || !warnings) return { plan: null, errors };
  return {
    plan: {
      schema_version: PR_SPLITTER_SCHEMA_VERSION,
      slices: slices as PrSplitterSlice[],
      warnings,
      rationale,
      confidence,
    },
    errors: [],
  };
}

export function prSplitterPrompt(options: PrSplitterPromptOptions): PiPromptBundle {
  const systemTemplatePath = agentFilePath();
  const userTemplatePath = promptFilePath();
  return {
    systemPrompt: renderSystemPrompt(),
    userPrompt: PR_SPLITTER_TURN_PROMPT,
    systemTemplatePath,
    userTemplatePath,
    kernelContext: buildPrSplitterKernelContext(options),
  };
}
