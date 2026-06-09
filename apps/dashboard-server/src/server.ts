import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { dirname, resolve } from "node:path";
import { artifactTimestamp } from "@decomp-orchestrator/agents/runtime";
import { createRunCheckpoint, latestCheckpointSummary } from "@decomp-orchestrator/core/handoff";
import { listProjects, projectToSummary, resolveProject, type ProjectSummary, type ResolvedProject } from "@decomp-orchestrator/core";
import { forceReportRun, type ReportRunResult } from "@decomp-orchestrator/core/report";
import { getLatestRun, getRun, openState, statusSnapshot, updateRunStatus } from "@decomp-orchestrator/core/state";
import { loadTrustedReport } from "./trusted-report.js";

type JsonObject = Record<string, unknown>;
type ReportOutcome = "exact" | "improved_stalled" | "improved_needs_fact" | "no_progress_stalled" | "no_progress_needs_fact" | "failed";
type ReportResult = "exact" | "improved" | "no_progress";
type StopReason = "target_complete" | "needs_fact" | "no_useful_hypothesis";

interface ManagedProcess {
  child: ChildProcess;
  command: string[];
  endedAt?: string;
  exitCode?: number | null;
  graphDbPath?: string;
  name: string;
  pid: number;
  pidFilePath: string;
  project?: ProjectSummary | null;
  repoRoot?: string;
  signal?: NodeJS.Signals | null;
  startedAt: string;
  state: "draining" | "running" | "stopping" | "exited";
  stateDir?: string;
}

interface ProcessLogLine {
  at: string;
  stream: "stdout" | "stderr" | "ui";
  text: string;
}

interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface FreshRunStep extends CliResult {
  command: string[];
  cwd: string;
  name: string;
}

const packageRoot = resolve(import.meta.dir, "../../..");
const defaultRepoRoot = packageRoot;
const defaultStateDir = resolve(packageRoot, ".decomp-orchestrator-state");
const binPath = resolve(packageRoot, "apps/cli/src/bin/decomp-orchestrator.ts");
const builtStaticRoot = resolve(packageRoot, "apps/dashboard/dist");
const staticRoot = builtStaticRoot;
const port = Number(Bun.env.ORCH_UI_PORT ?? 8787);
const hotReloadEnabled = /^(1|true|yes)$/i.test(Bun.env.ORCH_UI_HOT_RELOAD ?? "");
const dashboardStreamIntervalMs = Math.max(500, Math.trunc(Number(Bun.env.ORCH_UI_DASHBOARD_INTERVAL_MS ?? 2500)) || 2500);

let managed: ManagedProcess | null = null;
let freshRunActive = false;
let projectSyncActive = false;
const processLogs: ProcessLogLine[] = [];
const hotReloadClients = new Map<ReadableStreamDefaultController<Uint8Array>, ReturnType<typeof setInterval>>();
const hotReloadEncoder = new TextEncoder();
const hotReloadFilePattern = /\.(css|html|js|json|svg|png|jpe?g|webp)$/i;
let hotReloadVersion = 0;
let hotReloadTimer: ReturnType<typeof setTimeout> | null = null;
let hotReloadWatcher: FSWatcher | null = null;

function appendLog(stream: ProcessLogLine["stream"], text: string): void {
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    processLogs.push({ at: new Date().toISOString(), stream, text: raw });
  }
  if (processLogs.length > 500) processLogs.splice(0, processLogs.length - 500);
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function percentLike(value: unknown): boolean {
  const parsed = numberValue(value, NaN);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
}

function attemptHasPercentScores(attempt: JsonObject): boolean {
  const oldScore = "oldScore" in attempt ? attempt.oldScore : attempt.old_score;
  const newScore = "newScore" in attempt ? attempt.newScore : attempt.new_score;
  if (!percentLike(oldScore) || !percentLike(newScore)) return false;
  const oldValue = numberValue(oldScore, NaN);
  const newValue = numberValue(newScore, NaN);
  const delta = numberValue("delta" in attempt ? attempt.delta : null, NaN);
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0005) return true;
  const scoreMovement = newValue - oldValue;
  return Math.abs(scoreMovement) < 0.0005 || Math.sign(delta) === Math.sign(scoreMovement);
}

