import { createHash } from "node:crypto";

import type { NewContainer } from "@agent-kernel/db";

import { MELEE_KERNEL_ID } from "./config.js";

const MELEE_APP_SESSION_NAMESPACE = "0dbd5814-75c3-4dc8-9b3b-0f6277cc2b08";
const MELEE_WORKFLOW_TRACE_EVENT_NAMESPACE = "ced83bd4-c12c-5a72-9ae8-507d0da283cf";

export type AppContainerKind =
  | "session"
  | "prepare"
  | "sync"
  | "sync-intake"
  | "intake"
  | "intake-item"
  | "intake-postmortem"
  | "intake-knowledge"
  | "knowledge"
  | "knowledge-job"
  | "baseline"
  | "run"
  | "epoch"
  | "worker"
  | "worker-integration"
  | "postmortem"
  | "pr"
  | "pr-handoff"
  | "pr-qa"
  | "pr-split"
  | "pr-review"
  | "pr-repair"
  | "pr-publication";

/**
 * Every phase either writer emits, in rough cycle order. Both container writers
 * share this list so a container's phase menu does not depend on which writer
 * created the row.
 */
export const APP_PHASE_VOCABULARY = [
  "session",
  "prepare",
  "sync",
  "setup",
  "intake",
  "intake-item",
  "knowledge-intake",
  "knowledge",
  "knowledge-job",
  "knowledge-curation",
  "baseline",
  "run",
  "epoch",
  "worker",
  "integration",
  "postmortem",
  "pr",
  "handoff",
  "qa",
  "pr-split",
  "pr-review",
  "review",
  "repair",
  "reconcile",
  "publication",
];

export interface AppCycleRef {
  gameId: string;
  sessionId: string;
}

export interface AppWorkflowTraceEventRef extends AppCycleRef {
  containerId: string;
  eventType: string;
  operation: string;
  gameEventId: string;
  status: string;
}

export interface AppRunRef extends AppCycleRef {
  runId: string;
}

export interface AppEpochRef extends AppRunRef {
  epochId: string | number;
}

export interface AppClaimRef extends AppEpochRef {
  claimId: string;
  targetId?: string;
}

export interface AppKnowledgeJobRef extends AppCycleRef {
  jobKey: string;
}

export interface AppPrRef extends AppCycleRef {
  prId?: string;
}

export interface AppIntakePrRef extends AppCycleRef {
  prId: string | number;
}

export interface AppReviewRef extends AppPrRef {
  reviewId: string;
}

export interface AppRepairRef extends AppPrRef {
  repairId: string;
}

export interface AppContainerDescriptor {
  id: string;
  kind: AppContainerKind;
  appSessionId: string;
  parentContainerId: string | null;
  label: string;
  phase: string;
  metadata: Record<string, unknown>;
}

export interface BuildAppContainerInput {
  kind: AppContainerKind;
  ref: AppCycleRef;
  parentContainerId?: string | null;
  label?: string;
  phase?: string;
  workingDir?: string | null;
  worktreePath?: string | null;
  status?: NewContainer["status"];
  metadata?: Record<string, unknown>;
  startedAt?: string | null;
}

