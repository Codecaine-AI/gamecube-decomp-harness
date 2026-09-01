import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatLocator, parseLocator, type DiscordLocator } from "../locator.js";
import { openKnowledgeStore } from "../storage/store.js";
import { importDiscord } from "./discord.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "knowledge-discord-"));
  tempDirs.push(root);
  const rawRoot = join(root, "raw");
  mkdirSync(join(rawRoot, "100"), { recursive: true });
  mkdirSync(join(rawRoot, "200"), { recursive: true });
  const message = (id: string, channelId: string, extra: Record<string, unknown> = {}) => JSON.stringify({
    id,
    channel_id: channelId,
    author: `author-${id}`,
    timestamp: `2020-0${id.length}-01T00:00:00.000+00:00`,
    content: `message-${id}`,
    reply_to: null,
    attachments: [],
    reactions: [],
    ...extra,
  });
  writeFileSync(join(rawRoot, "100", "2020-01.jsonl"), `${message("1", "100")}\n${message("2", "100", { reply_to: "1" })}\n`);
  writeFileSync(join(rawRoot, "100", "2020-02.jsonl"), `${message("3", "100", { thread_id: "thread-3" })}\n`);
  writeFileSync(join(rawRoot, "200", "2020-01.jsonl"), `${message("4", "200")}\n`);
  writeFileSync(join(rawRoot, "200", "2020-02.jsonl"), "");
  const channelsConfigPath = join(root, "channels.json");
  writeFileSync(channelsConfigPath, JSON.stringify({ channels: [{ id: "100", name: "melee", enabled: false }] }));
  const store = openKnowledgeStore({ knowledgeRoot: join(root, "knowledge") });
  return { root, rawRoot, channelsConfigPath, store };
}

describe("importDiscord", () => {
  test("generates ids that round-trip through discord locators", () => {
    const { rawRoot, channelsConfigPath, store } = fixture();
    importDiscord(store, { rawRoot, channelsConfigPath });
    const rows = store.db.query<{ id: string }, []>("SELECT id FROM discord_message ORDER BY id").all();

    expect(rows.length).toBeGreaterThan(0);
    for (const { id } of rows) {
      const locator = `discord://message/${id}`;
      const parsed = parseLocator(locator, "discord") as DiscordLocator;
      expect(parsed.messageId).toBe(id);
      expect(formatLocator(parsed)).toBe(locator);
    }

    store.close();
  });

  test("imports ordered channel batches, resolves names, and advances per-channel watermarks", () => {
    const { rawRoot, channelsConfigPath, store } = fixture();
    const result = importDiscord(store, { rawRoot, channelsConfigPath, now: () => "2026-01-02T03:04:05.000Z" });

    expect(result).toEqual({
      inserted: 4,
      skipped: 0,
      tasksEnqueued: 2,
      channels: 2,
      watermark: JSON.stringify({ "100": "3", "200": "4" }),
    });
    expect(store.db.query("SELECT id, channel, thread_id, ingested_at FROM discord_message ORDER BY id").all()).toEqual([
      { id: "1", channel: "melee", thread_id: null, ingested_at: "2026-01-02T03:04:05.000Z" },
      { id: "2", channel: "melee", thread_id: null, ingested_at: "2026-01-02T03:04:05.000Z" },
      { id: "3", channel: "melee", thread_id: "thread-3", ingested_at: "2026-01-02T03:04:05.000Z" },
      { id: "4", channel: "200", thread_id: null, ingested_at: "2026-01-02T03:04:05.000Z" },
    ]);
    expect(store.db.query("SELECT pathway, payload FROM index_task ORDER BY payload").all()).toEqual([
      {
        pathway: "archival_ingest",
        payload: JSON.stringify({ source: "discord", channel_id: "100", from_id: "1", to_id: "3", count: 3 }),
      },
      {
        pathway: "archival_ingest",
        payload: JSON.stringify({ source: "discord", channel_id: "200", from_id: "4", to_id: "4", count: 1 }),
      },
    ]);

    store.close();
  });

  test("is idempotent and does not move the watermark for empty batches", () => {
    const { rawRoot, channelsConfigPath, store } = fixture();
    importDiscord(store, { rawRoot, channelsConfigPath });
    const before = store.db.query("SELECT position, updated_at FROM source_watermark WHERE source = 'discord'").get();
    const result = importDiscord(store, { rawRoot, channelsConfigPath });

    expect(result).toEqual({
      inserted: 0,
      skipped: 4,
      tasksEnqueued: 0,
      channels: 0,
      watermark: JSON.stringify({ "100": "3", "200": "4" }),
    });
    expect(store.db.query("SELECT COUNT(*) AS count FROM index_task").get()).toEqual({ count: 2 });
    expect(store.db.query("SELECT position, updated_at FROM source_watermark WHERE source = 'discord'").get()).toEqual(before);

    store.close();
  });

  test("dry run reports projected work and writes nothing", () => {
    const { rawRoot, channelsConfigPath, store } = fixture();
    const result = importDiscord(store, { rawRoot, channelsConfigPath, dryRun: true });

    expect(result).toEqual({
      inserted: 4,
      skipped: 0,
      tasksEnqueued: 2,
      channels: 2,
      watermark: JSON.stringify({ "100": "3", "200": "4" }),
    });
    for (const table of ["discord_message", "index_task", "source_watermark"]) {
      expect(store.db.query(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
    }

    store.close();
  });

  test("falls back to existing ids when a stored watermark is absent from raw history", () => {
    const { rawRoot, channelsConfigPath, store } = fixture();
    store.db.query("INSERT INTO source_watermark (source, position, updated_at) VALUES ('discord', ?, ?)").run(
      JSON.stringify({ "100": "missing" }),
      "2020-01-01T00:00:00.000Z",
    );
    store.db.query(`INSERT INTO discord_message
      (id, channel, author, posted_at, content, thread_id, ingested_at) VALUES (?, ?, ?, ?, ?, NULL, ?)`).run(
      "1", "melee", "old", "old", "old", "old",
    );

    const result = importDiscord(store, { rawRoot, channelsConfigPath });
    expect(result.inserted).toBe(3);
    expect(result.skipped).toBe(1);
    expect(result.channels).toBe(2);
    expect(JSON.parse(result.watermark!)).toEqual({ "100": "3", "200": "4" });

    store.close();
  });
});
