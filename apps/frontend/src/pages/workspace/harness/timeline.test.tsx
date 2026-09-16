import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Dashboard } from "@/lib/format";
import { harnessStateReadModel } from "@/pages/workspace/_lib/model";
import { HarnessTimeline } from "./timeline";

describe("Harness boundary evidence", () => {
  test("preserves no-change Sync and missing evidence as distinct facts", () => {
    const state = harnessStateReadModel({ harnessState: {
      game_id: "melee", timeline: [{
        identity: { game_id: "melee", harness_id: "harness-1", event_id: "sync-event", order: 12, occurred_at: "2026-09-11T18:00:00Z", command_id: "sync-command" },
        kind: "sync_completed", outcome: "no_source_change", syncId: "sync-1",
        source: { prior_head: "head-B", resulting_head: "head-B" }, evidence: { freshness: "missing", score: null },
      }],
    } } as unknown as Dashboard);
    expect(state?.timeline?.[0]?.evidence.score).toBeNull();
    expect(state?.timeline?.[0]?.syncId).toBe("sync-1");
    const html = renderToStaticMarkup(<HarnessTimeline entries={state?.timeline ?? []} />);
    expect(html).toContain("no source change");
    expect(html).toContain("missing");
    expect(html).not.toContain("0%");
    expect(html).toContain("head-B");
  });
});
