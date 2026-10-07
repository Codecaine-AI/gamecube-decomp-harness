// `replay --fixture <dir> --engine live|replay|fake [--db <path>]` (plan §6.9,
// M13 step 1): runs the shadow handler's code path, adjudicateAdvisories, on a
// frozen fixture against a dedicated kernel database, and prints the
// adjudication. It needs no runtime state: the candidate is built from the
// fixture and nests under a seeded parent run.
// - `replay`: the kernel's offline fakes answer with the fixture's recorded
//   extraction and probabilities; nothing reaches the network.
// - `fake`: the deterministic note reader extracts, the fake classifier
//   answers its default p = 0.5 (so every decided advisory abstains).
// - `live`: the production node kernel (codex-lb extraction, Jev decisions).
// The fixture's digests are verified first. When the command ends, its parent
// run, session and container are marked terminal (done/ended, or error when
// the adjudication errored or the replay threw), then the trace doctor runs.
// Replaying into an existing `--db` reuses that database's prior results: every
// node carries a requestId (`replay:<fixture>:…`), so a repeated replay returns
// the recorded extraction and decisions without new engine requests.
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import type { DoctorReport } from "@agent-kernel/kernel/doctor";
import { fakeOk } from "@agent-kernel/kernel/model-nodes/testing";
import {
  adjudicateAdvisories,
  readAdvisoryAdjudicationConfig,
  thresholdsFor,
  type AdvisoryAdjudication,
  type AdvisoryAdjudicationConfig,
  type LlmReviewCandidate,
} from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/index.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";
import type { AdvisoryFindingRef, CheckpointKnowledge } from "@server/generated/baml_client/types";

import { assertKnownFlags, engineFlag, requiredFlag, stringFlag, type CalibrationArgs } from "./args.js";
import { fakeExtractCheckpointKnowledge } from "./fake-extractor.js";
import { REPLAY_FIXTURE_FILES, type FixtureProbabilityRow, type ReplayFixtureManifest } from "./freeze-replay.js";
import { openCalibrationKernel, type FakeEngineScript, type ParentOutcome } from "./kernels.js";
import { readJsonl, sha256Hex } from "./store.js";
import type { CalibrationEngine } from "./types.js";

export interface ReplayFixture {
  dir: string;
  name: string;
  manifest: ReplayFixtureManifest;
  findings: QaScanFinding[];
  patchText: string;
  noteText: string;
  checkpoint: { id: string; attempt_index: number; exact_match: boolean; old_score: number | null; new_score: number | null };
  extraction: CheckpointKnowledge;
  probabilities: FixtureProbabilityRow[];
}

