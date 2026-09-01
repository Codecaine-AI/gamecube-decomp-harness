import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { KnowledgeStoreHandle } from "../records/index.js";
import {
  advanceWatermark,
  enqueueIndexTask,
  getWatermark,
  insertWikiSections,
  type WikiSectionInput,
} from "../records/index.js";
import { immediateTransaction } from "../storage/transaction.js";
import { slugify, taskId } from "./common.js";
import type { LaneOptions, WikiImportResult } from "./types.js";

export interface WikiImportOptions extends LaneOptions {
  dataRoot: string;
}

export function importWiki(store: KnowledgeStoreHandle, options: WikiImportOptions): WikiImportResult {
  interface IndexEntry {
    title: string;
    path: string;
    revid: string | number;
    sections?: string[];
  }

  const existingWatermark = getWatermark(store, "wiki");
  const syncedAt = options.now?.() ?? new Date().toISOString();
  const indexText = readFileSync(join(options.dataRoot, "index.jsonl"), "utf8");
  const pages = indexText.split(/\r?\n/).filter((line) => line.trim() !== "").map((line) => JSON.parse(line) as IndexEntry);
  const rows: WikiSectionInput[] = [];
  const changedPageSlugs: string[] = [];
  const seenPageRevisions = new Set<string>();
  const emittedRows = new Set<string>();
  let skipped = 0;

  for (const page of pages) {
    const pageRevisionKey = JSON.stringify([page.title, String(page.revid)]);
    if (seenPageRevisions.has(pageRevisionKey)) {
      skipped += 1 + (page.sections?.length ?? 0);
      continue;
    }
    seenPageRevisions.add(pageRevisionKey);

    let text: string;
    try {
      text = readFileSync(join(options.dataRoot, "pages", basename(page.path)), "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
      skipped += 1;
      continue;
    }

    const pageSlug = slugify(page.title);
    const revision = `r${page.revid}`;
    const rawSectionNames = page.sections ?? [];
    const sectionNames = disambiguateSections(rawSectionNames);
    const contents = splitSections(text, page.sections ?? []);
    let pageChanged = false;

    for (let index = 0; index < sectionNames.length; index += 1) {
      const { section, idFragment } = sectionNames[index]!;
      const exists = store.db.query<{ present: number }, [string, string, string]>(
        "SELECT 1 AS present FROM wiki_section WHERE page = ? AND section = ? AND mirror_revision = ?",
      ).get(page.title, section, revision);
      if (exists) {
        skipped += 1;
        continue;
      }
      const emittedRowKey = JSON.stringify([page.title, section, revision]);
      if (emittedRows.has(emittedRowKey)) {
        skipped += 1;
        continue;
      }
      emittedRows.add(emittedRowKey);
      rows.push({
        id: `${pageSlug}~${idFragment}@${revision}`,
        page: page.title,
        section,
        mirrorRevision: revision,
        content: contents[index]!,
        ingestedAt: syncedAt,
      });
      pageChanged = true;
    }
    if (pageChanged) changedPageSlugs.push(pageSlug);
  }

  const watermark = rows.length > 0 ? JSON.stringify({ synced_at: syncedAt, pages: pages.length }) : existingWatermark;
  const taskPayloads: string[] = [];
  for (let index = 0; index < changedPageSlugs.length; index += 50) {
    taskPayloads.push(JSON.stringify({
      source: "wiki",
      pages: changedPageSlugs.slice(index, index + 50),
      revision_stamp: syncedAt,
    }));
  }

  if (!options.dryRun && rows.length > 0) {
    immediateTransaction(store.db, () => {
      insertWikiSections(store, rows);
      for (const payload of taskPayloads) {
        enqueueIndexTask(store, {
          id: taskId("archival_ingest", payload),
          pathway: "archival_ingest",
          payload,
          enqueuedAt: syncedAt,
        });
      }
      advanceWatermark(store, "wiki", watermark!);
    });
  }

  return {
    inserted: rows.length,
    skipped,
    tasksEnqueued: taskPayloads.length,
    pagesChanged: changedPageSlugs.length,
    watermark,
  };
}

function disambiguateSections(sections: readonly string[]): Array<{ section: string; idFragment: string }> {
  const result = [{ section: "__intro__", idFragment: "__intro__" }];
  const occurrences = new Map<string, number>();
  const claimedSections = new Set(["__intro__"]);
  const claimedIdFragments = new Set(["__intro__"]);

  for (const rawSection of sections) {
    let occurrence = (occurrences.get(rawSection) ?? 0) + 1;
    occurrences.set(rawSection, occurrence);
    let section = occurrence === 1 ? rawSection : `${rawSection} (${occurrence})`;
    let idFragment = occurrence === 1 ? slugify(rawSection) : `${slugify(rawSection)}-${occurrence}`;

    while (claimedSections.has(section) || claimedIdFragments.has(idFragment)) {
      occurrence += 1;
      section = `${rawSection} (${occurrence})`;
      idFragment = `${slugify(rawSection)}-${occurrence}`;
    }

    claimedSections.add(section);
    claimedIdFragments.add(idFragment);
    result.push({ section, idFragment });
  }

  return result;
}

function splitSections(text: string, sections: readonly string[]): string[] {
  const sectionIndexes = new Map<string, number[]>();
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index]!;
    const indexes = sectionIndexes.get(section) ?? [];
    indexes.push(index);
    sectionIndexes.set(section, indexes);
  }
  const consumed = new Map<string, number>();
  const contents = new Array<string>(sections.length + 1).fill("");
  const matches: Array<{ sectionIndex: number; start: number; contentStart: number }> = [];
  const heading = /^=+\s*(.*?)\s*=+\s*$/gm;
  for (const match of text.matchAll(heading)) {
    const rawSection = match[1]!.trim();
    const indexes = sectionIndexes.get(rawSection);
    const consumedCount = consumed.get(rawSection) ?? 0;
    const sectionIndex = indexes?.[consumedCount];
    if (sectionIndex === undefined) continue;
    consumed.set(rawSection, consumedCount + 1);
    const lineEnd = text.indexOf("\n", match.index! + match[0].length);
    matches.push({
      sectionIndex,
      start: match.index!,
      contentStart: lineEnd === -1 ? text.length : lineEnd + 1,
    });
  }

  contents[0] = text.slice(0, matches[0]?.start ?? text.length);
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index]!;
    contents[current.sectionIndex + 1] = text.slice(current.contentStart, matches[index + 1]?.start ?? text.length);
  }
  // An indexed section absent from the page intentionally keeps deterministic empty content.
  return contents;
}
