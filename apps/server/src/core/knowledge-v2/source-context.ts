/** Bounded file reading views shared by both librarian prompt builders. */
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { resolveKnowledgeCheckout } from "./checkout.js";
import { parseLocator } from "./locator.js";
import { formatSourceView, renderSourceView, sourceViewForText, sourceViewStartLine, SOURCE_VIEW_MAX_BYTES, type SourceName } from "./source-view.js";

export interface SourceContextFile {
  path: string;
  source: string;
  symbol?: string;
}

export interface LibrarianSourceContextOptions {
  game?: { gameId?: string };
  stateDir?: string;
  /** Explicit checkout or prefetched files also support deterministic previews and tests. */
  checkoutRoot?: string;
  sourceFiles?: readonly SourceContextFile[];
  sourceNames?: readonly SourceName[];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Use mechanical unit identities and current source spans, never prose or guessed filenames. */
export function librarianSourcePaths(subjects: unknown): Array<{ path: string; symbol?: string }> {
  const entries = Array.isArray(subjects) ? subjects.map(record) : [];
  const units = new Map<string, string>();
  const paths = new Map<string, { path: string; symbol?: string }>();
  const add = (path: unknown, symbol?: unknown) => {
    if (typeof path !== "string") return;
    path = path.replace(/^translation_unit:/, "");
    if (!/\.(?:c|h|cc|cpp|cxx|hpp|inc)$/i.test(path as string)) return;
    const key = path as string;
    if (!paths.has(key) || !paths.get(key)?.symbol) paths.set(key, {
      path: key, ...(typeof symbol === "string" ? { symbol } : {}),
    });
  };
  for (const entry of entries) {
    if (entry.entity_kind !== "translation_unit" || typeof entry.entity_locator !== "string") continue;
    const id = record(record(entry.record).subject).id;
    if (typeof id === "string") units.set(id, entry.entity_locator);
  }
  // Targets first so a large unit starts near the subject under investigation.
  for (const entry of entries) {
    if (entry.kind !== "target") continue;
    const detail = record(entry.detail);
    const symbol = detail.symbol ?? record(record(entry.record).subject).symbol;
    const locator = record(record(entry.material).source).locator;
    if (typeof locator === "string") {
      try { const parsed = parseLocator(locator); if (parsed.kind === "code") add(parsed.path, symbol); } catch { /* malformed span */ }
    }
    add(units.get(String(detail.unit_entity_id ?? "")), symbol);
    for (const link of Array.isArray(record(entry.record).links) ? record(entry.record).links as unknown[] : []) {
      const other = record(record(link).other);
      if (other.kind === "translation_unit") add(other.locator, symbol);
    }
  }
  for (const entry of entries) if (entry.entity_kind === "translation_unit") add(entry.entity_locator);
  return [...paths.values()];
}

/** Keep canonical source spans in the subject records; this separate block is a reading aid. */
export function librarianSourceContext(subjects: unknown, options: LibrarianSourceContextOptions): string {
  const files = options.sourceFiles ?? librarianSourcePaths(subjects);
  const unique = [...new Map(files.map((file) => [file.path, file])).values()];
  if (!unique.length) return "No source files identified in these subjects. Use knowledge_render_file when a source/header path is found.";
  let checkoutRoot: string | undefined;
  if (options.sourceFiles === undefined) {
    try {
      checkoutRoot = options.checkoutRoot ?? resolveKnowledgeCheckout({ gameId: options.game?.gameId ?? "melee", stateDir: options.stateDir }).checkoutRoot;
      checkoutRoot = realpathSync(checkoutRoot);
    } catch { return "File reading views unavailable: checkout unavailable. Resolve canonical evidence and use knowledge_render_file when available."; }
  }
  const rendered: string[] = [];
  for (const file of unique.slice(0, 4)) {
    try {
      let source: string;
      if ("source" in file) source = file.source;
      else {
        const absolute = realpathSync(resolve(checkoutRoot!, file.path));
        const rel = relative(checkoutRoot!, absolute);
        if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) throw new Error("path_outside_checkout");
        if (statSync(absolute).size > SOURCE_VIEW_MAX_BYTES) throw new Error("file_too_large");
        source = readFileSync(absolute, "utf8");
      }
      if (Buffer.byteLength(source) > SOURCE_VIEW_MAX_BYTES) throw new Error("file_too_large");
      const viewOptions = { maxChars: 8000, maxLines: 240, startLine: sourceViewStartLine(source, file.symbol ?? "", 8000) };
      const view = options.sourceNames === undefined
        ? sourceViewForText(file.path, source, { ...viewOptions, gameId: options.game?.gameId })
        : renderSourceView({ ...viewOptions, path: file.path, source, names: options.sourceNames });
      rendered.push(formatSourceView(view));
    } catch {
      rendered.push(`File reading view unavailable for ${JSON.stringify(file.path)}. Use knowledge_render_file or resolve canonical evidence.`);
    }
  }
  if (unique.length > 4) rendered.push(`${unique.length - 4} additional files omitted. Use knowledge_render_file for other subject files.`);
  return rendered.join("\n\n");
}
