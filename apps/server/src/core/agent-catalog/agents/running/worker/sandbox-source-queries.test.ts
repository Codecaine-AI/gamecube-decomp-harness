import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkspaceExec } from "@server/infrastructure/shell";
import { objdiffReportConfigArgs, objdiffUnitNameForSource, resolveConfigUnitsFromHunks } from "./change-validation.js";
import { evaluateUndefinedSymbolGate, parseSymbolsTxt, symbolsTxtNames } from "./micro-gates.js";
import { UNIT_REPORT_PLACEMENT_ENV } from "./unit-report-summary.js";

const SYMBOLS_PATH = "config/GALE01/symbols.txt";
/** Lines that exercise parseSymbolsTxt's two regexes: whitespace kinds, CRLF, odd name characters, spacing around `scope:global`. */
const SYMBOLS_TXT = [
  "HSD_Randi = .text:0x80017370; // type:function size:0x40 scope:global",
  "  lbl_80400000 = .data:0x80400000; // scope:local",
  " nbsp_name = .data:0x1; // scope : global",
  "$dollar.name@1 = .text:0x2; // scope:global\r",
  "crlf_name = .bss:0x3; // scope:global\r",
  "no_equals_here .text:0x4",
  "glued=.text:0x5; //scope:globalish",
  "glued2 =.text:0x6; // xscope:global",
  "dup = .text:0x7;",
  "dup = .text:0x8; // scope:global",
  "﻿bom_name = .text:0x9; // scope:global",
  "ünï = .text:0xa; // scope:global",
  "last_line_cr = .text:0xb; // scope:global\r",
].join("\n");
const QUERIED = ["HSD_Randi", "lbl_80400000", "nbsp_name", "$dollar.name@1", "crlf_name", "no_equals_here", "glued", "glued2", "dup", "bom_name", "ünï", "last_line_cr", "missing_name", "ftCo_New"];

function localSandbox(directory: string, received: string[] = [], undefinedSymbols = "HSD_Randi\nftCo_New\nlbl_80400000\n"): WorkspaceExec {
  const exec: WorkspaceExec["exec"] = async (command, options) => {
    if (command[0] === "python3" && command[2]?.includes("ELF")) return { exitCode: 0, stdout: undefinedSymbols, stderr: "" };
    if (command[0] === "ninja" || command[0] === "build/tools/objdiff-cli") return { exitCode: 1, stdout: "", stderr: "no toolchain" };
    const result = Bun.spawnSync(command, { cwd: directory, env: { ...process.env, ...options?.env }, stdout: "pipe", stderr: "pipe" });
    received.push(result.stdout.toString());
    return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  };
  return { exec } as WorkspaceExec;
}

function checkout(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "source-queries-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(directory, path, ".."), { recursive: true });
    writeFileSync(join(directory, path), text);
  }
  return directory;
}

const saved = process.env[UNIT_REPORT_PLACEMENT_ENV];
afterEach(() => {
  if (saved === undefined) delete process.env[UNIT_REPORT_PLACEMENT_ENV];
  else process.env[UNIT_REPORT_PLACEMENT_ENV] = saved;
});

describe("symbols.txt queried in the sandbox", () => {
  test("answers exactly what parseSymbolsTxt says about the queried names, and returns nothing else", async () => {
    const directory = checkout({ [SYMBOLS_PATH]: SYMBOLS_TXT });
    const received: string[] = [];
    process.env[UNIT_REPORT_PLACEMENT_ENV] = "sandbox";
    const sandbox = await symbolsTxtNames(localSandbox(directory, received), SYMBOLS_PATH, QUERIED);
    const parsed = parseSymbolsTxt(SYMBOLS_TXT);
    const wanted = new Set(QUERIED);
    expect(sandbox.error).toBeNull();
    expect([...sandbox.all!].sort()).toEqual([...parsed.all].filter((name) => wanted.has(name)).sort());
    expect([...sandbox.globals!].sort()).toEqual([...parsed.globals].filter((name) => wanted.has(name)).sort());
    expect(received.join("")).not.toContain(".text:0x");

    process.env[UNIT_REPORT_PLACEMENT_ENV] = "host";
    const host = await symbolsTxtNames(localSandbox(directory), SYMBOLS_PATH, QUERIED);
    expect([...host.all!].filter((name) => wanted.has(name)).sort()).toEqual([...sandbox.all!].sort());
  });

  test("the undefined-symbol gate gives today's verdict and today's unreadable-file error", async () => {
    const directory = checkout({ [SYMBOLS_PATH]: SYMBOLS_TXT });
    const gate = (symbolsTxtPath = SYMBOLS_PATH) => evaluateUndefinedSymbolGate({
      enabled: true, objectTarget: "build/a.o", baselineUndefined: ["lbl_80400000"], workspaceExec: localSandbox(directory), symbolsTxtPath,
    });
    process.env[UNIT_REPORT_PLACEMENT_ENV] = "sandbox";
    const sandbox = await gate();
    const sandboxMissing = await gate("config/missing/symbols.txt");
    process.env[UNIT_REPORT_PLACEMENT_ENV] = "host";
    expect(sandbox).toEqual(await gate());
    expect(sandbox.status).toBe("failed");
    expect(sandbox.reasons[0]).toContain("ftCo_New");
    expect(sandboxMissing).toEqual(await gate("config/missing/symbols.txt"));
    expect(sandboxMissing.toolError).toBe("cat: config/missing/symbols.txt: No such file or directory");
  });
});

