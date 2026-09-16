import { existsSync } from "node:fs";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import { resolveGame, sandboxRuntimeOptions } from "../../../../../apps/server/src/core/game-registry/resolver.js";
import { readGameConfigWithLocal } from "../../../../../apps/server/src/core/game-registry/config.js";
import { gameToolsRoot } from "../../../../../apps/server/src/core/tools/platform.js";

/** Resolve image inputs without reading credentials or opening runtime databases. */
export function bundlePlan(options: { harnessRoot: string; gameId: string; profile?: string; checkout?: string }) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(options.gameId)) throw new Error("Invalid game ID");
  const game = resolveGame({ orchestratorRoot: resolve(options.harnessRoot), gameId: options.gameId });
  if (!existsSync(game.descriptorPath)) throw new Error(`Game descriptor does not exist: ${game.descriptorPath}`);
  const sandbox = sandboxRuntimeOptions(game, options.profile);
  const checkout = resolve(options.checkout || game.repoRoot);
  const reportPath = relative(checkout, resolve(checkout, game.validation.reportPath));
  if (!reportPath || isAbsolute(reportPath) || reportPath === ".." || reportPath.startsWith(`..${sep}`)) {
    throw new Error("Image report path must be inside the checkout");
  }
  // These values become Dockerfile arguments. Keep paths portable and unambiguous.
  if (!/^\/[a-zA-Z0-9_/-]+$/.test(sandbox.workspace_root)
      || sandbox.workspace_root === "/" || posix.normalize(sandbox.workspace_root) !== sandbox.workspace_root
      || sandbox.workspace_root.split("/").includes("..")) {
    throw new Error("Sandbox workspace_root must be a normalized absolute Linux directory");
  }
  const config = readGameConfigWithLocal(game.descriptorPath);
  const tools = config.tools as { toolsRoot?: unknown } | undefined;
  const toolsRoot = gameToolsRoot({ gameDir: game.gameDir, stateDir: game.stateDir,
    toolsRoot: typeof tools?.toolsRoot === "string" ? tools.toolsRoot : undefined });
  const plan = {
    schemaVersion: 1,
    gameId: game.gameId,
    checkout,
    reportPath,
    toolsRoot,
    profile: options.profile?.trim() || game.sandbox.default_profile || "default",
    snapshotName: sandbox.snapshot_name,
    workspaceRoot: sandbox.workspace_root,
    resourceClass: sandbox.resource_class,
    payloadDirectory: `daytona-${game.gameId}-image`,
  };
  if (Object.values(plan).some((value) => typeof value === "string" && /[\r\n\0]/.test(value))) {
    throw new Error("Image plan paths cannot contain newlines or NUL bytes");
  }
  return plan;
}

if (import.meta.main) {
  try {
    const [harnessRoot, gameId, profile, checkout] = process.argv.slice(2);
    if (!harnessRoot || !gameId) throw new Error("Expected harness root, game ID, optional profile and checkout");
    const plan = bundlePlan({ harnessRoot, gameId, profile, checkout });
    // Fixed positional records: the shell reads these as data, never as shell code.
    console.log([plan.checkout, plan.toolsRoot, plan.reportPath, plan.payloadDirectory,
      plan.workspaceRoot, JSON.stringify(plan)].join("\n"));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
