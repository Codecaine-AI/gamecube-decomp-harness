# Stop-While-Thinking Sandbox Idling

Status: future-objective seed

## Motivation

Daytona sandbox v1 deliberately keeps each sandbox running for the claim's full lifetime under operator decision 7. This gave the first live implementation simple command, failure, lease, and TTL semantics, but the fleet cost model in design bundle 60 assumes that compute stops while the model is thinking. The gap matters because worker sessions spend long intervals in model turns while an always-running sandbox continues to bill compute and hold active capacity.

The phase 1 platform experiment measured the missing decision input on a real Daytona runner. Across three trials, the elapsed time from a start request to the first successful exec was 0.86, 0.78, and 0.85 seconds, an observed range of 0.78–0.86 seconds. That wake cost is low enough to investigate stopping during model turns without making every later tool call feel like sandbox reprovisioning.

## Future Objective

Implement claim-local sandbox idling at the host worker's existing model/tool boundary: stop the sandbox when a model turn starts, start it before dispatching the next tool call, and preserve the same workspace, ClaimToken fence, trace identity, and teardown behavior across the transition. The objective must define how an arriving tool call waits for readiness, how concurrent or in-flight commands prevent an unsafe stop, and how start or stop failures reach the worker lifecycle.

The objective also owns the interaction between stopped state, the claim deadline, the sandbox wall-clock TTL, and settlement, reap, and startup reconciliation. Its acceptance evidence must verify Daytona billing semantics for stopped versus running sandboxes so the measured fleet savings can replace the assumption in bundle 60 with observed cost behavior.
