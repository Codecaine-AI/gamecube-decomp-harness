## Trophy Lottery lifecycle

`gm_Mode_ToyLottery_States` defines one active entry with numeric state 0, `lbDvdPreload_2`, `onEnter`, `onExit`, and `GS_TOY_LOTTERY`, followed by a `{-1}` sentinel. Its nested initializer contains `NULL` and `&exit_data`; `exit_data` is a static two-element `UNK_T` array. The header exports the state table. These are source-level observations, not compiled section/layout claims. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmtoylottery.c#L8-L26), [header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmtoylottery.h#L1-L8).

### Entry
Both callbacks have internal linkage and return `void`; neither consumes its `GameModeState*` argument. Entry calls `lbCardNew_AllocWorkArea()` before `lbCardGame_LoadArchive(0)`. The allocator checks only the retained CARD workspace pointer before allocating 0xA000-byte and 0x2000-byte workspaces. The archive initializer checks only the icon root before loading `MemCardIconData` and `ScNtcCommon_scene_data`, retaining configuration 0 and setting enable state. Existing initialized state therefore bypasses setup. Separate subsystem routines clear the retained pointers and presentation flags; Lottery exit does not perform those resets or explicitly free these resources. Allocation/load failure recovery is not implemented in this callback. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmtoylottery.c#L28-L32), [workspaces](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardnew.c#L1093-L1130), [presentation and resets](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L249-L317).

### Exit
Exit calls `gm_80172898(4)` and ignores its result, then calls `gm_80173754(1, 0)`. Only a false result schedules `GM_MENU` and marks a new mode pending. Canonical helper code independently confirms that the true path clears challenger data, sets `human_ckind = CHKIND_NONE`, stores slot 0 and current-mode value 1, and schedules `GM_CHALLENGER_APPROACH`; its false path performs no transition. Thus the challenger route takes priority over the menu fallback. The numeric current-mode value 1 is not reinterpreted as Lottery identity. [Exit](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmtoylottery.c#L34-L41), [helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1736.c#L40-L51).

The evaluator processes 0x42 persistent entries, additionally handles trophy-dependent entries 0x3F and 0x40 outside its counted loop, and invokes reconciliation. Its return is therefore not a count of every registration side effect, though Lottery ignores it. [Evaluator](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_16F1.c#L1630-L1654).

### Baseline review
Retained all ten facts and six links with current canonical evidence; rejected the stale Event Match implementation link. Rendered helper names were treated as hypotheses, not independent evidence.

Status: synthesized; independent review and live promotion pending.
