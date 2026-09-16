## src/MSL/float.c

This data-only translation unit defines two separate, externally visible, non-const one-element `int` arrays: `MSL_TrigF_80400770` initialized to `0x7FFFFFFF`, and `MSL_TrigF_80400774` initialized to `0x7F800000`. Interpreted as IEEE-754 binary32 bit patterns, these represent NaN and positive infinity respectively; the declarations themselves are integer arrays, not floating-point objects or numerical float conversions.

The existing non-finite runtime-data purpose is retained. There are no functions, branches, allocation operations, or explicit consumers in this file. Both objects have static storage duration. Specific cross-file uses are not established by this unit alone. Neither adjacency nor compiled section placement is inferred from symbol suffixes or declaration order.

The complete rendered view matches the canonical declarations, with no substitutions or parse errors. No naming change is warranted. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/float.c#L1-L2.

Status: synthesized; independent review and live promotion pending.
