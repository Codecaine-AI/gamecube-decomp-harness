import { afterEach, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState } from "../../../../../apps/server/src/core/orchestrator-state/index.js";
import { clearUnverifiedMatch, recordUnverifiedMatch } from "../../../../../apps/server/src/core/harness-runtime/run-state/unverified-matches.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const tempRoot = (prefix: string) => { const root = mkdtempSync(join(tmpdir(), prefix)); roots.push(root); return root; };

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" }).toString().trim();
}

/** Host repo with one commit per label (in order); returns label -> full sha. */
function hostRepo(root: string, labels: string[]): { host: string; revs: Record<string, string> } {
  const host = join(root, "host");
  mkdirSync(host, { recursive: true });
  git(host, "init", "-q");
  const revs: Record<string, string> = {};
  for (const label of labels) {
    writeFileSync(join(host, "a.c"), `// ${label}\n`);
    git(host, "add", "-A");
    git(host, "commit", "-qm", label);
    revs[label] = git(host, "rev-parse", "HEAD");
  }
  return { host, revs };
}

const CLI = join(import.meta.dir, "extra-baked-revs.ts");
const BAKE = join(import.meta.dir, "bake_extra_revs.sh");

/** A state DB built by the real migrations, holding in-use and finished revisions for sms plus another game's. */
function stateFixture(root: string, revs: Record<string, string>) {
  const store = openState(join(root, "state"));
  const unverified = (gameId: string, symbol: string, baseRev: string | null) => recordUnverifiedMatch(store, {
    gameId, unit: "main/u", symbol, analyzedRev: revs.head!, baseRev, match: { base: 1, candidate: 1, real_only: 0 }, reasons: ["ir_oracle_failed"],
  });
  unverified("sms", "trustedFn", revs.trusted!.slice(0, 8));
  unverified("sms", "clearedFn", revs.cleared!);
  clearUnverifiedMatch(store, { gameId: "sms", unit: "main/u", symbol: "clearedFn", clearedBy: "test" });
  unverified("sms", "noBase", null);
  unverified("melee", "otherGame", revs.other!);
  const run = store.db.query(`INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, game_id, head_revision, inputs_json)
    VALUES (?, 'match', 1, 1, ?, 'now', ?, ?, ?)`);
  run.run("run-active", "active", "sms", revs.head!, JSON.stringify({ base_revision: revs.runBase! }));
  run.run("run-done", "completed", "sms", revs.finished!, JSON.stringify({ base_revision: revs.finished! }));
  const claim = store.db.query(`INSERT INTO target_claims (id, run_id, epoch_id, epoch_target_id, worker_id, base_rev, status, claimed_at)
    VALUES (?, ?, 'epoch', ?, 'w', ?, ?, 'now')`);
  claim.run("claim-active", "run-active", "et-1", revs.claim!, "active");
  claim.run("claim-closed", "run-active", "et-2", revs.finished!, "closed");
  const job = store.db.query(`INSERT INTO jobs (job_id, kind, dedupe_key, game_id, status, payload_json, created_at, updated_at)
    VALUES (?, 'worker', ?, ?, ?, ?, 'now', 'now')`);
  job.run("job-queued", "d1", "sms", "queued", JSON.stringify({ base_rev: revs.job! }));
  job.run("job-done", "d2", "sms", "succeeded", JSON.stringify({ base_rev: revs.finished! }));
  job.run("job-bad", "d3", "sms", "running", JSON.stringify({ base_rev: "not-a-sha" }));
  const path = store.path;
  store.db.close();
  return path;
}

test("lists the game's in-use revisions, resolved to full SHAs in the checkout, from a read-only DB", () => {
  const root = tempRoot("extra-revs-cli-");
  const { host, revs } = hostRepo(root, ["trusted", "cleared", "other", "runBase", "claim", "job", "finished", "head"]);
  const dbPath = stateFixture(root, revs);
  const unknown = "1234567890abcdef1234567890abcdef12345678";
  // A value the checkout lacks is dropped with a warning.
  const store = openState(join(root, "state"));
  store.db.query("INSERT INTO target_claims (id, run_id, epoch_id, epoch_target_id, worker_id, base_rev, status, claimed_at) VALUES ('c3', 'run-active', 'e', 'et-3', 'w', ?, 'active', 'now')").run(unknown);
  store.db.close();
  const before = statSync(dbPath).mtimeMs;
  const out = join(root, "extra-revs.txt");

  const result = spawnSync("bun", [CLI, "--state-db", dbPath, "--game", "sms", "--out", out, "--repo", host], { encoding: "utf8" });

  expect(result.status).toBe(0);
  const lines = readFileSync(out, "utf8").split("\n").filter(Boolean);
  expect(lines.filter((line) => line.startsWith("#")).join("\n")).toContain("# sources: unverified=1 run=2 claim=1 job=1");
  expect(lines.filter((line) => !line.startsWith("#"))).toEqual(
    [revs.trusted, revs.runBase, revs.claim, revs.job, revs.head].map(String).sort(),
  );
  expect(result.stderr).toContain(`dropping ${unknown} (claim): not a commit in ${host}`);
  expect(result.stderr).toContain('dropping "not-a-sha": not a commit SHA');
  expect(statSync(dbPath).mtimeMs).toBe(before);
}, 30_000);

