## MSL memory-copy workers

The translation unit defines four `void` workers taking destination, const source and a byte count; the header declares the same interfaces. `memmove` dispatches transfers of at least 32 bytes according to unsigned address ordering and matching versus differing modulo-four alignment. Forward workers traverse upward when `src >= dst`; reverse workers traverse downward when `src < dst`, preserving the caller's overlap-safe direction.

The aligned workers peel destination-edge bytes, transfer eight words per 32-byte bulk iteration, then handle residual words and bytes. Every copy loop in these workers is guarded. The unaligned workers align the destination and reconstruct words with shifts and ORs of adjacent aligned source loads. Their paired-word bulk loops transfer eight bytes per iteration and execute unconditionally, followed by an optional word and byte tail. The caller's minimum length prevents a zero initial bulk count after peeling; differing relative alignment keeps the reconstruction offset nonzero.

All operative bodies are under `__MWERKS__`; without it the functions simply return without copying. `MUST_MATCH` guards only the compiler pragmas. The pointer-cast macros rely on compiler-specific lvalue behavior. These are specialized target workers, not portable arbitrary-length copy interfaces. Unaligned source-word loads can include bytes outside the logical source interval, even though destination stores cover the requested interval under the caller contract.

Canonical and rendered files were completely reviewed. Rendered names are unchanged, with no parse errors or substitutions. Existing names accurately distinguish direction and relative alignment; all 18 existing facts are retained. In the reverse-unaligned purpose description, 'toward lower addresses' denotes traversal, not a destination below the source. No compiled section, layout or matching claims are made.

Status: synthesized; independent review and live promotion pending.
