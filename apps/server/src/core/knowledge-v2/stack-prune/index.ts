/**
 * Find stored history of a stop_at_frame game (SMS) that recommends banned
 * stack-frame tactics, report it, and with `apply` mark it superseded.
 *
 * Marking never rewrites or deletes a source row. It appends one line per
 * flagged item to `<knowledgeRoot>/store/stack-policy-quarantine.jsonl`; the
 * knowledge-v2 FTS builders redact indexed history once that ledger exists,
 * so the next `kg2-index --fts --rebuild` drops the tactics from search. Cards
 * and search tools already redact at read time from the game's policy.
 */
import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  detectBannedStackTactics,
  stackPolicyQuarantinePath,
  type StackTacticFinding,
  type StackTacticRule,
} from "../stack-policy-filter.js";

export interface StackPruneItem {
  store: string;
  table: string;
  id: string;
  field: string;
  rules: StackTacticRule[];
  excerpt: string;
  /** Extra classification, e.g. a PR's merged/closed state. */
  note?: string;
}

export interface StackPruneStoreReport {
  store: string;
  path: string;
  /** Which agents read it, and through what. */
  reaches: string;
  present: boolean;
  scanned: number;
  flagged: number;
  byRule: Partial<Record<StackTacticRule, number>>;
  /** Free-form breakdowns (e.g. merged vs closed PR rows). */
  breakdown?: Record<string, number>;
  items: StackPruneItem[];
}

export interface StackPruneOptions {
  /** `games/<id>` root holding `knowledge/` and `runtime/`. */
  gameRoot: string;
  /** Override `<gameRoot>/runtime/state`. */
  stateDir?: string;
  /** Skip the ~1 GB raw diff-line archive. */
  skipDiffLines?: boolean;
  /** Keep at most this many items per store in memory (counts stay exact). */
  maxItemsPerStore?: number;
}

const DEFAULT_MAX_ITEMS = 5_000;

class StoreScan {
  readonly report: StackPruneStoreReport;
  constructor(store: string, path: string, reaches: string, private readonly maxItems: number) {
    this.report = { store, path, reaches, present: existsSync(path), scanned: 0, flagged: 0, byRule: {}, items: [] };
  }

  /** Scan one row; several text fields count as one item when any is flagged. */
  visit(table: string, id: string, fields: Record<string, string | null | undefined>, note?: string): boolean {
    this.report.scanned += 1;
    let first: { field: string; findings: StackTacticFinding[] } | undefined;
    const rules = new Set<StackTacticRule>();
    for (const [field, text] of Object.entries(fields)) {
      if (!text) continue;
      const findings = detectBannedStackTactics(text);
      if (findings.length === 0) continue;
      first ??= { field, findings };
      for (const finding of findings) rules.add(finding.rule);
    }
    if (!first) return false;
    this.report.flagged += 1;
    for (const rule of rules) this.report.byRule[rule] = (this.report.byRule[rule] ?? 0) + 1;
    if (note) this.bump(`flagged:${note}`);
    if (this.report.items.length < this.maxItems) {
      this.report.items.push({ store: this.report.store, table, id, field: first.field, rules: [...rules], excerpt: first.findings[0]!.excerpt, ...(note ? { note } : {}) });
    }
    return true;
  }

  bump(key: string, by = 1): void {
    this.report.breakdown ??= {};
    this.report.breakdown[key] = (this.report.breakdown[key] ?? 0) + by;
  }
}

function openReadonly(path: string): Database | null {
  if (!existsSync(path)) return null;
  return new Database(path, { readonly: true });
}

function hasTable(db: Database, table: string): boolean {
  return db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)!.n > 0;
}

