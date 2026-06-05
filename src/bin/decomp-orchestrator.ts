#!/usr/bin/env bun
import { main } from "../cli/main.js";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
