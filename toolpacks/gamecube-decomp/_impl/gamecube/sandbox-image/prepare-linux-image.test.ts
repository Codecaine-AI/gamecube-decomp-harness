import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const put = (path: string, content: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };

/** Run prepare_linux_image.build_type_index on a fixture checkout with a fake index runner printing `payload`. */
function bake(recipe: Record<string, unknown>, payload: unknown, exitCode = 0) {
  const root = mkdtempSync(join(tmpdir(), "type-index-")); roots.push(root);
  put(join(root, "include/b/two.hpp"), "struct B {};");
  put(join(root, "include/a.h"), "struct A {};");
  put(join(root, "include/notes.txt"), "");
  const runner = join(root, "fake_runner.py");
  put(runner, `import json, sys\nopen(${JSON.stringify(join(root, "argv.json"))}, "w").write(json.dumps(sys.argv[1:]))\n`
    + `print(json.dumps(${JSON.stringify(payload)}))\nsys.exit(${exitCode})\n`);
  const script = [
    "import importlib.util, json, sys, pathlib",
    `spec = importlib.util.spec_from_file_location("prep", ${JSON.stringify(join(import.meta.dir, "prepare_linux_image.py"))})`,
    "prep = importlib.util.module_from_spec(spec); spec.loader.exec_module(prep)",
    `root = pathlib.Path(${JSON.stringify(root)})`,
    "def run(*args): (root / 'build').mkdir(exist_ok=True); (root / 'build/ctx.cpp').write_text('ctx')",
    `prep.build_type_index(root, json.loads(sys.argv[1]), run, runner=pathlib.Path(${JSON.stringify(runner)}), out=root / 'out')`,
  ].join("\n");
  const result = Bun.spawnSync(["python3", "-c", script, JSON.stringify(recipe)], { env: { ...process.env, ORCH_IR_ORACLE_CLANG: "/usr/bin/clang-21" } });
  return { root, result, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}
const SMS = { umbrella: { output: "build/umbrella.cpp", root: "include", glob: "**/*.h*" }, ctx_command: ["true"],
  ctx: "build/ctx.cpp", lang: "c++", project: "sms" };

test("the recipe writes a sorted umbrella, runs the index builder with the oracle clang and reports the records", () => {
  const { root, result, stdout } = bake(SMS, { status: "ok", record_count: 3, index_path: "/x/indexes/type_layout_index.json" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(readFileSync(join(root, "build/umbrella.cpp"), "utf8")).toBe('#include "a.h"\n#include "b/two.hpp"\n');
  const argv = JSON.parse(readFileSync(join(root, "argv.json"), "utf8"));
  expect(argv).toEqual(["--ctx", join(root, "build/ctx.cpp"), "--lang", "c++", "--skip-casts", "--project", "sms",
    "--clang", "/usr/bin/clang-21", "--out", join(root, "out")]);
  expect(stdout).toContain("type_index: 3 records");
});

test("an index with no records, or a failing builder, fails the image build", () => {
  const empty = bake(SMS, { status: "ok", record_count: 0, index_path: "/x/indexes/type_layout_index.json" });
  expect(empty.result.exitCode).not.toBe(0);
  expect(empty.stderr).toContain("has no records");
  const failed = bake(SMS, { status: "clang_layout_failed" }, 2);
  expect(failed.result.exitCode).not.toBe(0);
  expect(failed.stderr).toContain("build_type_index failed (2)");
  const noHeaders = bake({ ...SMS, umbrella: { ...SMS.umbrella, glob: "**/*.inc" } }, { status: "ok", record_count: 1 });
  expect(noHeaders.stderr).toContain("no headers match");
});
