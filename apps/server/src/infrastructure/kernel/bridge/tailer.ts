import { createHash } from "node:crypto";

import {
  type AgentRun,
  type Container,
  type NewAgentRun,
  type NewContainer,
  type NewPiAgentSession,
  type PiAgentSession,
} from "@agent-kernel/db";
import type { TraceEvent } from "@agent-kernel/protocol";
import {
  createTailerConfig,
  CursorStore,
  DirectoryWatcher,
  EventMapper,
  EventQueue,
  type EventMapperOptions,
  type MapperResult,
  type PiEvent,
  type TailerConfig,
  type TailerConfigInput,
} from "./tailer-runtime/index.js";

import {
  insertMeleeTraceEventsBatch,
  upsertMeleeAgentRun,
  upsertMeleeContainer,
  upsertMeleePiAgentSession,
} from "./database.js";
import {
  createMeleeKernelBridgeConfig,
  type CreateMeleeKernelBridgeConfigInput,
  type MeleeKernelBridgeConfig,
} from "./config.js";

export interface CreateMeleeTailerConfigOptions
  extends Partial<Omit<TailerConfigInput, "watchDir" | "snapshotPath">> {
  watchDir?: string;
  snapshotPath?: string;
}

export type TailerTraceEventsInsertPort = (
  db: unknown,
  events: TraceEvent[],
) => Promise<number>;

type MeleeMappedTraceEvent = TraceEvent & { appSessionId?: string };

export type TailerPiAgentSessionUpsertPort = (
  db: unknown,
  data: NewPiAgentSession,
) => Promise<PiAgentSession | NewPiAgentSession>;

export type TailerAgentRunUpsertPort = (
  db: unknown,
  data: NewAgentRun,
) => Promise<AgentRun | NewAgentRun>;

export type TailerContainerUpsertPort = (
  db: unknown,
  data: NewContainer,
) => Promise<Container | NewContainer>;

export interface CreateMeleeTraceTailerOptions {
  db: unknown;
  config?: CreateMeleeKernelBridgeConfigInput | MeleeKernelBridgeConfig;
  tailer?: CreateMeleeTailerConfigOptions;
  insertTraceEvents?: TailerTraceEventsInsertPort;
  upsertContainer?: TailerContainerUpsertPort;
  upsertPiAgentSession?: TailerPiAgentSessionUpsertPort;
  upsertAgentRun?: TailerAgentRunUpsertPort;
  sleep?: (ms: number) => Promise<void>;
}

export interface MeleeTraceTailerStatus {
  started: boolean;
  watchDir: string;
  snapshotPath: string;
  queueSize: number;
  pressured: boolean;
  readerCount: number;
  cursorCount: number;
  fileCount: number;
  piSessionCount: number;
  mappedEventCount: number;
  insertedEventCount: number;
}

type TailerAgentStatus = "running" | "completed" | "error";

interface TailerFileState {
  filePath: string;
  appSessionId?: string;
  appSessionSlug?: string;
  appSessionDir?: string;
  piSessionUuid?: string;
  parentPiSessionId?: string;
  parentRunId?: string;
  parentToolUseId?: string;
  agentRunId?: string;
  agentName?: string;
  containerId?: string;
  phase?: string;
  displayLabel?: string;
  model?: string;
  runNumber?: number;
  status?: TailerAgentStatus;
  startedAt?: string;
  completedAt?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  usageCostEstimate?: number;
  usageObserved?: boolean;
  kernelManagedRun?: boolean;
}

const MELEE_AGENT_RUN_NAMESPACE = "56de4ed7-1d44-47ff-8f3b-c5e1b9071f25";

function resolveBridgeConfig(
  config?: CreateMeleeKernelBridgeConfigInput | MeleeKernelBridgeConfig,
): MeleeKernelBridgeConfig {
  return createMeleeKernelBridgeConfig(config);
}

export function createMeleeTailerConfig(
  config?: CreateMeleeKernelBridgeConfigInput | MeleeKernelBridgeConfig,
  overrides: CreateMeleeTailerConfigOptions = {},
): Readonly<TailerConfig> {
  const resolved = resolveBridgeConfig(config);
  return createTailerConfig({
    ...overrides,
    watchDir: overrides.watchDir ?? resolved.piSessionsDir,
    snapshotPath: overrides.snapshotPath ?? resolved.cursorSnapshotPath,
  });
}

