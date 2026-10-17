import { afterAll, beforeAll } from "bun:test";
import { UNIT_REPORT_PLACEMENT_ENV } from "./unit-report-summary.js";

/**
 * For test files whose fake workspaces serve whole objdiff reports and
 * symbols.txt over `exec`: opt the file into the explicit host report
 * placement (production defaults to the sandbox), restoring it afterwards.
 */
export function useHostReportPlacement(): void {
  const saved = process.env[UNIT_REPORT_PLACEMENT_ENV];
  beforeAll(() => {
    process.env[UNIT_REPORT_PLACEMENT_ENV] = "host";
  });
  afterAll(() => {
    if (saved === undefined) delete process.env[UNIT_REPORT_PLACEMENT_ENV];
    else process.env[UNIT_REPORT_PLACEMENT_ENV] = saved;
  });
}
