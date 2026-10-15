#!/usr/bin/env bun
/**
 * Seed curated steering lessons into a game's knowledge-v2 store.
 *
 *   bun apps/server/src/core/knowledge-v2/steering-lessons/seed.ts --game sms \
 *     [--lessons <lessons.jsonl>] [--knowledge-root <dir>] [--apply]
 *
 * Each lesson in `games/<id>/knowledge/sources/injectable/steering_lessons/lessons.jsonl`
 * becomes a `pattern` entity (locator `steering-lesson:<id>`) with one
 * `purpose` fact carrying the lesson text, cited by the audit split PR. The
 * knowledge tools find it through `kv2_entity_lookup` (prefix
 * `steering-lesson:`) and `kv2_subject_record`, and a current target whose
 * symbol is the lesson's function gets a `steering_lesson` link so its card
 * lists it. The fact table has no lesson type; `purpose` (what the pattern
 * entity teaches) is the closest existing one, so no migration is needed.
 *
 * Maintainer review rulings (`review_rulings.jsonl` next to the lessons, or
 * `--rulings <file>`) are admitted the same way: a `pattern` entity
 * `review-ruling:<id>` with a `purpose` fact carrying the quote, the rule and
 * its enforcement, cited by the PR (`pr://<n>`).
 *
 * Dry run is the default: it only reads. `--apply` writes; re-running is
 * idempotent (unchanged lessons and rulings are skipped).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveGame } from "../../game-registry/resolver.js";
import {
  admitCuratedEntity,
  getLiveFact,
  insertLink,
  writeFactWithEvidence,
  type KnowledgeStoreHandle,
} from "../records/index.js";
import { openKnowledgeStore } from "../storage/store.js";

export const STEERING_LESSONS_RELATIVE_PATH = "knowledge/sources/injectable/steering_lessons/lessons.jsonl";
export const STEERING_LESSON_LOCATOR_PREFIX = "steering-lesson:";
export const STEERING_LESSON_LINK_ROLE = "steering_lesson";
export const REVIEW_RULINGS_RELATIVE_PATH = "knowledge/sources/injectable/steering_lessons/review_rulings.jsonl";
export const REVIEW_RULING_LOCATOR_PREFIX = "review-ruling:";

const OUTCOMES = ["real", "mixed", "loop_confirmed"] as const;
export type SteeringLessonOutcome = (typeof OUTCOMES)[number];

export interface SteeringLesson {
  id: string;
  function: string;
  pr: string;
  steering: { shapes: string[]; summary: string; example: string };
  real_cause: { kind: string; summary: string; evidence: string };
  outcome: SteeringLessonOutcome;
  reviewed_by: string;
}

const isString = (value: unknown): value is string => typeof value === "string";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Validate one parsed line; returns the problem or the lesson. */
export function parseSteeringLesson(value: unknown): SteeringLesson | string {
  if (!isRecord(value)) return "not an object";
  for (const key of ["id", "function", "pr", "reviewed_by"] as const) {
    if (!isString(value[key]) || value[key] === "") return `missing ${key}`;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(String(value.id))) return `id ${String(value.id)} is not a locator-safe slug`;
  if (!(OUTCOMES as readonly string[]).includes(String(value.outcome))) return `outcome must be one of ${OUTCOMES.join(", ")}`;
  const steering = value.steering;
  if (!isRecord(steering) || !Array.isArray(steering.shapes) || !steering.shapes.every(isString)
    || !isString(steering.summary) || !isString(steering.example)) return "steering must be {shapes[], summary, example}";
  const cause = value.real_cause;
  if (!isRecord(cause) || !isString(cause.kind) || !isString(cause.summary) || !isString(cause.evidence)
    || cause.kind === "" || cause.summary === "") return "real_cause must be {kind, summary, evidence}";
  return value as unknown as SteeringLesson;
}

/** Read and validate a lessons file; any bad line fails the whole read. */
export function readSteeringLessons(path: string): SteeringLesson[] {
  const lessons: SteeringLesson[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  readFileSync(path, "utf8").split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === "") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      problems.push(`line ${index + 1}: invalid JSON`);
      return;
    }
    const lesson = parseSteeringLesson(parsed);
    if (typeof lesson === "string") {
      problems.push(`line ${index + 1}: ${lesson}`);
    } else if (seen.has(lesson.id)) {
      problems.push(`line ${index + 1}: duplicate id ${lesson.id}`);
    } else {
      seen.add(lesson.id);
      lessons.push(lesson);
    }
  });
  if (problems.length > 0) throw new Error(`Invalid steering lessons in ${path}:\n${problems.join("\n")}`);
  return lessons;
}

