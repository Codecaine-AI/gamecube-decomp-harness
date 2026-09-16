# HSD Expression Bytecode

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. HSD_ByteCodeEval owns a temporary HSD_SList of untagged 32-bit values and returns the top word interpreted as f32. NULL bytecode returns zero. Opcode 1 frees all remaining nodes before return. Arguments are copied as raw bits, so an integer result needs explicit conversion if a numeric float result is intended.

## Decoding and Control

Opcode 0 is a no-op. Opcodes 5,0x3C,0xFF collect one byte; 2,3,4 collect two; 6 collects four. Immediates assemble big-endian. Argument load 2 asserts an unsigned comparison against nb_args. Branch 3 pops a raw integer condition and skips when nonzero; 4 always skips forward from the post-immediate cursor. Opcode 5 discards a count of nodes and tolerates over-discard. Opcode 0x3C duplicates the indexed node, with zero selecting top, and panics if missing. Opcode 6 pushes a raw word. Opcode 0xFF consumes its byte then panics.

## Operators

Opcodes 7/8 convert float-to-int/int-to-float; 9/0x0A negate. Random 0x0B/0x0C replace an existing top with a Boolean integer or fractional float, advancing shared RNG state. Trig 0x0D-0x12 uses degrees externally; 0x13/0x14 log/exp, 0x15 float absolute value, 0x16 sqrt, 0x28 integer absolute value. Float abs uses <0 and preserves negative zero.

Float arithmetic 0x17-0x1B and integer arithmetic 0x1C-0x20 consume top as the right operand and replace next. Opcode 0x21 is power; 0x22/0x23 float min/max and 0x24/0x25 integer min/max. Opcode 0x26 is degree atan2 with an explicit zero-x fallback of +90 when y>=0, else -90, including +90 for zero/zero. Opcode 0x27 computes lower + HSD_Randi(upper-lower+1), with no general range validation.

Integer comparisons 0x29-0x2E and float comparisons 0x33-0x38 produce integer Boolean words. Logical AND/OR/NOT/XOR are 0x2F/0x30/0x31/0x32; bitwise AND/OR/XOR are 0x39/0x3A/0x3B. Binary operations pop one node and overwrite the next. Source comparison branches determine NaN and signed-zero behavior; no stronger mathematical normalization is inferred.

## Consumers and Limits

RObj expEvaluate selects bytecode through exp->is_bytecode, or calls a native function. The caller applies angular conversion for selected output types then invokes update_func. This proves dispatch wiring, not runtime use. No byte-stream length, operation budget or comprehensive arithmetic/domain validation exists. A negative nb_args converts to unsigned in the argument assertion. Most underflow paths assert, but discard does not. Assertions use supplied diagnostic numbers only with MUST_MATCH; otherwise __LINE__.

## Data and Review

Existing .data holds seven strings: 157 source bytes versus 160 split bytes. .sdata holds empty and stack strings: 10 versus 16 bytes; ELF WRITE is set despite read-only use by the evaluator. .sdata2 has 56 identical bytes in both objects and mixed scalar constants; source flags WRITE, split does not. Exact bytes/symbols are in compiled-evidence.json, SHA256 `4aedc2194394d2cb66d96ea364e9b1a17238e8f59d54196aaf712bb3c7e76068`.

All C 1-535 and header 1-9 canonical/rendered lines reached EOF with zero parse errors or substitutions. Immutable pages and receipts are under `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__bytecode`. Per-fact citations and dispositions are in proposal.json and coverage.json. All three outgoing baseline stack-interpreter links are retained with current canonical citations in link-dispositions.json. No DB links changed.

## TU Lead Verification

Complete canonical/rendered C1–535/H1–9,18facts and3exact links reviewed. Immediate decode, raw-word conditions, argument signedness and stack lifetime confirmed. [Lead receipt](lead-verification.json), [link ledger](link-dispositions.json). Independent gate pending.
