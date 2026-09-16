## HIO public declarations

`extern/dolphin/include/dolphin/hio.h` includes Dolphin types and declares two callback types: `HIOCallback` returns `void` and takes no arguments; `HIOEnumCallback` returns `BOOL` and takes an `s32` channel. The interface declares device enumeration, channel initialization, mailbox reading/writing, address-based reading/writing, asynchronous variants with callbacks, and status reading. All nine functions return `BOOL`. Transfer declarations use a `u32` address, mutable `void *` buffer, and signed `s32` size; mailbox and status read declarations accept `u32 *` parameters. These signatures do not establish runtime success conventions, transfer restrictions, or callback/buffer lifetimes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/hio.h#L3-L16.

The file tests `_DOLPHIN_HIO_H_` with `#ifndef` but does not define that macro within the header, so this is not a conventional self-establishing include guard. No source modification is proposed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/hio.h#L1-L19.

Canonical and rendered views were read completely. The rendered text has no substitutions or parse errors and preserves the descriptive public names. Its unrelated `callback` symbol annotation is not evidence of a cross-file relationship. The frozen baseline contains no subjects, facts, or links; there are therefore no retention rows or supported factual corrections to propose.

Status: synthesized; independent review and live promotion pending.
