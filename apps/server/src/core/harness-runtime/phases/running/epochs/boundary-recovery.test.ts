import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openKnowledgeStore } from "@server/core/knowledge-v2/storage/store.js";
import { buildV2TargetCard } from "@server/core/knowledge-v2/card.js";
import { insertEvent, insertWorkerRun } from "@server/core/knowledge-v2/records/index.js";
import { reportBoundaryDisplacements, recordBoundaryRecovery } from "./boundary-recovery.js";

const roots: string[] = [];
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });

function report(functions: Record<string, unknown>[]) {
  return { units: [{ name: "mario/Enemy/test", metadata: { source_path: "src/Enemy/test.cpp" }, functions }] };
}
const revisions = { priorHeadSha: "a".repeat(40), resultingHeadSha: "b".repeat(40), upstreamHeadSha: "c".repeat(40) };

test("compares all function identities, including collateral losses, omitted zero scores and missing functions", () => {
  const items = reportBoundaryDisplacements({ ...revisions,
    before: report([{ name: "exact", fuzzy_match_percent: 100 }, { name: "partial", fuzzy_match_percent: 96 }, { name: "gone", fuzzy_match_percent: 88 }, { name: "better", fuzzy_match_percent: 20 }]),
    after: report([{ name: "exact", fuzzy_match_percent: 50 }, { name: "partial" }, { name: "better", fuzzy_match_percent: 100 }]),
  });
  expect(items.map((item) => [item.symbol, item.priorScore, item.afterScore])).toEqual([["exact", 100, 50], ["gone", 88, null], ["partial", 96, 0]]);
  expect(items.every((item) => item.sourcePath === "src/Enemy/test.cpp" && item.priorHeadSha === revisions.priorHeadSha)).toBe(true);
  expect(() => reportBoundaryDisplacements({ ...revisions, before: report([]), after: {} })).toThrow("nonempty function report");
});

test("writes exact-target recovery once, blocks missing identity, and preserves it in every worker budget", () => {
  const root = mkdtempSync(join(tmpdir(), "boundary-recovery-")); roots.push(root);
  const store = openKnowledgeStore({ knowledgeRoot: root });
  try {
    store.db.run("INSERT INTO entity (id, kind, locator, identity_status) VALUES ('unit', 'translation_unit', 'src/Enemy/test.cpp', 'active')");
    store.db.run("INSERT INTO target (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision) VALUES ('target', 'function', 'mario/Enemy/test', 'unit', 'exact', 'mario/Enemy/test:exact', '0x1', 'current', 'rev')");
    const item = reportBoundaryDisplacements({ ...revisions, before: report([{ name: "exact", fuzzy_match_percent: 100 }]), after: report([{ name: "exact", fuzzy_match_percent: 80 }]) })[0]!;
    const id = recordBoundaryRecovery(store, item);
    expect(recordBoundaryRecovery(store, item)).toBe(id);
    expect(store.db.query("SELECT COUNT(*) AS n FROM event").get()).toEqual({ n: 1 });
    expect(() => recordBoundaryRecovery(store, { ...item, targetKey: "mario/Enemy/test::missing" })).toThrow("no knowledge target");
    expect(() => recordBoundaryRecovery(store, { ...item, priorScore: 90 })).toThrow("Conflicting boundary recovery evidence");
    // Later attempts and large histories must not bury the cause or saved source.
    for (let i = 0; i < 24; i++) insertWorkerRun(store, {
      id: `run-${i}`, targetId: "target", goal: "retry", baseline: "{}", finalOutcome: "no_change", startedAt: "2099-01-01", closedAt: "2099-01-02",
    }, [{ id: `submission-${i}`, seq: 1, description: "Attempt details ".repeat(150), score: 80, submittedAt: "2099-01-02" }]);
    insertEvent(store, { id: "later-note", targetId: "target", kind: "note", cause: "upstream_change", summary: "Other finding", createdAt: "2099-01-03" }, []);
    for (const budget of ["full", "compact", "minimal"] as const) {
      const card = buildV2TargetCard(store, "mario/Enemy/test:exact", budget)!;
      expect(card.ledger.recovery?.summary).toContain("previously achieved 100%");
      expect(card.ledger.recovery?.summary).toContain(`${revisions.priorHeadSha}:src/Enemy/test.cpp`);
      expect(card.ledger.recovery?.refs).toHaveLength(3);
    }
  } finally { store.close(); }
});
