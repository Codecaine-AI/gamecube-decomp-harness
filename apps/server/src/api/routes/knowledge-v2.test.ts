import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openKnowledgeStore, type KnowledgeStore } from "@server/core/knowledge-v2/storage/store";
import {
  handleKnowledgeV2ApiRoute,
  type KnowledgeV2ApiRouteDeps,
} from "./knowledge-v2.js";

const UNIT_JUMP = "main/melee/ft/chara/ftCommon/ftCo_CliffJump";
const UNIT_CATCH = "main/melee/ft/chara/ftCommon/ftCo_CliffCatch";
const UNIT_MARIO = "main/melee/ft/chara/Mario";

const roots: string[] = [];

interface Fixture {
  knowledgeRoot: string;
  request(path: string, init?: RequestInit): Promise<Response | null>;
  openedGames: string[];
  openCount(): number;
  closeCount(): number;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(name: string): Fixture {
  const root = mkdtempSync(join(tmpdir(), `knowledge-v2-route-${name}-`));
  const knowledgeRoot = join(root, "knowledge");
  roots.push(root);

  const store = openKnowledgeStore({ knowledgeRoot });
  seedStore(store);
  store.close();

  let opens = 0;
  let closes = 0;
  const openedGames: string[] = [];
  const deps: KnowledgeV2ApiRouteDeps = {
    json: (data, init) => Response.json(data, init),
    openStore: (gameId) => {
      opens += 1;
      openedGames.push(gameId);
      const requestStore = openKnowledgeStore({ knowledgeRoot });
      const close = requestStore.close.bind(requestStore);
      requestStore.close = () => {
        closes += 1;
        close();
      };
      return requestStore;
    },
  };

  return {
    knowledgeRoot,
    openedGames,
    openCount: () => opens,
    closeCount: () => closes,
    async request(path, init) {
      const url = new URL(path, "http://localhost");
      const response = await handleKnowledgeV2ApiRoute(new Request(url, init), url, deps);
      expect(closes).toBe(opens);
      return response;
    },
  };
}

function seedStore(store: KnowledgeStore): void {
  const insertEntity = store.db.query(`INSERT INTO entity
    (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
    VALUES (?, ?, ?, NULL, 'active', NULL)`);
  insertEntity.run("unit-jump", "translation_unit", UNIT_JUMP);
  insertEntity.run("unit-catch", "translation_unit", UNIT_CATCH);
  insertEntity.run("unit-mario", "translation_unit", UNIT_MARIO);
  insertEntity.run("concept-shield", "game_concept", "concept://shield-needle");
  insertEntity.run("pattern-ledge", "pattern", "pattern://ledge-options");
  insertEntity.run("struct-fighter", "struct", "struct://Fighter");

  const insertTarget = store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'current', 'fixture-rev')`);
  insertTarget.run(
    "target-jump-alpha",
    "function",
    UNIT_JUMP,
    "unit-jump",
    "ftCo_CliffJump_Alpha",
    "target://alpha-needle",
    "0x80001000",
  );
  insertTarget.run(
    "target-jump-beta",
    "function",
    UNIT_JUMP,
    "unit-jump",
    "ftCo_CliffJump_Beta",
    "target://beta",
    "0x80002000",
  );
  insertTarget.run(
    "target-catch",
    "function",
    UNIT_CATCH,
    "unit-catch",
    "ftCo_CliffCatch",
    "target://catch",
    "0x80003000",
  );
  insertTarget.run(
    "target-mario-data",
    "data",
    UNIT_MARIO,
    "unit-mario",
    "lbl_MarioAttributes",
    "target://mario-data",
    "0x80400000",
  );

  const insertStatus = store.db.query(`INSERT INTO target_status
    (target_id, match_pct, linked, size, content_hash, report_revision, updated_at)
    VALUES (?, ?, ?, ?, ?, 'fixture-rev', '2026-08-30T00:00:00.000Z')`);
  insertStatus.run("target-jump-alpha", 80.5, 1, 64, "sha256:alpha");
  insertStatus.run("target-jump-beta", 91, 0, 48, "sha256:beta");
  insertStatus.run("target-catch", 100, 1, 32, "sha256:catch");
  insertStatus.run("target-mario-data", 50, 0, 16, "sha256:mario");

  const insertFact = store.db.query(`INSERT INTO fact
    (id, target_id, entity_id, type, value, rationale, confidence, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  insertFact.run(
    "fact-jump-purpose",
    "target-jump-alpha",
    null,
    "purpose",
    "Handles cliff jumping",
    "The value needle appears in this target rationale.",
    0.95,
    "2026-08-20T00:00:00.000Z",
  );
  insertFact.run(
    "fact-jump-name",
    "target-jump-alpha",
    null,
    "inferred_name",
    "CliffJumpController",
    "Symbol behavior implies this name.",
    0.65,
    "2026-08-21T00:00:00.000Z",
  );
  insertFact.run(
    "fact-beta-flow",
    "target-jump-beta",
    null,
    "data_flow",
    "Reads fighter input state",
    "The input branch supplies the transition.",
    0.85,
    "2026-08-22T00:00:00.000Z",
  );
  insertFact.run(
    "fact-catch-purpose",
    "target-catch",
    null,
    "purpose",
    "Handles cliff catches",
    "The animation state identifies the behavior.",
    0.9,
    "2026-08-23T00:00:00.000Z",
  );
  insertFact.run(
    "fact-shield-mapping",
    null,
    "concept-shield",
    "game_mapping",
    "Maps shield stun",
    "The entity rationale needle identifies the game concept.",
    0.6,
    "2026-08-24T00:00:00.000Z",
  );
  insertFact.run(
    "fact-pattern-purpose",
    null,
    "pattern-ledge",
    "purpose",
    "Describes ledge option dispatch",
    "Several functions share this branch shape.",
    0.7,
    "2026-08-25T00:00:00.000Z",
  );

  const insertEvidence = store.db.query(`INSERT INTO evidence
    (id, fact_id, kind, locator, digest, why, captured_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insertEvidence.run(
    "evidence-code",
    "fact-jump-purpose",
    "code",
    "code://fixture/src/ftCo_CliffJump.c#L1-L20",
    "sha256:code",
    "The function body performs the transition.",
    "2026-08-26T00:00:00.000Z",
  );
  insertEvidence.run(
    "evidence-pr",
    "fact-jump-purpose",
    "pr",
    "pr://101",
    null,
    "The pull request explains the branch.",
    "2026-08-27T00:00:00.000Z",
  );
  insertEvidence.run(
    "evidence-discord",
    "fact-beta-flow",
    "discord",
    "discord://message/202",
    null,
    "The discussion names the input state.",
    "2026-08-28T00:00:00.000Z",
  );

  const insertLink = store.db.query(`INSERT INTO link
    (id, from_target_id, from_entity_id, to_target_id, to_entity_id, role, why, kind, locator, digest)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertLink.run(
    "link-jump-shield",
    "target-jump-alpha",
    null,
    null,
    "concept-shield",
    "implements",
    "The target implements this mechanic.",
    "code",
    "code://fixture/src/ftCo_CliffJump.c#L1-L20",
    "sha256:link",
  );
  insertLink.run(
    "link-shield-pattern",
    null,
    "concept-shield",
    null,
    "pattern-ledge",
    "instance_of",
    "Shield handling follows the ledge pattern.",
    "wiki",
    "wiki://shield/ledge",
    null,
  );
  insertLink.run(
    "link-catch-shield",
    "target-catch",
    null,
    null,
    "concept-shield",
    "references",
    "The catch state references shield timing.",
    "pr",
    "pr://102",
    null,
  );

  store.db.query(`INSERT INTO subject_index_state (target_id, entity_id, indexed_at)
    VALUES ('target-jump-alpha', NULL, '2026-08-31T01:00:00.000Z')`).run();
  store.db.query(`INSERT INTO subject_index_state (target_id, entity_id, indexed_at)
    VALUES ('target-catch', NULL, '2026-08-31T02:00:00.000Z')`).run();
  store.db.query(`INSERT INTO subject_index_state (target_id, entity_id, indexed_at)
    VALUES (NULL, 'concept-shield', '2026-08-31T03:00:00.000Z')`).run();

  const insertEvent = store.db.query(`INSERT INTO event
    (id, target_id, kind, cause, summary, created_at)
    VALUES (?, 'target-jump-alpha', 'note', NULL, ?, ?)`);
  for (let index = 1; index <= 26; index += 1) {
    const day = String(index).padStart(2, "0");
    insertEvent.run(`event-${day}`, `Ledger note ${day}`, `2026-07-${day}T00:00:00.000Z`);
  }
}

describe("knowledge-v2 summary and tree", () => {
  test("returns every summary aggregate and honors the game query", async () => {
    const f = fixture("summary");
    const store = openKnowledgeStore({ knowledgeRoot: f.knowledgeRoot });
    store.db.query(`INSERT INTO index_task
      (id, pathway, payload, enqueued_at, started_at, done_at)
      VALUES (?, 'run_closed', ?, ?, ?, ?)`)
      .run("warned-task", JSON.stringify({ task_payload: { target_id: "target-jump-alpha" }, drift_attempts: 2, drift_gate: "warned" }),
        "2026-08-31T00:00:00.000Z", "2026-08-31T00:01:00.000Z", "2026-08-31T00:02:00.000Z");
    store.db.query(`INSERT INTO index_task
      (id, pathway, payload, enqueued_at, started_at, done_at)
      VALUES (?, 'run_closed', ?, ?, ?, NULL)`)
      .run("released-task", JSON.stringify({ task_payload: { entity_id: "concept-shield" }, drift_attempts: 1 }),
        "2026-08-31T00:03:00.000Z", null);
    store.close();

    const response = await f.request("/api/knowledge/v2/summary?game=fixture-game");

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      targets: { total: 4, stamped: 2, with_facts: 3 },
      entities: {
        total: 6,
        by_kind: { game_concept: 1, pattern: 1, struct: 1, translation_unit: 3 },
        stamped: 1,
      },
      facts: {
        total: 6,
        by_type: { data_flow: 1, game_mapping: 1, inferred_name: 1, purpose: 3 },
        confidence: { mean: 0.775, below_0_7: 2, below_0_9: 4 },
      },
      evidence: { total: 3, by_kind: { code: 1, discord: 1, pr: 1 } },
      links: { total: 3, by_role: { implements: 1, instance_of: 1, references: 1 } },
      drift: { warned_tasks: 1, released_pending: 1 },
    });
    expect(f.openedGames).toEqual(["fixture-game"]);
    expect(f.openCount()).toBe(1);
    expect(f.closeCount()).toBe(1);
  });

  test("returns warned tasks with resolvable target and entity subjects", async () => {
    const f = fixture("drift-warnings");
    const store = openKnowledgeStore({ knowledgeRoot: f.knowledgeRoot });
    const insert = store.db.query(`INSERT INTO index_task
      (id, pathway, payload, enqueued_at, started_at, done_at)
      VALUES (?, 'run_closed', ?, '2026-08-31T00:00:00.000Z', '2026-08-31T00:01:00.000Z', ?)`);
    insert.run("warned-target", JSON.stringify({ task_payload: { target_id: "target-jump-alpha" }, drift_attempts: 2, drift_gate: "warned" }), "2026-08-31T00:03:00.000Z");
    insert.run("warned-entity", JSON.stringify({ task_payload: { entity_id: "concept-shield" }, drift_attempts: 2, drift_gate: "warned" }), "2026-08-31T00:02:00.000Z");
    insert.run("clean-target", JSON.stringify({ task_payload: { target_id: "target-catch" }, drift_gate: "clean" }), "2026-08-31T00:04:00.000Z");
    store.close();

    const response = await f.request("/api/knowledge/v2/drift-warnings?limit=2");

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      warnings: [
        {
          task_id: "warned-target",
          pathway: "run_closed",
          done_at: "2026-08-31T00:03:00.000Z",
          subject: {
            subjectKind: "target",
            id: "target-jump-alpha",
            kind: "function",
            stableKey: "target://alpha-needle",
            unit: UNIT_JUMP,
            symbol: "ftCo_CliffJump_Alpha",
            address: "0x80001000",
            identityStatus: "current",
          },
        },
        {
          task_id: "warned-entity",
          pathway: "run_closed",
          done_at: "2026-08-31T00:02:00.000Z",
          subject: {
            subjectKind: "entity",
            id: "concept-shield",
            kind: "game_concept",
            locator: "concept://shield-needle",
            identityStatus: "active",
          },
        },
      ],
    });
  });

  test("folds units into a counted tree and sorts directories before unit leaves", async () => {
    const f = fixture("tree");

    const response = await f.request("/api/knowledge/v2/tree");

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      root: {
        name: "",
        path: "",
        kind: "dir",
        target_count: 4,
        fact_count: 4,
        children: [{
          name: "main",
          path: "main",
          kind: "dir",
          target_count: 4,
          fact_count: 4,
          children: [{
            name: "melee",
            path: "main/melee",
            kind: "dir",
            target_count: 4,
            fact_count: 4,
            children: [{
              name: "ft",
              path: "main/melee/ft",
              kind: "dir",
              target_count: 4,
              fact_count: 4,
              children: [{
                name: "chara",
                path: "main/melee/ft/chara",
                kind: "dir",
                target_count: 4,
                fact_count: 4,
                children: [{
                  name: "ftCommon",
                  path: "main/melee/ft/chara/ftCommon",
                  kind: "dir",
                  target_count: 3,
                  fact_count: 4,
                  children: [
                    {
                      name: "ftCo_CliffCatch",
                      path: UNIT_CATCH,
                      kind: "unit",
                      target_count: 1,
                      fact_count: 1,
                    },
                    {
                      name: "ftCo_CliffJump",
                      path: UNIT_JUMP,
                      kind: "unit",
                      target_count: 2,
                      fact_count: 3,
                    },
                  ],
                }, {
                  name: "Mario",
                  path: UNIT_MARIO,
                  kind: "unit",
                  target_count: 1,
                  fact_count: 0,
                }],
              }],
            }],
          }],
        }],
      },
    });
    expect(f.openedGames).toEqual(["melee"]);
  });
});

