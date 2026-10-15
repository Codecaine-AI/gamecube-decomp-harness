import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { workerPrompt } from "./prompt.js";

/**
 * Pins the worker prompt against renderings of the tree before the steering
 * gate existed (commit ccbeff1be). The fixtures in `__fixtures__/head-prompts`
 * were generated from a clean checkout of that commit with the same packet
 * and options as below, so a regression shared by every current renderer
 * still fails here. Regenerate only for an intended prompt change.
 */
const FIXTURES = resolve(import.meta.dir, "__fixtures__/head-prompts");
const fixture = (name: string) => readFileSync(resolve(FIXTURES, `${name}.txt`), "utf8");

const repoRoot = resolve(import.meta.dir, "../../../../../../../..");
const games = {
  melee: { gameId: "melee", descriptorPath: resolve(repoRoot, "games/melee/game.json") },
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
    instruction: "Continue toward exact from the current source.",
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
};

const advisoryModes = ["off", "shadow", "enforce"] as const;

function steeringSection(prompt: string): string {
  return prompt.match(/<steering_policy>[\s\S]*?<\/steering_policy>\n\n/)?.[0] ?? "";
}

describe("worker prompt against pre-steering HEAD fixtures", () => {
  test("Melee system prompt is unchanged in every advisory mode", () => {
    for (const advisoryAdjudication of advisoryModes) {
      const expected = fixture(`melee-system-${advisoryAdjudication}`);
      expect(workerPrompt({ ...base, advisoryAdjudication, stackFramePolicy: "match_frame" }).systemPrompt).toBe(expected);
      expect(workerPrompt({ ...base, advisoryAdjudication, stackFramePolicy: "match_frame", steeringGate: "off" }).systemPrompt).toBe(expected);
      // Resolved from the Melee descriptor: match_frame, steering gate off.
      expect(workerPrompt({ ...base, advisoryAdjudication, game: games.melee }).systemPrompt).toBe(expected);
    }
  });

  test("Melee packet context is unchanged, even with a steering probe on the packet", () => {
    for (const contextBudget of ["compact", "minimal"] as const) {
      const expected = fixture(`melee-context-${contextBudget}`);
      const render = (extra: Record<string, unknown>) =>
        workerPrompt({ ...base, contextBudget, stackFramePolicy: "match_frame", ...extra }).kernelContext?.renderedContext;
      expect(render({})).toBe(expected);
      expect(render({ steeringGate: "off", packet: { ...packet, steering_probe: { function: "fixture_symbol", unit: "GALE01:fixture" } } })).toBe(expected);
    }
  });

  test("SMS with the steering gate off equals HEAD's SMS prompt; an active gate only adds <steering_policy>", () => {
    for (const advisoryAdjudication of advisoryModes) {
      const expected = fixture(`sms-system-${advisoryAdjudication}`);
      const sms = (steeringGate: "off" | "shadow" | "enforce") =>
        workerPrompt({ ...base, advisoryAdjudication, stackFramePolicy: "stop_at_frame", steeringGate }).systemPrompt;
      expect(sms("off")).toBe(expected);
      for (const steeringGate of ["shadow", "enforce"] as const) {
        const active = sms(steeringGate);
        const section = steeringSection(active);
        expect(section).toStartWith("<steering_policy>");
        expect(active.replace(section, "")).toBe(expected);
      }
    }
  });
});
