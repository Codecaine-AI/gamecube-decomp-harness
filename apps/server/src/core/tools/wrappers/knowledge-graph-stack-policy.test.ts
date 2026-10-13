import { describe, expect, test } from "bun:test";
import { STACK_POLICY_REDACTION } from "@server/core/knowledge-v2/stack-policy-filter.js";
import { graphSearchForPolicy } from "./knowledge.js";

const payload = () => ({
  status: "ok",
  graph_db: "/graph.sqlite",
  results: [
    { source_id: "mismatch_patterns", title: "frame", text: "Look for missing inlines and PAD_STACK tradeoffs. Keep padding.", evidence_ref: "mp:1" },
    { source_id: "code_graph", title: "MActor.cpp", text: "\tchar trash[0x18];", evidence_ref: "code:1" },
    { source_id: "past_prs", title: "PR 212", text: "Matched calc by restoring the getter.", evidence_ref: "pr:212" },
  ],
});

describe("legacy graph search under a stop_at_frame game", () => {
  test("SMS redacts history chunks and keeps live-code chunks verbatim", () => {
    const sms = graphSearchForPolicy({ game: { gameId: "sms" } }, payload()) as ReturnType<typeof payload> & { stack_policy_note?: string };
    expect(sms.stack_policy_note).toContain("banned");
    expect(sms.results[0]!.text).toBe(`${STACK_POLICY_REDACTION} Keep padding.`);
    expect(sms.results[0]!.evidence_ref).toBe("mp:1");
    expect(sms.results[1]!.text).toBe("\tchar trash[0x18];");
    expect(sms.results[2]!.text).toBe("Matched calc by restoring the getter.");
  });

  test("Melee results are returned unchanged", () => {
    const original = payload();
    expect(graphSearchForPolicy({ game: { gameId: "melee" } }, original)).toBe(original);
  });
});
