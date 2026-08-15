import type { NewContainer } from "@agent-kernel/db";

import { MELEE_KERNEL_ID } from "./config.js";

import type { MeleeKernelSpawnContext } from "./kernel.js";
import {
  meleeAppSessionId,
  meleeEpochContainerId,
  meleeIntakeContainerId,
  meleeIntakeItemContainerId,
  meleeIntakeKnowledgeContainerId,
  meleeIntakePostmortemContainerId,
  meleePrepareContainerId,
  meleePrContainerId,
  meleePrRepairContainerId,
  meleePrReviewContainerId,
  meleePrSplitContainerId,
  meleePostmortemContainerId,
  meleeRunContainerId,
  meleeWorkerIntegrationContainerId,
  meleeWorkerContainerId,
  type MeleeCycleRef,
} from "./session-mapping.js";

export type MeleeKernelSpawnContainerKind =
  | "run"
  | "worker"
  | "worker-integration"
  | "postmortem"
  | "intake-postmortem"
  | "intake-knowledge"
  | "knowledge-curation"
  | "pr"
  | "pr-split"
  | "pr-review"
  | "pr-repair"
  | "reconcile";

export interface MeleeKernelSpawnContextInput {
  kind: MeleeKernelSpawnContainerKind;
  gameId?: string | null;
  sessionId?: string | null;
  runId?: string | null;
  epochId?: string | number | null;
  claimId?: string | null;
  itemId?: string | null;
  targetId?: string | null;
  prId?: string | null;
  reviewId?: string | null;
  repairId?: string | null;
  phase?: string | null;
  workingDir?: string | null;
  metadata?: Record<string, unknown>;
}

const DEFAULT_GAME_ID = "melee";
const MANUAL_SESSION_ID = "manual";
const MELEE_PHASE_VOCABULARY = [
  "setup",
  "prepare",
  "intake",
  "intake-item",
  "baseline",
  "run",
  "epoch",
  "worker",
  "integration",
  "postmortem",
  "knowledge-intake",
  "knowledge-curation",
  "pr",
  "pr-split",
  "pr-review",
  "repair",
  "reconcile",
  "publication",
];

