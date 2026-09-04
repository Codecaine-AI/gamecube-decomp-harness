import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { borrowState, openState, stateStoreCloseInfo } from "./store.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function stateDir(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`));
  tempDirs.push(dir);
  return dir;
}

describe("openState migration mode", () => {
  test("verify-only mode does not create migration bookkeeping on a fresh database", () => {
    const dir = stateDir("state-verify-fresh");

    expect(() => openState(dir, { migrate: false })).toThrow(
      "schema is behind this process: no migration bookkeeping exists",
    );

    const db = new Database(join(dir, "orchestrator.sqlite"));
    try {
      expect(db.query("SELECT name FROM sqlite_schema WHERE name = 'schema_migrations'").get()).toBeNull();
    } finally {
      db.close();
    }
  });

  test("verify-only mode rejects a known migration prefix without applying pending migrations", () => {
    const dir = stateDir("state-verify-behind");
    const initialized = openState(dir);
    initialized.db.run("DELETE FROM schema_migrations WHERE version > 1");
    initialized.db.close();

    expect(() => openState(dir, { migrate: false })).toThrow(
      "schema is behind this process: applied through v1, this build requires v5",
    );

    const db = new Database(join(dir, "orchestrator.sqlite"));
    try {
      expect(db.query("SELECT version, name FROM schema_migrations ORDER BY version").all()).toEqual([
        { version: 1, name: "baseline" },
      ]);
    } finally {
      db.close();
    }
  });
});

describe("StateStore ownership", () => {
  test("closing a borrowed view cannot close its owner", () => {
    const owner = openState(stateDir("state-borrowed-close"));
    const borrowed = borrowState(owner);
    try {
      borrowed.db.close();

      expect(owner.db.query("SELECT 1 AS value").get()).toEqual({ value: 1 });
      expect(stateStoreCloseInfo(owner)).toBeNull();
    } finally {
      owner.db.close();
    }

    expect(stateStoreCloseInfo(owner)).toMatchObject({
      closedAt: expect.any(String),
      stack: expect.stringContaining("StateStore owner database closed here"),
    });
  });
});
