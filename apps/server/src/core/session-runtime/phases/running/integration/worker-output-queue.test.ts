import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { processWorkerOutputIntegrationQueue, processWorkerOutputOnFinish } from "./worker-output-queue.js";

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(repo: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString() || result.stdout.toString());
  return result.stdout.toString().trim();
}

function setupRepo(): string {
  const repo = tempDir("merge-on-finish-repo-");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src/a.c"), "int value = 0;\n");
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test User"]);
  git(repo, ["add", "src/a.c"]);
  git(repo, ["commit", "-m", "baseline"]);
  return repo;
}

function patchFile(dir: string): string {
  const path = join(dir, "worker.patch");
  writeFileSync(
    path,
    [
      "diff --git a/src/a.c b/src/a.c",
      "--- a/src/a.c",
      "+++ b/src/a.c",
      "@@ -1 +1 @@",
      "-int value = 0;",
      "+int value = 1;",
      "",
    ].join("\n"),
  );
  return path;
}

function insertQueued(store: StateStore, patchPath: string, id = "integration-1"): void {
  const checkpointId = `checkpoint-${id}`;
  store.db
    .query(
      `
        INSERT INTO worker_checkpoints (
          id, worker_state_id, session_id, epoch_id, epoch_target_id,
          target_claim_id, attempt_index, validation_time, hard_gates_passed,
          validation_status, validation_state, patch_path, diff_path, write_set_json
        ) VALUES (?, 'worker-1', 'run-1', 'epoch-1', 'target-1', 'claim-1', 0,
                  '2026-08-11T00:00:00.000Z', 1, 'passed', 'tentative', ?, ?, '["src/a.c"]')
      `,
    )
    .run(checkpointId, patchPath, patchPath);
  store.db
    .query(
      `
        INSERT INTO worker_output_integrations (
          id, session_id, epoch_id, epoch_target_id, target_claim_id,
          worker_state_id, worker_checkpoint_id, status, target_key,
          patch_path, diff_path, write_set_json, validation_state, metadata_json,
          created_at, updated_at
        ) VALUES (?, 'run-1', 'epoch-1', 'target-1', 'claim-1', 'worker-1', ?,
                  'queued', 'unit::symbol', ?, ?, '["src/a.c"]', 'tentative',
                  '{"scoped_checks_passed":true}', '2026-08-11T00:00:00.000Z', '2026-08-11T00:00:00.000Z')
      `,
    )
    .run(id, checkpointId, patchPath, patchPath);
}

function integration(store: StateStore, id = "integration-1"): Record<string, unknown> {
  return store.db.query("SELECT * FROM worker_output_integrations WHERE id = ?").get(id) as Record<string, unknown>;
}

