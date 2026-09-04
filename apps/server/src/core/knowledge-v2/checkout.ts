import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";

import { getActiveCycle } from "@server/core/cycle/store.js";
import { gameRoot } from "@server/core/knowledge/paths.js";

export interface ResolveKnowledgeCheckoutOptions {
  gameId: string;
  stateDir?: string;
  explicitCheckoutRoot?: string;
  explicitReportPath?: string;
}

export interface KnowledgeCheckout {
  checkoutRoot: string;
  reportPath: string;
  headRevision: string;
  source: "explicit" | "active_cycle" | "legacy_checkout";
}

function activeCycleWorktree(stateDir: string, gameId: string): string | undefined {
  const databasePath = resolve(stateDir, "orchestrator.sqlite");
  if (!existsSync(databasePath)) return undefined;
  const db = new Database(databasePath, { readonly: true, strict: true });
  try {
    const cycle = getActiveCycle(db, gameId);
    const candidate = cycle?.preparing_state_json.sync?.cycleCurrentWorktreePath;
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
  const root = options.stateDir === undefined
    ? gameRoot(options.gameId)
    : dirname(resolve(options.stateDir));
  const explicit = options.explicitCheckoutRoot !== undefined
    || options.explicitReportPath !== undefined;
  const active = options.explicitCheckoutRoot === undefined
    ? activeCycleWorktree(options.stateDir ?? resolve(root, "state"), options.gameId)
    : undefined;
  const checkoutRoot = resolve(
    options.explicitCheckoutRoot ?? active ?? resolve(root, "checkout"),
  );
  const source: KnowledgeCheckout["source"] = explicit
    ? "explicit"
    : active === undefined ? "legacy_checkout" : "active_cycle";
  if (source === "legacy_checkout") {
    console.warn(`[kg2] no active cycle worktree for ${options.gameId}; using legacy checkout ${checkoutRoot}`);
  }
  return {
    checkoutRoot,
    reportPath: options.explicitReportPath === undefined
      ? resolve(checkoutRoot, "build/GALE01/report.json")
      : resolve(options.explicitReportPath),
    headRevision: shortHead(checkoutRoot),
    source,
  };
}
