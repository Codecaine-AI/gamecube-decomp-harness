## Effect spawn front end
`efSync_Spawn` is a heterogeneous variadic factory returning a nullable generator, effect, or linked-effect head. Its existing name fits canonical behavior; no rename is warranted.

### Routing and state
Each call resets `ret_obj`, `efLib_AnimCount`, and `efLib_LoadKind` to zero. Before range dispatch, ID `0x479` becomes `0x506` when `efAsync_DatEntries[1].data` is null. The actual branch tests send signed IDs below `0x250` to direct generator creation, including negative values; IDs 30000–30999 also take that path. Remaining IDs below `0x478` delegate to `efAsync_Dispatch`; remaining IDs below `0x4BA` delegate to `efAlt_Spawn`. Thus the alternate interval is `0x478–0x4B9`, contrary to the unchanged source/rendered comment. Other IDs enter the local switch after `EF_LOADKIND_SYNC` is assigned. There is no case for `0x4BA`; unmatched local IDs leave the result null.

### Recipe behavior and exceptional paths
Local cases decode ID-specific pointer arguments, create generators or attached effects, and configure transforms, callbacks, attachment joints, parameters, lifetimes and links. Scalar payloads are often `f32*`, not promoted variadic scalar values. Many trailing arguments are consumed only after successful creation.

The `0x4CF/0x4D0` burst builds at most twelve effects, assigns lifetime 50 and randomized motion parameters, and stops on the first allocation failure while preserving any partial chain. `0x4DA` installs its callback only when the second linked effect succeeds. `0x4D3` conditionally creates a second generator without returning its pointer; `0x4BF` and `0x507` make additional generator calls independently of primary allocation success. These paths mean a null primary result does not universally prove that no side effect occurred.

Case `0x4E1` stores an attachment pointer and scales the copied parameter's Y component by the root joint's Y scale. Case `0x501` initially constructs using fighter joint 1, then stores joint 85, installs `efLib_Cb_LifetimeEndSpawn`, and sets lifetime 6. These are persistent cross-file callback inputs, not proof here of cleanup timing or ownership. Cases `0x4F4/0x4F5` explicitly assert on a missing destination JObj before copying scale.

The local epilogue decrements the animation count before each animation call, processing descending queue indices, then calls `va_end` and returns the primary result. Direct/delegated routes bypass this epilogue. No restoration of the previous global loading state is performed here.

### Evidence quality
Both owned files were read completely in canonical and rendered form. The C renderer reports 122 parse errors and zero substitutions; the header reports zero parse errors and zero substitutions, with a shadowed-binding annotation. Rendered names are not independent proof. Existing functional descriptions are retained where supported. Section-specific claims are explicitly deferred: the C switch and source literals do not establish jump-table representation, section placement, byte counts, alignment or padding.

Status: synthesized; independent review and live promotion pending.
