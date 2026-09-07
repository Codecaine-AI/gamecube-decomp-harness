import { Database } from "bun:sqlite";
import { normalizeKnowledgeNames, type NameCleanupItem } from "../../apps/server/src/core/knowledge-v2/migration/normalize-names.js";
import { inferredNameProblem } from "../../apps/server/src/core/knowledge-v2/naming.js";

const applying = Bun.argv.includes("--apply");
const root = import.meta.dir;
const db = new Database("games/melee/knowledge/knowledge.sqlite", applying ? { readwrite: true } : { readonly: true });
db.exec("PRAGMA busy_timeout=10000");
try {
  const plan = await Bun.file(`${root}/apply-plan.json`).json() as NameCleanupItem[];
  const paths = await Bun.file(`${root}/live-cleanup-paths.json`).json();
  if (applying && !(await Bun.file(paths.backup).exists())) throw new Error("Full backup is missing");
  const result = normalizeKnowledgeNames(db, plan, { apply: applying, archivePath: paths.archive });
  const rows = db.query<any, []>(`SELECT f.id, f.value, t.kind target_kind, t.symbol, e.kind entity_kind
    FROM fact f LEFT JOIN target t ON t.id=f.target_id LEFT JOIN entity e ON e.id=f.entity_id
    WHERE f.type='inferred_name'`).all();
  const invalid = rows.flatMap((row) => {
    const problem = inferredNameProblem(row.value, { targetKind: row.target_kind, symbol: row.symbol, entityKind: row.entity_kind });
    return problem ? [{ ...row, problem }] : [];
  });
  const report = { ...result, remaining_names: rows.length, invalid_remaining: invalid, backup: paths.backup, archive: paths.archive };
  if (applying) await Bun.write(`${root}/live-cleanup-result.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (applying && invalid.length) process.exitCode = 1;
} finally { db.close(); }
