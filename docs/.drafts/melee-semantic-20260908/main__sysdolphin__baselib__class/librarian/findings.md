# HSD class runtime

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and separate rendered C516/H96 fully read. UTC 2026-09-08T15:33:32.962655+00:00 to 2026-09-08T15:38:48.452561+00:00.

## Entry points

### ClassInfoInit
Ensures an HSD class descriptor has been initialized before use by lazily invoking the descriptor's registered initialization routine when its initialized flag is not set.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L22-L27

### hsdInitClassInfo
Constructs the common runtime metadata for an HSD class descriptor and, for derived classes, establishes inheritance from an initialized parent and registers the new descriptor in the parent's class hierarchy.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L32-L58

### OSReport_PrintSpaces
Emits an indentation prefix for HSD class-statistics reports by sending one space to `OSReport` for each requested indentation level.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L60-L67

### GetMemoryEntry
Looks up the allocator metadata for a requested size-class index, lazily creating both the global index table and the individual HSD_MemoryEntry when absent so the class allocator can manage objects of that size.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L79-L163

### hsdAllocMemPiece
Allocates one block from the HSD class runtime's 32-byte-granularity size-class pool. It preferentially reuses a block from the requested class, otherwise splits a free block from a larger class, and finally obtains a new backing slab from the HSD heap when no reusable block exists.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L165-L232

### hsdFreeMemPiece
Returns a fixed-size allocation to the HSD size-class allocator for reuse. Rather than releasing the storage to the system heap, it places the memory piece on the free list associated with its 32-byte-rounded size class.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L234-L245

### _hsdClassAlloc
Serves as the root HSD class runtime's default allocation callback: it obtains storage sized for the requested class and records successful allocations in that class descriptor's live-instance and peak-instance statistics.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L248-L258

### _hsdClassInit
Provides the default initialization callback for the root HSD_Class type. It deliberately performs no object-specific initialization and reports success, allowing a newly allocated base-class instance to pass hsdNew's initialization stage.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L260-L263

### _hsdClassRelease
Provides the default release callback for the root HSD_Class type. The base class has no object-specific resources to release, so the callback deliberately does nothing while supplying the root class descriptor with a valid release-stage method distinct from the subsequent storage-destroying callback.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L265-L265

### _hsdClassDestroy
Implements the HSD class runtime's default object-destruction callback: it removes one instance from the owning class's live-object count and returns the object's storage to the size-class memory pool for reuse.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L267-L272

### _hsdClassAmnesia
Forgets the runtime bookkeeping associated with an HSD class descriptor during class-library invalidation: it clears that class's live and peak object counts, and when applied to the root `hsdClass` descriptor it also discards the class allocator table and current class-name hash references.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L274-L283

### _hsdClassInfoInit
Bootstraps the root HSD runtime class descriptor and installs the default allocation, initialization, release, destruction, and library-amnesia operations inherited or overridden by HSD object classes.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L285-L294

### hsdNew
Constructs an instance of an HSD runtime class from its `HSD_ClassInfo` descriptor: it ensures the class metadata is initialized, allocates and zero-initializes the class-sized object, associates the object with its class descriptor, and runs the class's constructor callback with cleanup on failure.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L296-L316

### hsdChangeClass
Rebinds an already allocated HSD object to a storage-compatible class descriptor so later class-based dispatch can use the replacement class's methods without reallocating the object or invoking its initialization, release, or destruction callbacks.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L329-L371

### hsdIsDescendantOf
Tests whether one HSD runtime class is the same class as, or derives from, a specified ancestor class, enabling subsystems to validate that configurable class descriptors belong to the required object-family hierarchy.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L373-L401

### hsdObjIsDescendantOf
Performs a runtime class-membership test for an HSD object, returning whether the object's concrete class is the requested class or derives from it through the HSD class hierarchy.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L403-L421

### ForgetClassLibraryReal
Recursively invalidates a supplied class subtree in child-before-parent order, invoking amnesia and clearing each descriptor child/parent links and initialized bit. Child sibling links are severed before recursion. The starting descriptor next link and its incoming parent child-list reference are not removed by this helper itself; the selecting caller handles matching top-level list removal.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L428-L442

### hsdForgetClassLibrary
Deinitializes the HSD class descriptors belonging to a selected class library. It can invalidate the entire base class hierarchy or remove matching top-level library subtrees, allowing each affected class to run its amnesia callback and return to an uninitialized state.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L444-L472

