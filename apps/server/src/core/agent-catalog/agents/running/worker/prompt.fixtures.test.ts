import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { agentToolRegistry } from "@server/core/tools/runtime/registry.js";
import { resolveAgentToolIdsForContext } from "@server/core/tools";
import * as profiles from "@server/core/tools/profiles/defaults.js";
import type { CompilerCapabilities } from "./compiler-capabilities.js";
import { workerPromptToolIds } from "./context.js";
import { workerPrompt } from "./prompt.js";
import { QA_LINT_REPAIR_INSTRUCTION } from "./change-validation.js";
import { UNVERIFIED_MATCH_INSTRUCTION } from "./steering-validation.js";
import {
  workerFacingRepairRequest,
  workerRepairInstruction,
} from "@server/core/harness-runtime/phases/running/workers/worker-cycle.js";
import { stackOnlyPerturbationReason } from "@server/core/validation/stack/stack-check.js";
import { STEERING_LOCATED_INSTRUCTION } from "@server/core/validation/steering/steering-check.js";

/**
 * Pins the worker prompt variants that actually run, rendered from the real
 * game descriptors: `melee-off` and `melee-shadow` (Melee: match_frame, gate
 * off, advisory off / shadow) and `sms-live` (SMS: stop_at_frame, advisory
 * shadow, steering gate enforce, ordering enforce). The traced-compiler
 * capabilities are a fixed fixture so the pin does not move when
 * `native/CAPABILITIES.json` is rebuilt. Regenerate with
 * `UPDATE_PROMPT_FIXTURES=1 bun test prompt.fixtures.test.ts` for an intended
 * prompt change, and review the diff.
 */
const FIXTURES = resolve(import.meta.dir, "__fixtures__/prompts");
const UPDATE = process.env.UPDATE_PROMPT_FIXTURES === "1";

function pinned(name: string, actual: string): void {
  const path = resolve(FIXTURES, `${name}.txt`);
  if (UPDATE) writeFileSync(path, actual);
  expect(actual).toBe(readFileSync(path, "utf8"));
}

const repoRoot = resolve(import.meta.dir, "../../../../../../../..");
const games = {
  melee: { gameId: "melee", descriptorPath: resolve(repoRoot, "games/melee/game.json") },
  sms: { gameId: "sms", descriptorPath: resolve(repoRoot, "games/sms/game.json") },
};

/** The contract's per-version matrix (scheduling is milestone 2, so absent everywhere). */
const CAPABILITIES_FIXTURE: CompilerCapabilities = {
  schema: "mwcc-native-capabilities-v1",
  pin: "92f893f",
  versions: {
    "1.2.5": { points: ["vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse", "frame"] },
    "1.2.5n": { points: ["vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse"] },
    "1.1p1": { points: ["interference", "coloring", "coalescing", "inlining", "cse"] },
  },
};

const packet = {
  target: {
    unit: "GALE01:fixture",
    symbol: "fixture_symbol",
    source_path: "src/melee/test/fixture.c",
    fuzzy_match_percent: 97.5,
    size: 64,
  },
  baseline: { fuzzy_match_percent: 97.5 },
  first_diff: {
    status: "available",
    score: 97.5,
    rows: [{ side: "left", address: "16", kind: "DIFF_ARG_MISMATCH", text: "lwz r3, 0x8(r31)" }],
    row_counts_by_kind: { DIFF_ARG_MISMATCH: 1 },
    truncated: false,
  },
  repair_request: {
    reasons: ["target fixture_symbol improved from 97.5 to 98 but did not reach exact"],
    instruction: "Continue the method from the current source.",
  },
  knowledge_context: {
    file_card: {
      editability: { mode: "editable", reason: "Target source is in the approved write set." },
      functions: [{ symbol: "fixture_symbol" }, { symbol: "fixture_neighbor" }],
    },
    knowledge_card_v2: {
      stable_key: "GALE01:fixture:fixture_symbol",
      target: { kind: "function", unit: "GALE01:fixture", symbol: "fixture_symbol", identity_status: "current" },
      ledger: { runs: [], entries: [] },
      facts: { naming_note: "fixture", by_type: {} },
      links: [],
    },
  },
};

