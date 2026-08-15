export const MELEE_LIVE_PROCESS_NAME = "melee-live";

export function canonicalProcessName(value: unknown): string {
  const raw = (typeof value === "string" ? value : MELEE_LIVE_PROCESS_NAME).trim() || MELEE_LIVE_PROCESS_NAME;
  return raw.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || MELEE_LIVE_PROCESS_NAME;
}

export function dashboardManagedProcessName(): string {
  return MELEE_LIVE_PROCESS_NAME;
}
