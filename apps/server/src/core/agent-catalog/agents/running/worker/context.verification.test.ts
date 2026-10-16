import { describe, expect, test } from "bun:test";
import type { SteeringGateMode } from "../../../../game-registry/resolver.js";
import { workerPrompt } from "./prompt.js";

/**
 * A file card captured before the steering backfill recorded the target as
 * `unverified_match`: every raw score is 100%, so the graph called the file
 * complete. A backfill can record the row without changing the report or
 * rebuilding the graph, so this card is what a worker claiming the target
 * can be handed.
 */
const staleCard = {
  source_path: "src/MarioUtil/Foo.cpp",
  editability: { mode: "read_only_complete", reason: "Every known function in this file is exact 100%; use as reference evidence only." },
  match_status: { units: ["main/MarioUtil/Foo"], function_count: 2, matched_function_count: 2, unmatched_function_count: 0 },
  functions: [
    { symbol: "Real__3FooFv", unit: "main/MarioUtil/Foo", fuzzy: 100 },
    { symbol: "Steered__3FooFv", unit: "main/MarioUtil/Foo", fuzzy: 100 },
  ],
};

function context(steeringGate: SteeringGateMode, claim: Record<string, unknown>): string {
  return workerPrompt({
    packet: {
      target: { unit: "main/MarioUtil/Foo", symbol: "Steered__3FooFv", source_path: "src/MarioUtil/Foo.cpp", ...claim.target as Record<string, unknown> },
      ...(claim.previous_attempt ? { previous_attempt: claim.previous_attempt } : {}),
      knowledge_context: { status: "ready", file_card: staleCard },
    },
    repoRoot: "/repo",
    stateDir: "/state",
    initialBoardPath: "/state/board.json",
    workerLogDir: "/state/workers",
    steeringGate,
  }).kernelContext?.renderedContext ?? "";
}

describe("worker context: unverified target file editability", () => {
  test("an unverified own target keeps a stale complete file card editable", () => {
    for (const claim of [
      { target: { verification: "unverified_match" } },
      { previous_attempt: { variant: "unverified_match", symbol: "Steered__3FooFv", unit: "main/MarioUtil/Foo", match: { candidate: 100 } } },
    ]) {
      const text = context("enforce", claim);
      expect(text).toContain('<editability mode="editable" reason="1 unmatched function(s) remain in this source file (1 of them 100% unverified');
      expect(text).not.toContain("use as reference evidence only");
    }
  });

  test("gate off, or a target that is not unverified, renders the card as stored", () => {
    const unverified = { target: { verification: "unverified_match" } };
    expect(context("off", unverified)).toContain('<editability mode="read_only_complete"');
    expect(context("enforce", { target: {} })).toContain('<editability mode="read_only_complete"');
  });
});
