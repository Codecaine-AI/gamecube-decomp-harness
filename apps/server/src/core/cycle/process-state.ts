import { canonicalProcessName } from "./process-identity.js";
import type { CycleProcessState } from "./types.js";

export interface CycleProcessIdentityInput {
  command?: string[];
  endedAt?: string | null;
  graphDbPath?: string | null;
  name?: string | null;
  pid?: number | null;
  processFilePath?: string | null;
  gameId: string;
  repoRoot?: string | null;
  cycleUuid: string;
  startedAt?: string | null;
  state?: string | null;
  stateDir?: string | null;
  updatedAt?: string;
}

export function cycleProcessState(input: CycleProcessIdentityInput): CycleProcessState {
  const now = input.updatedAt ?? new Date().toISOString();
  const pid = typeof input.pid === "number" && Number.isFinite(input.pid) ? input.pid : null;
  const status = input.state === "running" || input.state === "stopping" || input.state === "exited" || input.state === "idle" ? input.state : "unknown";
  return {
    process_name: canonicalProcessName(input.name),
    game_id: input.gameId,
    cycle_uuid: input.cycleUuid,
    status,
    pid,
    process_group: pid ? -pid : null,
    process_file_path: input.processFilePath ?? null,
    command: input.command ?? [],
    repo_root: input.repoRoot ?? null,
    state_dir: input.stateDir ?? null,
    graph_db_path: input.graphDbPath ?? null,
    started_at: input.startedAt ?? null,
    ended_at: input.endedAt ?? null,
    updated_at: now,
  };
}
