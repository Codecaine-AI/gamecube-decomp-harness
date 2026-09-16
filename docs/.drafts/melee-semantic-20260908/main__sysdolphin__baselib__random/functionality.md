# Shared HSD Random Generator

The module uses a writable 32-bit state selected by exported `seed_ptr`. Its default storage starts at 1. Each sample advances the selected word with `state = state * 214013 + 2531011` modulo 2^32. All three sampling entrypoints consume one state advance.

| Entry Point | Behavior |
|---|---|
| HSD_Rand | Advances the selected u32 state by state * 214013 + 2531011 modulo 2^32 and returns its upper 16 bits as a nonnegative s32. |
| HSD_Randf | Advances the same selected state once and returns its upper 16 bits divided by 65536 as f32, yielding values from 0 through 65535/65536. |
| HSD_Randi | Calls HSD_Rand once and returns max_val * sample / 65536 using signed integer arithmetic; it performs no range validation or overflow protection. |
| _HSD_RandForgetMemory | Redirects seed_ptr to the module seed when its address is within the supplied inclusive-low, exclusive-high interval. It does not dereference the old pointer or reset either seed value. |

`HSD_Randf` has 65536 possible normalized outputs. `HSD_Randi` uses multiplication and division, not rejection sampling; neither uniformity for arbitrary maxima nor unrestricted overflow safety is claimed. Even a zero maximum consumes a state advance. Memory-forget handling changes only the pointer; returning to the fallback state resumes its existing sequence.

The header declares all four entrypoints and exports the pointer. Canonical names are already descriptive and remain authoritative. Three parameter entities have no inherited facts; their signed bound and half-open address-bound roles are documented in findings.json.

Both complete files were reviewed in canonical and rendered form at `c302741689bd67c361cd7faadb221df3193992c3`: [random.c](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/random.c#L1-L30) and [random.h](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/random.h#L1-L13). Rendered pages contain no substitutions or parser errors.

Source proves the globals and normalization expression, but does not identify the compiled `.sdata` or `.sdata2` layout. Nine inherited data-section facts remain unresolved pending pinned object evidence. The broad Randf caller mapping is a separate family followup. No shared KB or canonical source writes were made.

## Live application status

Root confirmed live promotion. Evidence: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__random/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__random/staged-completion.json), [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/c8f8d01f76e5c57e3505444edacdc46bc23ad0d42d00bf4fb133a9657653f2b7/2026-09-08T14-38-03.920Z-0854f19b-db81-45b1-b717-7107b602661c.receipt.json). Unresolved inherited claims remain unresolved; promotion does not validate them. Proposal and review hashes are preserved.
