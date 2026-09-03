import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, spyOn, test } from "bun:test";

import type {
  AgentRun,
  Container,
  KernelTraceReadOptions,
  KernelTraceReadRows,
  NewContainer,
  PiAgentSessionWithEventCount,
  TraceEventRow as KernelTraceEventRow,
} from "@agent-kernel/db";
import { EventType, TraceLevel, TraceSource } from "@agent-kernel/protocol";

import { createAppKernelBridgeConfig, MELEE_KERNEL_ID } from "./config.js";
import { createAppKernel } from "./kernel.js";
import { createAppLoaderCatalog, MELEE_SESSION_CONTEXT_LOADER_KIND } from "./loaders.js";
import { createAppKernelTraceReadService } from "./read-api.js";
import {
  upsertAppKernelRegistration,
  type KernelRegistration,
  type NewKernelRegistration,
} from "./registration.js";
import { createAppKernelRuntime } from "./runtime.js";
import {
  buildAppContainer,
  describeAppContainer,
  APP_PHASE_VOCABULARY,
  appAppSessionId,
  appBaselineContainerId,
  appEpochContainerId,
  appPrHandoffContainerId,
  appPrQaContainerId,
  appPrRepairContainerId,
  appPrReviewContainerId,
  appPrSplitContainerId,
  appRunContainerId,
  appWorkerIntegrationContainerId,
  type AppContainerKind,
  appIntakeContainerId,
  appIntakeItemContainerId,
  appIntakeKnowledgeContainerId,
  appIntakePostmortemContainerId,
  appKnowledgeContainerId,
  appKnowledgeJobContainerId,
  appPrContainerId,
  appPrPublicationContainerId,
  appPostmortemContainerId,
  appPrepareContainerId,
  appRootContainerId,
  appRunKnowledgeContainerId,
  appRunKnowledgeJobContainerId,
  appSyncContainerId,
  appSyncIntakeContainerId,
  appSyncWorkflowContainerId,
  appSyncWorkflowIntakeKnowledgeContainerId,
  appSyncWorkflowKnowledgeContainerId,
  appSyncWorkflowKnowledgeJobContainerId,
  appWorkerContainerId,
  appWorkflowTraceEventId,
} from "./session-mapping.js";
import { createAppKernelSpawnContext } from "./spawn-context.js";
import {
  createAppKernelPiAgentRunner,
  MELEE_AGENT_SPAWN_COMPLETED_EVENT,
  MELEE_AGENT_SPAWN_FAILED_EVENT,
  MELEE_AGENT_SPAWN_STARTED_EVENT,
  type AppKernelPiRunOptions,
} from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import type { PiRunOptions } from "@server/infrastructure/agent-runtime/runtime";
import { createAppTraceWriter } from "./trace-writer.js";
import { submitAppWorkflowTraceEvent } from "./workflow-trace.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function registrationRow(data: NewKernelRegistration): KernelRegistration {
  return {
    ...data,
    appBaseUrl: data.appBaseUrl ?? null,
    appTraceUrlTemplate: data.appTraceUrlTemplate ?? null,
    genericTraceUrlTemplate: data.genericTraceUrlTemplate ?? null,
    metadata: data.metadata ?? {},
    registeredAt: "2026-06-24T18:00:00.000Z",
    lastSeenAt: "2026-06-24T18:00:00.000Z",
    createdAt: "2026-06-24T18:00:00.000Z",
    updatedAt: "2026-06-24T18:00:00.000Z",
  };
}

function fixtureRows(): KernelTraceReadRows {
  const appSessionId = "11111111-1111-5111-8111-111111111111";
  const rootContainer: Container = {
    id: "melee:root",
    kernelId: MELEE_KERNEL_ID,
    kind: "session",
    appKey: ["melee", "live"],
    parentContainerId: null,
    label: "Game session live",
    status: "active",
    workingDir: "/repo",
    phase: "run",
    phaseVocabulary: ["setup", "baseline", "run", "pr"],
    metadata: {
      appSessionId,
      appSessionSlug: "live",
      topic: "Melee session",
      appSessionType: "melee-cycle",
    },
    usageInputTokens: 10,
    usageOutputTokens: 20,
    usageCacheRead: 0,
    usageCacheWrite: 0,
    usageCostEstimate: null,
    startedAt: "2026-06-24T18:00:00.000Z",
    endedAt: null,
    createdAt: "2026-06-24T18:00:00.000Z",
  };
  const childContainer: Container = {
    ...rootContainer,
    id: "melee:root:worker",
    kind: "worker",
    appKey: ["melee", "live", "worker"],
    parentContainerId: rootContainer.id,
    label: "Worker claim A",
    phase: "worker",
  };
  const piSession: PiAgentSessionWithEventCount = {
    id: "22222222-2222-5222-8222-222222222222",
    parentSessionId: null,
    parentToolUseId: null,
    containerId: childContainer.id,
    phase: "worker",
    displayLabel: "Worker A",
    agentName: "worker",
    status: "running",
    model: "gpt-5",
    promptHash: null,
    usageInputTokens: 10,
    usageOutputTokens: 20,
    endedAt: null,
    createdAt: "2026-06-24T18:01:00.000Z",
    eventCount: 2,
  };
  const agentRun: AgentRun = {
    id: "33333333-3333-5333-8333-333333333333",
    piSessionId: piSession.id,
    agentName: "worker",
    containerId: childContainer.id,
    phase: "worker",
    parentRunId: null,
    displayLabel: "Worker run",
    parentToolUseId: null,
    trigger: "system",
    inboundEventId: null,
    outboundEventId: null,
    status: "running",
    startedAt: "2026-06-24T18:01:00.000Z",
    endedAt: null,
    usageInputTokens: 10,
    usageOutputTokens: 20,
    usageCacheRead: 0,
    usageCacheWrite: 0,
    usageCostEstimate: null,
  };
  const event: KernelTraceEventRow = {
    eventId: "44444444-4444-5444-8444-444444444444",
    containerId: childContainer.id,
    runId: agentRun.id,
    agentId: "worker",
    userId: "00000000-0000-0000-0000-000000000001",
    type: EventType.WARNING,
    source: TraceSource.APP,
    traceLevel: TraceLevel.DEBUG,
    eventData: { message: "worker lease routed", warning_type: "scheduler" },
    piSessionId: piSession.id,
    spanId: "span-1",
    parentEventId: null,
    timestamp: "2026-06-24T18:02:00.000Z",
  };

  return {
    rootContainer,
    containers: [rootContainer, childContainer],
    piSessions: [piSession],
    agentRuns: [agentRun],
    events: [event],
  };
}

describe("kernel registration", () => {
  test("builds and upserts the Melee kernel registration payload", async () => {
    const payloads: NewKernelRegistration[] = [];
    const config = createAppKernelBridgeConfig({
      workingDir: "/repo",
      appBaseUrl: "http://127.0.0.1:5174",
      markerConfig: {
        sessionBinding: "melee:session-binding",
      },
      metadata: { environment: "test" },
    });

    const row = await upsertAppKernelRegistration({
      db: {},
      config,
      upsert: async (_db: unknown, data: NewKernelRegistration) => {
        payloads.push(data);
        return registrationRow(data);
      },
    });
    const captured = payloads[0];

    expect(row.kernelId).toBe(MELEE_KERNEL_ID);
    expect(captured?.displayName).toBe("Melee Decomp Orchestrator");
    expect(captured?.workingDir).toBe("/repo");
    expect(captured?.piSessionsDir).toBe("/repo/.pi-sessions");
    expect(captured?.markerConfig.sessionBinding).toBe("melee:session-binding");
    expect(captured?.markerConfig.lifecycle).toBe("agent-kernel:pi-lifecycle");
    expect(captured?.metadata).toMatchObject({
      processName: "melee-live",
      environment: "test",
    });
  });
});

