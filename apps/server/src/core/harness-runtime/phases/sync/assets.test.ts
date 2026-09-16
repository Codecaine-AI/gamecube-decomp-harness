import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linkGameAssets } from "./assets.js";

test("links missing nested assets, preserves checkout assets, and repeats safely", () => {
  const root = mkdtempSync(join(tmpdir(), "sync-assets-"));
  const repo = join(root, "repo");
  const worktree = join(root, "worktree");
  try {
    expect(linkGameAssets(repo, worktree)).toBe(0);
    mkdirSync(join(repo, "orig", "nested"), { recursive: true });
    mkdirSync(join(worktree, "orig"), { recursive: true });
    writeFileSync(join(repo, "orig", "nested", "game.bin"), "source");
    writeFileSync(join(repo, "orig", "existing.bin"), "source");
    writeFileSync(join(worktree, "orig", "existing.bin"), "preserved");
    expect(linkGameAssets(repo, worktree)).toBe(1);
    expect(readlinkSync(join(worktree, "orig", "nested", "game.bin"))).toBe(join(repo, "orig", "nested", "game.bin"));
    expect(readFileSync(join(worktree, "orig", "existing.bin"), "utf8")).toBe("preserved");
    expect(linkGameAssets(repo, worktree)).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
