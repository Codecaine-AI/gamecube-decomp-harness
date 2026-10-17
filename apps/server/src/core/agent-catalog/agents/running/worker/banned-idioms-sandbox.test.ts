import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkspaceExec } from "@server/infrastructure/shell";
import { captureWorkerChangeBaseline, validateWorkerChange } from "./change-validation.js";
import * as microGates from "./micro-gates.js";
import { UNIT_REPORT_PLACEMENT_ENV } from "./unit-report-summary.js";

const SYMBOLS_PATH = "config/GALE01/symbols.txt";
const SYMBOLS_TXT = [
  "HSD_Randi = .text:0x80017370; // type:function scope:global",
  "gGlobalTable = .data:0x80400000; // scope:global\r",
  "local_only = .data:0x80400010; // scope:local",
].join("\n");

/** Shift-JIS "あい" (not valid UTF-8): the transport decodes it with U+FFFD, on both paths. */
const SJIS = Buffer.from([0x82, 0xa0, 0x82, 0xa2]);

const BASE = Buffer.concat([
  Buffer.from([
    "#include \"a.h\"",
    "int shared_counter;",
    "float gTable[4];",
    "char *gName;",
    "int gAligned;",
    "int was_global;",
    "/* comment: static int fake_static; */",
    "const char *gMessage = \"",
  ].join("\r\n")),
  SJIS,
  Buffer.from([
    "\";",
    "void reader_one(void) {",
    "    shared_counter++;",
    "    gTable[0] = 1.0f;",
    "}",
    "void reader_two(void)",
    "{",
    "    gTable[1] = shared_counter + gAligned;",
    "    gName = 0;",
    "}",
    "void reader_three(void) { gAligned = shared_counter; }",
    "",
  ].join("\r\n")),
]);

/** One attempt: the post-attempt source bytes and the write-set diff the host lint receives. */
interface Attempt {
  name: string;
  post: Buffer;
  diff: string;
}

function swapLines(pairs: Array<[string, string]>, extra = ""): Buffer {
  let text = BASE.toString("latin1");
  for (const [from, to] of pairs) text = text.replace(from, to);
  return Buffer.concat([Buffer.from(text, "latin1"), Buffer.from(extra)]);
}

const diffOf = (...lines: string[]) => ["diff --git a/src/a.c b/src/a.c", "--- a/src/a.c", "+++ b/src/a.c", "@@ -1,3 +1,3 @@", ...lines].join("\n");

