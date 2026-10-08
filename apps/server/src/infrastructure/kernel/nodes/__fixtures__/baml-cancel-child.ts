// Child process for baml-cancel.test.ts: full kernel.call lifecycles (temp
// kernel database, offline Pi route, the production bamlEngine config with
// the real BAML module and generated client) against the mock Responses
// server, cancelled while BAML's request is in flight and while its
// KernelCallRetry policy (one retry after 500 ms) is backing off. Prints
// exactly one line: `RESULT <json>`.
//
// The backoff barrier is client side. BAML exposes no retry or backoff event,
// so the engine's own Collector is observed live: once it has recorded the
// first attempt with the server's 500 response while the server has seen no
// second request, the client has finished that attempt and the only thing left
// before the retry is the policy's 500 ms wait. An attempt cancelled in flight
// never records a response.
import { Database } from "bun:sqlite";
import * as baml from "@boundaryml/baml";
import { createKernel, KernelCallError } from "@agent-kernel/kernel";
import { bamlEngine } from "@agent-kernel/kernel/baml-engine";
import { createTempKernelDb, FAKE_CALL_MODEL_REF, fakePiModels } from "@agent-kernel/kernel/model-nodes/testing";
import { b } from "@server/generated/baml_client";
import { getBamlFiles } from "@server/generated/baml_client/inlinedbaml";

import { NODE_CALL_MANIFESTS } from "../functions";
import { NODE_CALL_RETRY_POLICY } from "../node-kernel";
import { startMockResponsesServer } from "./mock-responses-server";

export interface CancelScenarioResult {
  name: string;
  /** The KernelCallError failure kind, "ok", or "unexpected <name>". */
  outcome: string;
  runStatus: string | null;
  endStatus: string | null;
  endKind: string | null;
  /** Requests the mock received, counted after a settle wait longer than one backoff. */
  requests: number;
  /** The mock saw the client close a held request. */
  clientClosed: boolean;
  /**
   * Before the cancel, the engine's Collector had recorded the first attempt
   * with its 500 response while the server had seen only that one request:
   * the client had received and recorded the first response and had not sent
   * the retry. With `requests` still 1 after the settle wait, the cancel landed
   * between the first attempt and the retry, that is, in the backoff.
   */
  firstAttemptRecordedBeforeCancel: boolean;
  /** From the cancel (abort or deadline) to the call settling. */
  settleMs: number;
  doctorOk: boolean;
}

/** Longer than KernelCallRetry's 500 ms backoff, so a retry that was not cancelled would land. */
const SETTLE_WAIT_MS = 1_000;

/** Every Collector the engine creates (one per call), so a scenario can watch its call's attempts live. */
const collectors: baml.Collector[] = [];
const observedBaml = {
  ...baml,
  Collector: function ObservedCollector(name?: string | null) {
    const collector = new baml.Collector(name);
    collectors.push(collector);
    return collector;
  },
} as unknown as typeof baml;

/** The call's first attempt is recorded with a 500 response, and no second request has reached the server. */
function firstAttemptRecorded(collector: baml.Collector | undefined): boolean {
  if (!collector || server.requests.length !== 1) return false;
  try {
    const calls = collector.last?.calls ?? [];
    return calls.length === 1 && calls[0]!.httpResponse?.status === 500;
  } catch {
    return false;
  }
}

const server = startMockResponsesServer();
const temp = await createTempKernelDb();
const engine = bamlEngine({
  client: b,
  baml: observedBaml,
  sources: getBamlFiles(),
  manifests: NODE_CALL_MANIFESTS,
  retryPolicy: NODE_CALL_RETRY_POLICY,
});

