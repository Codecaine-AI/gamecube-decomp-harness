## Internal GX interface
This header defines FIFO-writing and debug-verification macros, private FIFO/GX/verification state structures, warning identifiers, and declarations shared across GX implementation files. There are no owned baseline subjects, facts, or links to revise, and the rendered view introduces no proposed-name substitutions.

### Command and verification behavior
The typed write macros assign to GXWGFifo members. GX_WRITE_XF_REG emits command 0x10, address 0x1000 + addr, and a value; GX_WRITE_RAS_REG emits 0x61 and a value. The _2 and _F XF variants emit payload only, not command/address headers. DEBUG variants also update verification shadows; some arguments are evaluated more than once, so these are not single-evaluation function equivalents. XF register shadow updates accept indices 0 through 0x4F; raster shadow selection uses the value's high byte. Non-DEBUG definitions disable the three register-verification macros, but this header supplies no non-DEBUG VERIF_MTXLIGHT definition. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/__gx.h#L8-L105.

GX_WRITE_SOME_REG2 and GX_WRITE_SOME_REG3 emit two bytes and one word regardless of index validity, then update indexBase or indexStride only for indices 0–3. GX_WRITE_SOME_REG4 emits the same typed sequence and evaluates addr without a corresponding cache update. Register-field helpers extract fields or assert value range before replacement; CHECK_GXBEGIN expresses the begin/end restriction through an assertion. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/__gx.h#L107-L151.

### Shared state and warnings
Private declarations cover FIFO pointers/watermarks/binding flags, cached GX registers, texture regions and callbacks, projection/viewport parameters, performance selections, display-list flags, and dirty state. These declarations do not establish allocation, initialization order, callback ownership, or cross-file reset lifetimes. Stated sizes and offsets are source comments, not verified compiled layout. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/__gx.h#L153-L319.

GXWarnID explicitly assigns warning IDs 0–112 and GXWARN_MAX = 113. Warning macros call the verification callback directly with severe or supplied severity; formatted variants use sprintf into the shared __gxvDummyStr[256] buffer. The macros themselves provide no null-callback check, bounds check, or verifyLevel filtering. The verification structure declares register/matrix/light shadows and dirty arrays. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/__gx.h#L323-L482.

Status: synthesized; independent review and live promotion pending.
