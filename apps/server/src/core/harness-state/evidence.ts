import type { JsonObject } from "./events.js";

export type DeferredSavePointEvidence =
  | {
      status: "recorded";
      savePointId: string;
      commitSha: string;
      triggerKind: string;
      headlineScore?: number | null;
      artifactPaths?: string[];
      payload?: JsonObject;
    }
  | {
      status: "failed";
      triggerKind: string;
      sourceKind: string;
      sourceId: string;
      message: string;
    };
