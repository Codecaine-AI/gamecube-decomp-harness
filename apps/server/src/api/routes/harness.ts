import type { StateStore } from "@server/core/harness-runtime/run-state";
import { getRun } from "@server/core/harness-runtime/run-state";
import { getHarnessState, getHarnessTimeline, requestHarnessExecution, transitionHarnessState, type HarnessState } from "@server/core/harness-state/state.js";
import { getDispatchState } from "@server/core/harness-state/lease.js";
import { withLiveUpstreamDrift, type UpstreamDrift } from "@server/core/harness-state/upstream-drift.js";
import { runningProcessConfigurationConflicts } from "@server/core/harness-runtime/phases/running/process-command.js";
import { retireHarnessRun } from "@server/core/harness-runtime/phases/running/retire-run.js";

type JsonObject = Record<string, unknown>;
export interface HarnessControlDeps {
  openStore: (body: JsonObject) => StateStore;
  initializeRun: (body: JsonObject) => Promise<string>;
  startRun: (body: JsonObject) => Promise<Response>;
  resumeRun: (body: JsonObject) => unknown;
  processActive: (stateDir: string) => boolean;
  /** Local-ref observation of upstream drift for the status payload; no fetch, no state mutation. */
  observeUpstreamDrift?: (harness: HarnessState) => UpstreamDrift | null;
}
const starting = new Set<string>();
const runSettingKeys = ["maxWorkers", "sandboxProfile", "provider", "model", "thinkingLevel", "agentTimeoutSeconds", "dryRunAgents", "goalKind", "goalValue", "epochTargetCap", "workerConfigureCommand", "epochConfigureCommand"];
function runSettings(body: JsonObject): JsonObject {
  return Object.fromEntries(runSettingKeys.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
}
/** Settings that disagree with the attached Run's immutable snapshot; checked before any intent or lease. */
function runSettingConflicts(store: StateStore, runId: string | null, body: JsonObject) {
  const run = runId ? getRun(store, runId) : null;
  return run?.inputs ? runningProcessConfigurationConflicts(body, run.inputs, run.id) : [];
}
function conflictResponse(harness: HarnessState, conflicts: ReturnType<typeof runningProcessConfigurationConflicts>): Response {
  return Response.json({
    harness, outcome: "blocked",
    error: `Run settings conflict with the attached Run's immutable configuration: ${conflicts.map((conflict) => conflict.field).join(", ")}. Retire the Run to start one with new settings.`,
    blockers: conflicts.map((conflict) => conflict.blocker),
    conflicts: conflicts.map(({ blocker: _blocker, ...conflict }) => conflict),
  }, { status: 409 });
}

/** Desired state persists before process work; retries reconcile the existing run. */
export async function handleHarnessApiRoute(req: Request, url: URL, deps: HarnessControlDeps): Promise<Response | null> {
  if (req.method === "GET" && ["/api/harness", "/api/harness/timeline"].includes(url.pathname)) {
    const gameId = url.searchParams.get("gameId")?.trim();
    const after = Number(url.searchParams.get("after") ?? 0);
    if (!gameId || !Number.isSafeInteger(after) || after < 0) return Response.json({ error: "gameId and a nonnegative after cursor are required" }, { status: 400 });
    let store: StateStore | undefined;
    try {
      store = deps.openStore({ gameId });
      const harness = getHarnessState(store.db, gameId);
      if (!harness) return Response.json({ error: "Harness is not initialized" }, { status: 404 });
      const live = deps.observeUpstreamDrift ? withLiveUpstreamDrift(harness, deps.observeUpstreamDrift(harness)) : harness;
      return Response.json({ harness: live, timeline: getHarnessTimeline(store.db, gameId, { after, limit: 100 }) });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 });
    } finally { store?.db.close(); }
  }
  if (req.method === "POST" && url.pathname === "/api/harness/retire-run") return retireRunRoute(req, deps);
  if (req.method !== "POST" || !["/api/harness/run", "/api/harness/pause"].includes(url.pathname)) return null;
  const body = await req.json().catch(() => null) as JsonObject | null;
  if (!body || typeof body.gameId !== "string" || !body.gameId.trim() || typeof body.commandId !== "string" || !body.commandId.trim() || !Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) {
    return Response.json({ error: "gameId, commandId, and expectedRevision are required" }, { status: 400 });
  }
  const gameId = body.gameId;
  const desired = url.pathname.endsWith("/pause") ? "paused" : "run";
  let store: StateStore | undefined;
  try {
    store = deps.openStore(body);
    const before = getHarnessState(store.db, gameId);
    if (!before) return Response.json({ error: "Initial Sync must initialize this game first" }, { status: 409 });
    if (desired === "run") {
      const conflicts = runSettingConflicts(store, before.history.run_id, body);
      if (conflicts.length) return conflictResponse(before, conflicts);
    }
    requestHarnessExecution(store.db, {
      gameId, commandId: body.commandId, expectedRevision: Number(body.expectedRevision), desired,
      ...(desired === "run" ? { boundary: { evidence: { requested_run_settings: runSettings(body) } } } : {}),
    });
    const read = () => getHarnessState(store!.db, gameId)!;
    if (desired === "paused") {
      return Response.json({ harness: read(), outcome: deps.processActive(store.stateDir) ? "draining" : "paused" }, { status: 202 });
    }
    store.db.close();
    store = undefined;
    return reconcileDesiredHarnessRun(body, deps);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 });
  } finally {
    store?.db.close();
  }
}

