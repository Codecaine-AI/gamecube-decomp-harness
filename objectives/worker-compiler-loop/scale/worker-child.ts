#!/usr/bin/env bun
/**
 * Worker child for the load test: the harness's `job-runner.ts worker-task`
 * with exactly two substitutions.
 *
 * 1. The LLM turn (`runAgent`) is a canned agent: it makes the tool calls a
 *    worker makes for the target (a native `mwcc_alloc` decisions capture and a
 *    `compare_sources` @base vs @worktree, through the real worker tool
 *    registrations and sandbox routing), writes the canned source edit into the
 *    sandbox, and returns "validation_ready". A second turn stops the worker.
 * 2. Every Daytona client is the instrumented one (fake or live), so API calls,
 *    execs and any build-sandbox create are measured and guarded.
 *
 * Everything else is `runWorkerCycleFromTask` as a real attempt runs it:
 * sandbox attach, baseline, validation (build, objdiff, micro-gates, QA lint,
 * steering gate), checkpoint, steering observations, claim close and the
 * integration enqueue. The child imports the same module graph as
 * job-runner.ts, so its RSS is representative of a real worker child.
 *
 * Env (set by load-test.ts): SCALE_MODE fake|live, SCALE_FAKE_URL,
 * SCALE_CONTROL_URL, SCALE_RUN_ID, SCALE_EVENTS_DIR, SCALE_TARGETS_FILE.
 */
import { Database } from "bun:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { envEventSink, errorText } from "./lib/events.js";
import { installHostSpawnProbe, instrumentSqliteLocks } from "./lib/host-probe.js";
import { classifyNativeResult, type NativeOperation } from "./lib/native-measurement.js";
import type { ScaleTarget } from "./fixtures.js";

const started = performance.now();
const taskFile = process.argv[process.argv.indexOf("--task-file") + 1] ?? "";
const task = JSON.parse(readFileSync(taskFile, "utf8")) as Record<string, any>;
const sink = envEventSink("worker", { workerId: task.worker_id, jobId: task.job_id });
installHostSpawnProbe(sink);
if (process.env.SCALE_MODE !== "live") delete process.env.DAYTONA_API_KEY;

const [{ parse }, { STATE_MIGRATION_MODE_ENV }, sandboxModule, { runWorkerCycleFromTask }, daytona, guard, capabilities, runner] = await Promise.all([
  import("@server/core/game-registry/runtime-options.js"),
  import("@server/core/orchestrator-state/storage/store.js"),
  import("@server/core/job-queue/sandbox.js"),
  import("@server/core/harness-runtime/phases/running/workers/worker-cycle.js"),
  import("./lib/daytona.js"),
  import("./lib/guard.js"),
  import("@server/core/tools/wrappers/capabilities.js"),
  // Same module graph as a real worker child (job-runner.ts imports every job).
  import("@server/application/jobs/job-runner"),
]);
void runner;
const importMs = performance.now() - started;

const targets = JSON.parse(readFileSync(process.env.SCALE_TARGETS_FILE!, "utf8")) as ScaleTarget[];
const { command, globals, args } = parse(process.argv.slice(2));
if (command !== "worker-task") throw new Error(`worker-child expects worker-task, got ${command}`);
process.env[STATE_MIGRATION_MODE_ENV] = "verify";

// Route every DaytonaSandboxProvider in this process (the injected one and any
// default-constructed build-sandbox provider) through the instrumented client.
const clientFactory = daytona.scaleClientFactory(
  process.env.SCALE_MODE === "live"
    ? () => daytona.liveSdkClient(process.env.DAYTONA_API_KEY ?? "")
    : async () => daytona.httpFakeClient(process.env.SCALE_FAKE_URL!),
  { sink, scaleRunId: process.env.SCALE_RUN_ID!, admission: guard.httpAdmission(process.env.SCALE_CONTROL_URL!), defaultPurpose: "build" },
);
const sharedClient = (clientFactory as unknown as () => Promise<unknown>)();
(sandboxModule.DaytonaSandboxProvider.prototype as unknown as { client: () => Promise<unknown> }).client = () => sharedClient;
const provider = new sandboxModule.DaytonaSandboxProvider({ readApiKey: () => "scale" });

const probeDb = new Database(resolve(globals.stateDir, "orchestrator.sqlite"), { readonly: true });
const claimRow = probeDb.query(`SELECT et.unit, et.symbol, et.source_path FROM target_claims tc JOIN epoch_targets et ON et.id = tc.epoch_target_id WHERE tc.id = ?`).get(task.target_claim_id) as { unit: string; symbol: string; source_path: string } | null;
probeDb.close();
const target = targets.find((t) => t.unit === claimRow?.unit && t.symbol === claimRow?.symbol);
if (!target) throw new Error(`no canned target for claim ${task.target_claim_id} (${claimRow?.unit}::${claimRow?.symbol})`);

// SQLite lock waits on every connection this process opens.
const DatabaseProto = Database.prototype as unknown as { exec: (...a: unknown[]) => unknown; run: (...a: unknown[]) => unknown };
instrumentSqliteLocks(DatabaseProto as never, sink);

let agentCalls = 0;
let agentMs = 0;
const toolResults: Record<string, unknown> = {};

