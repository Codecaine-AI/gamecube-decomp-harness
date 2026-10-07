import { describe, expect, test } from "bun:test";

import { betaQuantile, clopperPearsonUpper, regularizedIncompleteBeta } from "./statistics";

/** I_x(a, b) for integer a, b: P(Binomial(a + b − 1, x) ≥ a), an independent reference. */
function binomialTail(x: number, a: number, b: number): number {
  const n = a + b - 1;
  let sum = 0;
  let coefficient = 1;
  for (let j = 0; j <= n; j += 1) {
    if (j > 0) coefficient = (coefficient * (n - j + 1)) / j;
    if (j >= a) sum += coefficient * x ** j * (1 - x) ** (n - j);
  }
  return sum;
}

describe("Clopper–Pearson", () => {
  test("Clopper–Pearson matches reference values", () => {
    // x = 0: the closed form 1 − 0.05^(1/n).
    for (const n of [1, 10, 28, 29, 59, 200]) expect(clopperPearsonUpper(0, n)).toBeCloseTo(1 - 0.05 ** (1 / n), 12);
    expect(clopperPearsonUpper(0, 29)).toBeCloseTo(0.098145, 6);
    expect(clopperPearsonUpper(0, 28)).toBeCloseTo(0.101466, 6);
    expect(clopperPearsonUpper(0, 59)).toBeCloseTo(0.049508, 6);
    // x = 1, n = 46: the Beta(0.95; 2, 45) quantile, from 1 − (1 − p)^45 (1 + 45 p) = 0.95.
    expect(clopperPearsonUpper(1, 46)).toBeCloseTo(0.099024, 6);
    expect(clopperPearsonUpper(1, 29)).toBeCloseTo(0.153392, 6);
    expect(clopperPearsonUpper(3, 40)).toBeCloseTo(0.182587, 6);
    // Edges: no evidence, and every unit a false accept.
    expect(clopperPearsonUpper(0, 0)).toBe(1);
    expect(clopperPearsonUpper(5, 5)).toBe(1);
    expect(() => clopperPearsonUpper(3, 2)).toThrow();
  });

  test("the incomplete beta and its quantile agree with the binomial identity", () => {
    for (const [a, b] of [[2, 45], [4, 37], [1, 29], [7, 3]] as const) {
      for (const x of [0.01, 0.1, 0.35, 0.8]) expect(regularizedIncompleteBeta(x, a, b)).toBeCloseTo(binomialTail(x, a, b), 10);
      const q = betaQuantile(0.95, a, b);
      expect(binomialTail(q, a, b)).toBeCloseTo(0.95, 9);
    }
  });
});