function scanKnowledgeStore(path: string, maxItems: number): StackPruneStoreReport {
  const scan = new StoreScan("knowledge-v2 store", path, "worker target_knowledge card (accepted_prs, prior_runs, ledger), pr_search, attempt_search, knowledge_record, resolve_locator; librarian", maxItems);
  const db = openReadonly(path);
  if (!db) return scan.report;
  try {
    for (const row of db.query<{ id: string; pr_ref: string; summary: string; outcome: string }, []>("SELECT id, pr_ref, summary, outcome FROM pull_request").iterate()) {
      scan.visit("pull_request", row.id, { summary: row.summary }, row.outcome === "match" ? "accepted_pr" : "pr_ledger");
    }
    for (const row of db.query<{ id: string; description: string; hypothesis: string | null }, []>("SELECT id, description, hypothesis FROM submission").iterate()) {
      scan.visit("submission", row.id, { hypothesis: row.hypothesis, description: row.description });
    }
    for (const row of db.query<{ worker_run_id: string; summary: string; notable_observations: string; narrative: string }, []>("SELECT worker_run_id, summary, notable_observations, narrative FROM run_narrative").iterate()) {
      scan.visit("run_narrative", row.worker_run_id, { summary: row.summary, notable_observations: row.notable_observations, narrative: row.narrative });
    }
    for (const row of db.query<{ id: string; value: string; rationale: string }, []>("SELECT id, value, rationale FROM fact").iterate()) {
      scan.visit("fact", row.id, { value: row.value, rationale: row.rationale });
    }
    for (const row of db.query<{ id: string; why: string }, []>("SELECT id, why FROM evidence").iterate()) {
      scan.visit("evidence", row.id, { why: row.why });
    }
    for (const row of db.query<{ id: string; summary: string }, []>("SELECT id, summary FROM event").iterate()) {
      scan.visit("event", row.id, { summary: row.summary });
    }
    for (const row of db.query<{ id: string; why: string }, []>("SELECT id, why FROM link").iterate()) {
      scan.visit("link", row.id, { why: row.why });
    }
    for (const row of db.query<{ id: string; locator: string }, []>("SELECT id, locator FROM entity WHERE kind IN ('pattern', 'game_concept')").iterate()) {
      scan.visit("entity", row.id, { locator: row.locator.replace(/[-_]/g, " ") });
    }
  } finally {
    db.close();
  }
  return scan.report;
}

interface PrIndexRow {
  number: number;
  state?: string;
  mergedAt?: string | null;
}

function prStates(pastPrsData: string): Map<number, "merged" | "closed" | "open"> {
  const states = new Map<number, "merged" | "closed" | "open">();
  try {
    for (const row of JSON.parse(readFileSync(resolve(pastPrsData, "prs.json"), "utf8")) as PrIndexRow[]) {
      states.set(Number(row.number), row.mergedAt ? "merged" : String(row.state ?? "").toUpperCase() === "OPEN" ? "open" : "closed");
    }
  } catch {
    // An archive without prs.json reports every PR as unknown.
  }
  return states;
}

function scanPrTextCorpus(pastPrsData: string, states: Map<number, string>, maxItems: number): StackPruneStoreReport {
  const path = resolve(pastPrsData, "aggregate/text_corpus.jsonl");
  const scan = new StoreScan("past_prs text corpus", path, "pr_search discussion snippets (merged PRs in the store only); past_prs_search via the graph for PR splitter, reconcile, QA repair", maxItems);
  if (!scan.report.present) return scan.report;
  readFileSync(path, "utf8").split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof row.author === "string" && row.author.includes("[bot]")) return;
    const pr = Number(row.pr);
    const state = states.get(pr) ?? "unknown";
    scan.bump(`scanned:${state}`);
    scan.visit("text_corpus", `pr-${pr}#${index}`, { body: typeof row.body === "string" ? row.body : null, diff_hunk: typeof row.diff_hunk === "string" ? row.diff_hunk : null }, state);
  });
  return scan.report;
}

