// Type-level contract between the real BAML module, the generated client, and
// the kernel's structural BAML types (plan §4.2, M1-E). Never executed: it is
// compiled alone by `bunx tsc --noEmit -p apps/server/tsconfig.baml-contract.json`.
import * as baml from "@boundaryml/baml";
import { b } from "@server/generated/baml_client";
import { getBamlFiles } from "@server/generated/baml_client/inlinedbaml";
import type { ProbeResult } from "@server/generated/baml_client/types";
import { bamlEngine, type BamlRuntimeLike } from "@agent-kernel/kernel/baml-engine";
import type { CallArgs, CallResult, FnName } from "@agent-kernel/kernel/model-nodes";
type Eq<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const runtime: BamlRuntimeLike = baml;                                // module satisfies the structural type
const engine = bamlEngine({ client: b, baml, sources: getBamlFiles(), manifests: {} });
type Names = FnName<typeof b>;                                        // must include "ContractProbe"
const ok: Names = "ContractProbe";
const namesExact: Eq<Names, "ContractProbe"> = true;
type A = CallArgs<typeof b, "ContractProbe">;                         // must be [text: string]
const args: A = ["x"];
const argsExact: Eq<A, [text: string]> = true;
type R = CallResult<typeof b, "ContractProbe">;                       // must be ProbeResult
const resultExact: Eq<R, ProbeResult> = true;
const log: baml.FunctionLog | null = new baml.Collector("x").last;    // FunctionLog → BamlFunctionLogLike below
const like: import("@agent-kernel/kernel/baml-engine").BamlFunctionLogLike | null = log;
void runtime; void engine; void ok; void args; void like; void namesExact; void argsExact; void resultExact;
