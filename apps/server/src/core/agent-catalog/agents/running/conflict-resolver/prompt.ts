import { fileURLToPath } from "node:url";
import {
  bulletList,
  definePrompt,
  orderedList,
  renderXmlMarkdown,
  section,
  usesContext,
} from "@codecaine-ai/prompt-kit";
import type { PiPromptBundle } from "@server/core/shared/types";
import {
  buildConflictResolverKernelContext,
  CONFLICT_RESOLVER_TURN_PROMPT,
  type ConflictResolverCheckEvidence,
  type ConflictResolverPromptOptions,
} from "./context.js";

export type { ConflictResolverPromptOptions } from "./context.js";

export const CONFLICT_RESOLVER_RESULT_SCHEMA_VERSION =
  "melee_conflict_resolver_result_v1" as const;

export type ConflictResolutionChoice =
  | "merged"
  | "kept_current"
  | "kept_incoming"
  | "failed";

export interface ConflictResolverAgentResult {
  schema_version: typeof CONFLICT_RESOLVER_RESULT_SCHEMA_VERSION;
  integration_item_id: string;
  conflict_group_id: string | null;
  outcome: "resolved" | "failed";
  summary: string;
  applied_in_isolated_worktree: boolean;
  resolved_patch: {
    path: string | null;
    text: string | null;
    sha256: string | null;
  };
  conflict_resolutions: Array<{
    path: string;
    resolution: ConflictResolutionChoice;
    evidence: string;
  }>;
  validation: ConflictResolverCheckEvidence[];
  remaining_conflicts: Array<{ path: string; reason: string }>;
  risks: string[];
}

