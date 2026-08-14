import { createHash } from "node:crypto";

import type { NewContainer } from "@agent-kernel/db";

const MELEE_APP_SESSION_NAMESPACE = "0dbd5814-75c3-4dc8-9b3b-0f6277cc2b08";
const MELEE_WORKFLOW_TRACE_EVENT_NAMESPACE = "ced83bd4-c12c-5a72-9ae8-507d0da283cf";

export type MeleeContainerKind =
  | "session"
  | "prepare"
  | "sync-intake"
  | "intake"
  | "intake-item"
  | "intake-postmortem"
  | "intake-knowledge"
  | "pr-index"
  | "knowledge-refresh"
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

export interface MeleeProjectSessionRef {
  projectId: string;
  sessionId: string;
}

export interface MeleeWorkflowTraceEventRef extends MeleeProjectSessionRef {
  containerId: string;
  eventType: string;
  operation: string;
  projectEventId: string;
  status: string;
}

export interface MeleeRunRef extends MeleeProjectSessionRef {
  runId: string;
}

export interface MeleeEpochRef extends MeleeRunRef {
  epochId: string | number;
}

export interface MeleeClaimRef extends MeleeEpochRef {
  claimId: string;
  targetId?: string;
}

export interface MeleePrRef extends MeleeProjectSessionRef {
  prId?: string;
}