function stableUuid(namespace: string, name: string): string {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(namespaceBytes).update(name).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function cleanSegment(value: string | number | undefined): string {
  if (value === undefined) return "none";
  const raw = String(value).trim();
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const digest = createHash("sha1").update(raw).digest("hex").slice(0, 10);
  return `${normalized || "id"}-${digest}`;
}

export function appAppSessionId(ref: AppCycleRef): string {
  return stableUuid(
    MELEE_APP_SESSION_NAMESPACE,
    `game:${ref.gameId}\nsession:${ref.sessionId}`,
  );
}

/**
 * Stable kernel event identity for one game-event trace submission.
 * Kernel inserts are conflict-safe by event id, so retrying after a local
 * cursor failure replays the same event instead of appending a duplicate.
 */
export function appWorkflowTraceEventId(ref: AppWorkflowTraceEventRef): string {
  return stableUuid(
    MELEE_WORKFLOW_TRACE_EVENT_NAMESPACE,
    [
      `game:${ref.gameId}`,
      `session:${ref.sessionId}`,
      `game-event:${ref.gameEventId}`,
      `container:${ref.containerId}`,
      `type:${ref.eventType}`,
      `operation:${ref.operation}`,
      `status:${ref.status}`,
    ].join("\n"),
  );
}

export function appRootContainerId(ref: AppCycleRef): string {
  return `melee:${appAppSessionId(ref)}:session`;
}

export function appSyncContainerId(ref: AppCycleRef): string {
  return `${appRootContainerId(ref)}:sync`;
}

export function appSyncWorkflowContainerId(ref: AppCycleRef, syncId: string): string {
  return `${appSyncContainerId(ref)}:${cleanSegment(syncId)}`;
}

export function appSyncWorkflowIntakeContainerId(
  ref: AppCycleRef,
  syncId: string,
): string {
  return `${appSyncWorkflowContainerId(ref, syncId)}:intake`;
}

export function appSyncWorkflowIntakeItemContainerId(
  ref: AppCycleRef,
  syncId: string,
  prId: string | number,
): string {
  return `${appSyncWorkflowIntakeContainerId(ref, syncId)}:pr:${cleanSegment(prId)}`;
}

export function appSyncWorkflowIntakePostmortemContainerId(
  ref: AppCycleRef,
  syncId: string,
  prId: string | number,
): string {
  return `${appSyncWorkflowIntakeItemContainerId(ref, syncId, prId)}:postmortem`;
}

export function appSyncWorkflowIntakeKnowledgeContainerId(
  ref: AppCycleRef,
  syncId: string,
  prId: string | number,
): string {
  return `${appSyncWorkflowIntakeItemContainerId(ref, syncId, prId)}:knowledge-intake`;
}

export function appSyncWorkflowKnowledgeContainerId(
  ref: AppCycleRef,
  syncId: string,
): string {
  return `${appSyncWorkflowContainerId(ref, syncId)}:knowledge`;
}

export function appSyncWorkflowKnowledgeJobContainerId(
  ref: AppCycleRef,
  syncId: string,
  jobKey: string,
): string {
  return `${appSyncWorkflowKnowledgeContainerId(ref, syncId)}:${cleanSegment(jobKey)}`;
}

/**
 * Legacy id prefix retained so existing child rows keep stable ids when they
 * move under the Sync container.
 */
export function appPrepareContainerId(ref: AppCycleRef): string {
  return `${appRootContainerId(ref)}:prepare`;
}

export function appSyncIntakeContainerId(ref: AppCycleRef): string {
  return `${appPrepareContainerId(ref)}:sync-intake`;
}

export function appIntakeContainerId(ref: AppCycleRef): string {
  return `${appPrepareContainerId(ref)}:intake`;
}

export function appIntakeItemContainerId(ref: AppIntakePrRef): string {
  return `${appIntakeContainerId(ref)}:pr:${cleanSegment(ref.prId)}`;
}

export function appIntakePostmortemContainerId(ref: AppIntakePrRef): string {
  return `${appIntakeItemContainerId(ref)}:postmortem`;
}

export function appIntakeKnowledgeContainerId(ref: AppIntakePrRef): string {
  return `${appIntakeItemContainerId(ref)}:knowledge-intake`;
}

/**
 * Legacy cycle-global knowledge lane for sync-less operator and CLI work.
 * Sync-scoped jobs use `appSyncWorkflowKnowledgeContainerId` instead.
 */
export function appKnowledgeContainerId(ref: AppCycleRef): string {
  return `${appRootContainerId(ref)}:knowledge`;
}

export function appRunKnowledgeContainerId(ref: AppRunRef): string {
  return `${appRunContainerId(ref)}:knowledge`;
}

export function appRunKnowledgeJobContainerId(ref: AppRunRef & { jobKey: string }): string {
  return `${appRunKnowledgeContainerId(ref)}:${cleanSegment(ref.jobKey)}`;
}

export function appKnowledgeJobContainerId(ref: AppKnowledgeJobRef): string {
  return `${appKnowledgeContainerId(ref)}:${cleanSegment(ref.jobKey)}`;
}

export function appBaselineContainerId(ref: AppCycleRef): string {
  return `${appPrepareContainerId(ref)}:baseline`;
}

export function appRunContainerId(ref: AppRunRef): string {
  return `${appRootContainerId(ref)}:run:${cleanSegment(ref.runId)}`;
}

export function appEpochContainerId(ref: AppEpochRef): string {
  return `${appRunContainerId(ref)}:epoch:${cleanSegment(ref.epochId)}`;
}

export function appWorkerContainerId(ref: AppClaimRef): string {
  return `${appEpochContainerId(ref)}:worker:${cleanSegment(ref.claimId)}`;
}

export function appWorkerIntegrationContainerId(ref: AppClaimRef): string {
  return `${appEpochContainerId(ref)}:integration:${cleanSegment(ref.claimId)}`;
}

export function appPostmortemContainerId(ref: AppClaimRef): string {
  return `${appEpochContainerId(ref)}:postmortem:${cleanSegment(ref.claimId)}`;
}

export function appPrContainerId(ref: AppPrRef): string {
  return `${appRootContainerId(ref)}:pr:${cleanSegment(ref.prId ?? "session")}`;
}

export function appPrHandoffContainerId(ref: AppPrRef): string {
  return `${appPrContainerId(ref)}:handoff`;
}

export function appPrQaContainerId(ref: AppPrRef): string {
  return `${appPrContainerId(ref)}:qa`;
}

export function appPrSplitContainerId(ref: AppPrRef): string {
  return `${appPrContainerId(ref)}:split`;
}

export function appPrReviewContainerId(ref: AppReviewRef): string {
  return `${appPrContainerId(ref)}:review:${cleanSegment(ref.reviewId)}`;
}

export function appPrRepairContainerId(ref: AppRepairRef): string {
  return `${appPrContainerId(ref)}:repair:${cleanSegment(ref.repairId)}`;
}

export function appPrPublicationContainerId(ref: AppPrRef): string {
  return `${appPrContainerId(ref)}:publication`;
}

/**
 * Metadata fields are the only channel a caller has for the ids that make a
 * container identity (runId, epochId, claimId, ...). Numbers are accepted
 * because epoch ids arrive as both.
 */
function metaId(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text : undefined;
}

/**
 * Degraded-but-deterministic fallbacks. These mirror `spawn-context.ts` exactly
 * so both writers land on the same container row for the same inputs; a missing
 * field degrades to the same literal spawn-context uses ("active", "none",
 * "review", "repair", the session id) rather than an opaque hash bucket.
 */
function appRunId(ref: AppCycleRef, metadata: Record<string, unknown>): string {
  return metaId(metadata, "runId") ?? ref.sessionId;
}

function appSyncWorkflowId(metadata: Record<string, unknown>): string | undefined {
  const runId = metaId(metadata, "runId");
  return runId && /^sync-/.test(runId) ? runId : undefined;
}

function appSyncWorkflowLabel(syncId: string): string {
  const uuidPart = syncId.replace(/^sync-/, "");
  return `Sync ${uuidPart.slice(0, 8) || syncId.slice(0, 8)}`;
}

function appEpochId(metadata: Record<string, unknown>): string {
  return metaId(metadata, "epochId") ?? "active";
}

function appClaimId(metadata: Record<string, unknown>): string {
  return metaId(metadata, "claimId") ?? metaId(metadata, "itemId") ?? "none";
}

/**
 * PR id for kinds spawn-context also writes: `prId ?? runId ?? sessionId`.
 * The `pr` / `pr-publication` / `pr-handoff` / `pr-qa` kinds keep the older
 * `prId ?? "session"` fallback so their existing ids stay stable.
 */
function appSpawnPrId(ref: AppCycleRef, metadata: Record<string, unknown>): string {
  return metaId(metadata, "prId") ?? appRunId(ref, metadata);
}

function appWorkflowPrId(metadata: Record<string, unknown>): string {
  return metaId(metadata, "prId") ?? "session";
}

/**
 * Knowledge jobs are keyed by whatever the caller can name them by: a queued
 * job id when the background processor runs one, otherwise the batch or worker
 * state the operator CLI is chewing through. Two jobs must never collapse onto
 * one container, so an unnamed job degrades to "job" and nothing finer.
 */
function appKnowledgeJobKey(metadata: Record<string, unknown>): string {
  return (
    metaId(metadata, "jobKey") ??
    metaId(metadata, "jobId") ??
    metaId(metadata, "subjectId") ??
    metaId(metadata, "subject_id") ??
    metaId(metadata, "batchId") ??
    metaId(metadata, "workerStateId") ??
    "job"
  );
}

export function describeAppContainer(
  kind: AppContainerKind,
  ref: AppCycleRef,
  metadata: Record<string, unknown> = {},
): AppContainerDescriptor {
  const appSessionId = appAppSessionId(ref);
  const rootId = appRootContainerId(ref);
  const syncId = appSyncWorkflowId(metadata);

  switch (kind) {
    case "session":
      return {
        id: rootId,
        kind,
        appSessionId,
        parentContainerId: null,
        label: `Cycle ${ref.sessionId}`,
        phase: "session",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId },
      };
    case "prepare":
      return {
        id: appPrepareContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: rootId,
        label: "Prepare",
        phase: "prepare",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId },
      };
    case "sync":
      return {
        id: syncId
          ? appSyncWorkflowContainerId(ref, syncId)
          : appSyncContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: rootId,
        label: syncId ? appSyncWorkflowLabel(syncId) : "Sync",
        phase: "sync",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId },
      };
    case "sync-intake":
      return {
        id: appSyncIntakeContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: appPrepareContainerId(ref),
        label: "Sync Intake",
        phase: "setup",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId },
      };
    case "intake":
      return {
        id: syncId
          ? appSyncWorkflowIntakeContainerId(ref, syncId)
          : appIntakeContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: syncId
          ? appSyncWorkflowContainerId(ref, syncId)
          : appPrepareContainerId(ref),
        label: "Intake",
        phase: "intake",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId },
      };
    case "intake-item": {
      const prId = typeof metadata.prId === "string" && metadata.prId ? metadata.prId : "item";
      const intakeRef = { ...ref, prId };
      return {
        id: syncId
          ? appSyncWorkflowIntakeItemContainerId(ref, syncId, prId)
          : appIntakeItemContainerId(intakeRef),
        kind,
        appSessionId,
        parentContainerId: syncId
          ? appSyncWorkflowIntakeContainerId(ref, syncId)
          : appIntakeContainerId(ref),
        label: prId.startsWith("#") ? `${prId} intake` : `PR #${prId} intake`,
        phase: "intake-item",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, prId },
      };
    }
    case "intake-postmortem": {
      const prId = typeof metadata.prId === "string" && metadata.prId ? metadata.prId : "item";
      const intakeRef = { ...ref, prId };
      return {
        id: syncId
          ? appSyncWorkflowIntakePostmortemContainerId(ref, syncId, prId)
          : appIntakePostmortemContainerId(intakeRef),
        kind,
        appSessionId,
        parentContainerId: syncId
          ? appSyncWorkflowIntakeItemContainerId(ref, syncId, prId)
          : appIntakeItemContainerId(intakeRef),
        label: prId.startsWith("#") ? `${prId} postmortem` : `PR #${prId} postmortem`,
        phase: "postmortem",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, prId },
      };
    }
    case "intake-knowledge": {
      const prId = typeof metadata.prId === "string" && metadata.prId ? metadata.prId : "item";
      const intakeRef = { ...ref, prId };
      return {
        id: syncId
          ? appSyncWorkflowIntakeKnowledgeContainerId(ref, syncId, prId)
          : appIntakeKnowledgeContainerId(intakeRef),
        kind,
        appSessionId,
        parentContainerId: syncId
          ? appSyncWorkflowIntakeItemContainerId(ref, syncId, prId)
          : appIntakeItemContainerId(intakeRef),
        label: prId.startsWith("#") ? `${prId} knowledge intake` : `PR #${prId} knowledge intake`,
        phase: "knowledge-intake",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, prId },
      };
    }
    case "knowledge":
      const knowledgeRunId = appRunId(ref, metadata);
      const runScopedKnowledge = Boolean(metaId(metadata, "runId") && !syncId);
      return {
        id: syncId
          ? appSyncWorkflowKnowledgeContainerId(ref, syncId)
          : runScopedKnowledge
            ? appRunKnowledgeContainerId({ ...ref, runId: knowledgeRunId })
            : appKnowledgeContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: syncId
          ? appSyncWorkflowContainerId(ref, syncId)
          : runScopedKnowledge
            ? appRunContainerId({ ...ref, runId: knowledgeRunId })
            : rootId,
        label: "Knowledge",
        phase: "knowledge",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId },
      };
    case "knowledge-job": {
      const jobKey = appKnowledgeJobKey(metadata);
      const jobKind = metaId(metadata, "jobKind");
      const knowledgeRunId = appRunId(ref, metadata);
      const runScopedKnowledge = Boolean(metaId(metadata, "runId") && !syncId);
      const targetKey = metaId(metadata, "targetKey");
      return {
        id: syncId
          ? appSyncWorkflowKnowledgeJobContainerId(ref, syncId, jobKey)
          : runScopedKnowledge
            ? appRunKnowledgeJobContainerId({ ...ref, runId: knowledgeRunId, jobKey })
            : appKnowledgeJobContainerId({ ...ref, jobKey }),
        kind,
        appSessionId,
        parentContainerId: syncId
          ? appSyncWorkflowKnowledgeContainerId(ref, syncId)
          : runScopedKnowledge
            ? appRunKnowledgeContainerId({ ...ref, runId: knowledgeRunId })
            : appKnowledgeContainerId(ref),
        label: targetKey
          ? `Condense ${targetKey}`
          : jobKind
            ? `${jobKind} ${jobKey}`
            : `Knowledge job ${jobKey}`,
        phase: "knowledge-job",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, jobKey },
      };
    }
    case "baseline":
      return {
        id: appBaselineContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: appPrepareContainerId(ref),
        label: "Baseline and rebuild",
        phase: "baseline",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId },
      };
    case "pr": {
      const prId = appWorkflowPrId(metadata);
      const prRef = { ...ref, prId };
      return {
        id: appPrContainerId(prRef),
        kind,
        appSessionId,
        // "PR mode" is the label for the id-less session-wide PR container;
        // a real PR id names itself (spawn-context's label, now the only one).
        parentContainerId: rootId,
        label: prId === "session" ? "PR mode" : `PR ${prId}`,
        phase: "pr",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, prId },
      };
    }
    case "pr-publication": {
      const prId = typeof metadata.prId === "string" && metadata.prId ? metadata.prId : "session";
      const prRef = { ...ref, prId };
      return {
        id: appPrPublicationContainerId(prRef),
        kind,
        appSessionId,
        parentContainerId: appPrContainerId(prRef),
        label: "PR publication",
        phase: "publication",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, prId },
      };
    }
    case "run": {
      const runId = appRunId(ref, metadata);
      return {
        id: appRunContainerId({ ...ref, runId }),
        kind,
        appSessionId,
        parentContainerId: rootId,
        label: `Run ${runId}`,
        phase: "run",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, runId },
      };
    }
    case "epoch": {
      const runId = appRunId(ref, metadata);
      const epochId = appEpochId(metadata);
      return {
        id: appEpochContainerId({ ...ref, runId, epochId }),
        kind,
        appSessionId,
        parentContainerId: appRunContainerId({ ...ref, runId }),
        label: `Epoch ${epochId}`,
        phase: "epoch",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, runId, epochId },
      };
    }
    case "worker": {
      const runId = appRunId(ref, metadata);
      const epochId = appEpochId(metadata);
      const claimId = appClaimId(metadata);
      return {
        id: appWorkerContainerId({ ...ref, runId, epochId, claimId }),
        kind,
        appSessionId,
        parentContainerId: appEpochContainerId({ ...ref, runId, epochId }),
        label: `Worker claim ${claimId}`,
        phase: "worker",
        metadata: {
          ...metadata,
          gameId: ref.gameId,
          sessionId: ref.sessionId,
          runId,
          epochId,
          claimId,
        },
      };
    }
    case "worker-integration": {
      const runId = appRunId(ref, metadata);
      const epochId = appEpochId(metadata);
      const claimId = appClaimId(metadata);
      return {
        id: appWorkerIntegrationContainerId({ ...ref, runId, epochId, claimId }),
        kind,
        appSessionId,
        parentContainerId: appEpochContainerId({ ...ref, runId, epochId }),
        label: `Worker integration ${claimId}`,
        phase: "integration",
        metadata: {
          ...metadata,
          gameId: ref.gameId,
          sessionId: ref.sessionId,
          runId,
          epochId,
          claimId,
        },
      };
    }
    case "postmortem": {
      const runId = appRunId(ref, metadata);
      const epochId = appEpochId(metadata);
      const claimId = appClaimId(metadata);
      return {
        id: appPostmortemContainerId({ ...ref, runId, epochId, claimId }),
        kind,
        appSessionId,
        parentContainerId: appEpochContainerId({ ...ref, runId, epochId }),
        // A claim-less postmortem is an epoch-level retro, not a claim's.
        label: metaId(metadata, "claimId")
          ? `Postmortem claim ${claimId}`
          : `Postmortem ${claimId}`,
        phase: "postmortem",
        metadata: {
          ...metadata,
          gameId: ref.gameId,
          sessionId: ref.sessionId,
          runId,
          epochId,
          claimId,
        },
      };
    }
    case "pr-handoff": {
      const prId = appWorkflowPrId(metadata);
      const prRef = { ...ref, prId };
      return {
        id: appPrHandoffContainerId(prRef),
        kind,
        appSessionId,
        parentContainerId: appPrContainerId(prRef),
        label: "PR handoff",
        phase: "handoff",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, prId },
      };
    }
    case "pr-qa": {
      const prId = appWorkflowPrId(metadata);
      const prRef = { ...ref, prId };
      return {
        id: appPrQaContainerId(prRef),
        kind,
        appSessionId,
        parentContainerId: appPrContainerId(prRef),
        label: "PR QA",
        phase: "qa",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, prId },
      };
    }
    case "pr-split": {
      const prId = appSpawnPrId(ref, metadata);
      const prRef = { ...ref, prId };
      return {
        id: appPrSplitContainerId(prRef),
        kind,
        appSessionId,
        parentContainerId: appPrContainerId(prRef),
        label: `PR split ${prId}`,
        phase: "pr-split",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, prId },
      };
    }
    case "pr-review": {
      const prId = appSpawnPrId(ref, metadata);
      const prRef = { ...ref, prId };
      const reviewId = metaId(metadata, "reviewId") ?? "review";
      return {
        id: appPrReviewContainerId({ ...prRef, reviewId }),
        kind,
        appSessionId,
        parentContainerId: appPrContainerId(prRef),
        label: `PR review ${reviewId}`,
        phase: "pr-review",
        metadata: {
          ...metadata,
          gameId: ref.gameId,
          sessionId: ref.sessionId,
          prId,
          reviewId,
        },
      };
    }
    case "pr-repair": {
      const prId = appSpawnPrId(ref, metadata);
      const prRef = { ...ref, prId };
      const repairId = metaId(metadata, "repairId") ?? "repair";
      return {
        id: appPrRepairContainerId({ ...prRef, repairId }),
        kind,
        appSessionId,
        parentContainerId: appPrContainerId(prRef),
        label: `PR repair ${repairId}`,
        phase: "repair",
        metadata: {
          ...metadata,
          gameId: ref.gameId,
          sessionId: ref.sessionId,
          prId,
          repairId,
        },
      };
    }
  }
}

export function buildAppContainer(input: BuildAppContainerInput): NewContainer {
  const descriptor = describeAppContainer(input.kind, input.ref, input.metadata ?? {});
  const createdAt = input.startedAt ?? new Date().toISOString();
  return {
    id: descriptor.id,
    kernelId: MELEE_KERNEL_ID,
    kind: descriptor.kind,
    // Live kernels normally derive UUID ids from kind + appKey. This app keeps
    // its established hierarchical ids until the follow-up identity migration.
    appKey: [descriptor.id],
    parentContainerId: input.parentContainerId ?? descriptor.parentContainerId,
    label: input.label ?? descriptor.label,
    status: input.status ?? "running",
    workingDir: input.workingDir ?? null,
    phase: input.phase ?? descriptor.phase,
    phaseVocabulary: APP_PHASE_VOCABULARY,
    metadata: {
      ...descriptor.metadata,
      appSessionId: descriptor.appSessionId,
      containerId: descriptor.id,
      containerKind: descriptor.kind,
      ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
    },
    createdAt,
    startedAt: createdAt,
  };
}
