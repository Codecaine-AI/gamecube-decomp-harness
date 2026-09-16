# Report History and XFB Selection

Review revision `c302741689bd67c361cd7faadb221df3193992c3`. The source explicitly calls ParticleConsoleState a misnomer. This TU owns a report-history ring, its shared read cursor and an XFB selection helper.

## Capture and State

The sole .bss object is 0x28 bytes in both existing source and split objects. Initialization clears only the first 0x24 bytes, preserving x24, and installs a caller buffer plus report callback. The separate HSD_LogInit stdout wrapper calls the observer before the original output function. Capture enable and initialized state are separate; disabling capture leaves history readable. Crash-handler setup supplies 0x2000 bytes when no debugger is present.

The callback ignores CR, writes ordinary bytes, and stores one-byte length trailers at LF or 54 characters. A zero-length LF trailer is suppressed when the previous byte is zero. Byte and row distances advance as new text arrives; seeks overwrite those fields, so they are not lifetime totals. No positive-capacity check protects modulo operations. Embedded NUL is accepted.

## Navigation and Reads

The coordinate getter copies independently optional column/row outputs without an initialization guard. Absolute seek starts at the partial line and walks trailers backward. It tests capacity before adding a trailer length, so the final distance can exceed capacity; there is no known-row-count guard. Columns clamp to the selected length.

Relative positive-row movement updates row, distance and column but leaves cached x20 line length unchanged. Negative-row movement saturates destination coordinates before absolute seek. The exhausted-distance fallback passes raw sums, and a zero-row delta does nothing only outside that fallback. Extreme signed sums and negations are unguarded.

Sequential and coordinate reads return zero when uninitialized, beyond capacity or at line end, but stored NUL also returns zero while advancing the column. Capture enable does not gate reads. Line end calls relative movement 0,-1 and resets column, moving toward newer text. The coordinate accessor mutates shared state and converts signed coordinates to unsigned seek arguments. Drawing masks bytes to seven-bit font indices; the address parser saves/restores cursor coordinates around hexadecimal parsing.

## XFB Selection

The video wait helper busy-waits only with at least two configured XFBs. Selection saves last_draw through the current pointer without first checking NULL. It scans other records in order for up to two nonzero addresses. Slots with no eligible visited record remain caller values. If first primary is zero, fallback transfers and clears the current slot when its pointer exists. Returns 0,1,2 by branch tests; even fallback zero can return 1. The known display initializer pre-zeroes its state. No general buffer-safety guarantee follows.

## Evidence and Coverage

Canonical/rendered C lines 1-335 and header lines 1-22 reached EOF. C rendering reports three parser errors and no substitutions; header has no errors and ten substitutions. Immutable page snapshots are in `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_393C/pages/`; read receipts are `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_393C/reads.jsonl`. Per-fact pinned citations are in proposal.json, subject dispositions and foreign ranges in coverage.json. Compiled companion SHA256 `25637b09a54ec04e15dc09c2141997e83d0684672782a8c2afddf797002588f5`. Header includes four foreign declarations whose bodies remain outside this ownership.

## TU Lead Verification

Full canonical/rendered C1–335/H1–22 and60fact slots reviewed. Cached line length, read/capture independence and partial XFB output contracts confirmed. [Lead receipt](lead-verification.json). Fact review and outgoing-link dispositions remain pending; this is not full semantic completion.

Review repairs: prose .bss alias is cleared. Positive-row negative-column movement only lower-saturates and can exceed destination length; cached x20 stays unchanged. XFB early dereference uses last_draw != -1 exactly. Final60operations SHA `adc446715b113eaa3010b41e84f3294ae7f21e6635448e53635cec8ae14ac186`.

Final reviewed ledger:60existing facts =30retain29supersede1reject;20links =15retain4unresolved1reject. The four deferred link rationales conflate navigation probes with rendering or preserve particle misnomers.
