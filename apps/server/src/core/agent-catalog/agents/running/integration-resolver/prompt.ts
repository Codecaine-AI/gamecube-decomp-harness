import { fileURLToPath } from "node:url";
import {
  bulletList,
  definePrompt,
  orderedList,
  renderXmlMarkdown,
  section,
  usesContext,
} from "@server/core/agent-catalog/prompt-kit-compat";
import type { PiPromptBundle } from "@server/core/shared/types";
import {
  buildIntegrationResolverKernelContext,
  INTEGRATION_RESOLVER_TURN_PROMPT,
  type IntegrationResolverPromptOptions,
} from "./context.js";
export { type IntegrationResolverPromptOptions } from "./context.js";

export const INTEGRATION_RESOLVER_SCHEMA_VERSION = "melee_integration_resolver_result_v1";

export type IntegrationResolverOutcome = "resolved" | "needs_rework" | "blocked" | "rejected";
export type IntegrationWorkerOutputDisposition = "applied" | "partially_applied" | "dropped" | "superseded";
export type IntegrationConflictResolution = "resolved_cleanly" | "kept_session_current" | "kept_worker_output" | "manual_merge" | "escalated";

export interface IntegrationResolverAgentResult {
  schema_version: typeof INTEGRATION_RESOLVER_SCHEMA_VERSION;
  queue_item_id: string;
  conflict_group_id: string | null;
  outcome: IntegrationResolverOutcome;
  summary: string;
  applied_worker_outputs: Array<{
    worker_state_id: string | null;
    checkpoint_id: string | null;
    target: string | null;
    source_paths: string[];
    disposition: IntegrationWorkerOutputDisposition;
    evidence: string;
  }>;
  conflict_resolutions: Array<{
    path: string;
    symbols: string[];
    resolution: IntegrationConflictResolution;
    evidence: string;
  }>;
  edits: string[];
  validation: Array<{
    command: string;
    status: "passed" | "failed" | "not_run";
    artifact_path: string | null;
    notes: string;
  }>;
  remaining_conflicts: Array<{
    path: string;
    reason: string;
  }>;
  carry_forward_notes: string[];
  risks: string[];
}

function agentFilePath(): string {
  return fileURLToPath(new URL("./agent.ts", import.meta.url));
}

