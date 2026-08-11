import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildLedgerSearchIndex,
  defaultLedgerPath,
  defaultLedgerSearchDbPath,
  readLearnings,
  searchLedgerIndex,
  type LearningRecord,
} from "@server/core/knowledge/ledger";

type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface KnowledgeLearningsApiRouteDeps {
  json: JsonResponder;
}

interface CachedLearnings {
  mtimeMs: number;
  records: LearningRecord[];
}

const learningsCache = new Map<string, CachedLearnings>();

function loadLearnings(ledgerPath: string): LearningRecord[] {
  const resolvedLedgerPath = resolve(ledgerPath);

  try {
    const mtimeMs = statSync(resolvedLedgerPath).mtimeMs;
    const cached = learningsCache.get(resolvedLedgerPath);
    if (cached?.mtimeMs === mtimeMs) return cached.records;

    const records = readLearnings(resolvedLedgerPath);
    learningsCache.set(resolvedLedgerPath, { mtimeMs, records });
    return records;
  } catch {
    return readLearnings(resolvedLedgerPath);
  }
}

function indexLearnings(records: LearningRecord[]): {
  latestById: Map<string, LearningRecord>;
  versionsById: Map<string, LearningRecord[]>;
} {
  const latestById = new Map<string, LearningRecord>();
  const versionsById = new Map<string, LearningRecord[]>();

  for (const record of records) {
    latestById.set(record.id, record);
    const versions = versionsById.get(record.id);
    if (versions) versions.push(record);
    else versionsById.set(record.id, [record]);
  }

  return { latestById, versionsById };
}

function substringMatches(records: LearningRecord[], query: string): LearningRecord[] {
  const normalizedQuery = query.toLowerCase();
  return records.filter((record) =>
    [record.statement, record.subject.symbol, record.subject.file, record.subject.area]
      .filter((value): value is string => typeof value === "string")
      .join("\n")
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

function countBy(records: LearningRecord[], valueFor: (record: LearningRecord) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const value = valueFor(record);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

export async function handleKnowledgeLearningsApiRoute(
  req: Request,
  url: URL,
  deps: KnowledgeLearningsApiRouteDeps,
): Promise<Response | null> {
  const collectionPath = "/api/knowledge/learnings";
  const detailPrefix = `${collectionPath}/`;
  if (url.pathname !== collectionPath && !url.pathname.startsWith(detailPrefix)) return null;
  if (req.method !== "GET") return deps.json({ error: "method not allowed" }, { status: 405 });

  const projectId = url.searchParams.get("projectId") || "melee";
  const ledgerPath = defaultLedgerPath(projectId);
  const dbPath = defaultLedgerSearchDbPath(projectId);
  const { latestById, versionsById } = indexLearnings(loadLearnings(ledgerPath));

  if (url.pathname.startsWith(detailPrefix)) {
    const id = decodeURIComponent(url.pathname.slice(detailPrefix.length));
    const versions = versionsById.get(id);
    if (!versions) return deps.json({ error: "not found" }, { status: 404 });
    return deps.json({ learning: versions[versions.length - 1], versions });
  }

  const query = url.searchParams.get("q")?.trim() ?? "";
  const subject = url.searchParams.get("subject") ?? "";
  let learnings = [...latestById.values()];

  if (query) {
    try {
      if (!existsSync(dbPath)) buildLedgerSearchIndex(dbPath, ledgerPath);
      const hits = searchLedgerIndex(dbPath, query, 2000);
      const seen = new Set<string>();
      learnings = hits.flatMap((hit) => {
        const learning = latestById.get(hit.id);
        if (!learning || seen.has(hit.id)) return [];
        seen.add(hit.id);
        return [learning];
      });
    } catch {
      learnings = substringMatches(learnings, query);
    }
  }

  if (subject) {
    learnings = learnings.filter(
      (record) => subject === record.subject.symbol || subject === record.subject.file || subject === record.subject.area,
    );
  }

  const counts = {
    by_scope: countBy(learnings, (record) => record.subject.scope),
    by_origin: countBy(learnings, (record) => record.origin),
    by_status: countBy(learnings, (record) => record.status ?? "proposed"),
  };

  const scope = url.searchParams.get("scope");
  const origin = url.searchParams.get("origin");
  const status = url.searchParams.get("status");
  if (scope) learnings = learnings.filter((record) => record.subject.scope === scope);
  if (origin) learnings = learnings.filter((record) => record.origin === origin);
  if (status) learnings = learnings.filter((record) => (record.status ?? "proposed") === status);

  const total = learnings.length;
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10) || 100;
  const limit = Math.min(1000, Math.max(1, parsedLimit));
  return deps.json({ learnings: learnings.slice(0, limit), total, counts });
}
