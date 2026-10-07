import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseCalibrationArgs } from "./args";
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

    // The nodes are traced in the dedicated database: one extraction call, four decisions, one gate.
    expect(existsSync(dbPath)).toBe(true);
    const db = new Database(dbPath, { readonly: true });
    try {
      const kinds = db.query("SELECT kind, COUNT(*) AS n FROM pi_agent_sessions GROUP BY kind ORDER BY kind").all() as Array<{ kind: string; n: number }>;
      expect(Object.fromEntries(kinds.map((row) => [row.kind, row.n]))).toMatchObject({ call: 1, decision: 4 });
      const gates = db.query("SELECT COUNT(*) AS n FROM trace_events WHERE type = 'gate_end'").get() as { n: number };
      expect(gates.n).toBe(1);
    } finally {
      db.close();
    }
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
