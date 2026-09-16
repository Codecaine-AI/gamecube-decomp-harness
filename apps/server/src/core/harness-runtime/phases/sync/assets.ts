import { existsSync, mkdirSync, readdirSync, statSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";
function linkMissingFiles(sourceDir: string, targetDir: string): number {
  let linked = 0;
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = resolve(sourceDir, entry);
    const targetPath = resolve(targetDir, entry);
    if (statSync(sourcePath).isDirectory()) {
      linked += linkMissingFiles(sourcePath, targetPath);
    } else if (!existsSync(targetPath)) {
      symlinkSync(sourcePath, targetPath);
      linked += 1;
    }
  }
  return linked;
}

export function linkGameAssets(repoRoot: string, worktreePath: string): number {
  const origSource = resolve(repoRoot, "orig");
  if (!existsSync(origSource)) return 0;
  return linkMissingFiles(origSource, resolve(worktreePath, "orig"));
}

