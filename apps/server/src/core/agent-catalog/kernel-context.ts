import type { AgentContextResolver, LoadedMap, LoaderDeclaration, SpawnContext } from "@agent-kernel/kernel/context";
import type { PiPromptKernelContextInput } from "@server/core/shared/types/agents.js";

export const ROOT_CONTEXT_LOADER_KIND = "melee-session-context";

export const rootContextLoaderDeclaration = {
  kind: ROOT_CONTEXT_LOADER_KIND,
  label: ROOT_CONTEXT_LOADER_KIND,
} as const satisfies LoaderDeclaration;

export function defaultKernelTurnPrompt(agentName: string): string {
  return [
    `Use the injected ${agentName} context for this run.`,
    "Complete the task described there, follow the system prompt, and return the required output.",
  ].join(" ");
}

export function promptKernelContext(
  renderedContext: string,
  inputs: PiPromptKernelContextInput[],
  turnPrompt?: string,
) {
  return {
    renderedContext,
    inputs,
    ...(turnPrompt ? { turnPrompt } : {}),
  };
}

function safeContextTag(value: string): string {
  return value.replace(/[^a-z0-9_:-]+/gi, "_").replace(/^_+|_+$/g, "") || "context";
}

function loadedInputRef(input: LoadedMap[number]): string {
  const record = input.decl as Record<string, unknown>;
  const ref = record.ref ?? record.label ?? record.id ?? record.name ?? record.path ?? input.decl.kind;
  return String(ref);
}

export function renderLoadedKernelContext(loaded: LoadedMap, _ctx: SpawnContext): string {
  const errors = loaded
    .filter((input) => input.status === "error")
    .map(
      (input) =>
        `${input.decl.kind} (${loadedInputRef(input)}): ${input.error ?? "Unknown error"}`,
    );
  if (errors.length > 0) {
    throw new Error(`Kernel context load failed for required inputs:\n${errors.join("\n")}`);
  }

  const sections: string[] = [];
  for (const input of loaded) {
    const tag = safeContextTag(input.decl.kind);
    const ref = loadedInputRef(input);
    if (input.status === "empty" || !input.content) continue;
    sections.push(`<${tag} ref="${ref}">\n${input.content}\n</${tag}>`);
  }
  return sections.join("\n\n");
}

export function createInlineAgentContextResolver(
  loaders: readonly LoaderDeclaration[],
  fallbackPrompt: string,
): AgentContextResolver {
  return {
    loaders: [...loaders],
    assemble: (loaded, ctx) => renderLoadedKernelContext(loaded, ctx) || fallbackPrompt,
  };
}
