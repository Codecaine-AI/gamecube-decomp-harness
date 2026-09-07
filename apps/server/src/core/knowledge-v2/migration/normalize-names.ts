/** Guarded maintenance of naming format. Semantic explanations stay in rationale. */
import { writeFileSync } from "node:fs";
import type { Database } from "bun:sqlite";
import { inferredNameProblem } from "../naming.js";
import { immediateTransaction } from "../storage/transaction.js";

export interface NameCleanupItem {
  id: string;
  expected: { value: string; rationale: string; updatedAt: string; confidence: number };
  action: "write" | "clear";
  value: string;
  reason: string;
}

interface NameRow {
  id: string; value: string; rationale: string; updated_at: string; confidence: number;
  target_id: string | null; entity_id: string | null;
  target_kind: "function" | "data" | null; symbol: string | null; entity_kind: string | null;
}

export function normalizeKnowledgeNames(db: Database, plan: readonly NameCleanupItem[], options: {
  apply?: boolean;
  archivePath?: string;
  now?: string;
}) {
  const execute = () => {
    const ids = new Set<string>();
    const changes: Array<{ item: NameCleanupItem; row: NameRow }> = [];
    const read = db.query<NameRow, [string]>(`SELECT f.*, t.kind target_kind, t.symbol, e.kind entity_kind
      FROM fact f LEFT JOIN target t ON t.id=f.target_id LEFT JOIN entity e ON e.id=f.entity_id
      WHERE f.id=? AND f.type='inferred_name'`);
    for (const item of plan) {
      if (ids.has(item.id)) throw new Error(`Duplicate fact ${item.id}`);
      ids.add(item.id);
      const row = read.get(item.id);
      if (!row || row.value !== item.expected.value || row.rationale !== item.expected.rationale
        || row.updated_at !== item.expected.updatedAt || row.confidence !== item.expected.confidence) {
        throw new Error(`Stale naming plan for ${item.id}; rebuild before applying`);
      }
      if (!item.reason.trim()) throw new Error(`Missing cleanup reason for ${item.id}`);
      if (item.action === "write") {
        const problem = inferredNameProblem(item.value, {
          targetKind: row.target_kind ?? undefined, symbol: row.symbol, entityKind: row.entity_kind ?? undefined,
        });
        if (problem) throw new Error(`${problem}: ${item.id}: ${item.value}`);
        if (item.value === row.value) continue;
      } else if (item.action !== "clear" || item.value !== "") {
        throw new Error(`Invalid cleanup action for ${item.id}`);
      }
      changes.push({ item, row });
    }
    const report = {
      checked: plan.length,
      updated: changes.filter(({ item }) => item.action === "write").length,
      cleared: changes.filter(({ item }) => item.action === "clear").length,
      unchanged: plan.length - changes.length,
      applied: options.apply === true,
    };
    if (!options.apply) return report;
    if (!options.archivePath) throw new Error("An archive path is required before applying names");
    // Save exact before-images, including evidence, before touching any row.
    const archive = changes.map(({ item, row }) => ({
      operation: item,
      fact: db.query("SELECT * FROM fact WHERE id=?").get(row.id),
      evidence: db.query("SELECT * FROM evidence WHERE fact_id=? ORDER BY id").all(row.id),
    }));
    writeFileSync(options.archivePath, archive.map((entry) => JSON.stringify(entry)).join("\n") + "\n", { flag: "wx" });
    const timestamp = options.now ?? new Date().toISOString();
    for (const { item, row } of changes) {
      if (item.action === "clear") {
        // Explicit evidence deletion also works with foreign_keys disabled on a maintenance connection.
        db.query("DELETE FROM evidence WHERE fact_id=?").run(row.id);
        db.query("DELETE FROM fact WHERE id=?").run(row.id);
      } else {
        const rationale = `${row.rationale}\n\nNaming cleanup: ${item.reason}\nPrior naming claim: ${row.value}`;
        db.query("UPDATE fact SET value=?, rationale=?, updated_at=? WHERE id=?").run(item.value, rationale, timestamp, row.id);
      }
    }
    return report;
  };
  return options.apply ? immediateTransaction(db, execute) : execute();
}
