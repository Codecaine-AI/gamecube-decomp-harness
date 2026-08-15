import { randomUUID } from "node:crypto";
import { recordSavePointFailureDurably } from "@server/core/cycle";
import type { GameRuntimeContext } from "@server/core/game-registry";
import type { CliResult } from "@server/infrastructure/shell/ui-command-runner";

type JsonObject = Record<string, unknown>;

export interface BoundarySavePointResult extends JsonObject {
  ok: boolean;
  savePointId: string | null;
  blockerRaised: boolean;
}

export interface SavePointRuntime {
  boundarySavePoint: (paths: GameRuntimeContext, trigger: string, cycleUuid: string, label?: string) => Promise<BoundarySavePointResult>;
  createSavePoint: (body: JsonObject) => Promise<JsonObject>;
  parseCliJsonOutput: (stdout: string) => JsonObject;
}

export interface SavePointRuntimeDeps {
  appendLog: (stream: "stdout" | "stderr" | "ui", text: string) => void;
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

  function recordBoundaryFailure(
    paths: GameRuntimeContext,
    trigger: string,
    label: string,
    message: string,
    commandId: string,
    actor: "operator" | "runner",
    cycleUuid: string,
  ): boolean {
    const gameId = paths.game?.gameId;
    const workflowCorrelationId = cycleUuid.trim();
    if (!workflowCorrelationId) throw new Error("Save-point boundary requires an explicit cycle UUID");
    const result = recordSavePointFailureDurably(paths.stateDir, {
        gameId,
        cycleUuid: workflowCorrelationId,
        triggerKind: trigger,
        sourceKind: "save_point_boundary",
        sourceId: label || trigger,
        message,
        commandId,
        correlationId: workflowCorrelationId,
        actor,
      });
    if (!result.blockerRaised) {
      deps.appendLog(
        "stderr",
        `save-point (${trigger}) durable failure record failed: ${result.error ?? "unknown persistence error"}`,
      );
    }
    return result.blockerRaised;
  }

  async function boundarySavePoint(
    paths: GameRuntimeContext,
    trigger: string,
    cycleUuid: string,
    label = "",
  ): Promise<BoundarySavePointResult> {
    const commandId = `command-save-point-${randomUUID()}`;
    const actor = trigger === "manual" ? "operator" : "runner";
    const workflowCorrelationId = cycleUuid.trim();
    if (!workflowCorrelationId) throw new Error("Save-point boundary requires an explicit cycle UUID");
    try {
      const command = [...serverJobPrefix(paths, deps.serverJobPath), "save-point", "--trigger", trigger];
      if (label) command.push("--label", label);
      command.push("--command-id", commandId, "--actor", actor, "--cycle-uuid", workflowCorrelationId);
      const result = await deps.runCli(command);
      deps.invalidateCampaignCache();
      if (result.exitCode !== 0) {
        const message = `save-point (${trigger}) failed (${result.exitCode}): ${deps.outputTail(result.stderr || result.stdout, 800)}`;
        deps.appendLog("stderr", message);
        return {
          ok: false,
          savePointId: null,
          blockerRaised: recordBoundaryFailure(paths, trigger, label, message, commandId, actor, workflowCorrelationId),
        };
      }
      const parsed = parseCliJsonOutput(result.stdout);
      const savePointId = stringValue(asObject(parsed.savePoint).id) || null;
      if (!savePointId) {
        const message = `save-point (${trigger}) failed: command succeeded without a save-point id`;
        deps.appendLog("stderr", message);
        return {
          ok: false,
          savePointId: null,
          blockerRaised: recordBoundaryFailure(paths, trigger, label, message, commandId, actor, workflowCorrelationId),
        };
      }
      deps.appendLog("ui", `save-point (${trigger}) recorded`);
      return { ok: true, savePointId, blockerRaised: false };
    } catch (error) {
      const message = `save-point (${trigger}) failed: ${error instanceof Error ? error.message : String(error)}`;
      deps.appendLog("stderr", message);
      return {
        ok: false,
        savePointId: null,
        blockerRaised: recordBoundaryFailure(paths, trigger, label, message, commandId, actor, workflowCorrelationId),
      };
    }
  }

  async function createSavePoint(body: JsonObject): Promise<JsonObject> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const trigger = stringValue(body.trigger, "manual");
    if (!SAVE_POINT_TRIGGERS.has(trigger)) throw new Error(`Unknown save-point trigger: ${trigger}`);
    const label = stringValue(body.label).trim() || (trigger === "manual" ? `manual-${new Date().toISOString()}` : "");
    const cycleUuid = stringValue(body.cycleUuid, stringValue(body.cycle_uuid)).trim();
    if (!cycleUuid) throw new Error("Save-point creation requires an explicit cycle UUID");
    const result = await boundarySavePoint(paths, trigger, cycleUuid, label);
    if (!result.ok) throw new Error("save-point failed; see process logs");
    return result;
  }

  return {
    boundarySavePoint,
    createSavePoint,
    parseCliJsonOutput,
  };
}
