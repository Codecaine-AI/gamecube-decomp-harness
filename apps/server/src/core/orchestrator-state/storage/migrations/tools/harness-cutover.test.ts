import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gameConfigurationRevision } from "@server/core/game-registry/config-revision.js";
import { resolveGame } from "@server/core/game-registry/resolver.js";
import { createPreCutoverFixture } from "./fixture.js";
import { parseLegacyImportArgs, runLegacyImport, type LegacyImportCliOptions } from "./harness-cutover.js";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function git(root: string, args: string[]) {
  const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}
function fixture(): LegacyImportCliOptions {
  const dir = mkdtempSync(join(tmpdir(), "legacy-import-cli-")); dirs.push(dir);
  const worktree = join(dir, "checkout"); mkdirSync(worktree);
  git(worktree, ["init", "-q"]); git(worktree, ["config", "user.email", "fixture@example.com"]); git(worktree, ["config", "user.name", "Fixture"]);
  writeFileSync(join(worktree, "source.c"), "int value = 1;\n"); git(worktree, ["add", "."]); git(worktree, ["commit", "-qm", "baseline"]);
  const head = git(worktree, ["rev-parse", "HEAD"]);
  const gameDir = join(dir, "games", "melee"); mkdirSync(gameDir, { recursive: true });
  writeFileSync(join(gameDir, "game.json"), JSON.stringify({ id: "melee", repoRoot: worktree, stateDir: dir }));
  const db = new Database(join(dir, "orchestrator.sqlite"));
  createPreCutoverFixture(db);
  db.query("INSERT INTO cycles(id,game_id,cycle_uuid,status,phase,base_sha,head_revision,created_at,updated_at) VALUES ('legacy','melee','legacy-melee','active','running',?,?,'now','now')").run(head, head);
  db.query("UPDATE cycles SET preparing_state_json = ? WHERE id = 'legacy'").run(JSON.stringify({ sync: { cycleCurrentWorktreePath: worktree } }));
  db.close();
  const configurationRevision = gameConfigurationRevision(resolveGame({ gameId: "melee", orchestratorRoot: dir }));
  return { mode: "preview", stateDir: dir, gameId: "melee", worktree, configurationRevision, orchestratorRoot: dir, commandId: "import-1" };
}

test("requires explicit mode and complete identity arguments", () => {
  expect(() => parseLegacyImportArgs([])).toThrow("--preview or --apply");
  expect(() => parseLegacyImportArgs(["--preview", "--apply"])).toThrow("exactly one");
  expect(() => parseLegacyImportArgs(["--preview"])).toThrow("--state-dir");
});

test("preview reads a pre-v6 database without migrating or initializing ownership", () => {
  const options = fixture();
  const db = new Database(join(options.stateDir, "orchestrator.sqlite"));
  for (const name of ["harness_legacy_imports", "harness_timeline_entries", "harness_commands", "harness_state"]) db.exec(`DROP TABLE ${name}`);
  db.exec("ALTER TABLE dispatch_state RENAME TO harness_state; DELETE FROM schema_migrations WHERE version = 6"); db.close();
  const files = readdirSync(options.stateDir);
  expect(runLegacyImport(options)).toMatchObject({ mode: "preview", state: null });
  const read = new Database(join(options.stateDir, "orchestrator.sqlite"), { readonly: true });
  expect(read.query("SELECT name FROM pragma_table_info('harness_state') WHERE name='state_json'").get()).toBeNull();
  read.close();
  expect(readdirSync(options.stateDir)).toEqual(files);
});

test("apply backs up WAL-resident rows before migration and keeps the legacy checkpoint", () => {
  const options = fixture();
  const writer = new Database(join(options.stateDir, "orchestrator.sqlite"));
  writer.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0");
  writer.exec("CREATE TABLE backup_probe (value TEXT); INSERT INTO backup_probe VALUES ('committed WAL evidence')");
  for (const name of ["harness_legacy_imports", "harness_timeline_entries", "harness_commands", "harness_state"]) writer.exec(`DROP TABLE ${name}`);
  writer.exec("ALTER TABLE dispatch_state RENAME TO harness_state; DELETE FROM schema_migrations WHERE version = 6");
  try {
    const result = runLegacyImport({ ...options, mode: "apply" });
    expect(result.state).toMatchObject({ identity: { harness_id: "legacy-melee" }, execution: { desired: "paused" } });
    const backup = new Database(String(result.backupPath), { readonly: true });
    expect(backup.query("SELECT value FROM backup_probe").get()).toEqual({ value: "committed WAL evidence" });
    expect(backup.query("SELECT name FROM pragma_table_info('harness_state') WHERE name='state_json'").get()).toBeNull();
    expect(backup.query("SELECT count(*) AS n FROM cycles").get()).toEqual({ n: 1 });
    backup.close();
    expect(writer.query("SELECT count(*) AS n FROM historical_harness_imports").get()).toEqual({ n: 1 });
    expect(writer.query("SELECT count(*) AS n FROM historical_cycles").get()).toEqual({ n: 1 });
  } finally { writer.close(); }
});

test("failed import reports a retained recovery snapshot and does not create ownership", () => {
  const options = fixture();
  const setup = new Database(join(options.stateDir, "orchestrator.sqlite"));
  setup.query("INSERT INTO dispatch_state(game_id,revision,active_workflow_json,trace_id,created_at,updated_at) VALUES ('melee',0,'{}','trace','now','now')").run();
  setup.close();
  expect(() => runLegacyImport({ ...options, mode: "apply" })).toThrow("Pre-migration recovery database:");
  expect(readdirSync(options.stateDir).filter(name => name.includes("before-legacy-import"))).toHaveLength(1);
  const db = new Database(join(options.stateDir, "orchestrator.sqlite"), { readonly: true });
  expect(db.query("SELECT count(*) AS n FROM harness_state").get()).toEqual({ n: 0 });
  db.close();
});


