import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  directorPrompt,
  agentToolProfileSummary,
  knowledgeCuratorPrompt,
  prContextPromptXml,
  prReviewPrompt,
  qaRepairPrompt,
  targetPacketTarget,
  workerPacket,
  workerPrompt,
  workerPromptInputXml,
} from "@decomp-orchestrator/agents";
import { stableJson } from "@decomp-orchestrator/agents/runtime";
import { availableToolsPromptXml, type AgentToolRuntimeContext } from "@decomp-orchestrator/agents/tools";
import { listProjects, projectToSummary, resolveProject, type ProjectSummary, type ResolvedProject } from "@decomp-orchestrator/core";
import {
  activeLeasesForRun,
  activeWorkerCount,
  DEFAULT_WORKER_TTL_SECONDS,
  getLatestRun,
  nextUnhandledEvent,
  openState,
  queueStatsSnapshot,
} from "@decomp-orchestrator/core/state";
import type { BoardSnapshot, PiPromptBundle, RunProjectMetadata, RunRecord } from "@decomp-orchestrator/core/types";
import { globalStandardsPromptXml, loadKnowledgeBoardSnapshot } from "@decomp-orchestrator/knowledge";
import type { PromptPreviewAgentId, PromptPreviewSource } from "@decomp-orchestrator/ui-contract";
import { promptStats } from "./lib/promptStats.js";

type JsonObject = Record<string, unknown>;

interface PromptProjectContext {
  project: ResolvedProject | null;
  repoRoot: string;
  stateDir: string;
  graphDbPath: string;
  usePathOverrides: boolean;
}

interface PromptLease {
  leaseId: string;
  queueId: string;
  workerId: string;
  targetId: string;
  target: Record<string, unknown>;
  writeSet: string[];
  ttl: string;
  selectionSource?: string;
}

const packageRoot = resolve(import.meta.dir, "../../..");
const defaultRepoRoot = packageRoot;
const defaultStateDir = resolve(packageRoot, ".decomp-orchestrator-state");
const builtStaticRoot = resolve(packageRoot, "apps/agent-viewer/dist");
const sampleRepoRoot = resolve(packageRoot, "testdata/smoke_repo");
const port = Number(Bun.env.AGENT_VIEWER_PORT ?? Bun.env.PROMPT_VIEWER_PORT ?? Bun.env.ORCH_PROMPT_VIEWER_PORT ?? 8797);
const promptPreviewAgents: PromptPreviewAgentId[] = ["director", "worker", "pr-review", "knowledge-curator", "qa-repair"];

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function boolValue(value: unknown): boolean {
  return value === true || value === "true";
}

