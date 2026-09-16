# Dynamic Stage Attributes

## Purpose and Entry Points

This TU manages four static region records. Init clears active state and rebuilds a reversed four-node available list. Create copies an attribute, center, collision line, radius and signed lifetime from five inputs into a node moved from available to active. Update decrements only positive lifetimes. Get returns the first connected-line region whose strict XY radius includes the query point. Remove has asymmetric recycling behavior described below.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdynamicattr.c#L11-L115. Complete canonical/rendered C1-117 and header1-18 were read to EOF. coverage.json records file hashes and render metadata separately from all actual external reads.

## State and Query Invariants

Removing the active head recycles it. Removing a matched non-head record only unlinks it because the predecessor remains non-NULL after break. Passing a node absent from active state prepends it to available state. NULL does nothing. The updater captures next before calling Remove, so it can continue through expirations. Nonpositive lifetime values remain unchanged. Init restores all four links without resetting payloads.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdynamicattr.c#L17-L28 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdynamicattr.c#L53-L91.

A query skips a disconnected or boundary-excluded candidate and continues to later records. First match wins, including an attribute value of zero; that zero suppresses later matching records. mpCollEnd applies only a nonzero result, replacing the low byte of floor flags. Insert-at-head gives newest successful registrations priority under ordinary list use.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdynamicattr.c#L39-L47, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdynamicattr.c#L98-L116 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mp/mpcoll.c#L793-L801.

## Dependencies and Gameplay Context

mpLibLoad initializes this registry. Flat Zone code creates attribute 0x11 with radius 22.0 and its configured duration after a valid collision probe, storing the returned handle. mpLinesConnected accepts identical valid IDs or a reachable line of the same kind along next/previous connections. External Manhole nomenclature is deferred because the historical wiki source was not independently read.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mp/mplib.c#L878-L907, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grflatzone.c#L499-L520 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mp/mplib.c#L4580-L4619.

## Section Evidence

Existing source-object symbols place a 0x90-byte four-record array in .bss and two 4-byte heads in .sbss. The current shared struct declaration includes the trailing four bytes. This is evidence for the owned pool layout; no shared type rename is proposed.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdynamicattr.c#L13-L15 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/types.h#L244-L252, supplemented by src-object-evidence.txt.

Target-object .data is 40 bytes containing two diagnostic strings and padding; source-object .data is 37 bytes. Both contain grdynamicattr.c and floor_id!=GC_Id_None. The assertion uses explicit historical line 55 under MUST_MATCH, although its canonical line is 37.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdynamicattr.c#L30-L50 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.h#L16-L33, supplemented by both object evidence files.

The inherited .sdata2 account incorrectly assigned integer sentinel and lifetime logic to this pool. Both observed objects contain float 0.0, padding, double 0.5 and double 3.0. Source-object relocations reference them only in the query square-root expansion; integer comparisons use immediates. Object hashes and provenance limits are recorded. No build occurred.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdynamicattr.c#L93-L110, supplemented by both object evidence files.

## Decisions

All 50 baseline facts have explicit IDs, timestamp/hash versions, dispositions and evidence in coverage.json. All 18 owned subjects are accounted for, including four section targets, the TU entity and eight empty parameter entities. Category-specific corrections replace overbroad constant-pool and query/lifecycle claims. Existing function aliases are retained. Draft proposals require parent review before any shared-KB application.

Canonical inline sqrtf independently confirms the three scalar values. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/math_ppc.h#L11-L26.

## TU Lead Verification

Lead independently read complete canonical and rendered C117/H18 and confirmed literal removal asymmetry, query order and shared struct support. See lead-verification.json. Final proposal includes explicit object evidence hashes and complete parameter-role producer/consumer citations. Independent root gate remains pending.

## Live Promotion Receipt

Root promoted 16 reviewed operations to the live KB. Source files are unchanged. See [completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grdynamicattr/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grdynamicattr/final-render.json). Proposal and review hashes are preserved.

## Current Application Status

Root completed reviewed live KB promotion for 16 operations. Source is unchanged. See [completion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grdynamicattr/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grdynamicattr/final-render.json). Earlier pending statements describe the research handoff.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/afb32d6a65afa74fbd546b010b3a83cc3594423b694408cb476f06518ee3024e/2026-09-08T14-38-47.015Z-76b638e0-1d67-4790-bf75-9d346b24dadc.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grdynamicattr/final-render.json).
