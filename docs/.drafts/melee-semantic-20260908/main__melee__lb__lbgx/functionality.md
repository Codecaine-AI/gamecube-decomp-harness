# Auxiliary GX Rectangle Drawing

The sole export, lbGx_8001E2F8, draws a colored rectangle only when arg3 equals two. Other values return false before GX state changes or input-pointer reads. A drawing call returns true after five vertices; it does not restore GX state. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbgx.c#L9-L35 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbgx.c#L77-L84.

## Inputs and Geometry

For arg0 = x,y,z,w, origin arg1 and multiplier argf1, the center is cx = arg0.x * argf1 + arg1.x and cy = arg1.y + arg0.y. The horizontal half-extent is arg0.z and the vertical half-extent is arg0.w. The multiplier changes only the horizontal center offset, not width. The origin Z coordinate is unused.

Vertex order is right-top, left-top, right-bottom, left-top again, left-bottom. All Z values are zero before the current camera's viewing matrix transforms them. GX receives a five-vertex triangle strip; the repeated left-top produces a degenerate middle triangle. Each vertex is followed by the same four bytes from arg2. The configured direct color attribute is RGBA8; paired GXPosition2u8 writes emit those bytes despite their helper name. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbgx.c#L27-L76.

## GX State and Caller Use

The helper enables color writes, disables alpha writes, selects source-alpha blending, alpha comparison, depth testing without depth writes, no texture generators, one TEV stage and one unlit color channel, no culling, and direct position/color descriptors. It loads the current camera viewing matrix into slot zero and selects that slot. It does not check the camera or input pointers. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbgx.c#L11-L35.

The fighter caller uses a diagnostic flag to draw both grounded light and heavy pickup extents, or the airborne light pickup extent. It passes current position and facing. A true result marks aggregate drawing state dirty; after auxiliary drawing the caller invokes HSD_StateInvalidate. The item caller passes xBCC_unk, position, a color and facing amid its diagnostic rendering, propagating the boolean into its return accumulator. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L188-L227 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itdraw.c#L93-L142. Those foreign ranges support this TU's use, not new claims about fighter or item types.

## Data and Header

The existing source object has one four-byte +0.0f literal in .sdata2. The split object and frozen report allocate eight bytes including four padding bytes. One relocation loads the literal for vertex Z values. compiled-evidence.json retains paths, hashes and exact bytes; no compilation or matching ran.

The owned header contains its guard, platform and vector includes, and the single public declaration. It defines no structs or inline implementations. Vector types and the current camera belong to foreign headers and are not renamed or redefined here.

## Naming and Limits

Retain the inherited lbGx_DrawDebugRect hypothesis, supported by the rectangle calculation and caller diagnostic paths. It is an inferred alias, not the canonical source name. A source-wide search found no existing canonical occurrence of that alias. Independent lead review remains required before refreshed naming evidence is accepted.

The review does not claim arbitrary pointer safety, validated extents, exact world-space depth preservation, or a geometry-state reset. Every owned source/header line was read in canonical and rendered form; both views have zero parser errors and one inherited-name substitution, ending at EOF.

## TU Lead Verification

Complete canonical and rendered source reviewed. Checked draw-pass early return, horizontal-center-only multiplier, repeated vertex producing middle degenerate triangle, zero input Z, and no local GX restoration. Caller diagnostic evidence and compiled literal attribution remain independently gated. See [lead verification](lead-verification.json). Independent review and KB application remain pending. Snapshots are under `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbgx/pages/`.

## Current Application Status

Root completed reviewed live KB promotion for 11 operations. Source is unchanged. See [completion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbgx/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbgx/final-render.json). Earlier pending statements describe the research handoff.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/2224ed3592ea3f18982f387381045006335929fbce47c3fbcf58e468cafe0901/2026-09-08T14-51-21.240Z-aa4a36e7-4817-4af6-91e1-8895275683ef.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbgx/final-render.json).
