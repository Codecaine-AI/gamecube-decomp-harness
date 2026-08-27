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
  test("defaults worker reasoning to low", () => {
    expect(initialForm().thinkingLevel).toBe("low");
  });

  test("drops a saved xhigh thinking level from an old settings version", () => {
    localStorage.setItem("runSettings.v1", JSON.stringify({
      thinkingLevel: "xhigh",
      thinkingLevelVersion: 2,
    }));

    expect(initialForm().thinkingLevel).toBe("low");
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
          integration_resolver_concurrency: 7,
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
      integrationResolverConcurrency: 7,
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