const base = {
  packet,
  repoRoot: "/repo",
  stateDir: "/state",
  initialBoardPath: "/state/board.json",
  workerLogDir: "/state/workers",
  targetSourceText: "void fixture_symbol(void) {\n    int value = (int)gObject;\n}\n",
  sourceNames: [],
  compilerCapabilities: CAPABILITIES_FIXTURE,
};

const VARIANTS = {
  "melee-off": { game: games.melee, advisoryAdjudication: "off" },
  "melee-shadow": { game: games.melee, advisoryAdjudication: "shadow" },
  "sms-live": { game: games.sms, advisoryAdjudication: "shadow" },
} as const;

function render(name: keyof typeof VARIANTS, extra: Record<string, unknown> = {}) {
  return workerPrompt({ ...base, ...VARIANTS[name], ...extra });
}

function sectionOf(prompt: string, tag: string): string {
  return prompt.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`))?.[0] ?? "";
}

describe("worker prompt fixtures for the variants that run", () => {
  for (const name of Object.keys(VARIANTS) as Array<keyof typeof VARIANTS>) {
    test(`${name} system prompt`, () => {
      pinned(name, render(name).systemPrompt);
    });
  }

  test("the live SMS game resolves to steering enforce and ordering enforce, Melee to both off", () => {
    const sms = render("sms-live").systemPrompt;
    expect(render("sms-live", { steeringGate: "enforce", ordering: "enforce", stackFramePolicy: "stop_at_frame" }).systemPrompt).toBe(sms);
    const melee = render("melee-off").systemPrompt;
    expect(render("melee-off", { steeringGate: "off", ordering: "off", stackFramePolicy: "match_frame" }).systemPrompt).toBe(melee);
  });

  test("[SMS] lines render only with the gate enforced, [Melee] lines only with it off", () => {
    const smsOnly = [
      "A match counts only when the steering gate certifies it.",
      "(\"100% but unverified\") is not done.",
      "Do not submit a probe.",
      "site-bound evidence-review approvals",
      "`previous_attempt variant=\"unverified_match\"`",
      "`steering_probe`: the probe edits the gate found",
      "accepted means gate-certified",
    ];
    const meleeOnly = [
      "Frame-only is not done: continue with",
      "probes that Melee's standards do not accept",
      "Submit a probe only after your real-construct hypotheses failed",
      "`PAD_STACK` is the last resort",
      "remove every probe edit except one Melee's standards accept after your real-construct hypotheses failed",
    ];
    const sms = render("sms-live").systemPrompt;
    const melee = render("melee-shadow").systemPrompt;
    const shadowGate = render("sms-live", { steeringGate: "shadow" }).systemPrompt;
    for (const line of smsOnly) {
      expect(sms).toContain(line);
      expect(melee).not.toContain(line);
      expect(shadowGate).not.toContain(line);
    }
    for (const line of meleeOnly) {
      expect(melee).toContain(line);
      expect(sms).not.toContain(line);
      expect(shadowGate).not.toContain(line);
    }
    // Step 7: SMS removes every probe; Melee keeps one accepted, recorded last-resort probe.
    expect(sms).toContain("7. Write the construct, remove every probe edit, and submit.");
    expect(melee).not.toContain("remove every probe edit, and submit.");
    expect(melee).toContain("(the `PAD_STACK` rule in the stack frame policy section), say in your record that it is a probe, and submit.");
  });

  test("SMS keeps its frame prohibitions verbatim; Melee's PAD_STACK is the last resort", () => {
    const sms = sectionOf(render("sms-live").systemPrompt, "stack_frame_policy");
    expect(sms).toContain("- Never change the frame on purpose: no `PAD_STACK` or pad arrays, no locals whose only effect is stack space, no operand swaps such as flipping a comparison, no declaration reorders or inline choices made to move the frame.");
    expect(sms).toContain("- Never use stack alignment tricks: no `ATTRIBUTE_ALIGN` on locals, no unions or buffers that force the frame.");
    expect(sms).toContain("An edit whose only effect is the frame is banned; delete it during ablation even if the score drops.");
    const melee = sectionOf(render("melee-off").systemPrompt, "stack_frame_policy");
    expect(melee).toContain("Diagnose a frame residual before changing it");
    expect(melee).toContain("`PAD_STACK` is the last resort: only for a uniform displacement, after slot owners, lifetimes and inline boundaries are diagnosed");
    expect(melee).not.toContain("Never change the frame on purpose");
  });

  test("the removed steering-era guidance is gone from every variant", () => {
    for (const name of Object.keys(VARIANTS) as Array<keyof typeof VARIANTS>) {
      const prompt = render(name).systemPrompt;
      for (const removed of [
        "declaration order, casts, scope, expression form, literal form, temporary naming",
        "Stop rule for a variant family",
        "continue toward exact",
        "best-scoring",
        "Keep iterating while the evidence suggests a next move",
        "A cue whose removal regresses the score is the mechanism",
        "Freeze what now matches",
        "Revert no-op or regressing hunks",
        "keep `max_iters` in the hundreds",
        "Do not run allocator or regflow diagnostics on a residual you have not classified as register-only",
        "available tools",
        "already present on master",
        "<steering_policy>",
        "there is no separate graph tool",
      ]) {
        expect(prompt).not.toContain(removed);
      }
      expect(prompt).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
    }
  });

  test("game facts come from the descriptor: base ref, registries, prompt id", () => {
    const sms = render("sms-live").systemPrompt;
    const melee = render("melee-off").systemPrompt;
    expect(sms).toContain("foreign types already present on `upstream/main`");
    expect(melee).toContain("foreign types already present on `origin/master`");
    expect(sms).toContain("Registries (`MarNameRefGen`) are filled after their classes exist");
    expect(render("sms-live", { registries: [] }).systemPrompt).not.toContain("Registries (");
    expect(render("sms-live", { registries: ["TFooRegistry"] }).systemPrompt).toContain("Registries (`TFooRegistry`)");
    expect(melee).not.toContain("MarNameRefGen");
  });

  test("<compiler> renders per-version trace points, and a missing capabilities file as unavailable", () => {
    const compiler = sectionOf(render("sms-live").systemPrompt, "compiler");
    expect(compiler).toContain("- GC/1.2.5: all except scheduling");
    expect(compiler).toContain("- GC/1.2.5n: all except frame or scheduling");
    expect(compiler).toContain("- GC/1.1p1: all except vreg identity, frame or scheduling");
    const absent = sectionOf(render("sms-live", { compilerCapabilities: null }).systemPrompt, "compiler");
    expect(absent).toContain("No traced compiler is provisioned: every native trace point is unavailable");
    expect(absent).not.toContain("GC/1.2.5");
  });
});

