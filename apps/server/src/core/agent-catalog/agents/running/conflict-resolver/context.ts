import { defineContext } from "@agent-kernel/kernel/agent-definition";
import type { LoaderDeclaration } from "@agent-kernel/kernel/context";
import type { PiPromptBundle, RunProjectMetadata } from "@server/core/shared/types";
import { globalStandardsPromptXml } from "@server/core/knowledge";
import {
  createInlineAgentContextResolver,
  rootContextLoaderDeclaration,
} from "@server/core/agent-catalog/kernel-context.js";
import {
  renderTemplate,
  stableJson,
  type PromptTemplateValues,
} from "@server/infrastructure/agent-runtime/runtime";

export const CONFLICT_RESOLVER_REQUEST_SCHEMA_VERSION =
  "melee_conflict_resolver_request_v1" as const;

export interface ConflictResolverCheckEvidence {
  name: string;
  command: string | null;
  status: "passed" | "failed" | "not_run";
  artifact_path: string | null;
  summary: string;
}

export interface ConflictResolverClaimMetadata {
  claim_id: string | null;
  worker_state_id: string | null;
  checkpoint_id: string | null;
  target_id: string | null;
  target_symbol: string | null;
  source_paths: string[];
  write_set: string[];
  validation_state: "tentative" | "confirmed" | "regressed" | null;
  metadata: Record<string, unknown>;
}

export interface ConflictResolverSideEvidence {
  claim: ConflictResolverClaimMetadata;
  scoped_checks: {
    passed: boolean;
    checks: ConflictResolverCheckEvidence[];
    metadata: Record<string, unknown>;
  };
}

/**
 * Complete conflict packet. The runner creates `isolated_worktree.path`; the
 * agent must never operate in `session_worktree_path` directly.
 */
export interface ConflictResolverRequest {
  schema_version: typeof CONFLICT_RESOLVER_REQUEST_SCHEMA_VERSION;
  integration_item_id: string;
  conflict_group_id: string | null;
  isolated_worktree: {
    path: string;
    base_revision: string;
    session_revision: string;
  };
  session_worktree_path: string;
  incoming: ConflictResolverSideEvidence & {
    patch: {
      path: string | null;
      text: string | null;
      sha256: string | null;
    };
  };
  current: ConflictResolverSideEvidence & {
    branch_state: {
      head_revision: string;
      status_porcelain: string;
      diff: string | null;
      metadata: Record<string, unknown>;
    };
  };
  conflict_paths: string[];
  metadata: Record<string, unknown>;
}

export interface ConflictResolverPromptOptions {
  request: ConflictResolverRequest;
  repoRoot?: string;
  stateDir?: string;
  project?: RunProjectMetadata;
}

export const CONFLICT_RESOLVER_TURN_PROMPT = [
  "Use the injected merge-on-finish conflict packet.",
  "Resolve it only in the supplied isolated worktree and return exactly one JSON object.",
].join(" ");

const loaders = [
  rootContextLoaderDeclaration,
  {
    kind: "merge-on-finish-conflict",
    ref: "merge-on-finish-conflict",
    label: "merge-on-finish-conflict",
  },
] as const satisfies readonly LoaderDeclaration[];

export const context = defineContext(
  createInlineAgentContextResolver(loaders, CONFLICT_RESOLVER_TURN_PROMPT),
);

export const CONFLICT_RESOLVER_OUTPUT_CONTRACT = {
  schema_version: "melee_conflict_resolver_result_v1",
  integration_item_id: "string",
  conflict_group_id: "string|null",
  outcome: "resolved|failed",
  summary: "string",
  applied_in_isolated_worktree: "boolean",
  resolved_patch: {
    path: "string|null",
    text: "string|null",
    sha256: "string|null",
  },
  conflict_resolutions: [
    {
      path: "string",
      resolution: "merged|kept_current|kept_incoming|failed",
      evidence: "string",
    },
  ],
  validation: [
    {
      name: "string",
      command: "string|null",
      status: "passed|failed|not_run",
      artifact_path: "string|null",
      summary: "string",
    },
  ],
  remaining_conflicts: [{ path: "string", reason: "string" }],
  risks: ["string"],
} as const;

const CONFLICT_CONTEXT_TEMPLATE = `<task>
    Resolve one merge-on-finish conflict in the supplied isolated worktree.
    Produce a resolved patch for runner-owned application and recording on the session branch.
</task>

{{DECOMP_STANDARDS_XML}}

<execution_contract>
The only writable checkout for this task is {{ISOLATED_WORKTREE_JSON}}.
The session integration checkout is context only. Never edit it directly.
</execution_contract>

<merge_on_finish_conflict>
{{CONFLICT_REQUEST_JSON}}
</merge_on_finish_conflict>

<output_contract>
{{OUTPUT_CONTRACT_JSON}}
</output_contract>

Return exactly one JSON object.`;

export function buildConflictResolverKernelContext(
  options: ConflictResolverPromptOptions,
): NonNullable<PiPromptBundle["kernelContext"]> {
  const values = {
    DECOMP_STANDARDS_XML: globalStandardsPromptXml(),
    ISOLATED_WORKTREE_JSON: stableJson(options.request.isolated_worktree),
    CONFLICT_REQUEST_JSON: stableJson(options.request),
    OUTPUT_CONTRACT_JSON: stableJson(CONFLICT_RESOLVER_OUTPUT_CONTRACT),
  } as unknown as PromptTemplateValues;
  const renderedContext = renderTemplate(CONFLICT_CONTEXT_TEMPLATE, values);
  return {
    turnPrompt: CONFLICT_RESOLVER_TURN_PROMPT,
    renderedContext,
    inputs: [
      {
        loaderKind: "merge-on-finish-conflict",
        inputRef: "merge-on-finish-conflict",
        content: renderedContext,
      },
    ],
  };
}

export default context;
