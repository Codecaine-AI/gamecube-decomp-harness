import { afterEach, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCodecaineEnv } from "./codecaine-env.js";

const KEYS = ["CODECAINE_ENV_FILE", "TYPESAFE_API_KEY"] as const;
const saved = new Map(KEYS.map((key) => [key, process.env[key]]));
const tempDirs: string[] = [];

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "codecaine-env-"));
  tempDirs.push(dir);
  return dir;
}

function tempEnvFile(text: string): string {
  const file = join(tempDir(), "env");
  writeFileSync(file, text);
  return file;
}

// A function read keeps TypeScript from narrowing a deleted key to `undefined`.
function typesafeKey(): string | undefined {
  return process.env.TYPESAFE_API_KEY;
}

/** Runs `run` and returns every console call and stdout/stderr write it made. */
function outputCalls<T>(run: () => T): { result: T; calls: unknown[][] } {
  const spies = [
    spyOn(console, "log"),
    spyOn(console, "info"),
    spyOn(console, "warn"),
    spyOn(console, "error"),
    spyOn(console, "debug"),
    spyOn(process.stdout, "write"),
    spyOn(process.stderr, "write"),
  ];
  try {
    const result = run();
    return { result, calls: spies.flatMap((spy) => spy.mock.calls.map((call) => [...call])) };
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
}

test("loadCodecaineEnv loads TYPESAFE_API_KEY without overriding or logging", () => {
  const marker = `KEY_MARKER_${randomUUID()}`;
  const file = tempEnvFile(`TYPESAFE_API_KEY=${marker}\n`);
  process.env.CODECAINE_ENV_FILE = file;
  delete process.env.TYPESAFE_API_KEY;

  const loaded = outputCalls(() => loadCodecaineEnv());
  expect(loaded.result).toEqual([file]);
  expect(typesafeKey()).toBe(marker);
  expect(loaded.calls).toEqual([]);

  const otherMarker = `KEY_MARKER_${randomUUID()}`;
  process.env.CODECAINE_ENV_FILE = tempEnvFile(`TYPESAFE_API_KEY=${otherMarker}\n`);
  const reloaded = outputCalls(() => loadCodecaineEnv());
  expect(typesafeKey()).toBe(marker);
  expect(reloaded.calls).toEqual([]);
});

test("loadCodecaineEnv is a no-op when the file is missing", () => {
  process.env.CODECAINE_ENV_FILE = join(tempDir(), "absent-env");
  delete process.env.TYPESAFE_API_KEY;

  expect(loadCodecaineEnv()).toEqual([]);
  expect(typesafeKey()).toBeUndefined();
});
