import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { immediateTransaction, openState, type StateStore } from "@server/core/orchestrator-state";
import { createCycle } from "@server/core/cycle/store.js";
import { listGameEvents, type JsonObject } from "@server/core/harness-state/events.js";
import { validateRegisteredGameEvent } from "@server/core/harness-state/event-registry.js";
import { initializeHarnessState, requestDispatch } from "@server/core/harness-state/lease.js";
import { createRun } from "@server/core/cycle-runtime/run-state/runs.js";
import {
  cancelSync,
  cancelSyncKnowledgeJobs,
  completeSyncKnowledgeIngest,
  enqueueSyncKnowledgeJobs,
  getSyncState,
  listSyncKnowledgeJobs,
  markSyncRecoveryRequired,
  publishSyncKnowledgeInTransaction,
  queryCanonicalSyncKnowledge,
  readCanonicalSyncKnowledge,
  readSyncKnowledgeManifest,
  recordSyncRequested,
  recoverConfirmedOrphanSyncIngest,
  recoverSync,
  stageSyncKnowledge,
  syncKnowledgeManifestPath,
  syncKnowledgeRoot,
  syncActionSpanId,
  syncStagingPaths,
  transitionSync,
  waitSyncKnowledgeJobsForRecovery,
  type SyncEngineContext,
  type SyncIntake,
  type SyncKnowledgeProcessors,
  type SyncState,
} from "./index.js";

const stores: StateStore[] = [];
const tempDirs: string[] = [];

interface SyncFixture {
  leaseId: string;
  root: string;
  stateDir: string;
  store: StateStore;
  sync: SyncState;
}

function fixture(intake: SyncIntake, syncId = "sync-knowledge"): SyncFixture {
  const root = mkdtempSync(join(tmpdir(), "sync-knowledge-"));
  tempDirs.push(root);
  const stateDir = resolve(root, "state");
  const store = openState(stateDir);
  stores.push(store);
  initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
  createCycle(store.db, {
    actor: "operator",
    baseSha: "cycle-head",
    id: "cycle:melee",
    gameId: "melee",
    cycleUuid: "cycle-melee",
  });
  let sync = recordSyncRequested(store, {
    gameId: "melee",
    cycleUuid: "cycle-melee",
    intake,
    syncId,
    commandId: `${syncId}:requested`,
    actor: "external_observer",
    correlationId: syncId,
    occurredAt: "2026-08-13T18:00:00.000Z",
  });
  const lease = requestDispatch(store, {
    actor: "operator",
    commandId: `${syncId}:lease-acquired`,
    correlationId: syncId,
    kind: "sync",
    gameId: sync.game_id,
    workflowId: sync.sync_id,
    reason: "sync knowledge test fixture",
  });
  if (lease.queued) throw new Error("Expected sync lease acquisition");
  sync = transitionSync(store, syncId, {
    actor: "operator",
    commandId: `${syncId}:started`,
    correlationId: syncId,
    expectedRevision: sync.revision,
    occurredAt: "2026-08-13T18:01:00.000Z",
    patch: { status: "ingesting" },
  });
  return { leaseId: lease.leaseId, root, stateDir, store, sync };
}

function knowledgeOnlyIntake(corpusBatchIds = ["corpus-2026-08"]): SyncIntake {
  return {
    upstream_from: "upstream-same",
    upstream_to: "upstream-same",
    merged_pr_ids: [],
    corpus_batch_ids: corpusBatchIds,
    knowledge_only: true,
  };
}

function movingIntake(): SyncIntake {
  return {
    upstream_from: "upstream-old",
    upstream_to: "upstream-new",
    merged_pr_ids: ["pr-9", "pr-2"],
    corpus_batch_ids: ["corpus-b"],
    knowledge_only: false,
  };
}

function deterministicProcessors(calls: string[] = []): SyncKnowledgeProcessors {
  return {
    async processMergedPr({ job }) {
      calls.push(`${job.sourceKind}:${job.sourceId}`);
      return { z: 2, a: { source: job.sourceId, facts: ["one", "two"] } };
    },
    async processCorpus({ job }) {
      calls.push(`${job.sourceKind}:${job.sourceId}`);
      return { records: [{ text: "corpus fact", id: job.sourceId }], accepted: true };
    },
  };
}

