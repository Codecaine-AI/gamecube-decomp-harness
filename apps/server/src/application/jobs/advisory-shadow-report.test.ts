import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options";
import { openState, type StateStore } from "@server/core/harness-runtime/run-state";
import {
  advisoryShadowReport,
  parseShadowReportThresholds,
  type AdvisoryShadowReport,
} from "./advisory-shadow-report";

const JEV = "typesafe/jev-1.13.0";
const RECORDED = { passAt: 0.85, failAt: 0.15, qualification: "exploratory" };
const NOT_CONFIGURED = { status: "skipped", reasons: ["no --post-return-check-command configured"] };
const SKIPPED_AFTER_QA = { status: "skipped", reasons: ["runner validation did not pass"] };

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(dir);
  return dir;
}

function globalsFor(stateDir: string): GlobalArgs {
  return { repoRoot: "/fixture/harness", stateDir, dryRunAgents: false, provider: "pi", model: "test", thinkingLevel: "medium" };
}

type Advisory = Record<string, unknown>;

let fingerprints = 0;

/** A warning advisory; a decision is recorded when it has a probability or an engine error. */
function warning(probability: number | null, result: string, extra: Advisory = {}): Advisory {
  fingerprints += 1;
  return {
    fingerprint: `af2:${fingerprints}`,
    severity: "warning",
    rule_id: "type_erasing_cast",
    result,
    ...(probability === null ? {} : { probability }),
    ...(probability === null && extra.abstain_reason !== "engine-error" ? {} : {
      decision: { run_id: "decision-run", engine: "pi-ai", served_model: JEV, confidence_source: "logprob", thresholds: RECORDED },
    }),
    ...extra,
  };
}

function adjudication(input: { verdict: string; extraction: string; advisories: Advisory[] }): Record<string, unknown> {
  return {
    schema: "llm_review_adjudication_v1",
    requested_mode: "shadow",
    mode: "shadow",
    verdict: input.verdict,
    applied: false,
    advisories: input.advisories,
    accepted_fingerprints: [],
    extraction: { status: input.extraction },
    sources: { note_sha256: "note", patch_sha256: "patch" },
    model: { requested: JEV },
    thresholds: RECORDED,
    duration_ms: 10,
  };
}

function seedCheckpoint(store: StateStore, input: {
  id: string;
  runId?: string;
  validationTime?: string;
  qaStatus?: string;
  mode?: "shadow" | "enforce";
  eligible?: boolean;
  postReturn?: Record<string, unknown> | null;
  adjudication?: Record<string, unknown>;
}): void {
  const metadata = {
    agent_note: "kept",
    post_return_check: input.postReturn === undefined ? SKIPPED_AFTER_QA : input.postReturn,
    llm_review_candidate: {
      schema: "llm_review_candidate_v1",
      mode: input.mode ?? "shadow",
      eligible: input.eligible ?? true,
      post_return_check: "not-run",
    },
    ...(input.adjudication ? { llm_review_adjudication: input.adjudication } : {}),
  };
  store.db.query(`INSERT INTO worker_checkpoints
    (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id, attempt_index, validation_time,
     qa_status, validation_status, metadata_json)
    VALUES (?, 'worker', ?, 'epoch', 'target', 'claim', 1, ?, ?, 'failed', ?)`).run(
    input.id,
    input.runId ?? "run-1",
    input.validationTime ?? "2026-10-07T12:00:00.000Z",
    input.qaStatus ?? "warnings",
    JSON.stringify(metadata),
  );
}

