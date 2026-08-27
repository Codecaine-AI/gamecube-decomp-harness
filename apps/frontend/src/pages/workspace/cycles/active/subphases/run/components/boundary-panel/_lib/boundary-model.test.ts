import { describe, expect, test } from "bun:test";
import type { BoundaryAttempt, BoundaryStep, BoundaryView, Dashboard } from "@/lib/format";
import { boundaryPanelModel, expansionForStep, failingTranslationUnit, recentBoundaries, selectBoundaryView, stepRows } from "./boundary-model";

const keys = ["integration_drain", "snapshot_commit", "worktree_prepare", "configure", "report_build", "report_read", "confirmation_pass", "qa_scan", "report_publish", "regression_repair", "save_point", "boundary_sync", "master_breakage_gate", "ci_parity_gate", "pre_commit_gate", "draft_pr_publish", "knowledge_maintenance", "typed_close", "admission"];
function step(key: string, changes: Partial<BoundaryStep> = {}): BoundaryStep { return { key, state: "pending", startedAt: null, finishedAt: null, durationMs: null, detail: null, payload: null, ...changes }; }
function attempt(changes: Partial<BoundaryAttempt> = {}): BoundaryAttempt { return { attempt: 1, reconciled: false, startedAt: "2026-08-27T12:00:00Z", finishedAt: null, steps: keys.map((key) => step(key)), error: null, ...changes }; }
function view(changes: Partial<BoundaryView> = {}): BoundaryView { return { epochId: "epoch-2", ordinal: 2, epochStatus: "running", boundaryStatus: null, admittedCount: 20, finishedCount: 20, active: true, attempts: [attempt()], savePointId: null, matchedCodePercent: null, nextEpoch: null, ...changes }; }
function dashboard(boundary: unknown): Dashboard { return { boundary } as unknown as Dashboard; }

describe("boundary model", () => {
  test("hides an absent or empty boundary and retains recent views", () => {
    expect(selectBoundaryView(null)).toBeNull();
    expect(selectBoundaryView(dashboard({ current: null, recent: [] }))).toBeNull();
    const closed = view({ active: false });
    expect(recentBoundaries(dashboard({ current: null, recent: [closed] }))).toEqual([closed]);
  });

  test("maps every canonical step label and formats fixed durations", () => {
    const rows = stepRows(attempt({ steps: keys.map((key) => step(key, { state: "done", durationMs: 62_000 })) }));
    expect(rows.map((row) => row.label)).toEqual(["Integration drain", "Snapshot commit", "Worktree prepare", "Configure", "Report build", "Report read", "Confirmation pass", "QA scan", "Report publish", "Regression repair", "Save point", "Boundary sync", "Master breakage gate", "CI parity gate", "Pre-commit gate", "Draft PR publish", "Knowledge maintenance", "Typed close", "Next-epoch admission"]);
    expect(rows[0].duration).toBe("1m 2s");
  });

  test("derives attempt, reconciled, and error presentation", () => {
    const first = attempt({ attempt: 1, finishedAt: "2026-08-27T12:01:00Z" });
    const second = attempt({ attempt: 2, reconciled: true, error: "compile failed at build/src/fighter.o:" });
    const model = boundaryPanelModel(dashboard({ current: view({ epochStatus: "error", attempts: [first, second] }), recent: [] }));
    expect(model).toMatchObject({ status: "reconciled", attemptBadge: "attempt 2", reconciledBanner: "reconciled: report/gates/PR/pr_sync skipped", priorAttempts: [{ attempt: 1, duration: "1m 0s" }] });
    expect(model?.errorBanner).toEqual({ error: second.error!, failingTu: "build/src/fighter.o", retry: "boundary will retry on next scheduler tick" });
  });

  test("extracts only object and C translation units", () => {
    expect(failingTranslationUnit("failed src/foo.c, retrying")).toBe("src/foo.c");
    expect(failingTranslationUnit("failed build/src/foo.o:")).toBe("build/src/foo.o");
    expect(failingTranslationUnit("failed src/foo.cpp")).toBeNull();
  });

  test("shapes sync expansion and caps displaced targets at 12", () => {
    const displaced = Array.from({ length: 15 }, (_, index) => ({ target_key: `target-${index}`, unit: `u${index}.c` }));
    const expansion = expansionForStep(step("boundary_sync", { payload: { anchor_before: "aaa", anchor_after: "bbb", merge_commit_sha: "ccc", displaced_count: 15, displaced } }));
    expect(expansion?.facts).toEqual([["Anchor", "aaa → bbb"], ["Merge SHA", "ccc"], ["Displaced", "15"]]);
    expect(expansion?.sections[0]).toMatchObject({ label: "Displaced targets", remaining: 3 });
    expect(expansion?.sections[0].values).toHaveLength(12);
  });

  test("caps gate reasons and QA errors independently", () => {
    const payload = { breakages: Array.from({ length: 14 }, (_, index) => ({ unit: `b${index}.c` })), reasons: Array.from({ length: 13 }, (_, index) => `reason ${index}`), qa_errors: Array.from({ length: 16 }, (_, index) => ({ file: `q${index}.c`, message: "bad" })) };
    const expansion = expansionForStep(step("qa_scan", { state: "warning", payload }));
    expect(expansion?.sections.map(({ label, remaining, values }) => [label, remaining, values.length])).toEqual([["Breakages", 2, 12], ["Reasons", 1, 12], ["QA errors", 4, 12]]);
  });
});
