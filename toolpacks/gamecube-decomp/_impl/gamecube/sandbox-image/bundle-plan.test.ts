import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bundlePlan } from "./bundle-plan";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "image-plan-")); roots.push(root);
  const gameDir = join(root, "games", "zelda");
  mkdirSync(join(gameDir, "config"), { recursive: true });
  writeFileSync(join(gameDir, "game.json"), JSON.stringify({ id: "zelda", config: { build: "./config/build.json", sandbox: "./config/sandbox.json" } }));
  writeFileSync(join(gameDir, "config/build.json"), JSON.stringify({ reportPath: "build/GZLE01/report.json" }));
  writeFileSync(join(gameDir, "config/sandbox.json"), JSON.stringify({ default_profile: "2-core", profiles: {
    "2-core": { snapshot_name: "zelda-small", workspace_root: "/opt/zelda", resource_class: { cpu: 2 } },
    "4-core": { snapshot_name: "zelda-large", workspace_root: "/opt/zelda", resource_class: { cpu: 4 } },
  } }));
  return { root, gameDir };
}
test("second game resolves grouped checkout, report version and default image independently of Melee", () => {
  const { root, gameDir } = fixture();
  const plan = bundlePlan({ harnessRoot: root, gameId: "zelda" });
  expect(plan.checkout).toBe(join(gameDir, "workspace/checkout"));
  expect(plan.toolsRoot).toBe(join(gameDir, "runtime/tools"));
  expect(plan.reportPath).toBe("build/GZLE01/report.json");
  expect(plan.snapshotName).toBe("zelda-small");
  expect(plan.resourceClass.cpu).toBe(2);
  expect(plan.workspaceRoot).toBe("/opt/zelda");
  expect(plan.payloadDirectory).toBe("daytona-zelda-image");
});
test("explicit profile and alternate prepared checkout preserve profile provenance", () => {
  const { root } = fixture();
  const plan = bundlePlan({ harnessRoot: root, gameId: "zelda", profile: "4-core", checkout: join(root, "linux-checkout") });
  expect(plan.checkout).toBe(join(root, "linux-checkout"));
  expect(plan.profile).toBe("4-core");
  expect(plan.resourceClass.cpu).toBe(4);
  expect(plan.snapshotName).toBe("zelda-large");
  expect(() => bundlePlan({ harnessRoot: root, gameId: "zelda", profile: "missing" })).toThrow();
});
test("existing legacy tool artifacts remain usable until explicit data migration", () => {
  const { root, gameDir } = fixture();
  mkdirSync(join(gameDir, "state/tools"), { recursive: true });
  expect(bundlePlan({ harnessRoot: root, gameId: "zelda" }).toolsRoot).toBe(join(gameDir, "state/tools"));
});
test("conflicting tool stores require an explicit override shared with runtime", () => {
  const { root, gameDir } = fixture();
  mkdirSync(join(gameDir, "state/tools"), { recursive: true });
  mkdirSync(join(gameDir, "runtime/tools"), { recursive: true });
  expect(() => bundlePlan({ harnessRoot: root, gameId: "zelda" })).toThrow("Both game layout paths exist");
  writeFileSync(join(gameDir, "config/local.json"), JSON.stringify({ tools: { toolsRoot: "./runtime/tools" } }));
  expect(bundlePlan({ harnessRoot: root, gameId: "zelda" }).toolsRoot).toBe(join(gameDir, "runtime/tools"));
});
test("unknown game and escaping report paths fail before packaging", () => {
  const { root, gameDir } = fixture();
  expect(() => bundlePlan({ harnessRoot: root, gameId: "missing" })).toThrow();
  expect(() => bundlePlan({ harnessRoot: root, gameId: "../zelda" })).toThrow();
  writeFileSync(join(gameDir, "config/build.json"), JSON.stringify({ reportPath: "../../../outside.json" }));
  expect(() => bundlePlan({ harnessRoot: root, gameId: "zelda" })).toThrow("inside the checkout");
});

