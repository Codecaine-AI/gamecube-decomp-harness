import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decompResourcesRoot, knowledgeManifestPath, knowledgeReferenceResources, resourceMap } from "../../knowledge/index.js";
import type { BoardSnapshot, PiPromptBundle, RunRecord } from "../../types/index.js";
import { readTemplate, renderTemplate, stableJson } from "../runtime/index.js";

export interface DirectorPromptOptions {
  run: RunRecord;
  snapshot: BoardSnapshot;
  event: Record<string, unknown>;
  activeWorkers: number;
  repoRoot: string;
  stateDir: string;
  initialBoardPath: string;
}

function templatePath(name: "system" | "initial_user"): string {
  return fileURLToPath(new URL(`./templates/${name}.md`, import.meta.url));
}

export function directorPrompt(options: DirectorPromptOptions): PiPromptBundle {
  const systemTemplatePath = templatePath("system");
  const userTemplatePath = templatePath("initial_user");
  const selectedKnowledgeReferences = knowledgeReferenceResources("director");
  const filesToRead = [
    {
      path: options.initialBoardPath,
      reason: "initial board snapshot captured at run creation",
    },
    {
      path: options.snapshot.reportPath,
      reason: "current progress report and matched_code_percent telemetry",
    },
    {
      path: options.snapshot.objdiffPath,
      reason: "unit metadata and source path provenance",
    },
    {
      path: resolve(decompResourcesRoot(), "index.md"),
      reason: "resource library entry point for decomp evidence surfaces",
    },
    {
      path: knowledgeManifestPath(),
      reason: "orchestrator-owned agent knowledge manifest and capability routing",
    },
    ...selectedKnowledgeReferences.map((reference) => ({
      path: reference.path,
      reason: `director knowledge reference: ${reference.purpose}`,
    })),
  ];
  const currentState = {
    role: "director",
    run: options.run,
    wake_event: options.event,
    active_workers: options.activeWorkers,
    desired_workers: options.run.desiredWorkers,
    state_dir: options.stateDir,
    board: {
      generated_at: options.snapshot.generatedAt,
      measures: options.snapshot.measures,
      top_candidates: options.snapshot.candidates.slice(0, 12),
    },
    artifact_paths: {
      initial_board: options.initialBoardPath,
      director_cycles_dir: resolve(options.stateDir, "runs", options.run.id, "director_cycles"),
    },
    selected_knowledge_references: selectedKnowledgeReferences,
  };
  const values = {
    CURRENT_STATE_JSON: stableJson(currentState),
    FILES_TO_READ_JSON: stableJson(filesToRead),
    RESOURCES_JSON: stableJson(resourceMap(options.repoRoot, "director")),
  };
  return {
    systemPrompt: renderTemplate(readTemplate(systemTemplatePath), values),
    userPrompt: renderTemplate(readTemplate(userTemplatePath), values),
    systemTemplatePath,
    userTemplatePath,
  };
}
