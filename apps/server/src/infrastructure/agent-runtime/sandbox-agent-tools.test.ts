import { describe, expect, test } from "bun:test";
import { FakeSandboxProvider, type SandboxHandle } from "../../core/job-queue/sandbox.js";
import {
  createSandboxFileToolDefinitions,
  createSandboxGlobToolDefinition,
  createSandboxGrepToolDefinition,
  DEFAULT_SANDBOX_BASH_TIMEOUT_MS,
  DEFAULT_SANDBOX_FILE_TOOL_TIMEOUT_MS,
  sandboxBashOperations,
} from "./sandbox-agent-tools.js";

async function createFakeSandbox(): Promise<{ provider: FakeSandboxProvider; handle: SandboxHandle }> {
  const provider = new FakeSandboxProvider();
  const handle = await provider.create({
    snapshot: "test-snapshot",
    labels: { test: "sandbox-agent-tools" },
    resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
    ttlMinutes: 30,
  });
  return { provider, handle };
}

function textContent(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n");
}

function ripgrepMatch(filePath: string, lineNumber: number, lineText: string): string {
  return JSON.stringify({
    type: "match",
    data: { path: { text: filePath }, line_number: lineNumber, lines: { text: `${lineText}\n` } },
  });
}

describe("sandboxBashOperations", () => {
  test("maps cwd and defined env while always passing an explicit timeout", async () => {
    const { provider, handle } = await createFakeSandbox();
    provider.scriptExec({ exitCode: 0, stdout: "stdout", stderr: "stderr" });
    const chunks: string[] = [];

    const result = await sandboxBashOperations(handle, "/sandbox/workspace").exec(
      "printf output",
      "/host/claim-worktree",
      {
        onData(data) {
          chunks.push(data.toString("utf8"));
        },
        timeout: 2.5,
        env: { KEEP: "yes", DROP: undefined },
      },
    );

    expect(result).toEqual({ exitCode: 0 });
    expect(chunks).toEqual(["stdout", "stderr"]);
    expect(provider.execCalls).toEqual([
      {
        sandboxId: handle.sandboxId,
        command: ["/bin/bash", "-lc", "printf output"],
        opts: {
          cwd: "/sandbox/workspace",
          env: { KEEP: "yes" },
          timeoutMs: 2_500,
        },
      },
    ]);
  });

  test("uses a remote timeout above Daytona's ten-second default when Pi omits one", async () => {
    const { provider, handle } = await createFakeSandbox();

    await sandboxBashOperations(handle, "/sandbox/workspace").exec("true", "/sandbox/workspace/subdir", {
      onData() {},
    });

    expect(DEFAULT_SANDBOX_BASH_TIMEOUT_MS).toBeGreaterThan(10_000);
    expect(provider.execCalls[0]?.opts).toEqual({
      cwd: "/sandbox/workspace/subdir",
      env: undefined,
      timeoutMs: DEFAULT_SANDBOX_BASH_TIMEOUT_MS,
    });
  });
});

