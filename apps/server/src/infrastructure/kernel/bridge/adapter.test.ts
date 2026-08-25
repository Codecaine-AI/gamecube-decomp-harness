import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import type {
  AgentRun,
  Container,
  KernelTraceReadOptions,
  KernelTraceReadRows,
  NewContainer,
  NewAgentRun,
  NewPiAgentSession,
  PiAgentSessionWithEventCount,
  TraceEventRow as KernelTraceEventRow,
} from "@agent-kernel/db";
import { EventType, TraceLevel, TraceSource } from "@agent-kernel/protocol";
import type { PiEvent } from "@agent-kernel/kernel/transcript-recovery";

import { createMeleeKernelBridgeConfig, MELEE_KERNEL_ID } from "./config.js";
import { ensureKernelObservabilitySchema } from "./database.js";
import { createMeleeKernel } from "./kernel.js";
import { createMeleeLoaderCatalog, MELEE_SESSION_CONTEXT_LOADER_KIND } from "./loaders.js";
import { createMeleeKernelTraceReadService } from "./read-api.js";
import {
  upsertMeleeKernelRegistration,
  type KernelRegistration,
  type NewKernelRegistration,
} from "./registration.js";
import { createMeleeKernelRuntime } from "./runtime.js";
import {
  buildMeleeContainer,
  describeMeleeContainer,
  meleeAppSessionId,
  meleeBaselineContainerId,
  meleeEpochContainerId,
  meleePrHandoffContainerId,
  meleePrQaContainerId,
  meleePrRepairContainerId,
  meleePrReviewContainerId,
  meleePrSplitContainerId,
  meleeRunContainerId,
  meleeWorkerIntegrationContainerId,
  type MeleeContainerKind,
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
  meleeWorkflowTraceEventId,
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

describe("Postgres observability schema", () => {
  test("migrates the legacy schema before creating live-model indexes", async () => {
    const dialect = new PgDialect();
    const statements: string[] = [];
    await ensureKernelObservabilitySchema({
      async execute(query: SQL) {
        statements.push(dialect.sqlToQuery(query).sql);
      },
    });

    const combined = statements.join("\n");
    const migrationIndex = combined.indexOf("DO $migration$");
    const runIndex = combined.indexOf("CREATE INDEX IF NOT EXISTS idx_events_run");
    expect(migrationIndex).toBeGreaterThan(-1);
    expect(runIndex).toBeGreaterThan(migrationIndex);
    expect(combined).toContain("ALTER TABLE trace_events RENAME COLUMN id TO event_id");
    expect(combined).toContain("ALTER COLUMN run_number DROP NOT NULL");
    expect(combined).toContain("ALTER COLUMN pi_session_id TYPE TEXT");
    expect(combined).toContain("DROP CONSTRAINT IF EXISTS trace_events_pi_session_id_fkey");
    expect(combined).toContain("usage_input_tokens = COALESCE(usage_input_tokens, input_tokens, 0)");
    expect(combined).toContain("ADD CONSTRAINT pi_agent_sessions_container_id_fkey");
    expect(combined).toContain("CREATE TABLE IF NOT EXISTS prompt_revisions");
    expect(combined).toContain("CREATE TABLE IF NOT EXISTS trace_blobs");
  });

  test("skips all DDL when the schema-current probe passes", async () => {
    const dialect = new PgDialect();
    const statements: string[] = [];
    await ensureKernelObservabilitySchema({
      async execute(query: SQL) {
        statements.push(dialect.sqlToQuery(query).sql);
        return [
          {
            containers_kernel_id: true,
            trace_events_event_id_text: true,
            trace_events_container_id_not_null: true,
            agent_runs_parent_run_id_fkey: true,
            ix_agent_runs_parent_run_id: true,
          },
        ];
      },
    });

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("information_schema.columns");
    expect(statements[0]).toContain("ix_agent_runs_parent_run_id");
    expect(statements[0]).not.toContain("CREATE TABLE");
    expect(statements[0]).not.toContain("ALTER TABLE");
  });

  test("runs the full bootstrap when the probe reports a missing sentinel", async () => {
    const dialect = new PgDialect();
    const statements: string[] = [];
    await ensureKernelObservabilitySchema({
      async execute(query: SQL) {
        statements.push(dialect.sqlToQuery(query).sql);
        if (statements.length > 1) return [];
        return [
          {
            containers_kernel_id: true,
            trace_events_event_id_text: true,
            trace_events_container_id_not_null: true,
            agent_runs_parent_run_id_fkey: true,
            // The final bootstrap statement never ran; schema is not current.
            ix_agent_runs_parent_run_id: false,
          },
        ];
      },
    });

    const combined = statements.join("\n");
    expect(combined).toContain("CREATE TABLE IF NOT EXISTS containers");
    expect(combined).toContain("DO $migration$");
    expect(combined).toContain("CREATE INDEX IF NOT EXISTS ix_agent_runs_parent_run_id");
  });
});

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
    const ref = { gameId: "melee", sessionId: "session 2026/06/24" };
    const appSessionId = meleeAppSessionId(ref);
    const repeat = meleeAppSessionId({ ...ref });
    const other = meleeAppSessionId({ gameId: "melee", sessionId: "next" });

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
      gameId: "melee",
    });
  });

  test("maps PR publication containers under the PR tree with publication phase", () => {
    const ref = { gameId: "melee", sessionId: "run-1" };
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

  test("keeps bridge-owned container identity authoritative over caller metadata", () => {
    const ref = { gameId: "melee", sessionId: "session-real" };
    const container = buildMeleeContainer({
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
      appSessionId: meleeAppSessionId(ref),
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

    expect(meleeWorkflowTraceEventId(input)).toMatch(UUID_RE);
    expect(meleeWorkflowTraceEventId({ ...input })).toBe(
      meleeWorkflowTraceEventId(input),
    );
    expect(meleeWorkflowTraceEventId({ ...input, status: "failed" })).not.toBe(
      meleeWorkflowTraceEventId(input),
    );
  });

  test("maps prepare intake containers under the Prepare tree", () => {
    const ref = { gameId: "melee", sessionId: "session-1" };
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
      meleeAppSessionId({ gameId: "melee", sessionId: "run-1" }),
    );
    expect(context.containerId).toBe(
      meleeWorkerContainerId({
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
    const context = createMeleeKernelSpawnContext({
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
      meleePostmortemContainerId({
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

  test("builds prepare intake agent spawn contexts under the PR intake item", () => {
    const context = createMeleeKernelSpawnContext({
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
      meleeAppSessionId({ gameId: "melee", sessionId: "session-1" }),
    );
    expect(context.containerId).toBe(
      meleeIntakePostmortemContainerId({
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
      meleeRootContainerId({ gameId: "melee", sessionId: "session-1" }),
      meleePrepareContainerId({ gameId: "melee", sessionId: "session-1" }),
      meleeIntakeContainerId({ gameId: "melee", sessionId: "session-1" }),
      meleeIntakeItemContainerId({ gameId: "melee", sessionId: "session-1", prId: "2764" }),
      meleeIntakePostmortemContainerId({ gameId: "melee", sessionId: "session-1", prId: "2764" }),
    ]);
  });

  test("builds PR review context under the PR container tree", () => {
    const context = createMeleeKernelSpawnContext({
      kind: "pr-review",
      gameId: "melee",
      runId: "run-1",
      prId: "run-1",
      reviewId: "slice-001",
    });

    expect(context.appSessionId).toBe(
      meleeAppSessionId({ gameId: "melee", sessionId: "run-1" }),
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
  };

  // Every kind, so a new MeleeContainerKind that forgets its describe case is
  // caught here as well as by the (now total) switch failing to compile.
  const ALL_KINDS: MeleeContainerKind[] = [
    "session",
    "prepare",
    "sync-intake",
    "intake",
    "intake-item",
    "intake-postmortem",
    "intake-knowledge",
    "pr-index",
    "knowledge-refresh",
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
    const root = meleeRootContainerId(ref);
    const ids = new Set<string>();
    for (const kind of ALL_KINDS) {
      const descriptor = describeMeleeContainer(kind, ref, fullMetadata);
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
    const expected: Array<[MeleeContainerKind, string]> = [
      ["run", meleeRunContainerId(runRef)],
      ["epoch", meleeEpochContainerId(epochRef)],
      ["worker", meleeWorkerContainerId(claimRef)],
      ["worker-integration", meleeWorkerIntegrationContainerId(claimRef)],
      ["postmortem", meleePostmortemContainerId(claimRef)],
      ["pr-handoff", meleePrHandoffContainerId(prRef)],
      ["pr-qa", meleePrQaContainerId(prRef)],
      ["pr-split", meleePrSplitContainerId(prRef)],
      ["pr-review", meleePrReviewContainerId({ ...prRef, reviewId: "slice-001" })],
      ["pr-repair", meleePrRepairContainerId({ ...prRef, repairId: "repair-7" })],
    ];
    for (const [kind, id] of expected) {
      expect(describeMeleeContainer(kind, ref, fullMetadata).id).toBe(id);
    }
  });

  test("spawn contexts and the descriptor agree on id, label, parent and phase", () => {
    const cases: Array<{
      kind: MeleeContainerKind;
      spawn: Parameters<typeof createMeleeKernelSpawnContext>[0];
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
      const context = createMeleeKernelSpawnContext(testCase.spawn);
      const descriptor = describeMeleeContainer(testCase.kind, ref, testCase.metadata);
      const spawned = context.containerLineage?.at(-1);
      expect(context.containerId).toBe(descriptor.id);
      expect(spawned?.id).toBe(descriptor.id);
      expect(spawned?.label).toBe(descriptor.label);
      expect(spawned?.parentContainerId).toBe(descriptor.parentContainerId);
      expect(spawned?.phase).toBe(descriptor.phase);
    }
  });

  test("spawn lineage parents are the containers the lineage actually carries", () => {
    const context = createMeleeKernelSpawnContext({
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

    const prepare = await submitMeleeWorkflowTraceEvent({
      runtime,
      kind: "prepare",
      gameId: ref.gameId,
      sessionId: ref.sessionId,
      operation: "prepareSession",
      status: "started",
      workingDir: "/repo",
      ...linkage,
    });
    const setup = await submitMeleeWorkflowTraceEvent({
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
    const baseline = await submitMeleeWorkflowTraceEvent({
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
    const intakeKnowledge = await submitMeleeWorkflowTraceEvent({
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
    const publication = await submitMeleeWorkflowTraceEvent({
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
    expect(submittedTraceEvents).toHaveLength(5);
    expect(new Set(
      (submittedTraceEvents as Array<{ eventId: string }>).map((event) => event.eventId),
    ).size).toBe(5);
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
    expect((upsertedContexts[2] as any).containerLineage.at(-1).metadata).toMatchObject({
      appSessionId: meleeAppSessionId(ref),
      containerId: meleeBaselineContainerId(ref),
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
    for (const input of traceInputs as Array<{ eventData: Record<string, unknown> }>) {
      expect(input.eventData).toMatchObject({
        gameId: "melee",
        sessionId: "run-1",
        appSessionId: meleeAppSessionId(ref),
        correlation_id: "run-1",
        game_event_id: "game-event-1",
        caused_by_event_id: null,
      });
    }
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

    const handoff = await submitMeleeWorkflowTraceEvent({
      runtime,
      kind: "pr-handoff",
      gameId: ref.gameId,
      sessionId: ref.sessionId,
      prId: "draft-1",
      operation: "handOffPrToReview",
      status: "started",
      ...linkage,
    });
    const qa = await submitMeleeWorkflowTraceEvent({
      runtime,
      kind: "pr-qa",
      gameId: ref.gameId,
      sessionId: ref.sessionId,
      prId: "draft-1",
      operation: "runPrQa",
      status: "completed",
      ...linkage,
    });

    const prId = meleePrContainerId({ ...ref, prId: "draft-1" });
    expect(handoff.containerId).toBe(
      meleePrHandoffContainerId({ ...ref, prId: "draft-1" }),
    );
    expect(qa.containerId).toBe(meleePrQaContainerId({ ...ref, prId: "draft-1" }));
    expect(handoff.containers.map((container) => container.id)).toEqual([
      meleeRootContainerId(ref),
      prId,
      handoff.containerId,
    ]);
    expect(qa.containers.map((container) => container.id)).toEqual([
      meleeRootContainerId(ref),
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
    const kernelRunId = "33333333-3333-5333-8333-333333333333";
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
      upsertContainer: async (_db, data) => {
        operations.push("container");
        return data as any;
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
    const filePath = join(tempDir, ".pi-sessions", "worker", "cycle.jsonl");
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
          runId: kernelRunId,
          runNumber: 2,
        },
      },
    ]);
    await tailer.flush();

    expect(operations).toEqual(["container", "pi-session", "agent-run", "trace-events"]);
    expect(piSessions[0]).toMatchObject({
      id: piSessionId,
      agentName: "worker",
      containerId: "melee:worker",
      phase: "worker",
      displayLabel: "Worker claim A",
      model: "gpt-5.5",
      status: "active",
      createdAt: "2026-06-24T18:00:00.000Z",
    });
    expect(agentRuns[0]).toMatchObject({
      id: kernelRunId,
      piSessionId,
      agentName: "worker",
      containerId: "melee:worker",
      phase: "worker",
      displayLabel: "Worker claim A",
      trigger: "system",
      status: "running",
      startedAt: "2026-06-24T18:00:00.000Z",
    });
    expect(agentRuns[0]?.id).toMatch(UUID_RE);
    expect(traceEvents).toHaveLength(2);
    expect(traceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          appSessionId,
          piSessionUuid: piSessionId,
          containerId: "melee:worker",
          runId: kernelRunId,
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
      upsertContainer: async (_db, data) => {
        operations.push("container");
        return data as any;
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
    const filePath = join(tempDir, ".pi-sessions", "worker", "cycle.jsonl");

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

    expect(operations).toEqual(["container", "pi-session", "trace-events"]);
    expect(piSessions[0]).toMatchObject({
      id: piSessionId,
      agentName: "worker",
      containerId: "melee:worker",
      phase: "worker",
      status: "active",
      createdAt: "2026-06-24T18:00:00.000Z",
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
    const identities: string[] = [];
    const options: KernelTraceReadOptions[] = [];
    const service = createMeleeKernelTraceReadService({
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
    const kernel = createMeleeKernel({
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
    const runner = createMeleeKernelPiAgentRunner({
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
    ).rejects.toThrow("Non-dry Melee agent spawns must use kernel createSpawnAgent");
    expect(calls).toHaveLength(0);
  });

  test("passes a bundle without kernel context unchanged through kernel createSpawnAgent", async () => {
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
      },
    });
    expect((bindings[0] as { data?: Record<string, unknown> })?.data).not.toHaveProperty(
      MELEE_KERNEL_MANAGED_RUN_MARKER_FIELD,
    );
    expect(traceInputs).toHaveLength(2);
    expect(submittedTraceEvents).toHaveLength(0);
  });

  test("normalizes live-kernel provider throws as artifact-backed failures", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "melee-kernel-provider-error-"));
    const outputDir = join(tempDir, "out");
    const traceInputs: unknown[] = [];
    const runner = createMeleeKernelPiAgentRunner({
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
          markerConfig: createMeleeKernelBridgeConfig({ workingDir: tempDir }).markerConfig,
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
    const runner = createMeleeKernelPiAgentRunner({
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
          markerConfig: createMeleeKernelBridgeConfig({ workingDir: tempDir }).markerConfig,
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
    const catalog = createMeleeLoaderCatalog();
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
