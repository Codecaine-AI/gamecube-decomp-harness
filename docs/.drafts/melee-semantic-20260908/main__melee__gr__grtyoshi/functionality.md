# Yoshi Target Test controller

This unit registers Yoshi's character-specific Target Test course, not the versus stage Yoshi's Story. `grTYs_StageData` selects `Gr_Kind_TYoshi`, `/GrTYs.dat`, three populated Ground callback records followed by a zero record, and the stage lifecycle and policy hooks. The header exports the descriptor. These are source-level observations, not claims about compiled section placement or record sizes.

## Initialization and lifetime

`grTYoshi_OnInit` passes its factory to `Ground_InitTargetStage`, which synchronously requests Ground IDs 0, 1 and 2, updates two stage flags and runs shared setup. It does not retain the factory pointer as a registration. The factory indexes the callback table without a local bounds check, calls the shared Ground creator, installs callbacks only on success, and reports and returns NULL on failure. Shared setup installs rendering, stores an optional callback3, invokes an optional initializer immediately and schedules an optional process callback. The shared initializer does not inspect the three factory results.

Object 0 initializes archive-selected animation set 0. Objects 1 and 2 first bind map-associated collision joints and then perform the same animation initialization. Animation setup permits missing resource arrays, may select the first child JObj, removes old animations, requests frame zero, conditionally applies an archive flag and evaluates the pose. Initialization is once per setup invocation, not an enforced global lifetime limit.

## Processing and policy

All three object predicates return false. Object 0's process and all callback3 handlers are empty. Object 1 delegates to the shared map-collision refresh. Object 2 first maintains the shared effect list, then performs that collision refresh. The refresh is gated by `Ground_804D6950[map_id] == 0`; it updates matching descriptor joints and optional archive joints, using an invocation stamp to avoid duplicate archive processing. Both wrappers discard its result.

Effect maintenance accumulates pre-decay scale for entries with numeric type 1, decays scale, advances counters and moves expired entries to a free list. Its aggregate status is assigned numeric values 1, 2, -1 or 0 according to the threshold and previous status; these values are not assigned speculative gameplay names.

Demo-init and load are empty. The descriptor's parameterless predicate returns false, touch-line lookup returns NULL, and the shadow eligibility hook returns true without inspecting its inputs. Shadow approval is this hook's result, not a guarantee of final rendering. Canonical typedefs establish that `bool` and `enum_t` are integers here.

## Generator startup

`grTYoshi_OnStart` attempts shared generated-item manager creation with a NULL spawn descriptor and ignores the result. The callee allocates state, schedules a manager process and publishes state globally on success. State allocation is asserted; manager-GObj failure reports, frees the newly allocated data and returns NULL. This is not immediate target creation. Ordinary descriptor-driven spawning is suppressed by the NULL descriptor, while the separate special-entry path can be populated later. No stage-local teardown or one-time startup guard is established by this unit.

## Semantic review

Existing object-slot names remain useful and supported; cosmetic naming harmonization is unnecessary. Canonical helper bodies independently support animation and collision descriptions rather than relying on rendered substitutions. The renderer reports no parse errors, but leaves the factory and touch-line names unchanged because of shadowed bindings. Visible identities of Ground objects 1 and 2 remain unknown.

The repaired ledger explicitly covers 116 facts and 24 links without importing the prior duplicated link group or duplicated unresolved row. Five factual improvements are proposed; supported existing knowledge is retained.

Status: synthesized; independent review and live promotion pending.
