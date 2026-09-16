# gm_16F1 semantic review

The full owned canonical and rendered C/header/static-header views, all 153 subjects (495 facts), and all 167 links were examined. Supported baseline knowledge is explicitly retained; eight supported corrections are proposed, with nine fact claims left unresolved rather than overclaimed.

## Decisions, scoring, and presentation
The descriptor table contains kinds 0..255 at matching indices and a final 0x29A sentinel. Accessors distinguish kind, applicability mask, flag/point type, localized SIS ID, and ID-minus-two indexing. US text remapping changes 0xDE to 0x102 only on the text path; raw configured points do not use that remapping. The duplicate rendered text-index name is corrected by naming the raw accessor gmDecisionGetSisTextId. Filtered traversal combines stored player quantities below D7 with computed result predicates at later kinds. The inclusive search has a full descending fallback; strict next/previous do not wrap. Text population checks requested count only after an emission, so zero is not a capacity guard.

Valuation derives strict higher-score ordinal ranks, applies placement returns before quantity/statistic scaling, and preserves integer division order. Ties share ranks, with rank-zero doubling taking precedence even when rank zero is also maximal. Finalized values and quantities are stored separately. Recomputing player bonuses resets flag-typed entries, not accumulated quantities.

## Standings and lifetimes
Live six-slot statistics produce cached ranks and a maximum. Qualification history resets at match initialization, grants initial best/worst flags only at the first differentiated standings, and thereafter only revokes active-slot qualifications. Unique-holder tests consume that history. Computed result evaluation imports cached rankings for numeric rules->x5 == 3, not for team mode; team scoring is separately controlled by rules byte 6. Its scores[4] declaration versus six-index loops remains a source ambiguity. Member-derived pointers are formed before the apparent null guard, so the source does not establish a generally safe null-context API.

Debug Results sets the independent suppression byte; Results initialization uses it to zero detail offsets, and Results exit clears it. The byte suppresses computed decision predicates but does not erase stored quantities.

## Progression and rewards
The 0x42-terminated callback catalog dispatches by record ID and mask. Callback execution is not transitively read-only: milestone callbacks latch save fields. The registration scan counts successful table-driven records but excludes its two explicit trophy-backed registrations. Reconciliation fully clears failed general/trophy records, but character/stage paths clear only durable registration bits. Feature synchronization mirrors four recorded milestones into menu availability and can restore the default random-stage mask.

Trophy try-staging registers then clears the saved marker, preserving runtime pending state and timestamp; force-registration clears first and then registers. Prize processing materializes pending trophies and resets the manager-owned 0x4D8 runtime region. That reset also appears at campaign initialization. Message pending bits are save-backed, distinct from runtime trophy pending bits. Mew/Celebi registration occurs during selection and spawn preparation before allocation succeeds.

## Candidate selection
Character and stage selectors return candidates, not direct grants. VS routing prioritizes quota, Mewtwo cumulative player-time, then Marth starter use. Campaign routing preserves ordered no-continue, completion, Luigi, and fallback checks. Game & Watch's implemented aggregate checks Target Test, Classic, or Adventure as three separate complete-family routes; it does not inspect the All-Star mask. Event candidate IDs are inverse-table indices, not displayed event numbers. Falco and 15-Minute completion guards belong to callers. Challenger difficulty uses runtime per-character retry counts to produce 5/3/1/0, with no-contest/retry/zero-stock outcomes incrementing the count.

## Evidence limits
No compiled section extent, ordering, literal-pool contents, or compiler-generated switch-data claim is established from source alone. The descriptor count expression is corrected without claiming compiled layout. Foreign rendered hypotheses were checked against canonical producers/consumers where needed; the misleading foreign Classic-clear name for the Target Test x1C accessor is routed for owner review. Numeric state and overflow ambiguities remain explicit.

Status: researched; no-change lead bypass; independent review and live promotion pending.
