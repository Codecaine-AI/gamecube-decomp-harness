import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { WorkspaceExec } from "@server/infrastructure/shell";
import type { WorkerUnitScoreSnapshot } from "./change-validation.js";
import {
  applyMicroGatesToValidation,
  evaluateSectionParityGate,
  evaluateUndefinedSymbolGate,
  lintBannedIdioms,
  listUndefinedSymbols,
  summarizeMicroGates,
  type WorkerMicroGateResult,
} from "./micro-gates.js";

function snapshot(sections: WorkerUnitScoreSnapshot["sections"]): WorkerUnitScoreSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: "2026-08-27T00:00:00.000Z",
    unit: "mninfo",
    symbol: "mnInfo_8022F298",
    sourcePath: "src/melee/mn/mninfo.c",
    objectTarget: "build/GALE01/src/melee/mn/mninfo.o",
    metrics: [],
    functions: [],
    sections,
    targetScore: 100,
  };
}

function fakeWorkspaceExec(exec: WorkspaceExec["exec"]): WorkspaceExec {
  return { exec } as WorkspaceExec;
}

describe("evaluateSectionParityGate", () => {
  test("skips when disabled", () => {
    expect(evaluateSectionParityGate({ enabled: false, before: snapshot([]), after: snapshot([]) }).status).toBe("skipped");
  });

  test.each([[null, snapshot([])], [snapshot([]), null]])("skips when either snapshot is missing", (before, after) => {
    expect(evaluateSectionParityGate({ enabled: true, before, after }).status).toBe("skipped");
  });

  test("passes when an exact non-code section remains exact", () => {
    const result = evaluateSectionParityGate({
      enabled: true,
      before: snapshot([{ name: ".data", score: 100, size: 53200 }]),
      after: snapshot([{ name: ".data", score: 100, size: 53200 }]),
    });
    expect(result.status).toBe("passed");
  });

  test("fails when an exact non-code section regresses", () => {
    const result = evaluateSectionParityGate({
      enabled: true,
      before: snapshot([{ name: ".data", score: 100, size: 53200 }]),
      after: snapshot([{ name: ".data", score: 99.77, size: 53200 }]),
    });
    expect(result.status).toBe("failed");
    expect(result.reasons[0]).toContain(".data");
    expect(result.reasons[0]).toContain("99.77");
    expect(result.reasons[0]).toMatch(/\(.*bytes mismatched\)/);
  });

  test("fails when an exact non-code section disappears", () => {
    const result = evaluateSectionParityGate({
      enabled: true,
      before: snapshot([{ name: ".bss", score: 100 }]),
      after: snapshot([]),
    });
    expect(result.status).toBe("failed");
    expect(result.reasons[0]).toContain("missing from the rebuilt object");
  });

  test("ignores text regressions and sections that were already non-exact", () => {
    const result = evaluateSectionParityGate({
      enabled: true,
      before: snapshot([{ name: ".text", score: 100 }, { name: ".data", score: 98 }]),
      after: snapshot([{ name: ".text", score: 90 }, { name: ".data", score: 80 }]),
    });
    expect(result.status).toBe("passed");
  });
});

function syntheticElf(): Buffer {
  const buffer = Buffer.alloc(52 + 3 * 40 + 4 * 16 + 32);
  buffer.set([0x7f, 0x45, 0x4c, 0x46, 1, 2, 1], 0);
  buffer.writeUInt16BE(1, 16);
  buffer.writeUInt16BE(20, 18);
  buffer.writeUInt32BE(1, 20);
  buffer.writeUInt32BE(52, 32);
  buffer.writeUInt16BE(52, 40);
  buffer.writeUInt16BE(40, 46);
  buffer.writeUInt16BE(3, 48);
  const symtabOffset = 52 + 3 * 40;
  const strtabOffset = symtabOffset + 4 * 16;
  const symtabHeader = 52 + 40;
  buffer.writeUInt32BE(2, symtabHeader + 4);
  buffer.writeUInt32BE(symtabOffset, symtabHeader + 16);
  buffer.writeUInt32BE(4 * 16, symtabHeader + 20);
  buffer.writeUInt32BE(2, symtabHeader + 24);
  buffer.writeUInt32BE(16, symtabHeader + 36);
  const strtabHeader = 52 + 80;
  buffer.writeUInt32BE(3, strtabHeader + 4);
  buffer.writeUInt32BE(strtabOffset, strtabHeader + 16);
  buffer.writeUInt32BE(32, strtabHeader + 20);
  const strings = Buffer.from("\0local_fn\0HSD_Randi\0lbl_missing\0");
  strings.copy(buffer, strtabOffset);
  const names = [1, 10, 20];
  names.forEach((name, index) => {
    const offset = symtabOffset + (index + 1) * 16;
    buffer.writeUInt32BE(name, offset);
    buffer.writeUInt16BE(index === 0 ? 1 : 0, offset + 14);
  });
  return buffer;
}

