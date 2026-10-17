import { describe, expect, test } from "bun:test";
import {
  canonicalTargetKey,
  canonicalUnit,
  sameUnit,
  targetKey,
  targetKeyVariants,
  unitKeyedGet,
  unitKeyedHas,
  unitModulePrefixes,
  unitVariants,
  withUnitKeys,
} from "./unit-key.js";

const SMS = { gameId: "sms", matching: { unitModulePrefixes: ["mario"] } };
const MELEE = { gameId: "melee", matching: {} };

describe("unit keys", () => {
  test("reads the module prefixes from the game descriptor by id", () => {
    expect(unitModulePrefixes("sms")).toEqual(["mario"]);
    expect(unitModulePrefixes({ gameId: "sms", steeringGate: "enforce" } as { gameId: string })).toEqual(["mario"]);
    expect(unitModulePrefixes("melee")).toEqual([]);
    expect(unitModulePrefixes("no-such-game")).toEqual([]);
    expect(unitModulePrefixes("../escape")).toEqual([]);
    expect(unitModulePrefixes(null)).toEqual([]);
  });

  test("strips only a known module prefix, idempotently", () => {
    expect(canonicalUnit(SMS, "mario/Animal/AnimalBase")).toBe("Animal/AnimalBase");
    expect(canonicalUnit(SMS, "Animal/AnimalBase")).toBe("Animal/AnimalBase");
    expect(canonicalUnit(SMS, canonicalUnit(SMS, "mario/JSystem/JKernel/JKRAram"))).toBe("JSystem/JKernel/JKRAram");
    // Other leading components (and a bare module name) stay.
    expect(canonicalUnit(SMS, "main/Animal/AnimalBase")).toBe("main/Animal/AnimalBase");
    expect(canonicalUnit(SMS, "marioX/Animal")).toBe("marioX/Animal");
    expect(canonicalUnit(SMS, "mario")).toBe("mario");
    expect(canonicalUnit(SMS, "mario/")).toBe("mario/");
  });

  test("Melee keeps its units as written", () => {
    expect(canonicalUnit(MELEE, "main/melee/lb/lbcommand")).toBe("main/melee/lb/lbcommand");
    expect(canonicalUnit("melee", "main/melee/lb/lbcommand")).toBe("main/melee/lb/lbcommand");
    expect(targetKey("melee", "main/melee/lb/lbcommand", "fn")).toBe("main/melee/lb/lbcommand::fn");
    expect(sameUnit("melee", "main/melee/lb/lbcommand", "melee/lb/lbcommand")).toBe(false);
    expect(unitVariants("melee", "main/melee/lb/lbcommand")).toEqual(["main/melee/lb/lbcommand"]);
  });

  test("target keys, comparisons and variants", () => {
    expect(targetKey(SMS, "mario/Animal/AnimalBase", "f__Fv")).toBe("Animal/AnimalBase::f__Fv");
    expect(canonicalTargetKey(SMS, "mario/Animal/AnimalBase::A::b")).toBe("Animal/AnimalBase::A::b");
    expect(canonicalTargetKey(SMS, "Animal/AnimalBase::f")).toBe("Animal/AnimalBase::f");
    expect(sameUnit(SMS, "mario/Animal/AnimalBase", "Animal/AnimalBase")).toBe(true);
    expect(sameUnit(SMS, "mario/Animal/AnimalBase", "Animal/AnimalManager")).toBe(false);
    expect(unitVariants(SMS, "mario/Animal/AnimalBase")).toEqual(["Animal/AnimalBase", "mario/Animal/AnimalBase"]);
    expect(targetKeyVariants(SMS, "Animal/AnimalBase", "f")).toEqual(["Animal/AnimalBase::f", "mario/Animal/AnimalBase::f"]);
  });

  test("a tagged index finds either spelling; an untagged one is raw", () => {
    const held = withUnitKeys(new Set(["Animal/AnimalBase::f"]), "sms");
    expect(unitKeyedHas(held, "mario/Animal/AnimalBase::f")).toBe(true);
    expect(unitKeyedHas(held, "Animal/AnimalBase::f")).toBe(true);
    expect(unitKeyedHas(held, "mario/Animal/AnimalBase::g")).toBe(false);
    expect(unitKeyedHas(new Set(["Animal/AnimalBase::f"]), "mario/Animal/AnimalBase::f")).toBe(false);
    const byKey = withUnitKeys(new Map([["Animal/AnimalBase::f", 1]]), SMS);
    expect(unitKeyedGet(byKey, "mario/Animal/AnimalBase::f")).toBe(1);
    // Tagging a Melee index is a no-op.
    const melee = withUnitKeys(new Set(["main/melee/lb/lbcommand::fn"]), "melee");
    expect(unitKeyedHas(melee, "main/melee/lb/lbcommand::fn")).toBe(true);
    expect(unitKeyedHas(melee, "melee/lb/lbcommand::fn")).toBe(false);
  });
});
