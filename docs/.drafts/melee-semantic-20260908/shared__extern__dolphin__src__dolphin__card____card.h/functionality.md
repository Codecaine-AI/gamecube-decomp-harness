## Internal CARD interface

`extern/dolphin/src/dolphin/card/__card.h` is a guarded declaration-only header including the public CARD and EXI headers. Its declarations are grouped by implementation-file comments; those comments identify intended interface families, not verified implementation behavior.

- Extended directory-entry status access, unlocking, seeking, callback-based reads/writes, and raw reads are declared at [lines 7–24](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/__card.h#L7-L24).
- Filename comparison, access/public/open checks, file-number lookup, mount callbacks, region formatting, directory updates, checksum/verification, and FAT/block operations are declared at [lines 26–52](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/__card.h#L26-L52).
- The BIOS interface declares `__CARDBlock[2]`, a disk-ID pointer and disk-ID object, callbacks and interrupt handlers, status and transfer operations, erase operations, disk-ID selection, control-block access, and synchronization at [lines 54–79](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/card/__card.h#L54-L79).

## Semantic assessment

All 82 canonical and rendered lines were reviewed. Rendered declarations are unchanged, with zero substitutions and zero parse errors. Existing descriptive source names fit the declared interfaces; no supported naming correction is warranted. Renderer binding diagnostics are not evidence of canonical symbol identity.

The header supplies signatures, not implementations. It does not establish numeric result meanings, exceptional branches, callback timing, buffer ownership, control-block acquisition/release behavior, disk-ID pointer lifetime, or compiled section/layout properties. In particular, the declared two-element control-block array does not establish its runtime lifecycle.

The exhaustive subject and link enumerations are empty: there are no owned baseline facts or links to retain, correct, or reject. No new factual proposal is justified within this declaration-only assignment.

Status: synthesized; independent review and live promotion pending.
