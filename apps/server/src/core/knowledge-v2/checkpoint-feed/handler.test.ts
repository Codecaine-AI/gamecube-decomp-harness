import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, writeFileSync } from "node:fs";

import { updateAgentRunStatus } from "@agent-kernel/db";
import { runTraceDoctor } from "@agent-kernel/kernel/doctor";
import {
  createFakeCallEngine,
  createTempKernel,
  disableNetwork,
  FAKE_CALL_MODEL_REF,
  fakeFailure,
  fakeOk,
  fakePiModels,
  untilAborted,
  type FakeCallResponse,
  type TempKernel,
} from "@agent-kernel/kernel/model-nodes/testing";

import type { ConfirmedCheckpointInput, ConfirmedCheckpointKnowledge } from "@server/generated/baml_client/types";
import { claimJobByDedupeKey, enqueueJob, getJobByDedupeKey } from "@server/core/job-queue/kernel.js";
import type { JobRecord, JobResult } from "@server/core/job-queue/types.js";
import { catchUpKnowledge } from "@server/core/model-node-work/catch-up.js";
import { startModelNodeLanes } from "@server/core/model-node-work/index.js";
import type { ModelNodeHandlerContext } from "@server/core/model-node-work/lane.js";
import { NODE_CALL_MANIFESTS, type NodeFunctionName } from "@server/infrastructure/kernel/nodes/functions.js";
import type { NodeCalls, WorkerNodeKernel } from "@server/infrastructure/kernel/nodes/node-kernel.js";

import { createSharedGate } from "../apply/index.js";
import type { DriftReport } from "../drift/flagger.js";
import { claimNextLibrarianTask, runLibrarianPass, type LibrarianRunOptions } from "../librarian/consumer.js";
import {
  alwaysAncestor,
  createFeedFixture,
  enableKnowledgeLane,
  INFO_FINDING,
  NOTE,
  PATCH,
  seedCheckpoint,
  seedKnowledgeSubmission,
  seedSettledEpoch,
  SOURCE_PATH,
  SYMBOL,
  UNIT,
  WARNING_FINDING,
  type FeedFixture,
} from "./__fixtures__/feed-fixture.js";
import { sha256Hex } from "./confirmed-good.js";
import {
  CHECKPOINT_KNOWLEDGE_CALL_TIMEOUT_MS,
  checkpointKnowledgeRetry,
  createCheckpointKnowledgeHandler,
  extractionBinding,
  SUBMISSION_RETRY,
  submissionRetryBackoffMs,
  SubmissionNotYetIngested,
  type CheckpointKnowledgeHandlerDeps,
} from "./handler.js";
import type { CheckpointConfirmedPayload } from "./payload.js";

