import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { NewAgentRun, NewPiAgentSession } from "@agent-kernel/db";
import * as schema from "@agent-kernel/db/schema/pg";
import {
  EventMapper,
  readJsonlFile,
  runBackfill,
  type BackfillSummary,
  type PiEvent,
  type RunBackfillOptions,
} from "@agent-kernel/kernel/transcript-recovery";
import { eq } from "drizzle-orm";

import { MELEE_KERNEL_MARKER_CONFIG } from "./config.js";

const pgSchema = schema as any;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MELEE_AGENT_RUN_NAMESPACE = "56de4ed7-1d44-47ff-8f3b-c5e1b9071f25";

export interface MeleeTranscriptBackfillRootSummary {
  root: string;
  files: number;
  eventsInserted: number;
  eventsSkipped: number;
  piSessionsInserted: number;
  piSessionsSkipped: number;
  agentRunsInserted: number;
  agentRunsSkipped: number;
  warnings: string[];
}

export interface MeleeTranscriptBackfillSummary {
  files: number;
  eventsInserted: number;
  eventsSkipped: number;
  piSessionsInserted: number;
  piSessionsSkipped: number;
  agentRunsInserted: number;
  agentRunsSkipped: number;
  dryRun: boolean;
  roots: MeleeTranscriptBackfillRootSummary[];
}

export interface MeleeTranscriptBackfillIdentityStore {
  hasPiSession(db: unknown, id: string): Promise<boolean>;
  hasAgentRun(db: unknown, id: string): Promise<boolean>;
  insertPiSession(db: unknown, row: NewPiAgentSession): Promise<boolean>;
  insertAgentRun(db: unknown, row: NewAgentRun): Promise<boolean>;
}

export interface RunMeleeTranscriptBackfillOptions {
  db: unknown;
  roots: string[];
  batchSize?: number;
  dryRun?: boolean;
  log?: (message: string) => void;
  /** Test seam. Production callers use the default kernel and database ports. */
  ports?: {
    backfill?: (options: RunBackfillOptions) => Promise<BackfillSummary>;
    identityStore?: MeleeTranscriptBackfillIdentityStore;
  };
}

interface RecoveredIdentity {
  piSession: NewPiAgentSession;
  agentRun: NewAgentRun;
}

function stableUuid(namespace: string, name: string): string {
  const namespaceBytes = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const hash = createHash("sha1").update(namespaceBytes).update(name).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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

function findLastEvent(
  events: PiEvent[],
  predicate: (event: PiEvent) => boolean,
): PiEvent | undefined {
  for (let index = events.length - 1; index >= 0; index--) {
    if (predicate(events[index])) return events[index];
  }
  return undefined;
}

async function enumerateJsonl(root: string): Promise<string[]> {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(path);
    }
  }
  return files.sort();
}

function recoverIdentity(events: PiEvent[]): RecoveredIdentity | null {
  const session = events.find((event) => event.type === "session");
  const binding = events.find(
    (event) => event.type === "custom" && event.customType === MELEE_KERNEL_MARKER_CONFIG.sessionBinding,
  );
  if (!session || !binding || binding.type !== "custom") return null;

  const containerId = stringValue(binding.data.containerId);
  if (!containerId || !(containerId.startsWith("melee:") || UUID_RE.test(containerId))) return null;

  const lifecycle = events.filter(
    (event) => event.type === "custom" && event.customType === MELEE_KERNEL_MARKER_CONFIG.lifecycle,
  );
  const start = lifecycle.find(
    (event) => event.type === "custom" && event.data.phase === "agent_start",
  );
  const end = findLastEvent(lifecycle,
    (event) => event.type === "custom" && event.data.phase === "agent_end",
  );
  const modelChange = findLastEvent(events, (event) => event.type === "model_change");
  const modelMessage = findLastEvent(
    events,
    (event) => event.type === "message" && event.message.role === "assistant" && Boolean(event.message.model),
  );
  const errored = events.some(
    (event) =>
      (event.type === "message" && event.message.role === "assistant" && event.message.stopReason === "error") ||
      (event.type === "custom" &&
        event.customType === MELEE_KERNEL_MARKER_CONFIG.lifecycle &&
        event.data.stopReason === "error"),
  );
  const startedAt = start?.timestamp ?? session.timestamp;
  const endedAt = end?.timestamp;
  const agentName = stringValue(binding.data.agentName) ?? stringValue(binding.data.role) ?? "pi-agent";
  const displayLabel = stringValue(binding.data.displayLabel) ?? agentName;
  const phase = stringValue(binding.data.phase);
  const runNumber = numberValue(binding.data.runNumber) ?? 1;
  const runId =
    stringValue(binding.data.runId) ??
    stringValue(binding.data.agentRunId) ??
    stableUuid(MELEE_AGENT_RUN_NAMESPACE, `pi-session:${session.id}\nrun:${runNumber}`);
  const inputTokens = end?.type === "custom" ? numberValue(end.data.inputTokens) ?? 0 : 0;
  const outputTokens = end?.type === "custom" ? numberValue(end.data.outputTokens) ?? 0 : 0;

  return {
    piSession: {
      id: session.id,
      containerId,
      agentName,
      displayLabel,
      model:
        modelChange?.type === "model_change"
          ? modelChange.modelId
          : modelMessage?.type === "message"
            ? modelMessage.message.model ?? "unknown"
            : "unknown",
      status: errored ? "error" : "ended",
      phase,
      usageInputTokens: inputTokens,
      usageOutputTokens: outputTokens,
      createdAt: startedAt,
      endedAt,
    },
    agentRun: {
      id: runId,
      piSessionId: session.id,
      containerId,
      agentName,
      trigger: "system",
      displayLabel,
      phase,
      status: errored ? "error" : "done",
      usageInputTokens: inputTokens,
      usageOutputTokens: outputTokens,
      startedAt,
      endedAt,
    },
  };
}