function timeMs(value: unknown): number {
  const text = stringValue(value);
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boolValue(value: unknown): boolean {
  return value === true || value === "true";
}

function intValue(value: unknown, fallback: number, min = 0): number {
  const parsed = Math.trunc(numberValue(value, fallback));
  return Math.max(min, parsed);
}

function powerOfTwoInt(value: unknown, fallback: number, min = 1): number {
  const parsed = intValue(value, fallback, min);
  return 2 ** Math.ceil(Math.log2(Math.max(min, parsed)));
}

function processName(value: unknown): string {
  const raw = stringValue(value, "melee-live").trim() || "melee-live";
  return raw.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "melee-live";
}

function pidFilePath(stateDir: string, name: string): string {
  return resolve(stateDir, "ui-processes", `${name}.json`);
}

function writeProcessFile(proc: ManagedProcess): void {
  mkdirSync(dirname(proc.pidFilePath), { recursive: true });
  writeFileSync(
    proc.pidFilePath,
    JSON.stringify(
      {
        name: proc.name,
        pid: proc.pid,
        processGroup: proc.pid ? -proc.pid : null,
        killCommand: proc.pid ? `kill -TERM -${proc.pid}` : null,
        state: proc.state,
        startedAt: proc.startedAt,
        endedAt: proc.endedAt ?? null,
        exitCode: proc.exitCode ?? null,
        signal: proc.signal ?? null,
        command: proc.command,
        project: proc.project ?? null,
        projectId: proc.project?.id ?? null,
        repoRoot: proc.repoRoot ?? null,
        stateDir: proc.stateDir ?? null,
        graphDbPath: proc.graphDbPath ?? null,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function updateSavedProcessFile(stateDir: string, name: string, updates: JsonObject): string {
  const path = pidFilePath(stateDir, name);
  const current = readJsonObject(path);
  const pid = intValue(updates.pid ?? current.pid, 0, 0);
  const record = {
    ...current,
    ...updates,
    name,
    pid,
    processGroup: pid ? -pid : null,
    killCommand: pid ? `kill -TERM -${pid}` : null,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(record, null, 2), "utf8");
  return path;
}

function readJsonObject(path: string): JsonObject {
  try {
    if (!path || !existsSync(path)) return {};
    return asObject(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return {};
  }
}

function processGroupAlive(pid: number): boolean {
  if (!pid) return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return asObject(error).code === "EPERM";
  }
}

function directChildPids(pid: number): number[] {
  if (!pid) return [];
  const result = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" });
  if (result.error || !result.stdout) return [];
  return result.stdout
    .split(/\s+/)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

async function waitForProcessGroupExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processGroupAlive(pid)) return true;
    await Bun.sleep(250);
  }
  return !processGroupAlive(pid);
}

function savedProcessRecords(stateDir: string): JsonObject[] {
  const dir = resolve(stateDir, "ui-processes");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const path = resolve(dir, file);
      const record = readJsonObject(path);
      const pid = intValue(record.pid, 0, 0);
      const name = processName(record.name ?? file.replace(/\.json$/, ""));
      return {
        name,
        pid,
        processGroup: pid ? -pid : null,
        killCommand: pid ? `kill -TERM -${pid}` : null,
        state: stringValue(record.state, "unknown"),
        startedAt: stringValue(record.startedAt),
        endedAt: stringValue(record.endedAt),
        exitCode: record.exitCode ?? null,
        signal: record.signal ?? null,
        command: asArray(record.command).map((item) => stringValue(item)).filter(Boolean),
        project: asObject(record.project),
        projectId: stringValue(record.projectId, stringValue(asObject(record.project).id)),
        repoRoot: stringValue(record.repoRoot),
        stateDir: stringValue(record.stateDir),
        graphDbPath: stringValue(record.graphDbPath),
        pidFilePath: path,
        alive: processGroupAlive(pid),
      };
    })
    .sort((left, right) => stringValue(right.startedAt).localeCompare(stringValue(left.startedAt)));
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

function sendHotReloadEvent(controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: JsonObject = {}): void {
  controller.enqueue(hotReloadEncoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

function closeHotReloadClient(controller: ReadableStreamDefaultController<Uint8Array>): void {
  const ping = hotReloadClients.get(controller);
  if (ping) clearInterval(ping);
  hotReloadClients.delete(controller);
}

function broadcastHotReload(path: string): void {
  hotReloadVersion += 1;
  const data = { version: hotReloadVersion, path, at: new Date().toISOString() };
  for (const controller of hotReloadClients.keys()) {
    try {
      sendHotReloadEvent(controller, "reload", data);
    } catch {
      closeHotReloadClient(controller);
    }
  }
}

function scheduleHotReload(filename: string | Buffer | null): void {
  const path = typeof filename === "string" ? filename : filename?.toString() ?? "static";
  if (path !== "static" && !hotReloadFilePattern.test(path)) return;
  if (hotReloadTimer) clearTimeout(hotReloadTimer);
  hotReloadTimer = setTimeout(() => {
    hotReloadTimer = null;
    broadcastHotReload(path || "static");
  }, 900);
}

function ensureHotReloadWatcher(): void {
  if (!hotReloadEnabled || hotReloadWatcher) return;
  try {
    const watchRoot = existsSync(builtStaticRoot) ? builtStaticRoot : staticRoot;
    hotReloadWatcher = watch(watchRoot, { persistent: false }, (_eventType, filename) => scheduleHotReload(filename));
  } catch (error) {
    appendLog("stderr", `hot reload watcher failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function hotReloadEvents(): Response {
  if (!hotReloadEnabled) return json({ error: "hot reload disabled" }, { status: 404 });
  ensureHotReloadWatcher();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      const ping = setInterval(() => {
        try {
          controller.enqueue(hotReloadEncoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          closeHotReloadClient(controller);
        }
      }, 15_000);
      hotReloadClients.set(controller, ping);
      controller.enqueue(hotReloadEncoder.encode("retry: 1000\n"));
      sendHotReloadEvent(controller, "ready", { version: hotReloadVersion });
    },
    cancel() {
      if (controllerRef) closeHotReloadClient(controllerRef);
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
}

function dashboardStableSignature(dashboard: JsonObject): string {
  return JSON.stringify(dashboard, (key, value) => (key === "elapsedMs" || key === "lastReportAgeMs" ? 0 : value));
}

function dashboardTick(dashboard: JsonObject): JsonObject {
  const summary = asObject(dashboard.runSummary);
  return {
    elapsedMs: numberValue(summary.elapsedMs),
    lastReportAgeMs: summary.lastReportAgeMs ?? null,
    at: new Date().toISOString(),
  };
}

interface DashboardProjectContext {
  project: ResolvedProject | null;
  repoRoot: string;
  stateDir: string;
  graphDbPath: string;
  usePathOverrides: boolean;
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

function availableProjects(): ProjectSummary[] {
  try {
    return listProjects({ orchestratorRoot: packageRoot });
  } catch (error) {
    appendLog("stderr", `project list failed: ${error instanceof Error ? error.message : String(error)}`);
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

function resolveDashboardProject(input: JsonObject, options: { useDefaultProject?: boolean } = {}): DashboardProjectContext {
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

function requestPaths(url: URL, options: { useDefaultProject?: boolean } = {}): DashboardProjectContext {
  return resolveDashboardProject(
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

function dashboardEvents(url: URL): Response {
  const paths = requestPaths(url, { useDefaultProject: true });
  const { repoRoot, stateDir } = paths;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let lastSignature = "";
  let closed = false;
  let inFlight = false;

  const send = (event: string, data: JsonObject): void => {
    if (!controllerRef || closed) return;
    controllerRef.enqueue(hotReloadEncoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  };

  const pushDashboard = async (force = false): Promise<void> => {
    if (!controllerRef || closed || inFlight) return;
    inFlight = true;
    try {
      const dashboard = await runDashboard(paths);
      const signature = dashboardStableSignature(dashboard);
      const payload = JSON.stringify(dashboard);
      if (force || signature !== lastSignature) {
        lastSignature = signature;
        controllerRef.enqueue(hotReloadEncoder.encode(`event: dashboard\ndata: ${payload}\n\n`));
      } else {
        send("dashboard-tick", dashboardTick(dashboard));
      }
    } catch (error) {
      send("dashboard-error", { error: error instanceof Error ? error.message : String(error) });
    } finally {
      inFlight = false;
    }
  };

  const close = (): void => {
    closed = true;
    if (interval) clearInterval(interval);
    interval = null;
    controllerRef = null;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      controller.enqueue(hotReloadEncoder.encode("retry: 1000\n"));
      send("ready", { intervalMs: dashboardStreamIntervalMs });
      void pushDashboard(true);
      interval = setInterval(() => {
        void pushDashboard(false);
      }, dashboardStreamIntervalMs);
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
}

function latestInitialSnapshot(stateDir: string, runId: string): JsonObject {
  return readJsonObject(resolve(stateDir, "runs", runId, "snapshots", "initial_board.json"));
}

function measuresFromSnapshot(snapshot: JsonObject): JsonObject {
  return asObject(snapshot.measures);
}

function compactMeasures(measures: JsonObject): JsonObject {
  return {
    fuzzy_match_percent: numberValue(measures.fuzzy_match_percent, NaN),
    matched_code_percent: numberValue(measures.matched_code_percent, NaN),
    complete_code_percent: numberValue(measures.complete_code_percent, NaN),
    matched_functions_percent: numberValue(measures.matched_functions_percent, NaN),
    complete_units: numberValue(measures.complete_units, NaN),
    total_units: numberValue(measures.total_units, NaN),
  };
}

function measureDelta(initial: JsonObject, current: JsonObject, key: string): number {
  const start = numberValue(initial[key], NaN);
  const now = numberValue(current[key], NaN);
  return Number.isFinite(start) && Number.isFinite(now) ? now - start : 0;
}

function loadCurrentBoard(repoRoot: string): { error?: string; generatedAt?: string; measures: JsonObject; candidates: unknown[]; reportPath?: string } {
  const reportPath = resolve(repoRoot, "build/GALE01/report.json");
  try {
    if (!existsSync(reportPath)) {
      return {
        error: `Missing ${reportPath}`,
        measures: {},
        candidates: [],
        reportPath,
      };
    }
    const report = readJsonObject(reportPath);
    return {
      generatedAt: statSync(reportPath).mtime.toISOString(),
      measures: compactMeasures(asObject(report.measures)),
      candidates: [],
      reportPath,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      measures: {},
      candidates: [],
      reportPath,
    };
  }
}

function sqlLimit(limit: number): string {
  const safeLimit = Math.max(0, Math.floor(limit));
  return safeLimit > 0 ? `LIMIT ${safeLimit}` : "";
}

function workerReports(stateDir: string, runId: string, limit = 100): JsonObject[] {
  const store = openState(stateDir);
  try {
    const rows = store.db
      .query(
        `
          SELECT
            worker_reports.id AS report_id,
            worker_reports.lease_id,
            worker_reports.report_type,
            worker_reports.summary_path,
            worker_reports.facts_path,
            worker_reports.blocker_path,
            worker_reports.patch_path,
            worker_reports.created_at,
            leases.worker_id,
            leases.status AS lease_status,
            queue.status AS queue_status,
            targets.unit,
            targets.symbol,
            targets.source_path,
            targets.size,
            targets.fuzzy
          FROM worker_reports
          LEFT JOIN leases ON leases.id = worker_reports.lease_id
          LEFT JOIN queue ON queue.id = leases.queue_id
          LEFT JOIN targets ON targets.id = queue.target_id
          WHERE queue.run_id = ?
          ORDER BY worker_reports.created_at DESC
          ${sqlLimit(limit)}
        `,
      )
      .all(runId) as JsonObject[];

    return rows.map((row) => {
      const report = readJsonObject(stringValue(row.summary_path));
      const agentReport = asObject(report.agent_report);
      const target = { ...row, ...asObject(report.target), ...asObject(agentReport.target) };
      const lease = asObject(agentReport.lease);
      const attempts = asArray(agentReport.attempts).map(asObject);
      const writeSet = [
        ...asArray(report.write_set).map((item) => stringValue(item)).filter(Boolean),
        ...asArray(lease.edited_paths).map((item) => stringValue(item)).filter(Boolean),
      ];
      if (writeSet.length === 0 && stringValue(target.source_path)) writeSet.push(stringValue(target.source_path));
      const scoreDelta = attempts
        .filter(attemptHasPercentScores)
        .reduce((sum, attempt) => sum + Math.max(0, numberValue(attempt.delta)), 0);
      return {
        id: row.report_id,
        leaseId: row.lease_id,
        workerId: row.worker_id,
        reportType: row.report_type,
        result: stringValue(report.result, stringValue(agentReport.result)),
        stopReason: stringValue(report.stop_reason, stringValue(agentReport.stop_reason)),
        neededFact: "needed_fact" in report ? report.needed_fact : "needed_fact" in agentReport ? agentReport.needed_fact : null,
        createdAt: stringValue(report.created_at, stringValue(row.created_at)),
        summary: stringValue(report.summary, "No summary recorded."),
        target: {
          unit: stringValue(target.unit),
          symbol: stringValue(target.symbol),
          sourcePath: stringValue(target.source_path),
          size: numberValue(target.size),
          fuzzy: numberValue(target.fuzzy, numberValue(target.fuzzy_match_percent)),
        },
        writeSet: [...new Set(writeSet)],
        attempts: attempts.map((attempt) => ({
          description: stringValue(attempt.description),
          compiled: attempt.compiled === true,
          oldScore: numberValue(attempt.old_score, NaN),
          newScore: numberValue(attempt.new_score, NaN),
          delta: numberValue(attempt.delta, 0),
          artifactPath: stringValue(attempt.artifact_path),
        })),
        scoreDelta,
        patchPath: stringValue(row.patch_path, stringValue(agentReport.patch_path)),
        acceptanceGate: asObject(report.acceptance_gate),
        runnerValidation: asObject(report.runner_validation),
        nextRecommendation: stringValue(agentReport.next_recommendation),
        leaseStatus: row.lease_status,
        queueStatus: row.queue_status,
      };
    });
  } finally {
    store.db.close();
  }
}

function touchedFilesFromReports(reports: JsonObject[]): JsonObject[] {
  const touched = new Map<string, JsonObject>();
  for (const report of reports) {
    const type = stringValue(report.reportType);
    const files = asArray(report.writeSet).map((item) => stringValue(item)).filter(Boolean);
    for (const path of files) {
      const current = touched.get(path) ?? {
        path,
        reports: 0,
        progressReports: 0,
        stalledReports: 0,
        needsFactReports: 0,
        scoreDelta: 0,
        lastAt: "",
      };
      current.reports = numberValue(current.reports) + 1;
      current.progressReports = numberValue(current.progressReports) + (type === "progress" || type === "score_candidate" ? 1 : 0);
      current.stalledReports = numberValue(current.stalledReports) + (type === "stalled_no_useful_guess" ? 1 : 0);
      current.needsFactReports = numberValue(current.needsFactReports) + (type === "needs_fact" ? 1 : 0);
      current.scoreDelta = numberValue(current.scoreDelta) + numberValue(report.scoreDelta);
      current.lastAt = stringValue(report.createdAt, stringValue(current.lastAt));
      touched.set(path, current);
    }
  }
  return [...touched.values()].sort((left, right) => stringValue(right.lastAt).localeCompare(stringValue(left.lastAt)));
}

function activeFilesForRun(stateDir: string, runId: string): JsonObject[] {
  const store = openState(stateDir);
  try {
    const rows = store.db
      .query(
        `
          SELECT
            leases.id AS lease_id,
            leases.queue_id,
            leases.worker_id,
            leases.base_rev,
            leases.ttl,
            leases.heartbeat_at,
            queue.leased_at,
            targets.id AS target_id,
            targets.unit,
            targets.symbol,
            targets.source_path,
            targets.size,
            targets.fuzzy,
            targets.matched,
            targets.complete,
            targets.priority,
            targets.reason
          FROM leases
          JOIN queue ON queue.id = leases.queue_id
          JOIN targets ON targets.id = queue.target_id
          WHERE queue.run_id = ?
            AND leases.status = 'active'
          ORDER BY queue.leased_at ASC
        `,
      )
      .all(runId) as JsonObject[];
    return rows.map((row) => ({
      leaseId: row.lease_id,
      queueId: row.queue_id,
      workerId: row.worker_id,
      baseRev: row.base_rev,
      ttl: row.ttl,
      heartbeatAt: row.heartbeat_at,
      leasedAt: row.leased_at,
      targetId: row.target_id,
      unit: stringValue(row.unit),
      symbol: stringValue(row.symbol),
      sourcePath: stringValue(row.source_path),
      size: numberValue(row.size),
      fuzzy: numberValue(row.fuzzy, NaN),
      matched: numberValue(row.matched, NaN),
      complete: numberValue(row.complete, NaN),
      priority: numberValue(row.priority, NaN),
      reason: stringValue(row.reason),
    }));
  } finally {
    store.db.close();
  }
}

function reportPositiveAttempts(report: JsonObject): JsonObject[] {
  return asArray(report.attempts)
    .map(asObject)
    .filter((attempt) => attemptHasPercentScores(attempt) && numberValue(attempt.delta) > 0);
}

function reportScoreDelta(report: JsonObject): number {
  const recorded = numberValue(report.scoreDelta, NaN);
  if (Number.isFinite(recorded)) return recorded;
  return reportPositiveAttempts(report).reduce((sum, attempt) => sum + Math.max(0, numberValue(attempt.delta)), 0);
}

function reportHasExactAttempt(report: JsonObject): boolean {
  return reportPositiveAttempts(report).some(
    (attempt) => numberValue(attempt.oldScore, NaN) < 99.99999 && numberValue(attempt.newScore, NaN) >= 99.99999,
  );
}

function reportFailed(report: JsonObject): boolean {
  const gate = asObject(report.acceptanceGate);
  const validation = asObject(report.runnerValidation);
  return gate.accepted === false || stringValue(validation.status) === "failed";
}

function reportResult(report: JsonObject): ReportResult {
  const explicit = stringValue(report.result);
  if (reportHasExactAttempt(report)) return "exact";
  if (explicit === "no_progress") return explicit;
  if (explicit === "exact" || explicit === "improved") return reportScoreDelta(report) > 0 ? "improved" : "no_progress";
  return reportScoreDelta(report) > 0 ? "improved" : "no_progress";
}

function reportStopReason(report: JsonObject, result = reportResult(report)): StopReason {
  const explicit = stringValue(report.stopReason);
  if (explicit === "target_complete" || explicit === "needs_fact" || explicit === "no_useful_hypothesis") return explicit;
  if (result === "exact") return "target_complete";
  if (stringValue(report.reportType) === "needs_fact") return "needs_fact";
  return "no_useful_hypothesis";
}

function reportOutcome(report: JsonObject): ReportOutcome {
  if (reportFailed(report)) return "failed";
  const result = reportResult(report);
  const stopReason = reportStopReason(report, result);
  if (result === "exact") return "exact";
  if (result === "improved") return stopReason === "needs_fact" ? "improved_needs_fact" : "improved_stalled";
  return stopReason === "needs_fact" ? "no_progress_needs_fact" : "no_progress_stalled";
}

function reportOutcomeCounts(reports: JsonObject[]): JsonObject {
  const counts: Record<ReportOutcome | "all", number> = {
    all: reports.length,
    exact: 0,
    improved_stalled: 0,
    improved_needs_fact: 0,
    no_progress_stalled: 0,
    no_progress_needs_fact: 0,
    failed: 0,
  };
  for (const report of reports) counts[reportOutcome(report)] += 1;
  return counts;
}

function improvementRowsFromReports(reports: JsonObject[]): JsonObject[] {
  const rows: JsonObject[] = [];
  for (const report of reports) {
    const attempts = reportPositiveAttempts(report);
    if (attempts.length === 0) continue;
    const target = asObject(report.target);
    const bestAttempt = attempts.reduce((best, attempt) => (numberValue(attempt.delta) > numberValue(best.delta) ? attempt : best), attempts[0] ?? {});
    const oldScores = attempts.map((attempt) => numberValue(attempt.oldScore, NaN)).filter(Number.isFinite);
    const newScores = attempts.map((attempt) => numberValue(attempt.newScore, NaN)).filter(Number.isFinite);
    const totalDelta = attempts.reduce((sum, attempt) => sum + numberValue(attempt.delta), 0);
    const exactMatches = attempts.filter((attempt) => numberValue(attempt.oldScore, NaN) < 99.99999 && numberValue(attempt.newScore, NaN) >= 99.99999).length;
    rows.push({
      reportId: report.id,
      reportType: report.reportType,
      createdAt: report.createdAt,
      workerId: report.workerId,
      symbol: stringValue(target.symbol),
      unit: stringValue(target.unit),
      sourcePath: stringValue(target.sourcePath, asArray(report.writeSet).map((item) => stringValue(item)).find(Boolean) ?? ""),
      summary: stringValue(report.summary),
      patchPath: stringValue(report.patchPath),
      totalDelta,
      bestDelta: numberValue(bestAttempt.delta),
      oldScore: oldScores.length ? Math.min(...oldScores) : NaN,
      newScore: newScores.length ? Math.max(...newScores) : NaN,
      attempts: attempts.length,
      exactMatches,
    });
  }
  return rows.sort((left, right) => stringValue(right.createdAt).localeCompare(stringValue(left.createdAt)));
}

function fileImprovementRows(improvements: JsonObject[]): JsonObject[] {
  const files = new Map<string, JsonObject>();
  for (const improvement of improvements) {
    const path = stringValue(improvement.sourcePath, "unknown");
    const current = files.get(path) ?? {
      path,
      reports: 0,
      symbols: new Set<string>(),
      totalDelta: 0,
      bestDelta: 0,
      bestScore: NaN,
      exactMatches: 0,
      firstAt: "",
      lastAt: "",
    };
    current.reports = numberValue(current.reports) + 1;
    current.totalDelta = numberValue(current.totalDelta) + numberValue(improvement.totalDelta);
    current.bestDelta = Math.max(numberValue(current.bestDelta), numberValue(improvement.bestDelta));
    const score = numberValue(improvement.newScore, NaN);
    current.bestScore = Number.isFinite(score) ? Math.max(numberValue(current.bestScore, -Infinity), score) : current.bestScore;
    current.exactMatches = numberValue(current.exactMatches) + numberValue(improvement.exactMatches);
    current.lastAt = stringValue(current.lastAt).localeCompare(stringValue(improvement.createdAt)) > 0 ? current.lastAt : improvement.createdAt;
    current.firstAt = stringValue(current.firstAt) && stringValue(current.firstAt).localeCompare(stringValue(improvement.createdAt)) < 0 ? current.firstAt : improvement.createdAt;
    const symbols = current.symbols instanceof Set ? current.symbols : new Set<string>();
    const symbol = stringValue(improvement.symbol);
    if (symbol) symbols.add(symbol);
    current.symbols = symbols;
    files.set(path, current);
  }
  const rows: JsonObject[] = [];
  for (const file of files.values()) {
    rows.push({
      ...file,
      symbols: [...(file.symbols instanceof Set ? file.symbols : new Set<string>())],
      bestScore: numberValue(file.bestScore, NaN),
    });
  }
  return rows.sort((left, right) => numberValue(right.totalDelta) - numberValue(left.totalDelta));
}

function runSummary(
  status: JsonObject,
  reports: JsonObject[],
  initialMeasures: JsonObject,
  currentMeasures: JsonObject,
  improvements: JsonObject[],
  trustedReport: JsonObject = {},
): JsonObject {
  const run = asObject(status.run);
  const createdAtMs = timeMs(run.createdAt);
  const lastReportAtMs = reports.reduce((latest, report) => Math.max(latest, timeMs(report.createdAt)), 0);
  const reportTypes = new Map<string, number>();
  for (const report of reports) {
    const type = stringValue(report.reportType, "unknown");
    reportTypes.set(type, (reportTypes.get(type) ?? 0) + 1);
  }
  const positiveAttempts = improvements.reduce((sum, improvement) => sum + numberValue(improvement.attempts), 0);
  const targetExactMatches = improvements.reduce((sum, improvement) => sum + numberValue(improvement.exactMatches), 0);
  const trustedCounts = asObject(trustedReport.counts);
  const reportReady = stringValue(trustedReport.status) === "ready";
  return {
    createdAt: stringValue(run.createdAt),
    elapsedMs: createdAtMs ? Math.max(0, Date.now() - createdAtMs) : 0,
    lastReportAt: lastReportAtMs ? new Date(lastReportAtMs).toISOString() : null,
    lastReportAgeMs: lastReportAtMs ? Math.max(0, Date.now() - lastReportAtMs) : null,
    totalReports: reports.length,
    reportTypes: Object.fromEntries(reportTypes),
    progressReports: numberValue(reportTypes.get("progress")) + numberValue(reportTypes.get("score_candidate")),
    stalledReports: numberValue(reportTypes.get("stalled_no_useful_guess")),
    needsFactReports: numberValue(reportTypes.get("needs_fact")),
    reportOutcomeCounts: reportOutcomeCounts(reports),
    positiveAttempts,
    improvedSymbols: improvements.length,
    improvedFiles: new Set(improvements.map((improvement) => stringValue(improvement.sourcePath)).filter(Boolean)).size,
    exactMatches: targetExactMatches,
    targetExactMatches,
    reportNewMatches: reportReady ? numberValue(trustedCounts.newMatches) : null,
    reportImprovements: reportReady ? numberValue(trustedCounts.improvements) : null,
    reportStatus: stringValue(trustedReport.status, "missing"),
    totalPositiveDelta: improvements.reduce((sum, improvement) => sum + numberValue(improvement.totalDelta), 0),
    matchedCodeDelta: measureDelta(initialMeasures, currentMeasures, "matched_code_percent"),
    completeCodeDelta: measureDelta(initialMeasures, currentMeasures, "complete_code_percent"),
    matchedFunctionDelta: measureDelta(initialMeasures, currentMeasures, "matched_functions_percent"),
    completeUnitDelta: measureDelta(initialMeasures, currentMeasures, "complete_units"),
  };
}

function eventsForRun(stateDir: string, runId: string, limit = 40): JsonObject[] {
  const store = openState(stateDir);
  try {
    return (
      store.db
        .query(
          `
            SELECT id, event_type, producer, handled_at, created_at, payload_json
            FROM events
            WHERE run_id = ?
            ORDER BY created_at DESC
            ${sqlLimit(limit)}
          `,
        )
        .all(runId) as JsonObject[]
    ).map((row) => {
      const payload = readInlineJson(stringValue(row.payload_json));
      const target = asObject(payload.target);
      return {
        id: row.id,
        eventType: row.event_type,
        producer: row.producer,
        handledAt: row.handled_at,
        createdAt: row.created_at,
        leaseId: payload.lease_id,
        reason: payload.reason,
        symbol: target.symbol,
        sourcePath: target.source_path,
      };
    });
  } finally {
    store.db.close();
  }
}

function countBy(rows: JsonObject[], key: string): JsonObject {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = stringValue(row[key], "unknown") || "unknown";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1]));
}

function piSessionsForRun(stateDir: string, runId: string): JsonObject[] {
  const store = openState(stateDir);
  try {
    return (
      store.db
        .query(
          `
            SELECT id, lease_id, role, session_id, session_file, provider, model, thinking_level, status, output_path, created_at
            FROM pi_sessions
            WHERE run_id = ?
            ORDER BY created_at DESC
          `,
        )
        .all(runId) as JsonObject[]
    ).map((row) => ({
      id: row.id,
      leaseId: row.lease_id,
      role: row.role,
      sessionId: row.session_id,
      sessionFile: row.session_file,
      provider: row.provider,
      model: row.model,
      thinkingLevel: row.thinking_level,
      status: row.status,
      outputPath: row.output_path,
      createdAt: row.created_at,
    }));
  } finally {
    store.db.close();
  }
}

function directorCyclesForRun(stateDir: string, runId: string): JsonObject[] {
  const store = openState(stateDir);
  try {
    return (
      store.db
        .query(
          `
            SELECT id, trigger_event, active_workers, summary_path, decision_path, created_at
            FROM director_cycles
            WHERE run_id = ?
            ORDER BY created_at DESC
          `,
        )
        .all(runId) as JsonObject[]
    ).map((row) => ({
      id: row.id,
      triggerEvent: row.trigger_event,
      activeWorkers: numberValue(row.active_workers),
      summaryPath: row.summary_path,
      decisionPath: row.decision_path,
      createdAt: row.created_at,
    }));
  } finally {
    store.db.close();
  }
}

function leasesForRun(stateDir: string, runId: string): JsonObject[] {
  const store = openState(stateDir);
  try {
    return (
      store.db
        .query(
          `
            SELECT
              leases.id,
              leases.queue_id,
              leases.worker_id,
              leases.base_rev,
              leases.write_set_hash,
              leases.worktree_path,
              leases.ttl,
              leases.heartbeat_at,
              leases.status,
              queue.leased_at,
              targets.unit,
              targets.symbol,
              targets.source_path
            FROM leases
            JOIN queue ON queue.id = leases.queue_id
            JOIN targets ON targets.id = queue.target_id
            WHERE queue.run_id = ?
            ORDER BY COALESCE(queue.leased_at, leases.heartbeat_at, leases.ttl) DESC
          `,
        )
        .all(runId) as JsonObject[]
    ).map((row) => ({
      id: row.id,
      queueId: row.queue_id,
      workerId: row.worker_id,
      baseRev: row.base_rev,
      writeSetHash: row.write_set_hash,
      worktreePath: row.worktree_path,
      ttl: row.ttl,
      heartbeatAt: row.heartbeat_at,
      status: row.status,
      leasedAt: row.leased_at,
      unit: row.unit,
      symbol: row.symbol,
      sourcePath: row.source_path,
    }));
  } finally {
    store.db.close();
  }
}

function queueTargetsForRun(stateDir: string, runId: string): JsonObject[] {
  const store = openState(stateDir);
  try {
    return (
      store.db
        .query(
          `
            SELECT
              queue.id AS queue_id,
              queue.priority AS queue_priority,
              queue.reason AS queue_reason,
              queue.status AS queue_status,
              queue.created_at AS queue_created_at,
              queue.leased_at,
              targets.id AS target_id,
              targets.unit,
              targets.symbol,
              targets.source_path,
              targets.size,
              targets.fuzzy,
              targets.matched,
              targets.complete,
              targets.risk,
              targets.status AS target_status,
              targets.priority AS target_priority,
              targets.reason AS target_reason,
              targets.created_at AS target_created_at
            FROM queue
            JOIN targets ON targets.id = queue.target_id
            WHERE queue.run_id = ?
            ORDER BY queue.created_at DESC
          `,
        )
        .all(runId) as JsonObject[]
    ).map((row) => ({
      queueId: row.queue_id,
      targetId: row.target_id,
      queueStatus: row.queue_status,
      targetStatus: row.target_status,
      priority: numberValue(row.queue_priority, numberValue(row.target_priority)),
      reason: stringValue(row.queue_reason, stringValue(row.target_reason)),
      createdAt: row.queue_created_at,
      leasedAt: row.leased_at,
      unit: row.unit,
      symbol: row.symbol,
      sourcePath: row.source_path,
      size: numberValue(row.size),
      fuzzy: numberValue(row.fuzzy, NaN),
      matched: numberValue(row.matched, NaN),
      complete: numberValue(row.complete, NaN),
      risk: row.risk,
    }));
  } finally {
    store.db.close();
  }
}

function checkpointForRun(stateDir: string, runId: string): JsonObject | null {
  const store = openState(stateDir);
  try {
    return latestCheckpointSummary(store, runId) as JsonObject | null;
  } finally {
    store.db.close();
  }
}

function latestChildDirectory(root: string): string {
  if (!existsSync(root)) return "";
  try {
    const dirs = readdirSync(root)
      .map((file) => resolve(root, file))
      .filter((path) => {
        try {
          return statSync(path).isDirectory();
        } catch {
          return false;
        }
      })
      .sort((left, right) => left.localeCompare(right));
    return dirs.length > 0 ? dirs[dirs.length - 1] ?? "" : "";
  } catch {
    return "";
  }
}

function latestRegressionCheckSummary(stateDir: string, runId: string): JsonObject | null {
  const artifactDir = latestChildDirectory(resolve(stateDir, "regression_checks", runId));
  if (!artifactDir) return null;
  const summaryPath = resolve(artifactDir, "summary.json");
  const summary = readJsonObject(summaryPath);
  if (!summary.status) return null;
  return {
    ...summary,
    artifactDir,
    summaryPath,
  };
}

function latestPrSplitPlanSummary(stateDir: string, runId: string): JsonObject | null {
  const artifactDir = latestChildDirectory(resolve(stateDir, "pr_handoff", runId, "split_plans"));
  if (!artifactDir) return null;
  const summaryPath = resolve(artifactDir, "summary.json");
  const summary = readJsonObject(summaryPath);
  if (!summary.status) return null;
  return {
    ...summary,
    artifactDir,
    summaryPath,
  };
}

function handoffForRun(stateDir: string, runId: string, checkpoint: JsonObject | null): JsonObject {
  return {
    checkpoint,
    qa: latestRegressionCheckSummary(stateDir, runId),
    splitPlan: latestPrSplitPlanSummary(stateDir, runId),
  };
}

function pushTimeline(timeline: JsonObject[], item: JsonObject): void {
  const at = stringValue(item.at);
  if (!at) return;
  timeline.push(item);
}

function runTimeline(params: {
  reports: JsonObject[];
  events: JsonObject[];
  sessions: JsonObject[];
  directorCycles: JsonObject[];
  leases: JsonObject[];
}): JsonObject[] {
  const timeline: JsonObject[] = [];
  for (const report of params.reports) {
    const target = asObject(report.target);
    pushTimeline(timeline, {
      kind: "worker_report",
      at: report.createdAt,
      title: stringValue(target.symbol, stringValue(target.sourcePath, "worker report")),
      path: target.sourcePath,
      detail: `${stringValue(report.reportType)} / ${stringValue(report.workerId)}`,
      delta: numberValue(report.scoreDelta),
      exactMatches: reportPositiveAttempts(report).filter(
        (attempt) => numberValue(attempt.oldScore, NaN) < 99.99999 && numberValue(attempt.newScore, NaN) >= 99.99999,
      ).length,
      id: report.id,
    });
  }
  for (const event of params.events) {
    pushTimeline(timeline, {
      kind: "event",
      at: event.createdAt,
      title: stringValue(event.eventType),
      path: event.sourcePath,
      detail: `${stringValue(event.producer)} / ${event.handledAt ? "handled" : "open"}`,
      id: event.id,
    });
  }
  for (const session of params.sessions) {
    pushTimeline(timeline, {
      kind: "pi_session",
      at: session.createdAt,
      title: `${stringValue(session.role)} session`,
      detail: `${stringValue(session.status)} / ${stringValue(session.model)}`,
      id: session.id,
    });
  }
  for (const cycle of params.directorCycles) {
    pushTimeline(timeline, {
      kind: "director_cycle",
      at: cycle.createdAt,
      title: "director cycle",
      detail: `${stringValue(cycle.triggerEvent)} / ${numberValue(cycle.activeWorkers)} active workers`,
      id: cycle.id,
    });
  }
  for (const lease of params.leases) {
    pushTimeline(timeline, {
      kind: "lease",
      at: lease.leasedAt || lease.heartbeatAt,
      title: stringValue(lease.symbol, stringValue(lease.sourcePath, "lease")),
      path: lease.sourcePath,
      detail: `${stringValue(lease.status)} / ${stringValue(lease.workerId)}`,
      id: lease.id,
    });
  }
  return timeline.sort((left, right) => timeMs(right.at) - timeMs(left.at));
}

function runDetails(stateDir: string, explicitRunId = "", project: ResolvedProject | null = null): JsonObject {
  const store = openState(stateDir);
  let status: JsonObject;
  let runId = explicitRunId;
  try {
    status = statusSnapshot(store);
    const run = asObject(status.run);
    if (!runId) runId = stringValue(run.id);
  } finally {
    store.db.close();
  }
  if (!runId) return { project: project ? projectToSummary(project) : null, stateDir, status, runId: "", summary: {}, timeline: [] };

  const reports = workerReports(stateDir, runId, 0);
  const events = eventsForRun(stateDir, runId, 0);
  const sessions = piSessionsForRun(stateDir, runId);
  const directorCycles = directorCyclesForRun(stateDir, runId);
  const leases = leasesForRun(stateDir, runId);
  const queueTargets = queueTargetsForRun(stateDir, runId);
  const improvements = improvementRowsFromReports(reports);
  const improvedFiles = fileImprovementRows(improvements);
  const timeline = runTimeline({ reports, events, sessions, directorCycles, leases });
  const exactMatches = improvements.reduce((sum, improvement) => sum + numberValue(improvement.exactMatches), 0);

  return {
    project: project ? projectToSummary(project) : null,
    stateDir,
    runId,
    generatedAt: new Date().toISOString(),
    status,
    summary: {
      workerReports: reports.length,
      reportOutcomeCounts: reportOutcomeCounts(reports),
      positiveAttempts: improvements.reduce((sum, improvement) => sum + numberValue(improvement.attempts), 0),
      exactMatches,
      improvedFiles: improvedFiles.length,
      improvedSymbols: improvements.length,
      totalPositiveDelta: improvements.reduce((sum, improvement) => sum + numberValue(improvement.totalDelta), 0),
      events: events.length,
      piSessions: sessions.length,
      directorCycles: directorCycles.length,
      leases: leases.length,
      queueRows: queueTargets.length,
      targets: new Set(queueTargets.map((row) => stringValue(row.targetId)).filter(Boolean)).size,
    },
    reportTypes: countBy(reports, "reportType"),
    eventTypes: countBy(events, "eventType"),
    sessionRoles: countBy(sessions, "role"),
    sessionStatuses: countBy(sessions, "status"),
    leaseStatuses: countBy(leases, "status"),
    queueStatuses: countBy(queueTargets, "queueStatus"),
    targetStatuses: countBy(queueTargets, "targetStatus"),
    timeline,
    reports,
    events,
    sessions,
    directorCycles,
    leases,
    queueTargets,
    improvements,
    improvedFiles,
  };
}

function readInlineJson(textValue: string): JsonObject {
  try {
    return asObject(JSON.parse(textValue));
  } catch {
    return {};
  }
}

async function runDashboard(paths: DashboardProjectContext): Promise<JsonObject> {
  const { repoRoot, stateDir } = paths;
  const store = openState(stateDir);
  let status: JsonObject;
  let runId = "";
  let runCreatedAt = "";
  try {
    status = statusSnapshot(store);
    const run = asObject(status.run);
    runId = stringValue(run.id);
    runCreatedAt = stringValue(run.createdAt);
  } finally {
    store.db.close();
  }

  const initialSnapshot = runId ? latestInitialSnapshot(stateDir, runId) : {};
  const initialMeasures = compactMeasures(measuresFromSnapshot(initialSnapshot));
  const currentBoard = loadCurrentBoard(repoRoot);
  const reports = runId ? workerReports(stateDir, runId, 100) : [];
  const allReports = runId ? workerReports(stateDir, runId, 0) : [];
  const progressReports = reports.filter((report) => stringValue(report.reportType) === "progress" || stringValue(report.reportType) === "score_candidate");
  const improvements = improvementRowsFromReports(allReports);
  const improvedFiles = fileImprovementRows(improvements);
  const queueTargets = runId ? queueTargetsForRun(stateDir, runId) : [];
  const trustedReport = runScopedTrustedReport(repoRoot, (await loadTrustedReport(repoRoot)) as unknown as JsonObject, runCreatedAt);
  const checkpoint = runId ? checkpointForRun(stateDir, runId) : null;
  const handoff = runId ? handoffForRun(stateDir, runId, checkpoint) : { checkpoint: null, qa: null, splitPlan: null };

  return {
    project: paths.project ? projectToSummary(paths.project) : null,
    projectWarnings: paths.project?.warnings ?? [],
    repoRoot,
    stateDir,
    graphDbPath: paths.graphDbPath,
    usePathOverrides: paths.usePathOverrides,
    status,
    initial: {
      generatedAt: initialSnapshot.generatedAt ?? null,
      measures: initialMeasures,
    },
    current: currentBoard,
    trustedReport,
    checkpoint,
    handoff,
    runSummary: runSummary(status, allReports, initialMeasures, currentBoard.measures, improvements, trustedReport as unknown as JsonObject),
    improvements,
    improvedFiles,
    activeFiles: runId ? activeFilesForRun(stateDir, runId) : [],
    queueTargets,
    reports,
    progressReports,
    touchedFiles: touchedFilesFromReports(allReports),
    events: runId ? eventsForRun(stateDir, runId, 40) : [],
    process: processStatus(stateDir, paths.project),
  };
}

function processStatus(stateDir = defaultStateDir, project: ResolvedProject | null = null): JsonObject {
  return {
    project: project ? projectToSummary(project) : null,
    running: managed?.state === "running" || managed?.state === "stopping" || managed?.state === "draining",
    state: managed?.state ?? "idle",
    name: managed?.name ?? null,
    pid: managed?.pid ?? null,
    processGroup: managed?.pid ? -managed.pid : null,
    killCommand: managed?.pid ? `kill -TERM -${managed.pid}` : null,
    pidFilePath: managed?.pidFilePath ?? null,
    startedAt: managed?.startedAt ?? null,
    endedAt: managed?.endedAt ?? null,
    exitCode: managed?.exitCode ?? null,
    signal: managed?.signal ?? null,
    command: managed?.command ?? [],
    repoRoot: managed?.repoRoot ?? project?.repoRoot ?? null,
    stateDir: managed?.stateDir ?? stateDir,
    graphDbPath: managed?.graphDbPath ?? project?.graphDbPath ?? null,
    logs: processLogs.slice(-220),
    knownProcesses: savedProcessRecords(stateDir),
    freshRunActive,
    projectSyncActive,
  };
}

function cliPrefix(paths: DashboardProjectContext): string[] {
  const command = ["bun", binPath];
  if (paths.project) command.push("--project", paths.project.projectId);
  command.push("--repo-root", paths.repoRoot, "--state-dir", paths.stateDir);
  return command;
}

function commandFromBody(body: JsonObject): { command: string[]; name: string; repoRoot: string; stateDir: string; graphDbPath: string; project: ResolvedProject | null; runId: string } {
  const paths = resolveDashboardProject(body, { useDefaultProject: true });
  const { graphDbPath, project, repoRoot, stateDir } = paths;
  const runId = stringValue(body.runId);
  const name = processName(stringValue(body.processName, project?.processName ?? "melee-live"));
  const provider = stringValue(body.provider, "codex-lb");
  const model = stringValue(body.model, "gpt-5.5");
  const thinkingLevel = stringValue(body.thinkingLevel, "medium");
  const workerThinkingLevel = stringValue(body.workerThinkingLevel, "medium");
  const maxWorkers = intValue(body.maxWorkers, 16, 1);
  const candidateLimit = intValue(body.candidateLimit, project?.dashboard.candidateLimit ?? 64, 1);
  const queueTargetSize = intValue(body.queueTargetSize, project?.dashboard.queueTargetSize ?? candidateLimit, 1);
  const queueLowWatermark = Math.min(queueTargetSize, intValue(body.queueLowWatermark, project?.dashboard.queueLowWatermark ?? Math.ceil(queueTargetSize * 0.25), 1));
  const candidateWindow = intValue(body.candidateWindow, project?.dashboard.candidateWindow ?? Math.max(candidateLimit, queueTargetSize * 8), 1);
  const idleSleepMs = intValue(body.idleSleepMs, 5000, 100);
  const command = [
    ...cliPrefix(paths),
    "--provider",
    provider,
    "--model",
    model,
    "--thinking-level",
    thinkingLevel,
  ];
  if (boolValue(body.dryRunAgents)) command.push("--dry-run-agents");
  if (numberValue(body.agentTimeoutSeconds) > 0) command.push("--agent-timeout-seconds", String(intValue(body.agentTimeoutSeconds, 0, 0)));
  command.push(
    "babysit",
    "--max-workers",
    String(maxWorkers),
    "--idle-sleep-ms",
    String(idleSleepMs),
    "--worker-thinking-level",
    workerThinkingLevel,
    "--candidate-limit",
    String(candidateLimit),
    "--queue-target-size",
    String(queueTargetSize),
    "--candidate-window",
    String(candidateWindow),
    "--queue-refresh-interval-ms",
    "60000",
    "--queue-low-watermark",
    String(queueLowWatermark),
    "--schedulable-low-watermark",
    String(maxWorkers),
    "--graph-db",
    graphDbPath,
    "--force-recover-leases",
  );
  if (runId) command.push("--run-id", runId);
  return { command, name, repoRoot, stateDir, graphDbPath, project, runId };
}

function spawnManaged(command: string[], stateDir: string, name: string, project: ResolvedProject | null): ManagedProcess {
  const child = spawn(command[0] ?? "bun", command.slice(1), {
    cwd: packageRoot,
    detached: true,
    env: process.env,
    argv0: `orch-${name}`,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const pid = child.pid ?? 0;
  const proc: ManagedProcess = {
    child,
    command,
    graphDbPath: project?.graphDbPath,
    name,
    pid,
    pidFilePath: pidFilePath(stateDir, name),
    project: project ? projectToSummary(project) : null,
    repoRoot: project?.repoRoot,
    startedAt: new Date().toISOString(),
    state: "running",
    stateDir,
  };
  writeProcessFile(proc);
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => appendLog("stdout", String(chunk)));
  child.stderr?.on("data", (chunk) => appendLog("stderr", String(chunk)));
  child.on("exit", (code, signal) => {
    proc.state = "exited";
    proc.exitCode = code;
    proc.signal = signal;
    proc.endedAt = new Date().toISOString();
    writeProcessFile(proc);
    appendLog("ui", `process exited code=${code ?? "null"} signal=${signal ?? "null"}`);
  });
  appendLog("ui", `started ${name} pid=${pid}: ${command.join(" ")}`);
  return proc;
}

async function runCli(command: string[], cwd = packageRoot): Promise<CliResult> {
  const child = spawn(command[0] ?? "bun", command.slice(1), {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    const value = String(chunk);
    stdoutChunks.push(value);
    appendLog("stdout", value);
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => {
    const value = String(chunk);
    stderrChunks.push(value);
    appendLog("stderr", value);
  });
  const exitCode = await new Promise<number | null>((resolveExit) => child.on("close", (code) => resolveExit(code)));
  return { exitCode, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") };
}

function outputTail(textValue: string, maxLength = 2000): string {
  if (textValue.length <= maxLength) return textValue;
  return `...${textValue.slice(textValue.length - maxLength)}`;
}

async function runGit(repoRoot: string, args: string[], options: { check?: boolean; failureHint?: string } = {}): Promise<CliResult> {
  const result = await runCli(["git", ...args], repoRoot);
  if (options.check !== false && result.exitCode !== 0) {
    throw new Error(`${options.failureHint ?? `git ${args.join(" ")} failed`} (${result.exitCode}): ${outputTail(result.stderr || result.stdout, 4000)}`);
  }
  return result;
}

function parseBaseRef(baseRef: string): { branch: string; remote: string } {
  const slash = baseRef.indexOf("/");
  if (slash <= 0 || slash === baseRef.length - 1) return { remote: "origin", branch: "master" };
  return { remote: baseRef.slice(0, slash), branch: baseRef.slice(slash + 1) };
}

function mergedPullRequestNumbers(logText: string): number[] {
  const numbers = new Set<number>();
  for (const match of logText.matchAll(/^Merge (?:pull request|PR) #(\d+)/gim)) {
    numbers.add(Number(match[1]));
  }
  return [...numbers].filter(Number.isFinite).sort((a, b) => a - b);
}

async function syncProjectGitAndFindMergedPrs(paths: DashboardProjectContext): Promise<{ afterRef: string; beforeRef: string; branch: string; mergedPrs: number[]; steps: JsonObject[] }> {
  const baseRef = paths.project?.baseRef ?? "origin/master";
  const { branch: mainBranch, remote } = parseBaseRef(baseRef);
  const before = await runGit(paths.repoRoot, ["rev-parse", "--verify", baseRef], { check: false });
  const beforeRef = before.exitCode === 0 ? before.stdout.trim() : "";
  const steps: JsonObject[] = [
    {
      name: "read_previous_base_ref",
      command: ["git", "rev-parse", "--verify", baseRef],
      exitCode: before.exitCode,
      stdout: outputTail(before.stdout, 2000),
      stderr: outputTail(before.stderr, 2000),
    },
  ];

  appendLog("ui", `git fetch ${remote} started`);
  const fetch = await runGit(paths.repoRoot, ["fetch", "--prune", remote], { failureHint: `Unable to fetch ${remote}` });
  appendLog("ui", `git fetch ${remote} complete`);
  steps.push({ name: "git_fetch", command: ["git", "fetch", "--prune", remote], exitCode: fetch.exitCode, stdout: outputTail(fetch.stdout, 2000), stderr: outputTail(fetch.stderr, 2000) });

  const branchResult = await runGit(paths.repoRoot, ["branch", "--show-current"], { failureHint: "Unable to read current branch" });
  const branch = branchResult.stdout.trim();
  if (!branch) throw new Error("Cannot sync merged PR intake from a detached HEAD checkout.");

  const syncArgs = branch === mainBranch ? ["pull", "--ff-only", remote, mainBranch] : ["rebase", "--autostash", baseRef];
  appendLog("ui", `git ${syncArgs.join(" ")} started`);
  const sync = await runGit(paths.repoRoot, syncArgs, { failureHint: `Unable to sync branch ${branch}` });
  appendLog("ui", `git ${syncArgs.join(" ")} complete`);
  steps.push({ name: "git_sync", command: ["git", ...syncArgs], exitCode: sync.exitCode, stdout: outputTail(sync.stdout, 2000), stderr: outputTail(sync.stderr, 2000) });

  const after = await runGit(paths.repoRoot, ["rev-parse", "--verify", baseRef], { failureHint: `Unable to read ${baseRef} after sync` });
  const afterRef = after.stdout.trim();
  if (!beforeRef || beforeRef === afterRef) {
    return { afterRef, beforeRef, branch, mergedPrs: [], steps };
  }

  const range = `${beforeRef}..${afterRef}`;
  const log = await runGit(paths.repoRoot, ["log", "--first-parent", "--merges", "--format=%B", range], { failureHint: `Unable to inspect merged PRs in ${range}` });
  const mergedPrs = mergedPullRequestNumbers(log.stdout);
  appendLog("ui", mergedPrs.length ? `merged PRs newly landed: ${mergedPrs.map((number) => `#${number}`).join(", ")}` : "no merged PR numbers found in newly pulled commits");
  steps.push({ name: "discover_merged_prs", command: ["git", "log", "--first-parent", "--merges", "--format=%B", range], exitCode: log.exitCode, stdout: outputTail(log.stdout, 4000), stderr: outputTail(log.stderr, 2000), mergedPrs });
  return { afterRef, beforeRef, branch, mergedPrs, steps };
}

function zeroTrustedCounts(): JsonObject {
  return {
    newMatches: 0,
    brokenMatches: 0,
    improvements: 0,
    fuzzyRegressions: 0,
    metricRegressions: 0,
    metricProgressions: 0,
  };
}

function staleTrustedReport(report: JsonObject, reason: string): JsonObject {
  return {
    ...report,
    status: "stale",
    staleReason: reason,
    counts: zeroTrustedCounts(),
    newMatches: [],
    brokenMatches: [],
    improvements: [],
    fuzzyRegressions: [],
    metricRegressions: [],
    metricProgressions: [],
  };
}

function runScopedTrustedReport(repoRoot: string, report: JsonObject, runCreatedAt: string): JsonObject {
  if (stringValue(report.status) !== "ready") return report;
  const reportMs = timeMs(report.generatedAt);
  const runMs = timeMs(runCreatedAt);
  const baselinePath = resolve(repoRoot, "build/GALE01/baseline.json");
  const baselineMs = existsSync(baselinePath) ? statSync(baselinePath).mtime.getTime() : 0;
  if (reportMs > 0 && runMs > 0 && reportMs < runMs) {
    return staleTrustedReport(report, "report_changes.json was generated before the current run");
  }
  if (reportMs > 0 && baselineMs > 0 && reportMs < baselineMs) {
    return staleTrustedReport(report, "report_changes.json is older than baseline.json");
  }
  return report;
}

function waitForExit(proc: ManagedProcess, timeoutMs: number): Promise<boolean> {
  if (proc.state === "exited") return Promise.resolve(true);
  return new Promise((resolveWait) => {
    const timeout = setTimeout(() => resolveWait(false), timeoutMs);
    proc.child.once("exit", () => {
      clearTimeout(timeout);
      resolveWait(true);
    });
  });
}

async function stopManaged(body: JsonObject): Promise<JsonObject> {
  const paths = resolveDashboardProject(body, { useDefaultProject: true });
  const { repoRoot, stateDir } = paths;
  const runId = stringValue(body.runId) || latestRunId(stateDir);
  const name = processName(stringValue(body.processName, paths.project?.processName ?? "melee-live"));
  let stopped = false;

  if (managed && managed.state !== "exited") {
    managed.state = "stopping";
    writeProcessFile(managed);
    appendLog("ui", "stop requested");
    if (managed.pid) {
      try {
        process.kill(-managed.pid, "SIGTERM");
      } catch (error) {
        appendLog("stderr", `SIGTERM failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const graceful = await waitForExit(managed, 5000);
    if (!graceful && managed.pid) {
      try {
        process.kill(-managed.pid, "SIGKILL");
        appendLog("ui", "sent SIGKILL to process group");
      } catch (error) {
        appendLog("stderr", `SIGKILL failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      await waitForExit(managed, 2000);
    }
    stopped = true;
  } else {
    const saved = savedProcessRecords(stateDir).find((record) => stringValue(record.name) === name);
    const pid = intValue(saved?.pid, 0, 0);
    if (!pid || saved?.alive !== true) return { stopped: false, reason: "not_running", process: processStatus(stateDir, paths.project) };
    updateSavedProcessFile(stateDir, name, { state: "stopping", pid });
    appendLog("ui", `stop requested for saved process ${name} pid=${pid}`);
    try {
      process.kill(-pid, "SIGTERM");
    } catch (error) {
      appendLog("stderr", `SIGTERM failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    let exited = await waitForProcessGroupExit(pid, 5000);
    let signal = "SIGTERM";
    if (!exited) {
      try {
        process.kill(-pid, "SIGKILL");
        appendLog("ui", `sent SIGKILL to saved process group ${pid}`);
      } catch (error) {
        appendLog("stderr", `SIGKILL failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      signal = "SIGKILL";
      exited = await waitForProcessGroupExit(pid, 2000);
    }
    updateSavedProcessFile(stateDir, name, {
      state: exited ? "exited" : "stopping",
      endedAt: exited ? new Date().toISOString() : null,
      signal,
    });
    stopped = true;
  }

  let recovery: JsonObject | null = null;
  if (runId && body.recoverLeases !== false) {
    const command = [
      ...cliPrefix(paths),
      "recover-leases",
      "--run-id",
      runId,
      "--force",
      "--reason",
      "ui stop requested",
    ];
    const result = await runCli(command);
    recovery = { command, ...result };
    appendLog("ui", `recover-leases exit=${result.exitCode}`);
  }
  return { stopped, recovery, process: processStatus(stateDir, paths.project) };
}

async function drainManaged(body: JsonObject): Promise<JsonObject> {
  const paths = resolveDashboardProject(body, { useDefaultProject: true });
  const stateDir = paths.stateDir;
  const name = processName(stringValue(body.processName, paths.project?.processName ?? "melee-live"));
  const saved = savedProcessRecords(stateDir).find((record) => stringValue(record.name) === name);
  const pid = managed && managed.state !== "exited" ? managed.pid : intValue(saved?.pid, 0, 0);
  if (!pid || !processGroupAlive(pid)) return { draining: false, reason: "not_running", process: processStatus(stateDir, paths.project) };

  const children = directChildPids(pid);
  if (managed && managed.pid === pid && managed.state !== "exited") {
    managed.state = "draining";
    writeProcessFile(managed);
  } else {
    updateSavedProcessFile(stateDir, name, { state: "draining", pid, drainRequestedAt: new Date().toISOString() });
  }

  appendLog("ui", `drain requested for ${name} pid=${pid}`);
  const signaled: number[] = [];
  if (children.length > 0) {
    for (const childPid of children) {
      try {
        process.kill(childPid, "SIGTERM");
        signaled.push(childPid);
      } catch (error) {
        appendLog("stderr", `soft SIGTERM failed for child ${childPid}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } else {
    try {
      process.kill(pid, "SIGTERM");
      signaled.push(pid);
    } catch (error) {
      appendLog("stderr", `soft SIGTERM failed for process ${pid}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (children.length > 0) {
    try {
      process.kill(pid, "SIGKILL");
      appendLog("ui", `stopped supervisor ${pid}; workers remain in process group to finish`);
    } catch (error) {
      appendLog("stderr", `supervisor stop failed for ${pid}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { draining: signaled.length > 0, signaled, process: processStatus(stateDir, paths.project) };
}

function latestRunId(stateDir: string): string {
  const store = openState(stateDir);
  try {
    return getLatestRun(store)?.id ?? "";
  } finally {
    store.db.close();
  }
}

function initRunCommand(body: JsonObject): { command: string[]; repoRoot: string; stateDir: string; graphDbPath: string; project: ResolvedProject | null } {
  const paths = resolveDashboardProject(body, { useDefaultProject: true });
  const { graphDbPath, project, repoRoot, stateDir } = paths;
  const command = [
    ...cliPrefix(paths),
    ...(boolValue(body.dryRunAgents) ? ["--dry-run-agents"] : []),
    "init-run",
    "--desired-workers",
    String(intValue(body.desiredWorkers, intValue(body.maxWorkers, 16, 1), 1)),
    "--candidate-limit",
    String(intValue(body.candidateLimit, project?.dashboard.candidateLimit ?? 64, 1)),
    "--goal-kind",
    stringValue(body.goalKind, "matched_code_percent"),
    "--goal-value",
    String(numberValue(body.goalValue, project?.dashboard.goalValue ?? 100)),
    "--graph-db",
    graphDbPath,
  ];
  return { command, repoRoot, stateDir, graphDbPath, project };
}

async function initRun(body: JsonObject): Promise<JsonObject> {
  const init = initRunCommand(body);
  const { command } = init;
  appendLog("ui", `init-run started: ${command.join(" ")}`);
  const result = await runCli(command);
  appendLog("ui", `init-run exit=${result.exitCode}`);
  if (result.exitCode !== 0) {
    throw new Error(`init-run failed (${result.exitCode ?? "signal"}): ${result.stderr || result.stdout || "no output"}`);
  }
  return {
    project: init.project ? projectToSummary(init.project) : null,
    command,
    parsed: parseCliJsonOutput(result.stdout),
    ...result,
  };
}

async function runFreshStep(steps: FreshRunStep[], name: string, command: string[], cwd: string): Promise<void> {
  appendLog("ui", `${name} started: ${command.join(" ")}`);
  const result = await runCli(command, cwd);
  appendLog("ui", `${name} exit=${result.exitCode}`);
  const step = {
    name,
    command,
    cwd,
    exitCode: result.exitCode,
    stdout: outputTail(result.stdout, 4000),
    stderr: outputTail(result.stderr, 4000),
  };
  steps.push(step);
  if (result.exitCode !== 0) {
    throw new Error(`${name} failed (${result.exitCode ?? "signal"}): ${outputTail(result.stderr || result.stdout || "no output")}`);
  }
}

function compactReportRunResult(result: ReportRunResult): JsonObject {
  return {
    baselinePath: result.baselinePath,
    reportChangesPath: result.reportChangesPath,
    reportPath: result.reportPath,
    resetBaseline: result.resetBaseline,
    timestamps: result.timestamps,
    steps: result.steps.map((step) => ({
      name: step.name,
      command: step.command,
      exitCode: step.exitCode,
      stdout: outputTail(step.stdout, 1000),
      stderr: outputTail(step.stderr, 1000),
    })),
  };
}

function compactCheckpointResult(result: ReturnType<typeof createRunCheckpoint>): JsonObject {
  return {
    checkpoint: result.checkpoint,
    counts: result.counts,
    prCandidates: result.items
      .filter((item) => item.disposition === "pr_candidate")
      .map((item) => ({
        reportId: item.reportId,
        symbol: item.symbol,
        sourcePath: item.sourcePath,
        patchPath: item.patchPath || null,
      })),
    carryForwardCount: result.items.filter((item) => item.disposition !== "pr_candidate").length,
  };
}

function parseCliJsonOutput(stdout: string): JsonObject {
  const trimmed = stdout.trim();
  if (!trimmed) return {};
  try {
    return asObject(JSON.parse(trimmed));
  } catch {
    return {};
  }
}

function activeRunIdFromBody(body: JsonObject, stateDir: string): string {
  const runId = stringValue(body.runId) || latestRunId(stateDir);
  if (!runId) throw new Error("No run found. Run init-run first.");
  return runId;
}

function prGroupMode(value: unknown): string {
  const groupMode = stringValue(value, "melee-subsystem");
  return groupMode === "top-dir" ? groupMode : "melee-subsystem";
}

function prHandoffRoot(stateDir: string, runId: string, kind: string): string {
  return resolve(stateDir, "pr_handoff", runId, kind, artifactTimestamp());
}

async function pauseRunForPr(body: JsonObject): Promise<JsonObject> {
  const paths = resolveDashboardProject(body, { useDefaultProject: true });
  const { repoRoot, stateDir } = paths;
  const runId = activeRunIdFromBody(body, stateDir);
  const drain = await drainManaged({ ...body, repoRoot, stateDir, runId });
  const store = openState(stateDir);
  try {
    const run = updateRunStatus(store, runId, "paused", "ui");
    appendLog("ui", `run ${runId} paused for PR handoff`);
    return { paused: true, project: paths.project ? projectToSummary(paths.project) : null, repoRoot, stateDir, run, drain };
  } finally {
    store.db.close();
  }
}

function resumeRunForPr(body: JsonObject): JsonObject {
  const paths = resolveDashboardProject(body, { useDefaultProject: true });
  const { repoRoot, stateDir } = paths;
  const runId = activeRunIdFromBody(body, stateDir);
  const store = openState(stateDir);
  try {
    const run = updateRunStatus(store, runId, "active", "ui");
    appendLog("ui", `run ${runId} resumed after PR handoff pause`);
    return { resumed: true, project: paths.project ? projectToSummary(paths.project) : null, repoRoot, stateDir, run };
  } finally {
    store.db.close();
  }
}

function checkpointRunForPr(body: JsonObject): JsonObject {
  const paths = resolveDashboardProject(body, { useDefaultProject: true });
  const stateDir = paths.stateDir;
  const runId = activeRunIdFromBody(body, stateDir);
  appendLog("ui", `PR checkpoint started for run ${runId}`);
  const store = openState(stateDir);
  try {
    const result = compactCheckpointResult(
      createRunCheckpoint(store, runId, {
        title: "PR handoff checkpoint",
      }),
    );
    appendLog("ui", `PR checkpoint complete for run ${runId}`);
    return { project: paths.project ? projectToSummary(paths.project) : null, ...result };
  } finally {
    store.db.close();
  }
}

async function runPrQa(body: JsonObject): Promise<JsonObject> {
  const paths = resolveDashboardProject(body, { useDefaultProject: true });
  const { stateDir } = paths;
  const runId = activeRunIdFromBody(body, stateDir);
  const target = stringValue(body.qaTarget, paths.project?.validation.qaTarget ?? "changes_all").trim() || "changes_all";
  if (target.startsWith("-") || /\s/.test(target)) throw new Error("QA target must be one Ninja target name.");
  const command = [
    ...cliPrefix(paths),
    "regression-check",
    "--run-id",
    runId,
    "--target",
    target,
    "--report-title",
    stringValue(body.qaReportTitle, "Report for GALE01 PR handoff"),
    "--report-max-rows",
    String(intValue(body.qaReportMaxRows, 300, 0)),
  ];
  if (body.requirePrPromotion !== false) command.push("--require-pr-promotion");
  appendLog("ui", `PR QA started: ${command.join(" ")}`);
  const result = await runCli(command);
  appendLog("ui", `PR QA exit=${result.exitCode}`);
  const parsed = parseCliJsonOutput(result.stdout);
  const latest = latestRegressionCheckSummary(stateDir, runId) ?? {};
  return {
    ...latest,
    ...parsed,
    uiCommand: command,
    cliExitCode: result.exitCode,
    stdout: outputTail(result.stdout, 4000),
    stderr: outputTail(result.stderr, 4000),
  };
}

async function runPrSplitPlan(body: JsonObject): Promise<JsonObject> {
  const paths = resolveDashboardProject(body, { useDefaultProject: true });
  const { stateDir } = paths;
  const runId = activeRunIdFromBody(body, stateDir);
  const artifactDir = prHandoffRoot(stateDir, runId, "split_plans");
  const outputPath = resolve(artifactDir, "pr_split_plan.md");
  const summaryPath = resolve(artifactDir, "summary.json");
  mkdirSync(artifactDir, { recursive: true });
  const command = [
    ...cliPrefix(paths),
    "pr-split-plan",
    "--base-ref",
    stringValue(body.prBaseRef, paths.project?.baseRef ?? "origin/master").trim() || "origin/master",
    "--group-mode",
    prGroupMode(stringValue(body.prGroupMode, paths.project?.pr.groupMode ?? "melee-subsystem")),
    "--max-files-per-pr",
    String(intValue(body.prMaxFilesPerPr, paths.project?.pr.maxFilesPerPr ?? 30, 1)),
    "--branch-prefix",
    stringValue(body.prBranchPrefix, paths.project?.pr.branchPrefix ?? "pr-split").trim() || "pr-split",
    "--title-prefix",
    stringValue(body.prTitlePrefix, paths.project?.pr.titlePrefix ?? "Melee decomp"),
    "--output",
    outputPath,
  ];
  if (boolValue(body.prCommittedOnly)) command.push("--committed-only");
  if (body.prIncludeUntracked === false) command.push("--no-untracked");
  appendLog("ui", `PR split plan started: ${command.join(" ")}`);
  const result = await runCli(command);
  appendLog("ui", `PR split plan exit=${result.exitCode}`);
  const summary = {
    status: result.exitCode === 0 ? "passed" : "failed",
    runId,
    project: paths.project ? projectToSummary(paths.project) : null,
    repoRoot: paths.repoRoot,
    stateDir,
    artifactDir,
    outputPath,
    summaryPath,
    baseRef: stringValue(body.prBaseRef, paths.project?.baseRef ?? "origin/master").trim() || "origin/master",
    groupMode: prGroupMode(stringValue(body.prGroupMode, paths.project?.pr.groupMode ?? "melee-subsystem")),
    maxFilesPerPr: intValue(body.prMaxFilesPerPr, paths.project?.pr.maxFilesPerPr ?? 30, 1),
    command,
    exitCode: result.exitCode,
    stdout: outputTail(result.stdout, 4000),
    stderr: outputTail(result.stderr, 4000),
    createdAt: new Date().toISOString(),
  };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  return summary;
}

async function preparePrHandoff(body: JsonObject): Promise<JsonObject> {
  const paths = resolveDashboardProject(body, { useDefaultProject: true });
  const stateDir = paths.stateDir;
  const runId = activeRunIdFromBody(body, stateDir);
  const pause = body.pauseBeforeHandoff !== false ? await pauseRunForPr(body) : null;
  const checkpoint = checkpointRunForPr({ ...body, stateDir, runId });
  const qa = await runPrQa({ ...body, stateDir, runId });
  const qaPassed = stringValue(qa.status) === "passed" && numberValue(qa.cliExitCode, 1) === 0;
  const splitPlan = qaPassed ? await runPrSplitPlan({ ...body, stateDir, runId }) : null;
  return {
    prepared: qaPassed && stringValue(splitPlan?.status) === "passed",
    project: paths.project ? projectToSummary(paths.project) : null,
    blockedAt: qaPassed ? (stringValue(splitPlan?.status) === "passed" ? null : "split_plan") : "qa",
    runId,
    pause,
    checkpoint,
    qa,
    splitPlan,
  };
}

async function runReportNow(body: JsonObject): Promise<JsonObject> {
  const paths = resolveDashboardProject(body, { useDefaultProject: true });
  const repoRoot = paths.repoRoot;
  const resetBaseline = boolValue(body.resetBaseline);
  appendLog("ui", `report-run${resetBaseline ? " --reset-baseline" : ""} started`);
  const result = await forceReportRun(repoRoot, { resetBaseline });
  appendLog("ui", `report-run${resetBaseline ? " --reset-baseline" : ""} complete`);
  return { project: paths.project ? projectToSummary(paths.project) : null, ...compactReportRunResult(result) };
}

async function freshRun(body: JsonObject): Promise<JsonObject> {
  if (freshRunActive) {
    throw new Error("Fresh Run is already running. Wait for it to finish before starting another one.");
  }
  freshRunActive = true;
  const paths = resolveDashboardProject(body, { useDefaultProject: true });
  const { repoRoot, stateDir } = paths;
  try {
    const name = processName(stringValue(body.processName, paths.project?.processName ?? "melee-live"));
    const activeManaged = managed?.state === "running" || managed?.state === "stopping" || managed?.state === "draining";
    const activeSaved = savedProcessRecords(stateDir).find((record) => record.alive === true);
    if (activeManaged || activeSaved) {
      const activeName = stringValue(activeSaved?.name, managed?.name ?? name);
      throw new Error(`Stop the active process (${activeName}) before starting a fresh run.`);
    }

    const steps: FreshRunStep[] = [];
    const resetReportBaseline = body.resetReportBaseline !== false;
    const refreshPrLibrary = body.refreshPrLibrary !== false;
    const checkpointBeforeFresh = body.checkpointBeforeFresh !== false;
    let reportRunResult: JsonObject | null = null;
    let checkpointResult: JsonObject | null = null;

    if (checkpointBeforeFresh) {
      const runId = stringValue(body.runId) || latestRunId(stateDir);
      if (runId) {
        appendLog("ui", `fresh checkpoint started for run ${runId}`);
        const store = openState(stateDir);
        try {
          checkpointResult = compactCheckpointResult(
            createRunCheckpoint(store, runId, {
              title: "Fresh run checkpoint",
            }),
          );
        } finally {
          store.db.close();
        }
        appendLog("ui", `fresh checkpoint complete for run ${runId}`);
      }
    }

    if (resetReportBaseline) {
      appendLog("ui", "fresh report start reset started");
      reportRunResult = compactReportRunResult(await forceReportRun(repoRoot, { generateChanges: false, resetBaseline: true }));
      appendLog("ui", "fresh report start reset complete");
    }

    const init = initRunCommand({ ...body, repoRoot, stateDir });
    await runFreshStep(steps, "init-run", init.command, packageRoot);

    if (resetReportBaseline) {
      appendLog("ui", "fresh report changes started");
      reportRunResult = compactReportRunResult(await forceReportRun(repoRoot, { resetBaseline: false }));
      appendLog("ui", "fresh report changes complete");
    }

    if (refreshPrLibrary) {
      await runFreshStep(
        steps,
        "refresh PR library",
        [
          "python3",
          resolve(packageRoot, "knowledge/sources/past_prs/commands/sync_repo_and_pr_library.py"),
          "--skip-git",
          "--pr-activity",
          "updated",
          "--refresh-existing-prs",
          "--postmortem-mode",
          boolValue(body.dryRunAgents) ? "scaffold" : "pi",
          "--postmortem-scope",
          "fetched",
          "--postmortem-jobs",
          "16",
        ],
        packageRoot,
      );
    }
    return {
      fresh: true,
      project: paths.project ? projectToSummary(paths.project) : null,
      repoRoot,
      stateDir,
      refreshPrLibrary,
      resetReportBaseline,
      checkpointBeforeFresh,
      checkpoint: checkpointResult,
      reportRun: reportRunResult,
      steps,
    };
  } finally {
    freshRunActive = false;
  }
}

async function syncProjectIntake(body: JsonObject): Promise<JsonObject> {
  if (projectSyncActive) {
    throw new Error("Fetch & Re-sync is already running. Wait for it to finish before starting another sync.");
  }
  projectSyncActive = true;
  const paths = resolveDashboardProject(body, { useDefaultProject: true });
  const { repoRoot, stateDir } = paths;
  try {
    const activeManaged = managed?.state === "running" || managed?.state === "stopping" || managed?.state === "draining";
    const activeSaved = savedProcessRecords(stateDir).find((record) => record.alive === true);
    if (activeManaged || activeSaved) {
      const activeName = stringValue(activeSaved?.name, managed?.name ?? paths.project?.processName ?? "melee-live");
      throw new Error(`Stop the active process (${activeName}) before fetching and re-syncing.`);
    }

    const gitSync = await syncProjectGitAndFindMergedPrs(paths);
    if (gitSync.mergedPrs.length === 0) {
      appendLog("ui", "merged PR intake skipped: no newly merged PRs found after git sync");
      return {
        synced: true,
        skippedIntake: true,
        reason: "no_newly_merged_prs",
        project: paths.project ? projectToSummary(paths.project) : null,
        repoRoot,
        stateDir,
        beforeRef: gitSync.beforeRef,
        afterRef: gitSync.afterRef,
        branch: gitSync.branch,
        mergedPrs: [],
        steps: gitSync.steps,
        createdAt: new Date().toISOString(),
      };
    }

    const command = [
      "python3",
      resolve(packageRoot, "knowledge/sources/past_prs/commands/fetch_recent_pr_dump.py"),
      "--repo",
      "doldecomp/melee",
      "--refresh-existing",
      "--postmortem-mode",
      boolValue(body.dryRunAgents) ? "scaffold" : "pi",
      "--postmortem-scope",
      "fetched",
      "--postmortem-rerun-existing",
      "--postmortem-jobs",
      "16",
      "--fetch-jobs",
      String(Math.min(16, Math.max(1, gitSync.mergedPrs.length))),
    ];
    for (const number of gitSync.mergedPrs) command.push("--pr", String(number));

    appendLog("ui", `merged PR intake started for ${gitSync.mergedPrs.length} PR(s)`);
    const intakeResult = await runCli(command, packageRoot);
    appendLog("ui", `merged PR intake ${intakeResult.exitCode === 0 ? "complete" : "failed"}`);
    if (intakeResult.exitCode !== 0) {
      throw new Error(`Merged PR intake failed (${intakeResult.exitCode}): ${outputTail(intakeResult.stderr || intakeResult.stdout, 4000)}`);
    }

    const graphCommand = [
      ...cliPrefix(paths),
      "kg-maintain",
      "--graph-db",
      paths.graphDbPath,
      "--no-pr-index",
      "--no-tool-runners",
      "--no-tool-index",
    ];
    appendLog("ui", "knowledge graph rebuild started");
    const graphResult = await runCli(graphCommand, packageRoot);
    appendLog("ui", `knowledge graph rebuild ${graphResult.exitCode === 0 ? "complete" : "failed"}`);
    if (graphResult.exitCode !== 0) {
      throw new Error(`Knowledge graph rebuild failed (${graphResult.exitCode}): ${outputTail(graphResult.stderr || graphResult.stdout, 4000)}`);
    }
    return {
      synced: true,
      project: paths.project ? projectToSummary(paths.project) : null,
      repoRoot,
      stateDir,
      beforeRef: gitSync.beforeRef,
      afterRef: gitSync.afterRef,
      branch: gitSync.branch,
      mergedPrs: gitSync.mergedPrs,
      steps: [
        ...gitSync.steps,
        {
          name: "fetch_merged_prs_and_run_intake_agents",
          command,
          exitCode: intakeResult.exitCode,
          stdout: outputTail(intakeResult.stdout, 4000),
          stderr: outputTail(intakeResult.stderr, 4000),
        },
        {
          name: "rebuild_knowledge_graph",
          command: graphCommand,
          exitCode: graphResult.exitCode,
          stdout: outputTail(graphResult.stdout, 4000),
          stderr: outputTail(graphResult.stderr, 4000),
        },
      ],
      createdAt: new Date().toISOString(),
    };
  } finally {
    projectSyncActive = false;
  }
}

async function handleApi(req: Request, url: URL): Promise<Response> {
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
      hotReload: hotReloadEnabled,
      dashboardStreamIntervalMs,
    });
  }
  if (url.pathname === "/api/dev-events") return hotReloadEvents();
  if (url.pathname === "/api/dashboard/events") return dashboardEvents(url);
  if (url.pathname === "/api/dashboard") {
    const paths = requestPaths(url, { useDefaultProject: true });
    return json(await runDashboard(paths));
  }
  if (url.pathname === "/api/run/details") {
    const paths = requestPaths(url, { useDefaultProject: true });
    return json(runDetails(paths.stateDir, url.searchParams.get("runId") || "", paths.project));
  }
  if (url.pathname === "/api/process") {
    const paths = requestPaths(url, { useDefaultProject: true });
    return json(processStatus(paths.stateDir, paths.project));
  }
  if (url.pathname === "/api/project/sync" && req.method === "POST") {
    return json(await syncProjectIntake(asObject(await req.json().catch(() => ({})))));
  }
  if (url.pathname === "/api/process/start" && req.method === "POST") {
    const body = asObject(await req.json().catch(() => ({})));
    if (managed?.state === "running" || managed?.state === "stopping" || managed?.state === "draining") {
      return json({ error: "process already running", process: processStatus() }, { status: 409 });
    }
    const { command, name, stateDir, project } = commandFromBody(body);
    const runId = stringValue(body.runId) || latestRunId(stateDir);
    if (runId) {
      const store = openState(stateDir);
      try {
        const run = getRun(store, runId);
        if (run && run.status !== "active") {
          return json({ error: `Run ${run.id} is ${run.status}; resume it before starting workers.`, run, process: processStatus(stateDir, project) }, { status: 409 });
        }
      } finally {
        store.db.close();
      }
    }
    managed = spawnManaged(command, stateDir, name, project);
    return json({ started: true, project: project ? projectToSummary(project) : null, command, process: processStatus(stateDir, project) });
  }
  if (url.pathname === "/api/process/stop" && req.method === "POST") {
    return json(await stopManaged(asObject(await req.json().catch(() => ({})))));
  }
  if (url.pathname === "/api/process/drain" && req.method === "POST") {
    return json(await drainManaged(asObject(await req.json().catch(() => ({})))));
  }
  if (url.pathname === "/api/pr/pause" && req.method === "POST") {
    return json(await pauseRunForPr(asObject(await req.json().catch(() => ({})))));
  }
  if (url.pathname === "/api/pr/resume" && req.method === "POST") {
    return json(resumeRunForPr(asObject(await req.json().catch(() => ({})))));
  }
  if (url.pathname === "/api/run/checkpoint" && req.method === "POST") {
    return json(checkpointRunForPr(asObject(await req.json().catch(() => ({})))));
  }
  if (url.pathname === "/api/pr/qa" && req.method === "POST") {
    return json(await runPrQa(asObject(await req.json().catch(() => ({})))));
  }
  if (url.pathname === "/api/pr/split-plan" && req.method === "POST") {
    return json(await runPrSplitPlan(asObject(await req.json().catch(() => ({})))));
  }
  if (url.pathname === "/api/pr/prepare" && req.method === "POST") {
    return json(await preparePrHandoff(asObject(await req.json().catch(() => ({})))));
  }
  if (url.pathname === "/api/run/init" && req.method === "POST") {
    return json(await initRun(asObject(await req.json().catch(() => ({})))));
  }
  if (url.pathname === "/api/run/fresh" && req.method === "POST") {
    return json(await freshRun(asObject(await req.json().catch(() => ({})))));
  }
  if (url.pathname === "/api/report/run" && req.method === "POST") {
    return json(await runReportNow(asObject(await req.json().catch(() => ({})))));
  }
  return json({ error: "not found" }, { status: 404 });
}

function staticResponse(pathname: string): Response {
  const appRoot = existsSync(resolve(builtStaticRoot, "index.html")) ? builtStaticRoot : staticRoot;
  const file = pathname === "/" ? "index.html" : pathname.slice(1);
  const path = resolve(appRoot, file);
  if (!path.startsWith(appRoot)) return text("Not found", { status: 404 });
  if (!existsSync(path)) {
    const fallback = resolve(appRoot, "index.html");
    if (existsSync(fallback)) return new Response(Bun.file(fallback));
    return text("Not found", { status: 404 });
  }
  return new Response(Bun.file(path));
}

export async function fetchDashboardServer(req: Request): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, url);
    return staticResponse(url.pathname);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export function serveDashboardServer(): ReturnType<typeof Bun.serve> {
  const server = Bun.serve({
    port,
    fetch: fetchDashboardServer,
  });
  console.log(`decomp-orchestrator UI listening on http://localhost:${port}${hotReloadEnabled ? " (hot reload enabled)" : ""}`);
  return server;
}

if (import.meta.main) serveDashboardServer();
