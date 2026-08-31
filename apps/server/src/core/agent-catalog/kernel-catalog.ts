import { renderXmlMarkdown, type PromptDocument } from "@codecaine-ai/prompt-kit";
import type { AgentContextResolver, LoaderDeclaration } from "@agent-kernel/kernel/context";
import type { ParsedAgent } from "@agent-kernel/kernel/spawn-pipeline";
import type { RuntimeAgentRole, PiPromptBundle } from "@server/core/shared/types";

import { DEFAULT_PI_THINKING_LEVEL } from "@server/infrastructure/agent-runtime/runtime";
import type { HarnessAgentDefinition } from "@server/core/agent-catalog/agent-definition.js";
import { agentRegistry, type RegisteredAgentId } from "@server/core/agent-catalog/registry";
import {
  defaultKernelTurnPrompt,
  renderLoadedKernelContext,
  ROOT_CONTEXT_LOADER_KIND,
  rootContextLoaderDeclaration,
} from "@server/core/agent-catalog/kernel-context.js";
import workerKernelAgent from "@server/core/agent-catalog/agents/running/worker/agent.js";
import integrationResolverKernelAgent from "@server/core/agent-catalog/agents/running/integration-resolver/agent.js";
import librarianKernelAgent from "@server/core/agent-catalog/agents/knowledge/librarian/agent.js";
import workerSummarizerKernelAgent from "@server/core/agent-catalog/agents/knowledge/worker-summarizer/agent.js";

export const KERNEL_AGENT_IDS = [
  "worker",
  "integration-resolver",
  "librarian",
  "worker-summarizer",
] as const satisfies readonly RegisteredAgentId[];

export type KernelAgentId = (typeof KERNEL_AGENT_IDS)[number];

export interface KernelAgentPromptPaths {
  systemTemplatePath: string;
  promptModulePath: string;
  contextModulePath: string;
  toolsModulePath: string | null;
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
  librarian: librarianKernelAgent,
  "worker-summarizer": workerSummarizerKernelAgent,
} as const satisfies Record<KernelAgentId, HarnessAgentDefinition>;

function typedAgentDefinition(id: KernelAgentId): HarnessAgentDefinition {
  return typedAgentDefinitions[id];
}

function isPromptDocument(value: unknown): value is PromptDocument {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "prompt";
}

function renderTypedPrompt(definition: HarnessAgentDefinition): string {
  return isPromptDocument(definition.prompt) ? renderXmlMarkdown(definition.prompt) : definition.prompt;
}

function parsedAgentFromTyped(definition: HarnessAgentDefinition): ParsedAgent {
  return {
    config: {
      name: definition.name,
      description: definition.description,
      model: definition.model,
      tools: definition.coreTools ?? [],
      disallowedTools: definition.disallowedTools ?? [],
      extensions: definition.extensions ?? true,
      variables: definition.variables ?? {},
      maxTurns: definition.maxTurns,
      runInBackground: definition.runInBackground ?? false,
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

function promptPaths(
  systemTemplatePath: string,
  userTemplatePath: string,
  schemaPath: string | null = null,
  hasTools = true,
): KernelAgentPromptPaths {
  const moduleRoot = systemTemplatePath.replace(/\/agent\.ts$/, "");
  return {
    systemTemplatePath,
    promptModulePath: `${moduleRoot}/prompt.ts`,
    contextModulePath: `${moduleRoot}/context.ts`,
    toolsModulePath: hasTools ? `${moduleRoot}/tools.ts` : null,
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

function catalogVariables(variables: ParsedAgent["config"]["variables"]): KernelAgentCatalogEntry["variables"] {
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
  const definition = typedAgentDefinition(id);
  const parsedAgent = parsedAgentFromTyped(definition);
  const config = parsedAgent.config;
  return {
    id,
    name: config.name as KernelAgentId,
    role,
    description: config.description,
    model: config.model,
    toolProfile: role,
    tools: config.tools,
    disallowedTools: config.disallowedTools ?? [],
    extensions: config.extensions ?? true,
    canSpawnSubagent: definition.canSpawnSubagent,
    variables: catalogVariables(config.variables),
    maxTurns: config.maxTurns ?? null,
    runInBackground: config.runInBackground ?? false,
    thinking: config.thinking ?? DEFAULT_PI_THINKING_LEVEL,
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
  catalogEntry("librarian", {
    group: "knowledge",
    phase: "knowledge-curation",
    promptPaths: promptPaths(
      "apps/server/src/core/agent-catalog/agents/knowledge/librarian/agent.ts",
      "apps/server/src/core/agent-catalog/agents/knowledge/librarian/prompt.ts",
      "apps/server/src/core/agent-catalog/agents/knowledge/librarian/schema.json",
    ),
    contextLoaderKinds: [
      ...ROOT_CONTEXT_LOADERS,
      "librarian-context",
      "librarian-curation-context",
      "librarian-pr-index-context",
    ],
    resultContract: resultContract(
      "librarian_v1",
      "apps/server/src/core/agent-catalog/agents/knowledge/librarian/schema.json",
      null,
      "Librarian output is schema-described; learnings and attempt overlays are appended to the knowledge ledger by the harness-owned condense job.",
    ),
  }),
  catalogEntry("worker-summarizer", {
    group: "knowledge",
    phase: "worker-summary",
    promptPaths: promptPaths(
      "apps/server/src/core/agent-catalog/agents/knowledge/worker-summarizer/agent.ts",
      "apps/server/src/core/agent-catalog/agents/knowledge/worker-summarizer/prompt.ts",
      "apps/server/src/core/agent-catalog/agents/knowledge/worker-summarizer/schema.json",
      false,
    ),
    contextLoaderKinds: [...ROOT_CONTEXT_LOADERS, "worker-summarizer-context"],
    resultContract: resultContract(
      null,
      "apps/server/src/core/agent-catalog/agents/knowledge/worker-summarizer/schema.json",
      null,
      "Worker summarizer output contains narrative fields only. A future job mechanically joins scores, sequence numbers, runtime references, final outcome, and baseline.",
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
  return {
    parsed: {
      config: parsedAgent.config,
      body: bundle.systemPrompt,
    },
    userPrompt: contextResolver
      ? bundle.kernelContext?.turnPrompt ?? defaultKernelTurnPrompt(entry.name)
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
