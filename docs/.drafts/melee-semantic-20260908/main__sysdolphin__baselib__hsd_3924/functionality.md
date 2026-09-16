# hsd_3924 functionality review

Draft, pinned at `c302741689bd67c361cd7faadb221df3193992c3`. Independent review remains pending; no shared-KB application, source edit or build occurred.

## Registry and entry points

`hsd_80392474` writes NULL to the static registry head. It performs no node or payload cleanup. Common runtime initialization calls it at `src/melee/gm/gm_1A45.c:230`.

`fn_80392480` stores Event/priority payloads in singly linked nodes. `HSD_SList.next` is the first field, so the cast-based `ret->next` comparison reads the payload event, not its priority. A duplicate leaves the original priority unchanged. New producers insert after the last priority less than or equal to the request, preserving ascending order when this routine constructs the list. The return is the existing payload for a duplicate, the previous anchor for append, or the new head for prepend. This corrects two archived second-word claims and prevents treating all returns as newly inserted nodes.

`hsd_80392528` requests priority 0x80 and discards the result. Opening movie labels, developer stress-test labels and the camera-backed performance producer use this wrapper.

## Drawing and data flow

`hsd_8039254C` invokes each registry payload's first word as `DispItem* (*)(void*)`, passing the payload address. It traverses nullable returned chains without freeing them. Text, bar and gradient cases share a 60-column layout with ten-unit cells. Text counts bytes excluding backslash controls, wraps by a full row if needed, and adds two spacing columns. Each text item starts white; renderer color controls change only the item-local color. Gradient and nonempty bar items use a 600-unit horizontal row and half-line transitions. Positive bar counts determine proportional widths; the first nonpositive count terminates bars. The gradient dependency consumes float-position/color records until a negative position.

The camera callback selects its camera, updates retained values from last performance statistics, then invokes this compositor. This TU performs presentation rather than the timing sample collection itself.

## State, bounds and compiled constants

The static background color is `{0x40,0x40,0x40,0}`. Its zero alpha disables all guarded backing rectangles in the reviewed source. Existing object sections corroborate RGBA bytes `40404000`; reference object sections have four extra padding bytes for `.sdata` and `.sbss`. Both `.sdata2` sections have identical 56-byte contents containing white and drawing/conversion constants. Artifact hashes and bytes are in [compiled-artifacts.json](compiled-artifacts.json); they establish no fresh-build guarantee or binary parity.

There is no callback-null guard, reentry/mutation guard, payload allocation-null check, item-chain cycle guard, text control-length validation, or explicit bar/gradient capacity check. Returned storage must remain valid and sentinel-terminated. Unknown item types are skipped. Empty registry, null callback results and nonpositive total bar counts are suppressed by traversal/dispatch conditions.

## Evidence and coverage

Owned canonical and rendered coverage is complete: C1–255 and H1–12, including their trailing empty lines. Citations stop at actual code lines. Source hashes and render metadata are in [coverage.json](coverage.json). Foreign files are dependencies only, not claimed as owned coverage. The header shadowed binding and unrelated local `cb` substitution are recorded as rendering exceptions; no semantic claims depend on those aliases.

All 11 manifest subjects are described in [subjects.json](subjects.json). All 27 old facts have ID and updated_at dispositions in [fact-dispositions.json](fact-dispositions.json). The proposal retains 19 and supersedes 8, adding six facts for previously empty subjects. Existing aliases remain descriptive hypotheses with historical spelling unattested; see [naming.md](naming.md).

Pinned canonical evidence: [registry](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3924.c#L12-L64), [compositor](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3924.c#L69-L254), [list layout](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.h#L6-L9), [list returns](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L39-L78).

Immutable page snapshots (each includes canonical and rendered views):

- [src__sysdolphin__baselib__hsd_3924.c.1-150.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3924/pages/src__sysdolphin__baselib__hsd_3924.c.1-150.json)
- [src__sysdolphin__baselib__hsd_3924.h.1-12.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3924/pages/src__sysdolphin__baselib__hsd_3924.h.1-12.json)
- [src__sysdolphin__baselib__hsd_3924.c.151-255.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3924/pages/src__sysdolphin__baselib__hsd_3924.c.151-255.json)

## TU Lead Verification

Full canonical/rendered C1–255/H1–12 and all33slots reviewed. Payload first-word comparison, path-dependent return, zero-alpha background and shared layout confirmed. [Lead receipt](lead-verification.json). Independent review pending.

Outgoing relationships were reviewed individually against current canonical evidence. [Exact-record link dispositions](link-dispositions.json) preserve every original record and disposition. Independent link review remains pending.
