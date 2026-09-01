import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { isNamedSymbol, prioritizeTargets } from "./prioritize.js";

const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function openFixture(): KnowledgeStore {
  const dir = mkdtempSync(join(tmpdir(), "knowledge-v2-prioritize-"));
  tempDirs.push(dir);
  const store = openKnowledgeStore({ knowledgeRoot: dir });
  stores.push(store);
  return store;
}

function addTranslationUnit(store: KnowledgeStore, id: string, locator = `src/${id}.c`): void {
  store.db.query(`INSERT INTO entity
    (id, kind, locator, identity_status)
    VALUES (?, 'translation_unit', ?, 'active')`).run(id, locator);
}

function addTarget(
  store: KnowledgeStore,
  id: string,
  symbol = id,
  unitEntityId = "parent",
  kind: "function" | "data" = "function",
  unit = unitEntityId,
): void {
  store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'current', 'rev-1')
  `).run(id, kind, unit, unitEntityId, symbol, `${unit}:${symbol}`, `0x${id.length.toString(16).padStart(8, "0")}`);
}

function addRun(store: KnowledgeStore, id: string, targetId: string, submissions = 0): void {
  store.db.query(`INSERT INTO worker_run
    (id, target_id, goal, baseline, final_outcome, started_at, closed_at)
    VALUES (?, ?, 'goal', '{}', 'no_change', '2026-01-01', '2026-01-02')`).run(id, targetId);
  const insert = store.db.query(`INSERT INTO submission
    (id, worker_run_id, seq, description, score, submitted_at) VALUES (?, ?, ?, 'try', 0, '2026-01-01')`);
  for (let seq = 1; seq <= submissions; seq += 1) insert.run(`${id}-s${seq}`, id, seq);
}

function addDiscord(store: KnowledgeStore, id: string, content: string): void {
  store.db.query(`INSERT INTO discord_message
    (id, channel, author, posted_at, content, ingested_at)
    VALUES (?, 'dev', 'author', '2026-01-01', ?, '2026-01-02')`).run(id, content);
}

function addStatus(store: KnowledgeStore, targetId: string, matchPct: number, linked = true): void {
  store.db.query(`INSERT INTO target_status
    (target_id, match_pct, linked, report_revision, updated_at)
    VALUES (?, ?, ?, 'rev-1', '2026-01-01')`).run(targetId, matchPct, Number(linked));
}

test("isNamedSymbol distinguishes generated address labels from real names", () => {
  const cases: Array<[string, boolean]> = [
    ["ftCo_800BFFD0", false],
    ["gm_8017CE34", false],
    ["hsd_8039930C", false],
    ["lbl_800BFFD0", false],
    ["fn_800BFFD0", false],
    ["unk_something", false],
    ["Fighter_ChangeMotionState", true],
    ["psDispParticles", true],
  ];
  for (const [symbol, expected] of cases) expect(isNamedSymbol(symbol)).toBe(expected);
});

describe("prioritizeTargets", () => {
  test("computes exact weighted scores and deterministic ranking", () => {
    const store = openFixture();
    addTranslationUnit(store, "parent");
    addTarget(store, "a", "Alpha");
    addTarget(store, "b", "Beta");
    addTarget(store, "c", "Gamma");
    addRun(store, "run-a", "a", 2);
    store.db.query("INSERT INTO event (id, target_id, kind, summary, created_at) VALUES ('event-a', 'a', 'note', 'note', '2026-01-01')").run();
    store.db.query("INSERT INTO pull_request (id, target_id, pr_ref, summary, outcome, merged_at) VALUES ('pr-b', 'b', 'pr://1', 'work', 'improvement', '2026-01-01')").run();
    addDiscord(store, "discord-c", "Gamma is discussed here");

    const result = prioritizeTargets(store);

    expect(result.rows.map((row) => [row.target_id, row.score])).toEqual([["a", 7], ["c", 5], ["b", 4]]);
    expect(result.rows[0]).toMatchObject({ attempts_runs: 1, attempts_submissions: 2, events: 1 });
  });

  test("matches case-sensitive whole tokens and counts each message once", () => {
    const store = openFixture();
    addTranslationUnit(store, "parent");
    addTarget(store, "base", "ftCo_800BFFD0");
    addTarget(store, "helper", "ftCo_800BFFD0_helper");
    addDiscord(store, "base-twice", "Use `ftCo_800BFFD0`, then ftCo_800BFFD0.");

    const rows = prioritizeTargets(store, undefined, { includeZeroMaterial: true }).rows;

    expect(rows.find((row) => row.target_id === "base")).toMatchObject({
      discord: 1,
      unit_discord: 0,
      direct_score: 5,
      inherited_score: 0,
    });
    expect(rows.find((row) => row.target_id === "helper")).toMatchObject({
      discord: 0,
      unit_discord: 0,
      direct_score: 0,
      inherited_score: 0,
    });
    expect(prioritizeTargets(store).rows.map((row) => row.target_id)).toEqual(["base"]);
  });

  test("matches dotted translation unit locator basenames for member targets", () => {
    const store = openFixture();
    addTranslationUnit(store, "fighter-unit", "src/fighter.c");
    addTarget(store, "fighter-member", "FighterFn", "fighter-unit", "function", "main/melee/ft/fighter");
    addDiscord(store, "fighter-stem", "fighter appears without its extension");
    addDiscord(store, "fighter-file", "the file is fighter.c");

    const rows = prioritizeTargets(store, undefined, { includeZeroMaterial: true }).rows;

    expect(rows.find((row) => row.target_id === "fighter-member")).toMatchObject({
      discord: 0,
      unit_discord: 1,
      direct_score: 0,
      inherited_score: 1,
      score: 1,
    });
    expect(prioritizeTargets(store).rows).toHaveLength(0);
  });

  test("attributes a dual symbol and unit basename match independently", () => {
    const store = openFixture();
    addTranslationUnit(store, "fighter-unit", "src/fighter.c");
    addTarget(store, "fighter-member", "fighter.c", "fighter-unit");
    addDiscord(store, "fighter-file", "fighter.c");

    const row = prioritizeTargets(store).rows[0];

    expect(row).toMatchObject({ discord: 1, unit_discord: 1, direct_score: 5, inherited_score: 1, score: 6 });
  });

  test("does not match a unit's last segment when it differs from the source basename", () => {
    const store = openFixture();
    addTranslationUnit(store, "unit-entity", "src/fighter.c");
    addTarget(store, "unit-member", "CombatantFn", "unit-entity", "function", "main/melee/ft/combatant");
    addDiscord(store, "unit-segment", "combatant appears without a source filename");

    const rows = prioritizeTargets(store, undefined, { includeZeroMaterial: true }).rows;

    expect(rows.find((row) => row.target_id === "unit-member")?.discord).toBe(0);
  });

  test("drops ambiguous bare symbols but keeps specific lowercase C symbols", () => {
    const store = openFixture();
    addTranslationUnit(store, "parent");
    addTarget(store, "main-target", "main");
    addTarget(store, "memcpy-target", "memcpy");
    addDiscord(store, "main-message", "main appears in ordinary prose");
    addDiscord(store, "memcpy-message", "memcpy copies the bytes");

    const rows = prioritizeTargets(store, undefined, { includeZeroMaterial: true }).rows;

    expect(rows.find((row) => row.target_id === "main-target")?.discord).toBe(0);
    expect(rows.find((row) => row.target_id === "memcpy-target")?.discord).toBe(1);
  });

  test("does not directly match data section names in discord", () => {
    const store = openFixture();
    addTranslationUnit(store, "extab-unit", "src/extab.c");
    addTarget(store, "extab-data", "extab", "extab-unit", "data");
    addTarget(store, "function-target", "RealFunction", "extab-unit");
    addDiscord(store, "section-message", "extab appears in ordinary discussion");
    addDiscord(store, "function-message", "RealFunction is discussed in extab.c");

    const rows = prioritizeTargets(store, undefined, { includeZeroMaterial: true }).rows;

    expect(rows.find((row) => row.target_id === "extab-data")).toMatchObject({
      discord: 0, unit_discord: 1, direct_score: 0, inherited_score: 1, named_symbol: false,
    });
    expect(rows.find((row) => row.target_id === "function-target")).toMatchObject({
      discord: 1, unit_discord: 1, direct_score: 5, inherited_score: 1,
    });
  });

  test("data targets never receive the named-symbol tier", () => {
    const store = openFixture();
    addTranslationUnit(store, "parent");
    addTarget(store, "data", "Fighter_ChangeMotionState", "parent", "data");

    expect(prioritizeTargets(store, undefined, { includeZeroMaterial: true }).rows[0]).toMatchObject({
      kind: "data", named_symbol: false,
    });
  });

  test("ranks knowledge-confidence tiers before material volume", () => {
    const store = openFixture();
    addTranslationUnit(store, "parent");
    addTarget(store, "matched", "KnownFunction");
    addTarget(store, "partial", "PartialFunction");
    addTarget(store, "unknown", "UnknownFunction");
    addStatus(store, "matched", 100);
    addStatus(store, "partial", 90, false);
    addRun(store, "matched-run", "matched");
    for (let index = 0; index < 20; index += 1) addRun(store, `partial-run-${index}`, "partial", 3);
    for (let index = 0; index < 20; index += 1) addRun(store, `unknown-run-${index}`, "unknown", 3);

    const rows = prioritizeTargets(store).rows;

    expect(rows.map((row) => row.target_id)).toEqual(["matched", "partial", "unknown"]);
    expect(rows[0]!.direct_score).toBeLessThan(rows[1]!.direct_score);
  });

  test("puts never-indexed targets first and reports index state", () => {
    const store = openFixture();
    addTranslationUnit(store, "parent");
    addTarget(store, "never", "NeverFn");
    addTarget(store, "stamped", "StampedFn");
    addDiscord(store, "never-msg", "NeverFn");
    addRun(store, "stamped-run-1", "stamped", 2);
    addRun(store, "stamped-run-2", "stamped", 2);
    store.db.query("INSERT INTO subject_index_state (target_id, indexed_at) VALUES ('stamped', '2026-02-03T04:05:06Z')").run();

    const rows = prioritizeTargets(store).rows;

    expect(rows.map((row) => row.target_id)).toEqual(["never", "stamped"]);
    expect(rows[0]).toMatchObject({ indexed_at: null, never_indexed: true });
    expect(rows[1]).toMatchObject({ indexed_at: "2026-02-03T04:05:06Z", never_indexed: false });
    expect(rows[1]!.score).toBeGreaterThan(rows[0]!.score);
  });

  test("credits a unit-attributed PR to every member target only", () => {
    const store = openFixture();
    addTranslationUnit(store, "unit-a", "src/unita.c");
    addTranslationUnit(store, "unit-b");
    addTarget(store, "function-a", "FunctionA", "unit-a");
    addTarget(store, "data-a", ".data", "unit-a", "data");
    addTarget(store, "function-b", "FunctionB", "unit-b");
    store.db.query(`INSERT INTO pull_request
      (id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES ('unit-pr', 'unit-a', 'pr://1', 'unit work', 'improvement', '2026-01-01')`).run();
    addDiscord(store, "unit-message", "work continues in unita.c");

    const result = prioritizeTargets(store, undefined, { includeZeroMaterial: true });

    expect(result.rows.find((row) => row.target_id === "function-a")).toMatchObject({
      prs: 0, unit_prs: 1, discord: 0, unit_discord: 1, direct_score: 0, inherited_score: 2, score: 2,
    });
    expect(result.rows.find((row) => row.target_id === "data-a")).toMatchObject({
      prs: 0, unit_prs: 1, discord: 0, unit_discord: 1, direct_score: 0, inherited_score: 2, score: 2,
    });
    expect(result.rows.find((row) => row.target_id === "function-b")).toMatchObject({
      prs: 0, unit_prs: 0, discord: 0, unit_discord: 0, direct_score: 0, inherited_score: 0, score: 0,
    });
    expect(prioritizeTargets(store).rows).toHaveLength(0);
    expect(result.summary.targets_with_direct_material).toBe(0);
    expect(result.summary.targets_with_inherited_only).toBe(2);
    expect(result.summary.source_coverage.unit_prs).toBe(2);
    expect(result.summary.source_coverage.unit_discord).toBe(2);
    expect(result.summary.inherited_histogram).toEqual({
      "0": 1, "1": 0, "2-5": 2, "6-10": 0, "11-25": 0, "26-100": 0, "100+": 0,
    });
  });

  test("weights a direct PR strictly above a unit-attributed PR", () => {
    const store = openFixture();
    addTranslationUnit(store, "direct-unit");
    addTranslationUnit(store, "attributed-unit");
    addTarget(store, "direct", "DirectFn", "direct-unit");
    addTarget(store, "attributed", "AttributedFn", "attributed-unit");
    store.db.query(`INSERT INTO pull_request
      (id, target_id, pr_ref, summary, outcome, merged_at)
      VALUES ('direct-pr', 'direct', 'pr://1', 'direct work', 'improvement', '2026-01-01')`).run();
    store.db.query(`INSERT INTO pull_request
      (id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES ('unit-pr', 'attributed-unit', 'pr://2', 'unit work', 'improvement', '2026-01-01')`).run();

    const defaultRows = prioritizeTargets(store).rows;
    const rows = prioritizeTargets(store, undefined, { includeZeroMaterial: true }).rows;

    expect(defaultRows.map((row) => row.target_id)).toEqual(["direct"]);
    expect(rows.map((row) => row.target_id)).toEqual(["direct", "attributed"]);
    expect(rows[0]).toMatchObject({ prs: 1, unit_prs: 0, direct_score: 4, inherited_score: 0, score: 4 });
    expect(rows[1]).toMatchObject({ prs: 0, unit_prs: 1, direct_score: 0, inherited_score: 1, score: 1 });
  });

  test("uses inherited material only to break equal-direct-score ties", () => {
    const store = openFixture();
    addTranslationUnit(store, "more-unit");
    addTranslationUnit(store, "z-tie-high-unit");
    addTranslationUnit(store, "a-tie-low-unit");
    addTarget(store, "more-direct", "MoreDirect", "more-unit");
    addTarget(store, "tie-high", "TieHigh", "z-tie-high-unit");
    addTarget(store, "tie-low", "TieLow", "a-tie-low-unit");
    store.db.query(`INSERT INTO pull_request
      (id, target_id, pr_ref, summary, outcome, merged_at)
      VALUES ('direct-pr', 'more-direct', 'pr://direct', 'direct work', 'improvement', '2026-01-01')`).run();
    store.db.query(`INSERT INTO event (id, target_id, kind, summary, created_at)
      VALUES ('event-high', 'tie-high', 'note', 'note', '2026-01-01')`).run();
    store.db.query(`INSERT INTO event (id, target_id, kind, summary, created_at)
      VALUES ('event-low', 'tie-low', 'note', 'note', '2026-01-01')`).run();
    const addUnitPr = store.db.query(`INSERT INTO pull_request
      (id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES (?, 'z-tie-high-unit', ?, 'unit work', 'improvement', '2026-01-01')`);
    for (let index = 0; index < 10; index += 1) addUnitPr.run(`unit-pr-${index}`, `pr://unit-${index}`);

    const rows = prioritizeTargets(store).rows;

    expect(rows.map((row) => row.target_id)).toEqual(["more-direct", "tie-high", "tie-low"]);
    expect(rows.find((row) => row.target_id === "more-direct")).toMatchObject({
      direct_score: 4, inherited_score: 0, score: 4,
    });
    expect(rows.find((row) => row.target_id === "tie-high")).toMatchObject({
      direct_score: 2, inherited_score: 10, score: 12,
    });
    expect(rows.find((row) => row.target_id === "tie-low")).toMatchObject({
      direct_score: 2, inherited_score: 0, score: 2,
    });
  });

  test("does not mutate the knowledge store", () => {
    const store = openFixture();
    addTranslationUnit(store, "parent");
    addTarget(store, "target", "TargetFn");
    store.db.query("INSERT INTO target_status VALUES ('target', 42, 1, NULL, NULL, 'rev-1', '2026-01-01')").run();
    addRun(store, "run", "target", 1);
    store.db.query("INSERT INTO pull_request VALUES ('pr', 'target', NULL, 'pr://1', 'summary', 'improvement', '2026-01-01')").run();
    store.db.query("INSERT INTO event VALUES ('event', 'target', 'note', NULL, 'summary', '2026-01-01')").run();
    addDiscord(store, "message", "TargetFn");
    store.db.query("INSERT INTO subject_index_state (target_id, indexed_at) VALUES ('target', '2026-01-01')").run();
    const tables = ["target", "target_status", "worker_run", "submission", "pull_request", "event", "discord_message", "subject_index_state"];
    const snapshot = () => ({
      dataVersion: store.db.query<{ data_version: number }, []>("PRAGMA data_version").get()!.data_version,
      counts: Object.fromEntries(tables.map((table) => [table, store.db.query<{ c: number }, []>(`SELECT COUNT(*) AS c FROM ${table}`).get()!.c])),
    });
    const before = snapshot();

    prioritizeTargets(store);

    expect(snapshot()).toEqual(before);
  });

  test("summarizes all targets before filtering and limiting", () => {
    const store = openFixture();
    addTranslationUnit(store, "parent");
    addTarget(store, "one", "OneFn");
    addTarget(store, "many", "ManyFn");
    addTarget(store, "zero", "ZeroFn");
    addDiscord(store, "one-message", "OneFn");
    addRun(store, "many-run", "many", 3);

    const limited = prioritizeTargets(store, undefined, { limit: 1 });

    expect(limited.rows).toHaveLength(1);
    expect(limited.summary).toEqual({
      total_targets: 3,
      targets_with_direct_material: 2,
      targets_with_inherited_only: 0,
      never_indexed: 3,
      material_histogram: { "0": 1, "1": 1, "2-5": 1, "6-10": 0, "11-25": 0, "26-100": 0, "100+": 0 },
      inherited_histogram: { "0": 3, "1": 0, "2-5": 0, "6-10": 0, "11-25": 0, "26-100": 0, "100+": 0 },
      source_coverage: { attempts: 1, prs: 0, unit_prs: 0, discord: 1, unit_discord: 0, wiki: 0, events: 0 },
      match_pct: { at_100: 0, below_100: 0, unknown: 2 },
      tier_breakdown: {
        "matched=0|linked=0|named=0": 0,
        "matched=0|linked=0|named=1": 2,
        "matched=0|linked=1|named=0": 0,
        "matched=0|linked=1|named=1": 0,
        "matched=1|linked=0|named=0": 0,
        "matched=1|linked=0|named=1": 0,
        "matched=1|linked=1|named=0": 0,
        "matched=1|linked=1|named=1": 0,
      },
      unit_named_ratio_histogram: { "0": 0, "<0.25": 0, "<0.5": 0, "<0.75": 0, "<1": 0, "1": 2 },
    });
    expect(prioritizeTargets(store).rows.some((row) => row.target_id === "zero")).toBe(false);
    expect(prioritizeTargets(store, undefined, { includeZeroMaterial: true }).rows.some((row) => row.target_id === "zero")).toBe(true);
  });

  test("summarizes match percentages only for targets with direct material", () => {
    const store = openFixture();
    addTranslationUnit(store, "parent");
    addTarget(store, "matched", "ZMatchedFn");
    addTarget(store, "partial", "APartialFn");
    addTarget(store, "unknown", "MUnknownFn");
    addTarget(store, "no-direct", "NoDirectFn");
    addStatus(store, "matched", 100);
    addStatus(store, "partial", 99);
    addStatus(store, "no-direct", 100);
    addRun(store, "matched-run", "matched");
    addRun(store, "partial-run", "partial");
    addRun(store, "unknown-run", "unknown");

    const result = prioritizeTargets(store);

    expect(result.summary.match_pct).toEqual({ at_100: 1, below_100: 1, unknown: 1 });
    expect(result.rows.map((row) => row.target_id)).toEqual(["matched", "partial", "unknown"]);
  });

  test("summarizes all eight direct-material tier cells", () => {
    const store = openFixture();
    addTranslationUnit(store, "parent");
    addTarget(store, "matched-linked-named", "KnownFunction");
    addTarget(store, "partial-unlinked-generated", "fn_800BFFD0");
    addTarget(store, "data", "RealLookingData", "parent", "data");
    addTarget(store, "no-material", "NoMaterial");
    addStatus(store, "matched-linked-named", 100);
    addStatus(store, "partial-unlinked-generated", 50, false);
    addStatus(store, "data", 100);
    addStatus(store, "no-material", 100);
    addRun(store, "named-run", "matched-linked-named");
    addRun(store, "generated-run", "partial-unlinked-generated");
    addRun(store, "data-run", "data");

    expect(prioritizeTargets(store).summary.tier_breakdown).toEqual({
      "matched=0|linked=0|named=0": 1,
      "matched=0|linked=0|named=1": 0,
      "matched=0|linked=1|named=0": 0,
      "matched=0|linked=1|named=1": 0,
      "matched=1|linked=0|named=0": 0,
      "matched=1|linked=0|named=1": 0,
      "matched=1|linked=1|named=0": 1,
      "matched=1|linked=1|named=1": 1,
    });
  });

  test("computes unit naming density from function members and rounds to two decimals", () => {
    const store = openFixture();
    addTranslationUnit(store, "mixed");
    for (let index = 0; index < 8; index += 1) addTarget(store, `real-${index}`, `Real${index}`, "mixed");
    addTarget(store, "label", "lbl_80000001", "mixed");
    addTarget(store, "fn", "fn_80000002", "mixed");
    addTarget(store, "unknown", "unk_member", "mixed");
    addTarget(store, "address", "member_80000003_suffix", "mixed");

    const rows = prioritizeTargets(store, undefined, { includeZeroMaterial: true }).rows;

    for (const row of rows) expect(row).toMatchObject({ unit_named_ratio: 0.67, unit_randomized_count: 4 });
  });

  test("excludes data members from unit density but reports density on data rows", () => {
    const store = openFixture();
    addTranslationUnit(store, "mixed");
    addTarget(store, "named", "NamedFunction", "mixed");
    addTarget(store, "generated", "fn_80000001", "mixed");
    addTarget(store, "data", "RealLookingData", "mixed", "data");
    addTranslationUnit(store, "data-only");
    addTarget(store, "only-data", "OtherData", "data-only", "data");

    const rows = prioritizeTargets(store, undefined, { includeZeroMaterial: true }).rows;
    const data = rows.find((row) => row.target_id === "data");

    expect(data).toMatchObject({ named_symbol: false, unit_named_ratio: 0.5, unit_randomized_count: 1 });
    expect(rows.find((row) => row.target_id === "only-data")).toMatchObject({
      unit_named_ratio: 0, unit_randomized_count: 0,
    });
  });

  test("ranks higher unit naming density before direct score", () => {
    const store = openFixture();
    addTranslationUnit(store, "high");
    addTranslationUnit(store, "low");
    addTarget(store, "high-target", "HighTarget", "high");
    addTarget(store, "high-peer", "HighPeer", "high");
    addTarget(store, "low-target", "LowTarget", "low");
    addTarget(store, "low-generated", "fn_80000001", "low");
    addRun(store, "high-run", "high-target");
    for (let index = 0; index < 5; index += 1) addRun(store, `low-run-${index}`, "low-target", 2);

    const rows = prioritizeTargets(store).rows;

    expect(rows.map((row) => row.target_id)).toEqual(["high-target", "low-target"]);
    expect(rows[0]!.unit_named_ratio).toBe(1);
    expect(rows[1]!.unit_named_ratio).toBe(0.5);
    expect(rows[0]!.direct_score).toBeLessThan(rows[1]!.direct_score);
  });

  test("summarizes unit naming density buckets over direct-material targets", () => {
    const store = openFixture();
    const ratios: Array<[string, number, number]> = [
      ["zero", 0, 4], ["eighth", 1, 7], ["quarter", 1, 3],
      ["half", 1, 1], ["three-quarters", 3, 1], ["one", 1, 0],
    ];
    for (const [unit, named, randomized] of ratios) {
      addTranslationUnit(store, unit);
      for (let index = 0; index < named; index += 1) addTarget(store, `${unit}-named-${index}`, `${unit}Named${index}`, unit);
      for (let index = 0; index < randomized; index += 1) addTarget(store, `${unit}-random-${index}`, `fn_${(index + 1).toString(16).padStart(8, "0")}`, unit);
      const materialTarget = named > 0 ? `${unit}-named-0` : `${unit}-random-0`;
      addRun(store, `${unit}-run`, materialTarget);
    }

    expect(prioritizeTargets(store).summary.unit_named_ratio_histogram).toEqual({
      "0": 1, "<0.25": 1, "<0.5": 1, "<0.75": 1, "<1": 1, "1": 1,
    });
  });
});
