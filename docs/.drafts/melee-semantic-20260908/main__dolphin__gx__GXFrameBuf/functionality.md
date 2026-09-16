## GX framebuffer-copy subsystem

The canonical file defines NTSC, MPAL and PAL render-mode presets plus GXRmHW, adjusts render-mode geometry for overscan, configures display and texture copies, submits copy commands, and resets/reads the pixel bounding box. All 829 canonical and rendered lines were reviewed through restored evidence. Rendered function names are unchanged, with zero substitutions or parse errors; the existing SDK names remain appropriate.

Source rectangles, destination strides, clamp flags, gamma and frame-to-field options are stored in persistent GX copy shadows. GXCopyDisp and GXCopyTex later emit the corresponding shadows. Clear values and filter tables instead produce immediate register commands. GXSetCopyFilter independently selects caller tables or complete fallback configurations and always emits six words.

GXSetDispCopyDst ignores its height argument and derives stride through a u16 intermediate. GXSetDispCopyYScale writes a nine-bit reciprocal scale, updates the deferred enable bit, and returns the configured source height multiplied by the effective scale. HSD forwards that result as destination height, but the destination setter does not consume it. The scale routine has no upper-bound or zero-reciprocal protection; its ordinary finite-scale explanation must not imply defined results for every input satisfying the lower-bound assertion.

Both copy routines encode the destination by masking with 0x3FFFFFFF, shifting by five, then inserting a 21-bit field. They submit commands rather than wait for GPU completion. Clear-enabled copies temporarily enable always-pass depth comparison and disable blending and logic operations—not color and alpha updates. They restore cached pixel-engine state afterward. Texture copying additionally consults cpTexZ and may temporarily select numeric pixel-format code 3 before applying the bit-6 override. The shared DEBUG verifier reads display-copy geometry even when invoked by GXCopyTex; its checks must not be silently described as texture-shadow validation.

HSD presentation uses full-screen, upper-half, lower-half and discarded-overlap display copies, with distinct clamp selections and synchronization. Texture capture is used by image descriptors and fighter-shadow rendering; shadow setup and later capture span separate calls, and synchronization/cache invalidation remain caller operations.

The ledger explicitly retains 66 supported facts, marks eight section-attributed facts unresolved, and supersedes two incorrect state explanations. All 17 links are retained individually through explicit groups. Source declarations and arithmetic do not prove compiled .data membership or .sdata2 layout.

Status: synthesized; independent review and live promotion pending.
