import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decompResourcesRoot, knowledgeManifestPath, knowledgeReferenceResources, pastPrsRoot, resourceMap } from "../../knowledge/index.js";
import type { PiPromptBundle } from "../../types/index.js";
import { readTemplate, renderTemplate, stableJson } from "../runtime/index.js";
import { enabledCapabilities } from "./packet.js";

export interface WorkerPromptOptions {
  packet: Record<string, unknown>;
  repoRoot: string;
  stateDir: string;
  initialBoardPath: string;
  workerLogDir: string;
}

function templatePath(name: "system" | "initial_user"): string {
  return fileURLToPath(new URL(`./templates/${name}.md`, import.meta.url));
}

export function workerPrompt(options: WorkerPromptOptions): PiPromptBundle {
  const systemTemplatePath = templatePath("system");
  const userTemplatePath = templatePath("initial_user");
  const target = (options.packet.target ?? {}) as Record<string, unknown>;
  const primarySourcePath = String(target.source_path ?? "");
  const primarySourceAbs = primarySourcePath ? resolve(options.repoRoot, primarySourcePath) : "";
  const capabilities = enabledCapabilities(options.packet);
  const selectedKnowledgeReferences = knowledgeReferenceResources("worker", capabilities);
  const filesToRead = [
    {
      path: primarySourceAbs,
      reason: "primary leased source file",
    },
    {
      path: resolve(options.repoRoot, "objdiff.json"),
      reason: "unit metadata, compiler flags, source path, and scratch provenance",
    },
    {
      path: resolve(options.repoRoot, "build/GALE01/report.json"),
      reason: "baseline function/unit metrics",
    },
    {
      path: options.initialBoardPath,
      reason: "run board snapshot used to queue this target",
    },
    {
      path: resolve(decompResourcesRoot(), "index.md"),
      reason: "resource library entry point and trust rules",
    },
    {
      path: resolve(pastPrsRoot(), "prs/index.jsonl"),
      reason: "structured searchable past-PR index",
    },
    {
      path: knowledgeManifestPath(),
      reason: "orchestrator-owned agent knowledge manifest and capability routing",
    },
    ...selectedKnowledgeReferences.map((reference) => ({
      path: reference.path,
      reason: `worker knowledge reference: ${reference.purpose}`,
    })),
  ];
  const currentState = {
    role: "worker",
    state_dir: options.stateDir,
    worker_log_dir: options.workerLogDir,
    selected_knowledge_references: selectedKnowledgeReferences,
    ...options.packet,
  };
  const values = {
    CURRENT_STATE_JSON: stableJson(currentState),
    PRIMARY_SOURCE_PATH: primarySourcePath,
    FILES_TO_READ_JSON: stableJson(filesToRead),
    RESOURCES_JSON: stableJson(resourceMap(options.repoRoot, "worker", capabilities)),
  };
  return {
    systemPrompt: renderTemplate(readTemplate(systemTemplatePath), values),
    userPrompt: renderTemplate(readTemplate(userTemplatePath), values),
    systemTemplatePath,
    userTemplatePath,
  };
}
