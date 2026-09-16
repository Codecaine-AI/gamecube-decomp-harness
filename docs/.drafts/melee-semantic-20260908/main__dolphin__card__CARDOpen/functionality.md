## CARDOpen semantic review

The complete canonical and rendered 156-line file was reviewed, together with all 26 subjects, 44 facts and 9 links. The rendered view reports no substitutions or parse errors; canonical SDK names remain appropriate. No compiled layout claims are made.

- `__CARDCompareFileName` performs bounded, byte-exact matching. Equal null terminators accept shorter names; a full-width directory name is accepted only if the query terminates immediately after the matching field.
- `__CARDAccess` rejects empty slots first, then accepts either the `&__CARDDiskNone` identity bypass or matching game/company identifiers. Public permission is a separate status-valued check, not a Boolean ownership test.
- `__CARDGetFileNo` searches attached cards for the first accessible name match and writes its output index only on success. It does not use the public fallback.
- `CARDFastOpen` opens by slot and retries only ownership denial through `__CARDIsPublic`. Its out-of-range file-number return precedes output invalidation. `CARDOpen` resolves by name. Both validate only the starting block here, initialize chan/fileNo/offset/iBlock on success, and release every successfully acquired control block.
- `CARDClose` leaves the handle untouched on acquisition failure and otherwise invalidates only chan. Shared acquisition/release helpers establish temporary BUSY ownership, preserve an already-published detached NOCARD state, and return the supplied release result unchanged.
- `__CARDIsOpened` ignores its inputs and always returns FALSE. Both deletion paths therefore bypass this particular open-handle guard; that does not eliminate their independent acquisition or access failures. Public fallback usage in asynchronous reads and status retrieval was also verified.

Existing detailed knowledge is retained except for five descriptions that omit the identity-bypass branch or overgeneralize failed-open invalidation.

Status: synthesized; independent review and live promotion pending.
