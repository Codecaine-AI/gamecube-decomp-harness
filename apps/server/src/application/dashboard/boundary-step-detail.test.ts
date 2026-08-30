import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildBoundaryStepDetail, type BoundaryDetailFs } from "./boundary-step-detail";
import type { BoundaryEpochRow, BoundaryEventRow, BoundaryView } from "./boundary-view";

const start = "2026-08-28T18:42:40.000Z";
const finish = "2026-08-28T18:42:50.000Z";
const epochRow: BoundaryEpochRow = { id: "epoch-1", ordinal: 7, status: "active", admitted_count: 1, finished_count: 1, boundary_status: null, boundary_attempt_count: 1, boundary_next_attempt_at: null, created_at: start, closed_at: "2026-08-28T18:43:00.000Z" };

function view(error: string | null = null): BoundaryView {
  return {
    epochId: "epoch-1", ordinal: 7, epochStatus: "active", boundaryStatus: null, admittedCount: 1, finishedCount: 1, active: true,
    attempts: [{ attempt: 1, reconciled: false, startedAt: start, finishedAt: null, error: null, failedStep: null, artifactDir: null,
      steps: [{ key: "boundary_sync", state: "failed", startedAt: "2026-08-28T18:42:41.000Z", finishedAt: finish, durationMs: 9_000, detail: null, error, payload: null }],
    }], error: null, retry: null, savePointId: null, matchedCodePercent: null, nextEpoch: null,
  };
}

function event(id: string, event_type: string, payload: Record<string, unknown>, seconds = 42): BoundaryEventRow {
  return { id, event_type, payload_json: JSON.stringify(payload), created_at: `2026-08-28T18:42:${String(seconds).padStart(2, "0")}.000Z` };
}

function memoryFs(files: Record<string, string>, dirs: Record<string, Array<{ name: string; sizeBytes: number; isDirectory?: boolean; isSymbolicLink?: boolean }>> = {}): BoundaryDetailFs {
  return {
    readBytes(path, offset, length) {
      const text = files[path];
      return text === undefined ? null : Buffer.from(text).subarray(offset, offset + length);
    },
    realpath: (path) => path,
    list: (dir) => dirs[dir] ?? [],
  };
}

function build(overrides: Partial<Parameters<typeof buildBoundaryStepDetail>[0]> = {}) {
  return buildBoundaryStepDetail({ runId: "run-1", view: view(), epochRow, events: [], attempt: 1, step: "boundary_sync", stateDir: "/state", now: "2026-08-28T18:44:00.000Z", fs: memoryFs({}), ...overrides });
}

