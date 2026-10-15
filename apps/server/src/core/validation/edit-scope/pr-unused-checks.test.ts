import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { collectPrUnusedChecks, preparePrUnusedChecks } from "./pr-unused-checks.js";
import { unitInputsSha256 } from "./unused-evidence.js";

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function git(repo: string, ...argv: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...argv], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function commitFile(repo: string, path: string, text: string, message: string): string {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), text);
  git(repo, "add", path);
  git(repo, "commit", "-q", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

/** One certificate bound to `text` as the unit's only input. */
function certificate(fn: string, path: string, text: string | null, unit = "unit_a"): Record<string, unknown> {
  return {
    unit, file: path, function: fn, status: "inlined", changed: [],
    unit_inputs: [path], unit_inputs_sha256: unitInputsSha256([{ path, text }]),
  };
}

/** Records a worker checkpoint carrying `checks` and its integration outcome. */
function integrate(store: StateStore, row: { id: string; runId?: string; status?: string; integratedRev: string | null; checks: unknown[] }): void {
  const runId = row.runId ?? "run-1";
  const now = new Date().toISOString();
  store.db.query(`INSERT INTO worker_checkpoints (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id, attempt_index, validation_time, validation_status, metadata_json)
    VALUES (?, ?, ?, 'epoch', 'target', ?, 1, ?, 'passed', ?)`).run(row.id, `ws-${row.id}`, runId, `claim-${row.id}`, now, JSON.stringify({ unused_checks: row.checks }));
  store.db.query(`INSERT INTO integration_outcomes (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id, worker_checkpoint_id, status, metadata_json, created_at, updated_at)
    VALUES (?, ?, 'epoch', 'target', ?, ?, ?, ?, ?, ?, ?)`).run(`io-${row.id}`, runId, `claim-${row.id}`, `ws-${row.id}`, row.id, row.status ?? "applied",
    JSON.stringify(row.integratedRev ? { integrated_rev: row.integratedRev } : {}), now, now);
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "pr-unused-checks-"));
  tempDirs.push(dir);
  const repo = join(dir, "repo");
  Bun.spawnSync(["git", "init", "-q", repo]);
  git(repo, "config", "user.email", "t@example.invalid");
  git(repo, "config", "user.name", "t");
  const base = commitFile(repo, "README", "base\n", "base");
  const aText = "void TFoo::a() {}\n";
  const onBranch = commitFile(repo, "src/a.cpp", aText, "integrate a");
  const bText = "void TBar::b() {}\n";
  const onBranchB = commitFile(repo, "src/b.cpp", bText, "integrate b");
  // The caller of b changed after certification: stale at the PR head.
  const head = commitFile(repo, "src/b.cpp", "void TBar::b() { other(); }\n", "edit b");
  git(repo, "checkout", "-q", "-b", "elsewhere", base);
  const offBranch = commitFile(repo, "src/c.cpp", "c\n", "other checkout");
  git(repo, "checkout", "-q", "-");
  const store = openState(join(dir, "state"));
  return { dir, repo, store, base, head, onBranch, onBranchB, offBranch, aText, bText };
}

