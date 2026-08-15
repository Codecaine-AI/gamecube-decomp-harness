import { describe, expect, test } from "bun:test";
import { parse } from "./runtime-options.js";

describe("game CLI options", () => {
  test("preserves canonical cycle flags", () => {
    const parsed = parse([
      "save-point",
      "--cycle-uuid",
      "canonical-cycle",
      "--no-cycle-draft-pr",
    ]);

    expect(parsed.args.get("--cycle-uuid")).toBe("canonical-cycle");
    expect(parsed.args.get("--no-cycle-draft-pr")).toBe(true);
  });

  test("selects games with --game", () => {
    const parsed = parse(["status", "--game", "melee"]);
    expect(parsed.globals.gameId).toBe("melee");
    expect(parsed.globals.game?.gameId).toBe("melee");
  });

  test("keeps kernel-facing project flags unchanged", () => {
    const parsed = parse([
      "status",
      "--kernel-project-id",
      "kernel-game",
      "--orchestrator-project-id",
      "orchestrator-game",
    ]);
    expect(parsed.args.get("--kernel-project-id")).toBe("kernel-game");
    expect(parsed.args.get("--orchestrator-project-id")).toBe("orchestrator-game");
  });
});
