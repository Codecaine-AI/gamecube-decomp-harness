import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openState } from "@server/core/orchestrator-state";
import { recordSteeringBackfill, recordSteeringRollback } from "@server/core/harness-runtime/run-state/steering.js";
import { clearUnverifiedMatch, recordUnverifiedMatch } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { packageRoot } from "@server/core/knowledge";
import { compilerDeltaXml, previousAttemptXml, steeringProbeXml } from "./context.js";
import { previousAttemptFromUnverified, steeringPreviousAttempt } from "./previous-attempt.js";
import { workerPrompt } from "./prompt.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "previous-attempt-"));
  dirs.push(dir);
  return dir;
}

function withStore(run: (store: ReturnType<typeof openState>, dir: string) => void): void {
  const dir = tempDir();
  const store = openState(dir);
  try {
    run(store, dir);
  } finally {
    store.db.close();
  }
}

/** The real SMS maintainer rulings: the block quotes them verbatim. */
const RULINGS = resolve(packageRoot(), "games/sms/knowledge/sources/injectable/steering_lessons/review_rulings.jsonl");
const UNIT = "M3DUtil/MActor";
const SYMBOL = "setLightData__6MActorFv";
const target = { gameId: "sms", unit: UNIT, symbol: SYMBOL };

const PROBE = {
  function: "MActor::setLightData()",
  symbol: SYMBOL,
  unit: UNIT,
  decision: "steering_located",
  match: { base: 96.4, candidate: 100, real_only: 98.1 },
  steering_edits: [{ file: "src/M3DUtil/MActor.cpp", line: 212, shapes: ["temp_alias"], before: "mLightData->set(i, c);", after: "J3DLightObj* l = mLightData; l->set(i, c);", delta: 1.9 }],
  hypotheses: [{ cause: "missing inline function", why: "a single-use temp moves registers the way an inline does", how_to_check: "real_code_evidence inlines --type MActor --member mLightData" }],
};

function renderContext(packetExtra: Record<string, unknown>, steeringGate: "off" | "shadow" | "enforce"): string {
  return workerPrompt({
    packet: { target: { unit: UNIT, symbol: SYMBOL, source_path: "src/M3DUtil/MActor.cpp", fuzzy_match_percent: 98.1 }, ...packetExtra },
    repoRoot: "/repo",
    stateDir: "/state",
    initialBoardPath: "/state/board.json",
    workerLogDir: "/state/workers",
    targetSourceText: "void MActor::setLightData() {}\n",
    sourceNames: [],
    stackFramePolicy: "stop_at_frame",
    steeringGate,
  }).kernelContext?.renderedContext ?? "";
}

