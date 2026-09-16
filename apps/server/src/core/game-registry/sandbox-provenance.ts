import { sandboxRuntimeOptions, type ResolvedGame, type SandboxRuntimeOptions } from "./resolver.js";

export interface SandboxProvenance extends SandboxRuntimeOptions {
  profile: string;
}

/** Select once when claiming work. Retry provisioning must reuse the captured image. */
export function captureSandboxProvenance(game?: Pick<ResolvedGame, "sandbox"> | null, profile?: string): SandboxProvenance {
  return { profile: profile?.trim() || game?.sandbox.default_profile || "", ...sandboxRuntimeOptions(game, profile) };
}

export function readSandboxProvenance(value: unknown): SandboxProvenance | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid sandbox provenance");
  const row = value as Record<string, unknown>;
  for (const key of ["profile", "snapshot_name", "snapshot_baked_rev", "workspace_root"]) {
    if (typeof row[key] !== "string") throw new Error(`Invalid sandbox provenance ${key}`);
  }
  if (!(row.workspace_root as string).startsWith("/")) throw new Error("Invalid sandbox provenance workspace_root");
  const resources = row.resource_class as Record<string, unknown> | undefined;
  if (!resources || typeof resources !== "object") throw new Error("Invalid sandbox provenance resource_class");
  for (const key of ["cpu", "memory_gib", "disk_gib"]) {
    if (typeof resources[key] !== "number" || !Number.isInteger(resources[key]) || (resources[key] as number) <= 0) {
      throw new Error(`Invalid sandbox provenance ${key}`);
    }
  }
  return {
    profile: row.profile as string,
    snapshot_name: row.snapshot_name as string,
    snapshot_baked_rev: row.snapshot_baked_rev as string,
    workspace_root: row.workspace_root as string,
    resource_class: { cpu: resources.cpu as number, memory_gib: resources.memory_gib as number, disk_gib: resources.disk_gib as number },
  };
}
