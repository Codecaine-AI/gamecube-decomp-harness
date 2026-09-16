import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLocalEnv } from "./local.js";

test("uses grouped env when present while preserving explicit env filenames", () => {
  const root = mkdtempSync(join(tmpdir(), "grouped-local-env-"));
  mkdirSync(join(root, "config"));
  const key = "ORCH_LAYOUT_ENV_TEST";
  const previous = process.env[key];
  try {
    delete process.env[key];
    writeFileSync(join(root, "local.env"), `${key}=legacy\n`);
    writeFileSync(join(root, "config/local.env"), `${key}=grouped\n`);
    expect(loadLocalEnv({ root })).toEqual([join(root, "config/local.env")]);
    expect(process.env[key]).toBe("grouped");
    expect(loadLocalEnv({ root, filenames: ["local.env"], override: true })).toEqual([join(root, "local.env")]);
    expect(process.env[key]).toBe("legacy");
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});
