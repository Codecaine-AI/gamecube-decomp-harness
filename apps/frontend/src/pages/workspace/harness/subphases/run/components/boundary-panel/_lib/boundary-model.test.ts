import { describe, expect, test } from "bun:test";
import type { BoundaryAttempt, BoundaryStep, BoundaryView, Dashboard } from "@/lib/format";
import { boundaryPanelModel, boundaryViewSummary, expansionForStep, failingTranslationUnit, recentBoundaries, selectBoundaryView, stepRows } from "./boundary-model";

const keys = ["integration_drain", "snapshot_commit", "worktree_prepare", "configure", "report_build", "report_read", "confirmation_pass", "qa_scan", "report_publish", "regression_repair", "save_point", "boundary_sync", "master_breakage_gate", "ci_parity_gate", "pre_commit_gate", "draft_pr_publish", "knowledge_maintenance", "typed_close", "admission"];
function step(key: string, changes: Partial<BoundaryStep> = {}): BoundaryStep { return { key, state: "pending", startedAt: null, finishedAt: null, durationMs: null, detail: null, error: null, payload: null, ...changes }; }
function attempt(changes: Partial<BoundaryAttempt> = {}): BoundaryAttempt { return { attempt: 1, reconciled: false, startedAt: "2026-08-27T12:00:00Z", finishedAt: null, steps: keys.map((key) => step(key)), error: null, failedStep: null, artifactDir: null, ...changes }; }
function view(changes: Partial<BoundaryView> = {}): BoundaryView { return { epochId: "epoch-2", ordinal: 2, epochStatus: "running", boundaryStatus: null, admittedCount: 20, finishedCount: 20, active: true, attempts: [attempt()], error: null, retry: null, savePointId: null, matchedCodePercent: null, nextEpoch: null, ...changes }; }
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
    expect(model?.errorBanner).toEqual({ error: second.error!, failingTu: "build/src/fighter.o", failedStepLabel: null, retry: "boundary will retry on next scheduler tick" });
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

  test("adds generic scalar, array, and object payload details while ignoring display metadata", () => {
    const expansion = expansionForStep(step("configure", { payload: {
      count: 3, enabled: true, note: "x".repeat(205), files: ["a.c", "b.c"], config: { mode: "fast" },
      status: "done", phase: "boundary", message: "hidden", label: "hidden", created_by: "worker",
    } }));
    expect(expansion?.facts).toEqual([
      ["count", "3"], ["enabled", "true"], ["note", `${"x".repeat(200)}…`], ["config", "{\"mode\":\"fast\"}"],
    ]);
    expect(expansion?.sections).toEqual([{ label: "files", values: ["a.c", "b.c"], remaining: 0 }]);
  });

  test("passes through full step error text without a payload", () => {
    const failed = step("report_build", { state: "failed", error: "compiler failed\nfull diagnostic" });
    expect(expansionForStep(failed)).toEqual({ facts: [], sections: [], errorText: "compiler failed\nfull diagnostic" });
  });

  test("uses the latest step timestamp when an attempt has no finished timestamp", () => {
    const first = attempt({ steps: [step("configure", { startedAt: "2026-08-27T12:00:05Z", finishedAt: "2026-08-27T12:00:20Z" }), step("report_build", { startedAt: "2026-08-27T12:00:30Z" })] });
    const model = boundaryPanelModel(dashboard({ current: view({ attempts: [first, attempt({ attempt: 2 })] }), recent: [] }));
    expect(model?.priorAttempts[0].duration).toBe("30s");
    expect(boundaryPanelModel(dashboard({ current: view({ attempts: [attempt({ steps: [] }), attempt({ attempt: 2 })] }), recent: [] }))?.priorAttempts[0].duration).toBe("—");
  });

  test("formats scheduled, exhausted, and default retry messages", () => {
    const base = { epochStatus: "error", attempts: [attempt({ error: "failed" })] };
    const scheduled = view({ ...base, retry: { attemptCount: 2, maxAttempts: 5, nextAttemptAt: "2026-08-27T12:05:00Z", exhausted: false } });
    const exhausted = view({ ...base, retry: { attemptCount: 5, maxAttempts: 5, nextAttemptAt: null, exhausted: true } });
    expect(boundaryPanelModel(dashboard({ current: scheduled, recent: [] }))?.errorBanner?.retry).toBe("retry 3/5 scheduled for 2026-08-27T12:05:00Z");
    expect(boundaryPanelModel(dashboard({ current: exhausted, recent: [] }))?.errorBanner?.retry).toBe("retries exhausted after 5 attempt(s); run parked for operator recovery");
    expect(boundaryPanelModel(dashboard({ current: view(base), recent: [] }))?.errorBanner?.retry).toBe("boundary will retry on next scheduler tick");
  });

  test("derives failed step details and retains full prior rows", () => {
    const failed = attempt({ finishedAt: "2026-08-27T12:01:00Z", steps: [step("link_complete_units", { state: "failed" })], error: "link failed" });
    const model = boundaryPanelModel(dashboard({ current: view({ epochStatus: "error", attempts: [failed, attempt({ attempt: 2 })] }), recent: [] }));
    expect(model?.priorAttempts[0]).toMatchObject({ failedStep: "link_complete_units", failedStepLabel: "Link complete units", error: "link failed", startedAt: failed.startedAt, finishedAt: failed.finishedAt });
    expect(model?.priorAttempts[0].rows[0].label).toBe("Link complete units");
  });

  test("summarizes recent boundary attempts, failure, error, and total duration", () => {
    const failed = attempt({ finishedAt: "2026-08-27T12:01:00Z", steps: [step("report_build_fixer", { state: "failed" })], error: "fixer failed" });
    const success = attempt({ attempt: 2, startedAt: "2026-08-27T12:02:00Z", finishedAt: "2026-08-27T12:02:30Z", steps: [] });
    expect(boundaryViewSummary(view({ attempts: [failed, success] }))).toEqual({ attempts: 2, lastOutcome: "success", failedStepLabel: null, error: null, durationTotal: "1m 30s" });
    expect(boundaryViewSummary(view({ attempts: [failed] }))).toEqual({ attempts: 1, lastOutcome: "error", failedStepLabel: "Report build fixer", error: "fixer failed", durationTotal: "1m 0s" });
  });
});
