import { gameConfigurationRevision } from "../game-registry/config-revision.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { ResolvedGame } from "../game-registry/resolver.js";
import { captureSandboxProvenance } from "../game-registry/sandbox-provenance.js";
import { provisionSandboxWorkspace } from "../job-queue/provisioning.js";
import { DaytonaSandboxProvider, type SandboxProvider } from "../job-queue/sandbox.js";
import { emitSandboxDeletedEvent } from "../job-queue/sandbox-events.js";
import { immediateTransaction, type StateStore } from "../orchestrator-state/index.js";
import { forceReportRun, reportRunOptionsForGame } from "../validation/report/run.js";
import { runCommand } from "../../infrastructure/shell/index.js";
import { getHarnessState, transitionHarnessState } from "./state.js";
import { getDispatchState, initializeDispatchState, requestDispatch, releaseDispatch, requireLease, heartbeatDispatch } from "./lease.js";
import { recordSyncRequested, transitionSync } from "../harness-runtime/phases/sync/state.js";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/** Compare every scored function, retaining identity and size; ignore machine-specific paths and timestamps. */
export function sandboxReportProjection(text: string): string {
  const report = JSON.parse(text);
  if (!Array.isArray(report?.units)) throw new Error("Sandbox validation report must contain units");
  const rows: Array<[string, string, string, number]> = [];
  const identities = new Set<string>();
  for (const unit of report.units) {
    if (typeof unit.name !== "string" || !Array.isArray(unit.functions)) continue;
    for (const fn of unit.functions) {
      if (typeof fn.name !== "string" || fn.fuzzy_match_percent === undefined) continue;
      const score = Number(fn.fuzzy_match_percent);
      if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error("Invalid sandbox report score");
      const identity = JSON.stringify([unit.name, fn.name]);
      if (identities.has(identity)) throw new Error(`Duplicate sandbox report function ${identity}`);
      identities.add(identity);
      rows.push([unit.name, fn.name, String(fn.size ?? ""), score]);
    }
  }
  if (!rows.length) throw new Error("Sandbox validation report has no scored functions");
  return JSON.stringify(rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

export async function validateHarnessSandbox(input: {
  store: StateStore; game: ResolvedGame; profile?: string;
  provider?: SandboxProvider;
  buildHost?: typeof forceReportRun;
  /** Reload resolved configuration after asynchronous provisioning/build. */
  reloadGame?: () => ResolvedGame;
}): Promise<{ evidencePath: string; ready: boolean }> {
  const { store, game } = input;
  const gameId = game.gameId;
  const operation = `sandbox-validation-${randomUUID()}`;
  const traceId = `trace-${operation}`;
  const profile = captureSandboxProvenance(game, input.profile);
  if (!profile.snapshot_name || !profile.snapshot_baked_rev) throw new Error("Sandbox validation requires a configured snapshot and baked revision");
  const initial = getHarnessState(store.db, gameId);
  if (!initial?.source.head || initial.readiness.build !== "ready") throw new Error("Complete initial Sync with accepted build evidence before sandbox validation");
  const head = initial.source.head;
  const config = gameConfigurationRevision(game);
  if (initial.source.configuration_revision !== config) throw new Error("Configuration changed since accepted Sync; sync before sandbox validation");
  const reportRelative = relative(initial.source.worktree, resolve(initial.source.worktree, game.validation.reportPath));
  if (!reportRelative || isAbsolute(reportRelative) || reportRelative.startsWith("..")) throw new Error("Sandbox report must be inside the game checkout");
  const evidencePath = resolve(game.stateDir, "sandbox-validation", operation, "evidence.json");
  const context = { gameId, actor: "operator" as const, correlationId: operation };
  const leaseId = immediateTransaction(store.db, () => {
    if (getDispatchState(store, gameId)?.active_workflow) throw new Error("Pause and settle active work before sandbox validation");
    if (initial.execution.workflow !== "none") throw new Error("Sandbox validation requires an idle harness");
    initializeDispatchState(store, { gameId, traceId });
    recordSyncRequested(store, { ...context, commandId: `${operation}:reserve`, syncId: operation, traceId, observationSourceIdentity: "sandbox-validation", intake: { upstream_from: head, upstream_to: head, merged_pr_ids: [], corpus_batch_ids: [], knowledge_only: true } });
    const lease = requestDispatch(store, { ...context, commandId: `${operation}:lease`, kind: "sync", workflowId: operation, reason: "Validate sandbox build parity" });
    if (lease.queued) throw new Error("Sandbox validation dispatch is busy");
    // A terminal reservation cannot be mistaken for a resumable source Sync.
    // The dispatch lease remains exclusive until validation and cleanup finish.
    transitionSync(store, operation, { ...context, commandId: `${operation}:reservation`, expectedRevision: 0, patch: { status: "cancelled" }, payload: { discarded_staging_workspace_id: null, untouched_harness_head: head, untouched_submodule_heads: [], reason: "Sandbox validation lease reservation; no source Sync" } });
    transitionHarnessState(store.db, { gameId, expectedRevision: initial.identity.revision, commandId: `${operation}:begin`, patch: { readiness: { sandbox: "pending" } } });
    return lease.leaseId;
  });
  let sandboxId: string | undefined;
  const provider = input.provider ?? new DaytonaSandboxProvider();
  const heartbeat = setInterval(() => { try { heartbeatDispatch(store, { gameId, leaseId }); } catch {} }, 30_000);
  const evidence: Record<string, unknown> = { operation, game_id: gameId, head, configuration_revision: config, sandbox: profile, report_path: reportRelative, started_at: new Date().toISOString(), status: "pending" };
  const persist = async () => { await mkdir(resolve(evidencePath, ".."), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`); };
  const verifyHost = async () => {
    const actual = await runCommand(initial.source.worktree, ["git", "rev-parse", "HEAD"]);
    const dirty = await runCommand(initial.source.worktree, ["git", "status", "--porcelain", "--untracked-files=no"]);
    if (actual.exitCode || actual.stdout.trim() !== head || dirty.exitCode || dirty.stdout.trim()) throw new Error("Accepted checkout head changed or tracked files are dirty");
    const current = getHarnessState(store.db, gameId)!;
    requireLease(store, leaseId, gameId);
    if (current.source.head !== head || current.source.configuration_revision !== config || gameConfigurationRevision(input.reloadGame?.() ?? game) !== config) throw new Error("Accepted head or configuration changed during sandbox validation");
  };
  try {
    await persist();
    await verifyHost();
    const host = await (input.buildHost ?? forceReportRun)(initial.source.worktree, { ...reportRunOptionsForGame(game), generateChanges: false });
    const hostText = await readFile(host.reportPath, "utf8");
    const projection = sandboxReportProjection(hostText);
    evidence.host_report_sha256 = digest(hostText);
    await writeFile(resolve(evidencePath, "../host-report.json"), hostText);
    const provision = await provisionSandboxWorkspace({ provider, sourceRepoRoot: initial.source.worktree, baseRev: head, snapshotBakedRev: profile.snapshot_baked_rev, workspaceRoot: profile.workspace_root, snapshot: profile.snapshot_name, resources: { cpu: profile.resource_class.cpu, memoryGiB: profile.resource_class.memory_gib, diskGiB: profile.resource_class.disk_gib }, ttlSeconds: 3600, labels: { game_id: gameId, run_id: operation, claim_id: operation, job_id: operation, job_lease_id: leaseId, dispatch_lease_id: leaseId, worker_state_id: operation, trace_id: traceId }, reportArtifactSources: [], event: { store, context: { gameId, correlationId: operation, causationId: operation, traceId, jobId: operation, claimId: operation, workerStateId: operation } } });
    sandboxId = provision.sandboxId;
    evidence.sandbox_id = sandboxId;
    const sandbox = await provider.get(sandboxId);
    if (!sandbox) throw new Error("Provisioned sandbox disappeared");
    const actual = await sandbox.exec(["git", "rev-parse", "HEAD"], { cwd: profile.workspace_root, timeoutMs: 30_000 });
    if (actual.exitCode || actual.stdout.trim() !== head) throw new Error("Sandbox checkout does not match accepted head");
    const build = await sandbox.exec(["bash", "-lc", 'if [ ! -f build.ninja ]; then python3 configure.py || exit; fi; rm -f -- "$1"; ninja -k 0 "$1"', "--", reportRelative], { cwd: profile.workspace_root, timeoutMs: 20 * 60_000 });
    evidence.build = build;
    if (build.exitCode !== 0) throw new Error(`Sandbox report build failed (${build.exitCode})`);
    const remoteText = await sandbox.readFile(resolve(profile.workspace_root, reportRelative));
    await writeFile(resolve(evidencePath, "../sandbox-report.json"), remoteText);
    evidence.sandbox_report_sha256 = digest(remoteText);
    if (sandboxReportProjection(remoteText) !== projection) throw new Error("Sandbox report differs from accepted host build");
    await verifyHost();
    await provider.delete(sandboxId, "settlement");
    emitSandboxDeletedEvent(store, { gameId, sandboxId, correlationId: operation, causationId: operation, traceId, reason: "settlement" });
    sandboxId = undefined;
    evidence.status = "passed";
    evidence.completed_at = new Date().toISOString();
    await persist();
    const ready = immediateTransaction(store.db, () => {
    requireLease(store, leaseId, gameId);
    const current = getHarnessState(store.db, gameId)!;
    if (current.source.head !== head || current.source.configuration_revision !== config) throw new Error("Accepted head or configuration changed during sandbox validation");
    const blockers = current.execution.blockers.filter(blocker => !["harness_sandbox_pending", "harness_sandbox_blocked", "sandbox_validation_failed"].includes(blocker.code));
    const ready = current.readiness.sources === "ready" && current.readiness.build === "ready" && current.readiness.evidence === "ready" && blockers.length === 0;
    transitionHarnessState(store.db, { gameId, expectedRevision: current.identity.revision, commandId: `${operation}:accepted`, patch: { readiness: { sandbox: "ready" }, execution: {
      blockers,
      status: ready ? (current.execution.desired === "paused" ? "paused" : "idle") : current.execution.status,
    } }, boundary: { eventId: `${operation}:accepted`, kind: ready ? "initial_sync_accepted" : "sandbox_validated", outcome: "sandbox_validated", evidence: { path: evidencePath, profile: profile.profile, snapshot: profile.snapshot_name, sandbox: profile, configuration_revision: config } } });
    return ready;
    });
    return { evidencePath, ready };
  } catch (error) {
    evidence.status = "failed";
    evidence.error = error instanceof Error ? error.message : String(error);
    await persist();
    const current = getHarnessState(store.db, gameId)!;
    transitionHarnessState(store.db, { gameId, expectedRevision: current.identity.revision, commandId: `${operation}:failed`, patch: { readiness: { sandbox: "blocked" } }, boundary: { eventId: `${operation}:failed`, kind: "failed", outcome: "sandbox_validation_failed", evidence: { path: evidencePath } } });
    throw error;
  } finally {
    clearInterval(heartbeat);
    try {
      if (sandboxId) {
        await provider.delete(sandboxId, "settlement");
        emitSandboxDeletedEvent(store, { gameId, sandboxId, correlationId: operation, causationId: operation, traceId, reason: "settlement" });
      }
    } finally {
      releaseDispatch(store, { ...context, commandId: `${operation}:release-lease`, leaseId });
    }
  }
}
