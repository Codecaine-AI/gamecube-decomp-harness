# HSD class runtime semantic review

## Scope and outcome
Inherited full canonical/rendered research coverage comprises both owned files, 54 subjects, 97 baseline facts and two links. Independent lead inspection restored every proposed citation and all upstream contradiction evidence. Preserve **77 retained facts, nine superseded facts, eleven unresolved section-attribution facts and both retained diagnostic links**. Existing names fit; no cosmetic renaming is proposed. Renderer parse uncertainty around class_set_flags/reset and header shadowed bindings are not independent identity evidence.

This repair changes only the two rejected proposal citations from class.c#L1-L516 to class.c#L1-L515. The reader displays a trailing empty line 516; canonical apply accepts through the final closing brace at line 515. No supported semantics or baseline accounting are removed.

## Initialization and inheritance
ClassInfoInit checks bit 0 before invoking info_init. Direct hsdInitClassInfo is unguarded: it assigns flags = 1, stores borrowed name pointers, narrows sizes to s16, and resets links and counters before parent handling. Parent initialization precedes stored-size assertions and copying parent_info->head.info_size - sizeof(HSD_ClassInfoHead) bytes beginning at alloc. Repeated direct initialization can discard descendants or self-link siblings. The source does not prove a numeric compiled header size. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L22-L58; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.h#L18-L39.

## Allocation and failure boundaries
GetMemoryEntry starts at 32 slots, doubles capacity and inserts metadata in ascending size order. Replacement publication precedes recycling and missing metadata allocation, so growth is not transactional. Allocation tries exact reuse, larger-piece splitting, then nb_memory_list * 32 backing bytes with tail recycling. nb_alloc counts assigned pieces, not cumulative calls. Freeing does not coalesce or return backing storage to the heap and assumes metadata lookup succeeds.

There is no comprehensive overflow validation. The indirect idx >= 0 assertion rejects zero/negative sizes when rounding arithmetic is defined. Positive-size HSD_MemAlloc failure invokes a nonreturning assertion; local NULL branches do not establish recoverable ordinary heap exhaustion. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L79-L245; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/memory.c#L14-L26; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.h#L11-L32.

## Lifecycle and conversion
Root callbacks implement allocation/live-peak accounting, successful no-op init, no-op release, destruction/recycling and amnesia. hsdNew zeroes storage and installs the descriptor before init; negative init invokes destroy without release. Header deletion invokes release and then rereads method selection for destroy. Conversion initializes the destination before compatibility checks, requires equal sizes and a shared equal-size ancestor, and preserves storage without lifecycle callbacks. Its decrement targets the walked old family root, not necessarily the original descriptor; intent remains uncertain. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L248-L371; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.h#L85-L93.

## Queries, forgetting and lifetimes
Ancestry includes the starting class and rejects null inputs. Descriptor ancestry initializes both operands; object ancestry initializes only the requested descriptor. Statistics prune uninitialized subtrees. Forgetting processes children before parent amnesia, clears hierarchy fields and bit 0, and leaves the starting incoming reference and next link for the selecting caller to splice. Root amnesia drops allocator/hash references without freeing backing allocations or destroying live objects. Complete class.c contains no non-NULL current_hash assignment; conditional search alone does not establish an operational registry. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L1-L515; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hash.c#L35-L50.

## Evidence limits
All eleven section-bound facts remain deferred: declarations do not prove .data/.sbss/.sdata placement, packed extent, padding or ABI layout. The unused info_hash string is guarded by MUST_MATCH, not the stale non-BUGFIX condition. Supported source roles remain retained. No compiled-layout, registry-producer or broader reclamation mechanism is inferred.

Status: synthesized; independent review and live promotion pending.
