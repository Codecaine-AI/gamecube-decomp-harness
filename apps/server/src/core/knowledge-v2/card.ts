import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { gameKnowledgeRoot } from "../knowledge/paths.js";
import type { KnowledgeStoreHandle } from "./records/index.js";
import {
  knowledgeRecord,
  targetLedger,
  unitView,
  type KnowledgeFact,
  type KnowledgeLink,
  type SubjectIdentity,
  type TargetLedgerEntry,
} from "./views/index.js";

export type V2CardBudget = "full" | "compact" | "minimal";

interface V2TargetSummary {
  kind: string;
  unit: string;
  symbol: string | null;
  source_path: string | null;
  identity_status: string;
}

interface V2LedgerRun {
  final_outcome: "match" | "improvement" | "no_change" | "error";
  integration: "integrated" | "conflicted" | null;
  submission_count: number;
  best_score: number;
}

type V2LedgerEntry =
  | {
      type: "event";
      kind: "regression" | "note";
      cause: "merge_conflict" | "upstream_change" | null;
      summary: string;
      regression?: true;
    }
  | {
      type: "submission";
      seq: number;
      description: string;
      score: number;
      run_outcome: "match" | "improvement" | "no_change" | "error";
      integration: "integrated" | "conflicted" | null;
    }
  | {
      type: "pull_request";
      pr_ref: string;
      outcome: "match" | "improvement" | "no_change" | "error";
      attribution: "target" | "unit";
      summary: string;
    };

interface V2TargetStatus {
  match_pct: number;
  linked: boolean;
  size: number | null;
}

interface V2FactSummary {
  value: string;
  rationale: string;
  confidence: number;
}

interface V2LinkedFactSummary {
  type: string;
  value: string;
  confidence: number;
}

interface V2TargetLinkSubject {
  kind: string;
  stable_key: string;
  symbol: string | null;
}

interface V2EntityLinkSubject {
  kind: string;
  locator: string;
}

interface V2LinkSummary {
  role: string;
  why: string;
  direction: "outgoing" | "incoming";
  other: V2TargetLinkSubject | V2EntityLinkSubject;
  facts: V2LinkedFactSummary[];
}

interface V2CardLedger {
  regression_count?: number;
  runs: V2LedgerRun[];
  entries: V2LedgerEntry[];
}

interface V2CardFacts {
  naming_note: string;
  by_type: Partial<Record<string, V2FactSummary>>;
}

export interface V2TargetCard {
  stable_key: string;
  target: V2TargetSummary;
  context_budget: V2CardBudget;
  ledger: V2CardLedger;
  status: V2TargetStatus | null;
  facts: V2CardFacts;
  links: V2LinkSummary[];
}

interface TargetRow {
  id: string;
  kind: string;
  unit: string;
  symbol: string | null;
  unit_entity_id: string;
  identity_status: string;
}

interface TargetStatusRow {
  match_pct: number;
  linked: number | boolean;
  size: number | null;
}

const CARD_NAMING_NOTE =
  "The target.symbol column is the only name a worker may write into source. inferred_name facts are guesses, not canonical names.";

const BUDGET_CAPS: Record<V2CardBudget, { ledgerEntries: number; links: number; linkedFacts: number }> = {
  full: { ledgerEntries: 20, links: 8, linkedFacts: 3 },
  compact: { ledgerEntries: 8, links: 4, linkedFacts: 1 },
  minimal: { ledgerEntries: 3, links: 2, linkedFacts: 0 },
};

export function buildV2TargetCard(
  store: KnowledgeStoreHandle,
  stableKey: string,
  budget: V2CardBudget,
): V2TargetCard | null {
  const target = store.db.query<TargetRow, [string]>(
    "SELECT * FROM target WHERE stable_key = ? AND identity_status = 'current'",
  ).get(stableKey);
  if (!target) return null;

  const unit = unitView(store).find((row) => row.unit.id === target.unit_entity_id);
  if (!unit) return null;

  const ledgerRows = targetLedger(store, target.id);
  const record = knowledgeRecord(store, { targetId: target.id });
  if (ledgerRows.length === 0 && Object.keys(record.facts).length === 0) return null;

  const statusRow = store.db.query<TargetStatusRow, [string]>(
    "SELECT match_pct, linked, size FROM target_status WHERE target_id = ?",
  ).get(target.id);
  const status = statusRow
    ? { match_pct: statusRow.match_pct, linked: Boolean(statusRow.linked), size: statusRow.size }
    : null;

  const card: V2TargetCard = {
    stable_key: stableKey,
    target: {
      kind: target.kind,
      unit: target.unit,
      symbol: target.symbol,
      source_path: unit.unit.locator,
      identity_status: target.identity_status,
    },
    context_budget: budget,
    ledger: buildLedger(ledgerRows, budget),
    status,
    facts: {
      naming_note: CARD_NAMING_NOTE,
      by_type: buildFactMap(record),
    },
    links: buildLinks(store, record.links, budget),
  };
  return card;
}