async function scenario(
  name: string,
  opts: {
    hold: boolean;
    /** Abort this long after the server receives the (held, still open) first request. */
    abortAfterFirstRequestMs?: number;
    /** Abort as soon as the client has recorded the first attempt's 500 (the backoff barrier above). */
    abortWhenFirstAttemptRecorded?: boolean;
    timeoutMs: number;
    /**
     * Hold the first request and answer it 500 this long before the deadline.
     * At 450 ms, under the 500 ms backoff, the retry would only be due after
     * the deadline, so the deadline cannot pass the retry. Whether the client
     * recorded the attempt before the deadline is observed, not assumed
     * (`firstAttemptRecordedBeforeCancel`).
     */
    answerFirstBeforeDeadlineMs?: number;
  },
): Promise<CancelScenarioResult> {
  server.requests.length = 0;
  const controller = new AbortController();
  let cancelledAt = 0;
  let startedAt = 0;
  let firstAttemptRecordedAt = 0;
  server.reply(() => {
    const first = server.requests.length === 1;
    if (opts.abortAfterFirstRequestMs !== undefined && first) {
      setTimeout(() => {
        cancelledAt = Date.now();
        controller.abort();
      }, opts.abortAfterFirstRequestMs);
    }
    if (opts.answerFirstBeforeDeadlineMs !== undefined && first) {
      return { kind: "hold", maxMs: Math.max(0, startedAt + opts.timeoutMs - opts.answerFirstBeforeDeadlineMs - Date.now()) };
    }
    return opts.hold ? { kind: "hold" } : { kind: "status", status: 500, body: { error: { message: "overloaded" } } };
  });
  const kernel = createKernel({
    id: temp.kernelId,
    db: temp.db,
    calls: { engine },
    nodes: { piModels: fakePiModels({ baseUrl: server.url("/v1") }) },
  });

  // This call's Collector is the next one the engine creates; watch it until the call settles.
  const collectorIndex = collectors.length;
  const watch = setInterval(() => {
    if (firstAttemptRecordedAt !== 0 || !firstAttemptRecorded(collectors[collectorIndex])) return;
    firstAttemptRecordedAt = Date.now();
    if (opts.abortWhenFirstAttemptRecorded) {
      cancelledAt = firstAttemptRecordedAt;
      controller.abort();
    }
  }, 2);

  startedAt = Date.now();
  let outcome = "ok";
  let runId: string | undefined;
  try {
    await kernel.call("ContractProbe", ["is this empty?"], {
      containerId: temp.containerId,
      // The manifest names codex-lb; the offline Pi route only knows the fake provider.
      model: FAKE_CALL_MODEL_REF,
      signal: controller.signal,
      timeoutMs: opts.timeoutMs,
    });
  } catch (error) {
    if (error instanceof KernelCallError) {
      outcome = error.failure.kind;
      runId = error.runId;
    } else {
      outcome = `unexpected ${error instanceof Error ? error.name : typeof error}`;
    }
  }
  const settledAt = Date.now();
  clearInterval(watch);
  // The kernel starts its deadline clock just after `startedAt`, so this is no later than the real deadline.
  if (cancelledAt === 0) cancelledAt = startedAt + opts.timeoutMs;
  await Bun.sleep(SETTLE_WAIT_MS);

  const db = new Database(temp.path, { readonly: true });
  try {
    const run = runId ? (db.query("SELECT status FROM agent_runs WHERE id = ?").get(runId) as { status: string } | null) : null;
    const end = runId
      ? (db.query("SELECT event_data FROM trace_events WHERE run_id = ? AND type = 'call_end'").get(runId) as { event_data: string } | null)
      : null;
    const endData = end ? (JSON.parse(end.event_data) as { status?: string; error?: { kind?: string } }) : undefined;
    return {
      name,
      outcome,
      runStatus: run?.status ?? null,
      endStatus: endData?.status ?? null,
      endKind: endData?.error?.kind ?? null,
      requests: server.requests.length,
      clientClosed: server.requests.some((request) => request.clientClosed === true),
      firstAttemptRecordedBeforeCancel: firstAttemptRecordedAt > 0 && firstAttemptRecordedAt <= cancelledAt,
      settleMs: settledAt - cancelledAt,
      doctorOk: (await kernel.doctor()).ok,
    };
  } finally {
    db.close();
    kernel.dispose();
  }
}

try {
  const results = [
    // Control: without a cancel, KernelCallRetry retries the 500 once.
    await scenario("retry-control", { hold: false, timeoutMs: 10_000 }),
    await scenario("abort-during-request", { hold: true, abortAfterFirstRequestMs: 150, timeoutMs: 10_000 }),
    await scenario("abort-during-backoff", { hold: false, abortWhenFirstAttemptRecorded: true, timeoutMs: 10_000 }),
    await scenario("deadline-during-backoff", { hold: false, timeoutMs: 3_000, answerFirstBeforeDeadlineMs: 450 }),
  ];
  console.log(`RESULT ${JSON.stringify(results)}`);
} finally {
  await server.stop();
  temp.cleanup();
}
process.exit(0);
