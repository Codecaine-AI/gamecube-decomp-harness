import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type {
  AgentRun,
  Container,
  KernelRegistration,
  KernelTraceReadIdentity,
  KernelTraceReadOptions,
  KernelTraceReadRows,
  NewContainer,
  NewAgentRun,
  NewKernelRegistration,
  NewPiAgentSession,
  PiAgentSessionWithEventCount,
  TraceEventRow as KernelTraceEventRow,
} from "@agent-kernel/db";
import { EventType, TraceLevel, TraceSource } from "@agent-kernel/protocol";
import type { PiEvent } from "@agent-kernel/tailer";

import { createMeleeKernelBridgeConfig, MELEE_KERNEL_ID } from "./config.js";
import { createMeleeKernel } from "./kernel.js";
import { createMeleeLoaderCatalog, MELEE_SESSION_CONTEXT_LOADER_KIND } from "./loaders.js";
import { createMeleeKernelTraceReadService } from "./read-api.js";
import { upsertMeleeKernelRegistration } from "./registration.js";
import { createMeleeKernelRuntime } from "./runtime.js";
import {
  buildMeleeContainer,
  meleeAppSessionId,
  meleeBaselineContainerId,
  meleeIntakeContainerId,
  meleeIntakeItemContainerId,
  meleeIntakeKnowledgeContainerId,
  meleeIntakePostmortemContainerId,
  meleePrepareContainerId,
  meleePrContainerId,
  meleePrPublicationContainerId,
  meleePostmortemContainerId,
  meleeRootContainerId,
  meleeSyncIntakeContainerId,
  meleeWorkerContainerId,
} from "./session-mapping.js";
import { createMeleeKernelSpawnContext } from "./spawn-context.js";
import {
  createMeleeKernelPiAgentRunner,
  MELEE_AGENT_SPAWN_COMPLETED_EVENT,
  MELEE_AGENT_SPAWN_FAILED_EVENT,
  MELEE_AGENT_SPAWN_STARTED_EVENT,
  type MeleeKernelPiRunOptions,
} from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import type { PiRunOptions } from "@server/infrastructure/agent-runtime/runtime";
import { createMeleeEventMapperOptions, createMeleeTailerConfig, createMeleeTraceTailer } from "./tailer.js";
import { createMeleeTraceWriter } from "./trace-writer.js";
import { MELEE_KERNEL_MANAGED_RUN_MARKER_FIELD } from "./spawn-agent.js";
import { submitMeleeWorkflowTraceEvent } from "./workflow-trace.js";

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
    parentContainerId: null,
    label: "Project session live",
    status: "running",
    workingDir: "/repo",
    worktreePath: null,
    phase: "run",
    phaseVocabulary: ["setup", "baseline", "run", "pr"],
    metadata: {
      appSessionId,
      appSessionSlug: "live",
      topic: "Melee session",
      appSessionType: "melee-project-session",
    },
    startedAt: "2026-06-24T18:00:00.000Z",
    completedAt: null,
    createdAt: "2026-06-24T18:00:00.000Z",
    updatedAt: "2026-06-24T18:10:00.000Z",
  };
  const childContainer: Container = {
    ...rootContainer,
    id: "melee:root:worker",
    parentContainerId: rootContainer.id,
    label: "Worker claim A",
    phase: "worker",
  };
  const piSession: PiAgentSessionWithEventCount = {
    id: "22222222-2222-5222-8222-222222222222",
    appSessionId,
    parentId: null,
    containerId: childContainer.id,
    phase: "worker",
    displayLabel: "Worker A",
    agentName: "worker",
    status: "running",
    model: "gpt-5",
    startedAt: "2026-06-24T18:01:00.000Z",
    completedAt: null,
    createdAt: "2026-06-24T18:01:00.000Z",
    updatedAt: "2026-06-24T18:02:00.000Z",
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
    runNumber: 1,
    status: "running",
    startedAt: "2026-06-24T18:01:00.000Z",
    completedAt: null,
    inputTokens: 10,
    outputTokens: 20,
    createdAt: "2026-06-24T18:01:00.000Z",
    updatedAt: "2026-06-24T18:02:00.000Z",
  };
  const event: KernelTraceEventRow = {
    id: "44444444-4444-5444-8444-444444444444",
    appSessionId,
    containerId: childContainer.id,
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
    const config = createMeleeKernelBridgeConfig({
      workingDir: "/repo",
      appBaseUrl: "http://127.0.0.1:5174",
      markerConfig: {
        sessionBinding: "melee:session-binding",
      },
      metadata: { environment: "test" },
    });

    const row = await upsertMeleeKernelRegistration({
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
    const ref = { projectId: "melee", sessionId: "session 2026/06/24" };
    const appSessionId = meleeAppSessionId(ref);
    const repeat = meleeAppSessionId({ ...ref });
    const other = meleeAppSessionId({ projectId: "melee", sessionId: "next" });

    expect(appSessionId).toMatch(UUID_RE);
    expect(repeat).toBe(appSessionId);
    expect(other).not.toBe(appSessionId);
    expect(meleeRootContainerId(ref)).toBe(`melee:${appSessionId}:session`);
    expect(
      meleeWorkerContainerId({
        ...ref,
        runId: "run/live",
        epochId: 3,
        claimId: "claim A",
        targetId: "ftMain",
      }),
    ).toBe(
      meleeWorkerContainerId({
        ...ref,
        runId: "run/live",
        epochId: 3,
        claimId: "claim A",
      }),
    );

    const container = buildMeleeContainer({ kind: "session", ref, workingDir: "/repo" });
    expect(container.id).toBe(meleeRootContainerId(ref));
    expect(container.parentContainerId).toBeNull();
    expect(container.metadata).toMatchObject({
      appSessionId,
      containerKind: "session",
      projectId: "melee",
    });
  });

  test("maps PR publication containers under the PR tree with publication phase", () => {
    const ref = { projectId: "melee", sessionId: "run-1" };
    const container = buildMeleeContainer({
      kind: "pr-publication",
      ref,
      metadata: { prId: "draft-1", branch: "pr/demo" },
      workingDir: "/repo",
    });

    expect(container.id).toBe(meleePrPublicationContainerId({ ...ref, prId: "draft-1" }));
    expect(container.parentContainerId).toBe(meleePrContainerId({ ...ref, prId: "draft-1" }));
    expect(container.phase).toBe("publication");
    expect(container.metadata).toMatchObject({
      appSessionId: meleeAppSessionId(ref),
      containerKind: "pr-publication",
      prId: "draft-1",
      branch: "pr/demo",
    });
  });

  test("maps prepare intake containers under the Prepare tree", () => {
    const ref = { projectId: "melee", sessionId: "session-1" };
    const item = buildMeleeContainer({
      kind: "intake-item",
      ref,
      metadata: { prId: "2764" },
      workingDir: "/repo",
    });
    const postmortem = buildMeleeContainer({
      kind: "intake-postmortem",
      ref,
      metadata: { prId: "2764" },
      workingDir: "/repo",
    });
    const knowledge = buildMeleeContainer({
      kind: "intake-knowledge",
      ref,
      metadata: { prId: "2764" },
      workingDir: "/repo",
    });

    expect(item.id).toBe(meleeIntakeItemContainerId({ ...ref, prId: "2764" }));
    expect(item.parentContainerId).toBe(meleeIntakeContainerId(ref));
    expect(postmortem.id).toBe(meleeIntakePostmortemContainerId({ ...ref, prId: "2764" }));
    expect(postmortem.parentContainerId).toBe(item.id);
    expect(knowledge.id).toBe(meleeIntakeKnowledgeContainerId({ ...ref, prId: "2764" }));
    expect(knowledge.parentContainerId).toBe(item.id);
    expect(knowledge.phase).toBe("knowledge-intake");
  });
});

