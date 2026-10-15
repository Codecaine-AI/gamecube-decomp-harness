import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { knowledgeRecord } from "../views/knowledge-record.js";
import {
  REVIEW_RULINGS_RELATIVE_PATH,
  STEERING_LESSONS_RELATIVE_PATH,
  readReviewRulings,
  readSteeringLessons,
  reviewRulingText,
  runSeedCli,
  seedReviewRulings,
  seedSteeringLessons,
  steeringLessonText,
} from "./seed.js";

const SMS_GAME = fileURLToPath(new URL("../../../../../../games/sms/", import.meta.url));
const SMS_LESSONS = resolve(SMS_GAME, STEERING_LESSONS_RELATIVE_PATH);
const SMS_RULINGS = resolve(SMS_GAME, REVIEW_RULINGS_RELATIVE_PATH);

let root = "";
let store: KnowledgeStore;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kv2-steering-lessons-"));
  store = openKnowledgeStore({ knowledgeRoot: root });
  store.db.query(`INSERT INTO entity (id, kind, locator, identity_status)
    VALUES ('unit-1', 'translation_unit', 'src/bossgesso.cpp', 'active')`).run();
  store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES ('target-1', 'function', 'GMSJ01:bossgesso', 'unit-1', 'TBossGessoManager::createModelData',
      'GMSJ01:bossgesso:TBossGessoManager::createModelData', '0x80000000', 'current', 'rev')`).run();
});

afterEach(() => {
  store.close();
  rmSync(root, { recursive: true, force: true });
});

const count = (sql: string) => store.db.query<{ n: number }, []>(sql).get()!.n;

describe("steering lessons seed", () => {
  test("the committed SMS lessons parse: 6 real and 6 mixed", () => {
    const lessons = readSteeringLessons(SMS_LESSONS);
    expect(lessons.filter((lesson) => lesson.outcome === "real")).toHaveLength(6);
    expect(lessons.filter((lesson) => lesson.outcome === "mixed")).toHaveLength(6);
  });

  test("dry run writes nothing; apply admits pattern entities with a cited purpose fact; re-run is idempotent", () => {
    const lessons = readSteeringLessons(SMS_LESSONS);
    const dry = seedSteeringLessons(store, lessons, { apply: false });
    expect(dry.rows.every((row) => row.action === "admit")).toBe(true);
    expect(count("SELECT COUNT(*) AS n FROM entity WHERE kind = 'pattern'")).toBe(0);

    const applied = seedSteeringLessons(store, lessons, { apply: true });
    expect(applied.rows.find((row) => row.id === "sms-pr04-createmodeldata")!.linkedTargets)
      .toEqual(["GMSJ01:bossgesso:TBossGessoManager::createModelData"]);
    expect(count("SELECT COUNT(*) AS n FROM entity WHERE kind = 'pattern' AND locator LIKE 'steering-lesson:%'")).toBe(12);
    expect(count("SELECT COUNT(*) AS n FROM fact WHERE type = 'purpose' AND entity_id LIKE 'pattern:steering-lesson:%'")).toBe(12);
    expect(count("SELECT COUNT(*) AS n FROM evidence WHERE locator LIKE 'pr://sms-pr189-split-%'")).toBe(12);
    expect(count("SELECT COUNT(*) AS n FROM link WHERE role = 'steering_lesson' AND from_target_id = 'target-1'")).toBe(1);

    const lesson = lessons.find((row) => row.id === "sms-pr04-createmodeldata")!;
    const record = knowledgeRecord(store, { entityId: "pattern:steering-lesson:sms-pr04-createmodeldata" });
    expect(JSON.stringify(record)).toContain(lesson.real_cause.summary);
    expect(steeringLessonText(lesson)).toContain(`Real cause (${lesson.real_cause.kind})`);

    const again = seedSteeringLessons(store, lessons, { apply: true });
    expect(again.rows.every((row) => row.action === "unchanged")).toBe(true);
    expect(count("SELECT COUNT(*) AS n FROM link WHERE role = 'steering_lesson'")).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM evidence")).toBe(12);
  });

  test("a changed lesson updates its fact in place", () => {
    const [lesson] = readSteeringLessons(SMS_LESSONS);
    seedSteeringLessons(store, [lesson!], { apply: true });
    const edited = { ...lesson!, real_cause: { ...lesson!.real_cause, summary: "Edited cause." } };
    expect(seedSteeringLessons(store, [edited], { apply: true }).rows[0]!.action).toBe("update");
    expect(count("SELECT COUNT(*) AS n FROM fact")).toBe(1);
    expect(store.db.query<{ value: string }, []>("SELECT value FROM fact").get()!.value).toContain("Edited cause.");
  });

  test("rejects malformed lessons with their line numbers", () => {
    const path = join(root, "bad.jsonl");
    writeFileSync(path, [
      JSON.stringify({ id: "ok-1", function: "f", pr: "01", steering: { shapes: [], summary: "", example: "" }, real_cause: { kind: "constant", summary: "s", evidence: "" }, outcome: "real", reviewed_by: "r" }),
      JSON.stringify({ id: "bad", function: "f", pr: "01", outcome: "maybe", reviewed_by: "r" }),
      "{",
    ].join("\n"));
    expect(() => readSteeringLessons(path)).toThrow(/line 2: outcome must be.*\n.*line 3: invalid JSON/s);
  });

  test("the CLI is a dry run by default and refuses the default store under a test runner", () => {
    const output = runSeedCli(["--game", "sms", "--lessons", SMS_LESSONS, "--knowledge-root", root]);
    expect(output).toContain("Dry run: 12 steering lessons for sms");
    expect(output).toContain("Pass --apply to write.");
    expect(count("SELECT COUNT(*) AS n FROM entity WHERE kind = 'pattern'")).toBe(0);
    expect(() => runSeedCli(["--game", "sms", "--lessons", SMS_LESSONS])).toThrow(/refuses to touch the default knowledge root/);
    expect(runSeedCli(["--game", "sms", "--lessons", SMS_LESSONS, "--knowledge-root", root, "--apply"])).toContain("admit 12");
  });
});

describe("review rulings seed", () => {
  test("the committed SMS rulings parse: #330, #342 and #347/#348 with Mrkol's exact words", () => {
    const rulings = readReviewRulings(SMS_RULINGS);
    expect(rulings.map((ruling) => ruling.pr)).toEqual(["330", "342", "347, 348"]);
    expect(rulings.every((ruling) => ruling.reviewer === "Mrkol" && ruling.date === "2026-10-15")).toBe(true);
    const order = rulings.find((ruling) => ruling.id === "sms-347-348-decompile-in-order")!;
    expect(order.quotes).toContain("Same here, don't jump the fence please. It will get filled out eventually");
    expect(order.enforced_by).toEqual(expect.arrayContaining(["sms_out_of_order_fill", "sms_undecompiled_class_decl"]));
    expect(rulings.find((ruling) => ruling.id === "sms-342-unused-reconstruction")!.quote)
      .toContain("UNUSED functions may only be reconstructed when they were inlined into other functions in the same TU");
  });

  test("apply admits review-ruling pattern entities with a purpose fact cited per PR; re-run is idempotent", () => {
    const rulings = readReviewRulings(SMS_RULINGS);
    expect(seedReviewRulings(store, rulings, { apply: false }).rows.every((row) => row.action === "admit")).toBe(true);
    expect(count("SELECT COUNT(*) AS n FROM entity WHERE kind = 'pattern'")).toBe(0);

    seedReviewRulings(store, rulings, { apply: true });
    expect(count("SELECT COUNT(*) AS n FROM entity WHERE kind = 'pattern' AND locator LIKE 'review-ruling:%'")).toBe(3);
    expect(count("SELECT COUNT(*) AS n FROM fact WHERE type = 'purpose' AND entity_id LIKE 'pattern:review-ruling:%'")).toBe(3);
    // #347/#348 is cited by both PRs.
    expect(count("SELECT COUNT(*) AS n FROM evidence WHERE locator IN ('pr://347', 'pr://348')")).toBe(2);
    const order = rulings.find((ruling) => ruling.id === "sms-347-348-decompile-in-order")!;
    const record = JSON.stringify(knowledgeRecord(store, { entityId: "pattern:review-ruling:sms-347-348-decompile-in-order" }));
    expect(record).toContain("don't jump the fence please");
    expect(reviewRulingText(order)).toContain("Enforced by: sms_out_of_order_fill");

    expect(seedReviewRulings(store, rulings, { apply: true }).rows.every((row) => row.action === "unchanged")).toBe(true);
    expect(count("SELECT COUNT(*) AS n FROM evidence")).toBe(4);
  });

  test("rejects malformed rulings with their line numbers", () => {
    const path = join(root, "rulings.jsonl");
    writeFileSync(path, [
      JSON.stringify({ id: "ok", date: "2026-10-15", pr: "1", reviewer: "r", quote: "q", rule: "x", enforced_by: ["a"], examples: [] }),
      JSON.stringify({ id: "no-rules", date: "2026-10-15", pr: "1", reviewer: "r", quote: "q", rule: "x", enforced_by: [], examples: [] }),
      JSON.stringify({ id: "no-pr", date: "2026-10-15", pr: "none", reviewer: "r", quote: "q", rule: "x", enforced_by: ["a"], examples: [] }),
    ].join("\n"));
    expect(() => readReviewRulings(path)).toThrow(/line 2: enforced_by must be.*\n.*line 3: pr must name/s);
  });

  test("the CLI seeds rulings next to the lessons", () => {
    const output = runSeedCli(["--game", "sms", "--lessons", SMS_LESSONS, "--rulings", SMS_RULINGS, "--knowledge-root", root, "--apply"]);
    expect(output).toContain("Applied: 3 review rulings for sms");
    expect(count("SELECT COUNT(*) AS n FROM entity WHERE kind = 'pattern' AND locator LIKE 'review-ruling:%'")).toBe(3);
    expect(() => runSeedCli(["--game", "sms", "--lessons", SMS_LESSONS, "--rulings", join(root, "missing.jsonl"), "--knowledge-root", root])).toThrow(/No review rulings/);
  });
});
