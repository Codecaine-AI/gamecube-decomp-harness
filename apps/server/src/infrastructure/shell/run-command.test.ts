import { describe, expect, test } from "bun:test";
import { runCommand } from "./run-command.js";

describe("runCommand", () => {
  test("returns exit 124 promptly when a child process inherits its pipes", async () => {
    const startedAt = performance.now();
    const result = await runCommand(
      process.cwd(),
      ["/bin/sh", "-c", "printf 'timeout stderr\\n' >&2; sleep 5"],
      { timeoutMs: 50 },
    );
    const durationMs = performance.now() - startedAt;

    expect(result.exitCode).toBe(124);
    expect(result.stderr).toContain("timeout stderr");
    expect(result.stderr).toContain("Command timed out");
    expect(durationMs).toBeLessThan(1_000);
  });
});
