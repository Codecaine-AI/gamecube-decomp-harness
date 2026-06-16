import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { knowledgeCuratorPrompt } from "@decomp-orchestrator/agents/knowledge-curator";
import { parseJsonObject, runPiAgent } from "@decomp-orchestrator/agents/runtime";
import { agentSharedStateEnrichmentPath, knowledgeCuratorEnrichmentPath, packageRoot, resourceGraphDbPath } from "@decomp-orchestrator/knowledge/paths";
import {
  curateKnowledgeEnrichments,
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
  resolveToolRoot,
  searchKnowledgeGraph,
} from "@decomp-orchestrator/knowledge";
import { rankFeatureForSourcePath } from "@decomp-orchestrator/knowledge/graph/rank";
import { shortHash, stringValue, truncate } from "@decomp-orchestrator/knowledge/graph/util";
import { addPiSession, openState } from "@decomp-orchestrator/core/state";
import type { GlobalArgs } from "../args.js";
import { booleanArg, numberArg, stringArg } from "../args.js";

interface SpawnSummary {
  command: string[];
  exit_code: number;
  stdout: string;
  stderr: string;
  skipped?: boolean;
  reason?: string;
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
  const tools = (
    await Promise.all(readToolRegistry().map((tool) => toolStatus(tool, knowledgeRepoRoot(globals))))
  ).map((tool) => ({ ...tool, ready: toolLiveReady(tool) }));
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
    Boolean(tool.looks_like_melee_root) &&
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

export async function runKnowledgeMaintenance(globals: GlobalArgs, args: Map<string, string | true>): Promise<Record<string, unknown>> {
  const repoRoot = knowledgeRepoRoot(globals);
  const prIndex = booleanArg(args, "--no-pr-index") ? skipSummary("pr_index", "--no-pr-index") : await runPrPostmortemIndex(globals, args);
  const toolRunners = booleanArg(args, "--no-tool-runners") ? skipSummary("tool_runners", "--no-tool-runners") : await runToolRunners(repoRoot);
  const toolIndexes = booleanArg(args, "--no-tool-index") ? skipSummary("tool_indexes", "--no-tool-index") : await runToolIndexes(repoRoot);
  const curator = curateKnowledgeEnrichments({
    repoRoot,
    stateDir: globals.stateDir,
    outputPath: stringArg(args, "--knowledge-curator-enrichment", knowledgeCuratorEnrichmentPath()),
    runId: stringArg(args, "--run-id", ""),
    workerLimit: numberArg(args, "--worker-limit", 250),
    prLimit: positiveLimitArg(args, "--pr-limit", 500),
    includeStalled: !booleanArg(args, "--progress-only"),
  });
  const agentReview = await maybeRunCuratorAgent(globals, args, curator.output_path);
  const dataSheetFacts = booleanArg(args, "--no-data-sheet-facts")
    ? skipSummary("data_sheet_facts", "--no-data-sheet-facts")
    : await runDataSheetFacts(repoRoot);
  const rebuild = booleanArg(args, "--no-rebuild")
    ? { skipped: true, reason: "--no-rebuild" }
    : rebuildKnowledgeGraph({
        repoRoot,
        dbPath: stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath()),
        sources: sourceListArg(args),
        agentStateEnrichmentPath: stringArg(args, "--agent-state-enrichment", agentSharedStateEnrichmentPath()),
        knowledgeCuratorEnrichmentPath: stringArg(args, "--knowledge-curator-enrichment", knowledgeCuratorEnrichmentPath()),
      });
  return {
    generated_at: new Date().toISOString(),
    pr_index: prIndex,
    tool_runners: toolRunners,
    tool_indexes: toolIndexes,
    data_sheet_facts: dataSheetFacts,
    curator,
    agent_review: agentReview,
    rebuild,
  };
}

async function runDataSheetFacts(repoRoot: string): Promise<SpawnSummary> {
  const script = resolve(packageRoot(), "knowledge/sources/code_context/ssbm_data_sheet/commands/build_codebase_facts.py");
  const command = ["python3", script, "--repo-root", repoRoot, "--json"];
  const proc = Bun.spawn(command, {
    cwd: packageRoot(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) throw new Error(`Data-sheet fact build failed (${exitCode}): ${command.join(" ")}\n${stderr || stdout}`);
  return { command, exit_code: exitCode, stdout, stderr };
}

async function runToolRunners(repoRoot: string): Promise<SpawnSummary[]> {
  const runners = [
    ["ghidra", "run_headless_probe.py"],
    ["opseq", "extract_opcode_sequences.py"],
    ["mismatch_db", "analyze_objdiff_mismatches.py"],
    ["mwcc_debug", "probe_mwcc_compiler.py"],
  ] as const;
  return Promise.all(
    runners.map(async ([toolId, scriptName]) => {
      const command = ["python3", resolve(resolveToolRoot(toolId), "runners", scriptName), "--repo-root", repoRoot];
      const proc = Bun.spawn(command, {
        cwd: packageRoot(),
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      if (exitCode !== 0) throw new Error(`Tool runner failed for ${toolId} (${exitCode}): ${command.join(" ")}\n${stderr || stdout}`);
      return { command, exit_code: exitCode, stdout, stderr };
    }),
  );
}

async function runToolIndexes(repoRoot: string): Promise<SpawnSummary> {
  const script = resolve(packageRoot(), "tools/build_tool_indexes.py");
  const command = ["python3", script, "--repo-root", repoRoot];
  const proc = Bun.spawn(command, {
    cwd: packageRoot(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) throw new Error(`Tool index build failed (${exitCode}): ${command.join(" ")}\n${stderr || stdout}`);
  return { command, exit_code: exitCode, stdout, stderr };
}

export async function kgMaintain(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runKnowledgeMaintenance(globals, args), null, 2));
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

async function runPrPostmortemIndex(globals: GlobalArgs, args: Map<string, string | true>): Promise<SpawnSummary> {
  const script = resolve(packageRoot(), "knowledge/sources/code_context/past_prs/commands/build_pr_postmortems.py");
  const dumpRoot = stringArg(args, "--dump-root", resolve(packageRoot(), "knowledge/sources/code_context/past_prs/data"));
  const libraryRoot = stringArg(args, "--library-root", resolve(packageRoot(), "knowledge/sources/code_context/past_prs/data/library"));
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
  ];
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
  appendCuratorAgentProposalRecords(enrichmentPath, proposalRecords);
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

function curatorAgentProposalRecords(output: Record<string, unknown>, evidenceRef: string): Array<Record<string, unknown>> {
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
      };
    });
}

function appendCuratorAgentProposalRecords(enrichmentPath: string, records: Array<Record<string, unknown>>): number {
  if (records.length) appendFileSync(enrichmentPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
  return records.length;
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

async function toolStatus(tool: { id: string; commands?: Record<string, string> }, repoRoot: string): Promise<Record<string, unknown>> {
  const command = ["python3", resolve(resolveToolRoot(tool.id), "api/status.py")];
  if (tool.commands?.status?.includes("--repo-root")) command.push("--repo-root", repoRoot);
  command.push("--json");
  const proc = Bun.spawn(command, {
    cwd: packageRoot(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) {
    return { id: tool.id, available: false, status: "failed", error: stderr || stdout };
  }
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    return { id: tool.id, ...parsed };
  } catch {
    return { id: tool.id, available: false, status: "unparseable", stdout };
  }
}
