import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { runCommand } from "@server/infrastructure/shell";
import {
  invokeConflictResolver,
  type ConflictResolverAgentRunner,
  type ConflictResolverInvocationResult,
} from "@server/core/agent-catalog/agents/running/conflict-resolver/invocation.js";
import {
  CONFLICT_RESOLVER_REQUEST_SCHEMA_VERSION,
  type ConflictResolverCheckEvidence,
  type ConflictResolverClaimMetadata,
  type ConflictResolverRequest,
} from "@server/core/agent-catalog/agents/running/conflict-resolver/context.js";
import {
  addEvent,
  claimNextWorkerOutputIntegration,
  updateWorkerOutputIntegration,
  workerOutputIntegrationQueueSummary,
  type StateStore,
  type WorkerOutputIntegrationRecord,
  type WorkerOutputIntegrationStatus,
} from "@server/core/session-runtime/run-state";
import type { RunProjectMetadata } from "@server/core/shared/types";
import { processWriteSetIntegrationFlags } from "./write-set-options.js";

type CommandRunner = typeof runCommand;

export interface WorkerOutputConflictResolverConfig {
  runner: ConflictResolverAgentRunner;
  dryRun?: boolean;
  project?: RunProjectMetadata;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  timeoutMs?: number;
}

export interface WorkerOutputIntegrationApplyResult {
  id: string;
  status: WorkerOutputIntegrationStatus;
  disposition: string | null;
  patchPath: string | null;
  itemPath: string | null;
  summaryPath: string | null;
  failureReasons: string[];
  conflictPaths: string[];
}

export interface WorkerOutputIntegrationQueueResult {
  processed: WorkerOutputIntegrationApplyResult[];
  queueSummary: Record<string, unknown>;
}

interface ApplyArtifacts {
  artifactDir: string;
  summaryPath: string;
  itemPath: string;
  queueSummaryPath: string;
  checkStdoutPath: string;
  checkStderrPath: string;
  applyStdoutPath: string;
  applyStderrPath: string;
  currentBranchDiffPath: string;
}

function outputTail(text: string, maxChars = 2000): string {
  return text.length <= maxChars ? text : text.slice(-maxChars);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractConflictPaths(text: string, writeSet: string[]): string[] {
  const paths: string[] = [];
  const patterns = [
    /(?:patch failed|error):\s+([^:\n]+):/g,
    /error:\s+([^\n]+): patch does not apply/g,
    /Checking patch\s+(.+?)\.\.\./g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) paths.push(match[1]);
    }
  }
  return uniqueStrings(paths.length > 0 ? paths : writeSet);
}

function integrationArtifacts(stateDir: string, runId: string, id: string): ApplyArtifacts {
  const artifactDir = resolve(stateDir, "runs", runId, "worker_integrations", id);
  return {
    artifactDir,
    summaryPath: resolve(artifactDir, "summary.json"),
    itemPath: resolve(artifactDir, "integration_conflict_item.json"),
    queueSummaryPath: resolve(artifactDir, "integration_queue_summary.json"),
    checkStdoutPath: resolve(artifactDir, "git_apply_check.stdout.txt"),
    checkStderrPath: resolve(artifactDir, "git_apply_check.stderr.txt"),
    applyStdoutPath: resolve(artifactDir, "git_apply.stdout.txt"),
    applyStderrPath: resolve(artifactDir, "git_apply.stderr.txt"),
    currentBranchDiffPath: resolve(artifactDir, "current_branch.diff"),
  };
}

function targetSnapshot(store: StateStore, record: WorkerOutputIntegrationRecord): Record<string, unknown> {
  const row = store.db
    .query(
      `
        SELECT unit, symbol, source_path, size, baseline_score, target_key
        FROM epoch_targets
        WHERE id = ?
      `,
    )
    .get(record.epochTargetId) as Record<string, unknown> | undefined;
  return {
    epoch_target_id: record.epochTargetId,
    target_key: record.targetKey ?? row?.target_key ?? null,
    unit: row?.unit ?? null,
    symbol: row?.symbol ?? null,
    source_path: row?.source_path ?? null,
    size: row?.size ?? null,
    baseline_score: row?.baseline_score ?? null,
  };
}

