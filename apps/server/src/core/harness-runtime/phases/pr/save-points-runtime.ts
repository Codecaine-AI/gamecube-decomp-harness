import { getHarnessState } from "@server/core/harness-state/state.js";
import { openState } from "@server/core/orchestrator-state";
import { recordHarnessSavePointFailure } from "./jobs/harness-save-point.js";
import { randomUUID } from "node:crypto";
import type { GameRuntimeContext } from "@server/core/game-registry";
import type { CliResult } from "@server/infrastructure/shell/ui-command-runner";
import { uiLog } from "@server/infrastructure/logging/ui-log";

type JsonObject = Record<string, unknown>;

export interface BoundarySavePointResult extends JsonObject {
  ok: boolean;
  savePointId: string | null;
  blockerRaised: boolean;
}

export interface SavePointRuntime {
  boundarySavePoint: (paths: GameRuntimeContext, trigger: string, label?: string, commandId?: string) => Promise<BoundarySavePointResult>;
  createSavePoint: (body: JsonObject) => Promise<JsonObject>;
  parseCliJsonOutput: (stdout: string) => JsonObject;
}

export interface SavePointRuntimeDeps {
  invalidateCampaignCache: () => void;
  outputTail: (textValue: string, maxLength?: number) => string;
  resolveDashboardGame: (input: JsonObject, options?: { useDefaultGame?: boolean }) => GameRuntimeContext;
  runCli: (command: string[], cwd?: string) => Promise<CliResult>;
  serverJobPath: string;
}

const SAVE_POINT_TRIGGERS = new Set(["manual", "init", "pause", "checkpoint", "qa", "ship", "sync", "fresh", "epoch"]);

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function serverJobPrefix(paths: GameRuntimeContext, serverJobPath: string): string[] {
  const command = ["bun", serverJobPath];
  if (paths.game) command.push("--game", paths.game.gameId);
  command.push("--repo-root", paths.repoRoot, "--state-dir", paths.stateDir);
  return command;
}

export function createSavePointRuntime(deps: SavePointRuntimeDeps): SavePointRuntime {
  function parseCliJsonOutput(stdout: string): JsonObject {
    const trimmed = stdout.trim();
    if (!trimmed) return {};
    try {
      return asObject(JSON.parse(trimmed));
    } catch {
      return {};
    }
  }

  function recordBoundaryFailure(paths: GameRuntimeContext, message: string, commandId: string): boolean {
    const gameId = paths.game?.gameId;
    if (!gameId) return false;
    const store = openState(paths.stateDir);
    try { return recordHarnessSavePointFailure(store, { gameId, commandId, message }); }
    finally { store.db.close(); }
  }

  async function boundarySavePoint(
    paths: GameRuntimeContext,
    trigger: string,
    label = "",
    commandId = `command-save-point-${randomUUID()}`,
  ): Promise<BoundarySavePointResult> {
    const actor = trigger === "manual" ? "operator" : "runner";
    const gameId = paths.game?.gameId;
    if (!gameId) throw new Error("Save-point boundary requires a selected game");
    const store = openState(paths.stateDir);
    let canonicalState;
    try { canonicalState = getHarnessState(store.db, gameId); }
    finally { store.db.close(); }
    if (!canonicalState) throw new Error(`No harness for ${gameId}`);
    try {
      const canonicalPaths = { ...paths, repoRoot: canonicalState.source.worktree };
      const command = [...serverJobPrefix(canonicalPaths, deps.serverJobPath), "save-point", "--trigger", trigger];
      if (label) command.push("--label", label);
      command.push("--command-id", commandId, "--actor", actor);
      const result = await deps.runCli(command);
      deps.invalidateCampaignCache();
      if (result.exitCode !== 0) {
        const message = `save-point (${trigger}) failed (${result.exitCode}): ${deps.outputTail(result.stderr || result.stdout, 800)}`;
        uiLog("stderr", message);
        return {
          ok: false,
          savePointId: null,
          blockerRaised: recordBoundaryFailure(paths, message, commandId),
        };
      }
      const parsed = parseCliJsonOutput(result.stdout);
      const savePointId = stringValue(asObject(parsed.savePoint).id) || null;
      if (!savePointId) {
        const message = `save-point (${trigger}) failed: command succeeded without a save-point id`;
        uiLog("stderr", message);
        return {
          ok: false,
          savePointId: null,
          blockerRaised: recordBoundaryFailure(paths, message, commandId),
        };
      }
      uiLog("ui", `save-point (${trigger}) recorded`);
      return { ok: true, savePointId, blockerRaised: parsed.blockerRaised === true };
    } catch (error) {
      const message = `save-point (${trigger}) failed: ${error instanceof Error ? error.message : String(error)}`;
      uiLog("stderr", message);
      return {
        ok: false,
        savePointId: null,
        blockerRaised: recordBoundaryFailure(paths, message, commandId),
      };
    }
  }

  async function createSavePoint(body: JsonObject): Promise<JsonObject> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const trigger = stringValue(body.trigger, "manual");
    if (!SAVE_POINT_TRIGGERS.has(trigger)) throw new Error(`Unknown save-point trigger: ${trigger}`);
    const commandId = stringValue(body.commandId, stringValue(body.command_id)).trim() || `command-save-point-${randomUUID()}`;
    const label = stringValue(body.label).trim() || (trigger === "manual" ? `manual-${commandId}` : "");
    const result = await boundarySavePoint(paths, trigger, label, commandId);
    if (!result.ok) throw new Error("save-point failed; see process logs");
    return result;
  }

  return {
    boundarySavePoint,
    createSavePoint,
    parseCliJsonOutput,
  };
}
