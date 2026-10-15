import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAllFts, buildAttemptFts } from "@server/core/knowledge-v2/index/fts.js";
import { openKnowledgeIndexDb } from "@server/core/knowledge-v2/index/db.js";
import { createEmptyPrArchive } from "@server/core/knowledge-v2/index/pr-archive.js";
import { STACK_POLICY_REDACTION, STEERING_PROBE_LABEL, steeringGateForGame } from "@server/core/knowledge-v2/stack-policy-filter.js";
import { openKnowledgeStore } from "@server/core/knowledge-v2/storage/store.js";
import type { AgentToolRegistration } from "../types.js";
import {
  kv2AttemptSearchToolRegistration,
  kv2PrSearchToolRegistration,
} from "./knowledge-v2.js";

let root = "";
let previousRoot: string | undefined;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "kv2-stack-policy-"));
  previousRoot = process.env.ORCH_GAME_KNOWLEDGE_ROOT;
  process.env.ORCH_GAME_KNOWLEDGE_ROOT = root;
  const store = openKnowledgeStore({ knowledgeRoot: root });
  const indexDb = openKnowledgeIndexDb({ knowledgeRoot: root });
  try {
    store.db.query(`INSERT INTO entity (id, kind, locator, identity_status)
      VALUES ('unit-1', 'translation_unit', 'src/MActor.cpp', 'active')`).run();
    store.db.query(`INSERT INTO target
      (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
      VALUES ('target-1', 'function', 'GMSJ01:MActor', 'unit-1', 'calc', 'GMSJ01:MActor:calc', '0x80000000', 'current', 'rev')`).run();
    store.db.query(`INSERT INTO pull_request (id, target_id, pr_ref, summary, outcome, merged_at)
      VALUES ('pr-1', 'target-1', 'doldecomp/sms#212', 'MActor calc matched. Added char trash[0x18] to fix the stack frame.', 'match', '2026-09-01')`).run();
    store.db.query(`INSERT INTO worker_run
      (id, target_id, goal, baseline, final_outcome, integration, started_at, ended_at, closed_at)
      VALUES ('run-1', 'target-1', 'Match calc', '{"score":90}', 'improvement', NULL,
        '2026-09-02T00:00:00Z', '2026-09-02T01:00:00Z', '2026-09-02T01:00:00Z')`).run();
    store.db.query(`INSERT INTO submission (id, worker_run_id, seq, description, hypothesis, score, submitted_at, runtime_ref)
      VALUES ('sub-1', 'run-1', 1, 'MActor calc pass', 'Swap the declaration order to fix the frame.', 95, '2026-09-02T00:10:00Z', NULL)`).run();
    store.db.query(`INSERT INTO target
      (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
      VALUES ('target-2', 'function', 'GMSJ01:MActor', 'unit-1', 'load', 'GMSJ01:MActor:load', '0x80000100', 'current', 'rev')`).run();
    store.db.query(`INSERT INTO worker_run
      (id, target_id, goal, baseline, final_outcome, integration, started_at, ended_at, closed_at)
      VALUES ('run-2', 'target-2', 'Match load', '{"score":90}', 'improvement', NULL,
        '2026-09-03T00:00:00Z', '2026-09-03T01:00:00Z', '2026-09-03T01:00:00Z')`).run();
    store.db.query(`INSERT INTO submission (id, worker_run_id, seq, description, hypothesis, score, submitted_at, runtime_ref)
      VALUES ('sub-2', 'run-2', 1, 'MActor load pass', 'Using s32 instead of int got the match.', 97, '2026-09-03T00:10:00Z', NULL)`).run();
    buildAllFts(store, indexDb, { prArchive: createEmptyPrArchive() });
  } finally {
    indexDb.close();
    store.close();
  }
});

afterAll(() => {
  if (previousRoot === undefined) delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;
  else process.env.ORCH_GAME_KNOWLEDGE_ROOT = previousRoot;
  rmSync(root, { recursive: true, force: true });
});

async function run(registration: AgentToolRegistration, gameId: string, params: Record<string, unknown>) {
  const tool = registration.create({ role: "worker", cwd: root, repoRoot: root, game: { gameId } });
  const result = await tool.execute("call-1", params as never, undefined as never, undefined as never, undefined as never);
  return JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown> & { results: Array<Record<string, unknown>> };
}

describe("knowledge-v2 tools under a stop_at_frame game", () => {
  test("pr_search redacts banned tactics for SMS and leaves Melee verbatim", async () => {
    const sms = await run(kv2PrSearchToolRegistration, "sms", { query: "MActor" });
    expect(sms.stack_policy_note).toContain("banned");
    expect(sms.results[0]!.summary_snippet).toBe(`MActor calc matched. ${STACK_POLICY_REDACTION}`);
    expect(sms.results[0]!.locator).toBe("pr://pr-1");

    const melee = await run(kv2PrSearchToolRegistration, "melee", { query: "MActor" });
    expect(melee.stack_policy_note).toBeUndefined();
    expect(melee.results[0]!.summary_snippet).toContain("char trash[0x18]");
  });

  test("attempt_search redacts frame-only reorder hypotheses for SMS only", async () => {
    const sms = await run(kv2AttemptSearchToolRegistration, "sms", { target_stable_key: "GMSJ01:MActor:calc" });
    expect(sms.results[0]!.hypothesis_snippet).toBe(STACK_POLICY_REDACTION);
    expect(sms.stack_policy_redactions).toBe(1);

    const melee = await run(kv2AttemptSearchToolRegistration, "melee", { target_stable_key: "GMSJ01:MActor:calc" });
    expect(melee.results[0]!.hypothesis_snippet).toBe("Swap the declaration order to fix the frame.");
  });
});

describe("knowledge-v2 tools under the steering gate", () => {
  test("attempt_search labels steering hypotheses for SMS only", async () => {
    const sms = await run(kv2AttemptSearchToolRegistration, "sms", { target_stable_key: "GMSJ01:MActor:load" });
    if (steeringGateForGame("sms") !== "off") {
      expect(sms.results[0]!.hypothesis_snippet).toBe(`Using s32 instead of int got the match. ${STEERING_PROBE_LABEL}`);
      expect(sms.steering_policy_relabels).toBe(1);
    }
    const melee = await run(kv2AttemptSearchToolRegistration, "melee", { target_stable_key: "GMSJ01:MActor:load" });
    expect(melee.results[0]!.hypothesis_snippet).toBe("Using s32 instead of int got the match.");
    expect(melee.steering_policy_note).toBeUndefined();
  });

  test("the attempt FTS index labels steering text for a gated game and indexes Melee verbatim", () => {
    const store = openKnowledgeStore({ knowledgeRoot: root });
    const indexDb = openKnowledgeIndexDb({ knowledgeRoot: root });
    const hypotheses = () => indexDb.db.query<{ hypotheses: string }, []>("SELECT hypotheses FROM attempt_fts WHERE id = 'attempt://run/run-2'").get()!.hypotheses;
    try {
      buildAttemptFts(store, indexDb, { gameId: "melee" });
      expect(hypotheses()).not.toContain(STEERING_PROBE_LABEL);
      buildAttemptFts(store, indexDb, { gameId: "sms" });
      if (steeringGateForGame("sms") !== "off") expect(hypotheses()).toContain(`got the match. ${STEERING_PROBE_LABEL}`);
    } finally {
      buildAllFts(store, indexDb, { prArchive: createEmptyPrArchive() });
      indexDb.close();
      store.close();
    }
  });
});
