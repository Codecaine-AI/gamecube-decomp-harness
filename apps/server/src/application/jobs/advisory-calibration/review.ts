// `review` (plan §6.9, D4): the human labels every item. Per item it shows the
// rule, the flagged code, the hunk, the justification and the model proposal,
// then reads one key: `j` justified, `u` unjustified, `s` skip, `q` quit. Each
// j/u/s is appended to labels.jsonl at once, so quitting loses nothing.
//
// Order: items never shown before first, then items skipped earlier. Within
// those, items whose group has no human label yet come first (held-out groups
// before selection groups, so the ≥ 29 negative / ≥ 10 positive held-out group
// minimums fill fastest), then real before synthetic, then by id. A synthetic
// item never counts toward held-out, so its group's side does not lift it. The
// order is recomputed after every label; each item is shown at most once a run.
import { createInterface } from "node:readline";

import { assertKnownFlags, stringFlag, type CalibrationArgs } from "./args.js";
import { appendJsonl, DEFAULT_CALIBRATION_DIR, effectiveHumanLabels, justificationOf, loadDataset, type CalibrationDataset } from "./store.js";
import type { CalibrationItem, HumanLabel, LabelRecord, ReviewLabel, SplitSide } from "./types.js";

export const HELDOUT_NEGATIVE_GROUPS_NEEDED = 29;
export const HELDOUT_POSITIVE_GROUPS_NEEDED = 10;

const KEYS: Record<string, ReviewLabel | "quit"> = { j: "justified", u: "unjustified", s: "skip", q: "quit", "\u0003": "quit" };

export interface ReviewIO {
  print(line: string): void;
  /** One keypress (or one line's first character); null at end of input. */
  nextKey(): Promise<string | null>;
}

export interface ReviewSummary {
  /** Item ids in the order they were shown. */
  shown: string[];
  labelled: number;
  skipped: number;
}

interface KeySource {
  nextKey(): Promise<string | null>;
  close(): void;
}

function rawKeys(stdin: NodeJS.ReadStream): KeySource {
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();
  return {
    nextKey: () =>
      new Promise((resolve) => {
        const onData = (chunk: string | Buffer) => {
          cleanup();
          resolve(String(chunk).charAt(0));
        };
        const onEnd = () => {
          cleanup();
          resolve(null);
        };
        const cleanup = () => {
          stdin.off("data", onData);
          stdin.off("end", onEnd);
        };
        stdin.on("data", onData);
        stdin.on("end", onEnd);
      }),
    close: () => {
      stdin.setRawMode(false);
      stdin.pause();
    },
  };
}

function lineKeys(input: NodeJS.ReadableStream): KeySource {
  const reader = createInterface({ input, terminal: false });
  const lines: string[] = [];
  const waiting: Array<(line: string | null) => void> = [];
  let closed = false;
  reader.on("line", (line) => {
    const resolve = waiting.shift();
    if (resolve) resolve(line);
    else lines.push(line);
  });
  reader.on("close", () => {
    closed = true;
    for (const resolve of waiting.splice(0)) resolve(null);
  });
  const firstChar = (line: string | null) => (line === null ? null : line.trimStart().charAt(0));
  return {
    nextKey: () => {
      if (lines.length > 0) return Promise.resolve(firstChar(lines.shift()!));
      if (closed) return Promise.resolve(null);
      return new Promise((resolve) => waiting.push((line) => resolve(firstChar(line))));
    },
    close: () => reader.close(),
  };
}

function stdinKeys(): KeySource {
  return process.stdin.isTTY ? rawKeys(process.stdin) : lineKeys(process.stdin);
}

interface ReviewState {
  dataset: CalibrationDataset;
  labels: Map<string, HumanLabel>;
  /** Items with any earlier label record (a skip included). */
  seen: Set<string>;
}

function groupOf(state: ReviewState, item: CalibrationItem): string {
  return state.dataset.split?.items[item.id] ?? item.group_key;
}

function sideOf(state: ReviewState, item: CalibrationItem): SplitSide | null {
  const group = state.dataset.split?.items[item.id];
  return group === undefined ? null : (state.dataset.split!.components[group] ?? null);
}

/** Groups with a human label on a real item: the labels that count toward held-out. */
function labelledGroups(state: ReviewState): Set<string> {
  const groups = new Set<string>();
  for (const id of state.labels.keys()) {
    const item = state.dataset.byId.get(id);
    if (item && !item.synthetic) groups.add(groupOf(state, item));
  }
  return groups;
}

function sortKey(state: ReviewState, item: CalibrationItem, labelled: Set<string>): Array<number | string> {
  const side = item.synthetic ? "selection" : sideOf(state, item);
  return [
    state.seen.has(item.id) ? 1 : 0,
    labelled.has(groupOf(state, item)) ? 1 : 0,
    side === "heldout" ? 0 : side === "selection" ? 1 : 2,
    item.synthetic ? 1 : 0,
    item.id,
  ];
}

function compareKeys(a: Array<number | string>, b: Array<number | string>): number {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return 0;
}

function nextItem(state: ReviewState, remaining: readonly CalibrationItem[]): CalibrationItem | undefined {
  const labelled = labelledGroups(state);
  let best: CalibrationItem | undefined;
  let bestKey: Array<number | string> = [];
  for (const item of remaining) {
    const key = sortKey(state, item, labelled);
    if (!best || compareKeys(key, bestKey) < 0) {
      best = item;
      bestKey = key;
    }
  }
  return best;
}