/** A store with six adjudicated shadow checkpoints, one pending, and rows every filter must drop. */
function seededStateDir(): string {
  const stateDir = tempDir("advisory-shadow-report-");
  const store = openState(stateDir);
  try {
    // Accepted at the recorded passAt 0.85; the post-return check never ran.
    seedCheckpoint(store, {
      id: "cp-a",
      adjudication: adjudication({ verdict: "pass", extraction: "ok", advisories: [warning(0.9, "pass"), warning(1, "pass")] }),
    });
    // Accepted only at passAt <= 0.52; no post-return command is configured.
    seedCheckpoint(store, {
      id: "cp-b",
      postReturn: NOT_CONFIGURED,
      adjudication: adjudication({
        verdict: "abstain",
        extraction: "ok",
        advisories: [warning(0.9, "pass"), warning(0.52, "abstain", { abstain_reason: "low-confidence" })],
      }),
    });
    // A missing justification never reaches a decision; info advisories never count.
    seedCheckpoint(store, {
      id: "cp-c",
      adjudication: adjudication({
        verdict: "fail",
        extraction: "ok",
        advisories: [
          warning(null, "fail", { fail_reason: "justification-missing" }),
          warning(0.15, "fail", { fail_reason: "judged-unjustified" }),
          { fingerprint: "af2:info", severity: "info", rule_id: "stack_local", result: "noted" },
        ],
      }),
    });
    seedCheckpoint(store, { id: "cp-d", adjudication: adjudication({ verdict: "error", extraction: "error", advisories: [] }) });
    seedCheckpoint(store, {
      id: "cp-e",
      adjudication: adjudication({
        verdict: "abstain",
        extraction: "ok",
        advisories: [warning(null, "abstain", { abstain_reason: "engine-error" })],
      }),
    });
    // A pass served by an uncalibrated model never counts, whatever the thresholds.
    seedCheckpoint(store, {
      id: "cp-f",
      adjudication: adjudication({
        verdict: "abstain",
        extraction: "ok",
        advisories: [warning(0.95, "abstain", { abstain_reason: "served-model-unverified" })],
      }),
    });
    seedCheckpoint(store, { id: "cp-pending" });
    // Never counted: enforce, ineligible, not a warnings scan, another run, before --since.
    const accepted = adjudication({ verdict: "pass", extraction: "ok", advisories: [warning(0.99, "pass")] });
    seedCheckpoint(store, { id: "cp-enforce", mode: "enforce", adjudication: accepted });
    seedCheckpoint(store, { id: "cp-ineligible", eligible: false });
    seedCheckpoint(store, { id: "cp-clean", qaStatus: "clean", adjudication: accepted });
    seedCheckpoint(store, { id: "cp-other-run", runId: "run-2", adjudication: accepted });
    seedCheckpoint(store, { id: "cp-old", validationTime: "2026-10-01T00:00:00.000Z", adjudication: accepted });
  } finally {
    store.db.close();
  }
  return stateDir;
}

function storeDigest(stateDir: string): Record<string, string | null> {
  return Object.fromEntries(["orchestrator.sqlite", "orchestrator.sqlite-wal"].map((name) => {
    const path = join(stateDir, name);
    return [name, existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null];
  }));
}

async function report(stateDir: string, args: Array<[string, string | true]>): Promise<AdvisoryShadowReport> {
  let printed: AdvisoryShadowReport | undefined;
  await advisoryShadowReport(globalsFor(stateDir), new Map(args), { print: (value) => { printed = value; } });
  if (!printed) throw new Error("no report printed");
  return printed;
}

function histogramCounts(value: AdvisoryShadowReport): Record<string, number> {
  return Object.fromEntries(value.decisions.histogram.filter((bin) => bin.count > 0).map((bin) => [`${bin.from}-${bin.to}`, bin.count]));
}

