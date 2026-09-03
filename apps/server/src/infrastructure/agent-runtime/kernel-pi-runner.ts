import { TraceLevel, type EventData } from "@agent-kernel/protocol";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  createBashToolDefinition,
  type BashOperations,
} from "@earendil-works/pi-coding-agent";
import type { AgentContextResolver } from "@agent-kernel/kernel/context";
import type { ParsedAgent } from "@agent-kernel/kernel/spawn-pipeline";
import type { PiRunResult, RuntimeAgentRole } from "@server/core/shared/types";
import type { PiRunOptions } from "@server/infrastructure/agent-runtime/runtime";
import { buildAgentTools, type AgentToolRuntimeContext } from "@server/core/tools";
import {
  appKernelAgent,
  toKernelParsedAgentFromBundle,
  type KernelAgentId,
} from "@server/core/agent-catalog/kernel-catalog";

import {
  createAppKernel,
  type AppKernelSpawnContext,
  type AppKernelSpawnOptions,
} from "@server/infrastructure/kernel/bridge/kernel";
import {
  createAppKernelSpawnAgent,
  type BuildAppKernelToolFactories,
  type KernelSpawnAgentFactoryPort,
} from "@server/infrastructure/kernel/bridge/spawn-agent";
import { createAppKernelBridgeConfig } from "@server/infrastructure/kernel/bridge/config";
import { appKernelRuntimeRequiredFromEnv } from "@server/infrastructure/kernel/bridge/database";
import {
  getDefaultAppKernelRuntime,
  type AppKernelRuntime,
} from "@server/infrastructure/kernel/bridge/runtime";
import type { AppTraceWriter } from "@server/infrastructure/kernel/bridge/trace-writer";
import { runPiAgent } from "./runtime/pi-agent.js";

export const MELEE_AGENT_SPAWN_STARTED_EVENT = "melee:agent_spawn_started";
export const MELEE_AGENT_SPAWN_COMPLETED_EVENT = "melee:agent_spawn_completed";
export const MELEE_AGENT_SPAWN_FAILED_EVENT = "melee:agent_spawn_failed";

const CHILD_REAPER_GRACE_MS = 5_000;

type ChildReaperSignal = "SIGTERM" | "SIGKILL";
type ChildReaperKill = (pid: number, signal: ChildReaperSignal) => unknown;

export interface PiChildProcessReaper {
  registerProcessGroup(pgid: number): void;
  unregisterProcessGroup(pgid: number): void;
  processGroupCount(): number;
  handleSignal(signal: "SIGTERM" | "SIGINT"): void;
}

export function createPiChildProcessReaper(opts: {
  kill?: ChildReaperKill;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  exit?: (code: number) => void;
  platform?: NodeJS.Platform;
  graceMs?: number;
} = {}): PiChildProcessReaper {
  const processGroups = new Set<number>();
  const kill = opts.kill ?? process.kill;
  const schedule = opts.schedule ?? setTimeout;
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  const platform = opts.platform ?? process.platform;
  const graceMs = opts.graceMs ?? CHILD_REAPER_GRACE_MS;
  let reaping = false;

  const signalAll = (signal: ChildReaperSignal): void => {
    for (const pgid of [...processGroups]) {
      try {
        kill(platform === "win32" ? pgid : -pgid, signal);
      } catch (error) {
        const code = error && typeof error === "object" ? (error as NodeJS.ErrnoException).code : undefined;
        if (code === "ESRCH") processGroups.delete(pgid);
      }
    }
  };

  return {
    registerProcessGroup(pgid) {
      if (Number.isSafeInteger(pgid) && pgid > 0) processGroups.add(pgid);
    },
    unregisterProcessGroup(pgid) {
      if (!reaping) processGroups.delete(pgid);
    },
    processGroupCount() {
      return processGroups.size;
    },
    handleSignal(signal) {
      const exitCode = signal === "SIGINT" ? 130 : 143;
      if (reaping) {
        signalAll("SIGKILL");
        processGroups.clear();
        exit(exitCode);
        return;
      }
      reaping = true;
      signalAll("SIGTERM");
      schedule(() => {
        signalAll("SIGKILL");
        processGroups.clear();
        exit(exitCode);
      }, graceMs);
    },
  };
}

function childReaperDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ORCH_NO_CHILD_REAPER === "1";
}

const livePiChildProcessReaper = createPiChildProcessReaper();
let childReaperHandlersInstalled = false;

