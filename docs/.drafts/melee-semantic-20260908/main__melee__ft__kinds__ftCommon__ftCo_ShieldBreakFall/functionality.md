# ShieldBreakFall Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Both owned files are read to EOF in canonical and rendered views: 38 C lines and 13 header lines.

## Functionality

ShieldBreakFly animation completion calls entry. Entry selects ShieldBreakFall and invokes drift/effect helpers. Anim/IASA are inert; physics delegates falling/friction; collision conditionally dispatches the supplied Down-state entry.

The entry does not prove that ftCommon_8007EBAC initializes airborne state. Its canonical body tests player/fighter flags and calls lb_80014574. The inherited airborne-bookkeeping claim is superseded; the rendered TriggerRumble name remains unverified.

## Naming and Callbacks

| Canonical | Behavior | Naming decision |
|---|---|---|
| ftCo_80098D90 | Selects ftCo_MS_ShieldBreakFall with flags Ft_MF_KeepColAnimHitStatus, Ft_MF_SkipModel, Ft_MF_Unk06, Ft_MF_SkipMatAnim and Ft_MF_SkipColAnim, followed by arguments 0, 1, 0, NULL. It extracts Fighter from gobj->user_data, calls ftCommon_ClampAirDrift(fp), then ftCommon_8007EBAC(fp, 8, 0). The latter conditionally calls lb_80014574 based on player and fighter flags; this does not establish airborne bookkeeping. | Retain inferred ftCo_ShieldBreakFall_Enter; exact original name unknown. |
| ftCo_ShieldBreakFall_Anim | No-op; Fighter_GObj argument unused. | Retain canonical name. |
| ftCo_ShieldBreakFall_IASA | No-op; Fighter_GObj argument unused. | Retain canonical name. |
| ftCo_ShieldBreakFall_Phys | Forwards the unchanged gobj to ft_80084EEC; that context reads gravity, terminal_velocity and aerial_friction and calls ftCommon_Fall and ftCommon_ApplyFrictionAir. | Retain canonical name. |
| ftCo_ShieldBreakFall_Coll | Forwards unchanged gobj and ftCo_80098E3C callback to ft_80082C74. Context dispatches callback conditionally, and callback selects one of the two ShieldBreakDown states. | Retain canonical name. |

## Coverage and Limits

Reviewed all six targets, six entity subjects and 35 inherited facts. The five parameter entities have no inherited facts. All prior fact IDs, updated_at versions, content hashes and dispositions are recorded in findings.json.

The .sdata2 target is reviewed but its four inherited pool claims remain unresolved. No owned declaration or object evidence proves an eight-byte pool or exact section placement. The header address comments differ from the frozen target addresses; the declarations still agree with the five definitions.

Foreign context is read-only and canonical-only. The source files listed in findings.json remain owned by their assigned families. Physics and callback forwarding are verified; exact collision meaning, downstream mechanics and common-effect semantics remain family followups.

## Artifacts

proposal.json contains six fact writes and empty links/entities/merges/follow_ups arrays. findings.json contains full coverage receipts, source hashes, naming decisions and family followups. No shared KB application is performed.

Review correction: Anim is an empty callback. Its inherited claim about preventing animation completion or progression toward grounded stun remains unresolved. Final dispositions: 22 retain, 6 supersede, 7 unresolved. The six-write proposal is unchanged.

## Live application status

Live promotion confirmed by [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_ShieldBreakFall/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_ShieldBreakFall/staged-completion.json), [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/d8f434abfa6cee9f04b983501cbfbdfb37bdf8e729d7a24a9ce2868ffbc8c4fa/2026-09-08T14-40-04.996Z-17e52944-c18e-46fc-9858-1c2331493d41.receipt.json). Unresolved inherited claims remain unresolved. Proposal and review hashes are preserved.