describe("previous_attempt from the steering backfill", () => {
  test("a rolled-back steering match reaches the next worker, whatever the current source hash", () => {
    withStore((store) => {
      recordSteeringBackfill(store, {
        ...target,
        analyzedRev: "abcdef0123456789",
        functionSourceSha: "hash-of-the-steered-source",
        verdict: "pass",
        applied: true,
        // SteeringBackfillFunctionReport (validation/jobs/steering-gate.ts).
        report: {
          base_rev: "81248bda",
          initial: "steering_located",
          decision: "pass",
          applied: true,
          provisional: true,
          match: PROBE.match,
          final_match: { base: 96.4, candidate: 98.1, real_only: 98.1 },
          removed_edit_groups: [{
            id: "src/M3DUtil/MActor.cpp@3.0",
            file: "src/M3DUtil/MActor.cpp",
            line: 212,
            location: "src/M3DUtil/MActor.cpp:212",
            shapes: ["temp_alias"],
            text: "J3DLightObj* l = mLightData; / l->set(i, c);",
            restored: "mLightData->set(i, c);",
          }],
          reasons: ["S* without the steering-only retained groups loses the match (labelled steering)"],
          probe: PROBE,
          check: "/nonexistent/check.json",
          recheck: null,
        },
      });
      const attempt = steeringPreviousAttempt(store, { ...target, currentScore: 98.1, rulingsPath: RULINGS });
      expect(attempt).not.toBeNull();
      expect(attempt!.removed_edits[0]).toEqual({ file: "src/M3DUtil/MActor.cpp", line: 212, shapes: ["temp_alias"], before: "mLightData->set(i, c);", after: "J3DLightObj* l = mLightData; / l->set(i, c);" });
      expect(attempt!.rules.map((rule) => rule.name)).toEqual(["steering-is-a-probe"]);
      expect(attempt!.rules[0]!.ruling?.quote).toBe("Totally a fakematch");

      const context = renderContext({ previous_attempt: attempt }, "enforce");
      expect(context).toContain(`<previous_attempt function="${SYMBOL}" unit="${UNIT}" decision="steering_located" analyzed_rev="abcdef012345">`);
      expect(context).toContain("A previous attempt reached 100% only through behaviour-identical steering edits. The steering backfill rolled it back and removed that code; the real-only match left is 98.1%.");
      expect(context).toContain('<edit at="src/M3DUtil/MActor.cpp:212" shapes="temp_alias">');
      expect(context).toContain("<removed>J3DLightObj* l = mLightData; / l-&gt;set(i, c);</removed>");
      expect(context).toContain("<gate_reason>S* without the steering-only retained groups loses the match (labelled steering)</gate_reason>");
      expect(context).toContain('<hint cause="missing inline function" how_to_check="real_code_evidence inlines --type MActor --member mLightData">');
      expect(context).toContain('<maintainer_quote reviewer="Mrkol" pr="330" ruling="sms-330-fakematch-steering">Totally a fakematch</maintainer_quote>');
      expect(context).not.toContain("{{");
    });
  });

  test("an applied dead UNUSED body whose re-check reasons are empty gets its rule from the first check report", () => {
    withStore((store, dir) => {
      const checkPath = join(dir, "check.json");
      writeFileSync(checkPath, JSON.stringify({
        reduce: { groups: [] },
        decision: {
          functions: [{ unit: "Enemy/chuuhana", name: "margeVelocity__9TChuuHanaFv", demangled: "TChuuHana::margeVelocity()", groups: [], unused_check: "dead", reasons: ["UNUSED in the link map: stub test dead (no target function changes)"], match: { base: 0, candidate: 100, real_only: 0 } }],
          violations: [{ kind: "dead_unused_body", unit: "Enemy/chuuhana", file: "src/Enemy/chuuhana.cpp", function: "margeVelocity__9TChuuHanaFv", line: 554 }],
        },
      }));
      recordSteeringBackfill(store, {
        gameId: "sms",
        unit: "Enemy/chuuhana",
        symbol: "margeVelocity__9TChuuHanaFv",
        analyzedRev: "3ebd9d9c",
        verdict: "pass",
        applied: true,
        report: { initial: "rule_violation", decision: "pass", applied: true, match: { base: 0, candidate: 100, real_only: 0 }, removed_edit_groups: [], reasons: [], probe: null, check: checkPath, recheck: null },
      });
      const attempt = steeringPreviousAttempt(store, { gameId: "sms", unit: "Enemy/chuuhana", symbol: "margeVelocity__9TChuuHanaFv", rulingsPath: RULINGS });
      expect(attempt?.rules.map((rule) => rule.name)).toEqual(["UNUSED-only-when-inlined"]);
      const block = previousAttemptXml({ previous_attempt: attempt }, "shadow");
      expect(block).toContain("only through a body for a map-UNUSED function the original never inlined (dead code)");
      expect(block).toContain("<gate_reason>UNUSED in the link map: stub test dead (no target function changes)</gate_reason>");
      expect(block).toContain("Made up bullshit, remove. UNUSED functions may only be reconstructed when they were inlined into other functions in the same TU");
      expect(block).toContain("Keep the upstream stub");
    });
  });

  test("an out-of-order fill names decompile-in-order from report fields alone", () => {
    withStore((store) => {
      recordSteeringBackfill(store, {
        gameId: "sms",
        unit: "System/MarNameRefGen",
        symbol: "getNameRef__13TMarNameRefGenFPCc",
        analyzedRev: "c0ffee",
        verdict: "pass",
        applied: true,
        report: { decision: "rule_violation", violations: [{ kind: "out_of_order", file: "src/System/MarNameRefGen.cpp", class: "TKoopa" }], reasons: ["out of order: TKoopa (Enemy/Koopa 0%)"] },
      });
      const attempt = steeringPreviousAttempt(store, { gameId: "sms", unit: "System/MarNameRefGen", symbol: "getNameRef__13TMarNameRefGenFPCc", rulingsPath: RULINGS });
      expect(attempt?.rules.map((rule) => rule.name)).toEqual(["decompile-in-order"]);
      expect(attempt?.rules[0]?.ruling?.quote).toContain("Please leave MarNameRefGen alone");
      expect(previousAttemptXml({ previous_attempt: attempt }, "enforce")).toContain("Leave the code that needs undecompiled classes until their units are decompiled.");
    });
  });

  test("the rollback event survives a later --record that certifies the function as a plain pass", () => {
    withStore((store) => {
      const applied = {
        base_rev: "81248bda", initial: "steering_located", decision: "pass", applied: true, provisional: true, match: PROBE.match,
        removed_edit_groups: [{ id: "g", file: "src/M3DUtil/MActor.cpp", line: 212, location: "src/M3DUtil/MActor.cpp:212", shapes: ["temp_alias"], text: "J3DLightObj* l = mLightData;", restored: "mLightData->set(i, c);" }],
        violations: [], rules: ["steering"], reasons: ["labelled steering"], probe: PROBE, check: "/nonexistent", recheck: null,
      };
      recordSteeringRollback(store, { ...target, analyzedRev: "steered0", baseRev: "81248bda", initialVerdict: "steering_located", finalVerdict: "pass", rules: ["steering"], report: applied });
      // apply -> commit -> re-check -> record: the current certification is a clean pass with nothing to say.
      recordSteeringBackfill(store, { ...target, analyzedRev: "cleaned1", verdict: "pass", applied: false, report: { initial: "pass", decision: "pass", applied: false, rules: [], violations: [], removed_edit_groups: [] } });
      const attempt = steeringPreviousAttempt(store, { ...target, currentScore: 98.1, rulingsPath: RULINGS });
      expect(attempt).toMatchObject({ decision: "steering_located", analyzed_rev: "steered0", applied: true });
      expect(attempt!.rules.map((rule) => rule.name)).toEqual(["steering-is-a-probe"]);
      expect(attempt!.removed_edits[0]).toMatchObject({ file: "src/M3DUtil/MActor.cpp", line: 212 });
    });
  });

  test("a rule rollback whose verdicts all pass still renders its rule", () => {
    withStore((store) => {
      const violation = { kind: "dead_unused_body", file: "src/Enemy/chuuhana.cpp", line: 554, location: "src/Enemy/chuuhana.cpp:554", function: "TChuuHana::margeVelocity", problem: "dead UNUSED body: TChuuHana::margeVelocity (src/Enemy/chuuhana.cpp:554) — UNUSED functions may only be reconstructed when inlined" };
      recordSteeringRollback(store, {
        gameId: "sms", unit: "Enemy/chuuhana", symbol: "execute__9TChuuHanaFv", analyzedRev: "3ebd9d9c", baseRev: "81248bda",
        initialVerdict: "pass", finalVerdict: "pass", rules: ["dead_unused_body"],
        report: { initial: "pass", decision: "pass", applied: true, removed_edit_groups: [], violations: [violation], rules: ["dead_unused_body"], reasons: [violation.problem] },
      });
      const attempt = steeringPreviousAttempt(store, { gameId: "sms", unit: "Enemy/chuuhana", symbol: "execute__9TChuuHanaFv", rulingsPath: RULINGS });
      expect(attempt).toMatchObject({ decision: "rule_violation", verdict_after: "pass" });
      expect(attempt!.rules.map((rule) => rule.name)).toEqual(["UNUSED-only-when-inlined"]);
      expect(previousAttemptXml({ previous_attempt: attempt }, "enforce")).toContain("Keep the upstream stub");
    });
  });

  test("nothing without a row, for a done function, for a clean row, or behind migration 013", () => {
    withStore((store) => {
      expect(steeringPreviousAttempt(store, { ...target, rulingsPath: RULINGS })).toBeNull();
      expect(renderContext({}, "enforce")).not.toContain("previous_attempt");

      recordSteeringBackfill(store, { ...target, analyzedRev: "r1", verdict: "steering_located", report: { initial: "steering_located", probe: PROBE } });
      expect(steeringPreviousAttempt(store, { ...target, currentScore: 100 })).toBeNull();

      recordSteeringBackfill(store, { ...target, analyzedRev: "r2", verdict: "pass", report: { initial: "pass", match: { base: 90, candidate: 100, real_only: 100 } } });
      expect(steeringPreviousAttempt(store, target)).toBeNull();
    });
    withStore((store) => {
      store.db.run("DROP TABLE steering_backfill");
      expect(steeringPreviousAttempt(store, target)).toBeNull();
    });
  });

  test("an inactive steering gate renders no block, so the context is byte-identical", () => {
    const attempt = { symbol: SYMBOL, unit: UNIT, decision: "steering_located", rules: [{ kind: "steering", name: "steering-is-a-probe" }] };
    expect(previousAttemptXml({ previous_attempt: attempt }, "off")).toBe("");
    expect(renderContext({ previous_attempt: attempt }, "off")).toBe(renderContext({}, "off"));
    // Active gate: the block sits after the first diff and before any probe.
    const both = renderContext({ previous_attempt: attempt, steering_probe: PROBE }, "shadow");
    expect(both.indexOf("<previous_attempt")).toBeGreaterThan(-1);
    expect(both.indexOf("<previous_attempt")).toBeLessThan(both.indexOf("<steering_probe"));
  });
});