function checkpointSnapshot(store: StateStore, record: WorkerOutputIntegrationRecord): Record<string, unknown> {
  if (!record.workerCheckpointId) return {};
  const row = store.db.query("SELECT * FROM worker_checkpoints WHERE id = ?").get(record.workerCheckpointId) as Record<string, unknown> | undefined;
  if (!row) return {};
  return {
    id: String(row.id),
    attempt_index: row.attempt_index,
    validation_time: row.validation_time,
    old_score: row.old_score,
    new_score: row.new_score,
    delta: row.delta,
    exact_match: Number(row.exact_match) === 1,
    hard_gates_passed: Number(row.hard_gates_passed) === 1,
    selectable: Number(row.selectable) === 1,
    selected: Number(row.selected) === 1,
    validation_status: row.validation_status,
    artifact_path: row.artifact_path,
    patch_path: row.patch_path,
    diff_path: row.diff_path,
  };
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function incumbentClaimSnapshots(store: StateStore, record: WorkerOutputIntegrationRecord, conflictPaths: string[]): Record<string, unknown>[] {
  const paths = new Set([...record.writeSet, ...conflictPaths]);
  const rows = store.db
    .query(
      `
        SELECT id, target_claim_id, worker_state_id, worker_checkpoint_id,
               target_key, write_set_json, validation_state, metadata_json,
               created_at, updated_at
        FROM worker_output_integrations
        WHERE session_id = ?
          AND id != ?
          AND status IN ('applied', 'resolved')
        ORDER BY updated_at DESC, created_at DESC
      `,
    )
    .all(record.sessionId, record.id) as Record<string, unknown>[];
  return rows
    .filter((row) => stringArray(row.write_set_json).some((path) => paths.has(path)))
    .map((row) => ({
      integration_id: String(row.id),
      target_claim_id: String(row.target_claim_id),
      worker_state_id: String(row.worker_state_id),
      checkpoint_id: row.worker_checkpoint_id == null ? null : String(row.worker_checkpoint_id),
      target_key: row.target_key == null ? null : String(row.target_key),
      write_set: stringArray(row.write_set_json),
      validation_state: row.validation_state == null ? null : String(row.validation_state),
      metadata: jsonObject(row.metadata_json),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    }));
}

function checkEvidence(checkpoint: Record<string, unknown>): {
  passed: boolean;
  checks: ConflictResolverCheckEvidence[];
  metadata: Record<string, unknown>;
} {
  const status = typeof checkpoint.validation_status === "string" ? checkpoint.validation_status : "not_run";
  const passed = checkpoint.hard_gates_passed === true && status === "passed";
  return {
    passed,
    checks: [
      {
        name: "worker scoped validation",
        command: null,
        status: passed ? "passed" : status === "not_run" ? "not_run" : "failed",
        artifact_path: typeof checkpoint.artifact_path === "string" ? checkpoint.artifact_path : null,
        summary: status,
      },
    ],
    metadata: checkpoint,
  };
}

function claimMetadata(params: {
  record: WorkerOutputIntegrationRecord;
  checkpoint: Record<string, unknown>;
  target: Record<string, unknown>;
}): ConflictResolverClaimMetadata {
  return {
    claim_id: params.record.targetClaimId,
    worker_state_id: params.record.workerStateId,
    checkpoint_id: params.record.workerCheckpointId,
    target_id: params.record.epochTargetId,
    target_symbol: typeof params.target.symbol === "string" ? params.target.symbol : null,
    source_paths: typeof params.target.source_path === "string" ? [params.target.source_path] : [],
    write_set: params.record.writeSet,
    validation_state: "tentative",
    metadata: params.record.metadata,
  };
}

function currentClaimMetadata(snapshot: Record<string, unknown> | undefined): ConflictResolverClaimMetadata {
  const targetKey = typeof snapshot?.target_key === "string" ? snapshot.target_key : "";
  return {
    claim_id: typeof snapshot?.target_claim_id === "string" ? snapshot.target_claim_id : null,
    worker_state_id: typeof snapshot?.worker_state_id === "string" ? snapshot.worker_state_id : null,
    checkpoint_id: typeof snapshot?.checkpoint_id === "string" ? snapshot.checkpoint_id : null,
    target_id: null,
    target_symbol: targetKey.includes("::") ? targetKey.split("::").at(-1) ?? null : null,
    source_paths: [],
    write_set: stringArray(snapshot?.write_set),
    validation_state:
      snapshot?.validation_state === "tentative" || snapshot?.validation_state === "confirmed" || snapshot?.validation_state === "regressed"
        ? snapshot.validation_state
        : null,
    metadata: jsonObject(snapshot?.metadata),
  };
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function conflictResolverRequest(params: {
  commandRunner: CommandRunner;
  repoRoot: string;
  artifacts: ApplyArtifacts;
  store: StateStore;
  record: WorkerOutputIntegrationRecord;
  patchText: string;
  conflictPaths: string[];
  isolatedWorktreePath: string;
}): Promise<{ request: ConflictResolverRequest; incumbents: Record<string, unknown>[] }> {
  const [head, status, diff] = await Promise.all([
    params.commandRunner(params.repoRoot, ["git", "rev-parse", "HEAD"]),
    params.commandRunner(params.repoRoot, ["git", "status", "--short"]),
    params.commandRunner(params.repoRoot, ["git", "diff", "--binary"]),
  ]);
  await writeFile(params.artifacts.currentBranchDiffPath, diff.stdout);
  const target = targetSnapshot(params.store, params.record);
  const checkpoint = checkpointSnapshot(params.store, params.record);
  const incumbents = incumbentClaimSnapshots(params.store, params.record, params.conflictPaths);
  const current = incumbents[0];
  const headRevision = head.exitCode === 0 ? head.stdout.trim() : "unknown";
  return {
    incumbents,
    request: {
      schema_version: CONFLICT_RESOLVER_REQUEST_SCHEMA_VERSION,
      integration_item_id: params.record.id,
      conflict_group_id: `worker-output:${params.record.id}`,
      isolated_worktree: {
        path: params.isolatedWorktreePath,
        base_revision: headRevision,
        session_revision: headRevision,
      },
      session_worktree_path: params.repoRoot,
      incoming: {
        claim: claimMetadata({ record: params.record, checkpoint, target }),
        scoped_checks: checkEvidence(checkpoint),
        patch: { path: params.record.patchPath, text: params.patchText, sha256: sha256(params.patchText) },
      },
      current: {
        claim: currentClaimMetadata(current),
        scoped_checks: {
          passed: current?.validation_state === "confirmed" || current?.validation_state === "tentative",
          checks: [],
          metadata: { incumbent_integrations: incumbents },
        },
        branch_state: {
          head_revision: headRevision,
          status_porcelain: status.stdout,
          diff: diff.stdout || null,
          metadata: {
            diff_path: params.artifacts.currentBranchDiffPath,
            incumbent_integrations: incumbents,
          },
        },
      },
      conflict_paths: params.conflictPaths,
      metadata: { merge_on_finish: true, all_incumbent_claims: incumbents },
    },
  };
}

function conflictItem(params: {
  record: WorkerOutputIntegrationRecord;
  target: Record<string, unknown>;
  checkpoint: Record<string, unknown>;
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutPath: string;
  stderrPath: string;
  conflictPaths: string[];
  failureReasons: string[];
  mergeContext?: {
    currentBranchDiffPath: string;
    incumbents: Record<string, unknown>[];
    request: ConflictResolverRequest;
  };
}): Record<string, unknown> {
  return {
    schema_version: "integration_conflict_item_v1",
    id: params.record.id,
    queue_item_id: params.record.id,
    run_id: params.record.sessionId,
    epoch_id: params.record.epochId,
    epoch_target_id: params.record.epochTargetId,
    target_claim_id: params.record.targetClaimId,
    conflict_group_id: `worker-output:${params.record.id}`,
    target: params.target,
    failed_apply: {
      command: params.command.join(" "),
      exit_code: params.exitCode,
      stdout_path: params.stdoutPath,
      stderr_path: params.stderrPath,
      stdout_tail: outputTail(params.stdout, 1000),
      stderr_tail: outputTail(params.stderr, 1000),
    },
    conflict_paths: params.conflictPaths,
    failure_reasons: params.failureReasons,
    worker_outputs: [
      {
        worker_state_id: params.record.workerStateId,
        checkpoint_id: params.record.workerCheckpointId,
        target_claim_id: params.record.targetClaimId,
        epoch_target_id: params.record.epochTargetId,
        patch_path: params.record.patchPath,
        diff_path: params.record.diffPath,
        write_set: params.record.writeSet,
        checkpoint: params.checkpoint,
      },
    ],
    ...(params.mergeContext
      ? {
          merge_on_finish: {
            current_branch_diff_path: params.mergeContext.currentBranchDiffPath,
            incumbent_claims: params.mergeContext.incumbents,
            resolver_request: params.mergeContext.request,
          },
        }
      : {}),
    created_at: new Date().toISOString(),
  };
}

async function writeSummary(path: string, result: WorkerOutputIntegrationApplyResult, extra: Record<string, unknown> = {}): Promise<void> {
  await writeFile(path, `${JSON.stringify({ ...result, ...extra }, null, 2)}\n`);
}

async function updateAndSummarize(
  store: StateStore,
  record: WorkerOutputIntegrationRecord,
  update: {
    status: WorkerOutputIntegrationStatus;
    disposition: string | null;
    artifacts: ApplyArtifacts;
    failureReasons?: string[];
    conflictPaths?: string[];
    checkStdoutPath?: string | null;
    checkStderrPath?: string | null;
    applyStdoutPath?: string | null;
    applyStderrPath?: string | null;
    itemPath?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<WorkerOutputIntegrationApplyResult> {
  const updated = updateWorkerOutputIntegration(store, record.id, {
    status: update.status,
    disposition: update.disposition,
    summaryPath: update.artifacts.summaryPath,
    itemPath: update.itemPath ?? null,
    checkStdoutPath: update.checkStdoutPath ?? null,
    checkStderrPath: update.checkStderrPath ?? null,
    applyStdoutPath: update.applyStdoutPath ?? null,
    applyStderrPath: update.applyStderrPath ?? null,
    failureReasons: update.failureReasons ?? [],
    conflictPaths: update.conflictPaths ?? [],
    metadata: update.metadata,
  });
  const result: WorkerOutputIntegrationApplyResult = {
    id: updated.id,
    status: updated.status,
    disposition: updated.disposition,
    patchPath: updated.patchPath,
    itemPath: updated.itemPath,
    summaryPath: updated.summaryPath,
    failureReasons: updated.failureReasons,
    conflictPaths: updated.conflictPaths,
  };
  await writeSummary(update.artifacts.summaryPath, result, {
    queue_record: {
      worker_state_id: updated.workerStateId,
      worker_checkpoint_id: updated.workerCheckpointId,
      target_claim_id: updated.targetClaimId,
      epoch_target_id: updated.epochTargetId,
      write_set: updated.writeSet,
    },
  });
  return result;
}

function markTentative(store: StateStore, record: WorkerOutputIntegrationRecord): void {
  store.db.query("UPDATE worker_output_integrations SET validation_state = 'tentative' WHERE id = ?").run(record.id);
  if (record.workerCheckpointId) {
    store.db.query("UPDATE worker_checkpoints SET validation_state = 'tentative' WHERE id = ?").run(record.workerCheckpointId);
  }
}

async function compensateAppliedPatch(params: {
  commandRunner: CommandRunner;
  repoRoot: string;
  patchPath: string;
  paths: string[];
}): Promise<string[]> {
  const failures: string[] = [];
  const reverse = await params.commandRunner(params.repoRoot, ["git", "apply", "--reverse", params.patchPath]);
  if (reverse.exitCode !== 0) failures.push(`reverse apply failed: ${outputTail(reverse.stderr || reverse.stdout, 1000)}`);
  if (params.paths.length > 0) {
    const restage = await params.commandRunner(params.repoRoot, ["git", "add", "--", ...params.paths]);
    if (restage.exitCode !== 0) failures.push(`index cleanup failed: ${outputTail(restage.stderr || restage.stdout, 1000)}`);
  }
  return failures;
}

async function commitAppliedPatch(params: {
  commandRunner: CommandRunner;
  repoRoot: string;
  record: WorkerOutputIntegrationRecord;
  patchPath: string;
  paths?: string[];
}): Promise<{ preApplyRev: string; integratedRev: string }> {
  const paths = uniqueStrings(params.paths ?? params.record.writeSet);
  if (paths.length === 0) throw new Error("merge-on-finish cannot commit an empty write set");
  const before = await params.commandRunner(params.repoRoot, ["git", "rev-parse", "HEAD"]);
  if (before.exitCode !== 0 || !before.stdout.trim()) {
    throw new Error(`merge-on-finish could not resolve pre-apply revision: ${outputTail(before.stderr || before.stdout)}`);
  }
  const stage = await params.commandRunner(params.repoRoot, ["git", "add", "--", ...paths]);
  if (stage.exitCode !== 0) {
    const cleanup = await compensateAppliedPatch({ ...params, paths });
    throw new Error(
      [`merge-on-finish git add failed: ${outputTail(stage.stderr || stage.stdout)}`, ...cleanup].join("; "),
    );
  }
  const target = (params.record.targetKey ?? params.record.id).replace(/[\r\n]+/g, " ");
  const commit = await params.commandRunner(params.repoRoot, [
    "git",
    "commit",
    "--no-verify",
    "-m",
    `worker-integration(${params.record.id.slice(0, 8)}): ${target}`,
    "--",
    ...paths,
  ]);
  if (commit.exitCode !== 0) {
    const cleanup = await compensateAppliedPatch({ ...params, paths });
    throw new Error(
      [`merge-on-finish git commit failed: ${outputTail(commit.stderr || commit.stdout)}`, ...cleanup].join("; "),
    );
  }
  const after = await params.commandRunner(params.repoRoot, ["git", "rev-parse", "HEAD"]);
  if (after.exitCode !== 0 || !after.stdout.trim()) {
    throw new Error(`merge-on-finish could not resolve integrated revision: ${outputTail(after.stderr || after.stdout)}`);
  }
  return { preApplyRev: before.stdout.trim(), integratedRev: after.stdout.trim() };
}

async function tryConflictResolver(params: {
  artifacts: ApplyArtifacts;
  commandRunner: CommandRunner;
  config: WorkerOutputConflictResolverConfig | undefined;
  mergeContext: { request: ConflictResolverRequest; incumbents: Record<string, unknown>[] } | undefined;
  repoRoot: string;
  stateDir: string;
  store: StateStore;
  record: WorkerOutputIntegrationRecord;
}): Promise<{ result: WorkerOutputIntegrationApplyResult | null; invocation: ConflictResolverInvocationResult | null }> {
  if (!params.config || !params.mergeContext) return { result: null, invocation: null };
  const request = params.mergeContext.request;
  const fallback = (reason: string, errors: string[] = []): ConflictResolverInvocationResult => ({
    status: "conflict",
    result: null,
    fallback: {
      operator_visible_status: "conflict",
      reason,
      conflict_paths: [...request.conflict_paths],
      errors,
    },
  });
  let worktreeAdded = false;

  let acceptedResult: WorkerOutputIntegrationApplyResult | null = null;
  let invocation: ConflictResolverInvocationResult | null = null;
  try {
    const worktreeAdd = await params.commandRunner(params.repoRoot, [
      "git",
      "worktree",
      "add",
      "--detach",
      request.isolated_worktree.path,
      request.isolated_worktree.session_revision,
    ]);
    if (worktreeAdd.exitCode !== 0) {
      return {
        result: null,
        invocation: fallback("conflict-resolver worktree setup failed", [outputTail(worktreeAdd.stderr || worktreeAdd.stdout)]),
      };
    }
    worktreeAdded = true;
    invocation = await invokeConflictResolver({
      request,
      outputDir: resolve(params.artifacts.artifactDir, "conflict_resolver"),
      stateDir: params.stateDir,
      project: params.config.project,
      provider: params.config.provider,
      model: params.config.model,
      thinkingLevel: params.config.thinkingLevel,
      timeoutMs: params.config.timeoutMs,
      dryRun: params.config.dryRun,
      runner: params.config.runner,
      acceptResolution: async ({ result }) => {
        let resolvedPatchPath = result.resolved_patch.path;
        if (result.resolved_patch.text) {
          resolvedPatchPath = resolve(params.artifacts.artifactDir, "resolved.patch");
          await writeFile(resolvedPatchPath, result.resolved_patch.text);
        } else if (resolvedPatchPath && !isAbsolute(resolvedPatchPath)) {
          resolvedPatchPath = resolve(request.isolated_worktree.path, resolvedPatchPath);
        }
        if (!resolvedPatchPath || !existsSync(resolvedPatchPath)) {
          return { applied: false, recorded: false, summary: "resolver did not produce a readable patch" };
        }
        const check = await params.commandRunner(params.repoRoot, ["git", "apply", "--check", resolvedPatchPath]);
        if (check.exitCode !== 0) {
          return { applied: false, recorded: false, summary: `resolved patch check failed: ${outputTail(check.stderr || check.stdout)}` };
        }
        const apply = await params.commandRunner(params.repoRoot, ["git", "apply", resolvedPatchPath]);
        if (apply.exitCode !== 0) {
          return { applied: false, recorded: false, summary: `resolved patch apply failed: ${outputTail(apply.stderr || apply.stdout)}` };
        }
        const revisions = await commitAppliedPatch({
          commandRunner: params.commandRunner,
          repoRoot: params.repoRoot,
          record: params.record,
          patchPath: resolvedPatchPath,
          paths: uniqueStrings([
            ...params.record.writeSet,
            ...request.conflict_paths.filter((path) => path.includes("/") || /\.[A-Za-z0-9_+-]+$/.test(path)),
          ]),
        });
        acceptedResult = await updateAndSummarize(params.store, params.record, {
          status: "applied",
          disposition: "conflict_resolved",
          artifacts: params.artifacts,
          itemPath: params.artifacts.itemPath,
          metadata: {
            merge_on_finish: true,
            validation_state: "tentative",
            pre_apply_rev: revisions.preApplyRev,
            integrated_rev: revisions.integratedRev,
            resolver_result: result,
            incumbent_claims: params.mergeContext?.incumbents ?? [],
          },
        });
        markTentative(params.store, params.record);
        addEvent(params.store, params.record.sessionId, "worker_integration_applied", "conflict-resolver", acceptedResult);
        return { applied: true, recorded: true, summary: "resolved patch applied serially, committed, and recorded" };
      },
    });
  } catch (error) {
    invocation = fallback("conflict-resolver integration failed", [error instanceof Error ? error.message : String(error)]);
  } finally {
    if (worktreeAdded) {
      try {
        await params.commandRunner(params.repoRoot, ["git", "worktree", "remove", "--force", request.isolated_worktree.path]);
      } catch {
        // Cleanup failure must not replace the resolver disposition. The
        // isolated worktree is never the session integration checkout.
      }
    }
  }
  return { result: invocation?.status === "resolved" ? acceptedResult : null, invocation };
}

async function handleApplyConflict(params: {
  artifacts: ApplyArtifacts;
  command: string[];
  commandRunner: CommandRunner;
  conflictResolver: WorkerOutputConflictResolverConfig | undefined;
  exitCode: number;
  failureReasons: string[];
  conflictPaths: string[];
  mergeOnFinish: boolean;
  patchText: string;
  repoRoot: string;
  stateDir: string;
  stderr: string;
  stderrPath: string;
  stdout: string;
  stdoutPath: string;
  store: StateStore;
  record: WorkerOutputIntegrationRecord;
  disposition: string;
}): Promise<WorkerOutputIntegrationApplyResult> {
  const isolatedWorktreePath = resolve(params.artifacts.artifactDir, "conflict_resolver_worktree");
  const mergeContext = params.mergeOnFinish
    ? await conflictResolverRequest({
        commandRunner: params.commandRunner,
        repoRoot: params.repoRoot,
        artifacts: params.artifacts,
        store: params.store,
        record: params.record,
        patchText: params.patchText,
        conflictPaths: params.conflictPaths,
        isolatedWorktreePath,
      })
    : undefined;
  const item = conflictItem({
    record: params.record,
    target: targetSnapshot(params.store, params.record),
    checkpoint: checkpointSnapshot(params.store, params.record),
    command: params.command,
    exitCode: params.exitCode,
    stdout: params.stdout,
    stderr: params.stderr,
    stdoutPath: params.stdoutPath,
    stderrPath: params.stderrPath,
    conflictPaths: params.conflictPaths,
    failureReasons: params.failureReasons,
    mergeContext: mergeContext
      ? {
          ...mergeContext,
          currentBranchDiffPath: params.artifacts.currentBranchDiffPath,
        }
      : undefined,
  });
  await writeFile(params.artifacts.itemPath, `${JSON.stringify(item, null, 2)}\n`);

  const resolution = await tryConflictResolver({
    artifacts: params.artifacts,
    commandRunner: params.commandRunner,
    config: params.mergeOnFinish ? params.conflictResolver : undefined,
    mergeContext,
    repoRoot: params.repoRoot,
    stateDir: params.stateDir,
    store: params.store,
    record: params.record,
  });
  if (resolution.result) return resolution.result;

  const result = await updateAndSummarize(params.store, params.record, {
    status: "conflict",
    disposition: params.disposition,
    artifacts: params.artifacts,
    itemPath: params.artifacts.itemPath,
    checkStdoutPath: params.artifacts.checkStdoutPath,
    checkStderrPath: params.artifacts.checkStderrPath,
    applyStdoutPath: params.disposition === "apply_failed" ? params.artifacts.applyStdoutPath : null,
    applyStderrPath: params.disposition === "apply_failed" ? params.artifacts.applyStderrPath : null,
    failureReasons: params.failureReasons,
    conflictPaths: params.conflictPaths,
    metadata: {
      queue_summary_path: params.artifacts.queueSummaryPath,
      ...(params.mergeOnFinish
        ? {
            merge_on_finish: true,
            conflict_resolver_status: resolution.invocation?.status ?? "not_invoked",
            conflict_resolver_fallback:
              resolution.invocation?.status === "conflict" ? resolution.invocation.fallback : null,
          }
        : {}),
    },
  });
  await writeFile(
    params.artifacts.queueSummaryPath,
    `${JSON.stringify(workerOutputIntegrationQueueSummary(params.store, params.record.sessionId), null, 2)}\n`,
  );
  addEvent(params.store, params.record.sessionId, "worker_integration_conflict", "worker-output-integration", result);
  return result;
}

async function applyClaimedWorkerOutput(params: {
  commandRunner: CommandRunner;
  conflictResolver?: WorkerOutputConflictResolverConfig;
  dryRun: boolean;
  mergeOnFinish: boolean;
  repoRoot: string;
  stateDir: string;
  store: StateStore;
  record: WorkerOutputIntegrationRecord;
}): Promise<WorkerOutputIntegrationApplyResult> {
  const artifacts = integrationArtifacts(params.stateDir, params.record.sessionId, params.record.id);
  await mkdir(artifacts.artifactDir, { recursive: true });

  if (params.dryRun) {
    const result = await updateAndSummarize(params.store, params.record, {
      status: "skipped",
      disposition: "dry_run",
      artifacts,
      failureReasons: ["dry-run agents do not apply worker output patches"],
    });
    addEvent(params.store, params.record.sessionId, "worker_integration_skipped", "worker-output-integration", result);
    return result;
  }

  if (!params.record.patchPath || !existsSync(params.record.patchPath)) {
    const result = await updateAndSummarize(params.store, params.record, {
      status: "failed",
      disposition: "missing_patch",
      artifacts,
      failureReasons: [`selected checkpoint patch is missing: ${params.record.patchPath ?? "(none)"}`],
    });
    addEvent(params.store, params.record.sessionId, "worker_integration_conflict", "worker-output-integration", result);
    return result;
  }

  const patchText = await readFile(params.record.patchPath, "utf8");
  if (!patchText.trim()) {
    const result = await updateAndSummarize(params.store, params.record, {
      status: "skipped",
      disposition: "empty_patch",
      artifacts,
      failureReasons: ["selected checkpoint patch was empty"],
    });
    addEvent(params.store, params.record.sessionId, "worker_integration_skipped", "worker-output-integration", result);
    return result;
  }

  const checkCommand = ["git", "apply", "--check", params.record.patchPath];
  const check = await params.commandRunner(params.repoRoot, checkCommand);
  await writeFile(artifacts.checkStdoutPath, check.stdout);
  await writeFile(artifacts.checkStderrPath, check.stderr);
  if (check.exitCode !== 0) {
    const conflictPaths = extractConflictPaths(`${check.stdout}\n${check.stderr}`, params.record.writeSet);
    const failureReasons = [`git apply --check exited ${check.exitCode}: ${outputTail(check.stderr || check.stdout, 1000)}`];
    return handleApplyConflict({
      artifacts,
      command: checkCommand,
      commandRunner: params.commandRunner,
      conflictResolver: params.conflictResolver,
      exitCode: check.exitCode,
      failureReasons,
      conflictPaths,
      mergeOnFinish: params.mergeOnFinish,
      patchText,
      repoRoot: params.repoRoot,
      stateDir: params.stateDir,
      stderr: check.stderr,
      stderrPath: artifacts.checkStderrPath,
      stdout: check.stdout,
      stdoutPath: artifacts.checkStdoutPath,
      store: params.store,
      record: params.record,
      disposition: "apply_check_failed",
    });
  }

  const applyCommand = ["git", "apply", params.record.patchPath];
  const apply = await params.commandRunner(params.repoRoot, applyCommand);
  await writeFile(artifacts.applyStdoutPath, apply.stdout);
  await writeFile(artifacts.applyStderrPath, apply.stderr);
  if (apply.exitCode !== 0) {
    const conflictPaths = extractConflictPaths(`${apply.stdout}\n${apply.stderr}`, params.record.writeSet);
    const failureReasons = [`git apply exited ${apply.exitCode}: ${outputTail(apply.stderr || apply.stdout, 1000)}`];
    return handleApplyConflict({
      artifacts,
      command: applyCommand,
      commandRunner: params.commandRunner,
      conflictResolver: params.conflictResolver,
      exitCode: apply.exitCode,
      failureReasons,
      conflictPaths,
      mergeOnFinish: params.mergeOnFinish,
      patchText,
      repoRoot: params.repoRoot,
      stateDir: params.stateDir,
      stderr: apply.stderr,
      stderrPath: artifacts.applyStderrPath,
      stdout: apply.stdout,
      stdoutPath: artifacts.applyStdoutPath,
      store: params.store,
      record: params.record,
      disposition: "apply_failed",
    });
  }

  const revisions = params.mergeOnFinish
    ? await commitAppliedPatch({
        commandRunner: params.commandRunner,
        repoRoot: params.repoRoot,
        record: params.record,
        patchPath: params.record.patchPath,
      })
    : null;
  const result = await updateAndSummarize(params.store, params.record, {
    status: "applied",
    disposition: params.mergeOnFinish ? "merge_on_finish_clean" : "clean_apply",
    artifacts,
    checkStdoutPath: artifacts.checkStdoutPath,
    checkStderrPath: artifacts.checkStderrPath,
    applyStdoutPath: artifacts.applyStdoutPath,
    applyStderrPath: artifacts.applyStderrPath,
    metadata: revisions
      ? {
          merge_on_finish: true,
          validation_state: "tentative",
          pre_apply_rev: revisions.preApplyRev,
          integrated_rev: revisions.integratedRev,
        }
      : undefined,
  });
  if (params.mergeOnFinish) markTentative(params.store, params.record);
  addEvent(params.store, params.record.sessionId, "worker_integration_applied", "worker-output-integration", result);
  return result;
}

export async function processWorkerOutputIntegrationQueue(params: {
  commandRunner?: CommandRunner;
  conflictResolver?: WorkerOutputConflictResolverConfig;
  dryRun: boolean;
  limit?: number;
  mergeOnFinish?: boolean;
  mergeOnFinishWaitMs?: number;
  repoRoot: string;
  sessionId: string;
  stateDir: string;
  store: StateStore;
}): Promise<WorkerOutputIntegrationQueueResult> {
  const processed: WorkerOutputIntegrationApplyResult[] = [];
  const mergeOnFinish = params.mergeOnFinish ?? processWriteSetIntegrationFlags().mergeOnFinish;
  const limit = Math.max(1, Math.trunc(params.limit ?? (mergeOnFinish ? 1024 : 16)));
  const waitDeadline = Date.now() + Math.max(0, params.mergeOnFinishWaitMs ?? 30_000);
  const commandRunner = params.commandRunner ?? runCommand;

  while (processed.length < limit) {
    const record = claimNextWorkerOutputIntegration(params.store, params.sessionId);
    if (!record) {
      if (mergeOnFinish && Date.now() < waitDeadline) {
        const pending = params.store.db
          .query(
            `
              SELECT
                SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
                SUM(CASE WHEN status = 'applying' THEN 1 ELSE 0 END) AS applying
              FROM worker_output_integrations
              WHERE session_id = ?
            `,
          )
          .get(params.sessionId) as Record<string, unknown>;
        if (Number(pending.queued ?? 0) > 0 && Number(pending.applying ?? 0) > 0) {
          await new Promise((resolveWait) => setTimeout(resolveWait, 25));
          continue;
        }
      }
      break;
    }
    try {
      processed.push(
        await applyClaimedWorkerOutput({
          commandRunner,
          conflictResolver: params.conflictResolver,
          dryRun: params.dryRun,
          mergeOnFinish,
          repoRoot: params.repoRoot,
          stateDir: params.stateDir,
          store: params.store,
          record,
        }),
      );
    } catch (error) {
      const artifacts = integrationArtifacts(params.stateDir, record.sessionId, record.id);
      await mkdir(artifacts.artifactDir, { recursive: true });
      const result = await updateAndSummarize(params.store, record, {
        status: "failed",
        disposition: "processor_error",
        artifacts,
        failureReasons: [error instanceof Error ? error.message : String(error)],
      });
      addEvent(params.store, record.sessionId, "worker_integration_conflict", "worker-output-integration", result);
      processed.push(result);
    }
  }

  return {
    processed,
    queueSummary: workerOutputIntegrationQueueSummary(params.store, params.sessionId),
  };
}

/**
 * Targeted merge-on-finish seam for the worker owner. The generic processor is
 * retained for the legacy flag-off batch/recovery/boundary calls.
 */
export async function processWorkerOutputOnFinish(
  params: Omit<Parameters<typeof processWorkerOutputIntegrationQueue>[0], "mergeOnFinish">,
): Promise<WorkerOutputIntegrationQueueResult> {
  return processWorkerOutputIntegrationQueue({ ...params, mergeOnFinish: true });
}