export const prompt = definePrompt({
  id: "melee.conflict-resolver.system",
  title: "Melee Merge-on-Finish Conflict Resolver",
  archetype: "workflow",
  nodes: [
    section("goal", [
      bulletList([
        "Resolve one immediate worker-output merge conflict without weakening either side's validation claims.",
        "Work only in the isolated worktree named in the request; the session integration worktree is read-only context.",
        "Return a minimal resolved patch that the runner can apply serially and record, or fail closed to the existing operator-visible conflict path.",
      ]),
    ]),
    section("context_contract", [
      usesContext("merge-on-finish-conflict", {
        instructions: [
          "Treat the incoming patch, current branch state, conflict paths, both claims' metadata, and both sides' scoped-check evidence as authoritative.",
          "Do not broaden the write set beyond the union of the supplied write sets and conflict paths.",
        ],
      }),
    ]),
    section("rules", [
      orderedList([
        "Return exactly one JSON object matching the injected output contract.",
        "Never edit the session integration worktree, worker worktree, or any checkout other than isolated_worktree.path.",
        "Do not reset, checkout over, stash, clean, delete branches, or rewrite history.",
        "Preserve a confirmed current-side change over a tentative incoming change unless the supplied evidence proves the incoming resolution is compatible.",
        "Do not claim scoped checks passed unless the result or supplied artifacts prove it.",
        "For a resolved outcome, remove every conflict, apply the resolution in the isolated worktree, and emit a non-empty resolved patch path or patch text.",
        "If intent or validation evidence is insufficient, return failed and list every remaining conflict with a concrete reason.",
      ]),
    ]),
    section("workflow", [
      bulletList([
        "Inspect both claims, the incoming patch, branch state, and the named conflict files.",
        "Resolve the smallest coherent file set in the isolated worktree.",
        "Run the supplied scoped checks that remain applicable to the merged result.",
        "Generate the resolved patch from the isolated worktree and report path-level decisions.",
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

function agentFilePath(): string {
  return fileURLToPath(new URL("./agent.ts", import.meta.url));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.some((item) => typeof item !== "string")) return null;
  return value as string[];
}

function checkRows(value: unknown): ConflictResolverCheckEvidence[] | null {
  if (!Array.isArray(value)) return null;
  const checks: ConflictResolverCheckEvidence[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const status = raw.status;
    if (status !== "passed" && status !== "failed" && status !== "not_run") {
      return null;
    }
    checks.push({
      name: typeof raw.name === "string" ? raw.name : "",
      command: nullableString(raw.command),
      status,
      artifact_path: nullableString(raw.artifact_path ?? raw.artifactPath),
      summary: typeof raw.summary === "string" ? raw.summary : "",
    });
  }
  return checks;
}

function resolutionRows(
  value: unknown,
): ConflictResolverAgentResult["conflict_resolutions"] | null {
  if (!Array.isArray(value)) return null;
  const rows: ConflictResolverAgentResult["conflict_resolutions"] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const resolution = raw.resolution;
    if (
      resolution !== "merged" &&
      resolution !== "kept_current" &&
      resolution !== "kept_incoming" &&
      resolution !== "failed"
    ) {
      return null;
    }
    rows.push({
      path: typeof raw.path === "string" ? raw.path : "",
      resolution,
      evidence: typeof raw.evidence === "string" ? raw.evidence : "",
    });
  }
  return rows;
}

function remainingRows(
  value: unknown,
): ConflictResolverAgentResult["remaining_conflicts"] | null {
  if (!Array.isArray(value)) return null;
  const rows: ConflictResolverAgentResult["remaining_conflicts"] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    rows.push({
      path: typeof raw.path === "string" ? raw.path : "",
      reason: typeof raw.reason === "string" ? raw.reason : "",
    });
  }
  return rows;
}

export function validateConflictResolverAgentResult(value: unknown): {
  result: ConflictResolverAgentResult | null;
  errors: string[];
} {
  if (!isRecord(value)) return { result: null, errors: ["result is not an object"] };
  const errors: string[] = [];
  const integrationItemId =
    typeof value.integration_item_id === "string" ? value.integration_item_id : "";
  const outcome = value.outcome;
  const summary = typeof value.summary === "string" ? value.summary : "";
  if (value.schema_version !== CONFLICT_RESOLVER_RESULT_SCHEMA_VERSION) {
    errors.push(
      `schema_version must be ${CONFLICT_RESOLVER_RESULT_SCHEMA_VERSION}`,
    );
  }
  if (!integrationItemId) errors.push("integration_item_id is required");
  if (outcome !== "resolved" && outcome !== "failed") {
    errors.push("outcome must be resolved or failed");
  }
  if (!summary) errors.push("summary is required");
  if (typeof value.applied_in_isolated_worktree !== "boolean") {
    errors.push("applied_in_isolated_worktree must be boolean");
  }

  const patch = isRecord(value.resolved_patch) ? value.resolved_patch : null;
  if (!patch) errors.push("resolved_patch must be an object");
  const resolutions = resolutionRows(value.conflict_resolutions);
  if (!resolutions) errors.push("conflict_resolutions must be an array");
  const validation = checkRows(value.validation);
  if (!validation) errors.push("validation must be an array");
  const remaining = remainingRows(value.remaining_conflicts);
  if (!remaining) errors.push("remaining_conflicts must be an array");
  const risks = stringArray(value.risks);
  if (!risks) errors.push("risks must be an array of strings");

  if (
    errors.length > 0 ||
    (outcome !== "resolved" && outcome !== "failed") ||
    !patch ||
    !resolutions ||
    !validation ||
    !remaining ||
    !risks
  ) {
    return { result: null, errors };
  }

  const result: ConflictResolverAgentResult = {
    schema_version: CONFLICT_RESOLVER_RESULT_SCHEMA_VERSION,
    integration_item_id: integrationItemId,
    conflict_group_id: nullableString(
      value.conflict_group_id ?? value.conflictGroupId,
    ),
    outcome,
    summary,
    applied_in_isolated_worktree: value.applied_in_isolated_worktree as boolean,
    resolved_patch: {
      path: nullableString(patch.path),
      text: nullableString(patch.text),
      sha256: nullableString(patch.sha256),
    },
    conflict_resolutions: resolutions,
    validation,
    remaining_conflicts: remaining,
    risks,
  };

  if (result.outcome === "resolved") {
    if (!result.applied_in_isolated_worktree) {
      errors.push("resolved outcome must be applied in the isolated worktree");
    }
    if (!result.resolved_patch.path && !result.resolved_patch.text) {
      errors.push("resolved outcome requires a resolved patch path or text");
    }
    if (result.remaining_conflicts.length > 0) {
      errors.push("resolved outcome cannot contain remaining conflicts");
    }
  }
  return errors.length > 0 ? { result: null, errors } : { result, errors: [] };
}

export function conflictResolverPrompt(
  options: ConflictResolverPromptOptions,
): PiPromptBundle {
  return {
    systemPrompt: renderSystemPrompt(),
    userPrompt: CONFLICT_RESOLVER_TURN_PROMPT,
    systemTemplatePath: agentFilePath(),
    userTemplatePath: promptFilePath(),
    kernelContext: buildConflictResolverKernelContext(options),
  };
}

export default prompt;