/** The searchable lesson text: the steering part is named a probe, the real cause is the fix. */
export function steeringLessonText(lesson: SteeringLesson): string {
  const lines = [`Steering lesson ${lesson.id} (${lesson.outcome}) for ${lesson.function}, audit split PR ${lesson.pr}.`];
  if (lesson.steering.shapes.length > 0 || lesson.steering.summary) {
    const shapes = lesson.steering.shapes.length > 0 ? ` [${lesson.steering.shapes.join(", ")}]` : "";
    lines.push(`Steering probe${shapes}: ${lesson.steering.summary}`);
  }
  if (lesson.steering.example) lines.push(`Probe example:\n${lesson.steering.example}`);
  lines.push(`Real cause (${lesson.real_cause.kind}): ${lesson.real_cause.summary}`);
  if (lesson.real_cause.evidence) lines.push(`Real fix:\n${lesson.real_cause.evidence}`);
  return lines.join("\n");
}

export function steeringLessonLocator(lesson: Pick<SteeringLesson, "id">): string {
  return `${STEERING_LESSON_LOCATOR_PREFIX}${lesson.id}`;
}

/** The audit split PR as a PR locator (`pr://sms-pr189-split-04`); it names the audit, not an archived PR row. */
function citationLocator(lesson: SteeringLesson): string {
  return `pr://sms-pr189-split-${lesson.pr.replace(/[^\w.-]/g, "_")}`;
}

export type SteeringLessonAction = "admit" | "update" | "unchanged";

export interface SteeringLessonSeedRow {
  id: string;
  locator: string;
  action: SteeringLessonAction;
  linkedTargets: string[];
}

export interface SteeringLessonSeedResult {
  applied: boolean;
  rows: SteeringLessonSeedRow[];
}

const FACT_RATIONALE = "Curated steering lesson: the steering edits are diagnostic probes that show what codegen the original needs; only the real cause is a fix.";

function linkedTargets(store: KnowledgeStoreHandle, fn: string): Array<{ id: string; stableKey: string }> {
  return store.db.query<{ id: string; stableKey: string }, [string]>(
    "SELECT id, stable_key AS stableKey FROM target WHERE symbol = ? AND identity_status = 'current' ORDER BY stable_key",
  ).all(fn);
}

/**
 * Plan (dry run) or write the lessons. A lesson is `unchanged` when its entity
 * is active and its fact already carries the same text; links are added only
 * when missing.
 */
export function seedSteeringLessons(
  store: KnowledgeStoreHandle,
  lessons: readonly SteeringLesson[],
  options: { apply: boolean; now?: string },
): SteeringLessonSeedResult {
  const rows: SteeringLessonSeedRow[] = [];
  for (const lesson of lessons) {
    const locator = steeringLessonLocator(lesson);
    const text = steeringLessonText(lesson);
    const existing = store.db.query<{ id: string; status: string }, [string]>(
      "SELECT id, identity_status AS status FROM entity WHERE kind = 'pattern' AND locator = ?",
    ).get(locator);
    const fact = existing ? getLiveFact(store, { entityId: existing.id }, "purpose") : null;
    const targets = linkedTargets(store, lesson.function);
    const action: SteeringLessonAction = !existing || existing.status !== "active"
      ? "admit"
      : fact?.value === text ? "unchanged" : "update";
    rows.push({ id: lesson.id, locator, action, linkedTargets: targets.map((target) => target.stableKey) });
    if (!options.apply) continue;

    const entity = admitCuratedEntity(store, { kind: "pattern", locator });
    const citation = citationLocator(lesson);
    if (action !== "unchanged") {
      writeFactWithEvidence(store, {
        id: `fact:${locator}:purpose`,
        entityId: entity.id,
        type: "purpose",
        value: text,
        rationale: FACT_RATIONALE,
        confidence: lesson.outcome === "loop_confirmed" ? 0.8 : 0.9,
        ...(options.now ? { updatedAt: options.now } : {}),
      }, [{
        id: `evidence:${locator}`,
        kind: "pr",
        locator: citation,
        why: `Reviewed by ${lesson.reviewed_by}. Real fix: ${lesson.real_cause.evidence || lesson.real_cause.summary}`,
        ...(options.now ? { capturedAt: options.now } : {}),
      }]);
    }
    for (const target of targets) {
      insertLink(store, {
        id: `link:${locator}:${target.id}`,
        from: { targetId: target.id },
        to: { entityId: entity.id },
        role: STEERING_LESSON_LINK_ROLE,
        why: `Steering lesson for ${lesson.function}: ${lesson.real_cause.summary}`,
        kind: "pr",
        locator: citation,
      });
    }
  }
  return { applied: options.apply, rows };
}

