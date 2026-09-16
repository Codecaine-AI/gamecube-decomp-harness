# Swept Intervals and Direct Geometry Drawing

The predicate tests a descending sweep of horizontal intervals against a target interval at one height. It offsets only the first sample, rejects incorrect vertical ordering, interpolates left/right edges at the target height and accepts inclusive overlap. A vertical span below 0.01 uses interpolation fraction 1 after the ordering checks.

The draw helpers use their selectors as gates. Selector 2 emits a five-vertex red triangle strip; selector 0 emits a two-vertex yellow horizontal line from matrix-shaped packed coordinates. Their Boolean return values report whether a draw was submitted. They do not report collision results.

The red opacity follows sample index: sample 1 is opaque red and sample 0 has alpha 64 in either height-order branch. The inherited claim that the higher endpoint is always opaque is incorrect. Both draw helpers load the current camera's view matrix; neither restores GX state locally.

| Canonical Target | Behavior | Evidence |
| --- | --- | --- |
| `.sdata` | Source declares exported opaque white/black GXColors and private opaque red, alpha 64 red and opaque yellow. Local rendering reads red/translucent_red/yellow; no local writes occur. Compiled .sdata placement and consecutiveness are not independently established. | [L54-L58](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0146.c#L54-L58) |
| `.sdata2` | Source uses 0.01 and 1.0 in the near-zero vertical-span case and 0.0 in comparisons and emitted vertex Z coordinates. Exact .sdata2 constant membership, size and padding require object evidence. | [L35-L49](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0146.c#L35-L49) |
| `lb_80014638` | Copies two interval samples and a target sample, offsets only the first sample by unk_x in both horizontal components and unk_y in height, and rejects ascending order or a target height outside the closed vertical span. Interpolates horizontal edges at target height, using fraction 1 when absolute span is below 0.01, and accepts inclusive horizontal overlap. Neither input is changed. | [L17-L52](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0146.c#L17-L52) |
| `lb_80014770` | Only selector 2 emits GX commands. Configures alpha-blended untextured vertex colors with depth test but no alpha/depth writes, loads current camera view matrix, and emits five triangle-strip vertices in XY with Z 0. Higher sample is near_pt; sample 1 always supplies opaque red and sample 0 alpha 64 red regardless of height order. Returns true after drawing and false otherwise, without restoring GX state. | [L60-L129](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0146.c#L60-L129) |
| `lb_800149E0` | Only selector 0 calls HSD_StateInitDirect(0,2), loads the current camera view matrix, sets line-width argument 12 and emits two yellow line-strip vertices at X=arg0[0][2] and arg0[0][3], shared Y=arg0[1][0], Z 0. Returns true after drawing and false otherwise; the matrix-shaped input is read as packed coordinates. | [L131-L154](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0146.c#L131-L154) |

Full canonical and rendered coverage includes C lines 1-155 and header lines 1-18. Both renders returned ok with zero parse errors, zero substitutions and no next page. The header declares all three functions and exported white/black colors. Foreign shared types were not claimed as owned files.

## Live application status

Live promotion confirmed: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_0146/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_0146/staged-completion.json), [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/16582f7dc08069168c1c823e27877662578a11e07c0b946ad5dadb6fbfc4b886/2026-09-08T14-51-20.632Z-1b99c51e-603a-4770-9090-7936dbb07157.receipt.json). Unresolved inherited claims remain unresolved. Proposal and review hashes preserved.

Verified completion: live promoted. [final-render.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_0146/final-render.json>) and [staged-completion.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_0146/staged-completion.json>).
