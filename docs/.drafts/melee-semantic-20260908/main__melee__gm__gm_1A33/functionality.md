## CameraVs snapshot-storage prompt

This unit defines a three-text interface builder and entry, frame, and no-op exit callbacks. Its authored state consists of a static CameraVsData object and twelve floating-point layout parameters. The header declares the four functions; rendered names were reviewed as hypotheses, not independent evidence.

### Construction
`gmCamera_801A33BC` refreshes snapshot records, constructs slot texts for indices 0 and 1, and builds the shared bottom text. Slot positions are (168,160) and (168,192); bottom-text position is (0,256), with font scales (0.7,0.7). Bottom alignment, kerning, and fitting are set to 1. Aggregate values 0 and 1 format the returned capacity into field 0x11 and append 0x12; value 2 selects 0x13; every other value selects 0x14. These are numeric classifications, not interchangeable with the scene-result codes below. The builder itself does not dispose of previously retained text.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A33.c#L14-L60

The canonical helper implementations establish snapshot-backed slot records and VS-camera SisLib initialization. Slot construction also updates classifications consumed by the aggregate helper. The aggregate classification is MIN of the two slot classifications; reported capacity is MAX of eligible capacities, rather than necessarily the capacity of the preferred slot. Raw slot statuses 15, 9, 12, and the default path receive separate handling before aggregation. Exact localized message wording was not established.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L92-L216

### Lifecycle and input priority
Entry converts its argument to a writable u32 pointer, retains it, initializes shared resources, nulls three text references, and builds the initial display. It does not initialize the pointed-to result. The caller must keep that destination valid through subsequent frame processing.

The frame callback prioritizes: snapshot-channel change; menu exit; Start/A confirmation; B cancellation. Channel 1 is queried only when channel 0 reports zero. A change removes and nulls every non-null retained text before rebuilding, suppressing decision handling for that frame. Otherwise menu exit writes 2, Start/A writes 0, and B writes 1. Confirmation precedes cancellation. The controller-trigger accessor is called again for the B test if confirmation fails. Each terminal branch requests scene completion; unmatched input makes no local result/text mutation.

Exit is empty and does not clear the result pointer or destroy retained text. This does not establish that broader scene teardown is unnecessary. Entry and construction do not contain allocation-failure recovery or result-pointer validation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A33.c#L62-L113

The completion helper writes the shared loop-control field to 1; the surrounding scene loop consumes that field. Completion is therefore a request, not immediate teardown performed by this callback.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L170-L173 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L264-L378

### Evidence boundaries
Source-level state and layout descriptions are retained without asserting compiled section extent or placement. Four .sdata2 facts and two associated links remain unresolved because inline literals do not prove compiled pool contents. The stack-padding comment is not independent compiled evidence. Historical parameter identities remain separate and unchanged.

Status: synthesized; independent review and live promotion pending.
