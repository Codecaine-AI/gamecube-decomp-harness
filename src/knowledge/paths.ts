import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function packageRoot(): string {
  return fileURLToPath(new URL("../..", import.meta.url));
}

export function checkoutRoot(): string {
  return resolve(packageRoot(), "..");
}

export function knowledgeRoot(): string {
  return resolve(packageRoot(), "knowledge");
}

export function knowledgeManifestPath(): string {
  return resolve(knowledgeRoot(), "manifest.json");
}

export function pastPrsRoot(): string {
  return resolve(knowledgeRoot(), "past_prs");
}

export function decompResourcesRoot(): string {
  return resolve(knowledgeRoot(), "decomp_resources");
}
