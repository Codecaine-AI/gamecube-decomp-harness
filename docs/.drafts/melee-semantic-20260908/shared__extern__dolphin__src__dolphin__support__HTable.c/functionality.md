## Hash-table support
All 73 canonical and rendered lines were reviewed. The rendered view has no substitutions or parse errors. No baseline subjects, facts, or links exist, and the existing function names fit the visible behavior.

- `DSInitHTable` stores the caller-provided bucket array, size, and hash callback, then initializes each bucket with the same object/link arguments. No allocation is performed here. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/support/HTable.c#L4-L14.
- `DSInsertHTableObj` directly uses the hash result as a bucket index and delegates insertion with position argument zero. It performs no modulo reduction or bounds checking. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/support/HTable.c#L16-L20.
- `DSHTableToList` copies bucket zero's Offset to the destination and calls `DSAttachList` for every bucket in ascending order. The initial bucket-zero access is not guarded against a zero-sized table. Whether attachment consumes or otherwise modifies source-list contents is delegated to external list code and is not established by this file. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/support/HTable.c#L22-L31.
- `DSNextHTableObj` returns NULL for a null table. With a null object, it starts at bucket zero; otherwise it resumes within the object's hash-selected bucket, returning NULL for index -1. It skips exhausted buckets in ascending index order. Other invalid hash results and the initial access to a zero-sized table are not guarded. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/support/HTable.c#L33-L56.
- `DSHTableIndex` returns -1 for a null table or object and otherwise returns the hash callback result; it does not search for membership. `DSHTableHead` rejects negative or out-of-range indices and delegates head retrieval to `DSNextListObj` with NULL. For nonnegative indices, its bounds check requires a valid table pointer. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/support/HTable.c#L58-L72.

No supported naming correction is necessary. No compiled-layout, ownership-transfer, or external list-lifetime conclusions are drawn.

Status: researched; no-change lead bypass; independent review and live promotion pending.
