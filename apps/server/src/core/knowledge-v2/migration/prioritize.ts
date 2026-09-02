import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Database } from "bun:sqlite";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { gameKnowledgeRoot } from "../../knowledge/paths.js";
import { KNOWLEDGE_INDEX_DB_FILENAME, openKnowledgeIndexDb, type KnowledgeIndexDb } from "../index/db.js";
import type { KnowledgeStoreHandle } from "../records/index.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";

/**
 * Weights are tunable and audited here rather than buried in the query. Discord and PR discussion are
 * the scarcest, highest-signal material in this corpus (the migration audit found only 16 wiki-cited
 * records and mostly attempt-only records), so they carry the heaviest weights. Attempts are plentiful
 * but each individual row is thinner, so runs outweigh submissions and both sit below PR/discord.
 */
export const DIRECT_PR_WEIGHT = 4;
// Unit attribution is weaker evidence that this specific member target was touched.
export const UNIT_PR_WEIGHT = 1;
// A unit filename mention is the weakest inherited evidence, so it only contributes to the inherited tiebreak score.
export const UNIT_DISCORD_WEIGHT = 1;

/** Flip to 1 to rank sparsely-named units first. */
export const UNIT_NAMED_RATIO_DIRECTION = -1;

export const PRIORITY_WEIGHTS = {
  attempts_runs: 3,
  attempts_submissions: 1,
  prs: DIRECT_PR_WEIGHT,
  unit_prs: UNIT_PR_WEIGHT,
  discord: 5,
  unit_discord: UNIT_DISCORD_WEIGHT,
  events: 2,
} as const;

/**
 * Symbols that are also ordinary English or C-idiom words. A whole-token match on these carries no
 * evidence that the message is about this target: measured discord hits are `main` 548, `callback` 85,
 * `reset` 49, `cb` 29, `exit` 24, against a corpus of 76,086 messages. Deliberately tiny and explicit
 * rather than a shape heuristic, because legitimate lowercase symbols such as expf, memcpy and strcmp
 * must keep their discord signal. Tune here.
 */
export const AMBIGUOUS_SYMBOL_TOKENS: ReadonlySet<string> = new Set(["main", "callback", "reset", "cb", "exit"]);

/** Treat compiler-style address labels and unknown placeholders as generated names, not human knowledge. */
export function isNamedSymbol(symbol: string | null): boolean {
  return symbol !== null
    && !/^lbl_[0-9A-Fa-f]{8}$/.test(symbol)
    && !/^fn_[0-9A-Fa-f]{8}$/.test(symbol)
    && !/^unk_/.test(symbol)
    && !/_[0-9A-Fa-f]{8}(_|$)/.test(symbol);
}

export interface PrioritizedTargetRow {
  target_id: string; stable_key: string; kind: "function" | "data";
  unit: string; symbol: string | null; match_pct: number | null;
  fully_matched: boolean; linked: boolean; named_symbol: boolean;
  unit_named_ratio: number; unit_randomized_count: number;
  attempts_runs: number; attempts_submissions: number; prs: number; unit_prs: number;
  discord: number; unit_discord: number; wiki: number; events: number;
  direct_score: number; inherited_score: number; score: number;
  indexed_at: string | null; never_indexed: boolean;
}

export interface PrioritizeSummary {
  total_targets: number; targets_with_direct_material: number; targets_with_inherited_only: number; never_indexed: number;
  material_histogram: Record<string, number>;
  inherited_histogram: Record<string, number>;
  source_coverage: {
    attempts: number; prs: number; unit_prs: number; discord: number; unit_discord: number; wiki: number; events: number;
  };
  match_pct: { at_100: number; below_100: number; unknown: number };
  tier_breakdown: Record<string, number>;
  unit_named_ratio_histogram: Record<string, number>;
}

export interface PrioritizeResult { rows: PrioritizedTargetRow[]; summary: PrioritizeSummary }
export interface PrioritizeOptions { limit?: number; includeZeroMaterial?: boolean }

interface TargetQueryRow {
  target_id: string;
  stable_key: string;
  kind: PrioritizedTargetRow["kind"];
  unit: string;
  symbol: string | null;
  unit_entity_id: string;
  unit_locator: string;
  match_pct: number | null;
  linked: number | null;
}

interface AttemptRow { target_id: string; runs: number; submissions: number }
interface CountRow { target_id: string; c: number }
interface IndexStateRow { target_id: string; indexed_at: string }
interface ContentRow { id: string; content: string }
interface DiscordCounts { direct: Map<string, number>; inherited: Map<string, number> }
interface TargetTokenClasses { symbolTokens: string[]; unitTokens: string[] }

