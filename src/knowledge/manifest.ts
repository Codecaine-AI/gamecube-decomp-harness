import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { knowledgeManifestPath, knowledgeRoot } from "./paths.js";

export type KnowledgeRole = "director" | "worker";

export interface KnowledgeReferenceDefinition {
  path: string;
  role: string;
  purpose: string;
}

export interface KnowledgeScriptDefinition {
  path: string;
  purpose: string;
}

export interface KnowledgeManifest {
  role_defaults: Record<string, string[]>;
  capability_routes: Record<string, string[]>;
  references: Record<string, KnowledgeReferenceDefinition>;
  scripts: Record<string, KnowledgeScriptDefinition>;
}

export interface KnowledgeReferenceResource extends KnowledgeReferenceDefinition {
  id: string;
  path: string;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export function readKnowledgeManifest(): KnowledgeManifest {
  return JSON.parse(readFileSync(knowledgeManifestPath(), "utf8")) as KnowledgeManifest;
}

export function knowledgeReferenceResources(role: KnowledgeRole, capabilities: string[] = []): KnowledgeReferenceResource[] {
  const manifest = readKnowledgeManifest();
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
        path: resolve(knowledgeRoot(), reference.path),
      };
    })
    .filter((reference): reference is KnowledgeReferenceResource => reference !== null);
}

export function knowledgeScripts(): Record<string, KnowledgeScriptDefinition> {
  const manifest = readKnowledgeManifest();
  return Object.fromEntries(
    Object.entries(manifest.scripts).map(([id, script]) => [
      id,
      {
        ...script,
        path: resolve(knowledgeRoot(), script.path),
      },
    ]),
  );
}

export function knowledgeSummary(role: KnowledgeRole, capabilities: string[] = []): Record<string, unknown> {
  const manifest = readKnowledgeManifest();
  return {
    root: knowledgeRoot(),
    manifest: knowledgeManifestPath(),
    selected_references: knowledgeReferenceResources(role, capabilities),
    capability_routes: manifest.capability_routes,
    available_references: Object.fromEntries(
      Object.entries(manifest.references).map(([id, reference]) => [
        id,
        {
          ...reference,
          path: resolve(knowledgeRoot(), reference.path),
        },
      ]),
    ),
    scripts: knowledgeScripts(),
  };
}
