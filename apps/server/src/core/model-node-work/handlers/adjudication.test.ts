import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { updateAgentRunStatus } from "@agent-kernel/db";
import { runTraceDoctor } from "@agent-kernel/kernel/doctor";
import type { DecisionEngine, EngineRequest, EngineResult } from "@agent-kernel/kernel/model-nodes";
import {
  createFakeCallEngine,
  createTempKernel,
  disableNetwork,
  FAKE_CALL_MODEL_REF,
  fakeFailure,
  fakeOk,
  fakePiModels,
  type FakeCallResponse,
  type TempKernel,
} from "@agent-kernel/kernel/model-nodes/testing";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { openState, type StateStore } from "@server/core/harness-runtime/run-state";
import { claimNextJob, failJob, verifyClaimToken } from "@server/core/job-queue/kernel.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";
import { NODE_CALL_MANIFESTS, type NodeFunctionName } from "@server/infrastructure/kernel/nodes/functions.js";
import type { NodeCalls, WorkerNodeKernel } from "@server/infrastructure/kernel/nodes/node-kernel.js";

import { catchUpAdjudication, ensureModelNodeLaneState, startModelNodeLanes } from "../index.js";
import { adjudicateAdvisories } from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/index.js";
import { createAdjudicationHandler, type AdjudicationHandlerDeps } from "./adjudication.js";

const FILE = "src/melee/gm/gmtoulib.c";
const PATCH = [
  `diff --git a/${FILE} b/${FILE}`,
  `--- a/${FILE}`,
  `+++ b/${FILE}`,
  "@@ -10,3 +10,6 @@ void gmtoulib_fn(void)",
  " {",
  "+    templates_800[0] = *(char**) &lbl_804DA6C4;",
  "+    u32 sp1C = *(u32*) &lbl_804DA6C8;",
  "+    f32 sp20 = 0.0f;",
  "     return;",
  " }",
  "",
].join("\n");
const NOTE = [
  "Matched gmtoulib_fn.",
  "kept_advisories:",
  "- rule_id: type_erasing_cast, line 11: MWCC loads lbl_804DA6C4 through r13 only with the char** view; objdiff 100%.",
  "- rule_id: type_erasing_cast, line 12: the u32 view keeps the lwz at 0x1C; without it the stack offset moves.",
].join("\n");

const FINDINGS: QaScanFinding[] = [
  {
    rule_id: "type_erasing_cast", severity: "warning", file: FILE, line: 11,
    excerpt: "templates_800[0] = *(char**) &lbl_804DA6C4;", message: "Added type-erasing cast `(char**)`.",
    standard_id: "casts", detail: { llm_review: true, cast: "(char**)" },
  },
  {
    rule_id: "type_erasing_cast", severity: "warning", file: FILE, line: 12,
    excerpt: "u32 sp1C = *(u32*) &lbl_804DA6C8;", message: "Added type-erasing cast `(u32*)`.",
    standard_id: "casts", detail: { llm_review: true, cast: "(u32*)" },
  },
  {
    rule_id: "stack_local_name", severity: "info", file: FILE, line: 13,
    excerpt: "f32 sp20 = 0.0f;", message: "spNN local name.",
    standard_id: null, detail: { llm_review: true, name: "sp20" },
  },
];

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

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function tempStore(): StateStore {
  const store = openState(tempDir("mn-adjudication-state-"));
  cleanups.push(() => store.db.close());
  // Enabled an hour ago, so every seeded checkpoint is in the catch-up window.
  ensureModelNodeLaneState(store, "checkpoint_adjudication", new Date(Date.now() - 3_600_000).toISOString());
  return store;
}

