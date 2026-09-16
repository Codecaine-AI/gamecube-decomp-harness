## Push On stage controller

The unit registers `Gr_Kind_Pushon`, `/GrNPo.dat`, and three stage-object callback records. Initialization caches the yakumono parameter pointer, changes two shared stage flags, configures objects 0 and 1, and calls the map library for ID 0. Loading configures object 2 and initializes the camera target from player one when that fighter exists. Object lookup failure is reported and returned as NULL; lifecycle callers ignore that result and continue.

### Camera and contact handling

Object 0 starts its animation and replaces camera bounds with offset-relative midpoints between the corresponding camera and blast-zone edges. Object 1 registers a fighter-region query, initializes animation state, clears a contact latch, and registers a collision callback on joints 3–5. The callback sets the latch only when the extracted collision nibble equals 1 and the ground kind is numerically 1 or 2; nonqualifying notifications leave it unchanged. A null-safe predicate reads map object 1's latch. The recurring update registers this predicate with `Ground_801C3D44`, follows player one's X and vertically clamped Y, invokes `lb_800115F4`, and unconditionally clears the latch. The Ground helper stores the predicate and uses a previously computed result—it does not synchronously sample the predicate before the local clear.

### Adaptive lighting

Object 2 obtains the scene light GObj, configures up to nine nodes after its head, and caches the existing source-light pointers and their post-configuration flags before appending two auxiliary lights. Both auxiliary descriptors initially specify point lights: flags 6 select diffuse mode and flags 0xA select specular mode. The field name `spot_light` does not establish spotlight type.

The update uses player one or the origin as its reference. Source ranking uses type-dependent metrics: ambient receives -100 before the minimum-10 clamp, infinite and point lights use XY Euclidean distance, and spot lights use absolute X distance. After selection sorting, at most the first five sources have the hidden bit cleared. Direction blending uses all ranks beginning at 1, not merely the enabled subset; below-player sources contribute zero weight, and low positive vertical offsets reduce weight. The near-zero fallback changes Y before normalization. One auxiliary receives a position 20 units from the player and an interest point at the player. The other copies rank-1 source geometry, color, and flags, attenuates RGB according to the gap to rank 2, and replaces diffuse mode with specular mode while preserving source type bits. Missing copied geometry becomes zero.

The source cache excludes the newly appended auxiliaries during normal initialization. The update has 20-element work arrays and accesses ranks 1 and 2 without count checks; successful operation therefore requires adequate source count and usable auxiliary pointers. Constructors return NULL for missing inputs or failed loads, but initialization does not validate those results. The first auxiliary is initially hidden, and this local update does not explicitly clear its hidden bit.

### Parameters and exceptional paths

The fighter query tests four strict, stage-scaled XY rectangles. The first match writes `yakumono_param->x0` and returns 1; failure leaves the output untouched. It accepts the supplied fighter rather than specifically selecting player one. The thirteenth table float is not used as a runtime terminator.

The indexed result accessor subtracts 0x99 without checking bounds and writes an s32 value and a promoted s16 value. Canonical regular-clear code consumes these as special score and coin count. The keyed accessor searches at most 33 records, stops at key -1, and asserts on failure; its canonical caller supplies character kind and stores the result in `timer_seconds`.

The dynamics selector returns x4 for joint 1 despite making an unused line-kind query. Joint 2 selects x8/xC/x10/x14 for floor/ceiling/right-wall/left-wall; invalid lines, unresolved or other joints, and unsupported kinds return NULL. Other registered hooks are empty, constant false, or constant true as documented.

Stage start attempts shared generator-manager creation with a NULL descriptor table and conditionally configures reserved entries. Its ignored constructor result permits the follow-up path after allocation failure. The parameter x18 is declared bool yet used as a random bound, so an arbitrary positive-bound probability model is not established.

### Semantic review

Existing function-name hypotheses fit canonical behavior and are retained. Corrections distinguish auxiliary field names from actual HSD type bits and preserve constructor failure and unchecked lighting preconditions. Both owned canonical and rendered files were read completely, and every subject and link page was enumerated. The header renderer leaves three named pointer-returning declarations unchanged with `shadowed_binding`; this is a rendering limitation, not contradictory source behavior. Compiled section placement, padding, and pooling remain unverified.

Status: synthesized; independent review and live promotion pending.
