## Functionality

This module implements the one-state `It_Kind_Unk2` replacement star used by Kirby's **inhaled-item spit path**, together with retained-item teardown and projectile reference cleanup. The canonical Kirby caller distinguishes this route from spitting a swallowed fighter; the new projectile should not be described as containing or representing that fighter.

`it_802F295C` synchronously consumes the launch attributes, forces spawn-position Z to zero, copies velocity, assigns both parent fields, and requests item creation. Failure returns `0.0f`. Success stores the deceleration input, initializes lifetime, enters state 0, and returns the maximum enabled-hitbox damage, floored at zero. Consequently, zero is not an unambiguous failure indicator. Kirby forwards this result to teardown of the original retained item even if replacement creation failed, then clears its retained-item pointers.

State 0 decrements lifetime before testing `<= 0`. Physics computes XY speed and scales both components by `(speed - decrement) / speed` above the threshold; otherwise it clears **only X**, leaving Y and Z unchanged. The source does not validate the decrement's sign or floating-point finiteness. The collision callback returns the shared environment helper's Boolean result; that helper updates collision position, records floor contact, and combines additional predicates.

`it_802F28C8` passes the old item's `grab_victim` as a fighter to conditional bookkeeping helpers, optionally resets numeric `destroy_type` to 0 for any nonzero integer guard, clears victim references, and unconditionally invokes cleanup and destruction. This is distinct from releasing a swallowed opponent. `it_802F2BDC` delegates matching-reference cleanup without destroying the projectile; the helper clears six supported relationships and resets source-player storage to numeric 6 when its source-fighter reference matches.

## Semantic review

The rendered `itKirbyInhaleItem_Destroy`, `itKirbyStarSpit_Spawn`, and `it_2F28_UnkMotion0_Init` names remain useful tentative hypotheses supported independently by canonical behavior and callers. No equivalent-wording renames are proposed. Both rendered files were complete and parse-error-free; their function-only substitution scope does not establish parameter names or data layout. Compiled section sizes, padding, and literal-pool membership remain unverified.

Status: synthesized; independent review and live promotion pending.
