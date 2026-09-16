## Fighter dynamic-bone lifecycle

`ftdynamics.c` initializes, configures, updates and releases Fighter-owned dynamic-bone descriptor sets. The header exposes the public entry points while several implementation helpers remain private. Canonical and rendered versions of both owned files were read completely; all 70 subjects, 153 facts and 43 links were reviewed.

### Setup and ownership

`ftCo_8009CF84` copies the character definition count, checks capacity, initializes each joint-bound runtime descriptor, applies initial chain flags, and copies authored dynamics parameters. The shared Kirby-hat initializer finds an authored joint by child-first hierarchy traversal. Its wrappers select Koopa/Zelda/Nana/Falco/Link slot 2, Kirby/Luigi/Ganon slot 1, or Marth slot 0. Yoshi slot 3 and Purin slot 4 are exceptions: they bind directly through Fighter parts and set the referenced part flag.

`ftCo_8009DC54` is Purin costume-accessory setup, despite the `u.kb` field spelling in this TU. The independently inspected Purin caller loads the accessory first. Costume IDs 2 and 3 select definition pairs 1–2 and 3–4; the function installs runtime slots 1 and 2, sets the count to three, and leaves slot zero untouched. Other costume IDs return unchanged.

`ftCo_UnloadDynamicBones` releases the counted descriptor range and clears the count. The library release routine recycles nodes and clears descriptor data pointers without destroying or dereferencing their JObjs. Kirby cleanup and Fighter destruction can remove accessory models before releasing descriptors; these are distinct lifetimes. The library initializer can return early on pool exhaustion, and the fighter setup routines do not implement rollback or independently verify full node allocation before copying authored parameters.

### Flags, animation and updates

`ftCo_8009CB40` configures one indexed chain. Descriptor nodes, child JObjs and consecutive Fighter parts advance together. Its fourth argument is declared `FigaTree*`, but its value is cast to an integer split boundary and stored as a token; it is not dereferenced as an animation tree. Nodes before the boundary receive the inverse mode, remaining nodes receive the mode. False-to-true transitions reset stored dynamic transform state, and flagged joints have `0x20000` cleared. False mode stores `0x100`.

The fighter-level flag dispatcher skips Kirby and handles only set zero for Purin. The part-toggle routine searches by JObj identity, switches the boundary between `j` and `j + 1`, removes ordinary animation from corresponding model/skeleton subtrees or restores the active animation, and returns zero on a match or minus one otherwise. Correspondence search assumes structurally aligned hierarchies; it does not validate them.

The main update forwards a boolean option into the library solver, refreshes prerequisites, and uses numeric modes 3/0 for Peach, 8 for Mewtwo and 0 otherwise. Its final solver boolean depends on the literal scale comparison, Mewtwo motion IDs `0xDF`–`0xE8`, airborne state and Koopa/GKoops exceptions. The scale condition is `< 1 || > 1`, not a NaN-safe equality test. Peach's final solver call is unconditional within its character branch, so zero active count is not a universal no-op. On Flat Zone, nonzero-count updates temporarily replace root X scale with Fighter Y scale, restore it, then rebuild terminal chain matrices.

Animation-state application prioritizes `x594_b4` over `x594_b3`. Table entries select numeric chain partitions; ordinary animation comes separately from `x590`. The selected null table is a no-op in `ftCo_8009E4A8`, whereas motion configuration has explicit null-table fallbacks. In motion configuration, the entire `x594_b4` branch processes all runtime sets without the ordinary Kirby/Purin exclusions.

Marth/Roy transition handling tests exactly `-1` and `+1`; motion configuration tests `> 0`. The inspected producer distinguishes onset 1, continuing 2, cessation -1 and inactive 0. These tests are not interchangeable. The existing Whispy-glitch relationship is retained as a qualified association, not complete causal proof.

### Wind and stage adapter

The action-script wind helper transforms `(x, y, 0)` through a selected Fighter joint, replaces negative duration with 120, and submits a type-2 spatial source. It always returns false. The source stores a position snapshot, not a persistent joint attachment. Shared-pool insertion can allocate, replace an existing source, or fail; failure is discarded. Accepted sources decay, advance phase, count down positive duration and return to the free list at zero.

`ftCo_8009EAF8` is unrelated to bone simulation itself: it ignores its GObj and invokes a Ground dispatcher for Kongo-family barrel handling. The inspected OldKongo path requires state 1, asserts a retained pointer, and clears capture when retained byte 2 equals 8. No broader validity predicate is inferred.

### Semantic review outcome

Most existing names and explanations are retained explicitly in the checkpoint ledger. Proposed corrections distinguish two colliding helper names, remove unsupported animation-tree binding interpretations, preserve exact numeric transitions and exceptional branches, and correct guaranteed wind creation and universal initialization claims. Six compiled-section facts remain unresolved because source literals do not prove section placement, mutability or pool size. No compiled layout claim is introduced.

Status: synthesized; independent review and live promotion pending.
