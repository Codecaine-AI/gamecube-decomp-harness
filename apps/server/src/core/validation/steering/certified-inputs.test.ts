import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "@server/infrastructure/shell";
import type { WorkspaceExec } from "@server/infrastructure/shell";
import { certifiedInputsFromMwcc, compileInputsFresh, sandboxGeneratedInputs } from "./certified-inputs.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(repo: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

const sha256 = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
// Shift-JIS bytes: hashed as bytes, never as decoded text.
const SJIS = Buffer.from([0x2f, 0x2f, 0x20, 0x82, 0xa0, 0x0a]);

/** claim base C (source, a header with Shift-JIS bytes), then `land` committed as P, then the patch committed as I. */
function repo(land?: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "certified-inputs-"));
  dirs.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "include"), { recursive: true });
  writeFileSync(join(root, "src/a.c"), "int a = 0;\n");
  writeFileSync(join(root, "include/a.h"), SJIS);
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "T"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "claim base"]);
  const claimBaseRev = git(root, ["rev-parse", "HEAD"]);
  if (land) {
    land(root);
    git(root, ["add", "-A"]);
    git(root, ["commit", "-qm", "landed by another worker"]);
  }
  const preApplyRev = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(root, "src/a.c"), "int a = 1;\n");
  git(root, ["commit", "-qam", "integration"]);
  return { root, claimBaseRev, preApplyRev, integratedRev: git(root, ["rev-parse", "HEAD"]) };
}

const depfile = (deps: Record<string, string>) => ({ kind: "depfile", unit: "u", deps, compile: { mw_version: "GC/1.2.5", cflags: "-O4", compiler_sha256: null } });
const certified = { "src/a.c": sha256("int a = 1;\n"), "include/a.h": sha256(SJIS) };

async function check(r: ReturnType<typeof repo>, inputs: unknown) {
  return compileInputsFresh({ inputs, ...r, repoRoot: r.root, run: runCommand });
}

describe("compileInputsFresh", () => {
  test("unchanged inputs (Shift-JIS bytes included) are fresh", async () => {
    expect(await check(repo(), depfile(certified))).toEqual({ fresh: true, checked: 2, changed: [], reason: null });
  });

  test("a recorded input with other content at the landing, or a changed build configuration, is not fresh", async () => {
    const header = await check(repo((root) => writeFileSync(join(root, "include/a.h"), "// H1\n")), depfile(certified));
    expect(header).toMatchObject({ fresh: false, changed: ["include/a.h"] });
    const config = await check(repo((root) => writeFileSync(join(root, "configure.py"), "flags = '-O3'\n")), depfile(certified));
    expect(config).toMatchObject({ fresh: false, changed: ["configure.py"] });
  });

  test("a generated input counts through its recorded generators: unchanged is fresh, a changed generator is stale", async () => {
    // build/gen/a_gen.h was generated from include/gen.def; the certified build read it.
    const MCH = "build/gen/a_gen.h";
    const withGen = (root: string) => writeFileSync(join(root, "include/gen.def"), "VALUE 1\n");
    const bound = { ...depfile({ ...certified, [MCH]: sha256("generated") }), generated: { [MCH]: { generators: { "include/gen.def": sha256("VALUE 1\n") } } } };
    const unchanged = repo(withGen);
    expect(await check(unchanged, bound)).toEqual({ fresh: true, checked: 3, changed: [], reason: null });
    // Another worker changes the generator between the gate and the landing: the generated input would differ.
    const changedGenerator = repo((root) => writeFileSync(join(root, "include/gen.def"), "VALUE 2\n"));
    expect(await check(changedGenerator, bound)).toMatchObject({ fresh: false, changed: ["include/gen.def"] });
  });

  test("a generated input without recorded generators, or with an unverifiable one, is never fresh", async () => {
    const r = repo();
    const MCH = "build/gen/a_gen.h";
    const unbound = depfile({ ...certified, [MCH]: sha256("generated") });
    expect(await check(r, unbound)).toMatchObject({ fresh: false, changed: [MCH], checked: 0 });
    expect((await check(r, { ...unbound, generated: { [MCH]: { error: "build/gen/a_gen.h is not up to date with its inputs" } } })).reason)
      .toContain("is not up to date with its inputs");
    expect(await check(r, { ...unbound, generated: { [MCH]: { generators: { "external:/opt/x.def": sha256("x") } } } }))
      .toMatchObject({ fresh: false, changed: [MCH] });
    // The same file recorded with two contents (directly and as a generator).
    expect(await check(r, { ...unbound, generated: { [MCH]: { generators: { "include/a.h": sha256("other") } } } }))
      .toMatchObject({ fresh: false, changed: ["include/a.h"] });
  });

  test("a restoration's generated inputs still guard against headers landed since", async () => {
    const r = repo((root) => writeFileSync(join(root, "include/other.h"), "extern int other;\n"));
    const blob = (path: string) => git(r.root, ["rev-parse", `${r.integratedRev}:${path}`]);
    const inputs = [{ path: "src/a.c", blob: blob("src/a.c") }, { path: "build/x.mch", blob: "abc", generated: true }];
    expect(await check(r, { kind: "base_identity", inputs })).toMatchObject({ fresh: false, changed: ["include/other.h"] });
  });

  test("unknown inputs are never fresh: no record, an unavailable record, an input outside the checkout", async () => {
    const r = repo();
    expect(await check(r, undefined)).toMatchObject({ fresh: false, reason: "no compile-input record for the certified build" });
    expect((await check(r, { kind: "unavailable", reason: "depfile not written" })).reason).toContain("depfile not written");
    expect(await check(r, depfile({ ...certified, "external:/usr/include/x.h": sha256("x") }))).toMatchObject({ fresh: false, changed: ["external:/usr/include/x.h"] });
  });

  test("a restoration's inputs are compared by git blob", async () => {
    const r = repo();
    const blob = (path: string) => git(r.root, ["rev-parse", `${r.integratedRev}:${path}`]);
    const inputs = [{ path: "src/a.c", blob: blob("src/a.c") }, { path: "include/a.h", blob: blob("include/a.h") }];
    expect(await check(r, { kind: "base_identity", inputs })).toMatchObject({ fresh: true, checked: 2 });
    expect(await check(r, { kind: "base_identity", inputs: [{ ...inputs[0]!, blob: "0".repeat(40) }, inputs[1]] }))
      .toMatchObject({ fresh: false, changed: ["src/a.c"] });
  });
});