function installChildReaperSignalHandlers(): void {
  if (childReaperHandlersInstalled || childReaperDisabled()) return;
  childReaperHandlersInstalled = true;
  const install = (signal: "SIGTERM" | "SIGINT"): void => {
    const handler = (): void => {
      if (livePiChildProcessReaper.processGroupCount() > 0) {
        livePiChildProcessReaper.handleSignal(signal);
        return;
      }
      process.off(signal, handler);
      process.kill(process.pid, signal);
    };
    process.on(signal, handler);
  };
  install("SIGTERM");
  install("SIGINT");
}

function shellPath(): string {
  if (process.platform === "win32") return "bash.exe";
  return existsSync("/bin/bash") ? "/bin/bash" : "bash";
}

function signalProcessGroup(pgid: number, signal: ChildReaperSignal): void {
  try {
    process.kill(process.platform === "win32" ? pgid : -pgid, signal);
  } catch {
    // The process may have completed between the caller's check and the signal.
  }
}

function trackedBashOperations(): BashOperations {
  return {
    exec(command, cwd, options) {
      return new Promise((resolve, reject) => {
        if (options.signal?.aborted) {
          reject(new Error("aborted"));
          return;
        }
        installChildReaperSignalHandlers();
        const child = spawn(shellPath(), ["-c", command], {
          cwd,
          // Node's POSIX spawn API creates a new process group only when detached is true.
          // The child remains tracked and is never unref'ed, so normal completion is unchanged.
          detached: process.platform !== "win32",
          env: options.env ?? process.env,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
        const pgid = child.pid;
        if (pgid) livePiChildProcessReaper.registerProcessGroup(pgid);
        let timedOut = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let settled = false;

        const cleanup = (): void => {
          if (pgid) livePiChildProcessReaper.unregisterProcessGroup(pgid);
          if (timeout) clearTimeout(timeout);
          options.signal?.removeEventListener("abort", onAbort);
        };
        const onAbort = (): void => {
          if (pgid) signalProcessGroup(pgid, "SIGKILL");
        };
        child.stdout?.on("data", options.onData);
        child.stderr?.on("data", options.onData);
        child.once("error", (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        });
        child.once("close", (exitCode) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (options.signal?.aborted) reject(new Error("aborted"));
          else if (timedOut) reject(new Error(`timeout:${options.timeout}`));
          else resolve({ exitCode });
        });
        if (options.timeout !== undefined && options.timeout > 0) {
          timeout = setTimeout(() => {
            timedOut = true;
            if (pgid) signalProcessGroup(pgid, "SIGKILL");
          }, options.timeout * 1_000);
        }
        options.signal?.addEventListener("abort", onAbort, { once: true });
      });
    },
  };
}

export type AppKernelSpawnStrategy = "auto" | "kernel";

export interface AppKernelAgentCatalogEntry {
  name: string;
  model?: string;
  tools?: string[];
  disallowedTools?: string[];
  thinking?: string | null;
}

export interface KernelPromptBundleConversion {
  parsed: ParsedAgent;
  userPrompt: string;
  contextResolver?: AgentContextResolver | null;
}

export type ResolveAppKernelAgent = (
  role: RuntimeAgentRole,
  catalogAgentId?: KernelAgentId,
) => AppKernelAgentCatalogEntry;

export type ConvertAppKernelPromptBundle = (
  entry: AppKernelAgentCatalogEntry,
  bundle: PiRunOptions["prompt"],
) => KernelPromptBundleConversion;

export type AppKernelSpawnTraceWriter =
  Pick<AppTraceWriter, "submitAppEvent"> &
  Partial<Pick<AppTraceWriter, "submit">>;
export interface AppKernelSpawnRuntime {
  config?: Pick<AppKernelRuntime["config"], "markerConfig" | "piSessionsDir">;
  db?: unknown;
  traceWriter?: AppKernelSpawnTraceWriter;
  upsertSpawnContainers?: AppKernelRuntime["upsertSpawnContainers"];
}

export interface AppKernelPiRunOptions extends PiRunOptions {
  catalogAgentId?: KernelAgentId;
  autoInitializeKernelRuntime?: boolean;
  kernelContext?: AppKernelSpawnContext;
  kernelOptions?: AppKernelSpawnOptions;
  kernelRuntime?: AppKernelSpawnRuntime | null;
  kernelSpawnStrategy?: AppKernelSpawnStrategy;
  traceWriter?: AppKernelSpawnTraceWriter;
}

export type PiRunAgentPort = (options: PiRunOptions) => Promise<PiRunResult>;

export interface CreateAppKernelPiAgentRunnerOptions {
  buildToolFactories?: BuildAppKernelToolFactories;
  createKernelSpawnAgent?: KernelSpawnAgentFactoryPort;
  resolveKernelAgent?: ResolveAppKernelAgent;
  runPiAgent?: PiRunAgentPort;
  toKernelParsedAgentFromBundle?: ConvertAppKernelPromptBundle;
}

function defaultKernelAgent(role: RuntimeAgentRole): AppKernelAgentCatalogEntry {
  return {
    name: role,
    model: undefined,
    tools: [],
    disallowedTools: [],
    thinking: null,
  };
}

function defaultParsedAgentFromBundle(
  entry: AppKernelAgentCatalogEntry,
  bundle: PiRunOptions["prompt"],
): KernelPromptBundleConversion {
  return {
    parsed: {
      config: {
        name: entry.name,
        description: "",
        model: entry.model ?? "unspecified",
        tools: entry.tools ?? [],
        disallowedTools: entry.disallowedTools ?? [],
        variables: {},
        thinking: entry.thinking ?? undefined,
      },
      body: bundle.systemPrompt,
    },
    userPrompt: bundle.userPrompt,
    contextResolver: null,
  };
}

function defaultKernelContext(options: PiRunOptions): AppKernelSpawnContext {
  return {
    workingDir: options.cwd,
    phase: options.role,
    metadata: {
      role: options.role,
      outputDir: options.outputDir,
      dryRun: options.dryRun,
    },
  };
}

function kernelOptionsFor(options: PiRunOptions, overrides?: AppKernelSpawnOptions): AppKernelSpawnOptions {
  const provider = options.provider ?? undefined;
  const model = options.model ?? undefined;
  return {
    timeoutMs: options.timeoutMs,
    model: provider && model ? `${provider}/${model}` : model,
    ...overrides,
    metadata: {
      role: options.role,
      outputDir: options.outputDir,
      dryRun: options.dryRun,
      ...(overrides?.metadata ?? {}),
    },
  };
}

function spawnStrategyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AppKernelSpawnStrategy {
  const value = env.ORCH_AGENT_KERNEL_SPAWN_STRATEGY;
  if (!value) return "auto";
  if (value === "kernel" || value === "auto") return value;
  throw new Error(`Unsupported ORCH_AGENT_KERNEL_SPAWN_STRATEGY "${value}"; expected "auto" or "kernel"`);
}

function spawnEventData(
  options: PiRunOptions,
  extra: Record<string, unknown> = {},
): EventData {
  return {
    agent: options.role,
    outputDir: options.outputDir,
    dryRun: options.dryRun,
    systemTemplatePath: options.prompt.systemTemplatePath,
    userTemplatePath: options.prompt.userTemplatePath,
    ...extra,
  } as EventData;
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function kernelSessionBindingEntries(
  context: AppKernelSpawnContext,
  options: PiRunOptions,
  markerConfig: AppKernelRuntime["config"]["markerConfig"],
): PiRunOptions["customSessionEntries"] {
  if (!context.appSessionId) return undefined;
  const metadata = context.metadata ?? {};
  const lineage = context.containerLineage ?? [];
  const leaf = lineage.length > 0 ? lineage[lineage.length - 1] : undefined;
  return [
    {
      customType: markerConfig.sessionBinding,
      data: {
        appSessionId: context.appSessionId,
        appSessionSlug:
          metadataString(metadata, "appSessionSlug") ??
          metadataString(metadata, "sessionId") ??
          metadataString(metadata, "runId") ??
          context.appSessionId,
        appSessionDir:
          metadataString(metadata, "appSessionDir") ??
          metadataString(metadata, "stateDir") ??
          context.workingDir ??
          options.cwd,
        containerId: context.containerId,
        phase: context.phase ?? options.role,
        agentName: options.role,
        role: options.role,
        displayLabel: leaf?.label ?? options.role,
        workingDir: context.workingDir ?? options.cwd,
        outputDir: options.outputDir,
        metadata,
      },
    },
  ];
}

async function submitSpawnEvent(
  traceWriter: AppKernelSpawnTraceWriter | undefined,
  context: AppKernelSpawnContext,
  type: string,
  options: PiRunOptions,
  eventData: Record<string, unknown> = {},
): Promise<void> {
  if (!traceWriter || !context.appSessionId) return;
  await traceWriter.submitAppEvent({
    appSessionId: context.appSessionId,
    containerId: context.containerId,
    type,
    traceLevel: TraceLevel.PROCESSING,
    agentId: options.role,
    eventData: spawnEventData(options, eventData),
  });
}

let runtimeStepWarningShown = false;

async function runRuntimeStep(
  label: string,
  required: boolean,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (required) throw error;
    if (!runtimeStepWarningShown) {
      runtimeStepWarningShown = true;
      console.warn(
        `Agent Kernel runtime step "${label}" failed; continuing without persisted kernel observability for this spawn: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function directUserPromptForContextSpawn(
  piOptions: PiRunOptions,
  prompt: string,
): string {
  const renderedContext = piOptions.prompt.kernelContext?.renderedContext?.trim();
  if (!renderedContext) return prompt;
  const turnPrompt = prompt.trim();
  if (!turnPrompt || turnPrompt === renderedContext) return renderedContext;
  return `${renderedContext}\n\n${turnPrompt}`;
}

export function createAppKernelPiAgentRunner(
  deps: CreateAppKernelPiAgentRunnerOptions = {},
): (options: AppKernelPiRunOptions) => Promise<PiRunResult> {
  const runPiAgent =
    deps.runPiAgent ??
    (async () => {
      throw new Error("createAppKernelPiAgentRunner requires a runPiAgent port");
    });
  const resolveKernelAgent = deps.resolveKernelAgent ?? defaultKernelAgent;
  const convertPromptBundle = deps.toKernelParsedAgentFromBundle ?? defaultParsedAgentFromBundle;

  return async function runAppKernelPiAgent(
    options: AppKernelPiRunOptions,
  ): Promise<PiRunResult> {
    const {
      autoInitializeKernelRuntime = true,
      kernelContext,
      kernelOptions,
      kernelRuntime,
      kernelSpawnStrategy,
      traceWriter,
      ...piOptions
    } = options;
    const entry = resolveKernelAgent(piOptions.role, piOptions.catalogAgentId);
    const converted = convertPromptBundle(entry, piOptions.prompt);
    const context = {
      ...defaultKernelContext(piOptions),
      ...(kernelContext ?? {}),
      metadata: {
        ...defaultKernelContext(piOptions).metadata,
        ...(kernelContext?.metadata ?? {}),
        kernelAgentId: entry.name,
      },
    };
    const runtime =
      kernelRuntime ??
      (autoInitializeKernelRuntime
        ? await getDefaultAppKernelRuntime({
            config: {
              workingDir: piOptions.cwd,
            },
            database: {
              stateDir: metadataString(context.metadata, "stateDir") ?? undefined,
            },
          })
        : null);
    const spawnTraceWriter = traceWriter ?? runtime?.traceWriter;
    const runtimeRequired = kernelRuntime != null || appKernelRuntimeRequiredFromEnv();
    const markerConfig =
      runtime?.config?.markerConfig ??
      createAppKernelBridgeConfig({ workingDir: piOptions.cwd }).markerConfig;
    const strategy = kernelSpawnStrategy ?? spawnStrategyFromEnv();
    const useKernelCreateSpawnAgent =
      strategy === "kernel" ||
      (strategy === "auto" && Boolean(runtime?.db && context.appSessionId && !piOptions.dryRun));
    const kernelUserPrompt = converted.userPrompt;

    if (strategy === "kernel" && piOptions.dryRun) {
      throw new Error("Kernel createSpawnAgent strategy does not support Pi dryRun");
    }
    if (!piOptions.dryRun && !useKernelCreateSpawnAgent) {
      const reason = !runtime?.db
        ? "initialized kernel runtime DB"
        : !context.appSessionId
          ? "kernel app session id"
          : "kernel spawn strategy";
      throw new Error(`Non-dry app agent spawns must use kernel createSpawnAgent; missing ${reason}.`);
    }
    if (useKernelCreateSpawnAgent && !runtime?.db) {
      throw new Error("Kernel createSpawnAgent strategy requires an initialized kernel runtime DB");
    }
    if (useKernelCreateSpawnAgent && !runtime?.config?.piSessionsDir) {
      throw new Error("Kernel createSpawnAgent strategy requires runtime.config.piSessionsDir");
    }

    const kernel = createAppKernel<PiRunResult>({
      spawnAgent: useKernelCreateSpawnAgent
        ? createAppKernelSpawnAgent({
            piOptions,
            expectedAgentName: entry.name,
            parsedAgent: converted.parsed,
            contextResolver: converted.contextResolver ?? null,
            runtime: {
              db: runtime!.db,
              config: {
                markerConfig,
                piSessionsDir: runtime!.config!.piSessionsDir,
              },
              traceWriter: spawnTraceWriter,
            },
            buildToolFactories: deps.buildToolFactories,
            createSpawnAgent: deps.createKernelSpawnAgent,
          })
        : async (name, prompt) => {
            if (name !== entry.name) {
              throw new Error(`App kernel spawn mismatch: expected ${entry.name}, got ${name}`);
            }
            const userPrompt = converted.contextResolver
              ? directUserPromptForContextSpawn(piOptions, prompt)
              : prompt;
            return runPiAgent({
              ...piOptions,
              customSessionEntries: [
                ...(piOptions.customSessionEntries ?? []),
                ...(kernelSessionBindingEntries(context, piOptions, markerConfig) ?? []),
              ],
              piLifecycleCustomType:
                piOptions.piLifecycleCustomType ??
                (context.appSessionId ? markerConfig.lifecycle : undefined),
              prompt: {
                ...piOptions.prompt,
                systemPrompt: converted.parsed.body,
                userPrompt,
              },
            });
          },
    });

    const upsertSpawnContainers = runtime?.upsertSpawnContainers;
    if (upsertSpawnContainers) {
      await runRuntimeStep("upsert spawn containers", runtimeRequired, () =>
        upsertSpawnContainers(context),
      );
    }
    await runRuntimeStep("submit spawn started event", runtimeRequired, () =>
      submitSpawnEvent(spawnTraceWriter, context, MELEE_AGENT_SPAWN_STARTED_EVENT, piOptions),
    );
    try {
      const result = await kernel.spawnAgent(
        entry.name,
        kernelUserPrompt,
        context,
        kernelOptionsFor(piOptions, kernelOptions),
      );
      const status = result.failed || result.providerError ? "failed" : result.dryRun ? "dry_run" : "succeeded";
      const eventType =
        result.failed || result.providerError
          ? MELEE_AGENT_SPAWN_FAILED_EVENT
          : MELEE_AGENT_SPAWN_COMPLETED_EVENT;
      await runRuntimeStep("submit spawn completed event", runtimeRequired, () =>
        submitSpawnEvent(spawnTraceWriter, context, eventType, piOptions, {
          sessionId: result.sessionId,
          sessionFile: result.sessionFile ?? null,
          outputPath: result.outputPath,
          status,
          error: result.error ?? result.providerError ?? null,
        }),
      );
      return result;
    } catch (error) {
      await runRuntimeStep("submit spawn failed event", runtimeRequired, () =>
        submitSpawnEvent(spawnTraceWriter, context, MELEE_AGENT_SPAWN_FAILED_EVENT, piOptions, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw error;
    } finally {
      kernel.dispose();
    }
  };
}

export const buildAppKernelToolFactories: BuildAppKernelToolFactories = (options) => {
  const toolContext: AgentToolRuntimeContext = {
    role: options.role,
    cwd: options.cwd,
    repoRoot: options.cwd,
    ...(options.toolContext ?? {}),
  };
  const toolFactories: ReturnType<BuildAppKernelToolFactories> = [
    ...buildAgentTools(toolContext, options.toolProfile),
    ...(options.customTools ?? []),
  ].map((tool) => {
    return (pi) => {
      pi.registerTool(tool as never);
    };
  });
  if (options.bashOperations || !childReaperDisabled()) {
    toolFactories.push((pi) => {
      pi.registerTool(createBashToolDefinition(toolContext.cwd, {
        operations: options.bashOperations ?? trackedBashOperations(),
        ...(options.bashEnvironment
          ? {
              exposeSessionEnvironment: false,
              spawnHook: (context) => ({ ...context, env: { ...options.bashEnvironment } }),
            }
          : {}),
      }) as never);
    });
  }
  return toolFactories;
};

export const runAppKernelPiAgent = createAppKernelPiAgentRunner({
  buildToolFactories: buildAppKernelToolFactories,
  resolveKernelAgent(role, catalogAgentId) {
    return appKernelAgent(catalogAgentId ?? (role as KernelAgentId));
  },
  runPiAgent,
  toKernelParsedAgentFromBundle(entry, bundle) {
    return toKernelParsedAgentFromBundle(appKernelAgent(entry.name as KernelAgentId), bundle);
  },
});
