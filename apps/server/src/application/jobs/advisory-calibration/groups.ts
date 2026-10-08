// Independent evidence groups (plan §6.9, round 2 A3-F5). Successive attempts
// of one worker and other workers retrying the same function keep the same
// flagged code, so their items are one piece of evidence:
// - the base group hashes the target, the rule and the normalized full
//   flagged line, so equal hunks merge across worker states and attempts;
// - items that share a worker state, rule and file are merged too (union–find),
//   so a worker that edits the flagged line between attempts is still one group;
// - a synthetic item carries its source item's base group and worker state.
import { normalizeAdvisoryCode, normalizeAdvisoryPath } from "@server/core/validation/qa/advisory-fingerprint.js";

import { sha256Hex } from "./store.js";

export function baseGroupKey(targetKey: string, ruleId: string, fullLine: string): string {
  return sha256Hex(`${targetKey}\n${ruleId}\n${normalizeAdvisoryCode(fullLine)}`);
}

interface GroupableItem {
  id: string;
  group_key: string;
  worker_state_id: string;
  finding: { rule_id: string; file: string };
}

function workerKey(item: GroupableItem): string {
  return `ws\n${item.worker_state_id}\n${item.finding.rule_id}\n${normalizeAdvisoryPath(item.finding.file)}`;
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  find(key: string): string {
    let root = key;
    for (let next = this.parent.get(root); next !== undefined && next !== root; next = this.parent.get(root)) root = next;
    if (!this.parent.has(key)) this.parent.set(key, key);
    // Path compression.
    for (let node = key; node !== root; ) {
      const next = this.parent.get(node)!;
      this.parent.set(node, root);
      node = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    // Deterministic: the smaller key becomes the root.
    if (rootA < rootB) this.parent.set(rootB, rootA);
    else this.parent.set(rootA, rootB);
  }
}

export interface ItemGroups {
  /** Item id → merged group id (`grp-` + the first 16 hex digits of the smallest base group in it). */
  itemGroup: Map<string, string>;
  /** Merged group id → its base groups, sorted. */
  baseGroups: Map<string, string[]>;
}

/** Merges items into independent evidence groups. Deterministic in the item set, not its order. */
export function computeGroups(items: readonly GroupableItem[]): ItemGroups {
  const uf = new UnionFind();
  for (const item of items) {
    const base = `bg\n${item.group_key}`;
    uf.find(base);
    uf.union(base, workerKey(item));
  }
  const rootBases = new Map<string, Set<string>>();
  for (const item of items) {
    const root = uf.find(`bg\n${item.group_key}`);
    let bases = rootBases.get(root);
    if (!bases) rootBases.set(root, (bases = new Set()));
    bases.add(item.group_key);
  }
  const rootId = new Map<string, string>();
  const baseGroups = new Map<string, string[]>();
  for (const [root, bases] of rootBases) {
    const sorted = [...bases].sort();
    const id = `grp-${sorted[0]!.slice(0, 16)}`;
    rootId.set(root, id);
    baseGroups.set(id, sorted);
  }
  const itemGroup = new Map<string, string>();
  for (const item of items) itemGroup.set(item.id, rootId.get(uf.find(`bg\n${item.group_key}`))!);
  return { itemGroup, baseGroups };
}