describe("session and container mapping", () => {
  test("derives stable UUID app sessions and deterministic container ids", () => {
    const ref = { gameId: "melee", sessionId: "session 2026/06/24" };
    const appSessionId = appAppSessionId(ref);
    const repeat = appAppSessionId({ ...ref });
    const other = appAppSessionId({ gameId: "melee", sessionId: "next" });

    expect(appSessionId).toMatch(UUID_RE);
    expect(repeat).toBe(appSessionId);
    expect(other).not.toBe(appSessionId);
    expect(appRootContainerId(ref)).toBe(`melee:${appSessionId}:session`);
    expect(
      appWorkerContainerId({
        ...ref,
        runId: "run/live",
        epochId: 3,
        claimId: "claim A",
        targetId: "ftMain",
      }),
    ).toBe(
      appWorkerContainerId({
        ...ref,
        runId: "run/live",
        epochId: 3,
        claimId: "claim A",
      }),
    );

    const container = buildAppContainer({ kind: "session", ref, workingDir: "/repo" });
    expect(container.id).toBe(appRootContainerId(ref));
    expect(container.parentContainerId).toBeNull();
    expect(container.metadata).toMatchObject({
      appSessionId,
      containerKind: "session",
      gameId: "melee",
    });
  });

  test("maps PR publication containers under the PR tree with publication phase", () => {
    const ref = { gameId: "melee", sessionId: "run-1" };
    const container = buildAppContainer({
      kind: "pr-publication",
      ref,
      metadata: { prId: "draft-1", branch: "pr/demo" },
      workingDir: "/repo",
    });

    expect(container.id).toBe(appPrPublicationContainerId({ ...ref, prId: "draft-1" }));
    expect(container.parentContainerId).toBe(appPrContainerId({ ...ref, prId: "draft-1" }));
    expect(container.phase).toBe("publication");
    expect(container.metadata).toMatchObject({
      appSessionId: appAppSessionId(ref),
      containerKind: "pr-publication",
      prId: "draft-1",
      branch: "pr/demo",
    });
  });

  test("keeps bridge-owned container identity authoritative over caller metadata", () => {
    const ref = { gameId: "melee", sessionId: "session-real" };
    const container = buildAppContainer({
      kind: "pr-publication",
      ref,
      metadata: {
        appSessionId: "spoofed-app-session",
        containerId: "spoofed-container",
        containerKind: "worker",
        gameId: "spoofed-game",
        sessionId: "spoofed-session",
        prId: "draft-real",
      },
    });

    expect(container.metadata).toMatchObject({
      appSessionId: appAppSessionId(ref),
      containerId: container.id,
      containerKind: "pr-publication",
      gameId: "melee",
      sessionId: "session-real",
      prId: "draft-real",
    });
  });

  test("derives stable, submission-specific workflow trace event ids", () => {
    const input = {
      gameId: "melee",
      sessionId: "session-1",
      gameEventId: "game-event-1",
      containerId: "container-1",
      eventType: "melee:baseline_completed",
      operation: "prepare.calculateBaseline",
      status: "completed",
    };

    expect(appWorkflowTraceEventId(input)).toMatch(UUID_RE);
    expect(appWorkflowTraceEventId({ ...input })).toBe(
      appWorkflowTraceEventId(input),
    );
    expect(appWorkflowTraceEventId({ ...input, status: "failed" })).not.toBe(
      appWorkflowTraceEventId(input),
    );
  });

  test("keeps sync-less intake and baseline containers under Prepare", () => {
    const ref = { gameId: "melee", sessionId: "session-1" };
    const sync = buildAppContainer({ kind: "sync", ref });
    const intake = buildAppContainer({ kind: "intake", ref });
    const baseline = buildAppContainer({ kind: "baseline", ref });
    const item = buildAppContainer({
      kind: "intake-item",
      ref,
      metadata: { prId: "2764" },
      workingDir: "/repo",
    });
    const postmortem = buildAppContainer({
      kind: "intake-postmortem",
      ref,
      metadata: { prId: "2764" },
      workingDir: "/repo",
    });
    const knowledge = buildAppContainer({
      kind: "intake-knowledge",
      ref,
      metadata: { prId: "2764" },
      workingDir: "/repo",
    });

    expect(sync.parentContainerId).toBe(appRootContainerId(ref));
    expect(sync.label).toBe("Sync");
    expect(intake.parentContainerId).toBe(appPrepareContainerId(ref));
    expect(baseline.parentContainerId).toBe(appPrepareContainerId(ref));
    expect(baseline.label).toBe("Baseline and rebuild");
    expect(item.id).toBe(appIntakeItemContainerId({ ...ref, prId: "2764" }));
    expect(item.parentContainerId).toBe(appIntakeContainerId(ref));
    expect(postmortem.id).toBe(appIntakePostmortemContainerId({ ...ref, prId: "2764" }));
    expect(postmortem.parentContainerId).toBe(item.id);
    expect(knowledge.id).toBe(appIntakeKnowledgeContainerId({ ...ref, prId: "2764" }));
    expect(knowledge.parentContainerId).toBe(item.id);
    expect(knowledge.phase).toBe("knowledge-intake");
  });
});

