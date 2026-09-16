# lb_00F9 Functionality

Two fixed backing pools support articulated dynamics nodes and transient force records. A descriptor owns a linked node chain over a JObj child path. The update solver combines transform-derived directions, stored angular state, downward influence, bounded or radial force fields, and optional collision/floor branches before writing rotations and world positions.

## Entry Points

| Canonical | Behavior |
|---|---|
| lb_8000F9F8 | Passes child JObj to lb_80011C18 with JOBJ_UNK_B26 if a child exists; independently passes the root DObj to lb_80011B74 with the same flag when root is neither particle nor spline and has DObj. Foreign helper internals determine final material mutation. |
| lb_8000FA94 | Links 320 DynamicsData entries into cur_data, clearing each stored jobj. Links eight effect entries into lb_804D63AC, clearing x0. Clears active head lb_804D63B0 and status lb_804D63B4. Other fields and inhibit byte are not reset. |
| lb_8000FCDC | Allocates two backing containers, stores their pointers globally, then calls pool reset. No allocation-result or already-initialized check and no freeing of previous pools occurs. |
| lb_8000FD18 | Transfers every desc->data node to global free head cur_data by prepending it; clears desc->data but leaves count and node payloads unchanged. Requires a nonnull descriptor and valid acyclic chain. |
| lb_8000FD48 | Allocates a requested prefix from the DynamicsData free list while following JObj child links, snapshots transforms/world positions and initializes selected node fields. After complete construction computes adjacent world-space length and dominant translation-axis code. Pool exhaustion returns immediately with partial chain and no final metadata pass. |
| lb_800100B0 | Gets an effect free node and prepends it to active list, or chooses greatest active x1 when exhausted and rejects if that value is less than incoming x1. Copies listed effect fields, resets phase counter, preserves list link and returns record. Second float argument is unused. |
| lb_800101C8 | Zeros output and accumulates active effects using cosine-modulated strength. Type1 contributes its stored vector only strictly inside XY bounds. Other types use normalized query-minus-source displacement scaled by reciprocal square of max(0.05*normalization_return,1). Finally normalizes output and returns that helper result. |
| lb_800103B8 | Forwards both Vec3 pointers unchanged to lb_800101C8 and returns its float result. |
| lb_800103D8 | Compares endpoint heights relative to offset. Equal distances return whether the common distance exceeds1e-10 without touching output. Unequal distances produce a point only for strict first-above/second-below crossing, with interpolated x, offset y and zero z. Other paths return false. |
| lb_8001044C | Advances a selected suffix of a linked dynamics/JObj child chain. Builds current and saved-pose transforms, adjusts link direction through stiffness, downward influence, eligible active forces, stored angular motion, angle limits, optional collider avoidance and floor handling. Writes node world positions/angular state, modifies nonterminal JObj rotations and propagates parent matrices; tail receives final world position. |
| lb_800115F4 | For each active effect sums type1 strength before changing it, subtracts x24 and clamps only negative result to zero, decrements positive count, increments phase and recycles count-zero records. Publishes status1/2 for sum>0.1 depending on previous positivity, otherwise -1/0. |
| lb_80011710 | Copies source pos and eight authored parameter fields per source-count entry into an existing destination chain. Sets derived unk_8C to source.pos.z/link_length or zero for exactly zero length. Does not allocate, validate lengths/pointers or change destination count. |
| lb_800117F4 | Accepts translucent first color only on pass2 and opaque alpha255 only on pass0. Sets direct GX state/current view matrix and line width12, starts LINESTRIP with desc count, emits all linked JObj translations with half RGB before prefix index and full RGB afterward. Second color is unused. |
| lb_800119DC | Packages vector, lifetime, strength, decay and angular rate into type2 priority100 effect with +/-10000 bounds, then calls registrar and discards its nullable result. Type2 sampling ignores those bounds. |
| lb_80011A50 | Packages vector, lifetime, strength, decay, angular rate and four bounds into type1 priority0 effect, then returns the registrar result. Type1 sampling treats x4 as direction and applies strict rectangle bounds. |
| lb_80011ABC | Returns global lb_804D63B4 unchanged; pool reset and effect update locally produce0 and the -1/0/1/2 transition values. |

## Constraints and Uncertainty

Pool reset requires allocated storage. Initialization overwrites old pool pointers without freeing them. Chain construction requires a positive signed-cast count and enough JObj children, and exhaustion retains a partial chain without completing link metadata. Applying authored parameters and skipping starting parts both assume sufficient linked nodes.

Effect lifetime is tested exactly at zero; negative lifetimes persist. Strength subtracts decay and clamps only negative results, so negative decay can increase strength. Type1 status uses the pre-decay sum, including effects removed later in that update. The floor helper can return true without writing a point when equal endpoint heights are sufficiently above the floor.

The solver stiffness step targets current_dir; saved-pose natural_dir is used for later convergence/deviation limits. Collider avoidance uses radius+0.1 in a square root after guarding only radius; zero-length divisions and degenerate axes remain unchecked. Ground-normal seeds are fixed world-down vectors; map-provided normals are not used for those rotations.

## Coverage

All1140 displayed lines in both owned files and both canonical/rendered views are reviewed. All targets and subjects are listed in findings.json with prior fact IDs and version hashes. Zero render parse errors; pointer-return public declarations have shadowed_binding status. No source or shared KB edits. Five compiled-section mappings and detailed family/caller claims remain unresolved.

Review correction: registrar data-flow fact34387c55 remains unresolved: x2/x3 are untouched, next is preserved and phase is reset. Final dispositions:44 retain,25 supersede,46 unresolved.
