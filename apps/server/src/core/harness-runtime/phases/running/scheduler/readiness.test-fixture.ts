import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Test-only: a git checkout with the inputs `readiness.py` reads (objdiff.json, target objects, link map). */
export function writeReadinessRepo(dir: string, options: { version?: string; units?: string[] } = {}): { rev: string; mapPath: string } {
  const version = options.version ?? "GMSJ01";
  const units = options.units ?? ["main/Map/MapObj", "main/System/MarNameRefGen_Enemy"];
  const objdiff = {
    units: units.map((name) => ({
      name,
      target_path: `build/${version}/obj/${name.replace(/^main\//, "")}.o`,
      metadata: { source_path: `src/${name.replace(/^main\//, "")}.cpp` },
    })),
  };
  writeFileSync(join(dir, "objdiff.json"), JSON.stringify(objdiff));
  for (const unit of objdiff.units) {
    mkdirSync(join(dir, unit.target_path, ".."), { recursive: true });
    writeFileSync(join(dir, unit.target_path), `obj ${unit.name}`);
  }
  const mapPath = join(dir, "orig", version, "files", "mario.MAP");
  mkdirSync(join(mapPath, ".."), { recursive: true });
  writeFileSync(mapPath, "map v1\n");
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  git("init", "-q");
  git("config", "user.email", "readiness@example.invalid");
  git("config", "user.name", "Readiness test");
  writeFileSync(join(dir, "README"), "readiness fixture\n");
  git("add", "README");
  git("commit", "-q", "-m", "fixture");
  return { rev: git("rev-parse", "HEAD"), mapPath };
}
