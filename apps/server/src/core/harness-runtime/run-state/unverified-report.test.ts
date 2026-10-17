import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unverifiedReportId, unverifiedReportLocator } from "./unverified-report-locator.js";
import { UNVERIFIED_REPORT_SOURCE_MAX_CHARS, unverifiedReportSandboxFile } from "./unverified-report.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd }).toString().trim();
}

/** A host checkout whose first commit holds the trusted-base source. */
function hostRepo(source: string): { repo: string; trustedBase: string } {
  const repo = mkdtempSync(join(tmpdir(), "unverified-report-"));
  roots.push(repo);
  git(repo, "init", "-q");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src/MActor.cpp"), source);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "trusted base");
  const trustedBase = git(repo, "rev-parse", "HEAD");
  writeFileSync(join(repo, "src/MActor.cpp"), "// steered\n");
  git(repo, "commit", "-qam", "steered");
  return { repo, trustedBase };
}

const record = (baseRev: string | null, sourcePath: string | null = "src/MActor.cpp") => ({
  unit: "M3DUtil/MActor",
  symbol: "setLightData__6MActorFv",
  analyzedRev: "feedface0123456789",
  baseRev,
  sourcePath,
  recordedAt: "2026-10-17T00:00:00.000Z",
  report: { decision: "unresolved", unexplained_edit_groups: [{ id: "g0" }] },
});

describe("unverified report locator", () => {
  test("is deterministic from unit, symbol and analyzed rev", () => {
    const id = unverifiedReportId(record(null));
    expect(id).toMatch(/^unverified-[0-9a-f]{16}$/);
    expect(unverifiedReportLocator(record("other"))).toBe(`build/steering/reports/${id}.json`);
    expect(unverifiedReportId({ ...record(null), analyzedRev: "another" })).not.toBe(id);
  });
});

describe("unverified report body", () => {
  test("carries the whole gate report and the trusted-base source read on the host", async () => {
    const { repo, trustedBase } = hostRepo("void MActor::setLightData() {}\n");
    const file = await unverifiedReportSandboxFile(record(trustedBase), { hostRepoRoot: repo });

    expect(file.relativePath).toBe(unverifiedReportLocator(record(trustedBase)));
    expect(JSON.parse(file.content)).toEqual({
      schema: "orch-unverified-report-v1",
      unit: "M3DUtil/MActor",
      symbol: "setLightData__6MActorFv",
      analyzed_rev: "feedface0123456789",
      trusted_base_rev: trustedBase,
      source_path: "src/MActor.cpp",
      recorded_at: "2026-10-17T00:00:00.000Z",
      report: { decision: "unresolved", unexplained_edit_groups: [{ id: "g0" }] },
      trusted_base_source: { rev: trustedBase, path: "src/MActor.cpp", text: "void MActor::setLightData() {}\n" },
    });
  });

  test("truncates a long source and says so", async () => {
    const { repo, trustedBase } = hostRepo("x".repeat(UNVERIFIED_REPORT_SOURCE_MAX_CHARS + 10));
    const body = JSON.parse((await unverifiedReportSandboxFile(record(trustedBase), { hostRepoRoot: repo })).content);
    expect(body.trusted_base_source.text).toHaveLength(UNVERIFIED_REPORT_SOURCE_MAX_CHARS);
    expect(body.trusted_base_source.truncated).toEqual({ total_chars: UNVERIFIED_REPORT_SOURCE_MAX_CHARS + 10, kept_chars: UNVERIFIED_REPORT_SOURCE_MAX_CHARS });
  });

  test("records why the source is unavailable instead of failing", async () => {
    const { repo } = hostRepo("x\n");
    const unknownRev = JSON.parse((await unverifiedReportSandboxFile(record("0".repeat(40)), { hostRepoRoot: repo })).content);
    expect(unknownRev.trusted_base_source.unavailable).toContain("git show");
    const noRev = JSON.parse((await unverifiedReportSandboxFile(record(null), { hostRepoRoot: repo })).content);
    expect(noRev.trusted_base_source).toEqual({ rev: null, path: "src/MActor.cpp", unavailable: "the record has no trusted base revision" });
    const escaping = JSON.parse((await unverifiedReportSandboxFile(record("abc", "../x.cpp"), { hostRepoRoot: repo })).content);
    expect(escaping.trusted_base_source.unavailable).toBe("the record has no usable source path");
  });
});
