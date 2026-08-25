import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import type { ExtensionContext, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import {
  ensureKernelObservabilitySchema as ensureLiveKernelSqliteSchema,
  openKernelDatabase,
  upsertContainer as upsertLiveKernelContainer,
} from "@agent-kernel/db";
import {
  createKernel as createLiveKernel,
  type CreateKernelConfig,
} from "@agent-kernel/kernel";
import {
  type KernelSpawnAgentResult,
  type KernelSpawnOptions,
  type ParsedAgent,
  type SpawnAgentLoggerLike,
} from "@agent-kernel/kernel/spawn-pipeline";
import type { SessionBindingInput } from "@agent-kernel/kernel/spawn-pipeline/pi-session-factory";
import {
  createSpawnContext as defaultCreateSpawnContext,
  type AgentContextResolver,
  type CreateSpawnContextParams,
  type SpawnContext,
} from "@agent-kernel/kernel/context";
import { EventType, type TraceEvent } from "@agent-kernel/protocol";
import type { PiRunResult } from "@server/core/shared/types";
import type { PiRunOptions } from "@server/infrastructure/agent-runtime/runtime";
import { applyProcessEnvPatch } from "@server/infrastructure/agent-runtime/runtime/process-env";

import { MELEE_KERNEL_ID, type MeleeKernelBridgeConfig } from "./config.js";
import type {
  MeleeKernelSpawnAdapter,
  MeleeKernelSpawnContext,
  MeleeKernelSpawnOptions,
} from "./kernel.js";
import { createMeleeLoaderCatalog } from "./loaders.js";

export type BuildMeleeKernelToolFactories = (
  piOptions: PiRunOptions,
) => ExtensionFactory[];

export const MELEE_KERNEL_MANAGED_RUN_MARKER_FIELD = "kernelManagedRun";

export interface MeleeKernelPipelineSpawnOptions extends KernelSpawnOptions {
  /**
   * Compatibility metadata retained in the harness marker while the app moves
   * to the live kernel's container/run identity model.
   */
  appSessionId?: string;
  appSessionSlug?: string;
  appSessionDir?: string;
}

export type MeleeKernelPipelineSpawnAgent = (
  name: string,
  prompt: string,
  ctx?: ExtensionContext | null,
  opts?: MeleeKernelPipelineSpawnOptions,
) => Promise<KernelSpawnAgentResult>;

export interface MeleeCreateSpawnAgentAdapters {
  loadAgent(name: string, opts?: MeleeKernelPipelineSpawnOptions): ParsedAgent;
  loadAgentResolver(name: string): Promise<AgentContextResolver | null>;
  buildPrivateRegisterFactory(name: string): Promise<ExtensionFactory | null>;
  buildToolFactories(config: ParsedAgent["config"]): ExtensionFactory[];
  createContextCatalog(): ReturnType<typeof createMeleeLoaderCatalog>;
  createSpawnContext: (params: CreateSpawnContextParams) => SpawnContext;
  getDb(): unknown;
  createAppSessionBinding?(opts: MeleeKernelPipelineSpawnOptions): SessionBindingInput | undefined;
  piLifecycleCustomType?: string;
  logger?: SpawnAgentLoggerLike;
}

export type KernelSpawnAgentFactoryPort = (
  adapters: MeleeCreateSpawnAgentAdapters,
) => MeleeKernelPipelineSpawnAgent;

export type KernelTraceWriterSinkLike = {
  submit?: (event: TraceEvent) => unknown;
};

export interface MeleeCreateSpawnAgentRuntime {
  db: unknown;
  config: Pick<MeleeKernelBridgeConfig, "markerConfig" | "piSessionsDir">;
  traceWriter?: KernelTraceWriterSinkLike;
}

export interface CreateMeleeKernelSpawnAgentOptions {
  piOptions: PiRunOptions;
  parsedAgent: ParsedAgent;
  contextResolver?: AgentContextResolver | null;
  runtime: MeleeCreateSpawnAgentRuntime;
  createSpawnAgent?: KernelSpawnAgentFactoryPort;
  createSpawnContext?: (params: CreateSpawnContextParams) => SpawnContext;
  loadAgentResolver?: (name: string) => Promise<AgentContextResolver | null>;
  buildToolFactories?: BuildMeleeKernelToolFactories;
  buildPrivateRegisterFactory?: MeleeCreateSpawnAgentAdapters["buildPrivateRegisterFactory"];
  logger?: SpawnAgentLoggerLike;
}

function metadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function expandTilde(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function defaultPiAgentDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.PI_CODING_AGENT_DIR;
  return configured ? expandTilde(configured) : join(homedir(), ".pi", "agent");
}

function modelOverride(
  piOptions: PiRunOptions,
  spawnOptions?: MeleeKernelSpawnOptions,
): string | undefined {
  if (spawnOptions?.model) return spawnOptions.model;
  if (piOptions.provider && piOptions.model) return `${piOptions.provider}/${piOptions.model}`;
  return piOptions.model;
}

export function parsedAgentForMeleeKernelSpawn(
  parsedAgent: ParsedAgent,
  piOptions: PiRunOptions,
  spawnOptions?: MeleeKernelSpawnOptions,
): ParsedAgent {
  const sourceEditingRoles = new Set(["worker", "integration-resolver", "pr-fixer", "qa-repair", "reconcile"]);
  const sourceEditingCoreTools = sourceEditingRoles.has(piOptions.role)
    ? ["read", "glob", "grep", "bash", "edit", "write"]
    : [];
  const customToolNames = new Set([
    ...(piOptions.customTools ?? []).map((tool) => tool.name),
    ...(piOptions.bashOperations ? ["bash"] : []),
  ]);
  const disallowed = [
    ...(parsedAgent.config.disallowedTools ?? []),
    ...(piOptions.excludeBuiltinTools ?? []).filter((name) => !customToolNames.has(name)),
  ];
  const model = modelOverride(piOptions, spawnOptions);
  return {
    ...parsedAgent,
    config: {
      ...parsedAgent.config,
      ...(model ? { model } : {}),
      ...(piOptions.thinkingLevel ? { thinking: piOptions.thinkingLevel } : {}),
      tools: [...new Set([...(parsedAgent.config.tools ?? []), ...sourceEditingCoreTools])],
      disallowedTools: [...new Set(disallowed)],
    },
  };
}

function traceWriterSink(
  writer: KernelTraceWriterSinkLike | undefined,
): KernelSpawnOptions["traceWriter"] {
  if (typeof writer?.submit !== "function") return undefined;
  // The harness-owned transcript tailer deliberately preserves the legacy
  // Melee mapper. Drop live-emitter copies of the same JSONL-derived events so
  // the two paths cannot persist duplicate semantic traces with different ids.
  const transcriptRecoveredTypes = new Set<string>([
    EventType.AGENT_SESSION_START,
    EventType.USER_MESSAGE,
    EventType.ASSISTANT_MESSAGE,
    EventType.TOOL_CALL_START,
    EventType.TOOL_CALL_END,
    EventType.PI_AGENT_START,
    EventType.PI_AGENT_END,
    EventType.PI_TURN_START,
    EventType.PI_TURN_END,
  ]);
  return {
    submit(event) {
      if (transcriptRecoveredTypes.has(event.type)) return;
      Promise.resolve(writer.submit?.(event)).catch((error) => {
        console.warn(
          `Agent Kernel trace event submit failed during spawn: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    },
  };
}

async function writeOutput(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

function promptWithRenderedContext(piOptions: PiRunOptions, prompt: string): string {
  const renderedContext = piOptions.prompt.kernelContext?.renderedContext?.trim();
  if (!renderedContext) return prompt;
  const turnPrompt = prompt.trim();
  if (!turnPrompt || turnPrompt === renderedContext) return renderedContext;
  return `${renderedContext}\n\n${turnPrompt}`;
}

function resultPaths(piOptions: PiRunOptions, sessionId: string): Pick<
  PiRunResult,
  "outputPath" | "systemPromptPath" | "userPromptPath"
> {
  return {
    outputPath: resolve(piOptions.outputDir, `${piOptions.role}_${sessionId}.txt`),
    systemPromptPath: resolve(piOptions.outputDir, `${piOptions.role}_${sessionId}.system.md`),
    userPromptPath: resolve(piOptions.outputDir, `${piOptions.role}_${sessionId}.user.md`),
  };
}

function sessionDirFor(
  runtime: MeleeCreateSpawnAgentRuntime,
  containerId: string,
  piOptions: PiRunOptions,
): string {
  return join(runtime.config.piSessionsDir, containerId, piOptions.role);
}

function timeoutMessage(piOptions: PiRunOptions): string {
  return `${piOptions.role} Pi session timed out after ${Math.round((piOptions.timeoutMs ?? 0) / 1000)}s`;
}

function spawnSignalWithTimeout(
  signal: AbortSignal | undefined,
  piOptions: PiRunOptions,
): { signal?: AbortSignal; cleanup: () => void; timedOut: () => boolean } {
  if (!piOptions.timeoutMs || piOptions.timeoutMs <= 0) {
    return { signal, cleanup: () => {}, timedOut: () => false };
  }
  const controller = new AbortController();
  let didTimeOut = false;
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    controller.abort(signal.reason);
  } else {
    signal?.addEventListener("abort", onAbort, { once: true });
  }
  const timeout = setTimeout(() => {
    didTimeOut = true;
    controller.abort(new Error(timeoutMessage(piOptions)));
  }, piOptions.timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    },
    timedOut: () => didTimeOut,
  };
}

function buildKernelSpawnOptions({
  context,
  piOptions,
  runtime,
  spawnOptions,
}: {
  context: MeleeKernelSpawnContext;
  piOptions: PiRunOptions;
  runtime: MeleeCreateSpawnAgentRuntime;
  spawnOptions?: MeleeKernelSpawnOptions;
}): MeleeKernelPipelineSpawnOptions {
  const appSessionId = context.appSessionId;
  if (!appSessionId) {
    throw new Error("Kernel createSpawnAgent strategy requires kernelContext.appSessionId");
  }
  if (!context.containerId) {
    throw new Error("Kernel createSpawnAgent strategy requires kernelContext.containerId");
  }
  const metadata = context.metadata ?? {};
  const lineage = context.containerLineage ?? [];
  const leaf = lineage.length > 0 ? lineage[lineage.length - 1] : undefined;
  const workingDir = context.workingDir ?? piOptions.cwd;
  const appSessionSlug =
    metadataString(metadata, "appSessionSlug") ??
    metadataString(metadata, "sessionId") ??
    metadataString(metadata, "runId") ??
    appSessionId;
  const appSessionDir =
    metadataString(metadata, "appSessionDir") ??
    metadataString(metadata, "stateDir") ??
    workingDir;

  return {
    workingDir,
    thinkingLevel: piOptions.thinkingLevel,
    signal: spawnOptions?.abortSignal,
    appSessionId,
    appSessionSlug,
    appSessionDir,
    // Live Agent Kernel renamed appSessionDir to sessionDir and made
    // container/run identity authoritative. Keep the app fields above in the
    // harness marker until Melee completes that identity migration.
    sessionDir: appSessionDir,
    // The live snapshot writer persists blobs through SQLite actions. This
    // compatibility path keeps observability in the harness Postgres plane,
    // so it must not emit references to its transient SQLite control DB.
    captureRequestSnapshots: false,
    traceWriter: traceWriterSink(runtime.traceWriter),
    piSessionsDir: runtime.config.piSessionsDir,
    piAgentDir: metadataString(metadata, "piAgentDir") ?? defaultPiAgentDir(),
    containerId: context.containerId,
    phase: context.phase ?? piOptions.role,
    displayLabel: leaf?.label ?? piOptions.role,
  };
}

function createAppSessionBinding(
  runtime: MeleeCreateSpawnAgentRuntime,
  piOptions: PiRunOptions,
): MeleeCreateSpawnAgentAdapters["createAppSessionBinding"] {
  return (opts) => {
    if (!opts.appSessionId) return undefined;
    return {
      customType: runtime.config.markerConfig.sessionBinding,
      data: {
        appSessionId: opts.appSessionId,
        appSessionSlug: opts.appSessionSlug ?? opts.appSessionId,
        appSessionDir: opts.appSessionDir ?? opts.workingDir ?? piOptions.cwd,
        containerId: opts.containerId,
        phase: opts.phase ?? piOptions.role,
        agentName: piOptions.role,
        role: piOptions.role,
        displayLabel: opts.displayLabel ?? piOptions.role,
        workingDir: opts.workingDir ?? piOptions.cwd,
        outputDir: piOptions.outputDir,
      },
    };
  };
}

function assistantProviderError(message: unknown): string | undefined {
  if (!message || typeof message !== "object") return undefined;
  const record = message as Record<string, unknown>;
  if (record.role !== "assistant" || record.stopReason !== "error") return undefined;
  return typeof record.errorMessage === "string" && record.errorMessage.trim()
    ? record.errorMessage
    : "provider ended the session with an error and no message";
}

function kernelSpawnProviderError(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const direct = (result as Record<string, unknown>).providerError;
  if (typeof direct === "string" && direct.trim()) return direct;
  const session = (result as Record<string, unknown>).session;
  if (!session || typeof session !== "object") return undefined;
  const messages = (session as Record<string, unknown>).messages;
  if (!Array.isArray(messages)) return undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const error = assistantProviderError(messages[index]);
    if (error) return error;
  }
  return undefined;
}

function responseTextForKernelSpawn(result: { responseText?: unknown }, providerError: string | undefined): string {
  if (typeof result.responseText === "string" && result.responseText.length > 0) return result.responseText;
  if (!providerError) return typeof result.responseText === "string" ? result.responseText : "";
  return `[Pi provider error]\n${providerError}\n`;
}

const RUNTIME_CONTEXT_RESOLVERS_SYMBOL = Symbol.for(
  "melee-decomp-orchestrator.kernel-runtime-context-resolvers",
);

interface RuntimeCatalog {
  root: string;
  resolverToken?: string;
}

function runtimeContextResolvers(): Map<string, AgentContextResolver> {
  const globals = globalThis as unknown as Record<symbol, unknown>;
  const existing = globals[RUNTIME_CONTEXT_RESOLVERS_SYMBOL];
  if (existing instanceof Map) return existing as Map<string, AgentContextResolver>;
  const created = new Map<string, AgentContextResolver>();
  globals[RUNTIME_CONTEXT_RESOLVERS_SYMBOL] = created;
  return created;
}

async function writeRuntimeCatalog(
  parsedAgent: ParsedAgent,
  contextResolver: AgentContextResolver | null,
): Promise<RuntimeCatalog> {
  const root = await mkdtemp(join(tmpdir(), "melee-kernel-agent-"));
  const agentDir = join(root, "agent");
  await mkdir(agentDir, { recursive: true });

  const config = parsedAgent.config;
  const manifest = {
    $schema: "agent-kernel/agent-v1",
    name: config.name,
    description: config.description,
    model: config.model,
    host: "app",
    thinking: config.thinking,
    maxTurns: config.maxTurns,
    coreTools: config.tools,
    disallowedTools: config.disallowedTools,
    extensions: config.extensions,
    runInBackground: config.runInBackground,
    variables: config.variables,
  };
  const promptDocument = {
    kind: "prompt",
    schemaVersion: "prompt-kit/v1",
    id: `meleeRuntime${config.name.replace(/[^A-Za-z0-9]/g, "-")}Prompt`,
    nodes: [
      {
        type: "raw",
        id: "melee-runtime-system-prompt",
        value: parsedAgent.body,
      },
    ],
  };
  await Promise.all([
    writeFile(join(agentDir, "agent.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(join(agentDir, "prompt.json"), `${JSON.stringify(promptDocument, null, 2)}\n`),
  ]);

  if (!contextResolver) return { root };
  const resolverToken = randomUUID();
  runtimeContextResolvers().set(resolverToken, contextResolver);
  const contextModule = [
    `const registry = globalThis[Symbol.for(${JSON.stringify(RUNTIME_CONTEXT_RESOLVERS_SYMBOL.description)})];`,
    `const context = registry?.get(${JSON.stringify(resolverToken)});`,
    `if (!context) throw new Error(${JSON.stringify(`Missing Melee runtime context resolver ${resolverToken}`)});`,
    "export { context };",
    "",
  ].join("\n");
  await writeFile(join(agentDir, "context.ts"), contextModule);
  return { root, resolverToken };
}

function liveKernelLoaders(adapters: MeleeCreateSpawnAgentAdapters) {
  const catalog = adapters.createContextCatalog();
  const builtInKinds = new Set(["text", "file", "directory", "command"]);
  return catalog.list().filter((kind) => !builtInKinds.has(kind)).map((kind) => catalog.get(kind));
}

function liveKernelLogger(
  logger: SpawnAgentLoggerLike | undefined,
): NonNullable<CreateKernelConfig["logger"]> | undefined {
  if (!logger) return undefined;
  return {
    debug(message, data) {
      logger.info(message, data);
    },
    info: (message, data) => logger.info(message, data),
    warn: (message, data) => logger.warn(message, data),
    error: (message, data) => logger.error(message, data),
  };
}

const defaultCreateSpawnAgent: KernelSpawnAgentFactoryPort = (adapters) => {
  return async (name, prompt, ctx, opts = {}) => {
    const parsedAgent = adapters.loadAgent(name, opts);
    const contextResolver = await adapters.loadAgentResolver(name);
    const privateRegisterFactory = await adapters.buildPrivateRegisterFactory(name);
    const runtimeCatalog = await writeRuntimeCatalog(parsedAgent, contextResolver);
    const sqliteHandle = openKernelDatabase({
      path: join(runtimeCatalog.root, "kernel-control.sqlite"),
    });
    let kernel: ReturnType<typeof createLiveKernel> | null = null;
    try {
      // Live createKernel owns SQLite-only registry/session/run actions. Keep
      // those mechanics in a transient control DB while the harness writer
      // and transcript tailer retain the shared Postgres observability plane.
      await ensureLiveKernelSqliteSchema(sqliteHandle.db);
      if (!opts.containerId) {
        throw new Error("Kernel createSpawnAgent strategy requires opts.containerId");
      }
      const now = new Date().toISOString();
      await upsertLiveKernelContainer(sqliteHandle.db, {
        id: opts.containerId,
        kernelId: MELEE_KERNEL_ID,
        kind: opts.phase ?? name,
        appKey: [opts.containerId],
        label: opts.displayLabel ?? name,
        status: "running",
        phase: opts.phase ?? name,
        workingDir: opts.workingDir ?? null,
        metadata: {
          appSessionId: opts.appSessionId,
          appSessionSlug: opts.appSessionSlug,
          transientControlDb: true,
        },
        createdAt: now,
        startedAt: now,
      });
      kernel = createLiveKernel({
        id: MELEE_KERNEL_ID,
        db: sqliteHandle.db,
        catalog: { roots: [{ path: runtimeCatalog.root, listed: false }] },
        loaders: liveKernelLoaders(adapters),
        sharedTools: (config) => [
          ...adapters.buildToolFactories(config),
          ...(privateRegisterFactory ? [privateRegisterFactory] : []),
        ],
        createSessionBinding: adapters.createAppSessionBinding
          ? (spawnOptions) =>
              adapters.createAppSessionBinding?.(
                spawnOptions as MeleeKernelPipelineSpawnOptions,
              )
          : undefined,
        piLifecycleCustomType: adapters.piLifecycleCustomType,
        logger: liveKernelLogger(adapters.logger),
      });
      return await kernel.spawnAgent(name, prompt, ctx, opts);
    } finally {
      kernel?.dispose();
      sqliteHandle.close();
      if (runtimeCatalog.resolverToken) {
        runtimeContextResolvers().delete(runtimeCatalog.resolverToken);
      }
      await rm(runtimeCatalog.root, { recursive: true, force: true });
    }
  };
};

export function createMeleeKernelSpawnAgent(
  options: CreateMeleeKernelSpawnAgentOptions,
): MeleeKernelSpawnAdapter<PiRunResult> {
  const createSpawnAgent = options.createSpawnAgent ?? defaultCreateSpawnAgent;
  const createSpawnContext = options.createSpawnContext ?? defaultCreateSpawnContext;

  return async function spawnWithKernelCreateSpawnAgent(
    name,
    prompt,
    context,
    spawnOptions,
  ): Promise<PiRunResult> {
    const spawnContext: MeleeKernelSpawnContext = context ?? {
      workingDir: options.piOptions.cwd,
      phase: options.piOptions.role,
    };
    if (name !== options.piOptions.role) {
      throw new Error(
        `Melee kernel spawn mismatch: expected ${options.piOptions.role}, got ${name}`,
      );
    }
    if (options.piOptions.dryRun) {
      throw new Error("Kernel createSpawnAgent strategy does not support Pi dryRun");
    }

    const parsedAgent = parsedAgentForMeleeKernelSpawn(
      options.parsedAgent,
      options.piOptions,
      spawnOptions,
    );
    const adapters: MeleeCreateSpawnAgentAdapters = {
      loadAgent(agentName) {
        if (agentName !== name) {
          throw new Error(`No Melee parsed agent loaded for "${agentName}"`);
        }
        return parsedAgent;
      },
      loadAgentResolver:
        options.loadAgentResolver ??
        (async (agentName) => (agentName === name ? options.contextResolver ?? null : null)),
      buildPrivateRegisterFactory:
        options.buildPrivateRegisterFactory ?? (async () => null),
      buildToolFactories: () => options.buildToolFactories?.(options.piOptions) ?? [],
      createContextCatalog: () => createMeleeLoaderCatalog(),
      createSpawnContext,
      getDb: () => options.runtime.db,
      createAppSessionBinding: createAppSessionBinding(options.runtime, options.piOptions),
      piLifecycleCustomType: options.runtime.config.markerConfig.lifecycle,
      logger: options.logger,
    };
    const kernelSpawn = createSpawnAgent(adapters);
    const timeoutSignal = spawnSignalWithTimeout(spawnOptions?.abortSignal, options.piOptions);
    const kernelOptions = buildKernelSpawnOptions({
      context: spawnContext,
      piOptions: options.piOptions,
      runtime: options.runtime,
      spawnOptions: {
        ...spawnOptions,
        abortSignal: timeoutSignal.signal,
      },
    });
    const userPrompt = options.contextResolver
      ? prompt
      : promptWithRenderedContext(options.piOptions, prompt);
    const restoreEnv = applyProcessEnvPatch(options.piOptions.env);
    try {
      let result: KernelSpawnAgentResult;
      try {
        result = await kernelSpawn(name, userPrompt, null, kernelOptions);
      } catch (error) {
        const timedOut = timeoutSignal.timedOut();
        const aborted = timedOut || Boolean(timeoutSignal.signal?.aborted);
        const message = timedOut
          ? timeoutMessage(options.piOptions)
          : error instanceof Error
            ? error.message
            : String(error);
        const providerError = aborted ? undefined : message;
        const sessionId = randomUUID();
        const paths = resultPaths(options.piOptions, sessionId);
        const responseText = providerError
          ? `[Pi provider error]\n${providerError}\n`
          : `[Pi session failed]\n${message}\n`;
        await Promise.all([
          writeOutput(paths.systemPromptPath, parsedAgent.body),
          writeOutput(paths.userPromptPath, userPrompt),
          writeOutput(paths.outputPath, responseText),
        ]);
        return {
          sessionId,
          sessionDir: spawnContext.containerId
            ? sessionDirFor(options.runtime, spawnContext.containerId, options.piOptions)
            : undefined,
          ...paths,
          rawText: responseText,
          dryRun: false,
          failed: true,
          error: message,
          providerError,
        };
      } finally {
        timeoutSignal.cleanup();
      }

      try {
        const providerError = kernelSpawnProviderError(result);
        const responseText = responseTextForKernelSpawn(result, providerError);
        const sessionId = String((result.session as { sessionId?: unknown }).sessionId ?? randomUUID());
        const paths = resultPaths(options.piOptions, sessionId);
        await Promise.all([
          writeOutput(paths.systemPromptPath, parsedAgent.body),
          writeOutput(paths.userPromptPath, userPrompt),
          writeOutput(paths.outputPath, responseText),
        ]);
        const aborted = result.aborted || Boolean(timeoutSignal.signal?.aborted);

        return {
          sessionId,
          sessionFile:
            typeof (result.session as { sessionFile?: unknown }).sessionFile === "string"
              ? (result.session as { sessionFile: string }).sessionFile
              : undefined,
          sessionDir: spawnContext.containerId
            ? sessionDirFor(options.runtime, spawnContext.containerId, options.piOptions)
            : undefined,
          ...paths,
          rawText: responseText,
          dryRun: false,
          failed: aborted ? true : undefined,
          error: aborted
            ? timeoutSignal.timedOut()
              ? timeoutMessage(options.piOptions)
              : "Pi session aborted"
            : undefined,
          providerError,
        };
      } finally {
        result.session.dispose?.();
      }
    } finally {
      restoreEnv();
    }
  };
}
