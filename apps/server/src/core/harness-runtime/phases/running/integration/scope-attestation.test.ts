import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "@server/infrastructure/shell";
import type { EditScopeResult } from "@server/core/validation/edit-scope/edit-scope.js";
import {
  buildEditScopeAttestation,
  editScopeInScope,
  verifyEditScopeAttestation,
} from "./scope-attestation.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function git(repo: string, args: string[], input?: string): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe", ...(input !== undefined ? { stdin: Buffer.from(input) } : {}) });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function commit(repo: string, files: Record<string, string>, message: string): string {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(repo, path, ".."), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", message]);
  return git(repo, ["rev-parse", "HEAD"]);
}

const POLICY = { mode: "enforce" as const, gatedPaths: ["src/System/MarNameRefGen*.cpp"] };
const KOOPA = "src/Enemy/Koopa.cpp";
const BEFORE = "void TKoopa::init() {}\n";
const AFTER = "void TKoopa::init() { mHp = 1; }\n";

/** A repo at the claim base, the worker's patch, and the sandbox's pass verdict over it. */
function fixture() {
  const repo = temp("scope-attest-repo-");
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "t@example.com"]);
  git(repo, ["config", "user.name", "T"]);
  const base = commit(repo, {
    [KOOPA]: BEFORE,
    "include/Enemy/Koopa.hpp": "class TKoopa { int mHp; };\n",
    "src/Enemy/Kuribo.cpp": "void TKuribo::init() {}\n",
    "src/Enemy/Other.cpp": "typedef int MyInt;\nint other = 0;\n",
    "docs/notes.md": "notes\n",
  }, "base");
  const work = temp("scope-attest-work-");
  const patchPath = join(work, "attempt.patch");
  writeFileSync(join(repo, KOOPA), AFTER);
  writeFileSync(join(repo, "docs/notes.md"), "notes, changed\n");
  writeFileSync(patchPath, git(repo, ["diff", base]) + "\n");
  git(repo, ["checkout", "-q", "--", "."]);
  const patchText = readFileSync(patchPath, "utf8");
  const blob = (text: string) => git(repo, ["hash-object", "--stdin"], text);
  const result: EditScopeResult = {
    mode: "enforce",
    error: null,
    durationMs: 1,
    report: {
      identity: { base_rev: base, patch_sha256: "canonical", readiness: {} },
      verdict: "pass",
      hunks: [{ file: KOOPA, line: 1, class: "TKoopa", verdict: "own_class", reason: "", owner_unit: "Enemy/Koopa" }],
      warnings: [],
      limits: { foreign_headers: 0, foreign_header_lines: 0 },
      scope_inputs: {
        files: [{ path: KOOPA, before_blob: blob(BEFORE), after_blob: blob(AFTER) }],
        owner_sources: [KOOPA, "src/Enemy/Kuribo.cpp"],
      },
    },
  };
  const attestation = buildEditScopeAttestation({ result, policy: POLICY, baseRev: base.slice(0, 12), targetUnit: "Enemy/Koopa", patchText })!;
  const verify = (overrides: Partial<Parameters<typeof verifyEditScopeAttestation>[0]> = {}) => verifyEditScopeAttestation({
    attestation, patchText, patchPath, policy: POLICY, targetUnit: "Enemy/Koopa", commandRunner: runCommand, repoRoot: repo, dir: join(work, "attest"), ...overrides,
  });
  return { repo, base, patchPath, patchText, result, attestation, verify };
}

describe("buildEditScopeAttestation", () => {
  test("attests only a clean pass without UNUSED evidence, bound to the patch bytes", () => {
    const { attestation, result, base, patchText } = fixture();
    expect(attestation).toMatchObject({ version: 1, base_rev: base, verdict: "pass", target_unit: "Enemy/Koopa", hunk_count: 1 });
    expect(attestation.patch_sha256).toHaveLength(64);
    const build = (patch: Partial<Parameters<typeof buildEditScopeAttestation>[0]>) =>
      buildEditScopeAttestation({ result, policy: POLICY, baseRev: base, targetUnit: "Enemy/Koopa", patchText, ...patch });
    expect(build({ result: { ...result, report: { ...result.report!, verdict: "reject" } } })).toBeNull();
    expect(build({ result: { ...result, error: "timeout" } })).toBeNull();
    expect(build({ unusedResult: result })).toBeNull();
    expect(build({ usedUnusedChecks: true })).toBeNull();
    expect(build({ result: { ...result, report: { ...result.report!, scope_inputs: undefined } } })).toBeNull();
    expect(build({ baseRev: "0000000" })).toBeNull();
    expect(build({ patchText: "" })).toBeNull();
  });
});