let restoreNetwork: () => void;
beforeAll(() => {
  restoreNetwork = disableNetwork();
});
afterAll(() => {
  restoreNetwork();
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function fixture(name: string): FeedFixture {
  const f = createFeedFixture(name);
  cleanups.push(() => f.cleanup());
  return f;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function waitFor(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await sleep(10);
  }
}

/** A knowledge extraction that keeps every advisory it is handed. */
function extracted(input: ConfirmedCheckpointInput): ConfirmedCheckpointKnowledge {
  return {
    tactics: [{
      name: "Hoist the loop bound into a local",
      description: "Hoisting the bound into a local frees r31 for the counter.",
      applies_when: "a loop re-reads its bound through a pointer",
      evidence: ["Hoisting the loop bound into a local freed r31 for the counter; objdiff 100%."],
    }],
    codegen_quirks: [],
    type_facts: [{ subject: "lbl_804DA6C4", fact: "is read as char* through r13", evidence: ["MWCC loads lbl_804DA6C4 through r13 only with the char** view."] }],
    idioms: [],
    kept_advisories: input.advisories.map((advisory) => ({
      finding_id: advisory.id,
      kept: true,
      justification: advisory.severity === "info" ? "sp20 keeps the stack offset 0x20." : "MWCC loads through r13 only with the char** view.",
      evidence: ["objdiff 100%"],
    })),
  };
}

interface NodeHarness {
  temp: TempKernel<NodeCalls>;
  kernel: WorkerNodeKernel;
  inputs: ConfirmedCheckpointInput[];
  /** The operation deadline each engine invocation received. */
  timeouts: number[];
}

async function nodeHarness(
  respond: (input: ConfirmedCheckpointInput, request: { signal?: AbortSignal }) => FakeCallResponse | Promise<FakeCallResponse> = (input) => fakeOk(extracted(input)),
): Promise<NodeHarness> {
  const inputs: ConfirmedCheckpointInput[] = [];
  const timeouts: number[] = [];
  const engine = createFakeCallEngine<NodeCalls>({
    functions: Object.keys(NODE_CALL_MANIFESTS) as NodeFunctionName[],
    respond: (request) => {
      const input = (request.args as unknown[])[0] as ConfirmedCheckpointInput;
      inputs.push(input);
      timeouts.push(request.timeoutMs);
      return respond(input, request);
    },
  });
  const temp = await createTempKernel<NodeCalls>({
    calls: { engine },
    nodes: { piModels: fakePiModels() },
    models: { defaults: { call: FAKE_CALL_MODEL_REF } },
  });
  cleanups.push(() => temp.cleanup());
  return { temp, kernel: temp.kernel, inputs, timeouts };
}

function deps(f: FeedFixture, harness: NodeHarness, overrides: CheckpointKnowledgeHandlerDeps = {}): CheckpointKnowledgeHandlerDeps {
  return {
    nodeKernel: async () => harness.kernel,
    openKnowledgeStore: () => f.openKnowledge(),
    callContainer: async () => harness.temp.tempDb.containerId,
    isAncestor: alwaysAncestor,
    ...overrides,
  };
}

/** Enqueues and claims the checkpoint's job, returning it with a handler context. */
function claimed(f: FeedFixture, checkpointId: string, ensureClaim: () => void = () => {}) {
  enqueueJob(f.store, {
    kind: "checkpoint_knowledge",
    dedupeKey: checkpointId,
    gameId: "melee",
    runId: "run-a",
    payload: { checkpointId, epochId: "epoch-1", integrationId: `integration-${checkpointId}` },
  });
  const claim = claimJobByDedupeKey(f.store, { kind: "checkpoint_knowledge", dedupeKey: checkpointId, leaseMs: 60_000 });
  if (!claim) throw new Error(`job for ${checkpointId} not claimable`);
  const ctx: ModelNodeHandlerContext = { store: f.store, token: claim.token, signal: new AbortController().signal, ensureClaim };
  return { job: claim.job, ctx };
}

function recordedOutcome(f: FeedFixture, checkpointId: string): Record<string, unknown> | null {
  const row = f.store.db.query<{ outcome: string | null }, [string]>(
    "SELECT json_extract(metadata_json, '$.checkpoint_knowledge') AS outcome FROM worker_checkpoints WHERE id = ?",
  ).get(checkpointId);
  return row?.outcome ? JSON.parse(row.outcome) as Record<string, unknown> : null;
}

function tasks(f: FeedFixture): Array<{ id: string; pathway: string; payload: CheckpointConfirmedPayload }> {
  const knowledge = f.openKnowledge();
  try {
    return knowledge.db.query<{ id: string; pathway: string; payload: string }, []>(
      "SELECT id, pathway, payload FROM index_task ORDER BY id",
    ).all().map((row) => ({ ...row, payload: JSON.parse(row.payload) as CheckpointConfirmedPayload }));
  } finally {
    knowledge.close();
  }
}

/** A settled epoch with one integrated checkpoint and, unless `submission` is false, its knowledge submission. */
function seedConfirmed(f: FeedFixture, options: { checkpointId?: string; submission?: boolean; seq?: number; findings?: typeof WARNING_FINDING[]; metadata?: Record<string, unknown> } = {}) {
  const checkpointId = options.checkpointId ?? "cp-1";
  seedSettledEpoch(f, { id: "epoch-1", runId: "run-a" });
  const checkpoint = seedCheckpoint(f, {
    id: checkpointId, epochId: "epoch-1", runId: "run-a", exact: true,
    ...(options.findings ? { findings: options.findings } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  });
  let submission: ReturnType<typeof seedKnowledgeSubmission> | null = null;
  if (options.submission !== false) {
    const knowledge = f.openKnowledge();
    try {
      submission = seedKnowledgeSubmission(knowledge, { checkpointId, workerStateId: checkpoint.workerStateId, seq: options.seq ?? 1 });
    } finally {
      knowledge.close();
    }
  }
  return { checkpoint, submission };
}

type FakeRunPiAgent = NonNullable<LibrarianRunOptions["runPiAgent"]>;
function modelResult(value: unknown): ReturnType<FakeRunPiAgent> {
  return Promise.resolve({
    sessionId: "fake-session",
    sessionDir: "/tmp/fake-session",
    outputPath: "/tmp/fake-output",
    systemPromptPath: "/tmp/fake-system",
    userPromptPath: "/tmp/fake-user",
    rawText: JSON.stringify(value),
    dryRun: false,
    failed: false,
  });
}

function cleanDrift(subject: DriftReport["subject"]): DriftReport {
  return { subject, head_revision: "fixture-head", evidence: [], drifted_count: 0, unresolvable_count: 0 };
}

describe("checkpoint_knowledge handler", () => {
  test("end to end with advisoryAdjudication = off: settled epoch → selection → extraction (fake engine) → index_task → buildCheckpointConfirmedContext → librarian consumer with a fake agent (S14)", async () => {
    const f = fixture("e2e");
    const harness = await nodeHarness();
    enableKnowledgeLane(f.store);
    // No llm_review_candidate: the worker ran with adjudication off.
    const { checkpoint, submission } = seedConfirmed(f, { seq: 3 });

    expect(catchUpKnowledge(f.store)).toBe(1);
    const lanes = startModelNodeLanes({
      store: f.store,
      config: { adjudication: false, knowledge: true },
      handlers: { checkpoint_adjudication: null, checkpoint_knowledge: createCheckpointKnowledgeHandler(f.globals, deps(f, harness)) },
      lane: { intervalMs: 10 },
      log: () => {},
    });
    try {
      await waitFor(() => getJobByDedupeKey(f.store, "checkpoint_knowledge", "cp-1")?.status === "succeeded");
    } finally {
      await lanes.stop({ maxWaitMs: 1_000 });
    }

    // The extraction saw the target, the raw note, bounded hunks of the target's source and every advisory, info included.
    expect(harness.inputs).toHaveLength(1);
    // The out-of-band extraction gets its own deadline, not the node kernel's 60 s default.
    expect(harness.timeouts).toEqual([CHECKPOINT_KNOWLEDGE_CALL_TIMEOUT_MS]);
    expect(CHECKPOINT_KNOWLEDGE_CALL_TIMEOUT_MS).toBe(180_000);
    const input = harness.inputs[0]!;
    expect(input).toMatchObject({ unit: UNIT, function_name: SYMBOL, target_key: `${UNIT}::${SYMBOL}`, exact: true, note: NOTE });
    expect(input.hunks).toHaveLength(1);
    expect(input.hunks[0]!.startsWith(SOURCE_PATH)).toBe(true);
    expect(input.advisories.map((advisory) => [advisory.id, advisory.rule_id, advisory.severity])).toEqual([
      ["advisory-1", "type_erasing_cast", "warning"],
      ["advisory-2", "stack_local_name", "info"],
    ]);
    expect("prior_adjudication" in input).toBe(false);

    // One task, payload schema and digests of the exact evidence bytes.
    const [task, ...rest] = tasks(f);
    expect(rest).toEqual([]);
    expect(task!.id).toBe("task:checkpoint_confirmed:cp-1");
    expect(task!.pathway).toBe("checkpoint_confirmed");
    const payload = task!.payload;
    expect(payload).toMatchObject({
      schema: "checkpoint_confirmed_v1",
      checkpoint_id: "cp-1",
      worker_run_id: submission!.workerRunId,
      submission_id: submission!.submissionId,
      submission_seq: 3,
      epoch_id: "epoch-1",
      integration_id: "integration-cp-1",
      confirmation: "epoch-settled",
      target: { key: `${UNIT}::${SYMBOL}`, knowledge_key: `${UNIT}:${SYMBOL}`, unit: UNIT, function: SYMBOL },
    });
    expect(payload.sources).toMatchObject({
      note_sha256: sha256Hex(readFileSync(checkpoint.notePath!)),
      patch_sha256: sha256Hex(readFileSync(checkpoint.patchPath!)),
      runner_summary_sha256: sha256Hex(readFileSync(checkpoint.runnerSummaryPath!)),
      adjudication_sha256: null,
    });
    expect(payload.facts.map((fact) => [fact.kind, fact.subject])).toEqual([
      ["tactic", "Hoist the loop bound into a local"],
      ["type_fact", "lbl_804DA6C4"],
    ]);
    expect(payload.facts[0]!.key).toBe(`tactic|${UNIT}|${SYMBOL}|${sha256Hex("hoist the loop bound into a local")}`);
    expect(payload.kept_advisories.map((advisory) => [advisory.rule_id, advisory.severity, advisory.verdict])).toEqual([
      ["type_erasing_cast", "warning", null],
      ["stack_local_name", "info", null],
    ]);
    expect(payload.kept_advisories.every((advisory) => advisory.fingerprint?.startsWith("af2:"))).toBe(true);
    expect(typeof payload.extraction.kernel_run_id).toBe("string");
    expect(recordedOutcome(f, "cp-1")).toMatchObject({ status: "enqueued", task_id: "task:checkpoint_confirmed:cp-1", facts: 2, kept_advisories: 2 });

    // The call is a traced node in the kernel database, and the trace is consistent.
    const traceDb = new Database(harness.temp.tempDb.path, { readonly: true });
    try {
      expect(traceDb.query("SELECT status FROM agent_runs WHERE id = ?").get(payload.extraction.kernel_run_id)).toEqual({ status: "done" });
    } finally {
      traceDb.close();
    }
    expect((await runTraceDoctor(harness.temp.tempDb.db)).violations).toEqual([]);

    // The librarian consumer claims the task, builds the checkpoint_confirmed context and applies a fact citing the submission.
    const locator = `attempt://run/${submission!.workerRunId}/submission/3`;
    const knowledge = f.openKnowledge();
    try {
      const now = "2026-10-07T12:00:00.000Z";
      const claimedTask = claimNextLibrarianTask(knowledge, { now: () => now })!.task;
      expect(claimedTask.id).toBe("task:checkpoint_confirmed:cp-1");
      let renderedContext = "";
      const result = await runLibrarianPass(knowledge, claimedTask, {
        runId: "feed-e2e-librarian",
        globals: f.globals,
        sharedWriteGate: createSharedGate(),
        runPiAgent: (options) => {
          renderedContext = options.prompt.kernelContext?.renderedContext ?? "";
          return modelResult({
            facts: [{
              subject: { target_stable_key: `${UNIT}:${SYMBOL}` },
              type: "state_behavior",
              op: "write",
              value: "Keeps its loop bound in a local so the counter lives in r31.",
              rationale: "The confirmed checkpoint hoisted the bound and matched.",
              confidence: 0.8,
              evidence: [{ kind: "attempt", locator, why: "The confirmed submission hoists the bound." }],
            }],
            links: [],
            entities: [],
            merges: [],
          });
        },
        flagCodeDrift: (_store, options) => cleanDrift(options.subject),
        now: () => now,
      });
      expect(renderedContext).toContain("checkpoint_confirmed");
      expect(renderedContext).toContain(locator);
      expect(renderedContext).toContain("Hoist the loop bound into a local");
      expect(result.applyReport.counts).toEqual({ applied: 1, rejected: 0, skipped: 0 });
      expect(knowledge.db.query("SELECT kind, locator FROM evidence").all()).toEqual([{ kind: "attempt", locator }]);
      expect(knowledge.db.query("SELECT done_at FROM index_task WHERE id = ?").get("task:checkpoint_confirmed:cp-1")).toEqual({ done_at: now });
    } finally {
      knowledge.close();
    }
  });

  test("submission resolved through runtime_ref; missing submission retries on the long schedule, then terminal, then re-enqueued once ingested", async () => {
    const f = fixture("submission");
    const harness = await nodeHarness();
    enableKnowledgeLane(f.store);
    const { checkpoint } = seedConfirmed(f, { checkpointId: "cp-unsubmitted", submission: false });
    expect(catchUpKnowledge(f.store)).toBe(1);

    const lanes = startModelNodeLanes({
      store: f.store,
      config: { adjudication: false, knowledge: true },
      handlers: { checkpoint_adjudication: null, checkpoint_knowledge: createCheckpointKnowledgeHandler(f.globals, deps(f, harness)) },
      lane: { intervalMs: 10, maxAttempts: 2 },
      log: () => {},
    });
    const job = () => getJobByDedupeKey(f.store, "checkpoint_knowledge", "cp-unsubmitted");
    const backoff = () => Date.parse(job()!.nextAttemptAt!) - Date.parse(job()!.updatedAt);
    const dueNow = () => f.store.db.query("UPDATE jobs SET next_attempt_at = ? WHERE kind = 'checkpoint_knowledge'")
      .run(new Date(Date.now() - 1_000).toISOString());
    const ingested = (_gameId: string, ids: readonly string[]) => {
      const knowledge = f.openKnowledge();
      try {
        return new Set(ids.filter((id) => knowledge.db.query("SELECT 1 FROM submission WHERE runtime_ref = ?").get(id) !== null));
      } finally {
        knowledge.close();
      }
    };
    try {
      // Not ingested yet: retryable on the long schedule, past the lane's maxAttempts of 2.
      await waitFor(() => job()?.status === "waiting" && job()?.attempts === 1);
      expect(job()?.error).toContain("submission-not-found");
      expect(backoff()).toBe(60_000);
      dueNow();
      await waitFor(() => job()?.status === "waiting" && job()?.attempts === 2);
      expect(backoff()).toBe(120_000);

      // The sixteenth retry closes the six-hour window: terminal with the reason.
      f.store.db.query("UPDATE jobs SET attempts = 16 WHERE kind = 'checkpoint_knowledge'").run();
      dueNow();
      await waitFor(() => job()?.status === "failed");
      expect(job()).toMatchObject({ attempts: 17 });
      expect(job()?.error).toContain("submission-not-found");
      expect(job()?.completedAt).not.toBeNull();

      // Catch-up re-enqueues it only once its submission exists, and only once.
      expect(catchUpKnowledge(f.store, { ingestedSubmissions: ingested })).toBe(0);
      expect(job()?.status).toBe("failed");
      const knowledge = f.openKnowledge();
      let submission: ReturnType<typeof seedKnowledgeSubmission>;
      try {
        submission = seedKnowledgeSubmission(knowledge, { checkpointId: "cp-unsubmitted", workerStateId: checkpoint.workerStateId, seq: 3 });
      } finally {
        knowledge.close();
      }
      expect(catchUpKnowledge(f.store, { ingestedSubmissions: ingested })).toBe(1);
      expect(catchUpKnowledge(f.store, { ingestedSubmissions: ingested })).toBe(0);
      await waitFor(() => job()?.status === "succeeded");
      expect(tasks(f).map((task) => [task.id, task.payload.submission_id, task.payload.submission_seq, task.payload.worker_run_id])).toEqual([
        ["task:checkpoint_confirmed:cp-unsubmitted", submission.submissionId, 3, submission.workerRunId],
      ]);
    } finally {
      await lanes.stop({ maxWaitMs: 1_000 });
    }
    // No model call is paid while the checkpoint cannot be cited: one call, after the submission arrived.
    expect(harness.inputs).toHaveLength(1);
  });

  test("the submission retry schedule: one minute doubling to 30, terminal after six hours, other errors untouched", () => {
    const record = (attempts: number) => ({ attempts }) as JobRecord;
    const missing = new SubmissionNotYetIngested("cp-1");
    expect([1, 2, 3, 4, 5, 6, 7, 16].map((attempt) => submissionRetryBackoffMs(attempt) / 60_000)).toEqual([1, 2, 4, 8, 16, 30, 30, 30]);
    let waitedMs = 0;
    let attempt = 1;
    for (; ; attempt += 1) {
      const decision = checkpointKnowledgeRetry(record(attempt), missing)!;
      expect(decision.backoffMs).toBe(submissionRetryBackoffMs(attempt));
      if (decision.terminal) break;
      waitedMs += decision.backoffMs;
    }
    expect(attempt).toBe(17);
    expect(waitedMs).toBeGreaterThanOrEqual(SUBMISSION_RETRY.windowMs);
    expect(checkpointKnowledgeRetry(record(1), new Error("submission-not-found lookalike"))).toBeNull();
    expect(checkpointKnowledgeRetry(record(1), new Error("node kernel unavailable"))).toBeNull();
  });

  test("info-advisory checkpoint is extracted and fed; a checkpoint with no advisory too", async () => {
    const f = fixture("info");
    const harness = await nodeHarness();
    seedConfirmed(f, { checkpointId: "cp-info", findings: [INFO_FINDING] });
    const handler = createCheckpointKnowledgeHandler(f.globals, deps(f, harness));
    const first = claimed(f, "cp-info");
    expect((await handler(first.job, first.ctx)).detail).toMatchObject({ status: "enqueued", advisories: 1, kept_advisories: 1 });
    expect(harness.inputs[0]!.advisories.map((advisory) => advisory.severity)).toEqual(["info"]);
    const infoPayload = tasks(f)[0]!.payload;
    expect(infoPayload.kept_advisories).toMatchObject([{ rule_id: "stack_local_name", severity: "info", justification: "sp20 keeps the stack offset 0x20." }]);

    // D1: every confirmed-good checkpoint, with or without advisories.
    const checkpoint = seedCheckpoint(f, { id: "cp-none", epochId: "epoch-1", runId: "run-a", symbol: "fn_none", findings: [] });
    const knowledge = f.openKnowledge();
    try {
      seedKnowledgeSubmission(knowledge, { checkpointId: "cp-none", workerStateId: checkpoint.workerStateId, symbol: "fn_none" });
    } finally {
      knowledge.close();
    }
    const second = claimed(f, "cp-none");
    expect((await handler(second.job, second.ctx)).detail).toMatchObject({ status: "enqueued", advisories: 0, kept_advisories: 0 });
    expect(tasks(f).map((task) => task.id)).toEqual(["task:checkpoint_confirmed:cp-info", "task:checkpoint_confirmed:cp-none"]);
  });

  test("sources: a changed patch between assembly and enqueue skips with evidence-changed", async () => {
    const f = fixture("changed");
    const { checkpoint } = seedConfirmed(f);
    // The patch changes while the extraction runs.
    const harness = await nodeHarness((input) => {
      writeFileSync(checkpoint.patchPath!, `${PATCH}\n# rewritten\n`);
      return fakeOk(extracted(input));
    });
    const handler = createCheckpointKnowledgeHandler(f.globals, deps(f, harness));
    const { job, ctx } = claimed(f, "cp-1");
    const result = await handler(job, ctx);
    expect(result.detail).toEqual({ status: "skipped", reason: "evidence-changed", changed: ["patch_sha256"] });
    expect(recordedOutcome(f, "cp-1")).toMatchObject({ status: "skipped", reason: "evidence-changed" });
    expect(tasks(f)).toEqual([]);
  });

  test("enqueue is idempotent across retries", async () => {
    const f = fixture("idempotent");
    const harness = await nodeHarness();
    seedConfirmed(f);
    const handler = createCheckpointKnowledgeHandler(f.globals, deps(f, harness));

    // Attempt 1 extracts, then loses its claim right before the knowledge write: nothing is written.
    let lost = true;
    const first = claimed(f, "cp-1", () => {
      if (lost && harness.inputs.length > 0) throw new Error("claim lost");
    });
    await expect(handler(first.job, first.ctx)).rejects.toThrow("claim lost");
    expect(tasks(f)).toEqual([]);
    expect(recordedOutcome(f, "cp-1")).toBeNull();
    const binding = extractionBinding(f.store, "cp-1")!;
    expect(binding).toMatchObject({ request_id: "checkpoint_confirmed:cp-1" });
    expect(typeof binding.kernel_run_id).toBe("string");

    // Attempt 2 replays the finished extraction by request id (no second engine call) and enqueues once,
    // citing the bound attempt's kernel run, which a replay does not report.
    lost = false;
    const second = await handler(first.job, first.ctx);
    expect(second.detail).toMatchObject({ status: "enqueued", task_id: "task:checkpoint_confirmed:cp-1", kernel_run_id: binding.kernel_run_id });
    expect(harness.inputs).toHaveLength(1);
    expect(tasks(f).map((task) => task.id)).toEqual(["task:checkpoint_confirmed:cp-1"]);
    expect(tasks(f)[0]!.payload.extraction.kernel_run_id).toBe(binding.kernel_run_id);
    expect(tasks(f)[0]!.payload.sources).toEqual(binding.sources);
    const traceDb = new Database(harness.temp.tempDb.path, { readonly: true });
    try {
      expect(traceDb.query(`SELECT COUNT(*) AS count FROM agent_runs r
        JOIN pi_agent_sessions s ON s.id = r.pi_session_id WHERE s.kind = 'call'`).get()).toEqual({ count: 1 });
    } finally {
      traceDb.close();
    }

    // Any later attempt finds the task, rewrites nothing and keeps the recorded outcome.
    const before = tasks(f);
    const recorded = recordedOutcome(f, "cp-1");
    const third: JobResult = await handler(first.job, first.ctx);
    expect(third).toEqual({ resultRef: "task:checkpoint_confirmed:cp-1", detail: { status: "enqueued", task_id: "task:checkpoint_confirmed:cp-1", reused: true } });
    expect(tasks(f)).toEqual(before);
    expect(recordedOutcome(f, "cp-1")).toEqual(recorded);
    expect(harness.inputs).toHaveLength(1);
  });

  test("a replay after an aborted attempt and a fresh one cites the fresh run whose output it returns", async () => {
    const f = fixture("rebind-run");
    // Attempt A runs until the lane aborts it; every later invocation answers.
    const aborting = await nodeHarness(async (input, request) => {
      if (aborting.inputs.length === 1) await untilAborted(request.signal);
      return fakeOk(extracted(input));
    });
    seedConfirmed(f);
    const handler = createCheckpointKnowledgeHandler(f.globals, deps(f, aborting));

    // A: aborted mid-call (the lane stopping); the job retries.
    const lane = new AbortController();
    const first = claimed(f, "cp-1");
    const attemptA = handler(first.job, { ...first.ctx, signal: lane.signal });
    await waitFor(() => aborting.inputs.length === 1);
    lane.abort(new Error("lane stopped"));
    await expect(attemptA).rejects.toThrow();
    const runA = extractionBinding(f.store, "cp-1")!.kernel_run_id;
    expect(typeof runA).toBe("string");

    // B: a fresh run under the same request id answers, then the enqueue loses its claim.
    let lost = true;
    const retry = { ...first.ctx, ensureClaim: () => { if (lost && aborting.inputs.length > 1) throw new Error("claim lost"); } };
    await expect(handler(first.job, retry)).rejects.toThrow("claim lost");
    expect(aborting.inputs).toHaveLength(2);
    const runB = extractionBinding(f.store, "cp-1")!.kernel_run_id;
    expect(runB).not.toBe(runA);

    // The next retry replays B's output (no third engine call) and cites B.
    lost = false;
    expect((await handler(first.job, retry)).detail).toMatchObject({ status: "enqueued", kernel_run_id: runB });
    expect(aborting.inputs).toHaveLength(2);
    expect(tasks(f)[0]!.payload.extraction.kernel_run_id).toBe(runB);
    const traceDb = new Database(aborting.temp.tempDb.path, { readonly: true });
    try {
      expect(traceDb.query("SELECT id, status FROM agent_runs WHERE id IN (?, ?) ORDER BY started_at").all(runA, runB)).toEqual([
        { id: runA, status: "aborted" },
        { id: runB, status: "done" },
      ]);
    } finally {
      traceDb.close();
    }
  });

  test("a retry whose evidence changed after the bound extraction skips with evidence-changed and enqueues nothing stale", async () => {
    const f = fixture("rebind");
    const harness = await nodeHarness();
    const { checkpoint } = seedConfirmed(f);
    const handler = createCheckpointKnowledgeHandler(f.globals, deps(f, harness));

    // Attempt 1: the extraction succeeds on the original patch, then the enqueue loses its claim.
    let lost = true;
    const first = claimed(f, "cp-1", () => {
      if (lost && harness.inputs.length > 0) throw new Error("claim lost");
    });
    await expect(handler(first.job, first.ctx)).rejects.toThrow("claim lost");
    const bound = extractionBinding(f.store, "cp-1")!;
    expect(bound.sources.patch_sha256).toBe(sha256Hex(PATCH));

    // Between attempts the patch changes. A replay would return attempt 1's facts for the old patch.
    writeFileSync(checkpoint.patchPath!, `${PATCH}\n# rewritten between attempts\n`);
    lost = false;
    const second = await handler(first.job, first.ctx);
    // A line outside every hunk: the patch digest moved, the extraction input did not.
    expect(second.detail).toMatchObject({ status: "skipped", reason: "evidence-changed", changed: ["patch_sha256"] });
    expect(recordedOutcome(f, "cp-1")).toMatchObject({ status: "skipped", reason: "evidence-changed" });
    expect(tasks(f)).toEqual([]);
    expect(harness.inputs).toHaveLength(1);
    // The binding stands as attempt 1 wrote it.
    expect(extractionBinding(f.store, "cp-1")).toEqual(bound);

    // The input is bound too: a score that moved between attempts is a different extraction.
    const other = seedCheckpoint(f, { id: "cp-2", epochId: "epoch-1", runId: "run-a", symbol: "fn_two" });
    const knowledge = f.openKnowledge();
    try {
      seedKnowledgeSubmission(knowledge, { checkpointId: "cp-2", workerStateId: other.workerStateId, symbol: "fn_two" });
    } finally {
      knowledge.close();
    }
    lost = true;
    const retry = claimed(f, "cp-2", () => {
      if (lost && harness.inputs.length > 1) throw new Error("claim lost");
    });
    await expect(handler(retry.job, retry.ctx)).rejects.toThrow("claim lost");
    f.store.db.query("UPDATE worker_checkpoints SET new_score = 99 WHERE id = 'cp-2'").run();
    lost = false;
    expect((await handler(retry.job, retry.ctx)).detail).toMatchObject({ status: "skipped", reason: "evidence-changed", changed: ["input_sha256"] });
    expect(tasks(f)).toEqual([]);
    expect(harness.inputs).toHaveLength(2);
  });

  test("an extraction failure is recorded, enqueues nothing and completes the job", async () => {
    const f = fixture("extraction-error");
    const harness = await nodeHarness(() => fakeFailure({ kind: "http", status: 503 }));
    seedConfirmed(f);
    const handler = createCheckpointKnowledgeHandler(f.globals, deps(f, harness));
    const { job, ctx } = claimed(f, "cp-1");
    const result = await handler(job, ctx);
    expect(result.detail).toMatchObject({ status: "extraction-error", error_kind: "http" });
    expect(typeof result.detail?.kernel_run_id).toBe("string");
    expect(recordedOutcome(f, "cp-1")).toMatchObject({ status: "extraction-error", error_kind: "http" });
    expect(tasks(f)).toEqual([]);
  });

  test("not-confirmed and missing evidence complete with their reason, before any model call", async () => {
    const f = fixture("not-confirmed");
    const harness = await nodeHarness();
    seedSettledEpoch(f, { id: "epoch-1", runId: "run-a" });
    seedCheckpoint(f, { id: "cp-conflict", epochId: "epoch-1", runId: "run-a", integrationStatus: "conflict" });
    seedCheckpoint(f, { id: "cp-no-note", epochId: "epoch-1", runId: "run-a", symbol: "fn_no_note", notePath: null });
    const handler = createCheckpointKnowledgeHandler(f.globals, deps(f, harness));

    const conflict = claimed(f, "cp-conflict");
    expect((await handler(conflict.job, conflict.ctx)).detail).toEqual({ status: "not-confirmed", rule: 1, reason: "integration-not-applied", detail: { status: "conflict" } });
    const noNote = claimed(f, "cp-no-note");
    expect((await handler(noNote.job, noNote.ctx)).detail).toEqual({ status: "skipped", reason: "evidence-missing", missing: ["note"] });
    expect(recordedOutcome(f, "cp-no-note")).toMatchObject({ status: "skipped", reason: "evidence-missing" });
    expect(harness.inputs).toEqual([]);
    expect(tasks(f)).toEqual([]);
  });

  test("the extraction hangs under the worker's kernel run when it has one, else under the container", async () => {
    const f = fixture("parent");
    const harness = await nodeHarness();
    const workerRun = await harness.temp.tempDb.seedParentRun({ agentName: "worker", trigger: "operator" });
    await updateAgentRunStatus(harness.temp.tempDb.db, workerRun.runId, "done", { endedAt: new Date().toISOString() });
    const candidate = (runId: string) => ({ llm_review_candidate: { schema: "llm_review_candidate_v1", mode: "shadow", eligible: true, kernel: { run_id: runId, container_id: "c", pi_session_id: "s" } } });
    seedConfirmed(f, { checkpointId: "cp-parented", metadata: candidate(workerRun.runId) });
    const foreign = seedCheckpoint(f, { id: "cp-foreign", epochId: "epoch-1", runId: "run-a", symbol: "fn_foreign", metadata: candidate("run-in-another-kernel-db") });
    const knowledge = f.openKnowledge();
    try {
      seedKnowledgeSubmission(knowledge, { checkpointId: "cp-foreign", workerStateId: foreign.workerStateId, symbol: "fn_foreign" });
    } finally {
      knowledge.close();
    }
    const handler = createCheckpointKnowledgeHandler(f.globals, deps(f, harness));
    for (const id of ["cp-parented", "cp-foreign"]) {
      const { job, ctx } = claimed(f, id);
      expect((await handler(job, ctx)).detail).toMatchObject({ status: "enqueued" });
    }

    const traceDb = new Database(harness.temp.tempDb.path, { readonly: true });
    try {
      const extractionRun = (checkpointId: string) => {
        const task = tasks(f).find((row) => row.payload.checkpoint_id === checkpointId)!;
        return traceDb.query("SELECT trigger, parent_run_id, container_id FROM agent_runs WHERE id = ?").get(task.payload.extraction.kernel_run_id);
      };
      expect(extractionRun("cp-parented")).toEqual({ trigger: "post-run", parent_run_id: workerRun.runId, container_id: harness.temp.tempDb.containerId });
      // A worker run outside this kernel database: the call hangs on the container instead.
      expect(extractionRun("cp-foreign")).toEqual({ trigger: "post-run", parent_run_id: null, container_id: harness.temp.tempDb.containerId });
    } finally {
      traceDb.close();
    }
  });
});
