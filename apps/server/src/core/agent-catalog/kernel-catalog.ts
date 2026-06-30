import { renderXmlMarkdown, type PromptDocument } from "@codecaine-ai/prompt-kit";
import type { TypedAgentDefinition } from "@agent-kernel/kernel/agent-definition";
import type { AgentContextResolver, LoaderDeclaration } from "@agent-kernel/kernel/context";
import type { ParsedAgent } from "@agent-kernel/kernel/spawn-pipeline";
import type { RuntimeAgentRole, PiPromptBundle } from "@server/core/shared/types";

import { DEFAULT_PI_THINKING_LEVEL } from "@server/infrastructure/agent-runtime/runtime";
import { agentRegistry, type RegisteredAgentId } from "@server/core/agent-catalog/registry";
import {
  defaultKernelTurnPrompt,
  renderLoadedKernelContext,
  ROOT_CONTEXT_LOADER_KIND,
  rootContextLoaderDeclaration,
} from "@server/core/agent-catalog/kernel-context.js";
import workerKernelAgent from "@server/core/agent-catalog/agents/running/worker/agent.js";
import integrationResolverKernelAgent from "@server/core/agent-catalog/agents/running/integration-resolver/agent.js";
import prIndexerKernelAgent from "@server/core/agent-catalog/agents/knowledge/pr-indexer/agent.js";
import prReviewerKernelAgent from "@server/core/agent-catalog/agents/pr/reviewer/agent.js";
import prFixerKernelAgent from "@server/core/agent-catalog/agents/pr/fixer/agent.js";
import prSplitterKernelAgent from "@server/core/agent-catalog/agents/pr/splitter/agent.js";
import knowledgeCuratorKernelAgent from "@server/core/agent-catalog/agents/knowledge/curator/agent.js";
import reconcileKernelAgent from "@server/core/agent-catalog/agents/pr/reconcile/agent.js";
import qaRepairKernelAgent from "@server/core/agent-catalog/agents/pr/qa-repair/agent.js";

export const KERNEL_AGENT_IDS = [
  "worker",
  "integration-resolver",
  "pr-indexer",
  "pr-reviewer",
  "pr-fixer",
  "pr-splitter",
  "knowledge-curator",
  "reconcile",
  "qa-repair",
] as const satisfies readonly RegisteredAgentId[];

export type KernelAgentId = (typeof KERNEL_AGENT_IDS)[number];

export interface KernelAgentPromptPaths {
  systemTemplatePath: string;
  promptModulePath: string;
  contextModulePath: string;
  toolsModulePath: string;
  userTemplatePath: string;
  schemaPath: string | null;
}

export interface KernelAgentResultContract {
  schemaVersion: string | null;
  schemaPath: string | null;
  validator: string | null;
  notes: string;
}

export interface KernelAgentCatalogEntry {
  id: KernelAgentId;
  name: KernelAgentId;
  role: RuntimeAgentRole;
  description: string;
  model: string;
  toolProfile: RuntimeAgentRole;
  tools: string[];
  disallowedTools: string[];
  extensions: true | string[] | false;
  canSpawnSubagent: boolean;
  variables: Record<string, { default: unknown; description?: string }>;
  maxTurns: number | null;
  runInBackground: boolean;
  thinking: string;
  group: "running" | "knowledge" | "pr";
  phase: string;
  promptPaths: KernelAgentPromptPaths;
  contextLoaderKinds: string[];
  resultContract: KernelAgentResultContract;
}

export interface KernelAgentViewerDefinition {
  name: string;
  description: string;
  model: string;
  source?: "typed" | "markdown";
  prompt?: PromptDocument | null;
  tools: string[];
  disallowedTools: string[];
  extensions: true | string[] | false;
  canSpawnSubagent: boolean;
  variables: Record<string, { default: unknown; description?: string | null }>;
  maxTurns: number | null;
  runInBackground: boolean;
  thinking: string | null;
  body: string;
  agentFile: string;
  contextModulePath: string | null;
  warnings: string[];
  group?: string | null;
  renderedPrompt?: {
    content: string;
    timestamp?: string | null;
    resolvedVariables?: Record<string, unknown>;
    toolsAllowlist?: string[];
    toolsDisallowlist?: string[];
  } | null;
  context?: {
    modulePath: string | null;
    inputs: Array<{
      loaderKind: string;
      inputRef: string;
      status: "ok" | "empty" | "error" | string;
      bytes: number;
    }>;
    renderedContext?: string | null;
    timestamp?: string | null;
  } | null;
}

