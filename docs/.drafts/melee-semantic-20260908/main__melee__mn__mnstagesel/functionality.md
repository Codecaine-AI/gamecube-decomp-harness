## Stage-select scene

This unit implements the interactive stage-select scene and two stage-ID accessors used by automatic selection. Its 30-record table contains 29 stage candidates and the random-option record at index 29. Table positions, animation selectors (`x9`), random-eligibility indices (`xA`), and match stage IDs (`xB`) are distinct domains. The random helper returns a table position; `mnStageSel_8025BBD4` converts that position through `xB`.

### Construction and input

Entry always retains the incoming `SSSData*`. Only negative `force_stage_id` builds the interface: it loads the language-dependent MnSlMap archive, retains its resource bundle, and constructs camera, lights, fog, stage icons, cursor, highlights and stage-information models. Interactive entry initializes the highlighted index to 30 and the controller selector to `unk_stage - 1`; these are not the same state. Availability becomes 1 or 2 for the 29 stage candidates, with selected groups subsequently converting unavailable state 1 to hidden state 0. Runtime icon pointers are stored in the table.

Frame processing prioritizes forced selection, then the guarded menu-reset path, then controller input. Negative controller selection combines trigger bits from all four pads and takes the first stick outside the ±30 deadzone. Otherwise one pad supplies input. Each axis has the deadzone removed before cursor movement. The cursor scales input by 0.03, clamps X to ±27 and Y to ±19, and selects the first nonzero-x8 region strictly containing its world-space origin. No hit preserves the previous index. Nonzero x8 means hit-testable, not necessarily confirmable.

### Confirmation and animation

Confirmation is blocked by the shared countdown. Index 30 requires trigger mask 0x1000; index 29 and ordinary choices accept 0x1100. Ordinary choices require x8 >= 2; rejected choices play feedback. Indices 29 and 30 invoke random selection. Success creates the confirmation animation, writes state 1 and starts a 30-frame delay.

The slot-specific x30 highlight has entrance, idle and exit phases, creates a successor when selection changes, and destroys the old object after its exit interval. The separate x70 highlight follows the selected icon's position and scale and restarts its animation every ten updates, or every invocation during confirmation. The x60 information process selects animation segments using `50 * x9`, resets its timer when its effective index changes, requests playback at count 20, stops it at 69, and changes any nonzero confirmation state to 2 once its counter was already at least 90. This timer is not simply a fresh 90-frame countdown from confirmation. The xA0 animation uses a shared 250-update restart counter that entry does not explicitly reset. Fog rendering delegates to HSD_FogSet, including its conditional range-adjustment behavior.

### Random selection and exit

Random selection maintains persistent suppression across calls: negative entries are used, zero entries can be sampled, and positive entries are aged. Exhaustion resets the 29 candidates. Selection marks the chosen entry -1 and delays its adjacent partner among the first 22 entries by 3 if that partner is nonnegative. The external predicate applies unlock checks and, when enabled, the Random Stage Switch mask. The eligibility-wait loop has no terminating fallback if every candidate fails the predicate. Once sampling begins, at most 100000 draws occur; exhaustion unconditionally selects index 0 without rechecking eligibility.

State 2 causes the frame callback to write the selected record's xB into pending match rules and request completion. Forced selection instead commits the supplied stage directly. Exit frees and nulls the archive pointer, derives `start_game` strictly from state == 2, and only then transfers the stage into the preload cache and invokes preload processing. Other archive-derived pointers are not explicitly cleared here; complete scene-object teardown ordering is outside the owned source.

### Semantic review

Existing cursor, highlight, information and confirmation names adequately describe their canonical behavior. The rendered name `mnSelStageRandom` collides between the index helper and stage-ID wrapper. The tournament diagnostic specifically accompanies the wrapper call, supporting retention there and an index-specific descriptive name for the helper. Two entry explanations incorrectly identify the controller selector as the highlighted stage and are corrected. Compiled section extents, adjacency and membership are not established by source declarations and remain unresolved. The information process accesses the 30-record table with sentinel index 30; no valid sentinel record or safe compiled-layout explanation is inferred.

Status: synthesized; independent review and live promotion pending.