/** Every tool id the harness knows: registered tools, every profile, and ids a sibling slice registers later. */
function knownToolIds(): string[] {
  const fromProfiles = Object.values(profiles).flatMap((value) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []));
  const removed = ["mwcc_debug_lookup", "mwcc_debug_dump_function", "mwcc_debug_diagnose_stack", "mwcc_debug_diagnose_regflow", "mwcc_debug_diagnose_inlines"];
  return [...new Set([...Object.keys(agentToolRegistry), ...fromProfiles, ...removed])];
}

function namedTools(text: string): string[] {
  return knownToolIds().filter((id) => new RegExp(`(^|[^A-Za-z0-9_])${id}([^A-Za-z0-9_]|$)`).test(text));
}

describe("the worker prompt names only tools the worker has", () => {
  const steeringPacket = {
    ...packet,
    steering_probe: { function: "fixture_symbol", unit: "GALE01:fixture", compiler_delta: { unavailable: "no traced build" } },
    previous_attempt: {
      variant: "unverified_match",
      symbol: "fixture_symbol",
      unit: "GALE01:fixture",
      unexplained_edits: [{ file: "src/melee/test/fixture.c", line: 2 }],
    },
  };

  for (const [name, game] of Object.entries(games)) {
    test(`${name}: every named tool is in the game's worker tool list`, () => {
      const launched = resolveAgentToolIdsForContext({ role: "worker", game });
      expect(workerPromptToolIds({ game })).toEqual(launched);
      for (const advisoryAdjudication of ["off", "shadow", "enforce"] as const) {
        const bundle = workerPrompt({ ...base, game, advisoryAdjudication, packet: steeringPacket });
        const named = namedTools(`${bundle.systemPrompt}\n${bundle.kernelContext?.renderedContext ?? ""}`);
        expect(named.filter((id) => !launched.includes(id))).toEqual([]);
        expect(named).not.toContain("mwcc_debug_lookup");
      }
    });
  }

  test("a tool missing from the list drops its lines", () => {
    const tools = workerPromptToolIds({ game: games.sms }).filter((id) => !["real_code_evidence", "unused_stub_test", "graph_related_functions", "code_graph_file_card", "mwcc_alloc_compare_sources"].includes(id));
    const prompt = workerPrompt({ ...base, game: games.sms, toolIds: tools }).systemPrompt;
    expect(namedTools(prompt).filter((id) => !tools.includes(id))).toEqual([]);
    expect(prompt).toContain("search it with the sandbox grep and read tools under ../mwcc");
  });

  test("the steering-gate game gets real_code_evidence and unused_stub_test; both games get the graph tools", () => {
    const sms = workerPromptToolIds({ game: games.sms });
    const melee = workerPromptToolIds({ game: games.melee });
    for (const id of ["real_code_evidence", "unused_stub_test"]) {
      expect(sms).toContain(id);
      expect(melee).not.toContain(id);
    }
    for (const id of ["graph_related_functions", "code_graph_file_card", "mwcc_alloc_compare_sources"]) {
      expect(sms).toContain(id);
      expect(melee).toContain(id);
    }
    for (const id of ["mwcc_debug_lookup", "mwcc_debug_dump_function", "mwcc_debug_diagnose_stack", "mwcc_debug_diagnose_regflow", "mwcc_debug_diagnose_inlines"]) {
      expect(sms).not.toContain(id);
      expect(melee).not.toContain(id);
    }
  });
});