const HISTOGRAM_KEYS = ["0", "1", "2-5", "6-10", "11-25", "26-100", "100+"] as const;
const UNIT_NAMED_RATIO_HISTOGRAM_KEYS = ["0", "<0.25", "<0.5", "<0.75", "<1", "1"] as const;

export function prioritizeTargets(
  store: KnowledgeStoreHandle,
  indexDb?: { db: Database },
  options: PrioritizeOptions = {},
): PrioritizeResult {
  const targets = store.db.query<TargetQueryRow, []>(`
    SELECT t.id AS target_id, t.stable_key, t.kind, t.unit, t.symbol, t.unit_entity_id,
      unit_entity.locator AS unit_locator,
      ts.match_pct, ts.linked
    FROM target t
    JOIN entity unit_entity ON unit_entity.id = t.unit_entity_id
    LEFT JOIN target_status ts ON ts.target_id = t.id
  `).all();
  const unitFunctionNames = new Map<string, { named: number; randomized: number }>();
  // The operator goal is to start with things that have the most work done on them, so a HIGHER named
  // ratio ranks first: real names mean knowledge already exists. This regex estimate is explicitly imperfect.
  for (const target of targets) {
    if (target.kind !== "function") continue;
    const counts = unitFunctionNames.get(target.unit_entity_id) ?? { named: 0, randomized: 0 };
    if (isNamedSymbol(target.symbol)) counts.named += 1;
    else counts.randomized += 1;
    unitFunctionNames.set(target.unit_entity_id, counts);
  }
  const attempts = keyedCounts(store.db.query<AttemptRow, []>(`
    SELECT w.target_id, COUNT(DISTINCT w.id) AS runs, COUNT(s.id) AS submissions
    FROM worker_run w
    LEFT JOIN submission s ON s.worker_run_id = w.id
    GROUP BY w.target_id
  `).all());
  const prs = countMap(store.db.query<CountRow, []>(
    "SELECT target_id, COUNT(*) AS c FROM pull_request WHERE target_id IS NOT NULL GROUP BY target_id",
  ).all());
  const unitPrs = countMap(store.db.query<CountRow, []>(`
    SELECT t.id AS target_id, COUNT(pr.id) AS c
    FROM target t
    JOIN pull_request pr ON pr.entity_id = t.unit_entity_id
    GROUP BY t.id
  `).all());
  const events = countMap(store.db.query<CountRow, []>(
    "SELECT target_id, COUNT(*) AS c FROM event GROUP BY target_id",
  ).all());
  const indexStates = new Map(store.db.query<IndexStateRow, []>(`
    SELECT target_id, indexed_at FROM subject_index_state WHERE target_id IS NOT NULL
  `).all().map((row) => [row.target_id, row.indexed_at]));

  const discord = discordCounts(store, targets, indexDb);
  const rows = targets.map<PrioritizedTargetRow>((target) => {
    const attempt = attempts.get(target.target_id);
    const attemptsRuns = attempt?.runs ?? 0;
    const attemptsSubmissions = attempt?.submissions ?? 0;
    const prCount = prs.get(target.target_id) ?? 0;
    const unitPrCount = unitPrs.get(target.target_id) ?? 0;
    const discordCount = discord.direct.get(target.target_id) ?? 0;
    const unitDiscordCount = discord.inherited.get(target.target_id) ?? 0;
    const eventCount = events.get(target.target_id) ?? 0;
    const indexedAt = indexStates.get(target.target_id) ?? null;
    const unitNames = unitFunctionNames.get(target.unit_entity_id) ?? { named: 0, randomized: 0 };
    const unitFunctionCount = unitNames.named + unitNames.randomized;
    const directScore = attemptsRuns * PRIORITY_WEIGHTS.attempts_runs
      + attemptsSubmissions * PRIORITY_WEIGHTS.attempts_submissions
      + prCount * PRIORITY_WEIGHTS.prs
      + discordCount * PRIORITY_WEIGHTS.discord
      + eventCount * PRIORITY_WEIGHTS.events;
    const inheritedScore = unitPrCount * PRIORITY_WEIGHTS.unit_prs
      + unitDiscordCount * PRIORITY_WEIGHTS.unit_discord;
    return {
      target_id: target.target_id,
      stable_key: target.stable_key,
      kind: target.kind,
      unit: target.unit,
      symbol: target.symbol,
      match_pct: target.match_pct,
      fully_matched: target.match_pct !== null && target.match_pct >= 100,
      // linked currently derives from the metadata.complete flag of the unit at reconcile time.
      linked: Boolean(target.linked),
      named_symbol: target.kind === "function" && isNamedSymbol(target.symbol),
      unit_named_ratio: unitFunctionCount === 0 ? 0 : Math.round((unitNames.named / unitFunctionCount) * 100) / 100,
      unit_randomized_count: unitNames.randomized,
      attempts_runs: attemptsRuns,
      attempts_submissions: attemptsSubmissions,
      prs: prCount,
      unit_prs: unitPrCount,
      discord: discordCount,
      unit_discord: unitDiscordCount,
      // Wiki material grounds game concepts and entities, not target symbols. This is structurally zero, not inferred or faked.
      wiki: 0,
      events: eventCount,
      direct_score: directScore,
      inherited_score: inheritedScore,
      score: directScore + inheritedScore,
      indexed_at: indexedAt,
      never_indexed: indexedAt === null,
    };
  });

  const summary = summarize(rows);
  const sorted = rows
    .filter((row) => options.includeZeroMaterial === true || directMaterialCount(row) > 0)
    .sort((a, b) => Number(b.never_indexed) - Number(a.never_indexed)
      || matchRank(b.match_pct) - matchRank(a.match_pct)
      || Number(b.linked) - Number(a.linked)
      || Number(b.named_symbol) - Number(a.named_symbol)
      || UNIT_NAMED_RATIO_DIRECTION * (a.unit_named_ratio - b.unit_named_ratio)
      || b.direct_score - a.direct_score
      // Inherited material only breaks ties between targets with equal direct evidence; it never promotes a target above one with more direct evidence.
      || b.inherited_score - a.inherited_score
      || compareStrings(a.stable_key, b.stable_key));
  return { rows: options.limit === undefined ? sorted : sorted.slice(0, options.limit), summary };
}