export interface KernelPromptBundleConversion {
  parsed: ParsedAgent;
  userPrompt: string;
  contextResolver?: AgentContextResolver | null;
}

type KernelAgentViewerContext = NonNullable<KernelAgentViewerDefinition["context"]>;

const ROOT_CONTEXT_LOADERS = [ROOT_CONTEXT_LOADER_KIND] as const;
const typedAgentDefinitions = {
  worker: workerKernelAgent,
  "integration-resolver": integrationResolverKernelAgent,
  "pr-indexer": prIndexerKernelAgent,
  "pr-reviewer": prReviewerKernelAgent,
  "pr-fixer": prFixerKernelAgent,
  "pr-splitter": prSplitterKernelAgent,
  "knowledge-curator": knowledgeCuratorKernelAgent,
  reconcile: reconcileKernelAgent,
  "qa-repair": qaRepairKernelAgent,
} as const satisfies Record<KernelAgentId, TypedAgentDefinition>;

function typedAgentDefinition(id: KernelAgentId): TypedAgentDefinition {
  return typedAgentDefinitions[id];
}

function isPromptDocument(value: unknown): value is PromptDocument {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "prompt";
}

function renderTypedPrompt(definition: TypedAgentDefinition): string {
  return isPromptDocument(definition.prompt) ? renderXmlMarkdown(definition.prompt) : definition.prompt;
}

function parsedAgentFromTyped(definition: TypedAgentDefinition): ParsedAgent {
  return {
    frontmatter: {
      name: definition.name,
      description: definition.description,
      model: definition.model,
      tools: definition.coreTools ?? [],
      disallowed_tools: definition.disallowedTools ?? [],
      extensions: definition.extensions ?? true,
      can_spawn_subagent: definition.canSpawnSubagent ?? false,
      variables: definition.variables ?? {},
      max_turns: definition.maxTurns,
      run_in_background: definition.runInBackground ?? false,
      thinking: definition.thinking,
    },
    body: renderTypedPrompt(definition),
  };
}

function promptBundleContextResolver(
  entry: KernelAgentCatalogEntry,
  bundle: PiPromptBundle,
): AgentContextResolver | null {
  const context = bundle.kernelContext;
  if (!context?.inputs.length) return null;
  const loaders: LoaderDeclaration[] = [
    rootContextLoaderDeclaration,
    ...context.inputs.map((input) => ({
      kind: input.loaderKind,
      ref: input.inputRef ?? input.loaderKind,
      label: input.inputRef ?? input.loaderKind,
      content: input.content,
    })),
  ];
  return {
    loaders,
    assemble: (loaded, ctx) => {
      const rendered = renderLoadedKernelContext(loaded, ctx);
      if (rendered) return rendered;
      return context.renderedContext ?? bundle.userPrompt ?? defaultKernelTurnPrompt(entry.name);
    },
  };
}

function registryEntry(id: KernelAgentId): (typeof agentRegistry)[KernelAgentId] {
  return agentRegistry[id];
}

function promptPaths(systemTemplatePath: string, userTemplatePath: string, schemaPath: string | null = null): KernelAgentPromptPaths {
  const moduleRoot = systemTemplatePath.replace(/\/agent\.ts$/, "");
  return {
    systemTemplatePath,
    promptModulePath: `${moduleRoot}/prompt.ts`,
    contextModulePath: `${moduleRoot}/context.ts`,
    toolsModulePath: `${moduleRoot}/tools.ts`,
    userTemplatePath,
    schemaPath,
  };
}

function resultContract(
  schemaVersion: string | null,
  schemaPath: string | null,
  validator: string | null,
  notes: string,
): KernelAgentResultContract {
  return { schemaVersion, schemaPath, validator, notes };
}

function catalogVariables(variables: ParsedAgent["frontmatter"]["variables"]): KernelAgentCatalogEntry["variables"] {
  const normalized: KernelAgentCatalogEntry["variables"] = {};
  for (const [name, declaration] of Object.entries(variables)) {
    normalized[name] = {
      default: declaration.default,
      ...(declaration.description === undefined ? {} : { description: declaration.description }),
    };
  }
  return normalized;
}

