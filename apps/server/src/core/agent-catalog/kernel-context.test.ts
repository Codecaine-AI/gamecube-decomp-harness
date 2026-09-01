import { describe, expect, test } from "bun:test";

import type { LoadedMap, SpawnContext } from "@agent-kernel/kernel/context";

import { renderLoadedKernelContext } from "./kernel-context.js";

const spawnContext = {} as SpawnContext;

describe("renderLoadedKernelContext", () => {
  test("throws with every required input that failed to load", () => {
    const loaded = [
      {
        decl: { kind: "missing-context", ref: "batch-42" },
        status: "error",
        error: "Unknown loader kind",
      },
      {
        decl: { kind: "worker-summarizer-context", ref: "summary-17" },
        status: "error",
        error: "Worker summary unavailable",
      },
    ] as unknown as LoadedMap;

    expect(() => renderLoadedKernelContext(loaded, spawnContext)).toThrow(
      "Kernel context load failed for required inputs:\nmissing-context (batch-42): Unknown loader kind\nworker-summarizer-context (summary-17): Worker summary unavailable",
    );
  });

  test("renders loaded inputs and skips empty inputs", () => {
    const loaded = [
      {
        decl: { kind: "melee-session-context", ref: "session-1" },
        status: "ok",
        content: "Session context",
      },
      {
        decl: { kind: "first-empty-context", ref: "curation-1" },
        status: "empty",
        content: "",
      },
      {
        decl: { kind: "second-empty-context", ref: "blank-1" },
        status: "ok",
        content: "  \n",
      },
      {
        decl: { kind: "worker-summarizer-context", ref: "summary-1" },
        status: "ok",
        content: "Worker summary context",
      },
    ] as unknown as LoadedMap;

    expect(renderLoadedKernelContext(loaded, spawnContext)).toBe(
      '<melee-session-context ref="session-1">\nSession context\n</melee-session-context>\n\n' +
        '<worker-summarizer-context ref="summary-1">\nWorker summary context\n</worker-summarizer-context>',
    );
  });
});
