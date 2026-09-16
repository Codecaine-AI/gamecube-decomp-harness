import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { gameConfigurationRevision } from "@server/core/game-registry/config-revision.js";
import { resolveGame } from "@server/core/game-registry/resolver.js";
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { configureConnection } from "../../ddl.js";
import { immediateTransaction } from "../../transaction.js";
import { storageMigrations, runStorageMigrations } from "../index.js";
import { databaseFingerprints } from "../007-retire-cycle-ownership.js";
import { transitionHarnessState } from "@server/core/harness-state/state.js";
import { readReconciliation, verifyReconciliation, applyReconciliation } from "./reconcile-cutover.js";
import { importLegacyHarness } from "./import-legacy-ownership.js";

export interface LegacyImportCliOptions {
  mode: "preview" | "apply";
  stateDir: string;
  gameId: string;
  worktree: string;
  configurationRevision?: string;
  orchestratorRoot?: string;
  commandId: string;
  reconciliationFile?: string;
}

export function parseLegacyImportArgs(args: string[]): LegacyImportCliOptions {
  const values = new Map<string, string>();
  let mode: LegacyImportCliOptions["mode"] | undefined;
  const names = ["--state-dir", "--game-id", "--worktree", "--configuration-revision", "--command-id", "--orchestrator-root", "--reconciliation-file"];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--preview" || arg === "--apply") {
      if (mode) throw new Error("Specify exactly one of --preview or --apply");
      mode = arg.slice(2) as LegacyImportCliOptions["mode"];
    } else {
      if (!names.includes(arg)) throw new Error(`Unknown argument: ${arg}`);
      if (values.has(arg)) throw new Error(`Duplicate argument: ${arg}`);
      const value = args[++i];
      if (!value?.trim() || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      values.set(arg, value);
    }
  }
  if (!mode) throw new Error("Specify exactly one of --preview or --apply");
  for (const name of names.filter(name => name !== "--configuration-revision" && name !== "--orchestrator-root" && name !== "--reconciliation-file")) if (!values.has(name)) throw new Error(`${name} is required`);
  return { mode, stateDir: resolve(values.get("--state-dir")!), gameId: values.get("--game-id")!,
    worktree: resolve(values.get("--worktree")!), configurationRevision: values.get("--configuration-revision"), orchestratorRoot: values.get("--orchestrator-root") ? resolve(values.get("--orchestrator-root")!) : undefined,
    reconciliationFile: values.get("--reconciliation-file"), commandId: values.get("--command-id")! };
}

function hasTable(db: Database, name: string): boolean {
  return Boolean(db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name));
}

