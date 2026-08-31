import { describe, expect, test } from "bun:test";
import { infrastructureFailureReason } from "./infrastructure-failure.js";

describe("infrastructure failure classification", () => {
  test.each([
    "LLM provider failed before the runner could continue the worker: OpenAI API error (400): Invalid `previous_response_id`",
    "LLM provider failed before the runner could continue the worker: server_is_overloaded",
    "Non-dry Melee agent spawns must use kernel createSpawnAgent; missing initialized kernel runtime DB",
    "Sandbox provisioning failed: Daytona unavailable",
  ])("classifies %s", (message) => {
    expect(infrastructureFailureReason(message)).toBe(message);
  });

  test("does not classify source or validation failures", () => {
    expect(infrastructureFailureReason("Worker note describes a source validation failure")).toBeNull();
  });
});
