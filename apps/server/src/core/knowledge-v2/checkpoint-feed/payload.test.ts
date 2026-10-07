import { describe, expect, test } from "bun:test";

import type { ConfirmedCheckpointKnowledge } from "@server/generated/baml_client/types";
import { advisoryFingerprint } from "@server/core/validation/qa/advisory-fingerprint.js";

import { INFO_FINDING, NOTE, PATCH, SOURCE_PATH, SYMBOL, TARGET_KEY, UNIT, WARNING_FINDING } from "./__fixtures__/feed-fixture.js";
import { sha256Hex, type ConfirmedCheckpoint } from "./confirmed-good.js";
import {
  advisoryRefs,
  checkpointConfirmedPayload,
  checkpointConfirmedTaskId,
  checkpointFacts,
  compactPriorAdjudication,
  extractionInput,
  factKey,
  keptAdvisories,
  normalizeFactSubject,
} from "./payload.js";
import type { CheckpointSources, SourceDigests } from "./sources.js";

const TARGET = { unit: UNIT, function: SYMBOL };

/** The flagged lines of PATCH, without their `+`: what the fingerprints hash. */
const WARNING_LINE = "    templates_800[0] = *(char**) &lbl_804DA6C4;";
const INFO_LINE = "    f32 sp20 = 0.0f;";
const WARNING_FINGERPRINT = advisoryFingerprint(WARNING_FINDING, WARNING_LINE);
const INFO_FINGERPRINT = advisoryFingerprint(INFO_FINDING, INFO_LINE);

const DIGESTS: SourceDigests = {
  note_sha256: sha256Hex(NOTE),
  agent_note_sha256: null,
  patch_sha256: sha256Hex(PATCH),
  runner_summary_sha256: "4".repeat(64),
  report_changes_sha256: "5".repeat(64),
  adjudication_sha256: null,
};

function confirmedCheckpoint(): ConfirmedCheckpoint {
  return {
    checkpointId: "cp-1",
    integrationId: "integration-cp-1",
    epochId: "epoch-1",
    runId: "run-a",
    workerStateId: "ws-cp-1",
    integratedRev: "a".repeat(40),
    savePointId: "epoch-save-point-epoch-1",
    savePointCommit: "b".repeat(40),
    reportChangesPath: "/fixture/epochs/epoch-1/report_changes.json",
    reportChangesSha256: "5".repeat(64),
    confirmation: "epoch-settled",
    target: { key: TARGET_KEY, unit: UNIT, function: SYMBOL, sourcePath: SOURCE_PATH },
    scores: { old: 60, new: 100, exact: true },
    patchPath: "attempts/cp-1/attempt-1.write_set.diff",
    runnerSummaryPath: "attempts/cp-1/attempt-1.runner.json",
    metadata: {},
  };
}

function sources(adjudication: Record<string, unknown> | null = null): CheckpointSources {
  return { noteText: NOTE, patchText: PATCH, advisories: [WARNING_FINDING, INFO_FINDING], adjudication, digests: DIGESTS };
}

/** The attempt-time adjudication of the warning only, recorded before its hunk moved (line 40, same fingerprint). */
const PRIOR_WARNING = {
  fingerprint: WARNING_FINGERPRINT,
  rule_id: "type_erasing_cast",
  standard_id: "casts",
  severity: "warning",
  file: SOURCE_PATH,
  line: 40,
  excerpt: WARNING_FINDING.excerpt,
  hunk: "@@ -38,1 +38,2 @@\n+    templates_800[0] = *(char**) &lbl_804DA6C4;",
  hunk_sha256: "9".repeat(64),
  justification: "MWCC loads lbl_804DA6C4 through r13 only with the char** view.",
  evidence: ["objdiff 100%"],
  result: "pass",
  probability: 0.91,
  decision: { run_id: "kr-decide-1", engine: "jev", served_model: "typesafe/jev-1.13.0", confidence_source: "native", thresholds: { passAt: 0.8, failAt: 0.2 } },
};

const ADJUDICATION: Record<string, unknown> = {
  schema: "llm_review_adjudication_v1",
  requested_mode: "shadow",
  mode: "shadow",
  verdict: "abstain",
  applied: false,
  advisories: [PRIOR_WARNING],
};

function knowledge(overrides: Partial<ConfirmedCheckpointKnowledge> = {}): ConfirmedCheckpointKnowledge {
  return { tactics: [], codegen_quirks: [], type_facts: [], idioms: [], kept_advisories: [], ...overrides };
}

