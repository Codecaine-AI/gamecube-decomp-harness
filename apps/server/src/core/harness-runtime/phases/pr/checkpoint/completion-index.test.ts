import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { completionIndexUnknown } from "@server/core/harness-runtime/phases/running/board/candidates.js";
import { recordSteeringBackfill, recordSteeringCoverage, recordSteeringRollback } from "@server/core/harness-runtime/run-state/steering.js";
import {
  clearUnverifiedMatch,
  clearUnverifiedMatchIfCertified,
  recordUnverifiedMatch,
  restoreUnverifiedMatchesClearedBy,
} from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { steeringCompletionHolds, steeringCompletionIndex, unknownCompletionHolds } from "./completion-index.js";
import { unitKeyedHas } from "@server/core/harness-runtime/run-state/unit-key.js";

const cleanup: string[] = [];
const stores: StateStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const root of cleanup.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

const game = { gameId: "example", steeringGate: "enforce" };
const ACTIVE = "unit_a::active_fn";
const ROLLED = "unit_a::rolled_fn";

/** A repository with the steered commit S and its child C; `active_fn` is unverified and `rolled_fn` was rolled back at S. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "completion-index-"));
  cleanup.push(root);
  const repo = join(root, "checkout");
  mkdirSync(repo);
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "fixture@example.com"]);
  git(repo, ["config", "user.name", "Fixture"]);
  writeFileSync(join(repo, "source.c"), "int value = 1;\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "steered"]);
  const steered = git(repo, ["rev-parse", "HEAD"]);
  writeFileSync(join(repo, "source.c"), "int value = 2;\n");
  git(repo, ["commit", "-qam", "certified"]);
  const certified = git(repo, ["rev-parse", "HEAD"]);

  const store = openState(join(root, "state"));
  stores.push(store);
  recordUnverifiedMatch(store, { gameId: "example", unit: "unit_a", symbol: "active_fn", analyzedRev: steered, match: { base: 90, candidate: 100, real_only: 90 }, reasons: [] });
  const rollbackId = recordSteeringRollback(store, {
    gameId: "example", unit: "unit_a", symbol: "rolled_fn", analyzedRev: steered, baseRev: steered,
    initialVerdict: "steering_located", finalVerdict: "pass", rules: ["steering"], report: {}, status: "reverified",
  });
  store.db.query("UPDATE steering_rollbacks SET recorded_at = ?, updated_at = ? WHERE id = ?")
    .run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", rollbackId);
  return { repo, store, steered, certified };
}

describe("steeringCompletionHolds", () => {
  test("nothing is read without an active gate or a game", () => {
    const f = fixture();
    expect(steeringCompletionHolds(f.store, { gameId: "example", steeringGate: "off" }, f.repo)).toBeUndefined();
    expect(steeringCompletionHolds(f.store, { gameId: null, steeringGate: "enforce" }, f.repo)).toBeUndefined();
  });

  test("before a certificate the active row and the rollback are held at every revision", () => {
    const f = fixture();
    const holds = steeringCompletionHolds(f.store, game, f.repo)!;
    expect(holds.unknown).toBe(false);
    expect([...holds.active.keys()]).toEqual([ACTIVE]);
    for (const rev of [f.steered, f.certified, null, undefined]) expect([...holds.at(rev)].sort()).toEqual([ACTIVE, ROLLED]);
  });

  test("a certificate clears the rollback only at revisions it is an ancestor of, never retroactively", () => {
    const f = fixture();
    recordSteeringBackfill(f.store, { gameId: "example", unit: "unit_a", symbol: "rolled_fn", analyzedRev: f.certified, verdict: "pass" });
    recordSteeringCoverage(f.store, { gameId: "example", unit: "unit_a", analyzedRev: f.certified, baselineRev: f.certified, clean: true });
    const holds = steeringCompletionHolds(f.store, game, f.repo)!;
    // The certifying rev itself counts as its own ancestor.
    expect([...holds.at(f.certified)]).toEqual([ACTIVE]);
    // The older steered revision still holds the code the rollback rewrote.
    expect([...holds.at(f.steered)].sort()).toEqual([ACTIVE, ROLLED]);
    // A missing revision, or no repository to establish ancestry, clears no rollback.
    expect([...holds.at(null)].sort()).toEqual([ACTIVE, ROLLED]);
    expect([...steeringCompletionHolds(f.store, game, null)!.at(f.certified)].sort()).toEqual([ACTIVE, ROLLED]);
    expect([...steeringCompletionHolds(f.store, game, join(f.repo, "missing"))!.at(f.certified)].sort()).toEqual([ACTIVE, ROLLED]);
  });
});

describe("steeringCompletionHolds: cleared unverified_match rows", () => {
  test("a cleared row stays held at revisions before its certifying revision, and at unknown ones", async () => {
    const f = fixture();
    writeFileSync(join(f.repo, "source.c"), "int value = 3;\n");
    git(f.repo, ["commit", "-qam", "later"]);
    const later = git(f.repo, ["rev-parse", "HEAD"]);
    // An integration landing `certified` clears the row; `cleared_rev` records that revision.
    f.store.db.query("UPDATE steering_unverified_matches SET base_rev = 'base'").run();
    expect((await clearUnverifiedMatchIfCertified(f.store, {
      gameId: "example", unit: "unit_a", symbol: "active_fn", clearedBy: "integration:i-1", clearedRev: f.certified,
      certifiedBaseRev: "base", isAncestor: () => true,
    })).cleared).toBe(true);

    const holds = steeringCompletionHolds(f.store, game, f.repo)!;
    expect(holds.active.size).toBe(0);
    // The archived source before the certified version never regains credit.
    expect([...holds.at(f.steered)].sort()).toEqual([ACTIVE, ROLLED]);
    // The certifying revision and its descendants credit it.
    expect([...holds.at(f.certified)]).toEqual([ROLLED]);
    expect([...holds.at(later)]).toEqual([ROLLED]);
    // An unknown revision clears nothing.
    for (const rev of [null, undefined, "0".repeat(40)]) expect([...holds.at(rev)].sort()).toEqual([ACTIVE, ROLLED]);

    // A clear that recorded no certifying revision holds everywhere.
    restoreUnverifiedMatchesClearedBy(f.store, "integration:i-1");
    expect(clearUnverifiedMatch(f.store, { gameId: "example", unit: "unit_a", symbol: "active_fn", clearedBy: "test" })).toBe(true);
    expect([...steeringCompletionHolds(f.store, game, f.repo)!.at(later)].sort()).toEqual([ACTIVE, ROLLED]);
  });

  test("a restored (reactivated) row drops its certifying revision", () => {
    const f = fixture();
    expect(clearUnverifiedMatch(f.store, { gameId: "example", unit: "unit_a", symbol: "active_fn", clearedBy: "integration:i-2", clearedRev: f.certified })).toBe(true);
    expect(restoreUnverifiedMatchesClearedBy(f.store, "integration:i-2")).toBe(1);
    const holds = steeringCompletionHolds(f.store, game, f.repo)!;
    expect([...holds.active.keys()]).toEqual([ACTIVE]);
    expect(f.store.db.query("SELECT cleared_rev FROM steering_unverified_matches WHERE symbol = 'active_fn'").get()).toEqual({ cleared_rev: null });
  });
});

describe("unknownCompletionHolds", () => {
  test("every revision's completion is unknown and no row is labelled", () => {
    const holds = unknownCompletionHolds();
    expect(holds.unknown).toBe(true);
    expect(holds.active.size).toBe(0);
    expect(completionIndexUnknown(holds.at("any-rev"))).toBe(true);
    expect(completionIndexUnknown(holds.at(null))).toBe(true);
  });
});

describe("module-prefixed report keys (SMS)", () => {
  test("short-unit holds are found under the report's prefixed key at every revision and at HEAD; Melee keys stay exact", async () => {
    const f = fixture();
    recordUnverifiedMatch(f.store, { gameId: "sms", unit: "Animal/AnimalBase", symbol: "held", analyzedRev: f.steered, match: { base: 90, candidate: 100, real_only: 90 }, reasons: [] });
    recordSteeringRollback(f.store, {
      gameId: "sms", unit: "Animal/AnimalBase", symbol: "rolled", analyzedRev: f.steered, baseRev: f.steered,
      initialVerdict: "steering_located", finalVerdict: "pass", rules: ["steering"], report: {}, status: "reverified",
    });
    const sms = { gameId: "sms", steeringGate: "enforce" };
    const holds = steeringCompletionHolds(f.store, sms, f.repo)!;
    expect(unitKeyedHas(holds.active, "mario/Animal/AnimalBase::held")).toBe(true);
    for (const key of ["mario/Animal/AnimalBase::held", "mario/Animal/AnimalBase::rolled", "Animal/AnimalBase::rolled"]) {
      expect(unitKeyedHas(holds.at(f.certified), key)).toBe(true);
    }
    const head = await steeringCompletionIndex(f.store, sms, f.repo);
    expect([...head!].sort()).toEqual(["Animal/AnimalBase::held", "Animal/AnimalBase::rolled"]);
    expect(unitKeyedHas(head, "mario/Animal/AnimalBase::rolled")).toBe(true);
    // A game without module prefixes never strips a component.
    expect(unitKeyedHas(steeringCompletionHolds(f.store, game, f.repo)!.at(f.certified), "mario/unit_a::active_fn")).toBe(false);
  });
});