/** Reads a fixture and verifies every file against the manifest's sha256. */
export function loadReplayFixture(dir: string): ReplayFixture {
  const root = resolve(dir);
  const manifestPath = join(root, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`replay: ${manifestPath} not found`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ReplayFixtureManifest;
  const text: Record<string, string> = {};
  for (const name of REPLAY_FIXTURE_FILES) {
    const path = join(root, name);
    if (!existsSync(path)) throw new Error(`replay: fixture file ${name} is missing`);
    text[name] = readFileSync(path, "utf8");
    if (sha256Hex(text[name]!) !== manifest.files[name]) throw new Error(`replay: ${name} does not match its manifest digest`);
  }
  const { source: _source, ...extraction } = JSON.parse(text["fixture-extraction.json"]!) as CheckpointKnowledge & { source?: string };
  return {
    dir: root,
    name: basename(root),
    manifest,
    findings: JSON.parse(text["findings.json"]!) as QaScanFinding[],
    patchText: text["qa_diff.patch"]!,
    noteText: text["note.txt"]!,
    checkpoint: JSON.parse(text["checkpoint.json"]!),
    extraction,
    probabilities: readJsonl<FixtureProbabilityRow>(join(root, "fixture-probabilities.jsonl")),
  };
}

function candidateOf(fixture: ReplayFixture, kernel: { run_id: string; container_id: string; pi_session_id: string }): LlmReviewCandidate {
  return {
    schema: "llm_review_candidate_v1",
    mode: "shadow",
    eligible: true,
    pre_qa: { status: "passed", reasons: [] },
    post_return_check: "not-run",
    advisories: fixture.findings.map((finding) => ({ fingerprint: null, finding })),
    kernel,
    attempt_index: fixture.checkpoint.attempt_index,
    agent_output_path: "note.txt",
    scan_path: "qa_diff.patch",
    code_facts: {
      exact: fixture.checkpoint.exact_match === true,
      old_score: fixture.checkpoint.old_score,
      new_score: fixture.checkpoint.new_score,
    },
  };
}

function fakeScript(fixture: ReplayFixture, engine: "replay" | "fake"): FakeEngineScript {
  return {
    respond(request) {
      if (request.name !== "ExtractCheckpointKnowledge") {
        return { ok: false, failure: { kind: "other", message: `${request.name} is not part of the replay` } };
      }
      if (engine === "replay") return fakeOk(fixture.extraction);
      const [note, findings] = request.args as unknown as [string, AdvisoryFindingRef[]];
      return fakeOk(fakeExtractCheckpointKnowledge(note, findings));
    },
    probability(context) {
      if (engine === "fake") return 0.5;
      const state = context.state as { file?: unknown; line?: unknown };
      const row = fixture.probabilities.find((r) => r.file === state.file && r.line === state.line);
      return row?.probability ?? 0.5;
    },
  };
}

export interface ReplayResult {
  adjudication: AdvisoryAdjudication;
  doctor: DoctorReport;
  dbPath: string;
  /** True when `--db` already existed: nodes with the same requestId replayed prior results. */
  reusedDb: boolean;
}

export async function runReplay(opts: { fixtureDir: string; engine: CalibrationEngine; dbPath?: string; config?: AdvisoryAdjudicationConfig }): Promise<ReplayResult> {
  const fixture = loadReplayFixture(opts.fixtureDir);
  const reusedDb = opts.dbPath !== undefined && existsSync(resolve(opts.dbPath));
  const handle = await openCalibrationKernel({
    engine: opts.engine === "live" ? "live" : "fake",
    label: "replay",
    ...(opts.dbPath !== undefined && { dbPath: opts.dbPath }),
    ...(opts.engine !== "live" && { fake: fakeScript(fixture, opts.engine) }),
  });
  // Any throw before the adjudication returns leaves the parent marked as failed.
  let outcome: ParentOutcome = "error";
  try {
    const shipped = opts.config ?? readAdvisoryAdjudicationConfig();
    let config = shipped;
    if (opts.engine !== "live") {
      // Passes count only when served by the configured model: here, the fake classifier stands in for it.
      const thresholds = thresholdsFor(shipped);
      if (!thresholds) throw new Error(`replay: the config has no thresholds for ${shipped.model}`);
      const ref = handle.classifier!.ref;
      config = { ...shipped, model: ref, thresholds: { [ref]: thresholds } };
    }
    const adjudication = await adjudicateAdvisories({
      kernel: handle.kernel,
      candidate: candidateOf(fixture, { run_id: handle.parentRunId, container_id: handle.containerId, pi_session_id: handle.parentSessionId }),
      noteText: fixture.noteText,
      patchText: fixture.patchText,
      requestIdPrefix: `replay:${fixture.name}`,
      config,
    });
    outcome = adjudication.verdict === "error" ? "error" : "done";
    await handle.finish(outcome);
    const doctor = await handle.doctor();
    return { adjudication, doctor, dbPath: handle.dbPath, reusedDb };
  } finally {
    await handle.close(outcome);
  }
}

export async function replayCommand(args: CalibrationArgs, print: (line: string) => void = console.log): Promise<ReplayResult> {
  assertKnownFlags(args, ["--fixture", "--engine", "--db"]);
  const engine = engineFlag(args);
  const dbPath = stringFlag(args, "--db");
  const result = await runReplay({ fixtureDir: requiredFlag(args, "--fixture"), engine, ...(dbPath !== undefined && { dbPath }) });
  const { adjudication, doctor } = result;
  print(JSON.stringify(adjudication, null, 2));
  const results = adjudication.advisories.map((a) => `${a.file}:${a.line} ${a.result}${a.probability !== undefined ? ` p=${a.probability}` : ""}`);
  print(`replay: ${adjudication.advisories.length} advisories adjudicated, verdict ${adjudication.verdict} (${results.join("; ")})`);
  if (result.reusedDb) {
    print(`replay: --db ${result.dbPath} already existed: nodes with the same requestId reused its prior results (no new engine requests)`);
  }
  const kept = engine === "live" || dbPath !== undefined ? `; kernel DB ${result.dbPath}` : "";
  print(`replay: extraction ${adjudication.extraction.status}; doctor ${doctor.ok ? "ok" : `${doctor.violations.length} violations`}${kept}`);
  if (adjudication.verdict === "error") throw new Error(`replay: adjudication failed: ${adjudication.error ?? "unknown error"}`);
  if (!doctor.ok) throw new Error("replay: the trace doctor found violations");
  return result;
}
