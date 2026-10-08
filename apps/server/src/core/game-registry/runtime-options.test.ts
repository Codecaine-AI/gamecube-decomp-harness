import { describe, expect, test } from "bun:test";
import {
  advisoryAdjudicationArg,
  checkpointKnowledgeCapArg,
  checkpointKnowledgeFeedArg,
  librarianConsumerFlag,
  modelNodeFlags,
  parse,
  workerSummaryFlag,
} from "./runtime-options.js";

describe("game CLI options", () => {
  test("preserves canonical cycle flags", () => {
    const parsed = parse([
      "save-point",
      "--cycle-uuid",
      "canonical-cycle",
      "--no-harness-draft-pr",
    ]);

    expect(parsed.args.get("--cycle-uuid")).toBe("canonical-cycle");
    expect(parsed.args.get("--no-harness-draft-pr")).toBe(true);
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

  test("defaults worker summaries off", () => {
    expect(workerSummaryFlag(parse(["status"]).args)).toBe(false);
  });

  test("enables worker summaries with --worker-summary", () => {
    expect(workerSummaryFlag(parse(["status", "--worker-summary"]).args)).toBe(true);
  });

  test("enables the librarian consumer with --librarian-consumer", () => {
    expect(librarianConsumerFlag(parse(["status"]).args)).toBe(false);
    expect(librarianConsumerFlag(parse(["status", "--librarian-consumer"]).args)).toBe(true);
  });
});

describe("model-node flags", () => {
  test("flags: advisory adjudication default shadow, env override, invalid throws; knowledge feed default on, cap default 50", () => {
    const args = (...flags: string[]) => parse(["run-loop", ...flags]).args;

    expect(modelNodeFlags(args(), {})).toEqual({
      advisoryAdjudication: "shadow",
      checkpointKnowledgeFeed: "on",
      checkpointKnowledgeCap: 50,
    });

    expect(advisoryAdjudicationArg(args("--advisory-adjudication=enforce"), {})).toBe("enforce");
    expect(advisoryAdjudicationArg(args("--advisory-adjudication", "Off"), {})).toBe("off");
    expect(advisoryAdjudicationArg(args("--advisory-adjudication=enforce"), { ORCH_ADVISORY_ADJUDICATION: "off" })).toBe("off");
    expect(advisoryAdjudicationArg(args(), { ORCH_ADVISORY_ADJUDICATION: "enforce" })).toBe("enforce");
    expect(() => advisoryAdjudicationArg(args("--advisory-adjudication=strict"), {}))
      .toThrow("--advisory-adjudication must be one of: off, shadow, enforce");
    expect(() => advisoryAdjudicationArg(args("--advisory-adjudication"), {}))
      .toThrow("Missing value for --advisory-adjudication");
    expect(() => advisoryAdjudicationArg(args("--advisory-adjudication=strict"), { ORCH_ADVISORY_ADJUDICATION: "off" }))
      .toThrow("--advisory-adjudication must be one of");
    expect(() => advisoryAdjudicationArg(args(), { ORCH_ADVISORY_ADJUDICATION: "" }))
      .toThrow("ORCH_ADVISORY_ADJUDICATION must be one of: off, shadow, enforce");
    expect(() => parse(["run-loop", "--advisory-adjudication="])).toThrow("Missing value for --advisory-adjudication");
    let envError = "";
    try {
      advisoryAdjudicationArg(args(), { ORCH_ADVISORY_ADJUDICATION: "VALUE_MARKER" });
    } catch (error) {
      envError = error instanceof Error ? error.message : String(error);
    }
    expect(envError).toBe("ORCH_ADVISORY_ADJUDICATION must be one of: off, shadow, enforce");

    expect(checkpointKnowledgeFeedArg(args("--checkpoint-knowledge-feed=off"), {})).toBe("off");
    expect(checkpointKnowledgeFeedArg(args("--checkpoint-knowledge-feed=off"), { ORCH_CHECKPOINT_KNOWLEDGE_FEED: "on" })).toBe("on");
    expect(checkpointKnowledgeFeedArg(args(), { ORCH_CHECKPOINT_KNOWLEDGE_FEED: "off" })).toBe("off");
    expect(() => checkpointKnowledgeFeedArg(args("--checkpoint-knowledge-feed=yes"), {}))
      .toThrow("--checkpoint-knowledge-feed must be one of: on, off");
    expect(() => checkpointKnowledgeFeedArg(args(), { ORCH_CHECKPOINT_KNOWLEDGE_FEED: "1" }))
      .toThrow("ORCH_CHECKPOINT_KNOWLEDGE_FEED must be one of: on, off");

    expect(checkpointKnowledgeCapArg(args("--checkpoint-knowledge-cap=10"))).toBe(10);
    expect(checkpointKnowledgeCapArg(args("--checkpoint-knowledge-cap", "7"))).toBe(7);
    for (const invalid of ["0", "-1", "1.5", "many"]) {
      expect(() => checkpointKnowledgeCapArg(args(`--checkpoint-knowledge-cap=${invalid}`)))
        .toThrow("--checkpoint-knowledge-cap must be a positive integer");
    }
    expect(() => checkpointKnowledgeCapArg(args("--checkpoint-knowledge-cap")))
      .toThrow("--checkpoint-knowledge-cap must be a positive integer");
  });
});
