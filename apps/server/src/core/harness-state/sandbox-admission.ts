import { readFileSync } from "node:fs";
import type { StateStore } from "../orchestrator-state/index.js";
import type { ResolvedGame } from "../game-registry/resolver.js";
import { gameConfigurationRevision } from "../game-registry/config-revision.js";
import { captureSandboxProvenance, readSandboxProvenance, type SandboxProvenance } from "../game-registry/sandbox-provenance.js";
import { getHarnessState } from "./state.js";

function sameSandbox(a: SandboxProvenance, b: SandboxProvenance): boolean {
  return a.profile === b.profile && a.snapshot_name === b.snapshot_name && a.snapshot_baked_rev === b.snapshot_baked_rev
    && a.workspace_root === b.workspace_root && a.resource_class.cpu === b.resource_class.cpu
    && a.resource_class.memory_gib === b.resource_class.memory_gib && a.resource_class.disk_gib === b.resource_class.disk_gib;
}

/** Boolean readiness cannot authorize a different profile or image than the one proved against the host. */
export function assertSandboxAdmission(store: StateStore, input: {
  game?: ResolvedGame; gameId?: string; runId?: string; profile?: string; provenance?: SandboxProvenance;
}): SandboxProvenance {
  const selected = input.provenance ?? captureSandboxProvenance(input.game, input.profile);
  const runGame = input.runId ? store.db.query("SELECT game_id FROM runs WHERE id = ?").get(input.runId) as { game_id: string | null } | null : null;
  const gameId = input.game?.gameId ?? input.gameId ?? runGame?.game_id ?? undefined;
  if (runGame?.game_id && gameId !== runGame.game_id) throw new Error("Sandbox admission selected game differs from the run");
  const harness = gameId ? getHarnessState(store.db, gameId) : null;
  if (!harness) throw new Error("Sandbox admission requires an initialized harness");
  if (!input.game) throw new Error("Sandbox admission requires resolved game configuration");
  if (harness.readiness.sandbox !== "ready") throw new Error("Sandbox admission requires successful sandbox validation");
  const revision = gameConfigurationRevision(input.game);
  if (revision !== harness.source.configuration_revision) throw new Error("Sandbox admission configuration changed since accepted Sync");
  const configured = captureSandboxProvenance(input.game, selected.profile);
  if (!sameSandbox(selected, configured)) throw new Error("Sandbox admission image differs from current profile configuration");
  const rows = store.db.query("SELECT payload_json FROM harness_timeline_entries WHERE game_id = ? AND json_extract(payload_json, '$.outcome') = 'sandbox_validated' ORDER BY id DESC")
    .all(gameId!) as Array<{ payload_json: string }>;
  for (const row of rows) {
    try {
      const boundary = JSON.parse(row.payload_json);
      const accepted = readSandboxProvenance(boundary.evidence?.sandbox);
      if (!accepted || boundary.evidence.configuration_revision !== revision || !sameSandbox(selected, accepted)) continue;
      if (typeof boundary.evidence?.path !== "string") continue;
      const evidence = JSON.parse(readFileSync(boundary.evidence.path, "utf8"));
      const validated = readSandboxProvenance(evidence.sandbox);
      if (evidence.status === "passed" && evidence.game_id === gameId && evidence.configuration_revision === revision
        && validated && sameSandbox(selected, validated)) return selected;
    } catch { /* Missing or malformed evidence never grants admission. */ }
  }
  throw new Error(`Sandbox profile ${selected.profile || "default"} image ${selected.snapshot_name} has no successful validation for the current configuration`);
}
