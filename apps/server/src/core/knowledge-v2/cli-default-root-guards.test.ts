import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { kg2Index } from "./index/job.js";
import { kg2Librarian } from "./librarian/cli.js";
import { kg2Prioritize } from "./migration/prioritize.js";
import { kg2Renarrate } from "./renarrate/cli.js";
import { kg2DriftScan } from "./drift/cli.js";

const roots: string[] = [];

function fixture(): { globals: GlobalArgs; knowledgeRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "kg2-cli-guard-"));
  roots.push(root);
  return {
    globals: {
      repoRoot: root,
      stateDir: join(root, "state"),
      gameId: "melee",
      dryRunAgents: true,
      provider: "fixture",
      model: "fixture",
      thinkingLevel: "medium",
    },
    knowledgeRoot: join(root, "knowledge"),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("knowledge-v2 default-root guards", () => {
  test.each([
    ["kg2-index", kg2Index, new Map<string, string | true>([["--fts", true]])],
    ["kg2-prioritize", kg2Prioritize, new Map<string, string | true>()],
    ["kg2-renarrate", kg2Renarrate, new Map<string, string | true>([["--limit", "0"]])],
    ["kg2-librarian", kg2Librarian, new Map<string, string | true>([["--run-id", "guard"], ["--limit", "0"]])],
    ["kg2-drift-scan", kg2DriftScan, new Map<string, string | true>([["--limit", "0"]])],
  ] as const)("refuses the %s default root under a test runner", async (command, run, args) => {
    const { globals } = fixture();
    await expect(run(globals, args)).rejects.toThrow(
      `${command} refuses to touch the default knowledge root under a test runner; pass --knowledge-root <temp dir>`,
    );
  });

  test("accepts explicit temporary roots", async () => {
    const { globals, knowledgeRoot } = fixture();
    await kg2Index(globals, new Map<string, string | true>([
      ["--knowledge-root", knowledgeRoot],
      ["--fts", true],
      ["--source", "attempt"],
    ]));
    await kg2Prioritize(globals, new Map<string, string | true>([
      ["--knowledge-root", knowledgeRoot],
      ["--json", true],
    ]));
    await kg2Renarrate(globals, new Map<string, string | true>([
      ["--knowledge-root", knowledgeRoot],
      ["--limit", "0"],
      ["--dry-run", true],
    ]));
    await kg2Librarian(globals, new Map<string, string | true>([
      ["--knowledge-root", knowledgeRoot],
      ["--run-id", "explicit-root"],
      ["--limit", "0"],
      ["--dry-run", true],
    ]));
    await kg2DriftScan(globals, new Map<string, string | true>([
      ["--knowledge-root", knowledgeRoot],
      ["--limit", "0"],
      ["--dry-run", true],
    ]));
  });
});
