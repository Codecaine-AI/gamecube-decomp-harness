## Name Entry implementation

This unit implements fresh player-name creation for the Names menu, Character Select, and Tournament entry paths. It maintains a 16-byte working buffer containing four editable three-byte character slots. Acceptance validates the candidate, creates the selected profile, copies the populated slot prefix into persistent name data, stores the confirming port's rumble preference, and dispatches back to the appropriate menu context.

The keyboard contains 50 positions arranged as ten columns and five rows. Modes 0 and 1 present hiragana and katakana tables; mode 2 uses the fixed full-width alphanumeric/symbol table. The alternate-glyph chooser has two rows, with script selection encoded by parity and glyph-form selection by quotient. Its four-pointer table rows are capacities containing empty-string sentinels, not four available alternatives. Keys 0x30 and 0x31 have explicit script-selection exceptions. Space keys bypass the modal chooser in ordinary input.

Automatic naming rejects existing names and the five most recent automatic choices, then replaces the working slots and rotates history. Its rejection loops have no bounded fallback. Blank-name testing recognizes empty slots and the encoded full-width space, not arbitrary whitespace. Candidate flattening scans all four slots, whereas display and persistent copying stop at the first empty slot.

## Presentation and lifetime

The screen constructor publishes the active GObj, attaches heap-owned NameNewEntry state, extracts 19 JObj references, creates 50 key models, and installs the recurring visual callback. Main input obtains editor state through the global screen handle; its callback argument is forwarded to the modal handler, whose HSD_GObj* parameter exists but is unused. The Names path reuses the Names-menu dispatcher; the shared Character Select/Tournament initializer installs a separate input process.

The modal GObj owns a GlyphVariantEntry whose destructor removes its text before freeing the allocation. Confirmation and cancellation destroy the modal object and null the entry's modal handle. The main visual callback switches to closing cleanup when x10 differs from 1. Cleanup removes and nulls three text objects, checks three closing animations, and removes the screen when they finish or when x10 equals 1. Local destruction does not clear the module-global screen pointer; its usability depends on surrounding dispatch and reconstruction lifetimes. Archive-loaded model and name-table pointers are borrowed resources, not allocations freed by these local destructors.

Accepted exit updates power time and requests deferred card persistence. The card state machine consumes that request under its own guards; acceptance does not guarantee an immediate or successful card write. Tournament cancellation passes 0x78. Names-menu return uses name_index / 6 only after acceptance with more than 24 names; otherwise it returns to zero.

## Semantic assessment

Existing inferred function names fit canonical behavior and are explicitly retained in the checkpoint ledger. Proposed corrections address transposed navigation axes, the stale parameterless modal signature, glyph capacity versus available choices, and overly broad modification/management descriptions. Numeric flow states and exceptional branches remain explicit. Source declarations and consumers support the retained data roles, but do not prove compiled section membership, literal-pool order, addresses, or exhaustive section composition.

All owned canonical and rendered pages, all 71 subjects, and all 51 links were reviewed. Coverage validation reported no missing ranges or offsets. Rendered SIS constructor-name collisions and header shadowed bindings are presentation issues, not independent semantic evidence.

Status: researched; no-change lead bypass; independent review and live promotion pending.