const ATTEMPTS: Attempt[] = [
  {
    name: "qualifier and array changes on shared globals (declaration added and removed: whole-file case)",
    post: swapLines([["int shared_counter;", "volatile int shared_counter;"], ["float gTable[4];", "float gTable[8];"], ["char *gName;", "const char *gName;"], ["int gAligned;", "int gAligned __attribute__((aligned(8)));"]]),
    diff: diffOf(
      "-int shared_counter;", "+volatile int shared_counter;",
      "-float gTable[4];", "+float gTable[8];",
      "-char *gName;", "+const char *gName;",
      "-int gAligned;", "+int gAligned __attribute__((aligned(8)));",
    ),
  },
  {
    name: "static added to a symbols.txt global and to a previously non-static name",
    post: swapLines([["int was_global;", "static int was_global;"]], "static float gGlobalTable[2];\r\nstatic int local_only;\r\n"),
    diff: diffOf("-int was_global;", "+static int was_global;", "+static float gGlobalTable[2];", "+static int local_only;", "+static int fresh_name;"),
  },
  {
    name: "unused, used and section-emitter static functions",
    post: swapLines([], "static void helper(void) {}\r\nstatic void forceOrder(void) {}\r\nstatic void dummy_pad(void) {}\r\nvoid user(void) { helper(); }\r\n"),
    diff: diffOf("+static void helper(void) {}", "+static void forceOrder(void) {}", "+static void dummy_pad(void) {}", "+static void orphan(void)", "+{", "+}", "+void user(void) { helper(); }"),
  },
  {
    name: "bare short/long, K&R headers, comments and strings that only look like code",
    post: swapLines([], "long counter;\r\nint kr(a, b)\r\n"),
    diff: diffOf(
      "+long counter;", "+unsigned short ok_short;", "+int kr(a, b)", "+int not_kr(int a)", "+if (a, b)",
      "+/* static void hidden(void) { */ int x;", "+const char *s = \"static int in_string;\"; // short long", "+char c = 'l'; /* long", "+static int  spaced ;",
    ),
  },
  {
    name: "Shift-JIS bytes in the source and the diff",
    post: swapLines([["int was_global;", "static int was_global;"]], `static const char *sjis = "${SJIS.toString("latin1")}"; /* ${SJIS.toString("latin1")} short */\r\n`),
    diff: diffOf("-int was_global;", "+static int was_global;", `+static const char *sjis = "${new TextDecoder().decode(SJIS)}"; /* ${new TextDecoder().decode(SJIS)} short */`),
  },
  {
    name: "several files, a header and a C++ unit without context, and no-context diffs",
    post: swapLines([], "static int extra;\r\n"),
    diff: [
      "diff --git a/src/a.c b/src/a.c", "+static int extra;",
      "diff --git a/include/a.h b/include/a.h", "-extern int shared_counter;", "+extern volatile int shared_counter;", "+static short in_header;",
      "diff --git a/src/b.cpp b/src/b.cpp", "+static void cpp_only(void) {}", "+long cpp_long;",
      "diff --git a/README.md b/README.md", "+static long not_linted;",
    ].join("\n"),
  },
  {
    name: "only added non-static lines: no context is read",
    post: swapLines([], "int brand_new;\r\n"),
    diff: diffOf("+int brand_new;", "+long also_new;"),
  },
];

function localSandbox(directory: string, received: string[]): WorkspaceExec {
  const exec: WorkspaceExec["exec"] = async (command, options) => {
    if (command[0] === "ninja" || command[0] === "build/tools/objdiff-cli") return { exitCode: 1, stdout: "", stderr: "no toolchain" };
    const result = Bun.spawnSync(command, { cwd: directory, env: { ...process.env, ...options?.env }, stdout: "pipe", stderr: "pipe" });
    received.push(result.stdout.toString());
    return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  };
  return { exec } as WorkspaceExec;
}

const saved = process.env[UNIT_REPORT_PLACEMENT_ENV];
afterAll(() => {
  if (saved === undefined) delete process.env[UNIT_REPORT_PLACEMENT_ENV];
  else process.env[UNIT_REPORT_PLACEMENT_ENV] = saved;
});