describe("previous_attempt for a 100% but unverified match", () => {
  const UNVERIFIED = {
    ...target,
    analyzedRev: "feedface0123456789",
    baseRev: "81248bda",
    sourcePath: "src/M3DUtil/MActor.cpp",
    match: { base: 96.4, candidate: 100, real_only: 97.2 },
    reasons: ["incomplete groups: src/M3DUtil/MActor.cpp@4.0"],
    // SteeringBackfillFunctionReport of an unresolved function (validation/jobs/steering-gate.ts).
    report: {
      initial: "unresolved",
      decision: "unresolved",
      applied: false,
      unexplained_edit_groups: [{
        id: "src/M3DUtil/MActor.cpp@4.0",
        file: "src/M3DUtil/MActor.cpp",
        line: 212,
        location: "src/M3DUtil/MActor.cpp:212",
        shapes: ["other"],
        text: "J3DLightObj* l = getLightData(); / l->set(i, c);",
        restored: "mLightData->set(i, c);",
        status: "unresolved",
      }],
      reasons: ["IR changes but no real shape found (other)"],
      probe: PROBE,
    },
  };

  test("an active row reaches the worker at 100% and renders the unverified block byte for byte", () => {
    withStore((store) => {
      recordUnverifiedMatch(store, UNVERIFIED);
      // Shown at a score of 100: the old rollback guard would have hidden it.
      const attempt = steeringPreviousAttempt(store, { ...target, currentScore: 100, rulingsPath: RULINGS });
      expect(attempt).toMatchObject({
        variant: "unverified_match",
        label: "100% but unverified",
        decision: "unresolved",
        applied: false,
        trusted_base_rev: "81248bda",
        source_path: "src/M3DUtil/MActor.cpp",
        total_edits: 1,
        omitted_edits: 0,
        full_report_locator: null,
        open_reviews: [],
        match: { base: 96.4, candidate: 100, real_only: 97.2 },
        reasons: ["incomplete groups: src/M3DUtil/MActor.cpp@4.0"],
        removed_edits: [],
        rules: [],
      });

      expect(previousAttemptXml({ previous_attempt: attempt }, "enforce")).toBe([
        `    <previous_attempt variant="unverified_match" label="100% but unverified" function="${SYMBOL}" unit="${UNIT}" decision="unresolved" analyzed_rev="feedface0123" trusted_base_rev="81248bda" source_path="src/M3DUtil/MActor.cpp" total_edits="1" omitted_edits="0" full_report_locator="unavailable">`,
        `        <what_happened>This function's code reaches 100%, but the steering gate could not certify it: it could neither prove the match real nor attribute it to probe edits. It is "100% but unverified": not done and not counted as matched. Nothing in the current source is certified, including edits this block does not list.</what_happened>`,
        "        <instruction>Read full_report_locator and the source at trusted_base_rev, then follow the unverified_match steps in the system prompt's method. Resubmitting the same code leaves it unverified.</instruction>",
        '        <match base="96.4%" candidate="100%" />',
        '        <unexplained_edits shown="1" total="1">',
        '            <edit at="src/M3DUtil/MActor.cpp:212" status="unresolved" shapes="other">',
        "                <base>mLightData-&gt;set(i, c);</base>",
        "                <unexplained>J3DLightObj* l = getLightData(); / l-&gt;set(i, c);</unexplained>",
        "            </edit>",
        "        </unexplained_edits>",
        "        <gate_reason>incomplete groups: src/M3DUtil/MActor.cpp@4.0</gate_reason>",
        '        <hint cause="missing inline function" how_to_check="real_code_evidence inlines --type MActor --member mLightData">a single-use temp moves registers the way an inline does</hint>',
        "    </previous_attempt>",
      ].join("\n"));
      expect(renderContext({ previous_attempt: attempt }, "shadow")).not.toContain("{{");
    });
  });

  test("the block counts omitted edits, carries the report locator and shows open evidence reviews from the review store's hook", () => {
    const groups = Array.from({ length: 8 }, (_, index) => ({ id: `g${index}`, file: "src/M3DUtil/MActor.cpp", line: 200 + index, text: `edit ${index};`, status: "unresolved" }));
    withStore((store) => {
      recordUnverifiedMatch(store, { ...UNVERIFIED, report: { ...UNVERIFIED.report, unexplained_edit_groups: groups, full_report_locator: "build/steering/reports/obs-7.json" } });
      const lookups: unknown[] = [];
      const attempt = steeringPreviousAttempt(store, {
        ...target,
        // The path provisioning delivered for this claim (worker task file).
        fullReportLocator: "build/steering/reports/obs-7.json",
        openReviews: (_store, lookupTarget) => {
          lookups.push(lookupTarget);
          return [{ id: "rev-1", site_file: "src/M3DUtil/MActor.cpp", site_lines: "212-213", summary: "map-backed weak inline getLightData", base_rev: "81248bda" }];
        },
      });
      expect(lookups).toEqual([{ gameId: "sms", unit: UNIT, symbol: SYMBOL }]);
      expect(attempt).toMatchObject({ total_edits: 8, omitted_edits: 2, full_report_locator: "build/steering/reports/obs-7.json" });
      const xml = previousAttemptXml({ previous_attempt: attempt }, "enforce");
      expect(xml).toContain('total_edits="8" omitted_edits="2" full_report_locator="build/steering/reports/obs-7.json"');
      expect(xml).toContain('<unexplained_edits shown="6" total="8">');
      expect(xml.match(/<edit at=/g)?.length).toBe(6);
      expect(xml).toContain([
        '        <open_reviews total="1">',
        '            <review id="rev-1" site="src/M3DUtil/MActor.cpp:212-213" status="pending">map-backed weak inline getLightData</review>',
        "        </open_reviews>",
      ].join("\n"));

      // A failing lookup never hides the block.
      const failing = steeringPreviousAttempt(store, { ...target, openReviews: () => { throw new Error("store down"); } });
      expect(failing).toMatchObject({ variant: "unverified_match", open_reviews: [] });
    });
    // An explicit locator wins; the samples' builder takes the same options.
    expect(previousAttemptFromUnverified({ ...UNVERIFIED, recordedAt: "2026-10-17T00:00:00.000Z" }, { fullReportLocator: "build/steering/reports/x.json" }).full_report_locator).toBe("build/steering/reports/x.json");
  });

  test("the unverified row wins over a rollback; once cleared the rollback lookup and its done guard apply", () => {
    withStore((store) => {
      recordSteeringRollback(store, {
        ...target, analyzedRev: "steered0", baseRev: "81248bda", initialVerdict: "steering_located", finalVerdict: "pass", rules: ["steering"],
        report: { initial: "steering_located", decision: "pass", applied: true, rules: ["steering"], reasons: ["labelled steering"], removed_edit_groups: [{ id: "g", file: "src/M3DUtil/MActor.cpp", line: 212, text: "J3DLightObj* l = mLightData;", restored: "mLightData->set(i, c);" }] },
      });
      recordUnverifiedMatch(store, UNVERIFIED);
      expect(steeringPreviousAttempt(store, { ...target, currentScore: 98.1 })?.variant).toBe("unverified_match");

      expect(clearUnverifiedMatch(store, { ...target, clearedBy: "test" })).toBeTrue();
      const rollback = steeringPreviousAttempt(store, { ...target, currentScore: 98.1 });
      expect(rollback?.variant).toBeUndefined();
      expect(rollback).toMatchObject({ decision: "steering_located", analyzed_rev: "steered0" });
      expect(steeringPreviousAttempt(store, { ...target, currentScore: 100 })).toBeNull();
    });
  });

  test("a store behind migration 015 falls back to the rollback lookup", () => {
    withStore((store) => {
      store.db.run("DROP TABLE steering_unverified_matches");
      recordSteeringBackfill(store, { ...target, analyzedRev: "r1", verdict: "steering_located", report: { initial: "steering_located", probe: PROBE } });
      expect(steeringPreviousAttempt(store, { ...target, currentScore: 98.1 })).toMatchObject({ decision: "steering_located" });
      expect(steeringPreviousAttempt(store, { ...target, currentScore: 100 })).toBeNull();
    });
  });

  test("an inactive steering gate renders no unverified block, so Melee stays byte-identical", () => {
    withStore((store) => {
      recordUnverifiedMatch(store, UNVERIFIED);
      const attempt = steeringPreviousAttempt(store, target);
      expect(previousAttemptXml({ previous_attempt: attempt }, "off")).toBe("");
      expect(renderContext({ previous_attempt: attempt }, "off")).toBe(renderContext({}, "off"));
    });
  });
});

