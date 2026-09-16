## Nana initialization and registration

The owned C source and header define Nana's character resources, special-move dispatch table, lifecycle callbacks, attribute reload, and two partner-state gates. All canonical and rendered pages were reviewed; rendered names were treated as hypotheses rather than evidence.

### Dispatch and resources

`ftNn_Init_MotionStateTable` registers states 341–366 across neutral, side, up, and down specials. Every entry retains `ftCamera_UpdateCameraBox`; states 363 and 366 have null animation, IASA, physics, and collision callbacks. Popo-prefixed callbacks include Nana-owned implementations, so the prefix alone does not establish ownership. Neutral, side, and down entries set move-ID bit 23; up-special entries do not. Resources include four costume triples, fighter and animation archives, and demo strings; the ViWait string explicitly names Popo. The header exports these resources and declares additional Nana special-move functions. Source declarations do not establish compiled section composition. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNana/ftnana.c#L23-L346 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNana/ftnana.h#L8-L50.

### Lifecycle and attribute lifetime

`ftNn_Init_OnLoad` sets `x2222_b4`, invokes the Popo-owned Nana attribute helper, and then copies active attribute `xC4` into `x40`. `PUSH_ATTRS` copies external attributes into existing backup storage and installs that storage as `dat_attrs`; it does not allocate storage. `ftNn_Init_LoadSpecialAttrs` instead copies external attributes into the already-active destination. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNana/ftnana.c#L348-L360, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNana/ftnana.c#L384-L387, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/ftpopo.c#L359-L362, and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L21-L41.

`ftNn_Init_OnDeath` unconditionally restores `dmg.armor0` from `xC8`, schedules selection zero for model groups 0 and 1, and clears `x2234`, `x222C`, `x2230_b0`, `x2238`, `x224C`, and `x2250`. The parts setter writes pending selections and raises a dirty flag; a separate routine applies them. This callback does not itself prove a five-unit armor value or destroy resources formerly referenced by cleared fields. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNana/ftnana.c#L362-L377 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L555-L577.

### Side-special interruption

`ftNn_Init_80122FAC` forwards its object unchanged to `ftNn_Init_801238E4`. Canonical side-special setup installs the wrapper in both damage and secondary-death callback slots, independently supporting the proposed `ftNn_Init_OnDamage` name. Cleanup resets part-0 X rotation, invokes `Fighter_UnkSetFlag_8006CFBC` locally and on a linked partner, clears the partner's reciprocal link if present, and always clears Nana's link. Normal side-special exit separately clears damage, death, and hitlag callbacks; callback clearing must not be attributed to the wrapper itself. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNana/ftnana.c#L379-L382 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNana/ftnanaspecials.c#L29-L199.

### Partner up-special gates

`ftNn_Init_8012300C` is an eligibility-and-entry operation, not a pure predicate. Either `x221F_b3` or `x2219_b5` rejects entry. With both clear, packed categories 1, 3–8, and 10–13 reject; 2, 9, and the default branch dispatch `ftNn_Init_801232A4` and return true. Popo calls this after finding Nana and testing strict distance less than `x7C`. The entry helper copies Popo's facing only when Popo exists; grounded Nana calls a ground-to-air preparation helper, whereas the airborne branch explicitly writes maximum jumps used. It then enters state 361. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNana/ftnana.c#L389-L420, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/ftpopospecialhi.c#L205-L266, and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNana/ftnanaspecialhi.c#L93-L162.

`ftNn_Init_8012309C` is read-only: true requires `x221F_b3` clear and motion ID inclusively 362–366. This includes the two null-behavior table entries and excludes initial state 361. Both Popo throw callbacks query it on a non-null partner when their command-variable gate fires, transition and return on success, and otherwise continue the counter/update path. Numeric categories and unnamed flags retain their uncertainties. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNana/ftnana.c#L422-L431 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/ftpopospecialhi.c#L398-L470.

### Review outcome

The checkpoint ledger covers all 43 facts and 17 links: 34 facts retained, 9 unresolved; 15 links retained, 2 unresolved. No replacement facts or new graph objects are proposed. Compiled section claims, the numeric armor interpretation, and the ground-path all-jumps-used claim remain unresolved.

Status: synthesized; independent review and live promotion pending.
