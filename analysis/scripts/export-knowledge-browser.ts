/** Refresh the read-only source snapshot used by the three Knowledge UI previews.
 * Run: bun analysis/scripts/export-knowledge-browser.ts
 * KB records still load live through the existing HTTP API. No server restart needed.
 */
import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { parser } from "@lezer/cpp";
import { renderSourceView, type SourceName, type SourceViewSymbol } from "../../apps/server/src/core/knowledge-v2/source-view";

const root = resolve(import.meta.dir, "../..");
const checkout = resolve(root, "games/melee/checkout");
const output = resolve(root, "apps/frontend/public/knowledge-source/melee");
const revision = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const db = new Database(resolve(root, "games/melee/knowledge/knowledge.sqlite"), { readonly: true });
const names = db.query<SourceName, []>(`SELECT t.symbol,t.stable_key,e.locator source_path,
 f.value,f.confidence,f.id fact_id,f.updated_at FROM target t JOIN entity e ON e.id=t.unit_entity_id
 LEFT JOIN fact f ON f.target_id=t.id AND f.type='inferred_name'
 WHERE t.kind='function' AND t.identity_status='current'`).all();
const bySymbol = new Map<string, SourceName[]>();
for (const name of names) bySymbol.set(name.symbol, [...bySymbol.get(name.symbol) ?? [], name]);
const units = db.query<{path: string; unit: string; targets: number; facts: number}, []>(`SELECT e.locator path,MIN(t.unit) unit,
 COUNT(DISTINCT t.id) targets,COUNT(f.id) facts FROM entity e JOIN target t ON t.unit_entity_id=e.id
 LEFT JOIN fact f ON f.target_id=t.id WHERE t.identity_status='current' GROUP BY e.id`).all();
const byPath = new Map(units.map((unit) => [unit.path, unit]));
const files: Array<{path: string; unit: string | null; targets: number; facts: number; lines: number}> = [];
function visit(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (/\.[ch]$/.test(entry.name)) {
      const sourcePath = relative(checkout, path);
      const canonical = readFileSync(path, "utf8");
      const words = new Set(canonical.match(/[A-Za-z_]\w*/g) ?? []);
      const relevant = [...words].flatMap((word) => bySymbol.get(word) ?? []);
      const parts: string[] = [];
      const symbols = new Map<string, SourceViewSymbol>();
      let startLine = 1;
      for (;;) {
        const view = renderSourceView({ path: sourcePath, source: canonical, names: relevant, startLine, maxLines: 100, maxChars: 64000 });
        if (view.status !== "ok") throw new Error(`${sourcePath}:${startLine}: ${view.status}`);
        if(view.symbols_omitted) throw new Error(`${sourcePath}:${startLine}: omitted ${view.symbols_omitted} symbols`);
        parts.push(view.content);
        for (const symbol of view.symbols) symbols.set(`${symbol.canonical}:${symbol.status}`, symbol);
        if (view.next_line === null) break;
        startLine = view.next_line;
      }
      const definitions: Record<string, number> = {};
      parser.parse(canonical).iterate({ enter(ref) {
        if (ref.name !== "FunctionDefinition") return;
        const id = ref.node.getChild("FunctionDeclarator")?.getChild("Identifier");
        if (id) definitions[canonical.slice(id.from,id.to)] = canonical.slice(0,ref.from).split("\n").length;
      }});
      const unit = byPath.get(sourcePath);
      const item = { path: sourcePath, unit: unit?.unit ?? null, targets: unit?.targets ?? 0, facts: unit?.facts ?? 0, lines: canonical.split("\n").length };
      files.push(item);
      const destination = resolve(output, `${sourcePath}.json`);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, JSON.stringify({ ...item, revision, canonical, rendered: parts.join("\n"), symbols: [...symbols.values()], definitions }));
      if (files.length % 500 === 0) console.log(`Exported ${files.length} source files`);
    }
  }
}
try {
  visit(resolve(checkout, "src"));
  files.sort((a,b) => a.path.localeCompare(b.path));
  writeFileSync(resolve(output, "manifest.json"), JSON.stringify({ revision, generatedAt: new Date().toISOString(), files }));
  console.log(`Exported ${files.length} files at ${revision.slice(0,10)}`);
} finally { db.close(); }

// Keep identity and proposal browsing metadata aligned with each source export.
await import("./export-knowledge-index");
