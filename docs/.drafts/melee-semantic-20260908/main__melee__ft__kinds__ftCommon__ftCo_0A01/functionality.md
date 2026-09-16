# ftCo_0A01 semantic review

## Scope and evidence

Full translation-unit coverage is inherited from the hash-bound librarian research. This lead independently read the complete proposal and functionality artifacts, the canonical citations for all eleven proposed facts, and targeted canonical/rendered definitions and callers for the substantive contradictions. Supported existing knowledge is retained through the inherited dispositions; unchanged ledgers are not reproduced. Rendered identifiers remain hypotheses, not independent evidence. No compiled section, structure-offset, register-binding, or original-symbol claim is made.

## CPU state and update pipeline

The unit initializes and maintains fighter-owned `cpu` state, selects fighter and item targets, constructs virtual-controller command sequences, maintains navigation destinations, coordinates associated-fighter input history, and provides CPU input accessors and debug visualization. Current source uses `struct CpuFighter` and `Fighter.cpu`; historical `x1A88` terminology does not establish binary-layout equivalence.

`ftCo_800B3900` orders environmental maintenance, policy dispatch, idle script construction, command interpretation, and associated-fighter synchronization before incrementing `cpu.x7C`. `ftCo_800B2790` builds a script only when `csP` is null and `command_duration` is zero. The external writers serialize commands into the same fighter's buffer; activation points `csP` at that buffer. `CpuCmd_Done` ends execution but does not neutralize controller values. Consequently, completed jump scripts can leave directional stick input intact.

Initialization supplies mode, level, and another configuration value, initializes destinations and controller/script state, and seeds history. The Nana branch selects mode 6 and different configuration values. `ftCo_800B9704` runs before the final kind-dependent `x56C` assignment; Donkey and Koopa share the 8.5 default. Neither shorter timing nor a complete following interpretation follows from those assignments alone.

## Selection and classification

Fighter selectors differ materially. The uncached `ftCo_800A4A40` minimizes planar distance among spatially/state-eligible other fighters without excluding allies. Its Samus grapple consumer uses the selected fighter's position to construct normalized, scaled link velocity. This establishes that data flow, not the community mechanic label. The sticky `ftCo_800A4BEC` can return its retained eligible target without comparing distances; a stale flagged target clears the flag and returns null without acquiring a replacement in that invocation. Other selectors use a supplied 3D position, require the ally predicate, match a requested player ID, or minimize a game-mode integer before planar distance.

`ftCo_800A53DC` returns a borrowed fighter pointer and has no direct Fighter writes, but its ranking accessor can refresh persistent game-mode cache state. Its explicit null branch follows formation of `&fp->cpu`; portable null tolerance is not established. The minimized integer's score-standing interpretation remains deferred.

The additional integer passed by dispatcher cases 19–22 is a requested player ID, with values 0–3. `ftCo_800AFE3C` forwards it through `ftCo_CpuActOnPlayer` to `ftCo_800A5294`, which compares candidate `player_id`. It is not an additional action-mode argument.

Item selection combines eligibility, kind restrictions, a 35-integer authored priority table, a threshold, and distance. A replacement must have nonlower priority and strictly shorter distance; this is not unconditional highest-priority selection. `It_Kind_L_Gun_Ray` is the common-item wildcard in `ftCo_800A5F4C`. The food-named fallback helper tests the held item's kind before invoking that wildcard scan; its name does not establish healing-only candidate selection. The restricted special-item selector visibly returns an Item pointer cast to int, without establishing ABI compatibility.

Small predicates classify explicit motion or item-kind sets. `ftCo_800A5980` is Fighter-typed and reads `motion_id`, despite Item callers casting their pointer; compatible compiled offsets are not established. Motion names and numeric action selections are not sufficient to prove every capture, throw, healing, heavy-item, or hazard interpretation.

## Navigation and exceptional branches

Destination setters are lock-aware. Temporary waypoints save destination XY, set `x60`, and can restore saved XY on arrival or timer expiry. A successful query need not imply a destination mutation while the lock is active.

