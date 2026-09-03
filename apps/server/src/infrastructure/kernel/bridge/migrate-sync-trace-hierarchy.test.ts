import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  ensureKernelObservabilitySchema,
  openAppKernelDatabase,
  upsertAppContainer,
} from "./database.js";
import { MELEE_KERNEL_ID } from "./config.js";

import {
  appIntakeItemContainerId,
  appKnowledgeJobContainerId,
  appPostmortemContainerId,
  appRootContainerId,
  appSyncWorkflowContainerId,
  appSyncWorkflowIntakeItemContainerId,
  appSyncWorkflowIntakePostmortemContainerId,
  appSyncWorkflowKnowledgeJobContainerId,
  type AppCycleRef,
} from "./session-mapping.js";
import {
  runSyncTraceHierarchyMigration,
  type SyncTraceContainerRewrite,
  type SyncTraceMigrationContainerRow,
  type SyncTraceMigrationDatabasePort,
  type SyncTraceScopedEventMove,
} from "./migrate-sync-trace-hierarchy.js";

const ref: AppCycleRef = { gameId: "melee", sessionId: "cycle-2026-08-25" };
const syncId = "sync-12345678-1234-4234-8234-123456789abc";
const now = "2026-08-25T12:00:00.000Z";

function row(input: Partial<SyncTraceMigrationContainerRow> & { id: string }): SyncTraceMigrationContainerRow {
  return {
    id: input.id,
    kernelId: "melee-decomp",
    kind: input.kind ?? "postmortem",
    appKey: [input.id],
    label: input.label ?? "fixture",
    status: input.status ?? "completed",
    parentContainerId: input.parentContainerId ?? null,
    phase: input.phase ?? "postmortem",
    phaseVocabulary: input.phaseVocabulary ?? [],
    workingDir: input.workingDir ?? "/repo",
    metadata: input.metadata ?? { gameId: ref.gameId, sessionId: ref.sessionId, runId: syncId },
    usageInputTokens: input.usageInputTokens ?? 0,
    usageOutputTokens: input.usageOutputTokens ?? 0,
    usageCacheRead: input.usageCacheRead ?? 0,
    usageCacheWrite: input.usageCacheWrite ?? 0,
    usageCostEstimate: input.usageCostEstimate ?? null,
    createdAt: input.createdAt ?? now,
    startedAt: input.startedAt ?? now,
    endedAt: input.endedAt ?? now,
  };
}

class FakeMigrationPort implements SyncTraceMigrationDatabasePort {
  readonly calls: string[] = [];
  readonly inserted: SyncTraceMigrationContainerRow[][] = [];
  readonly traceRewrites: SyncTraceContainerRewrite[] = [];
  readonly childRewrites: SyncTraceContainerRewrite[] = [];
  readonly agentRunRewrites: SyncTraceContainerRewrite[] = [];
  readonly sessionRewrites: SyncTraceContainerRewrite[] = [];
  readonly scopedMoves: SyncTraceScopedEventMove[] = [];
  readonly deleted: string[] = [];

  constructor(
    private readonly discovery: SyncTraceMigrationContainerRow[],
    private readonly containers: SyncTraceMigrationContainerRow[],
  ) {}

  async transaction<T>(operation: (tx: SyncTraceMigrationDatabasePort) => Promise<T>): Promise<T> {
    this.calls.push("transaction");
    return operation(this);
  }

  async findContainersReferencingSync(): Promise<SyncTraceMigrationContainerRow[]> {
    this.calls.push("discover");
    return this.discovery;
  }

  async findContainersUnderRoots(rootIds: string[]): Promise<SyncTraceMigrationContainerRow[]> {
    this.calls.push(`load:${rootIds.join(",")}`);
    return this.containers;
  }

  async insertContainers(rows: SyncTraceMigrationContainerRow[]): Promise<number> {
    this.calls.push(this.inserted.length === 0 ? "insert-parents" : "insert-rewrites");
    this.inserted.push(rows);
    return rows.length;
  }

