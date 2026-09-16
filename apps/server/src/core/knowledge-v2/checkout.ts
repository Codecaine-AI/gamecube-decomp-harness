import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";

import { getHarnessState } from "@server/core/harness-state/state.js";
import { resolveGame } from "@server/core/game-registry/resolver.js";

export interface ResolveKnowledgeCheckoutOptions {
  gameId: string;
  orchestratorRoot?: string;
  stateDir?: string;
  explicitCheckoutRoot?: string;
  explicitReportPath?: string;
}

export interface KnowledgeCheckout {
  checkoutRoot: string;
  reportPath: string;
  headRevision: string;
  source: "explicit" | "harness" | "configured";
}

function harnessWorktree(stateDir: string, gameId: string): string | undefined {
  const databasePath = resolve(stateDir, "orchestrator.sqlite");
  if (!existsSync(databasePath)) return undefined;
  const db = new Database(databasePath, { readonly: true, strict: true });
  try {
    const harness = getHarnessState(db, gameId);
    const candidate = harness?.source.worktree;
    return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
  } finally {
    db.close();
  }
}

function shortHead(checkoutRoot: string): string {
  const worktree = Bun.spawnSync(
    ["git", "-C", checkoutRoot, "rev-parse", "--is-inside-work-tree"],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (worktree.exitCode !== 0 || worktree.stdout.toString().trim() !== "true") {
    throw new Error(`Knowledge checkout is not a git worktree: ${checkoutRoot}`);
  }
  const head = Bun.spawnSync(
    ["git", "-C", checkoutRoot, "rev-parse", "--short", "HEAD"],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (head.exitCode !== 0 || !head.stdout.toString().trim()) {
    throw new Error(`Knowledge checkout has no resolvable HEAD: ${checkoutRoot}`);
  }
  return head.stdout.toString().trim();
}

export function resolveKnowledgeCheckout(
  options: ResolveKnowledgeCheckoutOptions,
): KnowledgeCheckout {
  const configured = resolveGame({ gameId: options.gameId, orchestratorRoot: options.orchestratorRoot });
  const explicit = options.explicitCheckoutRoot !== undefined
    || options.explicitReportPath !== undefined;
  const active = options.explicitCheckoutRoot === undefined
    ? harnessWorktree(options.stateDir ?? configured.stateDir, options.gameId)
    : undefined;
  const checkoutRoot = resolve(
    options.explicitCheckoutRoot ?? active ?? configured.repoRoot,
  );
  const source: KnowledgeCheckout["source"] = explicit
    ? "explicit"
    : active === undefined ? "configured" : "harness";
  return {
    checkoutRoot,
    reportPath: options.explicitReportPath === undefined
      ? resolve(checkoutRoot, configured.validation.reportPath!)
      : resolve(options.explicitReportPath),
    headRevision: shortHead(checkoutRoot),
    source,
  };
}