function catalogEntry(
  id: KernelAgentId,
  details: Omit<
    KernelAgentCatalogEntry,
    | "id"
    | "name"
    | "role"
    | "description"
    | "model"
    | "toolProfile"
    | "tools"
    | "disallowedTools"
    | "extensions"
    | "canSpawnSubagent"
    | "variables"
    | "maxTurns"
    | "runInBackground"
    | "thinking"
  >,
): KernelAgentCatalogEntry {
  const registered = registryEntry(id);
  const role = registered.role as RuntimeAgentRole;
  const parsedAgent = parsedAgentFromTyped(typedAgentDefinition(id));
  const frontmatter = parsedAgent.frontmatter;
  return {
    id,
    name: frontmatter.name as KernelAgentId,
    role,
    description: frontmatter.description,
    model: frontmatter.model,
    toolProfile: role,
    tools: frontmatter.tools,
    disallowedTools: frontmatter.disallowed_tools ?? [],
    extensions: frontmatter.extensions ?? true,
    canSpawnSubagent: frontmatter.can_spawn_subagent ?? false,
    variables: catalogVariables(frontmatter.variables),
    maxTurns: frontmatter.max_turns ?? null,
    runInBackground: frontmatter.run_in_background ?? false,
    thinking: frontmatter.thinking ?? DEFAULT_PI_THINKING_LEVEL,
    ...details,
  };
}

