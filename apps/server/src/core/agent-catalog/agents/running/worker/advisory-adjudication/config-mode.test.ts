import { describe, expect, test } from "bun:test";
import {
  AdvisoryConfigError,
  parseAdvisoryAdjudicationConfig,
  parseAdvisoryThresholds,
  readAdvisoryAdjudicationConfig,
  shippedAdvisoryAdjudicationConfig,
  thresholdsFor,
  type AdvisoryAdjudicationConfig,
} from "./config.js";
import { effectiveMode } from "./mode.js";

const MODEL = "typesafe/jev-1.13.0";

/** A valid raw config, built fresh so each test can break one field. */
function rawConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model: MODEL,
    escalateLowConfidence: false,
    judgeCanAccept: false,
    inline: { maxMs: 75_000, reserveMs: 120_000, minMs: 20_000 },
    maxFalseAcceptUpper: 0.1,
    thresholds: { [MODEL]: { passAt: 0.85, failAt: 0.15, qualification: "exploratory" } },
    ...overrides,
  };
}

/** Bars that meet every §6.9 requirement: 0/29 held-out negatives gives a one-sided 95 % upper bound of 0.0981. */
const QUALIFIED = {
  passAt: 0.9,
  failAt: 0.1,
  qualification: "enforcement-qualified" as const,
  labelSetHash: "sha256:labels",
  splitHash: "sha256:split",
  heldout: { negatives: 29, positives: 10, falseAccepts: 0, upper95: 0.0981 },
};

function configWith(thresholds: Record<string, unknown>, overrides: Record<string, unknown> = {}): AdvisoryAdjudicationConfig {
  return parseAdvisoryAdjudicationConfig(rawConfig({ thresholds, ...overrides }));
}

function issuesOf(parse: () => unknown): string[] {
  try {
    parse();
  } catch (error) {
    expect(error).toBeInstanceOf(AdvisoryConfigError);
    return (error as AdvisoryConfigError).issues;
  }
  throw new Error("expected the config to be rejected");
}

