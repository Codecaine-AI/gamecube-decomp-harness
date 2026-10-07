// The node kernels calibration commands run on, each over its own kernel
// database (never the harness's): a temp directory, or `--db <path>`.
// - `live`: the production node kernel (BAML calls through codex-lb, Jev
//   decisions through Pi), pointed at the dedicated database.
// - `fake`: the kernel's offline fakes (plan §7.1): a scripted call engine and
//   the fake classifier, with every production model ref aliased to them, so
//   no model client is constructed and nothing reaches the network.
// Every node nests under one seeded parent run, which is closed on close() so
// the trace doctor sees a finished run.
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import type { KernelDatabase } from "@agent-kernel/db";
import type { CreateKernelConfig } from "@agent-kernel/kernel";
import type { DoctorReport } from "@agent-kernel/kernel/doctor";
import type { FakeCallRequest, FakeCallResponse, FakeClassifier, FakeScript } from "@agent-kernel/kernel/model-nodes/testing";

import { MELEE_KERNEL_ID } from "@server/infrastructure/kernel/bridge/config.js";
import { upsertMeleeContainer } from "@server/infrastructure/kernel/bridge/database.js";
import {
  closeDefaultMeleeKernelRuntime,
  createMeleeKernelRuntime,
  getDefaultMeleeKernelRuntime,
  resetDefaultMeleeKernelRuntimeForTests,
} from "@server/infrastructure/kernel/bridge/runtime.js";
import {
  LABEL_ADVISORY_MODEL,
  NODE_CALL_MANIFESTS,
  NODE_CALL_MODEL,
  type NodeFunctionName,
} from "@server/infrastructure/kernel/nodes/functions.js";
import {
  closeNodeKernel,
  getNodeKernel,
  NODE_DECIDE_MODEL,
  type NodeCalls,
  type WorkerNodeKernel,
} from "@server/infrastructure/kernel/nodes/node-kernel.js";

/** Pi's classifier request, as the kernel's fake classifier receives it (the harness never imports Pi itself). */
type ClassifierContext = Parameters<FakeScript>[0];

export interface FakeEngineScript {
  /** Answers each kernel.call; default: a failed call (`other`). */
  respond?: (request: FakeCallRequest<NodeCalls>) => FakeCallResponse | Promise<FakeCallResponse>;
  /** The probability the fake classifier answers for a bool question; default 0.5. */
  probability?: (context: ClassifierContext, questionId: string) => number;
}

export interface CalibrationKernelOptions {
  engine: "live" | "fake";
  /** Kernel database file; default a fresh temp directory, removed on close for `fake`, kept for `live`. */
  dbPath?: string;
  /** Names the seeded container and parent run, e.g. "replay" or "calibrate". */
  label: string;
  fake?: FakeEngineScript;
}

export interface CalibrationKernel {
  kernel: WorkerNodeKernel;
  engine: "live" | "fake";
  dbPath: string;
  containerId: string;
  parentRunId: string;
  parentSessionId: string;
  /** Fake engines only. */
  classifier?: FakeClassifier;
  /** The trace doctor over this kernel's database. */
  doctor(): Promise<DoctorReport>;
  /** Ends the parent run, flushes, closes, and removes an owned temp directory (fake only). */
  close(): Promise<void>;
}

interface KernelDbHost {
  db: unknown;
  close(): Promise<void>;
}

async function seedParent(db: unknown, label: string): Promise<{ containerId: string; parentRunId: string; parentSessionId: string }> {
  const { setupPiSessionAndRun } = await import("@agent-kernel/kernel/spawn-pipeline/session");
  const containerId = `melee:advisory-calibration-${label}-${randomUUID()}`;
  const now = new Date().toISOString();
  await upsertMeleeContainer(db, {
    id: containerId,
    kernelId: MELEE_KERNEL_ID,
    kind: "session",
    appKey: [containerId],
    parentContainerId: null,
    label: `advisory-calibration ${label}`,
    status: "running",
    workingDir: null,
    phase: null,
    phaseVocabulary: [],
    metadata: {},
    createdAt: now,
    startedAt: now,
  });
  const parentRunId = randomUUID();
  const parentSessionId = randomUUID();
  await setupPiSessionAndRun(db as KernelDatabase, {
    piSessionUuid: parentSessionId,
    containerId,
    runId: parentRunId,
    agentName: `advisory-calibration-${label}`,
    trigger: "operator",
  });
  return { containerId, parentRunId, parentSessionId };
}

async function finishParent(db: unknown, parentRunId: string): Promise<void> {
  const { updateAgentRunStatus } = await import("@agent-kernel/db");
  await updateAgentRunStatus(db as KernelDatabase, parentRunId, "done", { endedAt: new Date().toISOString() });
}

async function runDoctor(db: unknown): Promise<DoctorReport> {
  const { runTraceDoctor } = await import("@agent-kernel/kernel/doctor");
  return runTraceDoctor(db as Parameters<typeof runTraceDoctor>[0]);
}

function resolveDbPath(dbPath: string | undefined): { path: string; ownedDir: string | null } {
  if (dbPath) {
    const path = resolve(dbPath);
    mkdirSync(dirname(path), { recursive: true });
    return { path, ownedDir: null };
  }
  const dir = mkdtempSync(join(tmpdir(), "advisory-calibration-kernel-"));
  return { path: join(dir, "kernel.db"), ownedDir: dir };
}