describe("sandbox file tool definitions", () => {
  test("registers read/edit/grep/glob under the builtin names", async () => {
    const { handle } = await createFakeSandbox();
    expect(createSandboxFileToolDefinitions(handle, "/workspace").map((tool) => tool.name)).toEqual([
      "read",
      "edit",
      "grep",
      "glob",
    ]);
  });

  test("read preserves builtin line selection and continuation behavior", async () => {
    const { handle } = await createFakeSandbox();
    await handle.writeFile("/workspace/src/example.ts", "one\ntwo\nthree\nfour\n");
    const [read] = createSandboxFileToolDefinitions(handle, "/workspace");

    const result = await read.execute(
      "read-1",
      { path: "src/example.ts", offset: 2, limit: 2 },
      undefined,
      undefined,
      {} as never,
    );

    expect(textContent(result)).toBe("two\nthree\n\n[2 more lines in file. Use offset=4 to continue.]");
  });

  test("edit performs builtin exact replacement through sandbox read/write", async () => {
    const { handle } = await createFakeSandbox();
    await handle.writeFile("/workspace/src/example.ts", "const before = 1;\nconst stable = 2;\n");
    const [, edit] = createSandboxFileToolDefinitions(handle, "/workspace");

    const result = await edit.execute(
      "edit-1",
      { path: "src/example.ts", edits: [{ oldText: "const before = 1;", newText: "const after = 3;" }] },
      undefined,
      undefined,
      {} as never,
    );

    expect(textContent(result)).toBe("Successfully replaced 1 block(s) in src/example.ts.");
    expect(await handle.readFile("/workspace/src/example.ts")).toBe("const after = 3;\nconst stable = 2;\n");
  });

  test("edit preserves builtin uniqueness errors and leaves the file unchanged", async () => {
    const { handle } = await createFakeSandbox();
    await handle.writeFile("/workspace/duplicate.txt", "same\nsame\n");
    const [, edit] = createSandboxFileToolDefinitions(handle, "/workspace");

    await expect(
      edit.execute(
        "edit-duplicate",
        { path: "duplicate.txt", edits: [{ oldText: "same", newText: "changed" }] },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow(
      "Found 2 occurrences of the text in duplicate.txt. The text must be unique. Please provide more context to make it unique.",
    );
    expect(await handle.readFile("/workspace/duplicate.txt")).toBe("same\nsame\n");
  });

  test("grep runs ripgrep in the sandbox and formats builtin-compatible matches", async () => {
    const { provider, handle } = await createFakeSandbox();
    provider.scriptExec(
      { exitCode: 0, stdout: "/workspace/src\n", stderr: "" },
      {
        exitCode: 0,
        stdout: `${ripgrepMatch("example.ts", 2, "const needle = true;")}\n`,
        stderr: "",
      },
    );

    const result = await createSandboxGrepToolDefinition(handle, "/workspace").execute(
      "grep-1",
      { pattern: "needle", path: "src", glob: "*.ts", literal: true },
      undefined,
      undefined,
      {} as never,
    );

    expect(textContent(result)).toBe("example.ts:2: const needle = true;");
    const grepCall = provider.execCalls[1];
    expect(grepCall?.sandboxId).toBe(handle.sandboxId);
    expect(grepCall?.command.slice(0, 2)).toEqual(["/bin/bash", "-lc"]);
    expect(grepCall?.command[2]).toContain("rg \"$@\" | awk");
    expect(grepCall?.command.slice(3)).toEqual([
      "sandbox-grep",
      "101",
      "--json",
      "--line-number",
      "--color=never",
      "--hidden",
      "--fixed-strings",
      "--glob",
      "*.ts",
      "--",
      "needle",
      ".",
    ]);
    expect(grepCall?.opts).toEqual({
      cwd: "/workspace/src",
      env: undefined,
      timeoutMs: DEFAULT_SANDBOX_FILE_TOOL_TIMEOUT_MS,
    });
  });

  test("grep does not report truncation when the result count exactly equals the limit", async () => {
    const { provider, handle } = await createFakeSandbox();
    provider.scriptExec(
      { exitCode: 0, stdout: "/workspace/src\n", stderr: "" },
      {
        exitCode: 0,
        stdout: [ripgrepMatch("a.ts", 1, "needle one"), ripgrepMatch("b.ts", 2, "needle two")].join("\n"),
        stderr: "",
      },
    );

    const result = await createSandboxGrepToolDefinition(handle, "/workspace").execute(
      "grep-exact-limit",
      { pattern: "needle", path: "src", limit: 2 },
      undefined,
      undefined,
      {} as never,
    );

    expect(textContent(result)).toBe("a.ts:1: needle one\nb.ts:2: needle two");
    expect(result.details).toBeUndefined();
    expect(provider.execCalls[1]?.command.slice(3, 5)).toEqual(["sandbox-grep", "3"]);
  });

  test("grep uses one extra remote match to report truncation without displaying it", async () => {
    const { provider, handle } = await createFakeSandbox();
    provider.scriptExec(
      { exitCode: 0, stdout: "/workspace/src\n", stderr: "" },
      {
        exitCode: 0,
        stdout: [
          ripgrepMatch("a.ts", 1, "needle one"),
          ripgrepMatch("b.ts", 2, "needle two"),
          ripgrepMatch("c.ts", 3, "needle three"),
        ].join("\n"),
        stderr: "",
      },
    );

    const result = await createSandboxGrepToolDefinition(handle, "/workspace").execute(
      "grep-over-limit",
      { pattern: "needle", path: "src", limit: 2 },
      undefined,
      undefined,
      {} as never,
    );

    expect(textContent(result)).toBe(
      "a.ts:1: needle one\nb.ts:2: needle two\n\n" +
        "[2 matches limit reached. Use limit=4 for more, or refine pattern]",
    );
    expect(result.details?.matchLimitReached).toBe(2);
    expect(textContent(result)).not.toContain("needle three");
    expect(provider.execCalls[1]?.command.slice(3, 5)).toEqual(["sandbox-grep", "3"]);
  });

  test("glob runs find in the sandbox and returns paths relative to the search root", async () => {
    const { provider, handle } = await createFakeSandbox();
    provider.scriptExec(
      { exitCode: 0, stdout: "/workspace/src\n", stderr: "" },
      {
        exitCode: 0,
        stdout: "/workspace/src/a.ts\n/workspace/src/nested/b.ts\n/workspace/src/unreturned/c.ts\n",
        stderr: "",
      },
    );

    const glob = createSandboxGlobToolDefinition(handle, "/workspace");
    const result = await glob.execute(
      "glob-1",
      { pattern: "*.ts", path: "src", limit: 2 },
      undefined,
      undefined,
      {} as never,
    );

    expect(glob.name).toBe("glob");
    expect(textContent(result)).toBe("a.ts\nnested/b.ts\n\n[2 results limit reached]");
    const findCall = provider.execCalls[1];
    expect(findCall?.command.slice(0, 2)).toEqual(["/bin/bash", "-lc"]);
    expect(findCall?.command[2]).toContain('find "$@" | head -n "$max_results"');
    expect(findCall?.command.slice(3)).toEqual([
      "sandbox-find",
      "2",
      "/workspace/src",
      "-type",
      "f",
      "-not",
      "-path",
      "*/node_modules/*",
      "-not",
      "-path",
      "*/.git/*",
      "-name",
      "*.ts",
      "-print",
    ]);
    expect(findCall?.opts.timeoutMs).toBe(DEFAULT_SANDBOX_FILE_TOOL_TIMEOUT_MS);
  });

  test("glob passes agent-supplied patterns as find arguments instead of shell source", async () => {
    const { provider, handle } = await createFakeSandbox();
    provider.scriptExec(
      { exitCode: 0, stdout: "/workspace/src\n", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
    );
    const pattern = "*.ts; echo should-not-run";

    const result = await createSandboxGlobToolDefinition(handle, "/workspace").execute(
      "glob-safe-pattern",
      { pattern, path: "src", limit: 5 },
      undefined,
      undefined,
      {} as never,
    );

    expect(textContent(result)).toBe("No files found matching pattern");
    expect(provider.execCalls[1]?.command[2]).not.toContain(pattern);
    expect(provider.execCalls[1]?.command.slice(-3)).toEqual(["-name", pattern, "-print"]);
  });
});