function keyedCounts(rows: AttemptRow[]): Map<string, { runs: number; submissions: number }> {
  return new Map(rows.map((row) => [row.target_id, { runs: row.runs, submissions: row.submissions }]));
}

function countMap(rows: CountRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.target_id, row.c]));
}

function discordCounts(
  store: KnowledgeStoreHandle,
  targets: TargetQueryRow[],
  indexDb?: { db: Database },
): DiscordCounts {
  const wanted = new Set<string>();
  const symbolTokensByTarget = new Map<string, string[]>();
  const unitTokensByTarget = new Map<string, string[]>();
  for (const target of targets) {
    const { symbolTokens, unitTokens } = targetTokenClasses(target);
    symbolTokensByTarget.set(target.target_id, symbolTokens);
    unitTokensByTarget.set(target.target_id, unitTokens);
    for (const token of symbolTokens) wanted.add(token);
    for (const token of unitTokens) wanted.add(token);
  }

  const messagesByToken = new Map<string, Set<number>>();
  const sourceDb = hasPopulatedDiscordFts(indexDb?.db) ? indexDb!.db : store.db;
  // FTS5 MATCH is unsuitable here. Its default tokenizer splits on `_`, which prevents the whole-token
  // semantics needed for decomp symbols such as ftCo_800BFFD0.
  const sql = sourceDb === store.db
    ? "SELECT id, content FROM discord_message"
    : "SELECT id, content FROM discord_fts";
  let ordinal = 0;
  for (const message of sourceDb.query<ContentRow, []>(sql).iterate()) {
    const messageTokens = tokenize(message.content);
    for (const token of messageTokens) {
      if (!wanted.has(token)) continue;
      let ordinals = messagesByToken.get(token);
      if (ordinals === undefined) {
        ordinals = new Set<number>();
        messagesByToken.set(token, ordinals);
      }
      ordinals.add(ordinal);
    }
    ordinal += 1;
  }

  const direct = new Map<string, number>();
  const inherited = new Map<string, number>();
  for (const target of targets) {
    // The token classes are attributed independently: a message matching both the symbol and unit basename
    // counts once in each column, while duplicate matches within either class still count only once.
    direct.set(target.target_id, countMessageOrdinals(symbolTokensByTarget.get(target.target_id) ?? [], messagesByToken));
    inherited.set(target.target_id, countMessageOrdinals(unitTokensByTarget.get(target.target_id) ?? [], messagesByToken));
  }
  return { direct, inherited };
}

function countMessageOrdinals(tokens: string[], messagesByToken: Map<string, Set<number>>): number {
  const ordinals = new Set<number>();
  for (const token of tokens) {
    for (const ordinal of messagesByToken.get(token) ?? []) ordinals.add(ordinal);
  }
  return ordinals.size;
}