test("rejects another checkout at the same commit before backup or migration", () => {
  const options = fixture();
  const other = join(options.stateDir, "other-checkout");
  git(options.stateDir, ["clone", "-q", options.worktree, other]);
  const before = readdirSync(options.stateDir);
  expect(() => runLegacyImport({ ...options, mode: "apply", worktree: other })).toThrow("Worktree path does not match");
  expect(readdirSync(options.stateDir)).toEqual(before);
  const db = new Database(join(options.stateDir, "orchestrator.sqlite"), { readonly: true });
  expect(db.query("SELECT count(*) AS n FROM harness_state").get()).toEqual({ n: 0 }); db.close();
});

test("rejects a changed checkout HEAD before backup or migration", () => {
  const options = fixture();
  writeFileSync(join(options.worktree, "source.c"), "int value = 2;\n"); git(options.worktree, ["add", "."]); git(options.worktree, ["commit", "-qm", "unaccepted"]);
  const before = readdirSync(options.stateDir);
  expect(() => runLegacyImport({ ...options, mode: "apply" })).toThrow("Worktree HEAD does not match");
  expect(readdirSync(options.stateDir)).toEqual(before);
});

test("preview computes canonical configuration and apply refuses an outdated reviewed revision", () => {
  const options = fixture();
  const preview = runLegacyImport({ ...options, configurationRevision: undefined });
  expect(preview.configurationRevision).toBe(options.configurationRevision);
  expect(() => runLegacyImport({ ...options, mode: "apply", configurationRevision: "invented-config" })).toThrow("Configuration revision does not match");
  expect(readdirSync(options.stateDir).some(name => name.includes("before-legacy-import"))).toBe(false);
});

test("explicit reconciliation preserves original heads and cancels only the pinned stale Sync", () => {
  const options = fixture();
  const storedHead = git(options.worktree, ["rev-parse", "HEAD"]);
  writeFileSync(join(options.worktree, "source.c"), "int value = 2;\n"); git(options.worktree, ["commit", "-qam", "accepted descendant"]);
  const observedHead = git(options.worktree, ["rev-parse", "HEAD"]);
  const db = new Database(join(options.stateDir, "orchestrator.sqlite"));
  const active = { kind: "sync", workflow_id: "stale-sync", lease_id: "stale-lease", status: "active" };
  db.query("INSERT INTO sync_state(sync_id,game_id,cycle_uuid,status,trace_id,caused_by_event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run("stale-sync", "melee", "legacy-melee", "blocked", "trace", "old-event", "now", "now");
  db.query("INSERT INTO dispatch_state(game_id,active_workflow_json,trace_id,created_at,updated_at) VALUES(?,?,?,?,?)").run("melee", JSON.stringify(active), "trace", "now", "now");
  const original = db.query("SELECT * FROM cycles").get(); db.close();
  const plan = { gameId: "melee", cycleUuid: "legacy-melee", originalWorktree: options.worktree, worktree: options.worktree, repository: options.worktree, storedHead, observedHead, syncId: "stale-sync", leaseId: "stale-lease", reason: "Verified clean descendant and abandoned Sync" };
  const reconciliationFile = join(options.stateDir, "reconciliation.json"); writeFileSync(reconciliationFile, JSON.stringify(plan));
  writeFileSync(reconciliationFile, JSON.stringify({ ...plan, leaseId: "different-lease" }));
  expect(() => runLegacyImport({ ...options, mode: "apply", reconciliationFile })).toThrow("exact blocked, unstaged, unpublished Sync");
  expect(readdirSync(options.stateDir).filter(name => name.includes("before-legacy-import"))).toEqual([]);
  writeFileSync(reconciliationFile, JSON.stringify(plan));
  writeFileSync(join(options.worktree, "source.c"), "unaccepted dirty change");
  expect(() => runLegacyImport({ ...options, mode: "apply", reconciliationFile })).toThrow("must be clean");
  git(options.worktree, ["restore", "source.c"]);
  const result = runLegacyImport({ ...options, mode: "apply", reconciliationFile }) as any;
  expect(result.state.source.head).toBe(observedHead);
  expect(result.state.readiness).toEqual({ build: "pending", sources: "pending", sandbox: "pending", evidence: "pending" });
  const read = new Database(join(options.stateDir, "orchestrator.sqlite"));
  expect(read.query("SELECT * FROM historical_cycles").get()).toEqual(original);
  expect(read.query("SELECT status FROM sync_state").get()).toEqual({ status: "cancelled" });
  expect(read.query("SELECT active_workflow_json FROM dispatch_state").get()).toEqual({ active_workflow_json: null });
  expect(read.query("SELECT COUNT(*) AS count FROM game_events").get()).toEqual({ count: 2 });
  expect(read.query("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 10 });
  const evidence = read.query("SELECT evidence_json FROM historical_cutover_reconciliations").get() as any;
  expect(JSON.parse(evidence.evidence_json).plan).toEqual(plan); read.close();
  expect(runLegacyImport({ ...options, mode: "apply", reconciliationFile })).toMatchObject({ alreadyMigrated: true, state: result.state });
});