function nonEmpty(value: string | number | null | undefined): string | undefined {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function baseRef(input: MeleeKernelSpawnContextInput): MeleeCycleRef {
  const gameId = nonEmpty(input.gameId) ?? DEFAULT_GAME_ID;
  const sessionId =
    nonEmpty(input.sessionId) ??
    nonEmpty(input.runId) ??
    nonEmpty(input.prId) ??
    MANUAL_SESSION_ID;
  return { gameId, sessionId };
}

function containerId(input: MeleeKernelSpawnContextInput, ref: MeleeCycleRef): string {
  const runId = nonEmpty(input.runId) ?? ref.sessionId;
  switch (input.kind) {
    case "worker":
      return meleeWorkerContainerId({
        ...ref,
        runId,
        epochId: nonEmpty(input.epochId) ?? "active",
        claimId: nonEmpty(input.claimId) ?? "none",
        targetId: nonEmpty(input.targetId),
      });
    case "worker-integration":
      return meleeWorkerIntegrationContainerId({
        ...ref,
        runId,
        epochId: nonEmpty(input.epochId) ?? "active",
        claimId: nonEmpty(input.claimId) ?? nonEmpty(input.itemId) ?? "none",
        targetId: nonEmpty(input.targetId),
      });
    case "postmortem":
      return meleePostmortemContainerId({
        ...ref,
        runId,
        epochId: nonEmpty(input.epochId) ?? "active",
        claimId: nonEmpty(input.claimId) ?? nonEmpty(input.itemId) ?? "none",
        targetId: nonEmpty(input.targetId),
      });
    case "intake-postmortem":
      return meleeIntakePostmortemContainerId({
        ...ref,
        prId: nonEmpty(input.prId) ?? nonEmpty(input.targetId) ?? nonEmpty(input.itemId) ?? runId,
      });
    case "intake-knowledge":
      return meleeIntakeKnowledgeContainerId({
        ...ref,
        prId: nonEmpty(input.prId) ?? nonEmpty(input.targetId) ?? nonEmpty(input.itemId) ?? runId,
      });
    case "knowledge-curation":
    case "run":
      return meleeRunContainerId({ ...ref, runId });
    case "pr-split":
      return meleePrSplitContainerId({ ...ref, prId: nonEmpty(input.prId) ?? runId });
    case "pr-review":
      return meleePrReviewContainerId({
        ...ref,
        prId: nonEmpty(input.prId) ?? runId,
        reviewId: nonEmpty(input.reviewId) ?? "review",
      });
    case "pr-repair":
      return meleePrRepairContainerId({
        ...ref,
        prId: nonEmpty(input.prId) ?? runId,
        repairId: nonEmpty(input.repairId) ?? "repair",
      });
    case "reconcile":
      return meleePrRepairContainerId({
        ...ref,
        prId: nonEmpty(input.prId) ?? runId,
        repairId: nonEmpty(input.repairId) ?? "reconcile",
      });
    case "pr":
      return meleePrContainerId({ ...ref, prId: nonEmpty(input.prId) ?? runId });
  }
}

function defaultPhase(kind: MeleeKernelSpawnContainerKind): string {
  switch (kind) {
    case "intake-postmortem":
      return "postmortem";
    case "intake-knowledge":
      return "knowledge-intake";
    case "knowledge-curation":
      return "knowledge-curation";
    case "pr-repair":
      return "repair";
    case "reconcile":
      return "reconcile";
    case "worker-integration":
      return "integration";
    default:
      return kind;
  }
}

function containerRecord(input: {
  id: string;
  parentContainerId: string | null;
  label: string;
  phase: string;
  ref: MeleeCycleRef;
  appSessionId: string;
  kind: string;
  workingDir?: string;
  metadata?: Record<string, unknown>;
}): NewContainer {
  const createdAt = new Date().toISOString();
  return {
    id: input.id,
    kernelId: MELEE_KERNEL_ID,
    kind: input.kind,
    // Keep the harness's stable hierarchical id as the app identity key until
    // the live kernel UUID/containerBinding migration is scheduled.
    appKey: [input.id],
    parentContainerId: input.parentContainerId,
    label: input.label,
    status: "running",
    workingDir: input.workingDir ?? null,
    phase: input.phase,
    phaseVocabulary: MELEE_PHASE_VOCABULARY,
    metadata: {
      appSessionId: input.appSessionId,
      appSessionSlug: input.ref.sessionId,
      appSessionType: "melee-cycle",
      containerKind: input.kind,
      gameId: input.ref.gameId,
      sessionId: input.ref.sessionId,
      topic: `Melee ${input.ref.gameId} session ${input.ref.sessionId}`,
      ...(input.metadata ?? {}),
    },
    createdAt,
    startedAt: createdAt,
  };
}

function rootContainer(
  ref: MeleeCycleRef,
  appSessionId: string,
  workingDir?: string,
): NewContainer {
  return containerRecord({
    id: `melee:${appSessionId}:session`,
    parentContainerId: null,
    label: `Game session ${ref.sessionId}`,
    phase: "session",
    ref,
    appSessionId,
    kind: "session",
    workingDir,
  });
}

function containerLineage(
  input: MeleeKernelSpawnContextInput,
  ref: MeleeCycleRef,
  appSessionId: string,
): NewContainer[] {
  const workingDir = nonEmpty(input.workingDir);
  const runId = nonEmpty(input.runId) ?? ref.sessionId;
  const prId = nonEmpty(input.prId) ?? runId;
  const epochId = nonEmpty(input.epochId) ?? "active";
  const claimId = nonEmpty(input.claimId);
  const itemId = nonEmpty(input.itemId) ?? nonEmpty(input.prId) ?? nonEmpty(input.targetId) ?? claimId ?? runId;
  const claimSegment = claimId ?? nonEmpty(input.itemId) ?? "none";
  const root = rootContainer(ref, appSessionId, workingDir);
  const run = containerRecord({
    id: meleeRunContainerId({ ...ref, runId }),
    parentContainerId: root.id,
    label: `Run ${runId}`,
    phase: "run",
    ref,
    appSessionId,
    kind: "run",
    workingDir,
    metadata: { runId },
  });
  const pr = containerRecord({
    id: meleePrContainerId({ ...ref, prId }),
    parentContainerId: root.id,
    label: `PR ${prId}`,
    phase: "pr",
    ref,
    appSessionId,
    kind: "pr",
    workingDir,
    metadata: { runId, prId },
  });
  const prepare = containerRecord({
    id: meleePrepareContainerId(ref),
    parentContainerId: root.id,
    label: "Prepare",
    phase: "prepare",
    ref,
    appSessionId,
    kind: "prepare",
    workingDir,
  });
  const intake = containerRecord({
    id: meleeIntakeContainerId(ref),
    parentContainerId: prepare.id,
    label: "Intake",
    phase: "intake",
    ref,
    appSessionId,
    kind: "intake",
    workingDir,
  });
  const intakeItemPrId = nonEmpty(input.prId) ?? nonEmpty(input.targetId) ?? itemId;
  const intakeItem = containerRecord({
    id: meleeIntakeItemContainerId({ ...ref, prId: intakeItemPrId }),
    parentContainerId: intake.id,
    label: intakeItemPrId.startsWith("#") ? `${intakeItemPrId} intake` : `PR #${intakeItemPrId} intake`,
    phase: "intake-item",
    ref,
    appSessionId,
    kind: "intake-item",
    workingDir,
    metadata: {
      runId,
      prId: intakeItemPrId,
      itemId,
      ...(nonEmpty(input.targetId) ? { targetId: nonEmpty(input.targetId) } : {}),
    },
  });

  switch (input.kind) {
    case "run":
      return [root, run];
    case "knowledge-curation":
      return [
        root,
        {
          ...run,
          label: `Knowledge curation ${runId}`,
          phase: "knowledge-curation",
          metadata: {
            ...run.metadata,
            containerKind: "knowledge-curation",
          },
        },
      ];
    case "worker": {
      const epoch = containerRecord({
        id: meleeEpochContainerId({ ...ref, runId, epochId }),
        parentContainerId: run.id,
        label: `Epoch ${epochId}`,
        phase: "epoch",
        ref,
        appSessionId,
        kind: "epoch",
        workingDir,
        metadata: { runId, epochId },
      });
      const worker = containerRecord({
        id: meleeWorkerContainerId({ ...ref, runId, epochId, claimId: claimSegment }),
        parentContainerId: epoch.id,
        label: `Worker claim ${claimSegment}`,
        phase: "worker",
        ref,
        appSessionId,
        kind: "worker",
        workingDir,
        metadata: {
          runId,
          epochId,
          claimId: claimSegment,
          ...(nonEmpty(input.targetId) ? { targetId: nonEmpty(input.targetId) } : {}),
        },
      });
      return [root, run, epoch, worker];
    }
    case "worker-integration": {
      const epoch = containerRecord({
        id: meleeEpochContainerId({ ...ref, runId, epochId }),
        parentContainerId: run.id,
        label: `Epoch ${epochId}`,
        phase: "epoch",
        ref,
        appSessionId,
        kind: "epoch",
        workingDir,
        metadata: { runId, epochId },
      });
      const integration = containerRecord({
        id: meleeWorkerIntegrationContainerId({ ...ref, runId, epochId, claimId: claimSegment }),
        parentContainerId: epoch.id,
        label: `Worker integration ${claimSegment}`,
        phase: "integration",
        ref,
        appSessionId,
        kind: "worker-integration",
        workingDir,
        metadata: {
          runId,
          epochId,
          claimId: claimSegment,
          itemId,
          ...(nonEmpty(input.targetId) ? { targetId: nonEmpty(input.targetId) } : {}),
        },
      });
      return [root, run, epoch, integration];
    }
    case "postmortem": {
      const epoch = containerRecord({
        id: meleeEpochContainerId({ ...ref, runId, epochId }),
        parentContainerId: run.id,
        label: `Epoch ${epochId}`,
        phase: "epoch",
        ref,
        appSessionId,
        kind: "epoch",
        workingDir,
        metadata: { runId, epochId },
      });
      const postmortem = containerRecord({
        id: meleePostmortemContainerId({ ...ref, runId, epochId, claimId: claimSegment }),
        parentContainerId: epoch.id,
        label: claimId ? `Postmortem claim ${claimSegment}` : `Postmortem ${claimSegment}`,
        phase: "postmortem",
        ref,
        appSessionId,
        kind: "postmortem",
        workingDir,
        metadata: {
          runId,
          epochId,
          ...(claimId ? { claimId } : {}),
          ...(nonEmpty(input.itemId) ? { itemId: nonEmpty(input.itemId) } : {}),
          ...(nonEmpty(input.targetId) ? { targetId: nonEmpty(input.targetId) } : {}),
        },
      });
      return [root, run, epoch, postmortem];
    }
    case "intake-postmortem":
      return [
        root,
        prepare,
        intake,
        intakeItem,
        containerRecord({
          id: meleeIntakePostmortemContainerId({ ...ref, prId: intakeItemPrId }),
          parentContainerId: intakeItem.id,
          label: intakeItemPrId.startsWith("#") ? `${intakeItemPrId} postmortem` : `PR #${intakeItemPrId} postmortem`,
          phase: "postmortem",
          ref,
          appSessionId,
          kind: "intake-postmortem",
          workingDir,
          metadata: {
            runId,
            prId: intakeItemPrId,
            itemId,
            ...(nonEmpty(input.targetId) ? { targetId: nonEmpty(input.targetId) } : {}),
          },
        }),
      ];
    case "intake-knowledge":
      return [
        root,
        prepare,
        intake,
        intakeItem,
        containerRecord({
          id: meleeIntakeKnowledgeContainerId({ ...ref, prId: intakeItemPrId }),
          parentContainerId: intakeItem.id,
          label: intakeItemPrId.startsWith("#") ? `${intakeItemPrId} knowledge intake` : `PR #${intakeItemPrId} knowledge intake`,
          phase: "knowledge-intake",
          ref,
          appSessionId,
          kind: "intake-knowledge",
          workingDir,
          metadata: {
            runId,
            prId: intakeItemPrId,
            itemId,
            ...(nonEmpty(input.targetId) ? { targetId: nonEmpty(input.targetId) } : {}),
          },
        }),
      ];
    case "pr":
      return [root, pr];
    case "pr-split":
      return [
        root,
        pr,
        containerRecord({
          id: meleePrSplitContainerId({ ...ref, prId }),
          parentContainerId: pr.id,
          label: `PR split ${prId}`,
          phase: "pr-split",
          ref,
          appSessionId,
          kind: "pr-split",
          workingDir,
          metadata: { runId, prId },
        }),
      ];
    case "pr-review": {
      const reviewId = nonEmpty(input.reviewId) ?? "review";
      return [
        root,
        pr,
        containerRecord({
          id: meleePrReviewContainerId({ ...ref, prId, reviewId }),
          parentContainerId: pr.id,
          label: `PR review ${reviewId}`,
          phase: "pr-review",
          ref,
          appSessionId,
          kind: "pr-review",
          workingDir,
          metadata: { runId, prId, reviewId },
        }),
      ];
    }
    case "pr-repair":
    case "reconcile": {
      const repairId = nonEmpty(input.repairId) ?? (input.kind === "reconcile" ? "reconcile" : "repair");
      return [
        root,
        pr,
        containerRecord({
          id: meleePrRepairContainerId({ ...ref, prId, repairId }),
          parentContainerId: pr.id,
          label: input.kind === "reconcile" ? `Reconcile ${repairId}` : `PR repair ${repairId}`,
          phase: input.kind === "reconcile" ? "reconcile" : "repair",
          ref,
          appSessionId,
          kind: input.kind,
          workingDir,
          metadata: { runId, prId, repairId },
        }),
      ];
    }
  }
}

export function createMeleeKernelSpawnContext(
  input: MeleeKernelSpawnContextInput,
): MeleeKernelSpawnContext {
  const ref = baseRef(input);
  const appSessionId = meleeAppSessionId(ref);
  const runId = nonEmpty(input.runId);
  const prId = nonEmpty(input.prId);
  const epochId = nonEmpty(input.epochId);
  const claimId = nonEmpty(input.claimId);
  const itemId = nonEmpty(input.itemId);
  const targetId = nonEmpty(input.targetId);

  return {
    appSessionId,
    containerId: containerId(input, ref),
    containerLineage: containerLineage(input, ref, appSessionId),
    phase: nonEmpty(input.phase) ?? defaultPhase(input.kind),
    workingDir: nonEmpty(input.workingDir),
    metadata: {
      containerKind: input.kind,
      gameId: ref.gameId,
      sessionId: ref.sessionId,
      ...(runId ? { runId } : {}),
      ...(epochId ? { epochId } : {}),
      ...(claimId ? { claimId } : {}),
      ...(itemId ? { itemId } : {}),
      ...(targetId ? { targetId } : {}),
      ...(prId ? { prId } : {}),
      ...(nonEmpty(input.reviewId) ? { reviewId: nonEmpty(input.reviewId) } : {}),
      ...(nonEmpty(input.repairId) ? { repairId: nonEmpty(input.repairId) } : {}),
      ...(input.metadata ?? {}),
    },
  };
}