describe("spawn context mapping", () => {
  test("builds worker spawn context with app session and claim container identity", () => {
    const context = createMeleeKernelSpawnContext({
      kind: "worker",
      projectId: "melee",
      sessionId: "run-1",
      runId: "run-1",
      epochId: 2,
      claimId: "claim-A",
      targetId: "target-A",
      workingDir: "/repo",
      metadata: { attemptIndex: 1 },
    });

    expect(context.appSessionId).toBe(
      meleeAppSessionId({ projectId: "melee", sessionId: "run-1" }),
    );
    expect(context.containerId).toBe(
      meleeWorkerContainerId({
        projectId: "melee",
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
      projectId: "melee",
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
    const context = createMeleeKernelSpawnContext({
      kind: "postmortem",
      projectId: "melee",
      sessionId: "run-1",
      runId: "run-1",
      epochId: 2,
      claimId: "claim-A",
      targetId: "target-A",
      workingDir: "/repo",
    });

    expect(context.containerId).toBe(
      meleePostmortemContainerId({
        projectId: "melee",
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
      projectId: "melee",
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

  test("builds prepare intake agent spawn contexts under the PR intake item", () => {
    const context = createMeleeKernelSpawnContext({
      kind: "intake-postmortem",
      projectId: "melee",
      sessionId: "session-1",
      runId: "session-1",
      itemId: "pr-2764",
      prId: "2764",
      targetId: "pr-2764",
      workingDir: "/repo",
    });

    expect(context.appSessionId).toBe(
      meleeAppSessionId({ projectId: "melee", sessionId: "session-1" }),
    );
    expect(context.containerId).toBe(
      meleeIntakePostmortemContainerId({
        projectId: "melee",
        sessionId: "session-1",
        prId: "2764",
      }),
    );
    expect(context.phase).toBe("postmortem");
    expect(context.metadata).toMatchObject({
      containerKind: "intake-postmortem",
      projectId: "melee",
      sessionId: "session-1",
      runId: "session-1",
      itemId: "pr-2764",
      prId: "2764",
      targetId: "pr-2764",
    });
    expect(context.containerLineage?.map((container) => container.id)).toEqual([
      meleeRootContainerId({ projectId: "melee", sessionId: "session-1" }),
      meleePrepareContainerId({ projectId: "melee", sessionId: "session-1" }),
      meleeIntakeContainerId({ projectId: "melee", sessionId: "session-1" }),
      meleeIntakeItemContainerId({ projectId: "melee", sessionId: "session-1", prId: "2764" }),
      meleeIntakePostmortemContainerId({ projectId: "melee", sessionId: "session-1", prId: "2764" }),
    ]);
  });

  test("builds PR review context under the PR container tree", () => {
    const context = createMeleeKernelSpawnContext({
      kind: "pr-review",
      projectId: "melee",
      runId: "run-1",
      prId: "run-1",
      reviewId: "slice-001",
    });

    expect(context.appSessionId).toBe(
      meleeAppSessionId({ projectId: "melee", sessionId: "run-1" }),
    );
    expect(context.containerId).toContain(":pr:");
    expect(context.containerId).toContain(":review:");
    expect(context.phase).toBe("pr-review");
    expect(context.metadata).toMatchObject({
      containerKind: "pr-review",
      projectId: "melee",
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
    const writer = createMeleeTraceWriter({
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
      appSessionId: "11111111-1111-5111-8111-111111111111",
      containerId: "melee:root:run",
      source: TraceSource.APP,
      type: "melee:scheduler_decision",
      traceLevel: TraceLevel.DEBUG,
      eventData: { admittedTargets: 256 },
    });
  });
});

describe("workflow trace helper", () => {
  test("upserts non-agent workflow phase containers and emits app events", async () => {
    const ref = { projectId: "melee", sessionId: "run-1" };
    const upsertedContexts: unknown[] = [];
    const traceInputs: unknown[] = [];
    const runtime = {
      upsertSpawnContainers: async (context: unknown) => {
        upsertedContexts.push(context);
      },
      traceWriter: {
        submitAppEvent: async (input: any) => {
          traceInputs.push(input);
          return {
            eventId: `event-${traceInputs.length}`,
            appSessionId: input.appSessionId,
            userId: "00000000-0000-0000-0000-000000000001",
            type: input.type,
            source: TraceSource.APP,
            traceLevel: input.traceLevel ?? TraceLevel.PROCESSING,
            eventData: input.eventData,
            timestamp: input.timestamp ?? "2026-06-24T18:00:00.000Z",
            containerId: input.containerId,
          };
        },
      },
    };

    const prepare = await submitMeleeWorkflowTraceEvent({
      runtime,
      kind: "prepare",
      projectId: ref.projectId,
      sessionId: ref.sessionId,
      operation: "prepareSession",
      status: "started",
      workingDir: "/repo",
    });
    const setup = await submitMeleeWorkflowTraceEvent({
      runtime,
      kind: "sync-intake",
      projectId: ref.projectId,
      sessionId: ref.sessionId,
      operation: "syncProjectIntake",
      status: "completed",
      workingDir: "/repo",
      metadata: { mergedPrs: [123] },
    });
    const baseline = await submitMeleeWorkflowTraceEvent({
      runtime,
      kind: "baseline",
      projectId: ref.projectId,
      sessionId: ref.sessionId,
      operation: "rebuildProductionBaseline",
      status: "completed",
      metadata: { baseSha: "abc123" },
    });
    const intakeKnowledge = await submitMeleeWorkflowTraceEvent({
      runtime,
      kind: "intake-knowledge",
      projectId: ref.projectId,
      sessionId: ref.sessionId,
      prId: "2764",
      operation: "prepare.intake.knowledge",
      status: "completed",
      metadata: { outputPath: "/state/knowledge-intake/pr-2764.json" },
    });
    const publication = await submitMeleeWorkflowTraceEvent({
      runtime,
      kind: "pr-publication",
      projectId: ref.projectId,
      sessionId: ref.sessionId,
      prId: "draft-1",
      operation: "openPrForSlice",
      status: "started",
      metadata: { branch: "pr/demo" },
    });

    expect(prepare.containerId).toBe(meleePrepareContainerId(ref));
    expect(setup.containerId).toBe(meleeSyncIntakeContainerId(ref));
    expect(baseline.containerId).toBe(meleeBaselineContainerId(ref));
    expect(intakeKnowledge.containerId).toBe(
      meleeIntakeKnowledgeContainerId({ ...ref, prId: "2764" }),
    );
    expect(publication.containerId).toBe(
      meleePrPublicationContainerId({ ...ref, prId: "draft-1" }),
    );
    expect(upsertedContexts).toHaveLength(5);
    expect((upsertedContexts[0] as any).containerLineage.map((container: NewContainer) => container.id)).toEqual([
      meleeRootContainerId(ref),
      meleePrepareContainerId(ref),
    ]);
    expect((upsertedContexts[1] as any).containerLineage.map((container: NewContainer) => container.id)).toEqual([
      meleeRootContainerId(ref),
      meleePrepareContainerId(ref),
      meleeSyncIntakeContainerId(ref),
    ]);
    expect((upsertedContexts[1] as any).containerLineage.map((container: NewContainer) => container.label)).toEqual([
      "Project session run-1",
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
      meleeRootContainerId(ref),
      meleePrepareContainerId(ref),
      meleeIntakeContainerId(ref),
      meleeIntakeItemContainerId({ ...ref, prId: "2764" }),
      meleeIntakeKnowledgeContainerId({ ...ref, prId: "2764" }),
    ]);
    expect((upsertedContexts[4] as any).containerLineage.map((container: NewContainer) => container.id)).toEqual([
      meleeRootContainerId(ref),
      meleePrContainerId({ ...ref, prId: "draft-1" }),
      meleePrPublicationContainerId({ ...ref, prId: "draft-1" }),
    ]);
    expect(traceInputs).toMatchObject([
      {
        type: "melee:prepare_started",
        containerId: meleePrepareContainerId(ref),
        eventData: {
          phase: "prepare",
          operation: "prepareSession",
          status: "started",
        },
      },
      {
        type: "melee:setup_completed",
        containerId: meleeSyncIntakeContainerId(ref),
        eventData: {
          phase: "setup",
          operation: "syncProjectIntake",
          status: "completed",
          mergedPrs: [123],
        },
      },
      {
        type: "melee:baseline_completed",
        containerId: meleeBaselineContainerId(ref),
        eventData: {
          phase: "baseline",
          operation: "rebuildProductionBaseline",
          status: "completed",
          baseSha: "abc123",
        },
      },
      {
        type: "melee:knowledge_intake_completed",
        containerId: meleeIntakeKnowledgeContainerId({ ...ref, prId: "2764" }),
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
        containerId: meleePrPublicationContainerId({ ...ref, prId: "draft-1" }),
        eventData: {
          phase: "publication",
          operation: "openPrForSlice",
          status: "started",
          prId: "draft-1",
          branch: "pr/demo",
        },
      },
    ]);
  });
});

describe("kernel runtime composition", () => {
  test("registers the app, upserts spawn containers, and persists trace events through injected ports", async () => {
    const registrations: NewKernelRegistration[] = [];
    const containers: NewContainer[] = [];
    const traceEvents: unknown[] = [];
    const runtime = await createMeleeKernelRuntime({
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
    const context = createMeleeKernelSpawnContext({
      kind: "worker",
      projectId: "melee",
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

describe("tailer wrapper", () => {
  test("uses registration marker names for mapper options and config paths", () => {
    const config = createMeleeKernelBridgeConfig({
      workingDir: "/repo",
      markerConfig: {
        sessionBinding: "melee:bind",
        lifecycle: "melee:lifecycle",
        subagentLink: "melee:subagent-link",
      },
    });

    const tailerConfig = createMeleeTailerConfig(config, { batchSize: 32 });
    const mapperOptions = createMeleeEventMapperOptions(config);

    expect(tailerConfig.watchDir).toBe("/repo/.pi-sessions");
    expect(tailerConfig.snapshotPath).toBe(
      "/repo/.decomp-orchestrator-state/agent-kernel-tailer-cursors.json",
    );
    expect(tailerConfig.batchSize).toBe(32);
    expect(mapperOptions.sessionBinding?.customType).toBe("melee:bind");
    expect(mapperOptions.lifecycleCustomType).toBe("melee:lifecycle");
    expect(mapperOptions.subagentLinkCustomType).toBe("melee:subagent-link");
  });

  test("buffers Pi JSONL events until binding, then upserts session and run before trace insert", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "melee-kernel-tailer-"));
    const appSessionId = "11111111-1111-5111-8111-111111111111";
    const piSessionId = "22222222-2222-5222-8222-222222222222";
    const operations: string[] = [];
    const piSessions: NewPiAgentSession[] = [];
    const agentRuns: NewAgentRun[] = [];
    const traceEvents: unknown[] = [];
    const tailer = createMeleeTraceTailer({
      db: {},
      config: {
        workingDir: tempDir,
        piSessionsDir: join(tempDir, ".pi-sessions"),
        cursorSnapshotPath: join(tempDir, "cursors.json"),
      },
      tailer: {
        batchSize: 100,
        flushIntervalMs: 60_000,
        maxRetries: 1,
      },
      upsertPiAgentSession: async (_db, data) => {
        operations.push("pi-session");
        piSessions.push(data);
        return data as any;
      },
      upsertAgentRun: async (_db, data) => {
        operations.push("agent-run");
        agentRuns.push(data);
        return data as any;
      },
      insertTraceEvents: async (_db, events) => {
        operations.push("trace-events");
        traceEvents.push(...events);
        return events.length;
      },
      sleep: async () => {},
    });
    const filePath = join(tempDir, ".pi-sessions", "worker", "session.jsonl");
    const preBindingEvents: PiEvent[] = [
      {
        type: "session",
        version: 1,
        id: piSessionId,
        timestamp: "2026-06-24T18:00:00.000Z",
        cwd: "/repo",
      },
      {
        type: "model_change",
        id: "model-1",
        parentId: null,
        timestamp: "2026-06-24T18:00:01.000Z",
        provider: "codex-lb",
        modelId: "gpt-5.5",
      },
      {
        type: "message",
        id: "message-1",
        parentId: null,
        timestamp: "2026-06-24T18:00:02.000Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "match ftDemo_KernelViewerSample" }],
          timestamp: Date.parse("2026-06-24T18:00:02.000Z"),
        },
      },
    ];

    tailer.ingestEvents(filePath, preBindingEvents);
    await tailer.flush();

    expect(traceEvents).toHaveLength(0);
    expect(piSessions).toHaveLength(0);
    expect(agentRuns).toHaveLength(0);

    tailer.ingestEvents(filePath, [
      {
        type: "custom",
        customType: "agent-kernel:session-binding",
        id: "binding-1",
        parentId: null,
        timestamp: "2026-06-24T18:00:03.000Z",
        data: {
          appSessionId,
          appSessionSlug: "run-1",
          appSessionDir: "/state/runs/run-1",
          containerId: "melee:worker",
          phase: "worker",
          agentName: "worker",
          displayLabel: "Worker claim A",
          runNumber: 2,
        },
      },
    ]);
    await tailer.flush();

    expect(operations).toEqual(["pi-session", "agent-run", "trace-events"]);
    expect(piSessions[0]).toMatchObject({
      id: piSessionId,
      appSessionId,
      agentName: "worker",
      containerId: "melee:worker",
      phase: "worker",
      displayLabel: "Worker claim A",
      model: "gpt-5.5",
      status: "running",
    });
    expect(agentRuns[0]).toMatchObject({
      piSessionId,
      agentName: "worker",
      containerId: "melee:worker",
      phase: "worker",
      displayLabel: "Worker claim A",
      runNumber: 2,
      status: "running",
    });
    expect(agentRuns[0]?.id).toMatch(UUID_RE);
    expect(traceEvents).toHaveLength(2);
    expect(traceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          appSessionId,
          piSessionUuid: piSessionId,
          containerId: "melee:worker",
        }),
      ]),
    );
    expect(tailer.status()).toMatchObject({
      fileCount: 1,
      piSessionCount: 1,
      mappedEventCount: 2,
      insertedEventCount: 2,
    });
  });

  test("does not synthesize an agent run for kernel-managed session bindings", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "melee-kernel-tailer-managed-"));
    const appSessionId = "11111111-1111-5111-8111-111111111111";
    const piSessionId = "22222222-2222-5222-8222-222222222222";
    const operations: string[] = [];
    const piSessions: NewPiAgentSession[] = [];
    const agentRuns: NewAgentRun[] = [];
    const traceEvents: unknown[] = [];
    const tailer = createMeleeTraceTailer({
      db: {},
      config: {
        workingDir: tempDir,
        piSessionsDir: join(tempDir, ".pi-sessions"),
        cursorSnapshotPath: join(tempDir, "cursors.json"),
      },
      tailer: {
        batchSize: 100,
        flushIntervalMs: 60_000,
        maxRetries: 1,
      },
      upsertPiAgentSession: async (_db, data) => {
        operations.push("pi-session");
        piSessions.push(data);
        return data as any;
      },
      upsertAgentRun: async (_db, data) => {
        operations.push("agent-run");
        agentRuns.push(data);
        return data as any;
      },
      insertTraceEvents: async (_db, events) => {
        operations.push("trace-events");
        traceEvents.push(...events);
        return events.length;
      },
      sleep: async () => {},
    });
    const filePath = join(tempDir, ".pi-sessions", "worker", "session.jsonl");

    tailer.ingestEvents(filePath, [
      {
        type: "session",
        version: 1,
        id: piSessionId,
        timestamp: "2026-06-24T18:00:00.000Z",
        cwd: "/repo",
      },
      {
        type: "model_change",
        id: "model-1",
        parentId: null,
        timestamp: "2026-06-24T18:00:01.000Z",
        provider: "codex-lb",
        modelId: "gpt-5.5",
      },
      {
        type: "custom",
        customType: "agent-kernel:session-binding",
        id: "binding-1",
        parentId: null,
        timestamp: "2026-06-24T18:00:02.000Z",
        data: {
          appSessionId,
          containerId: "melee:worker",
          phase: "worker",
          agentName: "worker",
          displayLabel: "Worker claim A",
          [MELEE_KERNEL_MANAGED_RUN_MARKER_FIELD]: true,
        },
      },
      {
        type: "message",
        id: "message-1",
        parentId: null,
        timestamp: "2026-06-24T18:00:03.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "kernel-managed run event" }],
          timestamp: Date.parse("2026-06-24T18:00:03.000Z"),
        },
      },
    ]);
    await tailer.flush();

    expect(operations).toEqual(["pi-session", "trace-events"]);
    expect(piSessions[0]).toMatchObject({
      id: piSessionId,
      appSessionId,
      agentName: "worker",
      containerId: "melee:worker",
      phase: "worker",
    });
    expect(agentRuns).toHaveLength(0);
    expect(traceEvents).not.toHaveLength(0);
    expect(traceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          appSessionId,
          piSessionUuid: piSessionId,
          containerId: "melee:worker",
        }),
      ]),
    );
  });
});

describe("read API service", () => {
  test("maps raw kernel rows to viewer-core trace session DTOs", async () => {
    const rows = fixtureRows();
    const identities: KernelTraceReadIdentity[] = [];
    const options: KernelTraceReadOptions[] = [];
    const service = createMeleeKernelTraceReadService({
      resolveIdentity: (id) => ({ containerId: `container-for-${id}`, legacySessionId: id }),
      readRows: async (identity, opts) => {
        identities.push(identity);
        options.push(opts);
        return rows;
      },
      listRows: async () => [rows],
    });

    const detail = await service.getTraceSessionDetail("session-id", {
      after: "2026-06-24T18:01:00.000Z",
      limit: 10,
    });
    const list = await service.listTraceSessions?.({ after: null, limit: 5 });

    expect(identities[0]).toEqual({
      containerId: "container-for-session-id",
      legacySessionId: "session-id",
    });
    expect(options[0]).toEqual({
      after: "2026-06-24T18:01:00.000Z",
      limit: 10,
    });
    expect(detail?.session).toMatchObject({
      id: "11111111-1111-5111-8111-111111111111",
      containerId: "melee:root",
      appSessionSlug: "live",
      topic: "Melee session",
    });
    expect(detail?.containers).toHaveLength(2);
    expect(detail?.pi_sessions[0]).toMatchObject({
      id: "22222222-2222-5222-8222-222222222222",
      eventCount: 2,
    });
    expect(detail?.agent_runs[0]).toMatchObject({
      id: "33333333-3333-5333-8333-333333333333",
      runNumber: 1,
    });
    expect(detail?.events[0]).toMatchObject({
      id: "44444444-4444-5444-8444-444444444444",
      eventId: "44444444-4444-5444-8444-444444444444",
      source: TraceSource.APP,
    });
    expect(list?.trace_sessions[0]).toMatchObject({
      id: "11111111-1111-5111-8111-111111111111",
      containerId: "melee:root",
      piSessionCount: 1,
      eventCount: 1,
      latestEventAt: "2026-06-24T18:02:00.000Z",
    });
  });
});

describe("kernel wrapper", () => {
  test("delegates spawn calls to the provided adapter", async () => {
    const calls: unknown[] = [];
    const kernel = createMeleeKernel({
      spawnAgent: async (name, prompt, ctx, opts) => {
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
    const runner = createMeleeKernelPiAgentRunner({
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
    const options: MeleeKernelPiRunOptions = {
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
              appSessionId: input.appSessionId,
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
    const runner = createMeleeKernelPiAgentRunner({
      toKernelParsedAgentFromBundle: (entry, bundle) => ({
        parsed: {
          frontmatter: {
            name: entry.name,
            description: "",
            model: "codex-lb/gpt-5.5",
            tools: [],
            disallowed_tools: [],
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
            appSessionId: input.appSessionId,
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
    const runner = createMeleeKernelPiAgentRunner({
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
              appSessionId: input.appSessionId,
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
    ).rejects.toThrow("Non-dry Melee agent spawns must use kernel createSpawnAgent");
    expect(calls).toHaveLength(0);
  });

  test("can route a DB-backed non-dry spawn through kernel createSpawnAgent", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "melee-kernel-spawn-"));
    const outputDir = join(tempDir, "out");
    const traceInputs: unknown[] = [];
    const submittedTraceEvents: unknown[] = [];
    const kernelCalls: unknown[] = [];
    const bindings: unknown[] = [];
    const runner = createMeleeKernelPiAgentRunner({
      runPiAgent: async () => {
        throw new Error("direct Pi runner should not be called for kernel strategy");
      },
      createKernelSpawnAgent: (adapters) => {
        return async (name, prompt, _ctx, opts) => {
          const parsed = adapters.loadAgent(name);
          const binding = adapters.createAppSessionBinding?.(opts ?? {});
          bindings.push(binding);
          kernelCalls.push({
            name,
            prompt,
            opts,
            parsed,
            toolFactoryCount: adapters.buildToolFactories(parsed.frontmatter).length,
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
          markerConfig: createMeleeKernelBridgeConfig({ workingDir: tempDir }).markerConfig,
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
              appSessionId: input.appSessionId,
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
      sessionDir: join(tempDir, ".pi-sessions", "11111111-1111-5111-8111-111111111111", "worker"),
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
        containerId: "melee:worker",
        phase: "worker",
        workingDir: tempDir,
        piSessionsDir: join(tempDir, ".pi-sessions"),
        piAgentDir: join(tempDir, ".pi-agent"),
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
        [MELEE_KERNEL_MANAGED_RUN_MARKER_FIELD]: true,
      },
    });
    expect(traceInputs).toHaveLength(2);
    expect(submittedTraceEvents).toHaveLength(0);
  });

  test("surfaces kernel assistant error stop reasons as provider failures", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "melee-kernel-provider-error-"));
    const outputDir = join(tempDir, "out");
    const traceInputs: unknown[] = [];
    const runner = createMeleeKernelPiAgentRunner({
      runPiAgent: async () => {
        throw new Error("direct Pi runner should not be called for kernel strategy");
      },
      createKernelSpawnAgent: () => {
        return async () => ({
          responseText: "",
          aborted: false,
          session: {
            sessionId: "33333333-3333-5333-8333-333333333333",
            messages: [
              {
                role: "assistant",
                content: [],
                stopReason: "error",
                errorMessage: "context_length_exceeded: Your input exceeds the context window of this model",
              },
            ],
            dispose() {},
          } as any,
        });
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
          markerConfig: createMeleeKernelBridgeConfig({ workingDir: tempDir }).markerConfig,
          piSessionsDir: join(tempDir, ".pi-sessions"),
        },
        traceWriter: {
          submitAppEvent: async (input) => {
            traceInputs.push(input);
            return {
              eventId: `event-${traceInputs.length}`,
              appSessionId: input.appSessionId,
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
    expect(result.failed).toBeUndefined();
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

  test("passes converted prompt-bundle context resolver into kernel createSpawnAgent", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "melee-kernel-context-"));
    const outputDir = join(tempDir, "out");
    const loadedResolvers: unknown[] = [];
    const kernelPrompts: string[] = [];
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
    const runner = createMeleeKernelPiAgentRunner({
      runPiAgent: async () => {
        throw new Error("direct Pi runner should not be called for kernel strategy");
      },
      toKernelParsedAgentFromBundle: (entry, bundle) => ({
        parsed: {
          frontmatter: {
            name: entry.name,
            description: "",
            model: "codex-lb/gpt-5.5",
            tools: [],
            disallowed_tools: [],
            variables: {},
          },
          body: bundle.systemPrompt,
        },
        userPrompt: "Use the injected worker context.",
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
      role: "worker",
      cwd: tempDir,
      outputDir,
      dryRun: false,
      prompt: {
        systemPrompt: "worker system prompt",
        userPrompt: "full original worker user prompt",
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
          markerConfig: createMeleeKernelBridgeConfig({ workingDir: tempDir }).markerConfig,
          piSessionsDir: join(tempDir, ".pi-sessions"),
        },
      },
    });

    expect(kernelPrompts).toEqual(["Use the injected worker context."]);
    expect(loadedResolvers).toHaveLength(1);
    expect(loadedResolvers[0]).toBe(contextResolver);
    expect(await Bun.file(result.systemPromptPath).text()).toBe("worker system prompt");
    expect(await Bun.file(result.userPromptPath).text()).toBe("Use the injected worker context.");
  });
});

describe("loader catalog", () => {
  test("registers the Melee session context loader with kernel default loaders", async () => {
    const catalog = createMeleeLoaderCatalog();
    expect(catalog.has("text")).toBeTrue();
    expect(catalog.has(MELEE_SESSION_CONTEXT_LOADER_KIND)).toBeTrue();

    const loader = catalog.get(MELEE_SESSION_CONTEXT_LOADER_KIND);
    const result = await loader.resolve(
      { kind: MELEE_SESSION_CONTEXT_LOADER_KIND },
      {
        cwd: "/repo",
        appSessionId: "11111111-1111-5111-8111-111111111111",
        activeSessionDir: "/repo/session",
        sessionData: { target: "ftMain" },
      },
    );

    expect(result.status).toBe("ok");
    expect(result.content).toContain("11111111-1111-5111-8111-111111111111");
    expect(result.content).toContain("ftMain");
  });
});
