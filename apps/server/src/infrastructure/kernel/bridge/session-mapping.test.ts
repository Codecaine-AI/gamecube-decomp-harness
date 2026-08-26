import { describe, expect, test } from "bun:test";

import {
  describeMeleeContainer,
  meleeIntakeContainerId,
  meleeKnowledgeContainerId,
  meleeKnowledgeJobContainerId,
  meleePrepareContainerId,
  meleeRootContainerId,
  meleeRunContainerId,
  meleeRunKnowledgeContainerId,
  meleeRunKnowledgeJobContainerId,
  meleeSyncWorkflowContainerId,
  meleeSyncWorkflowIntakeContainerId,
  meleeSyncWorkflowIntakeItemContainerId,
  meleeSyncWorkflowIntakeKnowledgeContainerId,
  meleeSyncWorkflowIntakePostmortemContainerId,
  meleeSyncWorkflowKnowledgeContainerId,
  meleeSyncWorkflowKnowledgeJobContainerId,
} from "./session-mapping.js";
import { createMeleeKernelSpawnContext } from "./spawn-context.js";

const ref = { gameId: "melee", sessionId: "cycle-1" };

describe("per-sync Melee container mapping", () => {
  test("nests ordinary run curation beneath the run and passes source metadata through", () => {
    const runId = "run-12345678-aaaa-bbbb-cccc-dddddddddddd";
    const context = createMeleeKernelSpawnContext({
      kind: "knowledge-curation",
      ...ref,
      runId,
      jobId: "batch-1",
      metadata: {
        targetKey: "main/melee/ft/chara/ftCo",
        workerStateIds: ["worker-state-1"],
        workerContainerIds: ["worker-container-1"],
      },
    });

    expect(context.containerLineage?.map((container) => container.id)).toEqual([
      meleeRootContainerId(ref),
      meleeRunContainerId({ ...ref, runId }),
      meleeRunKnowledgeContainerId({ ...ref, runId }),
      meleeRunKnowledgeJobContainerId({ ...ref, runId, jobKey: "batch-1" }),
    ]);
    expect(context.containerLineage?.at(-1)).toMatchObject({
      label: "Condense main/melee/ft/chara/ftCo",
      metadata: {
        targetKey: "main/melee/ft/chara/ftCo",
        workerStateIds: ["worker-state-1"],
        workerContainerIds: ["worker-container-1"],
      },
    });
  });

  test("keeps sync curation in the per-sync lane", () => {
    const runId = "sync-12345678-aaaa-bbbb-cccc-dddddddddddd";
    const context = createMeleeKernelSpawnContext({ kind: "knowledge-curation", ...ref, runId, jobId: "batch-1" });
    expect(context.containerLineage?.map((container) => container.id)).toEqual([
      meleeRootContainerId(ref),
      meleeSyncWorkflowContainerId(ref, runId),
      meleeSyncWorkflowKnowledgeContainerId(ref, runId),
      meleeSyncWorkflowKnowledgeJobContainerId(ref, runId, "batch-1"),
    ]);
  });

  test("keeps curation without a run in the cycle-global lane", () => {
    const context = createMeleeKernelSpawnContext({ kind: "knowledge-curation", ...ref, jobId: "batch-1" });
    expect(context.containerLineage?.map((container) => container.id)).toEqual([
      meleeRootContainerId(ref),
      meleeKnowledgeContainerId(ref),
      meleeKnowledgeJobContainerId({ ...ref, jobKey: "batch-1" }),
    ]);
  });

  test("builds disjoint, self-contained trees for different sync ids", () => {
    const firstSyncId = "sync-12345678-aaaa-bbbb-cccc-dddddddddddd";
    const secondSyncId = "sync-87654321-aaaa-bbbb-cccc-dddddddddddd";
    const firstRoot = meleeSyncWorkflowContainerId(ref, firstSyncId);
    const secondRoot = meleeSyncWorkflowContainerId(ref, secondSyncId);

    expect(firstRoot).not.toBe(secondRoot);
    expect(meleeSyncWorkflowIntakeContainerId(ref, firstSyncId)).toStartWith(`${firstRoot}:`);
    expect(meleeSyncWorkflowIntakeItemContainerId(ref, firstSyncId, 2764)).toStartWith(
      `${firstRoot}:intake:`,
    );
    expect(meleeSyncWorkflowIntakePostmortemContainerId(ref, firstSyncId, 2764)).toStartWith(
      `${firstRoot}:intake:`,
    );
    expect(meleeSyncWorkflowIntakeKnowledgeContainerId(ref, firstSyncId, 2764)).toStartWith(
      `${firstRoot}:intake:`,
    );
    expect(meleeSyncWorkflowKnowledgeContainerId(ref, firstSyncId)).toBe(
      `${firstRoot}:knowledge`,
    );
    expect(meleeSyncWorkflowKnowledgeJobContainerId(ref, firstSyncId, "discord-1")).toStartWith(
      `${firstRoot}:knowledge:`,
    );

    const first = describeMeleeContainer("sync", ref, { runId: firstSyncId });
    const second = describeMeleeContainer("sync", ref, { runId: secondSyncId });
    expect(first).toMatchObject({
      id: firstRoot,
      parentContainerId: meleeRootContainerId(ref),
      label: "Sync 12345678",
    });
    expect(second.id).toBe(secondRoot);
  });

  test("nests a sync-run intake postmortem under that sync's PR item", () => {
    const syncId = "sync-X";
    const context = createMeleeKernelSpawnContext({
      kind: "intake-postmortem",
      gameId: ref.gameId,
      sessionId: ref.sessionId,
      runId: syncId,
      prId: "2764",
    });

    expect(context.containerLineage?.map((container) => container.id)).toEqual([
      meleeRootContainerId(ref),
      meleeSyncWorkflowContainerId(ref, syncId),
      meleeSyncWorkflowIntakeContainerId(ref, syncId),
      meleeSyncWorkflowIntakeItemContainerId(ref, syncId, "2764"),
      meleeSyncWorkflowIntakePostmortemContainerId(ref, syncId, "2764"),
    ]);
  });

  test("keeps sync-less prepare and knowledge identities stable", () => {
    expect(describeMeleeContainer("intake", ref).id).toBe(meleeIntakeContainerId(ref));
    expect(describeMeleeContainer("intake", ref).parentContainerId).toBe(
      meleePrepareContainerId(ref),
    );
    expect(describeMeleeContainer("knowledge", ref)).toMatchObject({
      id: meleeKnowledgeContainerId(ref),
      parentContainerId: meleeRootContainerId(ref),
    });

    const sessionNamedLikeSync = createMeleeKernelSpawnContext({
      kind: "knowledge-curation",
      gameId: ref.gameId,
      sessionId: "sync-looking-session",
      jobId: "operator-job",
    });
    expect(sessionNamedLikeSync.containerLineage?.map((container) => container.id)).not.toContain(
      meleeSyncWorkflowContainerId(
        { gameId: ref.gameId, sessionId: "sync-looking-session" },
        "sync-looking-session",
      ),
    );
  });
});
