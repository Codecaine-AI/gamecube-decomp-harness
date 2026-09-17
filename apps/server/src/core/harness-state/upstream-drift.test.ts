import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureSchema } from "../orchestrator-state/storage/ddl.js";
import { getHarnessState, getHarnessTimeline, initializeHarnessState, transitionHarnessState } from "./state.js";
import { computeUpstreamDrift, observeUpstreamDrift, recordUpstreamDrift, upstreamDriftFromGit, upstreamDriftNotice, withLiveUpstreamDrift, type UpstreamDrift } from "./upstream-drift.js";

const databases: Database[] = [];
const roots: string[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() { const db = new Database(":memory:"); databases.push(db); ensureSchema(db); return db; }
function drift(aheadBy: number, head = "H2", accepted = "U", now = "2026-09-17T00:00:00.000Z"): UpstreamDrift {
  return {
    upstream_ref: "upstream/main", upstream_head: head, accepted_upstream: accepted, upstream_ahead_by: aheadBy,
    oldest: aheadBy > 0 ? { sha: "H1", subject: "first" } : null, newest: aheadBy > 0 ? { sha: head, subject: "latest" } : null, observed_at: now,
  };
}
function readyState(db: Database, upstream = "U") {
  initializeHarnessState(db, { gameId: "sms", worktree: "/games/sms/workspace/checkout", configurationRevision: "config-1", commandId: "initialize" });
  return transitionHarnessState(db, { gameId: "sms", expectedRevision: 0, commandId: "ready", patch: { source: { head: "A", upstream_revision: upstream }, readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" } } });
}

describe("upstream drift computation", () => {
  test("assembles count, oldest and newest subjects from git output", () => {
    const value = upstreamDriftFromGit({ upstreamRef: "upstream/main", upstreamHead: "c3", acceptedUpstream: "c0", countText: "3\n", logText: "c1\tMisc improvements\nc2\tUpdate getNameRef_Enemy\nc3\tBoss name ref gen updated\n", now: "t" });
    expect(value).toEqual({ upstream_ref: "upstream/main", upstream_head: "c3", accepted_upstream: "c0", upstream_ahead_by: 3, oldest: { sha: "c1", subject: "Misc improvements" }, newest: { sha: "c3", subject: "Boss name ref gen updated" }, observed_at: "t" });
    expect(upstreamDriftFromGit({ upstreamRef: "u/m", upstreamHead: "c0", acceptedUpstream: "c0", countText: "0", logText: "", now: "t" })).toMatchObject({ upstream_ahead_by: 0, oldest: null, newest: null });
  });

  test("computeUpstreamDrift resolves the ref, counts the range, and is null without an accepted upstream", async () => {
    const calls: string[][] = [];
    const runGit = async (_root: string, args: string[]) => {
      calls.push(args);
      if (args[0] === "rev-parse") return { exitCode: 0, stdout: "head9\n" };
      if (args[0] === "rev-list") return { exitCode: 0, stdout: "2\n" };
      if (args[0] === "log") return { exitCode: 0, stdout: "a\tone\nhead9\ttwo\n" };
      return { exitCode: 1, stdout: "" };
    };
    const value = await computeUpstreamDrift({ repoRoot: "/r", upstreamRef: "upstream/main", acceptedUpstream: "base", runGit, now: "t" });
    expect(value).toMatchObject({ upstream_head: "head9", upstream_ahead_by: 2, oldest: { sha: "a", subject: "one" }, newest: { sha: "head9", subject: "two" } });
    expect(calls).toEqual([["rev-parse", "--verify", "upstream/main^{commit}"], ["rev-list", "--count", "base..head9"], ["log", "--reverse", "--format=%H%x09%s", "base..head9"]]);
    expect(await computeUpstreamDrift({ repoRoot: "/r", upstreamRef: "upstream/main", acceptedUpstream: null, runGit })).toBeNull();
    expect(await computeUpstreamDrift({ repoRoot: "/r", upstreamRef: "upstream/main", acceptedUpstream: "base", runGit: async () => ({ exitCode: 128, stdout: "" }) })).toBeNull();
  });

  test("observeUpstreamDrift reads local refs of a real repository without fetching", () => {
    const root = mkdtempSync(join(tmpdir(), "upstream-drift-")); roots.push(root);
    const git = (...args: string[]) => { const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" }); if (result.exitCode !== 0) throw new Error(result.stderr.toString()); return result.stdout.toString().trim(); };
    git("init", "-q", "-b", "main"); git("config", "user.email", "t@example.com"); git("config", "user.name", "T");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.cpp"), "int a;\n"); git("add", "."); git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    writeFileSync(join(root, "src/a.cpp"), "int a = 1;\n"); git("commit", "-qam", "Misc improvements");
    const head = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/upstream/main", head);
    expect(observeUpstreamDrift({ repoRoot: root, upstreamRef: "upstream/main", acceptedUpstream: base, now: "t" })).toEqual({
      upstream_ref: "upstream/main", upstream_head: head, accepted_upstream: base, upstream_ahead_by: 1, oldest: { sha: head, subject: "Misc improvements" }, newest: { sha: head, subject: "Misc improvements" }, observed_at: "t",
    });
    expect(observeUpstreamDrift({ repoRoot: root, upstreamRef: "upstream/main", acceptedUpstream: head })).toMatchObject({ upstream_ahead_by: 0 });
    expect(observeUpstreamDrift({ repoRoot: root, upstreamRef: "origin/master", acceptedUpstream: base })).toBeNull();
  });
});

describe("upstream drift notices", () => {
  test("records a notice and one timeline entry when drift first appears, updates silently, and clears when upstream is accepted", () => {
    const db = fixture();
    const ready = readyState(db);
    expect(recordUpstreamDrift(db, { gameId: "sms", drift: drift(0, "U") })).toEqual(ready);
    expect(getHarnessTimeline(db, "sms")).toHaveLength(0);

    const detected = recordUpstreamDrift(db, { gameId: "sms", drift: drift(2) })!;
    expect(detected.identity.revision).toBe(ready.identity.revision + 1);
    expect(detected.notices).toHaveLength(1);
    expect(detected.notices[0]).toMatchObject({ code: "upstream_drift", source_kind: "game", source_id: "sms", detail: { upstream_ahead_by: 2, upstream_head: "H2", oldest: { subject: "first" }, newest: { subject: "latest" } } });
    expect(detected.notices[0]!.message).toBe("Upstream upstream/main is 2 commit(s) ahead of the accepted upstream U (oldest H1 first; newest H2 latest); the next epoch boundary merges it.");
    expect(detected.execution.blockers).toEqual([]);
    const timeline = getHarnessTimeline(db, "sms");
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ kind: "upstream_drift", outcome: "detected", eventId: "upstream-drift:U:H2", evidence: { upstream_ahead_by: 2 } });

    // Same observation: no state churn. Growth: notice updated, no second timeline entry.
    expect(recordUpstreamDrift(db, { gameId: "sms", drift: drift(2) })!.identity.revision).toBe(detected.identity.revision);
    const grown = recordUpstreamDrift(db, { gameId: "sms", drift: drift(5, "H5") })!;
    expect(grown.notices[0]!.detail).toMatchObject({ upstream_ahead_by: 5, upstream_head: "H5" });
    expect(getHarnessTimeline(db, "sms")).toHaveLength(1);

    // A stale observation (different accepted upstream) is ignored.
    expect(recordUpstreamDrift(db, { gameId: "sms", drift: drift(9, "H9", "OTHER") })).toEqual(grown);

    // Accepting the new upstream retires the notice on its own.
    const merged = transitionHarnessState(db, { gameId: "sms", expectedRevision: grown.identity.revision, commandId: "sync", patch: { source: { head: "B", upstream_revision: "H5" } } });
    expect(merged.notices).toEqual([]);
    expect(getHarnessState(db, "sms")!.notices).toEqual([]);
    // Re-appearance after acceptance logs again.
    recordUpstreamDrift(db, { gameId: "sms", drift: drift(1, "H6", "H5") });
    expect(getHarnessTimeline(db, "sms").map((entry) => entry.eventId)).toEqual(["upstream-drift:U:H2", "upstream-drift:H5:H6"]);
  });

  test("withLiveUpstreamDrift merges a read-time observation without touching the store and ignores stale ones", () => {
    const db = fixture();
    const state = readyState(db);
    const live = withLiveUpstreamDrift(state, drift(3));
    expect(live.notices.map((notice) => notice.code)).toEqual(["upstream_drift"]);
    expect(live.notices[0]!.detail).toMatchObject({ upstream_ahead_by: 3 });
    expect(getHarnessState(db, "sms")!.notices).toEqual([]);
    expect(withLiveUpstreamDrift(state, drift(3, "H", "STALE")).notices).toEqual([]);
    expect(withLiveUpstreamDrift(live, drift(0, "U")).notices).toEqual([]);
    expect(withLiveUpstreamDrift(state, null)).toBe(state);
    expect(upstreamDriftNotice("sms", drift(1))!.message).toContain("is 1 commit(s) ahead of the accepted upstream U (H2 latest)");
  });
});
