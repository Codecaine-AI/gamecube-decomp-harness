# Two Linkage Candidates

## Proposed Fishoid Fix

Move the existing empty `TFishoidManager` destructor body from `src/Animal/fishoid.cpp` into its class definition in `include/Animal/fishoid.hpp`.
The patch is `round2-simple-linkage.patch` and changes only these two files.
No working source was edited and no compiler or Ninja command was run by this audit.

Evidence:

- The unchanged strict log reports only `__dt__15TFishoidManagerFv` binding, map weak versus object global.
- `mario.MAP:25547` explicitly says `(func,weak)` for this exact symbol in `Animal.a fishoid.cpp`.
- `mario.MAP:72553` gives linked address `80364ac8` and size `0x64`.
- Native `powerpc-eabi-nm -S` reports `00000008 00000064 T __dt__15TFishoidManagerFv` in the compiled fishoid object.
- `decomp-diff.py -u mario/Animal/fishoid -d '~TFishoidManager' --no-collapse` confirms the current body is 100.0% matching, 100 bytes, 25 instructions.

This is a genuine source linkage defect supported independently by closure binding and object binding.
An empty inline virtual destructor is ordinary source structure, and the body is unchanged.
Confidence in the structure is high; emitted ordering and consumers still need parent compilation and regression checks.

Source/header reference search finds three source consumers of the changed header:
`src/Animal/fishoid.cpp`, `src/System/MarNameRefGen_Enemy.cpp`, and `src/Animal/Butterfly.cpp` through `include/Animal/Butterfly.hpp`.
`MarNameRefGen_Enemy.cpp:92` constructs a `TFishoidManager`.
There are no other named destructor definitions or explicit calls in source.

Required acceptance checks are a full consumer rebuild, strict validation for fishoid, and `ninja changes_all` versus the preserved baseline.
The four pre-existing fishoid UNUSED-size warnings describe stubbed methods and are outside this linkage patch.
Do not claim those methods are implemented merely because strict validation passes.

## CameraNormal Is Uncertain

The unchanged strict log reports only `calcTowerCenterPos___15CPolarSubCameraFP3Vec` binding, map weak versus object global.
`mario.MAP:33543` explicitly says `(func,weak)` and line 33544 gives its function-local name table `(object,weak)`.
The text layout at line 72393 records a `0x128`-byte helper at `80359d98`.
The table at line 87154 occupies `0x14` bytes, five pointers.

The current object instead has a global `0x10c`-byte helper and local `0x18`-byte table `sPositionNameTable$737`.
Source declares six slots but provides five names, leaving one unused zero slot.
This supports an original five-entry inline-local table, but table size is separate from the strict linkage defect.

The existing source TODO explicitly records that declaring the helper inline causes unwanted caller inlining.
The original caller contains a real branch-and-link to this helper at caller offset `0x128`, and the current caller does too.
The current helper matches 83.9%, and the current caller matches 98.1%.
The original helper has a 0x20-byte stack frame; current helper has 0x18.
The original loads the weak table address in each switch branch, while current code hoists a TU-local data-base address before the switch.
The weak versus local data emission plausibly explains part of the instruction difference, but does not establish how to preserve the original call boundary.

The only named call and definition are in CameraNormal; its declaration is in `include/Camera/Camera.hpp:215`.
Moving its body into that widely included header would also require position-holder declarations and change many consumers.
No Camera patch is proposed because a linkage-only inline edit lacks demonstrated caller safety.
No pragmas, wrappers, artificial statements, or validator exemptions were added.

Next useful experiment is an isolated parent-controlled build of the ordinary in-class definition with its original five-entry table, checking helper emission and the caller call boundary before considering acceptance.
If the compiler still inlines it, the unresolved question is which original body or inline context kept this weak function out of the caller.

## Saved Raw Diffs

`round2-simple-linkage-fishoid-destructor.diff.txt` contains all destructor instructions.
`round2-simple-linkage-camera-helper.diff.txt` contains all helper instructions.
`round2-simple-linkage-camera-caller.diff.txt` contains all caller instructions.
