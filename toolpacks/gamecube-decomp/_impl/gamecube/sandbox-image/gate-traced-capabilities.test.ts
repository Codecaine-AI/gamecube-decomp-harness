import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const GATE = join(import.meta.dir, "gate_traced_capabilities.py");
const POINTS = ["vreg_identity", "coloring", "frame"];
const VERSIONS = ["1.2.5", "1.2.5n"];
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const put = (path: string, content: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };
const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");

type Unit = { unit: string; version: string; status: string; ok_off: boolean; ok_on: boolean };
/** validate/byte_identity.py's report: per-unit records and the totals it derives from them. */
function report(units: Unit[], versions = VERSIONS, extra: Record<string, unknown> = {}) {
  const totals = Object.fromEntries(versions.map((v) => {
    const rows = units.filter((u) => u.version === v);
    return [v, { units: rows.length, identical_off: rows.filter((u) => u.ok_off).length, identical_on: rows.filter((u) => u.ok_on).length,
      mismatched: rows.filter((u) => u.status === "mismatch").length, stock_failed: rows.filter((u) => u.status === "stock_failed").length,
      traced_failed: rows.filter((u) => u.status === "traced_failed").length }];
  }));
  return { schema: "mwcc-native-byte-identity-v1", selection: { all: true }, skipped: { not_selected: 0, versions: {} },
    traced_sha1: Object.fromEntries(versions.map((v) => [v, sha1(`traced ${v}`)])), totals, units, ...extra };
}
const identical = (game: string, version: string, n: number): Unit[] =>
  Array.from({ length: n }, (_, i) => ({ unit: `build/${game}/u${i}.o`, version, status: "identical", ok_off: true, ok_on: true }));
const stockFailed = (unit: string, version: string): Unit => ({ unit, version, status: "stock_failed", ok_off: false, ok_on: false });

/** A staged traced-compilers dir: binaries, presence evidence, and both games requiring both versions. */
function staged(requirements: Record<string, unknown> = { sms: { required: VERSIONS }, melee: { required: VERSIONS } }) {
  const out = mkdtempSync(join(tmpdir(), "traced-gate-")); roots.push(out);
  const caps: Record<string, unknown> = {};
  for (const ver of VERSIONS) {
    put(join(out, "GC", ver, "mwcceppc.exe"), `traced ${ver}`);
    caps[ver] = { traced_sha1: sha1(`traced ${ver}`), points: POINTS, unavailable: { scheduling: "milestone 2" } };
    put(join(out, "validation", `presence-${ver}.json`), JSON.stringify({ schema: "mwcc-native-event-presence-v1",
      compiler_sha1: sha1(`traced ${ver}`), identity: { off_equals_on: true, stock_equals_off: true },
      points: Object.fromEntries(POINTS.map((p) => [p, { ok: true }])) }));
  }
  put(join(out, "CAPABILITIES.json"), JSON.stringify({ schema: "mwcc-native-capabilities-v1", pin: "92f893f", versions: caps }));
  put(join(out, "requirements.json"), JSON.stringify({ games: requirements }));
  const sweep = (game: string, name: string, body: unknown) => put(join(out, "validation/byte-identity", game, name), JSON.stringify(body));
  return { out, sweep };
}
/** Clean full sweeps for both games and both versions. */
function bothGames(sweep: (game: string, name: string, body: unknown) => void) {
  for (const game of ["sms", "melee"]) sweep(game, "one-fn.json", report(VERSIONS.flatMap((v) => identical(game, v, 5))));
}
function gate(out: string, versions = VERSIONS.join(",")) {
  const result = Bun.spawnSync(["python3", "-I", GATE, out, versions]);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  return { stdout: result.stdout.toString(), caps: JSON.parse(readFileSync(join(out, "CAPABILITIES.json"), "utf8")).versions };
}

test("a binary with matching sha1, event presence and passing full sweeps from every requiring game stays enabled", () => {
  const { out, sweep } = staged();
  bothGames(sweep);
  const { stdout, caps } = gate(out);
  expect(stdout).toContain("1.2.5: enabled (vreg_identity, coloring, frame)");
  expect(caps["1.2.5"].disabled).toBeUndefined();
  expect(caps["1.2.5n"].points).toEqual(POINTS);
});

test("a staged exe whose sha1 differs from traced_sha1 is disabled with the reason, binary kept", () => {
  const { out, sweep } = staged();
  bothGames(sweep);
  writeFileSync(join(out, "GC/1.2.5/mwcceppc.exe"), "rebuilt");
  const { caps } = gate(out);
  expect(caps["1.2.5"].points).toEqual([]);
  expect(caps["1.2.5"].disabled).toBe(`traced_sha1 mismatch: staged ${sha1("rebuilt")}, capabilities ${sha1("traced 1.2.5")}`);
  expect(caps["1.2.5"].unavailable.coloring).toBe(caps["1.2.5"].disabled);
  expect(caps["1.2.5"].unavailable.scheduling).toBe("milestone 2");
  expect(caps["1.2.5n"].points).toEqual(POINTS);
  expect(readFileSync(join(out, "GC/1.2.5/mwcceppc.exe"), "utf8")).toBe("rebuilt");
});

