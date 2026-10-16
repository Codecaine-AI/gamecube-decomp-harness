import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EDIT_SCOPE_INSTRUCTION,
  editScopeRejectionReason,
  parseEditScopeReport,
  runEditScope,
  type EditScopeOrderingPolicy,
  type EditScopeRunner,
} from "./edit-scope.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const POLICY: EditScopeOrderingPolicy = { mode: "enforce", gatedPaths: ["src/System/MarNameRefGen.cpp"], scope: { maxForeignHeaders: 3 } };

function valid(overrides: Record<string, unknown> = {}) {
  return {
    identity: { base_rev: "base-abc", patch_sha256: "p1", readiness: { rev: "base-abc" } },
    verdict: "reject",
    hunks: [{ file: "include/Enemy/BossGesso.hpp", line: 12, class: "TBossGesso", verdict: "not_ready", reason: "owner not decompiled", owner_unit: "enemy/BossGesso" }],
    warnings: ["soft limit"],
    limits: { foreign_headers: 1, foreign_header_lines: 4 },
    ...overrides,
  };
}

function runner(result: { exitCode: number; stdout?: string; stderr?: string }) {
  const calls: string[][] = [];
  const run: EditScopeRunner = async (args) => {
    calls.push(args);
    return { exitCode: result.exitCode, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
  return { run, calls };
}

describe("parseEditScopeReport", () => {
  test("reads a valid report", () => {
    const report = parseEditScopeReport(valid());
    expect(report?.verdict).toBe("reject");
    expect(report?.hunks[0]).toMatchObject({ class: "TBossGesso", verdict: "not_ready", owner_unit: "enemy/BossGesso", line: 12 });
    expect(report?.limits).toEqual({ foreign_headers: 1, foreign_header_lines: 4 });
  });

  test("an unknown hunk verdict is malformed", () => {
    expect(parseEditScopeReport(valid({ hunks: [{ file: "a.hpp", verdict: "maybe" }] }))).toBeNull();
    expect(parseEditScopeReport(valid({ verdict: "unclear" }))).toBeNull();
  });

  test("pass with a rejecting hunk fails closed", () => {
    expect(parseEditScopeReport(valid({ verdict: "pass" }))).toBeNull();
  });
});

describe("runEditScope", () => {
  test("adds --policy-json and --json, parses the output and writes the artifact", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-scope-unit-"));
    dirs.push(dir);
    const { run, calls } = runner({ exitCode: 0, stdout: JSON.stringify(valid()) });
    const artifactPath = join(dir, "attempt-0.edit_scope.json");
    const result = await runEditScope({ runner: run, where: "sandbox", args: ["check", "--repo", "."], policy: POLICY, artifactPath });
    expect(calls[0]).toEqual(["check", "--repo", ".", "--policy-json", JSON.stringify({ gatedPaths: POLICY.gatedPaths, scope: POLICY.scope }), "--json"]);
    expect(result).toMatchObject({ mode: "enforce", error: null, artifactPath });
    expect(JSON.parse(readFileSync(artifactPath, "utf8")).report.verdict).toBe("reject");
  });

  test("a non-zero exit becomes an error", async () => {
    const result = await runEditScope({ runner: runner({ exitCode: 2, stderr: "missing_map" }).run, where: "host", args: ["pr"], policy: POLICY });
    expect(result.report).toBeNull();
    expect(result.error).toBe("edit_scope.py pr exited 2: missing_map");
  });

  test("bad JSON and malformed reports become errors", async () => {
    const bad = await runEditScope({ runner: runner({ exitCode: 0, stdout: "nope" }).run, where: "host", args: ["check"], policy: POLICY });
    expect(bad.error).toBe("edit_scope.py check did not return JSON");
    const malformed = await runEditScope({ runner: runner({ exitCode: 0, stdout: JSON.stringify({ verdict: "pass" }) }).run, where: "host", args: ["check"], policy: POLICY });
    expect(malformed.error).toBe("edit_scope.py check returned a malformed report");
  });
});

describe("editScopeRejectionReason", () => {
  const report = parseEditScopeReport(valid())!;

  test("shadow never rejects", () => {
    expect(editScopeRejectionReason({ mode: "shadow", report, error: null, durationMs: 1 })).toBeNull();
    expect(editScopeRejectionReason({ mode: "shadow", report: null, error: "boom", durationMs: 1 })).toBeNull();
  });

  test("enforce names the class and owner unit, and fails closed on errors", () => {
    expect(editScopeRejectionReason({ mode: "enforce", report, error: null, durationMs: 1 })).toBe(
      `edit_scope: TBossGesso (not_ready, owner enemy/BossGesso) at include/Enemy/BossGesso.hpp:12: owner not decompiled. ${EDIT_SCOPE_INSTRUCTION}`,
    );
    expect(editScopeRejectionReason({ mode: "enforce", report: null, error: "boom", durationMs: 1 })).toContain("could not run (boom)");
    expect(editScopeRejectionReason({ mode: "enforce", report: { ...report, verdict: "pass", hunks: [] }, error: null, durationMs: 1 })).toBeNull();
  });
});