### hsdSearchClassInfo
Looks up an HSD class descriptor by its class-name string in the currently installed class hash, returning the registered HSD_ClassInfo or NULL when the hash is unavailable or the name is not registered. Descriptor loaders use this result to instantiate a named subclass instead of their base object class.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L474-L481

### hsdDumpClassStat
Emits a diagnostic snapshot of one HSD class descriptor or an entire initialized class hierarchy, reporting each class's name, descriptor and object sizes, current live-instance count, and peak live-instance count with indentation that reflects inheritance depth.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L490-L515

## Initialization and lifecycle

The header has signed 16-bit descriptor/object sizes, u32 flags and live/peak counters, five lifecycle methods and intrusive free-list metadata. ClassInfoInit only checks bit 0 and calls the initializer; it does not set the bit or guard null. Direct hsdInitClassInfo assigns flags=1, narrows sizes before assertions, resets children/counters, inherits the method region and prepends to the parent list. Repeated direct initialization is not idempotent. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.h#L14-L51; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L22-L58.

hsdNew initializes the descriptor before allocation and checks it again after allocation; it zeroes obj_size bytes and assigns class_info before init. A negative init result calls destroy without release. Default alloc returns raw storage and updates live/peak on success. Default init returns zero and release is empty. Destroy decrements live and recycles storage without release. Amnesia resets counts and root allocator/hash references without freeing allocations. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L248-L316.

Class rebinding compares object sizes then normalizes both ancestor chains through equal-size parents. Success decrements the normalized old ancestor, increments the requested destination, updates destination peak and changes class_info; same-class requests can still affect ancestor accounting. No object lifecycle callback runs. Class ancestry initializes both descriptors, object ancestry initializes only the requested descriptor, and dump skips uninitialized nodes and descendants. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L329-L421; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L500-L515.

## Allocation and registry boundaries

Allocation rounds to 32-byte classes, tries exact free storage, splits a larger piece, then allocates a table-capacity-sized slab. nb_alloc measures assigned piece inventory and nb_free reusable inventory. No coalescing, zeroing or size/overflow validation is present. Metadata table growth is published before later metadata creation and is not rolled back. Local NULL checks do not imply recoverable exhaustion because positive-size HSD_MemAlloc failure asserts. Free overwrites the leading next pointer, increments nb_free, and has no size/ownership/double-free validation or null metadata guard. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L79-L245; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/memory.c#L14-L26.

Forgetting selects the root or matching immediate root children only. Selected descendants are processed child-first regardless of their own library names. The helper preserves the selected root next link so its caller can unlink it. The static current_hash has only null assignments in the complete TU; lookup branches and descriptor-loader fallback are implemented, but installed-registry availability is not established. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L14-L16; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L428-L481; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1322-L1340; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mobj.c#L167-L189.

## Source-only inventory

- `HSD_GetClassInfo`: Returns the class_info field; no null guard. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L318-L321
- `HSD_PushClassInfo`: Identity function returning its input; no stack. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L323-L327
- `hsdChangeClass_inline`: Typed implementation; same-size ancestor identity gates rebinding. Decrements the normalized old ancestor count, not necessarily the original concrete descriptor; increments requested destination. Old class pointer is not asserted by the discarded logical expression. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L329-L366
- `class_set_flags`: Computes (flags & ~reset) | set; overlapping set bits win. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L423-L426
- `ForgetClassLibraryChild`: Scans only immediate children, recursively forgets matching subtrees and unlinks those roots; no search through nonmatching descendants. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L444-L456
- `DumpClassStat`: Prints two indented lines from class name, signed sizes and live/peak counts. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L490-L498
- `hsdDelete`: Null guard; release first, then rereads class_info to select destroy, so release may change subsequent dispatch. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.h#L85-L93

## Coverage and limitations

{"functions": 20, "sections": 3, "file_entities": 1, "parameters": 30, "existing_facts": 97, "proposed_facts": 8, "dispositions": {"unresolved": 11, "retain": 78, "supersede": 8}, "existing_links": 2, "link_dispositions": {"retain": 2}}

All 30 empty parameter subjects reviewed against the complete signatures. Canonical identifiers retained; no inferred-name substitutions occurred. Renderer class_set_flags/reset identity and pointer-return parser issues are recorded in coverage.json. The two exact outgoing diagnostic links are retained with complete baseline records and digests. All eleven section facts remain unresolved without compiled proof; the info_hash guard is literally MUST_MATCH. No source/shared KB writes, matching, Git, UI or publication.