describe("certifiedInputsFromMwcc", () => {
  test("reads the candidate depfile of the unit, else says why not", () => {
    const mwcc = { fidelity: { units: { u: { builds: { cand: { depfile: "ok", deps: certified } }, compile: { mw_version: "GC/1.2.5", cflags: "-O4", compiler: { sha256: "c" } } } } } };
    expect(certifiedInputsFromMwcc(mwcc, "u", "melee")).toMatchObject({ kind: "depfile", deps: certified, compile: { compiler_sha256: "c" } });
    expect(certifiedInputsFromMwcc(mwcc, "v", "melee")).toMatchObject({ kind: "unavailable" });
    expect(certifiedInputsFromMwcc({ fidelity: { units: { u: { builds: { cand: { depfile: "depfile not written", deps: {} } } } } } }, "u", "melee"))
      .toMatchObject({ kind: "unavailable" });
  });
});

describe("sandboxGeneratedInputs", () => {
  /** A real ninja graph: a generated header built from a tracked definition through a generated intermediate. */
  function ninjaProject() {
    const root = mkdtempSync(join(tmpdir(), "certified-generators-"));
    dirs.push(root);
    mkdirSync(join(root, "include"), { recursive: true });
    writeFileSync(join(root, "include/gen.def"), "VALUE 1\n");
    writeFileSync(join(root, "tools.py"), "# generator\n");
    writeFileSync(join(root, "build.ninja"), [
      "rule copy", "  command = mkdir -p $$(dirname $out) && cat $in > $out",
      "build build/mid.def: copy include/gen.def",
      "build build/gen/a_gen.h: copy build/mid.def | tools.py",
      "",
    ].join("\n"));
    const built = Bun.spawnSync(["ninja"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (built.exitCode !== 0) throw new Error(built.stderr.toString());
    const exec = {
      exec: async (command: string[]) => {
        const result = Bun.spawnSync(command, { cwd: root, stdout: "pipe", stderr: "pipe" });
        return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
      },
    } as WorkspaceExec;
    return { root, resolve: sandboxGeneratedInputs(exec) };
  }

  test("follows a generated input through generated intermediates to its tracked generators", async () => {
    const { resolve } = ninjaProject();
    expect(await resolve(["build/gen/a_gen.h"])).toEqual({
      "build/gen/a_gen.h": { generators: { "include/gen.def": sha256("VALUE 1\n"), "tools.py": sha256("# generator\n") } },
    });
  });

  test("a stale or unknown generated input has no generators", async () => {
    const { root, resolve } = ninjaProject();
    writeFileSync(join(root, "include/gen.def"), "VALUE 2\n");
    expect(await resolve(["build/gen/a_gen.h", "build/none.h"])).toEqual({
      "build/gen/a_gen.h": { error: expect.stringContaining("is not up to date with its inputs") },
      "build/none.h": { error: "ninja does not know build/none.h" },
    });
  });
});
