# Common dash attack

Revision `c302741689bd67c361cd7faadb221df3193992c3`; canonical and rendered C1-103/H1-16 read completely. Terminal empty lines account for renderer totals; code citations stop at C102/H15.

CheckInput requires pressed A, with no local ground or movement-state test. A held item plus held LR or classification zero enters LightThrowDash. Otherwise classification two invokes item-swing variant four; remaining cases dispatch Kirby to its dedicated AttackDash or everyone else to common entry. Item classification is the item attribute x0_78. The swing helper selects an item-kind table row and variant column. Accepted input returns true for all three outcomes.

Generic entry disables interruption, changes motion 50 at frame zero, speed one and zero blend with no flags, invokes animation setup, then clears move x0. Kirby entry performs the analogous setup for its dedicated state and also clears x0. Dash and RunDirect call SetMv0 after every accepted input result, including item substitutions; the setter unconditionally writes common x68 to the shared union slot. It does not inspect the actual new state.

Anim leaves ongoing animation alone and dispatches its end through ft_8008A2BC. That helper routes Master Hand and Crazy Hand separately; the ordinary neutral helper handles DownSpot and held Hammer before Wait, with ground conversion and item/animation handling. IASA first calls ftCo_800D8AE0 regardless of allow_interrupt. Its initial held-item plus LR check can enter LightThrowDash. After two eligibility guards it can enter CatchDash on held LR and nonzero move x0; otherwise it decrements nonzero x0 and returns false. Early eligibility failures bypass that decrement. Only a false return plus allow_interrupt invokes the ordered Wait input chain.

Phys supplies common x50 times ground friction and facing to ft_80085030. That helper uses animation translation for ground acceleration when x594_b0 is set; otherwise it applies friction. Both paths apply ground movement. Coll calls shared ground checking and enters Fall when it returns false. Motion table 50 registers the four callbacks consistently with the header.

The split literal section is eight bytes containing zero/one. Existing source section is 12 bytes with a trailing zero word and WRITE|ALLOC versus split ALLOC. Assembly literal loads establish zero/one entry use. Frozen report hash matches; no build ran.

All 24 exact outgoing records are individually retained with their original endpoints, roles, rationale and locators. New canonical evidence is attached without asserting historical PR/wiki/old-source resources were re-read. All 48 fact versions and 18 subjects are accounted for.