describe("collectPrUnusedChecks", () => {
  test("keeps only certificates integrated on base..head and fresh at head", async () => {
    const f = setup();
    try {
      integrate(f.store, { id: "cp-a", integratedRev: f.onBranch, checks: [certificate("TFoo::a", "src/a.cpp", f.aText)] });
      integrate(f.store, { id: "cp-b", runId: "run-0", integratedRev: f.onBranchB, checks: [certificate("TBar::b", "src/b.cpp", f.bText)] });
      integrate(f.store, { id: "cp-off", integratedRev: f.offBranch, checks: [certificate("TOff::c", "src/c.cpp", "c\n")] });
      integrate(f.store, { id: "cp-base", integratedRev: f.base, checks: [certificate("TBase::r", "README", "base\n")] });
      integrate(f.store, { id: "cp-rejected", status: "rejected", integratedRev: f.onBranch, checks: [certificate("TRej::r", "src/a.cpp", f.aText)] });
      integrate(f.store, { id: "cp-unbound", integratedRev: null, checks: [certificate("TNone::n", "src/a.cpp", f.aText)] });

      const collected = await collectPrUnusedChecks({ store: f.store, repoRoot: f.repo, base: f.base, head: f.head });
      expect(collected.checks.map((check) => check.function)).toEqual(["TFoo::a"]);
      expect(collected.stale.map((entry) => entry.check.function)).toEqual(["TBar::b"]);
      expect(collected.stale[0]!.reason).toContain("unit inputs changed: src/b.cpp");
      expect(collected.sources.map((source) => source.worker_checkpoint_id).sort()).toEqual(["cp-a", "cp-b"]);

      const scoped = await collectPrUnusedChecks({ store: f.store, repoRoot: f.repo, base: f.base, head: f.head, runId: "run-0" });
      expect(scoped.sources.map((source) => source.worker_checkpoint_id)).toEqual(["cp-b"]);
      expect(scoped.checks).toEqual([]);

      const prepared = await preparePrUnusedChecks({ store: f.store, repoRoot: f.repo, base: f.base, head: f.head, outputPath: join(f.dir, "out", "u.json") });
      expect(prepared.count).toBe(1);
      expect(prepared.stale).toHaveLength(1);
      const file = JSON.parse(readFileSync(prepared.path, "utf8"));
      expect(file.head).toBe(f.head);
      expect(file.unused_checks.map((check: { function: string }) => check.function)).toEqual(["TFoo::a"]);
      expect(file.stale).toEqual([expect.objectContaining({ function: "TBar::b" })]);
    } finally { f.store.db.close(); }
  });

  test("the latest integration of a function wins", async () => {
    const f = setup();
    try {
      integrate(f.store, { id: "cp-old", integratedRev: f.onBranch, checks: [{ ...certificate("TFoo::a", "src/a.cpp", f.aText), note: "old" }] });
      integrate(f.store, { id: "cp-new", integratedRev: f.onBranchB, checks: [{ ...certificate("TFoo::a", "src/a.cpp", f.aText), note: "new" }] });
      const collected = await collectPrUnusedChecks({ store: f.store, repoRoot: f.repo, base: f.base, head: f.head });
      expect(collected.checks.map((check) => check.note)).toEqual(["new"]);
    } finally { f.store.db.close(); }
  });

  test("a dependency the certified patch never touched, changed later on the branch, makes the certificate stale", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pr-unused-checks-dep-"));
    tempDirs.push(dir);
    const repo = join(dir, "repo");
    Bun.spawnSync(["git", "init", "-q", repo]);
    git(repo, "config", "user.email", "t@example.invalid");
    git(repo, "config", "user.name", "t");
    const headerText = "struct TFoo { int x; };\n";
    const base = commitFile(repo, "include/foo.h", headerText, "base header");
    const unitText = "#include \"foo.h\"\nvoid TFoo::a() {}\n";
    // The certified patch changes only the unit source; the header is a recorded input it did not touch.
    const integrated = commitFile(repo, "src/a.cpp", unitText, "integrate a");
    const inputs = [{ path: "include/foo.h", text: headerText }, { path: "src/a.cpp", text: unitText }, { path: "include/gone.h", text: null }];
    const check = {
      unit: "unit_a", file: "src/a.cpp", function: "TFoo::a", status: "inlined", changed: [],
      unit_inputs: inputs.map((input) => input.path), unit_inputs_sha256: unitInputsSha256(inputs),
    };
    const store = openState(join(dir, "state"));
    try {
      integrate(store, { id: "cp-a", integratedRev: integrated, checks: [check] });
      const unchangedHead = commitFile(repo, "README", "unrelated\n", "unrelated");
      const fresh = await collectPrUnusedChecks({ store, repoRoot: repo, base, head: unchangedHead });
      expect(fresh.checks.map((row) => row.function)).toEqual(["TFoo::a"]);

      const head = commitFile(repo, "include/foo.h", "struct TFoo { int x; int y; };\n", "later header change");
      const prepared = await preparePrUnusedChecks({ store, repoRoot: repo, base, head, outputPath: join(dir, "u.json") });
      expect(prepared.count).toBe(0);
      expect(prepared.stale).toEqual([expect.stringContaining("stale certificate for TFoo::a (unit inputs changed: include/foo.h, src/a.cpp, include/gone.h)")]);
      expect(JSON.parse(readFileSync(prepared.path, "utf8")).unused_checks).toEqual([]);
    } finally { store.db.close(); }
  });

  test("an unknown base fails instead of passing no evidence silently", async () => {
    const f = setup();
    try {
      await expect(collectPrUnusedChecks({ store: f.store, repoRoot: f.repo, base: "origin/nope", head: f.head })).rejects.toThrow(/rev-list/);
    } finally { f.store.db.close(); }
  });
});
