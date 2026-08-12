import { describe, expect, test } from "bun:test";
import { commitBoundaryWorktree, type BoundaryGitRunner } from "./boundary-commit.js";

describe("boundary-owned commits", () => {
  test("stages, commits, and resolves HEAD before evidence capture", async () => {
    const commands: string[][] = [];
    const runGit: BoundaryGitRunner = async (_repoRoot, args) => {
      commands.push(args);
      if (args[0] === "status") return { exitCode: 0, stdout: " M src/file.c\n", stderr: "" };
      if (args[0] === "rev-parse") return { exitCode: 0, stdout: "commit-b\n", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await expect(commitBoundaryWorktree({
      message: "boundary(pause): run run-1",
      repoRoot: "/repo",
      runGit,
      stateDir: "/repo/.decomp-orchestrator-state",
    })).resolves.toMatchObject({ committed: true, headRevision: "commit-b" });
    expect(commands.map((command) => command[0])).toEqual(["status", "add", "commit", "rev-parse"]);
    expect(commands[1]).toContain(":(exclude).decomp-orchestrator-state");
  });

  test("fails the boundary loudly when git commit fails", async () => {
    const commands: string[][] = [];
    const runGit: BoundaryGitRunner = async (_repoRoot, args) => {
      commands.push(args);
      if (args[0] === "status") return { exitCode: 0, stdout: " M src/file.c\n", stderr: "" };
      if (args[0] === "commit") return { exitCode: 1, stdout: "", stderr: "hook rejected commit" };
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await expect(commitBoundaryWorktree({
      message: "boundary(ship): handoff",
      repoRoot: "/repo",
      runGit,
      stateDir: "/state",
    })).rejects.toThrow("boundary git commit failed");
    expect(commands.map((command) => command[0])).toEqual(["status", "add", "commit"]);
  });
});
