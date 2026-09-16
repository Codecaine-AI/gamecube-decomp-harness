## Stage services

`stage.c` provides shared access to the active stage's camera configuration, blast boundaries, position markers, music selection, and stage lifecycle. `stage.h` declares these services and supplies inline blast-boundary predicates.

### Camera and boundary queries
Camera and blast edges are translated by the corresponding stage camera X/Y offset. The header uses strict comparisons, so equality with an edge is not outside; a positive margin contracts the accepted rectangle. Camera boundaries and blast boundaries remain distinct.

The angle getters convert configured degrees to radians. The two lower-Y calculations return the midpoint between adjusted camera/blast bottoms and the point one quarter of the way from camera bottom toward blast bottom. The offset-vector helper writes `(cam_x_offset, cam_y_offset, 0)`.

Canonical camera consumers independently support the rendered horizontal-angle-scale and vertical-pan-factor names. They also reveal two corrections: `Stage_GetCamPanAngleRadians` supplies a base vertical angle in standard framing, and `Stage_GetCamZoomRate` supplies a minimum camera distance rather than a temporal rate. Tracking smoothing feeds separate interest and position interpolation calculations. Fixed zoom scales facing-dependent fighter camera-box extents.

Fixed-camera services return configured position/FOV and derive an interest point on z=0 by rotating a forward vector and scaling it to cancel camera Z. The projection has no zero-denominator guard. Camera code smooths toward these targets and can apply quakes; fixed-camera configuration does not imply an instantaneous, completely motionless view.

### Position resolution
`Stage_80224DC8` is a pure whitelist of StKind values 0x3B, 0x3F, 0x42, 0x49 and 0x4C. It does not inspect the current game mode. Match initialization uses it when selecting positive facing for traversal-stage contexts.

`Stage_80224E38` adds four to a revival-anchor selector and delegates to Ground. Rebirth code combines the result with player-specific and facing-dependent offsets.

`Stage_80224E64` asserts on -1. Selector 4 probes vertical segments at x=0, first progressing upward from y=-10 toward 100 and then downward toward -100, returning the first hit or zero. Other selectors delegate directly and discard the resolver's success result.

`Stage_80224FDC` tries randomized marker IDs with shrinking bounds, then a shrinking fallback range initially covering 0..3. This is not sampling without replacement or an exhaustive marker enumeration. Ground has additional marker fallback behavior, including 0x7F resolving through 0x94 with a +50 Y adjustment or marker 0. The item consumer separately sets Z to zero and collision-validates the candidate before creation.

### Music and lifecycle
Music setup maps the caller selector and two ordered mode predicates to resolver masks, resolves the selected StKind's BGM, submits it to audio, stores the track and alternate result, and returns the original selector. Only the ordinary branch restricts selectors to 0..3. Ground's existing-alternate flag b0 and final stored result b1 are distinct.

The StKind-indexed map selects shared GrKind implementations. Selection starts at Izumi with a null cached entry. `Stage_802251E8` establishes both selection fields and performs initial Ground data setup; `Stage_8022524C` performs later runtime initialization. Their colliding `Stage_Init` hypotheses should be distinguished by naming the former `Stage_SelectAndLoadData`.

Later load/start/demo wrappers require a valid cached entry. Start and demo combine cached GrKind with caller-supplied StKind rather than remapping that argument. Their StageIdPair objects are stack-local; the inspected immediate Ground dispatchers consume them synchronously. Ground startup invokes on_start, executes and frees deferred callback nodes, clears their queue, and creates common stage processing. Optional resource guards and the Heal-specific initial loading branch remain significant.

All owned canonical/rendered pages, all 65 subjects, all 212 facts and all 46 links were reviewed. Supported knowledge is explicitly retained in checkpoint groups. Compiled section membership and layout remain unresolved rather than inferred from source literals or declarations.

Status: synthesized; independent review and live promotion pending.
