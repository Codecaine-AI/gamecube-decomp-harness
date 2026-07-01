import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context";
import { runMeleeKernelPiAgent as runPiAgent } from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import { knowledgeCuratorPrompt } from "@server/core/agent-catalog/agents/knowledge/curator";
import { prIndexerPrompt } from "@server/core/agent-catalog/agents/knowledge/pr-indexer";
import { parseJsonObject } from "@server/infrastructure/agent-runtime/runtime";
import {
  agentSharedStateEnrichmentPath,
  knowledgeCuratorEnrichmentPath,
  packageRoot,
  resourceGraphDbPath,
  sourceDataRoot,
  sourceRoot,
  toolsRoot,
} from "@server/core/knowledge/paths";
import {
  curateKnowledgeEnrichments,
  appendCuratedKnowledgeRecords,
  curatedPrRecordsForPostmortem,
  defaultGraphSources,
  KNOWLEDGE_CURATOR_SCHEMA_VERSION,
  fileGraphCard,
  graphDbExists,
  graphStats,
  importAgentSharedStateLessons,
  loadKnowledgeBoardSnapshot,
  openKnowledgeGraph,
  readSourceRegistry,
  readSourceRegistryEntries,
  readToolRegistry,
  rebuildKnowledgeGraph,
  searchKnowledgeGraph,
  sourceUpdateProposalRecords,
  type CuratedKnowledgeRecord,
} from "@server/core/knowledge";
import { rankFeatureForSourcePath } from "@server/core/knowledge/graph/rank";
import { shortHash, stringValue, truncate } from "@server/core/knowledge/graph/util";
import { resolveRegisteredTool, type ToolRuntimeContext } from "@server/core/tools/resolver";
import { addPiSession } from "@server/core/session-runtime/run-state";
import { openState } from "@server/core/session-runtime/run-state";
import type { GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import { booleanArg, numberArg, projectMetadata, stringArg } from "@server/core/project-registry/runtime-options.js";

interface SpawnSummary {
  tool?: string;
  command: string[];
  exit_code: number;
  stdout: string;
  stderr: string;
  skipped?: boolean;
  failed?: boolean;
  reason?: string;
  error?: string;
  repo_root?: string;
  fallback_reason?: string;
}

export interface KnowledgeMaintenanceProgressEvent {
  stage: string;
  status: "started" | "finished" | "skipped" | "error";
  tool?: string;
  command?: string[];
  repo_root?: string;
  reason?: string;
  exit_code?: number;
  duration_ms?: number;
  summary?: Record<string, unknown>;
  error?: string;
  created_at: string;
}

export type KnowledgeMaintenanceProgress = (event: KnowledgeMaintenanceProgressEvent) => void | Promise<void>;

export interface KnowledgeMaintenanceOptions {
  progress?: KnowledgeMaintenanceProgress;
}

function summarizeProgressResult(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    return {
      count: value.length,
      tools: value.map((item) => (item && typeof item === "object" ? String((item as Record<string, unknown>).tool ?? "") : "")).filter(Boolean),
      failed: value.filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).failed).length,
      skipped: value.filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).skipped).length,
    };
  }
  const record = value as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const key of ["tool", "exit_code", "skipped", "failed", "reason", "repo_root", "fallback_reason", "output_path", "graph_db"]) {
    if (record[key] !== undefined) summary[key] = record[key];
  }
  if (Array.isArray(record.indexed_sources)) summary.indexed_sources = record.indexed_sources;
  if (Array.isArray(record.skipped_sources)) summary.skipped_sources = record.skipped_sources;
  if (record.stats && typeof record.stats === "object") summary.stats = record.stats;
  return Object.keys(summary).length > 0 ? summary : undefined;
}

async function reportKnowledgeProgress(options: KnowledgeMaintenanceOptions | undefined, event: Omit<KnowledgeMaintenanceProgressEvent, "created_at">): Promise<void> {
  const payload = { ...event, created_at: new Date().toISOString() };
  const detail = [payload.tool ? `tool=${payload.tool}` : "", payload.reason ? `reason=${payload.reason}` : "", payload.exit_code !== undefined ? `exit=${payload.exit_code}` : ""]
    .filter(Boolean)
    .join(" ");
  console.error(`[kg] ${payload.stage} ${payload.status}${detail ? ` (${detail})` : ""}`);
  await options?.progress?.(payload);
}

