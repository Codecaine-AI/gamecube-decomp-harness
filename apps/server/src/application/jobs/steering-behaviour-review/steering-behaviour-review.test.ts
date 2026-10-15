// The steering behaviour review never calls a model here: judges are fakes,
// and the kernel judge runs over a scripted `decide`.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ADVISORY_ADJUDICATION_CONFIG_PATH } from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/config.js";
import { JUSTIFIED_QUESTION, JUSTIFIED_QUESTION_ID } from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/question.js";

import { parseBehaviourDataset, type BehaviourHunk } from "./dataset.js";
import { DEFAULT_BEHAVIOUR_DATASET, DEFAULT_BEHAVIOUR_OUT_ROOT, parseBehaviourReviewArgs } from "./index.js";
import { behaviourDecisionName, kernelBehaviourJudge, type BehaviourAnswer, type BehaviourJudge } from "./judge.js";
import { behaviourThresholdsFor, STEERING_BEHAVIOUR_QUESTION, STEERING_BEHAVIOUR_QUESTION_ID, STEERING_BEHAVIOUR_THRESHOLDS } from "./question.js";
import { agreement, predictLabel, RESULTS_FILE, reviewHunks, summarize, SUMMARY_FILE, writeReviewArtifacts } from "./review.js";

const JOB_DIR = import.meta.dir;
const THRESHOLDS = behaviourThresholdsFor();

function hunk(id: string, label: BehaviourHunk["label"], extra: Partial<BehaviourHunk> = {}): BehaviourHunk {
  return { id, file: "src/a.cpp", function: "A::f", removed: "x = a * a;", added: "t = a; x = t * t;", label, ...extra };
}

/** Answers p(behaviour differs) from a table; throws for ids it was told to fail. */
function fakeJudge(probabilities: Record<string, number | null>, failing: readonly string[] = []): BehaviourJudge & { asked: string[] } {
  const asked: string[] = [];
  return {
    model: "fake/judge",
    asked,
    async judge(h): Promise<BehaviourAnswer> {
      asked.push(h.id);
      if (failing.includes(h.id)) throw new Error("boom");
      const probability = probabilities[h.id] ?? null;
      return { questionId: STEERING_BEHAVIOUR_QUESTION_ID, probability, servedModel: "fake/judge", ...(probability === null && { abstainReason: "engine-error" }) };
    },
  };
}

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "steering-behaviour-review-"));
  tempDirs.push(dir);
  return dir;
}