describe("Melee packet context", () => {
  const fixture = (name: string) => readFileSync(resolve(FIXTURES, `${name}.txt`), "utf8");

  test("is unchanged, even with a steering probe or previous attempt on the packet", () => {
    for (const contextBudget of ["compact", "minimal"] as const) {
      const renderContext = (extra: Record<string, unknown>) =>
        workerPrompt({ ...base, contextBudget, stackFramePolicy: "match_frame", ...extra }).kernelContext?.renderedContext;
      pinned(`melee-context-${contextBudget}`, renderContext({}) ?? "");
      const expected = fixture(`melee-context-${contextBudget}`);
      expect(renderContext({ steeringGate: "off", packet: { ...packet, steering_probe: { function: "fixture_symbol", unit: "GALE01:fixture" } } })).toBe(expected);
      const previousAttempt = { symbol: "fixture_symbol", unit: "GALE01:fixture", decision: "steering_located", rules: [{ kind: "steering", name: "steering-is-a-probe" }] };
      expect(renderContext({ steeringGate: "off", packet: { ...packet, previous_attempt: previousAttempt } })).toBe(expected);
      expect(renderContext({ packet: { ...packet, previous_attempt: previousAttempt } })).toBe(expected);
    }
  });

  test("is unchanged with not_ready_classes on the packet while ordering is off", () => {
    const expected = fixture("melee-context-compact");
    const unmet = [{ class: "TKoopa", owner_unit: "mario/Enemy/Koopa", kind: "construct" }];
    expect(workerPrompt({ ...base, contextBudget: "compact", stackFramePolicy: "match_frame", ordering: "off", packet: { ...packet, not_ready_classes: unmet } }).kernelContext?.renderedContext).toBe(expected);
  });
});

