import { randomUUID } from "node:crypto";
import type { PiSessionStatus, RuntimeAgentRole } from "../types/index.js";
import { immediateTransaction, now, type StateStore } from "./db.js";

export function addPiSession(params: {
  store: StateStore;
  runId: string;
  leaseId?: string;
  role: RuntimeAgentRole;
  sessionId: string;
  sessionFile?: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  status: PiSessionStatus;
  outputPath: string;
}): string {
  const id = randomUUID();
  immediateTransaction(params.store.db, () => {
    params.store.db
      .query(
        "INSERT INTO pi_sessions (id, run_id, lease_id, role, session_id, session_file, provider, model, thinking_level, status, output_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        params.runId,
        params.leaseId ?? null,
        params.role,
        params.sessionId,
        params.sessionFile ?? null,
        params.provider ?? null,
        params.model ?? null,
        params.thinkingLevel ?? null,
        params.status,
        params.outputPath,
        now(),
      );
  });
  return id;
}
