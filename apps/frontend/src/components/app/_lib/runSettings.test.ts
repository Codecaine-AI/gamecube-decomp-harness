import { beforeEach, describe, expect, test } from "bun:test";
import type { DashboardRun } from "@/lib/format";
import { initialForm, runConfigurationFormPatch } from "./runSettings";

const savedSettings = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => savedSettings.get(key) ?? null,
    setItem: (key: string, value: string) => savedSettings.set(key, value),
  },
});

beforeEach(() => savedSettings.clear());

describe("run settings", () => {
  test("defaults workers to Astra with medium reasoning and 12 slots", () => {
    expect(initialForm()).toMatchObject({
      maxWorkers: 12,
      model: "gpt-6-astra",
      thinkingLevel: "medium",
    });
  });

  test("drops worker settings from the previous defaults version", () => {
    localStorage.setItem("runSettings.v1", JSON.stringify({
      maxWorkers: 16,
      model: "gpt-5.6-sol",
      thinkingLevel: "xhigh",
      thinkingLevelVersion: 3,
      settingsVersion: 6,
    }));

    expect(initialForm()).toMatchObject({
      maxWorkers: 12,
      model: "gpt-6-astra",
      thinkingLevel: "medium",
    });
  });
});

describe("run configuration form hydration", () => {
  test.each(["ready", "active", "paused"])("maps an immutable %s run snapshot to form fields", (status) => {
    const run: DashboardRun = {
      id: "run-api-staged",
      status,
      inputs: {
        configuration_snapshot: {
          desired_workers: 32,
          sandbox_profile: "4-core",
          model: "gpt-5.6-terra",
          provider: "codex-lb",
          thinking_level: "xhigh",
          agent_timeout_seconds: 1800,
        },
      },
    };

    expect(runConfigurationFormPatch(run)).toEqual({
      maxWorkers: 32,
      sandboxProfile: "4-core",
      model: "gpt-5.6-terra",
      provider: "codex-lb",
      thinkingLevel: "xhigh",
      agentTimeoutSeconds: 1800,
    });
  });

  test("returns no patch when there is no current run, preserving saved-settings fallback", () => {
    expect(runConfigurationFormPatch(null)).toBeNull();
  });

  test("returns no patch for a terminal run", () => {
    expect(runConfigurationFormPatch({
      id: "run-complete",
      status: "completed",
      inputs: { configuration_snapshot: { desired_workers: 32 } },
    })).toBeNull();
  });
});
