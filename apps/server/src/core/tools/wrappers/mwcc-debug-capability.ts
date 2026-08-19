import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentToolRuntimeContext } from "../types.js";

function hostMwccDebugCompilerProvisioned(repoRoot: string): boolean {
  const compilersRoot = resolve(repoRoot, "build/compilers");
  if (!existsSync(compilersRoot)) return false;
  for (const family of readdirSync(compilersRoot, { withFileTypes: true })) {
    if (!family.isDirectory()) continue;
    for (const version of readdirSync(resolve(compilersRoot, family.name), { withFileTypes: true })) {
      if (version.isDirectory() && existsSync(resolve(compilersRoot, family.name, version.name, "mwcceppc_debug.exe"))) return true;
    }
  }
  return false;
}

/** Use a worker's cached sandbox probe when present, otherwise inspect the host checkout. */
export function mwccDebugCompilerProvisioned(
  context: Pick<AgentToolRuntimeContext, "repoRoot" | "mwccDebugProvisioned">,
): boolean {
  return context.mwccDebugProvisioned ?? hostMwccDebugCompilerProvisioned(context.repoRoot);
}