const defaultIdentityStore: MeleeTranscriptBackfillIdentityStore = {
  async hasPiSession(db, id) {
    const rows = await (db as any).select({ id: pgSchema.piAgentSessions.id })
      .from(pgSchema.piAgentSessions).where(eq(pgSchema.piAgentSessions.id, id)).limit(1);
    return rows.length > 0;
  },
  async hasAgentRun(db, id) {
    const rows = await (db as any).select({ id: pgSchema.agentRuns.id })
      .from(pgSchema.agentRuns).where(eq(pgSchema.agentRuns.id, id)).limit(1);
    return rows.length > 0;
  },
  async insertPiSession(db, row) {
    const inserted = await (db as any).insert(pgSchema.piAgentSessions).values(row)
      .onConflictDoNothing({ target: pgSchema.piAgentSessions.id }).returning({ id: pgSchema.piAgentSessions.id });
    return inserted.length > 0;
  },
  async insertAgentRun(db, row) {
    const inserted = await (db as any).insert(pgSchema.agentRuns).values(row)
      .onConflictDoNothing({ target: pgSchema.agentRuns.id }).returning({ id: pgSchema.agentRuns.id });
    return inserted.length > 0;
  },
};

async function dryRunBackfill(files: string[]): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    filesProcessed: 0,
    eventsMapped: 0,
    eventsInserted: 0,
    eventsSkipped: 0,
    warnings: [],
  };
  for (const file of files) {
    const { events, malformedLines, truncatedTail } = await readJsonlFile(file);
    const mapper = new EventMapper({
      sessionBinding: { customType: MELEE_KERNEL_MARKER_CONFIG.sessionBinding },
      lifecycleCustomType: MELEE_KERNEL_MARKER_CONFIG.lifecycle,
      subagentLinkCustomType: MELEE_KERNEL_MARKER_CONFIG.subagentLink,
      acceptContainerId: (id) => id.startsWith("melee:") || UUID_RE.test(id),
    });
    for (const event of events) summary.eventsMapped += mapper.map(event).traceEvents.length;
    if (malformedLines) summary.warnings.push(`${file}: skipped ${malformedLines} malformed line(s)`);
    if (truncatedTail) summary.warnings.push(`${file}: ignored partial last line`);
    if (mapper.hasPending()) summary.warnings.push(`${file}: ${mapper.pendingCount()} unbound event(s) dropped`);
    summary.filesProcessed++;
  }
  summary.eventsInserted = summary.eventsMapped;
  return summary;
}

export async function runMeleeTranscriptBackfill(
  options: RunMeleeTranscriptBackfillOptions,
): Promise<MeleeTranscriptBackfillSummary> {
  const identityStore = options.ports?.identityStore ?? defaultIdentityStore;
  const backfill = options.ports?.backfill ?? runBackfill;
  const rootFiles = await Promise.all(options.roots.map(async (root) => ({ root, files: await enumerateJsonl(root) })));

  const roots = await Promise.all(rootFiles.map(async ({ root, files }) => {
    options.log?.(`Backfilling ${files.length} transcript(s) under ${root}`);
    const eventSummary = options.dryRun
      ? await dryRunBackfill(files)
      : await backfill({
          files,
          db: options.db as RunBackfillOptions["db"],
          batchSize: options.batchSize,
          acceptContainerId: (id) => id.startsWith("melee:") || UUID_RE.test(id),
          mapper: {
            sessionBinding: { customType: MELEE_KERNEL_MARKER_CONFIG.sessionBinding },
            lifecycleCustomType: MELEE_KERNEL_MARKER_CONFIG.lifecycle,
            subagentLinkCustomType: MELEE_KERNEL_MARKER_CONFIG.subagentLink,
          },
        });

    const counts = { piSessionsInserted: 0, piSessionsSkipped: 0, agentRunsInserted: 0, agentRunsSkipped: 0 };
    await Promise.all(files.map(async (file) => {
      const { events } = await readJsonlFile(file);
      const identity = recoverIdentity(events);
      if (!identity) return;
      const sessionExists = await identityStore.hasPiSession(options.db, identity.piSession.id);
      if (sessionExists) counts.piSessionsSkipped++;
      else if (options.dryRun || await identityStore.insertPiSession(options.db, identity.piSession)) counts.piSessionsInserted++;
      else counts.piSessionsSkipped++;

      const runExists = await identityStore.hasAgentRun(options.db, identity.agentRun.id);
      if (runExists) counts.agentRunsSkipped++;
      else if (options.dryRun || await identityStore.insertAgentRun(options.db, identity.agentRun)) counts.agentRunsInserted++;
      else counts.agentRunsSkipped++;
    }));

    return {
      root,
      files: files.length,
      eventsInserted: eventSummary.eventsInserted,
      eventsSkipped: eventSummary.eventsSkipped,
      ...counts,
      warnings: eventSummary.warnings,
    };
  }));

  return {
    files: roots.reduce((sum, root) => sum + root.files, 0),
    eventsInserted: roots.reduce((sum, root) => sum + root.eventsInserted, 0),
    eventsSkipped: roots.reduce((sum, root) => sum + root.eventsSkipped, 0),
    piSessionsInserted: roots.reduce((sum, root) => sum + root.piSessionsInserted, 0),
    piSessionsSkipped: roots.reduce((sum, root) => sum + root.piSessionsSkipped, 0),
    agentRunsInserted: roots.reduce((sum, root) => sum + root.agentRunsInserted, 0),
    agentRunsSkipped: roots.reduce((sum, root) => sum + root.agentRunsSkipped, 0),
    dryRun: options.dryRun ?? false,
    roots,
  };
}