describe("steering_probe compiler_delta", () => {
  test("renders a measured delta, an unavailable one, or none yet", () => {
    const present = compilerDeltaXml({ version: "GC/1.2.5", observation_id: "obs-7", summary_lines: ["+1 node: temp l, coalesced neighbour of `this`", "`this` r28 -> r31"], changes: [{ kind: "node_added" }, { kind: "register" }] });
    expect(present).toBe([
      '        <compiler_delta status="present" version="GC/1.2.5" observation_id="obs-7" changes="2">',
      "            +1 node: temp l, coalesced neighbour of `this`",
      "            `this` r28 -&gt; r31",
      "        </compiler_delta>",
    ].join("\n"));
    expect(compilerDeltaXml({ unavailable: "traced-object-mismatch" })).toBe('        <compiler_delta status="unavailable" reason="traced-object-mismatch" />');
    expect(compilerDeltaXml(undefined)).toBe('        <compiler_delta status="absent" />');
    const many = compilerDeltaXml({ summary_lines: Array.from({ length: 15 }, (_, index) => `change ${index}`) });
    expect(many).toContain('omitted_lines="3"');
    expect(many).not.toContain("change 12");
  });

  test("the probe block shows the delta once, outside probe_json", () => {
    const xml = steeringProbeXml({ steering_probe: { ...PROBE, revision: "81248bda", compiler_delta: { unavailable: "no traced build for GC/1.1p1" } } }, "enforce");
    expect(xml).toContain('revision="81248bda"');
    expect(xml).toContain('<compiler_delta status="unavailable" reason="no traced build for GC/1.1p1" />');
    expect(xml.match(/no traced build/g)?.length).toBe(1);
    expect(steeringProbeXml({ steering_probe: PROBE }, "enforce")).toContain('<compiler_delta status="absent" />');
    expect(steeringProbeXml({ steering_probe: PROBE }, "off")).toBe("");
  });
});
