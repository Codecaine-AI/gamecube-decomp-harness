#!/usr/bin/env bun
import { main } from "@server/application/jobs/job-runner";
export { main } from "@server/application/jobs/job-runner";

if (import.meta.main) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
