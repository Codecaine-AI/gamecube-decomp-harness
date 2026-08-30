import type { JsonObject } from "@server/core/harness-state/events.js";

/** Restores a worker job payload to the fields written at initial enqueue. */
export function enqueuePayloadForWorkerJob(payload: JsonObject): JsonObject {
  return {
    epoch_target_id: payload.epoch_target_id,
    epoch_id: payload.epoch_id,
    target_key: payload.target_key,
  };
}
