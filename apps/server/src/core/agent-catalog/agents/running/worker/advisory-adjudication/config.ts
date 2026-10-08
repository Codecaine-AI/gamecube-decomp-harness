// Adjudication settings (plan §6.5, §6.9). `config.json` ships uncalibrated
// thresholds for the pinned Jev release (exploratory, so enforce downgrades
// to shadow); the M12 calibration tool rewrites `thresholds[<model>]` with
// measured bars and a qualification level. Thresholds are keyed by the model
// that served the calibration decisions: a decision served by any other model
// is never accepted at these bars (index.ts).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import shippedConfigJson from "./config.json" with { type: "json" };

export const ADVISORY_ADJUDICATION_CONFIG_PATH = fileURLToPath(new URL("./config.json", import.meta.url));

export const ADVISORY_QUALIFICATIONS = ["exploratory", "enforcement-qualified"] as const;
export type AdvisoryQualification = (typeof ADVISORY_QUALIFICATIONS)[number];

/** Enforcement bars (§6.9, §11 item 21): the owner may lower the false-accept cap in config.json, never raise it. */
export const ENFORCEMENT_MIN_HELDOUT_NEGATIVE_GROUPS = 29;
export const ENFORCEMENT_MIN_HELDOUT_POSITIVE_GROUPS = 10;
export const ENFORCEMENT_MAX_FALSE_ACCEPT_UPPER = 0.1;

export interface AdvisoryHeldoutEvidence {
  /** Independent held-out negative groups (human labels, non-synthetic). */
  negatives: number;
  /** Independent held-out positive groups. */
  positives: number;
  /** Negative groups with any accepted item at the chosen thresholds. */
  falseAccepts: number;
  /** One-sided 95 % Clopper–Pearson upper bound on the false-accept rate. */
  upper95: number;
}

export interface AdvisoryThresholds {
  passAt: number;
  failAt: number;
  qualification: AdvisoryQualification;
  labelSetHash?: string;
  splitHash?: string;
  heldout?: AdvisoryHeldoutEvidence;
  calibratedAt?: string;
}

export interface AdvisoryInlineBudgetConfig {
  /** Most time an inline (enforce) adjudication may take. */
  maxMs: number;
  /** Kept free before the claim deadline for checkpoint persistence and continuation. */
  reserveMs: number;
  /** Below this budget no node call is made (fail closed, insufficient-time). */
  minMs: number;
}

export interface AdvisoryAdjudicationConfig {
  /** Decision model ref, also the key into `thresholds`. */
  model: string;
  /** Enforce only: escalate low-confidence abstains to JudgeAdvisoryWithRationale. */
  escalateLowConfidence: boolean;
  /** Whether an escalation verdict of ACCEPTED may accept (otherwise the judge can only reject). */
  judgeCanAccept: boolean;
  inline: AdvisoryInlineBudgetConfig;
  maxFalseAcceptUpper: number;
  thresholds: Record<string, AdvisoryThresholds>;
}

export class AdvisoryConfigError extends Error {
  readonly issues: string[];

