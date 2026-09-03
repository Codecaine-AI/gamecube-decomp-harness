import { describe, expect, test } from "bun:test";

import {
  describeAppContainer,
  appIntakeContainerId,
  appKnowledgeContainerId,
  appKnowledgeJobContainerId,
  appPrepareContainerId,
  appRootContainerId,
  appRunContainerId,
  appRunKnowledgeContainerId,
  appRunKnowledgeJobContainerId,
  appSyncWorkflowContainerId,
  appSyncWorkflowIntakeContainerId,
  appSyncWorkflowIntakeItemContainerId,
  appSyncWorkflowIntakeKnowledgeContainerId,
  appSyncWorkflowIntakePostmortemContainerId,
  appSyncWorkflowKnowledgeContainerId,
  appSyncWorkflowKnowledgeJobContainerId,
} from "./session-mapping.js";
import { createAppKernelSpawnContext } from "./spawn-context.js";

const ref = { gameId: "melee", sessionId: "cycle-1" };

describe("per-sync Melee container mapping", () => {
  test("nests ordinary run curation beneath the run and passes source metadata through", () => {
    const runId = "run-12345678-aaaa-bbbb-cccc-dddddddddddd";
    const context = createAppKernelSpawnContext({
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
      appRootContainerId(ref),
      appRunContainerId({ ...ref, runId }),
      appRunKnowledgeContainerId({ ...ref, runId }),
      appRunKnowledgeJobContainerId({ ...ref, runId, jobKey: "batch-1" }),
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
    const context = createAppKernelSpawnContext({ kind: "knowledge-curation", ...ref, runId, jobId: "batch-1" });
    expect(context.containerLineage?.map((container) => container.id)).toEqual([
      appRootContainerId(ref),
      appSyncWorkflowContainerId(ref, runId),
      appSyncWorkflowKnowledgeContainerId(ref, runId),
      appSyncWorkflowKnowledgeJobContainerId(ref, runId, "batch-1"),
    ]);
  });

  test("keeps curation without a run in the cycle-global lane", () => {
    const context = createAppKernelSpawnContext({ kind: "knowledge-curation", ...ref, jobId: "batch-1" });
    expect(context.containerLineage?.map((container) => container.id)).toEqual([
      appRootContainerId(ref),
      appKnowledgeContainerId(ref),
      appKnowledgeJobContainerId({ ...ref, jobKey: "batch-1" }),
    ]);
  });

  test("builds disjoint, self-contained trees for different sync ids", () => {
    const firstSyncId = "sync-12345678-aaaa-bbbb-cccc-dddddddddddd";
    const secondSyncId = "sync-87654321-aaaa-bbbb-cccc-dddddddddddd";
    const firstRoot = appSyncWorkflowContainerId(ref, firstSyncId);
    const secondRoot = appSyncWorkflowContainerId(ref, secondSyncId);

    expect(firstRoot).not.toBe(secondRoot);
    expect(appSyncWorkflowIntakeContainerId(ref, firstSyncId)).toStartWith(`${firstRoot}:`);
    expect(appSyncWorkflowIntakeItemContainerId(ref, firstSyncId, 2764)).toStartWith(
      `${firstRoot}:intake:`,
    );
    expect(appSyncWorkflowIntakePostmortemContainerId(ref, firstSyncId, 2764)).toStartWith(
      `${firstRoot}:intake:`,
    );
    expect(appSyncWorkflowIntakeKnowledgeContainerId(ref, firstSyncId, 2764)).toStartWith(
      `${firstRoot}:intake:`,
    );
    expect(appSyncWorkflowKnowledgeContainerId(ref, firstSyncId)).toBe(
      `${firstRoot}:knowledge`,
    );
    expect(appSyncWorkflowKnowledgeJobContainerId(ref, firstSyncId, "discord-1")).toStartWith(
      `${firstRoot}:knowledge:`,
    );

    const first = describeAppContainer("sync", ref, { runId: firstSyncId });
    const second = describeAppContainer("sync", ref, { runId: secondSyncId });
    expect(first).toMatchObject({
      id: firstRoot,
      parentContainerId: appRootContainerId(ref),
      label: "Sync 12345678",
    });
    expect(second.id).toBe(secondRoot);
  });

  test("nests a sync-run intake postmortem under that sync's PR item", () => {
    const syncId = "sync-X";
    const context = createAppKernelSpawnContext({
      kind: "intake-postmortem",
      gameId: ref.gameId,
      sessionId: ref.sessionId,
      runId: syncId,
      prId: "2764",
    });

    expect(context.containerLineage?.map((container) => container.id)).toEqual([
      appRootContainerId(ref),
      appSyncWorkflowContainerId(ref, syncId),
      appSyncWorkflowIntakeContainerId(ref, syncId),
      appSyncWorkflowIntakeItemContainerId(ref, syncId, "2764"),
      appSyncWorkflowIntakePostmortemContainerId(ref, syncId, "2764"),
    ]);
  });

  test("keeps sync-less prepare and knowledge identities stable", () => {
    expect(describeAppContainer("intake", ref).id).toBe(appIntakeContainerId(ref));
    expect(describeAppContainer("intake", ref).parentContainerId).toBe(
      appPrepareContainerId(ref),
    );
    expect(describeAppContainer("knowledge", ref)).toMatchObject({
      id: appKnowledgeContainerId(ref),
      parentContainerId: appRootContainerId(ref),
    });

    const sessionNamedLikeSync = createAppKernelSpawnContext({
      kind: "knowledge-curation",
      gameId: ref.gameId,
      sessionId: "sync-looking-session",
      jobId: "operator-job",
    });
    expect(sessionNamedLikeSync.containerLineage?.map((container) => container.id)).not.toContain(
      appSyncWorkflowContainerId(
        { gameId: ref.gameId, sessionId: "sync-looking-session" },
        "sync-looking-session",
      ),
    );
  });
});