function targetTokenClasses(target: TargetQueryRow): TargetTokenClasses {
  return symbolTokensFor({
    symbol: target.kind === "data" ? null : target.symbol,
    unit: target.unit_locator,
  });
}

export function symbolTokensFor(input: { symbol: string | null; unit: string }): {
  symbolTokens: string[];
  unitTokens: string[];
} {
  const symbolTokens: string[] = [];
  // A data target's symbol is a section name, not a unique identifier. extab appeared in 37 discord messages,
  // x weight 5 = 185 direct score on each of 8 unrelated data targets, occupying ranks 3-10.
  if (input.symbol !== null
    && input.symbol.length >= 3
    && !AMBIGUOUS_SYMBOL_TOKENS.has(input.symbol)) {
    symbolTokens.push(input.symbol);
  }
  const unitTokens: string[] = [];
  const sourceBasename = basename(input.unit);
  // Bare stems such as "float", "list", "state", "math" and "debug" are ordinary English words and
  // produced hundreds of false discord hits per unit. Only the dotted filename form, such as
  // "fighter.c", is specific enough to be evidence.
  if (sourceBasename.includes(".")) unitTokens.push(sourceBasename);
  return { symbolTokens, unitTokens };
}

export function tokenize(content: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of content.matchAll(/[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z0-9]+/g)) tokens.add(match[0]);
  for (const match of content.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) tokens.add(match[0]);
  // Case-sensitive whole-token matching keeps ftCo_800BFFD0 distinct from ftCo_800BFFD0_helper.
  return tokens;
}

