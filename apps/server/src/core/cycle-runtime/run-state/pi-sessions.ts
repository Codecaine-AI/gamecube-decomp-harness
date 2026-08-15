import { randomUUID } from "node:crypto";
import type { PiSessionStatus, RuntimeAgentRole } from "@server/core/shared/types/index.js";
import { immediateTransaction, now, piSessions, type StateStore } from "@server/core/orchestrator-state";

export function addPiSession(params: {
  store: StateStore;
  runId: string;
  claimId?: string;
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
    params.store.orm
      .insert(piSessions)
      .values({
        id,
        runId: params.runId,
        targetClaimId: params.claimId ?? null,
        role: params.role,
        sessionId: params.sessionId,
        sessionFile: params.sessionFile ?? null,
        provider: params.provider ?? null,
        model: params.model ?? null,
        thinkingLevel: params.thinkingLevel ?? null,
        status: params.status,
        outputPath: params.outputPath,
        createdAt: now(),
      })
      .run();
  });
  return id;
}
