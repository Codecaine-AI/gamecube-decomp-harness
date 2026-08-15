import {
  createAgentSessionStartEvent,
  createAssistantMessageEvent,
  createPiAgentEndEvent,
  createPiAgentStartEvent,
  createPiTurnEndEvent,
  createPiTurnStartEvent,
  createToolCallEndEvent,
  createToolCallStartEvent,
  createUserMessageEvent,
  newEventId,
  SYSTEM_USER_ID,
  TraceLevel,
} from "@agent-kernel/protocol";
import type { TraceEvent, TraceEventIds } from "@agent-kernel/protocol";

import type {
  LegacyMappedTraceEvent,
  MapperResult,
  PiEvent,
  PiMessageEvent,
} from "./types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EventMapperSessionBindingOptions {
  customType: string;
  appSessionIdField?: string;
  slugField?: string;
  dirField?: string;
}

export interface EventMapperOptions {
  sessionBinding?: EventMapperSessionBindingOptions;
  lifecycleCustomType?: string;
  subagentLinkCustomType?: string;
}

const DEFAULT_MAPPER_OPTIONS = Object.freeze({
  lifecycleCustomType: "agent-kernel:pi-lifecycle",
  subagentLinkCustomType: "agent-kernel:subagent-link",
} satisfies Required<Omit<EventMapperOptions, "sessionBinding">>);

function toLegacyEnvelope(event: TraceEvent): LegacyMappedTraceEvent {
  const { containerId: appSessionId, ...rest } = event;
  return { ...rest, appSessionId };
}

/**
 * Compatibility mapper for Melee's existing session-binding markers.
 *
 * The live kernel now uses containerBinding plus UUID container ids. Melee's
 * hierarchical container ids diverge from that identity model, so a follow-up
 * migration is required before this bridge can use the live mapper directly.
 */
export class EventMapper {
  private readonly options: Required<Omit<EventMapperOptions, "sessionBinding">> &
    Pick<EventMapperOptions, "sessionBinding">;
  private model = "unknown";
  private appSessionId: string | null = null;
  private piSessionUuid: string | null = null;
  private pending: LegacyMappedTraceEvent[] = [];
  private pendingSince: number | null = null;
  private lastActivityAt = Date.now();
  private markedCompleted = false;

  constructor(options: EventMapperOptions = {}) {
    this.options = {
      ...DEFAULT_MAPPER_OPTIONS,
      ...options,
    };
  }

  private ids(): TraceEventIds {
    return {
      containerId: this.stampId(),
      userId: SYSTEM_USER_ID,
    };
  }

  private asAgentEvent(event: TraceEvent, timestamp: string): LegacyMappedTraceEvent {
    return {
      ...toLegacyEnvelope(event),
      source: "agent",
      timestamp,
      piSessionUuid: this.piSessionUuid ?? undefined,
    };
  }

  setAppSessionId(id: string): LegacyMappedTraceEvent[] {
    if (!UUID_RE.test(id)) {
      console.error(`[mapper] setAppSessionId rejected non-uuid: ${id}`);
      return [];
    }
    this.appSessionId = id;
    const piUuid = this.piSessionUuid ?? undefined;
    const flushed = this.pending.map((event) => ({
      ...event,
      appSessionId: id,
      piSessionUuid: event.piSessionUuid ?? piUuid,
    }));
    this.pending = [];
    this.pendingSince = null;
    return flushed;
  }

  private setPiSessionUuid(uuid: string): void {
    if (!UUID_RE.test(uuid)) {
      console.error(`[mapper] setPiSessionUuid rejected non-uuid: ${uuid}`);
      return;
    }
    this.piSessionUuid = uuid;
  }

