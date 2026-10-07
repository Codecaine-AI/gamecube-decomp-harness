// Read-only access to harness history (plan §6.9, §11 item 20). History lives
// under `<source-root>/games/<game>/runtime/`, which is git-ignored, so every
// command that reads it takes an explicit `--source-root` and never writes
// there: files are read through read-only handles, and `orchestrator.sqlite`
// is opened read-only and immutable, so SQLite takes no locks and never
// touches the `-shm`/`-wal` files. A database with an unflushed WAL cannot be
// read immutably; it is snapshotted (database + WAL, read-only copies) into a
// temp directory and read there.
import { Database } from "bun:sqlite";
import { closeSync, copyFileSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/** The checkout root the history recorded in absolute paths before the move to `~/workspace`. */
export const LEGACY_HARNESS_ROOT = "/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/";

export interface ReadOnlySqlite {
  db: Database;
  close(): void;
}

function sqliteUri(path: string, params: string): string {
  return `file:${path.split("/").map(encodeURIComponent).join("/")}?${params}`;
}

/** Opens a SQLite file without any write to it or its sidecar files. */
export function openSqliteReadOnly(path: string): ReadOnlySqlite {
  if (!existsSync(path)) throw new Error(`SQLite database not found: ${path}`);
  const wal = `${path}-wal`;
  if (!existsSync(wal) || statSync(wal).size === 0) {
    const db = new Database(sqliteUri(path, "mode=ro&immutable=1"), { readonly: true });
    return { db, close: () => db.close() };
  }
  const snapshotDir = mkdtempSync(join(tmpdir(), "advisory-calibration-db-"));
  const copy = join(snapshotDir, "snapshot.sqlite");
  copyFileSync(path, copy);
  copyFileSync(wal, `${copy}-wal`);
  const db = new Database(copy, { readonly: true });
  return {
    db,
    close: () => {
      db.close();
      rmSync(snapshotDir, { recursive: true, force: true });
    },
  };
}

export interface SourceRoot {
  /** Absolute source root. */
  root: string;
  game: string;
  runtimeDir: string;
  stateDir: string;
  runsDir: string;
  orchestratorDbPath: string;
  /** Root-relative form of a recorded path (legacy or current root, legacy `games/<g>/state/` layout mapped to `runtime/state/`); null outside the root. */
  relative(recorded: string): string | null;
  /** The recorded path under this source root; null outside the root. */
  rebase(recorded: string): string | null;
  /** File text through a read-only handle; null when missing. Throws for paths outside the root. */
  readText(path: string): string | null;
  /** The orchestrator store, read-only (caller closes). */
  openOrchestratorDb(): ReadOnlySqlite;
}

export function openSourceRoot(dir: string, game: string): SourceRoot {
  if (!dir) throw new Error("--source-root is required (no default: history is never read from the working tree)");
  if (!/^[A-Za-z0-9_-]+$/.test(game)) throw new Error(`invalid --game ${game}`);
  const root = resolve(dir);
  const runtimeDir = join(root, "games", game, "runtime");
  const stateDir = join(runtimeDir, "state");
  if (!existsSync(stateDir)) throw new Error(`no history under --source-root: ${stateDir} does not exist`);
  const legacyState = `games/${game}/state/`;
  const currentState = `games/${game}/runtime/state/`;
  const toRelative = (recorded: string): string | null => {
    let rel: string | null = null;
    if (recorded.startsWith(LEGACY_HARNESS_ROOT)) rel = recorded.slice(LEGACY_HARNESS_ROOT.length);
    else if (recorded.startsWith(`${root}${sep}`)) rel = recorded.slice(root.length + 1);
    else if (!isAbsolute(recorded)) rel = recorded;
    if (rel === null || rel.split("/").includes("..")) return null;
    return rel.startsWith(legacyState) ? currentState + rel.slice(legacyState.length) : rel;
  };
  const inside = (path: string): boolean => {
    const rel = relative(root, resolve(path));
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  };
  return {
    root,
    game,
    runtimeDir,
    stateDir,
    runsDir: join(stateDir, "runs"),
    orchestratorDbPath: join(stateDir, "orchestrator.sqlite"),
    relative: toRelative,
    rebase(recorded) {
      const rel = toRelative(recorded);
      return rel === null ? null : join(root, rel);
    },
    readText(path) {
      if (!inside(path)) throw new Error(`refusing to read outside --source-root: ${path}`);
      if (!existsSync(path) || !statSync(path).isFile()) return null;
      const fd = openSync(path, "r");
      try {
        return readFileSync(fd, "utf8");
      } finally {
        closeSync(fd);
      }
    },
    openOrchestratorDb: () => openSqliteReadOnly(join(stateDir, "orchestrator.sqlite")),
  };
}