const pythonMissing = Boolean(spawnSync("python3", ["--version"]).error);

describe("listUndefinedSymbols", () => {
  test.skipIf(pythonMissing)("reads undefined symbols from a 32-bit big-endian ELF object", async () => {
    const directory = mkdtempSync(join(tmpdir(), "micro-gates-"));
    const objectPath = join(directory, "fixture.o");
    writeFileSync(objectPath, syntheticElf());
    const workspaceExec = fakeWorkspaceExec(async (command) => {
      const result = spawnSync(command[0]!, command.slice(1), { cwd: directory, encoding: "utf8" });
      return { exitCode: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? String(result.error ?? "") };
    });
    expect(await listUndefinedSymbols({ objectPath, workspaceExec })).toEqual({
      symbols: ["HSD_Randi", "lbl_missing"],
      error: null,
    });
  });

  test.skipIf(pythonMissing)("reports a non-ELF input", async () => {
    const directory = mkdtempSync(join(tmpdir(), "micro-gates-"));
    const objectPath = join(directory, "not-elf.o");
    writeFileSync(objectPath, "not an ELF");
    const workspaceExec = fakeWorkspaceExec(async (command) => {
      const result = spawnSync(command[0]!, command.slice(1), { cwd: directory, encoding: "utf8" });
      return { exitCode: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? String(result.error ?? "") };
    });
    const result = await listUndefinedSymbols({ objectPath, workspaceExec });
    expect(result.symbols).toBeNull();
    expect(result.error).not.toBe("");
  });
});

describe("evaluateUndefinedSymbolGate", () => {
  const objectTarget = "build/GALE01/src/melee/mn/mninfo.o";
  const workspaceExec = fakeWorkspaceExec(async (command) => command[0] === "python3"
    ? { exitCode: 0, stdout: "HSD_Randi\nftCo_BogusShim\n", stderr: "" }
    : { exitCode: 0, stdout: "HSD_Randi = .text:0x80017370; // type:function\nOther = .data:0x1;", stderr: "" });

  test("skips when disabled or the object target is missing", async () => {
    expect((await evaluateUndefinedSymbolGate({ enabled: false, objectTarget, baselineUndefined: null, workspaceExec })).status).toBe("skipped");
    expect((await evaluateUndefinedSymbolGate({ enabled: true, objectTarget: null, baselineUndefined: null, workspaceExec })).status).toBe("skipped");
  });

  test("fails for a new symbol outside the link universe", async () => {
    const result = await evaluateUndefinedSymbolGate({ enabled: true, objectTarget, baselineUndefined: null, workspaceExec });
    expect(result.status).toBe("failed");
    expect(result.reasons[0]).toContain("ftCo_BogusShim");
    expect(result.reasons[0]).toContain(objectTarget);
  });

  test("passes for a pre-existing undefined symbol", async () => {
    const result = await evaluateUndefinedSymbolGate({ enabled: true, objectTarget, baselineUndefined: ["ftCo_BogusShim"], workspaceExec });
    expect(result.status).toBe("passed");
  });

  test("marks python failure as tool unavailable", async () => {
    const exec = fakeWorkspaceExec(async () => ({ exitCode: 2, stdout: "", stderr: "bad ELF" }));
    const result = await evaluateUndefinedSymbolGate({ enabled: true, objectTarget, baselineUndefined: null, workspaceExec: exec });
    expect(result).toMatchObject({ status: "tool_unavailable", reasons: [], toolError: "bad ELF" });
  });

  test("marks symbols.txt read failure as tool unavailable", async () => {
    const exec = fakeWorkspaceExec(async (command) => command[0] === "python3"
      ? { exitCode: 0, stdout: "HSD_Randi\n", stderr: "" }
      : { exitCode: 1, stdout: "", stderr: "missing symbols" });
    const result = await evaluateUndefinedSymbolGate({ enabled: true, objectTarget, baselineUndefined: null, workspaceExec: exec });
    expect(result).toMatchObject({ status: "tool_unavailable", reasons: [], toolError: "missing symbols" });
  });
});

