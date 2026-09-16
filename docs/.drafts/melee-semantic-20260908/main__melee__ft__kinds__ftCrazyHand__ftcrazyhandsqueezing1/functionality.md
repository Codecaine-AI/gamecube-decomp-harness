## Crazy Hand Squeezing1

The owned source defines five `void(HSD_GObj*)` functions: an entry routine and animation, IASA, physics, and collision callbacks. The header declares all five. Contrary to several baseline rationales, the collision definition is present and empty.

### Entry and partner lifetime
`ftCh_Init_8015A2B0` stores the result of `ftBossLib_GetFighterGObj(FTKIND_MASTERH)` in `Fighter.x1A5C`, enters numeric motion state `0x179` with arguments `0, 0.0f, 1.0f, 0.0f, NULL`, and calls `ftAnim_8006EBA4`. The lookup returns the first matching fighter or NULL; entry has no local guard. Master Hand's `ftMh_MS_380_80155194` calls this entry unless Crazy Hand's motion is `0x181` or `0x182`, then records Crazy Hand in Master Hand's reciprocal partner field and enters `ftMh_MS_TagCrush`. That caller does not explicitly guard the Crazy Hand lookup against NULL. These are coordinated-action mechanics, not proof that the Squeezing1 name denotes the individual Squeeze pummel.

### Animation exit
The exit guard short-circuits in this order: Master Hand motion `0x158`/`0x159`, Master Hand `x221F_b3`, then Crazy Hand animation exhaustion. The predicates perform global fighter lookups, not reads through the saved `x1A5C`. The status predicate returns false for a missing Master Hand; the motion lookup has a `ftCo_MS_DeadDown` fallback. On exit, the callback calls `Fighter_UnkSetFlag_8006CFBC`, clears Crazy Hand's `x1A5C`, then calls `ftCh_GrabUnk1_8015BC88`. Clearing this reference does not establish destruction or ownership release, nor does this callback clear Master Hand's reciprocal field.

The handoff resets movement bookkeeping, takes destination X/Y from extended attributes `x18`/`x1C`, sets Z to zero, writes selector `0x184`, and installs `ftCh_Init_80156198` as a completion callback. Its subsequent comparison against `0x156` selects the else path after the shown `0x184` assignment. These numeric values are preserved without recovering symbolic state names from rendered hypotheses.

### Other callbacks
IASA forwards the same object to `ftBossLib_8015BD20` only for `Gm_PKind_Human`; the canonical callee immediately returns. Physics unconditionally calls `ft_80085134`, which assigns `self_vel.x = x6A4_transNOffset.z * facing_dir` and `self_vel.y = x6A4_transNOffset.y`. Collision performs no work.

### Evidence and limitations
Primary evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandsqueezing1.c#L15-L48 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandsqueezing1.h#L6-L10. Cross-file evidence: `ftbosslib.c` lines 31–34 and 177–245, `ftmasterhandslam.c` lines 57–67, `ftcrazyhandtagcancel.c` lines 109–133, and `ft_084E.c` lines 120–125 at the same pinned revision. The correct canonical locator for the animation body is code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandsqueezing1.c#L23-L33; the saved animation retention group's first locator contains a revision transcription error and must not be used as a valid locator.

Rendered names were reviewed as hypotheses, not independent evidence. `ftCh_Squeezing1_Enter` remains a reasonable tentative name based on canonical entry behavior and the adjacent family. No compiled artifacts establish `.sdata2` extent, contents, deduplication, or load provenance. The exact Sandwich Punch/tagtsubusu gameplay mapping remains unverified in this pass.

Status: synthesized; independent review and live promotion pending.
