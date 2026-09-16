# main/sysdolphin/baselib/psdisptev

Status: TU synthesis complete; independent root review pending.

# Particle TEV setup review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and rendered C1–204/H1–11 read completely. No parse errors or substitutions. Exact hashes and UTC timing in coverage.json.

## Entry points

- `void psSetupTevCommon(void)`: Unconditionally configures stages 0..2 order, add/zero-bias/scale1/clamped operations writing PREV, and swap0 selectors. Does not set stage counts, texgen counts, color/alpha inputs, register values or cache. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L7-L27).
- `void psSetupTevInvalidState(void)`: Writes UINT32_MAX to prevTev[0], forcing the next valid masked request to miss. No GX writes and no second-element access. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L29-L32).
- `void psSetupTev(u32* arg0)`: Requires readable word1 and writable word1 in normalizing modes. Masks 0x80100480, returns on cache equality, otherwise stores key and dispatches all16 possible combinations. Four untextured bit0x80 cases clear that bit in input and cache. Programs 1..3 TEV stages and0..1 texture generators; common stage operations and external color registers are separate prerequisites. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L34-L203).

## Dispatch coverage

The mask selects four bits, producing16 possible keys; all16 are explicitly handled. No unsupported masked key remains despite no default case. Cache hits skip every mutation. prevTev[1] is never accessed. Static initialization makes prevTev[0] zero, so callers must invalidate before relying on initial zero-mode programming. Common setup neither invalidates the cache nor installs input selectors/counts. The reviewed particle caller invalidates before common setup and initializes TEV registers separately.

| Keys | Stages / texgens | Selection | Source |
|---|---|---|---|
| 80000000,80000080 | 2 / 0 | C2*raster then C0; A2 then A0. 0x80 cleared. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L43-L59) |
| 0,80 | 1 / 0 | C0/A0 only; 0x80 cleared. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L61-L73) |
| 80000480 | 3 / 1 | C1/C0 interpolation by texture, C2 modulation, raster color modulation; alpha preserved at third stage. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L75-L91) |
| 80000400 | 2 / 1 | C2/raster color and A2, then texture. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L93-L105) |
| 400,480 | 1 / 1 | C1/C0 and A1/A0 interpolation by texture. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L107-L116) |
| 100400 | 1 / 1 | GX_MODULATE preset. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L118-L123) |
| 100480 | 2 / 1 | Texture interpolation then preserve color and multiply raster alpha. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L125-L137) |
| 80100400 | 2 / 1 | C2*raster and A2*raster alpha, then texture. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L139-L151) |
| 80100480 | 3 / 1 | Texture interpolation, C2/A2, raster color/alpha. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L153-L169) |
| 100000,100080 | 1 / 0 | Raster color/alpha; 0x80 cleared. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L171-L183) |
| 80100000,80100080 | 2 / 0 | C2*raster and A2*raster alpha, then C0/A0. 0x80 cleared. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L185-L201) |

Selector summaries assume the common additive operations; they do not independently prove GX arithmetic or clamping details. Literal GX argument tuples remain canonical evidence. Mode flags outside the mask have no local effect. 0x400/0x480 share a recipe but remain different cache keys, so switching between them reprograms. Reintroduced 0x80 in an untextured input similarly causes another miss and normalization.

## Names and limits

Canonical function names retained. The only proposed parameter name is display_words for arg0; it does not assert a recovered source struct name. Its word1 is mutable in the four normalizing cases. The source array prevTev is attested, but the compiled .sbss target cannot inherit that name without attribution. extab/extabindex archived descriptions remain unresolved. Header declares only the three entry points and includes the platform type definitions. No shared types claimed.

All8 subjects and30 existing facts accounted for: {'retain': 16, 'supersede': 2, 'reject': 1, 'unresolved': 11}. Five draft operations; no source/shared KB/Git/matching/UI changes.


## TU independent review

All sixteen masked keys have switch coverage. Four untextured bit-0x80 keys normalize input word 1 and the cache before falling through; other modes preserve that bit. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L34-L203`.

The initial zero cache can suppress the first zero request. Common setup does not invalidate the cache and external GX changes are absent from the key. Explicit invalidation installs an impossible masked value. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L1-L60`.

Common setup programs order, operations and swaps for stages 0 through 2, but stage counts, texture-generator counts, inputs and color registers remain separate. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L7-L27`.

Foreign canonical-only caller review confirms particle display context: caller invalidates and invokes common setup before per-particle setup. These supporting ranges were not separately rendered. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L1880-L1922`.

Foreign canonical-only caller passes its particle pointer to psSetupTev; no assertion of full foreign TU review. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L2008-L2025`.

All 30 existing facts and five operations reviewed. Compiled section attribution remains unresolved; the proposed section alias clear is consistent with lack of source-symbol identity. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisptev.c#L1-L204`.

## Packet

[Coverage](coverage.json), [fact dispositions](dispositions.json), [subject coverage](subject-coverage.json), [unresolved claims](unresolved.json), [proposal](proposal.json), [validation](validation.json).