function cDiff(...lines: string[]): string {
  return ["diff --git a/src/melee/mn/mninfo.c b/src/melee/mn/mninfo.c", ...lines.map((line) => `+${line}`)].join("\n");
}

describe("lintBannedIdioms", () => {
  test("skips an empty diff", () => expect(lintBannedIdioms("").status).toBe("skipped"));

  test("finds section-order helper functions", () => {
    expect(lintBannedIdioms(cDiff("static void EnsureSdata2Order(void) {}" )).reasons.some((reason) => reason.includes("section-order-hack"))).toBe(true);
  });

  test("accepts a referenced static function and rejects an unused one", () => {
    expect(lintBannedIdioms(cDiff("static s32 helperThing(s32 arg) {", "    helperThing(x);" )).reasons.some((reason) => reason.includes("unused-static-function"))).toBe(false);
    expect(lintBannedIdioms(cDiff("static s32 helperThing(s32 arg) {" )).reasons.some((reason) => reason.includes("unused-static-function"))).toBe(true);
  });

  test("finds bare short and long types outside comments and strings", () => {
    expect(lintBannedIdioms(cDiff("    short foo;" )).reasons.some((reason) => reason.includes("bare-short-or-long"))).toBe(true);
    expect(lintBannedIdioms(cDiff("    s16 foo;", "    /* long ago */", "    puts(\"long\");" )).reasons.some((reason) => reason.includes("bare-short-or-long"))).toBe(false);
  });

  test("finds K&R headers without flagging ANSI headers, calls, or macros", () => {
    expect(lintBannedIdioms(cDiff("int ftCo_Attack(fp, arg)" )).reasons.some((reason) => reason.includes("kr-style-declaration"))).toBe(true);
    const accepted = lintBannedIdioms(cDiff("static void ftCo_Attack(Fighter* fp, s32 arg)", "    ftCo_Attack(fp, arg);", "GET_FIGHTER(gobj)"));
    expect(accepted.reasons.some((reason) => reason.includes("kr-style-declaration"))).toBe(false);
  });

  test("rejects static added to a symbols.txt global", () => {
    const result = lintBannedIdioms(cDiff("static HSD_TObj* psTexGroupArray[8];"), {
      symbolsTxt: "psTexGroupArray = .data:0x804D0000; // type:object scope:global",
    });
    expect(result.status).toBe("failed");
    expect(result.reasons).toContainEqual(expect.stringContaining("static_added_to_global_symbol: 'psTexGroupArray'"));
    expect(result.reasons).toContainEqual(expect.stringContaining("symbols.txt global"));
  });

  test("rejects static added to a declaration that was non-static in the baseline", () => {
    const path = "src/melee/mn/mninfo.c";
    const result = lintBannedIdioms(cDiff("static u32 psNumCmdList;"), {
      baselineSources: new Map([[path, "u32 psNumCmdList;\n"]]),
    });
    expect(result.status).toBe("failed");
    expect(result.reasons).toContainEqual(expect.stringContaining("static_added_to_global_symbol: 'psNumCmdList'"));
    expect(result.reasons).toContainEqual(expect.stringContaining("previously non-static"));
  });

  test("accepts a brand-new referenced static helper", () => {
    const result = lintBannedIdioms(cDiff("static void helperThing(void) {", "    helperThing();"));
    expect(result.status).toBe("passed");
  });

  test("rejects volatile added to a global read by another function", () => {
    const path = "src/melee/mn/mninfo.c";
    const before = `char shared[1] = "";\nvoid target(void)\n{\n    (void) shared[0];\n}\nvoid reader(void)\n{\n    (void) shared[0];\n}\n`;
    const after = `volatile char shared[1] = "";\nvoid target(void)\n{\n    (void) shared[0];\n}\nvoid reader(void)\n{\n    (void) shared[0];\n}\n`;
    const diff = `diff --git a/${path} b/${path}\n-char shared[1] = "";\n+volatile char shared[1] = "";`;
    const result = lintBannedIdioms(diff, {
      baselineSources: new Map([[path, before]]),
      postChangeSources: new Map([[path, after]]),
      targetFunction: "target",
    });
    expect(result.status).toBe("failed");
    expect(result.reasons).toContainEqual(expect.stringContaining("qualifier_changed_on_shared_global: 'shared' volatile added"));
    expect(result.reasons).toContainEqual(expect.stringContaining("shared global referenced by 1 other functions; changing its qualifiers alters their codegen"));
  });

  test("accepts a qualifier change on a global read only by the target", () => {
    const path = "src/melee/mn/mninfo.c";
    const before = `char privateToTarget[1];\nvoid target(void) { (void) privateToTarget[0]; }\n`;
    const after = `volatile char privateToTarget[1];\nvoid target(void) { (void) privateToTarget[0]; }\n`;
    const diff = `diff --git a/${path} b/${path}\n-char privateToTarget[1];\n+volatile char privateToTarget[1];`;
    expect(lintBannedIdioms(diff, {
      baselineSources: new Map([[path, before]]), postChangeSources: new Map([[path, after]]), targetFunction: "target",
    }).status).toBe("passed");
  });

  test("accepts brand-new static globals and locals", () => {
    const path = "src/melee/mn/mninfo.c";
    const before = `void target(void) {}\nvoid reader(void) {}\n`;
    const after = `static volatile char fresh[1];\nvoid target(void) { static volatile char local[1]; (void) fresh[0]; }\nvoid reader(void) { (void) fresh[0]; }\n`;
    const diff = `diff --git a/${path} b/${path}\n+static volatile char fresh[1];\n+    static volatile char local[1];`;
    expect(lintBannedIdioms(diff, {
      baselineSources: new Map([[path, before]]), postChangeSources: new Map([[path, after]]), targetFunction: "target",
    }).status).toBe("passed");
  });

  test("rejects an array size change on a shared global", () => {
    const path = "src/melee/mn/mninfo.c";
    const before = `char shared[1];\nvoid target(void) { (void) shared[0]; }\nvoid reader(void) { (void) shared[0]; }\n`;
    const after = `char shared[2];\nvoid target(void) { (void) shared[0]; }\nvoid reader(void) { (void) shared[0]; }\n`;
    const diff = `diff --git a/${path} b/${path}\n-char shared[1];\n+char shared[2];`;
    const result = lintBannedIdioms(diff, {
      baselineSources: new Map([[path, before]]), postChangeSources: new Map([[path, after]]), targetFunction: "target",
    });
    expect(result.status).toBe("failed");
    expect(result.reasons).toContainEqual(expect.stringContaining("'shared' array size changed from '[1]' to '[2]'"));
  });

  test("accepts an unchanged static declaration", () => {
    const diff = [
      "diff --git a/src/melee/mn/mninfo.c b/src/melee/mn/mninfo.c",
      " static u32 existingStatic;",
      "+u32 unrelatedGlobal;",
    ].join("\n");
    expect(lintBannedIdioms(diff).status).toBe("passed");
  });

  test("ignores non-C files", () => {
    const diff = "diff --git a/config/GALE01/symbols.txt b/config/GALE01/symbols.txt\n+long = whatever";
    expect(lintBannedIdioms(diff).status).toBe("passed");
  });
});

