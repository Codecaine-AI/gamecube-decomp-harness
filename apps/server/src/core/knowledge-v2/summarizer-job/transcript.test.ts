import { describe, expect, test } from "bun:test";

import { buildTranscriptPacket, condenseTranscriptContent } from "./transcript.js";

function jsonl(events: unknown[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

describe("condenseTranscriptContent", () => {
  test("truncates each tool result text part and reports removed characters", () => {
    const longText = "x".repeat(1_700);
    const input = jsonl([{ type: "message", message: { role: "toolResult", content: [
      { type: "text", text: longText },
      { type: "image", data: "kept" },
    ] } }]);
    const output = condenseTranscriptContent(input);
    const event = JSON.parse(output.trim());

    expect(event.message.content[0].text).toBe(
      `${"x".repeat(300)}…[transcript-condenser: truncated 1400 chars]`,
    );
    expect(event.message.content[1]).toEqual({ type: "image", data: "kept" });
  });

  test("truncates each user message text part with a configurable limit", () => {
    const input = jsonl([{ type: "message", message: { role: "user", content: [
      { type: "text", text: "u".repeat(2_123) },
      { type: "image", data: "kept" },
    ] } }]);
    const event = JSON.parse(condenseTranscriptContent(input, { userTextLimit: 2_000 }).trim());

    expect(event.message.content[0].text).toBe(
      `${"u".repeat(2_000)}…[transcript-condenser: truncated 123 chars]`,
    );
    expect(event.message.content[1]).toEqual({ type: "image", data: "kept" });
  });

  test("truncates custom_message content", () => {
    const input = jsonl([{ type: "custom_message", customType: "agent-context", content: "c".repeat(2_123) }]);
    const event = JSON.parse(condenseTranscriptContent(input).trim());
    expect(event.content).toBe(
      `${"c".repeat(2_000)}…[transcript-condenser: truncated 123 chars]`,
    );
  });

  test("passes through unparseable lines truncated to 500 characters", () => {
    const invalid = "not-json-" + "z".repeat(600);
    const input = `${JSON.stringify({ type: "session", id: "s" })}\n${invalid}\n`;
    const lines = condenseTranscriptContent(input).split("\n");
    expect(lines[0]).toBe(JSON.stringify({ type: "session", id: "s" }));
    expect(lines[1]).toBe(invalid.slice(0, 500));
  });

  test("keeps small transcripts byte-for-byte unchanged", () => {
    const input = [
      "  {\"type\":\"session\",\"id\":\"s\"}",
      JSON.stringify({ type: "message", message: { role: "assistant", content: [
        { type: "thinking", thinking: "reasoning" },
        { type: "text", text: "answer" },
        { type: "toolCall", name: "read", arguments: { path: "file" } },
      ] } }),
      "",
    ].join("\n");
    expect(condenseTranscriptContent(input)).toBe(input);
  });

  test("is deterministic", () => {
    const input = jsonl([
      { type: "custom_message", content: "a".repeat(3_000) },
      { type: "message", message: { role: "toolResult", content: [{ type: "text", text: "b".repeat(4_000) }] } },
    ]);
    expect(condenseTranscriptContent(input)).toBe(condenseTranscriptContent(input));
  });

  test("elides few huge lines by byte budget instead of line count", () => {
    const events = Array.from({ length: 6 }, (_, index) => ({
      type: "custom",
      id: index,
      payload: "x".repeat(index === 0 || index === 5 ? 1_000 : 30_000),
    }));
    const output = condenseTranscriptContent(jsonl(events), { maxBytes: 10_000 });
    const condensed = output.trim().split("\n").map((line) => JSON.parse(line));

    expect(Buffer.byteLength(output, "utf8")).toBeLessThanOrEqual(10_000);
    expect(condensed[0].id).toBe(0);
    expect(condensed.at(-1).id).toBe(5);
    expect(condensed[1]).toMatchObject({
      type: "custom",
      marker: "transcript-condenser",
      elided_events: 4,
    });
  });
});

describe("buildTranscriptPacket", () => {
  test("elides middle events across the global budget and keeps head and tail", async () => {
    const session = (prefix: string) => jsonl(Array.from({ length: 20 }, (_, index) => ({
      type: "custom",
      id: `${prefix}-${index}`,
      payload: "p".repeat(120),
    })));
    const files = new Map([["/one", session("one")], ["/two", session("two")]]);
    const rows = [
      { kind: "transcript_span", session_id: "one", path: "/one", exists: true },
      { kind: "transcript_span", session_id: "two", path: "/two", exists: true },
    ] as const;
    const packet = await buildTranscriptPacket(
      rows,
      async (path) => files.get(path)!,
      { maxBytes: 4_000 },
    );

    expect(packet.reduce((total, row) => total + Buffer.byteLength(row.content!, "utf8"), 0)).toBeLessThanOrEqual(4_000);
    for (const [index, row] of packet.entries()) {
      const events = row.content!.trim().split("\n").map((line) => JSON.parse(line));
      const prefix = index === 0 ? "one" : "two";
      expect(events[0].id).toBe(`${prefix}-0`);
      expect(events.at(-1).id).toBe(`${prefix}-19`);
      expect(events.some((event) => event.type === "custom"
        && event.marker === "transcript-condenser"
        && event.elided_events > 0
        && event.elided_bytes > 0)).toBe(true);
    }
  });

  test("keeps packet row shape and returns null for unavailable transcripts", async () => {
    const rows = [
      { kind: "transcript_span", session_id: "present", path: "/present", exists: true },
      { kind: "transcript_span", session_id: "missing", path: null, exists: false },
    ];
    const packet = await buildTranscriptPacket(rows, async () => "unchanged");
    expect(packet).toEqual([
      { ...rows[0], content: "unchanged" },
      { ...rows[1], content: null },
    ]);
  });

  test("keeps ten large sessions near the global 400KB budget", async () => {
    const session = (sessionIndex: number) => jsonl(Array.from({ length: 12 }, (_, eventIndex) => ({
      type: "custom",
      id: `${sessionIndex}-${eventIndex}`,
      payload: "p".repeat(18_000),
    })));
    const files = new Map(Array.from({ length: 10 }, (_, index) => [`/${index}`, session(index)]));
    const rows = Array.from({ length: 10 }, (_, index) => ({
      kind: "transcript_span",
      session_id: String(index),
      path: `/${index}`,
      exists: true,
    }));
    const packet = await buildTranscriptPacket(rows, async (path) => files.get(path)!);
    const totalBytes = packet.reduce(
      (total, row) => total + Buffer.byteLength(row.content!, "utf8"),
      0,
    );

    expect(totalBytes).toBeLessThanOrEqual(402_000);
    expect(totalBytes).toBeGreaterThan(300_000);
  });
});
