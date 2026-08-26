import {
  newEventId,
  SYSTEM_USER_ID,
  TraceLevel,
  TraceSource,
  type EventData,
  type EventType,
  type TraceEvent,
} from "@agent-kernel/protocol";

export type TraceEventBatchInsertPort = (events: TraceEvent[]) => Promise<number>;

export interface CreateMeleeTraceWriterOptions {
  insertBatch: TraceEventBatchInsertPort;
  userId?: string;
  now?: () => string;
  newEventId?: () => string;
}

export interface AppTraceEventInput {
  appSessionId: string;
  containerId?: string;
  type: EventType | string;
  eventData: EventData;
  traceLevel?: TraceLevel;
  agentId?: string;
  spanId?: string;
  parentEventId?: string;
  timestamp?: string;
  userId?: string;
}

export class MeleeTraceWriter {
  private readonly insertBatch: TraceEventBatchInsertPort;
  private readonly userId: string;
  private readonly now: () => string;
  private readonly createId: () => string;
  private readonly outstandingInserts = new Set<Promise<number>>();

  constructor(options: CreateMeleeTraceWriterOptions) {
    this.insertBatch = options.insertBatch;
    this.userId = options.userId ?? SYSTEM_USER_ID;
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.newEventId ?? newEventId;
  }

  createAppEvent(input: AppTraceEventInput): TraceEvent {
    return {
      eventId: this.createId(),
      // The live envelope is container-first. Keep the harness app-session
      // correlation in payload metadata until its callers migrate fully.
      containerId: input.containerId ?? input.appSessionId,
      userId: input.userId ?? this.userId,
      type: input.type as TraceEvent["type"],
      source: TraceSource.APP,
      traceLevel: input.traceLevel ?? TraceLevel.PROCESSING,
      eventData: {
        ...input.eventData,
        appSessionId: input.appSessionId,
      } as EventData,
      timestamp: input.timestamp ?? this.now(),
      ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
      ...(input.spanId !== undefined ? { spanId: input.spanId } : {}),
      ...(input.parentEventId !== undefined ? { parentEventId: input.parentEventId } : {}),
    };
  }

  async submit(events: TraceEvent | TraceEvent[]): Promise<number> {
    const batch = Array.isArray(events) ? events : [events];
    const insert = this.insertBatch(batch);
    this.outstandingInserts.add(insert);
    try {
      return await insert;
    } finally {
      this.outstandingInserts.delete(insert);
    }
  }

  async flush(): Promise<void> {
    const results = await Promise.allSettled(this.outstandingInserts);
    const failed = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failed) throw failed.reason;
  }

  async submitAppEvent(input: AppTraceEventInput): Promise<TraceEvent> {
    const event = this.createAppEvent(input);
    await this.submit(event);
    return event;
  }
}

export function createMeleeTraceWriter(
  options: CreateMeleeTraceWriterOptions,
): MeleeTraceWriter {
  return new MeleeTraceWriter(options);
}
