# Demo Mario/Luigi motion entry and velocity adapter

ftDemo_CreateFighter installs alternate motion lists and dispatches on_create_fighter[alloc_info->unk8]. Slot10 points to ftCo_800C7178. This directly contradicts the prior claim of a revival-platform waiting dispatcher.

## Entry

Mario and Luigi select ftCo_MS_WalkSlow. Every other kind passes through inlineB2 -> inlineB1 -> inlineB0 -> ftCo_800C7070, which selects ftCo_MS_RebirthWait. Both branches use flags0, initial frame0, speed1, blend0, NULL alternate source and set x2219_b2/x2219_b1 true. No timer, ground check or transition precondition is implemented locally. Because demo creation changes the motion tables, the numeric WalkSlow name does not prove ordinary slow-walk animation.

## Companion

ftCo_800C7200 forwards unchanged to ft_8008521C. That helper sets self_vel.x/y/z = model JObj translation minus cur_pos in each component. It does not accumulate velocity or normalize by time. Mario/Luigi alternate tables both reference this callback in their second entry with ftCo_SM_Kneebend as the submotion label. Full animation-resource interpretation remains external.

## Constant section

The existing object has eight bytes in nonwritable .sdata2, float0 and float1. Object symbols and contents plus the frozen report corroborate this section. The direct motion-entry call consumes zero twice and one once; fallback uses its own TU constants. No build or report regeneration ran.

## Decisions

21 facts: 12 retained, seven superseded, two inferred names rejected with proposed clear operations. Preserve canonical source and function identifiers. All three targets, source entity and two empty parameter entities are covered. C1-45/H1-10 plus188 dependency lines were read canonical and rendered. Parser errors are zero; one external unrelated name collision is recorded.

## Evidence

- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdemo.c#L42-L47 — Slot10 initializer in demo creation table.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdemo.c#L68-L72 — Demo creation installs alternate motion-state lists.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdemo.c#L123-L127 — Creation dispatches by alloc_info->unk8.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmario.c#L133-L154 — Companion in second alternate Mario record, submotion label Kneebend.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/ftluigi.c#L223-L244 — Corresponding alternate Luigi record.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftCo_800C7178.c#L9-L44 — Complete local forwarding, entry and companion bodies.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftCo_800C7070.c#L7-L13 — Fallback body.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L157-L167 — Velocity helper body.

## Rejected link

[link-dispositions.json](link-dispositions.json) explicitly rejects link:fae1eafb-59a5-48b5-b5d2-b4fb92bf6e3b and requests deletion by root through the reviewed reconciliation path. It records both endpoints, implements role, old rationale and canonical demo evidence. No child applied a link mutation.

## Reviewed final render

Root promoted 9 reviewed fact operations. [Final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftCo_800C7178/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftCo_800C7178/staged-completion.json), and [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/28ba7d4381fbd3dd49ced145b93dc5b69fb85ad2e50cb8612e21f364e106a8d5/2026-09-08T15-10-25.355Z-c239daa5-e4c8-468f-bc71-9572c20e960b.receipt.json). Final-render SHA256: `581b38d080bf678be594f89d45244c0973083e540185c08d9bb4d020bbdb329a`. Canonical source unchanged.

Semantic reconciliation remains incomplete: the rejected revival-platform link awaits root deletion. Fact promotion does not close that link gate.
