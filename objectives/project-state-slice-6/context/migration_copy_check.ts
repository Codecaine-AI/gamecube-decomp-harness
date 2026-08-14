/* Slice 6 migration-017 copy validation. Run from repo root with bun. */
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const BACKUP = process.env.BACKUP_PATH!;
const WORKDIR = "/tmp/slice6-mig";
rmSync(WORKDIR, { recursive: true, force: true });
mkdirSync(WORKDIR, { recursive: true });
const COPY = `${WORKDIR}/orchestrator.sqlite`;
cpSync(BACKUP, COPY);

function tables(db: Database): string[] {
  return (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(r => r.name);
}
function snapshot(db: Database) {
  const out: Record<string, { count: number; hash: string }> = {};
  for (const t of tables(db)) {
    const rows = db.query(`SELECT * FROM "${t}"`).values();
    const h = createHash("sha256");
    for (const row of rows) h.update(JSON.stringify(row));
    out[t] = { count: rows.length, hash: h.digest("hex").slice(0, 16) };
  }
  return out;
}
function migrations(db: Database) {
  return db.query("SELECT * FROM schema_migrations ORDER BY 1").all();
}

const pre = new Database(COPY);
const preSnap = snapshot(pre);
const preMig = migrations(pre);
const preTables = new Set(Object.keys(preSnap));
console.log("PRE: tables=%d, max migration=%s", preTables.size, JSON.stringify(preMig.at(-1)));
pre.close();

// Run 1
const { openState } = await import("/Users/Ford/Github Repos/oss/gamecube-decomp-harness/apps/server/src/core/orchestrator-state/storage/store.ts");
let store = openState(WORKDIR);
const mid = snapshot(store.db);
const midMig = migrations(store.db);
const integrity1 = store.db.query("PRAGMA integrity_check").all();
const fk1 = store.db.query("PRAGMA foreign_key_check").all();
store.db.close();

// Run 2 (idempotency)
store = openState(WORKDIR);
const post = snapshot(store.db);
const postMig = migrations(store.db);
const integrity2 = store.db.query("PRAGMA integrity_check").all();
const fk2 = store.db.query("PRAGMA foreign_key_check").all();
const newTables = Object.keys(post).filter(t => !preTables.has(t));
const schemaObjects = store.db.query("SELECT type, name FROM sqlite_master WHERE name LIKE '%background%knowledge%' OR name LIKE '%knowledge%job%' ORDER BY type, name").all();
store.db.close();

let failures: string[] = [];
if (JSON.stringify(midMig.at(-1)).indexOf("17") < 0) failures.push(`run1 did not reach migration 17: ${JSON.stringify(midMig.at(-1))}`);
if (JSON.stringify(midMig) !== JSON.stringify(postMig)) failures.push("run2 changed schema_migrations (not idempotent)");
for (const t of preTables) {
  if (!post[t]) { failures.push(`pre-existing table missing after migration: ${t}`); continue; }
  if (t === "schema_migrations") {
    if (post[t].count !== preSnap[t].count + 1) failures.push(`schema_migrations expected exactly one new row: ${preSnap[t].count} -> ${post[t].count}`);
    continue;
  }
  if (preSnap[t].count !== post[t].count) failures.push(`count changed: ${t} ${preSnap[t].count} -> ${post[t].count}`);
  if (preSnap[t].hash !== post[t].hash) failures.push(`content changed: ${t}`);
}
if (JSON.stringify(mid) !== JSON.stringify(post)) failures.push("second run altered data (not idempotent)");
if (JSON.stringify(integrity1) !== '[{"integrity_check":"ok"}]') failures.push(`integrity run1: ${JSON.stringify(integrity1)}`);
if (JSON.stringify(integrity2) !== '[{"integrity_check":"ok"}]') failures.push(`integrity run2: ${JSON.stringify(integrity2)}`);
if (fk1.length || fk2.length) failures.push(`foreign_key_check rows: ${fk1.length}/${fk2.length}`);
if (!newTables.length) failures.push("no new table created by migration 017");

console.log("pre-existing tables:", preTables.size, "| new tables:", JSON.stringify(newTables));
console.log("migration rows pre/mid/post:", preMig.length, midMig.length, postMig.length);
console.log("last migration:", JSON.stringify(postMig.at(-1)));
console.log("017 schema objects:", JSON.stringify(schemaObjects));
console.log(failures.length ? `FAIL:\n- ${failures.join("\n- ")}` : "PASS: migration 017 copy validation (twice, idempotent, integrity ok, fk ok, counts+content unchanged)");
process.exit(failures.length ? 1 : 0);