describe("question routing", () => {
  test("the kernel judge asks only the behaviour question, under its own id and decision name", async () => {
    const calls: Array<{ name: string; state: unknown; opts: Record<string, unknown> }> = [];
    const kernel = {
      decide: async (name: string, state: unknown, opts: Record<string, unknown>) => {
        calls.push({ name, state, opts });
        return { answers: { [STEERING_BEHAVIOUR_QUESTION_ID]: { probability: 0.9 } }, model: "typesafe/jev-served" };
      },
    };
    const judge = kernelBehaviourJudge({ kernel: kernel as never, parentRunId: "run-1", model: "typesafe/jev-1.13.0", thresholds: THRESHOLDS });
    const answer = await judge.judge(hunk("h1", "real"), { file: "src/a.cpp", function: "A::f", removed: "r", added: "a" });

    expect(answer).toEqual({ questionId: STEERING_BEHAVIOUR_QUESTION_ID, probability: 0.9, servedModel: "typesafe/jev-served" });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.name).toBe(behaviourDecisionName("h1"));
    expect(call.name.startsWith("JudgeAdvisory")).toBe(false);
    expect(call.state).toEqual({ file: "src/a.cpp", function: "A::f", removed: "r", added: "a" });
    expect(call.opts.model).toBe("typesafe/jev-1.13.0");
    expect(call.opts.trigger).toBe("judge");
    expect(call.opts.parentRunId).toBe("run-1");
    const questions = call.opts.questions as Record<string, { instructions: string; passAt: number; failAt: number }>;
    expect(Object.keys(questions)).toEqual([STEERING_BEHAVIOUR_QUESTION_ID]);
    expect(STEERING_BEHAVIOUR_QUESTION_ID).not.toBe(JUSTIFIED_QUESTION_ID);
    expect(questions[JUSTIFIED_QUESTION_ID]).toBeUndefined();
    expect(questions[STEERING_BEHAVIOUR_QUESTION_ID]!.instructions).toBe(STEERING_BEHAVIOUR_QUESTION.instructions);
    expect(questions[STEERING_BEHAVIOUR_QUESTION_ID]!.instructions).toContain(
      "Does the added code behave differently from the removed code for any input, ignoring register allocation, instruction order and stack layout?",
    );
    expect(questions[STEERING_BEHAVIOUR_QUESTION_ID]!.instructions).not.toBe(JUSTIFIED_QUESTION.instructions);
    expect({ passAt: questions[STEERING_BEHAVIOUR_QUESTION_ID]!.passAt, failAt: questions[STEERING_BEHAVIOUR_QUESTION_ID]!.failAt }).toEqual({ passAt: 0.8, failAt: 0.2 });
    expect(String(call.opts.requestId)).toStartWith("steering-behaviour:typesafe/jev-1.13.0:h1:");
  });

  test("an engine error or refusal comes back without a probability", async () => {
    for (const abstainReason of ["engine-error", "refusal"]) {
      const kernel = { decide: async () => ({ answers: { [STEERING_BEHAVIOUR_QUESTION_ID]: { probability: 0.95, abstainReason } }, model: "m" }) };
      const judge = kernelBehaviourJudge({ kernel: kernel as never, parentRunId: "run", model: "m", thresholds: THRESHOLDS });
      const answer = await judge.judge(hunk("h", "real"), { file: "f", function: "g", removed: "", added: "" });
      expect(answer.probability).toBeNull();
      expect(answer.abstainReason).toBe(abstainReason);
    }
  });
});

