import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  certifiedDecisionsTsv,
  functionSignatureKey,
  isFabricatedStub,
  signatureNameAndArity,
  spliceCertifiedFile,
  type CertifiedFunctionDecision,
  type CertifiedSymbolEvidence,
  type SyncCertificationStatus,
} from "./certified-merge.js";

const dirs: string[] = [];

/** The manual sync's `name/params` key of a signature key. */
function legacy(key: string): string {
  const { name, arity } = signatureNameAndArity(key);
  return arity === null ? name : `${name}/${arity}`;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The file as `git merge` conflicts it (ort, via `git merge-tree`), the text the certified merge reads. */
function conflicted(base: string, ours: string, upstream: string): string {
  const dir = mkdtempSync(join(tmpdir(), "certified-merge-test-"));
  dirs.push(dir);
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", "-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    return result.stdout.toString();
  };
  git("init", "-q", "-b", "main");
  const commit = (text: string, message: string) => {
    writeFileSync(join(dir, "file.cpp"), text);
    git("add", "file.cpp");
    git("commit", "-q", "--allow-empty", "-m", message);
  };
  commit(base, "base");
  git("checkout", "-q", "-b", "upstream");
  commit(upstream, "upstream");
  git("checkout", "-q", "main");
  commit(ours, "ours");
  const tree = git("merge-tree", "--write-tree", "--no-messages", "main", "upstream").split("\n")[0]!.trim();
  return git("show", `${tree}:file.cpp`);
}

function cpp(bodies: Record<string, string>, prefix = ""): string {
  return [`#include "Foo.hpp"`, "", prefix, ...Object.entries(bodies).map(([signature, body]) => `${signature}\n{\n${body}\n}\n`)].join("\n");
}

function evidence(status: SyncCertificationStatus, ours: number | null, upstream: number | null, symbol = "sym"): CertifiedSymbolEvidence {
  return { unit: "mario/Foo/foo", symbol, oursScore: ours, upstreamScore: upstream, certification: { status, verdict: status === "certified" ? "pass" : null } };
}

function splice(base: string, ours: string, upstream: string, byKey: Record<string, CertifiedSymbolEvidence[]>) {
  const result = spliceCertifiedFile({
    path: "src/Foo/foo.cpp",
    conflictedText: conflicted(base, ours, upstream),
    baseText: base,
    oursText: ours,
    upstreamText: upstream,
    evidence: (key) => byKey[key] ?? [],
  });
  expect(result.error).toBeNull();
  const decision = (key: string) => result.decisions.find((item) => item.function === key)!;
  return { ...result, decision };
}

const base = cpp({ "void TFoo::alpha(int a)": "    a = 0;", "void TFoo::beta(int b)": "    b = 0;", "void TFoo::gamma()": "    int g = 0;" });
const ours = cpp({ "void TFoo::alpha(int a)": "    a = 1;", "void TFoo::beta(int b)": "    b = 1;", "void TFoo::gamma()": "    int g = 1;" });
const upstream = cpp({ "void TFoo::alpha(int a)": "    a = 2;", "void TFoo::beta(int b)": "    b = 2;", "void TFoo::gamma()": "    int g = 2;" });

