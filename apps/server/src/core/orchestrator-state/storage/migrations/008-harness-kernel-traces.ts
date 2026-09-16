import type { StorageMigration } from "./types.js";
import { HARNESS_KERNEL_TRACES_DDL } from "../../../harness-state/kernel-trace-state.js";

/** Preserve every historical app-session association without retaining a cycle runtime. */
export const harnessKernelTracesMigration: StorageMigration = {
  version: 8,
  name: "harness_kernel_traces",
  up(db) {
    db.exec(HARNESS_KERNEL_TRACES_DDL);
    const rows = db.query("SELECT game_id, cycle_uuid, kernel_trace_json FROM historical_cycles WHERE kernel_trace_json IS NOT NULL").all() as Array<{game_id:string; cycle_uuid:string; kernel_trace_json:string}>;
    for (const row of rows) {
      const trace = JSON.parse(row.kernel_trace_json);
      if (typeof trace?.app_session_id !== "string" || !trace.app_session_id.trim()) continue;
      db.query("INSERT INTO harness_kernel_traces VALUES (?,?,?,?) ON CONFLICT DO NOTHING")
        .run(row.game_id,row.cycle_uuid,trace.app_session_id,row.kernel_trace_json);
    }
  },
};
