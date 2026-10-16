import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearHeaderReadinessCache,
  createHeaderReadinessResolver,
  headerDefinedClasses,
  type ReadinessIndexRunner,
} from "./header-readiness.js";

const POLICY = { mode: "shadow" as const, gatedPaths: ["src/System/MarNameRefGen.cpp"] };

const INDEX = {
  identity: { rev: "base-abc" },
  functions: {},
  classes: {
    TBossGesso: { class: "TBossGesso", owner_unit: "enemy/BossGesso", provenance: "vtable", started: false, construct: "not_ready", declare: "not_ready" },
    TMario: { class: "TMario", owner_unit: "mario/Mario", provenance: "vtable", started: true, construct: "ready", declare: "ready" },
    "JGeometry::TVec3": { class: "JGeometry::TVec3", owner_unit: null, provenance: "ambiguous", started: false, construct: "shared", declare: "shared" },
    TAmbiguous: { class: "TAmbiguous", owner_unit: null, provenance: "ambiguous", started: false, construct: "unresolved", declare: "unresolved" },
  },
  summary: { blocked: 0, deferred: 0, ready: 0, unresolved_classes: 1 },
};

const HEADERS: Record<string, string> = {
  "include/Enemy/BossGesso.hpp": "class TMario;\n// class TFake {\nclass TBossGesso : public TSpineEnemy {\npublic:\n  void init();\n};\n",
  "include/MarioUtil/Mario.hpp": "class TBossGesso;\nstruct TMario {\n  int x;\n};\nenum class EState { A };\n",
  "include/Helper.hpp": "struct THelper {\n};\n",
  "include/Amb.hpp": "class TAmbiguous {};\n",
  "include/Vec.hpp": "namespace JGeometry {\ntemplate <typename T> struct TVec3 { T x; };\n}\n",
  "include/Decls.hpp": "class TBossGesso;\nstruct TMario;\n",
};

function indexRunner(result: { exitCode: number; stdout?: string } = { exitCode: 0, stdout: JSON.stringify(INDEX) }) {
  const calls: string[][] = [];
  const runner: ReadinessIndexRunner = async (args) => {
    calls.push(args);
    return { exitCode: result.exitCode, stdout: result.stdout ?? "", stderr: "" };
  };
  return { runner, calls };
}

function resolver(runner: ReadinessIndexRunner, rev: string | null = "base-abc") {
  return createHeaderReadinessResolver({
    repoRoot: "/host/sms",
    rev,
    policy: POLICY,
    readHeader: async (path) => HEADERS[path] ?? null,
    runner,
  });
}

beforeEach(() => clearHeaderReadinessCache());

describe("headerDefinedClasses", () => {
  test("definitions count; forward declarations, comments and enum class do not", () => {
    expect(headerDefinedClasses(HEADERS["include/Enemy/BossGesso.hpp"]!)).toEqual(["TBossGesso"]);
    expect(headerDefinedClasses(HEADERS["include/MarioUtil/Mario.hpp"]!)).toEqual(["TMario"]);
    expect(headerDefinedClasses(HEADERS["include/Decls.hpp"]!)).toEqual([]);
    expect(headerDefinedClasses("inline void TMario::update() { run(); }\n")).toEqual(["TMario"]);
  });
});

describe("createHeaderReadinessResolver", () => {
  test("maps the declare level per header and names class and owner unit", async () => {
    const { runner, calls } = indexRunner();
    const verdicts = await resolver(runner)(Object.keys(HEADERS));
    expect(calls).toEqual([["index", "--repo", "/host/sms", "--rev", "base-abc", "--policy-json", JSON.stringify({ gatedPaths: POLICY.gatedPaths }), "--json"]]);
    expect(verdicts.get("include/Enemy/BossGesso.hpp")).toEqual({
      state: "not_ready",
      classes: [{ class: "TBossGesso", owner_unit: "enemy/BossGesso", state: "not_ready" }],
    });
    expect(verdicts.get("include/MarioUtil/Mario.hpp")?.state).toBe("ready");
    expect(verdicts.get("include/Helper.hpp")).toEqual({ state: "unresolved", classes: [{ class: "THelper", owner_unit: null, state: "unresolved" }] });
    expect(verdicts.get("include/Amb.hpp")?.state).toBe("unresolved");
    expect(verdicts.get("include/Vec.hpp")?.state).toBe("ready");
    expect(verdicts.get("include/Decls.hpp")).toEqual({ state: "ready", classes: [] });
  });

  test("the index runs once per (repo, rev)", async () => {
    const { runner, calls } = indexRunner();
    const resolve = resolver(runner);
    await resolve(["include/Helper.hpp"]);
    await resolve(["include/Amb.hpp"]);
    await resolver(runner)(["include/Amb.hpp"]);
    expect(calls).toHaveLength(1);
    await resolver(runner, "other-rev")(["include/Amb.hpp"]);
    expect(calls).toHaveLength(2);
  });

  test("an index that cannot load, or no revision, yields no verdicts", async () => {
    const failed = indexRunner({ exitCode: 2 });
    expect((await resolver(failed.runner)(["include/Helper.hpp"])).size).toBe(0);
    const malformed = indexRunner({ exitCode: 0, stdout: "{}" });
    expect((await resolver(malformed.runner, "rev-2")(["include/Helper.hpp"])).size).toBe(0);
    const noRev = indexRunner();
    expect((await resolver(noRev.runner, null)(["include/Helper.hpp"])).size).toBe(0);
    expect(noRev.calls).toEqual([]);
  });
});
