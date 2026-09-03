import type { NewContainer } from "@agent-kernel/db";

import { MELEE_KERNEL_ID } from "./config.js";

export interface AppKernelSpawnContext {
  appSessionId?: string;
  containerId?: string;
  containerLineage?: NewContainer[];
  phase?: string;
  workingDir?: string;
  metadata?: Record<string, unknown>;
}

export interface AppKernelSpawnOptions {
  model?: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export type AppKernelSpawnAdapter<TResult = unknown> = (
  name: string,
  prompt: string,
  context?: AppKernelSpawnContext | null,
  options?: AppKernelSpawnOptions,
) => Promise<TResult>;

export interface AppKernelAgentManagerLike {
  setMaxConcurrent?: (limit: number) => void;
  dispose?: () => void;
}

export interface CreateAppKernelOptions<
  TResult = unknown,
  TAgentManager extends AppKernelAgentManagerLike | undefined = undefined,
> {
  id?: string;
  concurrency?: { maxBackgroundAgents?: number };
  spawnAgent: AppKernelSpawnAdapter<TResult>;
  createAgentManager?: (input: {
    kernelId: string;
    maxConcurrentBackgroundAgents: number;
    spawnAgent: AppKernelSpawnAdapter<TResult>;
  }) => TAgentManager;
}

export interface AppKernelInstance<
  TResult = unknown,
  TAgentManager extends AppKernelAgentManagerLike | undefined = undefined,
> {
  readonly id: string;
  readonly concurrency: { maxBackgroundAgents: number };
  readonly agentManager: TAgentManager;
  spawnAgent: AppKernelSpawnAdapter<TResult>;
  setMaxBackgroundAgents(limit: number): void;
  dispose(): void;
}

function normalizeBackgroundAgentLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 4;
  return Math.max(1, Math.floor(limit));
}

/**
 * Compatibility wrapper for the harness's per-invocation spawn adapter. The
 * live createKernel now owns a catalog runtime and is not a drop-in adapter;
 * moving this path to that catalog is intentionally a separate migration.
 */
export function createAppKernel<
  TResult = unknown,
  TAgentManager extends AppKernelAgentManagerLike | undefined = undefined,
>(
  options: CreateAppKernelOptions<TResult, TAgentManager>,
): AppKernelInstance<TResult, TAgentManager> {
  const id = options.id ?? MELEE_KERNEL_ID;
  let maxBackgroundAgents = normalizeBackgroundAgentLimit(
    options.concurrency?.maxBackgroundAgents,
  );
  const spawnAgent: AppKernelSpawnAdapter<TResult> = (name, prompt, context, spawnOptions) =>
    options.spawnAgent(name, prompt, context, spawnOptions);
  const agentManager = options.createAgentManager?.({
    kernelId: id,
    maxConcurrentBackgroundAgents: maxBackgroundAgents,
    spawnAgent,
  }) as TAgentManager;

  return {
    id,
    get concurrency() {
      return { maxBackgroundAgents };
    },
    agentManager,
    spawnAgent,
    setMaxBackgroundAgents(limit) {
      maxBackgroundAgents = normalizeBackgroundAgentLimit(limit);
      agentManager?.setMaxConcurrent?.(maxBackgroundAgents);
    },
    dispose() {
      agentManager?.dispose?.();
    },
  };
}