/** Reconcile persisted intent after readiness, Sync completion, or server restart. */
export async function reconcileDesiredHarnessRun(body: JsonObject, deps: HarnessControlDeps): Promise<Response> {
  let store: StateStore | undefined;
  let startKey: string | null = null;
  const gameId = String(body.gameId);
  try {
    store = deps.openStore(body);
    const initial = getHarnessState(store.db, gameId);
    if (!initial) return Response.json({ outcome: "uninitialized" });
    const read = () => getHarnessState(store!.db, gameId)!;
    if (initial.execution.desired !== "run") return Response.json({ harness: initial, outcome: "paused" });
    const intent = store.db.query("SELECT command_id, payload_json FROM harness_timeline_entries WHERE game_id = ? AND kind = 'resumed' ORDER BY id DESC LIMIT 1").get(gameId) as { command_id: string; payload_json: string } | null;
    const persistedSettings = intent ? JSON.parse(intent.payload_json).evidence?.requested_run_settings ?? {} : {};
    body = { ...runSettings(persistedSettings), ...body, commandId: body.commandId ?? `reconcile:${initial.identity.harness_id}:${initial.identity.revision}` };
    const blockers = [...read().execution.blockers, ...Object.entries(read().readiness).filter(([, value]) => value !== "ready").map(([gate, value]) => ({ code: "harness_not_ready", message: `${gate} is ${value}` }))];
    if (!read().source.head) blockers.push({ code: "harness_head_missing", message: "Initial Sync has not accepted a head" });
    if (read().execution.status === "blocked") blockers.push({ code: "harness_blocked", message: "Recovery must clear the blocked harness status" });
    if (blockers.length) return Response.json({ harness: read(), outcome: "blocked", blockers }, { status: 202 });
    const lease = getDispatchState(store, gameId);
    if (read().execution.workflow === "sync" || lease?.active_workflow?.kind === "sync" || lease?.queued_dispatch_requests.some((request) => request.kind === "sync")) {
      return Response.json({ harness: read(), outcome: "waiting_for_sync" }, { status: 202 });
    }
    if (deps.processActive(store.stateDir)) return Response.json({ harness: read(), outcome: "already_running" });
    startKey = `${store.stateDir}:${gameId}`;
    if (starting.has(startKey)) { startKey = null; return Response.json({ harness: read(), outcome: "starting" }, { status: 202 }); }
    starting.add(startKey);
    let runId = read().history.run_id;
    const attachedRunId = runId;
    if (!runId) {
      runId = await deps.initializeRun({ ...body, commandId: `${intent?.command_id ?? body.commandId}:initialize` });
      const current = read();
      if (current.history.run_id && current.history.run_id !== runId) throw new Error("Run initialization returned a different harness run");
      if (!current.history.run_id) transitionHarnessState(store.db, { gameId, expectedRevision: current.identity.revision, commandId: `${body.commandId}:attach-run`, patch: { history: { run_id: runId } } });
    }
    // A pause can arrive while the CLI prepares the immutable run inputs.
    if (read().execution.desired === "paused") return Response.json({ harness: read(), outcome: "paused" }, { status: 202 });
    const current = read();
    const currentLease = getDispatchState(store, gameId);
    if (current.execution.status === "blocked" || current.execution.blockers.length || !current.source.head || Object.values(current.readiness).some((gate) => gate !== "ready")) {
      return Response.json({ harness: current, outcome: "blocked" }, { status: 202 });
    }
    if (current.execution.workflow === "sync" || currentLease?.active_workflow?.kind === "sync" || currentLease?.queued_dispatch_requests.some((request) => request.kind === "sync")) {
      return Response.json({ harness: current, outcome: "waiting_for_sync" }, { status: 202 });
    }
    const run = getRun(store, runId);
    if (!run || run.gameId !== gameId) throw new Error("The harness run does not belong to this game");
    if (!["ready", "active", "paused"].includes(run.status)) return Response.json({ harness: read(), outcome: "recovery_required" }, { status: 202 });
    // An existing Run keeps its immutable settings; refuse before resume takes the lease.
    const conflicts = runSettingConflicts(store, attachedRunId, body);
    if (conflicts.length) return conflictResponse(read(), conflicts);
    const runBody = { ...body, runId, commandId: `${body.commandId}:start` };
    if (run.status === "paused") await deps.resumeRun(runBody);
    const response = await deps.startRun(runBody);
    const process = await response.json().catch(() => null);
    return Response.json({ harness: read(), outcome: response.ok ? "running" : "blocked", process }, { status: response.status });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 });
  } finally {
    if (startKey) starting.delete(startKey);
    store?.db.close();
  }
}

/** Operator command: detach a settled Run so the next Run request creates a fresh one. */
async function retireRunRoute(req: Request, deps: HarnessControlDeps): Promise<Response> {
  const body = await req.json().catch(() => null) as JsonObject | null;
  if (!body || typeof body.gameId !== "string" || !body.gameId.trim() || typeof body.commandId !== "string" || !body.commandId.trim()
    || !Number.isInteger(body.expectedRevision) || typeof body.runId !== "string" || !body.runId.trim() || typeof body.reason !== "string" || !body.reason.trim()) {
    return Response.json({ error: "gameId, commandId, expectedRevision, runId, and reason are required" }, { status: 400 });
  }
  if (body.confirmed !== true) return Response.json({ error: "harness.retire_run requires operator confirmation" }, { status: 409 });
  let store: StateStore | undefined;
  try {
    store = deps.openStore(body);
    const result = retireHarnessRun({
      store, gameId: body.gameId, runId: body.runId, expectedRevision: Number(body.expectedRevision),
      commandId: body.commandId, reason: body.reason, processActive: deps.processActive(store.stateDir),
    });
    return Response.json({ harness: result.harness, run: result.run, outcome: "retired" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 });
  } finally { store?.db.close(); }
}