describe("factKey", () => {
  test("is kind|unit|function|sha256 of the normalized subject", () => {
    const key = factKey("tactic", UNIT, SYMBOL, "Hoist the loop bound");
    expect(key).toMatch(/^tactic\|main\/melee\/lb\/lbsnap\|lbSnap_8001DA5C\|[0-9a-f]{64}$/);
    expect(key).toBe(`tactic|${UNIT}|${SYMBOL}|${sha256Hex("hoist the loop bound")}`);
    expect(factKey("idiom", UNIT, SYMBOL, "Hoist the loop bound")).not.toBe(key);
  });

  test("normalization ignores case, outer whitespace and whitespace runs", () => {
    expect(normalizeFactSubject("  Hoist\tthe  bound ")).toBe("hoist the bound");
    expect(factKey("tactic", UNIT, SYMBOL, "Hoist the  bound")).toBe(factKey("tactic", UNIT, SYMBOL, " hoist the bound "));
  });

  test("the same tactic from two extractions of the same target has the same key", () => {
    const first = checkpointFacts(knowledge({
      tactics: [{ name: "Hoist the loop bound", description: "Load the bound into a local.", applies_when: "a loop re-reads a field", evidence: ["r31 holds the counter"] }],
    }), TARGET);
    const second = checkpointFacts(knowledge({
      tactics: [{ name: "hoist the  loop bound", description: "Keep the bound in a register.", applies_when: "the bound is a struct field", evidence: ["objdiff 100%"] }],
    }), TARGET);
    expect(first.facts).toHaveLength(1);
    expect(second.facts).toHaveLength(1);
    expect(second.facts[0]!.key).toBe(first.facts[0]!.key);
  });
});

describe("checkpointFacts", () => {
  test("maps each extraction list to its kind", () => {
    const { facts, dropped } = checkpointFacts(knowledge({
      tactics: [{ name: "Hoist the loop bound", description: "Load the bound into a local before the loop.", applies_when: "a loop re-reads a struct field", evidence: ["r31 holds the counter"] }],
      codegen_quirks: [{ compiler_behavior: "MWCC loads small-data globals through r13 only via a char** view", source_shape: "*(char**) &lbl_804DA6C4", evidence: ["lwz r3, lbl_804DA6C4@sda21(r13)"] }],
      type_facts: [{ subject: "templates_800", fact: "an array of char*", evidence: ["templates_800[0] = *(char**) &lbl_804DA6C4;"] }],
      idioms: [
        { pattern: "f32 spNN = 0.0f keeps the stack slot", produced_match: true, evidence: ["sp20 keeps offset 0x20"] },
        { pattern: "u32 view of a float global", produced_match: false, evidence: ["no effect on the lwz"] },
      ],
    }), TARGET);
    expect(dropped).toBe(0);
    expect(facts).toStrictEqual([
      {
        key: factKey("tactic", UNIT, SYMBOL, "Hoist the loop bound"),
        kind: "tactic",
        subject: "Hoist the loop bound",
        statement: "Load the bound into a local before the loop.",
        applies_when: "a loop re-reads a struct field",
        evidence: ["r31 holds the counter"],
      },
      {
        key: factKey("codegen_quirk", UNIT, SYMBOL, "MWCC loads small-data globals through r13 only via a char** view"),
        kind: "codegen_quirk",
        subject: "MWCC loads small-data globals through r13 only via a char** view",
        statement: "MWCC loads small-data globals through r13 only via a char** view",
        applies_when: "*(char**) &lbl_804DA6C4",
        evidence: ["lwz r3, lbl_804DA6C4@sda21(r13)"],
      },
      {
        // The librarian resolves type facts by kind "type_fact" and `subject`.
        key: factKey("type_fact", UNIT, SYMBOL, "templates_800"),
        kind: "type_fact",
        subject: "templates_800",
        statement: "an array of char*",
        evidence: ["templates_800[0] = *(char**) &lbl_804DA6C4;"],
      },
      {
        key: factKey("idiom", UNIT, SYMBOL, "f32 spNN = 0.0f keeps the stack slot"),
        kind: "idiom",
        subject: "f32 spNN = 0.0f keeps the stack slot",
        statement: "f32 spNN = 0.0f keeps the stack slot",
        produced_match: true,
        evidence: ["sp20 keeps offset 0x20"],
      },
      {
        key: factKey("idiom", UNIT, SYMBOL, "u32 view of a float global"),
        kind: "idiom",
        subject: "u32 view of a float global",
        statement: "u32 view of a float global",
        produced_match: false,
        evidence: ["no effect on the lwz"],
      },
    ]);
  });

  test("drops items with an empty subject or no evidence and counts them", () => {
    const { facts, dropped } = checkpointFacts(knowledge({
      tactics: [
        { name: "   ", description: "No name.", applies_when: "", evidence: ["objdiff 100%"] },
        { name: "Reorder the locals", description: "Declare sp20 last.", applies_when: "", evidence: ["sp20 keeps 0x20"] },
      ],
      type_facts: [
        { subject: "Mario::mWallNormal", fact: "a Vec at 0x2C", evidence: [] },
        { subject: "lbl_804DA6C4", fact: "a char* in .sdata", evidence: ["  ", ""] },
      ],
      idioms: [{ pattern: "", produced_match: true, evidence: ["matched"] }],
    }), TARGET);
    expect(dropped).toBe(4);
    expect(facts.map((fact) => fact.subject)).toEqual(["Reorder the locals"]);
    // An empty applies_when is left out rather than written as "".
    expect("applies_when" in facts[0]!).toBe(false);
  });

  test("merges facts that share a key, combining their evidence without duplicates", () => {
    const { facts, dropped } = checkpointFacts(knowledge({
      tactics: [
        { name: "Hoist the loop bound", description: "Load the bound into a local.", applies_when: "a loop re-reads a field", evidence: ["r31 holds the counter", "objdiff 100%"] },
        { name: "hoist  the loop bound ", description: "Another wording.", applies_when: "elsewhere", evidence: ["objdiff 100%", "the bound load leaves the loop"] },
      ],
    }), TARGET);
    expect(dropped).toBe(0);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      subject: "Hoist the loop bound",
      statement: "Load the bound into a local.",
      applies_when: "a loop re-reads a field",
      evidence: ["r31 holds the counter", "objdiff 100%", "the bound load leaves the loop"],
    });
  });
});