function hasPopulatedDiscordFts(db: Database | undefined): boolean {
  if (db === undefined) return false;
  const table = db.query<{ present: number }, []>(`
    SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'discord_fts'
  `).get();
  return table != null && db.query<{ present: number }, []>("SELECT 1 AS present FROM discord_fts LIMIT 1").get() != null;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function matchRank(matchPct: number | null): number {
  if (matchPct === null) return 0;
  return matchPct >= 100 ? 2 : 1;
}

function tierKey(row: PrioritizedTargetRow): string {
  return `matched=${Number(row.fully_matched)}|linked=${Number(row.linked)}|named=${Number(row.named_symbol)}`;
}

function summarize(rows: PrioritizedTargetRow[]): PrioritizeSummary {
  const material_histogram: Record<string, number> = Object.fromEntries(HISTOGRAM_KEYS.map((key) => [key, 0]));
  const inherited_histogram: Record<string, number> = Object.fromEntries(HISTOGRAM_KEYS.map((key) => [key, 0]));
  const source_coverage = { attempts: 0, prs: 0, unit_prs: 0, discord: 0, unit_discord: 0, wiki: 0, events: 0 };
  const match_pct = { at_100: 0, below_100: 0, unknown: 0 };
  const tier_breakdown: Record<string, number> = {};
  const unit_named_ratio_histogram: Record<string, number> = Object.fromEntries(
    UNIT_NAMED_RATIO_HISTOGRAM_KEYS.map((key) => [key, 0]),
  );
  for (const matched of [0, 1]) {
    for (const linked of [0, 1]) {
      for (const named of [0, 1]) tier_breakdown[`matched=${matched}|linked=${linked}|named=${named}`] = 0;
    }
  }
  let targetsWithDirectMaterial = 0;
  let targetsWithInheritedOnly = 0;
  let neverIndexed = 0;
  for (const row of rows) {
    const directTotal = directMaterialCount(row);
    const inheritedTotal = inheritedMaterialCount(row);
    material_histogram[histogramBucket(directTotal)] += 1;
    inherited_histogram[histogramBucket(inheritedTotal)] += 1;
    if (directTotal > 0) {
      targetsWithDirectMaterial += 1;
      tier_breakdown[tierKey(row)] += 1;
      unit_named_ratio_histogram[unitNamedRatioBucket(row.unit_named_ratio)] += 1;
      if (row.match_pct === null) match_pct.unknown += 1;
      else if (row.match_pct === 100) match_pct.at_100 += 1;
      else match_pct.below_100 += 1;
    } else if (inheritedTotal > 0) {
      targetsWithInheritedOnly += 1;
    }
    if (row.never_indexed) neverIndexed += 1;
    if (row.attempts_runs + row.attempts_submissions > 0) source_coverage.attempts += 1;
    if (row.prs > 0) source_coverage.prs += 1;
    if (row.unit_prs > 0) source_coverage.unit_prs += 1;
    if (row.discord > 0) source_coverage.discord += 1;
    if (row.unit_discord > 0) source_coverage.unit_discord += 1;
    if (row.wiki > 0) source_coverage.wiki += 1;
    if (row.events > 0) source_coverage.events += 1;
  }
  return {
    total_targets: rows.length,
    targets_with_direct_material: targetsWithDirectMaterial,
    targets_with_inherited_only: targetsWithInheritedOnly,
    never_indexed: neverIndexed,
    material_histogram,
    inherited_histogram,
    source_coverage,
    match_pct,
    tier_breakdown,
    unit_named_ratio_histogram,
  };
}

function directMaterialCount(row: PrioritizedTargetRow): number {
  return row.attempts_runs + row.attempts_submissions + row.prs + row.discord + row.events;
}

function inheritedMaterialCount(row: PrioritizedTargetRow): number {
  return row.unit_prs + row.unit_discord;
}

function histogramBucket(total: number): typeof HISTOGRAM_KEYS[number] {
  if (total === 0) return "0";
  if (total === 1) return "1";
  if (total <= 5) return "2-5";
  if (total <= 10) return "6-10";
  if (total <= 25) return "11-25";
  if (total <= 100) return "26-100";
  return "100+";
}

function unitNamedRatioBucket(ratio: number): typeof UNIT_NAMED_RATIO_HISTOGRAM_KEYS[number] {
  if (ratio === 0) return "0";
  if (ratio < 0.25) return "<0.25";
  if (ratio < 0.5) return "<0.5";
  if (ratio < 0.75) return "<0.75";
  if (ratio < 1) return "<1";
  return "1";
}

export async function kg2Prioritize(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const limit = integerArg(args, "--limit", 30);
  const explicitRoot = optionalStringArg(args, "--knowledge-root");
  if (
    explicitRoot === undefined
    && (
      process.env.NODE_ENV === "test"
      || process.env.BUN_TEST !== undefined
      || (typeof Bun !== "undefined" && Bun.env.NODE_ENV === "test")
    )
  ) {
    throw new Error("kg2-prioritize refuses to touch the default knowledge root under a test runner; pass --knowledge-root <temp dir>");
  }
  const gameId = globals.gameId ?? "melee";
  const knowledgeRoot = explicitRoot ?? gameKnowledgeRoot(gameId);
  let store: KnowledgeStore | undefined;
  let indexDb: KnowledgeIndexDb | undefined;
  try {
    store = explicitRoot === undefined ? openKnowledgeStore({ gameId }) : openKnowledgeStore({ knowledgeRoot });
    if (existsSync(resolve(knowledgeRoot, KNOWLEDGE_INDEX_DB_FILENAME))) {
      indexDb = openKnowledgeIndexDb({ knowledgeRoot });
    }
    const result = prioritizeTargets(store, indexDb, {
      limit,
      includeZeroMaterial: args.get("--include-zero") === true,
    });
    if (args.get("--json") === true) console.log(JSON.stringify(result));
    else printTable(result);
  } finally {
    indexDb?.close();
    store?.close();
  }
}

function optionalStringArg(args: Map<string, string | true>, name: string): string | undefined {
  const value = args.get(name);
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} requires a value`);
  return value;
}

function integerArg(args: Map<string, string | true>, name: string, fallback: number): number {
  const value = args.get(name);
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error(`${name} requires a non-negative integer`);
  return Number(value);
}

function printTable(result: PrioritizeResult): void {
  const headers = ["rank", "stable_key", "kind", "match_pct", "matched", "linked", "named", "unit_named_ratio", "unit_randomized_count", "runs", "subs", "prs", "unit_prs", "discord", "unit_discord", "wiki", "events", "direct", "inherited", "score", "never_indexed"];
  const data = result.rows.map((row, index) => [
    index + 1, row.stable_key, row.kind, row.match_pct ?? "-", row.fully_matched, row.linked, row.named_symbol,
    row.unit_named_ratio, row.unit_randomized_count, row.attempts_runs,
    row.attempts_submissions, row.prs, row.unit_prs, row.discord, row.unit_discord, row.wiki, row.events,
    row.direct_score, row.inherited_score, row.score, row.never_indexed,
  ].map(String));
  const widths = headers.map((header, column) => Math.max(header.length, ...data.map((row) => row[column]?.length ?? 0)));
  console.log(headers.map((value, index) => value.padEnd(widths[index]!)).join("  "));
  for (const row of data) console.log(row.map((value, index) => value.padEnd(widths[index]!)).join("  "));
  console.log(JSON.stringify(result.summary));
}
