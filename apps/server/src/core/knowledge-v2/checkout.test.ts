import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createCycle, transitionCycle } from "@server/core/cycle/store.js";
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

  test("uses the active cycle worktree from a read-only state database", () => {
    const root = tempRoot();
    const stateDir = join(root, "state");
    const checkout = gitCheckout(root, "cycle-current");
    const store = openState(stateDir);
    const cycle = createCycle(store.db, {
      actor: "operator",
      gameId: "melee",
      cycleUuid: "checkout-test-cycle",
      id: "cycle:checkout-test-cycle",
    });
    transitionCycle(store.db, cycle.id, {
      actor: "operator",
      commandId: "command-checkout-test",
      correlationId: cycle.cycle_uuid,
      eventType: "cycle.preparing_subphase_updated",
      expectedRevision: cycle.revision,
      patch: {
        preparing_state_json: {
          ...cycle.preparing_state_json,
          sync: { cycleCurrentWorktreePath: checkout.path },
        },
      },
      payload: { subphase: cycle.preparing_state_json.subphase },
    });
    store.db.close();

    expect(resolveKnowledgeCheckout({ gameId: "melee", stateDir })).toEqual({
      checkoutRoot: checkout.path,
      reportPath: join(checkout.path, "build/GALE01/report.json"),
      headRevision: checkout.head,
      source: "active_cycle",
    });
  });

  test("warns and uses the legacy checkout when no active cycle exists", () => {
    const root = tempRoot();
    const checkout = gitCheckout(root, "checkout");
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown) => warnings.push(String(message));
    try {
      const result = resolveKnowledgeCheckout({
        gameId: "melee",
        stateDir: join(root, "missing-state"),
      });
      expect(result).toEqual({
        checkoutRoot: checkout.path,
        reportPath: join(checkout.path, "build/GALE01/report.json"),
        headRevision: checkout.head,
        source: "legacy_checkout",
      });
    } finally {
      console.warn = originalWarn;
    }
    expect(warnings).toEqual([
      `[kg2] no active cycle worktree for melee; using legacy checkout ${checkout.path}`,
    ]);
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
