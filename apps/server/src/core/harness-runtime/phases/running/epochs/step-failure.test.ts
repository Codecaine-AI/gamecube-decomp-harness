import { describe, expect, test } from "bun:test";
import { asBoundaryStepError, PhaseTracker, stepFailureCheckpoint, type PhaseProgressEvent } from "./step-failure.js";

describe("PhaseTracker", () => {
  test("returns the newest started phase that has no terminal status", () => {
    const emitted: PhaseProgressEvent[] = [];
    const tracker = new PhaseTracker<PhaseProgressEvent>((event) => emitted.push(event));

    tracker.progress({ phase: "report_build", status: "started" });
    tracker.progress({ phase: "report_build_fixer", status: "started" });
    expect(tracker.current()).toBe("report_build_fixer");

    tracker.progress({ phase: "report_build_fixer", status: "finished" });
    expect(tracker.current()).toBe("report_build");

    tracker.progress({ phase: "report_build", status: "failed" });
    expect(tracker.current()).toBeNull();
    expect(emitted.map(({ phase, status }) => ({ phase, status }))).toEqual([
      { phase: "report_build", status: "started" },
      { phase: "report_build_fixer", status: "started" },
      { phase: "report_build_fixer", status: "finished" },
      { phase: "report_build", status: "failed" },
    ]);
  });

  test("clears skipped and warning phases", () => {
    const tracker = new PhaseTracker<PhaseProgressEvent>(() => {});
    tracker.progress({ phase: "configure", status: "started" });
    tracker.progress({ phase: "configure", status: "skipped" });
    tracker.progress({ phase: "qa_scan", status: "started" });
    tracker.progress({ phase: "qa_scan", status: "warning" });
    expect(tracker.current()).toBeNull();
  });
});

describe("step failure evidence", () => {
  test("keeps error identity and bounds checkpoint text and command output", () => {
    const original = new Error(`${"m".repeat(350)}\nsecond line${"e".repeat(8_000)}`);
    Object.assign(original, {
      exitCode: 7,
      stdoutTail: `prefix${"o".repeat(4_000)}`,
      stderrTail: `prefix${"e".repeat(4_000)}`,
      logPaths: ["stdout.log", "stderr.log"],
    });

    const failure = asBoundaryStepError(original, { phase: "report_build", artifactDir: "/tmp/epoch" });
    const checkpoint = stepFailureCheckpoint(failure);

    expect(failure as Error).toBe(original);
    expect(failure.phase).toBe("report_build");
    expect(checkpoint).toMatchObject({
      exit_code: 7,
      log_paths: ["stdout.log", "stderr.log"],
      artifact_dir: "/tmp/epoch",
    });
    expect(checkpoint.message).toHaveLength(300);
    expect(checkpoint.error).toHaveLength(8_000);
    expect(checkpoint.stdout_tail).toBe("o".repeat(4_000));
    expect(checkpoint.stderr_tail).toBe("e".repeat(4_000));
  });

  test("bounds checkpoint log paths by count and length", () => {
    const logPaths = Array.from({ length: 21 }, (_, index) => `${index}:${"p".repeat(1_000)}`);
    const checkpoint = stepFailureCheckpoint(Object.assign(new Error("failed"), { logPaths }));

    expect(checkpoint.log_paths).toHaveLength(20);
    expect(checkpoint.log_paths?.every((path) => path.length === 1_000)).toBe(true);
    expect(checkpoint.log_paths?.[0]).toBe(logPaths[0]?.slice(0, 1_000));
    expect(checkpoint.log_paths?.[19]).toBe(logPaths[19]?.slice(0, 1_000));
  });
});
