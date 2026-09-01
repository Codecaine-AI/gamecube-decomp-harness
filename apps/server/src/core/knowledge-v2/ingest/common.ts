import { createHash } from "node:crypto";

export function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function taskId(pathway: string, payload: string): string {
  return `task:${pathway}:${shortHash(payload)}`;
}

export function formatAddress(decimal: string): string {
  return `0x${Number(decimal).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