function readJsonObject(path: string): JsonObject {
  try {
    if (!path || !existsSync(path)) return {};
    return asObject(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return {};
  }
}

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

function text(data: string, init: ResponseInit = {}): Response {
  return new Response(data, {
    ...init,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

function promptPreviewAgent(value: unknown): PromptPreviewAgentId {
  const agent = stringValue(value, "worker");
  return promptPreviewAgents.includes(agent as PromptPreviewAgentId) ? (agent as PromptPreviewAgentId) : "worker";
}

function promptPreviewSource(value: unknown): PromptPreviewSource {
  return stringValue(value, "latest") === "sample" ? "sample" : "latest";
}

function availableProjects(): ProjectSummary[] {
  try {
    return listProjects({ orchestratorRoot: packageRoot });
  } catch {
    return [];
  }
}

function defaultProject(): ResolvedProject | null {
  try {
    return resolveProject({ orchestratorRoot: packageRoot, useDefaultProject: true });
  } catch {
    return null;
  }
}

function projectDefaults(project: ResolvedProject | null): JsonObject | null {
  if (!project) return null;
  return {
    processName: project.processName,
    baseRef: project.baseRef,
    graphDbPath: project.graphDbPath,
    validation: project.validation,
    dashboard: project.dashboard,
    pr: project.pr,
  };
}

function resolvePromptProject(input: JsonObject, options: { useDefaultProject?: boolean } = {}): PromptProjectContext {
  const projectId = stringValue(input.projectId).trim();
  const usePathOverrides = boolValue(input.usePathOverrides);
  if (projectId || options.useDefaultProject) {
    try {
      const project = resolveProject({
        orchestratorRoot: packageRoot,
        projectId: projectId || undefined,
        useDefaultProject: !projectId && options.useDefaultProject === true,
        explicitOverrides: usePathOverrides
          ? {
              repoRoot: stringValue(input.repoRoot) || undefined,
              stateDir: stringValue(input.stateDir) || undefined,
              graphDb: stringValue(input.graphDbPath, stringValue(input.graphDb)) || undefined,
            }
          : undefined,
      });
      return {
        project,
        repoRoot: project.repoRoot,
        stateDir: project.stateDir,
        graphDbPath: project.graphDbPath,
        usePathOverrides,
      };
    } catch (error) {
      if (projectId) throw error;
    }
  }

  return {
    project: null,
    repoRoot: resolve(stringValue(input.repoRoot, defaultRepoRoot)),
    stateDir: resolve(stringValue(input.stateDir, defaultStateDir)),
    graphDbPath: resolve(stringValue(input.graphDbPath, stringValue(input.graphDb, "")) || resolve(defaultStateDir, "knowledge-graph.sqlite")),
    usePathOverrides: true,
  };
}

function requestPaths(url: URL, options: { useDefaultProject?: boolean } = {}): PromptProjectContext {
  return resolvePromptProject(
    {
      projectId: url.searchParams.get("projectId") ?? "",
      repoRoot: url.searchParams.get("repoRoot") ?? "",
      stateDir: url.searchParams.get("stateDir") ?? "",
      graphDbPath: url.searchParams.get("graphDbPath") ?? url.searchParams.get("graphDb") ?? "",
      usePathOverrides: url.searchParams.get("usePathOverrides") ?? "",
    },
    options,
  );
}

function projectMetadataForPrompt(paths: PromptProjectContext): RunProjectMetadata | undefined {
  if (!paths.project) return undefined;
  return {
    projectId: paths.project.projectId,
    projectKind: paths.project.kind,
    repoRoot: paths.repoRoot,
    stateDir: paths.stateDir,
    graphDbPath: paths.graphDbPath,
    descriptorPath: paths.project.descriptorPath,
    localOverridePath: paths.project.localOverridePath,
  };
}

function sampleRun(project?: RunProjectMetadata): RunRecord {
  return {
    id: "agent-viewer-sample-run",
    goalKind: "matched_code_percent",
    goalValue: 100,
    desiredWorkers: 4,
    status: "active",
    createdAt: new Date().toISOString(),
    project,
  };
}

function sampleBoardSnapshot(paths: PromptProjectContext): BoardSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    reportPath: resolve(paths.repoRoot, "build/GALE01/report.json"),
    objdiffPath: resolve(paths.repoRoot, "objdiff.json"),
    measures: {
      fuzzy_match_percent: 82.4,
      matched_code_percent: 61.7,
      complete_code_percent: 54.2,
      matched_functions_percent: 70.1,
      complete_units: 128,
      total_units: 412,
    },
    candidates: [
      {
        unit: "GALE01:ftDemo",
        symbol: "ftDemo_Update",
        sourcePath: "src/melee/ft/chara/ftDemo.c",
        size: 184,
        fuzzy: 96.42,
        priority: 900_000,
        reason: "agent viewer sample target with nearby source-shape evidence",
      },
      {
        unit: "GALE01:grExample",
        symbol: "grExample_801C0000",
        sourcePath: "src/melee/gr/grExample.c",
        size: 96,
        fuzzy: 89.12,
        priority: 820_000,
        reason: "agent viewer sample follow-up target",
      },
    ],
  };
}

interface PromptPreviewPlaceholders {
  availableToolsXml?: string;
  baselineXml?: string;
  curatorContextJson?: string;
  curatorOutputSchemaJson?: string;
  prContextJson?: string;
  prContextXml?: string;
  prOutputSchemaJson?: string;
  qaRepairItemJson?: string;
  qaRepairOutputSchemaJson?: string;
  qaRepairQueueSummaryJson?: string;
  targetGraphFileCardXml?: string;
  targetXml?: string;
}

interface PromptPreviewRendered {
  bundle: PiPromptBundle;
  context: JsonObject;
  contextSource: PromptPreviewSource;
  placeholders?: PromptPreviewPlaceholders;
}

function hydratePromptPreviewPlaceholders(bundle: PiPromptBundle, placeholders: PromptPreviewPlaceholders = {}): PiPromptBundle {
  const standardsXml = globalStandardsPromptXml();
  const hydrate = (prompt: string) =>
    prompt
      .replace(/\{\{\s*AVAILABLE_TOOLS_XML\s*\}\}/g, () => placeholders.availableToolsXml ?? "")
      .replace(/\{\{\s*BASELINE_XML\s*\}\}/g, () => placeholders.baselineXml ?? "")
      .replace(/\{\{\s*CURATOR_CONTEXT_JSON\s*\}\}/g, () => placeholders.curatorContextJson ?? "")
      .replace(/\{\{\s*CURATOR_OUTPUT_SCHEMA_JSON\s*\}\}/g, () => placeholders.curatorOutputSchemaJson ?? "")
      .replace(/\{\{\s*DECOMP_STANDARDS_XML\s*\}\}/g, () => standardsXml)
      .replace(/\{\{\s*PR_CONTEXT_JSON\s*\}\}/g, () => placeholders.prContextJson ?? "")
      .replace(/\{\{\s*PR_CONTEXT_XML\s*\}\}/g, () => placeholders.prContextXml ?? "")
      .replace(/\{\{\s*PR_OUTPUT_SCHEMA_JSON\s*\}\}/g, () => placeholders.prOutputSchemaJson ?? "")
      .replace(/\{\{\s*QA_REPAIR_ITEM_JSON\s*\}\}/g, () => placeholders.qaRepairItemJson ?? "")
      .replace(/\{\{\s*QA_REPAIR_OUTPUT_SCHEMA_JSON\s*\}\}/g, () => placeholders.qaRepairOutputSchemaJson ?? "")
      .replace(/\{\{\s*QA_REPAIR_QUEUE_SUMMARY_JSON\s*\}\}/g, () => placeholders.qaRepairQueueSummaryJson ?? "")
      .replace(/\{\{\s*TARGET_GRAPH_FILE_CARD_XML\s*\}\}/g, () => placeholders.targetGraphFileCardXml ?? "")
      .replace(/\{\{\s*TARGET_XML\s*\}\}/g, () => placeholders.targetXml ?? "");
  return {
    ...bundle,
    systemPrompt: hydrate(bundle.systemPrompt),
    userPrompt: hydrate(bundle.userPrompt),
  };
}

function latestRunForPrompt(stateDir: string, warnings: string[]): RunRecord | null {
  const store = openState(stateDir);
  try {
    return getLatestRun(store);
  } catch (error) {
    warnings.push(`Unable to read latest run from state: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    store.db.close();
  }
}

function liveBoardSnapshotForPrompt(paths: PromptProjectContext, limit: number, warnings: string[]): BoardSnapshot {
  try {
    return loadKnowledgeBoardSnapshot(paths.repoRoot, limit, { graphDbPath: paths.graphDbPath });
  } catch (error) {
    warnings.push(`Unable to load live board snapshot; using sample board: ${error instanceof Error ? error.message : String(error)}`);
    return sampleBoardSnapshot(paths);
  }
}

function latestInitialSnapshot(stateDir: string, runId: string): JsonObject {
  return readJsonObject(resolve(stateDir, "runs", runId, "snapshots", "initial_board.json"));
}

function measuresFromSnapshot(snapshot: JsonObject): JsonObject {
  return asObject(snapshot.measures);
}

function firstQueuedTarget(stateDir: string, runId: string): JsonObject | null {
  const store = openState(stateDir);
  try {
    const row = store.db
      .query(
        `
          SELECT
            queue.id AS queue_id,
            targets.id AS target_id,
            targets.unit,
            targets.symbol,
            targets.source_path,
            targets.size,
            targets.fuzzy,
            targets.priority,
            targets.reason
          FROM queue
          JOIN targets ON targets.id = queue.target_id
          WHERE queue.run_id = ?
            AND queue.status = 'queued'
          ORDER BY queue.priority DESC, queue.created_at ASC
          LIMIT 1
        `,
      )
      .get(runId) as JsonObject | undefined;
    return row ?? null;
  } finally {
    store.db.close();
  }
}

function directorPromptPreview(
  paths: PromptProjectContext,
  requestedSource: PromptPreviewSource,
  warnings: string[],
): PromptPreviewRendered {
  const project = projectMetadataForPrompt(paths);
  const liveRun = requestedSource === "latest" ? latestRunForPrompt(paths.stateDir, warnings) : null;
  const contextSource: PromptPreviewSource = liveRun ? "latest" : "sample";
  if (requestedSource === "latest" && !liveRun) warnings.push("No latest run is available; rendered the director prompt with sample run state.");
  const run = liveRun ?? sampleRun(project);
  const candidateWindow = paths.project?.dashboard.candidateWindow ?? Math.max(32, run.desiredWorkers * 8);
  const snapshot = contextSource === "latest" ? liveBoardSnapshotForPrompt(paths, candidateWindow, warnings) : sampleBoardSnapshot(paths);
  let event: JsonObject = {
    id: "agent-viewer-sample-event",
    event_type: "pool_below_target",
    producer: "agent-viewer",
    payload_json: JSON.stringify({ reason: "sample director wake event" }),
    created_at: new Date().toISOString(),
  };
  let activeWorkers = 0;
  let queuePressure: JsonObject | null = null;

  if (contextSource === "latest") {
    const store = openState(paths.stateDir);
    try {
      const nextEvent = nextUnhandledEvent(store, run.id);
      if (nextEvent) event = asObject(nextEvent);
      activeWorkers = activeWorkerCount(store, run.id);
      const stats = queueStatsSnapshot(store, run.id);
      queuePressure = {
        candidate_limit: paths.project?.dashboard.candidateLimit ?? Math.max(32, run.desiredWorkers * 2),
        candidate_window: candidateWindow,
        queue_target_size: paths.project?.dashboard.queueTargetSize ?? Math.max(32, run.desiredWorkers * 2),
        queued_targets: stats.queuedTargets,
        schedulable_targets: stats.schedulableTargets,
        blocked_queued_targets: stats.blockedQueuedTargets,
        active_workers: stats.activeWorkers,
        unhandled_events: stats.unhandledEvents,
      };
    } catch (error) {
      warnings.push(`Unable to read live director queue/event state: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      store.db.close();
    }
  } else {
    queuePressure = {
      candidate_limit: 16,
      candidate_window: 32,
      queue_target_size: 16,
      queued_targets: 6,
      schedulable_targets: 6,
      blocked_queued_targets: 0,
      active_workers: 0,
      unhandled_events: 1,
    };
  }

  const initialBoardPath = resolve(paths.stateDir, "runs", run.id, "snapshots", "initial_board.json");
  const options = {
    run,
    snapshot,
    event,
    activeWorkers,
    repoRoot: paths.repoRoot,
    stateDir: paths.stateDir,
    project,
    initialBoardPath,
    queuePressure: queuePressure ?? undefined,
  };
  return {
    bundle: directorPrompt(options),
    context: {
      options,
      selectedSnapshotCandidates: snapshot.candidates.slice(0, 12),
    },
    contextSource,
  };
}

function sampleWorkerLease(): PromptLease {
  const sourcePath = "src/melee/ft/chara/ftDemo.c";
  const target = {
    target_id: "agent-viewer-sample-target",
    unit: "GALE01:ftDemo",
    symbol: "ftDemo_Unmatched",
    source_path: sourcePath,
    size: 128,
    fuzzy: 82.5,
    priority: 900_000,
    reason: "agent viewer sample worker lease",
  };
  return {
    leaseId: "agent-viewer-sample-lease",
    queueId: "agent-viewer-sample-queue",
    workerId: "agent-viewer-worker",
    targetId: String(target.target_id),
    target,
    writeSet: [sourcePath],
    ttl: new Date(Date.now() + DEFAULT_WORKER_TTL_SECONDS * 1000).toISOString(),
    selectionSource: "sample_target",
  };
}

function sampleWorkerFileCard(sourcePath: string): JsonObject {
  return {
    entity_id: `file:${sourcePath}`,
    source_path: sourcePath,
    editability: {
      mode: "editable",
      reason: "1 unmatched function remains in this source file.",
    },
    match_status: {
      source_path: sourcePath,
      units: ["GALE01:ftDemo"],
      function_count: 5,
      matched_function_count: 4,
      unmatched_function_count: 1,
      editability: {
        mode: "editable",
        reason: "1 unmatched function remains in this source file.",
      },
      functions: [
        { address: "0x80000000", symbol: "ftDemo_Setup", unit: "GALE01:ftDemo", size: 96, fuzzy: 100 },
        { address: "0x80000060", symbol: "ftDemo_AlreadyMatched", unit: "GALE01:ftDemo", size: 64, fuzzy: 100 },
        { address: "0x800000A0", symbol: "ftDemo_Unmatched", unit: "GALE01:ftDemo", size: 128, fuzzy: 82.5 },
        { address: "0x80000120", symbol: "ftDemo_Cleanup", unit: "GALE01:ftDemo", size: 80, fuzzy: 100 },
        { address: "0x80000170", symbol: "ftDemo_TableDispatch", unit: "GALE01:ftDemo", size: 148, fuzzy: 100 },
      ],
      unmatched_functions: [{ address: "0x800000A0", symbol: "ftDemo_Unmatched", unit: "GALE01:ftDemo", size: 128, fuzzy: 82.5 }],
    },
    units: [{ unit: "GALE01:ftDemo" }],
    functions: [
      { address: "0x80000000", symbol: "ftDemo_Setup", unit: "GALE01:ftDemo", size: 96, fuzzy: 100 },
      { address: "0x80000060", symbol: "ftDemo_AlreadyMatched", unit: "GALE01:ftDemo", size: 64, fuzzy: 100 },
      { address: "0x800000A0", symbol: "ftDemo_Unmatched", unit: "GALE01:ftDemo", size: 128, fuzzy: 82.5 },
      { address: "0x80000120", symbol: "ftDemo_Cleanup", unit: "GALE01:ftDemo", size: 80, fuzzy: 100 },
      { address: "0x80000170", symbol: "ftDemo_TableDispatch", unit: "GALE01:ftDemo", size: 148, fuzzy: 100 },
    ],
    pr_history: {
      touching_prs: [
        {
          pr: 2515,
          title: "lb: improve lbcollision capsule-collision matching",
          author: "itsgrimetime",
          state: "MERGED",
          merged_at: "2026-05-19T21:57:50Z",
        },
        {
          pr: 2503,
          title: "lb: improve lbcollision matching",
          author: "itsgrimetime",
          state: "MERGED",
          merged_at: "2026-05-15T20:16:55Z",
        },
        {
          pr: 724,
          title: "Match `lbcollision`, pass 2",
          author: "ribbanya",
          state: "MERGED",
          merged_at: "2023-02-01T19:53:12Z",
        },
      ],
      review_risks: [
        { value: "Stack frame and register lifetime changes can improve target score while hurting nearby same-file functions." },
        { value: "Keep macro/helper style consistent with matched siblings before trusting permuter-shaped code." },
      ],
      tactics: [
        { value: "Compare the unmatched block against matched same-file helpers before changing declarations." },
        { value: "Try preserving the original base pointer when later code still needs the address." },
      ],
    },
    resource_hits: [
      {
        source_id: "past_prs",
        title: "Past PRs for src/melee/lb/lbcollision.c",
        evidence_ref: "knowledge/sources/code_context/past_prs/data/aggregate/changed_files.jsonl",
      },
      {
        source_id: "code_graph",
        title: "Code graph: src/melee/ft/chara/ftDemo.c",
        evidence_ref: "testdata/smoke_repo/build/GALE01/report.json",
      },
      {
        source_id: "agent_shared_state",
        title: "fixture stack frame mismatch lesson",
        evidence_ref: "legacy-agent-state:tool_issue:1",
      },
    ],
    mismatch_patterns: [
      {
        pattern_id: "stack-frame-layout",
        title: "Stack/frame layout mismatch",
        category: "codegen",
        symptoms: ["stack frame", "local array", "stwu offset", "PAD_STACK"],
        tactics: ["Preserve caller-visible stack slot lifetimes.", "Check local temporary ordering against matched siblings."],
        evidence_count: 3,
        linked_evidence_refs: ["postmortem:pr-2515", "postmortem:pr-2503"],
        linked_evidence: [
          {
            title: "lbcollision capsule matching",
            kind: "past_pr_postmortem",
            evidence_ref: "knowledge/sources/past_prs/data/prs/pr-2515/postmortem.json",
            unit: "main/melee/lb/lbcollision",
            symbol: "lbColl_800077A0",
            pr: 2515,
          },
        ],
      },
      {
        pattern_id: "register-lifetime",
        title: "Register allocation or lifetime mismatch",
        category: "codegen",
        symptoms: ["register allocation", "base pointer lifetime", "copy propagation"],
        tactics: ["Keep the original base pointer live if later address arithmetic depends on it.", "Prefer source shapes that match local authored style before permuting."],
        evidence_count: 2,
        linked_evidence_refs: ["postmortem:pr-2515", "postmortem:pr-2503"],
      },
      {
        pattern_id: "inline-helper-boundary",
        title: "Inline/helper boundary mismatch",
        category: "source-shape",
        symptoms: ["helper boundary", "inlined accessor", "macro shape"],
        tactics: ["Check whether a nearby helper or macro is expected to inline at this call site."],
        evidence_count: 1,
        linked_evidence_refs: ["postmortem:pr-2515"],
      },
    ],
    tool_hits: [],
    scheduling_signals: {
      source_path: sourcePath,
      editability: "editable",
      graph_degree: 18,
      function_graph_degree: 7,
      fresh_edges_since_last_attempt: 2,
      relevant_pr_count: 3,
      review_risk_count: 2,
      duplicate_reference_count: 1,
      linked_unlock_potential: 0,
      connected_incomplete_function_count: 1,
      connected_matched_reference_count: 4,
      resource_evidence_count: 3,
      path_fact_count: 2,
      historical_lesson_count: 1,
      curated_signal_count: 0,
      proposal_fact_count: 0,
      stale_fact_count: 0,
      information_gain_score: 9.8,
      unlock_score: 1.2,
      context_quality_score: 7.6,
      completion_readiness_score: 5.4,
      information_value_score: 11.1,
      risk_penalty: 1.4,
      priority_bonus: 15.1,
      explanation: ["graph_degree=18", "editability=editable", "relevant_pr_count=3", "resource_evidence_count=3", "historical_lesson_count=1"],
    },
  };
}

function sampleWorkerPathFacts(sourcePath: string): JsonObject {
  return {
    status: "ready",
    source: "path_facts",
    facts: [
      {
        id: "path_fact:src/melee/ft/chara",
        title: "Fighter character source style",
        directory: "src/melee/ft/chara",
        strength: "bounded",
        summary: "Character source files usually keep state-machine helpers, action callbacks, and table dispatch helpers in the same file; compare matched sibling functions before changing shared declarations.",
        evidence_refs: ["path_facts:fighter-character-style", "postmortem:pr-2515"],
        watched_paths: [sourcePath, "src/melee/ft/chara/*.c", "src/melee/ft/ft*.h"],
        slice_ref: "knowledge/sources/injectable/path_facts/data/path_facts/fighter.jsonl",
      },
      {
        id: "path_fact:src/melee/ft",
        title: "Fighter macro/helper boundaries",
        directory: "src/melee/ft",
        strength: "reviewed",
        summary: "When a fuzzy mismatch is mostly register lifetime or stack shape, inspect nearby matched helpers and headers before introducing new casts or temporary storage.",
        evidence_refs: ["path_facts:fighter-helper-boundaries", "mismatch_patterns:register-lifetime"],
        watched_paths: [sourcePath, "src/melee/ft/*.h"],
        slice_ref: "knowledge/sources/injectable/path_facts/data/path_facts/fighter.jsonl",
      },
    ],
  };
}

function liveWorkerLeaseForPrompt(paths: PromptProjectContext, run: RunRecord, warnings: string[]): PromptLease {
  const store = openState(paths.stateDir);
  try {
    const activeLease = activeLeasesForRun(store, run.id)[0];
    if (activeLease) return { ...activeLease, selectionSource: "active_lease" };
  } catch (error) {
    warnings.push(`Unable to read active worker leases: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    store.db.close();
  }

  try {
    const queued = firstQueuedTarget(paths.stateDir, run.id);
    if (queued) {
      const sourcePath = stringValue(queued.source_path);
      const target = {
        target_id: stringValue(queued.target_id, "agent-viewer-queued-target"),
        unit: stringValue(queued.unit),
        symbol: stringValue(queued.symbol),
        source_path: sourcePath,
        size: numberValue(queued.size),
        fuzzy: numberValue(queued.fuzzy),
        priority: numberValue(queued.priority),
        reason: stringValue(queued.reason),
      };
      warnings.push("No active worker lease found; rendered the worker prompt with the first queued target as a synthetic lease.");
      return {
        leaseId: "agent-viewer-synthetic-lease",
        queueId: stringValue(queued.queue_id, "agent-viewer-synthetic-queue"),
        workerId: "agent-viewer-worker",
        targetId: stringValue(queued.target_id, "agent-viewer-queued-target"),
        target,
        writeSet: sourcePath ? [sourcePath] : [],
        ttl: new Date(Date.now() + DEFAULT_WORKER_TTL_SECONDS * 1000).toISOString(),
        selectionSource: "queued_target",
      };
    }
  } catch (error) {
    warnings.push(`Unable to read queued worker targets: ${error instanceof Error ? error.message : String(error)}`);
  }

  warnings.push("No active or queued worker target found; rendered the worker prompt with a sample target packet.");
  return sampleWorkerLease();
}

function workerPromptPreview(
  paths: PromptProjectContext,
  requestedSource: PromptPreviewSource,
  warnings: string[],
): PromptPreviewRendered {
  const project = projectMetadataForPrompt(paths);
  const liveRun = requestedSource === "latest" ? latestRunForPrompt(paths.stateDir, warnings) : null;
  const contextSource: PromptPreviewSource = liveRun ? "latest" : "sample";
  if (requestedSource === "latest" && !liveRun) warnings.push("No latest run is available; rendered the worker prompt with sample run and target state.");
  const run = liveRun ?? sampleRun(project);
  const lease = contextSource === "latest" ? liveWorkerLeaseForPrompt(paths, run, warnings) : sampleWorkerLease();
  const initialSnapshot = contextSource === "latest" ? latestInitialSnapshot(paths.stateDir, run.id) : {};
  const baselineMeasures = Object.keys(initialSnapshot).length ? measuresFromSnapshot(initialSnapshot) : sampleBoardSnapshot(paths).measures;
  const target = targetPacketTarget(lease.target);
  const repoRootForPrompt = contextSource === "sample" || lease.selectionSource === "sample_target" ? sampleRepoRoot : paths.repoRoot;
  const packet = workerPacket({
    run,
    leased: lease,
    target,
    baselineMeasures,
    knowledgeContext:
      contextSource === "sample" || lease.selectionSource === "sample_target"
        ? {
            status: "ready",
            graph_db: "agent-viewer-sample-graph",
            generated_at: new Date().toISOString(),
            source: lease.selectionSource ?? contextSource,
            note: "Rendered for prompt inspection with a realistic fixture graph file card based on the live graph card shape.",
            file_card: sampleWorkerFileCard(String(target.source_path ?? "")),
            path_facts: sampleWorkerPathFacts(String(target.source_path ?? "")),
          }
        : {
            status: "prompt_viewer",
            source: lease.selectionSource ?? contextSource,
            note: "Rendered for prompt inspection; live worker runners may add richer graph context before launch.",
          },
  });
  const initialBoardPath = resolve(paths.stateDir, "runs", run.id, "snapshots", "initial_board.json");
  const workerLogDir = resolve(paths.stateDir, "runs", run.id, "worker_logs", lease.leaseId);
  const toolContext: AgentToolRuntimeContext = {
    role: "worker",
    cwd: repoRootForPrompt,
    repoRoot: repoRootForPrompt,
    stateDir: paths.stateDir,
    project,
    packet,
    initialBoardPath,
    workerLogDir,
  };
  const options = {
    packet,
    repoRoot: repoRootForPrompt,
    stateDir: paths.stateDir,
    project,
    initialBoardPath,
    workerLogDir,
  };
  const inputXml = workerPromptInputXml({ packet, repoRoot: repoRootForPrompt, project });
  const targetGraphFileCard = sampleWorkerFileCard(String(target.source_path ?? ""));
  return {
    bundle: workerPrompt(options),
    context: {
      target,
      run_goal: {
        kind: run.goalKind,
        value: run.goalValue,
      },
      write_set: lease.writeSet,
      worker_log_dir: workerLogDir,
      initial_board_path: initialBoardPath,
      prompt_repo_root: repoRootForPrompt,
      lease_selection_source: lease.selectionSource ?? contextSource,
      baseline_current_scores: baselineMeasures,
      baseline_measures: baselineMeasures,
      target_graph_file_card: contextSource === "sample" || lease.selectionSource === "sample_target" ? targetGraphFileCard : undefined,
      attached_tools: agentToolProfileSummary("worker"),
    },
    contextSource,
    placeholders: {
      availableToolsXml: availableToolsPromptXml(toolContext),
      baselineXml: inputXml.baselineXml,
      targetGraphFileCardXml: inputXml.targetGraphFileCardXml,
      targetXml: inputXml.targetXml,
    },
  };
}

function prReviewPromptPreview(
  paths: PromptProjectContext,
  requestedSource: PromptPreviewSource,
  warnings: string[],
): PromptPreviewRendered {
  if (requestedSource === "latest") warnings.push("The agent viewer does not keep a single current PR intake context; rendered a deterministic sample PR context.");
  const project = projectMetadataForPrompt(paths);
  const toolContext: AgentToolRuntimeContext = {
    role: "pr-review",
    cwd: paths.repoRoot,
    repoRoot: paths.repoRoot,
    stateDir: paths.stateDir,
    project,
  };
  const prContext = {
    schema_version: "melee_pr_context_v1",
    object_id: "pr-0",
    context_source: "agent-viewer-sample",
    project: project ?? null,
    pr: {
      number: 0,
      title: "Agent viewer sample PR intake",
      url: "https://github.com/doldecomp/melee/pull/0",
      state: "MERGED",
      author: "agent-viewer",
      created_at: "2026-06-01T00:00:00Z",
      merged_at: "2026-06-02T00:00:00Z",
      base_ref: paths.project?.baseRef ?? "origin/master",
    },
    source: {
      dump_root: "knowledge/sources/code_context/past_prs/data",
      slice_dir: "knowledge/sources/code_context/past_prs/data/prs/pr-0",
      library_root: "knowledge/sources/code_context/past_prs/data/library",
    },
    counts: {
      changed_files: 1,
      review_comments: 1,
    },
    initial_classification: {
      categories: ["decomp-matching", "types-structs"],
      systems: ["fighter"],
      search_terms: ["ftDemo", "JObj", "inline helper", "review lint"],
    },
    changed_files: [
      {
        file: "src/melee/ft/chara/ftDemo.c",
        added: 24,
        deleted: 11,
        hunks: 3,
      },
    ],
    human_text_excerpt: "Matches ftDemo helper by reusing the existing JObj inline shape and preserving callback naming.",
    review_comments_excerpt: "src/melee/ft/chara/ftDemo.c: Prefer the existing helper name and avoid type-erasing casts in the matched callback.",
    review_feedback_examples: ["src/melee/ft/chara/ftDemo.c: Prefer the existing helper name and avoid type-erasing casts."],
    diff_excerpt: [
      "diff --git a/src/melee/ft/chara/ftDemo.c b/src/melee/ft/chara/ftDemo.c",
      "+    HSD_JObjSetFlags(jobj, flags);",
      "-    ((void (*)(void*))callback)(obj);",
    ].join("\n"),
    local_slice_paths: {
      pr_dump: resolve(paths.repoRoot, "knowledge/sources/code_context/past_prs/data/prs/pr-0/raw/pr.json"),
      patch: resolve(paths.repoRoot, "knowledge/sources/code_context/past_prs/data/prs/pr-0/raw/diff.diff"),
    },
    loaded_files: [
      {
        label: "human_pr_text",
        path: "knowledge/sources/code_context/past_prs/data/prs/pr-0/extracted/human_pr_text.md",
        media_type: "text/markdown",
        original_chars: 98,
        truncated: false,
        content: "Matches ftDemo helper by reusing the existing JObj inline shape and preserving callback naming.",
      },
      {
        label: "review_comments",
        path: "knowledge/sources/code_context/past_prs/data/prs/pr-0/extracted/review_comments.md",
        media_type: "text/markdown",
        original_chars: 115,
        truncated: false,
        content: "src/melee/ft/chara/ftDemo.c: Prefer the existing helper name and avoid type-erasing casts in the matched callback.",
      },
      {
        label: "raw_diff",
        path: "knowledge/sources/code_context/past_prs/data/prs/pr-0/raw/diff.diff",
        media_type: "text/x-diff",
        original_chars: 147,
        truncated: false,
        content: [
          "diff --git a/src/melee/ft/chara/ftDemo.c b/src/melee/ft/chara/ftDemo.c",
          "+    HSD_JObjSetFlags(jobj, flags);",
          "-    ((void (*)(void*))callback)(obj);",
        ].join("\n"),
      },
    ],
    intake_focus: ["extract reusable source-shape facts", "preserve evidence paths", "handoff proposal-only source updates to the curator"],
  };
  const outputSchema = readJsonObject(resolve(packageRoot, "packages/agents/src/pr-review/schema.json"));
  return {
    bundle: prReviewPrompt({ prContext, repoRoot: paths.repoRoot, stateDir: paths.stateDir, project }),
    context: {
      prContext,
      pr_context_xml: prContextPromptXml({ prContext, repoRoot: paths.repoRoot }),
      output_schema: outputSchema,
      attached_tools: agentToolProfileSummary("pr-review"),
      available_tools_xml: availableToolsPromptXml(toolContext),
    },
    contextSource: "sample",
    placeholders: {
      availableToolsXml: availableToolsPromptXml(toolContext),
      prContextJson: stableJson(prContext),
      prContextXml: prContextPromptXml({ prContext, repoRoot: paths.repoRoot }),
      prOutputSchemaJson: stableJson(outputSchema),
    },
  };
}

function knowledgeCuratorPromptPreview(
  paths: PromptProjectContext,
  requestedSource: PromptPreviewSource,
  warnings: string[],
): PromptPreviewRendered {
  if (requestedSource === "latest") warnings.push("The agent viewer does not keep a single current curator batch context; rendered a deterministic sample curator context.");
  const project = projectMetadataForPrompt(paths);
  const toolContext: AgentToolRuntimeContext = {
    role: "knowledge-curator",
    cwd: paths.repoRoot,
    repoRoot: paths.repoRoot,
    stateDir: paths.stateDir,
    project,
  };
  const curatorContext = {
    source: "agent-viewer-sample",
    project: project ?? null,
    graph_db_path: paths.graphDbPath,
    enrichment_path: "knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl",
    deterministic_record_count: 2,
    batch_index: 1,
    batch_count: 1,
    sampled_records: [
      {
        id: "agent-viewer-record-1",
        kind: "pr_lesson",
        status: "accepted",
        trust_tier: "historical",
        source_path: "src/melee/ft/chara/ftDemo.c",
        title: "PR intake lesson for fighter helper naming",
        text: "Review feedback preferred existing helper names and rejected type-erasing casts in a matched callback.",
        evidence_ref: "knowledge/sources/code_context/past_prs/data/prs/pr-0/postmortem/postmortem.json",
        confidence: 0.72,
        payload: {
          pr: 0,
          agent_status: "agent_completed",
        },
      },
      {
        id: "agent-viewer-record-2",
        kind: "source_update_proposal",
        status: "proposal",
        trust_tier: "local",
        source_path: "src/melee/ft/chara/ftDemo.c",
        title: "Path fact candidate for fighter callback helper names",
        text: "Fighter callback matches should prefer existing helper names in the local source path before introducing new wrappers.",
        evidence_ref: "worker_report.json",
        confidence: 0.4,
        payload: {
          target_source_id: "path_facts",
          update_kind: "path_fact",
          mutation_policy: "proposal_only",
        },
      },
    ],
    requested_decisions: ["promote_safe_records", "leave source-specific updates as proposals", "reject unsupported broad rules"],
  };
  const outputSchema = readJsonObject(resolve(packageRoot, "packages/agents/src/knowledge-curator/schema.json"));
  return {
    bundle: knowledgeCuratorPrompt({ curatorContext, repoRoot: paths.repoRoot, stateDir: paths.stateDir, project }),
    context: {
      curatorContext,
      output_schema: outputSchema,
      attached_tools: agentToolProfileSummary("knowledge-curator"),
      available_tools_xml: availableToolsPromptXml(toolContext),
    },
    contextSource: "sample",
    placeholders: {
      availableToolsXml: availableToolsPromptXml(toolContext),
      curatorContextJson: stableJson(curatorContext),
      curatorOutputSchemaJson: stableJson(outputSchema),
    },
  };
}

function qaRepairPromptPreview(
  paths: PromptProjectContext,
  requestedSource: PromptPreviewSource,
  warnings: string[],
): PromptPreviewRendered {
  if (requestedSource === "latest") warnings.push("The agent viewer does not keep a single current QA repair item context; rendered a deterministic sample QA repair item.");
  const project = projectMetadataForPrompt(paths);
  const toolContext: AgentToolRuntimeContext = {
    role: "qa-repair",
    cwd: paths.repoRoot,
    repoRoot: paths.repoRoot,
    stateDir: paths.stateDir,
    project,
  };
  const item = {
    schema_version: "qa_repair_queue_item_v1",
    id: "src-melee-gr-grsmoke",
    status: "queued",
    source_path: "src/melee/gr/grsmoke.c",
    lane: "match",
    base_ref: paths.project?.baseRef ?? "origin/master",
    head_sha: "agent-viewer-sample-head",
    proofs: [
      {
        checkpointItemId: "agent-viewer-checkpoint-item",
        disposition: "pr_candidate",
        lane: "match",
        sourcePath: "src/melee/gr/grsmoke.c",
        symbol: "grSmoke",
        exactMatch: true,
        summaryPath: "state/runs/sample/checkpoints/checkpoint.json",
      },
    ],
    findings: [
      {
        rule_id: "m2c_residue_names",
        severity: "error",
        file: "src/melee/gr/grsmoke.c",
        line: 23,
        excerpt: "s32 temp_r30 = var_r4 + phi_f1;",
        message: "Generated m2c local names remain in source.",
        standard_id: "global_standard:conservative-naming",
      },
      {
        rule_id: "inline_asm",
        severity: "error",
        file: "src/melee/gr/grsmoke.c",
        line: 32,
        excerpt: "asm volatile (\"nop\");",
        message: "Added inline assembly in normal source.",
        standard_id: "global_standard:avoid-pragmas-register-asm",
      },
    ],
    warnings: [
      {
        rule_id: "novel_pragma",
        severity: "warning",
        file: "src/melee/gr/grsmoke.c",
        line: 42,
        excerpt: "#pragma inline_depth(4)",
        message: "Added novel pragma directive.",
        standard_id: "global_standard:avoid-pragmas-register-asm",
      },
    ],
    rule_counts: {
      m2c_residue_names: 1,
      inline_asm: 1,
      novel_pragma: 1,
    },
    created_at: new Date().toISOString(),
    validation: {
      qa_scan: "review_lint scan_diff --gate for src/melee/gr/grsmoke.c",
      target_check: "runner-owned score/build validation when available",
      ship_set_check: "final PR ship-set verification before inclusion",
    },
    attempts: [],
  };
  const queueSummary = {
    run_id: "agent-viewer-sample-run",
    files_with_errors: 1,
    queued_items: 1,
    recommendation: "repair_required",
  };
  const outputSchema = readJsonObject(resolve(packageRoot, "packages/agents/src/qa-repair/schema.json"));
  return {
    bundle: qaRepairPrompt({ item: item as any, queueSummary, repoRoot: paths.repoRoot, stateDir: paths.stateDir, project }),
    context: {
      qaRepairItem: item,
      queueSummary,
      output_schema: outputSchema,
      attached_tools: agentToolProfileSummary("qa-repair"),
      available_tools_xml: availableToolsPromptXml(toolContext),
    },
    contextSource: "sample",
    placeholders: {
      availableToolsXml: availableToolsPromptXml(toolContext),
      qaRepairItemJson: stableJson(item),
      qaRepairOutputSchemaJson: stableJson(outputSchema),
      qaRepairQueueSummaryJson: stableJson(queueSummary),
    },
  };
}

function renderPromptPreview(paths: PromptProjectContext, agent: PromptPreviewAgentId, requestedSource: PromptPreviewSource): JsonObject {
  const warnings: string[] = [];
  const rendered =
    agent === "director"
      ? directorPromptPreview(paths, requestedSource, warnings)
      : agent === "worker"
        ? workerPromptPreview(paths, requestedSource, warnings)
        : agent === "pr-review"
          ? prReviewPromptPreview(paths, requestedSource, warnings)
          : agent === "knowledge-curator"
            ? knowledgeCuratorPromptPreview(paths, requestedSource, warnings)
            : qaRepairPromptPreview(paths, requestedSource, warnings);
  const { context, contextSource } = rendered;
  const bundle = hydratePromptPreviewPlaceholders(rendered.bundle, rendered.placeholders);
  return {
    agent,
    requestedSource,
    contextSource,
    generatedAt: new Date().toISOString(),
    project: paths.project ? projectToSummary(paths.project) : null,
    repoRoot: paths.repoRoot,
    stateDir: paths.stateDir,
    graphDbPath: paths.graphDbPath,
    systemPrompt: bundle.systemPrompt,
    userPrompt: bundle.userPrompt,
    systemTemplatePath: bundle.systemTemplatePath,
    userTemplatePath: bundle.userTemplatePath,
    systemStats: promptStats(bundle.systemPrompt),
    userStats: promptStats(bundle.userPrompt),
    context: {
      ...context,
      renderedContextJson: stableJson(context),
    },
    warnings,
  };
}

async function handleApi(_req: Request, url: URL): Promise<Response> {
  if (url.pathname === "/api/config") {
    const selectedProject = defaultProject();
    const projects = availableProjects();
    return json({
      packageRoot,
      defaultRepoRoot: selectedProject?.repoRoot ?? defaultRepoRoot,
      defaultStateDir: selectedProject?.stateDir ?? defaultStateDir,
      defaultGraphDbPath: selectedProject?.graphDbPath ?? resolve(defaultStateDir, "knowledge-graph.sqlite"),
      defaultProjectId: selectedProject?.projectId ?? "",
      selectedProject: selectedProject ? projectToSummary(selectedProject) : null,
      availableProjects: projects,
      projectDefaults: projectDefaults(selectedProject),
      port,
      hotReload: false,
      dashboardStreamIntervalMs: 0,
    });
  }
  if (url.pathname === "/api/agents/render" || url.pathname === "/api/prompts/render") {
    const paths = requestPaths(url, { useDefaultProject: true });
    return json(renderPromptPreview(paths, promptPreviewAgent(url.searchParams.get("agent")), promptPreviewSource(url.searchParams.get("source"))));
  }
  return json({ error: "not found" }, { status: 404 });
}

function staticResponse(pathname: string): Response {
  const file = pathname === "/" ? "index.html" : pathname.slice(1);
  const path = resolve(builtStaticRoot, file);
  if (!path.startsWith(builtStaticRoot)) return text("Not found", { status: 404 });
  if (!existsSync(path)) {
    const fallback = resolve(builtStaticRoot, "index.html");
    if (existsSync(fallback)) return new Response(Bun.file(fallback));
    return text("Agent viewer has not been built. Run `bun run agent-viewer:build` first.", { status: 404 });
  }
  return new Response(Bun.file(path));
}

export async function fetchAgentViewerServer(req: Request): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, url);
    return staticResponse(url.pathname);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export function serveAgentViewerServer(): ReturnType<typeof Bun.serve> {
  const server = Bun.serve({
    port,
    fetch: fetchAgentViewerServer,
  });
  console.log(`agent viewer listening on http://localhost:${port}`);
  return server;
}

if (import.meta.main) serveAgentViewerServer();
