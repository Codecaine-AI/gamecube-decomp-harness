import type { NewContainer } from "@agent-kernel/db";

import { MELEE_KERNEL_ID } from "./config.js";

export interface MeleeKernelSpawnContext {
  appSessionId?: string;
  containerId?: string;
  containerLineage?: NewContainer[];
  phase?: string;
  workingDir?: string;
  metadata?: Record<string, unknown>;
}

export interface MeleeKernelSpawnOptions {
  model?: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export type MeleeKernelSpawnAdapter<TResult = unknown> = (
  name: string,
  prompt: string,
  context?: MeleeKernelSpawnContext | null,
  options?: MeleeKernelSpawnOptions,
) => Promise<TResult>;

export interface MeleeKernelAgentManagerLike {
  setMaxConcurrent?: (limit: number) => void;
  dispose?: () => void;
}

export interface CreateMeleeKernelOptions<
  TResult = unknown,
  TAgentManager extends MeleeKernelAgentManagerLike | undefined = undefined,
> {
  id?: string;
  concurrency?: { maxBackgroundAgents?: number };
  spawnAgent: MeleeKernelSpawnAdapter<TResult>;
  createAgentManager?: (input: {
    kernelId: string;
    maxConcurrentBackgroundAgents: number;
    spawnAgent: MeleeKernelSpawnAdapter<TResult>;
  }) => TAgentManager;
}

export interface MeleeKernelInstance<
  TResult = unknown,
  TAgentManager extends MeleeKernelAgentManagerLike | undefined = undefined,
> {
  readonly id: string;
  readonly concurrency: { maxBackgroundAgents: number };
  readonly agentManager: TAgentManager;
  spawnAgent: MeleeKernelSpawnAdapter<TResult>;
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
export function createMeleeKernel<
  TResult = unknown,
  TAgentManager extends MeleeKernelAgentManagerLike | undefined = undefined,
>(
  options: CreateMeleeKernelOptions<TResult, TAgentManager>,
): MeleeKernelInstance<TResult, TAgentManager> {
  const id = options.id ?? MELEE_KERNEL_ID;
  let maxBackgroundAgents = normalizeBackgroundAgentLimit(
    options.concurrency?.maxBackgroundAgents,
  );
  const spawnAgent: MeleeKernelSpawnAdapter<TResult> = (name, prompt, context, spawnOptions) =>
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