export function createMeleeEventMapperOptions(
  config?: CreateMeleeKernelBridgeConfigInput | MeleeKernelBridgeConfig,
): EventMapperOptions {
  const resolved = resolveBridgeConfig(config);
  return {
    sessionBinding: {
      customType: resolved.markerConfig.sessionBinding,
      appSessionIdField: "appSessionId",
      slugField: "appSessionSlug",
      dirField: "appSessionDir",
    },
    lifecycleCustomType: resolved.markerConfig.lifecycle,
    subagentLinkCustomType: resolved.markerConfig.subagentLink,
  };
}

export function createMeleeEventMapper(
  config?: CreateMeleeKernelBridgeConfigInput | MeleeKernelBridgeConfig,
): EventMapper {
  return new EventMapper(createMeleeEventMapperOptions(config));
}

function stableUuid(namespace: string, name: string): string {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(namespaceBytes).update(name).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

function rawString(raw: Record<string, unknown>, key: string): string | undefined {
  return stringValue(raw[key]) ?? stringValue(asRecord(raw.metadata)[key]);
}

function rawNumber(raw: Record<string, unknown>, key: string): number | undefined {
  return numberValue(raw[key]) ?? numberValue(asRecord(raw.metadata)[key]);
}

function rawBoolean(raw: Record<string, unknown>, key: string): boolean | undefined {
  return booleanValue(raw[key]) ?? booleanValue(asRecord(raw.metadata)[key]);
}

function statusFromLifecyclePhase(phase: string | undefined): TailerAgentStatus | undefined {
  if (phase === "agent_end") return "completed";
  if (phase === "agent_start" || phase === "turn_start" || phase === "turn_end") return "running";
  return undefined;
}

function piSessionStatusFor(state: TailerFileState): NewPiAgentSession["status"] {
  if (state.status === "error") return "error";
  return state.status === "completed" ? "ended" : "active";
}

function agentRunStatusFor(state: TailerFileState): NewAgentRun["status"] {
  if (state.status === "error") return "error";
  return state.status === "completed" ? "done" : "running";
}

function agentRunTriggerFor(state: TailerFileState): NewAgentRun["trigger"] {
  return state.parentPiSessionId || state.parentToolUseId ? "parent-tool" : "system";
}

function agentNameFor(state: TailerFileState): string {
  return state.agentName ?? state.phase ?? "pi-agent";
}

function agentRunIdFor(state: TailerFileState): string {
  return (
    state.agentRunId ??
    stableUuid(
      MELEE_AGENT_RUN_NAMESPACE,
      `pi-session:${state.piSessionUuid ?? "unknown"}\nrun:${state.runNumber ?? 1}`,
    )
  );
}

export class MeleeTraceTailer {
  readonly config: MeleeKernelBridgeConfig;
  readonly tailerConfig: TailerConfig;

  private readonly db: unknown;
  private readonly insertTraceEvents: TailerTraceEventsInsertPort;
  private readonly upsertContainer: TailerContainerUpsertPort;
  private readonly upsertPiAgentSession: TailerPiAgentSessionUpsertPort;
  private readonly upsertAgentRun: TailerAgentRunUpsertPort;
  private readonly cursorStore: CursorStore;
  private readonly watcher: DirectoryWatcher;
  private readonly queue: EventQueue;
  private readonly mappers = new Map<string, EventMapper>();
  private readonly statesByFile = new Map<string, TailerFileState>();
  private readonly statesByPiSession = new Map<string, TailerFileState>();
  private started = false;
  private mappedEventCount = 0;
  private insertedEventCount = 0;

  constructor(options: CreateMeleeTraceTailerOptions) {
    this.db = options.db;
    this.config = resolveBridgeConfig(options.config);
    this.tailerConfig = createMeleeTailerConfig(this.config, options.tailer);
    this.insertTraceEvents = options.insertTraceEvents ?? insertMeleeTraceEventsBatch;
    this.upsertContainer = options.upsertContainer ?? upsertMeleeContainer;
    this.upsertPiAgentSession = options.upsertPiAgentSession ?? upsertMeleePiAgentSession;
    this.upsertAgentRun = options.upsertAgentRun ?? upsertMeleeAgentRun;
    this.cursorStore = new CursorStore(this.tailerConfig);
    this.queue = new EventQueue({
      config: this.tailerConfig,
      insertEvents: async (events) => {
        await this.insertMappedEvents(events);
      },
      callbacks: {
        onPressure: () => this.watcher.pause(),
        onRelease: () => this.watcher.resume(),
      },
      sleep: options.sleep,
    });
    this.watcher = new DirectoryWatcher(
      (filePath, events) => {
        this.ingestEvents(filePath, events);
      },
      this.cursorStore,
      this.tailerConfig,
    );
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.cursorStore.loadSnapshot();
    this.cursorStore.startPeriodicSave();
    this.queue.start();
    try {
      this.watcher.start();
      this.started = true;
    } catch (error) {
      await this.queue.stop();
      await this.cursorStore.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.watcher.stop();
    try {
      await this.queue.stop();
    } finally {
      await this.cursorStore.stop();
      this.started = false;
    }
  }

  async flush(): Promise<void> {
    await this.queue.flush();
    await this.cursorStore.saveSnapshot();
  }

  ingestEvents(filePath: string, events: PiEvent[]): void {
    const mapper = this.mapperFor(filePath);
    for (const event of events) {
      const result = mapper.map(event);
      const state = this.updateState(filePath, mapper, event, result);
      if (result.traceEvents.length === 0) continue;
      const runId = state.piSessionUuid ? agentRunIdFor(state) : undefined;
      const enriched: MeleeMappedTraceEvent[] = result.traceEvents.map((traceEvent) => ({
        ...traceEvent,
        containerId: traceEvent.containerId ?? state.containerId ?? traceEvent.appSessionId,
        runId: traceEvent.runId ?? runId,
        piSessionUuid: traceEvent.piSessionUuid ?? state.piSessionUuid,
      }));
      this.mappedEventCount += enriched.length;
      this.queue.push(enriched);
    }
  }

  status(): MeleeTraceTailerStatus {
    return {
      started: this.started,
      watchDir: this.tailerConfig.watchDir,
      snapshotPath: this.tailerConfig.snapshotPath,
      queueSize: this.queue.queueSize,
      pressured: this.queue.isPressured,
      readerCount: this.watcher.getReaderCount(),
      cursorCount: this.cursorStore.getCount(),
      fileCount: this.statesByFile.size,
      piSessionCount: this.statesByPiSession.size,
      mappedEventCount: this.mappedEventCount,
      insertedEventCount: this.insertedEventCount,
    };
  }

  private mapperFor(filePath: string): EventMapper {
    let mapper = this.mappers.get(filePath);
    if (!mapper) {
      mapper = createMeleeEventMapper(this.config);
      this.mappers.set(filePath, mapper);
    }
    return mapper;
  }

  private stateFor(filePath: string): TailerFileState {
    let state = this.statesByFile.get(filePath);
    if (!state) {
      state = {
        filePath,
        agentName: "pi-agent",
        status: "running",
        runNumber: 1,
      };
      this.statesByFile.set(filePath, state);
    }
    return state;
  }

  private bindPiSession(state: TailerFileState, piSessionUuid: string | null | undefined): void {
    if (!piSessionUuid) return;
    state.piSessionUuid = piSessionUuid;
    this.statesByPiSession.set(piSessionUuid, state);
  }

  private updateState(
    filePath: string,
    mapper: EventMapper,
    event: PiEvent,
    result: MapperResult,
  ): TailerFileState {
    const state = this.stateFor(filePath);
    if (event.type === "session") {
      this.bindPiSession(state, event.id);
      state.startedAt ??= event.timestamp;
    }
    if (event.type === "model_change") {
      state.model = event.modelId;
    }
    if (result.metadata?.piSessionUuid) {
      this.bindPiSession(state, result.metadata.piSessionUuid);
    }
    if (result.metadata?.appSession) {
      const appSession = result.metadata.appSession;
      const raw = appSession.raw;
      state.appSessionId = appSession.appSessionId ?? mapper.getAppSessionId() ?? state.appSessionId;
      state.appSessionSlug = appSession.slug ?? rawString(raw, "appSessionSlug") ?? state.appSessionSlug;
      state.appSessionDir = appSession.dir ?? rawString(raw, "appSessionDir") ?? state.appSessionDir;
      state.containerId = rawString(raw, "containerId") ?? state.containerId;
      state.phase = rawString(raw, "phase") ?? state.phase;
      state.agentName = rawString(raw, "agentName") ?? rawString(raw, "role") ?? state.agentName;
      state.displayLabel = rawString(raw, "displayLabel") ?? state.displayLabel;
      state.agentRunId =
        rawString(raw, "runId") ?? rawString(raw, "agentRunId") ?? state.agentRunId;
      state.parentRunId = rawString(raw, "parentRunId") ?? state.parentRunId;
      state.parentToolUseId = rawString(raw, "parentToolUseId") ?? state.parentToolUseId;
      state.runNumber = rawNumber(raw, "runNumber") ?? state.runNumber;
      state.kernelManagedRun = rawBoolean(raw, "kernelManagedRun") ?? state.kernelManagedRun;
    }
    if (result.metadata?.subagentLink) {
      const link = result.metadata.subagentLink;
      const child = this.statesByPiSession.get(link.childPiSessionId);
      if (child) {
        child.parentPiSessionId = link.parentPiSessionId;
        child.parentToolUseId = link.toolCallId;
        child.agentName = link.agentType || child.agentName;
        child.displayLabel = link.description || child.displayLabel;
      }
    }
    if (event.type === "message" && event.message.role === "assistant") {
      const usage = event.message.usage;
      if (usage) {
        state.inputTokens = (state.inputTokens ?? 0) + (usage.input ?? 0);
        state.outputTokens = (state.outputTokens ?? 0) + (usage.output ?? 0);
        state.cacheReadTokens = (state.cacheReadTokens ?? 0) + (usage.cacheRead ?? 0);
        state.cacheWriteTokens = (state.cacheWriteTokens ?? 0) + (usage.cacheWrite ?? 0);
        state.usageCostEstimate =
          (state.usageCostEstimate ?? 0) + (usage.cost?.total ?? 0);
        state.usageObserved = true;
      }
      if (event.message.stopReason === "error") state.status = "error";
    }
    if (event.type === "custom" && event.customType === this.config.markerConfig.lifecycle) {
      const phase = stringValue(event.data.phase);
      if (phase === "agent_start") {
        state.status = "running";
        state.startedAt = event.timestamp;
        state.completedAt = undefined;
        state.inputTokens = 0;
        state.outputTokens = 0;
        state.cacheReadTokens = 0;
        state.cacheWriteTokens = 0;
        state.usageCostEstimate = 0;
        state.usageObserved = false;
      } else if (phase === "turn_end" && stringValue(event.data.stopReason) === "error") {
        state.status = "error";
      } else if (phase === "agent_end" && state.status !== "error") {
        state.status = "completed";
      } else {
        state.status = statusFromLifecyclePhase(phase) ?? state.status;
      }
      if (phase === "agent_end") {
        state.completedAt = event.timestamp;
        if (!state.usageObserved) {
          state.inputTokens = numberValue(event.data.inputTokens) ?? state.inputTokens;
          state.outputTokens = numberValue(event.data.outputTokens) ?? state.outputTokens;
        }
      }
    }
    state.model = mapper.getModel() !== "unknown" ? mapper.getModel() : state.model;
    this.bindPiSession(state, mapper.getPiSessionUuid());
    return state;
  }

  private async insertMappedEvents(events: MeleeMappedTraceEvent[]): Promise<void> {
    const piSessionIds = new Set(
      events.map((event) => event.piSessionUuid).filter((id): id is string => Boolean(id)),
    );
    for (const piSessionUuid of piSessionIds) {
      const sample = events.find((event) => event.piSessionUuid === piSessionUuid);
      await this.ensurePiSession(piSessionUuid, sample);
    }
    const inserted = await this.insertTraceEvents(this.db, events);
    this.insertedEventCount += inserted;
  }

  private async ensurePiSession(
    piSessionUuid: string,
    sample?: MeleeMappedTraceEvent,
  ): Promise<void> {
    let state = this.statesByPiSession.get(piSessionUuid);
    if (!state) {
      state = {
        filePath: "",
        piSessionUuid,
        appSessionId: sample?.appSessionId,
        agentName: "pi-agent",
        status: "running",
        runNumber: 1,
        startedAt: sample?.timestamp,
      };
      this.statesByPiSession.set(piSessionUuid, state);
    }
    state.appSessionId ??= sample?.appSessionId;
    state.containerId ??= sample?.containerId;
    state.startedAt ??= sample?.timestamp;

    const agentName = agentNameFor(state);
    const containerId = state.containerId ?? state.appSessionId;
    const startedAt = state.startedAt ?? sample?.timestamp ?? new Date().toISOString();
    if (!containerId) {
      throw new Error(`Cannot persist Pi session ${piSessionUuid} without a container id`);
    }
    await this.ensureContainer(state, containerId, startedAt);
    if (state.parentPiSessionId && state.parentPiSessionId !== piSessionUuid) {
      await this.ensureParentSession(state, containerId, startedAt);
    }
    const sessionPayload: NewPiAgentSession = {
      id: piSessionUuid,
      agentName,
      parentSessionId: state.parentPiSessionId,
      parentToolUseId: state.parentToolUseId,
      containerId,
      phase: state.phase,
      displayLabel: state.displayLabel ?? agentName,
      status: piSessionStatusFor(state),
      model: state.model ?? "unknown",
      usageInputTokens: state.inputTokens,
      usageOutputTokens: state.outputTokens,
      createdAt: startedAt,
      endedAt: state.completedAt,
    };
    await this.upsertPiAgentSession(this.db, sessionPayload);

    if (!state.kernelManagedRun) {
      const runPayload: NewAgentRun = {
        id: agentRunIdFor(state),
        piSessionId: piSessionUuid,
        agentName,
        containerId,
        phase: state.phase,
        parentRunId: state.parentRunId,
        displayLabel: state.displayLabel ?? agentName,
        parentToolUseId: state.parentToolUseId,
        trigger: agentRunTriggerFor(state),
        status: agentRunStatusFor(state),
        startedAt,
        endedAt: state.completedAt,
        usageInputTokens: state.inputTokens,
        usageOutputTokens: state.outputTokens,
        usageCacheRead: state.cacheReadTokens,
        usageCacheWrite: state.cacheWriteTokens,
        usageCostEstimate: state.usageCostEstimate,
      };
      await this.upsertAgentRun(this.db, runPayload);
    }
  }

  private async ensureContainer(
    state: TailerFileState,
    containerId: string,
    startedAt: string,
  ): Promise<void> {
    const kind = state.phase ?? state.agentName ?? "agent-session";
    await this.upsertContainer(this.db, {
      id: containerId,
      kernelId: this.config.kernelId,
      kind,
      appKey: [containerId],
      label: state.displayLabel ?? state.agentName ?? "Recovered Pi session",
      status: state.status === "running" ? "active" : state.status,
      phase: state.phase,
      workingDir: state.appSessionDir,
      metadata: {
        appSessionId: state.appSessionId,
        appSessionSlug: state.appSessionSlug,
        containerId,
        containerKind: kind,
        transcriptRecovery: true,
      },
      createdAt: startedAt,
      startedAt,
      endedAt: state.completedAt,
    });
  }

  private async ensureParentSession(
    child: TailerFileState,
    childContainerId: string,
    startedAt: string,
  ): Promise<void> {
    const parentId = child.parentPiSessionId;
    if (!parentId) return;
    const parent = this.statesByPiSession.get(parentId);
    const parentContainerId = parent?.containerId ?? childContainerId;
    if (parent) {
      await this.ensureContainer(parent, parentContainerId, parent.startedAt ?? startedAt);
    }
    await this.upsertPiAgentSession(this.db, {
      id: parentId,
      containerId: parentContainerId,
      agentName: agentNameFor(parent ?? child),
      displayLabel: parent?.displayLabel ?? parent?.agentName ?? "Recovered parent Pi session",
      status: parent ? piSessionStatusFor(parent) : "active",
      model: parent?.model ?? "unknown",
      phase: parent?.phase,
      usageInputTokens: parent?.inputTokens,
      usageOutputTokens: parent?.outputTokens,
      createdAt: parent?.startedAt ?? startedAt,
      endedAt: parent?.completedAt,
    });

    if (child.parentRunId) {
      await this.upsertAgentRun(this.db, {
        id: child.parentRunId,
        piSessionId: parentId,
        containerId: parentContainerId,
        agentName: agentNameFor(parent ?? child),
        trigger: "system",
        displayLabel: parent?.displayLabel ?? parent?.agentName ?? "Recovered parent run",
        phase: parent?.phase,
        status: parent ? agentRunStatusFor(parent) : "running",
        startedAt: parent?.startedAt ?? startedAt,
        endedAt: parent?.completedAt,
      });
    }
  }
}

export function createMeleeTraceTailer(
  options: CreateMeleeTraceTailerOptions,
): MeleeTraceTailer {
  return new MeleeTraceTailer(options);
}