async function publishKnowledgeOnlyFixture(
  current: SyncFixture,
  command = "command-publish-fixture-knowledge",
): Promise<void> {
  const completed = await completeSyncKnowledgeIngest({
    store: current.store,
    stateDir: current.stateDir,
    syncId: current.sync.sync_id,
    expectedRevision: current.sync.revision,
    commandId: `${command}:ingest`,
    processors: deterministicProcessors(),
    revalidateOwnership: () => {},
  });
  const publishing = transitionSync(current.store, completed.sync.sync_id, {
    actor: "operator",
    commandId: `${command}:publishing`,
    correlationId: completed.sync.sync_id,
    expectedRevision: completed.sync.revision,
    patch: { status: "publishing" },
  });
  immediateTransaction(current.store.db, () =>
    publishSyncKnowledgeInTransaction(current.store.db, {
      syncId: publishing.sync_id,
      gameId: publishing.game_id,
      manifest: completed.manifest,
      actor: "runner",
      commandId: command,
      correlationId: publishing.sync_id,
      traceId: publishing.trace_id,
      spanId: syncActionSpanId(command),
    }));
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  return (result.stdout ?? "").trim();
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("sync-owned staged knowledge", () => {
  test("enqueues one durable sync_stage job and event per unique intake source", () => {
    const current = fixture(movingIntake());
    const before = listGameEvents(current.store.db, { gameId: "melee" }).length;

    const jobs = enqueueSyncKnowledgeJobs(current.store, {
      syncId: current.sync.sync_id,
      commandId: "command-enqueue-knowledge",
      occurredAt: "2026-08-13T18:02:00.000Z",
      provenance: {
        corpus: { "corpus-b": { corpus_batch_id: "corpus-b", source: "discord" } },
      },
    });

    expect(jobs.map((job) => `${job.sourceKind}:${job.sourceId}`)).toEqual([
      "corpus:corpus-b",
      "merged_pr:pr-2",
      "merged_pr:pr-9",
    ]);
    expect(jobs.every((job) => job.status === "queued" && job.causedByEventId)).toBe(true);
    const events = listGameEvents(current.store.db, { gameId: "melee" }).slice(before)
      .filter((event) => event.eventType === "knowledge.job_enqueued");
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.eventType)).toEqual([
      "knowledge.job_enqueued",
      "knowledge.job_enqueued",
      "knowledge.job_enqueued",
    ]);
    expect(events.map((event) => event.subjectId)).toEqual(jobs.map((job) => job.jobId));
    expect(events[0]?.payload).toMatchObject({
      source_class: "sync_stage",
      execution_class: "sync_stage",
      provenance: { corpus_batch_id: "corpus-b", source: "discord" },
    });

    expect(enqueueSyncKnowledgeJobs(current.store, {
      syncId: current.sync.sync_id,
      commandId: "command-enqueue-knowledge-retry",
      provenance: {
        corpus: { "corpus-b": { source: "discord", corpus_batch_id: "corpus-b" } },
      },
    })).toEqual(jobs);
    expect(listGameEvents(current.store.db, { gameId: "melee" })
      .filter((event) => event.eventType === "knowledge.job_enqueued")).toHaveLength(3);
  });

  test("emits every sync-stage status with exact durable identity and provenance", async () => {
    const sourceId = "corpus-contract";
    const provenance = {
      corpus_batch_id: sourceId,
      origin: "discord-export",
      revision: "2026-08-13",
    };
    const current = fixture(knowledgeOnlyIntake([sourceId]), "sync-knowledge-event-contract");
    const context: SyncEngineContext = {
      store: current.store,
      stateDir: current.stateDir,
      repoRoot: current.root,
      cycleWorktreePath: current.root,
      leaseId: current.leaseId,
    };
    enqueueSyncKnowledgeJobs(current.store, {
      syncId: current.sync.sync_id,
      commandId: "command-enqueue-contract-job",
      provenance: { corpus: { [sourceId]: provenance } },
    });

    await expect(stageSyncKnowledge({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      commandId: "command-fail-contract-job",
      processors: {
        async processMergedPr() { return {}; },
        async processCorpus() { throw new Error("contract fixture failure"); },
      },
      revalidateOwnership: () => {},
    })).rejects.toThrow("contract fixture failure");

    let sync = getSyncState(current.store, current.sync.sync_id)!;
    sync = transitionSync(current.store, sync.sync_id, {
      actor: "runner",
      commandId: "command-block-contract-job",
      correlationId: sync.sync_id,
      expectedRevision: sync.revision,
      patch: {
        status: "blocked",
        blockers: [{
          code: "knowledge_stage_failed",
          message: "contract fixture failure",
          source_kind: "sync",
          source_id: sync.sync_id,
          recoverable: true,
        }],
      },
    });
    sync = await recoverSync({
      context,
      syncId: sync.sync_id,
      commandId: "command-resume-contract-job",
      expectedRevision: sync.revision,
      choice: "resume",
      recoveryReason: "retry contract fixture",
    });

    const manifest = await stageSyncKnowledge({
      store: current.store,
      stateDir: current.stateDir,
      syncId: sync.sync_id,
      commandId: "command-succeed-contract-job",
      processors: deterministicProcessors(),
      revalidateOwnership: () => {},
    });
    cancelSyncKnowledgeJobs(current.store, {
      syncId: sync.sync_id,
      commandId: "command-cancel-contract-job",
      reason: "close contract fixture",
      actor: "runner",
    });

    const statusEventTypes = new Set([
      "knowledge.job_processing",
      "knowledge.job_waiting",
      "knowledge.job_succeeded",
      "knowledge.job_failed",
      "knowledge.job_cancelled",
    ]);
    const statusEvents = listGameEvents(current.store.db, { gameId: "melee" })
      .filter((event) => statusEventTypes.has(event.eventType));
    const commonFacts = {
      sync_id: sync.sync_id,
      execution_class: "sync_stage",
      source_class: "sync_stage",
      provenance,
      source_kind: "corpus",
      source_id: sourceId,
    };
    expect(statusEvents.map((event) => ({ eventType: event.eventType, payload: event.payload }))).toEqual([
      {
        eventType: "knowledge.job_processing",
        payload: { ...commonFacts, from_status: "queued", to_status: "processing" },
      },
      {
        eventType: "knowledge.job_failed",
        payload: {
          ...commonFacts,
          from_status: "processing",
          to_status: "failed",
          error: "contract fixture failure",
        },
      },
      {
        eventType: "knowledge.job_waiting",
        payload: {
          ...commonFacts,
          from_status: "failed",
          to_status: "waiting",
          reason: "retry contract fixture",
        },
      },
      {
        eventType: "knowledge.job_processing",
        payload: { ...commonFacts, from_status: "queued", to_status: "processing" },
      },
      {
        eventType: "knowledge.job_succeeded",
        payload: {
          ...commonFacts,
          from_status: "processing",
          to_status: "succeeded",
          staged_digest: manifest.artifacts[0]!.digest,
        },
      },
      {
        eventType: "knowledge.job_cancelled",
        payload: {
          ...commonFacts,
          from_status: "succeeded",
          to_status: "cancelled",
          reason: "close contract fixture",
        },
      },
    ]);
    for (const event of statusEvents) {
      expect(typeof event.payload.sync_id === "string" && event.payload.sync_id.trim().length > 0).toBe(true);
      expect(() => validateRegisteredGameEvent(
        event.eventType,
        event.subjectKind,
        event.actor,
        event.payload,
      )).not.toThrow();
    }
  });

  test.each([
    ["knowledge.job_processing", "queued", {}],
    ["knowledge.job_waiting", "failed", { reason: "retry contract fixture" }],
    ["knowledge.job_succeeded", "processing", { staged_digest: "sha256:staged" }],
    ["knowledge.job_failed", "processing", { error: "contract fixture failure" }],
    ["knowledge.job_cancelled", "succeeded", { reason: "close contract fixture" }],
  ] as const)("rejects missing and cross-field-invalid generalized facts for %s", (
    eventType,
    fromStatus,
    eventFacts,
  ) => {
    const payload = {
      sync_id: "sync-registry-contract",
      execution_class: "sync_stage",
      source_class: "sync_stage",
      provenance: { corpus_batch_id: "corpus-contract", origin: "discord-export" },
      source_kind: "corpus",
      source_id: "corpus-contract",
      from_status: fromStatus,
      to_status: eventType.slice("knowledge.job_".length),
      ...eventFacts,
    };
    expect(() => validateRegisteredGameEvent(eventType, "knowledge_job", "runner", payload)).not.toThrow();

    for (const fact of [
      "sync_id",
      "execution_class",
      "source_class",
      "provenance",
      "source_kind",
      "source_id",
      "from_status",
      "to_status",
    ] as const) {
      const missing: JsonObject = { ...payload };
      delete missing[fact];
      expect(() => validateRegisteredGameEvent(eventType, "knowledge_job", "runner", missing)).toThrow(
        `is missing required payload facts: ${fact}`,
      );
    }
    expect(() => validateRegisteredGameEvent(eventType, "knowledge_job", "runner", {
      ...payload,
      sync_id: "   ",
    })).toThrow("requires a nonblank sync_id when execution_class is sync_stage");
    expect(() => validateRegisteredGameEvent(eventType, "knowledge_job", "runner", {
      ...payload,
      execution_class: "background_safe",
    })).toThrow("requires sync_id null when execution_class is background_safe");
    expect(() => validateRegisteredGameEvent(eventType, "knowledge_job", "runner", {
      ...payload,
      execution_class: "background_safe",
      sync_id: null,
    })).not.toThrow();
    const legacyTransition: JsonObject = { ...payload };
    delete legacyTransition.from_status;
    delete legacyTransition.to_status;
    legacyTransition.previous_status = fromStatus;
    legacyTransition.status = eventType.slice("knowledge.job_".length);
    expect(() => validateRegisteredGameEvent(
      eventType,
      "knowledge_job",
      "runner",
      legacyTransition,
    )).toThrow();
  });

  test("rolls back the enqueue event when durable job insertion fails", () => {
    const current = fixture(knowledgeOnlyIntake());
    const before = listGameEvents(current.store.db, { gameId: "melee" }).length;
    current.store.db.exec(`
      CREATE TRIGGER reject_sync_knowledge_job
      BEFORE INSERT ON jobs
      WHEN NEW.kind = 'sync_publication'
      BEGIN
        SELECT RAISE(ABORT, 'fixture rejected knowledge job');
      END;
    `);

    expect(() => enqueueSyncKnowledgeJobs(current.store, {
      syncId: current.sync.sync_id,
      commandId: "command-enqueue-rejected",
    })).toThrow("fixture rejected knowledge job");
    expect(listGameEvents(current.store.db, { gameId: "melee" })).toHaveLength(before);
    expect(listSyncKnowledgeJobs(current.store.db, current.sync.sync_id)).toEqual([]);
  });

  test("rolls back a job-transition event when its revision CAS cannot persist", async () => {
    const current = fixture(knowledgeOnlyIntake());
    enqueueSyncKnowledgeJobs(current.store, {
      syncId: current.sync.sync_id,
      commandId: "command-enqueue",
    });
    const before = listGameEvents(current.store.db, { gameId: "melee" }).length;
    current.store.db.exec(`
      CREATE TRIGGER reject_sync_knowledge_processing
      BEFORE UPDATE OF status ON jobs
      WHEN NEW.kind = 'sync_publication' AND NEW.status = 'claimed'
      BEGIN
        SELECT RAISE(ABORT, 'fixture rejected processing CAS');
      END;
    `);

    await expect(stageSyncKnowledge({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      commandId: "command-stage-cas-rejected",
      processors: deterministicProcessors(),
      revalidateOwnership: () => {},
    })).rejects.toThrow("fixture rejected processing CAS");
    expect(listGameEvents(current.store.db, { gameId: "melee" })).toHaveLength(before);
    expect(listSyncKnowledgeJobs(current.store.db, current.sync.sync_id)).toEqual([
      expect.objectContaining({ status: "queued", revision: 0 }),
    ]);
  });

  test("stages deterministic artifacts without touching canonical knowledge", async () => {
    const current = fixture(movingIntake());
    const canonicalPath = resolve(current.root, "canonical-knowledge.jsonl");
    writeFileSync(canonicalPath, "canonical-before\n", "utf8");
    const calls: string[] = [];
    const completed = await completeSyncKnowledgeIngest({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      expectedRevision: current.sync.revision,
      commandId: "command-complete-moving-knowledge",
      processors: deterministicProcessors(calls),
      revalidateOwnership: () => {},
      now: () => "2026-08-13T18:03:00.000Z",
    });
    const manifest = completed.manifest;

    expect(calls).toEqual(["corpus:corpus-b", "merged_pr:pr-2", "merged_pr:pr-9"]);
    expect(completed.sync).toMatchObject({ status: "ingesting", staging: null });
    expect(readFileSync(canonicalPath, "utf8")).toBe("canonical-before\n");
    expect(manifest).toMatchObject({
      schema_version: 1,
      sync_id: current.sync.sync_id,
      game_id: "melee",
      knowledge_only: false,
    });
    expect(manifest.accepted_job_ids).toHaveLength(3);
    expect(manifest.artifacts).toHaveLength(3);
    expect(manifest.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(readSyncKnowledgeManifest(current.stateDir, current.sync.sync_id)).toEqual(manifest);
    const succeededJobs = listSyncKnowledgeJobs(current.store.db, current.sync.sync_id);
    expect(succeededJobs.every((job) =>
      job.status === "succeeded" &&
      job.revision === 3 &&
      job.stagedArtifactPath?.startsWith(syncKnowledgeRoot(current.stateDir, current.sync.sync_id)),
    )).toBe(true);
    for (const job of succeededJobs) {
      const jobEvents = listGameEvents(current.store.db, { gameId: "melee" })
        .filter((event) => event.subjectId === job.jobId);
      expect(jobEvents.map((event) => event.eventType)).toEqual([
        "knowledge.job_enqueued",
        "knowledge.job_processing",
        "knowledge.job_succeeded",
      ]);
      expect(jobEvents[1]!.causationId).toBe(jobEvents[0]!.eventId);
      expect(jobEvents[2]!.causationId).toBe(jobEvents[1]!.eventId);
      expect(job.causedByEventId).toBe(jobEvents.at(-1)!.eventId);
    }

    const secondCalls: string[] = [];
    const second = await stageSyncKnowledge({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      commandId: "command-stage-idempotent",
      processors: deterministicProcessors(secondCalls),
      revalidateOwnership: () => {},
    });
    expect(second).toEqual(manifest);
    expect(secondCalls).toEqual([]);
  });

  test("fails loudly, records failure, and publishes no manifest when a processor fails", async () => {
    const current = fixture(knowledgeOnlyIntake());
    enqueueSyncKnowledgeJobs(current.store, {
      syncId: current.sync.sync_id,
      commandId: "command-enqueue",
    });

    await expect(stageSyncKnowledge({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      commandId: "command-stage-processor-failure",
      revalidateOwnership: () => {},
      processors: {
        async processMergedPr() { return {}; },
        async processCorpus() { throw new Error("corpus adapter failed"); },
      },
    })).rejects.toThrow("corpus adapter failed");
    expect(listSyncKnowledgeJobs(current.store.db, current.sync.sync_id)).toEqual([
      expect.objectContaining({ status: "failed", revision: 2, stagedArtifactPath: null, stagedDigest: null }),
    ]);
    expect(listGameEvents(current.store.db, { gameId: "melee" })
      .filter((event) => event.eventType.startsWith("knowledge.job_")).slice(-2).map((event) => event.eventType))
      .toEqual(["knowledge.job_processing", "knowledge.job_failed"]);
    expect(existsSync(syncKnowledgeManifestPath(current.stateDir, current.sync.sync_id))).toBe(false);
  });

  test("source-moving ingest blocks durably and recovers failed knowledge before staging exists", async () => {
    const current = fixture(movingIntake(), "sync-knowledge-complete-failure");
    const lease = { leaseId: current.leaseId };
    const context: SyncEngineContext = {
      store: current.store,
      stateDir: current.stateDir,
      repoRoot: current.root,
      cycleWorktreePath: current.root,
      leaseId: lease.leaseId,
    };

    await expect(completeSyncKnowledgeIngest({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      expectedRevision: current.sync.revision,
      commandId: "command-complete-failing-knowledge",
      processors: {
        async processMergedPr() { return {}; },
        async processCorpus() { throw new Error("fixture processor rejected corpus"); },
      },
      revalidateOwnership: () => {},
    })).rejects.toThrow("Sync knowledge ingest failed: fixture processor rejected corpus");

    expect(getSyncState(current.store, current.sync.sync_id)).toMatchObject({
      status: "blocked",
      blockers: [expect.objectContaining({ code: "knowledge_stage_failed", recoverable: true })],
    });
    expect(listSyncKnowledgeJobs(current.store.db, current.sync.sync_id).map((job) => job.status))
      .toEqual(["failed", "queued", "queued"]);
    expect(listGameEvents(current.store.db, { gameId: "melee" })
      .filter((event) => !event.eventType.startsWith("job.")).slice(-3).map((event) => event.eventType))
      .toEqual(["knowledge.job_processing", "knowledge.job_failed", "sync.blocked"]);
    expect(existsSync(syncKnowledgeManifestPath(current.stateDir, current.sync.sync_id))).toBe(false);

    const blocked = getSyncState(current.store, current.sync.sync_id)!;
    const recovered = await recoverSync({
      context,
      syncId: blocked.sync_id,
      expectedRevision: blocked.revision,
      commandId: "command-recover-source-moving-knowledge",
      choice: "resume",
      recoveryReason: "operator retries source-moving knowledge ingest",
    });
    expect(recovered).toMatchObject({ status: "ingesting", staging: null, blockers: [] });
    expect(listSyncKnowledgeJobs(current.store.db, current.sync.sync_id).map((job) => job.status))
      .toEqual(["queued", "queued", "queued"]);
    const completed = await completeSyncKnowledgeIngest({
      store: current.store,
      stateDir: current.stateDir,
      syncId: recovered.sync_id,
      expectedRevision: recovered.revision,
      commandId: "command-complete-recovered-source-moving-knowledge",
      processors: deterministicProcessors(),
      revalidateOwnership: () => {},
    });
    expect(completed.sync).toMatchObject({ status: "ingesting", staging: null });
    expect(listSyncKnowledgeJobs(current.store.db, current.sync.sync_id).every((job) => job.status === "succeeded"))
      .toBe(true);
  });

  test("recovers an all-succeeded ingest after manifest assembly fails", async () => {
    const current = fixture(movingIntake(), "sync-knowledge-manifest-recovery");
    const lease = { leaseId: current.leaseId };
    const context: SyncEngineContext = {
      store: current.store,
      stateDir: current.stateDir,
      repoRoot: current.root,
      cycleWorktreePath: current.root,
      leaseId: lease.leaseId,
    };
    const manifestPath = syncKnowledgeManifestPath(current.stateDir, current.sync.sync_id);
    mkdirSync(manifestPath, { recursive: true });

    await expect(completeSyncKnowledgeIngest({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      expectedRevision: current.sync.revision,
      commandId: "command-fail-manifest-assembly",
      processors: deterministicProcessors(),
      revalidateOwnership: () => {},
    })).rejects.toThrow("Sync knowledge ingest failed");
    expect(listSyncKnowledgeJobs(current.store.db, current.sync.sync_id).every((job) => job.status === "succeeded"))
      .toBe(true);

    rmSync(manifestPath, { recursive: true, force: true });
    const blocked = getSyncState(current.store, current.sync.sync_id)!;
    const recovered = await recoverSync({
      context,
      syncId: blocked.sync_id,
      expectedRevision: blocked.revision,
      commandId: "command-recover-manifest-assembly",
      choice: "resume",
      recoveryReason: "operator retries manifest assembly",
    });
    expect(listSyncKnowledgeJobs(current.store.db, current.sync.sync_id).every((job) => job.status === "queued"))
      .toBe(true);
    const completed = await completeSyncKnowledgeIngest({
      store: current.store,
      stateDir: current.stateDir,
      syncId: recovered.sync_id,
      expectedRevision: recovered.revision,
      commandId: "command-complete-manifest-recovery",
      processors: deterministicProcessors(),
      revalidateOwnership: () => {},
    });
    expect(completed.sync.status).toBe("ingesting");
    expect(readSyncKnowledgeManifest(current.stateDir, current.sync.sync_id)).toEqual(completed.manifest);
  });

  test("requeues succeeded jobs when a staged artifact disappears before manifest acceptance", async () => {
    const current = fixture(movingIntake(), "sync-knowledge-artifact-recovery");
    const lease = { leaseId: current.leaseId };
    const context: SyncEngineContext = {
      store: current.store,
      stateDir: current.stateDir,
      repoRoot: current.root,
      cycleWorktreePath: current.root,
      leaseId: lease.leaseId,
    };
    enqueueSyncKnowledgeJobs(current.store, {
      syncId: current.sync.sync_id,
      commandId: "command-enqueue-artifact-recovery",
    });
    await stageSyncKnowledge({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      commandId: "command-stage-artifact-recovery",
      processors: deterministicProcessors(),
      revalidateOwnership: () => {},
    });
    const missing = listSyncKnowledgeJobs(current.store.db, current.sync.sync_id)[0]!.stagedArtifactPath!;
    rmSync(missing, { force: true });

    await expect(completeSyncKnowledgeIngest({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      expectedRevision: current.sync.revision,
      commandId: "command-detect-missing-artifact",
      processors: deterministicProcessors(),
      revalidateOwnership: () => {},
    })).rejects.toThrow("Staged knowledge artifact is missing");
    const blocked = getSyncState(current.store, current.sync.sync_id)!;
    const recovered = await recoverSync({
      context,
      syncId: blocked.sync_id,
      expectedRevision: blocked.revision,
      commandId: "command-recover-missing-artifact",
      choice: "resume",
      recoveryReason: "operator rebuilds staged artifacts",
    });
    expect(listSyncKnowledgeJobs(current.store.db, current.sync.sync_id).every((job) => job.status === "queued"))
      .toBe(true);
    const completed = await completeSyncKnowledgeIngest({
      store: current.store,
      stateDir: current.stateDir,
      syncId: recovered.sync_id,
      expectedRevision: recovered.revision,
      commandId: "command-complete-artifact-recovery",
      processors: deterministicProcessors(),
      revalidateOwnership: () => {},
    });
    expect(completed.sync.status).toBe("ingesting");
    expect(existsSync(missing)).toBe(true);
  });

  test("advances knowledge-only revision and event atomically without a remote_application", async () => {
    const current = fixture(knowledgeOnlyIntake());
    const completed = await completeSyncKnowledgeIngest({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      expectedRevision: current.sync.revision,
      commandId: "command-complete-knowledge-ingest",
      processors: deterministicProcessors(),
      revalidateOwnership: () => {},
      now: () => "2026-08-13T18:03:00.000Z",
    });
    const manifest = completed.manifest;
    expect(completed.sync).toMatchObject({ status: "validated", staging: null });
    expect(listGameEvents(current.store.db, { gameId: "melee" }).slice(-2)).toMatchObject([
      {
        eventType: "sync.validating",
        payload: { from_status: "ingesting", to_status: "validating" },
      },
      {
        eventType: "sync.validated",
        payload: {
          from_status: "validating",
          to_status: "validated",
          validation_evidence: {
            result: "passed",
            knowledge_only: true,
            manifest_digest: manifest.digest,
            accepted_job_ids: manifest.accepted_job_ids,
          },
        },
      },
    ]);
    let sync = transitionSync(current.store, completed.sync.sync_id, {
      actor: "operator",
      commandId: "command-publishing",
      correlationId: completed.sync.sync_id,
      expectedRevision: completed.sync.revision,
      patch: { status: "publishing" },
    });
    const eventCount = listGameEvents(current.store.db, { gameId: "melee" }).length;
    expect(() => immediateTransaction(current.store.db, () => {
      publishSyncKnowledgeInTransaction(current.store.db, {
        syncId: sync.sync_id,
        gameId: sync.game_id,
        manifest,
        actor: "runner",
        commandId: "command-publish-knowledge-rollback",
        correlationId: sync.sync_id,
        traceId: sync.trace_id,
        spanId: syncActionSpanId("command-publish-knowledge"),
      });
      throw new Error("fixture rolls back publication");
    })).toThrow("fixture rolls back publication");
    expect(current.store.db.query("SELECT COUNT(*) AS count FROM knowledge_revisions").get()).toEqual({ count: 0 });
    expect(listGameEvents(current.store.db, { gameId: "melee" })).toHaveLength(eventCount);

    const published = immediateTransaction(current.store.db, () =>
      publishSyncKnowledgeInTransaction(current.store.db, {
        syncId: sync.sync_id,
        gameId: sync.game_id,
        manifest: readSyncKnowledgeManifest(current.stateDir, sync.sync_id),
        actor: "runner",
        commandId: "command-publish-knowledge",
        correlationId: sync.sync_id,
        traceId: sync.trace_id,
        spanId: syncActionSpanId("command-publish-knowledge"),
        occurredAt: "2026-08-13T18:04:00.000Z",
      }));
    expect(published).toMatchObject({
      revision: 1,
      revisionId: "knowledge-1",
      oldRevisionId: "knowledge-0",
      digest: manifest.digest,
      acceptedJobIds: manifest.accepted_job_ids,
      idempotent: false,
    });
    const events = listGameEvents(current.store.db, { gameId: "melee" });
    expect(events.at(-1)).toMatchObject({
      eventType: "knowledge.revision_advanced",
      payload: {
        old_revision: "knowledge-0",
        new_revision: "knowledge-1",
        accepted_job_ids: manifest.accepted_job_ids,
      },
    });
    expect(current.store.db.query(
      "SELECT COUNT(*) AS count FROM cycle_timeline_entries WHERE entry_kind = 'remote_application'",
    ).get()).toEqual({ count: 0 });

    const retry = immediateTransaction(current.store.db, () =>
      publishSyncKnowledgeInTransaction(current.store.db, {
        syncId: sync.sync_id,
        gameId: sync.game_id,
        manifest,
        actor: "runner",
        commandId: "command-publish-knowledge-retry",
        correlationId: sync.sync_id,
        traceId: sync.trace_id,
        spanId: syncActionSpanId("command-publish-knowledge-retry"),
      }));
    expect(retry).toMatchObject({ revisionId: "knowledge-1", idempotent: true });
    expect(listGameEvents(current.store.db, { gameId: "melee" })).toHaveLength(events.length);
  });

  test("publish atomically activates staged artifacts for canonical queries", async () => {
    const current = fixture(knowledgeOnlyIntake(["corpus-z", "corpus-a"]));
    const completed = await completeSyncKnowledgeIngest({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      expectedRevision: current.sync.revision,
      commandId: "command-query-activation-ingest",
      processors: deterministicProcessors(),
      revalidateOwnership: () => {},
    });
    expect(queryCanonicalSyncKnowledge(current.store, { gameId: "melee", query: "corpus fact" })).toEqual([]);
    const publishing = transitionSync(current.store, completed.sync.sync_id, {
      actor: "operator",
      commandId: "command-query-activation-publishing",
      correlationId: completed.sync.sync_id,
      expectedRevision: completed.sync.revision,
      patch: { status: "publishing" },
    });

    expect(() => immediateTransaction(current.store.db, () => {
      publishSyncKnowledgeInTransaction(current.store.db, {
        syncId: publishing.sync_id,
        gameId: publishing.game_id,
        manifest: completed.manifest,
        actor: "runner",
        commandId: "command-query-activation-rollback",
        correlationId: publishing.sync_id,
        traceId: publishing.trace_id,
        spanId: syncActionSpanId("command-query-activation-rollback"),
      });
      expect(queryCanonicalSyncKnowledge(current.store, { gameId: "melee", query: "corpus fact" }))
        .toHaveLength(2);
      throw new Error("fixture rolls back canonical activation");
    })).toThrow("fixture rolls back canonical activation");
    expect(queryCanonicalSyncKnowledge(current.store, { gameId: "melee", query: "corpus fact" })).toEqual([]);

    immediateTransaction(current.store.db, () =>
      publishSyncKnowledgeInTransaction(current.store.db, {
        syncId: publishing.sync_id,
        gameId: publishing.game_id,
        manifest: completed.manifest,
        actor: "runner",
        commandId: "command-query-activation-commit",
        correlationId: publishing.sync_id,
        traceId: publishing.trace_id,
        spanId: syncActionSpanId("command-query-activation-commit"),
      }));
    const snapshot = readCanonicalSyncKnowledge(current.store, "melee");
    expect(snapshot).toMatchObject({ revision: { revisionId: "knowledge-1", syncId: publishing.sync_id } });
    expect(queryCanonicalSyncKnowledge(current.store, { gameId: "melee", query: "corpus fact" })
      .map((artifact) => artifact.sourceId)).toEqual(["corpus-a", "corpus-z"]);
    expect(queryCanonicalSyncKnowledge(current.store, { gameId: "melee", query: "corpus fact", limit: 1 })).toEqual([
      expect.objectContaining({
        revisionId: "knowledge-1",
        syncId: publishing.sync_id,
        sourceKind: "corpus",
        sourceId: "corpus-a",
      }),
    ]);
    expect(queryCanonicalSyncKnowledge(current.store, { gameId: "other-game", query: "corpus fact" })).toEqual([]);

  });

  test("publish supplies the starting knowledge revision to createRun", async () => {
    const current = fixture(knowledgeOnlyIntake(), "sync-knowledge-create-run");
    await publishKnowledgeOnlyFixture(current, "command-publish-before-create-run");

    const run = createRun(
      current.store,
      "matched_code_percent",
      100,
      4,
      { gameId: "melee" },
      { baseRevision: "base-after-knowledge-publish", requireReady: true },
    );

    expect(run.inputs?.starting_knowledge_revision).toBe("knowledge-1");
  });

  test("knowledge-only cancel removes staged artifacts while leaving SyncState.staging null", async () => {
    const current = fixture(knowledgeOnlyIntake(), "sync-knowledge-cancel");
    const repo = resolve(current.root, "cycle");
    git(current.root, "init", repo);
    git(repo, "config", "user.email", "sync-test@example.com");
    git(repo, "config", "user.name", "Sync Test");
    writeFileSync(resolve(repo, "cycle.c"), "int cycle = 1;\n", "utf8");
    git(repo, "add", "cycle.c");
    git(repo, "commit", "-m", "cycle head");
    const head = git(repo, "rev-parse", "HEAD");
    current.store.db.query(
      "UPDATE cycles SET head_revision = ? WHERE cycle_uuid = ?",
    ).run(head, current.sync.cycle_uuid);
    const lease = { leaseId: current.leaseId };
    enqueueSyncKnowledgeJobs(current.store, {
      syncId: current.sync.sync_id,
      commandId: "command-enqueue",
    });
    await stageSyncKnowledge({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      commandId: "command-stage-before-cancel",
      processors: deterministicProcessors(),
      revalidateOwnership: () => {},
    });
    expect(current.sync.staging).toBeNull();
    expect(existsSync(syncStagingPaths(current.stateDir, current.sync.sync_id).root)).toBe(true);
    const context: SyncEngineContext = {
      store: current.store,
      stateDir: current.stateDir,
      repoRoot: repo,
      cycleWorktreePath: repo,
      leaseId: lease.leaseId,
    };

    const cancelled = await cancelSync({
      context,
      syncId: current.sync.sync_id,
      expectedRevision: current.sync.revision,
      commandId: "command-cancel-knowledge-only",
    });
    expect(cancelled).toMatchObject({ status: "cancelled", staging: null });
    expect(existsSync(syncStagingPaths(current.stateDir, current.sync.sync_id).root)).toBe(false);
    expect(git(repo, "rev-parse", "HEAD")).toBe(head);
    const jobs = listSyncKnowledgeJobs(current.store.db, current.sync.sync_id);
    expect(jobs).toEqual([
      expect.objectContaining({
        status: "cancelled",
        revision: 4,
        stagedArtifactPath: expect.any(String),
        stagedDigest: expect.any(String),
      }),
    ]);
    expect(listGameEvents(current.store.db, { gameId: "melee" })
      .filter((event) => event.subjectId === jobs[0]!.jobId)
      .filter((event) => event.eventType.startsWith("knowledge.job_"))
      .map((event) => event.eventType)).toEqual([
      "knowledge.job_enqueued",
      "knowledge.job_processing",
      "knowledge.job_succeeded",
      "knowledge.job_cancelled",
    ]);
  });

  test("knowledge-only recovery discard cancels jobs before removing their artifacts", async () => {
    const current = fixture(knowledgeOnlyIntake(), "sync-knowledge-recover-discard");
    const repo = resolve(current.root, "cycle");
    git(current.root, "init", repo);
    git(repo, "config", "user.email", "sync-test@example.com");
    git(repo, "config", "user.name", "Sync Test");
    writeFileSync(resolve(repo, "cycle.c"), "int cycle = 1;\n", "utf8");
    git(repo, "add", "cycle.c");
    git(repo, "commit", "-m", "cycle head");
    const head = git(repo, "rev-parse", "HEAD");
    current.store.db.query(
      "UPDATE cycles SET head_revision = ? WHERE cycle_uuid = ?",
    ).run(head, current.sync.cycle_uuid);
    const lease = { leaseId: current.leaseId };
    const context: SyncEngineContext = {
      store: current.store,
      stateDir: current.stateDir,
      repoRoot: repo,
      cycleWorktreePath: repo,
      leaseId: lease.leaseId,
    };
    const completed = await completeSyncKnowledgeIngest({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      expectedRevision: current.sync.revision,
      commandId: "command-stage-before-recovery",
      processors: deterministicProcessors(),
      revalidateOwnership: () => {},
    });
    let sync = markSyncRecoveryRequired({
      context,
      syncId: current.sync.sync_id,
      expectedRevision: completed.sync.revision,
      commandId: "command-mark-recovery",
      reason: "fixture interrupted after knowledge staging",
    });
    expect(sync).toMatchObject({ status: "blocked", staging: null });

    sync = await recoverSync({
      context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-recover-discard",
      choice: "discard",
      recoveryReason: "operator discarded staged knowledge",
    });
    expect(sync).toMatchObject({ status: "cancelled", staging: null });
    expect(listGameEvents(current.store.db, { gameId: "melee" }).filter((event) =>
      event.subjectKind === "sync_workflow" && event.subjectId === sync.sync_id
    ).at(-1)).toMatchObject({
      eventType: "sync.cancelled",
      payload: {
        from_status: "blocked",
        to_status: "cancelled",
        discarded_staging_workspace_id: null,
        untouched_submodule_heads: [],
      },
    });
    expect(existsSync(syncStagingPaths(current.stateDir, current.sync.sync_id).root)).toBe(false);
    expect(listSyncKnowledgeJobs(current.store.db, current.sync.sync_id)).toEqual([
      expect.objectContaining({ status: "cancelled", revision: 4 }),
    ]);
  });

  test("knowledge-only recovery resumes failed jobs through waiting and completes them", async () => {
    const current = fixture(knowledgeOnlyIntake(), "sync-knowledge-recover-failed");
    const repo = resolve(current.root, "cycle");
    git(current.root, "init", repo);
    git(repo, "config", "user.email", "sync-test@example.com");
    git(repo, "config", "user.name", "Sync Test");
    writeFileSync(resolve(repo, "cycle.c"), "int cycle = 1;\n", "utf8");
    git(repo, "add", "cycle.c");
    git(repo, "commit", "-m", "cycle head");
    const head = git(repo, "rev-parse", "HEAD");
    current.store.db.query(
      "UPDATE cycles SET head_revision = ? WHERE cycle_uuid = ?",
    ).run(head, current.sync.cycle_uuid);
    const lease = { leaseId: current.leaseId };
    const context: SyncEngineContext = {
      store: current.store,
      stateDir: current.stateDir,
      repoRoot: repo,
      cycleWorktreePath: repo,
      leaseId: lease.leaseId,
    };
    enqueueSyncKnowledgeJobs(current.store, {
      syncId: current.sync.sync_id,
      commandId: "command-enqueue-failed-recovery",
    });
    await expect(stageSyncKnowledge({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      commandId: "command-stage-failure",
      processors: {
        async processMergedPr() { return {}; },
        async processCorpus() { throw new Error("fixture intake failed"); },
      },
      revalidateOwnership: () => {},
    })).rejects.toThrow("fixture intake failed");
    expect(listSyncKnowledgeJobs(current.store.db, current.sync.sync_id)).toEqual([
      expect.objectContaining({ status: "failed", revision: 2 }),
    ]);
    let sync = markSyncRecoveryRequired({
      context,
      syncId: current.sync.sync_id,
      expectedRevision: current.sync.revision,
      commandId: "command-mark-failed-recovery",
      reason: "knowledge processor failed",
    });
    const beforeRejectedRecovery = listGameEvents(current.store.db, { gameId: "melee" }).length;
    current.store.db.exec(`
      CREATE TRIGGER reject_knowledge_sync_recovery
      BEFORE UPDATE OF status ON sync_state
      WHEN NEW.status = 'ingesting'
      BEGIN
        SELECT RAISE(ABORT, 'fixture rejected sync recovery');
      END;
    `);
    await expect(recoverSync({
      context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-reject-failed-recovery",
      choice: "resume",
      recoveryReason: "fixture rejects combined recovery",
    })).rejects.toThrow("fixture rejected sync recovery");
    expect(listSyncKnowledgeJobs(current.store.db, sync.sync_id)).toEqual([
      expect.objectContaining({ status: "failed", revision: 2 }),
    ]);
    expect(listGameEvents(current.store.db, { gameId: "melee" })).toHaveLength(beforeRejectedRecovery);
    current.store.db.exec("DROP TRIGGER reject_knowledge_sync_recovery");
    sync = await recoverSync({
      context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-resume-failed-knowledge",
      choice: "resume",
      recoveryReason: "operator retried failed knowledge",
    });
    expect(sync).toMatchObject({ status: "ingesting", staging: null });
    expect(listSyncKnowledgeJobs(current.store.db, sync.sync_id)).toEqual([
      expect.objectContaining({ status: "queued", revision: 3 }),
    ]);
    const resumed = await completeSyncKnowledgeIngest({
      store: current.store,
      stateDir: current.stateDir,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-complete-retried-knowledge",
      processors: deterministicProcessors(),
      revalidateOwnership: () => {},
    });
    expect(resumed.sync).toMatchObject({ status: "validated", staging: null });
    const jobs = listSyncKnowledgeJobs(current.store.db, sync.sync_id);
    expect(jobs).toEqual([expect.objectContaining({ status: "succeeded", revision: 6 })]);
    expect(listGameEvents(current.store.db, { gameId: "melee" })
      .filter((event) => event.subjectId === jobs[0]!.jobId)
      .map((event) => event.eventType)).toEqual([
      "knowledge.job_enqueued",
      "knowledge.job_processing",
      "knowledge.job_failed",
      "knowledge.job_waiting",
      "knowledge.job_processing",
      "knowledge.job_succeeded",
    ]);
  });

  test("recovers a confirmed orphan after a real store close/reopen with one transactional requeue and CAS", async () => {
    const current = fixture(knowledgeOnlyIntake(), "sync-knowledge-recover-processing");
    const repo = resolve(current.root, "cycle");
    git(current.root, "init", repo);
    git(repo, "config", "user.email", "sync-test@example.com");
    git(repo, "config", "user.name", "Sync Test");
    writeFileSync(resolve(repo, "cycle.c"), "int cycle = 1;\n", "utf8");
    git(repo, "add", "cycle.c");
    git(repo, "commit", "-m", "cycle head");
    current.store.db.query(
      "UPDATE cycles SET head_revision = ? WHERE cycle_uuid = ?",
    ).run(git(repo, "rev-parse", "HEAD"), current.sync.cycle_uuid);
    enqueueSyncKnowledgeJobs(current.store, {
      syncId: current.sync.sync_id,
      commandId: "command-enqueue-processing-recovery",
    });
    let releaseProcessor!: () => void;
    let processorStarted!: () => void;
    const started = new Promise<void>((resolveStarted) => { processorStarted = resolveStarted; });
    const release = new Promise<void>((resolveRelease) => { releaseProcessor = resolveRelease; });
    const staging = stageSyncKnowledge({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      commandId: "command-stage-processing",
      processors: {
        async processMergedPr() { return {}; },
        async processCorpus() {
          processorStarted();
          await release;
          return { resumed: false };
        },
      },
      revalidateOwnership: () => {},
    });
    await started;
    expect(listSyncKnowledgeJobs(current.store.db, current.sync.sync_id)).toEqual([
      expect.objectContaining({ status: "processing", revision: 1 }),
    ]);
    current.store.db.close();
    const reopened = openState(current.stateDir);
    stores.push(reopened);
    const context: SyncEngineContext = {
      store: reopened,
      stateDir: current.stateDir,
      repoRoot: repo,
      cycleWorktreePath: repo,
      leaseId: current.leaseId,
    };
    const staleNow = new Date(Date.now() + 16 * 60 * 1000);
    expect(() => waitSyncKnowledgeJobsForRecovery(reopened, {
      syncId: current.sync.sync_id,
      commandId: "command-bypass-orphan-evidence",
      reason: "must not bypass liveness evidence",
    })).toThrow("requires blocked or confirmed-orphan ingesting sync");
    expect(listSyncKnowledgeJobs(reopened.db, current.sync.sync_id)).toEqual([
      expect.objectContaining({ status: "processing", revision: 1 }),
    ]);
    const recover = (hasActiveProcess: () => { active: boolean }) => recoverConfirmedOrphanSyncIngest({
      context,
      syncId: current.sync.sync_id,
      expectedRevision: current.sync.revision,
      commandId: "command-resume-processing-knowledge",
      recoveryReason: "operator confirmed the ingest owner exited",
      hasActiveProcess,
      now: staleNow,
    });
    expect(() => recover(() => ({ active: true }))).toThrow("still live");
    expect(() => recover(() => { throw new Error("unreachable"); })).toThrow("could not be determined");
    reopened.db.exec(`CREATE TRIGGER reject_confirmed_orphan_recovery
      BEFORE UPDATE ON sync_state
      BEGIN SELECT RAISE(ABORT, 'reject orphan recovery'); END`);
    expect(() => recover(() => ({ active: false }))).toThrow("reject orphan recovery");
    expect(listSyncKnowledgeJobs(reopened.db, current.sync.sync_id)).toEqual([
      expect.objectContaining({ status: "processing", revision: 1 }),
    ]);
    reopened.db.exec("DROP TRIGGER reject_confirmed_orphan_recovery");
    const sync = recover(() => ({ active: false }));
    expect(sync.status).toBe("ingesting");
    expect(listSyncKnowledgeJobs(reopened.db, sync.sync_id)).toEqual([
      expect.objectContaining({ status: "queued", revision: 3 }),
    ]);
    expect(listGameEvents(reopened.db, { gameId: "melee" }).at(-1)).toMatchObject({
      eventType: "sync.recovered",
      payload: {
        from_status: "ingesting",
        to_status: "ingesting",
        staging_preserved: true,
        staging_discarded: false,
        resume_stage: "ingesting",
      },
    });
    releaseProcessor();
    await expect(staging).rejects.toThrow();
    expect(listSyncKnowledgeJobs(reopened.db, sync.sync_id)).toEqual([
      expect.objectContaining({ status: "queued", revision: 3 }),
    ]);
  });

  test("knowledge-only publication recovery returns to publishing without reopening succeeded jobs", async () => {
    const current = fixture(knowledgeOnlyIntake(), "sync-knowledge-recover-publishing");
    const repo = resolve(current.root, "cycle");
    git(current.root, "init", repo);
    git(repo, "config", "user.email", "sync-test@example.com");
    git(repo, "config", "user.name", "Sync Test");
    writeFileSync(resolve(repo, "cycle.c"), "int cycle = 1;\n", "utf8");
    git(repo, "add", "cycle.c");
    git(repo, "commit", "-m", "cycle head");
    current.store.db.query(
      "UPDATE cycles SET head_revision = ? WHERE cycle_uuid = ?",
    ).run(git(repo, "rev-parse", "HEAD"), current.sync.cycle_uuid);
    const lease = { leaseId: current.leaseId };
    const context: SyncEngineContext = {
      store: current.store,
      stateDir: current.stateDir,
      repoRoot: repo,
      cycleWorktreePath: repo,
      leaseId: lease.leaseId,
    };
    const completed = await completeSyncKnowledgeIngest({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      expectedRevision: current.sync.revision,
      commandId: "command-complete-before-publishing",
      processors: deterministicProcessors(),
      revalidateOwnership: () => {},
    });
    let sync = transitionSync(current.store, completed.sync.sync_id, {
      actor: "operator",
      commandId: "command-enter-publishing",
      correlationId: completed.sync.sync_id,
      expectedRevision: completed.sync.revision,
      patch: { status: "publishing" },
    });
    sync = transitionSync(current.store, sync.sync_id, {
      actor: "runner",
      commandId: "command-block-publishing",
      correlationId: sync.sync_id,
      expectedRevision: sync.revision,
      patch: {
        status: "blocked",
        blockers: [{
          code: "publication_failed",
          message: "fixture boundary transaction failed",
          source_kind: "sync",
          source_id: sync.sync_id,
          recoverable: true,
        }],
      },
    });
    const jobsBefore = listSyncKnowledgeJobs(current.store.db, sync.sync_id);
    const recovered = await recoverSync({
      context,
      syncId: sync.sync_id,
      expectedRevision: sync.revision,
      commandId: "command-recover-publishing",
      choice: "resume",
      recoveryReason: "operator retries the durable publication boundary",
    });
    expect(recovered).toMatchObject({ status: "publishing", staging: null, blockers: [] });
    expect(listSyncKnowledgeJobs(current.store.db, sync.sync_id)).toEqual(jobsBefore);
    expect(jobsBefore).toEqual([expect.objectContaining({ status: "succeeded", revision: 3 })]);
    expect(listGameEvents(current.store.db, { gameId: "melee" }).at(-1)).toMatchObject({
      eventType: "sync.recovered",
      payload: expect.objectContaining({ resume_stage: "publishing" }),
    });
  });

  test("stages independent merged-PR jobs through a bounded pool", async () => {
    const mergedPrIds = ["pr-1", "pr-2", "pr-3", "pr-4", "pr-5", "pr-6"];
    const current = fixture({
      upstream_from: "upstream-pool-old",
      upstream_to: "upstream-pool-new",
      merged_pr_ids: mergedPrIds,
      corpus_batch_ids: [],
      knowledge_only: false,
    }, "sync-knowledge-pool");
    enqueueSyncKnowledgeJobs(current.store, {
      syncId: current.sync.sync_id,
      commandId: "command-enqueue-pool",
    });

    let inFlight = 0;
    let maxInFlight = 0;
    const manifest = await stageSyncKnowledge({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      commandId: "command-stage-pool",
      revalidateOwnership: () => {},
      concurrency: 2,
      processors: {
        async processMergedPr({ job }) {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
          inFlight -= 1;
          return { pr: job.sourceId };
        },
        async processCorpus() {
          throw new Error("pool fixture has no corpus sources");
        },
      },
    });

    expect(maxInFlight).toBe(2);
    expect(inFlight).toBe(0);
    expect(manifest.accepted_job_ids).toHaveLength(mergedPrIds.length);
    expect(manifest.artifacts.map((artifact) => artifact.source_id).sort()).toEqual([...mergedPrIds].sort());
    const jobs = listSyncKnowledgeJobs(current.store.db, current.sync.sync_id);
    expect(jobs.map((job) => job.status)).toEqual(mergedPrIds.map(() => "succeeded"));
  });

  test("pooled ingest lets in-flight jobs finish and blocks with the serial blocker shape on one terminal failure", async () => {
    const current = fixture({
      upstream_from: "upstream-poolfail-old",
      upstream_to: "upstream-poolfail-new",
      merged_pr_ids: ["pr-1", "pr-2", "pr-3", "pr-4"],
      corpus_batch_ids: [],
      knowledge_only: false,
    }, "sync-knowledge-pool-failure");

    const started: string[] = [];
    let signalSecondStarted!: () => void;
    const secondStarted = new Promise<void>((resolveGate) => { signalSecondStarted = resolveGate; });
    let signalFirstFailed!: () => void;
    const firstFailed = new Promise<void>((resolveGate) => { signalFirstFailed = resolveGate; });

    await expect(completeSyncKnowledgeIngest({
      store: current.store,
      stateDir: current.stateDir,
      syncId: current.sync.sync_id,
      expectedRevision: current.sync.revision,
      commandId: "command-complete-pool-failure",
      revalidateOwnership: () => {},
      concurrency: 2,
      processors: {
        async processMergedPr({ job }) {
          started.push(job.sourceId);
          if (job.sourceId === "pr-1") {
            // Fail only once pr-2 is provably in flight, so the assertion
            // below shows the pool finished it instead of killing it.
            await secondStarted;
            signalFirstFailed();
            throw new Error("pr-1 ingest exploded after retries");
          }
          if (job.sourceId === "pr-2") {
            signalSecondStarted();
            await firstFailed;
            await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
            return { pr: job.sourceId };
          }
          throw new Error(`pool fed ${job.sourceId} after a terminal failure`);
        },
        async processCorpus() {
          throw new Error("pool failure fixture has no corpus sources");
        },
      },
    })).rejects.toThrow("Sync knowledge ingest failed: pr-1 ingest exploded after retries");

    expect(started.sort()).toEqual(["pr-1", "pr-2"]);
    expect(getSyncState(current.store, current.sync.sync_id)).toMatchObject({
      status: "blocked",
      blockers: [expect.objectContaining({
        code: "knowledge_stage_failed",
        message: expect.stringContaining("pr-1 ingest exploded after retries"),
        recoverable: true,
      })],
    });
    const statusesBySource = new Map(
      listSyncKnowledgeJobs(current.store.db, current.sync.sync_id)
        .map((job) => [job.sourceId, job.status]),
    );
    expect(statusesBySource.get("pr-1")).toBe("failed");
    expect(statusesBySource.get("pr-2")).toBe("succeeded");
    expect(statusesBySource.get("pr-3")).toBe("queued");
    expect(statusesBySource.get("pr-4")).toBe("queued");
    expect(existsSync(syncKnowledgeManifestPath(current.stateDir, current.sync.sync_id))).toBe(false);
  });
});