export const meleeKernelAgentCatalog = [
  catalogEntry("worker", {
    group: "running",
    phase: "worker",
    promptPaths: promptPaths(
      "apps/server/src/core/agent-catalog/agents/running/worker/agent.ts",
      "apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts",
    ),
    contextLoaderKinds: [...ROOT_CONTEXT_LOADERS, "worker-packet", "knowledge-graph-file-card"],
    resultContract: resultContract(
      null,
      null,
      null,
      "Worker has no structured output contract. The runner may parse final assistant text as an advisory validation handoff, but lifecycle status, validation, reports, and best-record selection stay runner-owned.",
    ),
  }),
  catalogEntry("integration-resolver", {
    group: "running",
    phase: "integration",
    promptPaths: promptPaths(
      "apps/server/src/core/agent-catalog/agents/running/integration-resolver/agent.ts",
      "apps/server/src/core/agent-catalog/agents/running/integration-resolver/prompt.ts",
      "apps/server/src/core/agent-catalog/agents/running/integration-resolver/schema.json",
    ),
    contextLoaderKinds: [...ROOT_CONTEXT_LOADERS, "integration-conflict-item", "integration-queue-summary"],
    resultContract: resultContract(
      "melee_integration_resolver_result_v1",
      "apps/server/src/core/agent-catalog/agents/running/integration-resolver/schema.json",
      "validateIntegrationResolverAgentResult",
      "Integration resolver results are validated before runner-owned queue status updates and epoch acceptance.",
    ),
  }),
  catalogEntry("pr-indexer", {
    group: "knowledge",
    phase: "pr-index",
    promptPaths: promptPaths(
      "apps/server/src/core/agent-catalog/agents/knowledge/pr-indexer/agent.ts",
      "apps/server/src/core/agent-catalog/agents/knowledge/pr-indexer/prompt.ts",
      "apps/server/src/core/agent-catalog/agents/knowledge/pr-indexer/schema.json",
    ),
    contextLoaderKinds: [...ROOT_CONTEXT_LOADERS, "pr-index-context"],
    resultContract: resultContract(
      "melee_pr_postmortem_v1",
      "apps/server/src/core/agent-catalog/agents/knowledge/pr-indexer/schema.json",
      null,
      "Current PR postmortem output is schema-described and handed to the curator pipeline.",
    ),
  }),
  catalogEntry("pr-reviewer", {
    group: "pr",
    phase: "pr-review",
    promptPaths: promptPaths(
      "apps/server/src/core/agent-catalog/agents/pr/reviewer/agent.ts",
      "apps/server/src/core/agent-catalog/agents/pr/reviewer/prompt.ts",
      "apps/server/src/core/agent-catalog/agents/pr/reviewer/schema.json",
    ),
    contextLoaderKinds: [...ROOT_CONTEXT_LOADERS, "pr-slice-diff", "review-lint-findings", "standard-examples"],
    resultContract: resultContract(
      "melee_pr_preship_review_v1",
      "apps/server/src/core/agent-catalog/agents/pr/reviewer/schema.json",
      "validatePreshipReview",
      "Preship review findings are structurally validated before repair routing.",
    ),
  }),
  catalogEntry("pr-fixer", {
    group: "pr",
    phase: "repair",
    promptPaths: promptPaths(
      "apps/server/src/core/agent-catalog/agents/pr/fixer/agent.ts",
      "apps/server/src/core/agent-catalog/agents/pr/fixer/prompt.ts",
      "apps/server/src/core/agent-catalog/agents/pr/fixer/schema.json",
    ),
    contextLoaderKinds: [...ROOT_CONTEXT_LOADERS, "pr-fixer-context", "standard-examples"],
    resultContract: resultContract(
      "melee_pr_fixer_result_v1",
      "apps/server/src/core/agent-catalog/agents/pr/fixer/schema.json",
      "validatePrFixerAgentResult",
      "PR fixer results are validated before runner-owned source validation and remote PR state updates.",
    ),
  }),
  catalogEntry("pr-splitter", {
    group: "pr",
    phase: "pr-split",
    promptPaths: promptPaths(
      "apps/server/src/core/agent-catalog/agents/pr/splitter/agent.ts",
      "apps/server/src/core/agent-catalog/agents/pr/splitter/prompt.ts",
      "apps/server/src/core/agent-catalog/agents/pr/splitter/schema.json",
    ),
    contextLoaderKinds: [...ROOT_CONTEXT_LOADERS, "pr-split-context"],
    resultContract: resultContract(
      "melee_pr_splitter_plan_v1",
      "apps/server/src/core/agent-catalog/agents/pr/splitter/schema.json",
      "validatePrSplitterPlan",
      "PR split plans are validated before slice worktrees/publication.",
    ),
  }),
  catalogEntry("knowledge-curator", {
    group: "knowledge",
    phase: "knowledge-curation",
    promptPaths: promptPaths(
      "apps/server/src/core/agent-catalog/agents/knowledge/curator/agent.ts",
      "apps/server/src/core/agent-catalog/agents/knowledge/curator/prompt.ts",
      "apps/server/src/core/agent-catalog/agents/knowledge/curator/schema.json",
    ),
    contextLoaderKinds: [...ROOT_CONTEXT_LOADERS, "curator-context"],
    resultContract: resultContract(
      "knowledge_curator_v1",
      "apps/server/src/core/agent-catalog/agents/knowledge/curator/schema.json",
      null,
      "Curator output is schema-described and remains proposal/acceptance input for harness-owned knowledge routing.",
    ),
  }),
  catalogEntry("reconcile", {
    group: "pr",
    phase: "reconcile",
    promptPaths: promptPaths(
      "apps/server/src/core/agent-catalog/agents/pr/reconcile/agent.ts",
      "apps/server/src/core/agent-catalog/agents/pr/reconcile/prompt.ts",
      "apps/server/src/core/agent-catalog/agents/pr/reconcile/schema.json",
    ),
    contextLoaderKinds: [...ROOT_CONTEXT_LOADERS, "reconcile-context"],
    resultContract: resultContract(
      "reconcile_v1",
      "apps/server/src/core/agent-catalog/agents/pr/reconcile/schema.json",
      null,
      "Reconcile reports remain harness-owned gate evidence for ship validation and upstream sync.",
    ),
  }),
  catalogEntry("qa-repair", {
    group: "pr",
    phase: "repair",
    promptPaths: promptPaths(
      "apps/server/src/core/agent-catalog/agents/pr/qa-repair/agent.ts",
      "apps/server/src/core/agent-catalog/agents/pr/qa-repair/prompt.ts",
      "apps/server/src/core/agent-catalog/agents/pr/qa-repair/schema.json",
    ),
    contextLoaderKinds: [...ROOT_CONTEXT_LOADERS, "qa-repair-item", "qa-repair-queue-summary", "standard-examples"],
    resultContract: resultContract(
      "melee_qa_repair_result_v1",
      "apps/server/src/core/agent-catalog/agents/pr/qa-repair/schema.json",
      "validateQaRepairAgentResult",
      "QA repair results are validated before runner-owned source validation and PR routing.",
    ),
  }),
] as const satisfies readonly KernelAgentCatalogEntry[];

export const meleeKernelAgentCatalogById = Object.fromEntries(
  meleeKernelAgentCatalog.map((entry) => [entry.id, entry]),
) as Record<KernelAgentId, KernelAgentCatalogEntry>;

export function meleeKernelAgent(id: KernelAgentId): KernelAgentCatalogEntry {
  return meleeKernelAgentCatalogById[id];
}