describe("advisoryRefs and extractionInput", () => {
  test("hand the extraction the target, the bounded note and hunks, and every advisory, info included", () => {
    const { input, refs, noteTruncated, hunksTruncated } = extractionInput(confirmedCheckpoint(), sources());
    expect(input).toEqual({
      unit: UNIT,
      function_name: SYMBOL,
      target_key: TARGET_KEY,
      old_score: 60,
      new_score: 100,
      exact: true,
      note: NOTE,
      hunks: [[SOURCE_PATH, ...PATCH.split("\n").slice(3, 10)].join("\n")],
      advisories: [
        { id: "advisory-1", rule_id: "type_erasing_cast", severity: "warning", file: SOURCE_PATH, line: 11, excerpt: WARNING_FINDING.excerpt, message: WARNING_FINDING.message },
        { id: "advisory-2", rule_id: "stack_local_name", severity: "info", file: SOURCE_PATH, line: 13, excerpt: INFO_FINDING.excerpt, message: INFO_FINDING.message },
      ],
    });
    expect("prior_adjudication" in input).toBe(false);
    expect(noteTruncated).toBe(false);
    expect(hunksTruncated).toBe(false);

    expect(refs.map((ref) => ref.fingerprint)).toEqual([WARNING_FINGERPRINT, INFO_FINGERPRINT]);
    for (const ref of refs) expect(ref.fingerprint).toMatch(/^af2:[0-9a-f]{64}$/);
    expect(refs.map((ref) => ref.finding)).toEqual([WARNING_FINDING, INFO_FINDING]);
    expect(refs.map((ref) => ref.prior)).toEqual([null, null]);
  });

  test("a prior adjudication is matched by fingerprint and handed over compact, without hunks", () => {
    const { input, refs } = extractionInput(confirmedCheckpoint(), sources(ADJUDICATION));
    expect(refs[0]!.prior).toBe(PRIOR_WARNING);
    expect(refs[1]!.prior).toBeNull();

    expect(input.prior_adjudication).toBe(compactPriorAdjudication(ADJUDICATION)!);
    expect(JSON.parse(input.prior_adjudication!)).toEqual({
      verdict: "abstain",
      mode: "shadow",
      advisories: [{
        fingerprint: WARNING_FINGERPRINT,
        rule_id: "type_erasing_cast",
        severity: "warning",
        file: SOURCE_PATH,
        line: 40,
        result: "pass",
        justification: PRIOR_WARNING.justification,
        evidence: ["objdiff 100%"],
      }],
    });
    expect(input.prior_adjudication).not.toContain("hunk");
    expect(compactPriorAdjudication(null)).toBeNull();
  });

  test("without a readable flagged line, the prior is matched by rule, file and line and its fingerprint is used", () => {
    const recorded = { ...PRIOR_WARNING, fingerprint: "af2:recorded", line: 11 };
    const refs = advisoryRefs({ ...sources({ ...ADJUDICATION, advisories: [recorded] }), patchText: "" });
    expect(refs[0]!.prior).toBe(recorded);
    expect(refs[0]!.fingerprint).toBe("af2:recorded");
    expect(refs[1]!.fingerprint).toBeNull();
  });

  test("a prior whose fingerprint differs names other code on that line and is never matched by location", () => {
    const stale = { ...PRIOR_WARNING, fingerprint: `af2:${"0".repeat(64)}`, line: 11, result: "fail" };
    const refs = advisoryRefs(sources({ ...ADJUDICATION, advisories: [stale] }));
    expect(refs[0]!.fingerprint).toBe(WARNING_FINGERPRINT);
    expect(refs[0]!.prior).toBeNull();
  });
});

