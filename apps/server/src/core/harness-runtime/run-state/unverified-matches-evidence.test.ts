import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { recordSteeringBackfill, recordSteeringCoverage, recordSteeringRollback } from "./steering.js";
import { clearUnverifiedMatch, recordUnverifiedMatch, type RevAncestry } from "./unverified-matches.js";
import {
  UNVERIFIED_MATCHES_EVIDENCE_ENV,
  UNVERIFIED_MATCHES_EVIDENCE_SCHEMA,
  unverifiedMatchesEvidence,
  unverifiedMatchesEvidenceJson,
} from "./unverified-matches-evidence.js";

const TOOLS = resolve(import.meta.dir, "../../../../../../toolpacks/gamecube-decomp/_impl/gamecube/tools");
const UNIT = "mario/M3DUtil/MActor";
const ROLLBACK_UNIT = "mario/Enemy/hanasambo";
/** The file names the gate's unit: the report's (written above) without the `mario/` module prefix. */
const gateUnit = (unit: string) => unit.replace(/^mario\//, "");
/** Active row: unverified at every revision. */
const ACTIVE = "setLightData__6MActorFv";
/** Unverified at A, certified (cleared) at B. */
const CLEARED_AT_B = "calcLight__6MActorFv";
/** Cleared without a recorded revision: never counts as certified. */
const CLEARED_NO_REV = "draw__6MActorFv";
/** Rolled back before A; a clean backfill pass certifies it at B. */
const ROLLED_BACK = "moveObject__10THanaSamboFv";
const SMS = { gameId: "sms", matching: { steeringGate: "enforce" } };

// Linear history A -> B -> C.
const HISTORY = ["rev-A", "rev-B", "rev-C"];
const isAncestor: RevAncestry = (ancestor, descendant) => {
  const a = HISTORY.indexOf(ancestor);
  const d = HISTORY.indexOf(descendant);
  return a >= 0 && d >= 0 && a <= d;
};

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

async function withStore(run: (store: StateStore, dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "unverified-evidence-"));
  dirs.push(dir);
  const store = openState(dir);
  try {
    for (const symbol of [ACTIVE, CLEARED_AT_B, CLEARED_NO_REV]) {
      recordUnverifiedMatch(store, {
        gameId: "sms", unit: UNIT, symbol, analyzedRev: "rev-A", baseRev: "base-rev",
        match: { base: 90, candidate: 100, real_only: 96 }, reasons: ["oracle failed"],
      });
    }
    clearUnverifiedMatch(store, { gameId: "sms", unit: UNIT, symbol: CLEARED_AT_B, clearedBy: "integration:1", clearedRev: "rev-B" });
    clearUnverifiedMatch(store, { gameId: "sms", unit: UNIT, symbol: CLEARED_NO_REV, clearedBy: "attempt:1" });
    recordSteeringRollback(store, {
      gameId: "sms", unit: ROLLBACK_UNIT, symbol: ROLLED_BACK, analyzedRev: "rev-0", initialVerdict: "steering_located",
      finalVerdict: "pass", rules: ["steering"], report: {},
    });
    Bun.sleepSync(5);
    recordSteeringBackfill(store, { gameId: "sms", unit: ROLLBACK_UNIT, symbol: ROLLED_BACK, analyzedRev: "rev-B", verdict: "pass" });
    recordSteeringCoverage(store, { gameId: "sms", unit: ROLLBACK_UNIT, analyzedRev: "rev-B", baselineRev: "rev-A", clean: true });
    await run(store, dir);
  } finally {
    store.db.close();
  }
}

const listed = async (store: StateStore, revision: string | null, ancestry: RevAncestry = isAncestor) =>
  (await unverifiedMatchesEvidence(store, SMS, { revision, isAncestor: ancestry })).unverified.map((row) => row.symbol).sort();

