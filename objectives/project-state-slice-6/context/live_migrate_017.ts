/* Slice 6: apply migration 017 to the LIVE Melee DB exactly once, with verification. */
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";

const STATE_DIR = "/Users/Ford/Github Repos/oss/gamecube-decomp-harness/projects/melee/state";
const DB = `${STATE_DIR}/orchestrator.sqlite`;

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

const pre = new Database(DB, { readonly: true });
const preSnap = snapshot(pre);
const preMig = pre.query("SELECT * FROM schema_migrations ORDER BY 1").all();
pre.close();
const preLast = preMig.at(-1) as { version: number };
if (preLast.version !== 16) { console.log(`ABORT: live DB is at ${preLast.version}, expected 16`); process.exit(2); }

const { openState } = await import("/Users/Ford/Github Repos/oss/gamecube-decomp-harness/apps/server/src/core/orchestrator-state/storage/store.ts");
const store = openState(STATE_DIR);
const post = snapshot(store.db);
const postMig = store.db.query("SELECT * FROM schema_migrations ORDER BY 1").all();
const integrity = store.db.query("PRAGMA integrity_check").all();
const fk = store.db.query("PRAGMA foreign_key_check").all();
const objects = store.db.query("SELECT type, name FROM sqlite_master WHERE name LIKE 'background_knowledge_jobs%' ORDER BY type, name").all();
store.db.close();

const failures: string[] = [];
const postLast = postMig.at(-1) as { version: number; name: string };
if (postLast.version !== 17) failures.push(`did not reach 17: ${JSON.stringify(postLast)}`);
if (postMig.length !== preMig.length + 1) failures.push(`schema_migrations rows ${preMig.length} -> ${postMig.length}, expected exactly +1`);
for (const t of Object.keys(preSnap)) {
  if (t === "schema_migrations") continue;
  if (!post[t]) { failures.push(`table missing: ${t}`); continue; }
  if (preSnap[t].count !== post[t].count) failures.push(`count changed: ${t}`);
  if (preSnap[t].hash !== post[t].hash) failures.push(`content changed: ${t}`);
}
if (!post["background_knowledge_jobs"]) failures.push("background_knowledge_jobs missing");
else if (post["background_knowledge_jobs"].count !== 0) failures.push("background_knowledge_jobs not empty");
if (JSON.stringify(integrity) !== '[{"integrity_check":"ok"}]') failures.push(`integrity: ${JSON.stringify(integrity)}`);
if (fk.length) failures.push(`fk rows: ${fk.length}`);

console.log("last migration:", JSON.stringify(postLast));
console.log("017 objects:", JSON.stringify(objects));
console.log("pre-existing tables verified:", Object.keys(preSnap).length - 1);
console.log(failures.length ? `FAIL:\n- ${failures.join("\n- ")}` : "PASS: live DB migrated 16 -> 17 exactly once; integrity ok; fk clean; all pre-existing tables unchanged");
process.exit(failures.length ? 1 : 0);