describe("knowledge-v2 unit targets", () => {
  test("returns the unit entity and ordered target details", async () => {
    const f = fixture("unit-targets");

    const response = await f.request(`/api/knowledge/v2/units/${encodeURIComponent(UNIT_JUMP)}/targets`);

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      unit: UNIT_JUMP,
      unit_entity: { id: "unit-jump", locator: UNIT_JUMP, fact_count: 0 },
      targets: [{
        target_id: "target-jump-alpha",
        stable_key: "target://alpha-needle",
        kind: "function",
        symbol: "ftCo_CliffJump_Alpha",
        address: "0x80001000",
        match_pct: 80.5,
        linked: true,
        fact_count: 2,
        fact_types: ["inferred_name", "purpose"],
        has_inferred_name: true,
        indexed_at: "2026-08-31T01:00:00.000Z",
      }, {
        target_id: "target-jump-beta",
        stable_key: "target://beta",
        kind: "function",
        symbol: "ftCo_CliffJump_Beta",
        address: "0x80002000",
        match_pct: 91,
        linked: false,
        fact_count: 1,
        fact_types: ["data_flow"],
        has_inferred_name: false,
        indexed_at: null,
      }],
    });
  });
});

describe("knowledge-v2 records", () => {
  test("returns a target record with facts, links, status, indexing, and the first 25 ledger entries", async () => {
    const f = fixture("target-record");

    const response = await f.request(
      "/api/knowledge/v2/record?target_stable_key=target%3A%2F%2Falpha-needle",
    );

    expect(response?.status).toBe(200);
    const body = await response?.json() as any;
    expect(body.subject).toEqual({
      subjectKind: "target",
      id: "target-jump-alpha",
      kind: "function",
      stableKey: "target://alpha-needle",
      unit: UNIT_JUMP,
      symbol: "ftCo_CliffJump_Alpha",
      address: "0x80001000",
      identityStatus: "current",
    });
    expect(body.facts).toEqual({
      inferred_name: {
        id: "fact-jump-name",
        value: "CliffJumpController",
        rationale: "Symbol behavior implies this name.",
        confidence: 0.65,
        updated_at: "2026-08-21T00:00:00.000Z",
        evidence: [],
      },
      purpose: {
        id: "fact-jump-purpose",
        value: "Handles cliff jumping",
        rationale: "The value needle appears in this target rationale.",
        confidence: 0.95,
        updated_at: "2026-08-20T00:00:00.000Z",
        evidence: [{
          id: "evidence-code",
          kind: "code",
          locator: "code://fixture/src/ftCo_CliffJump.c#L1-L20",
          digest: "sha256:code",
          why: "The function body performs the transition.",
          captured_at: "2026-08-26T00:00:00.000Z",
        }, {
          id: "evidence-pr",
          kind: "pr",
          locator: "pr://101",
          digest: null,
          why: "The pull request explains the branch.",
          captured_at: "2026-08-27T00:00:00.000Z",
        }],
      },
    });
    expect(body.links).toEqual([{
      id: "link-jump-shield",
      direction: "outgoing",
      role: "implements",
      why: "The target implements this mechanic.",
      kind: "code",
      locator: "code://fixture/src/ftCo_CliffJump.c#L1-L20",
      other: {
        subjectKind: "entity",
        id: "concept-shield",
        kind: "game_concept",
        locator: "concept://shield-needle",
        identityStatus: "active",
      },
    }]);
    expect(body.target_status).toEqual({
      target_id: "target-jump-alpha",
      match_pct: 80.5,
      linked: true,
      size: 64,
      content_hash: "sha256:alpha",
      report_revision: "fixture-rev",
      updated_at: "2026-08-30T00:00:00.000Z",
    });
    expect(body.indexed_at).toBe("2026-08-31T01:00:00.000Z");
    expect(body.ledger.total_count).toBe(26);
    expect(body.ledger.entries).toHaveLength(25);
    expect(body.ledger.entries[0]).toMatchObject({ id: "event-26", type: "event" });
    expect(body.ledger.entries[24]).toMatchObject({ id: "event-02", type: "event" });
  });

  test("returns an entity record without a target ledger or status", async () => {
    const f = fixture("entity-record");

    const response = await f.request(
      "/api/knowledge/v2/record?entity_locator=concept%3A%2F%2Fshield-needle",
    );

    expect(response?.status).toBe(200);
    const body = await response?.json() as any;
    expect(body.subject).toEqual({
      subjectKind: "entity",
      id: "concept-shield",
      kind: "game_concept",
      locator: "concept://shield-needle",
      identityStatus: "active",
    });
    expect(body.facts.game_mapping).toMatchObject({
      id: "fact-shield-mapping",
      value: "Maps shield stun",
      updated_at: "2026-08-24T00:00:00.000Z",
    });
    expect(body.links.map((link: { id: string; direction: string }) => [link.id, link.direction])).toEqual([
      ["link-catch-shield", "incoming"],
      ["link-jump-shield", "incoming"],
      ["link-shield-pattern", "outgoing"],
    ]);
    expect(body.ledger).toEqual({ entries: [], total_count: 0 });
    expect(body.target_status).toBeNull();
    expect(body.indexed_at).toBe("2026-08-31T03:00:00.000Z");
  });

  test("returns 404 JSON for an unknown subject", async () => {
    const f = fixture("missing-record");

    const response = await f.request("/api/knowledge/v2/record?target_stable_key=missing");

    expect(response?.status).toBe(404);
    expect(await response?.json()).toEqual({ error: "not_found" });
  });
});