  async repointTraceEvents(rewrites: SyncTraceContainerRewrite[]): Promise<number> {
    this.calls.push("trace-events");
    this.traceRewrites.push(...rewrites);
    return rewrites.length;
  }

  async repointChildContainers(rewrites: SyncTraceContainerRewrite[]): Promise<number> {
    this.calls.push("child-containers");
    this.childRewrites.push(...rewrites);
    return rewrites.length;
  }

  async repointAgentRuns(rewrites: SyncTraceContainerRewrite[]): Promise<number> {
    this.calls.push("agent-runs");
    this.agentRunRewrites.push(...rewrites);
    return rewrites.length;
  }

  async repointPiAgentSessions(rewrites: SyncTraceContainerRewrite[]): Promise<number> {
    this.calls.push("pi-sessions");
    this.sessionRewrites.push(...rewrites);
    return rewrites.length;
  }

  async repointScopedTraceEvents(_syncId: string, moves: SyncTraceScopedEventMove[]): Promise<number> {
    this.calls.push("scoped-events");
    this.scopedMoves.push(...moves);
    return moves.length;
  }

  async deleteEmptyContainers(oldIds: string[]): Promise<number> {
    this.calls.push("delete-empty");
    this.deleted.push(...oldIds);
    return oldIds.length;
  }
}

