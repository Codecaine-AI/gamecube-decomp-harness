import { randomUUID } from "node:crypto";

export function newCycleUuid(): string {
  return randomUUID();
}

export function newCycleId(cycleUuid = newCycleUuid()): string {
  return `cycle:${cycleUuid}`;
}

export function kernelAppSessionIdForCycle(cycleUuid: string): string {
  return `cycle:${cycleUuid}`;
}
