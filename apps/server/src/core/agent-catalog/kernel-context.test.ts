import { describe, expect, test } from "bun:test";

import type { LoadedMap, SpawnContext } from "@agent-kernel/kernel/context";

import { renderLoadedKernelContext } from "./kernel-context.js";

const spawnContext = {} as SpawnContext;

describe("renderLoadedKernelContext", () => {
  test("throws with every required input that failed to load", () => {
    const loaded = [
      {
        decl: { kind: "librarian-context", ref: "batch-42" },
        status: "error",
        error: "Unknown loader kind",
      },
      {
        decl: { kind: "librarian-pr-index-context", ref: "pr-17" },
        status: "error",
        error: "PR index unavailable",
      },
    ] as unknown as LoadedMap;

    expect(() => renderLoadedKernelContext(loaded, spawnContext)).toThrow(
      "Kernel context load failed for required inputs:\nlibrarian-context (batch-42): Unknown loader kind\nlibrarian-pr-index-context (pr-17): PR index unavailable",
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
        decl: { kind: "librarian-curation-context", ref: "curation-1" },
        status: "empty",
        content: "",
      },
      {
        decl: { kind: "librarian-pr-index-context", ref: "pr-1" },
        status: "ok",
        content: "PR index context",
      },
    ] as unknown as LoadedMap;

    expect(renderLoadedKernelContext(loaded, spawnContext)).toBe(
      '<melee-session-context ref="session-1">\nSession context\n</melee-session-context>\n\n' +
        '<librarian-pr-index-context ref="pr-1">\nPR index context\n</librarian-pr-index-context>',
    );
  });
});