describe("advisory-shadow-report", () => {
  test("would-accept rate and histogram match a seeded store", async () => {
    const stateDir = seededStateDir();
    const thresholdsPath = join(tempDir("advisory-shadow-thresholds-"), "config.json");
    writeFileSync(thresholdsPath, JSON.stringify({
      model: JEV,
      thresholds: {
        [JEV]: { passAt: 0.5, failAt: 0.1, qualification: "exploratory" },
        "other/model": { passAt: 0.1, failAt: 0.05 },
      },
    }));
    const before = storeDigest(stateDir);

    const result = await report(stateDir, [["--run", "run-1"], ["--since", "2026-10-07T00:00:00Z"], ["--thresholds", thresholdsPath]]);

    expect(result.filters).toEqual({ run: "run-1", since: "2026-10-07T00:00:00.000Z" });
    expect({ eligible: result.eligible, adjudicated: result.adjudicated, pending: result.pending }).toEqual({
      eligible: 7,
      adjudicated: 6,
      pending: 1,
    });
    expect(result.extraction).toEqual({ ok: 5, error: 1, skipped: 0, unknown: 0 });
    expect(result.verdicts).toEqual({ pass: 1, fail: 1, abstain: 3, error: 1, unknown: 0 });
    expect(result.decisions).toMatchObject({
      count: 7,
      abstain: 3,
      abstain_rate: 0.4286,
      abstain_reasons: { "low-confidence": 1, "engine-error": 1, "served-model-unverified": 1 },
      engine_error: 1,
      engine_error_rate: 0.1429,
    });
    expect(result.decisions.histogram).toHaveLength(20);
    expect(result.decisions.histogram[0]).toEqual({ from: 0, to: 0.05, count: 0 });
    expect(histogramCounts(result)).toEqual({ "0.15-0.2": 1, "0.5-0.55": 1, "0.9-0.95": 2, "0.95-1": 2 });
    expect(result.recorded_thresholds).toEqual([{ ...RECORDED, count: 6 }]);
    expect(result.would_accept).toEqual([
      {
        label: "configured", source: "recorded", passAt: null, failAt: null, model: null,
        evaluated: 6, count: 1, rate: 0.1667, unknown_post_return_check_not_run: 1,
      },
      {
        label: JEV, source: "alternative", passAt: 0.5, failAt: 0.1, model: JEV,
        evaluated: 6, count: 2, rate: 0.3333, unknown_post_return_check_not_run: 1,
      },
      {
        label: "other/model", source: "alternative", passAt: 0.1, failAt: 0.05, model: "other/model",
        evaluated: 0, count: 0, rate: null, unknown_post_return_check_not_run: 0,
      },
    ]);
    // Read-only: the store's bytes are unchanged.
    expect(storeDigest(stateDir)).toEqual(before);
  });

  test("without filters every eligible shadow checkpoint counts; enforce, ineligible and clean rows never do", async () => {
    const result = await report(seededStateDir(), []);

    expect({ eligible: result.eligible, adjudicated: result.adjudicated }).toEqual({ eligible: 9, adjudicated: 8 });
    expect(result.would_accept).toEqual([expect.objectContaining({ label: "configured", evaluated: 8, count: 3 })]);
  });

  test("threshold files: a pair, a labelled list, and invalid input", () => {
    expect(parseShadowReportThresholds({ passAt: 0.9, failAt: 0.2 })).toEqual([{ label: "alternative", passAt: 0.9, failAt: 0.2 }]);
    expect(parseShadowReportThresholds([{ label: "strict", passAt: 0.95, failAt: 0.05 }, { passAt: 0.7, failAt: 0.3 }])).toEqual([
      { label: "strict", passAt: 0.95, failAt: 0.05 },
      { label: "alternative-2", passAt: 0.7, failAt: 0.3 },
    ]);
    expect(() => parseShadowReportThresholds({ passAt: 0.2, failAt: 0.9 })).toThrow("0 <= failAt <= passAt <= 1");
    expect(() => parseShadowReportThresholds({ passAt: "0.9" })).toThrow("numeric passAt and failAt");
  });

  test("argument errors name the usage; a missing store is an error", async () => {
    const stateDir = seededStateDir();
    expect(report(stateDir, [["--since", "yesterday"]])).rejects.toThrow("--since must be an ISO timestamp");
    expect(report(stateDir, [["--run", true]])).rejects.toThrow("Missing value for --run");
    expect(report(tempDir("advisory-shadow-empty-"), [])).rejects.toThrow("Orchestrator state database not found");
  });
});
