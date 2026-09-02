import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { kg2Backfill } from "./cli.js";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "kg2-backfill-cli-test-"));
  temporaryRoots.push(root);
  return root;
}

function globals(root: string): GlobalArgs {
  return {
    gameId: "melee",
    stateDir: join(root, "state"),
  } as GlobalArgs;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("kg2Backfill", () => {
  test("refuses the default knowledge root under a test runner", async () => {
    const root = temporaryRoot();

    await expect(kg2Backfill(globals(root), new Map<string, string | true>([
      ["--run-id", "guard-test"],
    ]))).rejects.toThrow(
      "kg2-backfill refuses to touch the default knowledge root under a test runner; pass --knowledge-root <temp dir>",
    );
  });

  test("accepts an explicit knowledge root", async () => {
    const root = temporaryRoot();

    await expect(kg2Backfill(globals(root), new Map<string, string | true>([
      ["--run-id", "explicit-root-test"],
      ["--knowledge-root", join(root, "knowledge")],
      ["--dry-run", true],
    ]))).resolves.toBeUndefined();
  });
});