export function toKernelParsedAgentFromBundle(
  entry: KernelAgentCatalogEntry,
  bundle: PiPromptBundle,
): KernelPromptBundleConversion {
  const contextResolver = promptBundleContextResolver(entry, bundle);
  const parsedAgent = parsedAgentFromTyped(typedAgentDefinition(entry.id));
  const renderedPrompt = bundle.kernelContext?.renderedContext ?? bundle.userPrompt;
  return {
    parsed: {
      frontmatter: parsedAgent.frontmatter,
      body: bundle.systemPrompt,
    },
    userPrompt: contextResolver
      ? bundle.kernelContext?.turnPrompt ?? renderedPrompt ?? defaultKernelTurnPrompt(entry.name)
      : bundle.userPrompt,
    contextResolver,
  };
}

function viewerContextInputs(entry: KernelAgentCatalogEntry, bundle?: PiPromptBundle): KernelAgentViewerContext {
  if (!bundle?.kernelContext) {
    return {
      modulePath: null,
      inputs: entry.contextLoaderKinds.map((kind) => ({
        loaderKind: kind,
        inputRef: kind,
        status: "ok",
        bytes: 0,
      })),
      renderedContext: bundle?.userPrompt ?? null,
      timestamp: null,
    };
  }
  return {
    modulePath: entry.promptPaths.contextModulePath,
    inputs: [
      {
        loaderKind: ROOT_CONTEXT_LOADER_KIND,
        inputRef: ROOT_CONTEXT_LOADER_KIND,
        status: "ok",
        bytes: 0,
      },
      ...bundle.kernelContext.inputs.map((input) => ({
        loaderKind: input.loaderKind,
        inputRef: input.inputRef ?? input.loaderKind,
        status: input.content ? "ok" : "empty",
        bytes: Buffer.byteLength(input.content, "utf8"),
      })),
    ],
    renderedContext: bundle.kernelContext.renderedContext ?? bundle.userPrompt,
    timestamp: null,
  };
}

function renderedPromptContent(bundle: PiPromptBundle): string {
  const sections = ["=== SYSTEM PROMPT ===", bundle.systemPrompt];
  if (bundle.userPrompt.trim()) {
    sections.push("", "=== INITIAL USER PROMPT ===", bundle.userPrompt);
  }
  return sections.join("\n");
}

export function toKernelAgentViewerDefinition(
  entry: KernelAgentCatalogEntry,
  bundle?: PiPromptBundle,
  options: { generatedAt?: string; warnings?: string[] } = {},
): KernelAgentViewerDefinition {
  const definition = typedAgentDefinition(entry.id);
  return {
    name: entry.name,
    description: entry.description,
    model: entry.model,
    source: "typed",
    prompt: isPromptDocument(definition.prompt) ? definition.prompt : null,
    tools: entry.tools,
    disallowedTools: entry.disallowedTools,
    extensions: entry.extensions,
    canSpawnSubagent: entry.canSpawnSubagent,
    variables: entry.variables,
    maxTurns: entry.maxTurns,
    runInBackground: entry.runInBackground,
    thinking: entry.thinking,
    body: bundle?.systemPrompt ?? renderTypedPrompt(definition),
    agentFile: entry.promptPaths.systemTemplatePath,
    contextModulePath: entry.promptPaths.contextModulePath,
    warnings: options.warnings ?? [],
    group: entry.group,
    renderedPrompt: bundle
      ? {
          content: renderedPromptContent(bundle),
          timestamp: options.generatedAt ?? null,
          resolvedVariables: {},
          toolsAllowlist: entry.tools,
          toolsDisallowlist: entry.disallowedTools,
        }
      : null,
    context: {
      ...viewerContextInputs(entry, bundle),
      modulePath: entry.promptPaths.contextModulePath,
      timestamp: options.generatedAt ?? null,
    },
  };
}

export function assertMeleeKernelCatalogComplete(): void {
  const registered = Object.keys(agentRegistry).sort();
  const catalog = [...KERNEL_AGENT_IDS].sort();
  const missing = registered.filter((id) => !catalog.includes(id as KernelAgentId));
  const extra = catalog.filter((id) => !registered.includes(id));
  if (missing.length || extra.length) {
    throw new Error(
      `Melee kernel agent catalog mismatch: missing=[${missing.join(", ")}] extra=[${extra.join(", ")}]`,
    );
  }
}
