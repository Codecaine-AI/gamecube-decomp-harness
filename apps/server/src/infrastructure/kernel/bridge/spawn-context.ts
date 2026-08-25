import type { NewContainer } from "@agent-kernel/db";

import { MELEE_KERNEL_ID } from "./config.js";

import type { MeleeKernelSpawnContext } from "./kernel.js";
import {
  describeMeleeContainer,
  MELEE_PHASE_VOCABULARY,
  meleeAppSessionId,
  type MeleeContainerKind,
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

/**
 * Container identity has exactly one authority: `describeMeleeContainer`. This
 * wraps a described container in the spawn-context row envelope (session slug,
 * topic, spawn metadata) without letting spawn-context invent its own id,
 * parent, label, or phase — that divergence is what orphaned containers.
 */
function describedRecord(input: {
  kind: MeleeContainerKind;
  ref: MeleeCycleRef;
  appSessionId: string;
  workingDir?: string;
  metadata?: Record<string, unknown>;
}): NewContainer {
  const descriptor = describeMeleeContainer(input.kind, input.ref, input.metadata ?? {});
  return containerRecord({
    id: descriptor.id,
    parentContainerId: descriptor.parentContainerId,
    label: descriptor.label,
    phase: descriptor.phase,
    ref: input.ref,
    appSessionId: input.appSessionId,
    kind: descriptor.kind,
    workingDir: input.workingDir,
    metadata: input.metadata,
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
  const root = describedRecord({ kind: "session", ref, appSessionId, workingDir });
  const run = describedRecord({
    kind: "run",
    ref,
    appSessionId,
    workingDir,
    metadata: { runId },
  });
  const pr = describedRecord({
    kind: "pr",
    ref,
    appSessionId,
    workingDir,
    metadata: { runId, prId },
  });
  const prepare = describedRecord({ kind: "prepare", ref, appSessionId, workingDir });
  const intake = describedRecord({ kind: "intake", ref, appSessionId, workingDir });
  const intakeItemPrId = nonEmpty(input.prId) ?? nonEmpty(input.targetId) ?? itemId;
  const intakeItemMetadata = {
    runId,
    prId: intakeItemPrId,
    itemId,
    ...(nonEmpty(input.targetId) ? { targetId: nonEmpty(input.targetId) } : {}),
  };
  const intakeItem = describedRecord({
    kind: "intake-item",
    ref,
    appSessionId,
    workingDir,
    metadata: intakeItemMetadata,
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
      const epoch = describedRecord({
        kind: "epoch",
        ref,
        appSessionId,
        workingDir,
        metadata: { runId, epochId },
      });
      const worker = describedRecord({
        kind: "worker",
        ref,
        appSessionId,
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
      const epoch = describedRecord({
        kind: "epoch",
        ref,
        appSessionId,
        workingDir,
        metadata: { runId, epochId },
      });
      const integration = describedRecord({
        kind: "worker-integration",
        ref,
        appSessionId,
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
      const epoch = describedRecord({
        kind: "epoch",
        ref,
        appSessionId,
        workingDir,
        metadata: { runId, epochId },
      });
      const postmortem = describedRecord({
        kind: "postmortem",
        ref,
        appSessionId,
        workingDir,
        metadata: {
          runId,
          epochId,
          // Claim-less postmortems keep claimId out of the row metadata so the
          // described label stays the epoch-level "Postmortem <segment>".
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
        describedRecord({
          kind: "intake-postmortem",
          ref,
          appSessionId,
          workingDir,
          metadata: intakeItemMetadata,
        }),
      ];
    case "intake-knowledge":
      return [
        root,
        prepare,
        intake,
        intakeItem,
        describedRecord({
          kind: "intake-knowledge",
          ref,
          appSessionId,
          workingDir,
          metadata: intakeItemMetadata,
        }),
      ];
    case "pr":
      return [root, pr];
    case "pr-split":
      return [
        root,
        pr,
        describedRecord({
          kind: "pr-split",
          ref,
          appSessionId,
          workingDir,
          metadata: { runId, prId },
        }),
      ];
    case "pr-review": {
      const reviewId = nonEmpty(input.reviewId) ?? "review";
      return [
        root,
        pr,
        describedRecord({
          kind: "pr-review",
          ref,
          appSessionId,
          workingDir,
          metadata: { runId, prId, reviewId },
        }),
      ];
    }
    case "pr-repair":
    case "reconcile": {
      const repairId = nonEmpty(input.repairId) ?? (input.kind === "reconcile" ? "reconcile" : "repair");
      const repair = describedRecord({
        kind: "pr-repair",
        ref,
        appSessionId,
        workingDir,
        metadata: { runId, prId, repairId },
      });
      // "reconcile" is a spawn-context-only alias for a repair container: same
      // described identity, different label/phase/kind on the row.
      if (input.kind === "pr-repair") return [root, pr, repair];
      return [
        root,
        pr,
        {
          ...repair,
          kind: "reconcile",
          label: `Reconcile ${repairId}`,
          phase: "reconcile",
          metadata: { ...(repair.metadata as Record<string, unknown>), containerKind: "reconcile" },
        },
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

  // The spawned container is the tail of its own lineage. Deriving it (instead
  // of recomputing an id beside the lineage) is what keeps the two in sync.
  const lineage = containerLineage(input, ref, appSessionId);
  const container = lineage.at(-1);
  if (!container) throw new Error(`Unable to build Melee spawn lineage for kind ${input.kind}`);

  return {
    appSessionId,
    containerId: container.id,
    containerLineage: lineage,
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
