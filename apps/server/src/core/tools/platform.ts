import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const TOOL_PLATFORMS = ["darwin-x86_64", "linux-i686", "linux-x86_64"] as const;

export type ToolPlatform = (typeof TOOL_PLATFORMS)[number];

export interface ToolPlatformResolutionOptions {
  /** Explicit execution target. ORCH_TOOL_PLATFORM overrides this for test runs. */
  targetPlatform?: string | null;
  /** Injectable environment override; undefined reads process.env. */
  override?: string | null;
  hostPlatform?: string;
  hostArch?: string;
}

export interface StateToolArtifactOptions {
  stateDir: string;
  name: string;
  platform: ToolPlatform;
  /** Optional path within a directory artifact, such as `wibo`. */
  relativePath?: string;
  hostPlatform?: string;
  hostArch?: string;
}

function isToolPlatform(value: string): value is ToolPlatform {
  return (TOOL_PLATFORMS as readonly string[]).includes(value);
}

function parseToolPlatform(value: string, source: string): ToolPlatform {
  if (isToolPlatform(value)) return value;
  throw new Error(`Invalid ${source} ${JSON.stringify(value)}; expected one of ${TOOL_PLATFORMS.join(", ")}`);
}

function hostToolPlatformOrNull(hostPlatform: string, hostArch: string): ToolPlatform | null {
  // The existing Darwin artifacts are x86_64 Mach-O executables and run on
  // Apple Silicon through Rosetta, so Darwin intentionally keeps that artifact id.
  if (hostPlatform === "darwin") return "darwin-x86_64";
  if (hostPlatform === "linux" && hostArch === "ia32") return "linux-i686";
  if (hostPlatform === "linux" && hostArch === "x64") return "linux-x86_64";
  return null;
}

export function hostToolPlatform(hostPlatform: string = process.platform, hostArch: string = process.arch): ToolPlatform {
  const resolved = hostToolPlatformOrNull(hostPlatform, hostArch);
  if (resolved) return resolved;
  throw new Error(
    `Unsupported host tool platform ${hostPlatform}/${hostArch}; set ORCH_TOOL_PLATFORM to one of ${TOOL_PLATFORMS.join(", ")}`,
  );
}

export function resolveToolPlatform(options: ToolPlatformResolutionOptions = {}): ToolPlatform {
  const override = options.override === undefined ? process.env.ORCH_TOOL_PLATFORM : options.override;
  if (override?.trim()) return parseToolPlatform(override.trim(), "ORCH_TOOL_PLATFORM");
  if (options.targetPlatform?.trim()) return parseToolPlatform(options.targetPlatform.trim(), "tool platform");
  return hostToolPlatform(options.hostPlatform ?? process.platform, options.hostArch ?? process.arch);
}

export function isHostToolPlatform(
  platform: ToolPlatform,
  hostPlatform: string = process.platform,
  hostArch: string = process.arch,
): boolean {
  return platform === hostToolPlatformOrNull(hostPlatform, hostArch);
}

export function stateToolArtifactCandidates(options: StateToolArtifactOptions): string[] {
  const suffix = options.relativePath ? [options.relativePath] : [];
  const candidates = [resolve(options.stateDir, "tools", `${options.name}-${options.platform}`, ...suffix)];
  if (isHostToolPlatform(options.platform, options.hostPlatform, options.hostArch)) {
    candidates.push(resolve(options.stateDir, "tools", options.name, ...suffix));
  }
  return candidates;
}

export function resolveStateToolArtifact(options: StateToolArtifactOptions): string | null {
  return stateToolArtifactCandidates(options).find((candidate) => existsSync(candidate)) ?? null;
}

export function requiredStateToolArtifactError(options: StateToolArtifactOptions): Error {
  const expected = resolve(
    options.stateDir,
    "tools",
    `${options.name}-${options.platform}`,
    ...(options.relativePath ? [options.relativePath] : []),
  );
  const legacy = resolve(options.stateDir, "tools", options.name, ...(options.relativePath ? [options.relativePath] : []));
  const hostPlatform = options.hostPlatform ?? process.platform;
  const hostArch = options.hostArch ?? process.arch;
  const host = hostToolPlatformOrNull(hostPlatform, hostArch) ?? `${hostPlatform}/${hostArch} (unsupported)`;
  return new Error(
    `Required tool artifact ${JSON.stringify(options.name)} for execution target ${options.platform} is missing at ${expected}. ` +
      `The unsuffixed artifact ${legacy} is only a fallback for the host tool platform ${host}.`,
  );
}
