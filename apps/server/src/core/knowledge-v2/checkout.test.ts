import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { initializeHarnessState } from "@server/core/harness-state/state.js";
import { openState } from "@server/core/orchestrator-state/index.js";
import { resolveKnowledgeCheckout } from "./checkout.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "knowledge-v2-checkout-"));
  roots.push(root);
  return root;
}

function gitCheckout(root: string, name: string): { path: string; head: string } {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  execFileSync("git", ["-C", path, "init", "-q"]);
  execFileSync("git", ["-C", path, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", path, "config", "user.name", "Test"]);
  writeFileSync(join(path, "README"), name);
  execFileSync("git", ["-C", path, "add", "."]);
  execFileSync("git", ["-C", path, "commit", "-qm", name]);
  const head = execFileSync("git", ["-C", path, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  return { path, head };
}

describe("resolveKnowledgeCheckout", () => {
  test("uses explicit checkout and report overrides", () => {
    const root = tempRoot();
    const checkout = gitCheckout(root, "explicit");
    const reportPath = join(root, "custom-report.json");
    expect(resolveKnowledgeCheckout({
      gameId: "melee",
      stateDir: join(root, "state"),
      explicitCheckoutRoot: checkout.path,
      explicitReportPath: reportPath,
    })).toEqual({
      checkoutRoot: checkout.path,
      reportPath,
      headRevision: checkout.head,
      source: "explicit",
    });
  });

  test("uses the durable harness worktree from a read-only state database", () => {
    const root = tempRoot();
    const gameDir = join(root, "games/melee");
    mkdirSync(gameDir, { recursive: true });
    writeFileSync(join(gameDir, "game.json"), JSON.stringify({ id: "melee", validation: { reportPath: "build/EXAMPLE/report.json" } }));
    const stateDir = join(gameDir, "runtime/state");
    const checkout = gitCheckout(root, "harness-current");
    const store = openState(stateDir);
    initializeHarnessState(store.db, { gameId: "melee", worktree: checkout.path, configurationRevision: "config-1", commandId: "initialize" });
    store.db.close();
    expect(resolveKnowledgeCheckout({ gameId: "melee", stateDir, orchestratorRoot: root })).toEqual({
      checkoutRoot: checkout.path,
      reportPath: join(checkout.path, "build/EXAMPLE/report.json"),
      headRevision: checkout.head,
      source: "harness",
    });
  });

  test("uses configured checkout before harness initialization without opening a state database", () => {
    const root = tempRoot();
    const gameDir = join(root, "games/example");
    const checkout = gitCheckout(gameDir, "workspace/checkout");
    writeFileSync(join(gameDir, "game.json"), JSON.stringify({ id: "example", validation: { reportPath: "build/EXAMPLE/report.json" } }));
    expect(resolveKnowledgeCheckout({ gameId: "example", orchestratorRoot: root })).toEqual({
      checkoutRoot: checkout.path,
      reportPath: join(checkout.path, "build/EXAMPLE/report.json"),
      headRevision: checkout.head,
      source: "configured",
    });
  });

  test("throws when the resolved directory is not a git worktree", () => {
    const root = tempRoot();
    const directory = resolve(root, "plain");
    mkdirSync(directory);
    expect(() => resolveKnowledgeCheckout({
      gameId: "melee",
      explicitCheckoutRoot: directory,
    })).toThrow(`Knowledge checkout is not a git worktree: ${directory}`);
  });
});