async function scanDiffLines(pastPrsData: string, states: Map<number, string>, maxItems: number): Promise<StackPruneStoreReport> {
  const path = resolve(pastPrsData, "aggregate/diff_lines.jsonl");
  const scan = new StoreScan("past_prs added diff lines", path, "raw archive; feeds graph past_prs chunks and corpus stats, not read by agents directly", maxItems);
  if (!scan.report.present) return scan.report;
  const decoder = new TextDecoder();
  let carry = "";
  let index = 0;
  const handle = (line: string) => {
    index += 1;
    if (!line.includes('"change": "add"') && !line.includes('"change":"add"')) return;
    let row: { pr?: number; file?: string; line?: string };
    try {
      row = JSON.parse(line) as typeof row;
    } catch {
      return;
    }
    if (typeof row.line !== "string" || !/\.(?:c|cpp|cc|h|hpp|inc)$/i.test(row.file ?? "")) return;
    const state = states.get(Number(row.pr)) ?? "unknown";
    scan.bump(`scanned:${state}`);
    // Each added line is code; prefix so the detector reads it as an added diff line.
    scan.visit("diff_lines", `pr-${row.pr}:${row.file}#${index}`, { line: `@@ added @@\n+${row.line}` }, state);
  };
  for await (const chunk of Bun.file(path).stream()) {
    carry += decoder.decode(chunk, { stream: true });
    let newline = carry.indexOf("\n");
    while (newline >= 0) {
      handle(carry.slice(0, newline));
      carry = carry.slice(newline + 1);
      newline = carry.indexOf("\n");
    }
  }
  if (carry.trim()) handle(carry);
  return scan.report;
}

const GRAPH_AGENT_FACT_TYPES = [
  "curated_worker_lesson",
  "curated_pr_lesson",
  "curated_source_update_proposal",
  "historical_tool_issue",
  "historical_function_hint",
  "mismatch_pattern_evidence",
];

function scanGraph(path: string, maxItems: number): StackPruneStoreReport {
  const scan = new StoreScan("legacy knowledge graph", path, "knowledge_graph_search and past_prs_search (reconcile, QA repair, PR splitter); not workers or librarian", maxItems);
  const db = openReadonly(path);
  if (!db) return scan.report;
  try {
    if (hasTable(db, "graph_facts")) {
      const placeholders = GRAPH_AGENT_FACT_TYPES.map(() => "?").join(", ");
      for (const row of db.query<{ id: string; fact_type: string; payload_json: string }, string[]>(`SELECT id, fact_type, payload_json FROM graph_facts WHERE fact_type IN (${placeholders})`).iterate(...GRAPH_AGENT_FACT_TYPES)) {
        scan.visit(`graph_facts:${row.fact_type}`, row.id, { payload_json: jsonText(row.payload_json) }, row.fact_type);
      }
    }
    if (hasTable(db, "search_chunks")) {
      for (const row of db.query<{ id: string; source_id: string; text: string }, []>("SELECT id, source_id, text FROM search_chunks WHERE source_id IN ('agent_shared_state', 'mismatch_patterns', 'past_prs')").iterate()) {
        scan.visit(`search_chunks:${row.source_id}`, row.id, { text: row.text }, `chunk:${row.source_id}`);
      }
    }
  } finally {
    db.close();
  }
  return scan.report;
}

/** Flatten JSON string values into prose lines so keys and escapes do not hide text. */
function jsonText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const out: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") out.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    walk(JSON.parse(raw));
    return out.join("\n");
  } catch {
    return raw;
  }
}

function scanOrchestratorState(path: string, maxItems: number): StackPruneStoreReport {
  const scan = new StoreScan("worker checkpoint notes", path, "checkpoint-feed -> checkpoint knowledge -> librarian -> knowledge-v2 store; QA repair reads agent output", maxItems);
  const db = openReadonly(path);
  if (!db) return scan.report;
  try {
    if (hasTable(db, "worker_checkpoints")) {
      for (const row of db.query<{ id: string; note: string | null }, []>("SELECT id, json_extract(metadata_json, '$.agent_note') AS note FROM worker_checkpoints WHERE json_valid(metadata_json)").iterate()) {
        scan.visit("worker_checkpoints.agent_note", row.id, { agent_note: jsonText(row.note) }, "checkpoint");
      }
    }
    if (hasTable(db, "worker_state")) {
      for (const row of db.query<{ id: string; summary_json: string | null }, []>("SELECT id, summary_json FROM worker_state").iterate()) {
        scan.visit("worker_state.summary_json", row.id, { summary_json: jsonText(row.summary_json) }, "worker_state");
      }
    }
  } finally {
    db.close();
  }
  return scan.report;
}