test("a state dir is accepted, short SHAs pass through without --repo, and --state-db is required", () => {
  const root = tempRoot("extra-revs-cli-dir-");
  const { revs } = hostRepo(root, ["trusted", "cleared", "other", "runBase", "claim", "job", "finished", "head"]);
  stateFixture(root, revs);
  const out = join(root, "extra-revs.txt");
  const ok = spawnSync("bun", [CLI, "--state-db", join(root, "state"), "--game", "melee", "--out", out], { encoding: "utf8" });
  expect(ok.status).toBe(0);
  expect(readFileSync(out, "utf8").split("\n").filter((line) => line && !line.startsWith("#"))).toEqual([revs.other]);

  const short = spawnSync("bun", [CLI, "--state-db", join(root, "state"), "--game", "sms", "--out", out], { encoding: "utf8" });
  expect(short.status).toBe(0);
  expect(readFileSync(out, "utf8")).toContain(`\n${revs.trusted!.slice(0, 8)}\n`);
  expect(short.stderr).toContain("is a short SHA");

  const missing = spawnSync("bun", [CLI, "--game", "sms", "--out", out], { encoding: "utf8" });
  expect(missing.status).toBe(1);
  expect(missing.stderr).toContain("--state-db is required");
}, 30_000);

test("the bundle stage bakes listed revisions depth-1 under real refs and records them; a host-missing one fails before fetching", () => {
  const root = tempRoot("bake-extra-revs-");
  const { host, revs } = hostRepo(root, ["trusted", "middle", "baked"]);
  git(host, "checkout", "-q", "--detach");
  const shallow = join(root, "shallow");
  execFileSync("git", ["clone", "-q", "--depth", "1", "--no-checkout", `file://${host}`, shallow], { stdio: "pipe" });
  const listed = join(root, "revs.txt");
  // Duplicates (short and full), comments, blank lines and the baked HEAD itself.
  writeFileSync(listed, `# header\n${revs.trusted!.slice(0, 9)}\n\n${revs.trusted}  # again\n${revs.middle}\n${revs.baked}\n`);
  const provenance = join(root, "baked-extra-revs.txt");

  execFileSync("bash", [BAKE, host, shallow, listed, provenance], { stdio: "pipe" });

  const expected = [revs.trusted!, revs.middle!, revs.baked!].sort();
  expect(readFileSync(provenance, "utf8")).toBe(`${expected.join("\n")}\n`);
  for (const sha of expected) {
    expect(git(shallow, "rev-parse", `refs/baked-extra/${sha}`)).toBe(sha);
    expect(git(shallow, "show", `${sha}:a.c`)).toMatch(/^\/\/ /);
  }
  // Depth 1: the older commits are shallow boundaries, not full history.
  expect(git(shallow, "rev-list", "--count", revs.middle!)).toBe("1");

  const missing = join(root, "missing.txt");
  writeFileSync(missing, `${revs.trusted}\n1234567890abcdef1234567890abcdef12345678\n`);
  const fresh = join(root, "fresh");
  execFileSync("git", ["clone", "-q", "--depth", "1", "--no-checkout", `file://${host}`, fresh], { stdio: "pipe" });
  const failed = spawnSync("bash", [BAKE, host, fresh, missing, join(root, "p2.txt")], { encoding: "utf8" });
  expect(failed.status).toBe(1);
  expect(failed.stderr).toContain("extra baked revisions are not commits in");
  expect(failed.stderr).toContain("1234567890abcdef1234567890abcdef12345678");
  expect(git(fresh, "for-each-ref", "refs/baked-extra/")).toBe("");
}, 30_000);
