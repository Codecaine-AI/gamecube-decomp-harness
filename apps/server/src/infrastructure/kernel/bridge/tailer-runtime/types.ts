import type { TraceEvent } from "@agent-kernel/protocol";
import type {
  PiEvent,
  PiMessageEvent,
} from "@agent-kernel/kernel/transcript-recovery";

export type { PiEvent, PiMessageEvent };

/**
 * The bridge still consumes the pre-container-identity mapper envelope. The
 * outer tailer stamps its hierarchical Melee container id before insertion.
 */
export type LegacyMappedTraceEvent = Omit<TraceEvent, "containerId"> & {
  appSessionId: string;
  containerId?: string;
};

export interface MapperSessionBindingMetadata {
  appSessionId?: string;
  slug?: string;
  dir?: string;
  customType: string;
  raw: Record<string, unknown>;
}

export interface MapperSubagentLinkMetadata {
  parentPiSessionId: string;
  childPiSessionId: string;
  toolCallId: string;
  agentType: string;
  description: string;
}

export interface MapperResult {
  traceEvents: LegacyMappedTraceEvent[];
  metadata?: {
    /** App-level session/container identity discovered from a custom JSONL event. */
    appSession?: MapperSessionBindingMetadata;
    /** Pi session UUID from a session event. */
    piSessionUuid?: string;
    /** Parent-child sub-agent link data from a configured custom event. */
    subagentLink?: MapperSubagentLinkMetadata;
  };
}
