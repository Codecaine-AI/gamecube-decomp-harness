// The node kernels calibration commands run on, each over its own kernel
// database (never the harness's): a temp directory, or `--db <path>`.
// - `live` (only with MODEL_NODES_LIVE=1): the production node kernel (BAML calls through codex-lb, Jev
//   decisions through Pi), pointed at the dedicated database.
// - `fake`: the kernel's offline fakes (plan §7.1): a scripted call engine and
//   the fake classifier, with every production model ref aliased to them, so
//   no model client is constructed and nothing reaches the network.
// Every node nests under one seeded parent run; close() ends that run, its
// session and its container (done/ended, or error), so the trace doctor and
// the viewer see a finished command rather than a pending one.
import { createHash, randomUUID } from "node:crypto";
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

import { assertLiveOptIn } from "./args.js";

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
  /**
   * Fixed parent ids, so a later command into the same `dbPath` nests under the
   * same parent: the kernel replays a requestId only for the same request,
   * parent scope included. An existing parent is reopened (running/active)
   * and ended again on close. Default: fresh ids.
   */
  parent?: ParentIds;
}

export interface CalibrationKernel {
  kernel: WorkerNodeKernel;
  engine: "live" | "fake";
  dbPath: string;
  containerId: string;
  parentRunId: string;
  parentSessionId: string;
  /** True when `parent` named a parent this database already held (reopened, not created). */
  reusedParent: boolean;
  /** Fake engines only. */
  classifier?: FakeClassifier;
  /** The trace doctor over this kernel's database. */
  doctor(): Promise<DoctorReport>;
  /**
   * Ends the parent run, session and container (`done`/`ended`/`done`, or
   * `error` for a failed command), flushes, closes, and removes an owned temp
   * directory (fake only).
   */
  close(outcome?: ParentOutcome): Promise<void>;
  /** Ends the parent run, session and container now (once; close() then keeps that outcome), e.g. before running the doctor. */
  finish(outcome: ParentOutcome): Promise<void>;
}

export type ParentOutcome = "done" | "error";

interface KernelDbHost {
  db: unknown;
  close(): Promise<void>;
}

export interface ParentIds {
  containerId: string;
  parentRunId: string;
  parentSessionId: string;
}

function seededUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Parent ids fixed by a seed (the command's inputs and engine): a repeat
 * command into the same database nests under the same parent, so its nodes'
 * requestIds replay (the kernel compares the parent scope too).
 */
export function seededParentIds(label: string, seed: string): ParentIds {
  const base = `advisory-calibration ${label}\n${seed}`;
  return {
    containerId: `melee:advisory-calibration-${label}-${createHash("sha256").update(base).digest("hex").slice(0, 12)}`,
    parentRunId: seededUuid(`${base}\nrun`),
    parentSessionId: seededUuid(`${base}\nsession`),
  };
}

async function seedParent(db: unknown, label: string, fixed?: ParentIds): Promise<ParentIds & { reused: boolean }> {
  const [{ setupPiSessionAndRun }, { getAgentRun, updateAgentRunStatus, updateContainerStatus, updatePiAgentSessionStatus }] = await Promise.all([
    import("@agent-kernel/kernel/spawn-pipeline/session"),
    import("@agent-kernel/db"),
  ]);
  const containerId = fixed?.containerId ?? `melee:advisory-calibration-${label}-${randomUUID()}`;
  const now = new Date().toISOString();
  await upsertMeleeContainer(db, {
    id: containerId,
    kernelId: MELEE_KERNEL_ID,
    kind: "session",
    appKey: [containerId],
    parentContainerId: null,
    label: `advisory-calibration ${label}`,
    status: "active",
    workingDir: null,
    phase: null,
    phaseVocabulary: [],
    metadata: {},
    createdAt: now,
    startedAt: now,
  });
  const parentRunId = fixed?.parentRunId ?? randomUUID();
  const parentSessionId = fixed?.parentSessionId ?? randomUUID();
  if (fixed && (await getAgentRun(db as KernelDatabase, parentRunId))) {
    await updateContainerStatus(db as KernelDatabase, containerId, "active");
    await updatePiAgentSessionStatus(db as KernelDatabase, parentSessionId, "active");
    await updateAgentRunStatus(db as KernelDatabase, parentRunId, "running");
    return { containerId, parentRunId, parentSessionId, reused: true };
  }
  await setupPiSessionAndRun(db as KernelDatabase, {
    piSessionUuid: parentSessionId,
    containerId,
    runId: parentRunId,
    agentName: `advisory-calibration-${label}`,
    trigger: "operator",
  });
  return { containerId, parentRunId, parentSessionId, reused: false };
}

/** The seeded parent run, its session and its container reach a terminal status together. */
async function finishParent(db: unknown, ids: ParentIds, outcome: ParentOutcome): Promise<void> {
  const { updateAgentRunStatus, updateContainerStatus, updatePiAgentSessionStatus } = await import("@agent-kernel/db");
  const endedAt = new Date().toISOString();
  const kernelDb = db as KernelDatabase;
  await updateAgentRunStatus(kernelDb, ids.parentRunId, outcome, { endedAt });
  await updatePiAgentSessionStatus(kernelDb, ids.parentSessionId, outcome === "done" ? "ended" : "error", endedAt);
  await updateContainerStatus(kernelDb, ids.containerId, outcome, { endedAt });
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
  // Before any database or client exists.
  if (opts.engine === "live") assertLiveOptIn("advisory-calibration");
  const { path: dbPath, ownedDir } = resolveDbPath(opts.dbPath);
  if (opts.engine === "fake") {
    const fake = await openFakeKernel(opts, dbPath);
    const parent = await seedParent(fake.host.db, opts.label, opts.parent);
    const { containerId, parentRunId, parentSessionId } = parent;
    let closed = false;
    let finished = false;
    const finish = async (outcome: ParentOutcome) => {
      if (finished) return;
      finished = true;
      await finishParent(fake.host.db, parent, outcome);
    };
    return {
      kernel: fake.kernel,
      engine: "fake",
      dbPath,
      containerId,
      parentRunId,
      parentSessionId,
      reusedParent: parent.reused,
      classifier: fake.classifier,
      doctor: () => runDoctor(fake.host.db),
      finish,
      async close(outcome = "done") {
        if (closed) return;
        closed = true;
        try {
          await finish(outcome);
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
    const parent = await seedParent(runtime.db, opts.label, opts.parent);
    const { containerId, parentRunId, parentSessionId } = parent;
    let closed = false;
    let finished = false;
    const finish = async (outcome: ParentOutcome) => {
      if (finished) return;
      finished = true;
      await finishParent(runtime.db, parent, outcome);
    };
    return {
      kernel,
      engine: "live",
      dbPath,
      containerId,
      parentRunId,
      parentSessionId,
      reusedParent: parent.reused,
      doctor: () => runDoctor(runtime.db),
      finish,
      async close(outcome = "done") {
        if (closed) return;
        closed = true;
        try {
          await finish(outcome);
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