function globalsFor(stateDir: string, overrides: Partial<GlobalArgs> = {}): GlobalArgs {
  return { repoRoot: "/fixture/harness", stateDir, dryRunAgents: false, provider: "pi", model: "test", thinkingLevel: "medium", ...overrides };
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** A scripted Jev stand-in: every bool question gets p(true) = `probability`; with `hang`, it waits for the abort. */
function scriptedDecisions(probability: number): DecisionEngine & { calls: number; hang: boolean } {
  const engine = {
    calls: 0,
    hang: false,
    async classify(request: EngineRequest): Promise<EngineResult> {
      engine.calls += 1;
      const base = {
        engine: "pi-ai" as const,
        api: "fake-classifier",
        provider: "typesafe",
        requestedModel: request.model,
        resolvedModel: request.model,
        latencyMs: 1,
        attempts: 1,
        startedAtMs: Date.now(),
        secrets: [],
      };
      if (engine.hang) {
        await new Promise<void>((resolve) => request.signal?.addEventListener("abort", () => resolve(), { once: true }));
        return { ...base, ok: false, answers: {}, error: { kind: "aborted", message: "Request aborted" } };
      }
      return {
        ...base,
        ok: true,
        answers: Object.fromEntries(Object.keys(request.questions).map((id) => [id, { type: "bool" as const, probability }])),
        usage: { inputTokens: 40, outputTokens: 1 },
      };
    },
  };
  return engine;
}

interface NodeHarness {
  temp: TempKernel<NodeCalls>;
  kernel: WorkerNodeKernel;
  invocations: () => number;
  decisions: ReturnType<typeof scriptedDecisions>;
  workerRun: { runId: string; sessionId: string };
}

async function nodeHarness(options: { extract?: "justify" | "down"; probability?: number } = {}): Promise<NodeHarness> {
  const engine = createFakeCallEngine<NodeCalls>({
    functions: Object.keys(NODE_CALL_MANIFESTS) as NodeFunctionName[],
    // ExtractCheckpointKnowledge: a justification for every finding it is handed, or an outage.
    respond: (request): FakeCallResponse => {
      if (options.extract === "down") return fakeFailure({ kind: "http", status: 503 });
      const refs = (request.args as unknown[])[1] as Array<{ id: string }>;
      return fakeOk({
        advisories: refs.map((ref) => ({
          finding_id: ref.id,
          kept: true,
          justification: "MWCC needs the cast for the r13-relative load; objdiff 100%.",
          evidence: ["objdiff 100%"],
        })),
        structured_field_used: true,
      });
    },
  });
  const decisions = scriptedDecisions(options.probability ?? 0.97);
  const temp = await createTempKernel<NodeCalls>({
    calls: { engine },
    decide: { engine: decisions },
    nodes: { piModels: fakePiModels() },
    models: { defaults: { call: FAKE_CALL_MODEL_REF } },
  });
  cleanups.push(() => temp.cleanup());
  const workerRun = await temp.tempDb.seedParentRun({ agentName: "worker", trigger: "operator" });
  // The worker finished long before the lane runs.
  await updateAgentRunStatus(temp.tempDb.db, workerRun.runId, "done", { endedAt: new Date().toISOString() });
  return { temp, kernel: temp.kernel, invocations: () => engine.invocations.length, decisions, workerRun };
}

interface CheckpointSeed {
  id: string;
  workerStateId?: string;
  mode?: "shadow" | "enforce";
  eligible?: boolean;
  notePath?: string | null;
  patchPath?: string | null;
  kernel?: { run_id: string; container_id: string; pi_session_id: string } | null;
}

function writeEvidence(dir: string): { notePath: string; patchPath: string } {
  const notePath = join(dir, "attempt-2.agent_output.txt");
  const patchPath = join(dir, "attempt-2.qa_diff.patch");
  writeFileSync(notePath, NOTE);
  writeFileSync(patchPath, PATCH);
  return { notePath, patchPath };
}

function seedCheckpoint(store: StateStore, seed: CheckpointSeed): void {
  const metadata = {
    agent_output_path: seed.notePath ?? null,
    agent_note: "Matched gmtoulib_fn.",
    review_lint: { status: "passed" },
    llm_review_candidate: {
      schema: "llm_review_candidate_v1",
      mode: seed.mode ?? "shadow",
      eligible: seed.eligible ?? true,
      pre_qa: { status: "passed", reasons: [] },
      post_return_check: "not-run",
      advisories: FINDINGS.map((finding) => ({ fingerprint: null, finding })),
      kernel: seed.kernel ?? null,
      attempt_index: 2,
      agent_output_path: seed.notePath ?? null,
      scan_path: seed.patchPath ?? null,
      code_facts: { exact: true, old_score: 91.5, new_score: 100 },
    },
  };
  store.db.query(`INSERT INTO worker_checkpoints
    (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id, attempt_index, validation_time,
     old_score, new_score, delta, exact_match, hard_gates_passed, selectable, qa_status, validation_status, metadata_json)
    VALUES (?, ?, 'run-1', 'epoch-1', 'target-1', 'claim-1', 2, ?, 91.5, 100, 8.5, 1, 0, 0, 'warnings', 'failed', ?)`).run(
    seed.id,
    seed.workerStateId ?? "worker-1",
    new Date().toISOString(),
    JSON.stringify(metadata),
  );
}

type CheckpointRow = Record<string, unknown> & { metadata_json: string };

function checkpointRow(store: StateStore, id: string): CheckpointRow {
  return store.db.query<CheckpointRow, [string]>("SELECT * FROM worker_checkpoints WHERE id = ?").get(id)!;
}

/** The row with the lane's key removed: everything the worker wrote. */
function workerFields(row: CheckpointRow): Record<string, unknown> {
  const { llm_review_adjudication: _ignored, ...metadata } = JSON.parse(row.metadata_json) as Record<string, unknown>;
  return { ...row, metadata_json: metadata };
}

function adjudicationOf(store: StateStore, id: string): Record<string, unknown> | undefined {
  return (JSON.parse(checkpointRow(store, id).metadata_json) as Record<string, unknown>).llm_review_adjudication as
    Record<string, unknown> | undefined;
}

interface JobRow { dedupe_key: string; status: string; attempts: number; result_ref: string | null }

function adjudicationJobs(store: StateStore): JobRow[] {
  return store.db.query<JobRow, []>(`SELECT dedupe_key, status, attempts, result_ref FROM jobs
    WHERE kind = 'checkpoint_adjudication' ORDER BY dedupe_key`).all();
}

function jobDetail(store: StateStore, checkpointId: string): Record<string, unknown> {
  const row = store.db.query<{ payload_json: string }, [string]>(`SELECT e.payload_json FROM game_events e
    JOIN jobs j ON j.job_id = e.subject_id
    WHERE e.subject_kind = 'job' AND e.event_type = 'job.succeeded'
      AND j.kind = 'checkpoint_adjudication' AND j.dedupe_key = ?`).get(checkpointId);
  return (JSON.parse(row?.payload_json ?? "{}") as { detail?: Record<string, unknown> }).detail ?? {};
}

async function waitFor(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Runs the real lane with the handler until every adjudication job settled. */
async function runLane(store: StateStore, deps: AdjudicationHandlerDeps, globals = globalsFor(store.stateDir)): Promise<void> {
  const lanes = startModelNodeLanes({
    store,
    config: { adjudication: true, knowledge: false },
    handlers: { checkpoint_adjudication: createAdjudicationHandler(globals, deps), checkpoint_knowledge: null },
    lane: { intervalMs: 10 },
    log: () => {},
  });
  try {
    await waitFor(() => adjudicationJobs(store).every((job) => job.status === "succeeded" || job.status === "waiting"));
  } finally {
    await lanes.stop({ maxWaitMs: 1_000 });
  }
}

function kernelOf(harness: NodeHarness): CheckpointSeed["kernel"] {
  return { run_id: harness.workerRun.runId, container_id: harness.temp.tempDb.containerId, pi_session_id: harness.workerRun.sessionId };
}

describe("checkpoint_adjudication handler", () => {
  test("catch-up enqueues each eligible shadow checkpoint once; handler writes llm_review_adjudication via json_set with source digests; decisions nest under the worker run", async () => {
    const store = tempStore();
    const harness = await nodeHarness();
    const evidence = writeEvidence(tempDir("mn-adjudication-evidence-"));
    seedCheckpoint(store, { id: "cp-shadow", ...evidence, kernel: kernelOf(harness) });
    seedCheckpoint(store, { id: "cp-enforce", mode: "enforce", ...evidence, kernel: kernelOf(harness) });
    seedCheckpoint(store, { id: "cp-ineligible", eligible: false, ...evidence, kernel: null });
    const before = workerFields(checkpointRow(store, "cp-shadow"));

    expect(catchUpAdjudication(store)).toBe(1);
    expect(catchUpAdjudication(store)).toBe(0);
    expect(catchUpAdjudication(store, { workerStateId: "worker-1" })).toBe(0);
    expect(adjudicationJobs(store).map((job) => [job.dedupe_key, job.status])).toEqual([["cp-shadow", "queued"]]);

    await runLane(store, { nodeKernel: async () => harness.kernel });

    expect(adjudicationJobs(store)).toEqual([{ dedupe_key: "cp-shadow", status: "succeeded", attempts: 1, result_ref: "cp-shadow" }]);
    const result = adjudicationOf(store, "cp-shadow")!;
    expect(result).toMatchObject({
      schema: "llm_review_adjudication_v1",
      requested_mode: "shadow",
      mode: "shadow",
      verdict: "pass",
      applied: false,
      extraction: { status: "ok" },
      sources: { note_sha256: sha256(NOTE), patch_sha256: sha256(PATCH) },
    });
    const advisories = result.advisories as Array<Record<string, unknown>>;
    expect(advisories.map((advisory) => [advisory.line, advisory.severity, advisory.result])).toEqual([
      [11, "warning", "pass"],
      [12, "warning", "pass"],
      [13, "info", "noted"],
    ]);
    expect(advisories.every((advisory) => typeof advisory.fingerprint === "string" && advisory.fingerprint.startsWith("af2:"))).toBe(true);
    expect(result.accepted_fingerprints).toEqual([advisories[0]!.fingerprint, advisories[1]!.fingerprint]);
    expect(jobDetail(store, "cp-shadow")).toMatchObject({ status: "ok", verdict: "pass", extraction_status: "ok", accepted: 2 });
    // The worker's own fields, and the other checkpoints, are untouched.
    expect(workerFields(checkpointRow(store, "cp-shadow"))).toEqual(before);
    expect(adjudicationOf(store, "cp-enforce")).toBeUndefined();
    expect(adjudicationOf(store, "cp-ineligible")).toBeUndefined();

    // One extraction call and one decision per warning, every node nested under the worker's kernel run.
    expect(harness.invocations()).toBe(1);
    expect(harness.decisions.calls).toBe(2);
    const traceDb = new Database(harness.temp.tempDb.path, { readonly: true });
    try {
      const children = traceDb
        .query<{ kind: string; status: string }, [string]>(`SELECT s.kind, r.status FROM agent_runs r
          JOIN pi_agent_sessions s ON s.id = r.pi_session_id WHERE r.parent_run_id = ? ORDER BY s.kind`)
        .all(harness.workerRun.runId);
      expect(children).toEqual([
        { kind: "call", status: "done" },
        { kind: "decision", status: "done" },
        { kind: "decision", status: "done" },
      ]);
    } finally {
      traceDb.close();
    }
    const report = await runTraceDoctor(harness.temp.tempDb.db);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);

    // A replayed job keeps the recorded result and pays for nothing.
    const replay = createAdjudicationHandler(globalsFor(store.stateDir), { nodeKernel: async () => harness.kernel });
    const job = { jobId: "replay", kind: "checkpoint_adjudication", payload: { checkpointId: "cp-shadow" } };
    const replayed = await replay(job as never, {
      store,
      token: null as never,
      signal: new AbortController().signal,
      ensureClaim: () => {},
    });
    expect(replayed).toEqual({ resultRef: "cp-shadow", detail: { status: "skipped", reason: "already-adjudicated" } });
    expect(harness.invocations()).toBe(1);
    expect(harness.decisions.calls).toBe(2);
  });

  test("missing note file → evidence-missing; engine down → recorded error; worker rows unaffected", async () => {
    const store = tempStore();
    const harness = await nodeHarness({ extract: "down" });
    const evidence = writeEvidence(tempDir("mn-adjudication-evidence-"));
    seedCheckpoint(store, { id: "cp-no-note", ...evidence, notePath: join(evidence.notePath, "..", "missing.txt"), kernel: kernelOf(harness) });
    seedCheckpoint(store, { id: "cp-engine-down", workerStateId: "worker-2", ...evidence, kernel: kernelOf(harness) });
    const before = {
      noNote: workerFields(checkpointRow(store, "cp-no-note")),
      engineDown: workerFields(checkpointRow(store, "cp-engine-down")),
    };

    expect(catchUpAdjudication(store)).toBe(2);
    await runLane(store, { nodeKernel: async () => harness.kernel });

    // Both jobs complete: engine failures and missing evidence are results, not retries.
    expect(adjudicationJobs(store).map((job) => [job.dedupe_key, job.status, job.attempts])).toEqual([
      ["cp-engine-down", "succeeded", 1],
      ["cp-no-note", "succeeded", 1],
    ]);
    expect(adjudicationOf(store, "cp-no-note")).toMatchObject({
      schema: "llm_review_adjudication_v1",
      mode: "shadow",
      verdict: "error",
      applied: false,
      error: "evidence-missing: note",
      extraction: { status: "skipped" },
      accepted_fingerprints: [],
      sources: { note_sha256: null, patch_sha256: sha256(PATCH) },
    });
    expect(jobDetail(store, "cp-no-note")).toMatchObject({ status: "error", verdict: "error", error: "evidence-missing: note" });
    expect(adjudicationOf(store, "cp-engine-down")).toMatchObject({
      verdict: "error",
      applied: false,
      extraction: { status: "error" },
      accepted_fingerprints: [],
      sources: { note_sha256: sha256(NOTE), patch_sha256: sha256(PATCH) },
    });
    expect(jobDetail(store, "cp-engine-down")).toMatchObject({ status: "error", extraction_status: "error" });
    // Missing evidence makes no node call; the outage made exactly one extraction call and no decision.
    expect(harness.invocations()).toBe(1);
    expect(harness.decisions.calls).toBe(0);
    expect(workerFields(checkpointRow(store, "cp-no-note"))).toEqual(before.noNote);
    expect(workerFields(checkpointRow(store, "cp-engine-down"))).toEqual(before.engineDown);
    expect((await runTraceDoctor(harness.temp.tempDb.db)).ok).toBe(true);
  });

  test("a lane stopped mid-adjudication records nothing; the retried job replays the finished extraction", async () => {
    const store = tempStore();
    const harness = await nodeHarness();
    const evidence = writeEvidence(tempDir("mn-adjudication-evidence-"));
    seedCheckpoint(store, { id: "cp-stopped", ...evidence, kernel: kernelOf(harness) });
    catchUpAdjudication(store);
    harness.decisions.hang = true;
    const handler = createAdjudicationHandler(globalsFor(store.stateDir), { nodeKernel: async () => harness.kernel });
    const lanes = startModelNodeLanes({
      store,
      config: { adjudication: true, knowledge: false },
      handlers: { checkpoint_adjudication: handler, checkpoint_knowledge: null },
      lane: { intervalMs: 10 },
      log: () => {},
    });
    await waitFor(() => harness.decisions.calls > 0);
    await lanes.stop({ maxWaitMs: 20 });
    await waitFor(() => adjudicationJobs(store)[0]?.status === "waiting");

    // The aborted run is not a result: nothing is recorded and the job backs off for a retry.
    expect(adjudicationOf(store, "cp-stopped")).toBeUndefined();
    expect(harness.invocations()).toBe(1);

    harness.decisions.hang = false;
    store.db.query("UPDATE jobs SET next_attempt_at = ? WHERE kind = 'checkpoint_adjudication'").run(new Date(0).toISOString());
    await runLane(store, { nodeKernel: async () => harness.kernel });

    expect(adjudicationJobs(store)).toEqual([{ dedupe_key: "cp-stopped", status: "succeeded", attempts: 2, result_ref: "cp-stopped" }]);
    expect(adjudicationOf(store, "cp-stopped")).toMatchObject({ verdict: "pass", applied: false, extraction: { status: "ok" } });
    // The extraction finished before the stop, so the retry replayed it instead of calling the engine again.
    expect(harness.invocations()).toBe(1);
    expect((await runTraceDoctor(harness.temp.tempDb.db)).violations).toEqual([]);
  });

  test("a handler whose claim was released while it adjudicated writes nothing", async () => {
    const store = tempStore();
    const harness = await nodeHarness();
    const evidence = writeEvidence(tempDir("mn-adjudication-evidence-"));
    seedCheckpoint(store, { id: "cp-released", ...evidence, kernel: kernelOf(harness) });
    const before = checkpointRow(store, "cp-released");
    catchUpAdjudication(store);
    const claim = claimNextJob(store, { kind: "checkpoint_adjudication", concurrencyLimit: 4, leaseMs: 60_000 })!;
    const handler = createAdjudicationHandler(globalsFor(store.stateDir), {
      nodeKernel: async () => harness.kernel,
      // The claim is released (as the lane does at stop grace) after the nodes ran, before the write.
      adjudicate: async (params) => {
        const result = await adjudicateAdvisories(params);
        failJob(store, claim.token, "released at stop grace");
        return result;
      },
    });

    const outcome = handler(claim.job, {
      store,
      token: claim.token,
      signal: new AbortController().signal,
      ensureClaim: () => { verifyClaimToken(store, claim.token); },
    });

    expect(outcome).rejects.toThrow();
    await outcome.catch(() => {});
    expect(harness.decisions.calls).toBe(2);
    expect(checkpointRow(store, "cp-released")).toEqual(before);
    expect(adjudicationJobs(store)).toEqual([{ dedupe_key: "cp-released", status: "waiting", attempts: 1, result_ref: null }]);
  });

  test("dry-run agents make no node call; a missing node kernel is retried, never recorded", async () => {
    const store = tempStore();
    const evidence = writeEvidence(tempDir("mn-adjudication-evidence-"));
    const kernel = { run_id: "worker-run", container_id: "container", pi_session_id: "session" };
    seedCheckpoint(store, { id: "cp-dry", ...evidence, kernel });
    seedCheckpoint(store, { id: "cp-no-kernel", workerStateId: "worker-2", ...evidence, kernel });
    const unreachable: AdjudicationHandlerDeps = {
      nodeKernel: async () => { throw new Error("dry run must not load the node kernel"); },
      adjudicate: async () => { throw new Error("dry run must not adjudicate"); },
    };
    catchUpAdjudication(store);
    const signal = new AbortController().signal;
    const ensureClaim = (): void => {};

    const dryRun = createAdjudicationHandler(globalsFor(store.stateDir, { dryRunAgents: true }), unreachable);
    const dryJob = claimNextJob(store, { kind: "checkpoint_adjudication", concurrencyLimit: 4, leaseMs: 60_000 })!;
    expect(await dryRun(dryJob.job, { store, token: dryJob.token, signal, ensureClaim })).toEqual({
      resultRef: dryJob.job.dedupeKey,
      detail: { status: "skipped", reason: "dry-run-agents" },
    });

    // The kernel runtime is disabled: the core fails closed as retryable, so the queue backs off instead of recording.
    const noKernel = createAdjudicationHandler(globalsFor(store.stateDir), { nodeKernel: async () => null });
    const kernelJob = claimNextJob(store, { kind: "checkpoint_adjudication", concurrencyLimit: 4, leaseMs: 60_000 })!;
    expect(noKernel(kernelJob.job, { store, token: kernelJob.token, signal, ensureClaim })).rejects.toThrow("reviewer-unavailable: no-node-kernel");
    expect(adjudicationOf(store, "cp-dry")).toBeUndefined();
    expect(adjudicationOf(store, "cp-no-kernel")).toBeUndefined();
  });
});
