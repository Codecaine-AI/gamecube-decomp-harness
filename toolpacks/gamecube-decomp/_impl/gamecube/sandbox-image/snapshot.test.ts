import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type CommandRunner, lineDiff, pinDockerfileArgs, runSnapshots, updateSandboxConfig } from "./snapshot";

const HEAD = "abcdef0123456789abcdef0123456789abcdef01";
const STAMP = "5".repeat(64);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const put = (path: string, content: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };

const sandboxJson = `${JSON.stringify({
  default_profile: "2-core",
  profiles: {
    "2-core": { snapshot_name: "zelda-old-2", snapshot_baked_rev: "1111111", workspace_root: "/work/zelda", resource_class: { cpu: 2, memory_gib: 4, disk_gib: 5 } },
    "4-core": { snapshot_name: "zelda-old-4", snapshot_baked_rev: "1111111", workspace_root: "/work/zelda", timeout_scale: 1, resource_class: { cpu: 4, memory_gib: 8, disk_gib: 10 } },
  },
}, null, 2)}\n`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "snapshot-plan-")); roots.push(root);
  const gameDir = join(root, "games", "zelda");
  put(join(gameDir, "game.json"), JSON.stringify({ id: "zelda", config: { build: "./config/build.json", sandbox: "./config/sandbox.json" } }));
  put(join(gameDir, "config/build.json"), JSON.stringify({ reportPath: "build/GZLE01/report.json" }));
  put(join(gameDir, "config/sandbox.json"), sandboxJson);
  put(join(gameDir, "runtime/images/context/daytona-zelda-image/stale.txt"), "stale");
  return { root, gameDir, workDir: join(root, "work") };
}

