import type { JobKind, JobKindDescriptor } from "./types.js";

export type { JobKindDescriptor } from "./types.js";

const registry = new Map<JobKind, JobKindDescriptor>();

export function registerJobKind(descriptor: JobKindDescriptor): void {
  if (registry.has(descriptor.kind)) {
    throw new Error(`Job kind already registered: ${descriptor.kind}`);
  }
  registry.set(descriptor.kind, descriptor);
}

export function getJobKindDescriptor(kind: JobKind): JobKindDescriptor {
  const descriptor = registry.get(kind);
  if (!descriptor) {
    throw new Error(`Job kind is not registered: ${kind}`);
  }
  return descriptor;
}

export function listJobKindDescriptors(): JobKindDescriptor[] {
  return [...registry.values()];
}

export function resetJobKindRegistry(): void {
  registry.clear();
}