/** `labelled N/M; held-out groups labelled: neg X, pos Y (need 29 / 10)`. */
export function reviewProgress(dataset: CalibrationDataset, labels: ReadonlyMap<string, HumanLabel>): string {
  const head = `labelled ${labels.size}/${dataset.items.length}`;
  const split = dataset.split;
  if (!split) return `${head}; held-out groups labelled: no split.json yet (run split)`;
  const groupLabels = new Map<string, Set<HumanLabel>>();
  for (const [id, label] of labels) {
    const item = dataset.byId.get(id);
    const group = split.items[id];
    if (!item || item.synthetic || group === undefined || split.components[group] !== "heldout") continue;
    const seen = groupLabels.get(group) ?? new Set<HumanLabel>();
    seen.add(label);
    groupLabels.set(group, seen);
  }
  let negative = 0;
  let positive = 0;
  for (const seen of groupLabels.values()) {
    if (seen.size !== 1) continue;
    if (seen.has("unjustified")) negative += 1;
    else positive += 1;
  }
  return (
    `${head}; held-out groups labelled: neg ${negative}, pos ${positive} ` +
    `(need ${HELDOUT_NEGATIVE_GROUPS_NEEDED} / ${HELDOUT_POSITIVE_GROUPS_NEEDED})`
  );
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

function describe(state: ReviewState, item: CalibrationItem): string[] {
  const { dataset } = state;
  const { finding } = item;
  const split = dataset.split;
  const group = split?.items[item.id];
  const where = split
    ? group === undefined
      ? "not in split.json"
      : `${split.components[group] ?? "unassigned"} group ${group}`
    : `base group ${item.group_key.slice(0, 16)}`;
  const kind = item.synthetic ? `synthetic (${item.quality ?? "?"}, from ${item.source_item_id ?? "?"})` : item.source;
  const justification = justificationOf(item, dataset.extractions);
  const proposal = dataset.proposals.get(item.id);
  const lines = [
    "",
    `── ${item.id} · ${kind} · ${where}`,
    `rule: ${finding.rule_id} (${finding.severity}) at ${finding.file}:${finding.line}`,
    `flagged: ${item.full_line.trim() || finding.excerpt}`,
    `message: ${finding.message}`,
    "hunk:",
    indent(item.hunk ?? "(no hunk)"),
    "justification:",
    indent(justification ?? "(none)"),
  ];
  if (proposal) lines.push(`proposal: ${proposal.label} (${proposal.model})`, indent(proposal.rationale || "(no rationale)"));
  else lines.push("proposal: (none)");
  if (item.synthetic && item.rationale) lines.push("synthesis rationale:", indent(item.rationale));
  return lines;
}

export async function reviewCommand(args: CalibrationArgs, io?: ReviewIO): Promise<ReviewSummary> {
  assertKnownFlags(args, ["--dir", "--reviewer"]);
  const reviewer = stringFlag(args, "--reviewer") ?? process.env.USER ?? "unknown";
  const dataset = loadDataset(stringFlag(args, "--dir") ?? DEFAULT_CALIBRATION_DIR);
  const state: ReviewState = {
    dataset,
    labels: effectiveHumanLabels(dataset.labels),
    seen: new Set(dataset.labels.map((record) => record.id)),
  };
  const keys: KeySource | null = io ? null : stdinKeys();
  const print = io ? (line: string) => io.print(line) : (line: string) => console.log(line);
  const nextKey = io ? () => io.nextKey() : () => keys!.nextKey();
  const summary: ReviewSummary = { shown: [], labelled: 0, skipped: 0 };
  const remaining = dataset.items.filter((item) => !state.labels.has(item.id));

  try {
    print(`review (${reviewer}): ${remaining.length} items to label in ${dataset.paths.dir}`);
    for (let item = nextItem(state, remaining); item; item = nextItem(state, remaining)) {
      remaining.splice(remaining.indexOf(item), 1);
      summary.shown.push(item.id);
      print(reviewProgress(dataset, state.labels));
      for (const line of describe(state, item)) print(line);
      let action: ReviewLabel | "quit" | undefined;
      while (action === undefined) {
        print("[j] justified  [u] unjustified  [s] skip  [q] quit");
        const key = await nextKey();
        action = key === null ? "quit" : KEYS[key.toLowerCase()];
      }
      if (action === "quit") break;
      const proposal = dataset.proposals.get(item.id);
      const record: LabelRecord = {
        id: item.id,
        label: action,
        labeler: "human",
        reviewer,
        proposed_label: proposal?.label ?? null,
        agreed: proposal && action !== "skip" ? proposal.label === action : null,
        synthetic: item.synthetic,
        group: dataset.split?.items[item.id] ?? null,
        labeled_at: new Date().toISOString(),
      };
      appendJsonl(dataset.paths.labels, record);
      state.seen.add(item.id);
      if (action === "skip") summary.skipped += 1;
      else {
        state.labels.set(item.id, action);
        summary.labelled += 1;
      }
    }
    print(`review: ${summary.labelled} labelled, ${summary.skipped} skipped this run; ${reviewProgress(dataset, state.labels)}`);
  } finally {
    keys?.close();
  }
  return summary;
}
