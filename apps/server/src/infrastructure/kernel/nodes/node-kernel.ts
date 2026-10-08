// The node kernel (plan §5 M8-C task 4): one lazily created kernel per
// process for kernel.call/decide/step/gate, on the melee kernel database.
// The worker child uses it for enforce-mode adjudication; the run-loop
// process uses it for the model-node lanes. This module and the generated
// client are the only importers of @boundaryml/baml: the kernel receives the
// module by injection and never loads its own copy (plan §3.3).
//
// The kernel, BAML and the generated client load on first use, not at
// import, so importers that only need closeNodeKernel() or the types
// (job-runner, tests) stay cheap: the kernel root costs about 230 ms to load,
// the native BAML addon about 28 MB per process, and the generated client
// calls AsyncLocalStorage.enterWith when it loads, which stalls every
// bun:test callback in a file that imports it statically.
import { homedir } from "node:os";
import { join } from "node:path";

import type { CreateKernelConfig, KernelInstance, KernelLogger, ModelPriceTable } from "@agent-kernel/kernel";
import type { b } from "@server/generated/baml_client";

import { MELEE_KERNEL_ID } from "../bridge/config.js";
import { getDefaultMeleeKernelRuntime } from "../bridge/runtime.js";
import { NODE_CALL_MANIFESTS, NODE_CALL_MODEL } from "./functions.js";

export type NodeCalls = typeof b;
export type WorkerNodeKernel = Pick<KernelInstance<unknown, NodeCalls>, "call" | "decide" | "step" | "gate">;

/** Pinned Jev release for decisions (owner D4/O8). */
export const NODE_DECIDE_MODEL = "typesafe/jev-1.13.0";
export const NODE_CALL_TIMEOUT_MS = 60_000;
/** Declared in baml_src/clients.baml. */
export const NODE_CALL_RETRY_POLICY = "KernelCallRetry";

/** Classifier list prices; codex-lb calls run on a subscription and stay unpriced. */
export const NODE_MODEL_PRICES: ModelPriceTable = {
  "typesafe/jev-1.13.0": { inputPerMTok: 0.042, outputPerMTok: 0 },
  "typesafe/jev-latest": { inputPerMTok: 0.042, outputPerMTok: 0 },
  "openai/gpt-6-luna": { inputPerMTok: 0.1 },
};

function expandTilde(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function nodePiAgentDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.PI_CODING_AGENT_DIR;
  return configured ? expandTilde(configured) : join(homedir(), ".pi", "agent");
}

// Model-node logs carry only ids, names, model refs, sizes, durations and
// error kinds (plan §4.7), so they are safe to print.
const nodeKernelLogger: KernelLogger = {
  debug() {},
  info: (message, data) => console.info(`[node-kernel] ${message}`, data ?? ""),
  warn: (message, data) => console.warn(`[node-kernel] ${message}`, data ?? ""),
  error: (message, data) => console.error(`[node-kernel] ${message}`, data ?? ""),
};

let nodeKernelPromise: Promise<KernelInstance<unknown, NodeCalls> | null> | null = null;

async function createNodeKernel(stateDir: string): Promise<KernelInstance<unknown, NodeCalls> | null> {
  const runtime = await getDefaultMeleeKernelRuntime({ database: { stateDir } });
  if (!runtime) return null;
  const [{ createKernel }, { bamlEngine }, baml, { b: client }, { getBamlFiles }] = await Promise.all([
    import("@agent-kernel/kernel"),
    import("@agent-kernel/kernel/baml-engine"),
    import("@boundaryml/baml"),
    import("@server/generated/baml_client"),
    import("@server/generated/baml_client/inlinedbaml"),
  ]);
  return createKernel<unknown, NodeCalls>({
    id: MELEE_KERNEL_ID,
    db: runtime.db as CreateKernelConfig["db"],
    piAgentDir: nodePiAgentDir(),
    models: {
      defaults: { call: NODE_CALL_MODEL, decide: NODE_DECIDE_MODEL },
      prices: NODE_MODEL_PRICES,
    },
    calls: {
      engine: bamlEngine({
        client,
        baml,
        sources: getBamlFiles(),
        manifests: NODE_CALL_MANIFESTS,
        retryPolicy: NODE_CALL_RETRY_POLICY,
      }),
      defaultTimeoutMs: NODE_CALL_TIMEOUT_MS,
    },
    logger: nodeKernelLogger,
  });
}

/**
 * Returns the process's node kernel, creating it on first use over the
 * default melee kernel runtime (whose database `stateDir` selects unless
 * ORCH_AGENT_KERNEL_DB_PATH is set). Null when the kernel runtime is disabled
 * or unavailable. A null or failed attempt is not cached, so a later call
 * retries; the first successful call's `stateDir` wins for the process.
 */
export function getNodeKernel({ stateDir }: { stateDir: string }): Promise<WorkerNodeKernel | null> {
  if (!nodeKernelPromise) {
    const pending = createNodeKernel(stateDir);
    nodeKernelPromise = pending;
    const forget = () => {
      if (nodeKernelPromise === pending) nodeKernelPromise = null;
    };
    pending.then((kernel) => {
      if (!kernel) forget();
    }, forget);
  }
  return nodeKernelPromise;
}

/**
 * Flushes and drops the node kernel; a no-op that loads nothing when none was
 * created. Call before closeDefaultMeleeKernelRuntime(), which closes the
 * database the node kernel writes to.
 */
export async function closeNodeKernel(): Promise<void> {
  const pending = nodeKernelPromise;
  nodeKernelPromise = null;
  const kernel = await pending?.catch(() => null);
  if (!kernel) return;
  try {
    await kernel.traceWriter.flush();
  } finally {
    kernel.dispose();
  }
}
