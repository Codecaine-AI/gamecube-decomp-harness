import type { Database } from "bun:sqlite";

/** Current and historical kernel sessions are game-owned; trace payloads remain immutable in Agent Kernel. */
export const HARNESS_KERNEL_TRACES_DDL = `CREATE TABLE IF NOT EXISTS harness_kernel_traces (
  game_id TEXT NOT NULL,
  harness_id TEXT NOT NULL,
  app_session_id TEXT NOT NULL,
  kernel_trace_json TEXT NOT NULL,
  PRIMARY KEY(game_id, harness_id, app_session_id)
);`;

export function persistHarnessKernelTrace(db: Database, gameId: string, harnessId: string, trace: Record<string, unknown>): void {
  const appSessionId = trace.app_session_id;
  if (typeof appSessionId !== "string" || !appSessionId.trim()) throw new Error("Kernel app session identity is required");
  const previous = db.query("SELECT kernel_trace_json FROM harness_kernel_traces WHERE game_id=? AND harness_id=? AND app_session_id=?").get(gameId,harnessId,appSessionId) as {kernel_trace_json:string} | null;
  const merged = {...(previous ? JSON.parse(previous.kernel_trace_json) : {}), ...trace};
  db.query(`INSERT INTO harness_kernel_traces(game_id,harness_id,app_session_id,kernel_trace_json) VALUES(?,?,?,?)
    ON CONFLICT(game_id,harness_id,app_session_id) DO UPDATE SET kernel_trace_json=excluded.kernel_trace_json`)
    .run(gameId, harnessId, appSessionId, JSON.stringify(merged));
}
