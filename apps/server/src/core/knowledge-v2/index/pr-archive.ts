import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pastPrsRoot } from "../../knowledge/paths.js";

export interface PrArchiveEntry {
  title?: string;
  body?: string;
}

export interface PrArchive {
  getPr(prRef: string): PrArchiveEntry | undefined;
  getDiscussionBodies(prRef: string): string[];
}

export function createEmptyPrArchive(): PrArchive {
  return {
    getPr() {
      return undefined;
    },
    getDiscussionBodies() {
      return [];
    },
  };
}

export function createPastPrsArchive(root = pastPrsRoot(), upstream?: string): PrArchive {
  let loaded = false;
  const entries = new Map<string, PrArchiveEntry>();
  const discussions = new Map<string, string[]>();

  function load(): void {
    if (loaded) return;
    loaded = true;
    // Initial capture has raw PRs before any librarian-authored library exists.
    try {
      const index = JSON.parse(readFileSync(resolve(root, "prs.json"), "utf8"));
      for (const row of index) {
        const number = Number(row.number);
        if (!Number.isSafeInteger(number) || number < 1) continue;
        const raw = JSON.parse(readFileSync(resolve(root, `prs/pr-${number}/raw/pr.json`), "utf8"));
        entries.set(String(number), { title: stringValue(raw.title), body: stringValue(raw.body) });
      }
    } catch {
      // Older archives can contain only the derived library and text corpus.
    }

    readJsonl(resolve(root, "library/index.jsonl"), (row) => {
      if (row.pr === undefined || row.pr === null) return;
      const key = String(row.pr);
      entries.set(key, {
        title: stringValue(row.title),
        body: firstNonEmptyString(row.summary, row.body),
      });
    });

    readJsonl(resolve(root, "aggregate/text_corpus.jsonl"), (row) => {
      if (row.pr === undefined || row.pr === null) return;
      const body = firstNonEmptyString(row.body, row.text, row.content);
      if (body === undefined) return;
      const key = String(row.pr);
      const bodies = discussions.get(key) ?? [];
      bodies.push(body);
      discussions.set(key, bodies);
    });
  }

  return {
    getPr(prRef) {
      load();
      return entries.get(keyFor(prRef));
    },
    getDiscussionBodies(prRef) {
      load();
      return [...(discussions.get(keyFor(prRef)) ?? [])];
    },
  };

  function keyFor(prRef: string): string {
    const match = /^(.*)#(\d+)$/.exec(prRef);
    if (!match) return prRef;
    if (upstream && match[1] !== upstream && !(upstream === "doldecomp/melee" && match[1] === "melee")) return prRef;
    return match[2]!;
  }
}

function readJsonl(path: string, visit: (row: Record<string, unknown>) => void): void {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        visit(value as Record<string, unknown>);
      }
    } catch {
      // Malformed archive rows do not make the archive unavailable.
    }
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}
