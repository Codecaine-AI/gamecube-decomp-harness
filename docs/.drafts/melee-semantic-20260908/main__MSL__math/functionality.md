## MSL math runtime
`math.c` implements `float logf(float x)` using exponent/mantissa reduction, external logarithm and reciprocal tables, and a cubic residual correction. The table index uses seven mantissa bits and rounds upward when bit 15 is set; it can reach 128. With no lower mantissa bits, the residual calculation is skipped. Two local raw coefficient words are interpreted as floats; two union constants provide NaN and positive infinity. The source conditionally requests `.sdata2` placement, but no compiled layout was inspected.

The exponent-all-ones branch returns NaN inputs directly, positive infinity for positive infinity, and the library NaN for negative infinity. All exponent-zero inputs, including both signs of zero and subnormals, return negative infinity. Negative finite normal inputs are not rejected: the exponent-extraction mask includes the sign bit, so their computed E is 256 greater than for corresponding positive inputs. They therefore do not simply receive the magnitude's logarithm.

The header defines floating-point classification helpers with explicit category values (NaN 1, infinity 2, zero 3, normal 4, subnormal 5), math declarations, conditional Gekko absolute-value intrinsics, and an inline remainder helper. That helper returns a early when |b| > |a|; otherwise it converts a/b to `long long` and subtracts b times that quotient, without explicit zero-divisor, nonfinite or conversion-range handling.

The HSD bytecode caller's opcode 0x13 replaces the existing top stack payload with `logf` of that payload. The owned unit imports its lookup arrays rather than allocating or managing their lifetime.

Canonical and rendered files were read completely. `logf` remains an appropriate established name. The rendered C view reports one parse error and no substitutions; the header reports no parse errors or substitutions, and marks `fmodf` as a different-file binding. Neither rendered identities nor source comments were treated as independent behavioral proof. In particular, `EXP_ZERO` contains the encoding of 1.0, not the comment's 0.0, and the residual's cubic coefficient comes from 0x3EAAAA36, not the comment's approximately 0.000005086.

Status: synthesized; independent review and live promotion pending.
