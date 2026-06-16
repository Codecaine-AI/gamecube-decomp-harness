import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type AgentContextRole = "worker";

export interface AgentContextReferenceDefinition {
  path: string;
  role: string;
  purpose: string;
}

export interface AgentContextScriptDefinition {
  path: string;
  purpose: string;
}

export interface AgentContextManifest {
  role_defaults: Record<string, string[]>;
  capability_routes: Record<string, string[]>;
  references: Record<string, AgentContextReferenceDefinition>;
  scripts: Record<string, AgentContextScriptDefinition>;
}

export interface AgentContextReference extends AgentContextReferenceDefinition {
  id: string;
  path: string;
}

function packageRoot(): string {
  return fileURLToPath(new URL("../../..", import.meta.url));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export function agentContextManifestPath(): string {
  return resolve(packageRoot(), "packages/agents/src/context/manifest.json");
}

export function readAgentContextManifest(): AgentContextManifest {
  return JSON.parse(readFileSync(agentContextManifestPath(), "utf8")) as AgentContextManifest;
}

export function agentContextReferences(role: AgentContextRole, capabilities: string[] = []): AgentContextReference[] {
  const manifest = readAgentContextManifest();
  const referenceIds = [...(manifest.role_defaults[role] ?? [])];
  for (const capability of capabilities) {
    referenceIds.push(...(manifest.capability_routes[capability] ?? []));
  }
  return uniqueStrings(referenceIds)
    .map((id) => {
      const reference = manifest.references[id];
      if (!reference) return null;
      return {
        id,
        role: reference.role,
        purpose: reference.purpose,
        path: resolve(packageRoot(), reference.path),
      };
    })
    .filter((reference): reference is AgentContextReference => reference !== null);
}

export function agentContextScripts(): Record<string, AgentContextScriptDefinition> {
  const manifest = readAgentContextManifest();
  return Object.fromEntries(
    Object.entries(manifest.scripts).map(([id, script]) => [
      id,
      {
        ...script,
        path: resolve(packageRoot(), script.path),
      },
    ]),
  );
}

export function agentContextSummary(role: AgentContextRole, capabilities: string[] = []): Record<string, unknown> {
  const manifest = readAgentContextManifest();
  return {
    manifest: agentContextManifestPath(),
    selected_references: agentContextReferences(role, capabilities),
    capability_routes: manifest.capability_routes,
    scripts: agentContextScripts(),
  };
}
