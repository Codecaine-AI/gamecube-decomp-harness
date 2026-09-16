# Common down tilt

Revision `c302741689bd67c361cd7faadb221df3193992c3`; full canonical and rendered C1-173/H1-15 reviewed. Terminal empty lines count in renderer totals; canonical code spans C1-172/H1-14.

CheckInput requires pressed A, left-stick Y <= common xB0 and atan2(Y, abs(X)) < -x20_radians. An eligible held item selects LightThrowLw. Eligibility tests A and either held LR or the negated item predicate; otherwise fighter-kind dispatch selects GameWatch or common entry. There is no local grounded-state test; grounding is action context. GameWatch installs its Manhole accessory setup, confirming the bespoke down tilt.

Common entry first permits nearby light/heavy item pickup. Only an unconsumed request clears command 0, allow_interrupt and the repeat latch, installs callUnk in x21EC, changes to AttackLw3 with SkipAttackCount, and runs animation setup. Fighter_ChangeMotionState invokes and clears x21EC after motion attack metadata setup. callUnk refreshes the stale attack instance then resets per-attack condition/statistics data, allocates the plAttack sequence and invokes trick processing with previous value zero. Stale insertion deduplicates move-ID/instance pairs, so repeated contacts do not add the same occurrence twice.

Anim prioritizes command gate plus buffered repeat over exhaustion; a repeat dispatch can itself be consumed by pickup. Otherwise animation exhaustion enters SquatWait. The fake wrapper is source scaffolding with no additional behavior. checkPadA runs after five interrupt-gated attack checks: pressed A with command gate immediately dispatches repeat and returns true; with gate closed it latches a repeat and returns false, allowing later processing. Thus repeat input is independent of allow_interrupt and can be buffered before the script permits repetition. The later gated chain is downward throw/down-tilt dispatch, neutral attack, jump, dash, squat, turn and walk. Earlier returns prevent later checks.

Phys delegates friction then grounded movement. Above walk speed, friction is multiplied by the shared factor; no claim is made that every possible factor increases it. Coll delegates a ground check that enters Fall on false. The registered motion 57 callback table agrees with all four phases. Header declarations and definitions agree; Fighter_GObj/HSD_GObj spellings are compatible.

Literal pool: split object is eight bytes 000000003f800000 with ALLOC. Existing source object is 24 bytes with WRITE|ALLOC: zero-filled symbols @96 (8 bytes) and @166 (8 bytes) surround f32 zero/one symbols @107/@108 at offsets 8/12. These objects do not establish section parity. Assembly constant-load sites show zero/one in doEnter. Frozen report hash matches; no build ran.

All 18 exact outgoing records are individually retained, including repeated endpoints. Their original role, rationale and locators remain in link-dispositions.json. Fact evidence and foreign canonical ranges are in coverage.json and fact-dispositions.json.