  constructor(issues: string[], source: string) {
    super(`invalid advisory adjudication config (${source}): ${issues.join("; ")}`);
    this.name = "AdvisoryConfigError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function countIssue(path: string, value: unknown, issues: string[]): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0) issues.push(`${path} must be a non-negative integer`);
}

function thresholdIssues(path: string, raw: unknown): string[] {
  if (!isRecord(raw)) return [`${path} must be an object`];
  const issues: string[] = [];
  const { passAt, failAt, qualification } = raw;
  if (!finite(passAt) || passAt < 0 || passAt > 1) issues.push(`${path}.passAt must be a number in [0, 1]`);
  if (!finite(failAt) || failAt < 0 || failAt > 1) issues.push(`${path}.failAt must be a number in [0, 1]`);
  if (finite(passAt) && finite(failAt) && !(failAt < passAt)) issues.push(`${path}: failAt must be below passAt`);
  if (!ADVISORY_QUALIFICATIONS.includes(qualification as AdvisoryQualification)) {
    issues.push(`${path}.qualification must be one of ${ADVISORY_QUALIFICATIONS.join(", ")}`);
  }
  for (const key of ["labelSetHash", "splitHash", "calibratedAt"] as const) {
    if (raw[key] !== undefined && !nonEmptyString(raw[key])) issues.push(`${path}.${key} must be a non-empty string`);
  }
  if (raw.heldout !== undefined) {
    const heldout = raw.heldout;
    if (!isRecord(heldout)) {
      issues.push(`${path}.heldout must be an object`);
    } else {
      countIssue(`${path}.heldout.negatives`, heldout.negatives, issues);
      countIssue(`${path}.heldout.positives`, heldout.positives, issues);
      countIssue(`${path}.heldout.falseAccepts`, heldout.falseAccepts, issues);
      if (!finite(heldout.upper95) || heldout.upper95 < 0 || heldout.upper95 > 1) {
        issues.push(`${path}.heldout.upper95 must be a number in [0, 1]`);
      }
    }
  }
  return issues;
}

/** Validates one thresholds entry (e.g. an alternative set for the shadow report); throws AdvisoryConfigError. */
export function parseAdvisoryThresholds(raw: unknown, source = "thresholds"): AdvisoryThresholds {
  const issues = thresholdIssues(source, raw);
  if (issues.length > 0) throw new AdvisoryConfigError(issues, source);
  const entry = raw as Record<string, unknown>;
  const heldout = entry.heldout as AdvisoryHeldoutEvidence | undefined;
  return {
    passAt: entry.passAt as number,
    failAt: entry.failAt as number,
    qualification: entry.qualification as AdvisoryQualification,
    ...(entry.labelSetHash !== undefined && { labelSetHash: entry.labelSetHash as string }),
    ...(entry.splitHash !== undefined && { splitHash: entry.splitHash as string }),
    ...(heldout !== undefined && {
      heldout: {
        negatives: heldout.negatives,
        positives: heldout.positives,
        falseAccepts: heldout.falseAccepts,
        upper95: heldout.upper95,
      },
    }),
    ...(entry.calibratedAt !== undefined && { calibratedAt: entry.calibratedAt as string }),
  };
}

/** Validates a whole config object; throws AdvisoryConfigError listing every issue. Unknown keys are dropped. */
export function parseAdvisoryAdjudicationConfig(raw: unknown, source = "config"): AdvisoryAdjudicationConfig {
  if (!isRecord(raw)) throw new AdvisoryConfigError(["the config must be an object"], source);
  const issues: string[] = [];
  if (!nonEmptyString(raw.model) || !raw.model.includes("/")) issues.push(`model must be a "provider/id" ref`);
  if (typeof raw.escalateLowConfidence !== "boolean") issues.push("escalateLowConfidence must be a boolean");
  if (typeof raw.judgeCanAccept !== "boolean") issues.push("judgeCanAccept must be a boolean");
  const inline = raw.inline;
  if (!isRecord(inline)) {
    issues.push("inline must be an object");
  } else {
    for (const key of ["maxMs", "reserveMs", "minMs"] as const) {
      if (!Number.isSafeInteger(inline[key]) || (inline[key] as number) < 0) issues.push(`inline.${key} must be a non-negative integer`);
    }
    if (Number.isSafeInteger(inline.maxMs) && Number.isSafeInteger(inline.minMs) && (inline.minMs as number) > (inline.maxMs as number)) {
      issues.push("inline.minMs must not exceed inline.maxMs");
    }
  }
  const cap = raw.maxFalseAcceptUpper;
  if (!finite(cap) || cap <= 0 || cap > ENFORCEMENT_MAX_FALSE_ACCEPT_UPPER) {
    issues.push(`maxFalseAcceptUpper must be a number in (0, ${ENFORCEMENT_MAX_FALSE_ACCEPT_UPPER}]`);
  }
  const thresholds = raw.thresholds;
  if (!isRecord(thresholds)) {
    issues.push("thresholds must be an object keyed by model ref");
  } else {
    for (const [model, entry] of Object.entries(thresholds)) issues.push(...thresholdIssues(`thresholds["${model}"]`, entry));
  }
  if (issues.length > 0) throw new AdvisoryConfigError(issues, source);

  const inlineConfig = inline as Record<string, number>;
  return {
    model: raw.model as string,
    escalateLowConfidence: raw.escalateLowConfidence as boolean,
    judgeCanAccept: raw.judgeCanAccept as boolean,
    inline: { maxMs: inlineConfig.maxMs!, reserveMs: inlineConfig.reserveMs!, minMs: inlineConfig.minMs! },
    maxFalseAcceptUpper: cap as number,
    thresholds: Object.fromEntries(
      Object.entries(thresholds as Record<string, unknown>).map(([model, entry]) => [
        model,
        parseAdvisoryThresholds(entry, `thresholds["${model}"]`),
      ]),
    ),
  };
}

/** Reads and validates a config file (fresh on every call); throws on a missing, unparsable or invalid file. */
export function readAdvisoryAdjudicationConfig(path: string = ADVISORY_ADJUDICATION_CONFIG_PATH): AdvisoryAdjudicationConfig {
  return parseAdvisoryAdjudicationConfig(JSON.parse(readFileSync(path, "utf8")), path);
}

let shippedConfig: AdvisoryAdjudicationConfig | null = null;

/**
 * The config bundled with this module (loaded with the module, so no file I/O
 * at call time), validated on first use. Throws AdvisoryConfigError when the
 * bundled file is invalid; callers that must not throw catch it.
 */
export function shippedAdvisoryAdjudicationConfig(): AdvisoryAdjudicationConfig {
  shippedConfig ??= parseAdvisoryAdjudicationConfig(shippedConfigJson, "config.json");
  return shippedConfig;
}

/** The thresholds calibrated for `model`, or null when the config has none for it. */
export function thresholdsFor(config: AdvisoryAdjudicationConfig, model: string = config.model): AdvisoryThresholds | null {
  return Object.hasOwn(config.thresholds, model) ? config.thresholds[model]! : null;
}