describe("advisory adjudication config", () => {
  test("the shipped config pins the Jev release at exploratory bars, and the file on disk reads back identical", () => {
    const shipped = shippedAdvisoryAdjudicationConfig();
    expect(shipped).toEqual({
      model: MODEL,
      escalateLowConfidence: false,
      judgeCanAccept: false,
      inline: { maxMs: 75_000, reserveMs: 120_000, minMs: 20_000 },
      maxFalseAcceptUpper: 0.1,
      thresholds: { [MODEL]: { passAt: 0.85, failAt: 0.15, qualification: "exploratory" } },
    });
    expect(readAdvisoryAdjudicationConfig()).toEqual(shipped);
  });

  test("rejects inverted or out-of-range bars and unknown qualifications, naming the thresholds entry", () => {
    const entry = (patch: Record<string, unknown>) => ({ [MODEL]: { passAt: 0.85, failAt: 0.15, qualification: "exploratory", ...patch } });
    const path = `thresholds["${MODEL}"]`;

    const equal = issuesOf(() => parseAdvisoryAdjudicationConfig(rawConfig({ thresholds: entry({ passAt: 0.5, failAt: 0.5 }) })));
    expect(equal).toEqual([expect.stringMatching(/failAt must be below passAt/)]);
    expect(equal[0]).toContain(path);

    const inverted = issuesOf(() => parseAdvisoryAdjudicationConfig(rawConfig({ thresholds: entry({ passAt: 0.2, failAt: 0.8 }) })));
    expect(inverted).toEqual([expect.stringMatching(/failAt must be below passAt/)]);

    expect(issuesOf(() => parseAdvisoryAdjudicationConfig(rawConfig({ thresholds: entry({ passAt: 1.2 }) })))).toEqual([
      expect.stringContaining(`${path}.passAt`),
    ]);
    expect(issuesOf(() => parseAdvisoryAdjudicationConfig(rawConfig({ thresholds: entry({ qualification: "calibrated" }) })))).toEqual([
      expect.stringContaining(`${path}.qualification`),
    ]);
  });

  test("never accepts a false-accept cap above 0.1, but the owner may lower it", () => {
    for (const cap of [0.11, 0.5, 0, -0.05]) {
      expect(issuesOf(() => parseAdvisoryAdjudicationConfig(rawConfig({ maxFalseAcceptUpper: cap })))).toEqual([
        expect.stringContaining("maxFalseAcceptUpper"),
      ]);
    }
    expect(parseAdvisoryAdjudicationConfig(rawConfig({ maxFalseAcceptUpper: 0.05 })).maxFalseAcceptUpper).toBe(0.05);
  });

  test("rejects an inline floor above the inline ceiling and a model ref without a provider", () => {
    const inline = { maxMs: 75_000, reserveMs: 120_000, minMs: 80_000 };
    expect(issuesOf(() => parseAdvisoryAdjudicationConfig(rawConfig({ inline })))).toEqual([expect.stringContaining("inline.minMs")]);
    expect(issuesOf(() => parseAdvisoryAdjudicationConfig(rawConfig({ model: "jev-1.13.0" })))).toEqual([expect.stringContaining("model")]);
  });

  test("reports every issue at once, in the error message too", () => {
    let caught: unknown;
    try {
      parseAdvisoryAdjudicationConfig(
        rawConfig({
          model: "jev",
          judgeCanAccept: "yes",
          inline: { maxMs: 10, reserveMs: 0, minMs: 20 },
          maxFalseAcceptUpper: 0.2,
          thresholds: { [MODEL]: { passAt: 0.1, failAt: 0.9, qualification: "exploratory" } },
        }),
        "test.json",
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AdvisoryConfigError);
    const error = caught as AdvisoryConfigError;
    expect(error.name).toBe("AdvisoryConfigError");
    expect(error.issues).toHaveLength(5);
    for (const fragment of ["model", "judgeCanAccept", "inline.minMs", "maxFalseAcceptUpper", "failAt must be below passAt"]) {
      expect(error.issues.some((issue) => issue.includes(fragment))).toBe(true);
    }
    expect(error.message).toContain("test.json");
    for (const issue of error.issues) expect(error.message).toContain(issue);
  });

  test("validates held-out evidence: counts are non-negative integers and upper95 lies in [0, 1]", () => {
    const base = { passAt: 0.9, failAt: 0.1, qualification: "enforcement-qualified" };
    const issues = issuesOf(() =>
      parseAdvisoryThresholds({ ...base, heldout: { negatives: -1, positives: 2.5, falseAccepts: "0", upper95: 1.01 } }),
    );
    expect(issues).toHaveLength(4);
    for (const field of ["negatives", "positives", "falseAccepts", "upper95"]) {
      expect(issues.some((issue) => issue.includes(`heldout.${field}`))).toBe(true);
    }
    expect(issuesOf(() => parseAdvisoryThresholds({ ...base, heldout: { negatives: 29, positives: 10, falseAccepts: 0, upper95: -0.01 } }))).toEqual([
      expect.stringContaining("heldout.upper95"),
    ]);

    const parsed = parseAdvisoryThresholds({ ...QUALIFIED, note: "dropped", heldout: { ...QUALIFIED.heldout, extra: 1 } });
    expect(parsed).toStrictEqual(QUALIFIED);
  });

  test("thresholdsFor finds the decision model's entry, null for an unknown model or an inherited key", () => {
    const config = configWith({ [MODEL]: QUALIFIED });
    expect(thresholdsFor(config)?.qualification).toBe("enforcement-qualified");
    expect(thresholdsFor(config, "typesafe/jev-9.9.9")).toBeNull();
    for (const inherited of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(thresholdsFor(config, inherited)).toBeNull();
    }
  });
});

describe("effective adjudication mode", () => {
  test("off and shadow pass through unchanged, even without thresholds for the model", () => {
    const noThresholds = configWith({});
    expect(effectiveMode("off", noThresholds)).toStrictEqual({ mode: "off" });
    expect(effectiveMode("shadow", noThresholds)).toStrictEqual({ mode: "shadow" });
  });

  test("enforce downgrades to shadow with the shipped exploratory bars or with no bars for the model", () => {
    expect(effectiveMode("enforce", shippedAdvisoryAdjudicationConfig())).toStrictEqual({
      mode: "shadow",
      downgradedReason: "not-enforcement-qualified",
    });
    expect(effectiveMode("enforce", configWith({}))).toStrictEqual({ mode: "shadow", downgradedReason: "no-thresholds" });
  });

  test("enforce downgrades when an enforcement-qualified entry lacks the evidence to back it", () => {
    const { labelSetHash: _labels, ...noLabelSet } = QUALIFIED;
    const { splitHash: _split, ...noSplit } = QUALIFIED;
    const { heldout: _heldout, ...noHeldout } = QUALIFIED;
    const variants: Array<[string, AdvisoryAdjudicationConfig]> = [
      ["no label-set hash", configWith({ [MODEL]: noLabelSet })],
      ["no split hash", configWith({ [MODEL]: noSplit })],
      ["no held-out evidence", configWith({ [MODEL]: noHeldout })],
      ["28 negative groups", configWith({ [MODEL]: { ...QUALIFIED, heldout: { ...QUALIFIED.heldout, negatives: 28 } } })],
      ["9 positive groups", configWith({ [MODEL]: { ...QUALIFIED, heldout: { ...QUALIFIED.heldout, positives: 9 } } })],
      ["upper bound above a lowered cap", configWith({ [MODEL]: QUALIFIED }, { maxFalseAcceptUpper: 0.05 })],
    ];
    for (const [label, config] of variants) {
      expect({ label, mode: effectiveMode("enforce", config) }).toStrictEqual({
        label,
        mode: { mode: "shadow", downgradedReason: "qualification-evidence-insufficient" },
      });
    }
  });

  test("a cap above 0.1 on a hand-built config never admits a larger upper bound", () => {
    const config: AdvisoryAdjudicationConfig = {
      ...configWith({}),
      maxFalseAcceptUpper: 0.5,
      thresholds: { [MODEL]: { ...QUALIFIED, heldout: { ...QUALIFIED.heldout, upper95: 0.2 } } },
    };
    expect(effectiveMode("enforce", config)).toStrictEqual({ mode: "shadow", downgradedReason: "qualification-evidence-insufficient" });
  });

  test("fully qualified bars keep enforce, and the model argument picks which entry is checked", () => {
    expect(effectiveMode("enforce", configWith({ [MODEL]: QUALIFIED }))).toStrictEqual({ mode: "enforce" });

    const next = "typesafe/jev-1.14.0";
    const config = configWith({ [MODEL]: { passAt: 0.85, failAt: 0.15, qualification: "exploratory" }, [next]: QUALIFIED });
    expect(effectiveMode("enforce", config)).toStrictEqual({ mode: "shadow", downgradedReason: "not-enforcement-qualified" });
    expect(effectiveMode("enforce", config, next)).toStrictEqual({ mode: "enforce" });
    expect(effectiveMode("enforce", config, "typesafe/jev-9.9.9")).toStrictEqual({ mode: "shadow", downgradedReason: "no-thresholds" });
  });
});