The terrain/trajectory classifier has an initial flag gate, a grounded special-floor path, ordered airborne rejection conditions, stage-specific low-Y acceptance, and projected floor/wall checks. Equality with its angle threshold proceeds. Special-line rejection applies to floor hits, not wall hits; accepted in-bounds intersections use inclusive boundary limits. Its caller selects numeric CPU state 4. The function does not establish inevitable death.

Navigation queries include above-platform and below-floor midpoint searches, endpoint searches, and a directional search. The directional search has sequential probe suppression, midpoint-only negative-sentinel initialization, and a midpoint-specific RCruise filter. It is not an exhaustive nearest-contact guarantee. The fighter-target floor fallback occurs when the filtered floor query fails, not when a successful query's island is subsequently rejected.

`ftCo_800A6700` maximizes squared XY distance from the supplied reference among accepted inset endpoints. Nearby-fighter callers request and submit a fighter-relative destination under ground and distance guards; they do not establish approach toward that fighter. This qualifies the former shard031 approach wording. Selection geometry alone also does not guarantee successful movement away or universal terrain safety.

The Shrine waypoint search is asymmetric: positive facing permits endpoint Y at or above current Y; the other branch permits endpoint Y at or below current Y. Successful writes preserve and replace XY only. The cross-edge builder includes an additional jump-helper branch when the near-edge predicate is false.

Random-island selection uses different filters in its accumulation and selection passes, can return without installing a destination, and does not prove reachability or designer intent. Environmental classifications prioritized by targeting handlers are computed from stage and fighter observations, not supplied scripted commands.

## Command construction

Jump builders emit Y-button sequences with height and state guards; grounded callers preclude a universal midair/recovery-only description. Brief or sustained Y input does not independently prove short-hop, full-hop, or double-jump execution. Similarly, delayed directional R input does not by itself prove an air-dodge transition.

Character-specific recovery scripts select timed stick and B inputs. Exact named-move outcomes, projectile self-contact, and launch trajectories remain deferred where move-side evidence is absent. The source's square-root-based prediction expressions are preserved rather than rewritten as conventional ballistic equations.

The airborne shortfall-derived operand is a horizontal-stick increment capped at 32; the separate magnitude clamp is 127. This corrects shard009's capped-clamp wording and agrees with shard033 and the command interpreter. The item-response caller's mirrored horizontal-stick/R sequences point away from the item's relative X position, not toward it. Other clearance callers include an unconditional opposite-direction fallback, so clearance guarantees must remain caller-specific.

The common action selector maintains destinations and counters and scans ordered numeric conditions. Its first `switch_cmd` test has an apparent uninitialized source path. No deterministic runtime interpretation or source repair is inferred from that observation. Command-7 level gating applies to entry consideration; the already-active path bypasses it.

## Associated-fighter state and input publication

History recording and replay coordinate two fighters. Replay can copy controller values and blend current position toward recorded position by 5%, but only X and Y are blended. The special-state synchronization branch reverses facing and invokes grounded SpecialLw entry; the Blizzard label remains a separate mapping question.

Follow exit tests the updated fighter's special-state range, not the associated fighter's range. Exit clears left-stick axes, buttons, and triggers, but not C-stick outputs. The grounded flag reset is performed on grounded updates, not only at a landing edge.

Stick accessors normalize signed-byte axes using positive /127 and otherwise /128, then clamp to [-1,1]. Trigger accessors divide by 255 and clamp above at 1. Fighter input processing selects CPU or hardware sources, separately gates C-stick publication, combines triggers by maximum, and subsequently applies shared input processing. Trigger storage width/signedness and historical offsets are not inferred from getter bodies.

## Retained uncertainty

Accepted deferrals preserve the supported local operations while withholding stronger gameplay, transitive-purity, historical-layout, named-mode, and external-source claims. Source arrays and literals do not authenticate compiled `.data` or `.sdata2` extent or placement. Numeric states do not recover named modes. Discord attribution requires the cited message itself. Renderer parse diagnostics, shadowed bindings, and name collisions remain renderer/provenance work rather than semantic evidence.

Status: synthesized; independent review and live promotion pending.
