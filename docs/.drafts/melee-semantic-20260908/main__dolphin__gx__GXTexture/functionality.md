## GXTexture semantic review

All 1227 canonical and rendered lines were reviewed, together with all 89 frozen subjects and all 27 links. The rendered view reports no substitutions or parse errors; existing function names fit canonical behavior and require no renaming.

### Descriptor construction and sizing
Texture sizing rounds dimensions to format-specific tiles, using 64-byte tiles for RGBA8/Z24X8 and 32-byte tiles otherwise. Only `mipmap == 1` selects mip-chain sizing; `max_lod` is an exclusive level count, with early termination at 1×1. The tile-count helper separately normalizes zero dimensions to one.

Texture initialization packs sampling state, dimensions minus one, image address, full format and preload geometry. Flag bit 0 records mipmapping. Flag bit 1 suppresses TLUT binding, rather than certifying valid preload metadata: CI initialization clears it without removing the metadata. LOD initialization independently bounds minimum and maximum LOD without enforcing their ordering. Bias below -4 is replaced with -4; bias at least 4 is replaced with 3.99. Values between 3.99 and 4 are not replaced. Bias getters retain the canonical sign-bit/magnitude-like transformation followed by multiplication by 32; they are not inverse fixed-point decoders.

### Binding, regions and lifetimes
`GXLoadTexObj` selects a region through the replaceable callback, then delegates to `GXLoadTexObjPreLoaded`. Binding mutates descriptor register-ID bytes, emits six texture/region words plus optional palette state, caches image0/mode0, sets dirty bit 1 and clears `bpSent`. It is distinct from image preloading.

TLUT loading resolves a named region, brackets source/destination commands with texture-state flushes, patches the source descriptor's region offset and copies the descriptor by value into the region. Later CI binding consumes that copy. Region initialization alone does not initialize the cached TLUT object. HSD's temporary descriptors therefore need not outlive setup, but their backing image/palette memory has separate hardware-use lifetimes.

Cache-region initialization accepts NONE only for the odd bank. An unsupported even size leaves the exponent uninitialized if execution continues past assertions; an unsupported odd size can reuse its preceding value. Assertions are debug preconditions, not release recovery. Preloading advances source and alternating TMEM banks across mip levels, with distinct 32-bit handling.

### Synchronization and hardware state
Full invalidation emits two fixed commands bracketed by BP-mask writes. Copy callers supply preceding pixel-mode synchronization; the routine does not poll for completion. Automatic SU setup runs indirect stages before TEV stages, skips manually controlled coordinates, clears map flag bit 8 and excludes map 0xFF. Repeated coordinate references can overwrite earlier updates. The helper copies encoded dimensions and derives bias from wrap equality with 1. Dirty-state dispatch in GXGeometry invokes this work for category bit 1. `bpSent` transitions are preserved numerically rather than interpreted as a generic pending-register flag.

TMEM configuration emits one of two fixed sixteen-word sequences: selector 1 chooses the alternate sequence, and every other value chooses the default. It does not update software descriptor shadows.

### Disposition summary
Retained 95 supported facts and 22 supported links. Two facts receive supported corrections. Twelve section-target facts and five section-target links remain unresolved: source declarations and literal usage do not establish compiled .data/.sdata/.sdata2 membership, padding or layout. Parameter subjects have no frozen facts; their useful semantics are already represented by function-level knowledge.

Status: synthesized; independent review and live promotion pending.
