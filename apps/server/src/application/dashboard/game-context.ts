import { resolve } from "node:path";
import { listGames, gameToSummary, resolveGame, type GameRuntimeContext, type GameSummary, type ResolvedGame } from "@server/core/game-registry";
import { gameToolConcurrencyDefaults } from "@server/core/tools/concurrency-config";

type JsonObject = Record<string, unknown>;

export interface DashboardGameContextService {
  availableGames: () => GameSummary[];
  defaultGame: () => ResolvedGame | null;
  gameDefaults: (game: ResolvedGame | null) => JsonObject | null;
  requestPaths: (url: URL, options?: { useDefaultGame?: boolean }) => GameRuntimeContext;
  resolveDashboardGame: (input: JsonObject, options?: { useDefaultGame?: boolean }) => GameRuntimeContext;
}

export interface DashboardGameContextServiceDeps {
  appendLog: (stream: "stdout" | "stderr" | "ui", text: string) => void;
  defaultRepoRoot: string;
  defaultStateDir: string;
  packageRoot: string;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function boolValue(value: unknown): boolean {
  return value === true || value === "true";
}

export function createDashboardGameContextService(deps: DashboardGameContextServiceDeps): DashboardGameContextService {
  function gameDefaults(game: ResolvedGame | null): JsonObject | null {
    if (!game) return null;
    return {
      processName: game.processName,
      baseRef: game.baseRef,
      graphDbPath: game.graphDbPath,
      validation: game.validation,
      dashboard: game.dashboard,
      toolConcurrency: gameToolConcurrencyDefaults(game.localEnvPath),
      pr: game.pr,
      knowledge: game.knowledge,
    };
  }

  function availableGames(): GameSummary[] {
    try {
      return listGames({ orchestratorRoot: deps.packageRoot });
    } catch (error) {
      deps.appendLog("stderr", `game list failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  function defaultGame(): ResolvedGame | null {
    try {
      return resolveGame({ orchestratorRoot: deps.packageRoot, useDefaultGame: true });
    } catch {
      return null;
    }
  }

  function resolveDashboardGame(input: JsonObject, options: { useDefaultGame?: boolean } = {}): GameRuntimeContext {
    const gameId = stringValue(input.gameId).trim();
    const usePathOverrides = boolValue(input.usePathOverrides);
    if (gameId || options.useDefaultGame) {
      try {
        const game = resolveGame({
          orchestratorRoot: deps.packageRoot,
          gameId: gameId || undefined,
          useDefaultGame: !gameId && options.useDefaultGame === true,
          explicitOverrides: usePathOverrides
            ? {
                repoRoot: stringValue(input.repoRoot) || undefined,
                stateDir: stringValue(input.stateDir) || undefined,
                graphDb: stringValue(input.graphDbPath, stringValue(input.graphDb)) || undefined,
              }
            : undefined,
        });
        return {
          game,
          repoRoot: game.repoRoot,
          stateDir: game.stateDir,
          graphDbPath: game.graphDbPath,
          usePathOverrides,
        };
      } catch (error) {
        if (gameId) throw error;
      }
    }

    return {
      game: null,
      repoRoot: resolve(stringValue(input.repoRoot, deps.defaultRepoRoot)),
      stateDir: resolve(stringValue(input.stateDir, deps.defaultStateDir)),
      graphDbPath: resolve(stringValue(input.graphDbPath, stringValue(input.graphDb, "")) || resolve(deps.defaultStateDir, "knowledge-graph.sqlite")),
      usePathOverrides: true,
    };
  }

  function requestPaths(url: URL, options: { useDefaultGame?: boolean } = {}): GameRuntimeContext {
    return resolveDashboardGame(
      {
        gameId: url.searchParams.get("gameId") ?? "",
        repoRoot: url.searchParams.get("repoRoot") ?? "",
        stateDir: url.searchParams.get("stateDir") ?? "",
        graphDbPath: url.searchParams.get("graphDbPath") ?? url.searchParams.get("graphDb") ?? "",
        usePathOverrides: url.searchParams.get("usePathOverrides") ?? "",
      },
      options,
    );
  }

  return {
    availableGames,
    defaultGame,
    gameDefaults,
    requestPaths,
    resolveDashboardGame,
  };
}

export { gameToSummary };
