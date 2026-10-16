import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { booleanArg, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { gameOrdering } from "@server/core/tools/ordering.js";
import { openState } from "@server/core/harness-runtime/run-state";
import { preparePrUnusedChecks } from "@server/core/validation/edit-scope/pr-unused-checks.js";
import {
  hostEditScopeRunner,
  hostEditScopeScriptPath,
  orderingActive,
  orderingEnforced,
  prScopeSummary,
  runPrScopeCheck,
  type EditScopeOrderingPolicy,
  type EditScopeRunner,
  type PrScopeSummary,
} from "@server/core/validation/edit-scope/edit-scope.js";

/**
 * `server:job -- pr-scope-check --game G --base B [--repo R] [--head H]
 * [--unused-checks FILE | --run RUN_ID] [--script PATH] [--out FILE] [--mode shadow|enforce] [--force]`
 *
 * UNUSED evidence: `--unused-checks FILE` passes a file as is; `--run RUN_ID`
 * collects the certificates integrated on `base..head` by that run from the
 * game's state dir (`collectPrUnusedChecks`), re-validates them at the head
 * and reports stale ones as warnings.
 *
 * The publication gate as a CLI (plan v3 section 5): `edit_scope.py pr` over
 * `base...head`, readiness at the base, with PR size warnings and same-PR
 * prerequisites ("split suggested", never refusals). The mode is the game's
 * `ordering.mode`; a game with ordering off needs `--force` (runs as shadow)
 * or an explicit `--mode`. Prints one JSON object; fails (throws) when the
 * checker cannot run, or when the range is rejected in enforce mode.
 */
export interface PrScopeCheckOutput extends PrScopeSummary {
  game_id: string;
  repo: string;
  mode: "shadow" | "enforce";
  base: string;
  base_rev: string;
  head: string;
  artifact: string | null;
  /** `--run` only: the collected evidence file. */
  unused_checks: { path: string; count: number; stale: string[] } | null;
}

export interface PrScopeCheckDeps {
  runner?: EditScopeRunner;
  resolveRev?: (repoRoot: string, ref: string) => string;
  log?: (line: string) => void;
}

function gitRev(repoRoot: string, ref: string): string {
  const result = Bun.spawnSync(["git", "-C", repoRoot, "rev-parse", "--verify", `${ref}^{commit}`], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`pr-scope-check cannot resolve ${ref} in ${repoRoot}: ${result.stderr.toString().trim()}`);
  return result.stdout.toString().trim();
}

function prScopePolicy(globals: GlobalArgs, args: Map<string, string | true>, gameId: string): EditScopeOrderingPolicy {
  const ordering = gameOrdering(globals.game);
  const explicit = stringArg(args, "--mode", "").trim();
  if (explicit && explicit !== "shadow" && explicit !== "enforce") throw new Error(`pr-scope-check --mode must be shadow or enforce, not ${explicit}`);
  const configured = ordering && orderingActive(ordering.mode) ? ordering.mode : null;
  if (!explicit && !configured && !booleanArg(args, "--force")) {
    throw new Error(`pr-scope-check only applies to games with ordering shadow or enforce; ${gameId} is ${ordering?.mode ?? "off"} (pass --force to run as shadow, or --mode)`);
  }
  const mode = (explicit || configured || "shadow") as "shadow" | "enforce";
  return { mode, gatedPaths: [...(ordering?.gatedPaths ?? [])], ...(ordering?.scope ? { scope: { ...ordering.scope } } : {}) };
}

export async function prScopeCheckJob(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  deps: PrScopeCheckDeps = {},
): Promise<PrScopeCheckOutput> {
  const gameId = globals.game?.gameId ?? globals.gameId ?? "";
  if (!gameId) throw new Error("pr-scope-check needs a game (--game)");
  const policy = prScopePolicy(globals, args, gameId);
  const repoRoot = resolve(stringArg(args, "--repo", globals.repoRoot));
  const base = stringArg(args, "--base", "").trim();
  if (!base) throw new Error("pr-scope-check needs --base <ref> (the PR base the range is measured against)");
  const resolveRev = deps.resolveRev ?? gitRev;
  const baseRev = resolveRev(repoRoot, base);
  const head = resolveRev(repoRoot, stringArg(args, "--head", "HEAD").trim() || "HEAD");
  let runner = deps.runner;
  if (!runner) {
    const script = resolve(stringArg(args, "--script", hostEditScopeScriptPath(packageRoot())));
    if (!existsSync(script)) throw new Error(`edit_scope.py not found at ${script}`);
    runner = hostEditScopeRunner(script, repoRoot, policy);
  }
  let unusedChecks = stringArg(args, "--unused-checks", "").trim();
  const runId = stringArg(args, "--run", "").trim();
  if (unusedChecks && runId) throw new Error("pr-scope-check takes --unused-checks FILE or --run RUN_ID, not both");
  const out = stringArg(args, "--out", "").trim();
  let collected: PrScopeCheckOutput["unused_checks"] = null;
  if (runId) {
    const store = openState(globals.stateDir);
    try {
      const prepared = await preparePrUnusedChecks({
        store, repoRoot, base: baseRev, head, runId,
        outputPath: resolve(globals.stateDir, "pr-scope-check", gameId, `pr_unused_checks_${runId}_${head}.json`),
      });
      collected = prepared;
      unusedChecks = prepared.path;
    } finally {
      store.db.close();
    }
  }
  const result = await runPrScopeCheck({
    runner,
    repo: repoRoot,
    base: baseRev,
    head,
    policy,
    unusedChecksPath: unusedChecks ? resolve(unusedChecks) : null,
    artifactPath: out ? resolve(out) : null,
  });
  const output: PrScopeCheckOutput = {
    game_id: gameId,
    repo: repoRoot,
    mode: policy.mode as "shadow" | "enforce",
    base,
    base_rev: baseRev,
    head,
    ...prScopeSummary(result),
    artifact: result.artifactPath ?? null,
    unused_checks: collected,
  };
  if (collected) output.warnings.push(...collected.stale);
  (deps.log ?? console.log)(JSON.stringify(output, null, 2));
  if (output.error) throw new Error(`pr-scope-check: the scope check could not run: ${output.error}`);
  if (output.verdict === "reject" && orderingEnforced(policy.mode)) {
    throw new Error(`pr-scope-check refused ${base}...${head.slice(0, 12)}: ${output.problem ?? "rejected"}`);
  }
  return output;
}