describe("banned-idiom lint run whole in the sandbox", () => {
  test("gives today's host findings on every attempt and target, returning only the verdict", async () => {
    const directory = mkdtempSync(join(tmpdir(), "banned-idioms-"));
    mkdirSync(join(directory, "src"), { recursive: true });
    mkdirSync(join(directory, "include"), { recursive: true });
    mkdirSync(join(directory, "config/GALE01"), { recursive: true });
    writeFileSync(join(directory, SYMBOLS_PATH), SYMBOLS_TXT);
    writeFileSync(join(directory, "include/a.h"), "extern int shared_counter;\n");
    writeFileSync(join(directory, "src/a.c"), BASE);

    let sawFindings = 0;
    for (const symbol of ["reader_one", ".data", "user"]) {
      const target = { unit: "main/a", symbol, source_path: "src/a.c" };
      for (const [index, attempt] of ATTEMPTS.entries()) {
        const outputDir = mkdtempSync(join(tmpdir(), "banned-idioms-out-"));
        writeFileSync(join(directory, "src/a.c"), BASE);
        process.env[UNIT_REPORT_PLACEMENT_ENV] = "sandbox";
        const baseline = await captureWorkerChangeBaseline({
          repoRoot: directory, outputDir, target, extraPaths: ["include/a.h"], workspaceExec: localSandbox(directory, []),
        });
        writeFileSync(join(directory, "src/a.c"), attempt.post);
        const run = async (placement: "sandbox" | "host", attemptIndex: number) => {
          process.env[UNIT_REPORT_PLACEMENT_ENV] = placement;
          const received: string[] = [];
          const validation = await validateWorkerChange({
            repoRoot: directory, hostRepoRoot: directory, outputDir, attemptIndex, baseline, target,
            dryRun: false, shouldRun: true, claimedExact: false, workspaceExec: localSandbox(directory, received), postAttemptDiffText: attempt.diff,
          });
          const gate = (validation as unknown as { microGates?: { results: Array<{ gate: string; reasons: string[] }> } }).microGates?.results.find((result) => result.gate === "banned_idioms");
          return { gate, received };
        };
        const sandbox = await run("sandbox", 0);
        const host = await run("host", 1);
        expect({ attempt: attempt.name, symbol, gate: sandbox.gate }).toEqual({ attempt: attempt.name, symbol, gate: host.gate });
        if (sandbox.gate?.reasons.length) sawFindings += 1;
        // The sandbox path returns the verdict, never the sources: no source line crosses to the host.
        expect(sandbox.received.some((stdout) => stdout.includes("void reader_two(void)"))).toBe(false);
        if (index === 0 && symbol === "reader_one") {
          expect(host.received.some((stdout) => stdout.includes("void reader_two(void)"))).toBe(true);
          expect(sandbox.gate!.reasons.join("\n")).toContain("qualifier_changed_on_shared_global: 'shared_counter' volatile added");
        }
      }
    }
    expect(sawFindings).toBeGreaterThan(10);
  });

  test("the TypeScript lint runs only behind ORCH_UNIT_REPORT_PLACEMENT=host", async () => {
    const directory = mkdtempSync(join(tmpdir(), "banned-idioms-spy-"));
    mkdirSync(join(directory, "src"), { recursive: true });
    mkdirSync(join(directory, "config/GALE01"), { recursive: true });
    writeFileSync(join(directory, SYMBOLS_PATH), SYMBOLS_TXT);
    writeFileSync(join(directory, "src/a.c"), BASE);
    const target = { unit: "main/a", symbol: "reader_one", source_path: "src/a.c" };
    const attempt = ATTEMPTS[0]!;
    const lint = spyOn(microGates, "lintBannedIdioms");
    try {
      const calls: Record<string, number> = {};
      for (const placement of [undefined, "sandbox", "host"] as const) {
        if (placement === undefined) delete process.env[UNIT_REPORT_PLACEMENT_ENV];
        else process.env[UNIT_REPORT_PLACEMENT_ENV] = placement;
        writeFileSync(join(directory, "src/a.c"), BASE);
        const outputDir = mkdtempSync(join(tmpdir(), "banned-idioms-spy-out-"));
        const baseline = await captureWorkerChangeBaseline({ repoRoot: directory, outputDir, target, workspaceExec: localSandbox(directory, []) });
        writeFileSync(join(directory, "src/a.c"), attempt.post);
        lint.mockClear();
        const validation = await validateWorkerChange({
          repoRoot: directory, hostRepoRoot: directory, outputDir, attemptIndex: 0, baseline, target,
          dryRun: false, shouldRun: true, claimedExact: false, workspaceExec: localSandbox(directory, []), postAttemptDiffText: attempt.diff,
        });
        expect(validation.reasons.some((reason) => reason.includes("micro_gate:banned_idioms: qualifier_changed_on_shared_global"))).toBe(true);
        calls[placement ?? "default"] = lint.mock.calls.length;
      }
      expect(calls).toEqual({ default: 0, sandbox: 0, host: 1 });
    } finally {
      lint.mockRestore();
    }
  });
});
