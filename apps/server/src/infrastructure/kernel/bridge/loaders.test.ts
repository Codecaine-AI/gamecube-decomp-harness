import { describe, expect, test } from "bun:test";

import {
  createMeleeLoaderCatalog,
  MELEE_INLINE_CONTEXT_LOADER_KINDS,
} from "./loaders.js";

describe("Melee kernel context loaders", () => {
  test("keeps target knowledge inside the worker packet loader", () => {
    expect(MELEE_INLINE_CONTEXT_LOADER_KINDS).toContain("worker-packet");
    expect(MELEE_INLINE_CONTEXT_LOADER_KINDS).not.toContain("target-knowledge" as never);
    expect(MELEE_INLINE_CONTEXT_LOADER_KINDS).not.toContain("target-knowledge-card-v2" as never);

    const catalog = createMeleeLoaderCatalog();
    expect(catalog.has("worker-packet")).toBeTrue();
    expect(catalog.has("target-knowledge")).toBeFalse();
    expect(catalog.has("target-knowledge-card-v2")).toBeFalse();
  });
});
