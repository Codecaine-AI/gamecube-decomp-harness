import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { isCleanGlobalRegression, runConfirmationPass } from "./confirmation-pass.js";

const tempDirs: string[] = [];

function tempState(): StateStore {
  const dir = mkdtempSync(join(tmpdir(), "confirmation-pass-"));
  tempDirs.push(dir);
  return openState(dir);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function insertTentative(
  store: StateStore,
  id: string,
  params: { widened?: boolean; writeSet?: string[]; createdAt?: string } = {},
): void {
  const checkpointId = `checkpoint-${id}`;
  const claimId = `claim-${id}`;
  const createdAt = params.createdAt ?? `2026-08-11T00:00:0${id.at(-1) ?? "0"}.000Z`;
  store.db
    .query(
      `
        INSERT INTO worker_checkpoints (
          id, worker_state_id, session_id, epoch_id, epoch_target_id,
          target_claim_id, attempt_index, validation_time, validation_status,
          validation_state, write_set_json
        ) VALUES (?, ?, 'run-1', 'epoch-1', ?, ?, 0, ?, 'passed', 'tentative', ?)
      `,
    )
    .run(checkpointId, `worker-${id}`, `target-${id}`, claimId, createdAt, JSON.stringify(params.writeSet ?? [`src/${id}.c`]));
  store.db
    .query(
      `
        INSERT INTO worker_output_integrations (
          id, session_id, epoch_id, epoch_target_id, target_claim_id,
          worker_state_id, worker_checkpoint_id, status, disposition,
          patch_path, write_set_json, validation_state, metadata_json,
          created_at, updated_at
        ) VALUES (?, 'run-1', 'epoch-1', ?, ?, ?, ?, 'applied', 'merge_on_finish_clean', ?, ?, 'tentative', ?, ?, ?)
      `,
    )
    .run(
      id,
      `target-${id}`,
      claimId,
      `worker-${id}`,
      checkpointId,
      `/patches/${id}.patch`,
      JSON.stringify(params.writeSet ?? [`src/${id}.c`]),
      JSON.stringify(params.widened ? { widening_ids: [`widening-${id}`] } : {}),
      createdAt,
      createdAt,
    );
}

function state(store: StateStore, table: string, id: string): Record<string, unknown> {
  return store.db.query(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown>;
}

describe("runConfirmationPass", () => {
  test("requires function, fuzzy, and metric regression sets all to be empty", () => {
    expect(isCleanGlobalRegression({ regressions: [], brokenMatches: [], fuzzyRegressions: [] })).toBe(true);
    expect(isCleanGlobalRegression({ regressions: [{}], brokenMatches: [], fuzzyRegressions: [] })).toBe(false);
  });

  test("flips every applied tentative integration and checkpoint on a clean global", async () => {
    const store = tempState();
    try {
      insertTentative(store, "wide-1", { widened: true });
      insertTentative(store, "plain-2");
      const result = await runConfirmationPass({
        enabled: true,
        store,
        sessionId: "run-1",
        global: { clean: true, buildId: "epoch-build-1", reportPath: "/reports/clean.json", regressionPaths: [] },
        deps: {
          probeWithout: async () => {
            throw new Error("clean globals do not probe");
          },
          revertLive: async () => {
            throw new Error("clean globals do not revert");
          },
          now: () => "2026-08-11T01:00:00.000Z",
        },
      });

      expect(result).toMatchObject({ status: "confirmed", regressedId: null, remainingTentativeIds: [] });
      expect(result.confirmedIds.sort()).toEqual(["plain-2", "wide-1"]);
      expect(state(store, "worker_output_integrations", "wide-1").validation_state).toBe("confirmed");
      expect(state(store, "worker_output_integrations", "plain-2").validation_state).toBe("confirmed");
      expect(state(store, "worker_checkpoints", "checkpoint-wide-1").validation_state).toBe("confirmed");
      expect(String(state(store, "worker_output_integrations", "wide-1").metadata_json)).toContain("epoch-build-1");
    } finally {
      store.db.close();
    }
  });

  test("uses the global probe as revert-bisect decider, marks the guilty widened item regressed, and confirms the other widened item", async () => {
    const store = tempState();
    try {
      insertTentative(store, "wide-a", { widened: true, writeSet: ["include/shared.h"] });
      insertTentative(store, "wide-b", { widened: true, writeSet: ["src/regressed.c"] });
      insertTentative(store, "plain-c", { writeSet: ["src/plain.c"] });
      const probes: string[][] = [];
      const reverted: string[] = [];
      const result = await runConfirmationPass({
        enabled: true,
        store,
        sessionId: "run-1",
        global: {
          clean: false,
          buildId: "epoch-build-dirty",
          reportPath: "/reports/dirty.json",
          regressionPaths: ["src/regressed.c"],
        },
        deps: {
          probeWithout: async (candidates) => {
            const ids = candidates.map((candidate) => candidate.integrationId);
            probes.push(ids);
            return ids.includes("wide-b");
          },
          revertLive: async (candidate) => {
            reverted.push(candidate.integrationId);
            return { ok: true, revision: "revert-sha" };
          },
          now: () => "2026-08-11T02:00:00.000Z",
        },
      });

      expect(result).toMatchObject({
        status: "regressed",
        confirmedIds: ["wide-a"],
        regressedId: "wide-b",
        remainingTentativeIds: ["plain-c"],
        requiresBoundaryRecheck: true,
      });
      expect(probes.at(-1)).toEqual(["wide-b"]);
      expect(reverted).toEqual(["wide-b"]);
      expect(state(store, "worker_output_integrations", "wide-b")).toMatchObject({
        status: "rejected",
        disposition: "confirmation_regressed_reverted",
        validation_state: "regressed",
      });
      expect(state(store, "worker_checkpoints", "checkpoint-wide-b").validation_state).toBe("regressed");
      expect(state(store, "worker_output_integrations", "wide-a").validation_state).toBe("confirmed");
      expect(state(store, "worker_output_integrations", "plain-c").validation_state).toBe("tentative");
    } finally {
      store.db.close();
    }
  });

  test("disabled confirmation is a zero-delta no-op", async () => {
    const store = tempState();
    try {
      insertTentative(store, "wide-off", { widened: true });
      const before = state(store, "worker_output_integrations", "wide-off");
      const result = await runConfirmationPass({
        enabled: false,
        store,
        sessionId: "run-1",
        global: { clean: true, buildId: "unused", reportPath: "/unused", regressionPaths: [] },
        deps: {
          probeWithout: async () => false,
          revertLive: async () => ({ ok: false }),
        },
      });
      const after = state(store, "worker_output_integrations", "wide-off");
      expect(result.status).toBe("disabled");
      expect(after).toEqual(before);
      expect(state(store, "worker_checkpoints", "checkpoint-wide-off").validation_state).toBe("tentative");
    } finally {
      store.db.close();
    }
  });
});
