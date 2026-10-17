/**
 * Structural bounding for large JSON tool payloads.
 *
 * `jsonToolResult` cuts text that exceeds `maxToolOutputCharacters`, which
 * leaves invalid JSON. Payloads that can grow with the data (a file card for a
 * big file, related functions for every function of a file) are shrunk here
 * first, so the worker always gets valid JSON with a record of what was left
 * out: long strings are shortened, then the lists at the path that contributes
 * the most text (every function's callees counts as one path; lists nested in
 * their items are not counted) are halved, until the rendered result fits the
 * budget.
 */
import { maxToolOutputCharacters } from "./results.js";

/** Rendered-size target: below the hard cap, with room to spare. */
export const boundedToolPayloadCharacters = maxToolOutputCharacters - 4000;
/** Strings longer than this are shortened before any list is cut. */
const MAX_STRING_CHARACTERS = 600;

export interface ListTruncation {
  /** Items kept, summed over every list at this path. */
  shown: number;
  /** Items the tool returned, summed over the same lists. */
  total: number;
}

export interface PayloadTruncation {
  /** Truncated lists by path; `[]` stands for every item of the enclosing list. */
  lists: Record<string, ListTruncation>;
  strings_shortened?: number;
  hint: string;
}

type Json = unknown;

interface ArrayNode {
  parent: Record<string, Json> | Json[];
  key: string | number;
  path: string;
  length: number;
  /** Compact characters of the list minus the lists nested in its items. */
  own: number;
}

function isObject(value: Json): value is Record<string, Json> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function childPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

/** Compact size of `node`, collecting every list with its own (non-nested) size. */
function measure(node: Json, path: string, parent: ArrayNode["parent"] | null, key: string | number, out: ArrayNode[]): { size: number; arrays: number } {
  if (Array.isArray(node)) {
    let size = 2 + Math.max(0, node.length - 1);
    let nested = 0;
    node.forEach((item, index) => {
      const child = measure(item, `${path}[]`, node, index, out);
      size += child.size;
      nested += child.arrays;
    });
    if (parent) out.push({ parent, key, path, length: node.length, own: size - nested });
    return { size, arrays: size };
  }
  if (isObject(node)) {
    let size = 2;
    let arrays = 0;
    for (const [name, value] of Object.entries(node)) {
      const child = measure(value, childPath(path, name), node, name, out);
      size += name.length + 4 + child.size;
      arrays += child.arrays;
    }
    return { size, arrays };
  }
  return { size: JSON.stringify(node)?.length ?? 4, arrays: 0 };
}

function shortenStrings(node: Json): { node: Json; shortened: number } {
  if (typeof node === "string") {
    return node.length > MAX_STRING_CHARACTERS
      ? { node: `${node.slice(0, MAX_STRING_CHARACTERS)}...`, shortened: 1 }
      : { node, shortened: 0 };
  }
  if (Array.isArray(node)) {
    let shortened = 0;
    const items = node.map((item) => {
      const result = shortenStrings(item);
      shortened += result.shortened;
      return result.node;
    });
    return { node: items, shortened };
  }
  if (isObject(node)) {
    let shortened = 0;
    const entries = Object.entries(node).map(([name, value]) => {
      const result = shortenStrings(value);
      shortened += result.shortened;
      return [name, result.node] as const;
    });
    return { node: Object.fromEntries(entries), shortened };
  }
  return { node, shortened: 0 };
}

/** Per-path shown/total for every list at a path where some list was cut. */
function listCounts(root: Json, totals: WeakMap<Json[], number>): Record<string, ListTruncation> {
  const counts: Record<string, ListTruncation & { cut: boolean }> = {};
  const visit = (node: Json, path: string) => {
    if (Array.isArray(node)) {
      const total = totals.get(node) ?? node.length;
      const entry = counts[path] ?? { shown: 0, total: 0, cut: false };
      entry.shown += node.length;
      entry.total += total;
      entry.cut ||= total > node.length;
      counts[path] = entry;
      for (const item of node) visit(item, `${path}[]`);
    } else if (isObject(node)) {
      for (const [name, value] of Object.entries(node)) visit(value, childPath(path, name));
    }
  };
  visit(root, "");
  return Object.fromEntries(
    Object.entries(counts).filter(([, entry]) => entry.cut).map(([path, { shown, total }]) => [path, { shown, total }]),
  );
}

/**
 * The payload unchanged when `{ tool, ...payload }` renders within `budget`;
 * otherwise a copy with shortened strings and cut lists plus
 * `truncated: true` and a `truncation` record (per-list counts and `hint`).
 */
export function boundToolPayload(
  tool: string,
  payload: Record<string, unknown>,
  hint: string,
  budget = boundedToolPayloadCharacters,
): Record<string, unknown> {
  const rendered = (value: Record<string, unknown>) => JSON.stringify({ tool, ...value }, null, 2).length;
  if (rendered(payload) <= budget) return payload;

  const shortened = shortenStrings(payload);
  const root = shortened.node as Record<string, unknown>;
  const totals = new WeakMap<Json[], number>();
  const withRecord = () => {
    const truncation: PayloadTruncation = {
      lists: listCounts(root, totals),
      ...(shortened.shortened ? { strings_shortened: shortened.shortened } : {}),
      hint,
    };
    return { ...root, truncated: true, truncation };
  };

  for (let result = withRecord(); ; result = withRecord()) {
    if (rendered(result) <= budget) return result;
    const lists: ArrayNode[] = [];
    measure(root, "", null, "", lists);
    // Lists at one path (e.g. every function's callees) are cut together, by their summed own size.
    const groups = new Map<string, { own: number; lists: ArrayNode[] }>();
    for (const list of lists.filter((entry) => entry.length > 0)) {
      const group = groups.get(list.path) ?? { own: 0, lists: [] };
      group.own += list.own;
      group.lists.push(list);
      groups.set(list.path, group);
    }
    const largest = [...groups.values()].sort((a, b) => b.own - a.own)[0];
    if (!largest) {
      return { status: payload.status ?? "ok", truncated: true, truncation: { lists: {}, hint }, error: "result too large to bound" };
    }
    for (const list of largest.lists) {
      const current = (list.parent as Record<string | number, Json>)[list.key] as Json[];
      const cut = current.slice(0, Math.floor(current.length / 2));
      totals.set(cut, totals.get(current) ?? current.length);
      (list.parent as Record<string | number, Json>)[list.key] = cut;
    }
  }
}