test("a full sweep in which the stock compiler built nothing compares no units and disables", () => {
  const { out, sweep } = staged({ sms: { required: ["1.2.5"], stock_exclusions: { "1.2.5": Array.from({ length: 20 }, (_, i) => `build/sms/u${i}.o`) } } });
  sweep("sms", "one-fn.json", report(Array.from({ length: 20 }, (_, i) => stockFailed(`build/sms/u${i}.o`, "1.2.5")), ["1.2.5"]));
  expect(gate(out, "1.2.5").caps["1.2.5"].disabled).toBe("sms/one-fn.json: no units compared");
});

test("evidence from one game for a version two games require disables it", () => {
  const { out, sweep } = staged();
  sweep("sms", "one-fn.json", report(VERSIONS.flatMap((v) => identical("sms", v, 5))));
  const { caps } = gate(out);
  expect(caps["1.2.5n"].disabled).toBe("no byte-identity evidence from melee");
  // A report outside byte-identity/<game>/ names no game and is not evidence.
  put(join(out, "validation/byte_identity.json"), JSON.stringify(report(VERSIONS.flatMap((v) => identical("melee", v, 5)))));
  expect(gate(out).caps["1.2.5"].disabled).toBe("no byte-identity evidence from melee");
});

test("stock failures pass only when listed in that game's exclusions for the version", () => {
  const units = [...identical("sms", "1.2.5", 5), stockFailed("build/sms/macros.o", "1.2.5")];
  const unlisted = staged({ sms: { required: ["1.2.5"] } });
  unlisted.sweep("sms", "one-fn.json", report(units, ["1.2.5"]));
  expect(gate(unlisted.out, "1.2.5").caps["1.2.5"].disabled).toBe("sms/one-fn.json: 1 unlisted stock failures (e.g. build/sms/macros.o)");
  const listed = staged({ sms: { required: ["1.2.5"], stock_exclusions: { "1.2.5": ["build/sms/macros.o"] } } });
  listed.sweep("sms", "one-fn.json", report(units, ["1.2.5"]));
  expect(gate(listed.out, "1.2.5").caps["1.2.5"].points).toEqual(POINTS);
  // Excluding the unit for another version does not cover it.
  const wrongVersion = staged({ sms: { required: ["1.2.5"], stock_exclusions: { "1.2.5n": ["build/sms/macros.o"] } } });
  wrongVersion.sweep("sms", "one-fn.json", report(units, ["1.2.5"]));
  expect(gate(wrongVersion.out, "1.2.5").caps["1.2.5"].disabled).toContain("unlisted stock failures");
});

test("on/off counts inconsistent with the compared units disable", () => {
  const { out, sweep } = staged({ sms: { required: ["1.2.5"] } });
  const body = report(identical("sms", "1.2.5", 5), ["1.2.5"]);
  (body.totals["1.2.5"] as Record<string, number>).identical_on = 4;
  sweep("sms", "one-fn.json", body);
  expect(gate(out, "1.2.5").caps["1.2.5"].disabled).toBe("sms/one-fn.json: 5 compared but 5 identical off, 4 identical on");
  const records = staged({ sms: { required: ["1.2.5"] } });
  const rows = identical("sms", "1.2.5", 5);
  const missingOn = report(rows, ["1.2.5"]);
  (missingOn.units as Unit[])[2]!.ok_on = false;
  (missingOn.totals["1.2.5"] as Record<string, number>).identical_on = 5;
  records.sweep("sms", "one-fn.json", missingOn);
  expect(gate(records.out, "1.2.5").caps["1.2.5"].disabled).toBe("sms/one-fn.json: a compared unit is not identical with tracing off and on");
});

test("mismatches, sample-only sweeps and a failing sweep beside a passing one all disable", () => {
  const { out, sweep } = staged();
  bothGames(sweep);
  sweep("melee", "all-fns.json", report([...identical("melee", "1.2.5", 4),
    { unit: "build/melee/bad.o", version: "1.2.5", status: "mismatch", ok_off: false, ok_on: false }, ...identical("melee", "1.2.5n", 5)]));
  const { caps } = gate(out);
  expect(caps["1.2.5"].disabled).toBe("melee/all-fns.json: byte identity failed (1 mismatched, 0 traced failures)");
  expect(caps["1.2.5n"].points).toEqual(POINTS);
  const sampled = staged();
  for (const game of ["sms", "melee"]) sampled.sweep(game, "sample.json", report(VERSIONS.flatMap((v) => identical(game, v, 3)), VERSIONS, { selection: { sample: 3 } }));
  expect(gate(sampled.out).caps["1.2.5"].disabled).toBe("no byte-identity evidence from melee, sms");
});

test("event-presence evidence must name the staged binary", () => {
  const { out, sweep } = staged();
  bothGames(sweep);
  const presence = JSON.parse(readFileSync(join(out, "validation/presence-1.2.5n.json"), "utf8"));
  writeFileSync(join(out, "validation/presence-1.2.5n.json"), JSON.stringify({ ...presence, compiler_sha1: sha1("other") }));
  rmSync(join(out, "validation/presence-1.2.5.json"));
  const { caps } = gate(out);
  expect(caps["1.2.5"].disabled).toBe(`no event-presence evidence for ${sha1("traced 1.2.5")}`);
  expect(caps["1.2.5n"].disabled).toBe(`no event-presence evidence for ${sha1("traced 1.2.5n")}`);
});
