import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState } from "@server/core/orchestrator-state";
import { latestSteeringProbe } from "@server/core/harness-runtime/run-state/steering.js";
import type { SteeringDecision, WorkerSteeringResult } from "@server/core/validation/steering/steering-check.js";
import { recordWorkerSteeringObservations, steeringObservationRows } from "./steering-validation.js";

const UNIT = "mario/Enemy/hanasambo";
// decide reports C++ functions by their mangled symbol; steering_diagnose's probe
// carries that as `symbol` and the demangled name as `function`.
const SYMBOL = "execute__19TNerveHanaSamboHideCFP24TSpineBase<10TLiveActor>";
const DEMANGLED = "TNerveHanaSamboHide::execute(TSpineBase<TLiveActor>*) const";
const C_SYMBOL = "MarNameRefGen_fill";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function steering(functions: Array<{ name: string; unit?: string }>, probes: SteeringDecision["probes"]): WorkerSteeringResult {
  return {
    mode: "enforce",
    error: null,
    artifactPath: null,
    durationMs: 5,
    decision: {
      attempt: "steering_located",
      reasons: ["fixture"],
      removable_noncosmetic: ["g1"],
      functions: functions.map((fn) => ({
        unit: fn.unit ?? UNIT,
        name: fn.name,
        decision: "steering_located",
        semantic: "steering",
        analysis: "complete",
        audit_label: "steering",
        match: { base: 99.79, candidate: 100, real_only: 99.79 },
      })),
      probes,
    },
  };
}

describe("steering observations find the probe of a mangled C++ function", () => {
  test("a probe naming the function demangled and the symbol mangled is stored with the observation", () => {
    const result = steering([{ name: SYMBOL }], [{ function: DEMANGLED, symbol: SYMBOL, unit: UNIT, hypotheses: [{ cause: "missing inline function" }] }]);
    const rows = steeringObservationRows({ result, gameId: "sms", unit: UNIT, symbol: SYMBOL, sourceSha: "sha-1" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.symbol).toBe(SYMBOL);
    expect(rows[0]!.probe).toMatchObject({ function: DEMANGLED, symbol: SYMBOL });

    const dir = mkdtempSync(join(tmpdir(), "steering-mangled-"));
    dirs.push(dir);
    const store = openState(dir);
    try {
      expect(recordWorkerSteeringObservations(store, { result, gameId: "sms", unit: UNIT, symbol: SYMBOL, sourceSha: "sha-1" })).toBe(1);
      expect(latestSteeringProbe(store, { gameId: "sms", unit: UNIT, symbol: SYMBOL, functionSourceSha: "sha-1" })?.symbol).toBe(SYMBOL);
    } finally {
      store.db.close();
    }
  });

  test("C functions (function = symbol) still match, and a probe of another unit never does", () => {
    const result = steering(
      [{ name: C_SYMBOL }, { name: SYMBOL, unit: "mario/Enemy/other" }],
      [{ function: C_SYMBOL, unit: UNIT }, { function: DEMANGLED, symbol: SYMBOL, unit: UNIT }],
    );
    const rows = steeringObservationRows({ result, gameId: "sms", unit: UNIT, symbol: C_SYMBOL });
    expect(rows.map((row) => [row.symbol, row.probe?.function ?? null])).toEqual([
      [C_SYMBOL, C_SYMBOL],
      [SYMBOL, null],
    ]);
  });
});