describe("scoped-check lookups resolved in the sandbox", () => {
  function git(directory: string, ...args: string[]): string {
    const result = Bun.spawnSync(["git", ...args], { cwd: directory, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  }

  test("objdiff.json source → unit names equal today's host lookup, and only the mapping comes back", async () => {
    const config = {
      units: [
        "not a unit",
        { name: "ignored/no_metadata" },
        { name: "main/first", metadata: { source_path: "src/main/dup.c" } },
        { name: "main/second", metadata: { source_path: "src/main/dup.c" } },
        { name: 42, metadata: { source_path: "./src/main/numeric.c" } },
        { name: "", metadata: { source_path: "src/main/empty.c" } },
        { name: "win/back", metadata: { source_path: "src\\win\\back.c" } },
        { name: "main/plain", metadata: { source_path: "src/main/plain.cpp", extra: "UNRELATED_MARKER" } },
        { metadata: { source_path: "lib/nosrc.c" } },
      ],
    };
    const sources = ["src/main/dup.c", "src/main/numeric.c", "./src/main/numeric.c", "src/main/empty.c", "src/win/back.c", "src/main/plain.cpp", "lib/nosrc.c", "src/missing.c"];
    for (const text of [JSON.stringify(config), "{\"units\": NaN}", "[1, 2]", "not json"]) {
      const directory = checkout({ "objdiff.json": text });
      const received: string[] = [];
      for (const source of sources) {
        process.env[UNIT_REPORT_PLACEMENT_ENV] = "sandbox";
        const sandbox = await objdiffUnitNameForSource(directory, source, localSandbox(directory, received));
        process.env[UNIT_REPORT_PLACEMENT_ENV] = "host";
        expect(sandbox).toBe(await objdiffUnitNameForSource(directory, source, localSandbox(directory)));
      }
      expect(received.join("")).not.toContain("UNRELATED_MARKER");
    }
    process.env[UNIT_REPORT_PLACEMENT_ENV] = "sandbox";
    const directory = checkout({ "objdiff.json": JSON.stringify(config) });
    expect(await objdiffUnitNameForSource(directory, "src/main/numeric.c", localSandbox(directory))).toBe("main/numeric.c");
    expect(await objdiffUnitNameForSource(directory, "src/main/dup.c", localSandbox(directory))).toBe("main/first");
  });

  test("config-metadata hunks → units equal today's host resolution, and splits.txt never reaches the host", async () => {
    const splits = (extra: string) => [
      "Sections:",
      "\t.text type:code align:4",
      "",
      "main/alpha.c:",
      "\t.text start:0x80003100 end:0x80003200",
      "\t.data       start:0x80400000 end:0x80400010\r",
      "./main/beta.o:\r",
      "\t.text start:0x80003200 end:0x800032F0",
      "main\\gamma.cpp:",
      "\t.rodata start:0x803A0000 end:0x803A0100",
      "asm/delta.s:",
      "\t.text start:0x80004000 end:0x80005000",
      "main/backwards.c:",
      "\t.text start:0x80006000 end:0x80005000",
      " not_a_unit.c:",
      "\t.text start:0x80007000 end:0x80008000",
      "UNRELATED_MARKER/unit.c:",
      "\t.text start:0x81000000 end:0x81000010",
      extra,
    ].join("\n");
    const directory = checkout({
      "config/GALE01/splits.txt": splits(""),
      [SYMBOLS_PATH]: "fn_a = .text:0x80003100; // type:function\nfn_b = .text:0x80003210;\n",
    });
    git(directory, "init", "-q");
    git(directory, "add", ".");
    git(directory, "-c", "user.email=qa@example.test", "-c", "user.name=QA", "commit", "-qm", "base");
    const base = git(directory, "rev-parse", "HEAD");
    // The worker moves a split boundary and edits symbols: removed and added hunk lines both count.
    writeFileSync(join(directory, "config/GALE01/splits.txt"), splits("main/epsilon.c:\n\t.text start:0x80009000 end:0x80009100"));
    const edits = [
      "fn_a = .text:0x80003200; // type:function\nfn_b = .text:0x80003210;\nnew_c = .rodata:0x803a0080;\n",
      "fn_a = .text:0x80003100; // type:function\nfn_b = .text:0x80003210;\nfar = .text:0x80009000; ss = .text:0x80006500; x = 0x80004000;\n",
      "fn_a = .text:0x80003100; // type:function\nfn_b = .text:0x80003210;\n",
      "fn_a = .text:0x80003100; // type:function\nfn_b = .text:0x80003210;\nbad = .text:0x8000310G; long = 0x800031001;\n",
    ];
    for (const edit of edits) {
      writeFileSync(join(directory, SYMBOLS_PATH), edit);
      for (const metadataPath of [SYMBOLS_PATH, "config/GALE01/splits.txt"]) {
        const received: string[] = [];
        const resolve = (exec: WorkspaceExec) => resolveConfigUnitsFromHunks({ repoRoot: directory, baseRev: base, metadataPath, workspaceExec: exec });
        process.env[UNIT_REPORT_PLACEMENT_ENV] = "sandbox";
        const sandbox = await resolve(localSandbox(directory, received));
        process.env[UNIT_REPORT_PLACEMENT_ENV] = "host";
        expect(sandbox).toEqual(await resolve(localSandbox(directory)));
        expect(received.join("")).not.toContain("UNRELATED_MARKER/unit.c:");
      }
    }
    process.env[UNIT_REPORT_PLACEMENT_ENV] = "sandbox";
    writeFileSync(join(directory, SYMBOLS_PATH), edits[0]!);
    expect(await resolveConfigUnitsFromHunks({ repoRoot: directory, baseRev: base, metadataPath: SYMBOLS_PATH, workspaceExec: localSandbox(directory) }))
      .toEqual(["src/main/alpha.c", "src/main/beta.c", "src/main/gamma.cpp"]);
  });
});

describe("build.ninja objdiff arguments parsed in the sandbox", () => {
  test("give today's host arguments, and build.ninja never reaches the host", async () => {
    const ninjas = [
      "ninja_required_version = 1.3\nobjdiff_report_args = --config functionRelocDiffs=data_value -c spaceBetweenArgs=false\nrule UNRELATED_MARKER\n",
      "objdiff_report_args = \t --config  a=1\t-c b=2 --config\r\nother = x\n",
      "objdiff_report_args =\nnext_line_value -c x=1\n",
      "# no args here\nfoo = bar\n",
      "objdiff_report_args = --config one=1\nobjdiff_report_args = --config two=2\n",
      "objdiff_report_args = -c\u00a0nbsp=1 -c last\u2028trailing -c z=9\n",
      "  objdiff_report_args = --config indented=1\n",
    ];
    for (const ninja of [...ninjas, null]) {
      const directory = checkout(ninja === null ? {} : { "build.ninja": ninja });
      const received: string[] = [];
      process.env[UNIT_REPORT_PLACEMENT_ENV] = "sandbox";
      const sandbox = await objdiffReportConfigArgs(directory, localSandbox(directory, received));
      process.env[UNIT_REPORT_PLACEMENT_ENV] = "host";
      expect(sandbox).toEqual(await objdiffReportConfigArgs(directory, localSandbox(directory)));
      expect(received.join("")).not.toContain("UNRELATED_MARKER");
    }
    process.env[UNIT_REPORT_PLACEMENT_ENV] = "sandbox";
    const directory = checkout({ "build.ninja": ninjas[0]! });
    expect(await objdiffReportConfigArgs(directory, localSandbox(directory))).toEqual(["--config", "functionRelocDiffs=data_value", "--config", "spaceBetweenArgs=false"]);
  });
});
