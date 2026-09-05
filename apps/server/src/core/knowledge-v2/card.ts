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
      conflict_paths?: string[];
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
  evidence?: { kind: string; locator: string; why: string };
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

interface V2PriorRun {
  outcome: "match" | "improvement" | "no_change" | "error";
  integration: "integrated" | "conflicted" | null;
  baseline_score: number | null;
  best_score: number | null;
  closed_at: string;
  summary: string;
  observations: Array<{ observation: string; reusable_when: string }>;
  unresolved_diagnosis?: string;
}

interface V2AcceptedPr {
  pr_ref: string;
  attribution: "target" | "unit";
  summary: string;
  locator: string;
}

export interface V2TargetCard {
  stable_key: string;
  target: V2TargetSummary;
  context_budget: V2CardBudget;
  ledger: V2CardLedger;
  status: V2TargetStatus | null;
  facts: V2CardFacts;
  links: V2LinkSummary[];
  prior_runs: V2PriorRun[];
  accepted_prs: V2AcceptedPr[];
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

const BUDGET_CAPS: Record<V2CardBudget, { ledgerEntries: number; links: number; linkedFacts: number; priorRuns: number; acceptedPrs: number; chars: number }> = {
  full: { ledgerEntries: 20, links: 8, linkedFacts: 3, priorRuns: 3, acceptedPrs: 3, chars: 8_000 },
  compact: { ledgerEntries: 8, links: 4, linkedFacts: 1, priorRuns: 2, acceptedPrs: 2, chars: 4_000 },
  minimal: { ledgerEntries: 3, links: 2, linkedFacts: 0, priorRuns: 1, acceptedPrs: 1, chars: 1_500 },
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
  const priorRuns = buildPriorRuns(store, target.id, budget);
  const acceptedPrs = buildAcceptedPrs(store, target.id, target.unit_entity_id, budget);
  if (ledgerRows.length === 0 && Object.keys(record.facts).length === 0 && priorRuns.length === 0 && acceptedPrs.length === 0) return null;

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
    prior_runs: priorRuns,
    accepted_prs: acceptedPrs,
  };
  enforceCharacterBudget(card, BUDGET_CAPS[budget].chars);
  return card;
}

export function targetKnowledgeCardV2Xml(card: V2TargetCard): string {
  return [
    `    <target_knowledge context_budget="${card.context_budget}">`,
    "        <details_json>",
    "```json",
    JSON.stringify(card, null, 2),
    "```",
    "        </details_json>",
    "    </target_knowledge>",
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
      description: truncate(entry.description, 400),
      score: entry.score,
      run_outcome: entry.workerRun.finalOutcome,
      integration: entry.workerRun.integration,
      ...(entry.workerRun.integration === "conflicted"
        ? { conflict_paths: entry.workerRun.integrationDetail?.conflict_paths.slice(0, 10) ?? [] }
        : {}),
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
    const evidence = bestEvidence(fact);
    byType[type] = {
      value: formatFactValue(fact.type, fact.value, fact.confidence),
      rationale: fact.rationale,
      confidence: fact.confidence,
      ...(evidence ? { evidence } : {}),
    };
  }
  return byType;
}

function bestEvidence(fact: KnowledgeFact): V2FactSummary["evidence"] | undefined {
  const evidence = [...fact.evidence].sort((a, b) => {
    const preferred = (kind: string) => kind === "attempt" || kind === "pr" ? 1 : 0;
    return preferred(b.kind) - preferred(a.kind)
      || b.capturedAt.localeCompare(a.capturedAt)
      || a.id.localeCompare(b.id);
  })[0];
  return evidence && { kind: evidence.kind, locator: evidence.locator, why: truncate(evidence.why, 200) };
}

interface PriorRunRow {
  id: string;
  baseline: string;
  final_outcome: V2PriorRun["outcome"];
  integration: V2PriorRun["integration"];
  closed_at: string;
  summary: string | null;
  notable_observations: string | null;
  best_score: number | null;
}

function buildPriorRuns(store: KnowledgeStoreHandle, targetId: string, budget: V2CardBudget): V2PriorRun[] {
  const rows = store.db.query<PriorRunRow, [string, number]>(`
    SELECT w.id, w.baseline, w.final_outcome, w.integration, w.closed_at,
      n.summary, n.notable_observations, MAX(s.score) AS best_score
    FROM worker_run w
    LEFT JOIN submission s ON s.worker_run_id = w.id
    LEFT JOIN run_narrative n ON n.worker_run_id = w.id
    WHERE w.target_id = ?
    GROUP BY w.id
    ORDER BY w.closed_at DESC, w.id DESC
    LIMIT ?
  `).all(targetId, BUDGET_CAPS[budget].priorRuns);
  return rows.map((row, index) => {
    const summary = truncate(row.summary ?? "", 600);
    return {
      outcome: row.final_outcome,
      integration: row.integration,
      baseline_score: baselineScore(row.baseline),
      best_score: row.best_score,
      closed_at: row.closed_at,
      summary,
      observations: parseObservations(row.notable_observations).slice(0, 2),
      ...(index === 0 && row.final_outcome !== "match" && summary
        ? { unresolved_diagnosis: truncate(summary, 400) }
        : {}),
    };
  });
}