export const prompt = definePrompt({
  id: "melee.integration-resolver.system",
  title: "Melee Integration Resolver System Prompt",
  archetype: "workflow",
  nodes: [
    section("goal", [
      bulletList([
        "Resolve a running-phase worker-output integration conflict before PR mode begins.",
        "Operate on the integration queue item produced after a worker finished and the runner tried to apply its selected checkpoint or patch.",
        "Preserve validated exact matches first, then validated non-exact improvements, while keeping the cycle integration worktree reviewable and standards-compliant.",
        "Respect the explicit write sets and conflict group supplied in `<integration_conflict_item>`; do not broaden scope beyond the files needed to resolve that queue item.",
        "This is not PR QA repair, not PR comment fixing, and not reconcile. Do not post to GitHub, mutate PR records, split PRs, or perform upstream-sync policy decisions.",
      ]),
    ]),
    section("context_contract", [
      usesContext("integration-conflict-item", {
        instructions: [
          "Use the injected queue item, available tools, decomp standards, explicit write sets, conflict group, and output schema as the authoritative task packet.",
          "Resolve only the supplied worker-output integration queue item or conflict group.",
        ],
      }),
      usesContext("integration-queue-summary", {
        instructions: ["Use the injected queue summary for batch context only; do not broaden scope beyond the named item."],
      }),
    ]),
    section("definition_of_done", [
      "Return exactly one JSON object following the injected output contract.",
      bulletList([
        "Every conflict marker, failed-apply hunk, duplicate hunk, or dirty integration failure in the supplied conflict group is resolved, or listed in `remaining_conflicts[]` with concrete evidence.",
        "Every worker output/checkpoint named by the queue item has an `applied_worker_outputs[]` disposition.",
        "Every touched path has a `conflict_resolutions[]` row explaining what was kept and why.",
        "The final source obeys the current game standards and avoids fake/generated match tactics.",
        "You ran the most relevant validation available from the attached tools and reported passed, failed, or not_run rows.",
        "The runner still owns queue state, full epoch validation, integration acceptance, and future scheduling.",
      ]),
    ]),
    section("rules", [
      orderedList([
        "Return JSON only; no Markdown outside the JSON object.",
        "Resolve only the supplied worker-output integration queue item or conflict group.",
        "Do not edit unrelated files, admit targets, schedule workers, update board state, mutate knowledge graph state, or touch PR/GitHub state.",
        "Do not use destructive git commands such as `reset --hard`, force checkout over dirty files, branch deletion, or broad stash/drop operations.",
        "Treat the cycle-current integration worktree as the base truth unless the worker checkpoint has explicit validation evidence for a better source hunk.",
        "Prefer preserving exact matches over fuzzy improvements, but never preserve exactness by keeping banned, generated, fake, or standards-rejected source.",
        "If two worker outputs conflict, keep both only when the merged source remains coherent and validated; otherwise keep the higher-confidence exact/improvement and record the dropped/superseded output.",
        "If the conflict spans multiple target source files, handle the whole supplied group together so shared declarations and source edits remain consistent.",
        "Do not invent validation results, queue ids, worker ids, checkpoint ids, paths, symbols, or score evidence.",
        'If a clean resolution is impossible, stop with `outcome: "blocked"` or `"needs_rework"` and name the exact blocker.',
      ]),
    ]),
    section("workflow", [
      section("phase", [
        bulletList([
          "Read queue id, conflict group id, failed command/output, patch paths, explicit write sets, worker checkpoint metadata, and current conflict paths.",
          "Identify which files and symbols are in scope.",
        ]),
      ], { attrs: { id: "1", name: "read_queue_item" } }),
      section("phase", [
        bulletList([
          "Inspect the conflicted source, cycle-current intent, worker output intent, and nearby game idioms.",
          "Use graph/path facts or past PR evidence only for files and symbols named by the conflict group.",
        ]),
      ], { attrs: { id: "2", name: "inspect_conflict" } }),
      section("phase", [
        bulletList([
          "Remove conflict markers or failed-apply residue file by file.",
          "Keep cycle-current structure unless the worker's validated hunk clearly improves or exact-matches the target.",
          "Preserve useful worker output by adapting it to the current source shape rather than blindly choosing one side.",
        ]),
      ], { attrs: { id: "3", name: "resolve_minimally" } }),
      section("phase", [
        bulletList([
          "Run focused compile, checkdiff/objdiff, review lint, or queue-specified validation.",
          "Record every command, status, artifact path, and note in `validation[]`.",
        ]),
      ], { attrs: { id: "4", name: "validate" } }),
      section("phase", [
        "Return a compact JSON object with dispositions, path-level conflict resolutions, edits, validation, remaining conflicts, carry-forward notes, and risks.",
      ], { attrs: { id: "5", name: "report" } }),
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

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function validationRows(value: unknown): IntegrationResolverAgentResult["validation"] | null {
  if (!Array.isArray(value)) return null;
  const rows: IntegrationResolverAgentResult["validation"] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const rawStatus = stringValue(raw.status);
    const status = rawStatus === "skipped" ? "not_run" : rawStatus;
    if (status !== "passed" && status !== "failed" && status !== "not_run") return null;
    rows.push({
      command: stringValue(raw.command),
      status,
      artifact_path: raw.artifact_path === null ? null : nullableString(raw.artifact_path ?? raw.artifactPath),
      notes: stringValue(raw.notes),
    });
  }
  return rows;
}

function workerOutputRows(value: unknown): IntegrationResolverAgentResult["applied_worker_outputs"] | null {
  if (!Array.isArray(value)) return null;
  const rows: IntegrationResolverAgentResult["applied_worker_outputs"] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const disposition = stringValue(raw.disposition);
    if (disposition !== "applied" && disposition !== "partially_applied" && disposition !== "dropped" && disposition !== "superseded") return null;
    rows.push({
      worker_state_id: nullableString(raw.worker_state_id ?? raw.workerStateId),
      checkpoint_id: nullableString(raw.checkpoint_id ?? raw.checkpointId),
      target: nullableString(raw.target),
      source_paths: stringArray(raw.source_paths ?? raw.sourcePaths),
      disposition,
      evidence: stringValue(raw.evidence),
    });
  }
  return rows;
}

function conflictResolutionRows(value: unknown): IntegrationResolverAgentResult["conflict_resolutions"] | null {
  if (!Array.isArray(value)) return null;
  const rows: IntegrationResolverAgentResult["conflict_resolutions"] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const resolution = stringValue(raw.resolution);
    if (resolution !== "resolved_cleanly" && resolution !== "kept_session_current" && resolution !== "kept_worker_output" && resolution !== "manual_merge" && resolution !== "escalated") return null;
    rows.push({
      path: stringValue(raw.path),
      symbols: stringArray(raw.symbols),
      resolution,
      evidence: stringValue(raw.evidence),
    });
  }
  return rows;
}

function remainingConflictRows(value: unknown): IntegrationResolverAgentResult["remaining_conflicts"] | null {
  if (!Array.isArray(value)) return null;
  const rows: IntegrationResolverAgentResult["remaining_conflicts"] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    rows.push({
      path: stringValue(raw.path),
      reason: stringValue(raw.reason),
    });
  }
  return rows;
}

export function validateIntegrationResolverAgentResult(value: unknown): { result: IntegrationResolverAgentResult | null; errors: string[] } {
  if (!isRecord(value)) return { result: null, errors: ["result is not an object"] };
  const errors: string[] = [];
  if (value.schema_version !== INTEGRATION_RESOLVER_SCHEMA_VERSION) errors.push(`schema_version must be ${INTEGRATION_RESOLVER_SCHEMA_VERSION}`);
  const outcome = stringValue(value.outcome);
  if (!["resolved", "needs_rework", "blocked", "rejected"].includes(outcome)) errors.push("outcome is not a valid integration resolver outcome");
  const queueItemId = stringValue(value.queue_item_id ?? value.queueItemId);
  const summary = stringValue(value.summary);
  if (!queueItemId) errors.push("queue_item_id is required");
  if (!summary) errors.push("summary is required");

  const workerOutputs = workerOutputRows(value.applied_worker_outputs);
  if (!workerOutputs) errors.push("applied_worker_outputs must be an array of worker output disposition rows");
  const conflictResolutions = conflictResolutionRows(value.conflict_resolutions);
  if (!conflictResolutions) errors.push("conflict_resolutions must be an array of conflict resolution rows");
  const validation = validationRows(value.validation);
  if (!validation) errors.push("validation must be an array of command/status rows");
  const remainingConflicts = remainingConflictRows(value.remaining_conflicts);
  if (!remainingConflicts) errors.push("remaining_conflicts must be an array");
  if (!Array.isArray(value.edits)) errors.push("edits must be an array");
  if (!Array.isArray(value.carry_forward_notes)) errors.push("carry_forward_notes must be an array");
  if (!Array.isArray(value.risks)) errors.push("risks must be an array");

  if (errors.length > 0 || !workerOutputs || !conflictResolutions || !validation || !remainingConflicts) return { result: null, errors };
  return {
    result: {
      schema_version: INTEGRATION_RESOLVER_SCHEMA_VERSION,
      queue_item_id: queueItemId,
      conflict_group_id: nullableString(value.conflict_group_id ?? value.conflictGroupId),
      outcome: outcome as IntegrationResolverOutcome,
      summary,
      applied_worker_outputs: workerOutputs,
      conflict_resolutions: conflictResolutions,
      edits: stringArray(value.edits),
      validation,
      remaining_conflicts: remainingConflicts,
      carry_forward_notes: stringArray(value.carry_forward_notes),
      risks: stringArray(value.risks),
    },
    errors: [],
  };
}

export function integrationResolverPrompt(options: IntegrationResolverPromptOptions): PiPromptBundle {
  const systemTemplatePath = agentFilePath();
  const userTemplatePath = promptFilePath();
  return {
    systemPrompt: renderSystemPrompt(),
    userPrompt: INTEGRATION_RESOLVER_TURN_PROMPT,
    systemTemplatePath,
    userTemplatePath,
    kernelContext: buildIntegrationResolverKernelContext(options),
  };
}