  hasAppSessionId(): boolean {
    return this.appSessionId !== null;
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  pendingCount(): number {
    return this.pending.length;
  }

  pendingAgeMs(): number {
    return this.pendingSince ? Date.now() - this.pendingSince : 0;
  }

  getPiSessionUuid(): string | null {
    return this.piSessionUuid;
  }

  getAppSessionId(): string | null {
    return this.appSessionId;
  }

  getModel(): string {
    return this.model;
  }

  idleMs(): number {
    return Date.now() - this.lastActivityAt;
  }

  isCompletable(): boolean {
    return this.appSessionId !== null && !this.markedCompleted;
  }

  markCompleted(): void {
    this.markedCompleted = true;
  }

  map(event: PiEvent): MapperResult {
    this.lastActivityAt = Date.now();
    switch (event.type) {
      case "session":
        this.setPiSessionUuid(event.id);
        return this.gate({
          traceEvents: [
            this.asAgentEvent(
              createAgentSessionStartEvent(this.ids(), "pi-agent", this.model),
              event.timestamp,
            ),
          ],
          metadata: { piSessionUuid: event.id },
        });

      case "model_change":
        this.model = event.modelId;
        return { traceEvents: [] };

      case "message":
        return this.gate(this.mapMessage(event, event.timestamp));

      case "custom":
        return this.mapCustom(event);

      case "thinking_level_change":
      case "session_info":
      default:
        return { traceEvents: [] };
    }
  }

  private stampId(): string {
    return this.appSessionId ?? "";
  }

  private gate(result: MapperResult): MapperResult {
    if (this.appSessionId !== null) return result;
    if (result.traceEvents.length > 0) {
      this.pending.push(...result.traceEvents);
      this.pendingSince ??= Date.now();
    }
    return { traceEvents: [], metadata: result.metadata };
  }

  private mapMessage(event: PiMessageEvent, timestamp: string): MapperResult {
    const results: LegacyMappedTraceEvent[] = [];
    const { role, content } = event.message;

    if (role === "toolResult") {
      const toolName = event.message.toolName ?? "unknown";
      const toolCallId = event.message.toolCallId ?? "unknown";
      const output = content
        ?.map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .slice(0, 10000);
      results.push(
        this.asAgentEvent(
          createToolCallEndEvent(this.ids(), toolName, toolCallId, {
            toolOutput: output || undefined,
            spanId: toolCallId,
          }),
          timestamp,
        ),
      );
      return { traceEvents: results };
    }

    for (const block of content) {
      if (role === "user" && block.type === "text") {
        results.push(
          this.asAgentEvent(
            createUserMessageEvent(this.ids(), block.text, "unknown"),
            timestamp,
          ),
        );
      }

      if (role === "assistant" && block.type === "text") {
        results.push(
          this.asAgentEvent(
            createAssistantMessageEvent(this.ids(), block.text, "text"),
            timestamp,
          ),
        );
      }

      if (role === "assistant" && block.type === "toolCall") {
        let toolInput: Record<string, unknown> | undefined;
        try {
          toolInput = JSON.parse(block.arguments) as Record<string, unknown>;
        } catch {
          toolInput = { raw: block.arguments };
        }
        results.push(
          this.asAgentEvent(
            createToolCallStartEvent(this.ids(), block.name, block.id, {
              toolInput,
              spanId: block.id,
            }),
            timestamp,
          ),
        );
      }
    }

    return { traceEvents: results };
  }

  private mapCustom(event: PiEvent & { type: "custom" }): MapperResult {
    const binding = this.options.sessionBinding;
    if (binding && event.customType === binding.customType) {
      const appSessionId = event.data[binding.appSessionIdField ?? "appSessionId"] as
        | string
        | undefined;
      const slug = event.data[binding.slugField ?? "appSessionSlug"] as string | undefined;
      const dir = event.data[binding.dirField ?? "appSessionDir"] as string | undefined;
      const flushed = appSessionId ? this.setAppSessionId(appSessionId) : [];

      return {
        traceEvents: flushed,
        metadata: {
          appSession: {
            appSessionId,
            slug,
            dir,
            customType: event.customType,
            raw: event.data,
          },
        },
      };
    }

    if (event.customType === this.options.lifecycleCustomType) {
      return this.gate({ traceEvents: this.mapPiLifecycle(event, event.timestamp) });
    }

    if (event.customType === this.options.subagentLinkCustomType) {
      return {
        traceEvents: [],
        metadata: {
          subagentLink: {
            parentPiSessionId: event.data.parentPiSessionId as string,
            childPiSessionId: event.data.childPiSessionId as string,
            toolCallId: event.data.toolCallId as string,
            agentType: event.data.agentType as string,
            description: event.data.description as string,
          },
        },
      };
    }

    return this.gate({
      traceEvents: [
        {
          eventId: newEventId(),
          appSessionId: this.stampId(),
          userId: SYSTEM_USER_ID,
          type: "custom_event" as TraceEvent["type"],
          source: "agent",
          traceLevel: TraceLevel.PROCESSING,
          eventData: {
            custom_type: event.customType,
            data: event.data,
          } as TraceEvent["eventData"],
          timestamp: event.timestamp,
          piSessionUuid: this.piSessionUuid ?? undefined,
        },
      ],
    });
  }

  private mapPiLifecycle(
    event: PiEvent & { type: "custom" },
    timestamp: string,
  ): LegacyMappedTraceEvent[] {
    const phase = event.data.phase as string | undefined;
    switch (phase) {
      case "agent_start":
        return [this.asAgentEvent(createPiAgentStartEvent(this.ids()), timestamp)];
      case "agent_end":
        return [
          this.asAgentEvent(
            createPiAgentEndEvent(this.ids(), "ok", {
              inputTokens: event.data.inputTokens as number | undefined,
              outputTokens: event.data.outputTokens as number | undefined,
            }),
            timestamp,
          ),
        ];
      case "turn_start":
        return [
          this.asAgentEvent(
            createPiTurnStartEvent(this.ids(), {
              turnNumber: event.data.turnIndex as number | undefined,
            }),
            timestamp,
          ),
        ];
      case "turn_end":
        return [
          this.asAgentEvent(
            createPiTurnEndEvent(this.ids(), {
              turnNumber: event.data.turnIndex as number | undefined,
              stopReason: event.data.stopReason as string | undefined,
            }),
            timestamp,
          ),
        ];
      default:
        return [];
    }
  }
}