const runAgent = async (options: any) => {
  agentCalls += 1;
  const outputPath = resolve(options.outputDir, `canned-agent-${agentCalls}.txt`);
  const base = {
    sessionId: `canned-${task.worker_id}-${agentCalls}`,
    outputPath,
    systemPromptPath: resolve(options.outputDir, `canned-agent-${agentCalls}.system.md`),
    userPromptPath: resolve(options.outputDir, `canned-agent-${agentCalls}.user.md`),
    dryRun: false,
  };
  if (agentCalls > 1) {
    writeFileSync(outputPath, "canned stop");
    return { ...base, rawText: "canned stop", failed: true, error: "canned agent stops after one attempt" };
  }
  const turnStarted = performance.now();
  writeFileSync(base.systemPromptPath, options.prompt?.systemPrompt ?? "");
  writeFileSync(base.userPromptPath, options.prompt?.userPrompt ?? "");
  const context = { role: "worker", ...options.toolContext } as any;
  const repoRoot: string = context.repoRoot;
  const handle = context.sandboxHandle;
  if (!handle) throw new Error("canned agent: worker tool context has no sandbox handle");
  const tool = async (registration: any, params: Record<string, unknown>, label: NativeOperation) => {
    const toolStarted = performance.now();
    try {
      const result = await registration.create(context).execute(`canned-${label}`, params);
      const text = result?.content?.[0]?.text ?? "";
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch {}
      // A measurement counts only when the nested result is ok with its schema; a clean envelope around
      // `status: "unavailable"` (or a malformed or failed result) is a measurement failure.
      // The decisions document and the full diff are artifacts the tool wrote in the sandbox checkout.
      const measurement = await classifyNativeResult(label, parsed, (path) => handle.readFile(`${repoRoot}/${path}`));
      toolResults[label] = measurement.ok ? measurement.schema : `${measurement.reason}: ${measurement.detail}`;
      sink.emit({ kind: "phase", phase: `tool:${label}`, ms: performance.now() - toolStarted, ok: measurement.ok, workerId: task.worker_id });
      if (!measurement.ok) sink.emit({ kind: "failure", failureKind: `measurement:${label}`, detail: `${measurement.reason}: ${measurement.detail}`, workerId: task.worker_id });
      return parsed;
    } catch (error) {
      sink.emit({ kind: "phase", phase: `tool:${label}`, ms: performance.now() - toolStarted, ok: false, workerId: task.worker_id, error: errorText(error) });
      sink.emit({ kind: "failure", failureKind: `tool_${label}`, detail: errorText(error).slice(0, 300), workerId: task.worker_id });
      return null;
    }
  };
  // What MWCC decided for the current candidate (method step 3), before editing.
  await tool(capabilities.mwccAllocSnapshotToolRegistration, { unit: target.unit, function: target.symbol, capture: "decisions", backend: "native" }, "native_decisions");
  // The canned edit: the file content a worker's write tool would produce.
  const editStarted = performance.now();
  await handle.writeFile(`${repoRoot}/${target.sourcePath}`, target.editedContent);
  sink.emit({ kind: "phase", phase: "canned_edit", ms: performance.now() - editStarted, ok: true, workerId: task.worker_id });
  // What the edit changed inside the compiler.
  await tool(capabilities.mwccAllocCompareSourcesToolRegistration, { unit: target.unit, function: target.symbol, a: "@base", b: "@worktree" }, "compare_sources");
  const rawText = JSON.stringify({ status: "validation_ready", summary: `canned ${target.kind} edit for ${target.symbol} (${target.provenance})` });
  writeFileSync(outputPath, rawText);
  agentMs = performance.now() - turnStarted;
  sink.emit({ kind: "phase", phase: "agent_turn", ms: agentMs, ok: true, workerId: task.worker_id });
  return { ...base, rawText };
};

let ok = false;
let status: string | undefined;
let failure: string | undefined;
let verdict: string | null = null;
try {
  const result = await runWorkerCycleFromTask(globals, args, {
    sandboxProvider: provider,
    runAgent: runAgent as never,
    nodeKernel: async () => { throw new Error("load test: no LLM node calls"); },
  });
  ok = true;
  status = String((result as any)?.status ?? (result as any)?.outcome ?? "completed");
  try {
    const summary = JSON.parse(readFileSync(resolve(task.artifact_dir, "runner_validation", "attempt-0.runner_validation.summary.json"), "utf8"));
    // Runner status / steering gate attempt verdict (e.g. "passed/pass", "steering_located/steering_located").
    verdict = `${summary?.status ?? "none"}/${summary?.steering?.decision?.attempt ?? "no_gate"}`;
  } catch {}
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  failure = errorText(error);
  sink.emit({ kind: "failure", failureKind: "worker_cycle", detail: failure.slice(0, 500), workerId: task.worker_id });
  console.error(failure);
} finally {
  sink.emit({ kind: "phase", phase: "child_import", ms: importMs, ok: true, workerId: task.worker_id });
  sink.emit({
    kind: "attempt", workerId: task.worker_id, targetKind: target.kind, unit: target.unit, symbol: target.symbol, ok,
    ms: performance.now() - started, status, failure, verdict,
    ...({ tools: toolResults, rss_kb: Math.round(process.memoryUsage().rss / 1024), agent_ms: agentMs } as object),
  } as never);
}
process.exit(ok ? 0 : 1);