export interface ReviewRulingExample {
  file?: string;
  [key: string]: unknown;
}

export interface ReviewRuling {
  id: string;
  date: string;
  pr: string;
  reviewer: string;
  quote: string;
  rule: string;
  enforced_by: string[];
  examples: ReviewRulingExample[];
  quotes?: string[];
  ruling?: string;
  source?: string;
}

/** Validate one parsed ruling line; returns the problem or the ruling. */
export function parseReviewRuling(value: unknown): ReviewRuling | string {
  if (!isRecord(value)) return "not an object";
  for (const key of ["id", "date", "pr", "reviewer", "quote", "rule"] as const) {
    if (!isString(value[key]) || value[key] === "") return `missing ${key}`;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(String(value.id))) return `id ${String(value.id)} is not a locator-safe slug`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value.date))) return "date must be YYYY-MM-DD";
  if (prNumbers(String(value.pr)).length === 0) return "pr must name at least one PR number";
  if (!Array.isArray(value.enforced_by) || value.enforced_by.length === 0 || !value.enforced_by.every((item) => isString(item) && item !== "")) {
    return "enforced_by must be a non-empty list of rule ids or gate checks";
  }
  if (!Array.isArray(value.examples) || !value.examples.every(isRecord)) return "examples must be a list of objects";
  for (const key of ["quotes"] as const) {
    if (value[key] !== undefined && (!Array.isArray(value[key]) || !(value[key] as unknown[]).every(isString))) return `${key} must be a list of strings`;
  }
  for (const key of ["ruling", "source"] as const) {
    if (value[key] !== undefined && !isString(value[key])) return `${key} must be a string`;
  }
  return value as unknown as ReviewRuling;
}

function prNumbers(pr: string): string[] {
  return pr.match(/\d+/g) ?? [];
}

/** Read and validate a rulings file; any bad line fails the whole read. */
export function readReviewRulings(path: string): ReviewRuling[] {
  const rulings: ReviewRuling[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  readFileSync(path, "utf8").split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === "") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      problems.push(`line ${index + 1}: invalid JSON`);
      return;
    }
    const ruling = parseReviewRuling(parsed);
    if (typeof ruling === "string") {
      problems.push(`line ${index + 1}: ${ruling}`);
    } else if (seen.has(ruling.id)) {
      problems.push(`line ${index + 1}: duplicate id ${ruling.id}`);
    } else {
      seen.add(ruling.id);
      rulings.push(ruling);
    }
  });
  if (problems.length > 0) throw new Error(`Invalid review rulings in ${path}:\n${problems.join("\n")}`);
  return rulings;
}

export function reviewRulingLocator(ruling: Pick<ReviewRuling, "id">): string {
  return `${REVIEW_RULING_LOCATOR_PREFIX}${ruling.id}`;
}

/** The searchable ruling text: who ruled, the exact quote, the rule and what enforces it. */
export function reviewRulingText(ruling: ReviewRuling): string {
  const prs = prNumbers(ruling.pr).map((n) => `#${n}`).join("/");
  const lines = [`Review ruling ${ruling.id}: ${ruling.reviewer} on doldecomp/sms ${prs} (${ruling.date})${ruling.ruling ? `, ${ruling.ruling}` : ""}.`];
  const quotes = ruling.quotes && ruling.quotes.length > 0 ? ruling.quotes : [ruling.quote];
  for (const quote of quotes) lines.push(`Quote: "${quote}"`);
  lines.push(`Rule: ${ruling.rule}`);
  lines.push(`Enforced by: ${ruling.enforced_by.join(", ")}`);
  for (const example of ruling.examples) {
    const where = isString(example.file) ? example.file : "example";
    const detail = [example.function, example.change, example.comment, example.outcome, example.why].filter(isString);
    if (detail.length > 0) lines.push(`Example (${where}): ${detail.join(" | ")}`);
  }
  return lines.join("\n");
}

const RULING_RATIONALE = "Maintainer review ruling: the reviewer's exact words and the rule the harness enforces from them.";