async function openFakeKernel(opts: CalibrationKernelOptions, dbPath: string): Promise<{ kernel: WorkerNodeKernel; host: KernelDbHost; classifier: FakeClassifier; dispose(): Promise<void> }> {
  const [{ createKernel }, testing] = await Promise.all([
    import("@agent-kernel/kernel"),
    import("@agent-kernel/kernel/model-nodes/testing"),
  ]);
  const runtime = await createMeleeKernelRuntime({ database: { databasePath: dbPath } });
  const probability = opts.fake?.probability ?? (() => 0.5);
  const classifier = testing.createFakeClassifier();
  classifier.setScript((context) => ({
    answers: Object.fromEntries(
      Object.keys(context.questions).map((id) => [id, { type: "bool" as const, probability: probability(context, id) }]),
    ),
  }));
  const { registry } = await testing.createFakeClassifierRegistry(classifier);
  const respond =
    opts.fake?.respond ??
    (() => testing.fakeFailure({ kind: "other", message: "no scripted response for this call" }));
  const calls = testing.createFakeCallEngine<NodeCalls>({
    functions: Object.keys(NODE_CALL_MANIFESTS) as NodeFunctionName[],
    manifests: NODE_CALL_MANIFESTS,
    respond,
  });
  const kernel = createKernel<unknown, NodeCalls>({
    id: MELEE_KERNEL_ID,
    db: runtime.db as CreateKernelConfig["db"],
    models: {
      // Every production ref resolves to a fake, so nothing reaches a provider.
      aliases: {
        [NODE_CALL_MODEL]: testing.FAKE_CALL_MODEL_REF,
        [LABEL_ADVISORY_MODEL]: testing.FAKE_CALL_MODEL_REF,
        [NODE_DECIDE_MODEL]: classifier.ref,
        "typesafe/jev-latest": classifier.ref,
      },
      defaults: { call: testing.FAKE_CALL_MODEL_REF, decide: classifier.ref },
    },
    calls: { engine: calls },
    decide: { models: registry },
    nodes: { piModels: testing.fakePiModels() },
  });
  return {
    kernel,
    host: { db: runtime.db, close: () => runtime.close() },
    classifier,
    async dispose() {
      try {
        await kernel.traceWriter.flush();
      } finally {
        kernel.dispose();
        await runtime.traceWriter.flush();
      }
    },
  };
}

const LIVE_DB_ENV = "ORCH_AGENT_KERNEL_DB_PATH";

export async function openCalibrationKernel(opts: CalibrationKernelOptions): Promise<CalibrationKernel> {
  const { path: dbPath, ownedDir } = resolveDbPath(opts.dbPath);
  if (opts.engine === "fake") {
    const fake = await openFakeKernel(opts, dbPath);
    const { containerId, parentRunId, parentSessionId } = await seedParent(fake.host.db, opts.label);
    let closed = false;
    return {
      kernel: fake.kernel,
      engine: "fake",
      dbPath,
      containerId,
      parentRunId,
      parentSessionId,
      classifier: fake.classifier,
      doctor: () => runDoctor(fake.host.db),
      async close() {
        if (closed) return;
        closed = true;
        try {
          await finishParent(fake.host.db, parentRunId);
          await fake.dispose();
        } finally {
          await fake.host.close();
          if (ownedDir) rmSync(ownedDir, { recursive: true, force: true });
        }
      },
    };
  }

  // Live: the production node kernel, pointed at the dedicated database for this process.
  const previous = process.env[LIVE_DB_ENV];
  process.env[LIVE_DB_ENV] = dbPath;
  await closeNodeKernel();
  await closeDefaultMeleeKernelRuntime();
  resetDefaultMeleeKernelRuntimeForTests();
  const restoreEnv = () => {
    if (previous === undefined) delete process.env[LIVE_DB_ENV];
    else process.env[LIVE_DB_ENV] = previous;
  };
  try {
    const kernel = await getNodeKernel({ stateDir: dirname(dbPath) });
    const runtime = await getDefaultMeleeKernelRuntime({ database: { stateDir: dirname(dbPath) } });
    if (!kernel || !runtime) throw new Error("the node kernel is unavailable (kernel runtime disabled?)");
    if (runtime.databasePath !== dbPath) throw new Error(`the node kernel opened ${runtime.databasePath}, not ${dbPath}`);
    const { containerId, parentRunId, parentSessionId } = await seedParent(runtime.db, opts.label);
    let closed = false;
    return {
      kernel,
      engine: "live",
      dbPath,
      containerId,
      parentRunId,
      parentSessionId,
      doctor: () => runDoctor(runtime.db),
      async close() {
        if (closed) return;
        closed = true;
        try {
          await finishParent(runtime.db, parentRunId);
        } finally {
          try {
            await closeNodeKernel();
          } finally {
            await closeDefaultMeleeKernelRuntime();
            resetDefaultMeleeKernelRuntimeForTests();
            restoreEnv();
          }
        }
      },
    };
  } catch (error) {
    await closeNodeKernel();
    await closeDefaultMeleeKernelRuntime();
    resetDefaultMeleeKernelRuntimeForTests();
    restoreEnv();
    throw error;
  }
}
