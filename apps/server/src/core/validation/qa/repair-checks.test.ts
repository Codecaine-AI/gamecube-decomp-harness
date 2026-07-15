import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildObjectForSource,
  captureUnitMatchSnapshot,
  compareUnitMatchSnapshots,
  objdiffUnitPresence,
  objectPathForSource,
  type UnitMatchSnapshot,
} from "./repair-checks.js";

const tempRoots: string[] = [];

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "qa-repair-checks-"));
  tempRoots.push(root);
  return root;
}

function writeBuild(root: string, command: string): void {
  mkdirSync(resolve(root, "build/GALE01/src/melee/lb"), { recursive: true });
  writeFileSync(
    resolve(root, "build.ninja"),
    `rule compile\n  command = ${command}\nbuild build/GALE01/src/melee/lb/lbrefract.o: compile\nobjdiff_report_args = --config functionRelocDiffs=data_value\n`,
  );
}

function snapshot(spec: {
  functions?: UnitMatchSnapshot["functions"];
  sections?: UnitMatchSnapshot["sections"];
}): UnitMatchSnapshot {
  return {
    sourcePath: "src/melee/lb/lbrefract.c",
    objectPath: "build/GALE01/src/melee/lb/lbrefract.o",
    functions: spec.functions ?? [],
    sections: spec.sections ?? [],
  };
}

afterEach(() => {
  while (tempRoots.length > 0) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe("repair checks", () => {
  test("maps source files to their per-source Ninja object", () => {
    expect(objectPathForSource("src/melee/lb/lbrefract.c")).toBe("build/GALE01/src/melee/lb/lbrefract.o");
    expect(objectPathForSource("./src/melee/gr/grpushon.cpp")).toBe("build/GALE01/src/melee/gr/grpushon.o");
    expect(objectPathForSource("src\\melee\\ft\\fighter.c")).toBe("build/GALE01/src/melee/ft/fighter.o");
  });

  test("builds only the source object and returns failure output", async () => {
    const goodRoot = tempRepo();
    writeBuild(goodRoot, "touch $out");
    expect(await buildObjectForSource({ repoRoot: goodRoot, sourcePath: "src/melee/lb/lbrefract.c" })).toMatchObject({ ok: true });

    const badRoot = tempRepo();
    writeBuild(badRoot, "sh -c 'echo object-compile-failed >&2; exit 7'");
    const failed = await buildObjectForSource({ repoRoot: badRoot, sourcePath: "src/melee/lb/lbrefract.c" });
    expect(failed.ok).toBe(false);
    expect(failed.log).toContain("object-compile-failed");
  });

  test("serializes concurrent object builds for the same repo root", async () => {
    const root = tempRepo();
    let concurrent = 0;
    let peakConcurrent = 0;
    let calls = 0;
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolveFirst) => {
      releaseFirst = resolveFirst;
    });
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolveFirstStarted) => {
      markFirstStarted = resolveFirstStarted;
    });
    const commandRunner = async () => {
      calls += 1;
      concurrent += 1;
      peakConcurrent = Math.max(peakConcurrent, concurrent);
      if (calls === 1) {
        markFirstStarted();
        await firstBlocked;
      }
      concurrent -= 1;
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const first = buildObjectForSource({
      repoRoot: root,
      sourcePath: "src/melee/lb/lbrefract.c",
      commandRunner,
    });
    await firstStarted;
    const second = buildObjectForSource({
      repoRoot: root,
      sourcePath: "src/melee/lb/lbrefract.c",
      commandRunner,
    });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));

    expect(calls).toBe(1);
    expect(concurrent).toBe(1);
    releaseFirst();
    await Promise.all([first, second]);
    expect(peakConcurrent).toBe(1);
  });

  test("allows object builds for different repo roots to overlap", async () => {
    const firstRoot = tempRepo();
    const secondRoot = tempRepo();
    let concurrent = 0;
    let peakConcurrent = 0;
    const commandRunner = async () => {
      concurrent += 1;
      peakConcurrent = Math.max(peakConcurrent, concurrent);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
      concurrent -= 1;
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await Promise.all([
      buildObjectForSource({
        repoRoot: firstRoot,
        sourcePath: "src/melee/lb/lbrefract.c",
        commandRunner,
      }),
      buildObjectForSource({
        repoRoot: secondRoot,
        sourcePath: "src/melee/lb/lbrefract.c",
        commandRunner,
      }),
    ]);

    expect(peakConcurrent).toBe(2);
  });

  test("generates and extracts a report scoped to the source's single objdiff unit", async () => {
    const root = tempRepo();
    writeBuild(root, "touch $out");
    writeFileSync(
      resolve(root, "objdiff.json"),
      `${JSON.stringify(
        {
          min_version: "2.0.0-beta.5",
          custom_make: "ninja",
          build_target: false,
          units: [
            {
              name: "main/melee/lb/other",
              target_path: "build/GALE01/obj/melee/lb/other.o",
              base_path: "build/GALE01/src/melee/lb/other.o",
              metadata: { source_path: "src/melee/lb/other.c" },
            },
            {
              name: "main/melee/lb/lbrefract",
              target_path: "build/GALE01/obj/melee/lb/lbrefract.o",
              base_path: "build/GALE01/src/melee/lb/lbrefract.o",
              metadata: { source_path: "src/melee/lb/lbrefract.c" },
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const cliPath = resolve(root, "build/tools/objdiff-cli");
    mkdirSync(resolve(root, "build/tools"), { recursive: true });
    writeFileSync(
      cliPath,
      `#!/bin/sh
set -eu
[ "$1" = "report" ]
[ "$2" = "generate" ]
shift 2
project=""
output=""
config=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --project|-p) project="$2"; shift 2 ;;
    --output|-o) output="$2"; shift 2 ;;
    --format|-f) [ "$2" = "json" ]; shift 2 ;;
    --config|-c) config="$2"; shift 2 ;;
    *) exit 20 ;;
  esac
