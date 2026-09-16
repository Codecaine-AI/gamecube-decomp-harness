# Naming Decisions

| Canonical Subject | Inherited Hypothesis | Decision |
|---|---|---|
| ftCo_800C60C8 | ftCo_HammerFall_CheckInput | Supersede with ftCo_HammerPass_CheckInput; isolates platform-drop input and removes owned collision. |
| ftCo_800C6110 | ftCo_HammerFall_EnterFromPass | Retain as descriptive Pass-machinery variant, not proof of prior Pass motion state. |
| ftCo_0C60.c source entity | ftCo_HammerPass | Retain module hypothesis. |
| .sdata2 | None | Retain section identity and zero-start-frame purpose. |
| Both #r3 parameters | None; canonical gobj | Retain declared name and Fighter_GObj* type. |

Frozen fact search found ftCo_HammerFall_CheckInput on this wrapper and two ftCo_HammerFall subjects, ftCo_800C5CD4 and ftCo_800C5DDC. Exact search found no ftCo_HammerPass_CheckInput in canonical source or frozen inferred names. The retained executor and module hypotheses occur only on their owned subjects. Foreign collisions are followups, not unauthorized writes.

Canonical ftCo_Jump_CheckInput supports the check-and-conditional-entry suffix convention at ftCo_Jump.c46-60. Source and header render metadata, including fact IDs and versions, are preserved in coverage.json. Rendered names are hypotheses and were not used as semantic evidence.