describe("buildBoundaryStepDetail", () => {
  test("filters phase, gate, and always-included failure events", () => {
    const detail = build({ events: [
      event("phase", "epoch_checkpoint_progress", { phase: "boundary_sync" }),
      event("other-phase", "epoch_checkpoint_progress", { phase: "configure" }),
      event("gate", "boundary_sync", {}),
      event("other-gate", "ci_parity_gate", {}),
      event("error", "epoch_cycle_error", { error: "boom" }),
      event("retry", "epoch_boundary_retry_scheduled", {}),
    ] })!;
    expect(detail.events.map((item) => item.id)).toEqual(["phase", "gate", "error", "retry"]);
  });

  test("keeps the newest 200 events in ascending order", () => {
    const events = Array.from({ length: 205 }, (_, index) => ({ id: String(index), event_type: "boundary_sync", payload_json: "{}", created_at: `2026-08-28T18:42:42.${String(index).padStart(3, "0")}Z` }));
    const detail = build({ events })!;
    expect(detail.events).toHaveLength(200);
    expect(detail.events[0]!.id).toBe("5");
    expect(detail.events.at(-1)!.id).toBe("204");
  });

  test("prefers the projection error over the latest cycle error", () => {
    expect(build({ view: view("full projection error"), events: [event("error", "epoch_cycle_error", { error: "event error" })] })!.error).toBe("full projection error");
    expect(build({ events: [event("one", "epoch_cycle_error", { error: "old" }), event("two", "epoch_cycle_error", { error: "new" }, 43)] })!.error).toBe("new");
  });

  test("uses payload artifact_dir before a timestamp directory", () => {
    const dirs = { "/state/epochs/payload": [{ name: "result.json", sizeBytes: 2 }], "/state/epochs": [{ name: "2026-08-28T18-42-45-000Z", sizeBytes: 0, isDirectory: true }] };
    const detail = build({ events: [event("gate", "boundary_sync", { artifact_dir: "/state/epochs/payload" })], fs: memoryFs({ "/state/epochs/payload/result.json": "{}" }, dirs) })!;
    expect(detail.artifactDir).toBe("/state/epochs/payload");
    expect(detail.artifacts[0]).toMatchObject({ name: "result.json", text: "{}" });
  });

  test("rejects a payload artifact_dir outside the real epochs directory without reading it", () => {
    const listed: string[] = [];
    const read: string[] = [];
    const fs = memoryFs({ "/outside/secret.txt": "secret" }, { "/outside": [{ name: "secret.txt", sizeBytes: 6 }] });
    fs.readBytes = (path) => {
      read.push(path);
      return null;
    };
    fs.list = (dir) => {
      listed.push(dir);
      return dir === "/outside" ? [{ name: "secret.txt", sizeBytes: 6 }] : [];
    };
    const detail = build({ events: [event("gate", "boundary_sync", { artifact_dir: "/outside" })], fs })!;
    expect(detail.artifactDir).toBeNull();
    expect(detail.artifacts).toEqual([]);
    expect(listed).not.toContain("/outside");
    expect(read).toEqual([]);
  });

  test("chooses newest timestamp artifact directory inside the attempt window", () => {
    const dirs = { "/state/epochs": [
      { name: "2026-08-28T18-42-41-535Z", sizeBytes: 0, isDirectory: true },
      { name: "2026-08-28T18-42-59-000Z", sizeBytes: 0, isDirectory: true },
      { name: "2026-08-28T18-44-00-000Z", sizeBytes: 0, isDirectory: true },
    ] };
    expect(build({ fs: memoryFs({}, dirs) })!.artifactDir).toBe("/state/epochs/2026-08-28T18-42-59-000Z");
  });

  test("reads eligible artifacts to 64 KB and marks truncation", () => {
    const large = "x".repeat(70 * 1024);
    const dirs = { "/state/epochs/artifacts": [{ name: "full.log", sizeBytes: 70 * 1024 }, { name: "binary.bin", sizeBytes: 3 }] };
    const detail = build({ events: [event("gate", "boundary_sync", { artifact_dir: "/state/epochs/artifacts" })], fs: memoryFs({ "/state/epochs/artifacts/full.log": large, "/state/epochs/artifacts/binary.bin": "abc" }, dirs) })!;
    expect(detail.artifacts[0]).toMatchObject({ name: "binary.bin", text: null, truncated: false });
    expect(detail.artifacts[1]!.text).toHaveLength(64 * 1024);
    expect(detail.artifacts[1]!.truncated).toBe(true);
  });

  test("bounds artifact reads and skips symlinks during traversal", () => {
    const artifactDir = "/state/epochs/artifacts";
    const requested: Array<{ path: string; offset: number; length: number }> = [];
    const fs = memoryFs({}, {
      [artifactDir]: [
        { name: "changed.log", sizeBytes: 1 },
        { name: "linked.log", sizeBytes: 1, isSymbolicLink: true },
        { name: "linked-dir", sizeBytes: 0, isDirectory: true, isSymbolicLink: true },
      ],
    });
    fs.readBytes = (path, offset, length) => {
      requested.push({ path, offset, length });
      return Buffer.from("x".repeat(70 * 1024)).subarray(offset, offset + length);
    };
    const detail = build({ events: [event("gate", "boundary_sync", { artifact_dir: artifactDir })], fs })!;
    expect(detail.artifacts).toHaveLength(1);
    expect(detail.artifacts[0]).toMatchObject({ name: "changed.log", truncated: true });
    expect(requested).toEqual([{ path: `${artifactDir}/changed.log`, offset: 0, length: 64 * 1024 + 1 }]);
  });

  test("slices timestamped stderr to the step window", () => {
    const path = join("/state", "ui-processes", "melee-live.stderr.log");
    const text = ["2026-08-28T18:42:40.000Z before", "2026-08-28T18:42:42.000Z inside", "2026-08-28T18:42:51.000Z after"].join("\n");
    const fs = memoryFs({ [path]: text }, { "/state/ui-processes": [{ name: "melee-live.stderr.log", sizeBytes: text.length }] });
    expect(build({ fs })!.stderrLog!.lines).toEqual(["2026-08-28T18:42:42.000Z inside"]);
  });

  test("slices untimestamped stderr from step start to the next phase", () => {
    const path = "/state/ui-processes/melee-live.stderr.log";
    const text = ["old", "[epoch] boundary_sync started", "detail", "[epoch] configure started", "new"].join("\n");
    const fs = memoryFs({ [path]: text }, { "/state/ui-processes": [{ name: "melee-live.stderr.log", sizeBytes: text.length }] });
    expect(build({ fs })!.stderrLog!.lines).toEqual(["[epoch] boundary_sync started", "detail"]);
  });

  test("reads only the final 2 MB before applying stderr window heuristics", () => {
    const path = "/state/ui-processes/melee-live.stderr.log";
    const text = `${"x".repeat(2 * 1024 * 1024 + 256)}\n2026-08-28T18:42:42.000Z inside`;
    const bytes = Buffer.from(text);
    const requested: Array<{ path: string; offset: number; length: number }> = [];
    const fs = memoryFs({}, { "/state/ui-processes": [{ name: "melee-live.stderr.log", sizeBytes: bytes.length }] });
    fs.readBytes = (readPath, offset, length) => {
      requested.push({ path: readPath, offset, length });
      return bytes.subarray(offset, offset + length);
    };
    const detail = build({ fs })!;
    expect(requested).toEqual([{ path, offset: bytes.length - 2 * 1024 * 1024, length: 2 * 1024 * 1024 }]);
    expect(detail.stderrLog!.lines).toEqual(["2026-08-28T18:42:42.000Z inside"]);
    expect(detail.stderrLog!.truncated).toBe(true);
  });

  test("returns null for missing attempt or step", () => {
    expect(build({ attempt: 2 })).toBeNull();
    expect(build({ step: "not_a_step" })).toBeNull();
    expect(build({ step: "configure" })).toBeNull();
  });
});
