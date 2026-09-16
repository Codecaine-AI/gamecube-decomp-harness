## Review
`src/melee/ft/kinds/ftCaptain/types.dox` is documentation, not executable implementation. All 168 canonical and rendered lines were reviewed. The rendered view has no substitutions or parse errors; it provides no independent behavioral corroboration.

- Lines 1–11 document two Raptor Boost GFX-tracking flags, distinguishing startup from lunge and stating that both are cleared when their state ends and on death ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/types.dox#L1-L11)).
- Lines 13–40 document the attribute structure and neutral-special stick-angle thresholds, maximum angle change, and aerial/angled Falcon or Warlock Punch momentum ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/types.dox#L13-L40)).
- Lines 42–162 annotate side-, up-, and down-special fields, mostly with offsets and sizes rather than behavioral explanations. Unknown fields remain explicitly unknown; the unused-variable remark occurs on `specials_unk5` ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/types.dox#L42-L162)). These annotations are not compiled-layout evidence.
- Lines 164–167 describe `ftCaptainSpecialS::grav` as aerial Raptor Boost gravity ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/types.dox#L164-L167)).

No supported correction or meaningful rename emerged. There are no frozen subjects, facts, or links to disposition, and no knowledge changes are proposed.

Status: synthesized; independent review and live promotion pending.
