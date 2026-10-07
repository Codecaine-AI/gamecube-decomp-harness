// Child process for baml-cancel.test.ts: full kernel.call lifecycles (temp
// kernel database, offline Pi route, the production bamlEngine config with
// the real BAML module and generated client) against the mock Responses
// server, cancelled while BAML's request is in flight and while its
// KernelCallRetry policy (one retry after 500 ms) is backing off. Prints
// exactly one line: `RESULT <json>`.
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
  /** From the cancel (abort or deadline) to the call settling. */
  settleMs: number;
  doctorOk: boolean;
}

/** Longer than KernelCallRetry's 500 ms backoff, so a retry that was not cancelled would land. */
const SETTLE_WAIT_MS = 1_000;

const server = startMockResponsesServer();
const temp = await createTempKernelDb();
const engine = bamlEngine({
  client: b,
  baml,
  sources: getBamlFiles(),
  manifests: NODE_CALL_MANIFESTS,
  retryPolicy: NODE_CALL_RETRY_POLICY,
});

async function scenario(
  name: string,
  opts: { hold: boolean; abortAfterFirstRequestMs?: number; timeoutMs: number },
): Promise<CancelScenarioResult> {
  server.requests.length = 0;
  const controller = new AbortController();
  let cancelledAt = 0;
  server.reply(() => {
    if (opts.abortAfterFirstRequestMs !== undefined && server.requests.length === 1) {
      setTimeout(() => {
        cancelledAt = Date.now();
        controller.abort();
      }, opts.abortAfterFirstRequestMs);
    }
    return opts.hold ? { kind: "hold" } : { kind: "status", status: 500, body: { error: { message: "overloaded" } } };
  });
  const kernel = createKernel({
    id: temp.kernelId,
    db: temp.db,
    calls: { engine },
    nodes: { piModels: fakePiModels({ baseUrl: server.url("/v1") }) },
  });

  const startedAt = Date.now();
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
    await scenario("abort-during-backoff", { hold: false, abortAfterFirstRequestMs: 100, timeoutMs: 10_000 }),
    await scenario("deadline-during-backoff", { hold: false, timeoutMs: 150 }),
  ];
  console.log(`RESULT ${JSON.stringify(results)}`);
} finally {
  await server.stop();
  temp.cleanup();
}
process.exit(0);
