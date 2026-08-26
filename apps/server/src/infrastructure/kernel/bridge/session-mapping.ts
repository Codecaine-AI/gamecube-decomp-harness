import { createHash } from "node:crypto";

import type { NewContainer } from "@agent-kernel/db";

import { MELEE_KERNEL_ID } from "./config.js";

const MELEE_APP_SESSION_NAMESPACE = "0dbd5814-75c3-4dc8-9b3b-0f6277cc2b08";
const MELEE_WORKFLOW_TRACE_EVENT_NAMESPACE = "ced83bd4-c12c-5a72-9ae8-507d0da283cf";

export type MeleeContainerKind =
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
export const MELEE_PHASE_VOCABULARY = [
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

export interface MeleeCycleRef {
  gameId: string;
  sessionId: string;
}

export interface MeleeWorkflowTraceEventRef extends MeleeCycleRef {
  containerId: string;
  eventType: string;
  operation: string;
  gameEventId: string;
  status: string;
}

export interface MeleeRunRef extends MeleeCycleRef {
  runId: string;
}

export interface MeleeEpochRef extends MeleeRunRef {
  epochId: string | number;
}

export interface MeleeClaimRef extends MeleeEpochRef {
  claimId: string;
  targetId?: string;
}

export interface MeleeKnowledgeJobRef extends MeleeCycleRef {
  jobKey: string;
}

export interface MeleePrRef extends MeleeCycleRef {
  prId?: string;
}

export interface MeleeIntakePrRef extends MeleeCycleRef {
  prId: string | number;
}

export interface MeleeReviewRef extends MeleePrRef {
  reviewId: string;
}

export interface MeleeRepairRef extends MeleePrRef {
  repairId: string;
}

export interface MeleeContainerDescriptor {
  id: string;
  kind: MeleeContainerKind;
  appSessionId: string;
  parentContainerId: string | null;
  label: string;
  phase: string;
  metadata: Record<string, unknown>;
}

export interface BuildMeleeContainerInput {
  kind: MeleeContainerKind;
  ref: MeleeCycleRef;
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

export function meleeAppSessionId(ref: MeleeCycleRef): string {
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
export function meleeWorkflowTraceEventId(ref: MeleeWorkflowTraceEventRef): string {
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

export function meleeRootContainerId(ref: MeleeCycleRef): string {
  return `melee:${meleeAppSessionId(ref)}:session`;
}

export function meleeSyncContainerId(ref: MeleeCycleRef): string {
  return `${meleeRootContainerId(ref)}:sync`;
}

export function meleeSyncWorkflowContainerId(ref: MeleeCycleRef, syncId: string): string {
  return `${meleeSyncContainerId(ref)}:${cleanSegment(syncId)}`;
}

export function meleeSyncWorkflowIntakeContainerId(
  ref: MeleeCycleRef,
  syncId: string,
): string {
  return `${meleeSyncWorkflowContainerId(ref, syncId)}:intake`;
}

export function meleeSyncWorkflowIntakeItemContainerId(
  ref: MeleeCycleRef,
  syncId: string,
  prId: string | number,
): string {
  return `${meleeSyncWorkflowIntakeContainerId(ref, syncId)}:pr:${cleanSegment(prId)}`;
}

export function meleeSyncWorkflowIntakePostmortemContainerId(
  ref: MeleeCycleRef,
  syncId: string,
  prId: string | number,
): string {
  return `${meleeSyncWorkflowIntakeItemContainerId(ref, syncId, prId)}:postmortem`;
}

export function meleeSyncWorkflowIntakeKnowledgeContainerId(
  ref: MeleeCycleRef,
  syncId: string,
  prId: string | number,
): string {
  return `${meleeSyncWorkflowIntakeItemContainerId(ref, syncId, prId)}:knowledge-intake`;
}

export function meleeSyncWorkflowKnowledgeContainerId(
  ref: MeleeCycleRef,
  syncId: string,
): string {
  return `${meleeSyncWorkflowContainerId(ref, syncId)}:knowledge`;
}

export function meleeSyncWorkflowKnowledgeJobContainerId(
  ref: MeleeCycleRef,
  syncId: string,
  jobKey: string,
): string {
  return `${meleeSyncWorkflowKnowledgeContainerId(ref, syncId)}:${cleanSegment(jobKey)}`;
}

/**
 * Legacy id prefix retained so existing child rows keep stable ids when they
 * move under the Sync container.
 */
export function meleePrepareContainerId(ref: MeleeCycleRef): string {
  return `${meleeRootContainerId(ref)}:prepare`;
}

export function meleeSyncIntakeContainerId(ref: MeleeCycleRef): string {
  return `${meleePrepareContainerId(ref)}:sync-intake`;
}

export function meleeIntakeContainerId(ref: MeleeCycleRef): string {
  return `${meleePrepareContainerId(ref)}:intake`;
}

export function meleeIntakeItemContainerId(ref: MeleeIntakePrRef): string {
  return `${meleeIntakeContainerId(ref)}:pr:${cleanSegment(ref.prId)}`;
}

export function meleeIntakePostmortemContainerId(ref: MeleeIntakePrRef): string {
  return `${meleeIntakeItemContainerId(ref)}:postmortem`;
}

export function meleeIntakeKnowledgeContainerId(ref: MeleeIntakePrRef): string {
  return `${meleeIntakeItemContainerId(ref)}:knowledge-intake`;
}

/**
 * Legacy cycle-global knowledge lane for sync-less operator and CLI work.
 * Sync-scoped jobs use `meleeSyncWorkflowKnowledgeContainerId` instead.
 */
export function meleeKnowledgeContainerId(ref: MeleeCycleRef): string {
  return `${meleeRootContainerId(ref)}:knowledge`;
}

export function meleeRunKnowledgeContainerId(ref: MeleeRunRef): string {
  return `${meleeRunContainerId(ref)}:knowledge`;
}

export function meleeRunKnowledgeJobContainerId(ref: MeleeRunRef & { jobKey: string }): string {
  return `${meleeRunKnowledgeContainerId(ref)}:${cleanSegment(ref.jobKey)}`;
}

export function meleeKnowledgeJobContainerId(ref: MeleeKnowledgeJobRef): string {
  return `${meleeKnowledgeContainerId(ref)}:${cleanSegment(ref.jobKey)}`;
}

export function meleeBaselineContainerId(ref: MeleeCycleRef): string {
  return `${meleePrepareContainerId(ref)}:baseline`;
}

export function meleeRunContainerId(ref: MeleeRunRef): string {
  return `${meleeRootContainerId(ref)}:run:${cleanSegment(ref.runId)}`;
}

export function meleeEpochContainerId(ref: MeleeEpochRef): string {
  return `${meleeRunContainerId(ref)}:epoch:${cleanSegment(ref.epochId)}`;
}

export function meleeWorkerContainerId(ref: MeleeClaimRef): string {
  return `${meleeEpochContainerId(ref)}:worker:${cleanSegment(ref.claimId)}`;
}

export function meleeWorkerIntegrationContainerId(ref: MeleeClaimRef): string {
  return `${meleeEpochContainerId(ref)}:integration:${cleanSegment(ref.claimId)}`;
}

export function meleePostmortemContainerId(ref: MeleeClaimRef): string {
  return `${meleeEpochContainerId(ref)}:postmortem:${cleanSegment(ref.claimId)}`;
}

export function meleePrContainerId(ref: MeleePrRef): string {
  return `${meleeRootContainerId(ref)}:pr:${cleanSegment(ref.prId ?? "session")}`;
}

export function meleePrHandoffContainerId(ref: MeleePrRef): string {
  return `${meleePrContainerId(ref)}:handoff`;
}

export function meleePrQaContainerId(ref: MeleePrRef): string {
  return `${meleePrContainerId(ref)}:qa`;
}

export function meleePrSplitContainerId(ref: MeleePrRef): string {
  return `${meleePrContainerId(ref)}:split`;
}

export function meleePrReviewContainerId(ref: MeleeReviewRef): string {
  return `${meleePrContainerId(ref)}:review:${cleanSegment(ref.reviewId)}`;
}

export function meleePrRepairContainerId(ref: MeleeRepairRef): string {
  return `${meleePrContainerId(ref)}:repair:${cleanSegment(ref.repairId)}`;
}

export function meleePrPublicationContainerId(ref: MeleePrRef): string {
  return `${meleePrContainerId(ref)}:publication`;
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
function meleeRunId(ref: MeleeCycleRef, metadata: Record<string, unknown>): string {
  return metaId(metadata, "runId") ?? ref.sessionId;
}

function meleeSyncWorkflowId(metadata: Record<string, unknown>): string | undefined {
  const runId = metaId(metadata, "runId");
  return runId && /^sync-/.test(runId) ? runId : undefined;
}

function meleeSyncWorkflowLabel(syncId: string): string {
  const uuidPart = syncId.replace(/^sync-/, "");
  return `Sync ${uuidPart.slice(0, 8) || syncId.slice(0, 8)}`;
}

function meleeEpochId(metadata: Record<string, unknown>): string {
  return metaId(metadata, "epochId") ?? "active";
}

function meleeClaimId(metadata: Record<string, unknown>): string {
  return metaId(metadata, "claimId") ?? metaId(metadata, "itemId") ?? "none";
}

/**
 * PR id for kinds spawn-context also writes: `prId ?? runId ?? sessionId`.
 * The `pr` / `pr-publication` / `pr-handoff` / `pr-qa` kinds keep the older
 * `prId ?? "session"` fallback so their existing ids stay stable.
 */
function meleeSpawnPrId(ref: MeleeCycleRef, metadata: Record<string, unknown>): string {
  return metaId(metadata, "prId") ?? meleeRunId(ref, metadata);
}

function meleeWorkflowPrId(metadata: Record<string, unknown>): string {
  return metaId(metadata, "prId") ?? "session";
}

/**
 * Knowledge jobs are keyed by whatever the caller can name them by: a queued
 * job id when the background processor runs one, otherwise the batch or worker
 * state the operator CLI is chewing through. Two jobs must never collapse onto
 * one container, so an unnamed job degrades to "job" and nothing finer.
 */
function meleeKnowledgeJobKey(metadata: Record<string, unknown>): string {
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

export function describeMeleeContainer(
  kind: MeleeContainerKind,
  ref: MeleeCycleRef,
  metadata: Record<string, unknown> = {},
): MeleeContainerDescriptor {
  const appSessionId = meleeAppSessionId(ref);
  const rootId = meleeRootContainerId(ref);
  const syncId = meleeSyncWorkflowId(metadata);

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
        id: meleePrepareContainerId(ref),
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
          ? meleeSyncWorkflowContainerId(ref, syncId)
          : meleeSyncContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: rootId,
        label: syncId ? meleeSyncWorkflowLabel(syncId) : "Sync",
        phase: "sync",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId },
      };
    case "sync-intake":
      return {
        id: meleeSyncIntakeContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: meleePrepareContainerId(ref),
        label: "Sync Intake",
        phase: "setup",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId },
      };
    case "intake":
      return {
        id: syncId
          ? meleeSyncWorkflowIntakeContainerId(ref, syncId)
          : meleeIntakeContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: syncId
          ? meleeSyncWorkflowContainerId(ref, syncId)
          : meleePrepareContainerId(ref),
        label: "Intake",
        phase: "intake",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId },
      };
    case "intake-item": {
      const prId = typeof metadata.prId === "string" && metadata.prId ? metadata.prId : "item";
      const intakeRef = { ...ref, prId };
      return {
        id: syncId
          ? meleeSyncWorkflowIntakeItemContainerId(ref, syncId, prId)
          : meleeIntakeItemContainerId(intakeRef),
        kind,
        appSessionId,
        parentContainerId: syncId
          ? meleeSyncWorkflowIntakeContainerId(ref, syncId)
          : meleeIntakeContainerId(ref),
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
          ? meleeSyncWorkflowIntakePostmortemContainerId(ref, syncId, prId)
          : meleeIntakePostmortemContainerId(intakeRef),
        kind,
        appSessionId,
        parentContainerId: syncId
          ? meleeSyncWorkflowIntakeItemContainerId(ref, syncId, prId)
          : meleeIntakeItemContainerId(intakeRef),
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
          ? meleeSyncWorkflowIntakeKnowledgeContainerId(ref, syncId, prId)
          : meleeIntakeKnowledgeContainerId(intakeRef),
        kind,
        appSessionId,
        parentContainerId: syncId
          ? meleeSyncWorkflowIntakeItemContainerId(ref, syncId, prId)
          : meleeIntakeItemContainerId(intakeRef),
        label: prId.startsWith("#") ? `${prId} knowledge intake` : `PR #${prId} knowledge intake`,
        phase: "knowledge-intake",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, prId },
      };
    }
    case "knowledge":
      const knowledgeRunId = meleeRunId(ref, metadata);
      const runScopedKnowledge = Boolean(metaId(metadata, "runId") && !syncId);
      return {
        id: syncId
          ? meleeSyncWorkflowKnowledgeContainerId(ref, syncId)
          : runScopedKnowledge
            ? meleeRunKnowledgeContainerId({ ...ref, runId: knowledgeRunId })
            : meleeKnowledgeContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: syncId
          ? meleeSyncWorkflowContainerId(ref, syncId)
          : runScopedKnowledge
            ? meleeRunContainerId({ ...ref, runId: knowledgeRunId })
            : rootId,
        label: "Knowledge",
        phase: "knowledge",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId },
      };
    case "knowledge-job": {
      const jobKey = meleeKnowledgeJobKey(metadata);
      const jobKind = metaId(metadata, "jobKind");
      const knowledgeRunId = meleeRunId(ref, metadata);
      const runScopedKnowledge = Boolean(metaId(metadata, "runId") && !syncId);
      const targetKey = metaId(metadata, "targetKey");
      return {
        id: syncId
          ? meleeSyncWorkflowKnowledgeJobContainerId(ref, syncId, jobKey)
          : runScopedKnowledge
            ? meleeRunKnowledgeJobContainerId({ ...ref, runId: knowledgeRunId, jobKey })
            : meleeKnowledgeJobContainerId({ ...ref, jobKey }),
        kind,
        appSessionId,
        parentContainerId: syncId
          ? meleeSyncWorkflowKnowledgeContainerId(ref, syncId)
          : runScopedKnowledge
            ? meleeRunKnowledgeContainerId({ ...ref, runId: knowledgeRunId })
            : meleeKnowledgeContainerId(ref),
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
        id: meleeBaselineContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: meleePrepareContainerId(ref),
        label: "Baseline and rebuild",
        phase: "baseline",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId },
      };
    case "pr": {
      const prId = meleeWorkflowPrId(metadata);
      const prRef = { ...ref, prId };
      return {
        id: meleePrContainerId(prRef),
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
        id: meleePrPublicationContainerId(prRef),
        kind,
        appSessionId,
        parentContainerId: meleePrContainerId(prRef),
        label: "PR publication",
        phase: "publication",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, prId },
      };
    }
    case "run": {
      const runId = meleeRunId(ref, metadata);
      return {
        id: meleeRunContainerId({ ...ref, runId }),
        kind,
        appSessionId,
        parentContainerId: rootId,
        label: `Run ${runId}`,
        phase: "run",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, runId },
      };
    }
    case "epoch": {
      const runId = meleeRunId(ref, metadata);
      const epochId = meleeEpochId(metadata);
      return {
        id: meleeEpochContainerId({ ...ref, runId, epochId }),
        kind,
        appSessionId,
        parentContainerId: meleeRunContainerId({ ...ref, runId }),
        label: `Epoch ${epochId}`,
        phase: "epoch",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, runId, epochId },
      };
    }
    case "worker": {
      const runId = meleeRunId(ref, metadata);
      const epochId = meleeEpochId(metadata);
      const claimId = meleeClaimId(metadata);
      return {
        id: meleeWorkerContainerId({ ...ref, runId, epochId, claimId }),
        kind,
        appSessionId,
        parentContainerId: meleeEpochContainerId({ ...ref, runId, epochId }),
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
      const runId = meleeRunId(ref, metadata);
      const epochId = meleeEpochId(metadata);
      const claimId = meleeClaimId(metadata);
      return {
        id: meleeWorkerIntegrationContainerId({ ...ref, runId, epochId, claimId }),
        kind,
        appSessionId,
        parentContainerId: meleeEpochContainerId({ ...ref, runId, epochId }),
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
      const runId = meleeRunId(ref, metadata);
      const epochId = meleeEpochId(metadata);
      const claimId = meleeClaimId(metadata);
      return {
        id: meleePostmortemContainerId({ ...ref, runId, epochId, claimId }),
        kind,
        appSessionId,
        parentContainerId: meleeEpochContainerId({ ...ref, runId, epochId }),
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
      const prId = meleeWorkflowPrId(metadata);
      const prRef = { ...ref, prId };
      return {
        id: meleePrHandoffContainerId(prRef),
        kind,
        appSessionId,
        parentContainerId: meleePrContainerId(prRef),
        label: "PR handoff",
        phase: "handoff",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, prId },
      };
    }
    case "pr-qa": {
      const prId = meleeWorkflowPrId(metadata);
      const prRef = { ...ref, prId };
      return {
        id: meleePrQaContainerId(prRef),
        kind,
        appSessionId,
        parentContainerId: meleePrContainerId(prRef),
        label: "PR QA",
        phase: "qa",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, prId },
      };
    }
    case "pr-split": {
      const prId = meleeSpawnPrId(ref, metadata);
      const prRef = { ...ref, prId };
      return {
        id: meleePrSplitContainerId(prRef),
        kind,
        appSessionId,
        parentContainerId: meleePrContainerId(prRef),
        label: `PR split ${prId}`,
        phase: "pr-split",
        metadata: { ...metadata, gameId: ref.gameId, sessionId: ref.sessionId, prId },
      };
    }
    case "pr-review": {
      const prId = meleeSpawnPrId(ref, metadata);
      const prRef = { ...ref, prId };
      const reviewId = metaId(metadata, "reviewId") ?? "review";
      return {
        id: meleePrReviewContainerId({ ...prRef, reviewId }),
        kind,
        appSessionId,
        parentContainerId: meleePrContainerId(prRef),
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
      const prId = meleeSpawnPrId(ref, metadata);
      const prRef = { ...ref, prId };
      const repairId = metaId(metadata, "repairId") ?? "repair";
      return {
        id: meleePrRepairContainerId({ ...prRef, repairId }),
        kind,
        appSessionId,
        parentContainerId: meleePrContainerId(prRef),
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

export function buildMeleeContainer(input: BuildMeleeContainerInput): NewContainer {
  const descriptor = describeMeleeContainer(input.kind, input.ref, input.metadata ?? {});
  const createdAt = input.startedAt ?? new Date().toISOString();
  return {
    id: descriptor.id,
    kernelId: MELEE_KERNEL_ID,
    kind: descriptor.kind,
    // Live kernels normally derive UUID ids from kind + appKey. Melee keeps
    // its established hierarchical ids until the follow-up identity migration.
    appKey: [descriptor.id],
    parentContainerId: input.parentContainerId ?? descriptor.parentContainerId,
    label: input.label ?? descriptor.label,
    status: input.status ?? "running",
    workingDir: input.workingDir ?? null,
    phase: input.phase ?? descriptor.phase,
    phaseVocabulary: MELEE_PHASE_VOCABULARY,
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