function verifyLegacyWorktree(db: Database, cycles: Array<Record<string, unknown>>, options: LegacyImportCliOptions, gameDir: string) {
  const active = cycles.filter(cycle => ["active", "blocked", "closing"].includes(String(cycle.status)));
  if (active.length > 1) throw new Error("Multiple legacy owners require reconciliation before import");
  const owner = active[0] ?? cycles.at(-1);
  if (!owner) throw new Error(`No legacy history for ${options.gameId}`);
  const preparing = JSON.parse(String(owner.preparing_state_json ?? "{}"));
  const sync = preparing.sync ?? {};
  let expectedPath = [sync.cycleCurrentWorktreePath, sync.cycleWorktreePath, sync.cycle_current_worktree_path, sync.cycle_worktree_path]
    .find(value => typeof value === "string" && value.trim()) as string | undefined;
  if (!expectedPath && owner.active_run_id) {
    const run = db.query("SELECT game_repo_root FROM runs WHERE id = ? AND game_id = ? AND cycle_uuid = ?").get(String(owner.active_run_id), options.gameId, String(owner.cycle_uuid)) as { game_repo_root: string | null } | null;
    expectedPath = run?.game_repo_root ?? undefined;
  }
  if (!expectedPath) {
    const opened = db.query("SELECT payload_json FROM game_events WHERE game_id = ? AND subject_id = ? AND event_type = 'cycle.opened' ORDER BY sequence LIMIT 1").get(options.gameId, String(owner.cycle_uuid)) as { payload_json: string } | null;
    const identity = opened ? JSON.parse(opened.payload_json).worktree_identity : null;
    if (typeof identity === "string" && isAbsolute(identity)) expectedPath = identity;
  }
  expectedPath ??= resolve(gameDir, "worktrees", "cycles", String(owner.cycle_uuid), "current");
  if (!isAbsolute(expectedPath)) throw new Error("Legacy worktree identity must be an absolute persisted path");
  const reconciliation = readReconciliation(options.reconciliationFile);
  if (reconciliation) {
    const originals = verifyReconciliation(db, reconciliation, owner, expectedPath, options.worktree, options.gameId);
    return { cycleUuid: owner.cycle_uuid, worktree: realpathSync(options.worktree), head: reconciliation.observedHead, reconciliation, originals };
  }
  if (!existsSync(expectedPath) || !existsSync(options.worktree)) throw new Error(`Legacy worktree does not exist: ${expectedPath}`);
  const canonicalPath = realpathSync(expectedPath);
  if (realpathSync(options.worktree) !== canonicalPath) throw new Error(`Worktree path does not match selected legacy owner: expected ${canonicalPath}`);
  const git = (args: string[]): string => {
    const result = Bun.spawnSync(["git", "-C", options.worktree, ...args], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(`Legacy worktree Git validation failed: ${result.stderr.toString().trim()}`);
    return result.stdout.toString().trim();
  };
  if (realpathSync(git(["rev-parse", "--show-toplevel"])) !== canonicalPath) throw new Error("Provided worktree must name the legacy checkout root");
  const head = git(["rev-parse", "HEAD"]);
  if (!owner.head_revision || head !== owner.head_revision) throw new Error(`Worktree HEAD does not match selected legacy owner: expected ${String(owner.head_revision)}, found ${head}`);
  return { cycleUuid: owner.cycle_uuid, worktree: canonicalPath, head };
}

/** Opens an existing database read-only. Preview never migrates, replays spools, or creates state. */
export function runLegacyImport(options: LegacyImportCliOptions): Record<string, unknown> {
  const game = resolveGame({ gameId: options.gameId, orchestratorRoot: options.orchestratorRoot });
  const configurationRevision = gameConfigurationRevision(game);
  if (options.configurationRevision && options.configurationRevision !== configurationRevision) throw new Error("Configuration revision does not match the current resolved game; preview the import again");
  const dbPath = resolve(options.stateDir, "orchestrator.sqlite");
  if (!existsSync(dbPath)) throw new Error(`State database does not exist: ${dbPath}`);
  const snapshot = new Database(dbPath, { readonly: true });
  let inventory: Record<string, unknown>;
  let backupPath: string | undefined;
  try {
    if (hasTable(snapshot, "historical_harness_imports") && !hasTable(snapshot, "cycles")) {
      const imported = snapshot.query("SELECT command_id,checkpoint_json FROM historical_harness_imports WHERE game_id = ?").get(options.gameId) as { command_id: string; checkpoint_json: string } | null;
      const current = snapshot.query("SELECT state_json FROM harness_state WHERE game_id = ?").get(options.gameId) as { state_json: string } | null;
      if (!imported || !current) throw new Error(`No imported harness owner for ${options.gameId}`);
      const prior = JSON.parse(imported.checkpoint_json).input;
      if (imported.command_id !== options.commandId || prior.worktree !== options.worktree || prior.configurationRevision !== configurationRevision) throw new Error("Cutover is already complete with different import arguments");
      const reconciliation = readReconciliation(options.reconciliationFile);
      const priorReconciliation = hasTable(snapshot, "historical_cutover_reconciliations") ? snapshot.query("SELECT evidence_json FROM historical_cutover_reconciliations WHERE command_id=?").get(options.commandId) as { evidence_json: string } | null : null;
      if (JSON.stringify(reconciliation ?? null) !== JSON.stringify(priorReconciliation ? JSON.parse(priorReconciliation.evidence_json).plan : null)) throw new Error("Cutover is already complete with different reconciliation evidence");
      return { mode: options.mode, alreadyMigrated: true, state: JSON.parse(current.state_json), verification: databaseFingerprints(snapshot) };
    }
    const cycles = (hasTable(snapshot, "cycles")
      ? snapshot.query("SELECT * FROM cycles WHERE game_id = ? ORDER BY created_at, id").all(options.gameId) : []) as Array<Record<string, unknown>>;
    const timeline = hasTable(snapshot, "cycle_timeline_entries") && hasTable(snapshot, "cycles")
      ? snapshot.query("SELECT count(*) AS entries FROM cycle_timeline_entries t JOIN cycles c ON c.cycle_uuid = t.cycle_uuid WHERE c.game_id = ?").get(options.gameId) : { entries: 0 };
    const lease = hasTable(snapshot, "dispatch_state")
      ? snapshot.query("SELECT active_workflow_json FROM dispatch_state WHERE game_id = ?").get(options.gameId) : null;
    const upstreamAnchors = hasTable(snapshot, "game_upstream_anchors")
      ? snapshot.query("SELECT * FROM game_upstream_anchors WHERE game_id = ?").all(options.gameId) : [];
    const canonicalState = snapshot.query("SELECT name FROM pragma_table_info('harness_state') WHERE name='state_json'").get()
      ? snapshot.query("SELECT state_json FROM harness_state WHERE game_id = ?").get(options.gameId) : null;
    const worktreeIdentity = verifyLegacyWorktree(snapshot, cycles, options, game.gameDir);
    inventory = { worktreeIdentity, mode: options.mode, dbPath, gameId: options.gameId, worktree: options.worktree,
      configurationRevision, commandId: options.commandId, cycles, timeline, lease, upstreamAnchors, state: canonicalState };
    if (options.mode === "preview") return inventory;
    // SQLite includes committed WAL pages in this consistent standalone snapshot.
    // This must precede opening a writable connection or applying schema migrations.
    backupPath = `${dbPath}.before-legacy-import-${randomUUID()}.sqlite`;
    snapshot.query("VACUUM INTO ?").run(backupPath);
  } finally {
    snapshot.close();
  }
  try {
    const db = new Database(dbPath, { readwrite: true });
    try {
      // Recheck after obtaining the writable handle and before any schema or ownership write.
      configureConnection(db);
      const result = immediateTransaction(db, () => {
        const verified = verifyLegacyWorktree(db, db.query("SELECT * FROM cycles WHERE game_id = ? ORDER BY created_at, id").all(options.gameId) as Array<Record<string, unknown>>, options, game.gameDir);
        const applied = new Set((db.query("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map(row => row.version));
        for (const migration of storageMigrations.filter(migration => migration.version < 7)) {
          if (applied.has(migration.version)) continue;
          migration.up(db);
          db.query("INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)").run(migration.version, migration.name, new Date().toISOString());
        }
        const reconciliationEvents = verified.reconciliation ? applyReconciliation(db, verified.reconciliation, options.commandId, verified.originals!) : undefined;
        let state = importLegacyHarness(db, { gameId: options.gameId, worktree: options.worktree,
          configurationRevision, commandId: options.commandId, reconciledHead: verified.reconciliation?.observedHead });
        if (verified.reconciliation) state = transitionHarnessState(db, {
          gameId: options.gameId, commandId: `${options.commandId}:reconciliation`, expectedRevision: state.identity.revision, patch: {},
          boundary: { eventId: `${options.commandId}:reconciliation`, kind: "legacy", outcome: "ownership_reconciled", syncId: verified.reconciliation.syncId,
            source: { prior_head: verified.reconciliation.storedHead, resulting_head: verified.reconciliation.observedHead },
            evidence: { ...verified.reconciliation, ...reconciliationEvents } },
        });
        runStorageMigrations(db);
        return { state, reconciliationEvents, verification: databaseFingerprints(db) };
      });
      return { ...inventory, backupPath, ...result };
    } finally {
      db.close();
    }
  } catch (cause) {
    throw new Error(`Legacy import failed. Pre-migration recovery database: ${backupPath}. ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(runLegacyImport(parseLegacyImportArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