async function runKnowledgeStep<T>(
  options: KnowledgeMaintenanceOptions | undefined,
  stage: string,
  detail: Omit<KnowledgeMaintenanceProgressEvent, "stage" | "status" | "created_at">,
  work: () => Promise<T> | T,
): Promise<T> {
  const startedAt = Date.now();
  await reportKnowledgeProgress(options, { stage, status: "started", ...detail });
  try {
    const result = await work();
    const status = result && typeof result === "object" && (result as Record<string, unknown>).skipped ? "skipped" : "finished";
    await reportKnowledgeProgress(options, {
      stage,
      status,
      ...detail,
      duration_ms: Date.now() - startedAt,
      summary: summarizeProgressResult(result),
      reason: status === "skipped" ? String((result as Record<string, unknown>).reason ?? detail.reason ?? "") : detail.reason,
      exit_code: typeof (result as Record<string, unknown>)?.exit_code === "number" ? Number((result as Record<string, unknown>).exit_code) : detail.exit_code,
    });
    return result;
  } catch (error) {
    await reportKnowledgeProgress(options, {
      stage,
      status: "error",
      ...detail,
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function configureKernelDatabaseFromArgs(args: Map<string, string | true>): void {
  const kernelDatabaseUrl = stringArg(args, "--orchestrator-kernel-database-url", "");
  if (!kernelDatabaseUrl) return;
  process.env.ORCH_AGENT_KERNEL_DATABASE_URL = kernelDatabaseUrl;
  process.env.ORCH_AGENT_KERNEL_REQUIRED ||= "1";
}

export async function kgSources(): Promise<void> {
  console.log(
    JSON.stringify(
      {
        sources: readSourceRegistry(),
        source_registry: readSourceRegistryEntries(),
        tools: readToolRegistry(),
      },
      null,
      2,
    ),
  );
}

export async function kgStatus(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const dbPath = stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath());
  const exists = graphDbExists(dbPath);
  const payload: Record<string, unknown> = {
    project: globals.project
      ? {
          id: globals.project.projectId,
          display_name: globals.project.displayName,
          kind: globals.project.kind,
          repo_root: globals.project.repoRoot,
          state_dir: globals.project.stateDir,
        }
      : null,
    graph_db: dbPath,
    graph_db_exists: exists,
    sources: readSourceRegistry().map((source) => ({
      id: source.id,
      kind: source.kind,
      section: source.section,
      access_modes: source.access_modes ?? [],
      title: source.title,
    })),
    tools: readToolRegistry().map((tool) => ({ id: tool.id, title: tool.title, category: tool.category, path: tool.path })),
  };
  if (exists) {
    const store = openKnowledgeGraph(dbPath);
    try {
      payload.stats = graphStats(store);
    } finally {
      store.db.close();
    }
  }
  console.log(JSON.stringify(payload, null, 2));
}

export async function kgSmoke(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const dbPath = await ensureGraphReady(globals, args);
  const store = openKnowledgeGraph(dbPath);
  const sources = readSourceRegistry().map((source) => {
    const versionCount = countRows(store, "SELECT COUNT(*) AS count FROM resource_versions WHERE source_id = ?", source.id);
    const chunkCount = countRows(store, "SELECT COUNT(*) AS count FROM search_chunks WHERE source_id = ?", source.id);
    return {
      id: source.id,
      title: source.title,
      section: source.section,
      access_modes: source.access_modes ?? [],
      versions: versionCount,
      search_chunks: chunkCount,
      ready: versionCount > 0 && chunkCount > 0,
    };
  });
  store.db.close();
  const toolContext = knowledgeToolContext(globals);
  const tools = (await Promise.all(readToolRegistry().map((tool) => toolStatus(tool, toolContext)))).map((tool) => ({ ...tool, ready: toolLiveReady(tool) }));
  const payload = {
    graph_db: dbPath,
    generated_at: new Date().toISOString(),
    sources,
    tools,
    ready: sources.every((source) => source.ready) && tools.every((tool) => tool.ready),
  };
  if (booleanArg(args, "--strict") && !payload.ready) {
    throw new Error(`Knowledge smoke failed:\n${JSON.stringify(payload, null, 2)}`);
  }
  console.log(JSON.stringify(payload, null, 2));
}

function toolLiveReady(tool: Record<string, unknown>): boolean {
  const mode = String(tool.operation_mode ?? tool.status ?? "");
  if (mode === "tool_local_impl") return toolLocalImplReady(tool);
  if (mode === "native_api_v1") return String(tool.status) === "ok";
  const incompleteMode =
    mode.includes("fallback") || mode.includes("index_backed") || mode.includes("scaffold") || mode.includes("dependency");
  return Boolean(tool.available) && Boolean(tool.runner_available) && Boolean(tool.runner_smoke_passed) && !incompleteMode;
}

function toolLocalImplReady(tool: Record<string, unknown>): boolean {
  return (
    String(tool.status) === "ok" &&
    Boolean(tool.repo_root_exists) &&
    Boolean(tool.looks_like_project_repo) &&
    Boolean(tool.tool_impl_root_exists) &&
    pathStatusListReady(tool.scripts) &&
    pathStatusListReady(tool.required_paths) &&
    (tool.libclang_available === undefined || Boolean(tool.libclang_available))
  );
}

function pathStatusListReady(value: unknown): boolean {
  if (!Array.isArray(value)) return true;
  return value.every((item) => Boolean((item as Record<string, unknown>).exists));
}

export async function kgRebuildGraph(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const dbPath = stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath());
  const sources = sourceListArg(args);
  const enrichmentPath = stringArg(args, "--agent-state-enrichment", agentSharedStateEnrichmentPath());
  const curatorPath = stringArg(args, "--knowledge-curator-enrichment", knowledgeCuratorEnrichmentPath());
  const repoRoot = knowledgeRepoRoot(globals);
  const payload = rebuildKnowledgeGraph({
    repoRoot,
    dbPath,
    sources,
    agentStateEnrichmentPath: enrichmentPath,
    knowledgeCuratorEnrichmentPath: curatorPath,
  });
  console.log(JSON.stringify(payload, null, 2));
}

export async function kgImportAgentState(args: Map<string, string | true>): Promise<void> {
  const inputPath = stringArg(args, "--input", "agent_state-shared.db");
  const outputPath = stringArg(args, "--output", agentSharedStateEnrichmentPath());
  const payload = importAgentSharedStateLessons({ inputPath, outputPath });
  console.log(JSON.stringify(payload, null, 2));
}

export async function kgCurate(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const repoRoot = knowledgeRepoRoot(globals);
  const payload = curateKnowledgeEnrichments({
    repoRoot,
    stateDir: globals.stateDir,
    outputPath: stringArg(args, "--output", knowledgeCuratorEnrichmentPath()),
    runId: stringArg(args, "--run-id", ""),
    workerLimit: numberArg(args, "--worker-limit", 250),
    prLimit: positiveLimitArg(args, "--pr-limit", 500),
    includeStalled: !booleanArg(args, "--progress-only"),
  });
  const agentReview = await maybeRunCuratorAgent(globals, args, payload.output_path);
  console.log(JSON.stringify({ ...payload, agent_review: agentReview }, null, 2));
}

export async function runKnowledgeMaintenance(globals: GlobalArgs, args: Map<string, string | true>, options: KnowledgeMaintenanceOptions = {}): Promise<Record<string, unknown>> {
  const repoRoot = knowledgeRepoRoot(globals);
  await reportKnowledgeProgress(options, { stage: "knowledge_maintenance", status: "started", repo_root: repoRoot });
  const startedAt = Date.now();
  try {
  const prIndex = await runKnowledgeStep(options, "pr_index", { repo_root: repoRoot }, () =>
    booleanArg(args, "--no-pr-index") ? skipSummary("pr_index", "--no-pr-index") : runPrPostmortemIndex(globals, args),
  );
  const toolContext = knowledgeToolContext(globals);
  const toolRunners = await runKnowledgeStep(options, "tool_runners", { repo_root: toolContext.repoRoot }, () =>
    booleanArg(args, "--no-tool-runners") ? [skipSummary("tool_runners", "--no-tool-runners")] : runToolRunners(toolContext, options),
  );
  const toolIndexes = await runKnowledgeStep(options, "tool_indexes", { repo_root: toolContext.repoRoot }, () =>
    booleanArg(args, "--no-tool-index") ? skipSummary("tool_indexes", "--no-tool-index") : runToolIndexes(toolContext, options),
  );
  const curator = await runKnowledgeStep(options, "curator_enrichment", { repo_root: repoRoot }, () =>
    curateKnowledgeEnrichments({
      repoRoot,
      stateDir: globals.stateDir,
      outputPath: stringArg(args, "--knowledge-curator-enrichment", knowledgeCuratorEnrichmentPath()),
      runId: stringArg(args, "--run-id", ""),
      workerLimit: numberArg(args, "--worker-limit", 250),
      prLimit: positiveLimitArg(args, "--pr-limit", 500),
      includeStalled: !booleanArg(args, "--progress-only"),
    }),
  );
  const agentReview = await runKnowledgeStep(options, "curator_agent_review", { repo_root: repoRoot }, () => maybeRunCuratorAgent(globals, args, curator.output_path));
  const dataSheetFacts = await runKnowledgeStep(options, "data_sheet_facts", { repo_root: repoRoot }, () =>
    booleanArg(args, "--no-data-sheet-facts") ? skipSummary("data_sheet_facts", "--no-data-sheet-facts") : runDataSheetFacts(repoRoot),
  );
  const rebuild = await runKnowledgeStep(options, "rebuild_graph", { repo_root: repoRoot, command: ["rebuildKnowledgeGraph"] }, () =>
    booleanArg(args, "--no-rebuild")
      ? { skipped: true, reason: "--no-rebuild" }
      : rebuildKnowledgeGraph({
        repoRoot,
        dbPath: stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath()),
        sources: sourceListArg(args),
        agentStateEnrichmentPath: stringArg(args, "--agent-state-enrichment", agentSharedStateEnrichmentPath()),
        knowledgeCuratorEnrichmentPath: stringArg(args, "--knowledge-curator-enrichment", knowledgeCuratorEnrichmentPath()),
      }),
  );
  const result = {
    generated_at: new Date().toISOString(),
    pr_index: prIndex,
    tool_runners: toolRunners,
    tool_indexes: toolIndexes,
    data_sheet_facts: dataSheetFacts,
    curator,
    agent_review: agentReview,
    rebuild,
  };
  await reportKnowledgeProgress(options, {
    stage: "knowledge_maintenance",
    status: "finished",
    repo_root: repoRoot,
    duration_ms: Date.now() - startedAt,
    summary: summarizeProgressResult(rebuild),
  });
  return result;
  } catch (error) {
    await reportKnowledgeProgress(options, {
      stage: "knowledge_maintenance",
      status: "error",
      repo_root: repoRoot,
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function runDataSheetFacts(repoRoot: string): Promise<SpawnSummary> {
  const script = resolve(sourceRoot("ssbm_data_sheet"), "commands/build_codebase_facts.py");
  const command = ["python3", script, "--repo-root", repoRoot, "--json"];
  const proc = Bun.spawn(command, {
    cwd: packageRoot(),
    env: Bun.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) throw new Error(`Data-sheet fact build failed (${exitCode}): ${command.join(" ")}\n${stderr || stdout}`);
  return { command, exit_code: exitCode, stdout, stderr };
}

async function runToolRunners(context: ToolRuntimeContext, options: KnowledgeMaintenanceOptions = {}): Promise<SpawnSummary[]> {
  const runners = [
    ["ghidra", "run_headless_probe.py"],
    ["opseq", "extract_opcode_sequences.py"],
    ["mismatch_db", "analyze_objdiff_mismatches.py"],
    ["mwcc_debug", "probe_mwcc_compiler.py"],
  ] as const;
  return Promise.all(
    runners.map(async ([toolId, scriptName]) => {
      const resolved = resolveRegisteredTool(context, toolId);
      const repo = toolRunnerRepoRoot(context, toolId);
      const repoRoot = repo.repoRoot;
      const command = ["python3", resolve(resolved.toolRoot, "runners", scriptName), "--repo-root", repoRoot];
      return runKnowledgeStep(options, "tool_runner", { tool: toolId, command, repo_root: repoRoot, reason: repo.fallbackReason }, async () => {
      const proc = Bun.spawn(command, {
        cwd: packageRoot(),
        env: { ...Bun.env, ...resolved.env },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      const summary: SpawnSummary = {
        tool: toolId,
        command,
        exit_code: exitCode,
        stdout,
        stderr,
        repo_root: repoRoot,
        fallback_reason: repo.fallbackReason,
      };
      if (exitCode !== 0) {
        const error = stderr || stdout || `command exited ${exitCode}`;
        if (toolBlocksOnFailure(toolId)) throw new Error(`Tool runner failed for ${toolId} (${exitCode}): ${command.join(" ")}\n${error}`);
        return { ...summary, failed: true, reason: "non_blocking_tool_runner_failed", error };
      }
      return summary;
      });
    }),
  );
}

function toolRunnerRepoRoot(context: ToolRuntimeContext, toolId: string): { repoRoot: string; fallbackReason?: string } {
  const requested = context.repoRoot ?? context.project?.repoRoot ?? "";
  if (toolId !== "opseq") return { repoRoot: requested };
  const candidates = [requested, context.project?.repoRoot ?? ""].filter((value, index, values) => value && values.indexOf(value) === index);
  const withAsm = candidates.find(hasOpseqBuildArtifacts);
  if (withAsm && withAsm !== requested) {
    return {
      repoRoot: withAsm,
      fallbackReason: "requested_repo_root_missing_build_GALE01_asm",
    };
  }
  return { repoRoot: requested };
}

function hasOpseqBuildArtifacts(repoRoot: string): boolean {
  return Boolean(repoRoot) && existsSync(resolve(repoRoot, "build/GALE01/asm")) && existsSync(resolve(repoRoot, "build/GALE01/report.json"));
}

function toolBlocksOnFailure(toolId: string): boolean {
  const tool = readToolRegistry().find((entry) => entry.id === toolId) as ({ blocks_on_failure?: unknown; blocksOnFailure?: unknown } & Record<string, unknown>) | undefined;
  return tool?.blocks_on_failure === true || tool?.blocksOnFailure === true;
}

async function runToolIndexes(context: ToolRuntimeContext, options: KnowledgeMaintenanceOptions = {}): Promise<SpawnSummary> {
  const repoRoot = context.repoRoot ?? "";
  const resolved = resolveRegisteredTool(context, "ghidra");
  const script = resolve(toolsRoot(), "build_tool_indexes.py");
  const command = ["python3", script, "--repo-root", repoRoot];
  return runKnowledgeStep(options, "tool_index_build", { command, repo_root: repoRoot }, async () => {
  const proc = Bun.spawn(command, {
    cwd: packageRoot(),
    env: { ...Bun.env, ...resolved.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) throw new Error(`Tool index build failed (${exitCode}): ${command.join(" ")}\n${stderr || stdout}`);
  return { command, exit_code: exitCode, stdout, stderr };
  });
}

export async function kgMaintain(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runKnowledgeMaintenance(globals, args), null, 2));
}

export async function kgPrIndexerAgent(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  configureKernelDatabaseFromArgs(args);
  const contextPath = stringArg(args, "--context-object", stringArg(args, "--input", ""));
  if (!contextPath) throw new Error("kg-pr-indexer-agent requires --context-object <path>");
  const rawOutputPath = stringArg(args, "--raw-output", stringArg(args, "--output", ""));
  if (!rawOutputPath) throw new Error("kg-pr-indexer-agent requires --raw-output <path>");

  const context = JSON.parse(readFileSync(contextPath, "utf8")) as Record<string, unknown>;
  const prNumber = stringArg(args, "--pr", String((context.pr as { number?: unknown } | undefined)?.number ?? ""));
  const runId = stringArg(args, "--run-id", stringArg(args, "--session-id", prNumber ? `pr-postmortem-${prNumber}` : "pr-postmortem"));
  const itemId = stringArg(args, "--item-id", prNumber ? `pr-${prNumber}` : "postmortem");
  const epochId = stringArg(args, "--epoch-id", "knowledge");
  const prepareIntake = booleanArg(args, "--prepare-intake");
  const kernelProjectId = stringArg(args, "--kernel-project-id", globals.project?.projectId ?? globals.projectId ?? "");
  const outputDir = stringArg(args, "--agent-output-dir", resolve(globals.stateDir, "pr_postmortems", runId));
  const prompt = prIndexerPrompt({
    prContext: context,
    repoRoot: globals.repoRoot,
    stateDir: globals.stateDir,
    project: projectMetadata(globals),
  });

  const systemPromptOutput = stringArg(args, "--system-prompt-output", "");
  const userPromptOutput = stringArg(args, "--user-prompt-output", "");
  if (systemPromptOutput) {
    await mkdir(dirname(systemPromptOutput), { recursive: true });
    await writeFile(systemPromptOutput, `${prompt.systemPrompt}\n`);
  }
  if (userPromptOutput) {
    await mkdir(dirname(userPromptOutput), { recursive: true });
    await writeFile(userPromptOutput, `${prompt.userPrompt}\n`);
  }

  await mkdir(outputDir, { recursive: true });
  const result = await runPiAgent({
    role: "pr-indexer",
    cwd: globals.repoRoot,
    prompt,
    outputDir,
    dryRun: globals.dryRunAgents,
    provider: globals.provider,
    model: globals.model,
    thinkingLevel: globals.thinkingLevel,
    timeoutMs: globals.agentTimeoutSeconds ? globals.agentTimeoutSeconds * 1000 : undefined,
    toolContext: {
      repoRoot: globals.repoRoot,
      stateDir: globals.stateDir,
      project: globals.project,
    },
    kernelSpawnStrategy: globals.dryRunAgents ? "auto" : "kernel",
    kernelContext: createMeleeKernelSpawnContext({
      kind: prepareIntake ? "intake-postmortem" : "postmortem",
      projectId: kernelProjectId || undefined,
      sessionId: runId,
      runId,
      epochId,
      itemId,
      prId: prNumber || undefined,
      targetId: prNumber ? `pr-${prNumber}` : itemId,
      phase: "postmortem",
      workingDir: globals.repoRoot,
      metadata: {
        prNumber: prNumber || null,
        prepareIntake,
        contextObjectPath: contextPath,
        rawOutputPath,
        stateDir: globals.stateDir,
        appSessionDir: globals.stateDir,
      },
    }),
  });

  await mkdir(dirname(rawOutputPath), { recursive: true });
  await writeFile(rawOutputPath, result.rawText);
  recordPrIndexerSession(globals, runId, result);

  const summary = {
    role: "pr-indexer",
    pr: prNumber || null,
    runId,
    itemId,
    outputPath: result.outputPath,
    rawOutputPath,
    sessionId: result.sessionId ?? null,
    sessionFile: result.sessionFile ?? null,
    failed: Boolean(result.failed),
    providerError: result.providerError ?? null,
    dryRun: Boolean(result.dryRun),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (result.failed || result.providerError) {
    throw new Error(`pr-indexer agent failed: ${result.error ?? result.providerError ?? "unknown failure"}`);
  }
}

export async function kgKnowledgeIntakeAgent(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  configureKernelDatabaseFromArgs(args);
  const postmortemPath = stringArg(args, "--postmortem", stringArg(args, "--input", ""));
  if (!postmortemPath) throw new Error("kg-knowledge-intake-agent requires --postmortem <path>");
  const postmortem = JSON.parse(readFileSync(postmortemPath, "utf8")) as Record<string, unknown>;
  const pr = postmortem.pr && typeof postmortem.pr === "object" && !Array.isArray(postmortem.pr) ? (postmortem.pr as Record<string, unknown>) : {};
  const prNumber = stringArg(args, "--pr", String(pr.number ?? ""));
  const runId = stringArg(args, "--run-id", stringArg(args, "--session-id", prNumber ? `pr-knowledge-intake-${prNumber}` : "pr-knowledge-intake"));
  const itemId = stringArg(args, "--item-id", prNumber ? `pr-${prNumber}` : "knowledge-intake");
  const kernelProjectId = stringArg(args, "--kernel-project-id", globals.project?.projectId ?? globals.projectId ?? "");
  const enrichmentPath = stringArg(args, "--knowledge-curator-enrichment", stringArg(args, "--output", knowledgeCuratorEnrichmentPath()));
  const deterministicRecords = curatedPrRecordsForPostmortem(postmortemPath);
  const deterministicSourceProposals = sourceUpdateProposalRecords(deterministicRecords);
  const deterministicAppend = appendCuratedKnowledgeRecords(enrichmentPath, [...deterministicRecords, ...deterministicSourceProposals]);
  const outputDir = stringArg(args, "--agent-output-dir", resolve(globals.stateDir, "knowledge_intake", runId, prNumber ? `pr-${prNumber}` : "manual"));
  const prompt = knowledgeCuratorPrompt({
    repoRoot: globals.repoRoot,
    stateDir: globals.stateDir,
    project: globals.project,
    curatorContext: {
      mode: "prepare_pr_knowledge_intake",
      enrichment_path: enrichmentPath,
      postmortem_path: postmortemPath,
      pr: prNumber || null,
      deterministic_records: deterministicRecords,
      deterministic_source_update_proposals: deterministicSourceProposals,
      curator_handoff: postmortem.curator_handoff ?? null,
    },
  });

  const result = await runPiAgent({
    role: "knowledge-curator",
    cwd: globals.repoRoot,
    prompt,
    outputDir,
    dryRun: globals.dryRunAgents,
    provider: globals.provider,
    model: globals.model,
    thinkingLevel: globals.thinkingLevel,
    timeoutMs: globals.agentTimeoutSeconds ? globals.agentTimeoutSeconds * 1000 : undefined,
    toolContext: {
      repoRoot: globals.repoRoot,
      stateDir: globals.stateDir,
      project: globals.project,
    },
    kernelSpawnStrategy: globals.dryRunAgents ? "auto" : "kernel",
    kernelContext: createMeleeKernelSpawnContext({
      kind: "intake-knowledge",
      projectId: kernelProjectId || undefined,
      sessionId: runId,
      runId,
      itemId,
      prId: prNumber || undefined,
      targetId: prNumber ? `pr-${prNumber}` : itemId,
      phase: "knowledge-intake",
      workingDir: globals.repoRoot,
      metadata: {
        prNumber: prNumber || null,
        postmortemPath,
        enrichmentPath,
        deterministicRecords: deterministicRecords.length,
        deterministicSourceProposals: deterministicSourceProposals.length,
        stateDir: globals.stateDir,
        appSessionDir: globals.stateDir,
      },
    }),
  });

  recordCuratorSession(globals, new Map(args).set("--run-id", runId), result);
  const parsed =
    result.dryRun || result.failed ? { object: null, error: result.error ?? (result.dryRun ? "dry-run" : "agent failed") } : parseJsonObject(result.rawText);
  const proposalRecords = parsed.object ? curatorAgentProposalRecords(parsed.object, result.outputPath) : [];
  const proposalAppend = proposalRecords.length > 0 ? appendCuratedKnowledgeRecords(enrichmentPath, proposalRecords) : null;
  const summary = {
    role: "knowledge-curator",
    pr: prNumber || null,
    runId,
    itemId,
    outputPath: result.outputPath,
    sessionId: result.sessionId ?? null,
    sessionFile: result.sessionFile ?? null,
    failed: Boolean(result.failed),
    providerError: result.providerError ?? null,
    dryRun: Boolean(result.dryRun),
    parseError: parsed.error ?? null,
    deterministicAppend,
    appendedAgentProposalRecords: proposalRecords.length,
    proposalAppend,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (result.failed || result.providerError) {
    throw new Error(`knowledge-curator agent failed: ${result.error ?? result.providerError ?? "unknown failure"}`);
  }
}

export async function kgSearch(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const dbPath = await ensureGraphReady(globals, args);
  const query = stringArg(args, "--query", "");
  if (!query) throw new Error("kg-search requires --query");
  const sourceId = stringArg(args, "--source", stringArg(args, "--resource", ""));
  const limit = numberArg(args, "--limit", 10);
  const store = openKnowledgeGraph(dbPath);
  try {
    const results = searchKnowledgeGraph(store, {
      query,
      sourceId: sourceId || undefined,
      limit,
    });
    console.log(JSON.stringify({ graph_db: dbPath, query, source: sourceId || null, results }, null, 2));
  } finally {
    store.db.close();
  }
}

export async function kgFileCard(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const dbPath = await ensureGraphReady(globals, args);
  const sourcePath = stringArg(args, "--source", "");
  if (!sourcePath) throw new Error("kg-file-card requires --source <source_path>");
  const store = openKnowledgeGraph(dbPath);
  try {
    console.log(JSON.stringify(fileGraphCard(store, sourcePath), null, 2));
  } finally {
    store.db.close();
  }
}

export async function kgRankFeatures(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const dbPath = await ensureGraphReady(globals, args);
  const limit = numberArg(args, "--limit", 50);
  const candidateLimit = numberArg(args, "--candidate-limit", limit);
  const snapshot = loadKnowledgeBoardSnapshot(knowledgeRepoRoot(globals), candidateLimit, { graphDbPath: dbPath });
  const store = openKnowledgeGraph(dbPath);
  try {
    const features = snapshot.candidates.slice(0, limit).map((candidate) => {
      const graph = rankFeatureForSourcePath(store, candidate.sourcePath, {
        source_path: candidate.sourcePath,
        unit: candidate.unit,
        symbol: candidate.symbol,
      });
      return {
        candidate,
        graph,
        combined_priority: candidate.priority,
      };
    });
    console.log(JSON.stringify({ graph_db: dbPath, generated_at: new Date().toISOString(), features }, null, 2));
  } finally {
    store.db.close();
  }
}

async function ensureGraphReady(globals: GlobalArgs, args: Map<string, string | true>): Promise<string> {
  const dbPath = stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath());
  const shouldRebuild = booleanArg(args, "--rebuild") || !graphDbExists(dbPath);
  const enrichmentPath = stringArg(args, "--agent-state-enrichment", agentSharedStateEnrichmentPath());
  const curatorPath = stringArg(args, "--knowledge-curator-enrichment", knowledgeCuratorEnrichmentPath());
  if (shouldRebuild) {
    rebuildKnowledgeGraph({
      repoRoot: knowledgeRepoRoot(globals),
      dbPath,
      sources: defaultGraphSources(),
      agentStateEnrichmentPath: enrichmentPath,
      knowledgeCuratorEnrichmentPath: curatorPath,
    });
  }
  return dbPath;
}

function knowledgeRepoRoot(globals: GlobalArgs): string {
  return globals.repoRoot;
}

function knowledgeToolContext(globals: GlobalArgs): ToolRuntimeContext {
  return {
    project: globals.project,
    repoRoot: globals.repoRoot,
    stateDir: globals.stateDir,
  };
}

async function runPrPostmortemIndex(globals: GlobalArgs, args: Map<string, string | true>): Promise<SpawnSummary> {
  const script = resolve(sourceRoot("past_prs"), "commands/build_pr_postmortems.py");
  const dumpRoot = stringArg(args, "--dump-root", sourceDataRoot("past_prs"));
  const libraryRoot = stringArg(args, "--library-root", resolve(sourceDataRoot("past_prs"), "library"));
  if (!existsSync(resolve(dumpRoot, "prs.json"))) {
    return {
      command: ["python3", script],
      exit_code: 0,
      stdout: "",
      stderr: "",
      skipped: true,
      reason: `missing PR dump index at ${resolve(dumpRoot, "prs.json")}`,
    };
  }
  const command = [
    "python3",
    script,
    "--dump-root",
    dumpRoot,
    "--library-root",
    libraryRoot,
    "--pending-only",
    "--complete-only",
    "--jobs",
    String(Math.max(1, Math.floor(numberArg(args, "--pr-jobs", 16)))),
    "--provider",
    globals.provider,
    "--model",
    globals.model,
    "--thinking",
    globals.thinkingLevel,
    "--orchestrator-state-dir",
    globals.stateDir,
  ];
  const runId = stringArg(args, "--run-id", "");
  if (runId) command.push("--orchestrator-run-id", runId);
  const projectId = globals.project?.projectId ?? globals.projectId;
  if (projectId) command.push("--orchestrator-project-id", projectId);
  const kernelDatabaseUrl = Bun.env.ORCH_AGENT_KERNEL_DATABASE_URL ?? Bun.env.AGENT_KERNEL_DATABASE_URL;
  if (kernelDatabaseUrl) command.push("--orchestrator-kernel-database-url", kernelDatabaseUrl);
  const prIndexerServerJobEntry = Bun.env.ORCH_PR_INDEXER_SERVER_JOB_ENTRY;
  if (prIndexerServerJobEntry) command.push("--orchestrator-server-job-entry", prIndexerServerJobEntry);
  if (globals.agentTimeoutSeconds && globals.agentTimeoutSeconds > 0) {
    command.push("--agent-timeout-seconds", String(Math.trunc(globals.agentTimeoutSeconds)));
  }
  const prLimit = Math.floor(numberArg(args, "--pr-limit", 0));
  if (prLimit > 0) command.push("--limit", String(prLimit));
  if (booleanArg(args, "--run-pr-agent")) command.push("--run-agent");
  if (booleanArg(args, "--rerun-existing-prs")) command.push("--rerun-existing");
  const proc = Bun.spawn(command, {
    cwd: packageRoot(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) throw new Error(`PR postmortem index failed (${exitCode}): ${command.join(" ")}\n${stderr || stdout}`);
  return { command, exit_code: exitCode, stdout, stderr };
}

function skipSummary(commandName: string, reason: string): SpawnSummary {
  return { command: [commandName], exit_code: 0, stdout: "", stderr: "", skipped: true, reason };
}

async function maybeRunCuratorAgent(globals: GlobalArgs, args: Map<string, string | true>, enrichmentPath: string): Promise<Record<string, unknown>> {
  if (!booleanArg(args, "--run-curator-agent")) return { skipped: true, reason: "no --run-curator-agent" };
  const recordLimit = Math.max(1, Math.floor(numberArg(args, "--curator-agent-record-limit", 40)));
  const batchSize = Math.max(1, Math.floor(numberArg(args, "--curator-agent-batch-size", recordLimit)));
  const jobs = Math.max(1, Math.floor(numberArg(args, "--curator-agent-jobs", 16)));
  const records = readJsonlRecords(enrichmentPath, recordLimit);
  const batches = chunkRecords(records, batchSize);
  const outputDir = resolve(globals.stateDir, "knowledge_curator", new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(outputDir, { recursive: true });
  const deterministicRecordCount = countJsonlRecords(enrichmentPath);
  const runId = stringArg(args, "--run-id", "");
  const reviewed = await mapLimit(batches, Math.min(jobs, batches.length || 1), async (batch, index) => {
    const result = await runPiAgent({
      role: "knowledge-curator",
      cwd: globals.repoRoot,
      prompt: knowledgeCuratorPrompt({
        repoRoot: globals.repoRoot,
        stateDir: globals.stateDir,
        project: globals.project,
        curatorContext: {
          enrichment_path: enrichmentPath,
          deterministic_record_count: deterministicRecordCount,
          batch_index: index + 1,
          batch_count: batches.length,
          sampled_records: batch,
        },
      }),
      outputDir,
      dryRun: globals.dryRunAgents,
      provider: globals.provider,
      model: globals.model,
      thinkingLevel: globals.thinkingLevel,
      timeoutMs: globals.agentTimeoutSeconds ? globals.agentTimeoutSeconds * 1000 : undefined,
      toolContext: {
        repoRoot: globals.repoRoot,
        stateDir: globals.stateDir,
        project: globals.project,
      },
      kernelContext: createMeleeKernelSpawnContext({
        kind: "knowledge-curation",
        projectId: globals.project?.projectId ?? globals.projectId,
        sessionId: runId || "knowledge-curation",
        runId: runId || "knowledge-curation",
        phase: "knowledge-curation",
        workingDir: globals.repoRoot,
        metadata: {
          enrichmentPath,
          deterministicRecordCount,
          batchIndex: index + 1,
          batchCount: batches.length,
          sampledRecords: batch.length,
        },
      }),
    });
    const parsed =
      result.dryRun || result.failed ? { object: null, error: result.error ?? (result.dryRun ? "dry-run" : "agent failed") } : parseJsonObject(result.rawText);
    recordCuratorSession(globals, args, result);
    return {
      batch_index: index + 1,
      sampled_records: batch.length,
      result,
      parsed,
      proposals: parsed.object ? curatorAgentProposalRecords(parsed.object, result.outputPath) : [],
    };
  });
  const proposalRecords = reviewed.flatMap((item) => item.proposals).sort((left, right) => stringValue(left.id).localeCompare(stringValue(right.id)));
  if (proposalRecords.length > 0) appendCuratedKnowledgeRecords(enrichmentPath, proposalRecords);
  return {
    skipped: false,
    output_dir: outputDir,
    record_limit: recordLimit,
    batch_size: batchSize,
    jobs,
    batch_count: batches.length,
    failed_batches: reviewed.filter((item) => item.result.failed).length,
    parse_errors: reviewed.filter((item) => item.parsed.error).map((item) => ({ batch_index: item.batch_index, error: item.parsed.error })),
    outputs: reviewed.map((item) => ({
      batch_index: item.batch_index,
      sampled_records: item.sampled_records,
      output_path: item.result.outputPath,
      system_prompt_path: item.result.systemPromptPath,
      user_prompt_path: item.result.userPromptPath,
      failed: item.result.failed ?? false,
      parse_error: item.parsed.error ?? null,
      proposed_source_updates: item.proposals.length,
    })),
    appended_source_update_proposals: proposalRecords.length,
  };
}

function curatorAgentProposalRecords(output: Record<string, unknown>, evidenceRef: string): CuratedKnowledgeRecord[] {
  const proposals = Array.isArray(output.source_update_proposals) ? output.source_update_proposals : [];
  return proposals
    .filter((proposal): proposal is Record<string, unknown> => Boolean(proposal) && typeof proposal === "object" && !Array.isArray(proposal))
    .map((proposal, index) => {
      const targetSourceId = stringValue(proposal.target_source_id, stringValue(proposal.source_id, "unknown_source"));
      const title = stringValue(proposal.title, `Curator agent proposal for ${targetSourceId}`);
      const text = truncate(stringValue(proposal.text, stringValue(proposal.reason, JSON.stringify(proposal))), 2000);
      return {
        schema_version: KNOWLEDGE_CURATOR_SCHEMA_VERSION,
        id: `source_update_proposal:curator_agent:${shortHash(`${evidenceRef}:${index}:${JSON.stringify(proposal)}`)}`,
        kind: "source_update_proposal",
        status: "proposal",
        trust_tier: "local",
        confidence: 0.4,
        source_path: stringValue(proposal.source_path) || undefined,
        unit: stringValue(proposal.unit) || undefined,
        symbol: stringValue(proposal.symbol) || undefined,
        title,
        text,
        evidence_ref: stringValue(proposal.evidence_ref, evidenceRef),
        created_at: new Date().toISOString(),
        payload: {
          ...proposal,
          target_source_id: targetSourceId,
          mutation_policy: "proposal_only",
          curator_agent_output: evidenceRef,
        },
      } satisfies CuratedKnowledgeRecord;
    });
}

function recordCuratorSession(globals: GlobalArgs, args: Map<string, string | true>, result: Awaited<ReturnType<typeof runPiAgent>>): void {
  const runId = stringArg(args, "--run-id", "");
  if (!runId) return;
  const store = openState(globals.stateDir);
  try {
    addPiSession({
      store,
      runId,
      role: "knowledge-curator",
      sessionId: result.sessionId,
      sessionFile: result.sessionFile,
      provider: globals.provider,
      model: globals.model,
      thinkingLevel: globals.thinkingLevel,
      status: result.failed ? "failed" : result.dryRun ? "dry_run" : "succeeded",
      outputPath: result.outputPath,
    });
  } finally {
    store.db.close();
  }
}

function recordPrIndexerSession(globals: GlobalArgs, runId: string, result: Awaited<ReturnType<typeof runPiAgent>>): void {
  if (!runId) return;
  const store = openState(globals.stateDir);
  try {
    addPiSession({
      store,
      runId,
      role: "pr-indexer",
      sessionId: result.sessionId,
      sessionFile: result.sessionFile,
      provider: globals.provider,
      model: globals.model,
      thinkingLevel: globals.thinkingLevel,
      status: result.failed || result.providerError ? "failed" : result.dryRun ? "dry_run" : "succeeded",
      outputPath: result.outputPath,
    });
  } finally {
    store.db.close();
  }
}

function readJsonlRecords(path: string, limit: number): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      // Ignore malformed rows in the sample; graph ingestion will surface bad rows separately.
    }
    if (rows.length >= limit) break;
  }
  return rows;
}

function countJsonlRecords(path: string): number {
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim()).length;
}

function chunkRecords<T>(records: T[], batchSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < records.length; index += batchSize) chunks.push(records.slice(index, index + batchSize));
  return chunks;
}

async function mapLimit<T, U>(items: T[], limit: number, fn: (item: T, index: number) => Promise<U>): Promise<U[]> {
  const results = new Array<U>(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function sourceListArg(args: Map<string, string | true>): string[] {
  const raw = stringArg(args, "--sources", defaultGraphSources().join(","));
  if (raw.trim() === "all") return defaultGraphSources();
  return raw
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);
}

function positiveLimitArg(args: Map<string, string | true>, name: string, fallback: number): number {
  const value = Math.floor(numberArg(args, name, fallback));
  return value <= 0 ? 1_000_000 : value;
}

function countRows(store: ReturnType<typeof openKnowledgeGraph>, sql: string, ...params: string[]): number {
  const row = store.db.query(sql).get(...params) as Record<string, unknown>;
  return Number(row.count ?? 0);
}

async function toolStatus(tool: { id: string; commands?: Record<string, string> }, context: ToolRuntimeContext): Promise<Record<string, unknown>> {
  const resolved = resolveRegisteredTool(context, tool.id);
  const repo = toolRunnerRepoRoot(context, tool.id);
  const command = ["python3", resolve(resolved.apiRoot, "status.py")];
  if (tool.commands?.status?.includes("--repo-root")) command.push("--repo-root", repo.repoRoot);
  command.push("--json");
  const proc = Bun.spawn(command, {
    cwd: packageRoot(),
    env: { ...Bun.env, ...resolved.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) {
    return { id: tool.id, available: false, status: "failed", error: stderr || stdout };
  }
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    return { id: tool.id, ...parsed, fallback_reason: repo.fallbackReason };
  } catch {
    return { id: tool.id, available: false, status: "unparseable", stdout };
  }
}
