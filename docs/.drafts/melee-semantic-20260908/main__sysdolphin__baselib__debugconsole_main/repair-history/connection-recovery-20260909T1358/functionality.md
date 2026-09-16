# Debug Console and Exception Reporting

Draft for independent review at `c302741689bd67c361cd7faadb221df3193992c3`. Both owned files were read through EOF in canonical and proposed-name form: 2,869 C lines and 52 header lines. The packet reviews 112 manifest subjects, 290 inherited facts and 61 exact outgoing relationships. No source, shared knowledge, build or runtime changes were made.

## Entry and Display Flow

[Melee crash callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dberror.c#L27-L81) report the stack, optionally classify the exception, set size `0x1388` and the game debug level, then launch this console. Handler registration is skipped when an external debugger is present. Selected OS exception numbers are excluded by the caller.

[`hsd_80397DA4`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L2850-L2858) creates a priority-zero thread with a local OSThread control block and a global 4,096-byte stack. Its stack-top argument is array+0xFFC while size is0x1000. [OSCreateThread](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSThread.c#L407-L449) writes its marker at top-size, four bytes before the array. Existing objects place the screen state's saved-context pointer at that location. The debug entry subsequently clears state and later installs its context argument. Control-block lifetime still depends on scheduling and the nonreturning diagnostic path; the wrapper does not enforce it independently.

[`fn_80397814`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L2540-L2685) waits for exact controller masks `0,70h,0,808h,0,104h,0,201h,0,402h`. Each sample waits for VI retrace. Wrong masks merely keep the current wait active; there is no timeout or reset of sequence progress. It then stores the OSContext pointer, configures VI, installs the automatic-page node and draws the first framebuffer.

[The active loop](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L2770-L2847) walks input callbacks from head to tail. A zero result continues; a dirty mutation restarts the walk after traversal, while a nonzero result jumps directly to redraw and bypasses that restart check. Draw callbacks run tail first. Only requested redraws rotate the XFB, prepare its background, draw report text and nodes, flush its cache and submit it to VI. An empty list reaches OSPanic.

## Retained State and Objects

The canonical `ParticleScreenState` name has an [explicit misnomer comment](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L28-L68). Its role is debug-console display/input state. Offsets0x24/0x28 hold destination XFBs;0x2C holds the optional last-drawn source;0x34 is the selected buffer;0x38 is buffer count. Geometry occupies0x3C through0x48, font/palette0x4C/0x50, controller state0x54 through0xC4, menu origin0xC8/0xCC, list head0xD0, and saved context pointer0xD4.

| Section | Existing source/split evidence | Role |
|---|---|---|
| .bss | 4,312 bytes, NOBITS; state216 then stack4,096 | Persistent state and stack storage |
| .sbss | 8 bytes, NOBITS | Signed debug level and unsigned size units |
| .data | 5,131/5,136 bytes; first5,131 identical, five split padding zeros;283 relocations each | Glyph palettes, SPR metadata, strings, mutable page descriptors and menu arrays |
| .sdata | 680 bytes identical;16 relocations | Many inline short SPR strings plus named format pointers and short arrays |

All four sections carry flags3 in both inspected objects. NOBITS has no stored raw bytes; no byte hash is claimed. See [compiled-evidence.json](compiled-evidence.json) for object hashes, exact symbols, relocation targets and69 source SPR records. This is existing-object inspection, not a matching-build claim.

The [69-entry SPR table](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L133-L548) is1,104 bytes at .data offset728. Entry34 is all zero and draws a separator; traversal continues to Gekko-specific entries. The16 BAT halves share `hsd_80396E40`. Thirteen distinct empty callbacks cover DSISR, SRR, XER, DMA, GQR, HID, IABR, ICTC, L2CR, MMCR, PMC, thermal and WPAR families. Each registration is preserved individually in the companion and coverage records. `fn_8039710C` is a separate empty SPR setup callback.

The performance overlay's callback and camera descriptors are now [owned by hsd_3982](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3982.c#L11-L54). Two inherited overlay relationships are rejected as stale ownership. Report-text storage is in hsd_393C; this TU reads that history through its cursor APIs.

## Raster and Cursor Behavior

[`hsd_80394314`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L558-L609) clears state and acquires candidate XFBs. It chooses one or two solely from the second pointer's presence. Width and height produce stride `((u16(width)+15)*2)&0x1FFE0`, area=stride*height, columns=`(u32)(width-40)/11`, rows=`(u32)(height-80)/14`. Small dimensions underflow; usable buffers are not proven. The local draw origin becomes x0,yheight; both raster flags remain zero.

[`hsd_80394434`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L611-L645) masks glyph indices to7 bits, uses56-byte records and11-pixel horizontal advances. It ignores CR. Newline resets x, adds14 to y, then draws glyph10 and advances11 because the switch falls through. Final cursor coordinates are local and never stored back.

[`hsd_80394544`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L647-L682) draws a rectangular history window. Each row seeks its origin, subtracts14 from y before the first glyph, and consumes up to the requested columns or zero. It leaves the history cursor changed. [`hsd_80394668`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L688-L762) copies the last XFB in two-byte pairs or fills rows0 throughx1C inclusive with a flat glyph palette. The apparent luminance arithmetic preserves the original low byte; it does not dim the source. Fallback restores palette but leaves draw coordinates changed.

[`hsd_80394F48`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L1034-L1127) sizes top/bottom rules from the first label. Row borders use each row's own length, so unequal strings misalign them. The rule helper draws width+2 cells. The label renderer does not advance shared x, so the menu performs explicit advances. There are no empty-list or index guards.

[`hsd_803957C0`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L1257-L1317) finds the selected report character by searching left. Its x coordinate uses the absolute history column without subtracting horizontal scroll. A negative initial column skips initialization of `ch`. The companion prompt `hsd_80395644` updates coordinates even below debug level1, but only draws the Start text when enabled; palette is restored.

## Nodes and Input

The same forward chain has several typed views: ExcptNode exposes next/setup at offsets0/4, PSNode exposes next/draw at0/8, and the thread dispatches input at0xC. This is a singly linked overlay stack, not a branching child tree.

| Helper | Exact Behavior |
|---|---|
| fn_80394DF4 | Unlinks only the matching node, repairs predecessor/head and sets dirty; NULL or absent is unchanged |
| hsd_80394E8C | With level>=1, replaces the old head and preserves its tail; invokes setup; already-head is unchanged |
| ps_remove_node | Removes every prefix node through the supplied node; absent node clears the whole list |
| ps_clear_nodes | Clears every forward link and the head |
| hsd_80397520 | Tail-first draw dispatch, recursion unrolled three links at a time; no cycle/lifetime guard |

See [unlink and replace](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L961-L1032), [prefix helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L1503-L1540), and [draw dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L2430-L2455).

[`hsd_803975D4`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L2457-L2526) polls four controllers, saves the prior samples, clamps current samples, resets channels with error-1 and picks the first port valid in both samples. New edges reset the repeat counter. Held input repeats every poll after counter>30; absence of buttons does not itself reset the counter. A latched reset-button release calls OSResetSystem and loops forever. Proposed name `HSD_DebugConsolePollInput` replaces the inherited particle-related hypothesis; baseline name lookup has no collision.

The shared list helper `hsd_80395550` returns1 for wrapped movement,2 for A activation,-1 for B/Start dismissal,0 for unhandled input. Ordinary handlers scan bits low to high. Several loops can fail to terminate if an unhandled bit31 makes the single-bit iterator wrap to zero; actual controller masks are low-bit values.

`hsd_803956D8` auto-pages after120 increment-only calls and a following timeout call, or opens report browsing on Start. It advances report offset by page height, probes two rows and returns to row0 when both are absent. `hsd_80395A78` handles report movement and prepends the editor or main menu while preserving the report node. Character probes change history cursor state.

`hsd_80395D88` maps main menu rows0-5 to synthetic commands; the first four keep the menu and return false, while memory actions remove its prefix. Row6 prints saved context, row7 replaces head with SPR and row8 clears all nodes. The memory/action wrappers `hsd_803966A0` and `hsd_80396C78` both map seven rows to8,4,1,2,100h,400h,200h, remove prefix and return0 to let the underlying handler consume the synthetic command. Unsupported indices still remove the prefix while leaving the mask unchanged.

## Memory Inspection

[`hsd_80395970`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L1323-L1358) parses at most eight hexadecimal iterations, retrying zero once within each iteration. It can consume more than eight bytes. It restores history cursor and forces result to0x8xxxxxx0, including0x80000000 when no digits parse. Signed accumulation can overflow for some eight-digit values; there is no RAM-size validation here.

`hsd_80396868` normalizes the editor address to0x8xxxxxx0. Its definition is void(void), while header line24 still uses UNK_RET/UNK_PARAMS. `hsd_80396884` formats and highlights the address without bounds checking `buf[19+index]`. `hsd_80396A20` edits six nibbles at shifts24 through4; the last nibble remains zero. Direction checks preserve a valid0-5 index but do not repair corrupted state. Accept compares low28 bits with physical RAM size and activates the retained destination node.

[`hsd_80396130`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L1658-L1667) normalizes by physical-size modulo but does not align or guard zero size. [`hsd_80396188`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L1673-L1725) displays four16-byte rows; each row advances a local address with wrap after reading four words. The shared address remains unchanged.

[`hsd_803962A8`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L1735-L1864) moves by16 or64 with modulo wrapping. Its X dump reads exactly64 bytes, not256: four rows times four groups times four bytes. The raw dump pointer does not wrap at the end of memory. Capture is forced on and then off, not restored to its previous setting. A opens address entry; Start opens the memory menu. Neither branch opens CPU-context or SPR screens.

## Register Reporting and Inspection

[`Exception_ReportStackTrace`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L824-L847) follows `ctx->gpr[1]`, printing back chain and LR. Its upper test adds0x800000000 to physical size, exceeding every32-bit pointer. The lower bound works; the upper bound does not. Its sentinel adds0x4000 u32 elements, or0x10000 bytes. Negative depth becomes a large unsigned count. No cycle/alignment/readability check exists.

`Exception_ReportCodeline` classifies exception numbers and selected DSISR/SRR1 flags; it does not resolve source lines despite its canonical name. Program causes are selected by priority, while DSI/ISI may print several applicable messages.

[`hsd_80394950`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L767-L809) gates on FPSAVED, installs a temporary current context with interrupts disabled and prints32 FPR values. The PSF-labeled loop reads context+0x90 onward, the same FPR storage, as paired f32 values. The separate OSContext psf region is untouched. [`hsd_80395D88_dump_misc`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L1556-L1574) labels GPR0-3 as GQR0-3; GQR4-7 reads are correctly based at0x1B4. These findings follow the [foreign context declaration](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSContext.h#L137-L153), not rendered names.

[`hsd_80396E40`](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L2122-L2236) chooses a DBAT/IBAT heading but always reads DBAT selectors0x218-0x21F. Its local names are reversed relative to upper/lower registers. `lower&2` makes R/O unreachable; G is uppercase in both branches; cache tests use upper-word bits. Address output retains bits18-31. Record the literal decoder, not a claim that it accurately describes all hardware fields.

`hsd_80397110` renders entries below69, calls the selected detail hook, formats live values through baselib_mfspr and draws entry34 as a separator. `fn_80397374` has asymmetric wrap: up from the beginning lands at absolute68, while downward scrolling permits only offset+selection<67 before wrapping. Row counts are not validated. Empty hooks do not add a detail panel.

## Coverage and Review Limits

[coverage.json](coverage.json) records every fact ID and updated_at disposition, including all no-fact manifest subjects. Seven parameter identities now refer to functions in hsd_397E/hsd_3982 and remain explicit family reconciliation items. [naming.md](naming.md) lists27 inherited hypotheses and the one replacement proposal.

Canonical/rendered snapshots and [read receipts](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__debugconsole_main/reads.jsonl) are immutable helper artifacts. The [pages directory](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__debugconsole_main/pages/) contains both versions. C pages report5 parser errors; address-input and glyph helper regions include parse-uncertain names. Header parser errors are zero; fn_80397814 is marked shadowed_binding. These are reading-view limits, not skipped canonical ranges.

The generated debug-font asset is foreign and excluded; no artwork review is claimed. [unresolved.json](unresolved.json) preserves runtime/layout, ownership and malformed-state concerns. [link-dispositions.json](link-dispositions.json) archives every original record:55 retain,2 reject,4 unresolved rationale reconciliations. Proposals and relationship changes require independent review before application.
