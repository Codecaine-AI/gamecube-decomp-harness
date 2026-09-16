# dbanim Functionality Review

Draft pinned to c302741689bd67c361cd7faadb221df3193992c3. Canonical and baseline-rendered C1-222 are covered through EOF, with 221 nontrailing lines. All 9 targets, 12 subjects, 50 inherited facts and 16 exact outgoing links are reviewed. Rendering succeeded with zero parser errors and seven substitutions. Shared db.h declarations were inspected as foreign evidence; this TU owns no header. Independent review is pending.

## Panel Setup and Lifetime

Setup initializes collision mode to 1, the miscellaneous selector to 0 and the panel update flag to 0. DevText_Create requests id 7 at position 20,20 with 60 columns and 12 rows. The TU provides a 1444-byte character buffer; DevText clears 1440 bytes and allocates its record from the global pool. Successful setup registers the record, hides the cursor, sets transparent-black background and white text, and selects scale 9 by 12.

Disabling the logical update flag does not set DevText text/background hide flags. The newly cleared contents and transparent background explain the initial appearance. DevText_Show adds the record to the global draw list; its GObj argument is unused. Setup is not idempotent: duplicate id 7 returns NULL, and setup overwrites the saved pointer without unregistering the old record. Later enabled updates and visibility toggles dereference the saved pointer without a null guard.

## Miscellaneous and Collision State

The miscellaneous selector follows 0,1,2,4,8,16,32,0 from initialized state. It preserves each fighter's low two collision bits and replaces the upper six bits with selector shifted left by two. Item-side effects are established for status 2 enemy-stomp range, status 8 item-pickup range and status 32 coin-pickup range. The inspected item helpers condition stomp enable on an item flag, disable it for all items, toggle pickup for all items, and restrict coin range to kind Unk4. Other fighter diagnostic meanings require their drawing consumers; this TU alone does not establish them.

R+Up cycles the shared collision mode through 1,2,3 and writes each fighter's entire visualization byte. This clears all six miscellaneous bits but leaves the shared miscellaneous selector and item-range controls unchanged. It does not refresh owned items. R+Right excludes slot type 3, cycles the selected fighter's low two bits and likewise overwrites its whole byte. That branch refreshes the fighter's owned items. R+Left advances the miscellaneous selector and resynchronizes the upper bits and item-range controls.

The accessor fn_8022697C returns the full packed visualization byte after a null-safe fighter-classifier check, or zero for null/nonfighter input. The classifier does not validate Fighter user_data. The inspected item consumer separately checks fighter class, clears item low bits and copies the accessor's low two bits. Nonfighter owners follow the consumer's global-item-mode branch; they are not universally disabled by this accessor.

## Panel Update and Input Ordering

Enabled updates erase the panel, reset its cursor and iterate fighter user_data. Motion IDs below 0x155 use the motion-name table; remaining IDs print numerically. Animation -1 prints blank. Other animation IDs below 0x127 use the submotion-name table; remaining IDs print numerically. These are upper-bound comparisons, not general index validation. No local guard validates the panel, name pointers, user_data or arbitrary negative indices.

Animation begins at column 23, frame at column 44 with %03.2f formatting, and L/R/T at column 52 for the three status bits 1/2/4. Name-table pointers are loaded by debug setup when the debug-level gate permits it. Asset contents were not inspected.

Y+Down flips the shared panel flag and explicitly shows or hides text and background. Y+Left requests Super Mushroom apply, or Poison Mushroom with A held. Y+Right requests the corresponding end helper. The mushroom functions have guards, and dbanim ignores their results, so the input does not guarantee a size change or restoration.

R/Y and direction tests are independent if statements. Simultaneous modifiers or directions can compose in source order. The inspected caller checks four player inputs before one panel update, allowing multiple global toggles in a frame. Held/pressed accessors index directly by the player argument. Normal caller indices are 0 through 3; slot type checks do not establish complete entity validity.

## Existing Compiled Data

| Section | Inspected payload |
|---|---|
| .bss | DevText pointer plus 1444-byte backing buffer, 1448 bytes total |
| .sbss | Four-byte bitfield record with 3 collision bits, 6 miscellaneous bits and 1 panel bit; split object adds four padding bytes |
| .sdata | Newline, numeric/name/frame formats and L/space/R/T strings; source 50 bytes, split 56 bytes |
| .sdata2 | 16 bytes: packed GXColors 00000000 and FFFFFFFF, followed by f32 values 9 and 12 |

The previous scalar-only description of .sdata2 was incorrect. Existing source and split object bytes and symbols agree on the two colors followed by two floats. Their SHA-256 values and section evidence are saved in compiled-artifacts.json. No build, freshness check or binary-parity claim accompanies this inspection.

## Names, Links and Dispositions

The .bss label db_AnimationInfo is the canonical object occupying the section. The accessor alias fn_GetFighterVisualFlags remains a descriptive hypothesis with one baseline assignment and no pinned canonical occurrence. No source rename is proposed.

All inherited fact IDs and updated_at versions are preserved in fact-dispositions.json. There are 32 retained facts, 18 superseded facts and two new parameter facts. All 16 exact baseline outgoing link records are retained with evidence and corrected qualifications. Dry-run validation accepted 52 operations with zero rejected or skipped. No proposal was applied to the shared KB.

See [proposal](proposal.json), [fact dispositions](fact-dispositions.json), [link dispositions](link-dispositions.json), [subjects](subjects.json), [naming](naming.md), [compiled artifacts](compiled-artifacts.json), [foreign canonical evidence](foreign-canonical.json) and [family follow-ups](family-followups.json).

Pinned owned evidence: [setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbanim.c#L12-L42), [miscellaneous/accessor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbanim.c#L44-L87), [panel update](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbanim.c#L89-L148), [input dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbanim.c#L150-L221).

Immutable canonical/rendered snapshot:

- [src__melee__db__dbanim.c.1-222.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__db__dbanim/pages/src__melee__db__dbanim.c.1-222.json)