describe("keptAdvisories", () => {
  test("keeps one entry per known finding marked kept, info included, with the prior decision when recorded", () => {
    const refs = advisoryRefs(sources(ADJUDICATION));
    const kept = keptAdvisories(knowledge({
      kept_advisories: [
        { finding_id: "advisory-1", kept: true, justification: "  MWCC loads through r13 only with the char** view. ", evidence: ["objdiff 100%", "objdiff 100%"] },
        { finding_id: "advisory-1", kept: true, justification: "A second entry for the same finding.", evidence: ["ignored"] },
        { finding_id: "advisory-2", kept: true, justification: "sp20 keeps the stack offset 0x20.", evidence: ["stack offset 0x20"] },
        { finding_id: "advisory-9", kept: true, justification: "Not a finding of this checkpoint.", evidence: ["none"] },
      ],
    }), refs);
    expect(kept).toEqual([
      {
        fingerprint: WARNING_FINGERPRINT,
        rule_id: "type_erasing_cast",
        severity: "warning",
        file: SOURCE_PATH,
        line: 11,
        justification: "MWCC loads through r13 only with the char** view.",
        evidence: ["objdiff 100%"],
        verdict: "pass",
        probability: 0.91,
        confidence_source: "native",
        engine: "jev",
        model: "typesafe/jev-1.13.0",
      },
      {
        fingerprint: INFO_FINGERPRINT,
        rule_id: "stack_local_name",
        severity: "info",
        file: SOURCE_PATH,
        line: 13,
        justification: "sp20 keeps the stack offset 0x20.",
        evidence: ["stack offset 0x20"],
        verdict: null,
        probability: null,
        confidence_source: null,
        engine: null,
        model: null,
      },
    ]);
  });

  test("entries not marked kept are left out", () => {
    const refs = advisoryRefs(sources(ADJUDICATION));
    expect(keptAdvisories(knowledge({
      kept_advisories: [
        { finding_id: "advisory-1", kept: false, justification: null, evidence: [] },
        { finding_id: "advisory-2", kept: false, justification: "Not kept on purpose.", evidence: ["renamed later"] },
      ],
    }), refs)).toEqual([]);
  });
});

describe("checkpointConfirmedPayload", () => {
  test("names the checkpoint, its worker run and submission, and carries facts, kept advisories and digests", () => {
    const checkpoint = confirmedCheckpoint();
    const refs = advisoryRefs(sources(ADJUDICATION));
    const extracted = knowledge({
      tactics: [{ name: "Hoist the loop bound", description: "Load the bound into a local.", applies_when: "a loop re-reads a field", evidence: ["r31 holds the counter"] }],
      type_facts: [{ subject: "Mario::mWallNormal", fact: "a Vec at 0x2C", evidence: [] }],
      kept_advisories: [{ finding_id: "advisory-1", kept: true, justification: "char** view keeps the r13 load.", evidence: ["objdiff 100%"] }],
    });
    const { payload, droppedFacts } = checkpointConfirmedPayload({
      checkpoint,
      submission: { id: "run:ws-cp-1:sub:3", workerRunId: "run:ws-cp-1", seq: 3 },
      knowledge: extracted,
      refs,
      digests: DIGESTS,
      extraction: { kernelRunId: "kr-extract-1", requestedModel: "codex-lb/gpt-5.6-sol" },
    });

    expect(droppedFacts).toBe(1);
    expect(payload).toEqual({
      schema: "checkpoint_confirmed_v1",
      checkpoint_id: "cp-1",
      worker_run_id: "run:ws-cp-1",
      submission_id: "run:ws-cp-1:sub:3",
      submission_seq: 3,
      epoch_id: "epoch-1",
      integration_id: "integration-cp-1",
      integrated_rev: "a".repeat(40),
      save_point_commit: "b".repeat(40),
      confirmation: "epoch-settled",
      target: { key: TARGET_KEY, knowledge_key: `${UNIT}:${SYMBOL}`, unit: UNIT, function: SYMBOL },
      facts: checkpointFacts(extracted, TARGET).facts,
      kept_advisories: keptAdvisories(extracted, refs),
      sources: DIGESTS,
      extraction: { kernel_run_id: "kr-extract-1", served_model: null, requested_model: "codex-lb/gpt-5.6-sol" },
    });
    expect(payload.facts.map((fact) => fact.kind)).toEqual(["tactic"]);
    expect(payload.kept_advisories.map((advisory) => advisory.fingerprint)).toEqual([WARNING_FINGERPRINT]);
    // Stored as JSON text: nothing is lost in the round trip.
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });

  test("the task id is one per checkpoint", () => {
    expect(checkpointConfirmedTaskId("cp-1")).toBe("task:checkpoint_confirmed:cp-1");
  });
});
