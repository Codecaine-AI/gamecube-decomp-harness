import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sourceViewToolRegistration, readSourceViewFile } from "./source-view.js";
import type { AgentToolRuntimeContext } from "../types.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true }); });
function fixture(): AgentToolRuntimeContext {
  const root = mkdtempSync(join(tmpdir(), "source-view-")); roots.push(root);
  mkdirSync(join(root, "src")); writeFileSync(join(root, "src/test.c"), "void canonical(void) {}\n");
  return { role: "worker", cwd: root, repoRoot: root };
}

test("reads current local source on every call and rejects escaping paths", async () => {
  const context = fixture();
  expect((await readSourceViewFile(context, "src/test.c")).source).toContain("canonical");
  writeFileSync(join(context.cwd, "src/test.c"), "void changed(void) {}\n");
  expect((await readSourceViewFile(context, "src/test.c")).source).toContain("changed");
  await expect(readSourceViewFile(context, "../outside.c")).rejects.toThrow("path_outside_checkout");
  symlinkSync("/etc/hosts", join(context.cwd, "src/outside.c"));
  await expect(readSourceViewFile(context, "src/outside.c")).rejects.toThrow("path_outside_checkout");
});

test("librarian reads the checkout pinned by its pass, independently of its harness cwd", async () => {
  const context = fixture();
  context.role = "librarian";
  context.knowledgeCheckoutRoot = context.cwd;
  context.cwd = "/not-the-game-checkout";
  const file = await readSourceViewFile(context, "src/test.c");
  expect(file.source).toContain("void canonical(void)");
  expect(file.path).toBe("src/test.c");
});

test("uses sandbox text instead of the host checkout and passes untrusted paths as arguments", async () => {
  const context = fixture();
  let seen: string[] = [];
  context.sandboxHandle = {
    sandboxId: "fixture",
    exec: async (command: string[]) => { seen = command; return { exitCode: 0, stdout: JSON.stringify({ source: "void sandbox_only(void) {}" }), stderr: "" }; },
  } as unknown as NonNullable<AgentToolRuntimeContext["sandboxHandle"]>;
  const file = await readSourceViewFile(context, "src/test.c");
  expect(file.source).toContain("sandbox_only");
  expect(seen[0]).toBe("python3");
  expect(seen[4]).toBe("src/test.c");
  const output = await sourceViewToolRegistration.create(context).execute("test", { path: "src/test.c" });
  expect(JSON.stringify(output)).toContain("sandbox_only");
  expect(JSON.stringify(output)).toContain("Symbols in this excerpt");
});

test("sandbox read script handles literal shell characters and rejects symlink escapes", async () => {
  const context = fixture();
  context.sandboxHandle = {
    sandboxId: "fixture",
    exec: async (command: string[]) => {
      const result = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe" });
      return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
    },
  } as unknown as NonNullable<AgentToolRuntimeContext["sandboxHandle"]>;
  const path = "src/literal '$(do_not_execute).c";
  writeFileSync(join(context.cwd, path), "void literal_name(void) {}");
  expect((await readSourceViewFile(context, path)).source).toContain("literal_name");
  symlinkSync("/etc/hosts", join(context.cwd, "src/escape.c"));
  await expect(readSourceViewFile(context, "src/escape.c")).rejects.toThrow("path_outside_checkout");
  writeFileSync(join(context.cwd, "src/large.c"), "a".repeat(2_000_001));
  await expect(readSourceViewFile(context, "src/large.c")).rejects.toThrow("file_too_large");
});