function scanIndex(path: string, maxItems: number): StackPruneStoreReport {
  const scan = new StoreScan("knowledge-v2 search index", path, "derived FTS behind pr_search and attempt_search; rebuilt by kg2-index", maxItems);
  const db = openReadonly(path);
  if (!db) return scan.report;
  try {
    if (hasTable(db, "pr_fts")) {
      for (const row of db.query<{ id: string; body: string; discussion: string }, []>("SELECT id, body, discussion FROM pr_fts").iterate()) {
        scan.visit("pr_fts", row.id, { body: row.body, discussion: row.discussion }, "pr");
      }
    }
    if (hasTable(db, "attempt_fts")) {
      for (const row of db.query<{ id: string; hypotheses: string }, []>("SELECT id, hypotheses FROM attempt_fts").iterate()) {
        scan.visit("attempt_fts", row.id, { hypotheses: row.hypotheses }, "attempt");
      }
    }
  } finally {
    db.close();
  }
  return scan.report;
}

export async function scanStackPolicyStores(options: StackPruneOptions): Promise<StackPruneStoreReport[]> {
  const knowledge = resolve(options.gameRoot, "knowledge");
  const stateDir = options.stateDir ?? resolve(options.gameRoot, "runtime/state");
  const pastPrsData = resolve(knowledge, "sources/code_context/past_prs/data");
  const maxItems = options.maxItemsPerStore ?? DEFAULT_MAX_ITEMS;
  const states = prStates(pastPrsData);
  const reports = [
    scanKnowledgeStore(resolve(knowledge, "store/knowledge.sqlite"), maxItems),
    scanIndex(resolve(knowledge, "indexes/knowledge-index.sqlite"), maxItems),
    scanPrTextCorpus(pastPrsData, states, maxItems),
    scanGraph(resolve(knowledge, "graph/graph.sqlite"), maxItems),
    scanOrchestratorState(resolve(stateDir, "orchestrator.sqlite"), maxItems),
  ];
  if (!options.skipDiffLines) reports.push(await scanDiffLines(pastPrsData, states, maxItems));
  return reports;
}

/** Stores whose flagged items `apply` marks; derived indexes and the raw diff archive are rebuilt or left alone. */
const MARKED_STORES = new Set(["knowledge-v2 store", "past_prs text corpus", "legacy knowledge graph", "worker checkpoint notes"]);

export interface StackPruneApplyResult {
  ledgerPath: string;
  marked: number;
  alreadyMarked: number;
}

/** Append a superseded mark per flagged item to the game's quarantine ledger; idempotent. */
export function applyStackPolicyMarks(gameRoot: string, reports: StackPruneStoreReport[], now = new Date()): StackPruneApplyResult {
  const ledgerPath = stackPolicyQuarantinePath(resolve(gameRoot, "knowledge/store/knowledge.sqlite"));
  const existing = new Set<string>();
  if (existsSync(ledgerPath)) {
    for (const line of readFileSync(ledgerPath, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { store: string; table: string; id: string };
        existing.add(`${row.store}\u0000${row.table}\u0000${row.id}`);
      } catch {
        // A torn line is ignored; its item is re-marked.
      }
    }
  }
  mkdirSync(dirname(ledgerPath), { recursive: true });
  let marked = 0;
  let alreadyMarked = 0;
  const lines: string[] = [];
  for (const report of reports) {
    if (!MARKED_STORES.has(report.store)) continue;
    if (report.items.length < report.flagged) {
      throw new Error(`${report.store}: ${report.flagged} flagged but only ${report.items.length} kept; rerun with a larger maxItemsPerStore before applying`);
    }
    for (const item of report.items) {
      const key = `${item.store}\u0000${item.table}\u0000${item.id}`;
      if (existing.has(key)) {
        alreadyMarked += 1;
        continue;
      }
      existing.add(key);
      lines.push(JSON.stringify({ ...item, status: "superseded_stack_policy", policy: "stop_at_frame", marked_at: now.toISOString() }));
      marked += 1;
    }
  }
  if (lines.length > 0) appendFileSync(ledgerPath, `${lines.join("\n")}\n`);
  return { ledgerPath, marked, alreadyMarked };
}