/** Records argv; answers `git rev-parse` and the stamp script, and fakes `tar -x` by writing the extracted payload. */
function fakeRunner(failOn?: (argv: string[]) => boolean) {
  const calls: string[][] = [];
  const runner: CommandRunner = async (argv) => {
    calls.push(argv);
    if (failOn?.(argv)) return { exitCode: 1, stdout: "", stderr: "daytona: quota exceeded" };
    if (argv[0] === "git") return { exitCode: 0, stdout: `${HEAD}\n`, stderr: "" };
    if (argv[0] === "bash" && argv[1]!.endsWith("content_stamp.sh")) return { exitCode: 0, stdout: `${STAMP}\n`, stderr: "" };
    if (argv[0] === "tar") {
      const payload = join(argv[argv.indexOf("-C") + 1]!, "daytona-zelda-image");
      put(join(payload, "Dockerfile"), "FROM debian:bookworm\nARG GAME_ID\nARG WORKSPACE_ROOT\nARG REPORT_PATH\nARG SNAPSHOT_BAKED_REV=\nRUN true\n");
      put(join(payload, "provenance/baked-head.txt"), `${HEAD}\n`);
      put(join(payload, "checkout/configure.py"), "");
      put(join(payload, "build-orchestrator/games/zelda/config/sandbox.json"), sandboxJson);
      put(join(payload, "build-orchestrator/.qa-ready"), "stale\n");
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  return { calls, runner };
}

test("dry run prints the bundle, extract and per-profile daytona commands plus the sandbox.json diff, and executes nothing mutating", async () => {
  const { root, gameDir, workDir } = fixture();
  const { calls, runner } = fakeRunner();
  const lines: string[] = [];
  const { updates } = await runSnapshots({ harnessRoot: root, games: ["zelda"], apply: false, workDir, date: "20261017",
    tracedCompilers: "/data/mwcc_native", runner, log: (l) => lines.push(l) });
  // Only the read-only HEAD lookup ran.
  expect(calls.map((argv) => argv[0])).toEqual(["git"]);
  const out = lines.join("\n");
  expect(out).toContain(`would run: bash ${join(import.meta.dir, "build_image_bundle.sh")} --harness-root ${root} --game zelda --profile 2-core --traced-compilers /data/mwcc_native --out ${workDir}/daytona-zelda-image-abcdef0.tar.zst`);
  expect(out).toContain(`would run: tar --use-compress-program=unzstd -xf ${workDir}/daytona-zelda-image-abcdef0.tar.zst -C ${workDir}/daytona-zelda-image-abcdef0`);
  expect(out).toContain(`GAME_ID=zelda WORKSPACE_ROOT=/work/zelda REPORT_PATH=build/GZLE01/report.json SNAPSHOT_BAKED_REV=${HEAD}`);
  expect(out).toContain(`would run: bash ${join(import.meta.dir, "content_stamp.sh")} ${workDir}/daytona-zelda-image-abcdef0/daytona-zelda-image/build-orchestrator .qa-ready`);
  const context = `${workDir}/daytona-zelda-image-abcdef0/daytona-zelda-image`;
  expect(out).toContain(`would run: daytona snapshot create zelda-sandbox-20261017-abcdef0-2-core --dockerfile ${context}/Dockerfile --context ${context} --cpu 2 --memory 4 --disk 5`);
  expect(out).toContain("daytona snapshot create zelda-sandbox-20261017-abcdef0-4-core");
  expect(out).toContain("--cpu 4 --memory 8 --disk 10");
  expect(out).toContain('  -      "snapshot_name": "zelda-old-2",');
  expect(out).toContain('  +      "snapshot_name": "zelda-sandbox-20261017-abcdef0-2-core",');
  expect(out).toContain(`  +      "snapshot_baked_rev": "${HEAD}",`);
  expect(updates.zelda).toHaveLength(2);
  expect(readFileSync(join(gameDir, "config/sandbox.json"), "utf8")).toBe(sandboxJson);
  expect(existsSync(workDir)).toBe(false);
  expect(existsSync(join(gameDir, "runtime/images/context/daytona-zelda-image/stale.txt"))).toBe(true);
});

test("apply bakes the selected profile, pins the Dockerfile, records the snapshot and refreshes the stale context", async () => {
  const { root, gameDir, workDir } = fixture();
  const { calls, runner } = fakeRunner();
  await runSnapshots({ harnessRoot: root, games: ["zelda"], profiles: ["4-core"], apply: true, workDir, date: "20261017", runner, log: () => {} });
  expect(calls.map((argv) => argv[0])).toEqual(["git", "bash", "tar", "bash", "daytona"]);
  expect(calls[1]).toContain("--profile");
  expect(calls[1]![calls[1]!.indexOf("--profile") + 1]).toBe("4-core");
  expect(calls[4]!.slice(0, 4)).toEqual(["daytona", "snapshot", "create", "zelda-sandbox-20261017-abcdef0-4-core"]);
  const payload = join(workDir, "daytona-zelda-image-abcdef0/daytona-zelda-image");
  const dockerfile = readFileSync(join(payload, "Dockerfile"), "utf8");
  expect(dockerfile).toContain("ARG GAME_ID=zelda\nARG WORKSPACE_ROOT=/work/zelda\nARG REPORT_PATH=build/GZLE01/report.json\n");
  expect(dockerfile).toContain(`ARG SNAPSHOT_BAKED_REV=${HEAD}\n`);
  const written = readFileSync(join(gameDir, "config/sandbox.json"), "utf8");
  const config = JSON.parse(written);
  expect(config.profiles["4-core"]).toEqual({ snapshot_name: "zelda-sandbox-20261017-abcdef0-4-core", snapshot_baked_rev: HEAD,
    workspace_root: "/work/zelda", timeout_scale: 1, resource_class: { cpu: 4, memory_gib: 8, disk_gib: 10 } });
  expect(config.profiles["2-core"].snapshot_name).toBe("zelda-old-2");
  // Only the two changed lines differ: formatting and every other key are preserved.
  expect(lineDiff(sandboxJson, written).filter((l) => l.startsWith("+") || l.startsWith("-"))).toHaveLength(4);
  // The image's QA copy carries the sandbox.json the run writes, restamped, so host and baked .qa-ready agree.
  expect(readFileSync(join(payload, "build-orchestrator/games/zelda/config/sandbox.json"), "utf8")).toBe(written);
  expect(readFileSync(join(payload, "build-orchestrator/.qa-ready"), "utf8")).toBe(`${STAMP}\n`);
  expect(readFileSync(join(payload, "provenance/qa-stamp.txt"), "utf8")).toBe(`${STAMP}\n`);
  const context = join(gameDir, "runtime/images/context/daytona-zelda-image");
  expect(existsSync(join(context, "stale.txt"))).toBe(false);
  expect(readFileSync(join(context, "Dockerfile"), "utf8")).toBe(dockerfile);
  expect(readFileSync(join(context, "provenance/baked-head.txt"), "utf8").trim()).toBe(HEAD);
});

test("a failed snapshot create keeps earlier profiles recorded and stops before later ones", async () => {
  const { root, gameDir, workDir } = fixture();
  const { calls, runner } = fakeRunner((argv) => argv[0] === "daytona" && argv[3]!.endsWith("-4-core"));
  await expect(runSnapshots({ harnessRoot: root, games: ["zelda"], apply: true, workDir, date: "20261017", runner, log: () => {} }))
    .rejects.toThrow("quota exceeded");
  expect(calls.filter((argv) => argv[0] === "daytona")).toHaveLength(2);
  const config = JSON.parse(readFileSync(join(gameDir, "config/sandbox.json"), "utf8"));
  expect(config.profiles["2-core"].snapshot_name).toBe("zelda-sandbox-20261017-abcdef0-2-core");
  expect(config.profiles["4-core"].snapshot_name).toBe("zelda-old-4");
  expect(existsSync(join(gameDir, "runtime/images/context/daytona-zelda-image/stale.txt"))).toBe(true);
});

test("unknown profiles and multi-game checkouts fail before any command runs", async () => {
  const { root, workDir } = fixture();
  const { calls, runner } = fakeRunner();
  await expect(runSnapshots({ harnessRoot: root, games: ["zelda"], profiles: ["8-core"], apply: true, workDir, runner, log: () => {} }))
    .rejects.toThrow("unknown profile 8-core");
  await expect(runSnapshots({ harnessRoot: root, games: ["zelda", "melee"], checkout: "/tmp/x", apply: true, workDir, runner, log: () => {} }))
    .rejects.toThrow("exactly one --game");
  expect(calls).toHaveLength(0);
});

test("profiles inheriting a top-level baked rev keep inheriting only when all of them are rebaked", () => {
  // Melee's layout: snapshot_baked_rev and workspace_root at the top level.
  const melee = `${JSON.stringify({ default_profile: "2-core", snapshot_baked_rev: "c302741", workspace_root: "/opt/melee", profiles: {
    "2-core": { snapshot_name: "melee-a", resource_class: { cpu: 2 } },
    "4-core": { snapshot_name: "melee-b", resource_class: { cpu: 4 } },
  } }, null, 2)}\n`;
  const all = JSON.parse(updateSandboxConfig(melee, [
    { profile: "2-core", snapshotName: "melee-new-2", bakedRev: HEAD },
    { profile: "4-core", snapshotName: "melee-new-4", bakedRev: HEAD },
  ]));
  expect(all.snapshot_baked_rev).toBe(HEAD);
  expect(all.profiles["2-core"]).toEqual({ snapshot_name: "melee-new-2", resource_class: { cpu: 2 } });
  const one = updateSandboxConfig(melee, [{ profile: "4-core", snapshotName: "melee-new-4", bakedRev: HEAD }]);
  const parsed = JSON.parse(one);
  expect(parsed.snapshot_baked_rev).toBe("c302741");
  expect(Object.keys(parsed.profiles["4-core"])).toEqual(["snapshot_name", "snapshot_baked_rev", "resource_class"]);
  expect(parsed.profiles["2-core"]).toEqual({ snapshot_name: "melee-a", resource_class: { cpu: 2 } });
});

test("ARG pinning replaces existing defaults and refuses missing, duplicate or unsafe arguments", () => {
  expect(pinDockerfileArgs("ARG A\nARG B=old\n", { A: "x", B: "/work/sms" })).toBe("ARG A=x\nARG B=/work/sms\n");
  expect(() => pinDockerfileArgs("ARG A\n", { B: "x" })).toThrow("exactly once");
  expect(() => pinDockerfileArgs("ARG A\nARG A\n", { A: "x" })).toThrow("exactly once");
  expect(() => pinDockerfileArgs("ARG A\n", { A: "x y" })).toThrow("Refusing");
});

test("--extra-revs-file passes through to the bundle script", async () => {
  const { root, workDir } = fixture();
  const { runner } = fakeRunner();
  const lines: string[] = [];
  await runSnapshots({ harnessRoot: root, games: ["zelda"], profiles: ["2-core"], apply: false, workDir, date: "20261017",
    extraRevsFile: "/data/extra-revs.txt", runner, log: (l) => lines.push(l) });
  expect(lines.join("\n")).toContain(`--game zelda --profile 2-core --extra-revs-file /data/extra-revs.txt --out ${workDir}/`);
});