describe("knowledge-v2 entities and search", () => {
  test("filters entities and orders them by link count then locator", async () => {
    const f = fixture("entities");

    const allResponse = await f.request("/api/knowledge/v2/entities?limit=6");
    expect(allResponse?.status).toBe(200);
    const allBody = await allResponse?.json() as any;
    expect(allBody.entities.map((entity: { id: string }) => entity.id)).toEqual([
      "concept-shield",
      "pattern-ledge",
      "unit-mario",
      "unit-catch",
      "unit-jump",
      "struct-fighter",
    ]);
    expect(allBody.entities[0]).toEqual({
      id: "concept-shield",
      kind: "game_concept",
      locator: "concept://shield-needle",
      identity_status: "active",
      fact_count: 1,
      link_count: 3,
    });

    const filteredResponse = await f.request(
      "/api/knowledge/v2/entities?kind=game_concept&q=SHIELD&limit=1",
    );
    expect(filteredResponse?.status).toBe(200);
    expect(await filteredResponse?.json()).toEqual({ entities: [allBody.entities[0]] });
  });

  test("searches facts, target stable keys, and entity locators case-insensitively", async () => {
    const f = fixture("search");

    const response = await f.request("/api/knowledge/v2/search?q=NEEDLE&limit=10");

    expect(response?.status).toBe(200);
    const body = await response?.json() as any;
    expect(body.hits).toHaveLength(4);
    expect(body.hits).toContainEqual({
      subject: expect.objectContaining({ subjectKind: "target", id: "target-jump-alpha" }),
      fact_type: "purpose",
      snippet: "The value needle appears in this target rationale.",
    });
    expect(body.hits).toContainEqual({
      subject: expect.objectContaining({ subjectKind: "entity", id: "concept-shield" }),
      fact_type: "game_mapping",
      snippet: "The entity rationale needle identifies the game concept.",
    });
    expect(body.hits).toContainEqual({
      subject: expect.objectContaining({ subjectKind: "target", id: "target-jump-alpha" }),
      snippet: "target://alpha-needle",
    });
    expect(body.hits).toContainEqual({
      subject: expect.objectContaining({ subjectKind: "entity", id: "concept-shield" }),
      snippet: "concept://shield-needle",
    });
  });
});

describe("knowledge-v2 input validation", () => {
  test.each([
    "/api/knowledge/v2/record",
    "/api/knowledge/v2/record?target_stable_key=a&entity_locator=b",
    "/api/knowledge/v2/entities?kind=unknown",
    "/api/knowledge/v2/entities?limit=501",
    "/api/knowledge/v2/entities?limit=1.5",
    "/api/knowledge/v2/search",
    "/api/knowledge/v2/search?q=needle&limit=101",
    "/api/knowledge/v2/search?q=needle&limit=0",
    "/api/knowledge/v2/summary?game=%20",
  ])("returns 400 JSON without leaking an open store for %s", async (path) => {
    const f = fixture("bad-input");

    const response = await f.request(path);

    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({ error: "bad_request" });
  });
});
