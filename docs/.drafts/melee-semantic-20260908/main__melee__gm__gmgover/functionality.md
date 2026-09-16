## Game Over mode controller

`gmgover.c` defines the regular and debug Game Over state descriptors, two departure callbacks, and a persistent 16-byte context buffer. The header contains only an include guard.

### State descriptors
The regular table associates IDs 0–3 with `GS_REGEND_TOYFALL`, `GS_STAFFROLL`, `GS_MOVIE_END`, and `GS_REGEND_CONGRATS`. The debug table associates IDs 0–1 with ToyFall and congratulations. Both terminate with `{ -1 }`; all populated entries use `lbDvdPreload_2`. ToyFall and congratulations reference `gm_804D6920` as exit-data storage. These are source-level descriptor observations, not compiled layout claims or proof that every invocation traverses every entry. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmgover.c#L14-L95)

### Congratulations departure
`gm_801BEE9C` interprets `info.exit_data` as `s8*`, selects a challenger using the saved campaign category, conditionally records flag `0x1B` for `CKIND_GAMEWATCH`, and invokes shared progression processing. A direct challenger causes saved fighter, costume, slot, nametag, challenger kind, and return mode to be copied into shared challenger data, followed by selection of `GM_CHALLENGER_APPROACH`. Otherwise, `gm_80173754(1, gm_801BEFD0())` may take control; only if it declines does the callback restore the saved return mode. Every path marks a new game mode pending. The return-mode pointer is dereferenced in both the direct-challenger and ordinary-fallback paths. [Callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmgover.c#L97-L120)

The generic helper clears shared challenger data, sets `human_ckind = CHKIND_NONE`, and stores its second argument as `human_slot`. Consequently this call supplies the retained costume byte as a slot and literal 1 as the current mode; that discrepancy must not be silently corrected. Challenger mode loading subsequently records the previous mode and chooses state 2 for the sentinel fighter, otherwise state 0. [Shared challenger lifetime](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1736.c#L16-L69)

### Movie cleanup
The ending-movie callback `gm_801BEF84` ignores its argument and invokes `lbMthp_8001F800`. The delegated routine does nothing when inactive; otherwise it disables work, polls outstanding work, cancels the alarm, waits for framebuffer flushing, conditionally frees storage, and clears the power flag. Cleanup can therefore block and is not an unconditional free. [Wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmgover.c#L122-L125) · [Teardown](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbmthp.c#L637-L654)

### Persistent context
The accessor pairs operate on offsets 0 (character), 1 (costume/color), 2 (debug campaign GameModeKind), 8 (campaign category), 9 (player slot), and 0xA (nametag). Character and costume setters accept `int` and store bytes. The remaining setters accept `s8`; their paired getters read `u8` and return `int`, preserving unsigned byte values rather than sign-extending them. The character getter returns `CharacterKind`. No accessor validates, clears, or advances a state. [Accessors](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmgover.c#L127-L185)

Campaign loaders preserve fighter, color, slot, and nametag, converting Zelda to Sheik when the transformation field is nonzero. They install category 1 for Classic, 0 for Adventure, and 2 for All-Star. This category is distinct from debug byte 2, whose observed producer values are 0x15, 0x16, and 0x17. Unrecognized debug selections do not overwrite that byte, although the surrounding confirmation path continues. [Campaign setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmenu.c#L9-L62) · [Debug setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/soundtest.c#L1666-L1701)

ToyFall consumes character and costume to construct its demo fighter and uses the retained slot for Start-button input after its initial countdown. Debug campaign context controls trophy/resource selection; resource dispatch retains its default branch rather than validating a three-value enum. The ending trophy display excludes the featured fighter, treating Zelda and Sheik jointly. [Fighter construction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmregtyfall.c#L217-L239) · [Input](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmregtyfall.c#L573-L581) · [Resources](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmregtyfall.c#L363-L406) · [Trophy exclusion](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmregenddisp.c#L224-L241)

### Evidence boundaries
Rendered names remain hypotheses. The renderer reports nine parse errors, principally around `M2C_FIELD` accessor definitions, and inconsistently substitutes some declarations/calls but not definitions. Canonical source, not those substitutions, supports the review. No compiled artifacts were supplied, so section placement, padding, and binary layout are not asserted.

Status: synthesized; independent review and live promotion pending.