describe("micro-gate summaries", () => {
  const result = (gate: WorkerMicroGateResult["gate"], status: WorkerMicroGateResult["status"], reasons: string[] = []): WorkerMicroGateResult => ({ gate, status, reasons });

  test("summarizes skipped, failed, and mixed results", () => {
    expect(summarizeMicroGates([result("section_parity", "skipped")]).status).toBe("skipped");
    const failed = summarizeMicroGates([result("section_parity", "failed", ["data regressed"])]);
    expect(failed.status).toBe("failed");
    expect(failed.reasons).toEqual(["micro_gate:section_parity: data regressed"]);
    expect(summarizeMicroGates([result("section_parity", "passed"), result("undefined_symbols", "skipped")]).status).toBe("passed");
  });

  test("applies failures without replacing a more specific status", () => {
    const gates = summarizeMicroGates([result("section_parity", "failed", ["data regressed"])]);
    expect(applyMicroGatesToValidation({ status: "passed", reasons: [] }, gates)).toMatchObject({ status: "failed", reasons: gates.reasons, microGates: gates });
    expect(applyMicroGatesToValidation({ status: "build_failed", reasons: ["build failed"] }, gates)).toMatchObject({
      status: "build_failed",
      reasons: ["build failed", ...gates.reasons],
      microGates: gates,
    });
  });
});
