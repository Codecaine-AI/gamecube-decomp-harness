import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { resolveGame, sandboxRuntimeOptions } from "../../../../../apps/server/src/core/game-registry/resolver.js";
import { gameLayoutPath, readGameConfigWithLocal } from "../../../../../apps/server/src/core/game-registry/config.js";
import { gameToolsRoot } from "../../../../../apps/server/src/core/tools/platform.js";
import { resolveRegisteredTool } from "../../../../../apps/server/src/core/tools/resolver.js";
import { ASM_WINDOW_INDEX_FILES, ASM_WINDOW_SEARCH_TOOL_ID } from "../../../../../apps/server/src/core/tools/wrappers/asm-window-search.js";

/** Traced MWCC versions every image carries (contract: build/compilers-traced/GC/<ver>/mwcceppc.exe). */
export const TRACED_COMPILER_VERSIONS = ["1.1p1", "1.2.5", "1.2.5n"] as const;

export interface TracedRequirement { required: string[]; stock_exclusions: Record<string, string[]> }

/**
 * A game's traced-compiler policy from `traced_compilers` in
 * games/<id>/config/worker-image.json: `required` versions (the bundle fails
 * when the evidence gate would disable one, unless --allow-disabled-traced) and
 * `stock_exclusions`, the units per version the stock compiler itself cannot
 * build, the only stock failures a byte-identity sweep may contain.
 */
function tracedRequirement(gameDir: string): TracedRequirement {
  const path = gameLayoutPath(gameDir, "config/worker-image.json");
  if (!existsSync(path)) return { required: [], stock_exclusions: {} };
  const config = JSON.parse(readFileSync(path, "utf8")) as { traced_compilers?: { required?: unknown; stock_exclusions?: unknown } };
  const required = config.traced_compilers?.required ?? [];
  const exclusions = config.traced_compilers?.stock_exclusions ?? {};
  const known: readonly string[] = TRACED_COMPILER_VERSIONS;
  if (!Array.isArray(required) || required.some((v) => typeof v !== "string" || !known.includes(v))) {
    throw new Error(`${path}: traced_compilers.required must list versions from ${known.join(", ")}`);
  }
  if (!exclusions || typeof exclusions !== "object" || Array.isArray(exclusions)
      || Object.entries(exclusions).some(([v, units]) => !known.includes(v) || !Array.isArray(units)
        || units.some((u) => typeof u !== "string" || !u))) {
    throw new Error(`${path}: traced_compilers.stock_exclusions must map versions to unit lists`);
  }
  return { required: required as string[], stock_exclusions: exclusions as Record<string, string[]> };
}

/** Every game's traced policy: traced binaries are shared, so each game that needs a version must have evidence. */
function tracedRequirements(harnessRoot: string): Record<string, TracedRequirement> {
  const games = join(harnessRoot, "games");
  return Object.fromEntries(readdirSync(games, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-z0-9][a-z0-9_-]*$/.test(entry.name) && existsSync(join(games, entry.name, "game.json")))
    .map((entry) => [entry.name, tracedRequirement(join(games, entry.name))] as const)
    .filter(([, spec]) => spec.required.length > 0 || Object.keys(spec.stock_exclusions).length > 0)
    .sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Host shared-data root of the asm-window index, resolved like worker-job.ts's
 * sandboxToolData so the baked copy is the tree provisioning would upload.
 * Falls back to the default layout when the tool registry cannot resolve.
 */
function asmWindowDataRoot(gameId: string, descriptorPath: string, gameDir: string): string {
  try {
    return resolveRegisteredTool({ game: { gameId, descriptorPath } }, ASM_WINDOW_SEARCH_TOOL_ID).sharedDataRoot;
  } catch {
    return gameLayoutPath(gameDir, `runtime/tool-data/${ASM_WINDOW_SEARCH_TOOL_ID}`);
  }
}

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
  // The map-symbol validator reads the linker map out of the extracted disc
  // (`orig/<version>/files/...`). The disc image itself stays out of the
  // bundle; the shell extracts just the map from `orig/<version>/` at bake time.
  const symbolCheckMap = game.validation.symbolCheck?.map ?? "";
  const discDir = symbolCheckMap ? symbolCheckMap.split("/").slice(0, 2).join("/") : "";
  if (symbolCheckMap && (!/^orig\/[A-Za-z0-9_.-]+\/.+/.test(symbolCheckMap) || symbolCheckMap.split("/").includes(".."))) {
    throw new Error("validation.symbolCheck.map must live under orig/<version>/ inside the checkout");
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
    // Checkout-relative linker map baked for the symbol-check task ("" when the game has none) and the disc directory it is extracted from.
    symbolCheckMap,
    discDir,
    // Standards staged into the image (harness-relative); the shell requires both.
    globalStandardsDir: "knowledge/global/sources/injectable/decomp_standards/standards",
    gameStandardsDir: `games/${game.gameId}/knowledge/sources/injectable/decomp_standards/standards`,
    // Prebuilt traced compilers with their evidence (untracked, from compiler/mwcc_alloc/native/build.sh
    // and validate/byte_identity.py): <dir>/<ver>/{mwcceppc.exe,lmgr326b.dll}, <dir>/CAPABILITIES.json,
    // <dir>/validation/*.json. The bundle's --traced-compilers overrides the directory.
    tracedCompilersDir: gameLayoutPath(game.gameDir, "runtime/tool-data/mwcc_native"),
    tracedCompilerVersions: [...TRACED_COMPILER_VERSIONS],
    tracedCompilersRequired: tracedRequirement(game.gameDir).required,
    // Optional prebuilt asm-window index baked at /opt/tool-data/<toolId>/<file> with a .ready stamp.
    asmWindowToolId: ASM_WINDOW_SEARCH_TOOL_ID,
    asmWindowDataRoot: asmWindowDataRoot(game.gameId, game.descriptorPath, game.gameDir),
    asmWindowIndexFiles: [...ASM_WINDOW_INDEX_FILES],
    // Written to traced-compilers/requirements.json for the image's evidence gate.
    tracedRequirements: tracedRequirements(resolve(options.harnessRoot)),
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
      plan.workspaceRoot, plan.symbolCheckMap, plan.discDir, plan.tracedCompilersDir,
      plan.tracedCompilerVersions.join(","), plan.tracedCompilersRequired.join(","),
      JSON.stringify({ games: plan.tracedRequirements }), plan.asmWindowToolId, plan.asmWindowDataRoot,
      plan.asmWindowIndexFiles.join(","), JSON.stringify(plan)].join("\n"));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
