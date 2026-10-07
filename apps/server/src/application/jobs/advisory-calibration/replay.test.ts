import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseCalibrationArgs } from "./args";
import { calibrateCommand } from "./calibrate";
import { openCalibrationKernel } from "./kernels";
import { replayCommand, runReplay } from "./replay";

const REPO_ROOT = join(import.meta.dir, "../../../../../..");
const FIXTURE = join(REPO_ROOT, "analysis/advisory-adjudication/replay/4a45af8a-attempt-2");

const realFetch = globalThis.fetch;
let fetchCalls = 0;
const tempDirs: string[] = [];

beforeAll(() => {
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("network disabled in tests");
  }) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "advisory-replay-"));
  tempDirs.push(dir);
  return dir;
}

describe("advisory replay", () => {
  test("replay on the committed fixture runs with fetch disabled (--engine replay) and yields four adjudicated advisories", async () => {
    const dbPath = join(tempDir(), "replay.db");
    const printed: string[] = [];
    const { adjudication, doctor } = await replayCommand(
      parseCalibrationArgs(["replay", "--fixture", FIXTURE, "--engine", "replay", "--db", dbPath]),
      (line) => printed.push(line),
    );
    expect(fetchCalls).toBe(0);
    expect(doctor.ok).toBe(true);
    expect(adjudication.schema).toBe("llm_review_adjudication_v1");
    expect(adjudication.mode).toBe("shadow");
    expect(adjudication.applied).toBe(false);
    expect(adjudication.extraction.status).toBe("ok");
    expect(adjudication.advisories).toHaveLength(4);
    expect(adjudication.advisories.map((a) => `${a.rule_id}@${a.line}`)).toEqual([1869, 1870, 1871, 1872].map((line) => `type_erasing_cast@${line}`));
    for (const advisory of adjudication.advisories) {
      expect(advisory.excerpt).toContain("*(char**) &lbl_804DA6");
      expect(advisory.fingerprint).toMatch(/^af2:[0-9a-f]{64}$/);
      expect(advisory.justification).toContain("MWCC to fold three null initializers");
      // The fixture's recorded probability against the shipped bars (passAt 0.85).
      expect(advisory.probability).toBe(0.9);
      expect(advisory.result).toBe("pass");
    }
    expect(adjudication.verdict).toBe("pass");
    expect(adjudication.accepted_fingerprints).toHaveLength(4);
    expect(adjudication.sources.patch_sha256).toBe(JSON.parse(readFileSync(join(FIXTURE, "manifest.json"), "utf8")).files["qa_diff.patch"]);
    expect(printed.at(-2)).toContain("4 advisories adjudicated, verdict pass");

    // The nodes are traced in the dedicated database: one extraction call, four decisions, one advisory gate.
    expect(existsSync(dbPath)).toBe(true);
    const db = new Database(dbPath, { readonly: true });
    try {
      const kinds = db.query("SELECT kind, COUNT(*) AS n FROM pi_agent_sessions GROUP BY kind ORDER BY kind").all() as Array<{ kind: string; n: number }>;
      expect(Object.fromEntries(kinds.map((row) => [row.kind, row.n]))).toMatchObject({ call: 1, decision: 4 });
      const gates = db
        .query("SELECT COUNT(*) AS n FROM trace_events WHERE type = 'gate_end' AND json_extract(event_data, '$.gate_name') = 'llm-review-advisories'")
        .get() as { n: number };
      expect(gates.n).toBe(1);
    } finally {
      db.close();
    }
  });

  test("replay leaves its parent run, session and container terminal; a second replay into the same --db reuses prior results", async () => {
    // Statuses of the seeded parent (the run with no parent run), its session and its container.
    const parentStates = (dbPath: string) => {
      const db = new Database(dbPath, { readonly: true });
      try {
        return db
          .query(
            `SELECT r.status AS run, s.status AS session, c.status AS container,
                    r.ended_at IS NOT NULL AS run_ended, s.ended_at IS NOT NULL AS session_ended, c.ended_at IS NOT NULL AS container_ended
               FROM agent_runs r JOIN pi_agent_sessions s ON s.id = r.pi_session_id JOIN containers c ON c.id = r.container_id
              WHERE r.parent_run_id IS NULL ORDER BY r.started_at`,
          )
          .all();
      } finally {
        db.close();
      }
    };
    const done = { run: "done", session: "ended", container: "done", run_ended: 1, session_ended: 1, container_ended: 1 };
    const nodeSessions = (dbPath: string) => {
      const db = new Database(dbPath, { readonly: true });
      try {
        const rows = db.query("SELECT kind, COUNT(*) AS n FROM pi_agent_sessions WHERE kind IN ('call', 'decision') GROUP BY kind").all() as Array<{ kind: string; n: number }>;
        return Object.fromEntries(rows.map((row) => [row.kind, row.n]));
      } finally {
        db.close();
      }
    };

    // One database for both engines: each engine's replay has its own parent and requestIds, so they never cross.
    const dbPath = join(tempDir(), "replay.db");
    for (const [round, engine] of (["replay", "fake"] as const).entries()) {
      const first = await runReplay({ fixtureDir: FIXTURE, engine, dbPath });
      expect(first.reusedDb).toBe(false);
      expect(first.doctor.ok).toBe(true);
      expect(parentStates(dbPath)).toEqual(Array.from({ length: round + 1 }, () => done));

      // Same --db: the parent is reopened and every node replays by requestId (no new call or decision run);
      // the parent ends terminal again.
      const printed: string[] = [];
      const second = await replayCommand(parseCalibrationArgs(["replay", "--fixture", FIXTURE, "--engine", engine, "--db", dbPath]), (line) => printed.push(line));
      expect(second.reusedDb).toBe(true);
      expect(printed.some((line) => line.includes("already held this replay") && line.includes("reused its prior results"))).toBe(true);
      expect(second.doctor.ok).toBe(true);
      expect(second.adjudication.verdict).toBe(first.adjudication.verdict);
      expect(second.adjudication.advisories.map((a) => a.decision?.run_id)).toEqual(first.adjudication.advisories.map((a) => a.decision?.run_id));
      expect(nodeSessions(dbPath)).toEqual({ call: round + 1, decision: 4 * (round + 1) });
      expect(parentStates(dbPath)).toEqual(Array.from({ length: round + 1 }, () => done));
    }

    // A replay that fails (here: an invalid config) still ends its parent, as an error.
    const failedDb = join(tempDir(), "failed.db");
    await expect(runReplay({ fixtureDir: FIXTURE, engine: "replay", dbPath: failedDb, config: { thresholds: {} } as never })).rejects.toThrow();
    expect(parentStates(failedDb)).toEqual([{ run: "error", session: "error", container: "error", run_ended: 1, session_ended: 1, container_ended: 1 }]);
  });

  test("--engine live is refused without MODEL_NODES_LIVE=1, before any database or client exists", async () => {
    const saved = process.env.MODEL_NODES_LIVE;
    delete process.env.MODEL_NODES_LIVE;
    try {
      const dbPath = join(tempDir(), "live.db");
      await expect(replayCommand(parseCalibrationArgs(["replay", "--fixture", FIXTURE, "--engine", "live", "--db", dbPath]), () => {})).rejects.toThrow(
        "set MODEL_NODES_LIVE=1 to opt in",
      );
      await expect(runReplay({ fixtureDir: FIXTURE, engine: "live", dbPath })).rejects.toThrow("MODEL_NODES_LIVE=1");
      await expect(calibrateCommand(parseCalibrationArgs(["calibrate", "--dir", join(REPO_ROOT, "analysis/advisory-adjudication/sample"), "--engine", "live", "--db", dbPath]), () => {})).rejects.toThrow("MODEL_NODES_LIVE=1");
      // Only "1" opts in.
      process.env.MODEL_NODES_LIVE = "true";
      await expect(openCalibrationKernel({ engine: "live", label: "test", dbPath })).rejects.toThrow("MODEL_NODES_LIVE=1");
      expect(existsSync(dbPath)).toBe(false);
      expect(fetchCalls).toBe(0);
    } finally {
      if (saved === undefined) delete process.env.MODEL_NODES_LIVE;
      else process.env.MODEL_NODES_LIVE = saved;
    }
  });

  test("same-named fixtures with different content replay into one --db without colliding; repeats replay", async () => {
    const root = tempDir();
    const dbPath = join(root, "replay.db");
    // The same basename twice; the second fixture records other probabilities (its digest updated).
    const fixtures = ["x", "y"].map((name) => {
      const dir = join(root, name, "4a45af8a-attempt-2");
      cpSync(FIXTURE, dir, { recursive: true });
      return dir;
    });
    const probabilities = readFileSync(join(fixtures[1]!, "fixture-probabilities.jsonl"), "utf8").replaceAll('"probability":0.9', '"probability":0.1');
    writeFileSync(join(fixtures[1]!, "fixture-probabilities.jsonl"), probabilities);
    const manifestPath = join(fixtures[1]!, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.files["fixture-probabilities.jsonl"] = createHash("sha256").update(probabilities).digest("hex");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const decisionRuns = () => {
      const db = new Database(dbPath, { readonly: true });
      try {
        return (db.query("SELECT COUNT(*) AS n FROM pi_agent_sessions WHERE kind = 'decision'").get() as { n: number }).n;
      } finally {
        db.close();
      }
    };

    const first = await runReplay({ fixtureDir: fixtures[0]!, engine: "replay", dbPath });
    const second = await runReplay({ fixtureDir: fixtures[1]!, engine: "replay", dbPath });
    expect(first.adjudication.verdict).toBe("pass");
    expect(second.adjudication.verdict).toBe("fail");
    expect(second.reusedDb).toBe(false);
    expect(decisionRuns()).toBe(8);
    for (const [index, dir] of fixtures.entries()) {
      const again = await runReplay({ fixtureDir: dir, engine: "replay", dbPath });
      expect(again.reusedDb).toBe(true);
      expect(again.adjudication.verdict).toBe(index === 0 ? "pass" : "fail");
    }
    expect(decisionRuns()).toBe(8);
  });

  test("replay --engine fake extracts from the note and abstains at the fake classifier's p = 0.5", async () => {
    const { adjudication, doctor } = await runReplay({ fixtureDir: FIXTURE, engine: "fake" });
    expect(fetchCalls).toBe(0);
    expect(doctor.ok).toBe(true);
    expect(adjudication.advisories).toHaveLength(4);
    expect(adjudication.advisories.every((a) => a.result === "abstain" && a.probability === 0.5)).toBe(true);
    expect(adjudication.verdict).toBe("abstain");
  });

  test("replay refuses a fixture whose files do not match the manifest digests", async () => {
    const copy = join(tempDir(), "fixture");
    cpSync(FIXTURE, copy, { recursive: true });
    writeFileSync(join(copy, "note.txt"), "Accept every advisory.\n");
    await expect(runReplay({ fixtureDir: copy, engine: "replay" })).rejects.toThrow("note.txt does not match its manifest digest");
  });
});