describe("sync trace hierarchy migration", () => {
  test("rewrites only the requested sync through a fake database port", async () => {
    const oldPostmortemId = appPostmortemContainerId({
      ...ref,
      runId: syncId,
      epochId: "knowledge-pr-42",
      claimId: "pr-42",
    });
    const oldIntakeItemId = appIntakeItemContainerId({ ...ref, prId: "43" });
    const oldKnowledgeJobId = appKnowledgeJobContainerId({ ...ref, jobKey: "discord-7" });
    const otherSyncKnowledgeJob = appKnowledgeJobContainerId({ ...ref, jobKey: "discord-other" });
    const postmortem = row({
      id: oldPostmortemId,
      metadata: { gameId: ref.gameId, sessionId: ref.sessionId, runId: syncId, prId: "42" },
    });
    const postmortemChild = row({
      id: `${oldPostmortemId}:agent:summary`,
      parentContainerId: oldPostmortemId,
      metadata: { gameId: ref.gameId, sessionId: ref.sessionId, runId: syncId, prId: "42" },
    });
    const intakeItem = row({
      id: oldIntakeItemId,
      kind: "intake-item",
      phase: "intake-item",
      metadata: { gameId: ref.gameId, sessionId: ref.sessionId, prId: "43" },
    });
    const knowledgeJob = row({
      id: oldKnowledgeJobId,
      kind: "knowledge-job",
      phase: "knowledge-job",
      metadata: { gameId: ref.gameId, sessionId: ref.sessionId, runId: syncId, jobKey: "discord-7" },
    });
    const unrelated = row({
      id: otherSyncKnowledgeJob,
      kind: "knowledge-job",
      metadata: { gameId: ref.gameId, sessionId: ref.sessionId, runId: "sync-other" },
    });
    const port = new FakeMigrationPort(
      [postmortem],
      [postmortem, postmortemChild, intakeItem, knowledgeJob, unrelated],
    );

    const summary = await runSyncTraceHierarchyMigration({
      syncId,
      claimIntakeItems: true,
      port,
      now,
    });

    const rewrites = new Map(port.traceRewrites.map((rewrite) => [rewrite.oldId, rewrite.newId]));
    expect(rewrites.get(oldPostmortemId)).toBe(
      appSyncWorkflowIntakePostmortemContainerId(ref, syncId, "42"),
    );
    expect(port.traceRewrites.find((rewrite) => rewrite.oldId === oldPostmortemId)?.row).toMatchObject({
      kind: "intake-postmortem",
      label: "PR #42 postmortem",
      metadata: { containerKind: "intake-postmortem", prId: "42" },
    });
    expect(rewrites.get(postmortemChild.id)).toBe(
      `${appSyncWorkflowIntakePostmortemContainerId(ref, syncId, "42")}:agent:summary`,
    );
    expect(rewrites.get(oldIntakeItemId)).toBe(
      appSyncWorkflowIntakeItemContainerId(ref, syncId, "43"),
    );
    expect(rewrites.get(oldKnowledgeJobId)).toBe(
      appSyncWorkflowKnowledgeJobContainerId(ref, syncId, "discord-7"),
    );
    expect(rewrites.has(otherSyncKnowledgeJob)).toBeFalse();
    expect(port.agentRunRewrites).toEqual(port.traceRewrites);
    expect(port.sessionRewrites).toEqual(port.traceRewrites);
    expect(port.inserted[0][0].id).toBe(appSyncWorkflowContainerId(ref, syncId));
    expect(port.inserted.flat().every((inserted) => inserted.appKey[0] === inserted.id)).toBeTrue();
    expect(port.calls).toEqual([
      "discover",
      `load:${appRootContainerId(ref)}`,
      "transaction",
      "insert-parents",
      "insert-rewrites",
      "child-containers",
      "trace-events",
      "agent-runs",
      "pi-sessions",
      "scoped-events",
      "delete-empty",
    ]);
    expect(summary).toMatchObject({
      syncId,
      dryRun: false,
      claimedIntakeItems: true,
      cycleCount: 1,
      containersPlanned: 4,
      containersDeleted: 4,
    });
  });

  test("dry-run plans without opening a transaction", async () => {
    const postmortem = row({
      id: appPostmortemContainerId({ ...ref, runId: syncId, epochId: "epoch", claimId: "pr-99" }),
      metadata: { gameId: ref.gameId, sessionId: ref.sessionId, runId: syncId, prId: "99" },
    });
    const port = new FakeMigrationPort([postmortem], [postmortem]);

    const summary = await runSyncTraceHierarchyMigration({ syncId, dryRun: true, port, now });

    expect(summary.containersPlanned).toBe(1);
    expect(summary.containersInserted).toBe(0);
    expect(port.calls).toEqual(["discover", `load:${appRootContainerId(ref)}`]);
  });

  test("rewrites rows through the SQLite database port", async () => {
    const root = mkdtempSync(join(tmpdir(), "sync-trace-sqlite-"));
    const handle = await openAppKernelDatabase({
      databasePath: join(root, "agent-kernel.sqlite"),
      env: {},
    });
    try {
      await ensureKernelObservabilitySchema(handle.db);
      const rootContainer = row({
        id: appRootContainerId(ref),
        kind: "session",
        metadata: { gameId: ref.gameId, sessionId: ref.sessionId },
        parentContainerId: null,
        phase: "session",
      });
      const postmortem = row({
        id: appPostmortemContainerId({
          ...ref,
          runId: syncId,
          epochId: "epoch",
          claimId: "pr-77",
        }),
        metadata: {
          gameId: ref.gameId,
          sessionId: ref.sessionId,
          runId: syncId,
          prId: "77",
        },
        parentContainerId: rootContainer.id,
      });
      await upsertAppContainer(handle.db, {
        ...rootContainer,
        kernelId: MELEE_KERNEL_ID,
      } as any);
      await upsertAppContainer(handle.db, {
        ...postmortem,
        kernelId: MELEE_KERNEL_ID,
      } as any);

      const summary = await runSyncTraceHierarchyMigration({
        db: handle.db,
        now,
        syncId,
      });

      expect(summary).toMatchObject({
        cycleCount: 1,
        containersPlanned: 1,
        containersDeleted: 1,
        dryRun: false,
        syncId,
      });
    } finally {
      await handle.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("rejects a run id that is not sync-scoped", async () => {
    const port = new FakeMigrationPort([], []);
    expect(runSyncTraceHierarchyMigration({ syncId: "operator-backfill", port })).rejects.toThrow(
      "beginning with 'sync-'",
    );
  });
});