describe("certified sync merge rule", () => {
  test("keeps a certified, strictly higher ours; displaces an uncertified higher ours; a tie goes to upstream", () => {
    const result = splice(base, ours, upstream, {
      "TFoo::alpha(int)": [evidence("certified", 99, 90)],
      "TFoo::beta(int)": [evidence("unverified", 95, 80)],
      "TFoo::gamma()": [evidence("certified", 50, 50)],
    });
    expect(result.hunks).toBe(3);
    expect(result.text).toContain("a = 1;");
    expect(result.text).toContain("b = 2;");
    expect(result.text).toContain("int g = 2;");
    expect(result.text).not.toContain("<<<<<<<");
    expect(result.decision("TFoo::alpha(int)")).toMatchObject({ category: "both_changed", result: "ours", reason: "certified_ours_higher", displaced: false, inConflict: true });
    expect(result.decision("TFoo::beta(int)")).toMatchObject({ result: "upstream", reason: "uncertified_ours_displaced", displaced: true, note: "uncertified ours displaced by upstream" });
    expect(result.decision("TFoo::gamma()")).toMatchObject({ result: "upstream", reason: "upstream_not_lower", displaced: false });
  });

  test("a certified ours needs every symbol higher; missing scores and no report symbol go to upstream", () => {
    const result = splice(base, ours, upstream, {
      "TFoo::alpha(int)": [evidence("certified", 99, 90, "a1"), evidence("certified", 80, 85, "a2")],
      "TFoo::beta(int)": [evidence("certified", 99, null)],
    });
    expect(result.decision("TFoo::alpha(int)")).toMatchObject({ result: "upstream", reason: "upstream_not_lower" });
    expect(result.decision("TFoo::beta(int)")).toMatchObject({ result: "upstream", reason: "score_missing" });
    expect(result.decision("TFoo::gamma()")).toMatchObject({ result: "upstream", reason: "score_missing" });
  });

  test("a fabricated stub never beats upstream, even certified and higher", () => {
    const stubbed = cpp({ "void TFoo::alpha(int a)": "    // TODO: decompile", "void TFoo::beta(int b)": "    b = 0;", "void TFoo::gamma()": "    int g = 0;" });
    const result = splice(base, stubbed, upstream, { "TFoo::alpha(int)": [evidence("certified", 100, 40)] });
    expect(result.text).toContain("a = 2;");
    expect(result.decision("TFoo::alpha(int)")).toMatchObject({ result: "upstream", reason: "ours_fabricated_stub", displaced: false });
  });

  test("ours-only helper edits outside the conflict stay exactly as git merged them (review H3 #4, #5)", () => {
    const twoBase = cpp({ "int helper(int x)": "    return x + 0;", "void TFoo::keep(int k)": "    k = 0;", "void TFoo::beta(int b)": "    b = 0;" });
    // Ours edits an external helper and adds a static one; both serve beta, which goes to upstream.
    const twoOurs = cpp({ "int helper(int x)": "    return x + 1;", "void TFoo::keep(int k)": "    k = 0;", "void TFoo::beta(int b)": "    b = helper(1) + local(2);" },
      "static inline int local(int x)\n{\n    return x;\n}\n");
    const twoUpstream = cpp({ "int helper(int x)": "    return x + 0;", "void TFoo::keep(int k)": "    k = 0;", "void TFoo::beta(int b)": "    b = 2;" });
    const result = splice(twoBase, twoOurs, twoUpstream, { "TFoo::beta(int)": [evidence("never_gated", 95, 80)] });
    expect(result.text).toContain("b = 2;");
    expect(result.text).toContain("return x + 1;");
    expect(result.text).toContain("static inline int local(int x)");
    expect(result.decision("helper(int)")).toMatchObject({ result: "ours", reason: "outside_conflict" });
    expect(result.decision("local(int)")).toMatchObject({ result: "ours", reason: "outside_conflict" });
  });

  test("ours-only changes in a hunk follow git unless upstream's text scores strictly higher", () => {
    const sameBase = cpp({ "void TFoo::alpha(int a)": "    a = 0;", "void TFoo::beta(int b)": "    b = 0;" });
    const sameOurs = cpp({ "void TFoo::alpha(int a)": "    a = 1;", "void TFoo::beta(int b)": "    b = 1;" });
    const upstreamAdds = cpp({ "void TFoo::alpha(int a)": "    a = 0;", "void TFoo::beta(int b)": "    b = 0;" }) + "\nvoid TFoo::added()\n{\n}\n";
    const result = spliceCertifiedFile({
      path: "src/Foo/foo.cpp", conflictedText: conflicted(sameBase, sameOurs, upstreamAdds), baseText: sameBase, oursText: sameOurs, upstreamText: upstreamAdds,
      evidence: (key) => key === "TFoo::beta(int)" ? [evidence("never_gated", 70, 90)] : [],
    });
    // No conflicting hunk: git's merge stands and every function keeps its side.
    expect(result.hunks).toBe(0);
    expect(result.text).toContain("a = 1;");
    expect(result.decisions.find((item) => item.function === "TFoo::added()")).toMatchObject({ category: "upstream_only_change", result: "upstream", reason: "outside_conflict" });
  });

  test("unresolvable function boundaries return an error for the operator path", () => {
    const broken = "void TFoo::alpha(int a)\n{\n    a = 1;\n";
    const result = spliceCertifiedFile({ path: "src/Foo/foo.cpp", conflictedText: conflicted(base, broken, upstream), baseText: base, oursText: broken, upstreamText: upstream, evidence: () => [] });
    expect(result.error).toContain("ours: unbalanced braces");
  });

  test("functions are identified by full signature: names, defaults and spacing do not split them, overloads do", () => {
    expect(functionSignatureKey("MSound::MSound(JKRHeap* param_1, JKRHeap *heap, u32 size = 0x100)")).toBe("MSound::MSound(JKRHeap*,JKRHeap*,u32)");
    expect(functionSignatureKey("TFoo::TFoo(int a) : mA(a), mB(f(a))")).toBe("TFoo::TFoo(int)");
    expect(functionSignatureKey("const TVec3<f32>& TFoo::get(const TVec3 < f32 > & v, unsigned int, char buf[4]) const")).toBe("TFoo::get(const TVec3<f32>&,unsigned int,char[4])const");
    expect(functionSignatureKey("void f(float x)")).not.toBe(functionSignatureKey("void f(int x)"));
    expect(functionSignatureKey("bool TFoo::operator==(const TFoo& other) const")).toBeNull();
  });

  test("an ours-added overload survives beside upstream's (review H1 #2)", () => {
    const overBase = cpp({ "void f(int a)": "    a = 0;", "void TFoo::alpha(int a)": "    a = 0;" });
    const overOurs = cpp({ "void f(int a)": "    a = 0;", "void f(float a)": "    a = 0.5f;", "void TFoo::alpha(int a)": "    a = 1;" });
    const overUpstream = cpp({ "void f(int a)": "    a = 0;", "void TFoo::alpha(int a)": "    a = 2;" });
    const result = splice(overBase, overOurs, overUpstream, { "TFoo::alpha(int)": [evidence("never_gated", 90, 95)] });
    expect(result.text).toContain("void f(int a)");
    expect(result.text).toContain("void f(float a)");
    expect(result.decision("f(float)")).toMatchObject({ category: "ours_only_change", result: "ours" });
  });

  test("identical definitions in #if / #else branches both survive an unrelated conflict (review H2 #2)", () => {
    const versioned = "#if VERSION == JP\nvoid f()\n{\n    x = 1;\n}\n#else\nvoid f()\n{\n    x = 1;\n}\n#endif\n";
    const condBase = cpp({ "void TFoo::alpha(int a)": "    a = 0;" }) + versioned;
    const condOurs = cpp({ "void TFoo::alpha(int a)": "    a = 1;" }) + versioned;
    const condUpstream = cpp({ "void TFoo::alpha(int a)": "    a = 2;" }) + versioned;
    const result = splice(condBase, condOurs, condUpstream, { "TFoo::alpha(int)": [evidence("never_gated", 90, 95)] });
    expect(result.text.split("void f()").length - 1).toBe(2);
    expect(result.text).toContain("#else\nvoid f()\n{\n    x = 1;\n}\n#endif");
  });

  test("an ours addition is kept next to a same-scope neighbour, even before the first function (review H3 #4)", () => {
    const addBase = cpp({ "void TFoo::alpha(int a)": "    a = 0;" });
    // Both sides add a function at the same place: once after alpha, once before it.
    for (const [ours, upstream] of [
      [`${addBase}\nvoid publicApi()\n{\n    z = 1;\n}\n`, `${addBase}\nvoid upstreamAdded()\n{\n    z = 2;\n}\n`],
      [addBase.replace("void TFoo::alpha", "void publicApi()\n{\n    z = 1;\n}\n\nvoid TFoo::alpha"), addBase.replace("void TFoo::alpha", "void upstreamAdded()\n{\n    z = 2;\n}\n\nvoid TFoo::alpha")],
    ] as const) {
      const result = splice(addBase, ours, upstream, {});
      expect(result.hunks).toBeGreaterThan(0);
      expect(result.text).toContain("void publicApi()\n{\n    z = 1;\n}");
      expect(result.text).toContain("void upstreamAdded()");
      expect(result.decision("publicApi()")).toMatchObject({ result: "ours", reason: "ours_only_addition" });
    }
    // No neighbour in its own scope (a namespace only ours opened): the operator decides.
    const lonely = spliceCertifiedFile({
      path: "src/Foo/foo.cpp", baseText: "int x;\n", oursText: "int x;\nnamespace N {\nvoid only()\n{\n}\n}\n", upstreamText: "int y;\nvoid other()\n{\n}\n",
      conflictedText: conflicted("int x;\n", "int x;\nnamespace N {\nvoid only()\n{\n}\n}\n", "int y;\nvoid other()\n{\n}\n"), evidence: () => [],
    });
    expect(lonely.error).toContain("no place in scope [namespace N] to keep only()@[namespace N]");
  });

  test("functions in different namespaces are distinct, even with identical bodies (review H3 #2)", () => {
    const spaced = (alpha: number) => `namespace A {\nvoid f()\n{\n    x = 1;\n}\n}\n\nnamespace B {\nvoid f()\n{\n    x = 1;\n}\n}\n\n${cpp({ "void TFoo::alpha(int a)": `    a = ${alpha};` })}`;
    const result = splice(spaced(0), spaced(1), spaced(2), { "TFoo::alpha(int)": [evidence("never_gated", 90, 95)] });
    expect(result.text).toContain("namespace A {\nvoid f()\n{\n    x = 1;\n}\n}");
    expect(result.text).toContain("namespace B {\nvoid f()\n{\n    x = 1;\n}\n}");
    expect(result.text).toContain("a = 2;");
  });

  test("whitespace inside a literal is part of it: \"a b\" vs \"a  b\" goes to the operator (review H4 #1)", () => {
    const named = (name: string) => `class TBar {\npublic:\n    const char* name() { return "${name}"; }\n};\n\n${cpp({ "void TFoo::alpha(int a)": "    a = 0;" })}`;
    const result = spliceCertifiedFile({
      path: "src/Foo/foo.cpp", conflictedText: conflicted(named("x"), named("a b"), named("a  b")),
      baseText: named("x"), oursText: named("a b"), upstreamText: named("a  b"), evidence: () => [],
    });
    expect(result.error).toContain("conflicting code the rule cannot map to a function: {class TBar}");
    // Whitespace outside literals still does not count.
    const spaced = (ret: string) => `class TBar {\npublic:\n    int get() { ${ret} }\n};\n\n${cpp({ "void TFoo::alpha(int a)": "    a = 0;" })}`;
    const reformatted = spliceCertifiedFile({
      path: "src/Foo/foo.cpp", conflictedText: conflicted(spaced("return 1;"), spaced("return  1;"), spaced("return   1;")),
      baseText: spaced("return 1;"), oursText: spaced("return  1;"), upstreamText: spaced("return   1;"), evidence: () => [],
    });
    expect(reformatted.error).toBeNull();
  });

  test("a comment separates tokens: return/**/foo() is not returnfoo() (review H5)", () => {
    const body = (ret: string) => `class TBar {\npublic:\n    int get() { ${ret} }\n};\n\n${cpp({ "void TFoo::alpha(int a)": "    a = 0;" })}`;
    const result = spliceCertifiedFile({
      path: "src/Foo/foo.cpp", conflictedText: conflicted(body("return 0;"), body("return/**/foo();"), body("returnfoo();")),
      baseText: body("return 0;"), oursText: body("return/**/foo();"), upstreamText: body("returnfoo();"), evidence: () => [],
    });
    expect(result.error).toContain("conflicting code the rule cannot map to a function: {class TBar}");
    // A comment-only difference is still no code change: upstream's text, no operator.
    const commented = spliceCertifiedFile({
      path: "src/Foo/foo.cpp", conflictedText: conflicted(body("return 1;"), body("return /* ours */ 1;"), body("return /* upstream */ 1;")),
      baseText: body("return 1;"), oursText: body("return /* ours */ 1;"), upstreamText: body("return /* upstream */ 1;"), evidence: () => [],
    });
    expect(commented.error).toBeNull();
    expect(isFabricatedStub("void f()\n{\n    // only a comment\n    /* and another */\n}")).toBe(true);
  });

  test("a literal-only change inside an inline member is a real change: the operator decides (review H3 #3)", () => {
    const named = (name: string) => `class TBar {\npublic:\n    const char* name() { return "${name}"; }\n};\n\n${cpp({ "void TFoo::alpha(int a)": "    a = 0;" })}`;
    const result = spliceCertifiedFile({
      path: "src/Foo/foo.cpp", conflictedText: conflicted(named("base"), named("ours"), named("upstream")),
      baseText: named("base"), oursText: named("ours"), upstreamText: named("upstream"), evidence: () => [],
    });
    expect(result.error).toContain("conflicting code the rule cannot map to a function: {class TBar}");
  });

  test("a conflict in code the rule cannot map (class bodies, operators) goes to the operator (review H1 #4)", () => {
    const classBody = (value: number) => `class TBar {\npublic:\n    int get() { return ${value}; }\n};\n\n${cpp({ "void TFoo::alpha(int a)": "    a = 0;" })}`;
    const classResult = spliceCertifiedFile({
      path: "src/Foo/foo.cpp", conflictedText: conflicted(classBody(0), classBody(1), classBody(2)),
      baseText: classBody(0), oursText: classBody(1), upstreamText: classBody(2), evidence: () => [],
    });
    expect(classResult.error).toContain("conflicting code the rule cannot map to a function: {class TBar}");
    const operator = (value: number) => `bool TFoo::operator==(const TFoo& other) const\n{\n    return ${value};\n}\n`;
    const operatorResult = spliceCertifiedFile({
      path: "src/Foo/foo.cpp", conflictedText: conflicted(operator(0), operator(1), operator(2)),
      baseText: operator(0), oursText: operator(1), upstreamText: operator(2), evidence: () => [],
    });
    expect(operatorResult.error).toContain("{bool TFoo::operator==(const TFoo&other)const}");
    // A class body that only declares (no code) still resolves to upstream.
    const declares = (field: string) => `class TBar {\n    int ${field};\n};\n\n${cpp({ "void TFoo::alpha(int a)": "    a = 0;" })}`;
    const declared = spliceCertifiedFile({
      path: "src/Foo/foo.cpp", conflictedText: conflicted(declares("a"), declares("b"), declares("c")),
      baseText: declares("a"), oursText: declares("b"), upstreamText: declares("c"), evidence: () => [],
    });
    expect(declared.error).toBeNull();
    expect(declared.text).toContain("int c;");
  });

  test("the decision record has one row per function symbol with the merged score", () => {
    const decisions: CertifiedFunctionDecision[] = [{
      path: "src/Foo/foo.cpp", function: "TFoo::beta(int)", category: "both_changed", result: "upstream", reason: "uncertified_ours_displaced",
      inConflict: true, displaced: true, note: "uncertified ours displaced by upstream",
      symbols: [{ unit: "mario/Foo/foo", symbol: "beta__4TFooFi", oursScore: 95, upstreamScore: 80, certification: { status: "uncertified", verdict: "unresolved" } }],
    }];
    const merged = { units: [{ name: "mario/Foo/foo", metadata: { source_path: "src/Foo/foo.cpp" }, functions: [{ name: "beta__4TFooFi", fuzzy_match_percent: 80 }] }] };
    const rows = certifiedDecisionsTsv(decisions, merged).trim().split("\n").map((row) => row.split("\t"));
    expect(rows[0]).toEqual(["file", "function", "category", "result", "reason", "ours", "upstream", "merged", "gate", "symbol", "in_conflict", "note"]);
    expect(rows[1]).toEqual(["src/Foo/foo.cpp", "TFoo::beta(int)", "both_changed", "upstream", "uncertified_ours_displaced", "95", "80", "80", "uncertified:unresolved", "beta__4TFooFi", "1", "uncertified ours displaced by upstream"]);
  });
});

