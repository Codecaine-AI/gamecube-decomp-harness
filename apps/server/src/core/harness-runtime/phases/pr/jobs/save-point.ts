import { randomUUID } from "node:crypto";
import { getHarnessState } from "@server/core/harness-state/state.js";
import { openState } from "@server/core/orchestrator-state";
import { captureHarnessSavePoint, recordHarnessSavePointFailure } from "./harness-save-point.js";
import { listSavePoints, type SavePointTrigger } from "../state";
import { booleanArg, numberArg, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";

const SAVE_POINT_TRIGGERS: SavePointTrigger[] = ["manual", "init", "pause", "checkpoint", "qa", "ship", "sync", "fresh", "epoch", "baseline", "epoch_finish", "pr_sync"];
function parseTrigger(value: string): SavePointTrigger {
  if ((SAVE_POINT_TRIGGERS as string[]).includes(value)) return value as SavePointTrigger;
  throw new Error(`--trigger must be one of: ${SAVE_POINT_TRIGGERS.join(", ")}`);
}

export async function savePoint(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const store = openState(globals.stateDir);
  try {
    if (booleanArg(args, "--list")) {
      const limit = Math.max(1, Math.floor(numberArg(args, "--limit", 50)));
      console.log(JSON.stringify({ savePoints: listSavePoints(store, limit) }, null, 2));
      return;
    }

    const triggerKind = parseTrigger(stringArg(args, "--trigger", "manual"));
    const label = stringArg(args, "--label", "") || null;
    const commandId = stringArg(args, "--command-id", `command-save-point-${randomUUID()}`);
    const selectedGameId = globals.game?.gameId ?? globals.gameId;
    if (selectedGameId && getHarnessState(store.db, selectedGameId)) {
      const reportPath = globals.game?.validation.reportPath;
      const reportChangesPath = globals.game?.validation.reportChangesPath;
      if (!reportPath || !reportChangesPath) {
        const message = "Harness save-point capture requires the game's configured report paths";
        recordHarnessSavePointFailure(store, { gameId: selectedGameId, commandId, message });
        throw new Error(message);
      }
      const result = await captureHarnessSavePoint(store, {
        gameId: selectedGameId, commandId, triggerKind, label,
        reportPath,
        reportChangesPath,
        baseRef: stringArg(args, "--base-ref", globals.game?.baseRef ?? "origin/master"),
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    throw new Error(`No harness for ${selectedGameId ?? "selected game"}`);
  } finally {
    store.db.close();
  }
}