describe("merge-on-finish worker output integration", () => {
  test("flag on applies, commits into session ancestry, and records tentative validation", async () => {
    const stateDir = tempDir("merge-on-finish-state-");
    const store = openState(stateDir);
    try {
      const repo = setupRepo();
      const patchPath = patchFile(stateDir);
      insertQueued(store, patchPath);

      const result = await processWorkerOutputOnFinish({
        dryRun: false,
        repoRoot: repo,
        sessionId: "run-1",
        stateDir,
        store,
      });

      expect(result.processed).toHaveLength(1);
      expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "merge_on_finish_clean" });
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 1;\n");
      expect(Number(git(repo, ["rev-list", "--count", "HEAD"]))).toBe(2);
      const row = integration(store);
      expect(row.validation_state).toBe("tentative");
      expect(String(row.metadata_json)).toContain("integrated_rev");
      expect(
        (store.db.query("SELECT validation_state FROM worker_checkpoints WHERE id = 'checkpoint-integration-1'").get() as Record<string, unknown>)
          .validation_state,
      ).toBe("tentative");
    } finally {
      store.db.close();
    }
  });

  test("conflict-resolver failure falls back to today's operator-visible conflict state", async () => {
    const stateDir = tempDir("merge-on-finish-conflict-state-");
    const store = openState(stateDir);
    try {
      const repo = setupRepo();
      const patchPath = patchFile(stateDir);
      writeFileSync(join(repo, "src/a.c"), "int value = 2;\n");
      git(repo, ["add", "src/a.c"]);
      git(repo, ["commit", "-m", "current side"]);
      insertQueued(store, patchPath);
      let resolverCalls = 0;

      const result = await processWorkerOutputIntegrationQueue({
        dryRun: false,
        mergeOnFinish: true,
        repoRoot: repo,
        sessionId: "run-1",
        stateDir,
        store,
        conflictResolver: {
          runner: async () => {
            resolverCalls += 1;
            throw new Error("resolver unavailable");
          },
        },
      });

      expect(resolverCalls).toBe(1);
      expect(result.processed[0]).toMatchObject({ status: "conflict", disposition: "apply_check_failed" });
      const row = integration(store);
      expect(row.status).toBe("conflict");
      expect(existsSync(String(row.item_path))).toBe(true);
      const item = readFileSync(String(row.item_path), "utf8");
      expect(item).toContain("resolver_request");
      expect(item).toContain("current_branch_diff_path");
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 2;\n");
    } finally {
      store.db.close();
    }
  });

  test("a resolver-produced patch is serially applied, committed, and recorded", async () => {
    const stateDir = tempDir("merge-on-finish-resolved-state-");
    const store = openState(stateDir);
    try {
      const repo = setupRepo();
      const patchPath = patchFile(stateDir);
      writeFileSync(join(repo, "src/a.c"), "int value = 2;\n");
      git(repo, ["add", "src/a.c"]);
      git(repo, ["commit", "-m", "current side"]);
      insertQueued(store, patchPath);
      const resolvedPatch = [
        "diff --git a/src/a.c b/src/a.c",
        "--- a/src/a.c",
        "+++ b/src/a.c",
        "@@ -1 +1 @@",
        "-int value = 2;",
        "+int value = 1;",
        "",
      ].join("\n");

      const result = await processWorkerOutputIntegrationQueue({
        dryRun: false,
        mergeOnFinish: true,
        repoRoot: repo,
        sessionId: "run-1",
        stateDir,
        store,
        conflictResolver: {
          runner: async () => ({
            rawText: JSON.stringify({
              schema_version: "melee_conflict_resolver_result_v1",
              integration_item_id: "integration-1",
              conflict_group_id: "worker-output:integration-1",
              outcome: "resolved",
              summary: "kept the accepted incoming value on top of current",
              applied_in_isolated_worktree: true,
              resolved_patch: { path: null, text: resolvedPatch, sha256: null },
              conflict_resolutions: [{ path: "src/a.c", resolution: "merged", evidence: "scoped check retained" }],
              validation: [],
              remaining_conflicts: [],
              risks: [],
            }),
          }),
        },
      });

      expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "conflict_resolved" });
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 1;\n");
      expect(Number(git(repo, ["rev-list", "--count", "HEAD"]))).toBe(3);
      expect(integration(store)).toMatchObject({ status: "applied", validation_state: "tentative" });
    } finally {
      store.db.close();
    }
  });

  test("flags off preserve the legacy apply-only DB and git behavior", async () => {
    const stateDir = tempDir("merge-on-finish-off-state-");
    const store = openState(stateDir);
    try {
      const repo = setupRepo();
      const patchPath = patchFile(stateDir);
      insertQueued(store, patchPath);

      const result = await processWorkerOutputIntegrationQueue({
        dryRun: false,
        mergeOnFinish: false,
        repoRoot: repo,
        sessionId: "run-1",
        stateDir,
        store,
      });

      expect(result.processed[0]).toMatchObject({ status: "applied", disposition: "clean_apply" });
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 1;\n");
      expect(Number(git(repo, ["rev-list", "--count", "HEAD"]))).toBe(1);
      expect(JSON.parse(String(integration(store).metadata_json))).toEqual({ scoped_checks_passed: true });
    } finally {
      store.db.close();
    }
  });
});