describe("verifyEditScopeAttestation", () => {
  test("matches at the claim base and over drift outside the indexed sources", async () => {
    const { repo, verify } = fixture();
    expect(await verify()).toMatchObject({ ok: true });
    commit(repo, { "docs/other.md": "unrelated\n" }, "docs only");
    const result = await verify();
    expect(result).toMatchObject({ ok: true, changedPaths: ["docs/notes.md", KOOPA] });
    // The repo's own index and tree are untouched.
    expect(git(repo, ["status", "--porcelain"])).toBe("");
  });

  test("refuses a different patch, policy, target or file set", async () => {
    const { verify, patchText, attestation } = fixture();
    expect(await verify({ patchText: `${patchText}\n` })).toMatchObject({ ok: false, reason: expect.stringContaining("patch differs") });
    expect(await verify({ policy: { ...POLICY, gatedPaths: [] } })).toMatchObject({ ok: false, reason: expect.stringContaining("policy") });
    expect(await verify({ targetUnit: "Enemy/Kuribo" })).toMatchObject({ ok: false, reason: expect.stringContaining("target unit") });
    expect(await verify({ attestation: { ...attestation, files: [] } })).toMatchObject({ ok: false, reason: expect.stringContaining("not the texts") });
    expect(await verify({ attestation: undefined })).toMatchObject({ ok: false, reason: "no sandbox scope attestation" });
    expect(await verify({ attestation: { version: 2 } })).toMatchObject({ ok: false, reason: "malformed sandbox scope attestation" });
  });

  test("is stale when any indexed source changed since the base: header, owner, namespace, or a typedef in an unrelated unit", async () => {
    const header = fixture();
    commit(header.repo, { "include/Enemy/Koopa.hpp": "class TKoopa { int mHp; int mX; };\n" }, "header");
    expect(await header.verify()).toMatchObject({ ok: false, reason: expect.stringContaining("include/Enemy/Koopa.hpp") });

    const owner = fixture();
    commit(owner.repo, { "src/Enemy/Kuribo.cpp": "TKuribo::TKuribo() {}\n" }, "owner decompiled");
    expect(await owner.verify()).toMatchObject({ ok: false, reason: expect.stringContaining("src/Enemy/Kuribo.cpp") });

    const namespace = fixture();
    commit(namespace.repo, { "src/Enemy/Other.cpp": "namespace JDrama { int other = 0; }\n" }, "namespace");
    expect(await namespace.verify()).toMatchObject({ ok: false, reason: expect.stringContaining("src/Enemy/Other.cpp") });

    // The type index reads every indexed source: a typedef flip in a unit the verdict never named still invalidates it.
    const typedef = fixture();
    commit(typedef.repo, { "src/Enemy/Other.cpp": "typedef float MyInt;\nint other = 0;\n" }, "typedef int -> float");
    expect(await typedef.verify()).toMatchObject({ ok: false, reason: expect.stringContaining("indexed sources changed") });
  }, 30_000);

  test("is stale when the target file moved under the patch, even if it still applies", async () => {
    const { repo, verify } = fixture();
    commit(repo, { [KOOPA]: `${BEFORE}// trailing comment\n` }, "same file changed");
    const result = await verify();
    expect(result.ok).toBe(false);
  });
});

describe("helpers", () => {
  test("in-scope paths", () => {
    expect(editScopeInScope("src/a.cpp")).toBe(true);
    expect(editScopeInScope("include/a.h")).toBe(true);
    expect(editScopeInScope("libs/JSystem/include/J.h")).toBe(true);
    expect(editScopeInScope("libs/JSystem/src/J.cpp")).toBe(false);
    expect(editScopeInScope("docs/x.md")).toBe(false);
  });
});

