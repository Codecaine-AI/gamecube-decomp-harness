import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { KnowledgeStoreHandle } from "../records/index.js";
import {
  advanceWatermark,
  enqueueIndexTask,
  getWatermark,
  insertDiscordMessages,
} from "../records/index.js";
import { immediateTransaction } from "../storage/transaction.js";
import { taskId } from "./common.js";
import type { DiscordImportResult, LaneOptions } from "./types.js";

export interface DiscordImportOptions extends LaneOptions {
  rawRoot: string;
  channelsConfigPath: string;
}

export const DISCORD_TASK_CHUNK_SIZE = 40;

export function importDiscord(store: KnowledgeStoreHandle, options: DiscordImportOptions): DiscordImportResult {
  interface ChannelConfig {
    id: string;
    name: string;
  }

  interface RawDiscordMessage {
    id: string;
    channel_id: string;
    author: string;
    timestamp: string;
    content: string;
    thread?: string | null;
    thread_id?: string | null;
  }

  const ingestedAt = (options.now ?? (() => new Date().toISOString()))();
  const existingWatermark = getWatermark(store, "discord");
  let watermarkByChannel: Record<string, string> = {};
  if (existingWatermark !== null) {
    try {
      const parsed: unknown = JSON.parse(existingWatermark);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        watermarkByChannel = { ...(parsed as Record<string, string>) };
      }
    } catch {
      watermarkByChannel = {};
    }
  }

  const config = JSON.parse(readFileSync(options.channelsConfigPath, "utf8")) as { channels?: ChannelConfig[] };
  const channelNames = new Map((config.channels ?? []).map((channel) => [channel.id, channel.name]));
  const existingIds = new Set(
    store.db.query<{ id: string }, []>("SELECT id FROM discord_message").all().map((row) => row.id),
  );

  let inserted = 0;
  let skipped = 0;
  let tasksEnqueued = 0;
  let channels = 0;
  const pendingMessages: Parameters<typeof insertDiscordMessages>[1][number][] = [];
  const pendingTasks: Parameters<typeof enqueueIndexTask>[1][] = [];

  const channelIds = readdirSync(options.rawRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const channelId of channelIds) {
    const records: RawDiscordMessage[] = [];
    const files = readdirSync(join(options.rawRoot, channelId), { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^\d{4}-\d{2}\.jsonl$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    for (const file of files) {
      const lines = readFileSync(join(options.rawRoot, channelId, file), "utf8").split(/\r?\n/);
      for (const line of lines) {
        if (line.trim() !== "") records.push(JSON.parse(line) as RawDiscordMessage);
      }
    }

    const previousId = watermarkByChannel[channelId];
    const markerIndex = previousId === undefined ? -1 : records.findIndex((record) => record.id === previousId);
    const candidateStart = markerIndex >= 0 ? markerIndex + 1 : 0;
    skipped += markerIndex >= 0 ? candidateStart : 0;

    const batch: RawDiscordMessage[] = [];
    for (let index = candidateStart; index < records.length; index += 1) {
      const record = records[index]!;
      if (existingIds.has(record.id)) {
        skipped += 1;
        continue;
      }
      existingIds.add(record.id);
      batch.push(record);
    }
    if (batch.length === 0) continue;

    const messages = batch.map((record) => ({
      id: record.id,
      channel: channelNames.get(channelId) ?? channelId,
      author: record.author,
      postedAt: record.timestamp,
      content: record.content,
      threadId: record.thread_id ?? record.thread ?? null,
      ingestedAt,
    }));
    inserted += batch.length;
    channels += 1;
    watermarkByChannel[channelId] = batch[batch.length - 1]!.id;
    if (!options.dryRun) pendingMessages.push(...messages);
    for (let index = 0; index < batch.length; index += DISCORD_TASK_CHUNK_SIZE) {
      const slice = batch.slice(index, index + DISCORD_TASK_CHUNK_SIZE);
      const payload = JSON.stringify({
        source: "discord",
        channel_id: channelId,
        from_id: slice[0]!.id,
        to_id: slice[slice.length - 1]!.id,
        count: slice.length,
      });
      tasksEnqueued += 1;
      if (!options.dryRun) {
        pendingTasks.push({
          id: taskId("archival_ingest", payload),
          pathway: "archival_ingest",
          payload,
          enqueuedAt: ingestedAt,
        });
      }
    }
  }

  const watermark = channels > 0 ? JSON.stringify(watermarkByChannel) : existingWatermark;
  if (!options.dryRun && channels > 0) {
    immediateTransaction(store.db, () => {
      insertDiscordMessages(store, pendingMessages);
      for (const task of pendingTasks) enqueueIndexTask(store, task);
      advanceWatermark(store, "discord", watermark!);
    });
  }

  return { inserted, skipped, tasksEnqueued, channels, watermark };
}
