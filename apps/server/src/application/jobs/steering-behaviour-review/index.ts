// `bun run server:job -- steering-behaviour-review [flags]` (plan
// sms-real-codegen §4 "Jev"): asks Jev the behaviour question for every hunk
// of the behaviour dataset and scores the answers against the audit labels
// and, where present, the IR gate.
//
//   --dataset <file>   default objectives/sms-real-codegen/data/sms-behaviour-change.jsonl
//   --out <dir>        default analysis/steering-behaviour-review/<iso>-<engine>/
//   --engine live|fake default live; live makes model calls and needs MODEL_NODES_LIVE=1
//   --model <ref>      default the pinned decide model (NODE_DECIDE_MODEL)
//   --db <path>        kernel database; default <out>/kernel.db (live) or a removed temp dir (fake)
//   --limit <n>        first n hunks only
//   --fake-probability <p>  the fake classifier's answer (fake only; default 0.5)
//
// Shadow-only and offline: the job writes `results.jsonl`, `summary.json` and
// (live) its own kernel database under --out, and nothing else. It opens its
// own kernel database (never the harness's), and never reads or writes worker
// state, the run-state database, advisory outcomes or the advisory
// adjudication's model-keyed thresholds. The live worker is unaffected.
import { join, resolve } from "node:path";

import { NODE_DECIDE_MODEL } from "@server/infrastructure/kernel/nodes/node-kernel.js";

import { readBehaviourDataset } from "./dataset.js";
import { kernelBehaviourJudge } from "./judge.js";
import { behaviourThresholdsFor, STEERING_BEHAVIOUR_QUESTION_ID } from "./question.js";
import { reviewHunks, summarize, writeReviewArtifacts } from "./review.js";

export const STEERING_BEHAVIOUR_REVIEW_JOB = "steering-behaviour-review";
export const DEFAULT_BEHAVIOUR_DATASET = "objectives/sms-real-codegen/data/sms-behaviour-change.jsonl";
/** Artifact root, relative to the harness repo root (same convention as `analysis/advisory-adjudication/`). */
export const DEFAULT_BEHAVIOUR_OUT_ROOT = "analysis/steering-behaviour-review";
/** The pinned Jev release the worker's decisions use (not the advisory threshold table's key). */
export const DEFAULT_BEHAVIOUR_MODEL = NODE_DECIDE_MODEL;

const ENGINES = ["live", "fake"] as const;
type Engine = (typeof ENGINES)[number];
const FLAGS = new Set(["--dataset", "--out", "--engine", "--model", "--db", "--limit", "--fake-probability"]);

export interface BehaviourReviewArgs {
  dataset: string;
  out: string;
  engine: Engine;
  model: string;
  db?: string;
  limit?: number;
  fakeProbability: number;
}

export function parseBehaviourReviewArgs(argv: readonly string[], now: Date = new Date()): BehaviourReviewArgs {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const eq = arg.indexOf("=");
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    if (!FLAGS.has(name)) throw new Error(`${STEERING_BEHAVIOUR_REVIEW_JOB}: unknown argument ${arg}`);
    const value = eq > 0 ? arg.slice(eq + 1) : argv[(i += 1)];
    if (value === undefined || value === "" || (eq < 0 && value.startsWith("--"))) throw new Error(`${STEERING_BEHAVIOUR_REVIEW_JOB}: missing value for ${name}`);
    flags.set(name, value);
  }
  const engine = flags.get("--engine") ?? "live";
  if (!(ENGINES as readonly string[]).includes(engine)) throw new Error(`${STEERING_BEHAVIOUR_REVIEW_JOB}: --engine must be ${ENGINES.join(" or ")}`);
  const limitRaw = flags.get("--limit");
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) throw new Error(`${STEERING_BEHAVIOUR_REVIEW_JOB}: --limit must be a non-negative integer`);
  const fakeProbability = Number(flags.get("--fake-probability") ?? "0.5");
  if (!Number.isFinite(fakeProbability) || fakeProbability < 0 || fakeProbability > 1) throw new Error(`${STEERING_BEHAVIOUR_REVIEW_JOB}: --fake-probability must be in [0, 1]`);
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return {
    dataset: flags.get("--dataset") ?? DEFAULT_BEHAVIOUR_DATASET,
    out: flags.get("--out") ?? join(DEFAULT_BEHAVIOUR_OUT_ROOT, `${stamp}-${engine}`),
    engine: engine as Engine,
    model: flags.get("--model") ?? DEFAULT_BEHAVIOUR_MODEL,
    ...(flags.has("--db") && { db: flags.get("--db")! }),
    ...(limit !== undefined && { limit }),
    fakeProbability,
  };
}

export async function steeringBehaviourReview(argv: readonly string[], print: (line: string) => void = console.log): Promise<void> {
  const args = parseBehaviourReviewArgs(argv);
  const all = readBehaviourDataset(args.dataset);
  const hunks = args.limit === undefined ? all : all.slice(0, args.limit);
  const thresholds = behaviourThresholdsFor(STEERING_BEHAVIOUR_QUESTION_ID);
  const outDir = resolve(args.out);
  // The calibration kernels: live = the production node kernel (Jev through Pi) over a dedicated
  // database; fake = the kernel's offline fake classifier. Loaded here so parsing stays cheap.
  const { openCalibrationKernel } = await import("../advisory-calibration/kernels.js");
  const handle = await openCalibrationKernel({
    engine: args.engine,
    label: "steering-behaviour",
    ...(args.db !== undefined ? { dbPath: args.db } : args.engine === "live" ? { dbPath: join(outDir, "kernel.db") } : {}),
    fake: { probability: () => args.fakeProbability },
  });
  let failed = true;
  try {
    const judge = kernelBehaviourJudge({ kernel: handle.kernel, parentRunId: handle.parentRunId, model: args.model, thresholds });
    const results = await reviewHunks({
      hunks,
      judge,
      thresholds,
      onResult: (result, index, total) => print(`[${index + 1}/${total}] ${result.id}: ${result.label} -> ${result.predicted}${result.probability === null ? "" : ` (p=${result.probability.toFixed(3)})`}`),
    });
    const summary = summarize(results, { thresholds, model: args.model, dataset: resolve(args.dataset), engine: args.engine });
    const paths = writeReviewArtifacts(outDir, results, summary);
    const d = summary.vs_dataset;
    print(`${STEERING_BEHAVIOUR_REVIEW_JOB}: ${results.length} hunks; predicted ${JSON.stringify(summary.predicted)}; accuracy ${d.accuracy ?? "n/a"}; steering precision ${d.steering.precision ?? "n/a"} recall ${d.steering.recall ?? "n/a"}`);
    print(`results: ${paths.results}`);
    print(`summary: ${paths.summary}`);
    failed = false;
  } finally {
    await handle.close(failed ? "error" : "done");
  }
}
