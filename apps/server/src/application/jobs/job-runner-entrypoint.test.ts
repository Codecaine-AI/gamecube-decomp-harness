import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("worker entrypoint waits for main when only an unreferenced callback remains", () => {
  const directory = mkdtempSync(join(tmpdir(), "job-entrypoint-"));
  try {
    const preload = join(directory, "preload.ts");
    writeFileSync(preload, `
      import { mock } from "bun:test";
      mock.module(${JSON.stringify(resolve(import.meta.dir, "job-runner.ts"))}, () => ({
        main: () => new Promise<void>((resolveMain) => {
          const timer = setTimeout(() => {
            console.log("main-settled");
            resolveMain();
          }, 30);
          timer.unref();
        }),
      }));
    `);
    const result = spawnSync(process.execPath, [
      "--preload", preload, resolve(import.meta.dir, "../../job-runner.ts"),
    ], { encoding: "utf8", timeout: 5_000 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("main-settled");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
