import {
  knowledgeRecord,
  type KnowledgeFact,
  type KnowledgeLink,
  type SubjectIdentity,
} from "@server/core/knowledge-v2/views/knowledge-record";
import { targetLedger } from "@server/core/knowledge-v2/views/target-ledger";
import {
  openKnowledgeStore,
  type KnowledgeStore,
} from "@server/core/knowledge-v2/storage/store";

type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface KnowledgeV2ApiRouteDeps {
  json: JsonResponder;
  openStore?: (gameId: string) => KnowledgeStore;
}

interface CountRow {
  value: string;
  count: number;
}

interface TreeNode {
  name: string;
  path: string;
  kind: "dir" | "unit";
  target_count: number;
  fact_count: number;
  children?: TreeNode[];
}

const ENTITY_KINDS = new Set([
  "game_concept",
  "pattern",
  "translation_unit",
  "struct",
  "struct_field",
  "parameter",
]);

function badRequest(json: JsonResponder): Response {
  return json({ error: "bad_request" }, { status: 400 });
}

function countMap(rows: CountRow[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.value, row.count]));
}

function parseLimit(value: string | null, defaultValue: number, maximum: number): number | null {
  if (value === null) return defaultValue;
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

function snakeFact(fact: KnowledgeFact) {
  return {
    id: fact.id,
    value: fact.value,
    rationale: fact.rationale,
    confidence: fact.confidence,
    updated_at: fact.updatedAt,
    evidence: fact.evidence.map((item) => ({
      id: item.id,
      kind: item.kind,
      locator: item.locator,
      digest: item.digest,
      why: item.why,
      captured_at: item.capturedAt,
    })),
  };
}

function snakeLink(link: KnowledgeLink) {
  return {
    id: link.id,
    direction: link.direction,
    role: link.role,
    why: link.why,
    kind: link.kind,
    locator: link.locator,
    other: link.other,
  };
}

function summary(store: KnowledgeStore) {
  const scalar = (sql: string) => store.db.query<{ count: number }, []>(sql).get()?.count ?? 0;
  const grouped = (sql: string) => countMap(store.db.query<CountRow, []>(sql).all());
  const confidence = store.db.query<{
    mean: number | null;
    below_0_7: number;
    below_0_9: number;
  }, []>(`
    SELECT AVG(confidence) AS mean,
      SUM(CASE WHEN confidence < 0.7 THEN 1 ELSE 0 END) AS below_0_7,
      SUM(CASE WHEN confidence < 0.9 THEN 1 ELSE 0 END) AS below_0_9
    FROM fact
  `).get();

  return {
    targets: {
      total: scalar("SELECT COUNT(*) AS count FROM target"),
      stamped: scalar("SELECT COUNT(*) AS count FROM subject_index_state WHERE target_id IS NOT NULL"),
      with_facts: scalar("SELECT COUNT(DISTINCT target_id) AS count FROM fact WHERE target_id IS NOT NULL"),
    },
    entities: {
      total: scalar("SELECT COUNT(*) AS count FROM entity"),
      by_kind: grouped("SELECT kind AS value, COUNT(*) AS count FROM entity GROUP BY kind ORDER BY kind"),
      stamped: scalar("SELECT COUNT(*) AS count FROM subject_index_state WHERE entity_id IS NOT NULL"),
    },
    facts: {
      total: scalar("SELECT COUNT(*) AS count FROM fact"),
      by_type: grouped("SELECT type AS value, COUNT(*) AS count FROM fact GROUP BY type ORDER BY type"),
      confidence: {
        mean: confidence?.mean ?? 0,
        below_0_7: confidence?.below_0_7 ?? 0,
        below_0_9: confidence?.below_0_9 ?? 0,
      },
    },
    evidence: {
      total: scalar("SELECT COUNT(*) AS count FROM evidence"),
      by_kind: grouped("SELECT kind AS value, COUNT(*) AS count FROM evidence GROUP BY kind ORDER BY kind"),
    },
    links: {
      total: scalar("SELECT COUNT(*) AS count FROM link"),
      by_role: grouped("SELECT role AS value, COUNT(*) AS count FROM link GROUP BY role ORDER BY role"),
    },
    drift: {
      warned_tasks: scalar(`SELECT COUNT(*) AS count FROM index_task
        WHERE json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END, '$.drift_gate') = 'warned'
          AND done_at IS NOT NULL`),
      released_pending: scalar(`SELECT COUNT(*) AS count FROM index_task
        WHERE json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END, '$.drift_attempts') = 1
          AND done_at IS NULL`),
    },
  };
}

function driftWarnings(store: KnowledgeStore, url: URL, json: JsonResponder): Response {
  const limit = parseLimit(url.searchParams.get("limit"), 50, 100);
  if (limit === null) return badRequest(json);
  const rows = store.db.query<any, [number]>(`
    SELECT task.id AS task_id, task.pathway, task.done_at,
      target.id AS target_id, target.kind AS target_kind, target.stable_key,
      target.unit, target.symbol, target.address, target.identity_status AS target_identity_status,
      entity.id AS entity_id, entity.kind AS entity_kind, entity.locator,
      entity.identity_status AS entity_identity_status
    FROM index_task task
    LEFT JOIN target ON target.id = COALESCE(
      json_extract(CASE WHEN json_valid(task.payload) THEN task.payload ELSE '{}' END, '$.target_id'),
      json_extract(CASE WHEN json_valid(task.payload) THEN task.payload ELSE '{}' END, '$.task_payload.target_id')
    )
    LEFT JOIN entity ON entity.id = COALESCE(
      json_extract(CASE WHEN json_valid(task.payload) THEN task.payload ELSE '{}' END, '$.entity_id'),
      json_extract(CASE WHEN json_valid(task.payload) THEN task.payload ELSE '{}' END, '$.task_payload.entity_id')
    )
    WHERE json_extract(CASE WHEN json_valid(task.payload) THEN task.payload ELSE '{}' END, '$.drift_gate') = 'warned'
      AND task.done_at IS NOT NULL
      AND (target.id IS NOT NULL OR entity.id IS NOT NULL)
    ORDER BY task.done_at DESC, task.id
    LIMIT ?
  `).all(limit);
  return json({
    warnings: rows.map((row) => ({
      task_id: row.task_id,
      pathway: row.pathway,
      done_at: row.done_at,
      subject: row.target_id !== null
        ? {
            subjectKind: "target", id: row.target_id, kind: row.target_kind,
            stableKey: row.stable_key, unit: row.unit, symbol: row.symbol,
            address: row.address, identityStatus: row.target_identity_status,
          }
        : {
            subjectKind: "entity", id: row.entity_id, kind: row.entity_kind,
            locator: row.locator, identityStatus: row.entity_identity_status,
          },
    })),
  });
}

function tree(store: KnowledgeStore): { root: TreeNode } {
  const targetRows = store.db.query<{ unit: string; count: number }, []>(`
    SELECT unit, COUNT(*) AS count FROM target GROUP BY unit ORDER BY unit
  `).all();
  const factRows = store.db.query<{ unit: string; count: number }, []>(`
    SELECT t.unit, COUNT(f.id) AS count
    FROM target t LEFT JOIN fact f ON f.target_id = t.id
    GROUP BY t.unit ORDER BY t.unit
  `).all();
  const factsByUnit = new Map(factRows.map((row) => [row.unit, row.count]));
  const root: TreeNode = { name: "", path: "", kind: "dir", target_count: 0, fact_count: 0, children: [] };

  for (const row of targetRows) {
    const parts = row.unit.split("/").filter(Boolean);
    let parent = root;
    parent.target_count += row.count;
    parent.fact_count += factsByUnit.get(row.unit) ?? 0;
    for (let index = 0; index < parts.length; index += 1) {
      const path = parts.slice(0, index + 1).join("/");
      const isUnit = index === parts.length - 1;
      let child = parent.children?.find((candidate) => candidate.name === parts[index]);
      if (!child) {
        child = {
          name: parts[index]!, path, kind: isUnit ? "unit" : "dir",
          target_count: 0, fact_count: 0,
          ...(isUnit ? {} : { children: [] }),
        };
        parent.children!.push(child);
      }
      child.target_count += row.count;
      child.fact_count += factsByUnit.get(row.unit) ?? 0;
      parent = child;
    }
  }

  const sort = (node: TreeNode): void => {
    node.children?.sort((left, right) =>
      (left.kind === right.kind ? left.name.localeCompare(right.name) : left.kind === "dir" ? -1 : 1));
    node.children?.forEach(sort);
  };
  sort(root);
  return { root };
}

function unitTargets(store: KnowledgeStore, unit: string) {
  const unitEntity = store.db.query<{ id: string; locator: string; fact_count: number }, [string]>(`
    SELECT e.id, e.locator, COUNT(f.id) AS fact_count
    FROM target t JOIN entity e ON e.id = t.unit_entity_id
    LEFT JOIN fact f ON f.entity_id = e.id
    WHERE t.unit = ?
    GROUP BY e.id, e.locator LIMIT 1
  `).get(unit) ?? null;
  const rows = store.db.query<any, [string]>(`
    SELECT t.id AS target_id, t.stable_key, t.kind, t.symbol, t.address,
      s.match_pct, COALESCE(s.linked, 0) AS linked,
      COUNT(f.id) AS fact_count,
      GROUP_CONCAT(f.type, ',') AS fact_types,
      MAX(CASE WHEN f.type = 'inferred_name' THEN 1 ELSE 0 END) AS has_inferred_name,
      i.indexed_at
    FROM target t
    LEFT JOIN target_status s ON s.target_id = t.id
    LEFT JOIN fact f ON f.target_id = t.id
    LEFT JOIN subject_index_state i ON i.target_id = t.id
    WHERE t.unit = ?
    GROUP BY t.id
    ORDER BY t.address, t.symbol
  `).all(unit).map((row) => ({
    ...row,
    linked: Boolean(row.linked),
    fact_types: row.fact_types ? String(row.fact_types).split(",").sort() : [],
    has_inferred_name: Boolean(row.has_inferred_name),
  }));
  return { unit, unit_entity: unitEntity, targets: rows };
}

function record(store: KnowledgeStore, url: URL, json: JsonResponder): Response {
  const stableKey = url.searchParams.get("target_stable_key");
  const locator = url.searchParams.get("entity_locator");
  if ((stableKey === null) === (locator === null) || stableKey === "" || locator === "") return badRequest(json);

  const ref = stableKey !== null
    ? store.db.query<{ id: string }, [string]>("SELECT id FROM target WHERE stable_key = ?").get(stableKey)
    : store.db.query<{ id: string }, [string]>("SELECT id FROM entity WHERE locator = ?").get(locator!);
  if (!ref) return json({ error: "not_found" }, { status: 404 });

  const subjectRef = stableKey !== null ? { targetId: ref.id } : { entityId: ref.id };
  const result = knowledgeRecord(store, subjectRef);
  const facts = Object.fromEntries(Object.entries(result.facts).map(([type, fact]) => [type, snakeFact(fact!)]));
  const indexState = stableKey !== null
    ? store.db.query<{ indexed_at: string }, [string]>("SELECT indexed_at FROM subject_index_state WHERE target_id = ?").get(ref.id)
    : store.db.query<{ indexed_at: string }, [string]>("SELECT indexed_at FROM subject_index_state WHERE entity_id = ?").get(ref.id);
  const status = stableKey !== null
    ? store.db.query<any, [string]>("SELECT * FROM target_status WHERE target_id = ?").get(ref.id) ?? null
    : null;
  if (status) status.linked = Boolean(status.linked);
  const entries = stableKey !== null ? targetLedger(store, ref.id) : [];
  return json({
    subject: result.subject,
    facts,
    links: result.links.map(snakeLink),
    ledger: { entries: entries.slice(0, 25), total_count: entries.length },
    target_status: status,
    indexed_at: indexState?.indexed_at ?? null,
  });
}

function entities(store: KnowledgeStore, url: URL, json: JsonResponder): Response {
  const kind = url.searchParams.get("kind");
  const query = url.searchParams.get("q");
  const limit = parseLimit(url.searchParams.get("limit"), 100, 500);
  if ((kind !== null && !ENTITY_KINDS.has(kind)) || limit === null) return badRequest(json);
  const rows = store.db.query<any, [string | null, string | null, string, number]>(`
    SELECT e.id, e.kind, e.locator, e.identity_status,
      (SELECT COUNT(*) FROM fact f WHERE f.entity_id = e.id) AS fact_count,
      (SELECT COUNT(*) FROM link l WHERE l.from_entity_id = e.id) +
        (SELECT COUNT(*) FROM link l WHERE l.to_entity_id = e.id) AS link_count
    FROM entity e
    WHERE (? IS NULL OR e.kind = ?) AND instr(lower(e.locator), lower(?)) > 0
    ORDER BY link_count DESC, e.locator
    LIMIT ?
  `).all(kind, kind, query ?? "", limit);
  return json({ entities: rows });
}

function search(store: KnowledgeStore, url: URL, json: JsonResponder): Response {
  const query = url.searchParams.get("q")?.trim();
  const limit = parseLimit(url.searchParams.get("limit"), 50, 100);
  if (!query || limit === null) return badRequest(json);
  const rows = store.db.query<any, [string, string, string, string, string, number]>(`
    SELECT * FROM (
      SELECT CASE WHEN f.target_id IS NOT NULL THEN 'target' ELSE 'entity' END AS subject_kind,
        COALESCE(t.id, e.id) AS id, COALESCE(t.kind, e.kind) AS kind,
        t.stable_key, t.unit, t.symbol, t.address, t.identity_status AS target_identity_status,
        e.locator, e.identity_status AS entity_identity_status,
        f.type AS fact_type,
        CASE WHEN instr(lower(f.value), lower(?)) > 0 THEN f.value ELSE f.rationale END AS snippet,
        0 AS source_order
      FROM fact f LEFT JOIN target t ON t.id = f.target_id LEFT JOIN entity e ON e.id = f.entity_id
      WHERE instr(lower(f.value), lower(?)) > 0 OR instr(lower(f.rationale), lower(?)) > 0
      UNION ALL
      SELECT 'target', id, kind, stable_key, unit, symbol, address, identity_status,
        NULL, NULL, NULL, stable_key, 1 FROM target WHERE instr(lower(stable_key), lower(?)) > 0
      UNION ALL
      SELECT 'entity', id, kind, NULL, NULL, NULL, NULL, NULL,
        locator, identity_status, NULL, locator, 2 FROM entity WHERE instr(lower(locator), lower(?)) > 0
    ) ORDER BY source_order, id, fact_type LIMIT ?
  `).all(query, query, query, query, query, limit);
  const hits = rows.map((row) => {
    const subject: SubjectIdentity = row.subject_kind === "target"
      ? { subjectKind: "target", id: row.id, kind: row.kind, stableKey: row.stable_key, unit: row.unit,
        symbol: row.symbol, address: row.address, identityStatus: row.target_identity_status }
      : { subjectKind: "entity", id: row.id, kind: row.kind, locator: row.locator,
        identityStatus: row.entity_identity_status };
    return { subject, ...(row.fact_type === null ? {} : { fact_type: row.fact_type }), snippet: row.snippet };
  });
  return json({ hits });
}

export async function handleKnowledgeV2ApiRoute(
  req: Request,
  url: URL,
  deps: KnowledgeV2ApiRouteDeps,
): Promise<Response | null> {
  const prefix = "/api/knowledge/v2";
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return null;
  if (req.method !== "GET") return deps.json({ error: "method_not_allowed" }, { status: 405 });
  const gameId = url.searchParams.get("game") ?? "melee";
  if (!gameId.trim()) return badRequest(deps.json);

  let route: "summary" | "drift-warnings" | "tree" | "unit" | "record" | "entities" | "search" | null = null;
  let unit = "";
  if (url.pathname === `${prefix}/summary`) route = "summary";
  else if (url.pathname === `${prefix}/drift-warnings`) route = "drift-warnings";
  else if (url.pathname === `${prefix}/tree`) route = "tree";
  else if (url.pathname.startsWith(`${prefix}/units/`) && url.pathname.endsWith("/targets")) {
    route = "unit";
    try {
      unit = decodeURIComponent(url.pathname.slice(`${prefix}/units/`.length, -"/targets".length));
    } catch {
      return badRequest(deps.json);
    }
    if (!unit) return badRequest(deps.json);
  } else if (url.pathname === `${prefix}/record`) route = "record";
  else if (url.pathname === `${prefix}/entities`) route = "entities";
  else if (url.pathname === `${prefix}/search`) route = "search";
  else return null;

  const store = deps.openStore?.(gameId) ?? openKnowledgeStore({ gameId });
  try {
    if (route === "summary") return deps.json(summary(store));
    if (route === "drift-warnings") return driftWarnings(store, url, deps.json);
    if (route === "tree") return deps.json(tree(store));
    if (route === "unit") return deps.json(unitTargets(store, unit));
    if (route === "record") return record(store, url, deps.json);
    if (route === "entities") return entities(store, url, deps.json);
    return search(store, url, deps.json);
  } finally {
    store.close();
  }
}
