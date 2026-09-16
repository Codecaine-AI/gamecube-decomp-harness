# DevCom functionality review

Draft at c302741689bd67c361cd7faadb221df3193992c3. No shared-KB mutation, source edit or build. Independent review remains pending.

## Requests, lanes and handles

Request submission takes a DVD entry number, source/offset, destination, byte count, transfer type, lane, client callback and opaque argument. It reuses a descriptor or obtains a block of 16 through HSD_AudioMalloc, whose allocator asserts nonnull. It checks 32-byte alignment, nonzero size and the 0x4000-byte relay-delivery limit. Source and destination themselves may be zero. Type is stored as u16.

DVD source-class bits retain caller priority without bounds validation; other classes force lane 3. Four head/tail pairs implement FIFO insertion. A signed counter explicitly initialized to 4 supplies handle base plus lane and advances by four, without a wrap guard. Handle low bits select a lane only under valid input assumptions. Request insertion and handle assignment run under interrupt exclusion; newly nonempty lanes wake both dispatchers.

IsBusy reads only an unchecked lane head. Reset code waits on lane 1, but this query is not a device completion barrier: a final DVD-to-ARAM descriptor is detached before its ARQ transfer completes.

## Transfer dispatch

| Type | Data path | Chunk behavior |
|---|---|---|
| 3 | Zero-filled relay to ARAM | Up to 0x4000 bytes per dispatch |
| 0xB | Main memory to ARAM | Whole request |
| 0x19 | ARAM to main memory | Whole request |
| 0x1A | ARAM to borrowed relay buffer | Request limited to 0x4000 by destination class |
| 0x1B | ARAM to relay, then relay to ARAM | Up to 0x4000; direction 1 followed by direction 0 |
| 0x21 | DVD to main memory | Up to 0x80000 bytes per read |
| 0x22 | DVD to borrowed relay buffer | Up to 0x4000 |
| 0x23 | DVD to relay, then relay to ARAM | Up to 0x4000; final ARQ completion retained separately |

ARAM dispatch uses lane 3, reserves a relay even for direct modes and sets its activity latch after posting supported work. For 0x1B the two high-priority ARQ requests preserve FIFO stage order. The previous claim of an ARAM-to-main-memory final destination was wrong. Unsupported types can retain a relay slot without posting or setting the active latch.

DVD scans lanes 0, 1 and 2 in order. If an earlier relay request has no free buffer, scanning continues and a later direct request can start. DVDFastOpen's return is ignored. There is no complete supported-type or priority validation in this TU.

## Completion, cancellation and failure

ARAM terminal callbacks optionally expose the relay for type 0x1A, then unlink/recycle and call the standard release helper. Intermediate ARAM callbacks release the slot and clear aramstate without retiring the descriptor. DVD relay release leaves aramstate unchanged and wakes DVD before ARAM. Direct DVD completion wakes only DVD.

For final DVD-to-ARAM completion, the DVD callback stores the descriptor in a per-relay pending slot, posts ARQ, unlinks it and resumes DVD. The later ARQ callback first releases the relay and wakes workers, then conditionally calls the client, recycles the retained descriptor and clears the slot. Borrowed relay buffers must be consumed within the client callback; ownership is released afterward for direct relay delivery.

Only DVD result -1 sets the global error latch, and the complete owned source has no latch reset. The latch suppresses ordinary DVD client notification but does not stop later chunk progression or DVD-to-ARAM posting. No general successful-result or short-read verification exists here.

Cancellation searches by handle. Queued heads get a cancellation flag. Non-heads are optionally called and unlinked immediately, without recycling. Dispatch also unlinks cancelled heads without recycling. Detached final slots receive a flag and unconditional callback/args replacement; queued replacements alone obey flag bits 0 and 1. Cancellation never aborts hardware, never wakes dispatch directly and always returns zero, even for an unknown handle.

Most cleanup paths read shared active pointers after client callbacks; their continuation assumes normal return and compatible reentry. Interrupt exclusion does not by itself establish a safe arbitrary callback-mutation contract. Unlink requires actual queue membership: an empty lane can dereference NULL before the not-found assertion.

## Sections, naming and scope

Existing object symbols corroborate the large BSS workspace, small control state and diagnostic pool. `.sdata` includes the initialized request counter plus short assertion literals "0" and "dc". `.data` holds devcom.c and longer assertion conditions. The old nextDevComReq section alias describes only one member and is proposed for clearing. Canonical function names remain unchanged. Artifact sizes differ only in the recorded trailing section padding for these data observations; no whole-object parity or fresh-build claim is made.

Three owned files are fully read in canonical and rendered forms: C1–491, public H1–18 and static H1–45. The rendering reported zero substitutions and parse errors; local cb/callback shadowed bindings and inline helpers without writable target identities are explicitly recorded. Foreign dependencies are not claimed as owned coverage.

All 39 subjects and 82 old facts are accounted for. The proposal retains 52 facts, supersedes 29, rejects one section alias and adds 22 parameter roles. The baseline has 18 outgoing link records; all are independently retained with canonical evidence. Two StdCallback records express the same relationship with different baseline evidence; neither is deleted.

## Review artifacts

See [proposal.json](proposal.json), [fact-dispositions.json](fact-dispositions.json), [link-dispositions.json](link-dispositions.json), [subjects.json](subjects.json), [naming.md](naming.md), [compiled-artifacts.json](compiled-artifacts.json) and [family-followups.json](family-followups.json).

Pinned canonical evidence: [types/workspace](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/devcom.static.h#L9-L42), [ARAM](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/devcom.c#L105-L199), [DVD](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/devcom.c#L201-L366), [submission/cancellation](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/devcom.c#L368-L490).

Immutable pages, each containing canonical and rendered content:

- [src__sysdolphin__baselib__devcom.c.361-491.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__devcom/pages/src__sysdolphin__baselib__devcom.c.361-491.json)
- [src__sysdolphin__baselib__devcom.h.1-18.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__devcom/pages/src__sysdolphin__baselib__devcom.h.1-18.json)
- [src__sysdolphin__baselib__devcom.c.1-180.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__devcom/pages/src__sysdolphin__baselib__devcom.c.1-180.json)
- [src__sysdolphin__baselib__devcom.c.181-360.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__devcom/pages/src__sysdolphin__baselib__devcom.c.181-360.json)
- [src__sysdolphin__baselib__devcom.static.h.1-45.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__devcom/pages/src__sysdolphin__baselib__devcom.static.h.1-45.json)