describe("spawn context mapping", () => {
  test("builds worker spawn context with app session and claim container identity", () => {
    const context = createAppKernelSpawnContext({
      kind: "worker",
      gameId: "melee",
      sessionId: "run-1",
      runId: "run-1",
      epochId: 2,
      claimId: "claim-A",
      targetId: "target-A",
      workingDir: "/repo",
      metadata: { attemptIndex: 1 },
    });

    expect(context.appSessionId).toBe(
      appAppSessionId({ gameId: "melee", sessionId: "run-1" }),
    );
    expect(context.containerId).toBe(
      appWorkerContainerId({
        gameId: "melee",
        sessionId: "run-1",
        runId: "run-1",
        epochId: 2,
        claimId: "claim-A",
        targetId: "target-A",
      }),
    );
    expect(context.phase).toBe("worker");
    expect(context.workingDir).toBe("/repo");
    expect(context.metadata).toMatchObject({
      containerKind: "worker",
      gameId: "melee",
      sessionId: "run-1",
      runId: "run-1",
      epochId: "2",
      claimId: "claim-A",
      targetId: "target-A",
      attemptIndex: 1,
    });
    expect(context.containerLineage?.map((container) => container.phase)).toEqual([
      "session",
      "run",
      "epoch",
      "worker",
    ]);
    expect(context.containerLineage?.at(-1)).toMatchObject({
      id: context.containerId,
      parentContainerId: expect.stringContaining(":epoch:"),
      label: "Worker claim claim-A",
      metadata: {
        containerKind: "worker",
        targetId: "target-A",
      },
    });
  });

  test("builds postmortem spawn context under the epoch container tree", () => {
    const context = createAppKernelSpawnContext({
      kind: "postmortem",
      gameId: "melee",
      sessionId: "run-1",
      runId: "run-1",
      epochId: 2,
      claimId: "claim-A",
      targetId: "target-A",
      workingDir: "/repo",
    });

    expect(context.containerId).toBe(
      appPostmortemContainerId({
        gameId: "melee",
        sessionId: "run-1",
        runId: "run-1",
        epochId: 2,
        claimId: "claim-A",
        targetId: "target-A",
      }),
    );
    expect(context.phase).toBe("postmortem");
    expect(context.metadata).toMatchObject({
      containerKind: "postmortem",
      gameId: "melee",
      sessionId: "run-1",
      runId: "run-1",
      epochId: "2",
      claimId: "claim-A",
      targetId: "target-A",
    });
    expect(context.containerLineage?.map((container) => container.phase)).toEqual([
      "session",
      "run",
      "epoch",
      "postmortem",
    ]);
    expect(context.containerLineage?.at(-1)).toMatchObject({
      id: context.containerId,
      parentContainerId: expect.stringContaining(":epoch:"),
      label: "Postmortem claim claim-A",
    });
  });

  test("builds sync-less intake agent contexts under the legacy Prepare item", () => {
    const context = createAppKernelSpawnContext({
      kind: "intake-postmortem",
      gameId: "melee",
      sessionId: "session-1",
      runId: "session-1",
      itemId: "pr-2764",
      prId: "2764",
      targetId: "pr-2764",
      workingDir: "/repo",
    });

    expect(context.appSessionId).toBe(
      appAppSessionId({ gameId: "melee", sessionId: "session-1" }),
    );
    expect(context.containerId).toBe(
      appIntakePostmortemContainerId({
        gameId: "melee",
        sessionId: "session-1",
        prId: "2764",
      }),
    );
    expect(context.phase).toBe("postmortem");
    expect(context.metadata).toMatchObject({
      containerKind: "intake-postmortem",
      gameId: "melee",
      sessionId: "session-1",
      runId: "session-1",
      itemId: "pr-2764",
      prId: "2764",
      targetId: "pr-2764",
    });
    expect(context.containerLineage?.map((container) => container.id)).toEqual([
      appRootContainerId({ gameId: "melee", sessionId: "session-1" }),
      appPrepareContainerId({ gameId: "melee", sessionId: "session-1" }),
      appIntakeContainerId({ gameId: "melee", sessionId: "session-1" }),
      appIntakeItemContainerId({ gameId: "melee", sessionId: "session-1", prId: "2764" }),
      appIntakePostmortemContainerId({ gameId: "melee", sessionId: "session-1", prId: "2764" }),
    ]);
  });

  test("warns only when a sync workflow id becomes an implicit session id", () => {
    const warning = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      createAppKernelSpawnContext({
        kind: "intake-knowledge",
        gameId: "melee",
        runId: "sync-0ccce0b7-x",
        prId: "2764",
      });
      expect(warning).toHaveBeenCalledTimes(1);
      expect(warning.mock.calls[0]?.[0]).toContain('kind "intake-knowledge"');
      expect(warning.mock.calls[0]?.[0]).toContain('workflow id "sync-0ccce0b7-x"');

      warning.mockClear();
      createAppKernelSpawnContext({
        kind: "intake-knowledge",
        gameId: "melee",
        sessionId: "sync-explicit",
        runId: "sync-0ccce0b7-x",
        prId: "2764",
      });
      expect(warning).not.toHaveBeenCalled();

      createAppKernelSpawnContext({
        kind: "intake-knowledge",
        gameId: "melee",
        runId: "pr-knowledge-intake-123",
        prId: "2764",
      });
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  test("builds PR review context under the PR container tree", () => {
    const context = createAppKernelSpawnContext({
      kind: "pr-review",
      gameId: "melee",
      runId: "run-1",
      prId: "run-1",
      reviewId: "slice-001",
    });

    expect(context.appSessionId).toBe(
      appAppSessionId({ gameId: "melee", sessionId: "run-1" }),
    );
    expect(context.containerId).toContain(":pr:");
    expect(context.containerId).toContain(":review:");
    expect(context.phase).toBe("pr-review");
    expect(context.metadata).toMatchObject({
      containerKind: "pr-review",
      gameId: "melee",
      sessionId: "run-1",
      runId: "run-1",
      prId: "run-1",
      reviewId: "slice-001",
    });
    expect(context.containerLineage?.map((container) => container.phase)).toEqual([
      "session",
      "pr",
      "pr-review",
    ]);
    expect(context.containerLineage?.at(-1)).toMatchObject({
      id: context.containerId,
      parentContainerId: expect.stringContaining(":pr:"),
      label: "PR review slice-001",
    });
  });
});

describe("trace writer", () => {
  test("submits app-owned workflow events with app source and kernel identity", async () => {
    const submitted: unknown[] = [];
    const writer = createAppTraceWriter({
      insertBatch: async (events) => {
        submitted.push(...events);
        return events.length;
      },
      now: () => "2026-06-24T18:00:00.000Z",
      newEventId: () => "55555555-5555-5555-8555-555555555555",
    });

    const event = await writer.submitAppEvent({
      appSessionId: "11111111-1111-5111-8111-111111111111",
      containerId: "melee:root:run",
      type: "melee:scheduler_decision",
      eventData: { admittedTargets: 256 },
      traceLevel: TraceLevel.DEBUG,
    });

    expect(submitted).toHaveLength(1);
    expect(event).toMatchObject({
      eventId: "55555555-5555-5555-8555-555555555555",
      containerId: "melee:root:run",
      source: TraceSource.APP,
      type: "melee:scheduler_decision",
      traceLevel: TraceLevel.DEBUG,
      eventData: {
        admittedTargets: 256,
        appSessionId: "11111111-1111-5111-8111-111111111111",
      },
    });
  });

  test("flush waits for outstanding inserts", async () => {
    let finishInsert: (() => void) | undefined;
    const writer = createAppTraceWriter({
      insertBatch: (events) =>
        new Promise<number>((resolve) => {
          finishInsert = () => resolve(events.length);
        }),
    });

    void writer.submit(
      writer.createAppEvent({
        appSessionId: "11111111-1111-5111-8111-111111111111",
        type: "melee:test",
        eventData: {},
      }),
    );
    let flushed = false;
    const flush = writer.flush().then(() => {
      flushed = true;
    });

    await Promise.resolve();
    expect(flushed).toBe(false);

    finishInsert?.();
    await flush;
    expect(flushed).toBe(true);
  });
});

describe("container identity has one authority", () => {
  const ref = { gameId: "melee", sessionId: "run-1" };
  const fullMetadata = {
    runId: "run-1",
    epochId: 2,
    claimId: "claim-A",
    itemId: "item-A",
    targetId: "target-A",
    prId: "2764",
    reviewId: "slice-001",
    repairId: "repair-7",
    jobKey: "job-9",
  };

  // Every kind, so a new AppContainerKind that forgets its describe case is
  // caught here as well as by the (now total) switch failing to compile.
  const ALL_KINDS: AppContainerKind[] = [
    "session",
    "sync",
    "sync-intake",
    "intake",
    "intake-item",
    "intake-postmortem",
    "intake-knowledge",
    "knowledge",
    "knowledge-job",
    "baseline",
    "run",
    "epoch",
    "worker",
    "worker-integration",
    "postmortem",
    "pr",
    "pr-handoff",
    "pr-qa",
    "pr-split",
    "pr-review",
    "pr-repair",
    "pr-publication",
  ];

  test("describes every container kind without falling back to a bare-kind id", () => {
    const root = appRootContainerId(ref);
    const ids = new Set<string>();
    for (const kind of ALL_KINDS) {
      const descriptor = describeAppContainer(kind, ref, fullMetadata);
      expect(descriptor.kind).toBe(kind);
      expect(descriptor.id.startsWith(root)).toBe(true);
      // The old default branch minted `<root>:<kind>:none-<sha>` with the raw
      // kind as the label and the root as the parent.
      expect(descriptor.id).not.toBe(`${root}:${kind}:none`);
      expect(descriptor.id).not.toContain(`:${kind}:none-`);
      expect(descriptor.label).not.toBe(kind);
      expect(descriptor.phase).toBeTruthy();
      if (kind === "session") expect(descriptor.parentContainerId).toBeNull();
      else expect(descriptor.parentContainerId).toBeTruthy();
      ids.add(descriptor.id);
    }
    expect(ids.size).toBe(ALL_KINDS.length);
  });

  test("describes the ids the id helpers already publish", () => {
    const runRef = { ...ref, runId: "run-1" };
    const epochRef = { ...runRef, epochId: 2 };
    const claimRef = { ...epochRef, claimId: "claim-A" };
    const prRef = { ...ref, prId: "2764" };
    const expected: Array<[AppContainerKind, string]> = [
      ["run", appRunContainerId(runRef)],
      ["epoch", appEpochContainerId(epochRef)],
      ["worker", appWorkerContainerId(claimRef)],
      ["worker-integration", appWorkerIntegrationContainerId(claimRef)],
      ["postmortem", appPostmortemContainerId(claimRef)],
      ["pr-handoff", appPrHandoffContainerId(prRef)],
      ["pr-qa", appPrQaContainerId(prRef)],
      ["pr-split", appPrSplitContainerId(prRef)],
      ["pr-review", appPrReviewContainerId({ ...prRef, reviewId: "slice-001" })],
      ["pr-repair", appPrRepairContainerId({ ...prRef, repairId: "repair-7" })],
      ["knowledge", appRunKnowledgeContainerId(runRef)],
      ["knowledge-job", appRunKnowledgeJobContainerId({ ...runRef, jobKey: "job-9" })],
    ];
    for (const [kind, id] of expected) {
      expect(describeAppContainer(kind, ref, fullMetadata).id).toBe(id);
    }
  });

  test("the sync-less knowledge lane hangs off the cycle root", () => {
    const lane = describeAppContainer("knowledge", ref, {});
    expect(lane.id).toBe(`${appRootContainerId(ref)}:knowledge`);
    expect(lane.parentContainerId).toBe(appRootContainerId(ref));
    expect(lane.label).toBe("Knowledge");

    const job = describeAppContainer("knowledge-job", ref, { jobKey: "job-9" });
    expect(job.parentContainerId).toBe(appKnowledgeContainerId(ref));
    expect(job.id.startsWith(`${appKnowledgeContainerId(ref)}:`)).toBe(true);
  });

  test("two knowledge jobs never collapse onto one container", () => {
    const first = describeAppContainer("knowledge-job", ref, { jobKey: "job-9" });
    const second = describeAppContainer("knowledge-job", ref, { jobKey: "job-10" });
    expect(first.id).not.toBe(second.id);
  });

  test("a knowledge job names itself by queue id, then batch, then worker state", () => {
    const byJobId = describeAppContainer("knowledge-job", ref, {
      jobId: "queued-1",
      batchId: "batch-1",
    });
    expect(byJobId.id).toBe(appKnowledgeJobContainerId({ ...ref, jobKey: "queued-1" }));
    const bySubject = describeAppContainer("knowledge-job", ref, {
      subjectId: "knowledge-job-2",
      batchId: "batch-1",
    });
    expect(bySubject.id).toBe(
      appKnowledgeJobContainerId({ ...ref, jobKey: "knowledge-job-2" }),
    );
    const byBatch = describeAppContainer("knowledge-job", ref, { batchId: "batch-1" });
    expect(byBatch.id).toBe(appKnowledgeJobContainerId({ ...ref, jobKey: "batch-1" }));
    const byWorkerState = describeAppContainer("knowledge-job", ref, {
      workerStateId: "ws-3",
    });
    expect(byWorkerState.id).toBe(appKnowledgeJobContainerId({ ...ref, jobKey: "ws-3" }));
  });

  // The regression this whole lane exists to prevent: curation used to reuse
  // the run container's id, and the upsert overwrites label/phase on conflict.
  test("librarian curation no longer lands on the run container", () => {
    const curation = createAppKernelSpawnContext({
      kind: "knowledge-curation",
      gameId: "melee",
      sessionId: "cycle-uuid-1",
      runId: "run-1",
      jobId: "batch-7",
      jobKind: "Curator review",
      phase: "knowledge-curation",
    });
    const runId = appRunContainerId({ gameId: "melee", sessionId: "cycle-uuid-1", runId: "run-1" });
    const lineage = curation.containerLineage ?? [];
    expect(curation.containerId).not.toBe(runId);
    expect(lineage.some((container) => container.id === runId)).toBe(true);
    expect(lineage.map((container) => container.id)).toEqual([
      appRootContainerId({ gameId: "melee", sessionId: "cycle-uuid-1" }),
      runId,
      appRunKnowledgeContainerId({ gameId: "melee", sessionId: "cycle-uuid-1", runId: "run-1" }),
      appRunKnowledgeJobContainerId({
        gameId: "melee",
        sessionId: "cycle-uuid-1",
        runId: "run-1",
        jobKey: "batch-7",
      }),
    ]);
    expect(lineage.at(-1)?.label).toBe("Curator review batch-7");
  });

  test("keeps legacy sync-less child ids and parents", () => {
    const root = appRootContainerId(ref);
    expect(appSyncIntakeContainerId(ref)).toBe(`${root}:prepare:sync-intake`);
    expect(appBaselineContainerId(ref)).toBe(`${root}:prepare:baseline`);
    expect(describeAppContainer("sync-intake", ref).parentContainerId).toBe(
      appPrepareContainerId(ref),
    );
    expect(describeAppContainer("baseline", ref).parentContainerId).toBe(
      appPrepareContainerId(ref),
    );
  });

  test("phase vocabulary covers both writers and the legacy Prepare phase", () => {
    const emittedPhases = new Set(
      ALL_KINDS.map((kind) => describeAppContainer(kind, ref, fullMetadata).phase),
    );
    for (const input of [
      { kind: "knowledge-curation" as const, phase: undefined },
      { kind: "reconcile" as const, phase: undefined },
    ]) {
      const context = createAppKernelSpawnContext({
        ...input,
        gameId: ref.gameId,
        sessionId: ref.sessionId,
        runId: "run-1",
        prId: "2764",
      });
      if (context.phase) emittedPhases.add(context.phase);
      for (const container of context.containerLineage ?? []) {
        if (container.phase) emittedPhases.add(container.phase);
      }
    }
    for (const phase of emittedPhases) {
      expect(APP_PHASE_VOCABULARY).toContain(phase);
    }
    expect(APP_PHASE_VOCABULARY).toContain("sync");
    expect(APP_PHASE_VOCABULARY).toContain("prepare");
  });

  test("spawn contexts and the descriptor agree on id, label, parent and phase", () => {
    const cases: Array<{
      kind: AppContainerKind;
      spawn: Parameters<typeof createAppKernelSpawnContext>[0];
      metadata: Record<string, unknown>;
    }> = [
      {
        kind: "run",
        spawn: { kind: "run", gameId: "melee", sessionId: "run-1", runId: "run-1" },
        metadata: { runId: "run-1" },
      },
      {
        kind: "worker",
        spawn: {
          kind: "worker",
          gameId: "melee",
          sessionId: "run-1",
          runId: "run-1",
          epochId: 2,
          claimId: "claim-A",
          targetId: "target-A",
        },
        metadata: { runId: "run-1", epochId: 2, claimId: "claim-A", targetId: "target-A" },
      },
      {
        kind: "worker-integration",
        spawn: {
          kind: "worker-integration",
          gameId: "melee",
          sessionId: "run-1",
          runId: "run-1",
          epochId: 2,
          claimId: "claim-A",
        },
        metadata: { runId: "run-1", epochId: 2, claimId: "claim-A" },
      },
      {
        kind: "postmortem",
        spawn: {
          kind: "postmortem",
          gameId: "melee",
          sessionId: "run-1",
          runId: "run-1",
          epochId: 2,
          claimId: "claim-A",
        },
        metadata: { runId: "run-1", epochId: 2, claimId: "claim-A" },
      },
      {
        kind: "postmortem",
        spawn: {
          kind: "postmortem",
          gameId: "melee",
          sessionId: "run-1",
          runId: "run-1",
          epochId: 2,
          itemId: "item-A",
        },
        metadata: { runId: "run-1", epochId: 2, itemId: "item-A" },
      },
      {
        kind: "pr",
        spawn: { kind: "pr", gameId: "melee", sessionId: "run-1", runId: "run-1", prId: "2764" },
        metadata: { runId: "run-1", prId: "2764" },
      },
      {
        kind: "pr-split",
        spawn: {
          kind: "pr-split",
          gameId: "melee",
          sessionId: "run-1",
          runId: "run-1",
          prId: "2764",
        },
        metadata: { runId: "run-1", prId: "2764" },
      },
      {
        kind: "pr-review",
        spawn: {
          kind: "pr-review",
          gameId: "melee",
          sessionId: "run-1",
          runId: "run-1",
          prId: "2764",
          reviewId: "slice-001",
        },
        metadata: { runId: "run-1", prId: "2764", reviewId: "slice-001" },
      },
      {
        kind: "pr-repair",
        spawn: {
          kind: "pr-repair",
          gameId: "melee",
          sessionId: "run-1",
          runId: "run-1",
          prId: "2764",
          repairId: "repair-7",
        },
        metadata: { runId: "run-1", prId: "2764", repairId: "repair-7" },
      },
      {
        kind: "intake-postmortem",
        spawn: {
          kind: "intake-postmortem",
          gameId: "melee",
          sessionId: "run-1",
          runId: "run-1",
          prId: "2764",
          itemId: "pr-2764",
        },
        metadata: { runId: "run-1", prId: "2764", itemId: "pr-2764" },
      },
      {
        kind: "intake-knowledge",
        spawn: {
          kind: "intake-knowledge",
          gameId: "melee",
          sessionId: "run-1",
          runId: "run-1",
          prId: "2764",
          itemId: "pr-2764",
        },
        metadata: { runId: "run-1", prId: "2764", itemId: "pr-2764" },
      },
    ];

    for (const testCase of cases) {
      const context = createAppKernelSpawnContext(testCase.spawn);
      const descriptor = describeAppContainer(testCase.kind, ref, testCase.metadata);
      const spawned = context.containerLineage?.at(-1);
      expect(context.containerId).toBe(descriptor.id);
      expect(spawned?.id).toBe(descriptor.id);
      expect(spawned?.label).toBe(descriptor.label);
      expect(spawned?.parentContainerId).toBe(descriptor.parentContainerId);
      expect(spawned?.phase).toBe(descriptor.phase);
    }
  });

  test("spawn lineage parents are the containers the lineage actually carries", () => {
    const context = createAppKernelSpawnContext({
      kind: "worker",
      gameId: "melee",
      sessionId: "run-1",
      runId: "run-1",
      epochId: 2,
      claimId: "claim-A",
    });
    const lineage = context.containerLineage ?? [];
    const ids = new Set(lineage.map((container) => container.id));
    for (const container of lineage) {
      if (!container.parentContainerId) continue;
      expect(ids.has(container.parentContainerId)).toBe(true);
    }
  });
});

describe("workflow trace helper", () => {
  test("routes epoch events through their run and ignores sync-shaped correlations for run events", async () => {
    const ref = { gameId: "melee", sessionId: "cycle-1" };
    const contexts: any[] = [];
    const runtime = {
      upsertSpawnContainers: async (context: unknown) => {
        contexts.push(context);
      },
      traceWriter: {
        createAppEvent: (input: any) => ({
          eventId: "55555555-5555-5555-8555-555555555555",
          containerId: input.containerId,
          userId: "00000000-0000-0000-0000-000000000001",
          type: input.type,
          source: TraceSource.APP,
          traceLevel: input.traceLevel,
          eventData: input.eventData,
          timestamp: "2026-06-24T18:00:00.000Z",
        }),
        submit: async () => 1,
      },
    };

    const epoch = await submitAppWorkflowTraceEvent({
      runtime,
      kind: "epoch",
      ...ref,
      correlationId: "sync-shaped-correlation",
      gameEventId: "epoch-event-1",
      causedByEventId: null,
      operation: "epoch.started",
      status: "started",
      metadata: { runId: "run-7", epochId: "epoch-3" },
    });
    const run = await submitAppWorkflowTraceEvent({
      runtime,
      kind: "run",
      ...ref,
      correlationId: "sync-phantom",
      gameEventId: "run-event-1",
      causedByEventId: null,
      operation: "run.started",
      status: "started",
      metadata: { runId: "run-real" },
    });

    expect(epoch.containerId).toBe(
      appEpochContainerId({ ...ref, runId: "run-7", epochId: "epoch-3" }),
    );
    expect(epoch.containers.map((container) => container.id)).toEqual([
      appRootContainerId(ref),
      appRunContainerId({ ...ref, runId: "run-7" }),
      appEpochContainerId({ ...ref, runId: "run-7", epochId: "epoch-3" }),
    ]);
    expect(run.containerId).toBe(appRunContainerId({ ...ref, runId: "run-real" }));
    expect(contexts[1].metadata.runId).toBe("run-real");
  });

  test("upserts non-agent workflow phase containers and emits app events", async () => {
    const ref = { gameId: "melee", sessionId: "run-1" };
    const upsertedContexts: unknown[] = [];
    const traceInputs: unknown[] = [];
    const submittedTraceEvents: unknown[] = [];
    const runtime = {
      upsertSpawnContainers: async (context: unknown) => {
        upsertedContexts.push(context);
      },
      traceWriter: {
        createAppEvent: (input: any) => {
          traceInputs.push(input);
          return {
            eventId: "55555555-5555-5555-8555-555555555555",
            containerId: input.containerId!,
            userId: "00000000-0000-0000-0000-000000000001",
            type: input.type,
            source: TraceSource.APP,
            traceLevel: input.traceLevel ?? TraceLevel.PROCESSING,
            eventData: input.eventData,
            timestamp: input.timestamp ?? "2026-06-24T18:00:00.000Z",
          };
        },
        submit: async (event: unknown) => {
          submittedTraceEvents.push(event);
          return 1;
        },
      },
    };
    const linkage = {
      correlationId: "run-1",
      gameEventId: "game-event-1",
      causedByEventId: null,
    };

    const sync = await submitAppWorkflowTraceEvent({
      runtime,
      kind: "sync",
      gameId: ref.gameId,
      sessionId: ref.sessionId,
      operation: "syncSession",
      status: "started",
      workingDir: "/repo",
      ...linkage,
    });
    const setup = await submitAppWorkflowTraceEvent({
      runtime,
      kind: "sync-intake",
      gameId: ref.gameId,
      sessionId: ref.sessionId,
      operation: "syncProjectIntake",
      status: "completed",
      workingDir: "/repo",
      metadata: { mergedPrs: [123] },
      ...linkage,
    });
    const baseline = await submitAppWorkflowTraceEvent({
      runtime,
      kind: "baseline",
      gameId: ref.gameId,
      sessionId: ref.sessionId,
      operation: "rebuildProductionBaseline",
      status: "completed",
      metadata: {
        baseSha: "abc123",
        correlation_id: "spoofed-correlation",
        game_event_id: "spoofed-event",
        caused_by_event_id: "semantic-token",
        appSessionId: "spoofed-app-session",
        containerId: "spoofed-container",
        containerKind: "worker",
        gameId: "spoofed-game",
        sessionId: "spoofed-session",
      },
      ...linkage,
    });
    const intakeKnowledge = await submitAppWorkflowTraceEvent({
      runtime,
      kind: "intake-knowledge",
      gameId: ref.gameId,
      sessionId: ref.sessionId,
      prId: "2764",
      operation: "prepare.intake.knowledge",
      status: "completed",
      metadata: { outputPath: "/state/knowledge-intake/pr-2764.json" },
      ...linkage,
    });
    const publication = await submitAppWorkflowTraceEvent({
      runtime,
      kind: "pr-publication",
      gameId: ref.gameId,
      sessionId: ref.sessionId,
      prId: "draft-1",
      operation: "openPrForSlice",
      status: "started",
      metadata: { branch: "pr/demo", prId: "spoofed-pr" },
      ...linkage,
    });

    expect(sync.containerId).toBe(appSyncContainerId(ref));
    expect(setup.containerId).toBe(appSyncIntakeContainerId(ref));
    expect(baseline.containerId).toBe(appBaselineContainerId(ref));
    expect(intakeKnowledge.containerId).toBe(
      appIntakeKnowledgeContainerId({ ...ref, prId: "2764" }),
    );
    expect(publication.containerId).toBe(
      appPrPublicationContainerId({ ...ref, prId: "draft-1" }),
    );
    expect(upsertedContexts).toHaveLength(5);
    expect(submittedTraceEvents).toHaveLength(5);
    expect(new Set(
      (submittedTraceEvents as Array<{ eventId: string }>).map((event) => event.eventId),
    ).size).toBe(5);
    expect((upsertedContexts[0] as any).containerLineage.map((container: NewContainer) => container.id)).toEqual([
      appRootContainerId(ref),
      appSyncContainerId(ref),
    ]);
    expect((upsertedContexts[1] as any).containerLineage.map((container: NewContainer) => container.id)).toEqual([
      appRootContainerId(ref),
      appPrepareContainerId(ref),
      appSyncIntakeContainerId(ref),
    ]);
    expect((upsertedContexts[1] as any).containerLineage.map((container: NewContainer) => container.label)).toEqual([
      "Cycle run-1",
      "Prepare",
      "Sync Intake",
    ]);
    expect((upsertedContexts[2] as any).containerLineage.map((container: NewContainer) => container.phase)).toEqual([
      "session",
      "prepare",
      "baseline",
    ]);
    expect((upsertedContexts[2] as any).containerLineage[0].metadata).not.toHaveProperty("baseSha");
    expect((upsertedContexts[2] as any).containerLineage[1].metadata).not.toHaveProperty("baseSha");
    expect((upsertedContexts[2] as any).containerLineage[2].metadata).toMatchObject({
      baseSha: "abc123",
    });
    expect((upsertedContexts[3] as any).containerLineage.map((container: NewContainer) => container.id)).toEqual([
      appRootContainerId(ref),
      appPrepareContainerId(ref),
      appIntakeContainerId(ref),
      appIntakeItemContainerId({ ...ref, prId: "2764" }),
      appIntakeKnowledgeContainerId({ ...ref, prId: "2764" }),
    ]);
    expect((upsertedContexts[4] as any).containerLineage.map((container: NewContainer) => container.id)).toEqual([
      appRootContainerId(ref),
      appPrContainerId({ ...ref, prId: "draft-1" }),
      appPrPublicationContainerId({ ...ref, prId: "draft-1" }),
    ]);
    expect((upsertedContexts[2] as any).containerLineage.at(-1).metadata).toMatchObject({
      appSessionId: appAppSessionId(ref),
      containerId: appBaselineContainerId(ref),
      containerKind: "baseline",
      gameId: "melee",
      sessionId: "run-1",
      correlation_id: "run-1",
      game_event_id: "game-event-1",
      caused_by_event_id: null,
    });
    expect((upsertedContexts[4] as any).containerLineage.at(-1).metadata).toMatchObject({
      prId: "draft-1",
      gameId: "melee",
      sessionId: "run-1",
    });
    expect(traceInputs).toMatchObject([
      {
        type: "melee:sync_started",
        containerId: appSyncContainerId(ref),
        eventData: {
          phase: "sync",
          operation: "syncSession",
          status: "started",
        },
      },
      {
        type: "melee:setup_completed",
        containerId: appSyncIntakeContainerId(ref),
        eventData: {
          phase: "setup",
          operation: "syncProjectIntake",
          status: "completed",
          mergedPrs: [123],
          // Sync's kernel/game-event join: without this the sync event log
          // renders with no trace behind it, which is how sync ran for its
          // whole life before it had a producer for this container kind.
          correlation_id: "run-1",
          game_event_id: "game-event-1",
          caused_by_event_id: null,
        },
      },
      {
        type: "melee:baseline_completed",
        containerId: appBaselineContainerId(ref),
        eventData: {
          phase: "baseline",
          operation: "rebuildProductionBaseline",
          status: "completed",
          baseSha: "abc123",
        },
      },
      {
        type: "melee:knowledge_intake_completed",
        containerId: appIntakeKnowledgeContainerId({ ...ref, prId: "2764" }),
        eventData: {
          phase: "knowledge-intake",
          operation: "prepare.intake.knowledge",
          status: "completed",
          prId: "2764",
          outputPath: "/state/knowledge-intake/pr-2764.json",
        },
      },
      {
        type: "melee:publication_started",
        containerId: appPrPublicationContainerId({ ...ref, prId: "draft-1" }),
        eventData: {
          phase: "publication",
          operation: "openPrForSlice",
          status: "started",
          prId: "draft-1",
          branch: "pr/demo",
        },
      },
    ]);
    for (const input of traceInputs as Array<{ eventData: Record<string, unknown> }>) {
      expect(input.eventData).toMatchObject({
        gameId: "melee",
        sessionId: "run-1",
        appSessionId: appAppSessionId(ref),
        correlation_id: "run-1",
        game_event_id: "game-event-1",
        caused_by_event_id: null,
      });
    }
  });

  test("workflow traces and spawn contexts agree on Sync lane lineages", async () => {
    const ref = { gameId: "melee", sessionId: "cycle-1" };
    const runtime = {
      upsertSpawnContainers: async () => undefined,
      traceWriter: {
        createAppEvent: (input: any) => ({
          eventId: "55555555-5555-5555-8555-555555555555",
          containerId: input.containerId,
          userId: "00000000-0000-0000-0000-000000000001",
          type: input.type,
          source: TraceSource.APP,
          traceLevel: input.traceLevel,
          eventData: input.eventData,
          timestamp: "2026-06-24T18:00:00.000Z",
        }),
        submit: async () => 1,
      },
    };
    const linkage = {
      correlationId: "sync-1",
      gameEventId: "game-event-parity",
      causedByEventId: null,
    };
    const intakeTrace = await submitAppWorkflowTraceEvent({
      runtime,
      kind: "intake-knowledge",
      ...ref,
      prId: "2764",
      operation: "intakeKnowledge",
      ...linkage,
    });
    const intakeSpawn = createAppKernelSpawnContext({
      kind: "intake-knowledge",
      ...ref,
      runId: "sync-1",
      prId: "2764",
      itemId: "pr-2764",
    });
    const knowledgeTrace = await submitAppWorkflowTraceEvent({
      runtime,
      kind: "knowledge-job",
      ...ref,
      operation: "curateKnowledge",
      metadata: { jobKey: "batch-7", jobKind: "Curator review", runId: "sync-1" },
      ...linkage,
    });
    const knowledgeSpawn = createAppKernelSpawnContext({
      kind: "knowledge-curation",
      ...ref,
      runId: "sync-1",
      jobId: "batch-7",
      jobKind: "Curator review",
    });
    const identity = (containers: NewContainer[]) =>
      containers.map(({ id, parentContainerId }) => ({ id, parentContainerId }));

    expect(intakeTrace.containerId).toBe(
      appSyncWorkflowIntakeKnowledgeContainerId(ref, "sync-1", "2764"),
    );
    expect(identity(intakeTrace.containers)).toEqual(
      identity(intakeSpawn.containerLineage ?? []),
    );
    expect(identity(knowledgeTrace.containers)).toEqual(
      identity(knowledgeSpawn.containerLineage ?? []),
    );
    for (const lineage of [
      intakeTrace.containers,
      knowledgeTrace.containers,
      intakeSpawn.containerLineage ?? [],
      knowledgeSpawn.containerLineage ?? [],
    ]) {
      expect(lineage.map((container) => container.id)).toContain(
        appSyncWorkflowContainerId(ref, "sync-1"),
      );
      expect(lineage.map((container) => container.id)).not.toContain(
        `${appRootContainerId(ref)}:prepare`,
      );
    }
  });

  test("files each sync mirror into a disjoint workflow tree", async () => {
    const ref = { gameId: "melee", sessionId: "cycle-1" };
    const runtime = {
      upsertSpawnContainers: async () => undefined,
      traceWriter: {
        createAppEvent: (input: any) => ({
          eventId: "55555555-5555-5555-8555-555555555555",
          containerId: input.containerId,
          userId: "00000000-0000-0000-0000-000000000001",
          type: input.type,
          source: TraceSource.APP,
          traceLevel: input.traceLevel,
          eventData: input.eventData,
          timestamp: "2026-06-24T18:00:00.000Z",
        }),
        submit: async () => 1,
      },
    };
    const emit = (
      input: Omit<Parameters<typeof submitAppWorkflowTraceEvent>[0], "runtime" | "gameId" | "sessionId">,
    ) => submitAppWorkflowTraceEvent({ runtime, ...ref, ...input });

    const first = await emit({
      kind: "sync-intake",
      correlationId: "sync-aaaaaaaa-bbbb",
      gameEventId: "event-first",
      causedByEventId: null,
      operation: "sync.ingest",
    });
    const second = await emit({
      kind: "sync-intake",
      correlationId: "command-second",
      gameEventId: "event-second",
      causedByEventId: null,
      operation: "sync.ingest",
      metadata: { syncId: "sync-cccccccc-dddd" },
    });
    const knowledge = await emit({
      kind: "knowledge-job",
      correlationId: "knowledge-job-1",
      gameEventId: "event-knowledge",
      causedByEventId: null,
      operation: "knowledge.absorb",
      metadata: {
        runId: "sync-aaaaaaaa-bbbb",
        jobKey: "corpus-1",
        jobKind: "Corpus",
      },
    });
    const operatorKnowledge = await emit({
      kind: "knowledge-job",
      correlationId: "operator-backfill",
      gameEventId: "event-operator",
      causedByEventId: null,
      operation: "knowledge.backfill",
      metadata: { runId: "manual-backfill", jobKey: "corpus-1" },
    });

    expect(first.containerId).toBe(
      appSyncWorkflowContainerId(ref, "sync-aaaaaaaa-bbbb"),
    );
    expect(second.containerId).toBe(
      appSyncWorkflowContainerId(ref, "sync-cccccccc-dddd"),
    );
    expect(first.containerId).not.toBe(second.containerId);
    expect(knowledge.containers.map((container) => container.id)).toEqual([
      appRootContainerId(ref),
      appSyncWorkflowContainerId(ref, "sync-aaaaaaaa-bbbb"),
      appSyncWorkflowKnowledgeContainerId(ref, "sync-aaaaaaaa-bbbb"),
      appSyncWorkflowKnowledgeJobContainerId(
        ref,
        "sync-aaaaaaaa-bbbb",
        "corpus-1",
      ),
    ]);
    expect(operatorKnowledge.containers.map((container) => container.id)).toEqual([
      appRootContainerId(ref),
      appRunKnowledgeContainerId({ ...ref, runId: "manual-backfill" }),
      appRunKnowledgeJobContainerId({ ...ref, runId: "manual-backfill", jobKey: "corpus-1" }),
    ]);
  });

  test("hangs PR handoff and QA containers off the PR container", async () => {
    const ref = { gameId: "melee", sessionId: "run-1" };
    const upsertedContexts: any[] = [];
    const runtime = {
      upsertSpawnContainers: async (context: unknown) => {
        upsertedContexts.push(context);
      },
      traceWriter: {
        createAppEvent: (input: any) => ({
          eventId: "55555555-5555-5555-8555-555555555555",
          containerId: input.containerId!,
          userId: "00000000-0000-0000-0000-000000000001",
          type: input.type,
          source: TraceSource.APP,
          traceLevel: input.traceLevel ?? TraceLevel.PROCESSING,
          eventData: input.eventData,
          timestamp: "2026-06-24T18:00:00.000Z",
        }),
        submit: async () => 1,
      },
    };
    const linkage = {
      correlationId: "run-1",
      gameEventId: "game-event-1",
      causedByEventId: null,
    };

    const handoff = await submitAppWorkflowTraceEvent({
      runtime,
      kind: "pr-handoff",
      gameId: ref.gameId,
      sessionId: ref.sessionId,
      prId: "draft-1",
      operation: "handOffPrToReview",
      status: "started",
      ...linkage,
    });
    const qa = await submitAppWorkflowTraceEvent({
      runtime,
      kind: "pr-qa",
      gameId: ref.gameId,
      sessionId: ref.sessionId,
      prId: "draft-1",
      operation: "runPrQa",
      status: "completed",
      ...linkage,
    });

    const prId = appPrContainerId({ ...ref, prId: "draft-1" });
    expect(handoff.containerId).toBe(
      appPrHandoffContainerId({ ...ref, prId: "draft-1" }),
    );
    expect(qa.containerId).toBe(appPrQaContainerId({ ...ref, prId: "draft-1" }));
    expect(handoff.containers.map((container) => container.id)).toEqual([
      appRootContainerId(ref),
      prId,
      handoff.containerId,
    ]);
    expect(qa.containers.map((container) => container.id)).toEqual([
      appRootContainerId(ref),
      prId,
      qa.containerId,
    ]);
    // The parent must be a container the same upsert carries, or the child is
    // an orphan the viewer cannot place.
    for (const submitted of [handoff, qa]) {
      const ids = new Set(submitted.containers.map((container) => container.id));
      for (const container of submitted.containers) {
        if (!container.parentContainerId) continue;
        expect(ids.has(container.parentContainerId)).toBe(true);
      }
    }
    expect(handoff.containers.at(-1)?.phase).toBe("handoff");
    expect(qa.containers.at(-1)?.phase).toBe("qa");
    expect(upsertedContexts).toHaveLength(2);
  });
});

describe("kernel runtime composition", () => {
  test("registers the app, upserts spawn containers, and persists trace events through injected ports", async () => {
    const registrations: NewKernelRegistration[] = [];
    const containers: NewContainer[] = [];
    const traceEvents: unknown[] = [];
    const runtime = await createAppKernelRuntime({
      db: {},
      config: {
        workingDir: "/repo",
        appBaseUrl: "http://localhost:8787",
      },
      ensureSchema: false,
      upsertRegistration: async (_db, data) => {
        registrations.push(data);
        return registrationRow(data);
      },
      upsertContainer: async (_db, data) => {
        containers.push(data);
        return data as Container;
      },
      insertTraceEvents: async (_db, events) => {
        traceEvents.push(...events);
        return events.length;
      },
      listRows: async () => [],
    });
    const context = createAppKernelSpawnContext({
      kind: "worker",
      gameId: "melee",
      sessionId: "run-1",
      runId: "run-1",
      epochId: 2,
      claimId: "claim-A",
      targetId: "target-A",
      workingDir: "/repo",
    });

    await runtime.upsertSpawnContainers(context);
    await runtime.traceWriter.submitAppEvent({
      appSessionId: context.appSessionId ?? "",
      containerId: context.containerId,
      type: "melee:runtime_smoke",
      eventData: { ok: true },
    });
    await runtime.close();

    expect(registrations[0]).toMatchObject({
      kernelId: MELEE_KERNEL_ID,
      appBaseUrl: "http://localhost:8787",
    });
    expect(containers.map((container) => container.id)).toEqual(
      (context.containerLineage ?? []).map((container) => container.id),
    );
    expect(containers.at(-1)).toMatchObject({
      id: context.containerId,
      phase: "worker",
      workingDir: "/repo",
    });
    expect(traceEvents).toHaveLength(1);
  });
});

describe("read API service", () => {
  test("maps raw kernel rows to viewer-core trace session DTOs", async () => {
    const rows = fixtureRows();
    const identities: string[] = [];
    const options: KernelTraceReadOptions[] = [];
    const service = createAppKernelTraceReadService({
      resolveIdentity: (id) => `container-for-${id}`,
      readRows: async (containerId, opts) => {
        identities.push(containerId);
        options.push(opts);
        return rows;
      },
      listRows: async () => [rows],
    });

    const detail = await service.getContainerTrace("session-id", {
      after: "2026-06-24T18:01:00.000Z",
      limit: 10,
    });
    const list = await service.listSessionContainers?.({ after: null, limit: 5 });

    expect(identities[0]).toBe("container-for-session-id");
    expect(options[0]).toEqual({
      after: "2026-06-24T18:01:00.000Z",
      limit: 10,
    });
    expect(detail?.session).toMatchObject({
      id: "melee:root",
      containerId: "melee:root",
      kind: "session",
      label: "Game session live",
      topic: "Melee session",
    });
    expect(detail?.containers).toHaveLength(2);
    expect(detail?.pi_sessions[0]).toMatchObject({
      id: "22222222-2222-5222-8222-222222222222",
      eventCount: 2,
    });
    expect(detail?.agent_runs[0]).toMatchObject({
      id: "33333333-3333-5333-8333-333333333333",
      trigger: "system",
      usageInputTokens: 10,
    });
    expect(detail?.events[0]).toMatchObject({
      eventId: "44444444-4444-5444-8444-444444444444",
      source: TraceSource.APP,
    });
    expect(list?.trace_sessions[0]).toMatchObject({
      id: "melee:root",
      containerId: "melee:root",
      kind: "session",
      piSessionCount: 1,
      eventCount: 1,
      latestEventAt: "2026-06-24T18:02:00.000Z",
    });
  });
});

describe("kernel wrapper", () => {
  test("delegates spawn calls to the provided adapter", async () => {
    const calls: unknown[] = [];
    const kernel = createAppKernel({
      spawnAgent: async (name: string, prompt: string, ctx: unknown, opts: unknown) => {
        calls.push({ name, prompt, ctx, opts });
        return { ok: true, name };
      },
    });

    const result = await kernel.spawnAgent(
      "worker",
      "prompt",
      { appSessionId: "11111111-1111-5111-8111-111111111111" },
      { model: "gpt-5" },
    );

    expect(kernel.id).toBe(MELEE_KERNEL_ID);
    expect(result).toEqual({ ok: true, name: "worker" });
    expect(calls).toEqual([
      {
        name: "worker",
        prompt: "prompt",
        ctx: { appSessionId: "11111111-1111-5111-8111-111111111111" },
        opts: { model: "gpt-5" },
      },
    ]);
  });
});

describe("kernel Pi runtime bridge", () => {
  test("routes dry-run PiRunOptions through the Melee kernel boundary and app trace events", async () => {
    const calls: unknown[] = [];
    const traceInputs: unknown[] = [];
    const upsertedContexts: unknown[] = [];
    const runner = createAppKernelPiAgentRunner({
      runPiAgent: async (options) => {
        calls.push(options);
        return {
          sessionId: "pi-session-1",
          sessionDir: "/repo/.pi-sessions/worker",
          outputPath: "/out/worker.txt",
          systemPromptPath: "/out/worker.system.md",
          userPromptPath: "/out/worker.user.md",
          rawText: "{\"checkpoint_note\":\"progress\"}",
          dryRun: true,
        };
      },
    });
    const options: AppKernelPiRunOptions = {
      role: "worker",
      cwd: "/repo",
      outputDir: "/out",
      dryRun: true,
      prompt: {
        systemPrompt: "worker system prompt",
        userPrompt: "worker user prompt",
        systemTemplatePath: "apps/server/src/core/agent-catalog/agents/running/worker/agent.ts",
        userTemplatePath: "apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts",
      },
      kernelContext: {
        appSessionId: "11111111-1111-5111-8111-111111111111",
        containerId: "melee:worker",
        phase: "worker",
        workingDir: "/repo",
      },
      kernelRuntime: {
        upsertSpawnContainers: async (context) => {
          upsertedContexts.push(context);
        },
        traceWriter: {
          submitAppEvent: async (input) => {
            traceInputs.push(input);
            return {
              eventId: `event-${traceInputs.length}`,
              containerId: input.containerId!,
              userId: "00000000-0000-0000-0000-000000000001",
              type: input.type as any,
              source: TraceSource.APP,
              traceLevel: input.traceLevel ?? TraceLevel.PROCESSING,
              eventData: input.eventData,
              timestamp: "2026-06-24T18:00:00.000Z",
            };
          },
        },
      },
    };

    const result = await runner(options);

    expect(result.sessionId).toBe("pi-session-1");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      role: "worker",
      cwd: "/repo",
      outputDir: "/out",
      prompt: {
        systemPrompt: "worker system prompt",
        userPrompt: "worker user prompt",
      },
      customSessionEntries: [
        {
          customType: "agent-kernel:session-binding",
          data: {
            appSessionId: "11111111-1111-5111-8111-111111111111",
            containerId: "melee:worker",
            phase: "worker",
            agentName: "worker",
            role: "worker",
          },
        },
      ],
      piLifecycleCustomType: "agent-kernel:pi-lifecycle",
    });
    expect(upsertedContexts).toHaveLength(1);
    expect(upsertedContexts[0]).toMatchObject({
      appSessionId: "11111111-1111-5111-8111-111111111111",
      containerId: "melee:worker",
    });
    expect(traceInputs).toHaveLength(2);
    expect(traceInputs[0]).toMatchObject({
      appSessionId: "11111111-1111-5111-8111-111111111111",
      containerId: "melee:worker",
      type: MELEE_AGENT_SPAWN_STARTED_EVENT,
      agentId: "worker",
    });
    expect(traceInputs[1]).toMatchObject({
      appSessionId: "11111111-1111-5111-8111-111111111111",
      containerId: "melee:worker",
      type: MELEE_AGENT_SPAWN_COMPLETED_EVENT,
      agentId: "worker",
      eventData: {
        sessionId: "pi-session-1",
        status: "dry_run",
      },
    });
  });

  test("assembles rendered context and short turn for resolver-aware dry runs", async () => {
    const calls: PiRunOptions[] = [];
    const contextResolver = {
      loaders: [
        {
          kind: "worker-packet",
          ref: "worker-packet",
          content: "<task>Use the packet.</task>",
        },
      ],
      assemble: (loaded: ReadonlyArray<{ content: string }>) =>
        loaded.map((input) => input.content).join("\n"),
    };
    const runner = createAppKernelPiAgentRunner({
      toKernelParsedAgentFromBundle: (entry, bundle) => ({
        parsed: {
          config: {
            name: entry.name,
            description: "",
            model: "codex-lb/gpt-5.5",
            tools: [],
            disallowedTools: [],
            variables: {},
          },
          body: bundle.systemPrompt,
        },
        userPrompt: "Use the injected worker context.",
        contextResolver,
      }),
      runPiAgent: async (options) => {
        calls.push(options);
        return {
          sessionId: "pi-session-1",
          sessionDir: "/repo/.pi-sessions/worker",
          outputPath: "/out/worker.txt",
          systemPromptPath: "/out/worker.system.md",
          userPromptPath: "/out/worker.user.md",
          rawText: "{\"checkpoint_note\":\"progress\"}",
          dryRun: true,
        };
      },
    });

    await runner({
      role: "worker",
      cwd: "/repo",
      outputDir: "/out",
      dryRun: true,
      prompt: {
        systemPrompt: "worker system prompt",
        userPrompt: "Use the injected worker context.",
        systemTemplatePath: "apps/server/src/core/agent-catalog/agents/running/worker/agent.ts",
        userTemplatePath: "apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts",
        kernelContext: {
          renderedContext: "full rendered worker context",
          turnPrompt: "Use the injected worker context.",
          inputs: [
            {
              loaderKind: "worker-packet",
              inputRef: "worker-packet",
              content: "<task>Use the packet.</task>",
            },
          ],
        },
      },
      kernelContext: {
        appSessionId: "11111111-1111-5111-8111-111111111111",
        containerId: "melee:worker",
        phase: "worker",
        workingDir: "/repo",
      },
      kernelRuntime: {
        traceWriter: {
          submitAppEvent: async (input) => ({
            eventId: "event-1",
            containerId: input.containerId!,
            userId: "00000000-0000-0000-0000-000000000001",
            type: input.type as any,
            source: TraceSource.APP,
            traceLevel: input.traceLevel ?? TraceLevel.PROCESSING,
            eventData: input.eventData,
            timestamp: "2026-06-24T18:00:00.000Z",
          }),
        },
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].prompt.userPrompt).toBe("full rendered worker context\n\nUse the injected worker context.");
  });

  test("rejects non-dry spawns when the kernel createSpawnAgent path is unavailable", async () => {
    const calls: unknown[] = [];
    const runner = createAppKernelPiAgentRunner({
      runPiAgent: async (options) => {
        calls.push(options);
        return {
          sessionId: "pi-session-1",
          sessionDir: "/repo/.pi-sessions/worker",
          outputPath: "/out/worker.txt",
          systemPromptPath: "/out/worker.system.md",
          userPromptPath: "/out/worker.user.md",
          rawText: "{}",
          dryRun: false,
        };
      },
    });

    await expect(
      runner({
        role: "worker",
        cwd: "/repo",
        outputDir: "/out",
        dryRun: false,
        prompt: {
          systemPrompt: "worker system prompt",
          userPrompt: "worker user prompt",
          systemTemplatePath: "apps/server/src/core/agent-catalog/agents/running/worker/agent.ts",
          userTemplatePath: "apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts",
        },
        kernelContext: {
          appSessionId: "11111111-1111-5111-8111-111111111111",
          containerId: "melee:worker",
          phase: "worker",
          workingDir: "/repo",
        },
        kernelRuntime: {
          traceWriter: {
            submitAppEvent: async (input) => ({
              eventId: "event-1",
              containerId: input.containerId!,
              userId: "00000000-0000-0000-0000-000000000001",
              type: input.type as any,
              source: TraceSource.APP,
              traceLevel: input.traceLevel ?? TraceLevel.PROCESSING,
              eventData: input.eventData,
              timestamp: "2026-06-24T18:00:00.000Z",
            }),
          },
        },
      }),
    ).rejects.toThrow("Non-dry app agent spawns must use kernel createSpawnAgent");
    expect(calls).toHaveLength(0);
  });

  test("passes a bundle without kernel context unchanged through kernel createSpawnAgent", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "melee-kernel-spawn-"));
    const outputDir = join(tempDir, "out");
    const transcriptEventTypes = [
      EventType.AGENT_SESSION_START,
      EventType.USER_MESSAGE,
      EventType.ASSISTANT_MESSAGE,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_END,
      EventType.PI_AGENT_START,
      EventType.PI_AGENT_END,
      EventType.PI_TURN_START,
      EventType.PI_TURN_END,
    ];
    const traceInputs: unknown[] = [];
    const submittedTraceEvents: unknown[] = [];
    const kernelCalls: unknown[] = [];
    const bindings: unknown[] = [];
    const runner = createAppKernelPiAgentRunner({
      runPiAgent: async () => {
        throw new Error("direct Pi runner should not be called for kernel strategy");
      },
      createKernelSpawnAgent: (adapters) => {
        return async (name, prompt, _ctx, opts) => {
          const parsed = adapters.loadAgent(name);
          const binding = adapters.createAppSessionBinding?.(opts ?? {});
          for (const [index, type] of transcriptEventTypes.entries()) {
            opts?.traceWriter?.submit({
              eventId: `kernel-event-${index}`,
              containerId: opts.containerId!,
              userId: "00000000-0000-0000-0000-000000000001",
              type,
              source: TraceSource.KERNEL,
              traceLevel: TraceLevel.PROCESSING,
              eventData: {},
              timestamp: "2026-06-24T18:00:00.000Z",
            });
          }
          bindings.push(binding);
          kernelCalls.push({
            name,
            prompt,
            opts,
            parsed,
            toolFactoryCount: adapters.buildToolFactories(parsed.config).length,
          });
          return {
            responseText: "{\"checkpoint_note\":\"progress\",\"source\":\"kernel\"}",
            aborted: false,
            session: {
              sessionId: "22222222-2222-5222-8222-222222222222",
              messages: [],
            } as any,
          };
        };
      },
    });

    const result = await runner({
      role: "worker",
      cwd: tempDir,
      outputDir,
      dryRun: false,
      prompt: {
        systemPrompt: "worker system prompt",
        userPrompt: "worker user prompt",
        systemTemplatePath: "apps/server/src/core/agent-catalog/agents/running/worker/agent.ts",
        userTemplatePath: "apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts",
      },
      kernelSpawnStrategy: "kernel",
      kernelContext: {
        appSessionId: "11111111-1111-5111-8111-111111111111",
        containerId: "melee:worker",
        phase: "worker",
        workingDir: tempDir,
        metadata: {
          sessionId: "run-1",
          stateDir: join(tempDir, "state"),
          piAgentDir: join(tempDir, ".pi-agent"),
        },
      },
      kernelRuntime: {
        db: {},
        config: {
          markerConfig: createAppKernelBridgeConfig({ workingDir: tempDir }).markerConfig,
          piSessionsDir: join(tempDir, ".pi-sessions"),
        },
        upsertSpawnContainers: async () => {},
        traceWriter: {
          submit: async (event) => {
            submittedTraceEvents.push(event);
            return 1;
          },
          submitAppEvent: async (input) => {
            traceInputs.push(input);
            return {
              eventId: `event-${traceInputs.length}`,
              containerId: input.containerId!,
              userId: "00000000-0000-0000-0000-000000000001",
              type: input.type as any,
              source: TraceSource.APP,
              traceLevel: input.traceLevel ?? TraceLevel.PROCESSING,
              eventData: input.eventData,
              timestamp: "2026-06-24T18:00:00.000Z",
            };
          },
        },
      },
    });

    expect(result).toMatchObject({
      sessionId: "22222222-2222-5222-8222-222222222222",
      sessionDir: join(tempDir, ".pi-sessions", "melee:worker", "worker"),
      rawText: "{\"checkpoint_note\":\"progress\",\"source\":\"kernel\"}",
      dryRun: false,
    });
    expect(await Bun.file(result.systemPromptPath).text()).toBe("worker system prompt");
    expect(await Bun.file(result.userPromptPath).text()).toBe("worker user prompt");
    expect(await Bun.file(result.outputPath).text()).toBe("{\"checkpoint_note\":\"progress\",\"source\":\"kernel\"}");
    expect(kernelCalls).toHaveLength(1);
    expect(kernelCalls[0]).toMatchObject({
      name: "worker",
      prompt: "worker user prompt",
      opts: {
        appSessionId: "11111111-1111-5111-8111-111111111111",
        appSessionSlug: "run-1",
        captureRequestSnapshots: false,
        containerId: "melee:worker",
        displayLabel: "worker",
        phase: "worker",
        workingDir: tempDir,
        piSessionsDir: join(tempDir, ".pi-sessions"),
        piAgentDir: join(tempDir, ".pi-agent"),
        trigger: "system",
      },
      parsed: {
        body: "worker system prompt",
      },
    });
    expect(bindings[0]).toMatchObject({
      customType: "agent-kernel:session-binding",
      data: {
        appSessionId: "11111111-1111-5111-8111-111111111111",
        containerId: "melee:worker",
        agentName: "worker",
      },
    });
    expect(traceInputs).toHaveLength(2);
    expect(
      submittedTraceEvents.map((event) => (event as { type: string }).type),
    ).toEqual(transcriptEventTypes);
  });

  test("normalizes live-kernel provider throws as artifact-backed failures", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "melee-kernel-provider-error-"));
    const outputDir = join(tempDir, "out");
    const traceInputs: unknown[] = [];
    const runner = createAppKernelPiAgentRunner({
      runPiAgent: async () => {
        throw new Error("direct Pi runner should not be called for kernel strategy");
      },
      createKernelSpawnAgent: () => {
        return async () => {
          throw new Error(
            "context_length_exceeded: Your input exceeds the context window of this model",
          );
        };
      },
    });

    const result = await runner({
      role: "worker",
      cwd: tempDir,
      outputDir,
      dryRun: false,
      prompt: {
        systemPrompt: "worker system prompt",
        userPrompt: "worker user prompt",
        systemTemplatePath: "apps/server/src/core/agent-catalog/agents/running/worker/agent.ts",
        userTemplatePath: "apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts",
      },
      kernelSpawnStrategy: "kernel",
      kernelContext: {
        appSessionId: "11111111-1111-5111-8111-111111111111",
        containerId: "melee:worker",
        phase: "worker",
        workingDir: tempDir,
      },
      kernelRuntime: {
        db: {},
        config: {
          markerConfig: createAppKernelBridgeConfig({ workingDir: tempDir }).markerConfig,
          piSessionsDir: join(tempDir, ".pi-sessions"),
        },
        traceWriter: {
          submitAppEvent: async (input) => {
            traceInputs.push(input);
            return {
              eventId: `event-${traceInputs.length}`,
              containerId: input.containerId!,
              userId: "00000000-0000-0000-0000-000000000001",
              type: input.type as any,
              source: TraceSource.APP,
              traceLevel: input.traceLevel ?? TraceLevel.PROCESSING,
              eventData: input.eventData,
              timestamp: "2026-06-24T18:00:00.000Z",
            };
          },
        },
      },
    });

    expect(result.providerError).toBe("context_length_exceeded: Your input exceeds the context window of this model");
    expect(result.failed).toBe(true);
    expect(await Bun.file(result.outputPath).text()).toContain("[Pi provider error]");
    expect(traceInputs).toHaveLength(2);
    expect(traceInputs[1]).toMatchObject({
      type: MELEE_AGENT_SPAWN_FAILED_EVENT,
      eventData: {
        status: "failed",
      },
    });
    expect(((traceInputs[1] as Record<string, any>).eventData.error as string)).toContain("context_length_exceeded");
  });

  test("leaves resolver-backed context injection to the live kernel", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "melee-kernel-context-"));
    const outputDir = join(tempDir, "out");
    const loadedResolvers: unknown[] = [];
    const kernelPrompts: string[] = [];
    const renderedContext = [
      "<slice_diff>",
      "diff --git a/src/example.c b/src/example.c",
      "</slice_diff>",
      "<lint_findings>",
      "Avoid unnecessary casts.",
      "</lint_findings>",
    ].join("\n");
    const contextResolver = {
      loaders: [
        {
          kind: "worker-packet",
          ref: "worker-packet",
          content: "<task>Use the packet.</task>",
        },
      ],
      assemble: (loaded: ReadonlyArray<{ content: string }>) =>
        loaded.map((input) => input.content).join("\n"),
    };
    const runner = createAppKernelPiAgentRunner({
      runPiAgent: async () => {
        throw new Error("direct Pi runner should not be called for kernel strategy");
      },
      toKernelParsedAgentFromBundle: (entry, bundle) => ({
        parsed: {
          config: {
            name: entry.name,
            description: "",
            model: "codex-lb/gpt-5.5",
            tools: [],
            disallowedTools: [],
            variables: {},
          },
          body: bundle.systemPrompt,
        },
        userPrompt: "Use the injected reviewer context.",
        contextResolver,
      }),
      createKernelSpawnAgent: (adapters) => {
        return async (name, prompt, _ctx, opts) => {
          kernelPrompts.push(prompt);
          const resolver = await adapters.loadAgentResolver(name);
          loadedResolvers.push(resolver);
          return {
            responseText: "{\"checkpoint_note\":\"progress\",\"source\":\"kernel\"}",
            aborted: false,
            session: {
              sessionId: "22222222-2222-5222-8222-222222222222",
              messages: [],
            } as any,
          };
        };
      },
    });

    const result = await runner({
      role: "pr-reviewer",
      cwd: tempDir,
      outputDir,
      dryRun: false,
      prompt: {
        systemPrompt: "reviewer system prompt",
        userPrompt: "full original reviewer user prompt",
        systemTemplatePath: "apps/server/src/core/agent-catalog/agents/pr/reviewer/agent.ts",
        userTemplatePath: "apps/server/src/core/agent-catalog/agents/pr/reviewer/prompt.ts",
        kernelContext: {
          renderedContext,
          turnPrompt: "Use the injected reviewer context.",
          inputs: [
            {
              loaderKind: "worker-packet",
              inputRef: "worker-packet",
              content: "<task>Review the packet.</task>",
            },
          ],
        },
      },
      kernelSpawnStrategy: "kernel",
      kernelContext: {
        appSessionId: "11111111-1111-5111-8111-111111111111",
        containerId: "melee:worker",
        phase: "worker",
        workingDir: tempDir,
      },
      kernelRuntime: {
        db: {},
        config: {
          markerConfig: createAppKernelBridgeConfig({ workingDir: tempDir }).markerConfig,
          piSessionsDir: join(tempDir, ".pi-sessions"),
        },
      },
    });

    expect(kernelPrompts).toEqual(["Use the injected reviewer context."]);
    expect(loadedResolvers).toHaveLength(1);
    expect(loadedResolvers[0]).toBe(contextResolver);
    expect(await Bun.file(result.systemPromptPath).text()).toBe("reviewer system prompt");
    expect(await Bun.file(result.userPromptPath).text()).toBe(
      "Use the injected reviewer context.",
    );
  });
});

describe("loader catalog", () => {
  test("registers the Melee session context loader with kernel default loaders", async () => {
    const catalog = createAppLoaderCatalog();
    expect(catalog.has("text")).toBeTrue();
    expect(catalog.has(MELEE_SESSION_CONTEXT_LOADER_KIND)).toBeTrue();

    const loader = catalog.get(MELEE_SESSION_CONTEXT_LOADER_KIND);
    const result = await loader.resolve(
      { kind: MELEE_SESSION_CONTEXT_LOADER_KIND },
      {
        cwd: "/repo",
        containerId: "melee:session",
        activeSessionDir: "/repo/session",
        sessionData: {
          appSessionId: "11111111-1111-5111-8111-111111111111",
          target: "ftMain",
        },
      },
    );

    expect(result.status).toBe("ok");
    expect(result.content).toContain("11111111-1111-5111-8111-111111111111");
    expect(result.content).toContain("ftMain");
  });
});
