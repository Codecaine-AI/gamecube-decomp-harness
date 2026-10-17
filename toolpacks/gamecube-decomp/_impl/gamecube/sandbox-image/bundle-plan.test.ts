import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ensureSandboxToolData, sandboxQaAssetsStamp } from "../../../../../apps/server/src/core/job-queue/provisioning.js";
import type { SandboxHandle } from "../../../../../apps/server/src/core/job-queue/sandbox.js";
import { ASM_WINDOW_INDEX_FILES } from "../../../../../apps/server/src/core/tools/wrappers/asm-window-search.js";
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

const put = (path: string, content = "fixture") => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };
const run = (args: string[], cwd: string) => {
  const result = Bun.spawnSync(args, { cwd });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
};
/** A prepared checkout, tools, standards and toolpack sources: everything the bundle requires. */
function bundleInputs(root: string, gameDir: string) {
  const checkout = join(gameDir, "workspace/checkout");
  for (const path of ["configure.py", "tools/download_tool.py", "build.ninja", "build/GZLE01/report.json",
    "build/tools/sjiswrap.exe", "build/compilers/mwcc", "build/binutils/as", "build/GZLE01/main.o", "local.env", ".env.production", ".pi-sessions/trace.json", "orig/GZLE01/disc.rvz"]) put(join(checkout, path));
  put(join(root, "knowledge/global/sources/injectable/decomp_standards/standards/order.json"), "{}");
  put(join(gameDir, "knowledge/sources/injectable/decomp_standards/standards/order.json"), "{}");
  put(join(gameDir, "knowledge/sources/injectable/decomp_standards/standards/__pycache__/rules.cpython-312.pyc"));
  // QA-lint inputs: the game's config (minus env files) and Melee's banned-pattern corpus.
  put(join(gameDir, "config/local.env"), "SECRET=1");
  put(join(gameDir, "config/tools/review.json"), "{}");
  put(join(root, "games/melee/game.json"), JSON.stringify({ id: "melee" }));
  put(join(root, "games/melee/knowledge/sources/injectable/banned_patterns/data/patterns.json"), "[]");
  put(join(root, "games/melee/knowledge/sources/injectable/banned_patterns/data/stale.pyc"), "");
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
    "compiler/mwcc_alloc/vendor/mwcc-decomp/PIN.json", "compiler/mwcc_alloc/native/validate/byte_identity.py",
    "_impl/gamecube/tools/mwcc_ref.lock.json", "_impl/gamecube/tools/refs.lock.json",
    "_impl/gamecube/tools/fetch_mwcc_ref.sh"]) put(join(toolpack, path));
  for (const file of ["allocator_snapshot.py", "gdb_allocator_snapshot.py", "compare_coloring_snapshots.py",
    "mwcc_alloc_capture.py", "gdb_modern_capture.py"]) put(join(toolpack, "compiler/mwcc_alloc/sandbox", file));
  const bin = join(root, "bin");
  // Test packaging without depending on zstd or producing a real image.
  put(join(bin, "zstd"), '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do case "$1" in -o) shift; out=$1;; esac; shift; done\ncat > "$out"\n');
  chmodSync(join(bin, "zstd"), 0o755);
  return { bin };
}
function spawnBundle(root: string, bin: string, extra: string[] = []) {
  return Bun.spawnSync(["bash", join(import.meta.dir, "build_image_bundle.sh"), "--harness-root", root,
    "--game", "zelda", "--profile", "4-core", ...extra, "--out", join(root, "bundle.tar")],
    { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
}
function bundle(root: string, bin: string, extra: string[] = []) {
  const out = join(root, "bundle.tar");
  const result = spawnBundle(root, bin, extra);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  return { out, stderr: result.stderr.toString(), entries: run(["tar", "-tf", out], root),
    read: (path: string) => run(["tar", "-xOf", out, `daytona-zelda-image/${path}`], root) };
}

test("bundle stages a second game with resolved report, provenance and no local env", async () => {
  const { root, gameDir } = fixture();
  const { bin } = bundleInputs(root, gameDir);
  const { entries, read, stderr } = bundle(root, bin);
  expect(entries).toContain("daytona-zelda-image/checkout/build/GZLE01/report.json");
  expect(entries).not.toContain("local.env");
  expect(entries).not.toContain(".env.production");
  expect(entries).not.toContain(".pi-sessions");
  expect(entries).not.toContain("disc.rvz");
  expect(entries).toContain("daytona-zelda-image/knowledge/global/sources/injectable/decomp_standards/standards/order.json");
  expect(entries).toContain("daytona-zelda-image/games/zelda/knowledge/sources/injectable/decomp_standards/standards/order.json");
  expect(entries).toContain("daytona-zelda-image/games/zelda/game.json");
  expect(entries).not.toContain("__pycache__");
  expect(entries).toContain("daytona-zelda-image/image-tools/ninja-cgroup-jobs.sh");
  expect(entries).toContain("daytona-zelda-image/image-tools/fetch_pinned_sources.py");
  expect(entries).toContain("daytona-zelda-image/image-tools/stage_traced_compilers.sh");
  expect(entries).toContain("daytona-zelda-image/toolpacks/gamecube-decomp/_impl/gamecube/tools/mwcc_ref.lock.json");
  expect(entries).toContain("daytona-zelda-image/toolpacks/gamecube-decomp/_impl/gamecube/tools/refs.lock.json");
  // The Dockerfile COPYs traced-compilers/ even when nothing is staged; uploads drop empty directories.
  expect(entries).toContain("daytona-zelda-image/traced-compilers/README");
  expect(entries).not.toContain("traced-compilers/GC/");
  expect(stderr).toContain("traced compilers not staged");
  expect(read("provenance/toolpack-stamp.txt")).toBe(read("toolpacks/gamecube-decomp/.ready"));
  const qa = entries.split("\n").filter((e) => e.startsWith("daytona-zelda-image/build-orchestrator/") && !e.endsWith("/"))
    .map((e) => e.slice("daytona-zelda-image/build-orchestrator/".length)).sort();
  expect(qa).toEqual([".qa-ready", "games/melee/game.json", "games/melee/knowledge/sources/injectable/banned_patterns/data/patterns.json",
    "games/zelda/config/build.json", "games/zelda/config/sandbox.json", "games/zelda/config/tools/review.json", "games/zelda/game.json",
    "games/zelda/knowledge/sources/injectable/decomp_standards/standards/order.json",
    "knowledge/global/sources/injectable/decomp_standards/standards/order.json"]);
  // Byte-for-byte the stamp provisioning computes over the host tree, so a fresh sandbox skips the QA sync.
  expect(read("build-orchestrator/.qa-ready")).toBe(`${await sandboxQaAssetsStamp({ orchestratorRoot: root, gameId: "zelda" })}\n`);
  expect(read("provenance/qa-stamp.txt")).toBe(read("build-orchestrator/.qa-ready"));
  // The provisioning test's own recipe over the extracted tree gives the same stamp.
  const extracted = join(root, "extracted");
  mkdirSync(extracted);
  run(["tar", "-xf", join(root, "bundle.tar"), "-C", extracted, "daytona-zelda-image/build-orchestrator"], root);
  const qaDir = join(extracted, "daytona-zelda-image/build-orchestrator");
  const listing = run(["sh", "-c", "find . -type f ! -name .qa-ready | LC_ALL=C sort | while IFS= read -r f; do printf '%s  %s\\n' \"$(shasum -a 256 \"$f\" | cut -d' ' -f1)\" \"$f\"; done | shasum -a 256 | cut -d' ' -f1"], qaDir);
  expect(read("build-orchestrator/.qa-ready")).toBe(listing);
  const plan = JSON.parse(read("provenance/image-plan.json"));
  expect(plan.gameId).toBe("zelda");
  expect(plan.profile).toBe("4-core");
  expect(plan.resourceClass.cpu).toBe(4);
  expect(plan.globalStandardsDir).toBe("knowledge/global/sources/injectable/decomp_standards/standards");
  expect(plan.gameStandardsDir).toBe("games/zelda/knowledge/sources/injectable/decomp_standards/standards");
  expect(plan.tracedCompilersDir).toBe(join(realpathSync(gameDir), "runtime/tool-data/mwcc_native"));
  expect(plan.tracedCompilerVersions).toEqual(["1.1p1", "1.2.5", "1.2.5n"]);
  const dockerfile = read("Dockerfile");
  expect(dockerfile).toContain("COPY checkout ${WORKSPACE_ROOT}");
  expect(dockerfile).toContain("COPY knowledge /opt/knowledge");
  expect(dockerfile).toContain("ORCH_PACKAGE_ROOT=/opt");
  expect(dockerfile).toContain("install -m 0755 /opt/image-tools/ninja-cgroup-jobs.sh /usr/local/bin/ninja");
  expect(dockerfile).toContain("COPY --from=traced-compilers /out/ ${WORKSPACE_ROOT}/build/compilers-traced/");
  expect(dockerfile).toContain("ENV ORCH_IR_ORACLE_CLANG=/usr/bin/clang-21");
  expect(dockerfile).toContain("COPY build-orchestrator /opt/build-orchestrator");
  expect(dockerfile).toContain("COPY tool-data /opt/tool-data");
});
test("the asm-window index is baked with the .ready stamp provisioning compares, and is optional", async () => {
  const { root, gameDir } = fixture();
  const { bin } = bundleInputs(root, gameDir);
  const missing = bundle(root, bin);
  expect(missing.stderr).toContain("asm_window_search index not baked");
  expect(missing.entries).not.toContain("tool-data/asm_window_search");
  expect(missing.entries).toContain("daytona-zelda-image/tool-data/README");
  const dataRoot = join(gameDir, "runtime/tool-data/asm_window_search");
  for (const file of ASM_WINDOW_INDEX_FILES) put(join(dataRoot, file), `index ${file}`);
  chmodSync(join(dataRoot, ASM_WINDOW_INDEX_FILES[0]), 0o600);
  const { entries, read } = bundle(root, bin);
  for (const file of ASM_WINDOW_INDEX_FILES) expect(read(`tool-data/asm_window_search/${file}`)).toBe(`index ${file}`);
  const baked = read("tool-data/asm_window_search/.ready");
  expect(read("provenance/asm_window_search-stamp.txt")).toBe(baked);
  expect(entries.split("\n").filter((e) => e.startsWith("daytona-zelda-image/tool-data/asm_window_search/") && !e.endsWith("/"))).toHaveLength(5);
  // A sandbox holding the baked stamp is skipped by provisioning: no upload, no extraction.
  const calls: string[] = [];
  const sandbox = {
    readFile: async (path: string) => { calls.push(`read ${path}`); return baked; },
    uploadFile: async () => { calls.push("upload"); },
    exec: async () => { calls.push("exec"); return { exitCode: 0, stdout: "", stderr: "" }; },
    writeFile: async () => { calls.push("write"); },
  } as unknown as SandboxHandle;
  expect(await ensureSandboxToolData(sandbox, { toolId: "asm_window_search", hostRoot: dataRoot, files: [...ASM_WINDOW_INDEX_FILES] })).toBe(true);
  expect(calls).toEqual(["read /opt/tool-data/asm_window_search/.ready"]);
}, 30_000);
test("a QA asset symlink that leaves the harness root fails the bundle", () => {
  const { root, gameDir } = fixture();
  const { bin } = bundleInputs(root, gameDir);
  const outside = mkdtempSync(join(tmpdir(), "qa-outside-")); roots.push(outside);
  writeFileSync(join(outside, "secret.json"), "{}");
  symlinkSync(join(outside, "secret.json"), join(gameDir, "config/escape.json"));
  const result = Bun.spawnSync(["bash", join(import.meta.dir, "build_image_bundle.sh"), "--harness-root", root,
    "--game", "zelda", "--out", join(root, "bundle.tar")], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("symlink leaves the harness root");
});
test("a permitted directory link holding a link that leaves the harness root fails the bundle, and so does a loop", () => {
  const { root, gameDir } = fixture();
  const { bin } = bundleInputs(root, gameDir);
  const outside = mkdtempSync(join(tmpdir(), "qa-outside-")); roots.push(outside);
  writeFileSync(join(outside, "secret.json"), "{}");
  // games/zelda/shared is inside the root; the standards tree links to it, and it links out.
  put(join(gameDir, "shared/ok.json"), "{}");
  symlinkSync(join(outside, "secret.json"), join(gameDir, "shared/escape.json"));
  symlinkSync(join(gameDir, "shared"), join(gameDir, "knowledge/sources/injectable/decomp_standards/standards/shared"));
  const spawn = () => Bun.spawnSync(["bash", join(import.meta.dir, "build_image_bundle.sh"), "--harness-root", root,
    "--game", "zelda", "--out", join(root, "bundle.tar")], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  let result = spawn();
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("symlink leaves the harness root");
  expect(result.stderr.toString()).toContain("escape.json");
  rmSync(join(gameDir, "shared/escape.json"));
  symlinkSync(join(gameDir, "shared"), join(gameDir, "shared/again"));
  result = spawn();
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("symlink loop");
  rmSync(join(gameDir, "shared/again"));
  // The permitted directory link alone is baked as regular files.
  const { entries } = bundle(root, bin);
  expect(entries).toContain("daytona-zelda-image/games/zelda/knowledge/sources/injectable/decomp_standards/standards/shared/ok.json");
}, 30_000);
test("bundle stages prebuilt traced compilers with recorded hashes only when every version is present", () => {
  const { root, gameDir } = fixture();
  const { bin } = bundleInputs(root, gameDir);
  const native = join(gameDir, "runtime/tool-data/mwcc_native");
  put(join(native, "CAPABILITIES.json"), '{"schema":"mwcc-native-capabilities-v1","versions":{}}');
  for (const ver of ["1.1p1", "1.2.5"]) {
    put(join(native, ver, "mwcceppc.exe"), `traced ${ver}`);
    put(join(native, ver, "lmgr326b.dll"), `dll ${ver}`);
  }
  put(join(native, "1.2.5n", "mwcceppc.exe"), "traced 1.2.5n");
  // build.sh writes the DLL the exe loads next to it; a version without it is incomplete.
  const partial = bundle(root, bin);
  expect(partial.entries).not.toContain("traced-compilers/GC/");
  expect(partial.stderr).toContain("1.2.5n/lmgr326b.dll");
  put(join(native, "1.2.5n", "lmgr326b.dll"), "dll 1.2.5n");
  put(join(native, "validation/presence-1.2.5.json"), "{}");
  const { entries, read, stderr } = bundle(root, bin);
  for (const ver of ["1.1p1", "1.2.5", "1.2.5n"]) {
    expect(read(`traced-compilers/GC/${ver}/mwcceppc.exe`)).toBe(`traced ${ver}`);
    expect(read(`traced-compilers/GC/${ver}/lmgr326b.dll`)).toBe(`dll ${ver}`);
  }
  expect(read("traced-compilers/CAPABILITIES.json")).toContain("mwcc-native-capabilities-v1");
  const sums = read("traced-compilers/SHA256SUMS").trim().split("\n");
  expect(sums).toHaveLength(8);
  const sha = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
  expect(sums).toContain(`${sha("traced 1.2.5n")}  GC/1.2.5n/mwcceppc.exe`);
  expect(sums).toContain(`${sha("dll 1.2.5n")}  GC/1.2.5n/lmgr326b.dll`);
  // Validation evidence rides with the binaries for the image's gate, which the bundle previews.
  expect(read("traced-compilers/validation/presence-1.2.5.json")).toBe("{}");
  expect(sums).toContain(`${sha("{}")}  validation/presence-1.2.5.json`);
  expect(stderr).toContain("1.2.5: disabled (traced_sha1 mismatch");
  expect(read("provenance/traced-compilers.sha256")).toBe(read("traced-compilers/SHA256SUMS"));
  expect(entries).toContain("daytona-zelda-image/provenance/traced-compilers-CAPABILITIES.json");
}, 30_000);
/** A frozen traced-compiler dir as S4 leaves it plus copied sweep reports: every version passes the evidence gate. */
function frozenTraced(dir: string) {
  const sha1 = (text: string) => new Bun.CryptoHasher("sha1").update(text).digest("hex");
  const versions = ["1.1p1", "1.2.5", "1.2.5n"];
  const caps: Record<string, unknown> = {};
  for (const ver of versions) {
    put(join(dir, ver, "mwcceppc.exe"), `traced ${ver}`);
    put(join(dir, ver, "lmgr326b.dll"), `dll ${ver}`);
    caps[ver] = { traced_sha1: sha1(`traced ${ver}`), points: ["coloring"], unavailable: {} };
    put(join(dir, "validation", `presence-${ver}.json`), JSON.stringify({ schema: "mwcc-native-event-presence-v1",
      compiler_sha1: sha1(`traced ${ver}`), identity: { off_equals_on: true }, points: { coloring: { ok: true } } }));
  }
  put(join(dir, "CAPABILITIES.json"), JSON.stringify({ schema: "mwcc-native-capabilities-v1", pin: "x", versions: caps }));
  // One clean full sweep of the zelda checkout, filed under its game.
  const units = versions.flatMap((v) => [0, 1].map((i) => ({ unit: `build/zelda/${v}-${i}.o`, version: v, status: "identical", ok_off: true, ok_on: true })));
  put(join(dir, "validation/byte-identity/zelda/one-fn.json"), JSON.stringify({ schema: "mwcc-native-byte-identity-v1",
    selection: { all: true }, skipped: { not_selected: 0, versions: {} },
    traced_sha1: Object.fromEntries(versions.map((v) => [v, sha1(`traced ${v}`)])), units,
    totals: Object.fromEntries(versions.map((v) => [v, { units: 2, identical_off: 2, identical_on: 2, mismatched: 0, stock_failed: 0, traced_failed: 0 }])) }));
}
test("required traced versions: matching evidence bakes them enabled, a mismatch fails unless explicitly allowed", () => {
  const { root, gameDir } = fixture();
  const { bin } = bundleInputs(root, gameDir);
  writeFileSync(join(gameDir, "config/worker-image.json"), JSON.stringify({ traced_compilers: { required: ["1.2.5", "1.2.5n"] } }));
  // Nothing staged at the default tool-data location: a required version would ship disabled.
  let result = spawnBundle(root, bin);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("zelda requires traced compilers 1.2.5,1.2.5n");
  const frozen = join(root, "frozen");
  frozenTraced(frozen);
  const ok = bundle(root, bin, ["--traced-compilers", frozen]);
  expect(ok.stderr).toContain("traced compiler 1.2.5: enabled (coloring)");
  expect(ok.stderr).toContain("traced compiler 1.2.5n: enabled (coloring)");
  expect(ok.read("traced-compilers/validation/byte-identity/zelda/one-fn.json")).toContain("mwcc-native-byte-identity-v1");
  expect(JSON.parse(ok.read("traced-compilers/requirements.json"))).toEqual({ games: { zelda: { required: ["1.2.5", "1.2.5n"], stock_exclusions: {} } } });
  expect(JSON.parse(ok.read("provenance/image-plan.json")).tracedCompilersRequired).toEqual(["1.2.5", "1.2.5n"]);
  // A rebuilt binary no longer matches its evidence.
  writeFileSync(join(frozen, "1.2.5n/mwcceppc.exe"), "re-frozen");
  result = spawnBundle(root, bin, ["--traced-compilers", frozen]);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("the evidence gate disables traced compilers zelda requires: 1.2.5n: disabled (traced_sha1 mismatch");
  const allowed = bundle(root, bin, ["--traced-compilers", frozen, "--allow-disabled-traced"]);
  expect(allowed.stderr).toContain("WARNING: the evidence gate disables traced compilers zelda requires");
  // A disabled version the game does not require only warns.
  writeFileSync(join(frozen, "1.2.5n/mwcceppc.exe"), "traced 1.2.5n");
  writeFileSync(join(frozen, "1.1p1/mwcceppc.exe"), "re-frozen");
  expect(bundle(root, bin, ["--traced-compilers", frozen]).stderr).toContain("WARNING: traced compiler 1.1p1: disabled");
  writeFileSync(join(gameDir, "config/worker-image.json"), JSON.stringify({ traced_compilers: { required: ["2.0"] } }));
  expect(() => bundlePlan({ harnessRoot: root, gameId: "zelda" })).toThrow("traced_compilers.required");
}, 60_000);
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