export interface MeleeIntakePrRef extends MeleeProjectSessionRef {
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
  ref: MeleeProjectSessionRef;
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

export function meleeAppSessionId(ref: MeleeProjectSessionRef): string {
  return stableUuid(
    MELEE_APP_SESSION_NAMESPACE,
    `project:${ref.projectId}\nsession:${ref.sessionId}`,
  );
}

/**
 * Stable kernel event identity for one project-event trace submission.
 * Kernel inserts are conflict-safe by event id, so retrying after a local
 * cursor failure replays the same event instead of appending a duplicate.
 */
export function meleeWorkflowTraceEventId(ref: MeleeWorkflowTraceEventRef): string {
  return stableUuid(
    MELEE_WORKFLOW_TRACE_EVENT_NAMESPACE,
    [
      `project:${ref.projectId}`,
      `session:${ref.sessionId}`,
      `project-event:${ref.projectEventId}`,
      `container:${ref.containerId}`,
      `type:${ref.eventType}`,
      `operation:${ref.operation}`,
      `status:${ref.status}`,
    ].join("\n"),
  );
}

export function meleeRootContainerId(ref: MeleeProjectSessionRef): string {
  return `melee:${meleeAppSessionId(ref)}:session`;
}

export function meleePrepareContainerId(ref: MeleeProjectSessionRef): string {
  return `${meleeRootContainerId(ref)}:prepare`;
}

export function meleeSyncIntakeContainerId(ref: MeleeProjectSessionRef): string {
  return `${meleePrepareContainerId(ref)}:sync-intake`;
}

export function meleeIntakeContainerId(ref: MeleeProjectSessionRef): string {
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

export function meleePrIndexContainerId(ref: MeleeProjectSessionRef): string {
  return `${meleePrepareContainerId(ref)}:pr-index`;
}

export function meleeKnowledgeRefreshContainerId(ref: MeleeProjectSessionRef): string {
  return `${meleePrepareContainerId(ref)}:knowledge-refresh`;
}

export function meleeBaselineContainerId(ref: MeleeProjectSessionRef): string {
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

export function describeMeleeContainer(
  kind: MeleeContainerKind,
  ref: MeleeProjectSessionRef,
  metadata: Record<string, unknown> = {},
): MeleeContainerDescriptor {
  const appSessionId = meleeAppSessionId(ref);
  const rootId = meleeRootContainerId(ref);

  switch (kind) {
    case "session":
      return {
        id: rootId,
        kind,
        appSessionId,
        parentContainerId: null,
        label: `Project session ${ref.sessionId}`,
        phase: "session",
        metadata: { ...metadata, projectId: ref.projectId, sessionId: ref.sessionId },
      };
    case "prepare":
      return {
        id: meleePrepareContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: rootId,
        label: "Prepare",
        phase: "prepare",
        metadata: { ...metadata, projectId: ref.projectId, sessionId: ref.sessionId },
      };
    case "sync-intake":
      return {
        id: meleeSyncIntakeContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: meleePrepareContainerId(ref),
        label: "Sync Intake",
        phase: "setup",
        metadata: { ...metadata, projectId: ref.projectId, sessionId: ref.sessionId },
      };
    case "intake":
      return {
        id: meleeIntakeContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: meleePrepareContainerId(ref),
        label: "Intake",
        phase: "intake",
        metadata: { ...metadata, projectId: ref.projectId, sessionId: ref.sessionId },
      };
    case "intake-item": {
      const prId = typeof metadata.prId === "string" && metadata.prId ? metadata.prId : "item";
      const intakeRef = { ...ref, prId };
      return {
        id: meleeIntakeItemContainerId(intakeRef),
        kind,
        appSessionId,
        parentContainerId: meleeIntakeContainerId(ref),
        label: prId.startsWith("#") ? `${prId} intake` : `PR #${prId} intake`,
        phase: "intake-item",
        metadata: { ...metadata, projectId: ref.projectId, sessionId: ref.sessionId, prId },
      };
    }
    case "intake-postmortem": {
      const prId = typeof metadata.prId === "string" && metadata.prId ? metadata.prId : "item";
      const intakeRef = { ...ref, prId };
      return {
        id: meleeIntakePostmortemContainerId(intakeRef),
        kind,
        appSessionId,
        parentContainerId: meleeIntakeItemContainerId(intakeRef),
        label: prId.startsWith("#") ? `${prId} postmortem` : `PR #${prId} postmortem`,
        phase: "postmortem",
        metadata: { ...metadata, projectId: ref.projectId, sessionId: ref.sessionId, prId },
      };
    }
    case "intake-knowledge": {
      const prId = typeof metadata.prId === "string" && metadata.prId ? metadata.prId : "item";
      const intakeRef = { ...ref, prId };
      return {
        id: meleeIntakeKnowledgeContainerId(intakeRef),
        kind,
        appSessionId,
        parentContainerId: meleeIntakeItemContainerId(intakeRef),
        label: prId.startsWith("#") ? `${prId} knowledge intake` : `PR #${prId} knowledge intake`,
        phase: "knowledge-intake",
        metadata: { ...metadata, projectId: ref.projectId, sessionId: ref.sessionId, prId },
      };
    }
    case "pr-index":
      return {
        id: meleePrIndexContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: meleePrepareContainerId(ref),
        label: "PR index",
        phase: "pr-index",
        metadata: { ...metadata, projectId: ref.projectId, sessionId: ref.sessionId },
      };
    case "knowledge-refresh":
      return {
        id: meleeKnowledgeRefreshContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: meleePrepareContainerId(ref),
        label: "Knowledge refresh",
        phase: "knowledge-refresh",
        metadata: { ...metadata, projectId: ref.projectId, sessionId: ref.sessionId },
      };
    case "baseline":
      return {
        id: meleeBaselineContainerId(ref),
        kind,
        appSessionId,
        parentContainerId: meleePrepareContainerId(ref),
        label: "Baseline and rebuild",
        phase: "baseline",
        metadata: { ...metadata, projectId: ref.projectId, sessionId: ref.sessionId },
      };
    case "pr": {
      const prId = typeof metadata.prId === "string" && metadata.prId ? metadata.prId : "session";
      const prRef = { ...ref, prId };
      return {
        id: meleePrContainerId(prRef),
        kind,
        appSessionId,
        parentContainerId: rootId,
        label: "PR mode",
        phase: "pr",
        metadata: { ...metadata, projectId: ref.projectId, sessionId: ref.sessionId, prId },
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
        metadata: { ...metadata, projectId: ref.projectId, sessionId: ref.sessionId, prId },
      };
    }
    default:
      return {
        id: `${rootId}:${kind}:${cleanSegment(metadata.id as string | undefined)}`,
        kind,
        appSessionId,
        parentContainerId: rootId,
        label: kind,
        phase: kind,
        metadata: { ...metadata, projectId: ref.projectId, sessionId: ref.sessionId },
      };
  }
}

export function buildMeleeContainer(input: BuildMeleeContainerInput): NewContainer {
  const descriptor = describeMeleeContainer(input.kind, input.ref, input.metadata);
  return {
    id: descriptor.id,
    parentContainerId: input.parentContainerId ?? descriptor.parentContainerId,
    label: input.label ?? descriptor.label,
    status: input.status ?? "running",
    workingDir: input.workingDir ?? null,
    worktreePath: input.worktreePath ?? null,
    phase: input.phase ?? descriptor.phase,
    phaseVocabulary: [
      "prepare",
      "intake",
      "intake-item",
      "setup",
      "pr-index",
      "knowledge-refresh",
      "knowledge-intake",
      "baseline",
      "run",
      "epoch",
      "worker",
      "postmortem",
      "pr",
      "review",
      "repair",
      "publication",
    ],
    metadata: {
      ...descriptor.metadata,
      appSessionId: descriptor.appSessionId,
      containerId: descriptor.id,
      containerKind: descriptor.kind,
    },
    startedAt: input.startedAt ?? new Date().toISOString(),
  };
}
