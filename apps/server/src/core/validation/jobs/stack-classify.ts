import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { booleanArg, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { gameBuildLayout, type GameBuildValidation } from "@server/core/game-registry/build-layout.js";
import { packageRoot } from "@server/core/knowledge";
import { openState } from "@server/core/harness-runtime/run-state";
import {
  clearStackOnlyFunction,
  recordStackOnlyFunction,
} from "@server/core/harness-runtime/run-state/stack-only-functions.js";
import {
  STACK_CHECK_TOOLPACK_PATH,
  compareStackObjects,
  hostStackCheckRunner,
  stopsAtFrame,
  targetObjectPathForUnit,
  type StackCheckRunner,
  type StackFunctionClass,
} from "@server/core/validation/stack/stack-check.js";

/**
 * Backfill for stop_at_frame games: classify every not-yet-exact function of
 * a built checkout with `stack_check.py objects <compiled> <target>` and
 * record the stack-only ones, so the board stops re-queueing functions that
 * were already done up to the stack frame before the policy existed.
 */
export interface StackClassifiedFunction {
  unit: string;
  symbol: string;
  fuzzy: number;
  class: StackFunctionClass | "missing";
  frameCompiled: number | null;
  frameTarget: number | null;
}

export interface StackClassifyResult {
  unitsChecked: number;
  functions: StackClassifiedFunction[];
  errors: Array<{ unit: string; error: string }>;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function objdiffObjectPaths(objdiff: JsonObject): Map<string, { base: string; target: string }> {
  const paths = new Map<string, { base: string; target: string }>();
  for (const unitValue of asArray(objdiff.units)) {
    const unit = asObject(unitValue);
    const name = stringValue(unit.name);
    const base = stringValue(unit.base_path);
    const target = stringValue(unit.target_path);
    if (name && base && target) paths.set(name, { base, target });
  }
  return paths;
}

export async function classifyStackOnlyFunctions(params: {
  report: JsonObject;
  objdiff: JsonObject;
  runner: StackCheckRunner;
  validation?: GameBuildValidation | null;
  /** Only units whose name contains this text. */
  unitFilter?: string;
}): Promise<StackClassifyResult> {
  const objectPaths = objdiffObjectPaths(params.objdiff);
  const layout = gameBuildLayout(params.validation);
  const result: StackClassifyResult = { unitsChecked: 0, functions: [], errors: [] };
  for (const unitValue of asArray(params.report.units)) {
    const unit = asObject(unitValue);
    const unitName = stringValue(unit.name);
    if (!unitName || (params.unitFilter && !unitName.includes(params.unitFilter))) continue;
    const open = asArray(unit.functions)
      .map(asObject)
      .map((fn) => ({ symbol: stringValue(fn.name), fuzzy: numberValue(fn.fuzzy_match_percent, 100), size: numberValue(fn.size, 0) }))
      .filter((fn) => fn.symbol && fn.size > 0 && fn.fuzzy < 100);
    if (open.length === 0) continue;
    const paths = objectPaths.get(unitName) ?? (() => {
      const base = layout.objectPathForUnit(unitName);
      const target = targetObjectPathForUnit(unitName, params.validation);
      return base && target ? { base, target } : null;
    })();
    if (!paths) {
      result.errors.push({ unit: unitName, error: "no object paths for unit" });
      continue;
    }
    result.unitsChecked += 1;
    const compared = await compareStackObjects(params.runner, paths.base, paths.target);
    if (!compared.ok) {
      result.errors.push({ unit: unitName, error: compared.error });
      continue;
    }
    const byName = new Map(compared.value.functions.map((fn) => [fn.name, fn]));
    for (const fn of open) {
      const row = byName.get(fn.symbol);
      result.functions.push({
        unit: unitName,
        symbol: fn.symbol,
        fuzzy: fn.fuzzy,
        class: row?.class ?? "missing",
        frameCompiled: row?.frame_a ?? null,
        frameTarget: row?.frame_b ?? null,
      });
    }
  }
  return result;
}

function readJson(path: string): JsonObject {
  return asObject(JSON.parse(readFileSync(path, "utf8")));
}

export async function stackClassify(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const game = globals.game;
  const gameId = game?.gameId ?? globals.gameId ?? "";
  if (!gameId) throw new Error("stack-classify needs a game (--game)");
  if (!stopsAtFrame(game?.matching?.stackFramePolicy) && !booleanArg(args, "--force")) {
    throw new Error(`stack-classify only applies to stop_at_frame games; ${gameId} matches the frame (pass --force to classify anyway)`);
  }
  const repoRoot = resolve(stringArg(args, "--repo", globals.repoRoot));
  const reportPath = resolve(repoRoot, game?.validation.reportPath ?? "build/GALE01/report.json");
  const objdiffPath = resolve(repoRoot, game?.validation.objdiffPath ?? "objdiff.json");
  for (const path of [reportPath, objdiffPath]) {
    if (!existsSync(path)) throw new Error(`stack-classify needs a built checkout: missing ${path}`);
  }
  const script = resolve(stringArg(args, "--script", resolve(packageRoot(), "toolpacks/gamecube-decomp", STACK_CHECK_TOOLPACK_PATH)));
  if (!existsSync(script)) throw new Error(`stack_check.py not found at ${script}`);
  const dryRun = booleanArg(args, "--dry-run");
  const result = await classifyStackOnlyFunctions({
    report: readJson(reportPath),
    objdiff: readJson(objdiffPath),
    runner: hostStackCheckRunner(script, repoRoot),
    validation: game?.validation,
    unitFilter: stringArg(args, "--unit", ""),
  });
  const stackOnly = result.functions.filter((fn) => fn.class === "stack_only");
  let recorded = 0;
  let cleared = 0;
  if (!dryRun) {
    const store = openState(globals.stateDir);
    try {
      for (const fn of result.functions) {
        if (fn.class === "stack_only") {
          recordStackOnlyFunction(store, {
            gameId,
            unit: fn.unit,
            symbol: fn.symbol,
            fuzzy: fn.fuzzy,
            frameCompiled: fn.frameCompiled,
            frameTarget: fn.frameTarget,
            source: "backfill",
            evidence: { repo: repoRoot, report: reportPath },
          });
          recorded += 1;
        } else if (fn.class === "code") {
          // The function has real mismatches now: a stale record must not hide it.
          clearStackOnlyFunction(store, { gameId, unit: fn.unit, symbol: fn.symbol });
          cleared += 1;
        }
      }
    } finally {
      store.db.close();
    }
  }
  console.log(JSON.stringify({
    game_id: gameId,
    repo: repoRoot,
    dry_run: dryRun,
    units_checked: result.unitsChecked,
    functions_checked: result.functions.length,
    stack_only: stackOnly.map(({ unit, symbol, fuzzy, frameCompiled, frameTarget }) => ({ unit, symbol, fuzzy, frame_compiled: frameCompiled, frame_target: frameTarget })),
    recorded,
    cleared,
    errors: result.errors,
  }, null, 2));
}
