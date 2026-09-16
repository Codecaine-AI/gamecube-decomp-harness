## Togepi item lifecycle

The canonical and rendered C/header files were reviewed completely. The source declares seven ItemStateTable entries: state 0 handles appearance, state 1 waits before selection, and states 2–6 share one animation/physics/collision callback family. This is a source-level description, not a claim about compiled section layout.

Spawn clears facing_dir and all three item-command variables, calls shared Pokémon setup, initializes state 0 and its later waiting timer, then issues the sound call. The appearance physics helper applies falling motion before checking its separate spawn countdown; it restores normal scale when that countdown is nonpositive. On completion, Togepi resets velocity, enters state 1 and clears both hitlag callbacks. The timer initialized by it_802D39F8 persists into state 1.

State 1 decrements pokemon.timer only when it_80272C6C returns false. After decrement, a nonpositive value invokes it_802D3848; otherwise the current animation descriptor is reapplied. This is not an unconditional per-frame countdown. The selector makes one HSD_Randi(sa->max) draw and tests cumulative xC, x10, x14 and x18 thresholds to select states 2–5, with state 6 as the fallback. It enters the selected state and clears hitlag callbacks. Actual attribute values, valid probability distributions and individual numeric-state-to-effect mappings are not established here.

All five result states share the UnkMotion6 callbacks. Animation descriptor processing is conditional, but the subsequent xDAC_itcmd_var0 completion test is independent of that guard. Waiting/result physics updates only GA_Air; their collision wrappers use distinct airborne and non-airborne helpers, always passing the same no-op hook and returning false. State-0 collision propagates it_8027A118's result; canonical cross-file inspection shows that helper calls it_8026E4D0 and returns false. The no-op hook itself neither changes state nor handles an effect. The unknown-event wrapper forwards both object arguments to it_8026B894; its exact triggering event is not established by the local body.

## Semantic assessment

The rendered hypotheses itTogepy_Appear_Init, itTogepy_Appear_Phys and itTogepy_SelectEffect fit the canonical lifecycle and are retained as descriptive hypotheses, not recovered original names. Both rendered files were structurally sound, with no parse errors. Foreign rendered helper names were not treated as independent proof.

Most existing knowledge remains useful without rewriting. Two collision explanations should explicitly cover all five result states rather than describing only state 6. Three .sdata2 facts remain unresolved because the source's 0.0f assignment cannot prove constant-pool placement, an eight-byte extent or padding. The checkpoint ledger covers all 83 baseline facts: 78 retained, two superseded and three unresolved; all 16 baseline links are explicitly retained.

Status: synthesized; independent review and live promotion pending.
