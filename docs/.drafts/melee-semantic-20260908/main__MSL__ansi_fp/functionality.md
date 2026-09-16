## Floating-point decimal conversion
`__num2dec(const decform* f, double x, decimal* d)` reads the requested precision and writes a caller-owned, length-prefixed decimal record. The header supplies a 36-character significand buffer; the implementation does not append a NUL terminator, use `f->style`, or initialize the unknown fields. Neither input nor output pointers are retained.

The ordered exceptional branches initialize sign and exponent to zero and length to one. Both signed zeros produce `'0'`; NaN produces `'N'` and either infinity produces `'I'`. Sign extraction occurs only afterward, for finite nonzero inputs. See code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/ansi_fp.c#L65-L88 and code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/ansi_fp.h#L4-L23.

For finite nonzero inputs, `frexp` supplies a binary exponent. Integer arithmetic approximates its base-10 equivalent; `bit_values` supplies powers selected by exponent bits. Corrective multiplication normalizes the magnitude into `[0.1, 1)`. Up to 16 digits are computed in chunks of at most eight, using `digit_values`, integer truncation, and reverse character extraction. There is no rounding stage. Requests above 16 receive zero padding up to a maximum length of 36, with corresponding exponent adjustment. See code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/ansi_fp.c#L90-L163.

Precision is capped only from above. A zero request on the finite path leaves an empty significand and stores the normalization exponent. A negative request is not validated and can index before `digit_values`; ordinary conversion descriptions therefore require a nonnegative count. Exceptional branches still emit their one-character result regardless of requested precision.

Both rendered files match the canonical names without substitutions or renderer errors. Existing conversion names and behavioral explanations remain useful; no equivalent-wording rewrites are proposed. Source supports the lookup-table roles and scalar arithmetic, but does not establish compiled section extents, placement, contiguity, or literal emission order.

Status: synthesized; independent review and live promotion pending.