done
[ "$config" = "functionRelocDiffs=data_value" ]
[ "$(grep -c '\"name\": \"main/melee/lb/lbrefract\"' "$project/objdiff.json")" -eq 1 ]
! grep -q 'main/melee/lb/other' "$project/objdiff.json"
grep -q '\"base_path\": \"/' "$project/objdiff.json"
grep -q '\"target_path\": \"/' "$project/objdiff.json"
printf '%s\n' '{"units":[{"name":"main/melee/lb/lbrefract","functions":[{"name":"lbRefract_80021CE8","size":"588","fuzzy_match_percent":99.93198},{"name":"fn_80021F70","size":68,"fuzzy_match_percent":100}],"sections":[{"name":".text","fuzzy_match_percent":99.03},{"name":".data","fuzzy_match_percent":100}]}]}' > "$output"
`,
    );
    chmodSync(cliPath, 0o755);

    await expect(captureUnitMatchSnapshot({ repoRoot: root, sourcePath: "src/melee/lb/lbrefract.c" })).resolves.toEqual({
      sourcePath: "src/melee/lb/lbrefract.c",
      objectPath: "build/GALE01/src/melee/lb/lbrefract.o",
      functions: [
        { name: "lbRefract_80021CE8", fuzzyMatchPercent: 99.93198, size: 588 },
        { name: "fn_80021F70", fuzzyMatchPercent: 100, size: 68 },
      ],
      sections: [
        { name: ".text", fuzzyMatchPercent: 99.03 },
        { name: ".data", fuzzyMatchPercent: 100 },
      ],
    });
  });

  test("returns null when the source has no objdiff unit", async () => {
    const root = tempRepo();
    writeBuild(root, "touch $out");
    writeFileSync(resolve(root, "objdiff.json"), '{"units":[]}\n');
    await expect(captureUnitMatchSnapshot({ repoRoot: root, sourcePath: "src/melee/lb/lbrefract.c" })).resolves.toBeNull();
  });

  test("distinguishes present, absent, and unavailable objdiff units", async () => {
    const root = tempRepo();
    writeFileSync(
      resolve(root, "objdiff.json"),
      JSON.stringify({
        units: [
          {
            base_path: "build/GALE01/src/melee/lb/lbrefract.o",
            metadata: { source_path: "src/melee/lb/lbrefract.c" },
          },
        ],
      }),
    );

    await expect(objdiffUnitPresence({ repoRoot: root, sourcePath: "src/melee/lb/lbrefract.c" })).resolves.toBe("present");
    await expect(objdiffUnitPresence({ repoRoot: root, sourcePath: "src/melee/lb/header-only.c" })).resolves.toBe("absent");
    writeFileSync(resolve(root, "objdiff.json"), "not-json\n");
    await expect(objdiffUnitPresence({ repoRoot: root, sourcePath: "src/melee/lb/lbrefract.c" })).resolves.toBe("unavailable");
  });

  test("flags only exact-function and matched-section regressions", () => {
    const before = snapshot({
      functions: [
        { name: "exact_dropped", fuzzyMatchPercent: 100, size: 32 },
        { name: "exact_removed", fuzzyMatchPercent: 100, size: 40 },
        { name: "fuzzy_dropped", fuzzyMatchPercent: 98, size: 48 },
      ],
      sections: [
        { name: ".text", fuzzyMatchPercent: 99 },
        { name: ".data", fuzzyMatchPercent: 100 },
        { name: ".rodata", fuzzyMatchPercent: 100 },
      ],
    });
    const after = snapshot({
      functions: [
        { name: "exact_dropped", fuzzyMatchPercent: 97.5, size: 32 },
        { name: "fuzzy_dropped", fuzzyMatchPercent: 80, size: 48 },
      ],
      sections: [
        { name: ".text", fuzzyMatchPercent: 75 },
        { name: ".data", fuzzyMatchPercent: 92 },
      ],
    });

    expect(compareUnitMatchSnapshots(before, after)).toEqual({
      ok: false,
      buildOk: true,
      exactRegressions: [
        { name: "exact_dropped", before: 100, after: 97.5 },
        { name: "exact_removed", before: 100, after: 0 },
      ],
      sectionRegressions: [
        { name: ".data", before: 100, after: 92 },
        { name: ".rodata", before: 100, after: 0 },
      ],
    });
  });

  test("accepts unchanged exact matches even when non-exact scores drop", () => {
    const before = snapshot({
      functions: [
        { name: "exact", fuzzyMatchPercent: 100, size: 32 },
        { name: "fuzzy", fuzzyMatchPercent: 99, size: 48 },
      ],
      sections: [{ name: ".text", fuzzyMatchPercent: 99 }],
    });
    const after = snapshot({
      functions: [
        { name: "exact", fuzzyMatchPercent: 100, size: 32 },
        { name: "fuzzy", fuzzyMatchPercent: 80, size: 48 },
      ],
      sections: [{ name: ".text", fuzzyMatchPercent: 75 }],
    });

    expect(compareUnitMatchSnapshots(before, after)).toEqual({
      ok: true,
      buildOk: true,
      exactRegressions: [],
      sectionRegressions: [],
    });
  });
});
