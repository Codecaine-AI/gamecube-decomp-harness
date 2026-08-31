import {
  createMeleeKernelBridgeConfig,
  type CreateMeleeKernelBridgeConfigInput,
  type MeleeKernelBridgeConfig,
} from "./config.js";

export interface NewKernelRegistration {
  kernelId: string;
  displayName: string;
  workingDir: string;
  piSessionsDir: string;
  appBaseUrl: string | null;
  appTraceUrlTemplate: string | null;
  genericTraceUrlTemplate: string | null;
  markerConfig: MeleeKernelBridgeConfig["markerConfig"];
  metadata: Record<string, unknown>;
}

export interface KernelRegistration extends NewKernelRegistration {
  registeredAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export type KernelRegistrationUpsertPort = (
  db: unknown,
  data: NewKernelRegistration,
) => Promise<KernelRegistration>;

async function snapshotKernelRegistration(
  _db: unknown,
  data: NewKernelRegistration,
): Promise<KernelRegistration> {
  // Live kernels advertise through a local manifest instead of the removed
  // shared registration table. The Melee runtime retains this in-memory
  // snapshot for its existing status endpoint.
  const now = new Date().toISOString();
  return {
    ...data,
    registeredAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildMeleeKernelRegistration(
  config: MeleeKernelBridgeConfig = createMeleeKernelBridgeConfig(),
): NewKernelRegistration {
  return {
    kernelId: config.kernelId,
    displayName: config.displayName,
    workingDir: config.workingDir,
    piSessionsDir: config.piSessionsDir,
    appBaseUrl: config.appBaseUrl ?? null,
    appTraceUrlTemplate: config.appTraceUrlTemplate ?? null,
    genericTraceUrlTemplate: config.genericTraceUrlTemplate ?? null,
    markerConfig: config.markerConfig,
    metadata: config.metadata,
  };
}

export interface UpsertMeleeKernelRegistrationOptions {
  db: unknown;
  config?: CreateMeleeKernelBridgeConfigInput | MeleeKernelBridgeConfig;
  upsert?: KernelRegistrationUpsertPort;
}

export async function upsertMeleeKernelRegistration({
  db,
  config,
  upsert = snapshotKernelRegistration,
}: UpsertMeleeKernelRegistrationOptions): Promise<KernelRegistration> {
  const resolvedConfig = createMeleeKernelBridgeConfig(config);
  return upsert(db, buildMeleeKernelRegistration(resolvedConfig));
}