export function targetKnowledgeCardV2Xml(card: V2TargetCard): string {
  return [
    `    <target_knowledge_card_v2 context_budget="${card.context_budget}">`,
    "        <details_json>",
    "```json",
    JSON.stringify(card, null, 2),
    "```",
    "        </details_json>",
    "    </target_knowledge_card_v2>",
  ].join("\n");
}

export function loadV2TargetCard(options: {
  gameId?: string;
  unit: string;
  symbol?: string | null;
  budget: V2CardBudget;
}): V2TargetCard | null {
  if (!options.unit) return null;
  const stableKey = options.symbol ? `${options.unit}:${options.symbol}` : options.unit;
  const dbPath = resolve(gameKnowledgeRoot(options.gameId ?? "melee"), "knowledge.sqlite");
  if (!existsSync(dbPath)) return null;

  let db: Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    return buildV2TargetCard({ db }, stableKey, options.budget);
  } catch {
    return null;
  } finally {
    if (db) db.close();
  }
}

function buildLedger(entries: TargetLedgerEntry[], budget: V2CardBudget): V2CardLedger {
  const cappedEntries = entries.slice(0, BUDGET_CAPS[budget].ledgerEntries).map(toLedgerEntry);
  const regressionCount = entries.filter((entry) => entry.type === "event" && entry.isRegression).length;
  const ledger: V2CardLedger = {
    ...(regressionCount > 0 ? { regression_count: regressionCount } : {}),
    runs: summarizeRuns(entries),
    entries: cappedEntries,
  };
  return ledger;
}

function summarizeRuns(entries: TargetLedgerEntry[]): V2LedgerRun[] {
  const runs = new Map<string, V2LedgerRun>();
  for (const entry of entries) {
    if (entry.type !== "submission") continue;
    const existing = runs.get(entry.workerRun.id);
    if (existing) {
      existing.submission_count += 1;
      if (entry.score > existing.best_score) existing.best_score = entry.score;
      continue;
    }
    runs.set(entry.workerRun.id, {
      final_outcome: entry.workerRun.finalOutcome,
      integration: entry.workerRun.integration,
      submission_count: 1,
      best_score: entry.score,
    });
  }
  return [...runs.values()];
}

function toLedgerEntry(entry: TargetLedgerEntry): V2LedgerEntry {
  if (entry.type === "event") {
    return {
      type: "event",
      kind: entry.kind,
      cause: entry.cause,
      summary: entry.summary,
      ...(entry.isRegression ? { regression: true } : {}),
    };
  }
  if (entry.type === "submission") {
    return {
      type: "submission",
      seq: entry.seq,
      description: entry.description,
      score: entry.score,
      run_outcome: entry.workerRun.finalOutcome,
      integration: entry.workerRun.integration,
    };
  }
  return {
    type: "pull_request",
    pr_ref: entry.prRef,
    outcome: entry.outcome,
    attribution: entry.attribution,
    summary: entry.summary,
  };
}

function buildFactMap(record: ReturnType<typeof knowledgeRecord>): Partial<Record<string, V2FactSummary>> {
  const byType: Partial<Record<string, V2FactSummary>> = {};
  for (const [type, fact] of Object.entries(record.facts)) {
    if (!fact) continue;
    byType[type] = {
      value: formatFactValue(fact.type, fact.value, fact.confidence),
      rationale: fact.rationale,
      confidence: fact.confidence,
    };
  }
  return byType;
}

function buildLinks(
  store: KnowledgeStoreHandle,
  links: KnowledgeLink[],
  budget: V2CardBudget,
): V2LinkSummary[] {
  const caps = BUDGET_CAPS[budget];
  return links.slice(0, caps.links).map((link) => ({
    role: link.role,
    why: link.why,
    direction: link.direction,
    other: toOtherSubject(link.other),
    facts: caps.linkedFacts > 0 ? linkedFacts(store, link, caps.linkedFacts) : [],
  }));
}

function linkedFacts(
  store: KnowledgeStoreHandle,
  link: KnowledgeLink,
  limit: number,
): V2LinkedFactSummary[] {
  const linkedRecord = link.other.subjectKind === "target"
    ? knowledgeRecord(store, { targetId: link.other.id })
    : knowledgeRecord(store, { entityId: link.other.id });
  return Object.values(linkedRecord.facts)
    .filter((fact): fact is KnowledgeFact => fact !== undefined)
    .slice(0, limit)
    .map((fact) => ({
      type: fact.type,
      value: formatFactValue(fact.type, fact.value, fact.confidence),
      confidence: fact.confidence,
    }));
}

function toOtherSubject(subject: SubjectIdentity): V2TargetLinkSubject | V2EntityLinkSubject {
  if (subject.subjectKind === "target") {
    return {
      kind: subject.kind,
      stable_key: subject.stableKey,
      symbol: subject.symbol,
    };
  }
  return {
    kind: subject.kind,
    locator: subject.locator,
  };
}

function formatFactValue(type: string, value: string, confidence: number): string {
  if (type === "inferred_name") return `guess: ${value} (confidence ${confidence})`;
  return value;
}
