import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineContext } from "@agent-kernel/kernel/agent-definition";
import type { LoaderDeclaration } from "@agent-kernel/kernel/context";
import type { PiPromptBundle, RunGameMetadata } from "@server/core/shared/types";
import { globalStandardsPromptXml } from "@server/core/knowledge";
import { availableToolsPromptXml, type AgentToolRuntimeContext } from "@server/core/tools/index.js";
import { renderTemplate, stableJson, type PromptTemplateValues } from "@server/infrastructure/agent-runtime/runtime";
import {
  createInlineAgentContextResolver,
  rootContextLoaderDeclaration,
} from "@server/core/agent-catalog/kernel-context.js";

const loaders = [
  rootContextLoaderDeclaration,
  { kind: "reconcile-context", ref: "reconcile-context", label: "reconcile-context" },
] as const satisfies readonly LoaderDeclaration[];

export type ReconcileMode = "ship-validate" | "sync-merge";

export interface ReconcilePromptOptions {
  mode: ReconcileMode;
  reconcileContext: unknown;
  game?: RunGameMetadata;
  repoRoot?: string;
  stateDir?: string;
}

export const RECONCILE_TURN_PROMPT = [
  "Use the injected reconcile context packet.",
  "Clear the described gate, validate what you can, and return exactly one JSON object.",
].join(" ");

export const context = defineContext(
  createInlineAgentContextResolver(loaders, RECONCILE_TURN_PROMPT),
);

const RECONCILE_CONTEXT_TEMPLATE = `<task>
    Reconcile this checkout in \`{{RECONCILE_MODE}}\` mode.
    Clear the gate described in the context, then report what changed and what remains.
</task>

{{AVAILABLE_TOOLS_XML}}

{{DECOMP_STANDARDS_XML}}

<reconcile_context>
{{RECONCILE_CONTEXT_JSON}}
</reconcile_context>

<output_contract>
Use this top-level shape:

{{RECONCILE_OUTPUT_SCHEMA_JSON}}
</output_contract>

Return exactly one JSON object.`;

function schemaPath(): string {
  return fileURLToPath(new URL("./schema.json", import.meta.url));
}

function toolContext(options: ReconcilePromptOptions): AgentToolRuntimeContext {
  const repoRoot = options.repoRoot ?? ".";
  return {
    role: "reconcile",
    cwd: repoRoot,
    repoRoot,
    stateDir: options.stateDir,
    game: options.game,
  };
}

export function buildReconcileKernelContext(options: ReconcilePromptOptions): NonNullable<PiPromptBundle["kernelContext"]> {
  const values = {
    AVAILABLE_TOOLS_XML: availableToolsPromptXml(toolContext(options)),
    DECOMP_STANDARDS_XML: globalStandardsPromptXml(),
    RECONCILE_CONTEXT_JSON: stableJson(options.reconcileContext),
    RECONCILE_MODE: options.mode,
    RECONCILE_OUTPUT_SCHEMA_JSON: stableJson(JSON.parse(readFileSync(schemaPath(), "utf8"))),
  } as unknown as PromptTemplateValues;
  const renderedContext = renderTemplate(RECONCILE_CONTEXT_TEMPLATE, values);
  return {
    turnPrompt: RECONCILE_TURN_PROMPT,
    renderedContext,
    inputs: [
      {
        loaderKind: "reconcile-context",
        inputRef: "reconcile-context",
        content: renderedContext,
      },
    ],
  };
}

export default context;
