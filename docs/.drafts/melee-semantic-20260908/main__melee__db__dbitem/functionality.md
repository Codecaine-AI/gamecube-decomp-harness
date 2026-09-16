# Item and Pokémon developer controls

## Review scope
The hash-bound research establishes complete coverage of all 445 canonical and rendered lines of `dbitem.c`, all 103 canonical and rendered lines of `dbitem.static.h`, all 42 subjects, 153 baseline facts, and 41 links. This distinct lead independently checked every proposed fact's canonical citations and all upstream contradiction-evidence ranges, reconciled the proposal with the functionality document, and accepts the inherited dispositions without overrides. Existing function-name hypotheses and supported explanations are retained without cosmetic rewriting. Rendered foreign names were not used as proof of their own meanings. Archived compiled analysis was not treated as independently validated evidence; compiled section attribution and layout remain explicitly deferred.

## Initialization and input
`fn_SetupItemAndPokemonMenu` sets display status to 0, current/last item to `0x22`, current/last Pokémon to 0, global collision mode to 1, and enemy-stomp/item-pickup latches to 0. It does not reset the coin latch, spawn gate, text pointer, timer, or controlling player, nor propagate its range defaults across existing items. Its caller runs under `DbLevel >= DbLKind_DebugRom`; only the maintenance shortcut in this unit locally requires exact DEVELOP level.

L-held repeated vertical input traverses item ranges `0..0x22`, `0x2B..0x2E`, and `0xD0..0xE9`, without endpoint wrapping. The existing `0xE8` upper-bound explanation was incorrect. Horizontal input changes the independent Pokémon menu index within `0..30`. The four directional tests are separate ordered branches, not an exclusive switch. The controller argument selects debug input state; it is not an item kind.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbitem.c#L17-L51; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbitem.c#L243-L295; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L63-L112.

## Menu text and lifetime
The updater snapshots both selections before processing input. Only a resulting change records the player, reloads the timer to 120, shows or creates the panel, and rewrites its text. Status 2 reuses hidden text; other incoming states attempt creation. Successful creation registers and styles a DevText object using the static 80-byte backing buffer, purple background, black foreground, and scales 12 and 16. Creation failure nevertheless sets status 1; the caller subsequently uses the stored pointer without a local success check. Status 1 therefore is not proof that allocation succeeded.

Only the recorded player's check advances the visible panel's timer. A nonzero timer is decremented; hiding occurs on a subsequent check that enters with zero, before that call's input processing. No text destruction occurs here. Re-running setup resets status without clearing or destroying the retained pointer.

Label tables have 35 ordinary-item entries, 31 Pokémon entries, four barrel-enemy entries, and 26 Adventure slots with only 13 explicitly initialized strings. Remaining Adventure slots are null pointers. The update routine does not provide a null-label fallback or general validation of arbitrary indices. A changed item at or beyond `It_Kind_Arwing_Laser` enters an explicit infinite loop.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbitem.c#L297-L363; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbitem.c#L421-L444; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbitem.static.h#L8-L100.

## Manual versus automatic spawning
The manual drop requires a new D-pad-down press with none of the explicitly listed other buttons held. It reads only `CurrentlySelectedItem`. The spawn descriptor uses player coordinates with y increased by 60, z and velocity zeroed, null parents, and the specified damage/flag fields. Eligibility includes the common-item subsystem predicate, two capacity tests, the Adventure availability table, and the `It_Kind_M_Ball` special predicate. The second capacity test has only an upper kind bound; it is not restricted by an explicit barrel-enemy lower bound. Only a non-null constructor result receives the collision-mode OR and effect `0x420`. The dispatcher additionally requires both `gm_801A45E8` queries to return zero; their broader meanings are not inferred here.

The `ItemSpawnsEnabled` field instead gates the ordinary automatic random-spawn callback. Disabled updates leave its countdown untouched. Startup explicitly enables this gate. The manual drop does not read it, so baseline explanations equating its disable setter with disabling manual DEVELOP drops were corrected.

The independent Pokémon index is consumed later by `it_8027AB64`, after higher-priority mode overrides. Menu zero selects randomly; nonzero indices are decremented before adding `It_PKind_Start`. The Ditto availability fallback remains in that consumer. Manual item creation must not be described as directly spawning the independently selected Pokémon.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbitem.c#L163-L176; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbitem.c#L365-L444; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itspawn.c#L153-L201; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain.c#L209-L214; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_279C.c#L1434-L1510.

## Diagnostic state
The global collision mode cycles numerically `1 → 2 → 3 → 1`; the toggle replaces the low two bits of every active item's diagnostic byte. By contrast, the ownerless initializer and non-fighter fallback OR the global mode into existing bits. The fighter branch clears those bits before applying the owner's packed flags masked with 3. The classifier explicitly rejects null and non-fighter objects. The owned-item refresh scans all active items, compares owner pointers exactly, and ignores its `Fighter*` parameter. Common item initialization chooses the ownerless or owner-aware helper; the per-player fighter collision control subsequently refreshes owned items. Exact numeric-state-to-visible-mode mappings remain deferred rather than inferred from names.

Coin-range setters affect only `It_Kind_Unk4` and bitfield member `b0`. Enemy-stomp enabling requires `xDD0_flag.b0`, but disabling clears diagnostic `b3` on every active item. Pickup-range setters write `b4` on every active item. Each also updates its persistent latch, even for an empty list. `dbanim.c` selects these pairs through miscellaneous-visual bits `0x20`, `0x02`, and `0x08`, respectively. Rendering has additional eligibility predicates, so setting a diagnostic bit alone does not guarantee visible geometry. Bitfield member names are not assumed to equal numeric low-bit positions.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbitem.c#L53-L241; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L427-L434; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbanim.c#L44-L87; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbanim.c#L150-L185; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L197-L265; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itdraw.c#L76-L142.

## Maintenance shortcut
At exact DEVELOP level, held B plus a new D-pad-right press copies twelve explicitly paired members of `Item_804A0C64`. The existing restrained description as synchronization of opaque allocation-related state is supported. This review does not reinterpret every destination as a high-water mark, limit, or reset counter.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbitem.c#L31-L51; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.h#L58-L61.

Status: synthesized; independent review and live promotion pending.