describe("replay of the 2026-10-17 SMS manual sync (sms-sync-c)", () => {
  const fixtures = join(import.meta.dir, "__fixtures__", "certified-merge");
  const reference = readFileSync(join(fixtures, "function-decisions.tsv"), "utf8").trim().split("\n").slice(1).map((line) => {
    const [file, fn, category, result, ours, upstream, , gate, symbol] = line.split("\t");
    return { file: file!, fn: fn!, category: category!, result: result!, ours: ours === "-" ? null : Number(ours), upstream: upstream === "-" ? null : Number(upstream), gate: gate!, symbol: symbol! };
  });

  for (const path of ["src/MSound/MSound.cpp", "src/Animal/AnimalBase.cpp"]) {
    test(`${path}: every function resolves as the certified manual sync did`, () => {
      const stem = join(fixtures, path.replaceAll("/", "__"));
      const read = (side: string) => readFileSync(`${stem}.${side}`, "utf8");
      const [baseText, oursText, upstreamText] = [read("base"), read("ours"), read("upstream")];
      const rows = reference.filter((row) => row.file === path);
      const result = spliceCertifiedFile({
        path, conflictedText: conflicted(baseText, oursText, upstreamText), baseText, oursText, upstreamText,
        evidence: (key) => rows.filter((row) => row.fn === legacy(key) && row.symbol !== "-").map((row) => ({
          unit: `mario/${path.slice(4, path.lastIndexOf("."))}`, symbol: row.symbol, oursScore: row.ours, upstreamScore: row.upstream,
          certification: { status: row.gate === "pass" ? "certified" as const : "uncertified" as const, verdict: row.gate },
        })),
      });
      expect(result.error).toBeNull();
      expect(result.text).not.toContain("<<<<<<<");
      // Every function the manual sync recorded for the file lands on the same side.
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const decision = result.decisions.find((item) => legacy(item.function) === row.fn);
        expect({ fn: row.fn, result: decision?.result as string | undefined }).toEqual({ fn: row.fn, result: row.result });
      }
    });
  }

  test("AnimalBase displaces the uncertified, higher perform as an open target", () => {
    const stem = join(fixtures, "src__Animal__AnimalBase.cpp");
    const read = (side: string) => readFileSync(`${stem}.${side}`, "utf8");
    const rows = reference.filter((row) => row.file === "src/Animal/AnimalBase.cpp");
    const result = spliceCertifiedFile({
      path: "src/Animal/AnimalBase.cpp", conflictedText: conflicted(read("base"), read("ours"), read("upstream")),
      baseText: read("base"), oursText: read("ours"), upstreamText: read("upstream"),
      evidence: (key) => rows.filter((row) => row.fn === legacy(key) && row.symbol !== "-").map((row) => ({
        unit: "mario/Animal/AnimalBase", symbol: row.symbol, oursScore: row.ours, upstreamScore: row.upstream,
        certification: { status: row.gate === "pass" ? "certified" as const : "uncertified" as const, verdict: row.gate },
      })),
    });
    expect(result.decisions.find((decision) => legacy(decision.function) === "TAnimalBase::perform/2")).toMatchObject({
      result: "upstream", reason: "uncertified_ours_displaced", displaced: true, inConflict: true,
    });
    expect(result.decisions.find((decision) => legacy(decision.function) === "TAnimalBase::execWalk/1")).toMatchObject({ result: "ours" });
  });

  test("MSound keeps the certified, higher setParameterSeqSync and gives the uncertified functions to upstream", () => {
    const stem = join(fixtures, "src__MSound__MSound.cpp");
    const read = (side: string) => readFileSync(`${stem}.${side}`, "utf8");
    const rows = reference.filter((row) => row.file === "src/MSound/MSound.cpp");
    const result = spliceCertifiedFile({
      path: "src/MSound/MSound.cpp", conflictedText: conflicted(read("base"), read("ours"), read("upstream")),
      baseText: read("base"), oursText: read("ours"), upstreamText: read("upstream"),
      evidence: (key) => rows.filter((row) => row.fn === legacy(key) && row.symbol !== "-").map((row) => ({
        unit: "mario/MSound/MSound", symbol: row.symbol, oursScore: row.ours, upstreamScore: row.upstream,
        certification: { status: row.gate === "pass" ? "certified" as const : "uncertified" as const, verdict: row.gate },
      })),
    });
    // git merges both edits without a hunk here; the rule still decides it (certified and higher: ours).
    expect(result.decisions.find((decision) => legacy(decision.function) === "MSSeCallBack::setParameterSeqSync/2")).toMatchObject({ result: "ours", reason: "certified_ours_higher", inConflict: false });
    expect(result.decisions.find((decision) => legacy(decision.function) === "MSound::MSound/6")).toMatchObject({ result: "upstream" });
  });
});