describe("repair packets agree with the system prompt", () => {
  /** Phrases the method replaced; none may come back through runtime-injected repair text. */
  const BANNED = [
    "toward exact",
    "stack frame is done",
    "is done, so",
    "Keep the real parts",
    "established inline helpers",
    "present on master",
    "best-scoring",
    "Keep iterating",
    "variant family",
    "Freeze what now matches",
  ];

  function repairPacket(game: "melee" | "sms", repairReasons: string[], scoreText = "") {
    const stopAtFrame = game === "sms";
    const instruction = workerRepairInstruction({
      runnerValidation: { status: repairReasons.length > 0 ? "failed" : "passed", reasons: repairReasons, qaLint: null } as never,
      latestCheckpoint: { exactMatch: false, hardGatesPassed: repairReasons.length === 0 },
      repairReasons,
      scoreText,
      stopAtFrame,
    });
    // The worker-facing shape worker-cycle sends (reasons + instruction; host paths sanitized).
    return workerFacingRepairRequest({ attempt: 2, reasons: repairReasons, instruction });
  }

  function renderWith(game: "melee" | "sms", repair: Record<string, unknown>): string {
    const bundle = workerPrompt({ ...base, game: games[game], advisoryAdjudication: "shadow", packet: { ...packet, repair_request: repair } });
    return `${bundle.systemPrompt}\n${bundle.kernelContext?.renderedContext ?? ""}`;
  }

  const cases = {
    "validated improvement": [] as string[],
    "SMS frame-only feedback": [stackOnlyPerturbationReason({ functions: ["fixture_symbol"] })],
    "QA lint rejection": ["qa: type_erasing_cast at src/melee/test/fixture.c:2", QA_LINT_REPAIR_INSTRUCTION],
    "steering rejection": [`steering_located: steering located in fixture_symbol (without steering: 96.5%). ${STEERING_LOCATED_INSTRUCTION}`],
    "unverified rejection": [`unverified_match: the gate did not certify fixture_symbol. ${UNVERIFIED_MATCH_INSTRUCTION}`],
  };

  for (const [name, reasons] of Object.entries(cases)) {
    test(`SMS: ${name}`, () => {
      const text = renderWith("sms", repairPacket("sms", reasons, reasons.length === 0 ? " at 98.5%" : ""));
      for (const phrase of BANNED) expect(text).not.toContain(phrase);
      // Frame-only is a stop, never done or exact, in the prompt and the repair instruction alike.
      expect(text).toContain("stop and report frame-only; it is never an exact claim");
      expect(text).not.toMatch(/stack frame (is|counts as) (done|exact)/);
      expect(text).toContain("Continue the method from the current source");
    });
    test(`Melee: ${name}`, () => {
      const text = renderWith("melee", repairPacket("melee", reasons, reasons.length === 0 ? " at 98.5%" : ""));
      for (const phrase of BANNED) expect(text).not.toContain(phrase);
      expect(text).toContain("Frame-only is not done");
    });
  }
});

