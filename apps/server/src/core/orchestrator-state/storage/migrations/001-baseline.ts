import type { StorageMigration } from "./types.js";

export const baselineMigration: StorageMigration = {
  version: 1,
  name: "baseline",
  up() {
    // ensureLegacySchema has already established the pre-migration schema.
  },
};
