import { openState } from "@server/core/cycle-runtime/run-state";
import { getJob } from "@server/core/job-queue/kernel";
import { getHarnessState } from "@server/core/harness-state";
import { DaytonaSandboxProvider } from "@server/core/job-queue/sandbox";
import { readFileSync } from "node:fs";
const env = readFileSync("local.env", "utf8");
process.env.DAYTONA_API_KEY = /DAYTONA_API_KEY\s*=\s*"?([^"\n]+)/.exec(env)?.[1] ?? "";
const store = openState("/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state");
const provider = new DaytonaSandboxProvider();
try {
  const sandboxes = await provider.listByLabels({ game_id: "melee" });
  console.log("listByLabels count:", sandboxes.length);
  for (const sb of sandboxes.slice(0, 2)) {
    console.log("== sandbox", sb.sandboxId);
    console.log("labels:", JSON.stringify(sb.labels));
    const jobId = sb.labels.job_id;
    const job = jobId ? getJob(store, jobId) : null;
    console.log("job:", job?.jobId, "status:", job?.status, "gameId:", job?.gameId, "runId:", job?.runId);
    console.log("payload.sandbox_id match:", job?.payload?.sandbox_id === sb.sandboxId, "(payload:", job?.payload?.sandbox_id, ")");
    const hs = getHarnessState(store, "melee");
    console.log("active_workflow:", JSON.stringify(hs?.active_workflow ?? null));
    const claim = store.db.query("SELECT status FROM target_claims WHERE id = ?").get(sb.labels.claim_id ?? "") as any;
    console.log("claim status:", claim?.status, "label claim:", sb.labels.claim_id);
  }
} finally { store.db.close(); }
