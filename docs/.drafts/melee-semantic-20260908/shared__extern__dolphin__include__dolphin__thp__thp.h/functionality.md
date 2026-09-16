## THP decoder declarations

The owned header defines THP sample/coefficient aliases and a 64-element floating-point quantization-table type, followed by Huffman-table, component, and decoder-state structures. `THPFileInfo` declares six MCU coefficient-buffer pointers, four Huffman tables, three quantization tables, image dimensions, MCU-related counters, three `dLC` pointers, and three components. Several fields remain opaque or explicitly named as padding; their names and array expressions do not establish compiled offsets or runtime semantics. [Types and state](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/thp/thp.h#L10-L65)

Static declarations cover frame/scan headers, quantization and Huffman tables, restart definitions, bitstream preparation, MCU-row decompression, inverse DCT, and Y/U/V coefficient decoding. `__THPReadScaneHeader` is declared twice with the same signature; its spelling is preserved. These are declarations, not evidence for parsing branches or decode algorithms. [Internal interfaces](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/thp/thp.h#L68-L83)

The external interface declares `THPVideoDecode` with file, Y/U/V tile, and work pointers, `THPInit`, and address-named helper functions. Signatures alone do not establish work-size calculations, JFIF validation, buffer setup, return-code meanings, or cross-file buffer ownership and lifetimes. [External interfaces](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/thp/thp.h#L85-L93)

## Semantic review

All 100 canonical and rendered lines were reviewed. The rendered view reports no parse errors and no substitutions; its symbol annotations report shadowed bindings, including proposed work-size, information-query, JFIF-header, and buffer-setup names. Those annotations are hypotheses and do not independently prove the proposed behavior. No supported factual correction or better name can be established from this declaration-only scope. Subject and link enumeration both returned empty baselines, so there are no retained IDs or exception dispositions and no proposed knowledge writes.

Status: synthesized; independent review and live promotion pending.