function ruleList(byRule: Partial<Record<StackTacticRule, number>>): string {
  const entries = Object.entries(byRule).sort((a, b) => b[1] - a[1]);
  return entries.length === 0 ? "none" : entries.map(([rule, count]) => `${rule} ${count}`).join(", ");
}

/** Up to `count` samples, round-robin across stores so every store is represented. */
export function sampleItems(reports: StackPruneStoreReport[], count: number): StackPruneItem[] {
  const queues = reports.map((report) => {
    const step = Math.max(1, Math.floor(report.items.length / count));
    return report.items.filter((_, index) => index % step === 0);
  });
  const out: StackPruneItem[] = [];
  for (let round = 0; out.length < count && queues.some((queue) => queue.length > round); round += 1) {
    for (const queue of queues) {
      if (out.length >= count) break;
      const item = queue[round];
      if (item) out.push(item);
    }
  }
  return out;
}

export function renderStackPruneReport(options: {
  gameId: string;
  gameRoot: string;
  reports: StackPruneStoreReport[];
  applied?: StackPruneApplyResult;
  generatedAt?: Date;
}): string {
  const { reports } = options;
  const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const lines = [
    `# Knowledge prune dry run: ${options.gameId} stack-frame tactics`,
    "",
    `Generated ${(options.generatedAt ?? new Date()).toISOString()} by \`bun apps/server/src/core/knowledge-v2/stack-prune/cli.ts --game ${options.gameId}${options.applied ? " --apply" : ""}\`.`,
    `Data root: \`${options.gameRoot}\` (read-only${options.applied ? "; marks appended to the quarantine ledger" : ""}).`,
    "",
    "## Counts per store",
    "",
    "| Store | Reaches | Scanned | Flagged | By rule |",
    "| --- | --- | ---: | ---: | --- |",
    ...reports.map((report) => `| ${cell(report.store)} | ${cell(report.reaches)} | ${report.present ? report.scanned : "absent"} | ${report.flagged} | ${ruleList(report.byRule)} |`),
    "",
    "## Breakdowns",
    "",
    ...reports.filter((report) => report.breakdown).flatMap((report) => [
      `- ${report.store}: ${Object.entries(report.breakdown!).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key} ${value}`).join(", ")}`,
    ]),
    "",
    "## Sample flagged items",
    "",
    "| # | Store | Item | Rules | Excerpt |",
    "| ---: | --- | --- | --- | --- |",
    ...sampleItems(reports, 10).map((item, index) => `| ${index + 1} | ${cell(item.store)} | \`${cell(`${item.table} ${item.id}`)}\` | ${item.rules.join(", ")} | ${cell(item.excerpt)} |`),
    "",
    "## What --apply does",
    "",
    "- Appends one `status: superseded_stack_policy` line per flagged item in the knowledge-v2 store, PR text corpus, legacy graph, and worker checkpoint notes to `knowledge/store/stack-policy-quarantine.jsonl`. No row is rewritten or deleted, and re-running skips items already marked.",
    "- The knowledge-v2 FTS builders redact banned tactics from indexed PR and attempt text once that ledger exists, so `bun apps/server/src/job-runner.ts kg2-index --game sms --fts --rebuild` drops them from `pr_search` and `attempt_search` hits.",
    "- Cards (`accepted_prs`, `prior_runs`, ledger) and the knowledge-v2 tools redact at read time from `matching.stackFramePolicy`, with or without the ledger.",
    "- The legacy graph tools (`knowledge_graph_search`, `past_prs_search`, `code_graph_search`, `code_graph_file_card`) redact history chunks at read time (live-code chunks stay verbatim), and the checkpoint feed redacts the note and hunks it extracts from and drops facts that recommend a banned tactic, so neither depends on the ledger.",
    ...(options.applied
      ? ["", `Applied: ${options.applied.marked} new marks, ${options.applied.alreadyMarked} already marked, ledger \`${options.applied.ledgerPath}\`.`]
      : []),
    "",
  ];
  return lines.join("\n");
}
