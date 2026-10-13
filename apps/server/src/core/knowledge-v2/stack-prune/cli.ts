#!/usr/bin/env bun
/**
 * Stack-policy prune for stored history of a stop_at_frame game.
 *
 *   bun apps/server/src/core/knowledge-v2/stack-prune/cli.ts --game sms \
 *     [--game-root <games/sms>] [--state-dir <dir>] [--report <file.md>] \
 *     [--skip-diff-lines] [--apply]
 *
 * Dry run is the default: it only reads. `--apply` appends superseded marks to
 * the game's quarantine ledger (see ./index.ts) and never edits a source row.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { resolveGame } from "../../game-registry/resolver.js";
import { stackFramePolicyForGame } from "../stack-policy-filter.js";
import { applyStackPolicyMarks, renderStackPruneReport, scanStackPolicyStores } from "./index.js";

function args(argv: string[]): Map<string, string | true> {
  const out = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]!;
    if (!key.startsWith("--")) continue;
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out.set(key, next);
      index += 1;
    } else {
      out.set(key, true);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const parsed = args(process.argv.slice(2));
  const gameId = typeof parsed.get("--game") === "string" ? String(parsed.get("--game")) : "sms";
  const policy = stackFramePolicyForGame(gameId);
  if (policy !== "stop_at_frame") {
    throw new Error(`${gameId} uses stackFramePolicy ${policy}; the stack prune only runs for stop_at_frame games`);
  }
  const gameRoot = typeof parsed.get("--game-root") === "string"
    ? resolve(String(parsed.get("--game-root")))
    : resolveGame({ gameId }).gameDir;
  const stateDir = typeof parsed.get("--state-dir") === "string" ? resolve(String(parsed.get("--state-dir"))) : undefined;
  const apply = parsed.get("--apply") === true;
  const reports = await scanStackPolicyStores({
    gameRoot,
    ...(stateDir ? { stateDir } : {}),
    skipDiffLines: parsed.get("--skip-diff-lines") === true,
    maxItemsPerStore: apply ? Number.MAX_SAFE_INTEGER : 5_000,
  });
  const applied = apply ? applyStackPolicyMarks(gameRoot, reports) : undefined;
  const markdown = renderStackPruneReport({ gameId, gameRoot, reports, ...(applied ? { applied } : {}) });
  const reportPath = parsed.get("--report");
  if (typeof reportPath === "string") {
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    writeFileSync(resolve(reportPath), markdown);
    console.log(`report: ${resolve(reportPath)}`);
  } else {
    console.log(markdown);
  }
  for (const report of reports) {
    console.log(`${report.store}: scanned ${report.scanned}, flagged ${report.flagged}`);
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
