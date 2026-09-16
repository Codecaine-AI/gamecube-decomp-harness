export function assertSchedulableRun(run: { id: string; status: string }, command: string): void {
  if (run.status === "active") return;
  throw new Error(
    `Run ${run.id} is ${run.status}; refusing to run ${command}. Start a fresh run or intentionally mark this run active before scheduling work.`,
  );
}