function baselineScore(value: string): number | null {
  try {
    const score = (JSON.parse(value) as { score?: unknown }).score;
    return typeof score === "number" && Number.isFinite(score) ? score : null;
  } catch {
    return null;
  }
}

function parseObservations(value: string | null): V2PriorRun["observations"] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.observation !== "string" || typeof row.reusable_when !== "string") return [];
      return [{ observation: truncate(row.observation, 300), reusable_when: truncate(row.reusable_when, 300) }];
    });
  } catch {
    return [];
  }
}

interface AcceptedPrRow {
  id: string;
  pr_ref: string;
  summary: string;
  attribution: "target" | "unit";
}

function buildAcceptedPrs(
  store: KnowledgeStoreHandle,
  targetId: string,
  unitEntityId: string,
  budget: V2CardBudget,
): V2AcceptedPr[] {
  return store.db.query<AcceptedPrRow, [string, string, string, number]>(`
    SELECT id, pr_ref, summary,
      CASE WHEN target_id = ? THEN 'target' ELSE 'unit' END AS attribution
    FROM pull_request
    WHERE outcome = 'match' AND (target_id = ? OR entity_id = ?)
    ORDER BY merged_at DESC, id DESC
    LIMIT ?
  `).all(targetId, targetId, unitEntityId, BUDGET_CAPS[budget].acceptedPrs).map((row) => ({
    pr_ref: row.pr_ref,
    attribution: row.attribution,
    summary: truncate(row.summary, 300),
    locator: `pr://${row.id}`,
  }));
}

// Trimming order reflects what a worker needs most: the target's own run
// history (prior_runs, per-submission approaches) outranks semantic fact
// prose, which outranks links and accepted-PR summaries. Long fact
// rationales go first; ledger entries are kept down to a floor of three.
const LEDGER_ENTRY_FLOOR = 3;

function enforceCharacterBudget(card: V2TargetCard, limit: number): void {
  const size = () => targetKnowledgeCardV2Xml(card).length;
  if (size() <= limit) return;
  // 1. Fact rationales are the least useful text for a worker; drop them first.
  for (const fact of Object.values(card.facts.by_type)) {
    if (fact) fact.rationale = "";
  }
  if (size() <= limit) return;
  // 2. Cap fact values; a worker needs the claim, not the essay.
  for (const fact of Object.values(card.facts.by_type)) {
    if (fact) fact.value = truncate(fact.value, 350);
  }
  if (size() <= limit) return;
  // 3. Secondary history: mechanical PR/event ledger rows (accepted_prs and
  //    regression_count already summarize them), extra ledger entries, link
  //    facts, extra PRs, extra observations.
  card.ledger.entries = card.ledger.entries.filter((entry) => entry.type === "submission");
  if (size() <= limit) return;
  card.ledger.entries = card.ledger.entries.slice(0, 6);
  card.ledger.runs = card.ledger.runs.slice(0, 6);
  if (size() <= limit) return;
  for (const link of card.links) link.facts = [];
  if (size() <= limit) return;
  card.accepted_prs = card.accepted_prs.slice(0, 1);
  if (size() <= limit) return;
  for (const run of card.prior_runs) run.observations = run.observations.slice(0, 1);
  if (size() <= limit) return;
  for (const entry of card.ledger.entries) {
    if (entry.type === "submission") entry.description = truncate(entry.description, 200);
  }

  // 4. Pop lowest-value collections first; keep a floor of ledger entries.
  while (size() > limit && card.links.length > 0) card.links.pop();
  while (size() > limit && card.ledger.entries.length > LEDGER_ENTRY_FLOOR) card.ledger.entries.pop();
  while (size() > limit && card.ledger.runs.length > LEDGER_ENTRY_FLOOR) card.ledger.runs.pop();
  while (size() > limit && card.accepted_prs.length > 0) card.accepted_prs.pop();
  while (size() > limit && Object.keys(card.facts.by_type).length > 0) {
    delete card.facts.by_type[Object.keys(card.facts.by_type).at(-1)!];
  }
  while (size() > limit && card.prior_runs.length > 1) card.prior_runs.pop();
  while (size() > limit && card.ledger.entries.length > 0) card.ledger.entries.pop();
  while (size() > limit && card.ledger.runs.length > 0) card.ledger.runs.pop();
  const first = card.prior_runs[0];
  if (first && size() > limit) {
    first.observations = [];
    first.summary = truncate(first.summary, 200);
    if (first.unresolved_diagnosis) first.unresolved_diagnosis = truncate(first.unresolved_diagnosis, 200);
  }
  if (size() > limit) card.facts.naming_note = truncate(card.facts.naming_note, 80);
  // Identity fields (stable_key, unit, symbol, source_path) are never truncated:
  // a shortened key is a wrong key. Trim narrative text instead.
  if (first && size() > limit) {
    first.summary = truncate(first.summary, 80);
    if (first.unresolved_diagnosis) first.unresolved_diagnosis = truncate(first.unresolved_diagnosis, 80);
  }
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`;
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