describe("question-keyed thresholds", () => {
  test("thresholds are keyed by the behaviour question id, never by model", () => {
    expect(Object.keys(STEERING_BEHAVIOUR_THRESHOLDS)).toEqual([STEERING_BEHAVIOUR_QUESTION_ID]);
    expect(behaviourThresholdsFor(STEERING_BEHAVIOUR_QUESTION_ID)).toEqual({ passAt: 0.8, failAt: 0.2, qualification: "exploratory" });
    expect(() => behaviourThresholdsFor("typesafe/jev-1.13.0")).toThrow(/no thresholds/);
    expect(() => behaviourThresholdsFor(JUSTIFIED_QUESTION_ID)).toThrow(/no thresholds/);
  });

  test("the model-keyed advisory threshold table is neither read nor written by the job", async () => {
    const before = readFileSync(ADVISORY_ADJUDICATION_CONFIG_PATH, "utf8");
    const out = join(tempDir(), "out");
    const results = await reviewHunks({ hunks: [hunk("a", "steering")], judge: fakeJudge({ a: 0.1 }), thresholds: THRESHOLDS });
    writeReviewArtifacts(out, results, summarize(results, { thresholds: THRESHOLDS, model: "fake/judge" }));
    expect(readFileSync(ADVISORY_ADJUDICATION_CONFIG_PATH, "utf8")).toBe(before);
    for (const file of readdirSync(JOB_DIR).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
      const source = readFileSync(join(JOB_DIR, file), "utf8");
      expect(source).not.toMatch(/advisory-adjudication\/(config|question|mode)(\.js)?["']/);
    }
  });

  test("an answer maps to a label at the question's bars", () => {
    expect(predictLabel(0.8, THRESHOLDS)).toBe("real");
    expect(predictLabel(0.99, THRESHOLDS)).toBe("real");
    expect(predictLabel(0.2, THRESHOLDS)).toBe("steering");
    expect(predictLabel(0, THRESHOLDS)).toBe("steering");
    expect(predictLabel(0.5, THRESHOLDS)).toBe("abstain");
    expect(predictLabel(0.79, THRESHOLDS)).toBe("abstain");
    expect(predictLabel(null, THRESHOLDS)).toBe("abstain");
  });
});

describe("review and statistics", () => {
  test("results, confusion matrix, accuracy and steering precision/recall", async () => {
    const hunks = [
      hunk("s1", "steering"), // steering, judged same -> correct
      hunk("s2", "steering"), // steering, judged different -> wrong
      hunk("s3", "steering"), // steering, in between -> abstain
      hunk("s4", "steering"), // judge throws -> abstain
      hunk("r1", "real"), // real, judged different -> correct
      hunk("r2", "real"), // real, judged same -> wrong
    ];
    const judge = fakeJudge({ s1: 0.05, s2: 0.9, s3: 0.5, r1: 0.85, r2: 0.1 }, ["s4"]);
    const results = await reviewHunks({ hunks, judge, thresholds: THRESHOLDS });

    expect(judge.asked).toEqual(["s1", "s2", "s3", "s4", "r1", "r2"]);
    expect(results.map((r) => [r.id, r.predicted])).toEqual([
      ["s1", "steering"],
      ["s2", "real"],
      ["s3", "abstain"],
      ["s4", "abstain"],
      ["r1", "real"],
      ["r2", "steering"],
    ]);
    expect(results.every((r) => r.question_id === STEERING_BEHAVIOUR_QUESTION_ID)).toBe(true);
    expect(results[2]!.abstain_reason).toBe("between-thresholds");
    expect(results[3]!.abstain_reason).toBe("judge-error: boom");

    const summary = summarize(results, { thresholds: THRESHOLDS, model: "fake/judge", generatedAt: "2026-10-15T00:00:00.000Z" });
    expect(summary.shadow_only).toBe(true);
    expect(summary.question_id).toBe(STEERING_BEHAVIOUR_QUESTION_ID);
    expect(summary.labels).toEqual({ steering: 4, real: 2 });
    expect(summary.predicted).toEqual({ steering: 2, real: 2, abstain: 2 });
    expect(summary.vs_dataset.confusion).toEqual({
      steering: { steering: 1, real: 1, abstain: 2 },
      real: { steering: 1, real: 1, abstain: 0 },
    });
    expect(summary.vs_dataset.total).toBe(6);
    expect(summary.vs_dataset.answered).toBe(4);
    expect(summary.vs_dataset.abstain).toBe(2);
    expect(summary.vs_dataset.accuracy).toBe(0.5);
    expect(summary.vs_dataset.coverage).toBeCloseTo(4 / 6);
    expect(summary.vs_dataset.steering.precision).toBe(0.5);
    expect(summary.vs_dataset.steering.recall).toBe(0.25);
    expect(summary.vs_ir_gate).toBeNull();
  });

  test("rows carrying ir_gate are also scored against the gate", async () => {
    const hunks = [hunk("a", "steering", { ir_gate: "steering" }), hunk("b", "real", { ir_gate: "steering" }), hunk("c", "real")];
    const results = await reviewHunks({ hunks, judge: fakeJudge({ a: 0.1, b: 0.1, c: 0.9 }), thresholds: THRESHOLDS });
    const summary = summarize(results, { thresholds: THRESHOLDS, model: "fake/judge" });
    expect(summary.vs_dataset.accuracy).toBeCloseTo(2 / 3);
    expect(summary.vs_ir_gate).not.toBeNull();
    expect(summary.vs_ir_gate!.total).toBe(2);
    expect(summary.vs_ir_gate!.accuracy).toBe(1);
    expect(summary.vs_ir_gate!.confusion.steering).toEqual({ steering: 2, real: 0, abstain: 0 });
  });

  test("empty agreement has null ratios", () => {
    const empty = agreement([]);
    expect(empty).toMatchObject({ total: 0, answered: 0, accuracy: null, coverage: null, steering: { precision: null, recall: null } });
  });
});

describe("dataset", () => {
  test("parses rows, an ir_gate label or object, and rejects bad rows", () => {
    const rows = parseBehaviourDataset(
      [
        JSON.stringify({ id: "a", file: "f", function: "g", removed: "r", added: "x", label: "steering", pr: "03", source: "audit", ir_gate: { label: "real" } }),
        "",
        JSON.stringify({ id: "b", file: "f", function: "g", removed: "", added: "x", label: "real", ir_gate: "steering" }),
      ].join("\n"),
    );
    expect(rows.map((r) => [r.id, r.label, r.ir_gate, r.pr])).toEqual([
      ["a", "steering", "real", "03"],
      ["b", "real", "steering", undefined],
    ]);
    expect(() => parseBehaviourDataset(JSON.stringify({ id: "a", file: "f", function: "g", removed: "", added: "", label: "mixed" }))).toThrow(/label/);
    const dup = JSON.stringify({ id: "a", file: "f", function: "g", removed: "", added: "", label: "real" });
    expect(() => parseBehaviourDataset(`${dup}\n${dup}`)).toThrow(/repeats id a/);
  });
});

describe("shadow-only", () => {
  test("a review writes exactly two files, inside the out directory", async () => {
    const root = tempDir();
    const out = join(root, "out");
    const results = await reviewHunks({ hunks: [hunk("a", "steering"), hunk("b", "real")], judge: fakeJudge({ a: 0.1, b: 0.9 }), thresholds: THRESHOLDS });
    const paths = writeReviewArtifacts(out, results, summarize(results, { thresholds: THRESHOLDS, model: "fake/judge" }));
    expect(readdirSync(root)).toEqual(["out"]);
    expect(readdirSync(out).sort()).toEqual([RESULTS_FILE, SUMMARY_FILE].sort());
    expect(readFileSync(paths.results, "utf8").trim().split("\n").map((line) => JSON.parse(line).id)).toEqual(["a", "b"]);
    expect(JSON.parse(readFileSync(paths.summary, "utf8")).shadow_only).toBe(true);
  });

  test("the job imports nothing that owns worker state, run state or advisory outcomes", () => {
    const forbidden = [/orchestrator-state/, /harness-runtime/, /run-state/, /worker-cycle/, /advisory-adjudication\/(adjudicate|fold|mode|config|index)/, /bun:sqlite/];
    for (const file of readdirSync(JOB_DIR).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
      const imports = [...readFileSync(join(JOB_DIR, file), "utf8").matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2]!);
      for (const spec of imports) for (const pattern of forbidden) expect({ file, spec, banned: pattern.test(spec) }).toEqual({ file, spec, banned: false });
    }
  });

  test("defaults: the objective dataset, an analysis/ out dir per run, the live engine", () => {
    const args = parseBehaviourReviewArgs([], new Date("2026-10-15T01:02:03.004Z"));
    expect(args.dataset).toBe(DEFAULT_BEHAVIOUR_DATASET);
    expect(args.out).toBe(join(DEFAULT_BEHAVIOUR_OUT_ROOT, "2026-10-15T01-02-03-004Z-live"));
    expect(args.engine).toBe("live");
    expect(parseBehaviourReviewArgs(["--dataset", "d.jsonl", "--out=o", "--engine", "fake", "--limit", "3"])).toMatchObject({ dataset: "d.jsonl", out: "o", engine: "fake", limit: 3 });
    expect(() => parseBehaviourReviewArgs(["--state-dir", "x"])).toThrow(/unknown argument/);
    expect(() => parseBehaviourReviewArgs(["--engine", "replay"])).toThrow(/--engine/);
  });
});