/** Plan (dry run) or write the rulings as `pattern` entities with a cited `purpose` fact. */
export function seedReviewRulings(
  store: KnowledgeStoreHandle,
  rulings: readonly ReviewRuling[],
  options: { apply: boolean; now?: string },
): SteeringLessonSeedResult {
  const rows: SteeringLessonSeedRow[] = [];
  for (const ruling of rulings) {
    const locator = reviewRulingLocator(ruling);
    const text = reviewRulingText(ruling);
    const existing = store.db.query<{ id: string; status: string }, [string]>(
      "SELECT id, identity_status AS status FROM entity WHERE kind = 'pattern' AND locator = ?",
    ).get(locator);
    const fact = existing ? getLiveFact(store, { entityId: existing.id }, "purpose") : null;
    const action: SteeringLessonAction = !existing || existing.status !== "active"
      ? "admit"
      : fact?.value === text ? "unchanged" : "update";
    rows.push({ id: ruling.id, locator, action, linkedTargets: [] });
    if (!options.apply || action === "unchanged") continue;
    const entity = admitCuratedEntity(store, { kind: "pattern", locator });
    writeFactWithEvidence(store, {
      id: `fact:${locator}:purpose`,
      entityId: entity.id,
      type: "purpose",
      value: text,
      rationale: RULING_RATIONALE,
      confidence: 1,
      ...(options.now ? { updatedAt: options.now } : {}),
    }, prNumbers(ruling.pr).map((n) => ({
      id: `evidence:${locator}:pr-${n}`,
      kind: "pr" as const,
      locator: `pr://${n}`,
      why: `${ruling.reviewer} on doldecomp/sms #${n}: "${ruling.quote}"`,
      ...(options.now ? { capturedAt: options.now } : {}),
    })));
  }
  return { applied: options.apply, rows };
}

export function renderSeedReport(gameId: string, lessonsPath: string, result: SteeringLessonSeedResult, noun = "steering lessons"): string {
  const counts = { admit: 0, update: 0, unchanged: 0 };
  for (const row of result.rows) counts[row.action] += 1;
  return [
    `${result.applied ? "Applied" : "Dry run"}: ${result.rows.length} ${noun} for ${gameId} from ${lessonsPath}`,
    `admit ${counts.admit}, update ${counts.update}, unchanged ${counts.unchanged}`,
    ...result.rows.map((row) => `- ${row.action.padEnd(9)} ${row.locator}${row.linkedTargets.length > 0 ? ` -> ${row.linkedTargets.join(", ")}` : ""}`),
    ...(result.applied ? [] : ["Pass --apply to write."]),
  ].join("\n");
}

function args(argv: string[]): Map<string, string | true> {
  const out = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]!;
    if (!key.startsWith("--")) continue;
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out.set(key, next);
      index += 1;
    } else {
      out.set(key, true);
    }
  }
  return out;
}

const stringArg = (parsed: Map<string, string | true>, key: string): string | undefined => {
  const value = parsed.get(key);
  return typeof value === "string" ? value : undefined;
};

export function runSeedCli(argv: string[]): string {
  const parsed = args(argv);
  const gameId = stringArg(parsed, "--game") ?? "sms";
  const lessonsArg = stringArg(parsed, "--lessons");
  const lessonsPath = lessonsArg ? resolve(lessonsArg) : resolve(resolveGame({ gameId }).gameDir, STEERING_LESSONS_RELATIVE_PATH);
  if (!existsSync(lessonsPath)) throw new Error(`No steering lessons for ${gameId}: ${lessonsPath}`);
  const knowledgeRoot = stringArg(parsed, "--knowledge-root");
  const underTest = process.env.NODE_ENV === "test" || process.env.BUN_TEST !== undefined;
  if (knowledgeRoot === undefined && underTest) {
    throw new Error("steering-lessons seed refuses to touch the default knowledge root under a test runner; pass --knowledge-root <temp dir>");
  }
  const lessons = readSteeringLessons(lessonsPath);
  const rulingsArg = stringArg(parsed, "--rulings");
  const rulingsPath = rulingsArg ? resolve(rulingsArg) : resolve(resolveGame({ gameId }).gameDir, REVIEW_RULINGS_RELATIVE_PATH);
  if (rulingsArg && !existsSync(rulingsPath)) throw new Error(`No review rulings at ${rulingsPath}`);
  const rulings = existsSync(rulingsPath) ? readReviewRulings(rulingsPath) : null;
  const apply = parsed.get("--apply") === true;
  const store = knowledgeRoot === undefined ? openKnowledgeStore({ gameId }) : openKnowledgeStore({ knowledgeRoot: resolve(knowledgeRoot) });
  try {
    const reports = [renderSeedReport(gameId, lessonsPath, seedSteeringLessons(store, lessons, { apply }))];
    if (rulings) reports.push(renderSeedReport(gameId, rulingsPath, seedReviewRulings(store, rulings, { apply }), "review rulings"));
    return reports.join("\n");
  } finally {
    store.close();
  }
}

if (import.meta.main) {
  try {
    console.log(runSeedCli(process.argv.slice(2)));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