test("bundle stages a second game with resolved report, provenance and no local env", () => {
  const { root, gameDir } = fixture();
  const checkout = join(gameDir, "workspace/checkout");
  const put = (path: string, content = "fixture") => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };
  for (const path of ["configure.py", "tools/download_tool.py", "build.ninja", "build/GZLE01/report.json",
    "build/tools/sjiswrap.exe", "build/compilers/mwcc", "build/binutils/as", "build/GZLE01/main.o", "local.env", ".env.production", ".pi-sessions/trace.json", "orig/GZLE01/disc.rvz"]) put(join(checkout, path));
  put(join(root, "knowledge/global/sources/injectable/decomp_standards/standards/order.json"), "{}");
  put(join(gameDir, "knowledge/sources/injectable/decomp_standards/standards/order.json"), "{}");
  put(join(gameDir, "knowledge/sources/injectable/decomp_standards/standards/__pycache__/rules.cpython-312.pyc"));
  const run = (args: string[], cwd = root) => {
    const result = Bun.spawnSync(args, { cwd });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString();
  };
  run(["git", "init", "--quiet"], checkout);
  run(["git", "add", "configure.py"], checkout);
  run(["git", "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "fixture"], checkout);
  for (const path of ["wibo-1.2.0-opt1/wibo-linux-i686", "wibo-1.2.0-opt1/README.md",
    "wibo-1.2.0-opt1/wibo-opt-vs-upstream-e8f4795.patch", "wibo-1.2.0-stock/wibo-i686",
    "objdiff-cli-3.6.1-score/README.md", "objdiff-cli-3.6.1-score/objdiff-cli-linux-x86_64"]) put(join(gameDir, "runtime/tools", path));
  const toolpack = join(root, "toolpacks/gamecube-decomp");
  for (const path of ["_impl/gamecube/tools/mwcc_objcache.py", "_impl/gamecube/tools/install_mwcc_cache.py",
    "validation/checkdiff/api/run.py", "_impl/gamecube/tools/checkdiff.py", "_impl/gamecube/tools/permute.py",
    "_impl/gamecube/tools/src_mutate.py", "_shared/toolpack_runtime.py", "compiler/mwcc_alloc/api/analyze.py",
    "compiler/mwcc_alloc/vendor/mwcc-decomp/PIN.json"]) put(join(toolpack, path));
  for (const file of ["allocator_snapshot.py", "gdb_allocator_snapshot.py", "compare_coloring_snapshots.py",
    "mwcc_alloc_capture.py", "gdb_modern_capture.py"]) put(join(toolpack, "compiler/mwcc_alloc/sandbox", file));
  const bin = join(root, "bin");
  // Test packaging without depending on zstd or producing a real image.
  put(join(bin, "zstd"), '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do case "$1" in -o) shift; out=$1;; esac; shift; done\ncat > "$out"\n');
  chmodSync(join(bin, "zstd"), 0o755);
  const out = join(root, "bundle.tar");
  const result = Bun.spawnSync(["bash", join(import.meta.dir, "build_image_bundle.sh"), "--harness-root", root,
    "--game", "zelda", "--profile", "4-core", "--out", out], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const entries = run(["tar", "-tf", out]);
  expect(entries).toContain("daytona-zelda-image/checkout/build/GZLE01/report.json");
  expect(entries).not.toContain("local.env");
  expect(entries).not.toContain(".env.production");
  expect(entries).not.toContain(".pi-sessions");
  expect(entries).not.toContain("disc.rvz");
  expect(entries).toContain("daytona-zelda-image/knowledge/global/sources/injectable/decomp_standards/standards/order.json");
  expect(entries).toContain("daytona-zelda-image/games/zelda/knowledge/sources/injectable/decomp_standards/standards/order.json");
  expect(entries).toContain("daytona-zelda-image/games/zelda/game.json");
  expect(entries).not.toContain("__pycache__");
  const plan = JSON.parse(run(["tar", "-xOf", out, "daytona-zelda-image/provenance/image-plan.json"]));
  expect(plan.gameId).toBe("zelda");
  expect(plan.profile).toBe("4-core");
  expect(plan.resourceClass.cpu).toBe(4);
  expect(plan.globalStandardsDir).toBe("knowledge/global/sources/injectable/decomp_standards/standards");
  expect(plan.gameStandardsDir).toBe("games/zelda/knowledge/sources/injectable/decomp_standards/standards");
  const dockerfile = run(["tar", "-xOf", out, "daytona-zelda-image/Dockerfile"]);
  expect(dockerfile).toContain("COPY checkout ${WORKSPACE_ROOT}");
  expect(dockerfile).toContain("COPY knowledge /opt/knowledge");
  expect(dockerfile).toContain("ORCH_PACKAGE_ROOT=/opt");
});
test("games with a symbol-check map record the map and its disc directory for bake-time extraction", () => {
  const { root, gameDir } = fixture();
  writeFileSync(join(gameDir, "config/build.json"), JSON.stringify({ reportPath: "build/GZLE01/report.json", symbolCheck: { script: "tools/check-changed-symbol-order.py", map: "orig/GZLE01/files/zelda.MAP" } }));
  const plan = bundlePlan({ harnessRoot: root, gameId: "zelda" });
  expect(plan.symbolCheckMap).toBe("orig/GZLE01/files/zelda.MAP");
  expect(plan.discDir).toBe("orig/GZLE01");
  writeFileSync(join(gameDir, "config/build.json"), JSON.stringify({ reportPath: "build/GZLE01/report.json", symbolCheck: { script: "tools/check.py", map: "build/zelda.MAP" } }));
  expect(() => bundlePlan({ harnessRoot: root, gameId: "zelda" })).toThrow("must live under orig/<version>/");
  writeFileSync(join(gameDir, "config/build.json"), JSON.stringify({ reportPath: "build/GZLE01/report.json" }));
  expect(bundlePlan({ harnessRoot: root, gameId: "zelda" })).toMatchObject({ symbolCheckMap: "", discDir: "" });
});
