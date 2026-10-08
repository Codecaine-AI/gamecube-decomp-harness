import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";

import { createHistoryTree, expectUntouched, FIXTURE_TOKEN, type HistoryTree } from "./__fixtures__/history-tree";
import { parseCalibrationArgs } from "./args";
import { freezeReplayCommand, MAX_FIXTURE_FILE_BYTES, REPLAY_FIXTURE_FILES, trimPatchToFindings, type ReplayFixtureManifest } from "./freeze-replay";
import { runReplay } from "./replay";
import { createSanitizer } from "./sanitize";
import { LEGACY_HARNESS_ROOT } from "./source-root";

const realFetch = globalThis.fetch;
const cleanups: Array<() => void> = [];

beforeAll(() => {
  globalThis.fetch = (async () => {
    throw new Error("network disabled in tests");
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
  const dir = mkdtempSync(join(tmpdir(), "advisory-freeze-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "fixture");
}

async function freeze(history: HistoryTree, out: string): Promise<ReplayFixtureManifest> {
  return freezeReplayCommand(
    parseCalibrationArgs([
      "freeze-replay",
      "--source-root",
      history.root,
      "--run",
      history.runId,
      "--worker-state",
      history.workerStateId,
      "--attempt",
      String(history.attempt),
      "--out",
      out,
    ]),
    () => {},
  );
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

function finding(file: string, line: number): QaScanFinding {
  return { rule_id: "type_erasing_cast", severity: "warning", file, line, excerpt: "x", message: "m", standard_id: null, detail: { llm_review: true } };
}

function hunk(start: number, body: string[]): string[] {
  const added = body.filter((line) => line.startsWith("+")).length;
  const removed = body.filter((line) => line.startsWith("-")).length;
  const context = body.length - added - removed;
  return [`@@ -${start},${context + removed} +${start},${context + added} @@`, ...body];
}

describe("freeze-replay", () => {
  test("freeze-replay sanitizes paths and token-like strings and records digests", async () => {
    const history = tree();
    const out = outDir();
    let manifest!: ReplayFixtureManifest;
    await expectUntouched(history.root, async () => {
      manifest = await freeze(history, out);
    });
    expect(history.noteText).toContain(LEGACY_HARNESS_ROOT);
    expect(history.noteText).toContain(FIXTURE_TOKEN);

    // Every file is recorded with its digest, and nothing absolute or secret survives anywhere.
    expect(readdirSync(out).sort()).toEqual([...REPLAY_FIXTURE_FILES, "manifest.json"].sort());
    for (const name of REPLAY_FIXTURE_FILES) expect(manifest.files[name]).toBe(sha256(readFileSync(join(out, name), "utf8")));
    for (const name of readdirSync(out)) {
      const text = readFileSync(join(out, name), "utf8");
      for (const forbidden of [history.root, LEGACY_HARNESS_ROOT.replace(/\/$/, ""), FIXTURE_TOKEN, homedir()]) expect(text).not.toContain(forbidden);
    }
    const note = readFileSync(join(out, "note.txt"), "utf8");
    expect(note).toContain("<source-root>/games/melee/");
    expect(note).toContain("<redacted:token>");
    expect(note).toContain("review_justification");

    // Source ids and digests of the sources as read (before sanitizing).
    expect(manifest.source).toEqual({
      game: "melee",
      run_id: history.runId,
      worker_state_id: history.workerStateId,
      attempt: history.attempt,
      checkpoint_id: history.checkpointId,
      target_key: history.targetKey,
    });
    expect(manifest.sources.summary!.sha256).toBe(sha256(readFileSync(history.paths.summary, "utf8")));
    expect(manifest.sources.patch!.sha256).toBe(sha256(history.patchText));
    expect(manifest.sources.note!.sha256).toBe(sha256(history.noteText));
    expect(manifest.sources.note!.path.startsWith("<source-root>/games/melee/runtime/state/runs/")).toBe(true);
    expect(manifest.command).toContain("--source-root <source-root>");
    expect(manifest.trimmed).toEqual([]);
    expect(JSON.parse(readFileSync(join(out, "findings.json"), "utf8"))).toEqual(history.findings);
    expect(readFileSync(join(out, "qa_diff.patch"), "utf8")).toBe(history.patchText);
    const checkpoint = JSON.parse(readFileSync(join(out, "checkpoint.json"), "utf8"));
    expect(checkpoint).toMatchObject({ id: history.checkpointId, attempt_index: history.attempt, target_key: history.targetKey, exact_match: true });

    // The frozen fixture replays offline: four advisories.
    const { adjudication, doctor } = await runReplay({ fixtureDir: out, engine: "replay" });
    expect(doctor.ok).toBe(true);
    expect(adjudication.advisories).toHaveLength(4);
    expect(adjudication.extraction.status).toBe("ok");

    // Wrong ids are refused.
    await expect(freezeReplayCommand(parseCalibrationArgs(["freeze-replay", "--source-root", history.root, "--run", "no-such-run", "--worker-state", history.workerStateId, "--attempt", "2", "--out", outDir()]), () => {})).rejects.toThrow("run no-such-run not found");
  });

  test("freeze-replay scrubs bearer tokens inside JSON values and refuses short secrets", async () => {
    const history = tree();
    const token = "tok_ABCDEFG123";
    // A finding excerpt and a note value that END in a bearer token, right before JSON punctuation.
    const summary = JSON.parse(readFileSync(history.paths.summary, "utf8"));
    summary.qaLint.findings[0].excerpt = `${summary.qaLint.findings[0].excerpt} // Authorization: Bearer ${token}`;
    writeFileSync(history.paths.summary, JSON.stringify(summary, null, 2));
    const note = JSON.parse(history.noteText);
    note.probe = `curl -H "Authorization: Bearer ${token}"`;
    writeFileSync(history.paths.note, JSON.stringify(note, null, 2));

    const out = outDir();
    await freeze(history, out);
    for (const name of ["findings.json", "checkpoint.json", "fixture-extraction.json", "manifest.json", "note.txt"]) {
      const text = readFileSync(join(out, name), "utf8");
      expect(() => JSON.parse(text)).not.toThrow();
      expect(text).not.toContain(token);
    }
    const findings = JSON.parse(readFileSync(join(out, "findings.json"), "utf8")) as QaScanFinding[];
    expect(findings[0]!.excerpt.endsWith("// Authorization: <redacted:token>")).toBe(true);
    expect(JSON.parse(readFileSync(join(out, "note.txt"), "utf8")).probe).toBe('curl -H "Authorization: <redacted:token>');

    // A secret-looking value too short to scrub safely: freezing refuses, naming the variable, never the value.
    const shortSecret = "zq7Wv";
    note.probe = `the sandbox key was ${shortSecret}`;
    writeFileSync(history.paths.note, JSON.stringify(note, null, 2));
    const saved = process.env.FIXTURE_SHORT_TOKEN;
    process.env.FIXTURE_SHORT_TOKEN = shortSecret;
    try {
      const refusedOut = outDir();
      const failure = await freeze(history, refusedOut).then(
        () => null,
        (error: unknown) => error as Error,
      );
      expect(failure?.message).toContain("FIXTURE_SHORT_TOKEN");
      expect(failure?.message).not.toContain(shortSecret);
      expect(existsSync(refusedOut)).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.FIXTURE_SHORT_TOKEN;
      else process.env.FIXTURE_SHORT_TOKEN = saved;
    }
  });

  test("freeze-replay scrubs credentials used as JSON keys in the note and the checkpoint's agent_note", async () => {
    const history = tree();
    const secret = "kq83Lm2Zp0Xw";
    const keyed = { [secret]: "safe value", [`Bearer ${secret}x`]: { [`${history.root}/games`]: true } };
    const note = { ...JSON.parse(history.noteText), ...keyed };
    writeFileSync(history.paths.note, JSON.stringify(note, null, 2));
    const db = new Database(history.paths.orchestratorDb);
    try {
      const row = db.query("SELECT metadata_json FROM worker_checkpoints WHERE id = ?").get(history.checkpointId) as { metadata_json: string };
      const metadata = JSON.parse(row.metadata_json);
      metadata.agent_note = { ...metadata.agent_note, ...keyed };
      db.run("UPDATE worker_checkpoints SET metadata_json = ? WHERE id = ?", [JSON.stringify(metadata), history.checkpointId]);
    } finally {
      db.close();
    }
    const saved = process.env.FIXTURE_SECRET_TOKEN;
    process.env.FIXTURE_SECRET_TOKEN = secret;
    try {
      const out = outDir();
      await freeze(history, out);
      for (const name of readdirSync(out)) {
        const text = readFileSync(join(out, name), "utf8");
        expect(text).not.toContain(secret);
        expect(text).not.toContain(`${secret}x`);
        expect(text).not.toContain("Bearer <redacted");
        expect(text).not.toContain(history.root);
      }
      // The bearer key holds the secret plus a suffix: removed whole, no "x" left behind.
      const expectedKeys = { "<redacted:env:FIXTURE_SECRET_TOKEN>": "safe value", "<redacted:token>": { "<source-root>/games": true } };
      expect(JSON.parse(readFileSync(join(out, "note.txt"), "utf8"))).toMatchObject(expectedKeys);
      expect(JSON.parse(readFileSync(join(out, "checkpoint.json"), "utf8")).agent_note).toMatchObject(expectedKeys);
    } finally {
      if (saved === undefined) delete process.env.FIXTURE_SECRET_TOKEN;
      else process.env.FIXTURE_SECRET_TOKEN = saved;
    }
  });

  test("freeze-replay refuses a short credential hidden in marker-shaped note keys and values", async () => {
    const history = tree();
    const note = { ...JSON.parse(history.noteText), "<redacted:env:p4s>": "<redacted:env:p4s>" };
    writeFileSync(history.paths.note, JSON.stringify(note, null, 2));
    const saved = process.env.FIXTURE_PASSWORD;
    process.env.FIXTURE_PASSWORD = "p4s";
    try {
      const out = outDir();
      const failure = await freeze(history, out).then(
        () => null,
        (error: unknown) => error as Error,
      );
      expect(failure?.message).toContain("FIXTURE_PASSWORD");
      expect(failure?.message).not.toContain("p4s");
      expect(existsSync(out)).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.FIXTURE_PASSWORD;
      else process.env.FIXTURE_PASSWORD = saved;
    }
  });

  test("a checkpoint id equal to a configured secret appears in no fixture or manifest field (F17)", async () => {
    const history = tree();
    const saved = process.env.FIXTURE_CHECKPOINT_TOKEN;
    process.env.FIXTURE_CHECKPOINT_TOKEN = history.checkpointId;
    try {
      const out = outDir();
      const manifest = await freeze(history, out);
      for (const name of readdirSync(out)) expect(readFileSync(join(out, name), "utf8")).not.toContain(history.checkpointId);
      expect(manifest.sources.checkpoint!.path).toBe(
        "<source-root>/games/melee/runtime/state/orchestrator.sqlite#worker_checkpoints/<redacted:env:FIXTURE_CHECKPOINT_TOKEN>",
      );
      expect(manifest.source.checkpoint_id).toBe("<redacted:env:FIXTURE_CHECKPOINT_TOKEN>");
    } finally {
      if (saved === undefined) delete process.env.FIXTURE_CHECKPOINT_TOKEN;
      else process.env.FIXTURE_CHECKPOINT_TOKEN = saved;
    }
  });

  test("a patch over 64 KB is trimmed to the findings' hunks", async () => {
    const history = tree({ castsPatchPadding: MAX_FIXTURE_FILE_BYTES + 4_096 });
    const out = outDir();
    const manifest = await freeze(history, out);
    expect(manifest.trimmed).toEqual(["qa_diff.patch"]);
    const patch = readFileSync(join(out, "qa_diff.patch"), "utf8");
    expect(Buffer.byteLength(patch)).toBeLessThan(MAX_FIXTURE_FILE_BYTES);
    for (const finding of history.findings) expect(patch).toContain(finding.excerpt);
    const { adjudication } = await runReplay({ fixtureDir: out, engine: "replay" });
    expect(adjudication.advisories.every((a) => a.fingerprint !== null)).toBe(true);
  });

  test("the sanitizer replaces secret-looking environment values", () => {
    const sanitize = createSanitizer({ sourceRoot: "/srv/harness", env: { MY_SERVICE_TOKEN: "tok_live_0123456789", SHORT_KEY: "abc", PATH: "/usr/bin" }, home: "/home/u" });
    expect(sanitize("token tok_live_0123456789 at /srv/harness/games/x and /home/u/.pi; Bearer abc.def and key sk-abcdefgh1234; /usr/bin"))
      .toBe("token <redacted:env:MY_SERVICE_TOKEN> at <source-root>/games/x and <home>/.pi; <redacted:token> and key <redacted:token>; /usr/bin");
  });

  test("patches over the size cap keep only the hunks that hold a finding", () => {
    const patch = [
      "diff --git a/src/a.c b/src/a.c",
      "--- a/src/a.c",
      "+++ b/src/a.c",
      ...hunk(10, [" ctx", "-old", "+    x = *(u32*) &y;", " ctx"]),
      // A removed line that looks like a file header stays inside its hunk.
      ...hunk(100, [" ctx", "--- not a header", "+    z = 1;", " ctx"]),
      "diff --git a/src/b.c b/src/b.c",
      "--- a/src/b.c",
      "+++ b/src/b.c",
      ...hunk(5, [" ctx", "+    w = *(u8*) &v;", " ctx"]),
      "diff --git a/src/c.c b/src/c.c",
      "--- a/src/c.c",
      "+++ b/src/c.c",
      ...hunk(1, ["+unrelated"]),
      "",
    ].join("\n");
    const trimmed = trimPatchToFindings(patch, [finding("src/a.c", 11), finding("src/b.c", 6)]);
    expect(trimmed).toBe(
      [
        "diff --git a/src/a.c b/src/a.c",
        "--- a/src/a.c",
        "+++ b/src/a.c",
        ...hunk(10, [" ctx", "-old", "+    x = *(u32*) &y;", " ctx"]),
        "diff --git a/src/b.c b/src/b.c",
        "--- a/src/b.c",
        "+++ b/src/b.c",
        ...hunk(5, [" ctx", "+    w = *(u8*) &v;", " ctx"]),
        "",
      ].join("\n"),
    );
  });
});
