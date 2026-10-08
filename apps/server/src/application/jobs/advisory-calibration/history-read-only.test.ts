import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseCalibrationArgs } from "./args.js";
import { buildDatasetCommand } from "./build-dataset.js";
import { createHistoryTree, expectUntouched, fileManifest, FIXTURE_CASES, type HistoryTree } from "./__fixtures__/history-tree.js";
import { freezeReplayCommand } from "./freeze-replay.js";
import { shadowExportCommand } from "./shadow-export.js";
import { openSqliteReadOnly } from "./source-root.js";
import { calibrationPaths, readJson, readJsonl } from "./store.js";
import type { CalibrationItem } from "./types.js";

const realFetch = globalThis.fetch;
const cleanups: Array<() => void> = [];

beforeAll(() => {
  globalThis.fetch = (() => {
    throw new Error("network disabled in advisory-calibration tests");
  }) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function tree(opts: Parameters<typeof createHistoryTree>[0] = {}): HistoryTree {
  const created = createHistoryTree(opts);
  cleanups.push(created.cleanup);
  return created;
}

function outDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "advisory-calibration-out-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const quiet = () => {};

function freezeArgs(root: string, out: string): string[] {
  const { runId, workerStateId, attempt } = FIXTURE_CASES.casts;
  return ["freeze-replay", "--source-root", root, "--run", runId, "--worker-state", workerStateId, "--attempt", String(attempt), "--out", out];
}

async function runHistoryCommands(root: string, dir: string): Promise<void> {
  await buildDatasetCommand(parseCalibrationArgs(["build-dataset", "--source-root", root, "--dir", dir]), quiet);
  await shadowExportCommand(parseCalibrationArgs(["shadow-export", "--source-root", root, "--dir", dir]), quiet);
  await freezeReplayCommand(parseCalibrationArgs(freezeArgs(root, join(dir, "replay"))), quiet);
}

function sidecars(dbPath: string): string[] {
  return ["-wal", "-shm", "-journal"].filter((suffix) => existsSync(`${dbPath}${suffix}`));
}

function expectInsertRejected(dbPath: string): void {
  const store = openSqliteReadOnly(dbPath);
  try {
    expect(() =>
      store.db.run("INSERT INTO worker_state (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_id, target_key, lifecycle_status, started_at) VALUES ('x', 'r', 'e', 'et', 'c', 'w', 't', 's', 'now')"),
    ).toThrow(/readonly/);
  } finally {
    store.close();
  }
}

describe("advisory-calibration read-only history", () => {
  test("history commands never write under --source-root", async () => {
    const history = tree();
    const dir = outDir();
    const sidecarsBefore = sidecars(history.paths.orchestratorDb);
    // The checkpointed WAL is empty, so the store is opened immutable in place.
    expect(statSync(`${history.paths.orchestratorDb}-wal`).size).toBe(0);

    await expectUntouched(history.root, () => runHistoryCommands(history.root, dir));
    expect(sidecars(history.paths.orchestratorDb)).toEqual(sidecarsBefore);
    expect(readJsonl<CalibrationItem>(calibrationPaths(dir).candidates)).toHaveLength(12);
    await expectUntouched(history.root, () => expectInsertRejected(history.paths.orchestratorDb));

    // Output inside the source root is refused before anything is read or written.
    await expectUntouched(history.root, async () => {
      const inside = join(history.root, "analysis", "advisory-adjudication");
      await expect(
        buildDatasetCommand(parseCalibrationArgs(["build-dataset", "--source-root", history.root, "--dir", inside]), quiet),
      ).rejects.toThrow(/inside --source-root/);
      await expect(
        shadowExportCommand(parseCalibrationArgs(["shadow-export", "--source-root", history.root, "--dir", inside]), quiet),
      ).rejects.toThrow(/inside --source-root/);
      await expect(freezeReplayCommand(parseCalibrationArgs(freezeArgs(history.root, join(inside, "replay"))), quiet)).rejects.toThrow(
        /inside --source-root/,
      );
    });

    // A store with an unflushed WAL is read from a snapshot: every row (all still in the WAL) is seen, the source is untouched.
    const unflushed = tree({ unflushedWal: true });
    const walSize = statSync(`${unflushed.paths.orchestratorDb}-wal`).size;
    expect(walSize).toBeGreaterThan(0);
    expect(sidecars(unflushed.paths.orchestratorDb)).toEqual(["-wal"]);
    const before = fileManifest(unflushed.root);
    const snapshotDir = outDir();
    await expectUntouched(unflushed.root, async () => {
      const store = openSqliteReadOnly(unflushed.paths.orchestratorDb);
      try {
        expect(store.db.query<{ n: number }, []>("SELECT count(*) AS n FROM worker_checkpoints").get()!.n).toBe(6);
        expect(
          store.db.query<{ target_key: string }, [string]>("SELECT target_key FROM worker_state WHERE id = ?").get(FIXTURE_CASES.casts.workerStateId)!.target_key,
        ).toBe(FIXTURE_CASES.casts.targetKey);
      } finally {
        store.close();
      }
      await runHistoryCommands(unflushed.root, snapshotDir);
      expectInsertRejected(unflushed.paths.orchestratorDb);
    });
    expect(fileManifest(unflushed.root)).toEqual(before);
    expect(sidecars(unflushed.paths.orchestratorDb)).toEqual(["-wal"]);
    expect(readJson<{ counts: { items: number; checkpoints_matched: number } }>(calibrationPaths(snapshotDir).manifest)!.counts).toMatchObject({
      items: 8,
      checkpoints_matched: 4,
    });
    expect(readJsonl<CalibrationItem>(calibrationPaths(snapshotDir).candidates)).toHaveLength(12);
  });

  test("symlinks never carry output into the history, in either direction", async () => {
    const history = tree();
    const outside = outDir();
    const refused = /inside --source-root/;
    const build = (root: string, dir: string) => buildDatasetCommand(parseCalibrationArgs(["build-dataset", "--source-root", root, "--dir", dir]), quiet);
    const shadow = (root: string, dir: string) => shadowExportCommand(parseCalibrationArgs(["shadow-export", "--source-root", root, "--dir", dir]), quiet);
    const freeze = (root: string, out: string) => freezeReplayCommand(parseCalibrationArgs(freezeArgs(root, out)), quiet);

    // An output directory outside the history that links into it.
    const linkedDir = join(outside, "linked-dir");
    symlinkSync(history.paths.stateDir, linkedDir);
    // A dangling link whose target would be created inside the history.
    const dangling = join(outside, "dangling");
    symlinkSync(join(history.paths.stateDir, "not-yet"), dangling);
    // An existing output file that links to a history file.
    const fileDir = join(outside, "files");
    mkdirSync(fileDir);
    symlinkSync(history.paths.summary, join(fileDir, "candidates.jsonl"));
    const fixtureDir = join(outside, "fixture");
    mkdirSync(fixtureDir);
    symlinkSync(history.paths.note, join(fixtureDir, "note.txt"));
    // The source root reached through a link, and an output path through the same link.
    const rootLink = join(outside, "root-link");
    symlinkSync(history.root, rootLink);

    await expectUntouched(history.root, async () => {
      for (const dir of [linkedDir, dangling, fileDir, join(rootLink, "analysis")]) {
        await expect(build(history.root, dir)).rejects.toThrow(refused);
        await expect(shadow(history.root, dir)).rejects.toThrow(refused);
      }
      await expect(freeze(history.root, join(linkedDir, "fixture"))).rejects.toThrow(refused);
      await expect(freeze(history.root, fixtureDir)).rejects.toThrow(refused);
      // A linked --source-root with an output lexically inside the real root.
      await expect(build(rootLink, join(history.root, "analysis"))).rejects.toThrow(refused);
      await expect(freeze(rootLink, join(history.root, "fixture"))).rejects.toThrow(refused);
    });
    // A plain outside directory still works through a linked source root.
    await build(rootLink, join(outside, "plain"));
    expect(readJsonl<CalibrationItem>(calibrationPaths(join(outside, "plain")).candidates)).toHaveLength(8);
  });
});
