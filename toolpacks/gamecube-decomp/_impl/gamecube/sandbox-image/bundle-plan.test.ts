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
    "build/tools/sjiswrap.exe", "build/compilers/mwcc", "build/binutils/as", "build/GZLE01/main.o", "local.env", ".env.production", ".pi-sessions/trace.json"]) put(join(checkout, path));
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
  const plan = JSON.parse(run(["tar", "-xOf", out, "daytona-zelda-image/provenance/image-plan.json"]));
  expect(plan.gameId).toBe("zelda");
  expect(plan.profile).toBe("4-core");
  expect(plan.resourceClass.cpu).toBe(4);
  expect(run(["tar", "-xOf", out, "daytona-zelda-image/Dockerfile"])).toContain("COPY checkout ${WORKSPACE_ROOT}");
});
