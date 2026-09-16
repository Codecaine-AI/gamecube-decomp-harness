# HSD memory-card layer

This unit implements a cooperative GameCube CARD service with a 128-entry low-level command ring, a 32-entry request ring, shared completion context, synchronous helpers, and asynchronous completion processing. Higher-level Melee card polling calls the command pump. Bulk queue/work-area definitions reside in `hsd_4D11.c`; this code accesses them through external declarations.

## Data and operations

`CardState` describes sector geometry, an open CARD file, nine logical subfiles, physical-slot-to-logical-ID mappings, sequence markers, presentation metadata, and digest storage. Logical identifier prefixes are distinct from physical slots and CARD byte offsets. Allocation modes 0–3 select duplicated storage or differing shared-spare requirements. Sequence comparison handles byte rollover but is not a total ordering over invalid markers or arbitrarily separated generations.

The presentation region consists of 0x40 bytes of comments/header, an optional banner, icon/palette material, and a separate 0x30-byte digest trailer. It is distinct from mapped logical application payloads. Type-11 commands read presentation sectors and interpret three integer-carried arguments as optional output pointers—not file, sequence, or version identifiers. Presentation writing, logical-payload population, existing-file maintenance, and logical-subfile updates are separate operations.

## State and lifetime

Mode 1 denotes active asynchronous work; mode 2 has special queue-admission behavior. Shared result values 1 and 2 also control compare-before-write suppression and must not be treated as generic success/error booleans. Context `xC` supplies the callback identifier; `hsd_804D7988` supplies its result.

Queue records are shallow copies. State, filenames, payload sources, and output buffers remain borrowed through deferred consumption. Checkpoint rollback invalidates appended command types and rewinds the producer; it neither reverses executed CARD operations nor universally restores state mutations. Some preliminary enqueue results are ignored. Duplicate-update setup can return -258 while leaving queued work and callback context installed.

Exceptional behavior is preserved in the proposals: type-13 completion invalidates maps without publishing its read/validation failures to the shared result; a type-2 negative-selector close failure stores the incoming completion value; presentation outputs can be copied before digest rejection; normal updates can reuse current blocks; and synchronous recovery can return after its first secondary-block disposal without rewriting or closing on success.

## Semantic review

All owned canonical and rendered pages, all 137 subjects, and all 60 links were reviewed. The checkpoint contains explicit dispositions for all 229 baseline facts and 60 links, plus 49 supported fact corrections. Supported existing names and explanations were retained rather than cosmetically rewritten. Proposed names distinguish queue initialization from state initialization, presentation writing from logical payload writing, and presentation reads from an unspecified header operation. Snapshot-specific attribution was not accepted solely from another inferred helper name.

Compiled section contents, exact section layout, and historical code-generation claims remain unresolved where source alone cannot establish them.

Status: researched; no-change lead bypass; independent review and live promotion pending.