describe("unverified-match evidence file for sandbox real_code_evidence usage", () => {
  test("is derived at the sandbox revision: a later certification never certifies an older body", async () => {
    await withStore(async (store) => {
      const atA = await unverifiedMatchesEvidence(store, SMS, { revision: "rev-A", isAncestor, generatedAt: "2026-10-17T00:00:00.000Z" });
      expect(atA).toMatchObject({ schema: UNVERIFIED_MATCHES_EVIDENCE_SCHEMA, game_id: "sms", gate: "enforce", gate_active: true, revision: "rev-A" });
      expect(atA.unverified).toEqual([
        { unit: gateUnit(ROLLBACK_UNIT), symbol: ROLLED_BACK, analyzed_rev: "rev-0", base_rev: null, reason: "steering_rollback" },
        { unit: gateUnit(UNIT), symbol: CLEARED_AT_B, analyzed_rev: "rev-A", base_rev: "base-rev", reason: "unverified_match" },
        { unit: gateUnit(UNIT), symbol: CLEARED_NO_REV, analyzed_rev: "rev-A", base_rev: "base-rev", reason: "unverified_match" },
        { unit: gateUnit(UNIT), symbol: ACTIVE, analyzed_rev: "rev-A", base_rev: "base-rev", reason: "unverified_match" },
      ]);
      // At B (and its descendant C) the clear and the rollback's backfill pass are reached.
      expect(await listed(store, "rev-B")).toEqual([CLEARED_NO_REV, ACTIVE].sort());
      expect(await listed(store, "rev-C")).toEqual([CLEARED_NO_REV, ACTIVE].sort());
    });
  });

  test("an unknown revision or a failing ancestry check certifies nothing", async () => {
    await withStore(async (store) => {
      const everything = [ACTIVE, CLEARED_AT_B, CLEARED_NO_REV, ROLLED_BACK].sort();
      expect(await listed(store, null)).toEqual(everything);
      expect(await listed(store, "rev-unknown")).toEqual(everything);
      expect(await listed(store, "rev-C", () => { throw new Error("git failed"); })).toEqual(everything);
      expect(await listed(store, "rev-C", async () => Promise.reject(new Error("git failed")))).toEqual(everything);
    });
  });

  test("a game with the gate off (Melee) is ungated and lists nothing", async () => {
    await withStore(async (store) => {
      for (const game of [{ gameId: "sms", matching: { steeringGate: "off" } }, { gameId: "sms" }]) {
        const evidence = await unverifiedMatchesEvidence(store, game, { revision: "rev-A", isAncestor });
        expect(evidence.gate).toBe("off");
        expect(evidence.gate_active).toBe(false);
        expect(evidence.unverified).toEqual([]);
      }
    });
  });

  test("evidence_search.py classifies siblings from the file written at A and at B", async () => {
    await withStore(async (store, dir) => {
      const classify = async (revision: string) => {
        const path = join(dir, `unverified-${revision}.json`);
        writeFileSync(path, await unverifiedMatchesEvidenceJson(store, SMS, { revision, isAncestor }));
        const script = [
          "import json, sys",
          `sys.path.insert(0, ${JSON.stringify(TOOLS)})`,
          "import evidence_search as es",
          "cert = es.load_certification(None)",
          "assert cert.status == 'gated', cert.note",
          `print(json.dumps([cert.classify(u, s)[0] for u, s in ${JSON.stringify([[UNIT, CLEARED_AT_B], [ROLLBACK_UNIT, ROLLED_BACK], [UNIT, ACTIVE]])}]))`,
        ].join("\n");
        const proc = Bun.spawnSync(["python3", "-c", script], { env: { ...process.env, [UNVERIFIED_MATCHES_EVIDENCE_ENV]: path } });
        expect(proc.exitCode, proc.stderr.toString()).toBe(0);
        return JSON.parse(proc.stdout.toString()) as string[];
      };
      expect(await classify("rev-A")).toEqual(["unverified", "unverified", "unverified"]);
      expect(await classify("rev-B")).toEqual(["certified", "certified", "unverified"]);
    });
  });
});
