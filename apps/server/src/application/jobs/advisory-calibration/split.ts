// `split`: assigns every merged evidence group to `selection` or `heldout`
// (plan §6.9). A new group goes held-out when sha256(group + salt) mod 100 < 40;
// the salt is fixed in split.json and every base group keeps the side it was
// first given, so the split is stable as items and labels grow. A merge that
// joins base groups from both sides would leak selection evidence into the
// held-out evaluation, so the merged group is forced to selection and listed
// under `conflicts`.
import { randomBytes } from "node:crypto";

import { assertKnownFlags, stringFlag, type CalibrationArgs } from "./args.js";
import { computeGroups } from "./groups.js";
import { canonicalJson, DEFAULT_CALIBRATION_DIR, loadDataset, sha256Hex, writeJson } from "./store.js";
import type { CalibrationItem, SplitFile, SplitSide } from "./types.js";

export const HELDOUT_PERCENT = 40;

export function hashSide(group: string, salt: string, heldoutPercent = HELDOUT_PERCENT): SplitSide {
  const bucket = BigInt(`0x${sha256Hex(group + salt)}`) % 100n;
  return bucket < BigInt(heldoutPercent) ? "heldout" : "selection";
}

export function computeSplit(items: readonly CalibrationItem[], previous: SplitFile | null, salt?: string): SplitFile {
  const resolvedSalt = previous?.salt ?? salt ?? randomBytes(8).toString("hex");
  if (previous && salt !== undefined && salt !== previous.salt) {
    throw new Error("advisory-calibration split: --salt differs from the salt fixed in split.json");
  }
  const heldoutPercent = previous?.heldout_percent ?? HELDOUT_PERCENT;
  const { itemGroup, baseGroups } = computeGroups(items);
  const baseSides: Record<string, SplitSide> = { ...(previous?.base_groups ?? {}) };
  const conflicts = new Set(previous?.conflicts ?? []);
  const components: Record<string, SplitSide> = {};
  for (const group of [...baseGroups.keys()].sort()) {
    const bases = baseGroups.get(group)!;
    const recorded = new Set(bases.map((base) => baseSides[base]).filter((side): side is SplitSide => side !== undefined));
    let side: SplitSide;
    if (recorded.size === 0) side = hashSide(group, resolvedSalt, heldoutPercent);
    else if (recorded.size === 1) side = [...recorded][0]!;
    else {
      side = "selection";
      conflicts.add(group);
    }
    components[group] = side;
    for (const base of bases) baseSides[base] = side;
  }
  const itemsRecord: Record<string, string> = {};
  for (const id of [...itemGroup.keys()].sort()) itemsRecord[id] = itemGroup.get(id)!;
  return {
    schema: "advisory_calibration_split_v1",
    salt: resolvedSalt,
    heldout_percent: heldoutPercent,
    base_groups: Object.fromEntries(Object.entries(baseSides).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    items: itemsRecord,
    components,
    conflicts: [...conflicts].sort(),
  };
}

/** Recorded with every calibration: the item → group → side assignment and the salt. */
export function splitHash(split: SplitFile): string {
  return sha256Hex(canonicalJson({ salt: split.salt, items: split.items, components: split.components }));
}

export async function splitCommand(args: CalibrationArgs, print: (line: string) => void = console.log): Promise<SplitFile> {
  assertKnownFlags(args, ["--dir", "--salt"]);
  const dataset = loadDataset(stringFlag(args, "--dir") ?? DEFAULT_CALIBRATION_DIR);
  if (dataset.items.length === 0) throw new Error(`advisory-calibration split: no items in ${dataset.paths.dir}`);
  const split = computeSplit(dataset.items, dataset.split, stringFlag(args, "--salt"));
  writeJson(dataset.paths.split, split);
  const sides = Object.values(split.components);
  print(
    `split: ${Object.keys(split.items).length} items in ${sides.length} groups ` +
      `(${sides.filter((side) => side === "heldout").length} held-out, ${sides.filter((side) => side === "selection").length} selection, ` +
      `${split.conflicts.length} conflicts) → ${dataset.paths.split}`,
  );
  return split;
}
