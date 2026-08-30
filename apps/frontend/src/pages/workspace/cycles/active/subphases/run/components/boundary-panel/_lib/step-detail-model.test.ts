import { describe, expect, test } from "bun:test";
import type {
  BoundaryStepDetail,
  BoundaryStepDetailArtifact,
  BoundaryStepDetailEvent,
} from "@/lib/boundary-step-detail-types";
import { artifactPreview, detailSections, eventSummary, formatBytes } from "./step-detail-model";

function event(changes: Partial<BoundaryStepDetailEvent> = {}): BoundaryStepDetailEvent {
  return { id: "event-1", event_type: "step.updated", created_at: "not-a-date", payload: {}, ...changes };
}

function artifact(changes: Partial<BoundaryStepDetailArtifact> = {}): BoundaryStepDetailArtifact {
  return { name: "report.txt", sizeBytes: 1536, text: "full report", truncated: false, ...changes };
}

function detail(changes: Partial<BoundaryStepDetail> = {}): BoundaryStepDetail {
  return {
    runId: "run-1",
    epochId: "epoch-2",
    ordinal: 2,
    attempt: 1,
    step: "report_build",
    window: { from: null, to: null },
    stepWindow: { from: null, to: null },
    events: [],
    error: null,
    artifactDir: null,
    artifacts: [],
    stderrLog: null,
    ...changes,
  };
}

describe("step detail model", () => {
  test("formats byte counts with compact binary units", () => {
    expect([formatBytes(0), formatBytes(1024), formatBytes(1536), formatBytes(2 * 1024 * 1024)]).toEqual([
      "0 B", "1 KB", "1.5 KB", "2 MB",
    ]);
  });

  test("summarizes event status and the first message line", () => {
    expect(eventSummary(event({ payload: { status: "failed", message: "compiler failed\nfull diagnostic" } }))).toBe(
      "not-a-date · step.updated · failed · compiler failed",
    );
    expect(eventSummary(event({ payload: { status: 3, message: null } }))).toBe("not-a-date · step.updated");
  });

  test("builds artifact labels and preserves preview text", () => {
    expect(artifactPreview(artifact({ truncated: true }))).toEqual({
      label: "report.txt · 1.5 KB · (truncated)",
      text: "full report",
    });
    expect(artifactPreview(artifact({ text: null }))).toMatchObject({ text: null });
  });

  test("derives visible section metadata", () => {
    expect(detailSections(detail({
      error: "failed",
      events: [event(), event({ id: "event-2" })],
      artifacts: [artifact()],
      stderrLog: { path: "run.log", from: "a", to: "b", lines: ["one", "two"], truncated: true },
    }))).toEqual({ hasError: true, eventCount: 2, artifactCount: 1, logLineCount: 2, truncatedLog: true });
    expect(detailSections(detail())).toEqual({ hasError: false, eventCount: 0, artifactCount: 0, logLineCount: 0, truncatedLog: false });
  });
});
