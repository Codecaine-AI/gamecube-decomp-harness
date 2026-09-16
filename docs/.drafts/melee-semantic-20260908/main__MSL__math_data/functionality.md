## MSL mathematical table storage

`src/MSL/math_data.c` is a data-only translation unit defining four externally linked `const float` arrays with static storage duration:

- `__ln_F[129]`: rounded values of `ln(1+n/128)`, including both endpoints.
- `__one_over_F[129]`: rounded values of `1/(1+n/128)`, not reciprocals of the logarithms.
- `__sincos_on_quadrant[8]`: paired axis/sign factors `{0,1,1,0,0,-1,-1,0}`.
- `__sincos_poly[10]`: interleaved coefficients for the shared even and odd trigonometric approximations.

These definitions and their source order are established by [math_data.c](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/math_data.c#L9-L76). Their 276 total elements do not independently establish compiled section size, padding, or contiguity. The opening comment documents separate compilation as an address-load/code-matching strategy, not proof of generated instructions.

### Consumers and exceptional paths

[logf](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/math.c#L64-L112) selects the logarithm table using seven high mantissa bits. When low mantissa bits are nonzero, bit 15 can round the index upward through 128, and the reciprocal table scales the residual. Exact-grid inputs bypass the reciprocal lookup. Exponent-zero and exponent-all-ones paths bypass both tables: exponent-zero inputs return negative infinity; NaNs return the input; infinities select positive infinity or NaN by sign. The default branch has no separate negative-finite domain check; conventional library behavior must not be inferred beyond this implementation.

[sinf and cosf](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/trigf.c#L24-L107) reduce the angle, mask the quadrant to 0–3, and use paired quadrant entries with alternating coefficient indices. Small-residual shortcuts differ: sine uses coefficient 9 in its linear term, while cosine's shortcut does not. Angle reduction also depends on `__four_over_pi_m1`, a separate mutable array initialized by the constructor in [trigf.c](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/trigf.c#L10-L22); that initialization does not initialize or mutate these constant tables.

### Semantic assessment

The rendered file matches canonical source with zero substitutions and zero parse errors. Existing purpose descriptions and the translation-unit type inventory remain supported. Two corrections are proposed: remove unsupported compiled-layout claims from the section type description, and make the reciprocal formula explicit in the translation-unit data flow.

Status: synthesized; independent review and live promotion pending.
