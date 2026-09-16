# Fighter Camera Helpers

Draft at revision `c302741689bd67c361cd7faadb221df3193992c3`. Five public functions update fighter-owned camera subjects. No source or shared KB changes occurred.

## Setup and Refresh

`80076018` multiplies all six metadata floats by the supplied scalar. `80076064` scales metadata by fighter Y scale, marks the subject Active and initializes horizontal and vertical target extents, current extents, position and bone position. The setup helper also reseeds existing subjects after scale changes, as independently reviewed at `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0D27.c#L27-L33`. Only exactly +1 facing uses the forward branch; every other value uses the mirrored branch and stores -1. Stage fixed zoom multiplies one horizontal extent. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcamera.c#L10-L47).

Canonical `UpdateCameraBox` updates horizontal target extents, facing and position, clears on_ledge, and fetches bone position. It leaves Active state, vertical target extents and current extents untouched. `800762F4` refreshes only bone position. These distinctions matter to callers that already initialized a subject. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcamera.c#L49-L93).

## Upper-Boundary Positioning

`80076320` performs normal refresh, reads stage camera offset and asserts a nonzero vertical divisor. It sets `pos.x *= (cameraTop - center.y) / (blastTop - center.y)` and `pos.y = blastTop`. It does not subtract center.x, change position Z, or recompute bone_pos after that projection. The assertion reports historical line 137. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcamera.c#L95-L114).

## Data and Ownership

The existing source/split objects and frozen report confirm `.data` holds filename and assertion strings, while `.sdata2` holds +1, -1 and zero floats. Linked sizes are 56 and 16 bytes with alignment padding. See data/evidence.json for bytes, relocations and hashes. No build or matching command ran.

All shared `Fighter`, `CmSubject`, `UnkFloat6_Camera` and stage type naming is deferred to family ownership. Their local read/write use is covered here. The header is complete at [lines 1–15](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcamera.h#L1-L15).

## Evidence and Remaining Review

setup/, update/ and data/ contain per-target findings, exact fact IDs and versions, canonical/rendered read receipts and candidate changes. naming-review.json independently checks inherited aliases and caller context. lead/ records TU-wide facts. Final coverage.json accounts for every manifest subject and baseline fact; proposal.json is the accepted candidate. Frozen snapshots are under the campaign units/main__melee__ft__ftcamera/pages/ directory.

The renderer leaves two foreign name collisions unresolved, `ftLib_800866DC` and `Stage_GetBlastZoneTopOffset`. They do not prevent complete source coverage and do not authorize foreign naming changes. Independent promotion review and final post-application renders remain root-owned.

## Live Promotion Receipt

Root promoted 20 reviewed operations to the live KB. Source files are unchanged. See [completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftcamera/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftcamera/final-render.json). Proposal and review hashes are preserved.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/667ec80b662e25cf7cccbc893f58981b7574523668c275c1eec39156a85428da/2026-09-08T14-38-03.565Z-6815fe6a-b6ef-4d23-b217-95cd22086f8d.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftcamera/final-render.json).