describe("pending evidence reviews reach the live packet", () => {
  test("a target with no previous_attempt gets a standalone open_reviews block in the steering section", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { openState } = await import("@server/core/orchestrator-state");
    const { recordEvidenceReviewRequest } = await import("@server/core/harness-runtime/run-state/evidence-reviews.js");
    const { standaloneOpenReviews, steeringPreviousAttempt } = await import("./previous-attempt.js");
    const dir = mkdtempSync(join(tmpdir(), "standalone-reviews-"));
    const store = openState(dir);
    try {
      const target = { gameId: "sms", unit: "M3DUtil/MActor", symbol: "calcLight__6MActorFv" };
      const recorded = recordEvidenceReviewRequest(store, {
        ...target, baseRev: "81248bda", siteFile: "src/M3DUtil/MActor.cpp", siteLines: [240, 240], groupDigest: "digest-2",
        callee: "getModel", calleeSymbol: "getModel__6MActorFv", patch: "+ getModel()->calc();",
        evidence: { gate: {}, worker: { summary: "TP JSystem has the same accessor at this call" } },
      });
      // The claim path: no unverified row and no backfill row, so no previous_attempt.
      const attempt = steeringPreviousAttempt(store, { ...target, currentScore: 97 });
      expect(attempt).toBeNull();
      const reviews = standaloneOpenReviews(store, target, attempt);
      expect(reviews).toEqual([{ id: recorded!.id, site_file: "src/M3DUtil/MActor.cpp", site_lines: "240", summary: "getModel (getModel__6MActorFv): TP JSystem has the same accessor at this call", base_rev: "81248bda" }]);

      const steeringPacket = { ...packet, open_reviews: reviews, steering_probe: { function: "calcLight__6MActorFv", unit: target.unit } };
      const context = workerPrompt({ ...base, game: games.sms, packet: steeringPacket }).kernelContext?.renderedContext ?? "";
      expect(context).toContain([
        '    <open_reviews total="1">',
        "        <instruction>Constructs queued for human evidence review on this target: stop each lead until its review is decided, and do not resubmit it unchanged.</instruction>",
        `        <review id="${recorded!.id}" site="src/M3DUtil/MActor.cpp:240" status="pending">getModel (getModel__6MActorFv): TP JSystem has the same accessor at this call</review>`,
        "    </open_reviews>",
      ].join("\n"));
      // In the steering section: after first_diff, before the probe.
      expect(context.indexOf("</first_diff>")).toBeLessThan(context.indexOf("<open_reviews"));
      expect(context.indexOf("</open_reviews>")).toBeLessThan(context.indexOf("<steering_probe"));
      // A previous_attempt carries its own reviews; the gate off (Melee) renders none.
      expect(standaloneOpenReviews(store, target, { variant: "rollback" } as never)).toEqual([]);
      expect(workerPrompt({ ...base, game: games.melee, packet: steeringPacket }).kernelContext?.renderedContext).not.toContain("open_reviews");
    } finally {
      store.db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a persisted open review renders in the claim's previous_attempt without an injected lookup", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { openState } = await import("@server/core/orchestrator-state");
    const { recordUnverifiedMatch } = await import("@server/core/harness-runtime/run-state/unverified-matches.js");
    const { recordEvidenceReviewRequest, decideEvidenceReview, getEvidenceReview } = await import("@server/core/harness-runtime/run-state/evidence-reviews.js");
    const { steeringPreviousAttempt } = await import("./previous-attempt.js");
    const dir = mkdtempSync(join(tmpdir(), "open-reviews-"));
    const store = openState(dir);
    try {
      const target = { gameId: "sms", unit: "M3DUtil/MActor", symbol: "setLightData__6MActorFv" };
      recordUnverifiedMatch(store, {
        ...target, analyzedRev: "feedface01", baseRev: "81248bda", sourcePath: "src/M3DUtil/MActor.cpp",
        match: { base: 96.4, candidate: 100, real_only: 97.2 }, reasons: ["unresolved"],
        report: { decision: "unresolved", unexplained_edit_groups: [{ file: "src/M3DUtil/MActor.cpp", line: 212, text: "l = getLightData();", status: "unresolved" }] },
      });
      const recorded = recordEvidenceReviewRequest(store, {
        ...target, baseRev: "81248bda", siteFile: "src/M3DUtil/MActor.cpp", siteLines: [212, 213], groupDigest: "digest-1",
        callee: "getLightData", calleeSymbol: "getLightData__6MActorFv", patch: "+ l = getLightData();",
        evidence: { gate: {}, worker: { summary: "map-backed weak inline", evidence: "map-unit lists getLightData" } },
      });
      expect(recorded?.id).toBeTruthy();

      // The claim path's own call: no openReviews option, so the review store is read.
      const attempt = steeringPreviousAttempt(store, { ...target, currentScore: 100 });
      const context = workerPrompt({ ...base, game: games.sms, packet: { ...packet, previous_attempt: attempt } }).kernelContext?.renderedContext ?? "";
      expect(context).toContain([
        '        <open_reviews total="1">',
        `            <review id="${recorded!.id}" site="src/M3DUtil/MActor.cpp:212-213" status="pending">getLightData (getLightData__6MActorFv): map-backed weak inline</review>`,
        "        </open_reviews>",
      ].join("\n"));

      // Once decided, the review is no longer pending.
      const revision = Number((getEvidenceReview(store, recorded!.id) as unknown as { revision?: number }).revision ?? 0);
      await decideEvidenceReview(store, { gameId: "sms", id: recorded!.id, decision: "rejected", note: "not at this site", revision, approvalsPath: null, requeueAllowed: false });
      const after = steeringPreviousAttempt(store, { ...target, currentScore: 100 });
      expect((after as { open_reviews?: unknown[] }).open_reviews).toEqual([]);
    } finally {
      store.db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("every pending review reaches the packet", () => {
  test("five persisted reviews all render, in previous_attempt and in the standalone block", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { openState } = await import("@server/core/orchestrator-state");
    const { recordUnverifiedMatch } = await import("@server/core/harness-runtime/run-state/unverified-matches.js");
    const { recordEvidenceReviewRequest } = await import("@server/core/harness-runtime/run-state/evidence-reviews.js");
    const { standaloneOpenReviews, steeringPreviousAttempt } = await import("./previous-attempt.js");
    const dir = mkdtempSync(join(tmpdir(), "five-reviews-"));
    const store = openState(dir);
    try {
      const persistFive = (target: { gameId: string; unit: string; symbol: string }) => Array.from({ length: 5 }, (_, index) => recordEvidenceReviewRequest(store, {
        ...target, baseRev: "81248bda", siteFile: "src/M3DUtil/MActor.cpp", siteLines: [200 + index * 10, 201 + index * 10], groupDigest: `digest-${target.symbol}-${index}`,
        callee: `getField${index}`, calleeSymbol: `getField${index}__6MActorFv`, patch: `+ v = getField${index}();`,
        evidence: { gate: {}, worker: { summary: `cited site evidence ${index}` } },
      })!.id);
      // Rows render in the store's order (oldest first, then id); each id keeps its own index.
      const { openEvidenceReviewsForTarget } = await import("@server/core/harness-runtime/run-state/evidence-reviews.js");
      const reviewLines = (ids: string[], indent: string, target: { gameId: string; unit: string; symbol: string }) =>
        openEvidenceReviewsForTarget(store, target).map((row) => ids.indexOf(row.id)).map((index) =>
          `${indent}<review id="${ids[index]}" site="src/M3DUtil/MActor.cpp:${200 + index * 10}-${201 + index * 10}" status="pending">getField${index} (getField${index}__6MActorFv): cited site evidence ${index}</review>`);

      // previous_attempt (unverified_match) carries all five.
      const unverified = { gameId: "sms", unit: "M3DUtil/MActor", symbol: "setLightData__6MActorFv" };
      recordUnverifiedMatch(store, {
        ...unverified, analyzedRev: "feedface01", baseRev: "81248bda", sourcePath: "src/M3DUtil/MActor.cpp",
        match: { base: 96.4, candidate: 100, real_only: 97.2 }, reasons: ["unresolved"], report: { decision: "unresolved" },
      });
      const unverifiedIds = persistFive(unverified);
      const attempt = steeringPreviousAttempt(store, { ...unverified, currentScore: 100 });
      expect((attempt as { open_reviews: unknown[] }).open_reviews).toHaveLength(5);
      const withAttempt = workerPrompt({ ...base, game: games.sms, packet: { ...packet, previous_attempt: attempt } }).kernelContext?.renderedContext ?? "";
      expect(withAttempt).toContain(['        <open_reviews total="5">', ...reviewLines(unverifiedIds, "            ", unverified), "        </open_reviews>"].join("\n"));

      // No previous_attempt: the standalone block carries all five.
      const fresh = { gameId: "sms", unit: "M3DUtil/MActor", symbol: "calcLight__6MActorFv" };
      const freshIds = persistFive(fresh);
      const none = steeringPreviousAttempt(store, { ...fresh, currentScore: 97 });
      expect(none).toBeNull();
      const standalone = standaloneOpenReviews(store, fresh, none);
      expect(standalone).toHaveLength(5);
      const withoutAttempt = workerPrompt({ ...base, game: games.sms, packet: { ...packet, open_reviews: standalone } }).kernelContext?.renderedContext ?? "";
      expect(withoutAttempt).toContain('    <open_reviews total="5">');
      expect(withoutAttempt).toContain(reviewLines(freshIds, "        ", fresh).join("\n"));
    } finally {
      store.db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
