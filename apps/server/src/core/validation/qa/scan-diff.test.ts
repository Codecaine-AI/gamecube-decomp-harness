import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { QA_SCAN_REQUIRES_GAME_ERROR, REVIEW_LINT_GLOBAL_STANDARDS_DIR_ENV, qaScanGlobalStandardsDir, runQaScanDiff } from "./scan-diff.js";

const orchestratorRoot = resolve(import.meta.dir, "../../../../../..");
const scanner = resolve(orchestratorRoot, "toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py");

function run(cwd: string, command: string[]): string {
  const result = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function scan(repo: string, base: string, standardsDir: string, allowlist: unknown[] = []): Record<string, any> {
  const result = Bun.spawnSync([
    "python3", scanner, "--repo", repo, "--base", base, "--json",
    "--address-named-static-data-allowlist", JSON.stringify(allowlist),
  ], { cwd: repo, stdout: "pipe", stderr: "pipe", env: { ...process.env, REVIEW_LINT_STANDARDS_DIR: standardsDir } });
  expect([0, 1, 2]).toContain(result.exitCode);
  if (!result.stdout.toString().trim()) throw new Error(result.stderr.toString());
  return JSON.parse(result.stdout.toString()) as Record<string, any>;
}

describe("address_named_static_data exceptions", () => {
  test("reports configured suppressions, base-owned declarations, and new errors", () => {
    const repo = mkdtempSync(resolve(tmpdir(), "qa-address-static-"));
    const standardsDir = resolve(repo, "standards", "literals_data_and_externs");
    mkdirSync(standardsDir, { recursive: true });
    writeFileSync(resolve(standardsDir, "slice.json"), JSON.stringify({
      family: "literals_data_and_externs",
      rules: [{ rule_id: "address_named_static_data", severity: "error", standard_id: null, applies_to: ["src/**/*.c"] }],
    }));
    writeFileSync(resolve(standardsDir, "rules.py"), `
import re
PATTERN = re.compile(r"^\\s*static\\s+.*\\b(?P<symbol>[A-Za-z_][A-Za-z0-9_]*_[0-9A-Fa-f]{8})\\b")
def check_address_named_static_data(hunk):
    return [{"line": line, "excerpt": text, "detail": {"symbol": match.group("symbol")}}
            for line, text in hunk["added"] if (match := PATTERN.search(text))]
RULES = [{"rule_id": "address_named_static_data", "severity": "error", "standard_id": None,
          "message": "Address-named static data declaration.", "applies_to": ["src/**/*.c"],
          "check": check_address_named_static_data}]
`);
    mkdirSync(resolve(repo, "src/a"), { recursive: true });
    mkdirSync(resolve(repo, "src/b"), { recursive: true });
    run(repo, ["git", "init", "-q"]);
    run(repo, ["git", "config", "user.email", "qa@example.test"]);
    run(repo, ["git", "config", "user.name", "QA Test"]);
    writeFileSync(resolve(repo, "src/a/data.c"), "static int lbl_80400000;\nvoid before(void) {}\n");
    writeFileSync(resolve(repo, "src/b/data.c"), "void before(void) {}\n");
    run(repo, ["git", "add", "."]);
    run(repo, ["git", "commit", "-qm", "base"]);
    const base = run(repo, ["git", "rev-parse", "HEAD"]);
    writeFileSync(resolve(repo, "src/a/data.c"), [
      "void before(void) {}",
      "static int lbl_80400000;",
      "static int lbl_80400004;",
      "static int lbl_80400008;",
      "static int lbl_8040000C;",
      "",
    ].join("\n"));
    writeFileSync(resolve(repo, "src/b/data.c"), "void before(void) {}\nstatic int lbl_80400008;\n");
    run(repo, ["git", "add", "."]);
    run(repo, ["git", "commit", "-qm", "head"]);

    const payload = scan(repo, base, resolve(repo, "standards"), [
      { symbol: "lbl_80400004", reason: "intentional overlay" },
      { file: "src/a/data.c", symbol: "lbl_80400008", reason: "owned by a.c" },
    ]);
    const bySymbolAndFile = new Map<string, any>(payload.findings.map((finding: any) => [`${finding.file}:${finding.detail.symbol}`, finding]));

    expect(bySymbolAndFile.get("src/a/data.c:lbl_80400004")?.disposition).toBe("suppressed");
    expect(bySymbolAndFile.get("src/a/data.c:lbl_80400004")?.detail.suppression.reason).toBe("intentional overlay");
    expect(bySymbolAndFile.get("src/a/data.c:lbl_80400008")?.disposition).toBe("suppressed");
    expect(bySymbolAndFile.get("src/b/data.c:lbl_80400008")?.severity).toBe("error");
    expect(bySymbolAndFile.get("src/a/data.c:lbl_80400000")?.disposition).toBe("informational");
    expect(bySymbolAndFile.get("src/a/data.c:lbl_8040000C")?.severity).toBe("error");
  });
});

describe("runQaScanDiff game resolution", () => {
  const cleanStdout = JSON.stringify({
    tool: "review_lint",
    operation: "review_lint:scan_diff",
    status: "passed",
    repo: "/repo",
    base: null,
    findings: [],
    counts: { errors: 0, warnings: 0 },
  });

  async function invoke(game: { gameId?: string } | undefined): Promise<{ env: Record<string, string> | undefined; command: string[] } & Awaited<ReturnType<typeof runQaScanDiff>>> {
    let seenEnv: Record<string, string> | undefined;
    let seenCommand: string[] = [];
    const invocation = await runQaScanDiff({
      repoRoot: "/repo",
      orchestratorRoot,
      game,
      stateDir: "/state",
      diffFile: "/tmp/attempt.patch",
      surface: "worker",
      processRunner: async (_repoRoot, command, env) => {
        seenEnv = env;
        seenCommand = command;
        return { exitCode: 0, stdout: cleanStdout, stderr: "" };
      },
    });
    return { ...invocation, env: seenEnv, command: seenCommand };
  }

  test("fails closed without a game instead of defaulting to melee", async () => {
    const invocation = await invoke(undefined);
    expect(invocation.toolError).toBe(QA_SCAN_REQUIRES_GAME_ERROR);
    expect(invocation.toolError).toBe("qa scan requires a game");
    expect(invocation.result).toBeNull();
    expect(invocation.exitCode).toBe(-1);
    expect(invocation.env).toBeUndefined();

    const noId = await invoke({});
    expect(noId.toolError).toBe(QA_SCAN_REQUIRES_GAME_ERROR);
  });

  test("passes the game's ORCH_GAME_DIR and the global standards dir for a non-melee game", async () => {
    const invocation = await invoke({ gameId: "sms" });
    expect(invocation.toolError).toBeNull();
    expect(invocation.env?.ORCH_GAME_ID).toBe("sms");
    expect(invocation.env?.ORCH_GAME_DIR).toBe(resolve(orchestratorRoot, "games/sms"));
    expect(invocation.env?.[REVIEW_LINT_GLOBAL_STANDARDS_DIR_ENV]).toBe(qaScanGlobalStandardsDir(orchestratorRoot));
    expect(invocation.env?.[REVIEW_LINT_GLOBAL_STANDARDS_DIR_ENV]).toBe(
      resolve(orchestratorRoot, "knowledge/global/sources/injectable/decomp_standards/standards"),
    );
    expect(invocation.command).toContain("--diff-file");
    expect(invocation.command).toContain("--surface");
  });

  test("sets the global standards dir for melee too (its game tree is an empty shell)", async () => {
    const invocation = await invoke({ gameId: "melee" });
    expect(invocation.toolError).toBeNull();
    expect(invocation.env?.ORCH_GAME_DIR).toBe(resolve(orchestratorRoot, "games/melee"));
    expect(invocation.env?.[REVIEW_LINT_GLOBAL_STANDARDS_DIR_ENV]).toBe(qaScanGlobalStandardsDir(orchestratorRoot));
  });
});
