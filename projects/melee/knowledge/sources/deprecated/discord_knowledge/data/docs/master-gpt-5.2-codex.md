# Discord Knowledge Master

This document reorganizes the monthly Discord knowledge captures by topic.
Source files live in docs/discord-knowledge/*.md.

## Monthly Overviews

### 2020-07 (source: 2020-07.md)

This document captures foundational knowledge from the first month of the Melee decompilation project. July 2020 marks the project's inception with critical discoveries about compiler behavior, project setup, and early matching strategies.

### 2020-08 (source: 2020-08.md)

Early project days - second month of activity with 1,650 messages. Major focus on build infrastructure, shiftability, and early decompilation work.

### 2020-09-to-12 (source: 2020-09-to-12.md)

This document distills technical knowledge from the #smash-bros-melee channel during the early months of the project (177 messages total across Sept-Dec 2020). This was a quiet period with foundational discussions about project setup, compiler issues, and early matching attempts.

### 2021-06-to-10 (source: 2021-06-to-10.md)

This document distills technical insights from 263 messages across the #smash-bros-melee Discord channel from June through October 2021.

### 2021-11 (source: 2021-11.md)

This month marks a significant milestone: Melee achieved full shiftability on November 19th, 2021 (coincidentally the day after the game's anniversary). The conversations cover shiftability work, compiler investigations, and early decompilation infrastructure.

### 2021-12 (source: 2021-12.md)

This was a foundational month for the Melee decompilation project with approximately 6,700 messages. The project was at its early stages (around 0.7% code progress by month end), and contributors were establishing workflows, tooling, and discovering key patterns.

### 2022-01 (source: 2022-01.md)

This document distills knowledge from the #smash-bros-melee Discord channel during January 2022.

### 2022-02 (source: 2022-02.md)

A very active month with 5,049 messages. Major milestones included reaching 2% code decompilation, fixing r40 compatibility, and extensive fighter struct work.

### 2022-04 (source: 2022-04.md)

This month saw significant progress including reaching 5% code decompilation, the completion of `fighter.c`, and major work on MasterHand. Key discoveries include the fighter special attributes union structure and critical frank.py fixes.

### 2022-05 (source: 2022-05.md)

This document distills key decompilation knowledge from Discord conversations in the #smash-bros-melee channel during May 2022.

### 2022-07 (source: 2022-07.md)

This document distills technical knowledge from the #smash-bros-melee Discord channel during July 2022. Progress during this month went from approximately 7.5% to 9.5% code matching, with significant work on fighter characters, sysdolphin libraries, and build tooling.

### 2022-09 (source: 2022-09.md)

This document distills valuable decompilation knowledge from the #smash-bros-melee Discord channel during September 2022.

### 2022-12 (source: 2022-12.md)

This document distills tribal knowledge from the #smash-bros-melee Discord channel during December 2022. This was a productive month with significant progress on understanding user_data access patterns, BSS ordering, and various compiler behaviors.

### 2023-01 (source: 2023-01.md)

Distilled from 1,632 messages in #smash-bros-melee during January 2023.

### 2023-02 (source: 2023-02.md)

Distilled from 128 messages in #smash-bros-melee during February 2023.

Note: This was a quieter month, with January and March having significantly more activity.

### 2023-07-to-12 (source: 2023-07-to-12.md)

This document distills technical knowledge from the `#smash-bros-melee` channel in the gc-wii-decomp Discord server during the second half of 2023. This period saw significant progress (from ~17% to ~18.3%) with major contributions to sysdolphin libraries (FObj, AObj, PObj, LObj, RObj, video.c) and various ground/item files.

---

### 2024-01 (source: 2024-01.md)

This document distills technical knowledge shared in the #smash-bros-melee Discord channel during January 2024. It covers compiler behavior, matching techniques, type discoveries, and tooling tips.

### 2024-02 (source: 2024-02.md)

This document distills technical insights from the #smash-bros-melee Discord channel during February 2024.

### 2024-03-to-07 (source: 2024-03-to-07.md)

This document distills decompilation knowledge from the #smash-bros-melee channel covering March through July 2024. The period saw continued progress on matching, SDK integration work, project tooling improvements, and several new contributors joining the effort.

### 2024-08-to-12 (source: 2024-08-to-12.md)

This document distills technical knowledge from the #smash-bros-melee Discord channel during August through December 2024 (~1,143 messages).

### 2025-07 (source: 2025-07.md)

This month saw significant progress with the project reaching 36% matching (up from ~26% in May). Key discussions covered GET_FIGHTER macro issues, dat_attrs getters, splitting strategies, file organization, and tooling improvements.

### 2025-08 (source: 2025-08.md)

This document distills valuable decompilation insights from the #smash-bros-melee Discord channel during August 2025.

### 2025-09-to-2026-01 (source: 2025-09-to-2026-01.md)

This document distills useful decompilation knowledge from Discord conversations in the #smash-bros-melee channel during September 2025 through January 2026.

---

## Project and Build Context

### Project Setup

#### 2020-07 (source: 2020-07.md)

##### Target Version
- **Melee 1.02 (NTSC)** is the target version (also called "1.2" or "Revision 2")
- DOL SHA1: `08e0bf20134dfcb260699671004527b2d6bb1a45`
- ISO SHA1: `d4e70c064cc714ba8400a849cf299dbd1aa326fc`
- Versions: 1.0, 1.1, 1.02/1.2, and PAL exist; 1.02 has the most community documentation

##### Compiler Version
- **MWCC (Metrowerks CodeWarrior) 1.1** is used initially
- Compiler build: `2.3.3 build 159`
- Critical discovery: **Melee likely used a pre-1.1 compiler (2.2.x)** because:
  - The 2.3 changelog notes "Function Epilogues and Prologues are now scheduled"
  - This causes epilogue/prologue ordering mismatches with 1.1
  - A postprocessor was developed to fix epilogue ordering

##### MetroTRK Version Analysis
- Melee uses **MetroTRK for Dolphin v0.8**
- CW 1.1 ships with MetroTRK v0.5
- This suggests HAL updated MetroTRK but not the compiler
- Other games with same MetroTRK version don't have Melee's epilogue ordering

### Project Context

#### 2021-01-to-04 (source: 2021-01-to-04.md)

##### HAL's Development Timeline

- Melee development: ~13 months from November 2001
- HAL used MWCC 2.2.x despite 2.3.3 being available
- Theory: HAL grabbed an early compiler (release 4, ~1998) at project start and never upgraded
- Melee may have been used to help Nintendo test GameCube HW1/HW2 hardware
- Source: revosucks, gamemasterplc (2021-02-01)

##### SysDolphin History

- Melee was likely the first game to use the "sysdolphin" library
- The library represents essentially the entirety of HAL's GC engine framework
- Source: unclepunch (2021-01-20)

### Project Structure

#### 2020-09-to-12 (source: 2020-09-to-12.md)

##### DOL Sections
- Text section 0 is the `.init` section
- Source: gibhaltmannkill (2020-12-01)

##### Symbol Naming Convention
- Preferred convention: `filename_address` or `filename_functionality` if not in an assert
- Avoid using public symbol maps (Achilles' sysdolphin symbols have errors)
- SDK functions (like `AXInitEx`) may use original names but accuracy wasn't verified
- Source: werewolf.zip (2020-11-30)

##### File Organization
- Functions are done in order and inlined
- If something isn't defined in a .c file at the top, it isn't part of that file
- Don't skip functions and leave them in .s files
- Source: werewolf.zip (2020-12-01)

### Project Organization

#### 2021-12 (source: 2021-12.md)

##### File Naming Convention
- Unsplit files: `code_[address].s`
- Split files: named by functionality (e.g., `ftNess.s`, `lbfile.s`)
- When a file is fully decompiled, the .s file is deleted
- Non-matching/inlined code stays in .c with ASM in comments
- Source: werewolf.zip (2021-12-12)

##### Code vs Data Sections
- .text: Code
- .data: Initialized global data
- .bss: Uninitialized global data
- .sdata/.sbss: Small data (accessed via r13)
- .sdata2: Small read-only data (accessed via r2)
- .rodata: Read-only data
- Source: camthesaxman (2021-12-15)

##### Shiftability
- A shiftable repo allows adding/removing code freely - linker relocates everything
- No more hardcoded pointers or freespace concerns
- Enables treating decomp like traditional source code (GitHub collaboration)
- Current shiftable repos: sunshine, pikmin 2, melee
- Source: revosucks, gamemasterplc (2021-12-26)

##### Data Shiftability Limitation
- On GameCube, data shiftability only works with fully decompiled files
- Due to section offset trick with 16-bit references
- Source: gamemasterplc, camthesaxman (2021-12-26)

#### 2022-09 (source: 2022-09.md)

##### Code Style Decisions
- Bare `return;` at end of void functions: Style preference (psi prefers explicit return)
- Float suffix: Use uppercase `F` (e.g., `1.0F`)
- Squash merge is preferred for PRs (cleaner history, decomp commits tend to be messy)
- Source: Multiple contributors (2022-09-04)

##### Branch Protection Rules
Recommended settings for master branch:
- Require pull request before merging
- Require status checks to pass
- Require branches to be up to date
- Add "build (GENERATE_MAP=1)" and "build (NON_MATCHING=1)" checks
- Require conversation resolution
- Dismiss stale PR approvals
- Source: ribbanya (2022-09-05)

##### Forward Declarations
- Modern compilers (clang-tidy) don't like implicit `struct _GObj` usage
- Proposed solution: Forward declare typedefs in a header
- Better approach: Include proper headers where needed, avoid `struct _*` usage
- Source: rtburns, werewolf.zip (2022-09-15)

### Project Infrastructure

#### 2023-07-to-12 (source: 2023-07-to-12.md)

##### Frogress Integration
- Project set up at https://github.com/decompals/frogress
- Enables progress badges and graphs
- API key stored as `PROGRESS_API_KEY` in repo secrets
- Source: encounter, ribbanya (2023-08-18)

##### Documentation Links
- **Context for decomp.me**: https://doldecomp.github.io/melee/ctx.html
- **Progress page**: https://doldecomp.github.io/melee/progress/
- **Asm dump**: https://doldecomp.github.io/melee/dump/
- **TU assignments**: https://github.com/doldecomp/melee/wiki/Translation-Units
- **All Melee scratches**: https://decomp.me/preset/63
- Source: ribbanya (2023-11-02)

##### Toolchain Evolution
- dtk (decomp-toolkit) being adopted for builds
- Will replace make with ninja for faster Windows builds
- Will eliminate need for asm files on repo (generate on-demand)
- Windows-native support without mingw/msys2
- Source: ribbanya (2023-12-19)

---

### Architecture Notes

#### 2023-06 (source: 2023-06.md)

##### Brawl vs Melee Code Relationship (various, 2023-06-01)
- Brawl was a complete C++ rewrite by Sora Ltd (not HAL)
- No source code shared between Melee and Brawl
- Dat files are basically the same format
- PM used same floats and got same engine results
- Brawl uses Havok only for clothing physics, not core collision/physics

##### HAL's Code Architecture (Revo, 2023-06-02)
HAL was inconsistent about inline/function usage for fetching objects between layers:
- `HSD_JObj* jobj1 = gobj->hsd_obj;` - direct access instead of macro in some places
- Different GObj typedefs exist but are for readability/M2C, not different types
- Inline usage changes register allocation, indicating original code may not have used inlines in all places

### Build System

#### 2021-06-to-10 (source: 2021-06-to-10.md)

##### Makefile Link Order Fix
If encountering `CWParserSetOutputFileDirectory [3]` error:
- **Problem**: Link order issue with `-o $@` flag position
- **Fix**: Change line 106 in Makefile from:
  ```makefile
  $(LD) $(LDFLAGS) -o $@ -lcf $(LDSCRIPT) $(O_FILES)
  ```
  to:
  ```makefile
  $(LD) $(LDFLAGS) -lcf $(LDSCRIPT) $(O_FILES) -o $@
  ```
- Fix originated from Twilight Princess project
- Source: wowjinxy, werewolf.zip (2021-08-14)

##### Build Environment Requirements
- Use MSYS2 (not Windows CMD) for building
- Fresh devkitpro install with `pacman -S msys/python3` and `pacman -S gcc`
- Path issues are common cause of build failures
- Source: werewolf.zip, wowjinxy (2021-08-14)

#### 2022-07 (source: 2022-07.md)

##### GitHub Actions Improvements
- Switched from Wine to wibo for CI builds
- Patched MWLD 1.1 to fix intermittent failures
- Build now reliably succeeds (100% after 8000 runs with patch)
- Map file and progress now shown as artifacts/status
- Source: altafen (2022-07-13-14)

##### Integer-to-Float Conversion Constants
- `0x43300000` + `0x00000000` used for unsigned int to float
- `0x43300000` + `0x80000000` used for signed int to float
- These appear in .sdata2 and relate to xoris conversion pattern
- Source: snuffysasa, moester_ (2022-07-11-12)

#### 2025-05 (source: 2025-05.md)

##### dtk-template Updates
- `ninja baseline` + `ninja changes` for comparing branches
- `configure.py --non-matching` for non-matching builds
- decomp.dev integration pulls `report.json` artifact automatically
- dtk 1.5.0+ no longer updates anonymous `@` symbols, reducing merge conflicts
- Source: encounter, werewolf.zip (2025-05-21)

##### CI and Progress Tracking
- GitHub bot comments on PRs with function percent changes
- `diff` step generates `report.json` artifact for decomp.dev
- Diff step disabled as requirement; runs progress update regardless of pass/fail
- Frogress deprecated; data migrating to decomp.dev
- Source: werewolf.zip (2025-05-21, 2025-05-22)

##### New Compiler for TRK
- Compiler `mwcc_233_163n` (1.1p1) now available for TRK matches
- decomp.me has this compiler available
- Source: werewolf.zip, cadmic (2025-05-21)

##### Nix Build Issues
- Magic Nix Cache service deprecated (April 2025)
- Migration to cachix required for caching
- Nix builds can be slow (~9 minutes) without proper caching
- devkitppc no longer needed with dtk
- Source: rtburns, werewolf.zip (2025-05-22)

### Build System Notes

#### 2022-02 (source: 2022-02.md)

##### Compiler Toolchain
- Main compiler: mwcc 1.2.5e (epochflame's edited version)
- Linker: mwld 1.1 (faster) or 1.2.5 (more compatible)
- Linker 1.1 has issues on Wine/MSYS2 for some users
- 1.2.5 linker is ~30-45 seconds slower
- Source: werewolf.zip (2022-02-02)

##### Object File Naming for r40
```makefile
# Use .c.o and .s.o extensions:
# example.c compiles to example.c.o
# example.s assembles to example.s.o
```
This allows calcprogress to distinguish decompiled from assembly code.
Source: camthesaxman (2022-02-21)

#### 2024-01 (source: 2024-01.md)

##### Transition to DTK

The project transitioned from make+asm to ninja+dtk in January 2024:
- No more need for asm files in repo (eventually)
- objdiff replaces asm-differ for most use cases
- Partial linking no longer needed - objdiff handles partial matches
- Files can be "unlinked" in configure.py and worked on incrementally
- Source: ribbanya, altafen (2024-01-24-27)

##### Recommended Build Commands

```sh
# Basic build
python configure.py && ninja

# Build all source files (even unlinked)
ninja all_source

# Build with diff on failure
(ninja && ninja all_source) || ninja diff
```
- Source: ribbanya, altafen (2024-01-27)

##### Compiler/Linker Versions

- Compiler: mwcc 1.2.5n for most code
- Linker: mwld 1.3.2 works (1.1 had a bug with uninitialized path data)
- The mwld 1.1 bug was fixed in 1.2.5
- Source: altafen, ribbanya (2024-01-26)

### Build Environment Issues

#### 2022-01 (source: 2022-01.md)

##### devkitPPC r40-3 Bug (Critical)

**Problem**: devkitPPC r40-3 (released January 2022) produces incorrect output on Linux and Windows.

**Symptoms**:
- DOL checksum mismatch
- Shifted addresses in map file
- class.o and other object files have wrong sizes

**Solution**: Downgrade to devkitPPC r39-2
```bash
# Linux (Arch/Manjaro)
wget "wii.leseratte10.de/devkitPro/devkitPPC/r39%20(2021-05-25)/devkitPPC-r39-2-x86_64.pkg.tar.xz"
sudo pacman -U devkitPPC-r39-2-x86_64.pkg.tar.xz

# Windows (MSYS2)
wget "wii.leseratte10.de/devkitPro/devkitPPC/r39%20(2021-05-25)/devkitPPC-r39-1-windows_x86_64.pkg.tar.xz"
pacman -U devkitPPC-r39-1-windows_x86_64.pkg.tar.xz

# ALWAYS run make clean after changing devkitPPC versions!
make clean && make
```

**Archive of old versions**: https://wii.leseratte10.de/devkitPro/
- Source: kalua, revosucks, heralayansalty, waynebird (2022-01-08, 2022-01-09)

##### PowerPC ABI Reference

The Embedded PowerPC ABI (used by mwcc eppc):
https://www.nxp.com/docs/en/application-note/PPCEABI.pdf

- LR is saved at `0x4(sp)`, not `0x8(sp)` like some other PPC ABIs
- Source: gibhaltmannkill (2022-01-17)

### Build Infrastructure Notes

#### 2020-08 (source: 2020-08.md)

##### SDK Template Adoption
- Project migrated to use official Dolphin SDK LCF template
- Template uses MEMORY/SECTIONS with GROUP for proper ordering
- Object order now controlled via Makefile rather than hardcoded in LCF
- Eliminates SDA/SDA2 hardcoding in linker script (but not in asm files yet)
- Source: revosucks (2020-08-05)

##### Progress Tracking
- calcrom.cpp modification needed for decomp progress bot
- Can calculate percentage of decompiled code vs assembly
- Source: revosucks (2020-08-06)

### Sysdolphin Knowledge

#### 2022-02 (source: 2022-02.md)

##### K7 (Killer 7) Reference
- Killer 7 source code partially leaked years ago
- Contains debug ELFs with sysdolphin symbols
- Useful for struct definitions, but version differs from Melee
- Newer versions have error checking Melee lacks
- Source: werewolf.zip (2022-02-21)

##### HAL "C with Classes" Pattern
- Sysdolphin uses pseudo-classes in C
- Class-based objects have Info struct with callbacks:
  - Alloc, Init, Release, Destroy, Amnesia
  - Extended callbacks in later versions include Update
- Also has Object type: Class + reference counting
- Source: werewolf.zip (2022-02-25)

##### GObj System
- GObj allocated for anything with per-frame changes
- Covers: Menus, Stages, Cameras, Items, Stage Hazards, Adventure mobs, Fighters
- user_data is void* - can be anything
- 64-bit gxlink_prios bitflag for priority levels
- Source: werewolf.zip (2022-02-25)

### Language and Library Information

#### 2021-06-to-10 (source: 2021-06-to-10.md)

##### C vs C++ in Melee
- All of Melee's game code is written in C
- Exception: C++ exception handler from EABI (`__init_cpp_exceptions`)
- This C++ code is from linked library stuff, not game code
- The developers likely just forgot to turn off C++ exceptions in the build
- The C++ runtime init may be mandatory because it's called from Nintendo start code
- Source: werewolf.zip, revosucks, gamemasterplc (2021-08-25)

##### Modeling Tools
- HAL used **SoftImage** for modeling (not Maya)
- Known from Killer7 documentation complaining about HSD lacking Maya conversion support
- Custom model format (HSD) required tools/pipeline to match
- Source: werewolf.zip (2021-08-25)

##### Collision System
- Melee likely uses BSP (Binary Space Partitioning) for collision
- Collision debugger shows larger squares surrounding stage elements
- Indicates scene partitioning similar to other HAL games (Kirby)
- Level collision data is separate from model data
- Source: werewolf.zip, someone2639, amber_0714 (2021-08-25)

### Infrastructure Notes

#### 2023-02 (source: 2023-02.md)

##### GitHub Actions CI Debugging
- `github.head_ref` is for getting the PR branch in workflows triggered by `pull_request`
- `github.ref` for PR workflows is the merge branch: `refs/pull/<number>/merge`
- EditorConfig action may fail on files added by a PR if checkout doesn't get the right ref
- When debugging CI, checking out `${{github.event.pull_request.head.ref}}` may help
- ChatGPT suggestions for CI fixes can work but may be overly verbose
- Local testing with https://github.com/nektos/act recommended but doesn't always work properly
- Source: ribbanya, rtburns (2023-02-28)

##### GitHub Actions Branch Protection
- Build check names must match exactly for branch protection rules
- Renaming jobs (e.g., `build` to `build-ubuntu` and `build-windows`) requires updating repo settings
- PRs won't affect workflows until merged for security reasons
- Source: ribbanya, rtburns (2023-02-28)

#### 2023-03 (source: 2023-03.md)

##### Progress API
- Progress tracking is a decompals service
- API key needed for integration
- Project slug: `melee`
- Source: encounter, ethteck (2023-03-31)

##### Build System
- GitHub Actions = Azure Pipelines (shared Azure instances)
- Windows jobs likely run in VMs for sandboxing
- Docker images cached: https://github.com/actions/runner-images/blob/main/images/linux/Ubuntu2204-Readme.md#cached-docker-images
- Source: ribbanya, werewolf.zip (2023-03-01)

### Compiler Decompilation Project

#### 2022-09 (source: 2022-09.md)

Discussion started about decompiling the mwcceppc compiler itself:
- Goal: Understand and potentially fix the 1.2.5e scheduling patch
- Different versions to consider: 1.2.5, 2.6, 7.2
- Symbol information available for some versions
- Could help solve the `lmw` epilogue ordering problem
- Source: encounter, ninji (2022-09-15)

## Compiler and Codegen

### Compiler Patterns

#### 2020-07 (source: 2020-07.md)

##### Optimization Flags
The working compiler flags discovered:
```
-Cpp_exceptions off -proc gekko -fp hard -O4,p -nodefaults
```

Key findings:
- `-O4,p` means optimization level 4 with "peephole" scheduling
- **Flag order matters**: `-proc gekko -O4,p` vs `-O4,p -proc gekko` produces different scheduling
- When `-O4,p` comes first, scheduler uses "generic PPC" instead of the specified proc
- Source: werewolf.zip, revosucks (2020-07-24)

##### Processor Targeting
- `-proc gekko` is for GameCube's Gekko processor
- `-proc 750` and `-proc generic` produce different codegen
- **`__PPCGEKKO__` define is NOT set** in Melee's build, confirmed by examining `longjmp` at 0x80322840
- This suggests `-proc gekko` may not have been passed, or was overridden
- Source: werewolf.zip (2020-07-08)

##### Float Handling
- `-fp hard` enables hardware floating point
- `-fp_contract on` enables fused multiply-add instructions (fmadds)
- However, the pragma `#pragma fp_contract on` must be used - the flag alone doesn't work
- Source: camthesaxman (2020-07-05)

##### Small Data Area (SDA)
- Variables <= 8 bytes go in `.sdata` (r13-relative) or `.sbss`
- Read-only small data goes in `.sdata2` (r2-relative)
- The linker automatically generates r13/r2-relative loads for appropriately sized variables
- `_SDA_BASE_ = 0x804DB6A0`
- `_SDA2_BASE_ = 0x804DF9E0`

##### Int-to-Float Conversion Constants
Each translation unit that uses int-to-float conversion gets its own copy of magic constants:
- Signed: `0x4330000080000000`
- Unsigned: `0x4330000000000000`
- These duplications help identify file boundaries (283+ boundaries found this way)
- Source: gamemasterplc (2020-07-02)

##### The `asm` Keyword Side Effects
**Critical discovery**: Using `asm` functions in a file affects OTHER functions' codegen:
- `asm` disables peephole optimization on ALL subsequent functions in the file
- Fix: Add `#pragma peephole on` after asm functions to restore optimization
- This makes inline assembly problematic for nonmatching stubs
- Source: werewolf.zip, revosucks (2020-07-30)

##### Inline Function Behavior
- `inline` keyword is a suggestion, not mandatory
- `-inline auto` enables automatic inlining at compiler discretion
- `-inline deferred` allows inlining functions before their definition
- `-inline smart` does 4 passes, limiting later passes to small functions
- Source: gamemasterplc (2020-07-07)

##### Jump Tables
- Switch statements with 5+ consecutive cases become jump tables
- Jump tables are placed in `.data` section (not `.rodata`)
- Pattern: Uses `bctr` instruction (vs `bctrl` for function pointers)
- Small switches become nested if-else chains with binary search pattern
- Source: werewolf.zip, gamemasterplc (2020-07-02)

##### String Literals
- Strings < 8 bytes go in `.sdata`
- Larger strings go in `.data` (not `.rodata` like some compilers)
- Source: gamemasterplc (2020-07-01)

##### LMW/STMW Instructions
- `lmw`/`stmw` (load/store multiple words) are off by default
- Controlled by `-use_lmw_stmw on/off`
- Using `-proc gekko` before `-O4,p` incorrectly enables these
- Source: werewolf.zip (2020-07-24)

#### 2020-08 (source: 2020-08.md)

##### mwcc Optimization Levels
- `-O4` implies `-opt level=4, peephole, schedule, autoinline, func_align 16`
- `-O4,p` specifies speed optimization, `-O4,s` specifies space optimization
- Different parts of a game could be compiled with different compiler options
- Melee confirmed using `-O4,p` with `-proc gekko -fp hardware -Cpp_exceptions off -enum int -fp_contract on -inline auto`
- Source: revosucks, shibboleet, kitesage (2020-08-30)

##### lmw/stmw Instructions
- `lmw`/`stmw` (load/store multiple words) are stack push/pop optimizations
- These are slow instructions and were explicitly disabled for most of Melee
- Only menu files (`mnmain`) appear to have them enabled via pragma
- If `-use_lmw_stmw` wasn't explicitly disabled, the entire game would use them
- Developers likely thought they'd get speedup in menu code and enabled it
- These show up in HSD library code in other games (like Killer7) that compiled sysdolphin themselves
- Source: werewolf.zip (2020-08-06)

##### Instruction Scheduling Differences
- The postprocess script handles mtlr instruction reordering for epilogues
- Sometimes `mr` instruction ordering in epilogues needs manual handling
- Pattern: mtlr is typically shifted up, but scheduler may move it more than expected
- Example epilogue issue:
```asm
# Expected:
mr r3, r31
lwz r0, 36(r1)
lwz r31, 28(r1)
addi r1, r1, 32
mtlr r0
blr

# With schedule off - different order:
stfs f0, 8(r31)
lwz r0, 36(r1)
mr r3, r31
...
```
- Source: revosucks, camthesaxman (2020-08-07)

##### mwcc Inline Behavior
- mwcc processes inline assembly **before** preprocessor expansion
- This allows a hack where `#define _SDA_BASE_(dummy) 0` works for inline asm but not standalone assembly
- The compiler looks at inline asm before macro expansion occurs
- Source: revosucks (2020-08-05)

##### Compiler Float Multiplication Bug
- mwcc erroneously optimizes out `*= 1.0f` operations
- Per IEEE standards, the result should still be calculated (not guaranteed to be the same)
- Source: revosucks (2020-08-04)

#### 2020-09-to-12 (source: 2020-09-to-12.md)

##### MWCC 2.2 vs 2.3 Compiler Version Issue
- The project was using an incorrect compiler version with a workaround hack
- **Key difference**: Prologue and epilogue are not subject to instruction scheduling before version 2.3.x
- Melee relies on a bug present in 2.2.x that was fixed in 2.3.x
- A $1000 bounty was considered for finding a working mwcceppc 2.2 version
- Source: revosucks (2020-12-02, 2020-12-03)

##### Stack Frame Bloat with Temp Variables
- Using a temp variable for floating-point conversion can cause unexpected stack frame expansion:
```c
// This pattern caused stack bloat:
f32 HSD_Randf(void)
{
  f32 temp;
  *RAND_SEED_PTR = *RAND_SEED_PTR * 214013 + 2531011;
  temp = (f32)(*RAND_SEED_PTR >> 0x10);
  return (temp) / USHRT_MAX;
}
```
- Result: Stack frame grew from 16 bytes (`stwu r1,-16(r1)`) to 40 bytes (`stwu r1,-40(r1)`)
- Source: werewolf.zip (2020-11-19)

##### Static Float Inside Function Affects Codegen
- Declaring a static float inside a function vs outside affects code generation
- This behavior is also seen in IDO (SGI compiler)
```c
// Inside function - different codegen
s32 myFunc() {
   static f32 foo;
   //...
}

// vs outside function
static f32 foo;
s32 myFunc() {
   //...
}
```
- Source: revosucks (2020-11-19)

##### force_active Pragma for Preventing Shifts
- Missing `force_active` on a function can cause shifts in the object file
- When experiencing unexpected shifts, check if force_active is needed
- Source: werewolf.zip (2020-10-22)

#### 2021-06-to-10 (source: 2021-06-to-10.md)

##### EPPC 4 Prologue/Epilogue Bug (Critical)
The Melee decompilation project is blocked by a missing compiler version (EPPC 4). Key findings:

- **The Bug**: EPPC 4 has a prologue/epilogue scheduling bug that affects instruction ordering
- **Symptom**: The `addi` instruction in function epilogues appears in the wrong position relative to `lwz` and `mtlr`
- **Expected (Melee target)**:
  ```asm
  addi    r1, r1, 8
  lwz     r0, 4(r1)
  mtlr    r0
  blr
  ```
- **Produced by available compilers**:
  ```asm
  lwz     r0, 12(r1)
  addi    r1, r1, 8
  mtlr    r0
  blr
  ```
- **Fix timeline**: The bug was fixed in compiler release 2.3
- **Evidence**: Mac MWCC 2.2 exhibits the same bug when scheduling is enabled, suggesting EPPC inherited it from the Mac compiler
- Source: werewolf.zip, revosucks (2021-10-03)

##### Addi Swap Bug
- A separate (but related) bug causes `addi` instructions to be ordered incorrectly under certain instruction sequences
- This is mentioned in the CodeWarrior release page as a pre-1.3 bug
- Combined with the EPPC4 scheduling bug, creates the "perfect storm" for both issues to manifest
- Source: werewolf.zip (2021-10-03)

##### MetroTRK as Heuristic Test
- `TRKHandleRequestEvent` can be used as a quick test for compiler version identification
- MetroTRK is linked into all GameCube games as part of the compiler toolchain
- However, MetroTRK is **precompiled**, so it doesn't tell you what compiler was used for the game itself
- `lbvector` (part of Melee's main code) demonstrates the same epilogue bug and is a better test
- Source: revosucks, werewolf.zip, epochflame (2021-10-03)

##### Mac Compiler Testing
- Mac MWCC 2.2 was tested to verify bug inheritance
- With scheduling turned off vs on, the difference is visible
- This provides evidence that the bug existed in Mac 2.2 and was inherited by EPPC
- Opens possibility of static recompilation to introduce EPPC differences
- Source: revosucks (2021-10-03)

#### 2021-11 (source: 2021-11.md)

##### EPPC4 vs 1.0 Compiler Scheduling
- **Key finding**: The main game code and sysdolphin/SDK use EPPC4 compiler, which has a known scheduling bug in prologues/epilogues
- **Scheduling behavior**: In scheduled code, instructions from the main body get relocated INTO the prologue territory, but the prologue instructions themselves remain in the same order
- **Testing insight**: `#pragma scheduling off` disables scheduling entirely, but this changes regalloc as well as scheduling
- Source: epochflame, revosucks (2021-11-07, 2021-11-29)

##### Stack Frame Differences Between Compilers
- **lbvector mystery**: The first function of `lbvector.c` requires Mac 2.2 compiler for correct stack offsets (0x8 instead of 0x10)
- CW 1.0 (2.3) places variables at different stack offsets than Mac 2.2
- The issue manifests in `lfs`/`stfs` instructions using incorrect offsets
- Source: revosucks (2021-11-19)

```
// Mac 2.2 - Correct (matches original):
lfs/stfs use offset 0x8

// CW 1.0 (2.3) - Incorrect:
lfs/stfs use offset 0x10 (16-bit aligned instead of 8-bit)
```

##### Prologue/Epilogue Scheduling Fix
- A postprocessor script (`postprocess.py`) can fix some scheduling issues
- Some functions without `mtlr` have `addi` instructions ordered incorrectly in the epilogue
- The postprocessor checks for specific `addi` stack sizes to detect and fix these cases
- Source: werewolf.zip (2021-11-28)

Example of scheduled vs expected epilogue:
```
// Scheduled (incorrect):     // Expected:
addi r1,r1,0x18              // [moved to end]
fsubs f0,f0,f1               fsubs f0,f0,f1
fadds f0,f2,f0               fadds f0,f2,f0
stfs f0,0(r3)                stfs f0,0(r3)
lwz r4,8(r3)                 lwz r4,8(r3)
addi r0,r4,4                 addi r0,r4,4
stw r0,8(r3)                 stw r0,8(r3)
// [missing]                 addi r1,r1,0x18
blr                          blr
```

##### Compiler Stack Frame Generation
- epochflame identified the stack frame generation function in the 1.0 compiler at address `0x433ff2`
- NOPing calls to this function produces "frameless" output (no prologue/epilogue)
- Prologue and epilogue can be disabled separately
- This could enable writing C code with manually constructed stack frames via inline asm
- Source: epochflame (2021-11-22)

##### Linker Version Effects
- Linker versions 1.0 to 1.2.5 work correctly; avoid 1.0 because it's slow
- Linker 2.7 produces different padding behavior
- Melee uses linker 1.3.2 (last version before ctors/dtors changes)
- Linking takes ~15 seconds with 1.3.2
- Source: werewolf.zip, camthesaxman (2021-11-22)

##### Lost Compiler Patch
- A patch existed for EPPC4 that fixed an `addu` bug: https://web.archive.org/web/20011121032509/http://www.metrowerks.com:80/games/gamecube/update/
- At least one function in TRK requires this patch (see: mainloop.s)
- The patch is considered "lost media" - nobody has a copy
- Source: revosucks (2021-11-29)

#### 2021-12 (source: 2021-12.md)

##### Compiler Version Selection
- **SDK/MSL libraries use plain 1.2.5**, not the 1.2.5e patch ("frank")
- **Game code uses 1.2.5e** for proper epilogue scheduling
- If you see `addi` between `mtlr` and `blr`, the function is using older 1.2.5 codegen and frank will NOT help
- Source: epochflame (2021-12-16)

```c
// For SDK/MSL functions, do NOT add to e_files.mk
// These use plain 1.2.5 compiler
```

##### Epilogue Behavior
- Frank (1.2.5e) fixes game codegen by reordering epilogues to put `mtlr` beside `blr`
- Pre-compiled libraries in SDK/MSL have different codegen patterns
- If you see epilogue differences, check which compiler version the function should use
- Source: epochflame (2021-12-16)

##### Variable Declaration Scope
- mwcc requires variable declarations at the start of blocks (pre-C99 behavior)
- Variables can be declared at the start of ANY block/compound statement, not just function start
- Using internal brackets `{ }` within functions allows declaring variables mid-function

```c
HSD_InitComponent() {
    OSInit();
    {
         HSD_VIStatus vi_status;  // Valid - at start of block
         GXColor black = { 0, 0, 0, 0 };
        ...
    }
    ...
}
```
- Source: werewolf.zip (2021-12-15)

##### Variable Declaration Location Affects Regalloc
- The location of variable declarations affects register allocation
- Moving declarations can cause register swaps
- Keep variables in same order and scope as original when trying to match
- Source: seekyct (2021-12-14)

##### Float/Integer Constant Generation
- Int-to-float constants only get generated once per file
- This means splitting files incorrectly can cause data mismatches
- Source: epochflame (2021-12-16)

##### Extern vs File-Local Data
- Extern vs file-local matters for matching in some cases
- Using extern can cause different register allocation than file-local
- Some functions cannot match if you extern the data
- Source: camthesaxman (2021-12-13)

##### Section Offset Trick
- The compiler loads file-scope variables using an offset from the start of the section
- If you see code loading `var1` then adding 0x80 to get `var3`, it indicates:
  - `var1` is the start of data in that file
  - `var1` and `var3` belong in the same file
- Source: camthesaxman (2021-12-14)

```asm
# Example: var1, var2, var3 are consecutive
# Code loads &var1 and adds 0x80 to get &var3
# This reveals file boundaries
```

##### C99 Support
- Older mwcc compilers don't support `-lang c99`
- Use `#pragma c9x on` instead for limited C99 features
- `-lang c99` was added after CW 1.3+
- Source: revosucks (2021-12-14)

#### 2022-01 (source: 2022-01.md)

##### Compiler Version Selection (mwcc 1.2.5 vs 1.2.5e)

- **SDK libraries use plain 1.2.5**, while the actual game code uses the patched **1.2.5e** (with Frank epilogue modifications)
- Files in `e_files.mk` are compiled with 1.2.5e; everything else uses 1.2.5
- Using the wrong compiler version can cause epilogue instruction swapping issues
- Source: camthesaxman (2022-01-03), kiwidev (2022-01-03)

```
# Example: MSL code showing branch-to-next-instruction with wrong compiler
# If you see branches to the next instruction, try using 1.2.5 instead of 1.2.5e
```

##### Frank Tool Behavior

- Frank applies epilogue modifications (mtlr/addi swap) to **entire files**, not individual functions
- If only one function needs the mtlr/addi swap and the rest break with Frank, you're out of luck
- Files processed by Frank go in `e_files.mk`
- Source: epochflame (2022-01-13)

##### Register Allocation and sdata/sbss

- `r13` references variables in `.sdata` or `.sbss` sections (non-const globals)
- `r2` references variables in `.sdata2` or `.sbss2` sections (const data, similar to rodata)
- Sections ending in `2` are for const data
- Source: camthesaxman, seekyct, epochflame (2022-01-03)

##### u16 Return Value Casting

When a function returns a halfword that gets cast to u16:
```c
// Assembly pattern:
//   bl      func_8016AF0C
//   clrlwi  r30,r3,0x10    // r30 = r3 & 0xFFFF

// C code:
u16 val = (u16)func_8016AF0C();
```
- Source: kiwidev, shibboleet (2022-01-18)

##### rlwinm with Dot Suffix

- Any instruction ending with `.` (dot) compares the output register with 0 and sets condition register
- Example: `rlwinm.` performs rotate-left-word-immediate-then-AND-with-mask AND compares result to 0
- Source: kiwidev (2022-01-18)

#### 2022-02 (source: 2022-02.md)

##### Frank and Epilogue Patching
- Melee was compiled with a patched version of mwcc 1.2.5 that reorders epilogue instructions
- The patch was distributed via a Nintendo FTP (now lost) and has never leaked
- `frank` is a tool that attempts to replicate this patching behavior
- Using explicit `-inline auto` with Frank can break non-inline functions by introducing 2 extra instructions after prologue
- Source: werewolf.zip (2022-02-02)

##### Frank vs FrankLite
- `franklite.py` (Pikmin 2) handles only the mtlr shift case, doesn't need the 1.2.5e compiler
- Full Frank requires both vanilla 1.2.5 and the edited 1.2.5e compiler
- If only one function in a file needs epilogue fix, use FrankLite approach
- Source: epochflame (2022-02-02)

##### Static Leaf Functions and Inline Auto
- Static leaf functions get promoted to inlines by `-inline auto`
- This has different behavior vs. normal inlines (see lbvector for examples)
- Can affect float register allocation
- Source: revosucks (2022-02-02)

##### Float Register Sensitivity
- Float register allocation is extremely sensitive to:
  - Inline functions
  - Static return values
  - Static variables
  - Code at the end of a function can alter register allocation at the beginning
- Source: revosucks (2022-02-02)

##### Loop Unrolling Rules
Discovered heuristics for when mwcc will unroll loops (under -O4,p):
- If loop contains a non-inlined function call: will NOT unroll
- If loop counter is not int/long: will NOT unroll
- In C, maximum 9 iterations (1.2.5) or 12 iterations (2.6) will unroll
- In C++, maximum 16 iterations will unroll
- Inlined function calls do NOT prevent unrolling
- Source: epochflame (2022-02-27)

```c
// This WILL unroll (inline function doesn't count as function call):
inline void piss(void){return;}
void example(void) {
    int i;
    for (i = 0; i < 9; i++)
        piss();
}

// This will NOT unroll (10+ iterations in 1.2.5):
for (i = 0; i < 10; i++)
    piss();
```

##### Pragma Peephole
- Some functions require `#pragma peephole on` to match
- Important to add after inline asm functions
- Source: rtburns (2022-02-18)

##### C99 Features (c9x pragma)
- `#pragma c9x on` enables partial C99 support
- Enables compound literals: `(MyStruct){0, 1, 2, 3}`
- Does NOT enable `offsetof` in mwcc 1.2.5 (only 1.3x+)
- SMB decomp uses compound literals to match
- Source: revosucks, werewolf.zip (2022-02-20)

##### Enum Size
- Enums are always 32-bit due to `-enum int` compiler flag
- Source: kalua (2022-02-20)

#### 2022-03 (source: 2022-03.md)

##### Forcing Inlines with Pragma
- When decomp.me is not using an inline and generates a `bl nameofMyInlineFunc` call instead, use `#pragma always_inline on` to force inlining.
- Source: werewolf.zip (2022-03-07)

##### Register Allocation Sensitive to Code Volume
- The location of `mr` (move register) instructions is directly correlated with the number of ASM lines between certain code regions.
- Adding lines of code moves `mr` upward; removing lines moves it downward.
- Deep nested inlines (multiple levels) can change register allocation (e.g., r27 to r26).
- Source: snuffysasa, werewolf.zip (2022-03-08)

##### Code Reordering by Compiler
- The mwcc compiler reorders code in ways that seem arbitrary. Moving struct field assignments in different orders affects instruction placement.
- Commenting out any lines that set bitfields can shift instruction positions.
- Source: snuffysasa (2022-03-08)

##### Inline ASM for Stubborn Instructions
- When a single instruction placement cannot be matched through normal C code, inline ASM can be used as a "fake match":
```c
asm {
  mr tmp, ft
}
```
- The placement of inline ASM within the function matters - it must be positioned where the instruction should appear.
- Source: werewolf.zip (2022-03-11)

##### addi vs mr Generation
- `addi rX, rY, 0` and `mr rX, rY` produce different bytes even though functionally equivalent.
- Using a temporary variable assignment can sometimes force `mr` instead of `addi`:
```c
tmp = r27;
func_800C88A0(r27 = tmp);
```
- Source: snuffysasa, revosucks (2022-03-08)

##### Struct Access Patterns Affect Codegen
- Substruct assignments can move `mr` instructions.
- Arrays vs individual non-struct members can produce different register allocation.
- Single members vs arrays have sensitivity that can affect edge cases.
- C99 features for dynamic struct initialization may be relevant.
- Source: revosucks (2022-03-12)

##### Multiple blr Instructions in Functions
- Functions can have multiple `blr` (branch-link-return) instructions, especially when the stack isn't used.
- This is common in check functions that return bools.
- Frank (the epilogue scheduler patch) has special handling for this.
- Source: gibhaltmannkill, epochflame, moester_ (2022-03-14)

##### Tail Calls End with b Instead of blr
- Functions with tail calls end with a `b` (branch) instruction instead of `blr`.
- Source: ninji (2022-03-14)

#### 2022-04 (source: 2022-04.md)

##### Integer Type Codegen Differences
- There's an edge case where `long` vs `s32` (or `u32`) produces different codegen despite being equivalent types.
- LibOGC type definitions may differ from the Dolphin SDK; pay attention to types marked as `u32`, `s32` vs `enum` or `typedef'd` types.
- Source: werewolf.zip, revosucks (2022-04-01)

##### Inline Auto Behavior
- Changing global inlining settings causes non-matches across the project.
- Use `#pragma always_inline on` inside a `push/pop` to force inlining without affecting the entire compilation unit.
- decomp.me doesn't compile the same way as full compilation - things in separate compilation units may inline with `-auto` but not if in the same file.
- Source: werewolf.zip (2022-04-04)

##### The FTP Patch Mystery
- The original compiler is believed to be MWCC 1.2.5 + a missing FTP (file transfer protocol) patch from Metrowerks.
- The patch notes said: "The scheduler may, with certain instruction patterns, decide to move code below the de-allocation of the current stack frame."
- This patch has not been archived or leaked. Metrowerks employees contacted don't have backups.
- The frank.py workaround merges vanilla (1.2.5) and profiler (1.2.5e) compiler outputs to approximate the original.
- Source: altafen, revosucks (2022-04-25)

##### Inline Deferred vs Inline Auto
- Inline deferred reverses function order in the output - functions are processed then written in reverse order.
- This affects link order and requires reordering functions if used project-wide.
- Testing suggests Melee does NOT use `-inline deferred`, it likely uses `-inline auto`.
- The workaround for specific inlining issues is `#pragma auto_inline off` around specific functions.
- Source: antidote6212, snuffysasa, epochflame (2022-04-20)

##### sqrtf Mangling with C++
- `sqrtf` appears as `sqrtf__Ff` (C++ mangled) in some assembly.
- This is because `math_ppc.h` uses `#pragma cplusplus on`, causing name mangling.
- The function itself is an external inline in the PPC EABI headers.
- Source: revosucks, epochflame (2022-04-24)

##### Volatile Trick for Stack Variables
- Using `volatile` forces variables onto the stack, which can fix certain matching issues.
- However, it shifts register allocation by one.
- Source: rtburns, snuffysasa (2022-04-12)

##### Volatile to Prevent Inlining
- Declaring any variable in a function as `volatile` makes the function impossible to inline due to context (in most cases).
- Edge cases exist where the compiler will inline anyway.
- Source: antidote6212 (2022-04-20)

#### 2022-05 (source: 2022-05.md)

##### MWCC Performance and Permuter Limitations
- The mwcc compiler runs significantly slower than GCC-based compilers (agbcc, IDO recomp)
- Running the permuter yields less than 20,000 permutations per hour with mwcceppc
- Workaround: Static recompilation of mwcc would help but requires significant RE effort
- Source: snuffysasa, revosucks (2022-05-01)

##### `__PROFILE_EXIT` and Extra Instructions
- When compiling functions individually without the linker, mwcc may insert unexpected `__PROFILE_EXIT` calls and `nop` instructions:
```asm
bl       HSD_ObjFree
bl       __PROFILE_EXIT
nop
lwz      r0,28(rsp)
```
- This is normal for standalone compilation; the linker resolves these
- Source: snuffysasa (2022-05-01)

##### Float Ordering with Dummy Functions
- Compiler may reorder float constants in unexpected ways
- **Fix**: Add a dummy function above that returns the float you want first
- The dummy function gets stripped by the linker but affects float ordering
- Source: camthesaxman (2022-05-21)

##### For Loop Reversal Optimization
- Metrowerks can flip for loops from incrementing to decrementing if it determines functionality is unchanged
- This optimization enables use of `mtctr`/`bdnz` instructions which can only count down
- The loop body still executes in the original order; only the counter decrements
- Source: revosucks, altafen (2022-05-21)

##### Debug Flag `-g` and Instruction Ordering
- Turning on "enable debug info" (`-g`) can swap instruction ordering (e.g., `lmw`/`li` swaps)
- This works because `-g` avoids the edited pathway for 1.2.5e compiler version
- Using normal 1.2.5 (non-patched) has the same result as using `-g`
- Source: vetroidmania, epochflame (2022-05-28)

##### `do {} while(0)` Macro Pattern
- Using `do {} while(0)` for C preprocessor macros was considered good practice
- Forces semicolon requirement when calling macro (looks like regular function call)
- Can potentially generate different codegen vs just using scopes, even though it's optimized away
- Source: revosucks, altafen (2022-05-21)

##### Cast Presence Affects Codegen
- The mere presence of a cast, even if logically unnecessary, can change register allocation:
```c
// These can produce different codegen:
ftDataInfo->...
((ftData*)ft->x10C_ftData)->...
```
- Use casts when needed to match original assembly
- Source: revosucks (2022-05-21)

##### Comma Operator for Register Allocation
- The comma operator `(0, &expr)` evaluates to the rightmost expression but can affect register allocation
- Sometimes required for matching unusual codegen
- Source: altafen (2022-05-23)

##### `crclr 6` / `crset 6` for Variadic Functions
- `crclr 6` means no arguments are floating-point type
- `crset 6` means at least one argument is floating-point type
- Generated when calling variadic functions (`...` in signature)
- Source: gibhaltmannkill (2022-05-29)

##### Double Alignment
- 64-bit values (doubles, f64) must be aligned to 8-byte boundaries
- Empty padding words appear in data sections to ensure proper alignment
- Addresses for doubles must end in 0 or 8
- Source: revosucks (2022-05-31)

#### 2022-06 (source: 2022-06.md)

##### Float Literal Precision Issues
- When using float literals, the compiler may choose slightly different hex representations
- Example: `1.0472f` generates `0x3F860AA6` instead of expected `0x3F860A92`
- Solution: Use mathematical expressions like `M_PI/3` to get exact values, or find exact decimal precision
- If two floats with similar values appear, check if another function uses that constant
- Source: nic6372, amber_0714, revosucks (2022-06-05)

##### Peephole Optimization Bug (MWCC 1.0-1.2.5)
- After an inline/asm function, peephole optimizations are disabled for the rest of the file
- This causes `bnelr` to become `bne + b` (separate instructions)
- Workaround: Use `#pragma peephole off` before affected functions, or `#pragma peephole on` after asm functions
- Fixed in compiler versions 1.3.2-2.7
- Source: revosucks, ninji, epochflame (2022-06-17)

```c
// peephole is on for this
void blahblah() { }

asm blahasmblah() {
    nop
}

// oops! peephole is off now for rest of file
void blahblah2() { }
```

##### Inline Auto Depth
- `-inline auto` tends to inline 3 levels deep by default
- Can be controlled with `-inline auto,level=N` where N is 1-8
- The depth is not strictly fixed - compiler uses heuristics
- If inline depth is exceeded, the compiler may emit a standalone function even for code marked `inline`
- Source: revosucks (2022-06-18, 2022-06-28)

##### Volatile Stack Reservation Trick
- Using `volatile s32` can force stack reservation when needed
- May indicate the struct field being accessed is itself volatile
- Example: `fighter->x2070_int` might actually be volatile in the original code
- Source: snuffysasa, revosucks (2022-06-20)

##### Const Stack Consolidation
- Using `const` on local variables helps the compiler consolidate stack locations
- Useful for clearing vectors: `const float c = 0.0f;` then assign to multiple struct members
- Source: revosucks (2022-06-30)

##### Integer to Float Conversion Assembly
- The compiler converts u32 to double using magic constants:
- `double v = *(double*)&(0x43300000_00000000 | val ^ 0x80000000) - *(double*)&43300000_80000000`
- This generates lengthy assembly that looks unusual
- Source: revosucks (2022-06-25)

#### 2022-07 (source: 2022-07.md)

##### Inline Auto Depth Limits
- The `-inline auto` flag has a default depth of approximately 3 levels
- When a function inlines another function that inlines yet another, the third level may refuse to inline and instead emit a `bl` call
- This caused issues with `HSD_JObjSetScale` -> `HSD_JObjSetMtxDirty` chain where the innermost inline stopped inlining
- Workaround: Create a "hack" version that manually inlines the final call
- Source: revosucks (2022-07-01 through 2022-07-03)

##### Static vs Inline Function Float Ordering
- **Critical**: Using `static` functions affects float constant ordering in `.sdata2`, whereas `inline` does not
- To force float order, declare a static function at the top of the file that uses the float first:
```c
static float get_zero() {
    return 0.0f;
}
```
- The linker will strip unused static functions, but float constants are still placed in order
- This is essential when partially decompiling files where float order must match existing ASM
- Source: revosucks, altafen (2022-07-04)

##### Volatile in sqrtf Inline
- The official SDK `sqrtf` inline uses a `volatile` variable for no apparent reason
- This causes pointless stack store/reload sequences (`stfs` followed by `lfs` to same address)
- The volatile was likely a compiler bug workaround from original developers
- When seeing this pattern, use the correct sqrtf macro from math.h rather than trying to replicate it manually
- Source: revosucks, shibboleet (2022-07-21)

##### Variable Declaration Order Affects Register Allocation
- The order variables are declared at the top of a function affects which registers they're assigned
- Swapping the order of two variable declarations can swap their registers throughout the function
- Example: `Fighter* fp;` before `FighterSpecificAttributes* attrs;` produces different regalloc than vice versa
- Source: revosucks (2022-07-25)

##### Chain Assignment Affects Distant Codegen
- Chain assignments like `top_y = right_x = bottom_y = left_x = 0.0f;` can affect register allocation and codegen hundreds of lines away
- Changing the order of variables in chain assignment affects codegen even for code not directly related
- The permuter's randomization pass was specifically added to find these distant effects
- Source: snuffysasa, altafen (2022-07-11)

##### mfcr Instruction Pattern
- `mfcr` (move from condition register) is used for storing boolean comparison results
- Pattern: `mfcr r0` followed by `rlwinm` shifts to extract specific condition bits
- Used for float comparisons like `*(u32*)&stack->data = *(f32*)&stack->data > var;`
- Different shift amounts (0x1F, 0x1E, 0x1D) correspond to different comparison operators (<, >, <=, >=, ==, !=)
- Source: revosucks, camthesaxman (2022-07-09)

##### eqv Instruction
- `eqv rd, ra, rb` computes `rd = ~(ra ^ rb)` (equivalence / XNOR)
- Rarely seen in normal code; appears in bytecode interpreter functions
- Source: ocesmt (2022-07-09)

##### frsqrte and sqrtf
- `frsqrte` instruction (floating reciprocal square root estimate) indicates use of the SDK `sqrtf` inline
- The inline uses intrinsic `__frsqrte`
- Do not try to generate this manually; use the macro from math.h
- Source: rtburns, altafen (2022-07-16)

##### Bitfield vs Manual Masking
- HSD/sysdolphin code uses manual masking with u32 (`flags & 0x80000000`) rather than bitfields (`: 1`)
- Using bitfields generates `rlwimi` and other instructions vs masks which generate `and`/`or`
- Fighter code appears to use bitfields, but HSD code does not
- Source: werewolf.zip (2022-07-15-16)

##### subfic Instruction Mystery
- Some functions generate `subfic` (subtract from immediate carrying) in mysterious ways
- Example: `i = 5; for (i -= 5; i < 5; i++)` generates subfic but `i = 0; for (; i < 5; i++)` doesn't match
- May be related to 1.2.5e vs patched compiler differences
- Still unresolved for some functions
- Source: vetroidmania, ocesmt (2022-07-09)

#### 2022-08 (source: 2022-08.md)

##### Peephole Optimization Bug After Inline ASM
- Metrowerks has a bug in 1.0-1.2.5 where using an `asm{}` function disables peephole optimization and forgets to re-enable it afterwards
- **Workaround**: Always add `#pragma peephole on` after each inline asm function
- Source: revosucks (2022-08-14)

```c
asm void whatever(void) {
  nofralloc
  // paste asm here
}
#pragma peephole on
```

##### Float Conversion Constants
- The compiler automatically generates conversion constants for int-to-float conversions
- There's one conversion constant for signed integers and another for unsigned integers
- These constants (like `lbl_804DE4D8`) are used when converting integer values to floats
- Source: gibhaltmannkill, revosucks (2022-08-21)

##### sqrtf Inline Implementation
- HAL used a custom sqrtf inline from Metrowerks CW includes
- The implementation uses Newton-Raphson iterations via `__frsqrte`:

```c
extern inline float sqrtf(float x)
{
  static const double _half=.5;
  static const double _three=3.0;
  volatile float y;
  if(x > 0.0f)
  {
    double guess = __frsqrte((double)x);   // returns an approximation
    guess = _half*guess*(_three - guess*guess*x);  // now have 12 sig bits
    guess = _half*guess*(_three - guess*guess*x);  // now have 24 sig bits
    guess = _half*guess*(_three - guess*guess*x);  // now have 32 sig bits
    y=(float)(x*guess);
    return y;
  }
  return x;
}
```

- There are multiple sqrtf inlines floating around in the codebase
- The 0.5 and 3.0 constants may appear as floats instead of doubles in some variants
- Bug in version 1.0: `sqrt(0)` returns infinity instead of 0 (fixed in 1.1)
- Source: revosucks, altafen (2022-08-14)

##### Division by Constants Using MULT_HI
- Division/modulo by constants like 60 get optimized to `mulhw` (multiply high word) instructions
- Example: `MULT_HI(x, 0x88888889) >> 5` is equivalent to `x / 60`
- M2C decompiles `mulhw` to `MULT_HI(...)` macro calls
- Source: waynebird, altafen (2022-08-14)

##### Static Variables and Data Sections

**Section allocation rules:**
- `.bss` - uninitialized data
- `.data` - non-const initialized objects
- `.rodata` - const (read-only) initialized objects
- If an object is 8 bytes or smaller, it goes into small sections: `.sbss`, `.sdata`, or `.sdata2`
- `.sdata2` is for small const stuff (the small version of `.rodata`)
- Float and double literals, as well as struct/array initializers within functions, go into `.rodata` or `.sdata2` depending on size
- **Exception**: String literals go into `.data` or `.sdata` (not rodata)

**Access patterns:**
- Small data accessed via `r13` register (`.sdata`, `.sbss`)
- Small const data accessed via `r2` register (`.sdata2`)
- Removing `const static` from data makes it go into r13 instead of rodata
- Source: camthesaxman (2022-08-17)

##### Function Ordering in Object Files
- Functions in .c and .s files must be in the same order as they appear in the original DOL
- The order in the map file shows: `[c file] -> functions -> [s file]`
- If you decompile functions out of order, you need to either:
  1. Keep them in separate files and order them correctly in the build
  2. Embed asm functions directly in the C file
- Source: revosucks, altafen (2022-08-14)

##### Struct Passed by Value on Stack
- Structs over 8 bytes passed by value will always be on the stack
- Smaller structs may also be on stack depending on member layout
- Normal args can be put on stack if there's not enough registers
- Source: seekyct (2022-08-28)

#### 2022-09 (source: 2022-09.md)

##### Peephole Optimization and ASM Functions
- If there's an `asm{}` function above a C function in the same file, the peephole optimizer behavior changes
- Solution: Use `#pragma peephole off` after the asm function
- The pragma applies to subsequent functions in the file
- Source: revosucks (2022-09-03)

Example:
```c
// there's a hecking asm{} function above this one...
#pragma peephole off

int lbl_8038815C(s32 arg0, s32 arg1, s32* arg2, s32 arg3) {
    if (lbl_804D7710 != NULL) {
        lbl_804D7710(arg1, *arg2);
    }
    lbl_804D7718(arg0, arg1, arg2, arg3);
    return 0;
}
```

##### Float Literal Merging
- MWCC won't merge `0.5` with `0.5L` - they get separate addresses in sdata2
- `0.5L` is `long double` (128-bit), `0.5` is `double` (64-bit)
- This can be problematic with inlines like `sqrtf` that use float constants
- Recommendation: Hold off on using the `L` suffix everywhere
- Source: rtburns, gibhaltmannkill (2022-09-03)

##### Register Usage for SDA Access
- GPR13 is used for SDA (mutable small data)
- GPR2 is used for SDA2 (constant small data)
- Variables use r13 when: not constant, declared outside of a function
- Static variables still end up in normal sdata
- Source: seekyct, gibhaltmannkill (2022-09-03)

##### Variadic Functions and crclr
- Variadic functions need `crclr` instructions to indicate if float arguments were passed
- If you see unexpected `crclr` instructions, declare the function prototype as variadic
- Source: kiwidev, gibhaltmannkill (2022-09-03)

##### Branch Hint Bits
- Gekko has branch hint bits (+/-) in conditional branch instructions
- `bdnz+, bne+, beq+, blt+` are used in loops (positive = likely taken, negative offset)
- However, Gekko doesn't actually support branch hints - they have no effect on the branch predictor
- CW doesn't set the branch hint bits; the +/- suffix just indicates branch direction
- Source: encounter, vetroidmania, gibhaltmannkill (2022-09-18-19)

##### Instruction Scheduling
- PPC 750/Gekko can run six instructions simultaneously
- Has branch prediction and out-of-order execution capabilities
- The 1.2.5e compiler patch involves epilogue scheduling issues
- `lmw` instruction ordering in epilogues is inconsistent
- Source: encounter, camthesaxman (2022-09-14-18)

#### 2022-10 (source: 2022-10.md)

##### Duplicate Condition Branches
The mwcc compiler can optimize out duplicate compare instructions but keeps redundant branch instructions that check the same condition:
- Two consecutive branches with the same condition but different targets
- The compiler merges the comparison but not the branches themselves
- First check typically skips a loop, while second branches into it
- Source: seekyct, antidote6212 (2022-10-26)

##### Register Shuffling with r3/r4
Sometimes the compiler produces seemingly redundant `addi` instructions moving values between r3 and r4:
- Can be difficult to reproduce in C code
- May relate to function call setup or return value handling
- Source: vetroidmania (2022-10-14, 2022-10-25)

##### Loop Countdown Pattern with bdnz
When you see `bdnz` (branch decrement not zero) instruction:
- The loop condition is typically `i = N; i != 0; i--` not `i < N`
- The compiler uses the count register for the loop
- Source: werewolf.zip (2022-10-28)

##### lwzu Chain Patterns
Some functions use chains of `lwzu` (load word with update) instructions:
- These can be tricky to match in C
- Often appear in list traversal or sequential memory access
- Source: vetroidmania (2022-10-23)

#### 2022-11 (source: 2022-11.md)

##### -proc Flag Variations
- Using `-proc 750` can sometimes fix `mtlr` swaps on unmodified 1.2.5 compiler (vetroidmania, 2022-11-15)
- `-proc 604` enables different scheduling behavior that fixes some functions (revosucks, 2022-11-19)
- The proc flags likely enable/disable specific "flags" in the compiler related to pipeline delay targets or if/else scheduling decisions
- Because `-proc` is a pragma, it can be applied manually per-function to work around scheduling issues

##### Scheduler Problem Investigation
- The 1.2.5 scheduler bug: "The scheduler may, with certain instruction patterns, decide to move code below the de-allocation of the current stack frame. That is, code is moved below the `addi sp, sp, N`." (from official Metrowerks update notes)
- The `CW_Update.zip` hotfix is speculated to contain build 167 (1.2.5 is ~b163)
- encounter started reverse engineering the scheduler code; found the generalized configuration lives in per-target tables
- ninji is working on a full mwcc decompilation using Pro7 (has full symbols, no scheduling) and Pro8 (symbols + partial debug info, uses scheduling)
- The mwcc decomp is targeting OS X build and compiles itself (pro7 was built with itself)

##### mwcc Decompilation Project (ninji)
- Repository: https://git.wuffs.org/MWCC
- Version being decompiled: CW Pro7 2.4.5 for Mac PPC
- Compiler flags used: `mwccppc -c -g -opt l=4,noschedule,speed -enum min -w all,nounused -wchar_t on -bool off -Cpp_exceptions off`
- Key files of interest:
  - `InstrSelection.c` - code generator with one function per AST node, contains division patterns
  - `CExpr.c` and `CExpr2.c` - likely largest TUs
  - `CMachine.c` - machine configuration
- Trick: x86 builds can provide insight into difficult-to-match functions since return statement handling differs (x86 returns immediately, PPC branches to epilogue)

##### Inline and Scheduling Interactions
- Using `-inline auto` with Frank's scheduling patch can introduce extra instructions after prologues in some unrolled loops (werewolf.zip)
- The mere presence of an inline can change the prologue (e.g., adding extra `addi` in prologue) without affecting later code

#### 2022-12 (source: 2022-12.md)

##### int vs s32 (long) Codegen Differences

Using `int` instead of `s32` can dramatically change codegen, even though they're the same size:

- `s32` is defined as `long`, while `int` is just `int`
- The compiler treats them as different types internally, causing implicit casts
- Implicit casts can affect stack allocation - the compiler may temporarily allocate stack space for cast results
- Example: `int` types can consume more stack space than `s32` due to implicit conversion overhead

Source: rtburns, revosucks (2022-12-17)

```c
// This implicit cast can affect codegen:
void bar(s32 myS32) {
    int foo = myS32; // implicit cast from long to int
}
```

##### BSS Variable Ordering

BSS variables are ordered based on usage order, not declaration order:

- Using `static` keyword forces variables to be placed in BSS in declaration order
- Without `static`, order depends on first reference/usage in code
- Can force order by creating a dummy function that references variables in desired order:

```c
// From SMB1 - forces BSS ordering
#define FORCE_BSS_ORDER(var) void *_force_bss_order_##var(){return &var;}
```

- Alternatively, initializing with `= {}` can force order, but this moves data to .data section instead of .bss

Source: altimor, revosucks, rtburns (2022-12-24)

##### Inline Stack Consumption

Adding inline functions sometimes increases stack allocation unexpectedly:

- The compiler may allocate stack space for inline parameters even when optimizing them away
- Getting the "inner stack" (locations within a function) vs "outer stack" (total prologue/epilogue allocation) to match requires understanding these behaviors
- Wrapping entire functions in inlines can sometimes fix stack mismatches

Source: revosucks, ninji (2022-12-17)

##### Loop Strength Reduction

The compiler performs "strength reduction" on loop variables:

- If every iteration uses something derived from the iteration variable, the compiler creates extra temporaries
- It will increment these by the derived amount each iteration
- Different array strides (e.g., 4 bytes vs 8 bytes) can create multiple temporary variables

Source: ninji (2022-12-27)

```c
// Compiler may generate code tracking both 'bone' and 'offset' separately:
bone += 1;
*(u32*)((int)&player->bones->jobj + offset) = 0;
offset += 0x10;
```

##### Enum Sizing with -enum int

- The `-enum int` flag makes enums 32-bit by default
- Without it, enums become `u8`
- Can control enum size by adding extra values (e.g., any negative value makes it signed)
- Some HSD functions truncate masks to 16 bits, which may indicate inconsistent enum handling

Source: vetroidmania, ninji (2022-12-26)

##### Loop Unrolling Control

Use `#pragma ppc_unroll_instructions_limit 1` to disable the loop unroller for clearer codegen analysis.

Source: ninji (2022-12-25)

#### 2023-01 (source: 2023-01.md)

##### ASM Function Disables Peephole Optimization
- Defining a function as `asm` changes code generation for subsequent loading of pointers to that function
- This is actually a bug in older CodeWarrior versions where an asm function turns peephole optimization off for the rest of the file
- **Workaround**: Wrap asm functions in `#pragma push` / `#pragma pop` or use `#pragma peephole on` after the asm function
- Source: seekyct, altimor (2023-01-01)

##### Pragma Once Not Supported
- `#pragma once` does not work with mwcc (at least the version used for Melee)
- Must use traditional include guards instead
- Source: rtburns (2023-01-05)

##### Inline Stack Allocation Behavior
- When you invoke an inline function, it typically increments stack allocation in **8-byte increments**, not 4 like regular variables
- This is important for matching functions that have unexplained extra stack space
- Source: revosucks (2023-01-13)

##### MWCC Treats int as 1 or 4 Bytes
- MWCC treats `int` as either 1 or 4 bytes depending on the situation
- This explains some of the `long` vs `int` confusion in matches
- Source: ribbanya (2023-01-13)

##### MWCC Const and Value Reuse
- MWCC has logic where it tries to reuse values where possible (e.g., reading the same struct field twice in same expression, it'll only fetch once)
- This logic is heavily influenced by the `const` qualifier
- Removing constness via a macro cast can change this optimization behavior
- Source: ninji (2023-01-13)

##### unsigned int vs int Codegen Differences
- `s32` matches, `int` doesn't match, `unsigned int` matches in some cases
- The signedness affects code generation even when the value is never negative
- Sometimes a function returning an enum needs to return `unsigned int` to match
- Source: ribbanya, rtburns (2023-01-11)

##### C99 Pragma
- MWCC has `#pragma c99 on | off | reset` but it appears to be partially implemented
- No `_Bool` support in Melee's compiler version
- Source: ribbanya (2023-01-17)

##### optimizewithasm Pragma
- `#pragma optimizewithasm` allows mwcc to optimize inline assembly (on by default)
- Can lead to unexpected results; disable it with `#pragma optimizewithasm off`
- Used in Metroid Prime decomp to prevent unintended reordering
- Source: antidote6212 (2023-01-16)

##### Frank.py False Positives/Negatives
- Frank.py handles li/lwz reordering but NOT li/lmw reordering
- Can cause false negatives where code appears to match but has instruction reordering issues
- Source: altafen, encounter (2023-01-30-31)

#### 2023-02 (source: 2023-02.md)

##### Int-to-Float Conversion Magic Numbers
- When converting an `int` to a `float`, the compiler generates a reference to a double constant (e.g., `lbl_804D9648`)
- This double is a compiler-generated magic number used for accurate conversion
- Must be a double to accurately represent any 32-bit integer
- The assembler keeps/creates a reference to this constant because runtime generation alone cannot handle all cases
- If you see a reference to an unexplained double in sdata2, check for int-to-float conversions
- Source: chippy__, gamemasterplc (2023-02-14)

#### 2023-03 (source: 2023-03.md)

##### Stack Usage with Vec Parameters
- Functions taking `Vec` by value (instead of pointer) can cause unpredictable stack copies
- Fix: Change parameter type from `Vec` to `Vec*` to eliminate stack copies
- Example: `void HSD_CObjSetInterest(HSD_CObj*, Vec);` should be `void HSD_CObjSetInterest(HSD_CObj*, Vec*);`
- Source: chippy__ (2023-03-03)

##### Static Function Removal with Inline Auto
- When using `-inline auto`, static functions may get always inlined and subsequently removed by the linker
- The linker knows nothing else can call a static function, so it optimizes away the non-inlined version
- Removing `static` can cause DOL mismatch because the linker preserves the function thinking another file might call it
- Workaround: If a function was static, keep it static or explicitly mark it `inline`
- Source: revosucks (2023-03-15)

##### Bitfield Member Size Convention
- HAL used `u32` as the standard bitfield member size in SSB (Smash 64)
- Example: `u32 : 1` instead of other integer types
- This convention likely carries over to Melee
- Bitfield ordering is compiler-defined and can differ between compilers on the same platform
- Source: vetroidmania (2023-03-29)

##### DWARF Type Information from HSD
- HSD library has DWARF debug information that reveals:
  - `enum_t` in Update functions should actually be `unsigned int`
  - `HSD_ObjData` was originally named `FObjData`
  - Whether types are actual enums vs integers compared against enum values
- Source: werewolf.zip (2023-03-15)

#### 2023-04-to-05 (source: 2023-04-to-05.md)

##### Cast to Force Specific Codegen

A random cast in an `||` chain can prevent the compiler from optimizing consecutive comparisons:

```c
// This gets optimized into a switch-like structure:
if (msid == 0xB7 || msid == 0xB8 || msid == 0xB9 ||
    msid == 0xBF || msid == 0xC0 || msid == 0xC1)

// But adding a cast prevents optimization:
if (msid == 0xB7 || msid == 0xB8 || (s32)msid == 0xB9 ||
    msid == 0xBF || msid == 0xC0 || msid == 0xC1)
```

Source: chippy__ (2023-05-30)

##### Callback Inlining

Callbacks can get inlined even when passed as function pointers:

```c
// ensureUnkItem isn't in the dol - it got inlined into the caller
// https://decomp.me/scratch/DggG7
```

This can simplify repeated callback functions. Source: ribbanya (2023-05-06)

##### Unused Stack Variables for Alignment

Sometimes unused stack variables are needed for alignment:

```c
void ft_8009B390(ftCo_GObj* gobj, float force_mul)
{
#ifdef MUST_MATCH
    u8 _[16] = { 0 };
#endif
    // ... function body
}
```

Source: .cuyler, revosucks (2023-05-28)

##### Local Variable Non-Existence

Sometimes m2c-generated local variables don't actually exist - the address is computed directly:

```c
// cd_x148_rad doesn't exist as a local var
// https://decomp.me/scratch/q4zu3
```

Source: vetroidmania (2023-05-15)

##### IDO Scheduler Chaos (N64)

For Smash 64, the IDO compiler scheduler reorders instructions wildly:
- Example ordering: 54 -> 107 -> 59 -> 56 -> 93 -> 95

Source: vetroidmania (2023-05-03)

#### 2023-06 (source: 2023-06.md)

##### Inline Function Linkage Behavior (rtburns, 2023-06-29)
A significant discovery about how mwcc handles inline functions:
- **`static inline`** = LOCAL linkage - functions get duplicated into each Translation Unit (TU)
- **`inline`** (without static) = WEAK linkage - functions get ODR (One Definition Rule) deduplicated at link time

This explains functions like `lbColl_JObjSetupMatrix` appearing in melee code when it "should" be in HSD - it's actually `HSD_JObjSetupMatrix` as an `inline` function that got deduplicated into lbcoll.

Proof: https://decomp.me/scratch/Sff2V

Practical implication: Once lbcoll is fully matching, `lbColl_JObjSetupMatrix` can be renamed back to `HSD_JObjSetupMatrix` and unmatched asm will still link to it correctly.

##### Inline Auto Depth Limits (Revo, 2023-06-29)
The `-inline auto` flag has heuristic-based limits:
- Usually stops inlining at depth 3 or 4
- Function length affects the decision - larger functions stop inlining sooner
- Smaller functions are more likely to be inlined at deeper levels
- If a "true inline" (defined in header) is called after the limit, it gets promoted to a standalone function in that TU

##### Autoinlined Functions and Linker Behavior (rtburns, 2023-06-29)
Ordinary global functions (`void foo() { ... }`) used only locally:
- Have GLOBAL linkage in the object file
- If autoinlined, they will be stripped by the linker
- Otherwise they persist in the DOL

##### Register Allocation and Type Casts (multiple contributors, 2023-06-05)
- Registers behave differently depending on types used and free register count
- Redundant casts (e.g., f32 to f32) are visual noise and should be removed
- Casting to/from `long <-> int` can produce unexpected codegen

##### Optimization Level Confirmation (Revo, 2023-06-24)
Melee is firmly established as using `-O4,p` optimization level.

#### 2023-07-to-12 (source: 2023-07-to-12.md)

##### The 1.2.5n Hotfix Compiler
- **Ninji's patch (mwcceppc 1.2.5n)** is the correct hotfix for the epilogue scheduling bug, replacing "frank" (the previous workaround)
- The patch adds `fSideEffects` to the `addi r1, r1, x` instruction (or `lwz r1, 0(r1)` for dynamic stack functions)
- This replicates what Metrowerks did in build 167
- **Use 1.2.5n for all "hotfix" code** - do not use frank anymore
- The decomp.me Melee preset uses 1.2.5n in the background
- Source: Ninji, revosucks (2023-07-15)

##### Register Allocation Reference
Standard PPC register conventions for mwcc:
- `r1`: Stack pointer
- `r2`, `r13`: Pointers to data sections (sdata/sdata2)
- `r3-r10`: Function arguments
- `r3`: Function return value
- `r0`, `r14-r31`: Local variables
- `r3-r12`: Can also be used as locals
- `r11`: Stack frame pointer (certain optimizations)
- `r12`: Reserved for calling variable functions
- Source: altafen (2023-07-13)

##### Stack Size Sensitivity
- Extra variables can increase/decrease stack size unexpectedly
- Inlines can increase stack size
- Compiler version 1.2.5 is "extremely picky" about this
- Source: chippy__ (2023-10-29)

##### Subfic Hack Pattern
The `var -= immediate` subfic assembly pattern is really just `i = var = 0`:
```c
// When you see subfic in asm for subtraction
// The actual C is often simpler assignment
i = var = 0;
```
- Source: vetroidmania (2023-10-17)

##### Self-Assignment Trick
When seeing `rlwimi` vs `ori` differences in bitfield operations:
```c
// Sometimes you need explicit self-assignment to get the right codegen
state = state;
```
- Source: werewolf.zip (2023-09-22) - used to match FObj

---

#### 2024-01 (source: 2024-01.md)

##### Variadic Functions (va_args) and Parameter Counting

The mwcc compiler uses `lis r0, 0xN00` to indicate the number of initial parameters in variadic functions, where N is incremented by 0x100 per parameter.

Example pattern discovered by werewolf.zip:
```c
void lbArchive_80016AF0(HSD_Archive* archive, void** file, ...) {
    char* symbols;
    va_list sections;

    va_start(sections, archive);
    for (; file != NULL; file = va_arg(sections, void**)) {
        symbols = va_arg(sections, char*);
        *file = NULL;
        *file = HSD_ArchiveGetPublicAddress(archive, symbols);
        if (*file == NULL) {
            OSReport("Cannot find symbol %s.\n", symbols);
        }
    }
    va_end(sections);
}
```

- `va_start` behavior: mwcc seems to ignore the second parameter and always generates the code properly
- Using `for` instead of `while` can be necessary to skip the first iteration when matching
- Source: werewolf.zip (2024-01-17/18)

##### Ternaries vs If/Else

Ternaries generate different code than equivalent if/else statements:
- Ternaries create a temporary variable for the result (always in saved registers or stack at O0)
- This helps the compiler when ternaries are part of complex expressions
- With optimization, these temporaries are often discarded
- In mwcc 1.0-1.2.5, the stack space left behind by temporaries is not always cleaned up
- Source: gamemasterplc, revosucks (2024-01-17)

##### Float/Int Parameter Ordering

Floating point values go in different registers (FPRs) than integer/pointer values (GPRs). The ordering of FP arguments relative to non-FP arguments doesn't matter for matching, as long as each type's arguments maintain their correct relative ordering.

Example: A function may appear as `function(GObj*, u32, GObj*, f32, f32, f32, f32)` in code but the parameter order in the declaration can vary as long as FPR and GPR orderings are preserved independently.
- Source: werewolf.zip (2024-01-18)

##### Inline Function Emission

When a function is declared `inline` (not `static inline`):
- It gets embedded into each TU where it's used
- The linker deduplicates these, so it ends up in a "random" TU (usually `lb_*` files)
- This is why some functions appear at unexpected locations in the linker order
- Without `static`, regular inline functions get deduplicated by the linker
- Source: rtburns (2024-01-17)

##### Auto-Inlining and Stack Issues

HAL used an auto-inlining mode (`-inline auto`). Most stack issues in Melee come from how this works:
- Static functions in the same TU can get inlined and removed
- They leave stack allocations behind even when the function is removed
- Source: revosucks (2024-01-17)

##### Extab/Extabindex in Sysdolphin

Some parts of sysdolphin appear to be compiled with C++ exceptions enabled, even though the project uses `-Cpp_exceptions off`. This was likely a compiler bug where the flag was ignored.
- Source: werewolf.zip (2024-01-17)

#### 2024-02 (source: 2024-02.md)

##### Literal Symbol Names (@170, @173, etc.)
- These are compiler-generated names for literals like floats (1.0f) and strings
- They are per-file, not program-wide (test.c will have different symbol names than file.c for the same 0.0f)
- The numbers appear to be related to parse IDs (nth token or similar)
- Source: chippy__, gamemasterplc (2024-02-12)

##### int vs s32 Behavior
- `int` has special properties in mwcc - can generate either 8-bit or 32-bit instructions depending on context
- Sometimes generates `lbz` instead of `lwz` for function arguments
- Our `s32` definition (from Dolphin SDK) is `long`, so they are technically different types
- Melee developers seemed to prefer `int` for most cases
- Source: ribbanya (2024-02-14)

##### cmplwi vs cmpwi for Pointer Detection
- If comparison uses `cmplwi` (unsigned compare), the variable is likely a pointer
- `cmpwi` (signed compare) suggests an integer
- Useful for determining parameter types when declarations are unknown
- Source: ribbanya, wyatt.wtf (2024-02-28)

##### PAD_STACK and .rodata Generation
- Using `= { 0 };` in PAD_STACK macro causes .rodata to be generated
- This was fixed by removing the zero initialization
- However, removing it breaks behavior inside inlines
- Source: werewolf.zip (2024-02-19)

##### Tautological Comparisons
- Some functions require invalid/tautological comparisons to match:
```c
static int DifferentTluts(HSD_Tlut* t0, HSD_Tlut* t1)
{
    return (t0->lut != t0->lut) || (t0->n_entries != t1->n_entries);
}
```
- The `-Wno-tautological-compare` warning was disabled due to this
- Source: werewolf.zip (2024-02-16)

##### Inverted Constants for subi
- Some SFX IDs use inverted constants because the ASM requires `subi` instead of `addi`:
```c
Item_8026AE84(it, ~0xFFFD40C6, 0x7f, 0x40);
```
- This is rare but does occur in the codebase
- Source: werewolf.zip (2024-02-20)

#### 2024-03-to-07 (source: 2024-03-to-07.md)

##### Assert Macro Impact on Stack and Inlining (revosucks, 2024-03-31)
The correct assert macro format significantly affects codegen, particularly stack allocation and inlining behavior:

```c
#define ASSERTMSGLINE(line, cond, msg) \
    ((cond) || (OSPanic(__FILE__, line, msg), 0))
```

Key points:
- The `, 0` at the end is **required** for correct behavior
- This format allows asserts to be used in `if()` conditions
- Using the wrong assert macro can cause stack inflation and unexpected inlining issues
- Some void pointer cast hacks may have been workarounds for incorrect assert macros

However, werewolf.zip noted (2024-04-19) that HSD code uses its own `HSD_ASSERT` macro, which may differ from SDK asserts. Testing showed the SDK-style assert still caused 0x8 bytes of extra stack in some HSD functions.

##### Ternary vs If-Else Generates Different Assembly (revosucks, 2024-05-01)
Equivalent logical constructs can produce different codegen:
```c
// These may NOT produce the same assembly:
if (condition) x = a; else x = b;
x = condition ? a : b;
```
Consider any logically equivalent code as potentially generating different assembly.

##### Inline Depth and Auto-Inlining (foxcam/revosucks, 2024-06-19)
When a function gets inlined, inner function calls may or may not be inlined based on nesting depth:
- If function A calls function B which calls function C
- When A inlines B, the compiler may hit inline depth limit and NOT inline C
- This explains cases where a function appears as both inlined code and as a `bl` call in different contexts

Look for patterns where the same small function is:
1. Inlined in one location
2. Called directly in another location immediately below/above

##### Stack Differences of 0x8 Bytes (werewolf.zip, 2024-04-18)
A stack size difference of exactly 0x8 bytes typically indicates a missing inline function call:
- This is the exact stack reservation for a function call with this compiler
- If you see `r1+0x14` in target but `r1+0x1C` in your code (or similar 0x8 diff), look for missing inlines

##### GET_FIGHTER Macro Casting (revosucks, 2024-05-01)
The macro should NOT include the GObj cast - functions do their own casting:
```c
// Correct - functions handle casting
#define GET_FIGHTER(gobj) ((Fighter*) HSD_GObjGetUserData(gobj))

// The cast is in the function, not the macro
void myFunc(Fighter_GObj* gobj) {
    Fighter* fp = GET_FIGHTER(gobj);  // Works with proper prototype
}
```
This can affect codegen and may explain some "fake matches."

##### File Path in __FILE__ Affects Codegen (gamemasterplc/revosucks, 2024-06-11)
The expansion of `__FILE__` in asserts affects register loads:
- If context has `"src/sysdolphin/baselib/jobj.h"` but should have `"jobj.h"`, string loads differ
- Too many or too few characters changes how the string gets loaded
- Always verify `__FILE__` path matches expected format in decomp.me context

#### 2024-08-to-12 (source: 2024-08-to-12.md)

##### Explicit NULL Checks Affect Codegen
- Explicit `if (ptr != NULL)` checks produce different codegen than `if (ptr)` for inlined functions
- The compiler can discard `if (ptr)` checks when it knows the pointer is non-null (e.g., from a local variable)
- Using explicit `NULL` can break inlines where the check would otherwise be optimized away
- Recommendation: Use `if (ptr)` style checks for consistency
- Source: werewolf.zip (2024-09-05)

##### Switch Statement Codegen Patterns
- Nested if-else chains in decompiler output often represent switch statements
- Example pattern that becomes a switch:
```c
if (kind < 0x8A) {
    if (kind < 0x4C) {
        if (kind < 0x4A) {
            // empty
        } else { code_A; }
    }
} else if (kind < 0x8C) { code_B; }
```
Becomes:
```c
switch (kind) {
    case 0x4A:
    case 0x4B:
        code_B;
        break;
    case 0x8A:
    case 0x8B:
        code_A;
        break;
}
```
- Different switch orderings can produce nearly identical assembly - try multiple patterns
- Source: bbr0n, foxcam (2024-08-01)

##### Inline Auto Behavior
- `-inline auto` causes the compiler to inline small static functions until reaching a certain depth (~3 levels)
- A file that originally had 7-8 functions can compress to 2-3 due to inline auto
- Functions called exactly once in the same file are prime candidates for inlining
- Source: revosucks, werewolf.zip (2024-09-17)

##### Double Branch Instructions
- Double `b` (branch) instructions like `b .L_X / b .L_X` are indicative of switch statements
- This is a "Metrowerks moment" - quirky compiler behavior
- Source: stephenjayakar, revosucks, werewolf.zip (2024-09-19)

##### Structure Copies Use Word Loads
- When copying structures, the compiler may use `lwz` (load word) instructions even for float fields
- This is an optimization that copies the raw bytes rather than interpreting as floats
- Source: kiwidev (2024-08-14)

#### 2025-01-to-04 (source: 2025-01-to-04.md)

##### Small Data Area (SDA) for Constants
- The PowerPC compiler places small read-only constants (floats, doubles, strings) in `.rodata` sections
- These are loaded via SDA-relative addressing (`@sda21(0)` notation) for single-instruction loads
- Contrast with absolute addressing which requires two instructions (hi/lo parts)
- Constants are placed in top-down file order as the compiler reads them
- Source: revosucks, rtburns, savestate (2025-04-29)

##### 64-bit Stores
- 64-bit writes (like `u64 gxlink_prios` in `HSD_GObj`) generate two 32-bit stores
- Example: writing 9 to offset 0x24 and 0 to offset 0x20 is a single 64-bit write
- Source: gamemasterplc, werewolf.zip (2025-03-16)

##### Casting and User Data Access
- Casting when passing to `HSD_GObjGetUserData` affects stack/codegen
- `(Fighter*)HSD_GObjGetUserData(gobj)` - correct
- `(Fighter*)HSD_GObjGetUserData((cast here)gobj)` - incorrect, causes stack issues
- The GET_FIGHTER macro shouldn't have a cast on the input, only on the return
- Source: revosucks (2025-04-29)

#### 2025-05 (source: 2025-05.md)

##### Duplicate Floating-Point Constants and File Boundaries
- The compiler merges duplicate floating-point constants (0.0F, 1.0F) within a single file but NOT across files
- Seeing duplicate constants in `.sdata2` indicates a file boundary between them
- This is one way to figure out what objects belong in which file
- Source: gamemasterplc, renakunisaki (2025-05-01)

##### s32 vs int Codegen Differences
- Using `s32` vs `int` can change code generation in subtle ways
- General consensus is to use `int` in `src/melee/` and SDK types (`s32`, `f32`) in `src/dolphin/`
- Preference varies; some resigned to using `int` due to codegen differences
- Source: altafen, ribbanya (2025-05-29, 2025-05-31)

##### `u8` to `int` Parameter Translation
- The compiler often translates `int` to `u8` when used as a function argument
- Common in `Player` functions when passing in the player slot
- If a function takes a `u8` and forwards it to a function taking `int`, you may see an extra instruction for the cast
- Changing the signature to `int` may be correct if all call sites match
- Source: ribbanya (2025-05-12)

##### `#pragma peephole off` and Inline ASM
- The `crclr` instruction can appear unexpectedly due to inline ASM earlier in a file affecting peephole optimization
- Adding `#pragma peephole off` can fix this
- Source: cadmic, werewolf.zip (2025-05-21)

##### Ternary Operators and Stack Size
- Ternary operators often inflate stack size unexpectedly
- Replacing a ternary with an inline function or separate if/else can sometimes fix stack mismatches
- Source: ribbanya (2025-05-29)

#### 2025-06 (source: 2025-06.md)

##### fcmpo vs fcmpu - Float Comparison Instructions
- When the target uses `fcmpo` + `cror` but you're getting `fcmpu`, the issue is usually a combined operation involving equality
- `cror` is typically used for combined float comparisons
- Switching from `==` to `<=` can fix this pattern
- Source: mr.grillo, gamemasterplc (2025-06-01)

##### u32 vs unsigned int Stack Size Difference
- `u32` is defined as `unsigned long` in Melee, while `unsigned int` is a different type
- Changing `u32` to `unsigned int` can cause 8-byte stack size differences
- This caused issues during the extern/dolphin merge
- Source: rtburns, ribbanya, 2s2w (2025-06-02)

##### GET_FIGHTER Cast Causing Mismatches
- The `GET_FIGHTER` macro has an ifdef for M2C contexts that adds a cast from `Fighter_GObj*` to `HSD_GObj*`
- This cast is unnecessary for matching because `Fighter_GObj` and `HSD_GObj` are the same struct
- The extra cast can cause extra loads and stack usage issues
- In actual repo code, remove the cast that m2c generates
- When using decomp.me, the context has the M2C version "baked in" which can prevent organic matches
- Source: revosucks, rtburns (2025-06-26)

##### Implicit Function Declarations
- If you call a function without a declaration, the compiler assumes it returns `int`
- This causes extra instructions to convert the assumed int back to the actual return type
- The pattern `xoris on r3 after a function call` is a telltale sign of implicit declarations
- Common culprits: `sqrtf`, `atan2f`, `lbVector_AngleXY`
- Always ensure proper includes for math functions
- Source: gamemasterplc, gelatart, rtburns (2025-06-25)

##### Inlining Heuristics
- mwcc has a "small enough to inline" heuristic
- Functions can be "too large" to auto-inline, but breaking them into smaller inlines can trigger the heuristic
- Using nested inlines (like `ft_SetVec` for vector operations) can make a function small enough to inline
- Assigning a variable inline with a condition check can reduce "line count" for inlining
- Source: revosucks, gigabowser (2025-06-27)

##### addi vs mr Peephole Optimization
- The infamous `mr r3,r4` vs `addi r3,r4,0` replacement is a peephole optimization
- Can be broken by inserting dead code that doesn't get pruned until after the mr/addi pass
- Common workaround: `!gobj;` as a statement (from mwcc-debugger research by cadmic)
- Source: rtburns (2025-06-17)

##### Loop Unrolling Recognition
- Metrowerks aggressively unrolls loops
- A simple `for (i = 0; i < 215; i++) array[i] = 0;` can become 13 iterations with 16 stores each (16 * 13 = 208), plus a cleanup loop
- Look for repeated store patterns and calculate: stores_per_iter * iterations
- The remainder value (like `0xD7 = 215`) often appears in the cleanup loop
- Source: chippy__ (2025-06-19)

##### Bitfield Patterns
- Bitfields often produce weird constant loads that look unfamiliar
- Pattern: `rlwimi` instructions with specific bit ranges
- Define struct members as `: 1` bitfields when you see these patterns
- Source: gamemasterplc (2025-06-29)

##### C++ Exceptions Flag
- Some HSD units were compiled with C++ exceptions enabled
- Look for `extab`/`extabindex` entries in objdiff to identify these
- Affected files: particle, psdisp, and some unsplit HSD files
- No dolphin or game code uses it
- Source: rtburns, ribbanya (2025-06-20-21)

#### 2025-07 (source: 2025-07.md)

##### GET_FIGHTER Macro and HSD_GObjGetUserData Cast Issue
- The cast `(HSD_GObj*)gobj` inside `GET_FIGHTER` causes stack and codegen issues
- **Problem**: `#define GET_FIGHTER(gobj) ((Fighter*) HSD_GObjGetUserData((HSD_GObj*) gobj))` is wrong
- **Correct**: `#define GET_FIGHTER(gobj) ((Fighter*) HSD_GObjGetUserData(gobj))`
- This cast was added for m2c (decompiler) to understand the user_data type, but it breaks real matching
- On decomp.me, the cast cannot be removed due to #ifdef not being supported
- Workaround for decomp.me: define a separate inline `HSD_FGObjGetUserData` that takes `Fighter_GObj*`
- Source: revosucks, altafen, ribbanya (2025-07-03)

```c
// Broken decomp.me version
#define GET_FIGHTER(gobj) ((Fighter*) HSD_FGObjGetUserData((HSD_GObj*) gobj))

// Fixed version for local builds
#define GET_FIGHTER(gobj) ((Fighter*) HSD_FGObjGetUserData(gobj))
static inline void* HSD_FGObjGetUserData(Fighter_GObj* gobj)
{
    return gobj->user_data;
}
```

##### dat_attrs Getter Pattern
- There appears to be a getter inline for `fp->dat_attrs` similar to GET_FIGHTER
- Using `getFtSpecialAttrsD(fp)` with a cast fixes stack issues in some functions
- Example: `ftKb_DatAttrs* dat_attr = (ftKb_DatAttrs*)getFtSpecialAttrsD(fp);`
- This may explain extra stack padding in many fighter functions
- Source: revosucks (2025-07-25, 2025-07-29)

##### Loop Unrolling Conditions
The compiler "likes" to unroll loops when:
- `i` is an int
- Fixed number of iterations, or 0 to some scalar iteration bound
- No function calls in the body of the for loop
- u8 cast on index can trigger unrolling (e.g., `HSD_PadCopyStatus[(u8)i]`)
- Source: rtburns (2025-07-26)

##### Stack Allocation Behavior
- Stack usage increases in "pairs" - 64-bit amounts internally
- PAD_STACK only changes asm in increments of 4, then stays same for next 8
- GET_FIGHTER macro uses stack space, but won't increase overall stack until stack is "used again"
- Source: revosucks, bbr0n (2025-07-24, 2025-07-28)

##### Inline Depth Limit
- Melee's inline depth is approximately 3 levels
- To prevent inlining, nest the function in other inlines until compiler stops
- Static functions without calls can become inlines within the same TU
- Source: ribbanya (2025-07-25)

##### Function Size and Inlining
- Bigger functions won't inline (max inlined function size is compiler-dependent)
- Moving assignments into conditionals can make a function "smaller":
```c
// "Bigger" version
foo = bar;
if (foo < foobar && otherThing() == blah) { ... }

// "Smaller" version - may inline when above won't
if ((foo = bar) < foobar && otherThing() == blah) { ... }
```
- Source: revosucks (2025-07-25)

##### Int to Float Conversion Assembly
- `xoris` and `fsubs` instructions appear for int-to-float conversions
- Compiler uses bitwise operations to move bits to correct float representation
- No int->float register move opcodes exist, so values go through stack
- Source: rtburns (2025-07-28)

##### Debug Symbols (-sym on)
- Use `#pragma sym on` at top of file for line numbers in objdiff
- Or run `python configure.py --debug` to enable `-sym on` projectwide
- WARNING: `-sym on` changes codegen slightly in edge cases - not for matching builds
- Source: rtburns, kooshnoo (2025-07-15)

#### 2025-08 (source: 2025-08.md)

##### cmplwi vs cmpwi for Switch Statements

- Switch statements typically use `cmpwi` (signed compare), even on u32 values
- If you see `cmplwi` (unsigned compare), it's likely an optimization of an if-statement, not a switch
- The pattern `addi r0, rX, -N` followed by `cmplwi` is a common mwcc optimization for range checks like `if (n == 6 || n == 7)`
- No sane dev would write `if ((u32)(n - 6) <= 1)` but that's what the optimizer produces
- Source: .cuyler (2025-08-01)

##### Int-to-Float Conversion Pattern

The sequence `xoris stw stw lfd` indicates an int-to-float/double conversion:
- The `xoris` flips the sign bit, so the source type could be s32, s16, or s8
- Source: roeming (2025-08-02)

##### sqrt Inline Pattern

The following pattern is the `sqrtf` inline using Newton-Raphson iteration:
```c
f1 = __frsqrte(mag_sq);
f0 = f1*f1;
f1 = f3*f1;
f0 = -(mag_sq*f0 - f2);
f1 *= f0;
// ... repeated 2 more times
```
There are approximately 11 different copies of `my_sqrtf` in the codebase due to copy-paste.
- Source: alex_aitch, roeming (2025-08-02)

##### MTXDegToRad Macro

The constant `0.017453292f` comes from the macro:
```c
#define MTXDegToRad(a) ((a)*0.017453292f)
```
Found in `mtx.h`. The constant is pre-computed (PI/180) even at O0.
- Source: gamemasterplc (2025-08-09)

##### Enum Min Consideration

The project may have been built with `-enum min` instead of `-enum int`:
- This shrinks enums from 4 bytes to 1 byte when possible
- Evidence: Many slot_type or ckind values are passed as u8/s8
- Switching requires padding enums with `PAD = S32_MAX` to maintain size
- ~2883 functions break when switching to `-enum min`
- Source: ribbanya, rtburns (2025-08-30)

##### addi/mr Swap Issues

- Passing the result of `GObj_Create` or `LoadJoint` directly into a function instead of creating a temp variable can switch between `addi`/`mr`
- This is a common source of near-matches
- Source: rtburns (2025-08-23)

#### 2025-09-to-2026-01 (source: 2025-09-to-2026-01.md)

##### Debug Symbol Mode Error
When you forget to turn off `-sym on`, you'll see errors like:
```
ERROR Expected to find symbol sqrtf__Ff (type Function, size 0x64) at 0x8000D5BC
ERROR At 0x8000D5BC, found: lbVector_Angle (type Function, size 0x170)
ERROR Instead, found sqrtf__Ff (type Function, size 0x64) at 0x8000E98C
```
- Source: altafen (2025-09-01)

##### Loop Unrolling by MWCC
The compiler takes simple loops and expands/unrolls them for performance optimization:
- The logic around splitting into groups of 8 and handling remainders is part of compiler optimization
- The "real" loop is the smaller loop at the end that handles the remainder
- Write your code as a simple loop; the compiler will handle unrolling
- Source: roeming, antidote6212 (2025-12-20)

##### Signed vs Unsigned Loop Comparisons
If you need a `cmpw` (signed compare) instead of `cmplw` (unsigned compare) in the initial check before loop code, but changing loop vars to `int` breaks the loop unrolling:
```c
while (count-- > 0) {}
```
This pattern was used frequently in mplib for stubborn loops.
- Source: gigabowser (2025-12-21)

##### fmuls Register Order
To get `fmuls f1, f1, f0` instead of storing in f0, try using compound assignment `*=`:
```c
value *= other_value;  // May produce fmuls f1, f1, f0
```
- Source: gigabowser (2025-12-18)

##### Unused Bytecode Interpreter
Melee contains an unused bytecode interpreter (`HSD_ByteCodeEval`) that was part of sysdolphin:
- It's not stripped because RObj has a switch case that could reference it
- The code path is never actually reached in Melee
- Was potentially designed for a scripting language attached to RObjs
- Killer7 also has this code (unreachable) for the same reason
- Source: werewolf.zip, revosucks (2025-09-02)

---

### Compiler Investigation

#### 2021-01-to-04 (source: 2021-01-to-04.md)

##### The 2.2.x Compiler Hunt

This period was dominated by the search for the correct MWCC 2.2.x compiler needed to match Melee's assembly output.

**Key findings:**
- Melee uses a pre-release MWCC 2.2.x compiler, not the publicly available 2.3.3 versions
- The compiler produces scheduling differences in epilogues compared to 2.3.3
- HAL Laboratory likely grabbed an early "release 4" (circa 1998-1999) of the embedded PowerPC compiler before GameCube toolchains were finalized
- Source: revosucks (2021-01-30, 2021-02-01)

**Compiler versions tested:**
```
Version 2.3.3 build 159 (GC CW 1.1) [Runtime Built: Feb 7 2001 12:08:38]
Version 2.3.3 build 144 (GC CW 1.0) [Runtime Built: Apr 13 2000 14:30:41]
```
Neither matched, but 1.0 has the "fixed epilogue scheduling" per release notes.
- Source: werewolf.zip (2021-01-31)

**Search progress (as of 2021-02-11):**
- Mac PPC 2.2 discovered to have strong codegen body similarity (differences only in prologue/epilogue EABI)
- Bob Campbell (Metrowerks) contacted
- Official NXP support ticket opened
- Multiple routes to a working 2.2 compiler identified
- Source: revosucks (2021-02-11)

##### Paired Singles Instructions (psq)

**Key insight:** Paired singles instructions (`psq_l`, `psq_st`, etc.) in Melee appear ONLY in:
1. Prologue/epilogue code
2. Inline ASM
3. SDK library code

The `-proc gekko` flag enables these instructions for mass float operations and optimization, but they are NOT generated in normal function bodies by MWCC.
- Source: gibhaltmannkill (2021-01-31), revosucks (2021-01-30)

**Implication:** If a pre-GameCube embedded PPC compiler is found, the lack of `psq` support can be worked around since these instructions are limited to specific contexts.

### Compiler Version Hunt

#### 2020-08 (source: 2020-08.md)

##### Target: mwcc 2.2 (Metrowerks Embedded PowerPC)
- Melee likely compiled with mwcc 2.2.x, not 2.3.x
- Current project using 2.3.x (CW for Dolphin 1.1/1.3.2)
- mwcc 2.2 may be in "CodeWarrior for Embedded PowerPC" packages, not specifically Dolphin SDK
- Possible sources:
  - Motorola MPC500 development kits
  - M-Core compiler packages older than 2.0
  - General Embedded PowerPC toolchains
- Team searched: eBay, Fiverr, direct emails to former Metrowerks engineers
- Source: revosucks (2020-08-07, 2020-08-19)

##### Version Clues
```
Embedded PPC compiler version 2.3.1 contains all improvements from MacOS "Pro 5" (version 2.3)
```
- Bug fix list for 2.2.2 includes WB1-3126, WB1-3127, IL9901-0077, IL9901-0102
- Source: revosucks (2020-08-08)

## Matching and Decompilation

### Matching Techniques

#### 2020-07 (source: 2020-07.md)

##### The Ten Rules of Matching
```
Rule 1: When in doubt, scrub C
Rule 2: Never assume it won't get optimized out
Rule 3: When the answer is elusive, never rule out a typo
Rule 4: Always be prepared to cram a square peg into a circle hole
Rule 5: If you still can't get it to match, it's a combination you think you tried but haven't
Rule 6: Volatile is a dangerous magic sauce that may explode
Rule 7: If you're afraid you need to use math, be
Rule 8: If you think you understand the compiler, the compiler will tell you you don't
Rule 10: Rule 9 was optimized out
```
Source: revosucks (2020-07-03)

##### Register Allocation Tricks

**Volatile for forcing register usage:**
```c
// Forces specific register ordering in loads
float f0 = ((volatile float *)b)[0];
float f1 = ((volatile float *)a)[0];
```
Source: camthesaxman (2020-07-02)

**Extern vs literal affects fcmpu operand order:**
```c
// Using extern reverses fcmpu operands compared to literal 0.0f
if (lbl_804D7AA8 == f4)  // Uses extern constant
```
Source: camthesaxman (2020-07-02)

**Local array for stack offset control:**
```c
// Using array can force different stack offsets
float foo[2];
foo[1] = sqrtf(...);
// vs single variable which may be placed differently
```
Source: revosucks (2020-07-02)

##### Prologue/Epilogue Scheduling Fix
The main compiler version issue manifests as incorrect epilogue ordering:
```
Expected:          Generated:
addi r1,r1,N       mtlr r0
mtlr r0            addi r1,r1,N
blr                blr
```

**Workaround using postprocessor:** A Python script patches the `.o` files to swap the epilogue ordering.

**Pragma workaround (partial):**
```c
#pragma push
#pragma altivec_codegen on
#pragma altivec_model on
void problem_function(...) {
    // This fixes epilogue for some functions
}
#pragma pop
```
However, this breaks other functions - not a universal solution.
Source: revosucks, werewolf.zip (2020-07-09, 2020-07-29)

##### Control Flow Permutations
Different C constructs produce different codegen:
```c
// Version A - may produce mr. optimization
if (aobj != NULL && aobj->fobj) { ... }

// Version B - may NOT produce mr. optimization
if (aobj) {
    if (aobj->fobj) { ... }
}

// Early return changes codegen
if (!aobj) return;
// ... rest of function
```

The `mr.` instruction (move register and set condition) is an optimization for NULL checks that requires specific C patterns.
Source: werewolf.zip, revosucks (2020-07-03, 2020-07-04)

##### Bitfield Operations
Order of operations matters for register allocation:
```c
// May use different registers depending on ordering
flags &= (AOBJ_LOOP | AOBJ_NO_UPDATE);
aobj->flags = aobj->flags & ~(flags);

// vs
aobj->flags &= ~(flags & (AOBJ_LOOP | AOBJ_NO_UPDATE));
```
Source: revosucks (2020-07-04)

##### Function Prototypes Affect Codegen
**Critical discovery**: Having a function prototype changes prologue scheduling!
```c
// Without prototype - one codegen
void func() { external_call(); }

// With prototype - different prologue ordering
void external_call(void);
void func() { external_call(); }
```
Source: revosucks (2020-07-09)

#### 2020-08 (source: 2020-08.md)

##### Inline Functions for Register Usage
- Inline functions can force specific register allocation patterns
- Using inline accessor functions produces more unique register usage
- Example: `HSD_FObjRemoveAll` needed inline functions to match register usage (r28, r29, r30, r31 vs r0, r31)
```c
inline HSD_FObj *HSD_FObjGetNext(struct _HSD_FObj *fobj) {
    return fobj->next;
}

inline void *HSD_Loop(struct _HSD_FObj *fobj) {
    if (!fobj)
        return;
    HSD_FObjRemoveAll(fobj->next);
    HSD_FObjRemove(fobj);
}
```
- The compiler "unrolls" recursive calls multiple times when using inlines
- Source: revosucks, werewolf.zip (2020-08-11)

##### Array Out-of-Bounds Hack for Stack Matching
- Some functions require UB (undefined behavior) array access to match stack layout
- Example from `func_8000D2EC`:
```c
#ifdef AVOID_UB
    float foo[2];
#else
    float foo[1]; // Uses foo[1] which is out of bounds
#endif
    foo[1] = sqrtf(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
```
- The compiler allocates only 1 float but code accesses `foo[1]`
- This may indicate: (1) programmer misunderstanding of C array initialization, or (2) compiler difference
- The pattern appears in multiple lbvector functions
- Use `#ifdef NONMATCHING` or `#ifdef AVOID_UB` for these cases
- Source: revosucks, camthesaxman (2020-08-07)

##### Volatile Casts for Load/Store Order
- Use volatile casts to force specific load/store ordering:
```c
f0[0] = ((volatile float *)b)[0];
f0[1] = ((volatile float *)a)[0];
```
- Source: revosucks (2020-08-07)

##### Section Pragmas for Init Functions
- Use `__declspec(section ".init")` on function prototypes to place them in .init section:
```c
__declspec(section ".init") void * memset(void * dst, int val, unsigned long n);
```
- mwcc orders explicit section functions first, then non-explicit but specified objects
- Source: revosucks (2020-08-05)

#### 2020-09-to-12 (source: 2020-09-to-12.md)

##### SDA2 Label Adjustments for Inline ASM
- When converting functions to inline assembly, SDA2 (r2) labels may need adjustment
- The next function in sequence can shift r2 references
- Example: Labels `lbl_804DE798` and `lbl_804DE790` needed to become `lbl_804DE790` and `lbl_804DE788` in inline version
- Source: werewolf.zip (2020-11-19)

##### NON_MATCHING Macro Usage
- `NON_MATCHING` was used when functions couldn't be matched, not just as a workaround for SDATA2 splitting
- Example: `random.c` had functions marked non-matching because the assembly showed a variable (`lbl_804DE790`) that wasn't used in the non-matching Randf
- Source: werewolf.zip (2020-12-30)

#### 2021-06-to-10 (source: 2021-06-to-10.md)

##### COMPILER_NONMATCHING Strategy
- When stack ordering differences are caused by the compiler (not the decompiler), functions can be treated as "tentatively matching"
- Proposed `COMPILER_NONMATCHING` define to separate functions that are correct but don't byte-match due to compiler bugs
- This allows progress toward a shiftable build while waiting for the matching compiler
- Source: werewolf.zip (2021-09-14)

##### Pragmatic Decompilation Approach
- The majority of code matches with current compilers
- Non-matching functions can include inline ASM while continuing decompilation
- Goal: shiftable game that compiles with any compiler, even if hash doesn't match
- Source: camthesaxman (2021-08-25)

#### 2021-11 (source: 2021-11.md)

##### Loop Unrolling Prevention via Struct Copy
- Metrowerks compiler unrolls normal loops in certain cases
- Workaround: Use manually casted pointer struct copy instead of a loop

```c
// Copy the attributes using the specified type, and set
// the pointer appropriately. We have to use a manually
// casted pointer struct copy since Metrowerks seems to
// be unable to avoid unrolling with a normal loop.
#define SET_ATTRIBUTES(type)                         \
{                                                    \
    type *dest =                                     \
        (type *)player->special_attributes2;         \
    type *src =                                      \
        (type *)player->ftDataInfo->charAttributes;  \
    u32 *attr =                                      \
        (u32 *)&player->special_attributes1;         \
    *dest = *src;                                    \
    *attr = (u32)dest;                               \
}
```
Source: werewolf.zip (2021-11-07)

##### Inline ASM Jump Table Labels
- Problem: Jump tables in inline ASM functions can't use global labels for case addresses
- Solution: Use offset from function start label instead of direct labels

```asm
// Instead of direct address:
.4byte 0x803652E4

// Use label + offset (makes function shiftable as a unit):
.4byte lbl_80001234+20
```
Source: epochflame (2021-11-06)

#### 2021-12 (source: 2021-12.md)

##### Inline Function Matching
- Duplicated code pieces that cause codegen problems should be tried as inlines
- Source: revosucks (2021-12-13)

##### Loop Detection
- The `bdnz` instruction indicates a counted loop
- Source: epochflame (2021-12-14)

##### Float Bit Manipulation Pattern
- Storing a float to stack, then loading as both u32 and float indicates either:
  - Pointer cast: `*(int *)&floatVar`
  - Union type punning

```c
// Pattern seen in MSL math functions:
// stfs f1, 8(r1)   - store float
// lwz  r0, 8(r1)   - load as int (bit manipulation)
// lfs  f6, 8(r1)   - load as float again
```
- The `lwz` loading a stored float is intentional for bit manipulation (like 1.0f -> 0x3f800000)
- Source: seekyct (2021-12-16)

##### __HI and __LO Macros
- Sun Microsystems fdlibm uses macros that can appear on the left side of assignment:
```c
#define __HI(x) *(1+(int*)&x)
#define __LO(x) *(int*)&x

// Usage:
__HI(x) = hx;  // Expands to: *(1+(int*)&x) = hx;
```
- Source: fluentcoding (2021-12-15)

##### Unused Arguments
- Some functions compile with matching even without the unused parameter
- If m2c shows a parameter that isn't used, try removing it
- Source: chrisnonyminus (2021-12-12)

##### Implicit Parameter Passing
- The compiler often doesn't set up parameters if they're already in place
- Example: if r3 already contains the right value from a previous operation, the compiler won't explicitly set it again before a function call
- Source: seekyct (2021-12-12)

##### Float Parameters Start from f1
- Float parameters use f1, f2, etc. - NOT f0
- f0 is not used for parameter passing
- Source: seekyct (2021-12-30)

#### 2022-01 (source: 2022-01.md)

##### Regalloc Forcing Trick

To force register allocation to stay the same without changing semantics, use a no-op expression:
```c
// Instead of:
t &= w;

// Use:
t & w;  // Result isn't saved, compiler optimizes it out but leaves regalloc intact
```
- This can help match when you have regalloc differences that seem like typos
- Source: werewolf.zip (2022-01-05)

##### Subtracting l1 Position for Regalloc

```c
// Sometimes swapping which operand is on the left vs right matters
// If regalloc is wrong, try swapping l1 from left to right position
```
- Source: werewolf.zip (2022-01-03)

##### Static Constant Literals

Be careful with constant literals - forgetting `0x` prefix changes the value:
```c
// WRONG - decimal literal
#define K1 80808080

// CORRECT - hex literal
#define K1 0x80808080
```
- This caused a single-word DOL mismatch at offset 0x430B78
- Source: waynebird, epochflame (2022-01-15)

##### fpclassify / Float Classification

- `fpclassify` is often inlined everywhere and may not exist as a standalone function
- Look for it in pikmin2 headers: `include/Dolphin/float.h`
- It's likely implemented as a switch statement
- Source: kalua, epochflame, gibhaltmannkill (2022-01-05)

##### Finding Function Names

1. Generate a map file: `make -j4 GENERATE_MAP=1`
2. Search the map for the address (case insensitive)
3. Static functions won't appear in the map
4. Each function address appears in ASM comments: `/* 800438D4 00040834 ... */`
- Source: camthesaxman, revosucks (2022-01-07)

#### 2022-02 (source: 2022-02.md)

##### sdata2 Float Literal Technique
To match functions that use shared float literals while only partially decompiling a file:

1. Split the .sdata2 section into a separate .s file containing data BEFORE your function's floats
2. Place your .c file after that .s file in obj_files.mk
3. Place the remainder of the original .s file after your .c file
4. Comment out the float definitions in the .s file that your .c file now provides

Alternative approach using linker symbols:
```asm
/* In your .s file, replace: */
lfs f2, lbl_80123468@sda21(r2)
/* With: */
lfs f2, lbl_80123468-_SDA2_BASE_(r2)
```
Then define the addresses in the linker script.
Source: camthesaxman (2022-02-19)

##### Inline ASM with Negative Floats
- Negative float literals don't work directly in inline asm: `lfs f5, -2.0f` fails
- Hex literals also don't work (become 0.0f)
- Solution: Use hardcoded SDA2 offsets:
```c
#define SDA2_BASE_LD 0x804DF9E0
#define asm_lbl_804D7FAC (0x804D7FAC - SDA2_BASE_LD)

// Then in inline asm:
lfs f5, asm_lbl_804D7FAC(r2)
```
Source: rtburns (2022-02-23)

##### String Literal Alignment in decomp.me
- Strings go to .sdata if small enough, .data if too large
- "fighter sub color num over!" goes to .data (too large)
- "jobj" goes to .sdata
- Use fake char* declarations to align .data offsets in decomp.me:
```c
// Incorrect strings here to get offset from data start to align
char* x = "PlCo.dat";
char* y = "ftLoadCommonData";
```
Source: snuffysasa, epochflame (2022-02-22)

##### File Ordering in obj_files.mk
- Objects must be in exact linker order
- When moving functions from .s to .c: src/.../file.o must come BEFORE asm/.../file.o
- Functions in .c are placed in order they appear; putting them out of order breaks matching
- Source: tri_wing_, altatwo (2022-02-19)

##### Inline ASM Requirements
- `nofralloc` must be first directive in inline asm functions
- Use `#pragma peephole on` after inline asm functions
- Source: kalua (2022-02-14)

##### fctiwz Instruction
- `fctiwz` is float-to-int conversion with truncation toward zero
- Converts 32-bit float to 32-bit signed integer
- Appears when casting float to int
- Source: tri_wing_, kalua (2022-02-21)

##### memcpy for Struct Assignment
- `__memcpy` calls often indicate struct assignment
- Original programmers likely used direct struct assignment, not explicit memcpy
- Source: altatwo (2022-02-22)

##### Const Variables and Stack
- Declaring something `const` allocates stack space but compiler puts value in-place
- Results in unused stack space in the final code
- Source: werewolf.zip (2022-02-20)

#### 2022-03 (source: 2022-03.md)

##### Permuter for Line Reordering
- A brute-force permuter can try all orderings of lines to find matches.
- 10! (3,628,800) permutations took ~8 hours on 32 cores at 40 iterations/second.
- Useful for struct initialization functions where line order affects codegen.
- Source: snuffysasa (2022-03-08)

Simple JavaScript permuter:
```js
const make_permutations = arr => {
    if (arr.length <= 2) return arr.length === 2 ? [arr, [arr[1], arr[0]]] : arr;
    return arr.reduce(
        (acc, item, i) =>
        acc.concat(
            make_permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map(val => [
            item,
            ...val,
            ])
        ),
        []
    );
};
```

##### Splitting Functions into Inlines
- Splitting a large function into multiple top-level inlines (not deeply nested) can affect instruction scheduling.
- This approach is suggested when `mr` placement doesn't match and seems to start a new logical block.
- Source: werewolf.zip (2022-03-08)

##### Repeating Expressions for Register Allocation
- Repeating an expression twice can change register allocation or convert `addi` to `mr`.
- Example scratch: https://decomp.me/scratch/Wx1iY
- Source: altafen (2022-03-08)

##### Address vs Value Loading
- When assertion strings reference struct fields, ensure you're loading the address (`&fighter->field`) rather than the value.
- Wrong: `fighter_r30->x20A4` (loads value)
- Correct: `&fighter_r30->x20A4` (loads address)
- Source: rtburns (2022-03-26)

##### Array Indexing for Struct Access
- When accessing via `lwzx` (indexed load), the pattern is typically array of structs indexed by a value:
```c
// Instead of using a flag directly as index:
fighter->x5E8_fighterBones[costume_id].x0_joint
```
- Source: rtburns (2022-03-16)

##### Minimizing Code to Isolate Diffs
- Delete as much function code as possible while retaining the diff to narrow down the problem area.
- Try the opposite too: comment out as much as possible while still having the diff appear.
- Source: epochflame (2022-03-08)

#### 2022-04 (source: 2022-04.md)

##### Chain Assignments Fix Register Order
- Chain assignments like `a = b = c = d = 1;` produce different codegen than separate assignments.
- This can fix `lwz` instruction positioning issues.
- The nested structure `a = (b = (c = (d = 1)));` makes the code generator do different things.
- Source: snuffysasa, revosucks (2022-04-15)

```c
// This produces different asm than separate assignments:
fighter->x2340 = fighter->x2344 = fighter->x2348 = fighter->x234C = 0;
```

##### Ternary for bne/b Pattern
- A `bne` immediately followed by `b` suggests a ternary expression or specific inline pattern.
- Source: epochflame, snuffysasa (2022-04-12)

```c
// Creates bne/b pattern:
inline f32 get_value(s32 condition) {
    return condition ? value1 : value2;
}
```

##### cntlzw Pattern (Count Leading Zeros)
- The `cntlzw` instruction appears in `== 0` comparisons without branches.
- Pattern: if value is zero, `cntlzw` returns 32; shifting right by 5 gives 1.
- Use `bool result = (thing == 0);` to generate this pattern.
- Source: ninji, epochflame (2022-04-18)

```c
// This generates cntlzw:
bool is_zero = (some_value == 0);
```

##### beqlr and bnelr
- These are "branch if equal/not-equal to link register" - conditional early returns.
- Equivalent to `if (condition) return;` with the return jumping to lr.
- Source: revosucks, antidote6212 (2022-04-15)

##### Struct Copy vs Element Copy
- `lwz/stw` instructions on Vecs usually means struct copy, not individual element access.
- Copy entire Vec as struct: `dest_vec = src_vec;` instead of `dest_vec.x = src_vec.x;` etc.
- Source: rtburns (2022-04-12)

##### Assignment in if Statement
- `if (ptr = some_func())` is valid C that both assigns and checks.
- Parentheses tell the compiler "I know what I'm doing" and suppress warnings.
- This pattern generates different code than separate assignment + check.
- Source: antidote6212, camthesaxman (2022-04-18)

##### Float/Int Conversion Pattern
- `lfd` instructions involving stack and `lbl_804D8278` (or similar) are float/int conversions.
- `xoris` indicates signed (s32) to float conversion.
- Unsigned (u32) to float is the same but without xoris (and different magic constant).
- Source: rtburns, altafen, moester_ (2022-04-12)

##### Regalloc Fix: GObj->hsd_obj Inline
- If having regalloc trouble with `jobj = gobj->hsd_obj`, try using an inline getter:
```c
inline HSD_JObj* get_jobj(HSD_GObj* gobj) {
    return gobj->hsd_obj;
}
```
- This fixed multiple trouble functions.
- Source: altafen (2022-04-24)

##### fabsf (Float Absolute Value)
- Use the `__fabs` intrinsic for float absolute value, not the `fabs` function call.
- `fabs()` will generate a `bl fabs` call; the intrinsic generates inline code.
- Source: epochflame, revosucks (2022-04-16)

##### Inline Asm with @sda21
- For inline asm, you don't need `@sda21(r2)` - that's only for standalone assembly.
- Remember to `#pragma peephole on` after inline asm blocks.
- Source: seekyct, altafen (2022-04-15)

#### 2022-05 (source: 2022-05.md)

##### PUSH_ATTRS Macro Discovery
- A common pattern was discovered across all fighter OnLoad functions:
```c
#define PUSH_ATTRS(ft, attributeName)                                      \
    do {                                                                   \
        void *backup = (ft)->x2D8_specialAttributes2;                      \
        attributeName *src = (attributeName*)(ft)->x10C_ftData->ext_attr;  \
        void **attr = &(ft)->x2D4_specialAttributes;                       \
        *(attributeName *)(ft)->x2D8_specialAttributes2 = *src;            \
        *attr = backup;                                                    \
    } while(0)
```
- Works for nearly all fighters (Peach, Mars, Pikachu, Fox, Falcon, Ness, etc.)
- MasterHand required slight variation
- Emphasizes importance of pattern matching across similar functions over individual matches
- Source: revosucks, snuffysasa (2022-05-20, 2022-05-21)

##### Self-Assignment for Register Allocation
```c
fighter_data3 = fighter_data3;
```
- Assigning a variable to itself can fix register allocation issues
- Seems absurd but sometimes required for matching
- Source: vetroidmania, revosucks (2022-05-25)

##### Triple Equals for Register Swaps
```c
var == 0;  // Statement with no side effect
```
- Using a comparison statement (not assignment) can fix register swap issues
- Common trick when permuter can't find solution
- Source: snuffysasa (2022-05-23)

##### `getFighter` Inline Function
```c
inline Fighter* getFighter(HSD_GObj* fighterObj) {
    return fighterObj->user_data;
}
```
- Used across fighter code for getting Fighter pointer from GObj
- Must have `inline` keyword or linker will complain about redefinition
- Sometimes required to match register allocation
- Source: chrisnonyminus, snuffysasa (2022-05-22)

##### Switch Statement Patterns
- Small switches (2-3 cases) get optimized into comparison trees
- Compiler may reorder case checks as `if value != X`
- Range checks indicate consecutive case values:
```c
// If you see range comparison in ASM, all cases in range are handled:
switch(ASID) {
    case 0x166:
    case 0x167:
    // ... all values through ...
    case 0x16F:
        // same code
        break;
}
```
- Jump tables generated when ~5+ consecutive cases exist
- Source: revosucks, gamemasterplc (2022-05-22)

##### Jump Table Tricks
```c
// To get combined cases with jump table:
case 6:
default:
    return attr->x14;
```
- Combining a case with default can produce correct jump table output
- Source: chippy__ (2022-05-30)

##### Ternary Returns
```c
return (cond) ? returnThisIfTrue : thisIfFalse;
```
- Sometimes switch cases that look like if/else are actually ternary returns
- Check if phi variables can be replaced with ternary assignment
- Source: revosucks (2022-05-23)

##### sqrtf Inline with Volatile
```c
// From math.h:
extern inline f32 sqrtf(f32 x) {
    volatile float y;  // Forces stack usage
    // ...
}
```
- The `volatile float y` forces the variable onto the stack instead of being optimized into a register
- This is how the original implementation worked
- Source: kiwidev (2022-05-26)

##### SDA Register Loading
- `r13` is for `.sdata/.sbss` (mutable data)
- `r2` is for `.sdata2` (immutable/const data)
- For external SDA data:
```c
// Wrong (produces addi):
extern CreateItemUnk lbl_804D6D28;
temp = &lbl_804D6D28;

// Correct (produces lwz):
extern CreateItemUnk *lbl_804D6D28;
temp = lbl_804D6D28;
```
- Source: gibhaltmannkill, revosucks (2022-05-31)

##### Struct Copy vs Pointer Assignment
- `*dest = *src` for struct copy generates different code than memcpy
- Cannot always use `__memcpy()` intrinsic as substitute
- Sometimes need specific variable declarations/ordering to match
- Source: revosucks (2022-05-21)

##### Extern Float Labels
- When floats are in assembly but function is in C, use:
```c
extern f32 lbl_xxxx;
```
- This may alter codegen slightly; verify match on decomp.me
- Will need to remove externs once entire file is in C
- Source: snuffysasa (2022-05-22)

#### 2022-06 (source: 2022-06.md)

##### Register Swap Solutions

###### Using Inline Functions
- Inline functions for getting data pointers can fix register allocation:
```c
inline Item* GetItemData(HSD_GObj* item_gobj) {
    return item_gobj->user_data;
}

inline HSD_JObj* GetItemJObj(HSD_GObj* item_gobj) {
    return item_gobj->hsd_obj;
}

// Combined inline for setting both pointers
inline void SetPointers(HSD_GObj* item_gobj, HSD_JObj** item_jobj, Item** item_data) {
    *item_jobj = GetItemJObj(item_gobj);
    *item_data = GetItemData(item_gobj);
}
```
- Source: revosucks (2022-06-11)

###### Void Cast Trick
- Casting return values to void can change stack allocation:
```c
inline HSD_JObj *getHSDJObj(HSD_GObj* hsd_gobj) {
    HSD_JObj *hsd_jobj = hsd_gobj->hsd_obj;
    return (void *)hsd_jobj;  // void cast affects codegen
}
```
- Source: revosucks (2022-06-18)

##### Float Comparison Without Suffix
- For float comparisons, sometimes omitting the `f` suffix matches better:
```c
// This might not match:
if (item_data->xD3C_spinSpeed != 0.0f)

// Try this instead:
if (item_data->xD3C_spinSpeed != 0.0)
```
- Source: vetroidmania, revosucks (2022-06-11)

##### Stack Filler Reduction with Macros
- Repetitive stick assignments can use macros to reduce fake filler:
```c
#define SET_STICKS(stickXPtr, stickYPtr, x, y) \
    do { \
        f32 *stickX = &stickXPtr; \
        f32 *stickY = &stickYPtr; \
        *stickX = x; \
        *stickY = y; \
    } while(0)
```
- Each use of this macro saves ~2 words of filler
- Source: revosucks (2022-06-24)

##### Backward Store Chains
- Backward stores (z then y then x) indicate chain assignment:
```c
// Assembly shows: stw z, stw y, stw x (backwards)
// C code is:
fighter->x74_anim_vel.x = fighter->x74_anim_vel.y = fighter->x74_anim_vel.z = 0;
```
- Source: revosucks (2022-06-24)

##### Switch Statement Patterns
- Optimized switch blocks can be tricky - branches past the function end indicate unusual structure
- Sometimes a switch appears as nested if/else with specific comparison order
- Example: Check `>= 3` first, then `== 0`, then handle remaining cases
- Source: chippy__, vetroidmania, amber_0714 (2022-06-16, 2022-06-21)

##### Function Argument Ordering with Floats
- Floats use FPRs, integers use GPRs - they can be freely reordered in declarations
- Changing float position in signature doesn't break functional equivalence
- BUT it can affect evaluation/load order of arguments:
```c
// These are called identically:
void func(int x, float y, int z);
void func(int x, int z, float y);
// Both result in: r3=x, r4=z, f1=y

// BUT evaluation order differs - check for mismatched loads before calls
```
- Source: kiwidev (2022-06-15)

##### Comma Operator in For Loops
- Use comma operator to increment multiple variables:
```c
for (i = 0; i < count; i++, dynamicBones++) {
    // ...
}
```
- The comma operator evaluates left to right, returns rightmost value
- Source: kiwidev, gibhaltmannkill (2022-06-15)

##### Identifying Inlined Code
- Look for "variable hoisting" - vars initialized at scope start but used much later
- Repeated code patterns across scopes often indicate inlined static functions
- "One is an anomaly, two is a coincidence, three is a pattern"
- Move repeated patterns to their own static functions and let the compiler inline them
- Source: revosucks (2022-06-15, 2022-06-18)

#### 2022-07 (source: 2022-07.md)

##### Float Absolute Value Bit Hack
- Melee (but not later games like KAR) uses a bit manipulation macro for float absolute value:
```c
#define ABS(x) *(u32*)&x = *(u32*)&x & ~0x80000000;
```
- This generates `clrlwi` to clear the sign bit
- Later HSD versions (GNT4, Kirby Air Ride) use standard `fabs`/`fabsf`
- Source: amber_0714, vetroidmania (2022-07-02)

##### 3x4 Matrix Inverse Function (func_80379310)
- A notoriously difficult function calculating 3x4 matrix inverse with inline determinant
- Required extremely ugly nested calculations to match
- The determinant formula was written in non-standard order
- Uses the float bit hack for absolute value
- Source: amber_0714, vetroidmania (2022-07-01 through 2022-07-08)

##### fnmsubs vs fmsubs
- To get `fnmsubs` (floating negative multiply-subtract), can try `__fnmsubs()` intrinsic
- This was needed for some matrix functions
- Source: revosucks (2022-07-03)

##### Stack Alignment and Inlines
- Stack is allocated in 8-byte increments
- When compiler considers a function "unsafe" (certain conditions), stack becomes unconsolidated
- Adding filler variables (2 at a time for 8-byte alignment) can help match stack size
- Using inlines reserves additional stack space that may or may not be optimized away
- Source: revosucks (2022-07-01, 2022-07-21)

##### Double-Initialization Pattern
- Some functions require strange patterns like `Fighter* fp = fp = GET_FIGHTER(gobj);`
- This may indicate an inline function that itself does the assignment
- The double assignment generates specific register moves
- Source: revosucks, allocsb (2022-07-25-26)

##### Switch Statement Detection
- Chains of `beq`/`b` branches often indicate switch statements
- If cases are contiguous (0,1,2,3...), compiler may optimize to jump table
- Otherwise generates binary search pattern with nested if-else
- Source: kiwidev (2022-07-21)

##### Return Statement Stack Artifact
- A `return;` statement inside an if block can leave behind a `cmpwi r3,0` with no following branch
- The comparison instruction remains even after optimization removes the branch
- Source: ninji (2022-07-05)

##### Unused Variable Trick
- Declaring unused variables can affect register allocation and stack usage
- `s32 unused[2];` or similar padding can force specific stack layout
- Source: revosucks (2022-07-04)

#### 2022-08 (source: 2022-08.md)

##### The (s64) Cast / 64-bit AND Trick
- Adding `(s64)` cast or `& 0xFFFFFFFFFFFFFFFF` can fix certain regswaps
- This is traditionally an "IDO trick" but works with Metrowerks in some cases
- Source: altafen (2022-08-14)

##### Explicit (s32) Casts on Division
- Removing explicit `(s32)` cast from division can change generated code even when the variable is already s32
- Example: `(s32) temp_r6 / 60` generates different code than `temp_r6 / 60` even if temp_r6 is s32
- Source: waynebird (2022-08-14)

##### Local Variables for Struct Literals
- Struct literals in rodata are deduplicated across functions but not within the same function
- To match code that reuses the same literal values, assign to local variables:

```c
Vec const position = {0.0F, 0.0F, 0.0F};
Vec const interest = {0.0F, 0.0F, 0.0F};

void HSD_LObjGetLightVector(HSD_LObj *lobj, VecPtr dir)
{
    Vec p = position;
    Vec i = interest;
    // use p and i instead of position and interest
}
```

- Source: rtburns (2022-08-23)

##### MIN/MAX Macros
- Using `#define MIN(a,b) ((a)<(b)?(a):(b))` can help match certain patterns
- Always properly parenthesize macros:
  - Wrap the whole expression in parentheses
  - Wrap each argument usage in parentheses
  - Ideally only use each argument once

```c
#define CLIFFCATCH_0(fp) (((fp)->x2C < 0) ? LEFT : RIGHT)
```

- Source: altafen, kiwidev (2022-08-21)

##### Matching Animate Inlines
- Pattern of "read from jobj, call HSD_AObjReqAnim, call HSD_AObjSetRate" is often an inline function
- Source: altafen (2022-08-14)

##### Prototype for __frsqrte
- If permuter chokes on `__frsqrte`, add a prototype:

```c
double __frsqrte(double);
```

- Source: camthesaxman (2022-08-14)

#### 2022-09 (source: 2022-09.md)

##### HSD_JObjSetMtxDirty - Inline vs Define
- Evidence suggests `HSD_JObjSetMtxDirty` should be a **define**, not an inline function in Melee's version
- Using a define fixes the fighter.c inline problem and other functions
- `HSD_JObjSetupMatrix` appears to be a real inline
- This may be a leftover from an earlier sysdolphin version where macros were defines instead of inlines
- Source: revosucks (2022-09-03, 2022-09-10)

Define version that works:
```c
#define HSD_JObjSetMtxDirty(jobj)                       \
{                                                       \
    if (jobj != NULL && !HSD_JObjMtxIsDirty(jobj)) {    \
        HSD_JObjSetMtxDirtySub(jobj);                   \
    }                                                   \
}
```

##### Fighter Pointer Initialization Patterns
Three common patterns for fighter pointer initialization:
1. `fp = gobj->user_data`
2. `fp = getFighter(gobj)`
3. `fp = fp = getFighter(gobj)` (double assignment)

Sometimes also: `fp = fp = gobj->user_data`

The double assignment pattern is needed for certain register allocation behaviors.
- Source: revosucks (2022-09-24)

##### Float Constant Sharing Between ASM and C
- For functions mixing ASM and C that need to share float constants:
  1. Inline the float in C
  2. Put a `.set lbl_DEADBABE` in a .s file pointing to the offset of the inlined float
  3. Use `extern f32 lbl_DEADBABE;`
- This allows C functions to use the inlined float while ASM functions secretly also use it
- Source: ribbanya (2022-09-01)

##### Inline ASM Data Access
- Keep `@ha` / `@l` suffixes when accessing labels that are too large for single instruction loading
- Only remove `@sda21` suffixes when converting to inline asm
- Arrays with explicit size `[32]` can cause linker errors; use `extern u8 lbl_xxx[];` instead
- Source: rtburns (2022-09-15)

Example declarations that work:
```c
extern u8 lbl_803B75C0[];
extern f32 lbl_804D9A28;
```

##### Static Callbacks
- Static callback functions don't need `.global` in assembly
- Whether a symbol is local/global doesn't affect the resulting bits in the DOL
- Use `static` in C to force file-local, but it typically doesn't affect codegen
- Source: encounter, altafen (2022-09-19)

#### 2022-10 (source: 2022-10.md)

##### Inline ASM in C Files
Moving assembly to inline asm in C files enables partial progress:
```c
asm void FunctionName(void) {
    // assembly here
}
```
- Syntax differs from gas assembler: use `asm void` not `void asm`
- Return type goes before `asm` keyword: `asm HSD_GObj* funcname(...)`
- Callers will typecheck against the signature even though function body is asm
- Source: ribbanya, altafen, rtburns (2022-10-23)

##### Inline ASM Caveats
- `@sda21` relocs need to be removed from inline asm
- Float constants from sda2 can be replaced with numeric literals
- Jump tables require special handling: use `entry` keyword instead of colons
- Jump table documentation: p.384 of CWMCUCFCMPREF.pdf (NXP reference manual)
- Inline asm functions don't get reordered like C functions
- Source: rtburns, ribbanya, seekyct (2022-10-23, 2022-10-26)

##### Negative Float Bug in Older CW
Older CodeWarrior versions have a bug with negative floats in inline asm:
- Need to use "manual" option where you define float order includes
- The asm refers to those floats via an orderfloats include
- Source: seekyct (2022-10-26)

##### Context Generation for decomp.me
To generate context for decomp.me:
```bash
gcc -E -P include/melee/ft/fighter.h > ctx.c
```
- Include paths may need `-I` flags
- Some declarations cause errors (like `@address` syntax)
- Replace `OSContext* OS_CURRENT_CONTEXT @ 0x800000D4;` with `OSContext* OS_CURRENT_CONTEXT = (OSContext*)0x800000D4;`
- Source: rtburns, yoyoeat, ribbanya (2022-10-15, 2022-10-28)

##### Hermite Spline Match
```c
f32 splGetHermite(f32 fterm, f32 time, f32 p0, f32 p1, f32 d0, f32 d1)
{
    f32 fVar1;
    f32 fVar2;
    f32 fVar3;
    f32 fVar4;

    fVar1 = time * time;
    fVar2 = fterm * fterm * fVar1 * time;
    fVar3 = 3.0f * fVar1 * fterm * fterm;
    fVar4 = fVar2 - fVar1 * fterm;
    fVar2 = 2.0f * fVar2 * fterm;
    return d1 * fVar4 + d0 * (time + (fVar4 - fVar1 * fterm)) + p0 * (1.0f + (fVar2 - fVar3)) + p1 * (-fVar2 + fVar3);
}
```
- Function name is `splGetHermite` (note: spelled "Helmite" in original but should be "Hermite")
- Source: werewolf.zip, gibhaltmannkill (2022-10-28)

#### 2022-11 (source: 2022-11.md)

##### getFighter Inline Cast Pattern
- Many fighter functions require a cast after `getFighter()` to match correctly
- Pattern: `Fighter* fp = (void*)getFighter(fighter_gobj);` or `Fighter* fp = (Fighter*)getFighter(fighter_gobj);`
- The cast "fixes" codegen because `user_data` in GObj is `void*`
- Different functions may need different cast variations:
  - Some work with `(void*)` cast
  - Some work with `(Fighter*)` cast
  - Some work with neither
- An inline wrapper for `Fighter_GetModelScale` was discovered to work for multiple functions:
```c
inline float _Fighter_GetModelScale(void *ft) {
    return Fighter_GetModelScale(ft);
}
```

##### Special Attributes Access Pattern (sa union debate)
- Long discussion about whether `fighter.h` should use unions for special attributes or just `char[0x100]` buffer with casts
- Arguments for unions: Direct access like `fp->sa.ness.x222C`
- Arguments for casting buffer: Better dependency isolation, each character only knows their own attrs
- Casting approach works and matches:
```c
// In fighter.h
char sa[0x100];

// In character code
ftPeachAttributes* attrs = (ftPeachAttributes*)fp->sa;
```
- Using temp variables for cast can affect codegen around function calls (may invoke savegpr)
- Macro approach: `MY_ATTRS(fp)` that does the cast inline per-access

##### Chained Assignment for Flags
- Chained flag assignments can fix matches:
```c
gproc->flags_1 = gproc->flags_2 = 0;  // Instead of separate assignments
```

##### Unused Stack Space Solutions
- Extra stack space often indicates missing temps or inlines
- Using temp variables for flag initialization can eliminate unused stack:
```c
s32 init_flag1_2 = 0;
s32 init_flag3 = 3;
gproc->flags_1 = gproc->flags_2 = init_flag1_2;
gproc->flags_3 = init_flag3;
```

##### Inline Allocation Pattern (HSD style)
- HSD functions do ObjAlloc and null check in the same inline:
```c
static inline struct HSD_GObjProc *HSD_GObjProcAlloc(void) {
    struct HSD_GObjProc* gproc;
    gproc = (struct HSD_GObjProc*)HSD_ObjAlloc(&gobjproc_alloc_data);
    if (gproc == NULL) {
        __assert("gobjproc.c", 0x1FU, "gproc");
    }
    return gproc;
}
```

##### VecClear/VecSet Usage
- `HSD_VecSet(Vec *v, float x, float y, float z)` exists and inlines
- Can help match functions with extra stack by replacing manual vector initialization

#### 2022-12 (source: 2022-12.md)

##### User Data Access Patterns (getFighter)

Major discovery: HAL likely used a consistent pattern for accessing gobj user_data:

```c
inline void* HSD_GobjGetUserData(HSD_GObj* gobj) {
    return gobj->user_data;
}

#define GET_FIGHTER(gobj) ((Fighter*)HSD_GobjGetUserData(gobj))
```

Key findings:
- The cast `(Fighter*)` is required, not optional - it affects regalloc and stack allocation
- Both `(void*)getFighter()` and `(Fighter*)getFighter()` patterns exist
- Direct `gobj->user_data` access vs the macro produces different codegen
- The `fp = fp = getFighter(gobj)` double assignment was a known fakematch that got fixed with proper access patterns

Source: revosucks, ribbanya, altimor (throughout December)

##### Condition Splitting

Splitting compound conditions can fix matches:

```c
// Instead of:
if ((temp_r0 != 0U) &&
    (func_800C0A28(fighter_gobj, temp_r0, p->unk4) != 0) &&
    (p->f_unk8(temp_r0, fighter_gobj, (f32*)&floats_on_stack) != 0))

// Try splitting:
if (p->unk0) {
    if ((func_800C0A28(fighter_gobj, temp_r0, p->unk4) != 0) &&
        (p->f_unk8(temp_r0, fighter_gobj, (f32*)&floats_on_stack) != 0)) {
```

Source: chippy__ (2022-12-23)

##### Wrapper Functions for Inlining

Some functions are wrappers that inline their entire body into another function:

```c
// The "setBit" inline solved a recursive function matching problem
inline void setBit(HSD_GObj* gobj) {
    Fighter* fp = (Fighter*)getFighter(gobj);
    fp->x2219_flag.bits.b7 = 1;
}
```

- When a function recursively calls itself, using getFighter can bloat the stack 3x
- Assignment within function call can force specific codegen: `setBit(newgobj = fp->x1A5C);`

Source: revosucks, chippy__ (2022-12-02)

##### Switch vs If/Else Detection

Tightly-knit if/else comparisons are often unrolled switches:

- The compiler may generate similar code for both
- Reordering switch cases affects comparison order in generated code
- For unsigned variables, `case < 1` implies `case 0`
- Use `-sym on` in compiler options to see line-to-instruction mapping

Source: revosucks (2022-12-02)

##### Temporary Variable Elimination

After getting m2c output to compile, eliminate as many temporaries as possible:

- 90% of the time, cleaned-up output matches better
- The decompiler adds cruft that doesn't represent original code
- The compiler tends to lookahead (peephole optimization) and may early-load variables

Source: revosucks (2022-12-02)

#### 2023-01 (source: 2023-01.md)

##### User Data Access Pattern - Major Discovery
- **Critical finding**: The correct pattern for accessing fighter/item user data is:
  ```c
  Fighter* fp = (Fighter*)HSD_GObjGetUserData(fighter_gobj);
  ```
- NOT using `getFighter()` macro directly
- The explicit cast + inline getter is what HAL used
- This pattern fixes stack allocation issues and eliminates many fake matches in fighter.c
- Verified by Smash 64 decomp which shows identical pattern
- Source: rtburns, revosucks (2023-01-11, 2023-01-13)

##### HSD_GObjGetHSDObj Pattern
- Similarly, HSD object access should use:
  ```c
  HSD_JObj* jobj = (HSD_JObj*)HSD_GObjGetHSDObj(fighter_gobj);
  ```
- Using this pattern eliminates silly temp variables and fixes stack issues
- Source: rtburns, revosucks (2023-01-11)

##### Const Parameter for Inlines
- Adding `const` to inline function parameters can help with matching:
  ```c
  static inline void* HSD_GObjGetUserData(HSD_GObj* const gobj)
  {
      return gobj->user_data;
  }
  ```
- Source: ribbanya (2023-01-13)

##### Callback Comparison Pattern
- Some callbacks need a weird comparison pattern to match:
  ```c
  void (*cb_EnterAir)(HSD_GObj*);
  cb_EnterAir = item_data->xB8_itemLogicTable->x20_callback_EnterAir;
  !cb_EnterAir;  // This statement needed for match
  if (cb_EnterAir != NULL) {
      cb_EnterAir(item_gobj);
  }
  ```
- However, this is often a fake match that can be fixed by using proper inline accessors
- Source: rtburns (2023-01-11)

##### Double JObj Access Pattern
- Some functions have a weird pattern where jobj is assigned twice:
  ```c
  HSD_JObj* jobj = (HSD_JObj*)HSD_GobjGetHSDObj(fighterObj);
  // ...
  jobj = (HSD_JObj*)HSD_GobjGetHSDObj(fighterObj);
  ```
- This usually implies an inline somewhere, but the standard inline rules don't apply (inlines reserve 8-byte increments, not 4)
- This is still an unsolved mystery for some functions
- Source: revosucks, ribbanya (2023-01-13)

##### Variable Declaration Order
- Declaring variables in a specific order can affect register allocation
- The decomp-permuter tool can help brute-force these orderings
- Source: prakxo, camthesaxman (2023-01-10)

##### getSizeVar Return Type
- Functions returning enums may need `unsigned int` return type to match even when checking against negative values
- Source: ribbanya, rtburns, vetroidmania (2023-01-11)

#### 2023-02 (source: 2023-02.md)

##### Array Access with Constant Offsets
- A label like `lbl_804D6554[275]` pointing to `804D69A0` indicates array access with a computed offset
- The index 275 times the element size plus base address equals the target
- Useful for identifying array types and element sizes
- Source: .durgan (2023-02-26)

#### 2023-03 (source: 2023-03.md)

##### GET_FIGHTER Macro Pattern
- The `GET_FIGHTER(gobj)` macro (expanding to `((Fighter*)HSD_GObjGetUserData(gobj))`) fixes fake stack allocations in "probably hundreds" of functions
- This pattern extends to `GET_ITEM(gobj)` and `GET_GROUND(gobj)`
- In short functions, replacing `gobj->user_data` with `GET_FIGHTER(gobj)` typically won't cause mismatches
- Direct access from return value (`GET_FIGHTER(gobj)->some_var`) is valid and HAL likely used this pattern for laziness/efficiency
- Source: revosucks, ribbanya (2023-03-18)

##### User Data Direct Casts
- HAL used direct `user_data` casts rather than assigning to local variables
- Evidence from Smash 64: functions won't match if you declare a local variable for `article_gobj->user_data`
- This is confirmed by IDO's strict codegen which allows fewer permutations than MWCC
- Source: vetroidmania (2023-03-09)

##### Small Data Access in Assembly
- For assembly with labels like `lfs f1, lbl_804DE210(r2)`, decomp.me requires SDA21 syntax
- Convert to: `lfs f1, lbl_804DE210@sda21(r2)`
- Generally all small data accesses (r2/r13) can use `@sda21` but GNU assembler still requires the register
- Source: kiwidev, encounter (2023-03-21)

##### Handling Missing Return Statements (UB)
- Some functions have undefined behavior with no return statement on all paths
- If the function always reaches a return (via loop), there may be no UB in practice
- A trailing `return` without a result can generate an extra `mr` instruction causing mismatch
- Workaround using `MUST_MATCH` define:
```c
HSD_LObj* func_8000CDC0(HSD_LObj* cur) {
    while (cur != NULL) {
        if (FLAGS_NONE(cur->flags, (1 << 0) | (1 << 1)) &&
            FLAGS_NONE(HSD_LObjGetFlags(cur), 1 << 5))
        {
            return cur;
        }
        cur = lobj_next(cur);
    }
#ifndef MUST_MATCH
    return NULL;
#endif
}
```
- Adding `NORETURN` to `__assert`, `HSD_Panic`, and `OSPanic` solves other UB errors without affecting codegen
- Source: rtburns, ribbanya (2023-03-15)

#### 2023-04-to-05 (source: 2023-04-to-05.md)

##### GUARD Macro for Early Returns

A common pattern for IASA (interrupt) functions with many early-return checks:

```c
#define GUARD(cond)          \
    if ((cond)) {            \
        return;              \
    }

void ftCo_AttackLw3_IASA(HSD_GObj* gobj)
{
    ftCo_Fighter* fp = GET_FIGHTER(gobj);
    if (fp->allow_interrupt) {
        GUARD(ftCo_AttackS4_CheckInput(gobj))
        GUARD(ftCo_AttackHi4_CheckInput(gobj))
        // ... more guards
    }
}
```

Source: ribbanya (2023-05-13)

##### Subaction Event Opcode Extraction

The correct way to extract opcodes from subaction events:

```c
// Wrong approach:
eventCode /= 4;
eventCode %= 64;

// Correct approach - loading a 6-bit opcode:
struct SubactionEvent {
    u32 opcode : 6;
    // ... other fields
};
```

Source: vetroidmania (2023-05-25)

##### Ternary for bge; b Sequences

A `bge; b` instruction sequence can be generated by ternaries:

```c
ftCo_Fighter* fp = gobj->user_data;
FtMotionId msid = (float) fp->dmg.x1830_percent < p_ftCommonData->x488
                      ? ftCo_MS_CliffEscapeQuick
                      : ftCo_MS_CliffEscapeSlow;
```

Source: .cuyler (2023-05-30)

##### Inverted Conditions

Sometimes the condition needs to be inverted to match:

```c
// If you have the condition inverted, swap the order:
// Original (doesn't match): condition ? A : B
// Fixed (matches): !condition ? B : A
```

Source: .cuyler (2023-05-30)

#### 2023-06 (source: 2023-06.md)

##### GET_FIGHTER Macro Validation (ribbanya, 2023-06-01)
Strong evidence for `GET_FIGHTER` macro correctness: https://decomp.me/scratch/CLSmu
- Works correctly with two fighters in an otherwise simple function

##### Inline Patterns in Animation Functions (Revo, 2023-06-04)
Animation callback functions often call an inline/static function rather than the actual implementation directly:
```c
void ftCo_CaptureDamageKoopa_Anim(ftCo_GObj* gobj)
{
    inlineA0(gobj, ftCo_800BCC20);
}

void ftCo_CaptureDamageKoopaAir_Anim(ftCo_GObj* gobj)
{
    inlineA0(gobj, ftCo_800BCD00);
}
```
This pattern reduces code duplication when callbacks differ.

##### JObj Inline Patterns (ribbanya, 2023-06-03)
Complex JObj access patterns involving ABS macro:
```c
if (ABS(fp_x1A50 + HSD_JObjGetTranslationZ(jobj)) <= fp->mv.co.capturekoopa.x10) {
    HSD_ASSERT2("jobj.h", 1126, "jobj", jobj);
    jobj->translate.z += fp_x1A50;
    if (!(jobj->flags & JOBJ_MTX_INDEP_SRT)) {
        HSD_JObjSetMtxDirty(jobj);
    }
}
```
The ABS macro is commonly used across many games - not unique to Melee.

##### M2C Output Cleanup (Revo, 2023-06-24)
When working with m2c decompiler output:
- Remove as many temporaries as possible during initial cleanup
- Look at already-matched similar code for patterns
- Enable `-sym on` in compiler options to see line numbers for everything

##### Item Code Patterns (rtburns, 2023-06-25-26)
Item code follows similar patterns to fighter code but uses `Item` instead of `Fighter`:
- `GET_ITEM` macro handles stack weirdness (similar to `GET_FIGHTER`)
- First function in each item's text section is typically an initialization function called from character animation code
- Item code includes not just throwables but also character animations, models, and NPC enemies
- Callbacks follow predictable patterns - good for farming percent

##### Special Attributes in Items (rtburns, 2023-06-28)
When decompiling item functions with `void*` special attributes:
1. Identify the item type being worked on
2. Modify context so `x4_specialAttributes` is the correct type (e.g., `itChainSegment*`)
3. Rerun m2c/Decompile to get correct member access inference
4. For new items, define your own struct with members at the correct offsets

#### 2023-07-to-12 (source: 2023-07-to-12.md)

##### GET_FIGHTER and Similar Accessors
- Item callbacks accessing `item->xDD4_itemVar` need an accessor that casts to the appropriate item type
- This consumes an additional 4 bytes of stack space
- Similar pattern to `GET_FIGHTER` and `GET_JOBJ` macros
- Source: rtburns (2023-07-01)

##### Fake Stack Variables
When stack size doesn't match but code is otherwise correct:
```c
// Missing 8 bytes of stack often indicates a stripped inline function
// Missing 4 bytes might just be an unused variable
HSD_JObj* bone_jobj = fp->parts[FtPart_LLegJA].joint;
// This line may be completely stripped by compiler but affect stack
```
- Source: werewolf.zip, ribbanya (2023-10-09)

##### Float Literals vs Extern Floats
- Many functions appear non-matching due to extern float declarations
- Using actual float literals instead of externs often fixes matches
- The ftPurin functions needed file splits and using actual floats instead of externs
- Source: werewolf.zip (2023-09-18)

##### Decimal vs Hex in Data
When data doesn't match:
```c
// Wrong - compiler may generate different instruction
StageData data = { 26, ... };

// Correct - use hex for stage IDs
StageData data = { 0x26, ... };
```
- Source: rtburns (2023-09-12)

##### sdata vs sdata2 Placement
- `sdata` is for variables (non-const)
- `sdata2` is for constants
- If floats appear in wrong section, check `const` qualifier
- Using literals instead of named constants can fix section placement issues
- Source: ribbanya (2023-12-19)

##### Local Label Format
- `.L_` labels in asm don't work with mwcc
- Replace with `lbl_` prefix for m2c compatibility
- The dump branch uses `lbl_` format
- Source: ribbanya (2023-10-27)

##### Helmite Spline Variable Naming
Debug symbols from K7 reveal actual variable names for math functions:
```c
f32 splGetHelmite(f32 fterm, f32 time, f32 p0, f32 p1, f32 d0, f32 d1)
{
    f32 _3t2_T2;
    f32 _2t3_T3;
    f32 t3_T2;
    f32 t2_T;
    f32 t2;
    f32 _1_T2;
    // ...
}
```
- Variable names indicate the mathematical terms being computed
- Source: werewolf.zip (2023-09-24)

---

#### 2024-01 (source: 2024-01.md)

##### Jump Tables and Switch Statements

Jump tables (`jtbl_t`) in the codebase are placeholders for switch statements:
- When you see a table of function addresses with computed offsets, it's usually a switch statement
- The compiler creates jump tables for switches with many cases near zero
- After bounds checking, it indexes into the table and branches directly
- The `jtbl_t` type is a "fakematch" for a switch statement
- Source: muff1n1634, ribbanya (2024-01-01)

##### saved_in_reg_rx Errors

When you see `saved_in_reg_rx` errors in decompiled output, it almost always means there's a missing parameter or return value:
- Missing r3 typically means a function is `void` when it should return an `int` or pointer
- Source: ribbanya (2024-01-12)

##### Chained Assignments

For vector initializations:
- `z = 0; y = 0; x = 0;` is usually the same codegen as `x = y = z = 0;`
- Exception: with bitfields involved, chaining may produce different results
- Source: ribbanya (2024-01-15)

##### Inline Wrapper Trick

When facing register allocation issues, wrapping operations in an inline function can fix them:
```c
static inline double sqrtf_wrapper(f32 val) {
    return (double)sqrtf_accurate(val);
}
```
Changing return types from `float` to `double` can also fix stack alignment issues.
- Source: rtburns, revosucks (2024-01-16)

##### Bitfield Access

Bitfields are accessed via bit manipulation (`value >> n & MASK`):
- The compiler figures out the equivalent bitshift operation
- Loads the whole byte/word and manipulates bits as necessary
- The `: 1` syntax in struct definitions specifies exact bit widths
- Unions are for convenience to access whole values or individual bits
- Source: ribbanya (2024-01-21)

##### True vs 1 for Bitfields

Using `true` instead of `1` for bitfield assignments can affect matching:
```c
// May produce different codegen:
spawnitem.x44_flag.bits.b0 = true;  // vs
spawnitem.x44_flag.bits.b0 = 1;
```
- Source: altafen (2024-01-15)

##### Extern Float Constants

When you see `extern f32 it_804DD188;` in context, it's typically an inline float constant (like `0.0f`). Sometimes using the literal vs the extern makes no difference, but try both.
- Source: altafen (2024-01-15)

#### 2024-02 (source: 2024-02.md)

##### Preventing Unwanted Inlining
- Use `#pragma dont_inline on` (not `1`) to prevent function inlining
- Also available: `#pragma inline_depth(n|smart)`
- Adding `(void)0;` at function start can sometimes prevent inlining (retail asserts leave this)
- Source: werewolf.zip, ribbanya, revosucks (2024-02-14)

##### Stack Variable Ordering
- Not always same as source ordering
- Roughly sorted by size to minimize padding
- Inlines mess with stack ordering significantly
- Adding more inlines can cause stack allocation to increase in specific spots
- Source: vetroidmania, walnut356, altafen (2024-02-14)

##### Fixing Stack and Register Swaps
- Calling an inline with different arguments can fix both stack layout and register swaps
- Example: https://decomp.me/scratch/S6bLg vs https://decomp.me/scratch/Bp6zu
- Usually requires finding a direct copy of function that only differs by one function call
- Source: ribbanya (2024-02-26)

##### _p Macro Pattern
- HAL used macros like:
```c
#define _p(m) (((Allocator*) &g_alloc)->m)
```
- Used in asserts: `HSD_ASSERT(0x7B, _p(free_heap));`
- "p" typically stands for pointer in their naming
- Source: werewolf.zip (2024-02-14)

##### Clamp Macro Discovery
```c
#define Clamp(val,min,max) (val = ((val < min) ? min : (val > max) ? max : val))
```
- Separate from HSD_ClampFloat function
- `private.h` likely contains utility macros including ABS
- Source: werewolf.zip (2024-02-15)

##### GET_FIGHTER Macro
- Has been a perfectly compatible pattern since discovery
- Never fails when used correctly
- Source: ribbanya (2024-02-26)

#### 2024-03-to-07 (source: 2024-03-to-07.md)

##### Using Raw Float Literals vs Constants (werewolf.zip, 2024-04-15)
When register ordering is wrong, try using literal floats instead of named constants:
```c
// May produce different register allocation:
fp->some_field = ftSeak_SOME_CONSTANT;  // Uses constant from data section
fp->some_field = 0.0f;                   // Inline literal
```
Test both approaches when you have close-but-not-matching code.

##### RETURN_IF Macro Pattern (ribbanya, 2024-03-11)
For IASA callbacks and similar functions, use the RETURN_IF macro pattern:
```c
#define RETURN_IF(expr) if (expr) { (void)gobj; return; }

void ftYs_GuardOn_0_IASA(HSD_GObj* gobj)
{
    RETURN_IF(ftCo_80093694(gobj));
    RETURN_IF(ftCo_8009515C(gobj));
    RETURN_IF(ftCo_80099794(gobj));
    // ...
}
```
The `(void)gobj;` produces an errant `cmpwi` instruction that otherwise seems to do nothing.

##### Switch Statement Detection (revosucks, 2024-06-11)
Deeply nested if-else chains with comparisons often are switch statements:
```c
// M2C output with nested ifs like:
if (temp_r3 != 0x1C) {
    if (temp_r3 < 0x1C) {
        if (temp_r3 != 0xF) {
// ...

// Is probably:
switch(gm_801A4310()) {
    case 0x1C:
    case 0x0F:
    case 0x2B:
        return 1;
    default:
        return 0;
}
```

##### Data Symbol Base Address Offsetting (altafen/gamemasterplc, 2024-07-30)
The compiler often loads the first symbol in a data section and offsets from it:
```c
// M2C may show:
(it_803F6CA8 + (temp_r29->unkDD4 * 4))->unkB0;

// This is actually:
it_803F6D58[temp_r29->unkDD4]  // Where 803F6D58 = 803F6CA8 + 0xB0
```

Key insight: The `*4` indicates array indexing (4-byte elements), and the offset points to a different array than the base symbol. Don't assume the decompiler's symbol reference is accurate.

##### Struct Copy vs Field Assignment (gamemasterplc/foxcam, 2024-07-31)
When copying Vec3 or similar structs:
```c
// Struct copy - uses integer registers (generic copy)
pos = other_pos;

// Field assignment - uses floating point registers
pos.x = other_pos.x;
pos.y = other_pos.y;
pos.z = other_pos.z;
```
M2C often shows struct copies as separate s32/u32 assignments - recognize this pattern.

##### Returning Result of Void Function for State Tables (gamemasterplc, 2024-07-04)
When a state table expects `int` return but you have a `void` function:
```c
// If state table slot expects: int (*)(HSD_GObj*)
// But function is: void foo(HSD_GObj*)

// Solution: return result of a no-argument function call
int wrapper(HSD_GObj* gobj) {
    foo(gobj);
    return other_func();  // Generates transfer of value
}
```
This generates the expected codegen for void functions in int-returning slots.

#### 2024-08-to-12 (source: 2024-08-to-12.md)

##### Bitfield Access Patterns
- When decompiler produces `(u8)(flag & ~0x10)`, it often indicates a bitfield struct
- The `b*` fields (b0, b1, etc.) allow setting individual bits:
```c
// Instead of:
item->xDCC_flag.b0 = (u8)(item->xDCC_flag.b0 & ~0x10);
// Write:
item->xDCC_flag.b3 = 0;
```
- Search context for the offset (e.g., `x2219`) to find the correct bitfield access like `fp->x2219_b1`
- Source: foxcam (2024-08-01, 2024-10-11)

##### Unrolled Loops for Vec3 Operations
- Repeated Vec3 assignments may need to be written as an unrolled for loop:
```c
for (i = 0; i < 3; i++) {
    *(&item->xDD4_itemVar.linkarrow.x48 - i) =
        *(&item->xDD4_itemVar.linkarrow.x3C - i);
}
```
- C implicitly multiplies pointer math by the type size - no explicit multiply needed
- Source: foxcam (2024-08-01, 2024-08-02)

##### sqrtf Inline Recognition
- The sqrtf inline produces a distinctive pattern with `__frsqrte` and Newton-Raphson iterations:
```c
if (var_f4 > 0.0f) {
    sqrt = __frsqrte(var_f4);
    temp_f1_3 = 0.5 * sqrt * -((var_f4 * (sqrt * sqrt)) - 3.0);
    temp_f1_4 = 0.5 * temp_f1_3 * -((var_f4 * (temp_f1_3 * temp_f1_3)) - 3.0);
    temp_f1_5 = 0.5 * temp_f1_4 * -((var_f4 * (temp_f1_4 * temp_f1_4)) - 3.0);
    sp10 = var_f4 * temp_f1_5;
    var_f4 = sp10;
}
```
- Replace with `sqrtf()` call - search the repo for existing usage
- Source: chippy__, ribbanya (2024-09-30)

##### JObj Inlines from jobj.h
- `__assert` calls with `jobj.h` in the string are inlines from the baselib header
- Search for `HSD_JObjSetTranslateZ` in context to find the full inline list
- Example simplification:
```c
// Long assert-laden code becomes:
HSD_JObjSetTranslateZ(jobj_1, temp_f31);
```
- Source: foxcam (2024-08-01)

##### Linked List Operations
- Pattern like `lwz r4, 0(r3) / lwz r0, 4(r3) / stw r0, 4(r4)` indicates linked list manipulation
- The decompiler may produce `temp_r5 = M2C_FIELD(...)` for struct field access
- These should be rewritten using proper struct types with next/prev pointers
- Source: altafen, rainchus (2024-09-13)

##### Register Argument Detection
- If the first thing that happens to r3 in a function is a load (not a write), it must be an argument
- Pattern `bl func / mr r30, r3` indicates the function returns something (r3 is return register)
- "Unset register" m2c error almost always means a missing parameter or missing return value
- Source: foxcam (2024-10-11), ribbanya (2024-10-13)

##### Fake Variables from Register Reuse
- When you see duplicate `GET_FIGHTER()` calls, it may be:
  1. The compiler reusing a register for the fp pointer
  2. An inlined function that also calls GET_FIGHTER
- temp variables assigned in if-statements may be "fake" - just register reuse
- Source: foxcam, ribbanya (2024-10-11)

##### Decomp Permuter for Regswaps
- The decomp-permuter tool can help with final regswaps or instruction swaps
- Sometimes produces unsatisfying "solutions" like empty if-statements that tickle regalloc:
```c
Fighter* ft = GET_FIGHTER(fighter);
if ((!db_804D6B48.b3) && (!db_804D6B48.b3)) { // ? permuter
}
ft->x21FC_flag.grouped_bits.b0_to_5 = db_804D6B48.b3;
```
- Source: altafen (2024-10-20)

##### Handling `.L_` Labels
- `.L_` labels are local labels for branches, not separate functions
- If a label starts with `mflr`, it's a function - rename it to `fn_XXXXXXXX`
- Small functions without `mflr` also end with `blr`
- Source: werewolf.zip, ribbanya (2024-09-19)

#### 2025-01-to-04 (source: 2025-01-to-04.md)

##### Union Member Selection
- M2C cannot determine which union member to use - it picks the first that works
- For `fp->mv` (motion vars), M2C picks `ca` (Captain Falcon) because it's alphabetically first
- You must determine the correct union member from context (e.g., if using `ftCo_MS_KneeBend`, use `mv.co`)
- Source: ribbanya, savestate (2025-04-29)

##### Stack Padding Tricks
- When stack doesn't match, `PAD_STACK` macro marks it as a known fake
- Alternative: Use `UNUSED` local variables to pad stack
- These are grep-able later for correction
- Source: ribbanya (2025-04-29)

##### Variable Scope for Finding Inlines
- Moving variable declarations to limited scope helps identify inline functions
- Use scope braces to push declarations down:
```c
{
    Fighter* fp;
    // ...
}
```
- Source: ribbanya (2025-04-30)

##### Literal vs External Constants
- `extern const f32` labels can often be replaced with literal values
- The compiler automatically places literals in `.rodata`
- Order matters - constants must be declared where originally located
- Source: revosucks (2025-04-29)

##### Assignment Inside Conditionals
- Assignments inside if conditions are "definitely fake" - rarely needed
- Source: ribbanya (2025-04-30)

#### 2025-05 (source: 2025-05.md)

##### Stack Size Mismatches (8 bytes)
- An 8-byte stack difference often indicates a missing inline function
- Use `PAD_STACK(8);` to force match if needed
- Alternatively, look for missing variable declarations or compound expression temps
- Source: ribbanya (2025-05-25)

##### Register Swaps via Variable Order
- Register allocation is influenced by the order variables are declared
- Reordering variable declarations can fix r30/r31 register swaps
- Source: altafen (2025-05-25)

##### Using Accessor Macros (GET_COBJ, GET_FIGHTER)
- Using macros like `GET_COBJ` instead of raw pointer access can fix stack size issues
- Example: Adding `GET_COBJ` for `main_cam` fixed stack size, but adding for both cameras made stack too big - balance is needed
- Source: altafen (2025-05-25)

##### RETURN_IF Macro for Useless cmpwi
- Seemingly useless `cmpwi` instructions can be matched by adding `RETURN_IF` like other similar functions
- Source: chippy__ (2025-05-31)

##### Inline Callback Pattern
- Inlines can take function pointers as callbacks, and the callback itself gets inlined as a normal `bl`
- This is advanced inline alchemy that produces surprising codegen
```c
static inline void foo(void (*cb)(void)) {
   cb();
}

void bar(void);

void lbl_DEADBEEF() {
  foo(bar);
}
// Compiles to just: bar();
```
- Source: ribbanya (2025-05-29)

##### Dash/Run Movement Inline Pattern
- Functions like `ftCo_TurnRun_Phys`, `ftCo_Dash_Phys`, `ftCo_Run_Phys` share a common inline for acceleration calculation
- The inline handles `accel`, `flat_accel`, `max_vel` calculations
- Search pattern: `lfs f\d+, 0x24\(r\d+\)\n.*fneg f\d+, f\d+\n.*:\n.*lfs f\d+, 0x28\(r\d+\)`
- Source: ribbanya, gigabowser (2025-05-29)

#### 2025-06 (source: 2025-06.md)

##### goto to while Loop Conversion
- When m2c generates a `goto` at the end of an if statement that jumps back to a condition, it's a `while` loop
- Converting `if (...) { ...; goto condition; }` to `while (...)` can significantly improve match percentage
- Source: rtburns (2025-06-17)

##### Removing goto with Compound Conditions
- `goto` patterns like `if (cond1) goto X; if (cond2) goto X;` can often be folded into `if ((cond1 && cond2) || cond3)`
- Look for shared jump targets to identify foldable conditions
- Source: revosucks, gigabowser (2025-06-23)

##### Stack Padding for sqrt/inline Issues
- mwcc's sqrt inline puts intermediate values on the stack
- Due to inline weirdness, the intermediate may go to a different stack slot
- Adding more inlines can push the intermediate deeper into the stack to match
- `FORCE_PAD_STACK_8` can fake a match but may not be the real code
- Source: rtburns (2025-06-25)

##### Struct Traversal from m2c Output
- m2c generates ugly chains like `(int *)(*(int *)(*(int *)(iVar3 + 0x10c) + 0x38) + iVar5)`
- Translation: `thing->x10C->x38[iVar5]`
- The base is iVar3, 0x10C is a pointer to another struct, 0x38 is an array in that struct
- Use `m2c --valid-syntax --stack-structs` locally for better output with M2C macros
- Source: werewolf.zip, allocsb, ribbanya (2025-06-24)

##### Callback Function Pointer Types
- Callback arrays require careful type matching
- If callbacks don't take arguments but the array type expects `void*`, give them a dummy argument
- Function pointer syntax: think of definition matching usage - `(*(arr[5]))()` means `int (*(arr[5]))()`
- Source: kellz, altafen, revosucks (2025-06-27)

#### 2025-07 (source: 2025-07.md)

##### ABS vs fabs_inline
- `fabs_inline` is likely NOT real - prefer using `ABS` macro instead
- Replacing `fabs_inline` with `ABS` treewide improves matches
- The `nested_sum_fabs` inline was overly complicated - code recomputed absolute value multiple times due to using ABS macro inside itself
- Source: ribbanya, rtburns (2025-07-28)

```c
// Before (overly complicated)
float final_y_pos = nested_sum_fabs(
    fp->cur_pos.y, pika_attr->xBC, fabs_inline(pika_attr->xBC), vec.y);

// After (cleaner)
float final_y_pos = ABS(fp->cur_pos.y + ABS(pika_attr->xBC) - vec.y);
```

##### Avoiding Temps for Instruction Order
- Don't use temporary variables when trying to flip instruction order
- Direct struct access often produces better instruction ordering
- Source: altafen (2025-07-11)

##### Vec3 Chained Assignment
- When you see z, y, x stores in reverse order, it's usually chained assignment:
```c
// This produces z, y, x order in asm
fp->self_vel.x = fp->self_vel.y = fp->self_vel.z = 0.0f;
```
- Value on right travels left until it reaches start
- Source: revosucks (2025-07-25)

##### Register Usage and Missing Arguments
- If r3 is not being used after a function call setup, it was passed to that function
- r3 is the first argument - if code uses r4 where r3 expected, you're missing an argument
- Volatile registers are r3-r8 and f1-f8
- Read from r3, r4, or f1 following a function callsite means that function returns something
- Source: chippy__, revosucks, foxcam (2025-07-19, 2025-07-22)

##### Struct Copy vs Individual Stores
- `lwz` sequences loading Vec3 components are often struct copies:
```c
fp->mv.kb.speciallw.x18 = fp->coll_data.floor.normal;  // struct copy
```
- Source: revosucks (2025-07-25)

##### Fighter Parts Array Access
- When you see offset like 0x2B0 from FighterBone, it's array indexing:
```c
// Wrong: Adding field to FighterBone struct
// Right: Index into parts array
fp->parts[FtPart_YRotN].joint  // Use enum for correct index
```
- FighterBone size is well understood - don't modify it
- Source: rtburns, ribbanya (2025-07-12)

##### Ternary for Facing Direction
```c
// Common pattern for facing direction checks
var_r4 = (fp->facing_dir == 1.0f) ? 1 : -1;
```
- Source: revosucks (2025-07-25)

##### PAD_STACK Usage
- PAD_STACK is "fake" but not harmful if it doesn't affect functionality
- Organic match using inlines is better, but PAD_STACK is acceptable
- **Harmful case**: When passing pointers to stack data that reads/writes to padding
- This triggers UB - better compiler would optimize out padding
- Source: rtburns (2025-07-24)

##### GET_JOBJ May Be Fake
- Evidence suggests `GET_JOBJ` macro may not be real
- Direct access `gobj->hsd_obj` sometimes works better than the macro
- Functions with `HSD_JObjGetNext(HSD_JObjGetChild(...))` chains may not use the macro
- Source: revosucks, ribbanya (2025-07-29, 2025-07-30)

##### Common Kirby Inline Pattern
```c
inline void ftKirbyDmgInline(Fighter_GObj* gobj) {
    Fighter* fp = GET_FIGHTER(gobj);
    fp->death2_cb = (void (*)(HSD_GObj*)) ftKb_Init_800EE74C;
    fp->take_dmg_cb = (void (*)(HSD_GObj*)) ftKb_Init_800EE7B8;
}
```
- Used to reset Kirby's copied ability on damage/death
- When you see `temp_r4 = gobj->user_data;` followed by callback assignments, it's likely inline start
- Source: theplayerrolo, rtburns (2025-07-24)

##### HSD_PadCopyStatus Access Inline
```c
inline u32 Get_HSD_PadCopyStatus(u8 i) {
    return HSD_PadCopyStatus[i].button;
}
```
- The u8 parameter eliminates need for explicit casts
- May explain unrolled pad status loops
- Source: rtburns, revosucks (2025-07-26)

#### 2025-08 (source: 2025-08.md)

##### GET_FIGHTER Macro Issues

The `GET_FIGHTER` macro causes frequent issues on decomp.me:
```c
#ifdef M2C
struct Fighter_GObj {
  Fighter* user_data;
}
#define GET_FIGHTER(g) ((Fighter*) HSD_GObjGetUserData((HSD_GObj*) g))
#else
typedef HSD_GObj Fighter_GObj;
#define GET_FIGHTER(g) ((Fighter*) HSD_GObjGetUserData(g))
#endif
```
- The extra `(HSD_GObj*)` cast in the decomp.me version can cause codegen differences
- On decomp.me, try removing the cast from context or using `gobj->user_data` directly
- Always prefer objdiff locally as it uses the correct context
- Source: revosucks, altafen (2025-08-02, 2025-08-08)

##### Duplicate Condition Check

Sometimes the original developers checked the same condition twice:
```c
if ((fp->x2000_flags & 0x200) != 0) {
    if ((fp->x2000_flags & 0x200) != 0) {
        // code
    }
}
```
This can fix branch ordering issues.
- Source: .cuyler (2025-08-02)

##### Stack Space via PAD_STACK

If you're missing stack space but have a match otherwise, use:
```c
PAD_STACK(n)  // where n is number of bytes to reserve
```
Or the older trick: `u8 _[20];`
- Source: werewolf.zip, alex_aitch (2025-08-01)

##### Vec3 Initialization Order

When initializing multiple Vec3 variables to zero, the order matters:
```c
Vec3 a, b, c;
c = zero_c;  // Written first
b = zero_b;
a = zero_a;
```
Using `Vec3 a = {0}, b = {0}, c = {0};` writes them in wrong order.
- Source: muff1n1634, altafen (2025-08-20)

##### Inline Detection Clues

Signs that code should be inlined:
- Stack space discrepancies
- Register swaps between code sections
- Duplicated code patterns
- Code after `GObj_Create` calls often starts an inline
- Variables in inlined functions tend to have reversed regalloc vs parent function
- Source: ribbanya, rtburns (2025-08-02, 2025-08-04)

##### Flexible Inline Patterns

Inlines can be very flexible - the same inline can match different code patterns depending on how it's used. See ftYs_SpecialN.c for examples:
https://decomp.me/scratch/7wQik
- Source: ribbanya (2025-08-18)

##### Bitfield Matching

For bitfield struct matching, use rlwinm decoder:
- https://celestialamber.github.io/rlwinm-clrlwi-decoder/
- Also built into objdiff now
- Fix one rlwinm at a time - target `(r4 << 23) & 0xFF00000000` tells you bit positions
- Source: altafen (2025-08-28)

#### 2025-09-to-2026-01 (source: 2025-09-to-2026-01.md)

##### M2C Union Field Selection
New m2c flags allow forcing specific union fields, solving a long-standing issue:
```bash
python tools/decomp.py ftKb_SpecialNNs_800FEDD0 \
  --union-field Fighter_FighterVars:kb \
  --union-field Fighter_MotionVars:kb \
  --union-field ftKb_MotionVars:specialn_ns
```
This avoids having to manually reorder union fields in headers.
- Source: lukechampine (2025-10-14)
- PR: https://github.com/matt-kempster/m2c/pull/301

##### M2C Void Pointer Type Specification
Another m2c enhancement allows specifying types for void* variables:
```bash
python tools/decomp.py --no-copy ftKb_SpecialNNs_800FEDD0 \
  --void-var-type temp_r5:ftKb_DatAttrs
```
- Source: lukechampine (2025-10-15)
- PR: https://github.com/matt-kempster/m2c/pull/302

##### Static Inline Wrapper Pattern
Sometimes a static function is wrapped by a non-static function with identical body:
```c
void it_802CC7D8(Item_GObj *gobj) {
    it_802CC7D8_inline(gobj);
}

static void it_802CC7D8_inline(Item_GObj *gobj) {
    // actual implementation
}
```
This allows the inner function to be static (file-local) while still callable from outside. May be an artifact of dev team code policy or macro-based "class" implementations.
- Source: revosucks, antidote6212 (2025-10-03)

##### Chained Assignment Pattern
This m2c output pattern:
```c
temp_r31->cmd_vars[3] = 0;
temp_r31->cmd_vars[2] = 0;
temp_r31->cmd_vars[1] = 0;
temp_r31->cmd_vars[0] = 0;
```
Often comes from chained assignment:
```c
fp->cmd_vars[0] = fp->cmd_vars[1] = fp->cmd_vars[2] = fp->cmd_vars[3] = 0;
```
- Source: revosucks (2025-10-15)

##### GET_FIGHTER Double Load Pattern
When m2c shows loading `gobj->user_data` twice, it often indicates an inlined function between the loads:
```c
Fighter *fp = GET_FIGHTER(gobj);
Fighter_ChangeMotionState(gobj, ...);
// The code after this might load fp again via another GET_FIGHTER
```
- Source: roeming, revosucks (2025-10-15, 2025-10-16)

##### Float Ordering Issues
When sdata2 floats are in the wrong order:
1. A later function in the TU may need to use the float first
2. Can add a deadstripped helper function that uses the float:
```c
float get_min_life(void);
float get_min_life(void) {
    return 1.0f;
}
```
The linker will deadstrip this but the float ordering is preserved.
- Sometimes can use `const float min_life = 1.0f;` at file scope
- Source: altafen (2025-12-20)

##### Decomp Permuter Setup
For using decomp-permuter:
1. Create a `nonmatchings` folder with `.gitignore` containing `*`
2. Add `build/binutils` to PATH
3. Run `powerpc-eabi-as -mgekko -o target.o target.s` to create target
4. Run `permuter.py .` from the function directory
- Helpful for regalloc issues and getting ideas flowing
- Source: gigabowser (2025-10-17)

##### Duplicate Function Matching
Many functions share identical opcode sequences with already-matched functions:
- 989 functions (84 KB) were found to be duplicates of matched functions
- Matching the most common unmatched patterns can yield large gains
- Duplicates may use different structs/types but similar logic
- Source: lukechampine (2025-09-29)

---

### Matching Challenges

#### 2021-01-to-04 (source: 2021-01-to-04.md)

##### Known Difficult Areas

**GObj functions:**
- Even "easy" GObj functions are hard to match
- Likely due to either:
  1. Not having the correct 2.2.x compiler
  2. MWCC being sensitive to minor source changes
  3. Both factors combined
- Source: werewolf.zip, revosucks (2021-01-18)

**Float register allocation (lbvector):**
- Some float-heavy functions have register allocation issues
- GC CW 1.0 was hoped to have more favorable regalloc
- Can potentially be worked around with patches
- Source: revosucks (2021-01-31)

### Shiftability

#### 2021-11 (source: 2021-11.md)

##### Achieving Full Shiftability (November 19, 2021)
Steps taken:
1. **Script automation**: Used progenitor9339's script for jump tables (got all but inline ASM ones)
2. **Regex for pointers**: werewolf.zip wrote regex to find pointer patterns in ASM
3. **Manual labeling**: ~16k pointers needed cleanup initially
4. **lwzu fixups**: Critical fix for `lwzu` with preceding `lis @ha`

##### lwzu/lis Pattern Fix
Common disassembly error where `lwzu` address not properly resolved:
```asm
// INCORRECT (as disassembled):
lis r4, lbl_803C0004@ha
...
lwzu r3, -0x7c60(r4)      // Actually loads from 803B83A0
lwz r0, lbl_803C0004@l(r4) // This lwz is NOT using a label

// CORRECT:
lis r4, lbl_803B83A0@ha
...
lwzu r3, lbl_803B83A0@l(r4)
lwz r0, 0x4(r4)           // Just offset, no label
```
The `lwzu` and `lis` are the real `@ha`/`@l` pair; the following `lwz` just loads at offset +4.
Source: epochflame, camthesaxman, werewolf.zip (2021-11-19)

##### addic. Pattern
Similar to lwzu, `lis` + `addic.` needs proper label resolution:
```asm
lis r3, lbl_80458EB0@ha
addic. r3, r3, lbl_80458EB0@l
```
Source: werewolf.zip (2021-11-20)

##### OSReport/Dolphin Quirks
- Putting NOPs in OSReport causes infinite loop in Dolphin emulator
- Dolphin patches OSReport, OSPanic, and similar functions
- Shifting Dolphin SDK functions before OSReport causes game freeze
- Dolphin uses function signatures to locate these functions
Source: werewolf.zip, joshuamk, gamemasterplc (2021-11-20)

## Types, ABI, and Terminology

### Type Information

#### 2020-07 (source: 2020-07.md)

##### HSD Object Naming Convention
The sysdolphin library uses single-letter prefixes:
- **A**Obj - Animation Object
- **C**Obj - Camera Object
- **D**Obj - Data Object (display list)
- **F**Obj - Frame Object
- **G**Obj - Game Object (universal container)
- **J**Obj - Joint Object
- **L**Obj - Light Object
- **M**Obj - Material Object
- **P**Obj - Polygon Object
- **R**Obj - Reference Object (attachments/bytecode)
- **T**Obj - Texture Object
- **W**Obj - World Object

Source: werewolf.zip (2020-07-05)

##### Sysdolphin File Boundaries (from Killer7 debug symbols)
```
mobj.c    = 0x80362D30 - 0x80363FC4
aobj.c    = 0x80363FC8 - 0x80365398
lobj.c    = 0x8036539C - 0x803676F4
cobj.c    = 0x803676F8 - 0x8036A940
fobj.c    = 0x8036A944 - 0x8036B8CC
pobj.c    = 0x8036B8D0 - 0x8036EC0C
jobj.c    = 0x8036EC10 - 0x8037389C
displayfunc.c = 0x803738A0 - 0x80374E44
initialize.c  = 0x80374E48 - 0x80375888
video.c   = 0x8037588C - 0x80376998
pad.c     = 0x8037699C - 0x80378A30
objalloc.c = 0x8037A968 - 0x8037AE30
id.c      = 0x8037CD80 - 0x8037D04C
wobj.c    = 0x8037D050 - 0x8037D96C
fog.c     = 0x8037D970 - 0x8037E1B8
perf.c    = 0x8037E1BC - 0x8037E3F8
list.c    = 0x8037E3FC - 0x8037E6C0
object.c  = 0x8037E6C4 - 0x8037E704
```
Source: werewolf.zip (2020-07-02)

##### Section Layout
```
.init     @ 0x80003100  (text0)
.text     @ 0x80005940  (text1 - main game code)
.extab    @ 0x80005520  (data0 - C++ exception tables)
.extabindex @ 0x800056C0 (data1)
.ctors    @ 0x803B7240  (data2)
.dtors    @ 0x803B7260  (data3)
.rodata   @ 0x803B7280  (data4)
.data     @ 0x803B9840  (data5)
.sdata    @ 0x804D36A0  (data6)
.sdata2   @ 0x804D79E0  (data7)
.bss      @ 0x804316C0
.sbss     @ 0x804D63A0
```
Source: gamemasterplc, camthesaxman (2020-07-01)

##### Important Addresses
- Entry point: `0x8000522C`
- Main function: `0x8015FEB4`
- First hitbox-related functions are near the start of .text

#### 2020-08 (source: 2020-08.md)

##### Function Pointer Tables
- Generic Animation/Action-State tables are 0x20 bytes per entry:
```c
struct anim_ft {
    u32 id;              // Action state ID
    u32 unk_flags0;      // Flags
    u32 unk_flags1;      // Flags
    u32 animationInterrupt;  // Function pointer
    u32 inputInterrupt;      // Function pointer
    u32 actionPhysics;       // Function pointer
    u32 collisionInterrupt;  // Function pointer
    u32 cameraBehaviour;     // Function pointer
};
```
- Source: revosucks (2020-08-06)

##### HSD Object Initialization Pointers
Key HSD object info init pointers:
- `hsdMObj` - 80405E28 -> MObjInfoInit (80405E28)
- `hsdLObj` - 804060C0 -> LObjInfoInit (80367688)
- `hsdCObj` - 80406220 -> CObjInfoInit (80406220)
- `hsdPObj` - 80406398 -> PObjInfoInit (8036eb88)
- `hsdJObj` - 80406708 -> JObjInfoInit (803737F4)
- `hsdObj` - 804072A8 -> ObjInfoInit (804072A8)
- `hsdClass` - 80407590 -> _hsdInfoInit (803822C0)

To find these: search for xrefs to `hsdInitClassInfo` (80381c18) - r3 contains the static pointer.
- Source: werewolf.zip (2020-08-06)

##### DOL/ELF Section Layout
BSS size in DOL header is misleading - it's actually `sizeof(bss) + sizeof(sdata) + sizeof(sbss)`

Section order:
```
.init
extab
extabindex
.text
.ctors
.dtors
.rodata
.data
.bss
.sdata
.sbss
.sdata2
.sbss2
```
- Source: revosucks (2020-08-02, 2020-08-12)

##### SDA Base Calculation
- `_SDA_BASE_` = sdata section base + 0x8000
- `_SDA2_BASE_` = sdata2 section base + 0x8000
- This offset exists because EABI requires SDA offsets within signed 16-bit value
- Allows accessing twice as much SDA memory with negative offsets
- Source: revosucks (2020-08-04)

##### Kirby-Specific Notes
- Kirby has ~203 special move functions (one .c file per hat/copy ability)
- Kirby's code is 34k lines of assembly
- Estimated ~5% of entire codebase size
- Source: werewolf.zip (2020-08-06, 2020-08-07)

#### 2020-09-to-12 (source: 2020-09-to-12.md)

##### Assert Function Format
- HAL's debug library assert format:
```c
assert("filename.c", 0x28 /* line number */, "reason");
```
- Condition is always the opposite of the reason string
```c
if (x != -1)
   assert("filename.c", 0x28, "x == -1");
```
- Likely expands from macro using `__FILE__` and `__LINE__`:
```c
#define assert(EXP) (void)((EXP) || (__assert(__FILE__, __LINE__, #EXP),0))
#define assertmsg(MSG, EXP) (void)((EXP) || (__assert(__FILE__, __LINE__, MSG),0))
```
- The function should be named `__assert` (not `assert`) since assert is the macro name
- Line numbers can be hardcoded for matching (done in Fire Red decomp)
- Source: werewolf.zip, gibhaltmannkill, revosucks (2020-09-27)

##### RNG Algorithm
- Melee's RNG uses the same Linear Congruential Generator as CodeWarrior's standard library
- Magic numbers: multiplier 214013, increment 2531011
- **Important**: The RNG used by game code is in `sysdolphin/random.c`, NOT in `MSL/rand.c`
- MSL files are from the CodeWarrior SDK standard library
- Source: werewolf.zip, amber_0714 (2020-12-26, 2020-12-27)

##### OSPanic
- `OSPanic` is the underlying handler that asserts call
- It's a weak symbol, so it can be overridden (Hudson did this in Mario Party)
- Source: gamemasterplc (2020-09-27)

#### 2021-01-to-04 (source: 2021-01-to-04.md)

##### GObj Structure

GObj is a core HAL engine object used across multiple games. Key information:

**Cross-game lineage:**
- Same basic structure appears in Smash 64, Kirby 64, Pokemon Stadium 64, Kirby Air Ride, and Melee
- Part of HAL's "sysdolphin" library (NOT the Nintendo Dolphin SDK)
- Source: unclepunch, someone2639, revosucks (2021-01-20, 2021-03-23)

**GObj fields discovered through cross-game comparison:**
- Melee has a `gx_link` field
- N64 equivalent uses a `dl_link` field (display list link)
- Source: someone2639 (2021-03-25)

**Reference:** Melee GObj header at `src/sysdolphin/gobj.h`

##### Shared Code Between Kirby 64 and Melee

- Melee uses the **exact same hard RNG algorithm** as N64 HAL games (Kirby 64, etc.)
- Engine code reuse goes beyond just RNG - significant structural similarities
- Assets were also reused between games
- Source: someone2639, dansalvato (2021-03-18, 2021-03-23)

**Reference:** Kirby 64 RNG implementation: `https://github.com/farisawan-2000/kirby64/blob/master/src/ovl0/ovl0_4.c#L5334`

#### 2021-06-to-10 (source: 2021-06-to-10.md)

##### GObj and Proc Naming Conventions
- Actor/entity callbacks are called "Procs" (from GObjProc in the library)
- Proc = Procedure, referring to registered callbacks in running processes
- When used as simple callees (not callbacks), use generic name `gobj`
- Class defines: `4` for players, `2` for stages
- Source: werewolf.zip (2021-08-29)

##### Component/Track System (Kirby Heritage)
- HAL games use a component system with arrays for individual values (like X position)
- Each actor reserves a "track" (index into arrays)
- Track number stored in `some_GObj->id`
- Melee appears to follow similar patterns from Kirby
- Source: someone2639, werewolf.zip (2021-08-29)

##### types.h Standard Definition
```c
typedef signed char         s8;
typedef signed short        s16;
typedef signed long         s32;
typedef signed long long    s64;
typedef unsigned char       u8;
typedef unsigned short      u16;
typedef unsigned long       u32;
typedef unsigned long long  u64;

typedef volatile u8         vu8;
typedef volatile u16        vu16;
typedef volatile u32        vu32;
typedef volatile u64        vu64;
typedef volatile s8         vs8;
typedef volatile s16        vs16;
typedef volatile s32        vs32;
typedef volatile s64        vs64;

typedef float               f32;
typedef double              f64;
typedef volatile f32        vf32;
typedef volatile f64        vf64;

typedef int                 BOOL;

#define TRUE 1
#define FALSE 0

#define NULL ((void*)0)
```
- Taken from SDK headers for matching purposes
- Note: `NULL` as `0` (not `((void*)0)`) may be better for some contexts
- Source: werewolf.zip (2021-10-03)

#### 2021-11 (source: 2021-11.md)

##### HSD_GObj Structure
```c
typedef struct _HSD_GObj {
    u16 classifier;
    s8 p_link;
    s8 gx_link;
    u8 p_priority;
    u8 render_priority;
    s8 obj_kind;
    s8 user_data_kind;
    struct _HSD_GObj* next;         // 0x08
    struct _HSD_GObj* prev;         // 0x0C
    struct _HSD_GObj* next_gx;      // 0x10
    struct _HSD_GObj* prev_gx;      // 0x14
    struct _HSD_GObjProc* proc;     // 0x18
    void (*render_cb)(struct _HSD_GObj* gobj, int code); // 0x1C
    u64 gxlink_prios;
    void* hsd_obj;
    void* data;                     // 0x2C - Fighter functions access ftData here
    void (*user_data_remove_func)(void* data);
    void* x34_unk;
} HSD_GObj;
```
Source: werewolf.zip (2021-11-08)

##### Stage IDs
- `0x1B` = Flat Zone (internal stage ID)
- Stage info accessed via `stInfo` struct at `8049E6C8`
- Source: werewolf.zip (2021-11-08)

##### TOC/SDA References
- TOC (Table of Contents) is loaded in init functions
- `SDA2_BASE` is at `0x804DF9E0`
- `SDA_BASE` (r13) is at `0x804DB6A0`
- Stack end at `0x804EEC00`
Source: werewolf.zip (2021-11-10)

#### 2021-12 (source: 2021-12.md)

##### Fighter Struct
- Size: 0x23EC bytes
- Key offsets:
  - 0x10C: ftData
  - 0x2D4: Second pointer to special attributes (may involve union)
  - First argument (r3) in ft functions is always `GObj*`
  - Access pattern: `gobj->2C` gets fighter data
- Don't name padding fields "padding" - use offset names like `unk2D8`
- Source: werewolf.zip (2021-12-12)

```c
struct Fighter {
    u8 unk0[0x10C];
    void* ftData;           // 0x10C
    u8 unk110[0x1C4];
    void* x2D4;             // 0x2D4 - special attributes ptr (union involved)
    // ... more fields up to 0x23EC
};
```

##### HSD_GObj
- This is the standard game object type
- Fighter functions receive `HSD_GObj*` as first parameter
- Access fighter data via `gobj->data` cast
- Source: werewolf.zip (2021-12-12)

##### Fighter Files Structure
- Each `ft[Character]` file is actually 4+ files (one per special move)
- Pattern: `ftNessSpecialN`, `ftNessSpecialS`, etc.
- Only special moves are separate - common moves are shared
- ftKirby needs a subdirectory for all the hats
- Source: werewolf.zip (2021-12-12)

##### Hitbox Structure (m-ex reference)
- Community documentation in m-ex project has hitbox structures
- Source: werewolf.zip (2021-12-13)

#### 2022-01 (source: 2022-01.md)

##### Fighter Struct Guidelines

- Use offset prefixes in variable names: `x84_pos`, `x221A_flags`
- The 0x222C - 0x22F8 range is a union that varies by character - don't use generic `fighter_var` from Akaneia
- Set up unions on per-character basis (e.g., `laser_holstered` for Fox at 0x222C)
- **Don't copy-paste Akaneia or community structs** - they may be wrong or not match decomp conventions
- Source: werewolf.zip (2022-01-04, 2022-01-09)

##### Struct Documentation Practice

Always document struct offsets:
```c
struct UnkStructTemporary {
    /*0x00*/ char filler0[0x10];
    /*0x10*/ int unk10;
};
```

Or use subtraction for filler sizes:
```c
u8 filler[0x10 - 0x00];  // Less mental math needed
```
- Source: revosucks (2022-01-21), camthesaxman (2022-01-21)

##### _p Macro Pattern

`_p` is shorthand for pointer, used as a macro for globals:
```c
#define _p ((HSD_VIInfo*)&HSD_VIData)
```
- Source: werewolf.zip (2022-01-20)

##### MSL Quirks

- MSL (Metrowerks Standard Library) wraps things backwards: `<cmath>` normally wraps `math.h`, but MSL does it the other way around
- Some MSL code uses `#pragma cplusplus on` and `#pragma cplusplus reset` to compile C code with C++ name mangling
- Different MSL versions may have different functions (e.g., tanf location varies between versions)
- Source: arookas, camthesaxman (2022-01-03)

#### 2022-02 (source: 2022-02.md)

##### Fighter Struct Key Offsets
- `x2200-x2240`: Union/array area used differently per character
  - Sheik uses as array of 0xC sized structs
  - Bowser uses x2230, x2234 as floats
  - Other fighters may use as u32 flags
- `x914`: First hitbox struct
- `0x138`: Hitbox struct size
- `x960, x96C`: Vec3 floats (position-related)
- `x6F0`: CollData pointer (`ft->x6F0_collData`)
- Source: werewolf.zip, cortex420, rtburns (various dates)

##### FighterBone Joint Elements
- Joint elements are byte-sized (u8), not 32-bit
- Source: rtburns (2022-02-21)

##### HSD_GObj Classifier Values
```c
#define GOBJ_KIND_MENU_COBJ 1
#define GOBJ_KIND_LIGHT 2
#define GOBJ_KIND_JOBJ 3
#define GOBJ_KIND_FOG 4

#define GOBJ_CLASS_STAGE 0x2
#define GOBJ_CLASS_CAMERA_RUMBLE 0x3
#define GOBJ_CLASS_PLAYER 0x4
#define GOBJ_CLASS_ITEM 0x6
#define GOBJ_CLASS_GFX 0x8
#define GOBJ_CLASS_TEXT 0x9
#define GOBJ_CLASS_HSD_FOG 0xA
#define GOBJ_CLASS_HSD_LOBJ 0xB
#define GOBJ_CLASS_HSD_COBJ_TITLE 0x13
```
Source: werewolf.zip (2022-02-25)

##### HSD_ObjAllocData
- Some instances have 4 extra bytes at end (0x30 vs 0x2C size)
- Related to BSS alignment requirements
- Extra bytes appear unused but needed for alignment
- Source: werewolf.zip, epochflame (2022-02-20)

##### Abbreviations/Naming
- HSD = HAL SysDolphin
- GObj = Game Object (or Global Object)
- JObj = Joint Object
- gr = Ground (stages)
- ft = Fighter
- pl = Player
- mn = Menu
- it = Item
- grTMars = Marth Target Test
- grLast = Final Destination
- grGarden = Fountain of Dreams
- grOldPupupu = Dream Land
- Source: werewolf.zip (various dates)

##### Fighter File Organization
- Each fighter has: ftFox.c, ftFoxSpecialN.c, ftFoxSpecialS.c, ftFoxSpecialHi.c, ftFoxSpecialLw.c
- Located under ft/chara/fox/
- Action state tables determine split points
- Special attacks are sequential after basic fighter setup code
- Source: werewolf.zip (2022-02-02)

#### 2022-03 (source: 2022-03.md)

##### ftCommonData Struct
- Located at `lbl_804D6554`, points to data in PiCo.dat
- Known offsets:
  - 0x98: shieldHealthInit (f32)
  - 0x200: unknown (f32)
  - 0x204: knockbackFrameDecay (f32)
  - 0x260: unknown (f32)
  - 0x294: unknown (f32)
  - 0x3E8: shieldKnockbackFrameDecay (f32)
  - 0x3EC: shieldGroundFrictionMultiplier (f32)
  - 0x480: unknown (f32)
  - 0x498: ledgeCooldownTime (u32)
  - 0x5F0: unknown (u32)
  - 0x768-0x774: various floats and s32
- Source: snuffysasa (2022-03-08)

##### FighterBone Struct
- x0 and x4 are HSD_JObj pointers (initially typed as u8* by mistake)
- Some functions treat them as JObjs, others as raw pointers passed to conversion functions
- May be a union in some cases
- Source: snuffysasa, rtburns, werewolf.zip (2022-03-18)

##### Fighter Struct Unions
- Later parts of the Fighter struct (special attributes) are unions per-fighter.
- Different fighters have different field layouts in the same data range.
- Source: revosucks, werewolf.zip (2022-03-17)

##### Fighter Field: x619 is costume_id
- The field at offset 0x619 in the Fighter struct is `costume_id`, not a flag.
- Source: werewolf.zip (2022-03-17)

##### Fighter Assertion Reveals Variable Names
- Assertion: `HSD_ASSERT(721, !fp->no_normal_motion)` reveals:
  - The local variable was named `fp` (fighter pointer)
  - The field was named `no_normal_motion`
- `fp` naming convention: first letter of object type + `p` for pointer (common in Sysdolphin code)
- Other examples: `jp` (JObj pointer), `mp` (Map pointer), `dp`, `gp` (Ground pointer)
- Source: gibhaltmannkill, werewolf.zip (2022-03-26)

##### Bitfield Usage Patterns
- HSD code tends to use manual bit fiddling with masks and defines
- Melee code tends to use C bitfields
- GObj has bitfield examples from matches
- Manual approach was used for portability (bitfield order is compiler-defined)
- May use anonymous structs (MWCC extension) or macros expanding to bitfield access
- Source: revosucks, gibhaltmannkill, rtburns (2022-03-26)

#### 2022-04 (source: 2022-04.md)

##### Fighter Struct - Special Attributes Union
- The Fighter struct contains a union for character-specific data starting at offset 0x222C.
- Union ends around 0x2340, with common state variables after.
- Named `sa` (special attributes), accessed as `ft->sa.mario.x222C`.
- Source: werewolf.zip, revosucks, rtburns (2022-04-02)

```c
union {
    struct SpecialAttrs_Mario mario;
    struct SpecialAttrs_Fox fox;
    // ... one struct per fighter kind
} sa;
/* 0x2340 */ u32 x2340_stateVar1;  // Common vars after union
```

##### Fighter Special Attributes Range
- 0x222C to 0x2340 is the union range
- 0x2420 is "Start of Per Character Article Floating Points"
- Clone characters reuse base character's attr struct (DrMario uses Mario's, Falco uses Fox's, etc.)
- Source: werewolf.zip, revosucks (2022-04-02)

##### Stage Map Struct Union
- Stage Map (gp) struct contains a union named `u` with stage-specific data.
- Discovered via assertions: `gp->u.map.parts`, `gp->u.taru.keep`, `gp->u.car.car_info`, etc.
- Source: rtburns (2022-04-02)

##### HSD_ObjAllocData Size
- Size is 0x2C bytes
- Defined in .bss section with `.skip 0x2C`
- Source: snuffysasa (2022-04-20)

##### FtState (Action State) Structure
```c
struct FtState {
    int action_id;
    int flags;
    char move_id;
    char bitflags1;
    void *animation_callback;
    void *iasa_callback;
    void *physics_callback;
    void *collision_callback;
    void *camera_callback;
};
```
- There are 320+ common states, character-specific states start at 0x140.
- Source: werewolf.zip (2022-04-23)

##### Controller nml_ Fields
- `nml_` prefix means "normalized" - values scaled to 0.0-1.0 range.
- Raw pad values are s8, then divided by scale factors (stick: 80, analogLR: 140).
- Source: werewolf.zip (2022-04-23)

##### Bitfield on Half (lhz)
- Can use bitfields on 16-bit values loaded with `lhz`.
- Example struct with union for different access patterns:
```c
union {
    struct {
        UnkFlagStruct x594_animCurrFlags1;
        struct {
            u8 x0: 7;
            u16 x7: 3;
        } x596_bits;
    };
    s32 x594_s32;
};
```
- Source: snuffysasa (2022-04-12)

#### 2022-05 (source: 2022-05.md)

##### Fighter OnLoad Template Pattern
All fighter OnLoad functions follow this structure:
1. Initialize `ft`, `ext_attr`, and `items` variables (even if unused)
2. Do pre-push attribute stuff (item calls, etc.)
3. Call `PUSH_ATTRS()` macro
4. Do post-push stuff (misc initialization)
- Source: revosucks (2022-05-20)

##### Fighter State Variables (x2340+)
- State variables at offset 0x2340+ are used differently by each fighter
- Consider using a union of per-fighter structs
- Some state variables are accessed from common fighter code
- Source: vetroidmania (2022-05-29)

##### HSD_Archive and DAT Files
- `.DAT` files are arbitrary data files on the disc (not embedded in DOL)
- Structure: header, data, string table with file offsets
- `HSD_ArchiveGetPublicAddress(archive, string)` looks up named data in string table
- Returns void* that can be cast to appropriate type (e.g., HSD_Joint*)
- Source: werewolf.zip (2022-05-24)

##### Item Data Structure
- Item variables at `xDD4_itemVar` hold different data per item type
- Use union with specific item var structs:
```c
union {
    PKFlashVars pkFlash;
    u8 padding[0xFC8 - 0xDD4];
} xDD4_itemVar;
```
- Access: `item_data->xDD4_itemVar.pkFlash.xDD8_PKFlash`
- Source: altafen (2022-05-28)

##### CreateItemUnk / SpawnItem Struct
- `SpawnItem` struct contains Vec3 members that are copied by value
- Use struct copy for Vec3 members: `spawnitem.whatever = *vel;`
- Source: altafen (2022-05-27)

#### 2022-06 (source: 2022-06.md)

##### Fighter Struct
- `x2C_facing_direction` - facing direction
- `xE0_ground_or_air` - ground/air state (HAL's original name based on symbols)
- `x1A5C` - GObj pointer for linked hitlag partner
- `x2070_int` - may be volatile
- `x68C` through `x6B0` - possibly an AnimPose/SRT/Transform structure

##### Small Data Sections (sdata/sdata2)
- GPR13 points to SDA (+0x8000)
- GPR2 points to SDA2 (+0x8000)
- Variables < 8 bytes typically go in sdata/sdata2
- Single floats may be aligned with padding when following integers
- Source: gibhaltmannkill (2022-06-29)

##### Bitfield Ordering
- The type of bitfield (`u8 x0: 1`) matters for generated instructions
- `lwz`/`lhz`/`lbz` selection depends on bitfield type and span
- Source: altafen (2022-06-04)

#### 2022-07 (source: 2022-07.md)

##### Fighter Struct State Variables (x2340+)
- The area after offset 0x2340 in Fighter struct contains action-state-specific variables
- Different action states reuse this memory with different interpretations
- Likely implemented as a union of per-action-state structs
- Different fighters may have different unions in this area
- Source: vetroidmania, snuffysasa (2022-07-05-06, 2022-07-12)

##### Fighter Callback Naming
- HAL naming convention for special moves: `SpecialN`, `SpecialS`, `SpecialHi`, `SpecialLw`
- Air versions have "Air" before the direction: `SpecialAirN`, `SpecialAirHi`, etc. (not `SpecialNAir`)
- Callback functions get `_Action` suffix: `ftNess_SpecialHi_Action`
- Source: vetroidmania, altafen, snuffysasa (2022-07-05)

##### CollData ECB Differences
- ECB (Environmental Collision Box) in item.h uses 4x f32
- ECB in fighter.h uses 4x Vec2
- Fighter ECBs are animated which may explain the difference
- Source: altafen, ribbanya (2022-07-11)

##### GObj/JObj/CObj Hierarchy
- GObj = General Object (base container)
- JObj = Joint Object (has skeleton/joints for animation)
- CObj = Camera Object
- RObj = Reference Object
- GObjs contain pointers to more specific object types via their `hsd_obj` field
- Source: revosucks, amber_0714, vetroidmania (2022-07-06)

##### Fighter Input Flags
- `fighter->input.x668` contains button press flags (instant presses)
- `fighter->input.x65C` contains held button flags
- Each bit represents a button (e.g., 0x200)
- Source: snuffysasa, vetroidmania (2022-07-16)

##### HSD_SList Structure
```c
typedef struct _HSD_SList {
    struct _HSD_SList* next;
    void* data;
} HSD_SList;
```
- Used extensively in bytecode interpreter
- Data can be cast to different types (s32, f32, pointer) depending on context
- Source: revosucks (2022-07-09)

#### 2022-08 (source: 2022-08.md)

##### Collision Flags (CollData)
```c
#define Collide_LeftWallPush 0x1
#define Collide_LeftWallHug 0x20
#define Collide_LeftWallMask 0x3F
#define Collide_RightWallPush 0x40
#define Collide_RightWallHug 0x800
#define Collide_RightWallMask 0xFC0
#define Collide_CeilingPush 0x2000
#define Collide_CeilingHug 0x4000
#define Collide_FloorPush 0x8000
#define Collide_FloorHug 0x10000
#define Collide_LeftEdge 0x100000
#define Collide_RightEdge 0x200000
#define Collide_Edge 0x800000
#define Collide_LeftLedgeGrab 0x1000000
#define Collide_RightLedgeGrab 0x2000000
#define Collide_LeftLedgeSlip 0x10000000
#define Collide_RightLedgeSlip 0x20000000

#define CollisionFlagAir_StayAirborne 0x1
#define CollisionFlagAir_PlatformPassCallback 0x2
#define CollisionFlagAir_CanGrabLedge 0x4
```
- Source: altafen (2022-08-21)

##### CollData Union at x104
- CollData has a union starting at offset x104 (size 0x2C)
- x104 acts as a tag for whether it contains floats or JObj pointers
- When x104 == 2: Contains floats (ECB dimensions + rotation angle)
  - x108: top_y
  - x10C: bottom_y
  - x110: right_x
  - x114: left_x
  - x118: angle (in radians)
- When x104 != 2: Contains JObj pointers
- Error message: `"not support rotate at JObj type coll\n"` + infinite loop on type mismatch
- Source: altafen (2022-08-21)

##### GObj Classes
```c
#define GOBJ_CLASS_STAGE 0x2
#define GOBJ_CLASS_CAMERA_RUMBLE 0x3
#define GOBJ_CLASS_PLAYER 0x4
#define GOBJ_CLASS_ITEM 0x6
#define GOBJ_CLASS_CHAIN_ITEM 0x7  // Chain-type items in-game
#define GOBJ_CLASS_GFX 0x8
#define GOBJ_CLASS_TEXT 0x9
#define GOBJ_CLASS_HSD_FOG 0xA
#define GOBJ_CLASS_HSD_LOBJ 0xB
#define GOBJ_CLASS_HSD_COBJ_TITLE 0x13
```
- Class 7 user_data struct varies based on which scene is running
- Source: werewolf.zip (2022-08-27)

##### GObj_Create Signature
- `HSD_GObj* GObj_Create(GObjClass class, GObjPLink p_link, byte p_prio)`
- The function is a wrapper around `func_8038FFB8`
- Source: altafen (2022-08-15)

##### Timer Display Structure
- Value at 0x8046DB68 bit 2 determines whether the pause HUD (LRAS graphic) renders when paused
- Source: waynebird (2022-08-14)

#### 2022-09 (source: 2022-09.md)

##### OSContext Size
- OSContext struct is 0x2C8 bytes
- Some files have padding after OSContext in .bss that gets stripped
- May need `#pragma force_active on` or FORCEACTIVE in LCF for unused data
- Source: revosucks (2022-09-03)

##### HSD Object Inlines
The `ref_INC` inline (or similar name):
```c
inline void incref(void* o)
{
    if (o != NULL) {
        HSD_OBJ(o)->ref_count++;
        if (!(HSD_OBJ(o)->ref_count != (u16) -1)) {
            __assert("object.h", 0x5D, "HSD_OBJ(o)->ref_count != HSD_OBJ_NOREF");
        }
    }
}
```
- Source: rtburns (2022-09-02)

##### JObj Assert Inlines
JObj header has many inlines with asserts. These generate separate strings for each translation unit where they're included:
- `"jobj.h"` and line numbers appear repeatedly in rodata
- Each macro call is an assert usage
- The scale assert at line 761 gets removed by compiler when it knows value is always true
- Source: revosucks, ribbanya (2022-09-02)

##### Vec/Vec3/Point3d Consolidation
- `Vec3` is in `common_structs`
- `Vec` is in `mtxtypes`
- Should be consolidated to mtxtypes following Dolphin SDK style
- Note: HSD has `HSD_VecAlloc` and `HSD_MtxAlloc` with separate HSD_Mtx44 types
- Source: rtburns, ribbanya, werewolf.zip (2022-09-04)

##### GXColor Literals
- Some data labels like `lbl_804DE200` might be GXColor literals
- Source: rtburns (2022-09-05)

#### 2022-10 (source: 2022-10.md)

##### HSD_GObj Naming
- "HSD" = HAL SysDolphin (HAL's proprietary game engine library)
- "GObj" = Game Object (or possibly General Object, Global Object)
- Used across multiple HAL games including Pokemon Colosseum
- Source: vetroidmania, gibhaltmannkill, krystalcoconut (2022-10-28)

##### HSD_Joint and HSD_Spline
- `HSD_Joint` has a `next` field for traversal
- `HSD_Spline` definition may be incomplete/missing in headers
- Source: stephenjayakar (2022-10-18)

##### Fighter File Naming Conventions
Character data file naming:
- `PlDk.dat` - Player Donkey Kong (fighter data)
- `PlDkNr.dat` - Normal colors/models
- `PlDkAJ.dat` - Animation Joint data
- `PlDkDViWaitAJ.dat` - Some idle animation data
  - "AJ" = AnimJoint
  - "DViWait" - purpose unclear, possibly unused
- Clone characters (Falco, Ganon, etc.) mostly just have function pointers to their parent fighter
- Source: jasperrlz, vetroidmania (2022-10-08)

##### Signed Int to Float Conversion Constant
The magic number `0x4330000080000000` appears frequently:
- Used for signed integer to float conversion
- Hex representation: `433000...008000...00`
- For unsigned conversion, the `8000` part is missing
- Source: vetroidmania, altafen (2022-10-25)

#### 2022-11 (source: 2022-11.md)

##### Fighter Struct Key Offsets
- `x2C` - facing_direction
- `x34_scale.z` - model scale (z component)
- `x222C` (0x100 bytes) - special attributes buffer (`sa`), character-specific variables
- `x2234`, `x2238`, etc. - character-specific within sa buffer
- `x2340` - variables that reset on action state change
- `x2D4` - pointer to read-only special attributes (from Pl__.dat files)

##### GObj/GObjProc Structure
```c
struct HSD_GObjProc {
    // ...
    u8 s_link;      // priority
    u8 flags_1;
    u8 flags_2;
    u8 flags_3;
    HSD_GObj* owner;   // x10
    void (*on_invoke)(HSD_GObj*);  // x14
};
```

##### Item/Article Structure
- Articles are items spawned by users (fighter items, stage items)
- Chain item article pointer in Sheik: accessed via `item_gobj->user_data->xC4_articleData->x4_specialAttributes->x48`
- Article data accessed through `item.h`

##### ftHitVictim Array
- Hit victim array has 12 elements (used in collision detection loops)
- Accessed at `hit->x74_victim[i]`

#### 2022-12 (source: 2022-12.md)

##### x2070 Union in Fighter Struct

Confirmed union at offset 0x2070 in Fighter:

```c
union Struct2070 {
    struct {
        s8 x2070;
        u8 x2071_b0_3: 4;
        u8 x2071_b4: 1;
        u8 x2071_b5: 1;
        u8 x2071_b6: 1;
        u8 x2071_b7: 1;
        u8 x2072_b0_3: 4;
        u8 x2072_b4: 1;
        u8 x2072_b5: 1;
        u8 x2072_b6: 1;
        u8 x2072_b7: 1;
        u8 x2073;
    };
    s32 x2070_int;
};
```

This was proven by:
- Stack write of s32 followed by bytewise reads
- The union access pattern allows both packed field access and single s32 read

Source: revosucks, ninji (2022-12-02)

##### Fighter Allocation Sizes

From `HSD_ObjAllocInit` calls in fighter.c:

| Variable | Size | Contents |
|----------|------|----------|
| lbl_80458FD0 | 0x23EC | sizeof(Fighter) |
| lbl_80458FFC | 0x424 | CharacterSpecialStats |
| lbl_80459028 | 0x8C0 | ftCommonData / Bones |
| lbl_80459054 | 0x1F0 | DObjList |
| lbl_80459080 | 0x80 | Unknown |
| lbl_804590AC | varies | FigaTree data |

Source: altimor, revosucks, ribbanya (2022-12-24)

##### State Variables vs Special Attributes

- `x222C` (SpecialAttrs) are "fighter vars" - more permanent storage that persists across action states
- `x2340` (StateVars) are temporary vars used by current action state, wiped on state change
- Example: Mewtwo's Shadow Ball charge is at x222C so it persists, while Ness's Yo-Yo animation frame goes to x2340

Source: vetroidmania (2022-12-09)

##### Hitbox Struct Union at 0x138

Discovered potential union at offset 0x138:
- Contains both `HSD_GObj*` and `u8 : 1` (1-bit field)
- Unless fighters use two different hitbox structs

Source: vetroidmania (2022-12-25)

#### 2023-01 (source: 2023-01.md)

##### Ground/Stage/Map Naming
- HAL uses specific terminology:
  - **Ground** (`gp`): The user_data struct for stage entities, analogous to Fighter (`fp`) and Item (`ip`)
  - **Stage**: A composition of multiple Grounds
  - **Map**: A specific type/subclass of Ground
- Ground struct is a god struct with unions, similar to Fighter:
  ```c
  gp->u.map.*      // Map ground type
  gp->u.scroll.*   // Scrolling ground type (Rainbow Cruise)
  gp->u.car.*      // F-Zero car type
  gp->u.carnull.*  // F-Zero car collision
  gp->u.taru.*     // Barrel type (DK stages)
  ```
- Size is approximately 0x204 bytes
- Source: rtburns, ribbanya (2023-01-17)

##### Item_Struct Naming
- HAL actually called it `Item_Struct` based on assert strings:
  ```c
  OSReport("===== Not Found Item_Struct!! =====\n");
  ```
- Source: ribbanya (2023-01-13)

##### HSD Types vs Dolphin Types
- HAL had their own types header, not using standard Dolphin types
- They likely used `u32` as `unsigned int` while Dolphin's `u32` was `unsigned long`
- This explains many matching issues
- HAL may not have used `s32` types at all in Sysdolphin, only `int` for indexes and `u[size]` for unsigned
- Source: werewolf.zip, ribbanya (2023-01-11)

##### BOOL Types
- `BOOL` in Melee is 32-bit (`s32`)
- `GXBOOL` in dolphin/gx is `u8`
- Some bool-returning functions may actually return `int` based on context
- Source: ribbanya, vetroidmania (2023-01-13)

##### Bitfield Storage
- When you set all bits in a bitfield to false at once, MW may store a full word worth of zeros
- Bitfields are probably not in typedef structs in the original code
- Source: vetroidmania (2023-01-10)

#### 2023-02 (source: 2023-02.md)

##### m-ex Types vs Decomp Types
- Some types in m-ex (https://github.com/akaneia/m-ex) are more thoroughly named than in the decomp
- Decision was made to start the decomp from scratch to avoid propagating spurious assumptions
- It's acceptable to reference m-ex for naming hints, but names should be validated before use
- When uncertain about a struct member with an m-ex name, keep the hex offset name and put the m-ex name in a comment
- Source: rtburns, vetroidmania (2023-02-15)

##### Mario Kart GP Uses HSD
- Mario Kart Arcade GP uses HSD (HAL SysDolphin), potentially useful for cross-referencing HSD behavior
- Source: amber_0714 (2023-02-12)

#### 2023-03 (source: 2023-03.md)

##### Fighter Struct Naming
- `x2D4` - Read-only file pointer to character-specific attributes (move attrs, special attrs)
- `x222C` - Renamed to `FighterVars` - mutable character-specific persistent variables
- `x2340` - Renamed to `MotionVars` - action state-specific variables (previously StateVars)
- `x222C` can contain dynamic pointers to GObjs (e.g., Mario's cape reference)
- Source: vetroidmania, ribbanya, werewolf.zip (2023-03-20)

##### HAL Naming Conventions from Smash 64
- `mstat` = motion status (action_state_index)
- `ga` = ground_or_air (changed to full name in Melee)
- `lr` = facing direction (-1 left, 1 right) - used for multiplying velocity
- `gp` = ground pointer (Ground *gp)
- `Ground_Struct` - struct naming convention uses `_Struct` suffix
- States are called "motions" internally: `"don't have smash42 motion!!!"`
- Source: vetroidmania (2023-03-06, 2023-03-12, 2023-03-20)

##### Proc Callback Naming (from Smash 64)
- proc update = animation callback
- proc map = collision callback
- proc hit = item deals damage to hurtbox
- proc shield = item gets blocked
- proc hop = item bounces off shield
- proc setoff = item collides with an attack
- proc reflector = reflection callback
- proc damage = item gets hit
- Source: vetroidmania (2023-03-06)

##### Item vs Fighter Variable Patterns
- Items: Single state vars struct shared across all action states (ItemVars)
- Fighters: Separate structs per action state, plus persistent FighterVars
- Pokemon are items and follow item conventions
- Ground/stages: Have GroundVars (non-volatile)
- Source: vetroidmania (2023-03-20)

##### GObj Class Indices
- Class 5 is unused/missing - likely a leftover from Smash 64 where it represented "projectiles"
- Class 6 corresponds to items (Melee unified projectiles under items)
- Source: vetroidmania (2023-03-06)

##### Smash 64 to Melee Similarities
- Default item lifetime: 1400 frames in both games
- Reflector damage threshold: 100 damage cap in both games
- Hitbox detection is similar
- Many architectural patterns carried over due to 1-year dev timeline
- Melee likely used defines for HSD obj layer stuff that became inlines
- Source: vetroidmania (2023-03-06, 2023-03-09)

##### Module Abbreviations
- `gm` = game (main program, game modes)
- `mp` = map (specifically collision-related)
- `mpcoll` = map collision
- Source: vetroidmania, ribbanya (2023-03-12)

#### 2023-04-to-05 (source: 2023-04-to-05.md)

##### FighterVars Size Breaking m2c

Using `FighterVars_Size` as an enum or const breaks m2c context generation:

- Enum and `const u32` both break it
- Solution: Use `#define` but force pcpp to evaluate it with `-U FIGHTERVARS_SIZE`
- The define remains in source but gets expanded in context

Source: altafen, ribbanya (2023-04-23)

##### SurfaceData Struct

```c
typedef struct SurfaceData {
    s32 index;  // 83C
    u32 unk;    // 840
    Vec3f normal; // 844
} SurfaceData;
```

At `fp+0x14C`, accessible as `&fp->x14C_ground.normal` at offset 0x844.

Source: altafen (2023-05-15)

##### Attack Group Flags (x2070)

Located around offset 0x2070 in fighter struct, using halfword union convention:

```c
// https://github.com/doldecomp/melee/blob/master/src/melee/ft/types.h#L853-L870
```

Link's boomerang gets flagged as smash attack if thrown with smash-B input.

Source: vetroidmania, ribbanya (2023-05-30)

##### HSD Object Naming Convention

| Prefix | Meaning |
|--------|---------|
| GObj | Global |
| WObj | World |
| SObj | Scene |
| CObj | Camera |
| LObj | Light |
| JObj | Joint |
| DObj | Display |
| PObj | Polygon |
| MObj | Material |
| TObj | Texture |
| AObj | Animation |
| FObj | Frame |
| RObj | Reference |

DObj = Display Object, containing mesh/model data. In HSDRaw, skeleton expands into JObjs and DObjs where DObjs contain mesh data.

Source: .durgan (2023-05-27)

##### Subaction Event: Graphic Effect (0x0A)

```c
struct GraphicEffect_Header {
    u32 opcode : 6;
    u32 boneId : 8;
    u32 useCommonBoneIDs : 1;
    u32 destroyOnStateChange : 1;
    u32 useUnkBone : 1; // Forces spawn on head instead of given bone ID
    u32 padding : 15;
};
struct GraphicEffect_Data1 {
    u32 gfxID : 16;
    u32 unkFloat : 16;
};
struct GraphicEffect_Data2 {
    s16 offsetZ : 16;
    s16 offsetY : 16;
};
struct GraphicEffect_Data3 {
    s16 offsetX : 16;
    u16 rangeZ : 16;  // UNSIGNED, not signed
};
struct GraphicEffect_Data4 {
    u16 rangeY : 16;
    u16 rangeX : 16;
};
```

Range values are unsigned - if signed, it stops matching. Negative values appear both behind and in front (possibly RNG decides sign).

Source: altafen, vetroidmania (2023-05-26)

##### Enable Jab Followup Event

The 26-bit value after opcode:
- 0 = normal
- 1 = bunny hood only (can start followup only if bunny hood equipped)

This is why Ganondorf could do his second jab with bunny hood in v1.00.

Source: vetroidmania (2023-05-25)

##### Damage Log Structure

Located at `80459278`, stores up to 10 simultaneous hits per frame:
- Hurtbox that got hit
- Attacker's hitbox pointer
- Attacker's GObj
- Log index resets every frame
- All players share the same log

Melee also has "tiplog" for phantom hits.

Source: vetroidmania (2023-05-21)

##### Attack ID Conventions

- 0 = not attack
- 1 = not attack but used for staling (needs 1 for "no stale" in attack ID, 0 in state flags)
- IDs >= 2 = specific attack types

Source: vetroidmania (2023-04-24)

#### 2023-06 (source: 2023-06.md)

##### Item Flags at xDC8 (Revo/vetroidmania, 2023-06-24)
Item struct has a word-sized flags field at offset 0xDC8:
```c
void it_80293D94(Item_GObj* arg0) {
    Item* item = GET_ITEM((HSD_GObj*)arg0);
    if (!item->xDC8_word.flags.xB && item->xDC8_word.flags.xA) {
        it_8026BC14(arg0);
    }
}
```
Contains u8-sized flag structs within.

##### ftCo_GObj Typedef (ribbanya, 2023-06-02)
`ftCo_GObj` vs `HSD_GObj` - the fighter-specific typedef is just for M2C and readability:
https://discord.com/channels/727908905392275526/1105997646381981706

##### Item_GObj Structure (ItzSwirlz, 2023-06-27)
```c
struct Item_GObj {
    /*  +0 */ u16 classifier;
    /*  +2 */ u8 p_link;
    /*  +3 */ u8 gx_link;
    /*  +4 */ u8 p_priority;
    /*  +5 */ u8 render_priority;
    /*  +6 */ u8 obj_kind;
    /*  +7 */ u8 user_data_kind;
    /*  +8 */ Item_GObj* next;
    /*  +C */ Item_GObj* prev;
    /* +10 */ Item_GObj* next_gx;
    /* +14 */ Item_GObj* prev_gx;
    /* +18 */ HSD_GObjProc* proc;
    /* +1C */ void (*render_cb)(Item_GObj* gobj, s32 code);
    /* +20 */ u64 gxlink_prios;
    /* +28 */ HSD_JObj* hsd_obj;
    /* +2C */ Item* user_data;
    /* +30 */ void (*user_data_remove_func)(Item* data);
    /* +34 */ void* x34_unk;
};
```

##### It_Kind_Unk1 Discovery (rtburns, 2023-06-25)
`It_Kind_Unk1`'s initialization function is only called from Kirby SpecialN functions - related to suck/spit animation or copy star (when losing copy ability).

##### Module Naming (kapedani, 2023-06-30)
`if` module stands for "info" (confirmed from Brawl) - HUD overlay stuff during matches. Contains iftime, ifstock, ifmagnify for on-screen overlays.

#### 2023-07-to-12 (source: 2023-07-to-12.md)

##### HSD_GObj Size
- `HSD_GObj` is confirmed to be `0x38` bytes
- Init info found at `803914A0`
- Source: altafen (2023-11-20)

##### ftCollisionBox vs ftECB
- `ftCollisionBox` has floats for top/bottom:
```c
struct ftCollisionBox {
    float top;
    float bottom;
    Vec2 left;
    Vec2 right;
};
```
- `ftECB` has `Vec2` for all four points
- Some functions incorrectly use `ftECB` when they should use `ftCollisionBox`
- `mpColl_80042C58` uses this structure
- Source: altafen (2023-11-20)

##### Ground Structs
- Grounds have an area similar to FighterVars at `gp->xC4`
- Same offset can be accessed as different types (short, HSD_TObj*, HSD_JObj*)
- This is a union pattern
- Source: altafen (2023-08-20)

##### DVDFileInfo Size Bug
- `DVDFileInfo` in the decomp is larger than what Melee used
- `DVDFastOpen` writes to offset `0x38` (callback) which can corrupt memory with old struct size
- Workaround: Create `OldDVDFileInfo` struct for affected functions:
```c
typedef struct OldDVDFileInfo {
    DVDCommandBlock cb;
    u32 startAddr;
    u32 length;
} OldDVDFileInfo;
```
- This is an actual bug in the original game code
- Source: werewolf.zip (2023-09-13)

##### ItemCommonData Type Issue
- Field `x8` changed from `f32` to `u32` at some point
- Affects scratches using this struct
- Source: altafen, kiwidev (2023-09-13)

##### HSD_ByteCodeEval Debug Info
Completely unused function with full debug symbols from K7:
```
HSD_ByteCodeEval(u8* bytecode, f32* args, s32 nb_args)
Local variables: stack, i, last_command, operand_count, operand, list, f, f0, f1, d0, d1
```
- Function at `802e4988-802e6080`
- Referenced by RObj but never actually called by the game
- Source: werewolf.zip (2023-09-25)

---

#### 2024-01 (source: 2024-01.md)

##### Melee Bug Discovery: Null Check Inversion

werewolf.zip discovered a bug in Melee's particle code where the null check is inverted:
```c
gp = pp->gen;
if (gp == NULL) {  // BUG: Should be != NULL
    *x = gp->x;    // Reads from address 0x24 when gp is NULL!
    *y = gp->y;
    *z = gp->z;
    return;
}
```
The result is that when `gp` is NULL, it loads from RAM addresses 0x24, 0x28, and 0x2C. This was fixed in K7.
- Source: werewolf.zip (2024-01-11)

##### File/Module Naming Conventions

```
cm - Camera
db - Debug
ef - (Visual) effects
ft - Fighters
gm - Game (main game loop)
gr - Ground (stages and other levels)
if - Interface, UI
it - Items
lb - Library, utility functions
mn - Menus
mp - Map (stage-related)
pl - Players (as in users)
sc - Scene
ty - Toy (trophies)
un - Unknown (not an actual original folder)
vi - Visual (cutscenes)
```
- Source: ribbanya (2024-01-11)

##### Vi Files (Visual/Cutscene Data)

```
Vi0102.dat: Mario & Luigi cutscene (Adventure Mode)
Vi0401.dat: Brinstar cutscene 1 (Intro)
Vi0402.dat: Brinstar cutscene 2 (Explosion/Exit)
Vi0501.dat: Green Greens cutscene 1 (Intro)
Vi0502.dat: Green Greens cutscene 2 (Giant Kirby)
Vi0601.dat: Corneria cutscene (Adventure Mode)
Vi0801.dat: F-Zero Grand Prix cutscene (Adventure Mode)
Vi1101.dat: Mario/Luigi Metal Bros. cutscene
Vi1201v1.dat: Bowser outro scene (Adventure Mode)
Vi1201v2.dat: Giga Bowser intro scene (Adventure Mode)
Vi1202.dat: Giga/Bowser defeated/outro
```
- Source: .durgan, werewolf.zip (2024-01-10)

##### Unsplit/Unnamed Files

Files with addresses in their names (like `lb_00B0`, `lb_00CE`) are functionally unsplit blobs with unknown original names:
- `lb_00CE` - Probably `lbmath` (contains expf and powf)
- `lb_0192` - DVD status checking, video/text rendering, SI stuff
- `lb_0198` - Multiple lbcard stuff (actually unsplit)
- `pl_0371` - Stale move management (could be `plstale.c`)
- Source: revosucks, werewolf.zip (2024-01-17)

#### 2024-02 (source: 2024-02.md)

##### CObjDesc Union Structure
- CObjDesc is a union, not a struct (confirmed via symbols from Killer7)
- Contains redundant member copying across union variants:
```c
union {
    char* class_name;
    struct { /* common fields */ } HSD_CameraDescCommon;
    struct { /* common + frustum */ } HSD_CameraDescFrustum;
    // ortho reuses frustum struct
}
```
- Source: werewolf.zip (2024-02-01)

##### BobOmbRain Structure
- `x0` field is `HSD_GObj*`, not `s32` or `enum_t`
- `x4` is `HSD_JObj*`
- Source: werewolf.zip, rtburns (2024-02-28)

##### Memcard Region Base
- `804D3EE0` points to start of memcard region at `8045A6C0`
- `8045BF28` is start of unlocked character bits
- `8045D850` is end of save named tags (buffer overflow location)
- Source: werewolf.zip (2024-02-26)

##### Field Offset Comment Convention
- Deprecated: `s32 x634_max_num_allocs;`
- Preferred: `/* +634 */ s32 max_num_allocs;`
- Source: ribbanya (2024-02-14)

#### 2024-03-to-07 (source: 2024-03-to-07.md)

##### Fighter Struct Pattern (revosucks, 2024-04-26)
Melee devs consistently declare gobj and fighter pointers at function start:
```c
type myFighterFunc(GObj* gobj) {
    Fighter* fp = GET_FIGHTER(gobj);
    // HSD_JObj* optional = gobj->jobj_data;

    // do things with fighter structs/vars
}
```
This is an 85-90% consistent pattern. If you see JObj/Fighter pointer inits in the middle of a function, suspect missing inlines.

##### Item Data Structure at Offset 0x1974 (werewolf.zip, 2024-03-22)
Offset 0x1974 on Fighter is a pointer to an item GObj:
```c
// When you see offset 0x1974 from GObj, it's likely:
Item_GObj* item = (Item_GObj*)(fp->x1974);
```
Items don't have offsets that high, so 0x1974+ on a GObj is typically Fighter-related item data.

##### Purin Attributes Unknown Region (altafen, 2024-04-22)
In `_ftPurinAttributes`:
```c
u8 _48[0x88 - 0x48];  // "we don't know what goes here but it fills 0x40 bytes"
```
When you encounter these padding regions and need fields at specific offsets, add them properly (e.g., add Vec2 at 0x80).

##### HSD_ObjAlloc Structure (werewolf.zip, 2024-05-23)
`HSD_ObjAllocInfo` doesn't actually exist - it's an inline struct within `HSD_ObjDumpStat`:
```c
// Wrong:
HSD_ObjAllocInfo->getData()  // This pattern is nonsense

// Correct - using inline struct with function pointer:
struct {
    const char* name;
    HSD_ObjAllocData* (*func)(void);
} types[i];

// Called as:
HSD_ObjAllocGetUsing(types[i].func());
```

##### GObj User Data (werewolf.zip, 2024-07-28)
GObjs are the core game loop objects:
- `user_data` is `void*` because GObjs hold everything: UI, Items, Fighters, Stages
- Priority dictates list ordering
- Link members dictate which object array they're in
- `gxlink_prios` bitfield controls graphics render order (up to 64 priorities)

```c
#define GET_FIGHTER(gobj) ((Fighter*) HSD_GObjGetUserData(gobj))
#define GET_ITEM(gobj) ((Item*) HSD_GObjGetUserData(gobj))
```

#### 2024-08-to-12 (source: 2024-08-to-12.md)

##### Compiler Version
- Project primarily uses CW 1.2.5 hotpatch (called 1.2.5n internally)
- SDK is OS revision 47 (vs May 2001 SDK which is revision 37)
- Source: encounter, werewolf.zip (2024-09-01, 2024-09-19)

##### GObj Type System
- `Item_GObj`, `Fighter_GObj`, etc. are all typedef'd to `HSD_GObj` when compiled
- The specific types exist to help m2c infer the `user_data` field type
- When compiled locally, an ifdef makes them all HSD_GObj to avoid cast errors
- decomp.me requires casts between these types that aren't needed locally
- The GET_FIGHTER macro has a cast to HSD_GObj but others don't - may need fixing
- Source: foxcam, altafen, bbr0n (2024-08-23, 2024-09-18)

##### Fighter vs ftCo Distinction
- `Fighter` is the abstract base class
- `ftCo` is the concrete implementation of common states
- Use `ftCo_GObj` when function uses common state variables (walk acceleration, etc.)
- Use `Fighter_GObj` when function just uses general Fighter struct
- Source: ribbanya (2024-09-24)

##### UNK_T Fields
- `UNK_T` in structs means the type is unknown - treated as `void*`
- Arrays with hexadecimal names (like `x1234[0x100]`) indicate unknown data
- Don't name fields based on external documentation until confirmed by decompiling
- Source: werewolf.zip (2024-09-02)

##### Item Struct Conventions
- Runtime variables: `item->xDD4_itemVar`
- Serialized attributes: `item->xC4_article_data->x4_specialAttributes`
- Character item structs go in `itCharItems.h`
- Common item structs go in `itCommonItems.h`
- Source: bbr0n, ribbanya, werewolf.zip (2024-09-22, 2024-12-13)

##### Total Codebase Size
- ~200,000 lines of code at 25% match
- Estimated 800,000+ lines for the entire game
- Source: werewolf.zip (2024-11-17)

#### 2025-01-to-04 (source: 2025-01-to-04.md)

##### Controller Button Bits (HSD_PadStatus)
- Button bit definitions available in `src/common_structs.h` lines 24-45
- Source: ribbanya (2025-04-07)

##### Fighter Motion Vars Union
- `fp->mv` is a union containing per-character motion state variables
- Members include `mv.co` (common), `mv.ca` (Captain), etc.
- KneeBend motion state uses `ftCommon_MotionVars` shared by all characters
- Source: rtburns, ribbanya, savestate (2025-04-29)

##### Jump Check Thresholds (from PlCo.dat)
- Tap jump Y-stick threshold: 0.6625
- Tap jump tilt timer: 4 frames
- If you've been in tilt zone longer than threshold frames, tap jump won't trigger
- Source: savestate (2025-04-29)

##### RGB5A3 Pixel Format
- Screenshot code converts RGB565 to RGB5A3
- `(r25 >> 1) & 0x7FE0` removes extra green channel bit
- `r25 & 0x1F` preserves lost blue channel bit
- `0x8000` OR makes fully opaque RGB5A3 color
- Source: .cuyler, altafen (2025-04-21)

##### Fighter_GObj Type
- `Fighter_GObj` is NOT a distinct struct - it's just `HSD_GObj`
- The typedef exists only to help M2C and provide self-documentation
- Under `M2CTX` guard, it's a fake struct; otherwise `typedef struct HSD_GObj Fighter_GObj`
- The game passes `HSD_GObj` around and casts `user_data` as needed
- Source: revosucks, rtburns, ribbanya (2025-04-29)

#### 2025-05 (source: 2025-05.md)

##### HurtCapsule Size Discrepancy
- Fighter-specific `HurtCapsule` has size 0x4C
- Internal generic `HurtCapsule` (used by Item and lb code) has size 0x44
- This explains mismatches in Item code that appears to read wrong types from end of HurtCapsule array
- Refactoring needed to separate these types
- Source: rtburns (2025-05-29)

##### Motion Variables (fp->mv)
- `fp->mv.co.common.xC` and similar are motion variables (state in finite state machine)
- Each state has its own union member: `fp->mv.co.turnrun.accel_mul`
- Unknown state variables should get new union members, not use `common.xC`
- Source: ribbanya (2025-05-28)

##### Static Data Section Layout
- Sections ordered: `.text` -> `.data` (big, initialized) -> `.rodata` (big, const) -> `.bss` (big, uninitialized) -> `.sdata` (small, initialized) -> `.sdata2` (small, const) -> `.sbss` (small, uninitialized)
- "Big" threshold is ~8 bytes
- `static Vec3 x;` (12 bytes, uninitialized) goes to `.bss`, not `.rodata`
- Constants in code like `float x = 1.5;` go to `.sdata2`, Vec3 literals go to `.rodata`
- Source: altafen (2025-05-25)

##### HSD_CObjDesc Union Initialization
- In C99, you can only initialize the first union member
- If you need to initialize a different member, define as that type instead (e.g., `HSD_CameraDescPerspective` instead of `HSD_CObjDesc`)
- Source: gamemasterplc, altafen (2025-05-25)

#### 2025-06 (source: 2025-06.md)

##### Fighter Union for Character-Specific State
- `ext_attr` (void*) points to character-specific attribute structs
- Use the appropriate character's attributes struct (e.g., `ftYoshiAttributes` for Yoshi code)
- Fighter struct has a union `Fighter_FighterVars` at offset +222C for character-specific state
- Each character has their own `ftXX_FighterVars` struct in the union
- Source: werewolf.zip (2025-06-25)

##### SpecialS vs SpecialHi Unions
- `SpecialS` = Side-Special (side-B)
- `SpecialHi` = Up-Special (up-B)
- Add new union members as needed for specific moves
- Source: rtburns (2025-06-21)

##### Attribute Structs
- Almost everything in character Attributes structs is a `float`
- If you see `s32` in attributes causing int-to-float conversion instructions, it's likely wrong
- Use `ninja baseline` / `ninja changes_all` to verify type changes don't regress other functions
- Source: werewolf.zip, gelatart (2025-06-17-18)

##### Mtx Type
- `Mtx` is a 3x4 matrix (not 3x3), called a TRS (Translation-Rotation-Scale) matrix
- It's a float array: `float Mtx[3][4]`
- Source: ribbanya (2025-06-22-23)

##### Jump Input Type Enum
- Return value indicating jump type: 0 = none, 1 = stick, 2 = C-stick, 3 = button (X/Y)
- Stored at `fp+2344` in kneebend states
- Source: gigabowser, ribbanya (2025-06-28-30)

##### HSD_SisLib Debug Font
- `hsd_8040FF80` is not a real relocation - it's a GXColor constant that dtk mistakenly turned into a reloc
- The 100KB+ data starting at `8040FF80` is actually font texture images for dev text (DVD error messages)
- `HSD_SisLib_8040CD40` is an array of 512-byte images passed to `GXInitTexObj`
- Source: rtburns, gamemasterplc, kellz (2025-06-09-15)

#### 2025-07 (source: 2025-07.md)

##### Fighter_GObj and ftKb_GObj
- `Fighter_GObj` is kept because it helps m2c understand user_data type
- Character-specific GObj types (`ftKb_GObj`, `ftYs_GObj`) were placeholders never finished
- These should just be `typedef struct HSD_GObj ftKb_GObj;`
- The per-fighter types are being removed as they cause confusion
- Source: ribbanya, altafen (2025-07-24)

##### VsModeData and MatchExitInfo Structs
- MatchEnd struct appears correct but may need padding at end
- MatchExitInfo needs to be split into multiple structs containing MatchEnd at different offsets
- Source: rtburns (2025-07-16)

##### Section Data Access Patterns
- mwcc places pointer to .data or .rodata, then offsets to grab actual symbol
- Large offset in codegen means you're referencing within a large unsplit TU
- Example: Kirby's ftKb_Init is ~20 unsplit files, causing large data offsets
- Don't trust objdiff on section offsets - verify in Dolphin manually if needed
- Source: revosucks, ribbanya (2025-07-25)

##### Bitfield Union Portability Issues
- Accessing same data with different union members is UB
- Byte order differs on big-endian (PPC) vs little-endian (x86/ARM)
- Bit order/packing is implementation-defined
- Need to unify bitfield unions for future PC port
- Source: rtburns (2025-07-28)

```c
// This union structure will be problematic for porting
/* fp+221C */ union {
    /* fp+221C */ struct { u8 x221C; u8 x221D; };
    /* fp+221C */ struct { u8 x221C_b0 : 1; ... };
    /* fp+221C */ struct { u16 x221C_u16_x : 7; ... };
};
```

##### Scene Organization
- Major scenes = "modes" (e.g., VS Mode, Classic Mode)
- Minor scenes = "scenes" within modes (e.g., character select, stage select)
- Kirby Air Ride osreport errors use "gmmode" and "gmscene"
- Source: gamemasterplc (2025-07-27)

#### 2025-08 (source: 2025-08.md)

##### Fighter Command Union

The `ftCmd` (actually `CommandInfo`) struct uses a hellish union with bitfields:
```c
struct {
    u32 code : 6;
    u32 b : 1;
    s32 i0 : 7;
    s32 i1 : 7;
    s32 f : 11;
} unk30;
```
Used by ftaction and it_2725 modules.
- Source: altafen, ribbanya (2025-08-28)

##### ItemStateTable Structure

```c
struct ItemStateTable {
    enum_t anim_id;
    HSD_GObjPredicate animated; // *_Anim suffix
    HSD_GObjEvent physics_updated; // *_Phys suffix
    HSD_GObjPredicate collided; // *_Coll suffix
};
```
Naming convention: `itFoo_StateN_(Anim|Phys|Coll)`
- Source: ribbanya (2025-08-07)

##### MotionState Structure (Fighters)

```c
struct MotionState {
    enum_t anim_id;
    enum_t x4_flags;
    union { /* bitfield stuff */ };
    HSD_GObjEvent anim_cb;   // *_Anim
    HSD_GObjEvent input_cb;  // *_Input
    HSD_GObjEvent phys_cb;   // *_Phys
    HSD_GObjEvent coll_cb;   // *_Coll
    HSD_GObjEvent cam_cb;    // *_Cam
};
```
- Source: ribbanya (2025-08-07)

##### Data Sections

| Section | Characteristics |
|---------|-----------------|
| .rodata | const, initialized, >8 bytes |
| .data | initialized (including `= {0}`) |
| .bss | uninitialized (runtime zeroed) |
| .sdata2 | small const data, but NOT short strings |

Note: `= {0}` goes to .data not .bss despite being zero.
- Source: ribbanya, altafen (2025-08-12)

##### MinorScene BSS Order

Non-static structs in .bss appear in reverse declaration order:
- Character select -> stage select -> start melee -> end melee -> results screen
- Declared in that order, but appear reversed in memory
- Source: rtburns (2025-08-08)

#### 2025-09-to-2026-01 (source: 2025-09-to-2026-01.md)

##### HSD_GObj_804085F0 TrspMask Array
```c
HSD_TrspMask HSD_GObj_804085F0[] = {
    HSD_TRSP_OPA,      // 1
    HSD_TRSP_TEXEDGE,  // 4
    HSD_TRSP_XLU,      // 2
    NULL               // 0
};
```
Used by `HSD_GObj_80390EB8` to convert a flag value to a proper TrspMask for `HSD_JObjDispAll`.
- Source: troy._ (2025-10-15)

##### CollData Wall Naming Convention
`CollData` struct ends with four `SurfaceData` fields: `floor`, `right_wall`, `left_wall`, `ceiling`.
- For wall fields, the side refers to the side of the fighter contacted (left_wall = wall contacted on fighter's left)
- Function names and flag enums use the opposite convention (referring to wall facing direction)
- Suggested: Use `right_facing_wall` style names to avoid confusion
- Source: gigabowser, werewolf.zip (2025-11-17, 2025-11-18)

##### Confirmed Function Names from Asserts
From assertions in the codebase:
- `lbMemory_800150F0` = `lbMemFreeToHeap`
- `lbArchiveRelocate`, `lbRefSetUnuse`, `mpCollPrev`, `mpCollEnd`, `mpGetSpeed`
- `stGetPlyDeadUp`, `ftGetParasolStatus`, `itGetKind`, `ftGetImmItem`
- `ftToSpecialNFox`, `gmResultAddPanelCamera`, `gmResultAddLight`, `gmResultAddModel`
- `gmResultSetViewPos`, `gmRegClearAddModel`, `grCorneriaGetPosMapKind2`
- `dbLoadCommonData`, `ifAddTime`, `ifAddTimeDownModel`, `ifAddMark`, `smSoundTestLoadData`
- Source: troy._ (2025-09-18)

##### Header File Names from Asserts
```
shadow.h      - sysdolphin (used in lbshadow assertion)
plbonusinline.h
```
- Source: troy._ (2025-09-19)

---

### Terminology

#### 2023-02 (source: 2023-02.md)

##### Subaction Scripts as Bytecode
- Melee's subaction script system resembles bytecode:
  - Opcode is 6 bits
  - Remaining bits are operands
  - Has GOTOs and maintains a state machine
- More accurately described as "binarized data" that functions like bytecode
- Bytecode usually implies a state machine (Turing complete or not)
- Bytecode typically runs on a virtual machine, not a real machine architecture
- Reference for subaction syntax: https://smashboards.com/threads/melee-syntax-and-guide-lets-make-super-characters.363714/
- Source: vetroidmania, clownssbm, gibhaltmannkill, werewolf.zip, mrb0nk500 (2023-02-18)

## Function-Specific Notes

### Function-Specific Insights

#### 2020-07 (source: 2020-07.md)

##### Intrinsic Functions
MWCC has built-in intrinsics that don't need declarations:
- `__frsqrte(double)` - Reciprocal square root estimate
- `__fnmsub(double, double, double)` - Fused negative multiply-subtract
- `__cntlzw(int)` - Count leading zeros
- `__memset` - Built-in memset

The SDK's `math_ppc.h` contains inline implementations using these intrinsics.
Source: gamemasterplc, camthesaxman (2020-07-02)

##### Variadic Functions
Variadic functions use `cr1` to decide whether to save float parameters:
```asm
# cr1 check pattern indicates variadic function
creqv   6, 6, 6  # Set cr1 bit 6
```
Source: gamemasterplc, ma.de (2020-07-01)

##### PSVECCrossProduct
Function at `0x80342E58` uses paired single instructions and is `PSVECCrossProduct` from the SDK's vector-matrix library. These functions use handwritten assembly and cannot be matched with C.
Source: gamemasterplc (2020-07-05)

#### 2020-08 (source: 2020-08.md)

##### Stub Functions
- Many stub functions (`blr` only) exist throughout the codebase
- Every stage has ~3 stub functions
- Stubs are sometimes padded with 0x00000000 bytes to align to 0x10 or 0x20
- No evidence of stubbed/cut fighters - all character slots are accounted for
- Source: werewolf.zip (2020-08-06)

##### Unused Blink Function Table
- Address 0x3BF2D4 (ROM) contains an entirely NULL function pointer table
- Used for texture toggle callbacks during character blinking
- Referenced by func_8007058C but never initialized
- Leftover from some unused blinking mechanic
- Source: werewolf.zip (2020-08-06)

##### Memory Card Exploit
- Memcard name tags have buffer overflow vulnerability
- Developers assumed no one would access memcard data directly
- No size validation despite fixed-length name tags
- This is the "HomeBros" exploit vector
- Source: werewolf.zip (2020-08-07)

#### 2021-06-to-10 (source: 2021-06-to-10.md)

##### File Layout Documentation
- eigenform's ASSERT.md documents file boundaries based on assert strings
- Available at: https://github.com/eigenform/melee-re/blob/master/docs/ASSERT.md
- Addresses in doc are not exact boundaries but layout is accurate
- Source: eigenform (2021-06-10)

##### amcstubs Usage
- Melee uses `amcexi2stub.o` (stub version, not amcnotstub)
- Interesting because this wasn't part of pre-1.0 CodeWarrior Dolphin
- MW 1.0 release notes mention adding support for this to prebuilt project configs
- Source: werewolf.zip (2021-10-03)

#### 2021-11 (source: 2021-11.md)

##### TRK Functions
- Melee has two instances of memcpy: regular `memcpy` and `TRK_memcpy`
- Similarly two `TRK_fill_mem` variants exist
- TRK version string in pikmin1: "TRK v0.8"
- Source: werewolf.zip, camthesaxman (2021-11-08)

##### Fighter OnLoad Functions
- Fighter functions access `ftData` struct via GObj offset 0x2C
- `FighterOnLoad_Peach` matched without scheduling pragma changes to prologue/epilogue
- This was used as evidence that not all Melee code has EPPC4 scheduling issues
- Source: revosucks (2021-11-07)

##### lb (Library) Functions
- `lb` prefix functions (like `lbvector`) are NOT part of sysdolphin
- They appear to be separate .a library files with different compilation settings
- The `lbvector` stack offset issue suggests different compiler version/settings
- Source: revosucks, werewolf.zip (2021-11-07, 2021-11-19)

#### 2021-12 (source: 2021-12.md)

##### OSReport
- Signature: `void OSReport(const char *, ...)`
- Variadic function - must declare with `...`
- Source: progenitor9339, seekyct (2021-12-14)

##### fabs
- Inline function calling intrinsic: `inline double fabs(double x) { return __fabs(x); }`
- Some functions that just call fabs may be failed inline attempts
- Source: camthesaxman (2021-12-15)

##### frexp (MSL)
- Sun Microsystems open source implementation matches
- Uses `__HI` and `__LO` macros for bit manipulation
- Source: fluentcoding (2021-12-16)

##### trigf.s (MSL)
- Contains: tanf, cosf, sinf
- Same structure between Pikmin 1 and Melee
- tanf = sin/cos pattern
- Source: epochflame (2021-12-16)

##### k_cos (MSL)
- Particularly difficult to match
- Source: epochflame (2021-12-15)

##### HSD_Archive Functions
- Handle file loading and pointer setup
- K7 debug info available for reference
- Source: werewolf.zip (2021-12-13)

##### lbarchive
- Handles returning file data to game and heap management
- Separate from HSD_Archive
- Source: werewolf.zip (2021-12-12)

##### Stage Functions
- Naming convention uses `st` prefix
- Example: `stGetPlayerDeadUp()` calculates blast zones
- Some official function names don't match Sysdolphin convention (`HSD_ObjDoThings`)
- Source: werewolf.zip (2021-12-13)

##### Test Stage Debug Code
- Has controller input that controls platform existence
- Runs in production builds
- Kraid stage has P2 debug triggers for effects
- Corneria has Smash Taunt dialogue testing
- Source: werewolf.zip (2021-12-21)

#### 2022-01 (source: 2022-01.md)

##### Fighter File Organization

- `ftcommon` contains physics-related functions and things shared by characters
- Common action states (walk, jump, shield) are in common functions, not character-specific files
- Character-specific files contain: Specials, OnLoad, OnDeath, etc.
- State machine data is in `.dat` files, not code
- Files are named with Japanese character names: `ftpurin` for Jigglypuff
- Source: werewolf.zip (2022-01-05)

##### Melee Physics/Rendering Architecture

- Physics updates are decoupled from rendering rate
- Lightning Melee speeds up physics loop; Slow Mo Melee slows it down
- Input polling runs in a separate thread at 60Hz (not 59.95)
- This causes occasional "dead input frames"
- Faster Melee ran at 120Hz with half-speed engine for better netplay
- Source: werewolf.zip (2022-01-05)

##### Assert Line Numbers

- Check the `r4` argument passed to `__assert` for the line number
- If all asserts in a file use the same line (e.g., 0x66/102), keep it as an inlined function
- Source: werewolf.zip, snuffysasa (2022-01-12)

#### 2022-02 (source: 2022-02.md)

##### HSD_Rumble (rumble.c)
- Function names from K7's ELF dump
- Completely decompiled by camthesaxman (2022-02-21)
- Uses HSD_PadCopyStatus struct
- Source: camthesaxman

##### lbArchive_InitializeDAT
- Part of file loading system
- Source: werewolf.zip

##### Clone Fighter Functions
- Many clone fighters have nearly identical code
- Dr. Mario, Falco, Young Link, etc. have very short base files
- Item-related and loading functions are copy-paste between characters
- Source: rtburns (2022-02-19)

##### Bytecode.s
- Giant state machine function
- Extremely difficult to decompile
- Source: werewolf.zip (2022-02-21)

#### 2022-03 (source: 2022-03.md)

##### File Organization: Character Specials Split by Move
- Standard character file structure:
  - ftFox.c (general)
  - ftFoxSpecialN.c (neutral B)
  - ftFoxSpecialS.c (side B)
  - ftFoxSpecialHi.c (up B)
  - ftFoxSpecialLw.c (down B)
- Source: werewolf.zip (2022-03-10)

##### Clone Characters Share Code
- Clone characters (Dr. Mario, etc.) primarily use the original character's code with character ID checks.
- Source: werewolf.zip (2022-03-10)

##### Donkey Kong Code Split
- Donkey Kong's code is physically split by Mario, Falcon, Fox, Link, and Kirby's code in the binary.
- This happened because they didn't reorder his code when adding him to the game.
- Source: werewolf.zip (2022-03-10)

##### HSD_JObjLoadJoint Takes a Pointer
- Despite one commit showing otherwise, `HSD_JObjLoadJoint` takes a pointer to struct, not a struct by value.
- Source: werewolf.zip (2022-03-13)

##### func_8000C420 Parameter Type
- Takes what appears to be u8* but passes it to func_80371C68 which treats it as HSD_JObj*.
- Likely the FighterBone fields should be HSD_JObj* (not u8*).
- Source: rtburns (2022-03-18)

#### 2022-04 (source: 2022-04.md)

##### Fighter_ActionStateChange (func_800693AC)
- Critical function called from "literally everywhere"
- Named ActionStateChange based on UnclePunch map
- Nearly 1000 lines of assembly, matched through extensive work
- Source: snuffysasa, altafen (2022-04-12)

##### func_8006DABC - File Boundary Issue
- This function appears at the end of fighter.c but may belong to a different TU.
- Takes `Fighter*` as argument while other fighter.c functions take `HSD_GObj*`.
- Moved to ftanim.s as workaround until proper matching solution found.
- Source: snuffysasa, epochflame (2022-04-22)

##### Trophy Award Function
- Located at 0x801BFA08 in melee/text_2.s
- Takes trophy ID as argument.
- Source: epochflame (2022-04-12)

#### 2022-05 (source: 2022-05.md)

##### Fighter OnLoad Functions
- Matched for all 33 characters using PUSH_ATTRS macro
- Clone characters call parent character's OnLoad:
  - `ftCFalcon_OnLoadForGanon`
  - `ftPikachu_OnLoadForPichu`
  - `ftFox_OnLoadForFalco`
  - `ftMario_OnLoadForDrMario`
  - `ftMars_OnLoadForRoy`
  - `ftLink_OnLoadForCLink`
  - `ftKoopa_OnLoadForGKoopa`
- Source: snuffysasa (2022-05-21)

##### Fighter Internal Names
| Code Name | Character |
|-----------|-----------|
| Mars | Marth |
| Koopa | Bowser |
| GKoopa | Giga Bowser |
| CLink | Young Link (Child Link) |
| ZakoBoy/ZakoGirl | Wireframes |
- "Zako" means "small fish" in Japanese (unimportant/expendable)
- Source: altafen (2022-05-21)

##### Melee Programmers
From credits, relevant to understanding code patterns:
- Akio Hanyu: Character, Stage Selection & Effect Programming
- Kouichi Watanabe: Playable Character Programming
- Tomokazu Tsuruoka: Playable Character & Special Bonus Programming
- Fighter code likely written by Hanyu, Watanabe, Tsuruoka
- Source: revosucks (2022-05-21)

##### Effect Functions (ef_)
- `ef_Spawn` / `efLib_PauseAll` / `efLib_ResumeAll`
- PauseAll freezes effects, ResumeAll unfreezes
- Spawn_Async queues effects, Spawn_Sync spawns immediately
- Pause/Resume typically used for OnEnterHitlag/OnExitHitlag callbacks
- Effect IDs 0-591 are particles in EfCoData
- Model effects 1100-1200s (Yoshi egg, Firefox, Falcon Punch)
- Screen rumble: 1300, 1301
- Source: vetroidmania (2022-05-25)

##### Action State Table Format
```c
ft_callback animation_callback;
ft_callback iasa_callback;
ft_callback physics_callback;
ft_callback collision_callback;
ft_callback camera_callback;
```
- Each move has 5 callbacks (from m-ex documentation)
- Source: altafen (2022-05-25)

#### 2022-06 (source: 2022-06.md)

##### getFighter() Paradox
- Some functions in fighter.c require `getFighter()` inline, others break with it
- The lower half of fighter.c may have been written by a different programmer
- Two programmers credited with "Player programming" in Melee credits
- Source: revosucks (2022-06-20, 2022-06-24)

##### Fighter_UpdateModelScale
- Requires multiple nested inlines: getFighter, getHSDJObj, Fighter_InitScale, HSD_JObjSetScale
- HSD_JObjSetScale calls HSD_JObjSetMtxDirty which calls HSD_JObjMtxIsDirty
- Inline depth limits cause issues - may need manual inlining
- Source: revosucks (2022-06-18, 2022-06-28)

##### HSD JObj Inlines
- Most HSD inlines have asserts at their start
- `HSD_JObjSetMtxDirty` is the exception - no assert
- `HSD_JObjMtxIsDirty` definitely exists as inline (high usage)
- JObj's mtx callback struct changed between sysdolphin versions
- Source: werewolf.zip, revosucks (2022-06-26, 2022-06-28)

##### OSReport Strings
- OSReport strings go in .rodata section
- If leaving strings in .s file causes duplication, use extern labels instead
- Source: vetroidmania, epochflame (2022-06-19)

#### 2022-07 (source: 2022-07.md)

##### HSD_ByteCodeEval
- ~1,600 lines of ASM, one of the largest functions in the codebase
- Contains two major switch statements
- Evaluates a bytecode scripting system (not the fighter animation bytecode)
- Contains 91 assert calls, helpful for mapping cases to line numbers
- Opcodes enumerate from 0x00 to 0xFF
- Used for RObj bytecode expressions
- Source: revosucks (2022-07-08-09)

##### ECB_Interpolate (mpcoll.c)
- Responsible for the rare crash at tournaments (mpcoll.c line 1193)
- Crashes when any ECB float becomes NaN
- Checks 8 different float values with `fpclassify(x) == FP_NAN`
- Calls OSReport("error\n") then asserts "0"
- Source: altafen, revosucks, bazoo23 (2022-07-03-04)

##### Fighter_OnItemPickup Callbacks
- Most fighters share nearly identical OnItemPickup functions
- Some fighters (Kirby, Link, CLink, Purin, Mewtwo) have different implementations
- A macro can generate most but not all of them
- Related callbacks: OnItemInvisible, OnItemVisible, OnItemRelease share similar patterns
- Source: snuffysasa (2022-07-03-05)

##### Stripped Function Strings
- When a function is stripped by the linker but contained assert strings, the strings remain
- "fighter parts model dobj num over!\n" and similar strings exist without corresponding code
- Workaround: Declare const strings between functions to maintain ordering
- Source: werewolf.zip, altafen, snuffysasa (2022-07-03)

##### Sheik References Ness Function
- ftSheik uses an ECB calculation function defined in ftNess_AttackHi4.c
- This is unusual - first known case of one fighter using another fighter's C file function
- Ness code comes before Sheik in link order (alphabetically)
- Source: vetroidmania (2022-07-18)

#### 2022-08 (source: 2022-08.md)

##### func_8000AFBC
- Returns OSTicksToSeconds
- Source: b_squo (2022-08-16)

##### func_80046904 (mpcoll)
- Uses collision ECB calculations
- Related to ECB bones and position updates
- Contains debug message: `"Error:oioi... id=%d\n"` ("oioi" is Japanese for "wtf")
- Source: altafen, ribbanya (2022-08-21)

##### Extern Static Variable Access
- C allows accessing another function's static variable by externing from within a different function
- Banjo Kazooie relies on this pattern for a match
- Example from BK:

```c
// In func_8038FDE0:
static f32 D_803912CC;

// In func_8038FF70:
extern f32 D_803912CC; // Access the static from above
```

- Source: revosucks (2022-08-17)

#### 2022-09 (source: 2022-09.md)

##### debug.c Functions
- Contains 4 functions including `__assert` and `HSD_Panic`
- First function requires `#pragma peephole off` due to stripped asm function above it
- Has a stripped/stubbed asm function that affects peephole behavior
- Contains unused symbol `lbl_804C28D0[0x10]` that requires FORCEACTIVE in LCF
- Source: revosucks (2022-09-03)

```c
void __assert(char* str, u32 arg1, char* arg2) {
    OSReport("assertion \"%s\" failed", arg2);
    HSD_Panic(str, arg1, &lbl_804D6010);
}
```

##### HSD_TevExpFreeList Typo
Original code has a bug - duplicate check instead of checking both fields:
```c
// Bugged original:
if (ptr->tev.c_ref == 0 && ptr->tev.c_ref == 0) {
// Should be:
if (ptr->tev.c_ref == 0 && ptr->tev.a_ref == 0) {
```
- Source: werewolf.zip (2022-09-14)

##### OSRestoreInterrupts SDK Bug
- In Melee's SDK version, OSRestoreInterrupts has a bug where it returns the value in r4 instead of r3
- Fixed in later SDK versions (1.2+)
- Nothing uses the return value of RestoreInterrupts, so it doesn't cause issues
- Source: werewolf.zip, shibboleet (2022-09-06)

```asm
/* Melee's bugged version: */
/* 803473A8 */ rlwinm r4, r4, 0x11, 0x1f, 0x1f
/* Should use r3 for return value */
```

##### assert2 Macro
Pattern for assert with message:
```c
assert2(tobj_toon, ("cannot allocate tobj for toon."));
```
- Source: werewolf.zip (2022-09-14)

##### Fighter GObj Naming Convention
- Use `fighter_gobj` (snake_case) not `fighterObj` (camelCase)
- Based on leftover asserts and OSReports showing `item_gobj` pattern for items
- Source: vetroidmania (2022-09-01)

#### 2022-10 (source: 2022-10.md)

##### Clone Fighter Code Structure
Clone fighters (Falco, Ganon, Young Link, Pichu, Dr. Mario, Roy) share most code with their parent:
- `ftFalco.s` mostly contains data with function pointers to Fox functions
- Actual game logic lives in parent fighter code
- Parent checks which clone is calling and runs appropriate animation
- Example: Ganon's warlock punch and Falcon's falcon punch are the same function
- Source: altafen, rtburns (2022-10-15)

##### ftcoll.c Status
- Contains hitbox collision checking code
- Was created by vetroidmania but work stalled on an `lwzu` chain
- Needed migration to inline asm for partial matching
- Source: vetroidmania, ribbanya (2022-10-23-27)

##### CPU AI Code
- Described as "serious spaghetti"
- Has a 60,000+ line function
- Example: Luigi AI never uses upB to recover (poor implementation)
- Source: ribbanya, cortex420 (2022-10-29)

##### getFighter - Possibly a Macro
- Suspected to be a macro rather than a real function
- Question raised about whether macros can affect codegen
- Source: ribbanya, vetroidmania (2022-10-31)

#### 2022-11 (source: 2022-11.md)

##### func_8038FD54 (GObj_AddProc/GObj_CreateProcWithCallback)
- Creates and links a GObjProc to a GObj
- Signature: `struct HSD_GObjProc* func_8038FD54(HSD_GObj* gobj, void (*func)(HSD_GObj*), u8 pri)`
- The `pri` parameter is NOT passed to the callback; it's used to order the proc in the linked list

##### func_8038FAA8 (GObj_LinkProc)
- Links a proc to its GObj and associates it with the proc table
- Orders by priority in the linked list
- Does NOT receive priority as a parameter

##### Fighter_UpdateModelScale
- Matched using inline pattern for scale initialization:
```c
inline void Fighter_InitScale(Fighter *fp, Vec *scale, f32 modelScale) {
    if (fp->x34_scale.z != 1.0f)
        scale->x = fp->x34_scale.z;
    else
        scale->x = modelScale;
    scale->y = modelScale;
    scale->z = modelScale;
}
```

##### HUD Functions with addic
- Some HUD functions check if subroutine pointers are non-NULL using `addic.` before branching
- Possibly vestigial from when HUDs used RELs (werewolf.zip theory)
- Or could be missing parentheses on function call causing function pointer comparison (ninji)

#### 2022-12 (source: 2022-12.md)

##### Fighter_UnkRecursiveFunc_8006D044

Recursive functions require special handling:

- Using getFighter in recursive calls bloats stack 3x
- Solution involved inline setBit function with assignment in call
- Direct `gobj->user_data` access was necessary in one spot despite getFighter usage elsewhere

Source: revosucks, ribbanya (2022-12-02)

##### func_80031640 (cm/cmsnap)

This is a switch statement, not if/else chains:
- The variable type being unsigned matters for case detection
- `case < 1` on unsigned means case is 0

Source: revosucks, giginss (2022-12-02)

##### func_80291DAC - Infinite Super Scope Glitch

The function is expected to return `s32` but when the infinite super scope glitch occurs:
- If the loop completes without breaking, it skips the `mr r3,r8` return
- r3 remains the input parameter (offset 0x1974 of fighter's user_data - pointer to held item)
- This is how the bug manifests at the code level

Source: vetroidmania (2022-12-11)

##### G&W Bacon (Neutral B)

Extremely difficult to match:
- Always either one regswap or one-two instructions away
- Possible undefined behavior somewhere
- Using `int` instead of `s32` changes codegen drastically but creates other issues

Source: vetroidmania (2022-12-25)

#### 2023-01 (source: 2023-01.md)

##### Fighter Callbacks
- Callbacks like `x21DC_callback_OnTakeDamage`, `x21E4_callback_OnDeath2` etc. are set via helper functions
- Example from Samus:
  ```c
  inline void ftSamus_updateDamageDeathCBs(HSD_GObj* fighterObj) {
      Fighter* fighter = Fighter_GetFighter(fighterObj);
      fighter->cb.x21DC_callback_OnTakeDamage = &ftSamus_80128428;
      fighter->cb.x21E4_callback_OnDeath2 = &ftSamus_80128428;
  }
  ```
- Source: revosucks (2023-01-15)

##### Fighter_UpdateModelScale
- Final correct version:
  ```c
  void Fighter_UpdateModelScale(HSD_GObj* fighter_gobj)
  {
      Fighter* fp = (Fighter*)HSD_GObjGetUserData(fighter_gobj);
      HSD_JObj* jobj = (HSD_JObj*)HSD_GObjGetHSDObj(fighter_gobj);
      Vec scale;
      f32 modelScale = Fighter_GetModelScale(fp);

      if (fp->x34_scale.z != 1.0f)
          scale.x = fp->x34_scale.z;
      else
          scale.x = modelScale;

      scale.y = modelScale;
      scale.z = modelScale;

      HSD_JObjSetScale(jobj, &scale);
  }
  ```
- Source: revosucks (2023-01-13)

##### ftlib Module Pattern
- `*lib` files (e.g., `ftlib`) contain public functions to interact with the module
- Calls from `item.c` go to `ftlib.c`, not other files in `ft`
- Source: ribbanya (2023-01-13)

##### Samus Extender Code Location
- The Samus grapple beam/extender code is in `asm/melee/it/code_8027CF30.s` at `lbl_802B7E34`
- Function: `Item_GrappleBeam_Startup`
- Source: rtburns (2023-01-10)

##### Tether Code Location
- Tether code shared by Links and Samus is in `ft_unknown_006`
- This file contains a lot of character-specific code beyond the 341 common states
- Source: ribbanya (2023-01-10)

##### NaN Position Check
- Debug code checks for NaN positions:
  ```c
  if (g_debugLevel >= 3) {
      if (fpclassify(fp->xB0_pos.x) == FP_NAN ||
          fpclassify(fp->xB0_pos.y) == FP_NAN ||
          fpclassify(fp->xB0_pos.z) == FP_NAN)
      {
          OSReport("fighter procMap pos error.\tpos.x=%f\tpos.y=%f\n",
                   fp->xB0_pos.x, fp->xB0_pos.y);
          __assert(__FILE__, 2590, "0");
      }
  }
  ```
- Source: revosucks (2023-01-13)

##### Dead Code / Typos in Original
- Some original code has what appears to be typos:
  ```c
  void func_803755A8(void)
  {
      // Does nothing, but need to force a comparison to make this match
      if (current_render_pass == HSD_RP_OFFSCREEN)
          current_render_pass == 0;  // Typo: == instead of =
  }
  ```
- Source: ribbanya (2023-01-10)

#### 2023-03 (source: 2023-03.md)

##### TExp Functions
- Functions like `HSD_TExpColorIn`, `HSD_TExpAlphaOp`, `HSD_TExpAlphaIn` have type aliasing issues
- Sometimes last parameter is a pointer, sometimes it's `HSD_TEXP_RAS` (-1)
- Uses "ghetto type aliasing" with `HSD_TExpGetType`
- Branch with more matches: https://github.com/doldecomp/melee/compare/master...PsiLupan:melee:texp-match
- Source: werewolf.zip (2023-03-15)

##### Update Function Signatures
- `MObjUpdateFunc` and similar should use `unsigned int` for type parameter, not `enum_t`
- These are called through function pointers so they don't get inlined
- Source: werewolf.zip (2023-03-15)

##### Special Attrs Access Pattern Issue
- The special attrs at offset 0x2D4 sometimes behave unexpectedly
- Hypothesis: May be a union in original HAL code but we're using casts
- `getFtSpecialAttrsD` matches more often than the non-D variant (which may be a fake function)
- Finding smallest functions that demonstrate the issue helps narrow down the fix
- Source: revosucks, ribbanya (2023-03-18, 2023-03-19)

#### 2023-04-to-05 (source: 2023-04-to-05.md)

##### SDI (Smash Directional Influence)

SDI implementation: https://decomp.me/scratch/aVCqi

Source: ribbanya (2023-05-15)

##### Ledge Mechanics

- `CliffEscape` = ledge roll
- `CliffClimb` = ledge getup
- `CliffJump` = ledge jump
- Slow/Quick variants based on `p_ftCommonData->x488` damage threshold

Source: kiwidev, ribbanya (2023-05-28)

##### Master Hand FighterVars Access

HAL points 4 bytes ahead and uses that pointer to access Master Hand's fightervars instead of accessing directly.

Source: vetroidmania (2023-05-02)

##### Unused Features

**Smash 64 Angled Up Tilts**: Code exists for angled up tilts (up-forward, up-backward) but no character has animations for them. Dropped in later games.

**Polygon Fighter Specials**: In Smash 64, polygon fighters have special move and grab code but are prevented from using them via a flag. Specials often crash when enabled.

**Jigglypuff Unused Content**: Has unused rapid jab and neutral B statevar in Smash 64.

Source: vetroidmania (2023-04-29, 2023-05-20)

##### Smash 64 Alt Costumes

64 treats alt costumes as matanims (material animations) for the most part instead of separate model files - enables the 3D character select screen.

Source: vetroidmania (2023-05-22)

#### 2023-06 (source: 2023-06.md)

##### Super Yoyo Glitch Investigation (vetroidmania, 2023-06-26)
There is no "super yoyo glitch" in the original game code:
- Investigation confirmed no mechanism for hit target record to clear automatically
- 20XX mod uses an onframe function that constantly refreshes the hitbox to simulate it

##### ftColl_8007A06C (ribbanya, 2023-06-02)
Large function with 0% initial match:
```
Function            Size   Score     Max      %
ftColl_8007A06C  2.78 KB  69,500  69,500  0.00%
```

##### it_802ADA1C (rtburns, 2023-06-25)
Start of itunk1's text section - first function is initialization for Kirby's copy star item.

#### 2023-07-to-12 (source: 2023-07-to-12.md)

##### Callback Naming Convention
HAL used `proc` for callbacks internally:
```
fighter procUpdate pos error.   pos.x=%f        pos.y=%f
fighter procMap pos error.      pos.x=%f        pos.y=%f
Other Dead_Proc Existence
```
- `procUpdate` corresponds to animation callback
- HSD uses `pre_cb`, `post_cb`, `drawdone.cb` patterns
- Recommend using `_cb` suffix: `render_cb`, `anim_cb`, `phys_cb`
- Source: vetroidmania, werewolf.zip, ribbanya (2023-10-09)

##### HSD_CObjSetCurrent
- Takes only 1 argument, not 2
- Previous match with 2 args was incorrect
- The second arg was render pass but was never actually used
- Contains inlined `setupNormalCamera` function
- Source: werewolf.zip (2023-10-14)

##### Item Spawn Functions
```c
// Airborne spawns
HSD_GObj* Item_80268B18(SpawnItem* spawnItem);

// Ground spawns
void Item_80268B5C(SpawnItem* spawnItem);
```
- Source: werewolf.zip (2023-09-18)

##### Library Mysteries
No debug info found for these HSD libraries:
- JPEG
- THP
- SIS (text/menu related - see HSDLib's `SIS_MenuData.cs`)
- Source: rtburns, werewolf.zip (2023-09-25)

---

#### 2024-01 (source: 2024-01.md)

##### lbArchive Functions

`lbArchive_80016AF0` loads file sections from archives:
```c
lbArchive_80016AF0(archive, &title_ptrs.top_joint, "TtlMoji_Top_joint",
    &title_ptrs.top_animjoint, "TtlMoji_Top_animjoint", ...);
```
Takes pairs of (pointer to store result, symbol name string), terminated by NULL.
- Source: werewolf.zip (2024-01-17)

##### sqrtf Implementation

The original MSL sqrtf from `math_ppc.h` uses Newton-Raphson iterations:
```c
extern inline float sqrtf(float x)
{
    static const double _half=.5;
    static const double _three=3.0;
    volatile float y;
    if(x > 0.0f) {
        double guess = __frsqrte((double)x);
        guess = _half*guess*(_three - guess*guess*x);  // 12 sig bits
        guess = _half*guess*(_three - guess*guess*x);  // 24 sig bits
        guess = _half*guess*(_three - guess*guess*x);  // 32 sig bits
        y=(float)(x*guess);
        return y;
    }
    return x;
}
```
The `sqrtf_accurate` function adds an extra iteration for >32 significant bits.
- Source: revosucks, rtburns (2024-01-16, 2024-01-27)

##### GET_FIGHTER Macro

- Use `GET_FIGHTER(gobj)` or `fighter_gobj->user_data` for fighter access
- Do NOT use `getFighterPlus` - it's a fake match that consumes stack
- Source: altafen, ribbanya (2024-01-24)

#### 2024-02 (source: 2024-02.md)

##### ftData x4C Field
- Previously assumed to be CollData - this was wrong
- Actually SFX data
- Required updating many existing matches
- Source: werewolf.zip (2024-02-19)

##### zakogenerator Functions
- "zako" means weak/trash generator
- Controls trash mob spawning in Adventure mode
- `grZakoGenerator_801CAE04` called by basically every stage
- May control item spawns in general
- Passes `Item_GObj*` despite function signatures sometimes showing otherwise
- Source: werewolf.zip (2024-02-22)

##### lbAudioAx_800237A8
- Parameters: `(s32 sfx_id, u8 sfx_vol, u8 sfx_pan)`
- 0x7F and 0x40 are standard volume and panning values
- Could be defines since they're constant across call sites
- Source: ribbanya (2024-02-20)

##### IsTrophyUnlocked (8015D984)
- Part of gmmain_lib
- Named by altimor's Ghidra database
- Oddly writes to memory despite being a "check" function
- Source: altafen (2024-02-26)

#### 2024-03-to-07 (source: 2024-03-to-07.md)

##### ftData_UnkMotionStates4 (rtburns, 2024-03-01)
According to melee-re, this is a table of "charge neutral-B" action states, based on fighters listed.

##### Memory Card Encryption/Decryption (alex_aitch/cuyler/altafen, 2024-07-09)
Functions at 0x803b31cc (decrypt) and 0x803b2e04 (encrypt):
- Main decrypt function: `MemoryCard_DecryptMain`
- Scramble operation uses modulo 13
- Matched scratches available for reference

##### Link's Hookshot vs Samus Grapple (foxcam, 2024-07-25)
While both are ledge tethers/grabs:
- Share some code (e.g., `ftCo_AirCatch`, collision at 80051ec8)
- Link's has manual matrix math for animations
- 800c3d6c has similar code in big if-else for both

#### 2024-08-to-12 (source: 2024-08-to-12.md)

##### GET_FIGHTER/GET_ITEM Macros
- Evidence suggests these may have been static inlines rather than macros
- Assert string found: `"ftGetImmItem item_gobj is NULL!!\n"` in ftpickupitem.c
- Indicates a particular coding style was used
- Source: werewolf.zip (2024-08-17)

##### SDK Function Differences
- Some functions have different signatures between SDK versions
- Example: GX functions taking `GXColor` vs `GXColor*`
- Source: werewolf.zip (2024-09-19)

##### Trophy Unlock Function
- `0x8030562c` is the trophy unlock function
- Takes r3 (short, trophy ID) and r4 (bool, usually 1)
- Trophy ID 165 has special handling
- Source: werewolf.zip (2024-09-04)

#### 2025-01-to-04 (source: 2025-01-to-04.md)

##### vi/ Directory (Video/Cutscenes)
- Contains Adventure Mode cutscenes (in-game, not pre-rendered)
- NOT the pre-title screen CG movie
- Numbers correspond to Adventure mode stage numbers
- Contains setup for GObjs: characters, cameras, etc.
- Character IDs reveal which cutscene (e.g., Luigi/Mario/Peach = Peach's Castle footstool)
- Source: werewolf.zip, revosucks (2025-03-16)

##### gr/ vs st/ Naming
- Project uses `gr` prefix for stages (from "ground", "groundparam")
- `st` (stage) is colloquial but not used in codebase
- Naming based on file prefixes and assert strings
- Source: werewolf.zip (2025-02-26)

##### Screenshot GCI Files
- Screenshot files are variably sized - extremely rare for GCI files
- Only PSO quest files share this characteristic
- Source: __louis (2025-01-23)

##### Slippi/Rollback Architecture
- Slippi uses fake EXI device for Dolphin-to-memory communication
- Records large memory regions since they don't know all region purposes
- Ideal rollback only records necessary state
- Melee has built-in animation interpolation to higher frame rates
- Faster Melee changed frame timing + CPU speed
- Source: werewolf.zip (2025-01-02)

#### 2025-06 (source: 2025-06.md)

##### State Entry Function Naming
- Functions that initialize MotionState should be named with `_Enter` suffix
- Example: `ftCo_KneeBend_Enter` for entering KneeBend state
- Tilt turn vs smash turn use the same state (0x12/Turn) but different entry points
- State duration is set via `mv.x10`
- Source: gigabowser, altafen, ribbanya (2025-06-01)

##### Static vs External Functions
- `fn_` prefix means the function "fell through naming cracks" - usually static/local functions
- If a function is called from another TU, remove `static` and add to header
- Use lower camelCase for static functions inside a file (e.g., `onEnter`)
- Address-based names (`fn_XXXXXXXX`) are temporary
- Source: ribbanya, gigabowser, altafen (2025-06-01)

##### OSReport Stack Effects
- Changes to `OSReport` declaration can cause stack size changes in calling functions
- This caused issues during the extern/dolphin integration
- Functions calling `Player_CheckSlot` (which calls OSReport) were affected
- Source: werewolf.zip, rtburns (2025-06-02)

##### AXSetVoiceMix Bug Fix
- DolSDK2001 had a bug: `src = (u16*)&mix;` (pointer to pointer)
- Melee's version has the correct: `src = (u16*)mix;`
- Source: werewolf.zip (2025-06-03)

##### ftCo_800CBAC4 Inline Pattern
- This function gets inlined by many callers but also called directly from other files
- Solution: Mark it `inline` - the compiler decides whether to actually inline based on context
- Breaking it into smaller helper functions/inlines can help match
- Source: revosucks, gigabowser (2025-06-27)

#### 2025-07 (source: 2025-07.md)

##### Fighter Callbacks
- `fp->accessory4_cb` is commonly used for character-specific state callbacks
- `fp->death2_cb` and `fp->take_dmg_cb` reset copied abilities (Kirby)
- HAL tends to start almost every function with setting the fp variable
- Seeing a second GET_FIGHTER suggests an inline function
- Source: revosucks (2025-07-24, 2025-07-25)

##### mn_8022DDA8_OnEnter Varargs
- Calls `lbArchive_LoadSymbols` with ~168 arguments
- Takes list of {pointer, symbol name} tuples for loading from dat files
- Terminating zero argument pushed to sp + 0x284
- Source: rtburns (2025-07-25)

##### THPDec Differences
- Melee's THPDec passes decoder state as struct to each function
- Other projects use globals for decoder state
- Source: rtburns (2025-07-30)

##### Static Functions and Inlining
- Every static function could turn into inlines within the TU
- If previous function in file hit inline limit, it exposes the inline at end of TU
- Source: revosucks (2025-07-29)

#### 2025-08 (source: 2025-08.md)

##### Falcon Down-B Double Jump

Falcon's aerial down-B restores his double jump on the last frame:
- `ftCa_SpecialAirLw_Anim` checks `!framesRemaining`
- Calls `ftCommon_8007D5D4` (the "restore airjump" function)
- Possibly copied from grounded down-B code path
- Source: altafen (2025-08-30)

##### CPU Behavior Logic

- ftCo_0A01 contains CPU behavior/AI logic
- ftCo_0B3E possibly related
- CPU command bytecode interpreter decompiled - CPUs use virtual controllers
- Commands include: press/release buttons, move stick toward enemy/stage
- Source: rtburns (2025-08-25-26)

##### HSD_JObjSetMtxDirty

Confirmed to be a function, not a macro:
https://github.com/ribbanya/melee/commit/fcccad97b418241b5c4c79f3dd8ae4bf4e281a8e
- Source: ribbanya (2025-08-16)

##### Brawl Function Names (Korean Brawl Symbols)

Zebes stage functions matched to Melee:
```
grZebesMapProc       -> grZebes_801d881c
grZebesWaterProc     -> grZebes_801d99e0
grZebesBGProc        -> grZebes_801d9f84
grZebesShaftUpdate   -> grZebes_801da528
grZebesCellAdd       -> grZebes_801dae70
grZebesCellUpdateOne -> grZebes_801db088
grZebesCellUpdate    -> grZebes_801db3cc
grZebesCellRebirth   -> grZebes_801dc408
grZebesCellInit      -> grZebes_801dc9DC + grZebes_801dc744
```
Korean Brawl has symbols; matched by comparing function patterns in Ghidra.
- Source: mariolover64 (2025-08-29)

#### 2025-09-to-2026-01 (source: 2025-09-to-2026-01.md)

##### Popo Ceiling Stick Bug
In `ftPp_SpecialAirS1_Coll` (Popo's aerial side-B collision callback):
```c
if ((fp->coll_data.env_flags & 0x6000) == 1) {  // Always false!
    fp->self_vel.y = 0.0F;
}
```
- `0x6000` is a bitmask for ceiling collision/hug
- The condition can never be true (result of bitwise AND with 0x6000 can't equal 1)
- Likely intended: `!= 0` instead of `== 1`
- This bug allows Popo to "stick" to ceilings with up-B
- Possible cause: inline returning bool used as `== TRUE` where BOOL is actually int
- Source: gigabowser, roeming (2025-11-30)

##### Nana Garbage DI Bug
In `ftCo_800AC5A0`:
```c
ftCo_800B46B8(fp, CpuCmd_SetLstickX, stick_y);
ftCo_800B46B8(fp, CpuCmd_SetLstickY, stick_x);
```
- `stick_x` and `stick_y` can be uninitialized
- Causes Nana to DI with garbage data from r30/r5
- Use `/// @bug` documentation tag for these
- Source: kellz, werewolf.zip (2025-12-01)

##### Ness PK Fire Pillar Bug
In `itNesspkfirepillar_UnkMotion0_Phys` and `itNesspkfirepillar_UnkMotion0_Coll`:
```c
if ((item->ground_or_air = GA_Air)) {  // Assignment, not comparison!
    // ...
}
```
- The `=` should be `==` for a proper check
- This always sets the item to air and always enters the if block
- Took 2 hours to discover this was intentional matching behavior
- Source: savestate, altafen, revosucks (2025-12-17, 2025-12-20)

##### VIWaitXFBFlush / Game Loop
- `VIWaitXFBFlush` checks the state of VI buffers
- Used at end of game loop to wait for VI buffer to finish drawing before returning
- Core game loop: https://github.com/doldecomp/melee/blob/master/src/melee/gm/gm_1A45.c#L374
- Source: werewolf.zip (2025-12-01)

##### Pokemon Stadium Screen Capture
- Uses a GObj with render priority 1 that clears framebuffer and copies EFB before HUD renders
- Separate GObjs handle text rendering with SISLib
- Setup function: `grstadium.c:L1175`
- Source: werewolf.zip (2025-12-24)

---

### Notable Scratches Referenced

#### 2022-11 (source: 2022-11.md)

- func_80117D9C fix: https://decomp.me/scratch/v6uGe
- sa casting examples: https://decomp.me/scratch/yfOzx, https://decomp.me/scratch/qLMg1
- G&W Neutral B (difficult): https://decomp.me/scratch/P7Z9j, https://decomp.me/scratch/kFkx6
- GObjProc alloc: https://decomp.me/scratch/PxWX7
- Fighter proc patterns: https://decomp.me/scratch/dUUbD, https://decomp.me/scratch/plaCE
- Grab collision check: https://decomp.me/scratch/KQhCQ
- Hitbox detection: https://decomp.me/scratch/sN0Ib

## Tools, Automation, and AI

### Tool Tips

#### 2020-07 (source: 2020-07.md)

##### Linker
- `mwldeppc.exe -dis file.o` - Disassemble object file
- `FORCEFILES` directive prevents linker from discarding "unused" sections
- `FORCEACTIVE` for specific symbols
- Linker does partial filename matching - `debug.o` can conflict with `dsp_debug.o`
- Link times are O(n^2) on symbol count; splitting files dramatically improves speed

##### Build System
- Dolphin emulator can load extracted filesystem directly (no ISO rebuild needed)
- Right-click game -> Properties -> Filesystem -> Extract to get DOL

##### Debugging Symbols
- Interactive Multi-Game Demo Disk 2004 has full TRK debug symbols
- Killer7 has unoptimized sysdolphin with DWARF v1 debug info
- HAL Resource Tool contains struct definitions for many HSD types

#### 2020-08 (source: 2020-08.md)

##### Linker File Order
- Object link order is determined by command-line order passed to mwldeppc
- In CodeWarrior IDE, there's a tab to manage file link order (move up/down)
- Wildcard LCF sections use command-line order for resolution
- Source: revosucks, werewolf.zip (2020-08-05)

##### elf2dol BSS Size Fix
- Original elf2dol incorrectly calculated BSS size
- Fix required tracking PHDR values for sdata and sbss
- BSS size = sizeof(bss) + sizeof(sdata) + sizeof(sbss)
- Pass PHDR indices to elf2dol (e.g., `tools/elf2dol main.elf main.dol 9 10`)
- Source: revosucks (2020-08-05)

##### Assembly Extern Requirements (mwasmeppc)
- mwasmeppc doesn't recognize `.global` for external symbols
- Must use `.extern` for forward references
- Create a `global.inc` with all extern declarations
- Include this file in every assembly file
- Source: revosucks (2020-08-12)

##### GCC Syntax Checking
- Run CCCHECK with GCC to parse C syntax before mwcc compilation
- Catches syntax errors that mwcc might not report clearly
- Source: revosucks (2020-08-05)

##### Disassembly Tools
- Doldisasm generates .s files: https://gist.github.com/camthesaxman/a36f610dbf4cc53a874322ef146c4123
- Output is meant for GNU assembler, not mwasmeppc directly
- Converting to mwasmeppc format requires `.extern` declarations
- Source: camthesaxman (2020-08-01, 2020-08-12)

##### Wine Compatibility
- Wine 5.14 and 5.15 broke CodeWarrior linker (CWParserSetOutputFileDirectory error)
- Wine 5.13 is last known working version
- Error: `Unexpected error in CWParserSetOutputFileDirectory [3]`
- Source: revosucks (2020-08-21)

#### 2020-09-to-12 (source: 2020-09-to-12.md)

##### Build and Verification
- The DOL should be 100% identical when rebuilt
- Rebuilt ISO with compiled DOL produces perfectly functional game
- Target version: 1.02
- Non-decompiled code is kept in assembly files
- Source: gamemasterplc (2020-11-29)

##### Ghidra Setup
- Gekko/Broadway language extension for Ghidra: https://github.com/aldelaro5/ghidra-gekko-broadway-lang
- Was recommended and in use as of 2020
- Source: kiwidev, ed_ (2020-11-29)

##### Progress Tracking
- GitHub's C percentage is inaccurate due to inlined assembly
- At 1.1% C according to GitHub metrics at the time
- Source: werewolf.zip (2020-12-01)

#### 2021-06-to-10 (source: 2021-06-to-10.md)

##### Shiftability Progress Script
- Script to extract `.4byte` from offset with specific length
- Useful for dealing with data sections during shiftability work
- Jump tables and pointer lookup tables are pervasive in Melee
- Source: werewolf.zip (2021-09-27)

##### SDA Handling
- Use `@sda21` with `@h/@ha/@l` for r2/r13 offsets
- Standard approach used in Pikmin and other GC decomps
- Source: epochflame (2021-09-27)

#### 2021-11 (source: 2021-11.md)

##### File Splitting Techniques
1. **Panic strings**: Filenames in panic messages indicate compilation unit boundaries
2. **Float-to-int constants**: `0x43300000` (for int-to-float conversion) appears once per compilation unit
3. **Call trees**: Functions only called by nearby functions are likely in the same file
4. **8-byte alignment**: Data sections align to 8 bytes at file boundaries
5. **Pointer tables**: Item pointer tables can help identify `it_*` file boundaries
Source: epochflame, werewolf.zip (2021-11-22)

##### elf2dol Improvements
- Old elf2dol had issues with:
  - DOL header section sizes
  - BSS overlap calculations
  - Missing objcopy header fix
- Cam's update fixed DOL header generation but broke some projects
- Combined fix removes need for objcopy post-processing
- BSS size in DOL header = (end of last BSS section) - (start of first BSS section)
- This range intentionally overlaps some data sections
Source: werewolf.zip, camthesaxman, kiwidev (2021-11-22)

##### _rom_copy_info Section Sizes
- Section sizes in `_rom_copy_info` must match ELF sizes, NOT padded DOL sizes
- Use `readelf -S` to verify section sizes match
- extab and extabindex sections often need manual padding adjustment
- Source: camthesaxman (2021-11-22)

##### Ghidra for Compiler Analysis
- epochflame created a Ghidra project for the 1.0 compiler
- Technique: NOP function calls or make functions return immediately to identify purpose
- Bookmarked functions: `StackFrameGen`, `Scheduler`, related subfunctions
- Stack frame generation at `0x433ff2`
- Source: epochflame (2021-11-22)

#### 2021-12 (source: 2021-12.md)

##### decomp.me Usage
- Works with one function at a time
- Copy ASM from melee repo, not Ghidra (Ghidra output won't assemble correctly)
- When extern data shows as `(0)` instead of `(r2)`, that's expected - linker resolves it
- Source: camthesaxman (2021-12-14)

##### Context in decomp.me
- Copy header contents and paste into context field
- For math functions, add fabs inline if not present:
```c
inline double fabs(double x) { return __fabs(x); }
```
- Source: camthesaxman (2021-12-15)

##### Ghidra Tips
- Highlighting ASM in Ghidra highlights corresponding decompiled code
- Works both ways - highlight decomp to see corresponding ASM
- `undefined4` means 4-byte value of unknown type (could be int, pointer, etc.)
- DON'T trust Ghidra as gospel - use it as a starting point only
- Source: epochflame, revosucks (2021-12-14, 2021-12-19)

##### Manual Compilation
- When manually compiling with mwcc, include paths matter:
```bash
mwcceppc.exe -S -Cpp_exceptions off -proc gekko -fp hard -O4,p -enum int -nodefaults \
    -i src/melee/pl -I- -i include -i include/dolphin -i include/dolphin/mtx -i src \
    src/file.c
```
- If linker errors about `mwldnr2` occur, the linker executable needs to be findable
- Use `-S` for assembly output, `-c` for object files
- Source: kiwidev, epochflame (2021-12-12)

##### Build System
- Use `make -j` for parallel compilation (significant speedup)
- `make clean` needed when switching commits to ensure header changes rebuild
- Linkage is single-threaded regardless of `-j` flag
- Source: epochflame (2021-12-13)

##### Cross-Referencing Pikmin
- Pikmin 1 and 2 share MSL/SDK code with Melee
- Pikmin has a symbol map - use it to identify/label shared functions
- Same function in Pikmin can be used as reference for Melee
- Some minor variations exist between games
- Source: epochflame (2021-12-16)

##### fdlibm (Sun Microsystems)
- Math library functions are open source: https://www.netlib.org/fdlibm/
- Many match directly or with minor modifications
- Preserve the Sun Microsystems copyright notice
- Source: epochflame (2021-12-14)

#### 2022-01 (source: 2022-01.md)

##### decomp.me Usage

- decomp.me calls the same compiler and compares assembly
- If it matches on decomp.me, it will match when moved to repo
- **Caveat**: decomp.me doesn't print data sections - verify those match separately
- Data section issues are usually trivial fixes in C
- Source: gibhaltmannkill, werewolf.zip (2022-01-20)

##### rlwinm Decoder

Useful tool for understanding rotate/mask instructions:
https://celestialamber.github.io/rlwinm-clrlwi-decoder/
- Source: camthesaxman (2022-01-18)

##### Map File Generation

```bash
make -j4 GENERATE_MAP=1
```
- Map generation is slow, so it's optional
- The linker calculates addresses for everything during build
- Source: camthesaxman (2022-01-07)

##### Verbose Build Output

```bash
make VERBOSE=1  # See which tools are being invoked
make clean      # Always clean after changing devkitPPC versions!
```
- Source: revosucks (2022-01-09)

##### Quick Disassembly

```bash
python3 doldisasm.py melee.dol > code.s
```
- Gives quick and dirty ASM source to copy from
- Run in a clean folder or it'll overwrite the LCF
- Source: revosucks (2022-01-07)

#### 2022-02 (source: 2022-02.md)

##### decomp.me
- Use scratch context that avoids `sizeof()` to make mips_to_c work properly
- Can rerun decompilation after updating context
- Data offset differences may require fake string declarations to align
- Does NOT handle string literal offsets correctly (shows (0) instead of (r2)/(r13))
- String literals will match in real build if const settings are correct
- Source: tri_wing_, seekyct (various dates)

##### Map File Generation
- `GENERATE_MAP=1 make` generates map file
- Requires linker to run; touch a source file if map not regenerating
- Map generation is slow
- Source: altatwo, revosucks (2022-02-20)

##### r40 DevkitPPC Compatibility
- Requires `.balign 8` at start of data/sdata/sbss/sdata2 sections at file boundaries
- Remove `.4byte NULL` padding that was faking alignment
- BSS sections may need special handling (moved to different files)
- calcprogress.py counts balign as decompiled code, inflating percentages
- Source: epochflame, werewolf.zip (2022-02-20)

##### calcprogress Script Issues
- Object files with same name (e.g., dolphin/mtx.s.o and baselib/mtx.s.o) can confuse scripts
- Kiwi's script looks up by obj_name without full path
- Solution: Use `.c.o` and `.s.o` file extensions to distinguish decompiled vs asm
- Source: camthesaxman, kiwidev, werewolf.zip (2022-02-21)

##### Ghidra Setup
- PPC support works out of box
- For GameCube: need Ghidra-GameCube-Loader plugin
- Bitfield support exists but tricky to configure
- Source: epochflame, werewolf.zip (2022-02-26)

##### Checking Struct Offsets
- Use decomp.me: Write function accessing struct members, check generated offsets
- GCC struct packing differs; use `#pragma pack(push, 1)` and `#pragma pack(pop)`
- Can use newer mwcc compiler with `#pragma c9x on` for offsetof if just checking
- Source: kalua, cortex420, revosucks (2022-02-20)

##### asmdiff.py Usage
- Extract boot.dol from ISO (Dolphin File System -> sys/main.dol) as baserom.dol
- Provide function offset (e.g., 0x0014BAA8) for targeted diff
- Source: werewolf.zip (2022-02-19)

#### 2022-03 (source: 2022-03.md)

##### decomp.me API Usage
- Search for scratches: `GET https://decomp.me/api/scratch?page_size=5&search={func}`
- Get scratch details: `GET https://decomp.me/api/scratch/{id}`
- Export endpoint: `/export` downloads code, object files, etc.
- Rate limiting is generous - don't hit hundreds of times per day or multiple times per second.
- Source: ethteck (2022-03-16, 2022-03-18)

##### calcprogress Script with devkitPPC r40
- devkitPPC r40 changes linker map format, breaking older calcprogress scripts.
- Fix available in pikmin2 repo: commits 78a53d07 and f859e7d5
- Inline ASM counts as decompiled progress (not excluded).
- Source: epochflame, kiwidev (2022-03-16, 2022-03-21)

##### File Splitting via Float Deduplication
- Split files based on sdata2 (const float) deduplication.
- sdata2 is always const; sdata and data floats can be duplicated.
- Tools being developed to automate this process.
- Source: altafen, epochflame (2022-03-14)

##### Address Types in Melee
- In-file offset: literal bytes in the .dol (used by asmdiff.sh, hxd/cmp)
- Starting address: map file only, offset from section start
- Virtual address: used by map file, objdump.elf
- Source: altafen (2022-03-16)

##### Grep for Interesting Code Snippets
- `grep -r '\\->' asm/` reveals struct access patterns and naming conventions from assertion strings.
- Source: rtburns (2022-03-26)

##### Finding ASCII Strings in ASM
- Converting hex data to .asciz literals reveals .c filenames and assert expressions.
- Shift-JIS strings may need special handling.
- Source: rtburns (2022-03-17)

#### 2022-04 (source: 2022-04.md)

##### decomp.me Context Issues
- Adding full function definitions to context causes them to be auto-inlined (treated as header includes).
- Use `-ffile-prefix-map=src/sysdolphin/baselib/=` when preprocessing to fix `__FILE__` paths.
- Strings in `.data` vs `.sdata` is determined by string size.
- Source: epochflame, rtburns (2022-04-12, 2022-04-20)

##### Creating Context with MWCC Directly
```bash
tools/mwcc_compiler/1.2.5e/mwcceppc.exe -EP -Cpp_exceptions off -proc gekko -fp hard -fp_contract on -O4,p -enum int -nodefaults -inline auto -I- -i include -i include/dolphin/ -i include/dolphin/mtx/ -i src -E src/file.h > context.txt
```
- Source: altafen (2022-04-15)

##### Using -S Flag
- Compile with `-S` to output assembly (.s) files instead of objects (.o).
- Useful for verification without needing frank.py.
- Source: epochflame (2022-04-12)

##### Frank.py Operation Summary
1. Vanilla epilogue scheduling is wrong; use profiler code as base
2. Profiler header asks for `_PROFILE_EXIT`; use header from vanilla
3. Delete all "bl 1; nop" sequences
4. Replace `b 0xXXXX` with `blr` where vanilla has `blr`
5. Fix `mtlr` position relative to epilogue
6. Apply instruction reordering fixes for specific patterns
- Source: altafen (2022-04-25)

##### Frank.py Patches (April 2022)
- rtburns' patch: Handle `lwz; li/lfs` and `lwz; lmw` patterns with `bl; nop` in profile
- altafen's patch: Handle `lmw; lwz` in profile vs `lwz; lmw` in vanilla (epilogue specific)
- Patches target only instructions immediately before `addi r1,r1,X; mtlr r0; blr`
- Source: altafen (2022-04-25)

##### Makefile Override for Frank
```makefile
$(BUILD_DIR)/src/melee/ft/fighter.c.o: CC_EPI := $(CC)
```
- This uses vanilla (1.2.5) for both compilers, essentially just doing postprocessing.
- Needed when frank's merging produces incorrect results for specific files.
- Source: snuffysasa (2022-04-21)

##### Wine Issues on WSL
- Wine 5 may have stack overflow issues with MWCC compilers.
- Wine 3.0 confirmed working.
- Direct Windows compilation via MSYS2 may be easier than WSL -> Wine -> Windows.
- Source: snuffysasa, squatchthegiant (2022-04-27)

#### 2022-05 (source: 2022-05.md)

##### decomp.me Usage
- Context field is for struct definitions, function prototypes from project headers
- `hsd_gobj->user_data` is usually `Fighter*` even though typed as `void*`
- Change this in context for better auto-decompiler output
- Source: altafen (2022-05-24)

##### asm-differ Linker Relocations
- `r2` or `r13` showing as `0` in current output is normal
- Gets fixed by linker (not run on decomp.me)
- `li` vs `addi r,r,0` are equivalent after linking
- Source: altafen, snuffysasa (2022-05-28)

##### Permuter Setup (decomp-permuter)
```bash
python3 import.py https://decomp.me/scratch/xxxx
python3 permuter.py nonmatchings/funcname -j40 --better-only
```
- Import directly from decomp.me scratches
- Works on Windows (msys) and Linux
- Cannot create inlines, but can permute code containing them
- Limited to ~20K permutations/hour with mwcc
- Source: snuffysasa (2022-05-26, 2022-05-29)

##### Building with Limited Errors
```bash
make -j20 MAX_ERRORS=1
```
- Limits error output when multiple files fail
- Note: will still show up to 20 errors (one per thread)
- Source: altafen (2022-05-22)

##### DOL Extraction
- Use Dolphin emulator to extract DOL, not GCR (GC Rebuild)
- GCR extracts slightly incorrectly
- GCR still good for repacking
- DAT Texture Wizard may also have issues
- Source: epochflame, rainchus (2022-05-31)

##### PPC Reference
- http://math-atlas.sourceforge.net/devel/assembly/ppc_isa.pdf
- Register overview:
  - r0-r31, f0-f31 (general and float registers)
  - r1: stack pointer
  - r2, r13: data pointers (never change)
  - r3-r12: function arguments/temps
  - r3: return value
  - r31-r14: callee-saved temps
- Source: altafen (2022-05-24)

##### HSD Library Tool
- HSDLib (https://github.com/Ploaj/HSDLib) can open .dat files
- Shows string table references for debugging
- Useful for understanding what strings reference
- Source: werewolf.zip (2022-05-24)

#### 2022-06 (source: 2022-06.md)

##### decomp.me Updates (June 2022)
- Small data relocations no longer penalize scores - 100% match shows score 0
- Click a register to highlight all usages of that register
- Symbol consistency checking added - flags when @N refers to different labels
- Matching external data shows blue inline markers but white line text
- Source: snuffysasa (2022-06-03, 2022-06-11, 2022-06-12)

##### asm-differ
- Run with `--debug` flag for detailed scoring information
- Scoring issues can sometimes be asm-differ bugs, not code issues
- Some "white" (matching) lines may actually have differences - inspect carefully
- Source: snuffysasa (2022-06-10, 2022-06-11)

##### Permuter
- Doesn't work with `?` placeholder types from decompiler - replace with actual types
- Variable function calls can cause issues - comment out errors
- Use `PERM_RANDOMIZE()` macro for targeted permutation
- Check `compile.sh` paths in nonmatching folder if permuter fails
- Source: snuffysasa, vetroidmania (2022-06-07, 2022-06-10, 2022-06-21)

##### Build System
- Redirect errors to file: `make GENERATE_MAP=1 2> error.txt` or `&>` for all output
- Use `MAX_ERRORS=1` to limit error output
- Check link map (GALE01.map) to find which function uses a specific float
- Float labels like `@79` can be searched in linkmap to find source function
- Source: gibhaltmannkill, altafen (2022-06-15, 2022-06-06)

##### Frank (Compiler Patch)
- Frank combines 1.2.5e with 1.2.5 compiler output for prologue/epilogue ordering
- Using `-g` (debug info) effectively disables Frank's modifications
- Some optimized switch statements break Frank - branches past function end
- Known to have edge cases that produce incorrect output
- Source: kiwidev, epochflame, amber_0714 (2022-06-21, 2022-06-24)

##### Dolphin Debugging
- Use breakpoints to find runtime values for .bss labels
- Check pointer values in unknown structs by inspecting at runtime
- Source: nic6372 (2022-06-13)

#### 2022-07 (source: 2022-07.md)

##### decomp.me Usage
- Tab completion exists but not in the web editor
- Scratch "family" view shows related scratches
- Score of 60 typically indicates a match when using permuter (due to epilogue penalty)
- Source: various (throughout month)

##### asm-differ / objdiff
- Configure with `diff_settings.py` in repo root
- Run with `python ../asm-differ/diff.py -mwo func_XXXXXXXX`
- Use `-b` flag to compare against diff.py start time instead of last save
- Metrowerks map format differs by version (1.1 lacks File Offset column)
- Can use `-o` flag combined with watch mode for rapid iteration
- Source: altafen, encounter, simonlindholm (2022-07-14)

##### wibo (Wine Alternative)
- Lightweight Windows binary loader for Linux
- Much faster than Wine for compiler invocations (2x speedup reported)
- No DLL loading overhead that Wine has
- Fixed intermittent linker failures that plagued Wine
- MWLD 1.1 has a bug reading garbage from stack; patched by changing loop counter at offset 130933
- Patch: `printf '\x51' | dd of=tools/mwcc_compiler/1.1/mwldeppc.exe bs=1 seek=130933 count=1 conv=notrunc`
- Source: altafen, encounter, rtburns, ninji (2022-07-05-13)

##### Linker Version Differences
- MWLD 1.1 links faster but has stack corruption bug under wibo
- MWLD 1.2.5 is more stable but generates huge .map files slowly (1m46s per link)
- MWLD 1.2.5 writes one byte at a time with fflush (terrible performance)
- Use 1.1 locally, 1.2.5 on CI for reliability
- Source: altafen, werewolf.zip, encounter (2022-07-12)

##### Permuter Setup
- Use mwcc_233_163 (1.2.5) for permutation, not 1.2.5e
- Score of 60 indicates match (due to epilogue differences)
- Randomization pass can find "action at a distance" effects
- Source: snuffysasa (2022-07-11)

##### OSReport Debugging
- OSReport logs visible in Dolphin's log viewer
- Enable in Show Log Configuration
- Useful for real-time debugging of custom DOL
- Very clean output (not cluttered)
- Source: vetroidmania, waynebird (2022-07-05)

##### Float Constant Pool Splitting
- When a float constant appears twice in a .s file, second occurrence marks new C file
- Script (WIP) automates splitting based on this heuristic
- Use `.4byte` to reference floats from C file to ASM when partially decompiling
- Source: altafen (2022-07-14, 2022-07-28)

##### PPC Instruction Reference
- http://math-atlas.sourceforge.net/devel/assembly/ppc_isa.pdf
- Search for specific instructions rather than reading cover-to-cover
- Source: altafen (2022-07-22)

#### 2022-08 (source: 2022-08.md)

##### decomp.me
- decomp.me is probably slightly more accurate than permuter's scorer, but don't trust either too much
- To toggle Frank (epilogue processing): Change compiler from `1.2.5e` to `1.2.5`
- Setting `EPILOGUE_PROCESS` controls Frank
- Source: simonlindholm, altafen (2022-08-01, 2022-08-22)

##### asm-differ Setup
```bash
# Build first with:
./build.sh -fme  # frank map expected

# Run differ:
python tools/asm-differ/diff.py -wos <func_name>

# Regen expected:
tools/build.sh && rsync -a --delete build/ expected/build/
```
- Dependencies: Need to source venv first
- Source: ribbanya, altafen (2022-08-26)

##### Python venv Activation
- Use `. venv/bin/activate` (dot with space), NOT `./venv/bin/activate`
- The dot is shorthand for `source`
- Windows uses `venv/Scripts/` instead of `venv/bin/`
- Source: altafen (2022-08-18)

##### calcprogress Script
- New version uses TU sections instead of symbols
- Pass `--old-map=true` for older map format
- Command: `python tools/calcprogress.py --dol=build/ssbm.us.1.2/main.dol --map=build/ssbm.us.1.2/GALE01.map --asm-obj-ext=.s.o --old-map=true`
- Map format changed between CW 2.6 and 2.7 (added file offset column)
- Source: kiwidev (2022-08-24)

##### Ghidra Tips
- To see full strings: hover over the truncated string, or click and Ctrl+C to copy the whole thing
- Ghidra has a program diff feature for comparing binaries
- Source: kiwidev, ribbanya (2022-08-19)

##### Inline ASM entry Directive
- The `entry` directive lets you export labels inside a function as globals
- Syntax: `entry YourNameHere` on its own line inside asm block
- You must also forward declare it as a function in C
- Works with Melee's version of CodeWarrior
- Source: seekyct (2022-08-21)

##### Symbol Replacement Script
```python
from elftools.elf.elffile import ELFFile

f = open(debug_elf, "rb")
e = ELFFile(f)
symtab = e.get_section_by_name(".symtab")
symbols = [x for x in symtab.iter_symbols()]

for fname in asm_files:
    f = open(fname, "r")
    file_text = f.read()
    f.close()

    for sym in symbols:
        if sym.entry.st_info.bind != "STB_LOCAL":
            hexstr = hex(sym.entry.st_value)[2:].upper()
            file_text = file_text.replace(f"lbl_{hexstr}", sym.name)
            file_text = file_text.replace(f"func_{hexstr}", sym.name)

    f = open(fname, "w")
    f.write(file_text)
    f.close()
```
- Uses pyelftools library
- Source: rtburns (2022-08-27)

#### 2022-09 (source: 2022-09.md)

##### dadosod Usage
- Use release mode for significantly better performance: `cargo b -r`
- Works natively on Linux, can use wibo on Windows
- Needs map.csv from `python tools/parse_map.py`
- Can dump DOL to structured ASM with symbol names
- Source: ribbanya (2022-09-01, 2022-09-12)

##### Comparing DOL Output
Workflow for checking if your function matches:
1. Build :ok: branch (master) with `./build.sh -lfme`
2. Switch to your branch
3. Build your branch (`./build.sh -lfm -r ifstatus`)
4. `python tools/parse_map.py`
5. `dadosod.exe dol expected/build/ssbm.us.1.2/main.dol -m build/map.csv`
6. `dadosod.exe dol build/ssbm.us.1.2/main.dol -m build/map.csv`
7. Compare the output
- Source: ribbanya (2022-09-03)

##### asm-differ Usage
```bash
python tools/asm-differ/diff.py -wos func_name
```
Shows assembly comparison for a function.
- Source: ribbanya (2022-09-03)

##### calcprogress Updates
- New calcprogress parses by TUs (translation units) not by symbols
- Use `--asm-obj-ext=.s.o` and `--old-map=true` flags for Melee
- Requires Python 3.9+ for lowercase type hints like `dict[str, ...]`
- Progress dropped from ~14% to ~12% when properly excluding inline asm
- Source: kiwidev, ribbanya (2022-09-02, 2022-09-04)

##### objdiff Reference
- https://github.com/encounter/objdiff - useful reference for diffing tools
- Source: encounter (2022-09-14)

##### Windows stdout Performance
- stdout is slower when the window is visible
- Minimizing the terminal window makes long-running processes faster
- This is a known Windows issue with stdout rendering
- Source: werewolf.zip, altafen (2022-09-13-14)

#### 2022-10 (source: 2022-10.md)

##### PowerPC Assembly Reference
- Best reference: https://math-atlas.sourceforge.net/devel/assembly/ppc_isa.pdf
- Source: altafen (2022-10-15)

##### Register Conventions
- r0 = scratch register
- r1 = stack pointer
- r2/r13 = pointers to data sections
- r3 = return value
- r3+ = function arguments
- r31- = locals (decreasing from r31)
- r12 = usually reserved for variable function calls, but used for general purposes if needed
- Source: altafen, vetroidmania (2022-10-15)

##### decomp.me Usage
- Only updates output when there are no compilation errors
- To see ASM comparison, comment out problematic lines first
- `-g` switch decompiles everything; not needed if using decomp.me (it does this automatically)
- Scratches require `func_1234:` or `glabel func_1234` at the top of ASM
- Source: vetroidmania, altafen, ribbanya (2022-10-15-17)

##### dadosod Performance
- Became "extremely fast" as of commit 67d662c
- Tool for disassembly/analysis
- Source: ribbanya (2022-10-24)

##### Dolphin Debugger with Memory Map
- Can use community symbol database in Dolphin's debugger
- Warning: Community names are NOT to be used in the decomp codebase
- Names are guesses accumulated over 20 years, some accurate, some wrong
- Source: stephenjayakar, ribbanya, vetroidmania (2022-10-18)

##### IDA vs Ghidra
- IDA preferred by some for pseudo-C output
- Both decompilers can be wrong
- IDA struggles with virtual functions
- Source: cortex420 (2022-10-17)

#### 2022-11 (source: 2022-11.md)

##### Ninja Build System
- 2-3x faster than Make for full rebuilds on some systems
- Much faster for no-change rebuilds: `0.010s` vs `0.113s` (Make)
- On Windows: ninja ~7s vs make ~31s (stark difference)
- Uses `deps = gcc` to cache dependency files internally
- mwcc depfiles don't work on Linux due to backslash separators; need transform-deps.py script

##### decomp.me Tips
- Remember to copy the function label with the ASM - "unsupported non-nop instruction outside of function (mflr $r0)" error means you forgot the label
- Error messages may be truncated from m2c

##### git bisect
- `git bisect run make` is useful for finding regressions

##### Map Generation
- Using `.L` prefix for jump labels (instead of `lbl_`) prevents them from being placed in the map
- Halves map size, shaved a full minute off CI builds (epochflame, Pikmin)

##### Dependency Files
- mwcc can generate depfiles but they use backslashes on Windows
- Pikmin/Prime have scripts to fix them for Linux

#### 2022-12 (source: 2022-12.md)

##### decomp.me Usage

- Target ASM should be just the function, not the whole file
- Delete `#include macros.inc` line from target ASM
- For jump table functions, include both `.rodata` and `.text` sections
- Use `-sym on` compiler flag to see line number mappings
- If decompilation fails, it won't show target ASM - try compiling empty function first
- Export button provides .zip with .s file

##### Permuter with decomp.me Support

r-burns has a fork with rebased inline support + decomp.me import:
https://github.com/r-burns/decomp-permuter/tree/import-decompme-rebased

##### mwcc Dependency Files

- mwcc's dep file output has issues (always outputs to working dir)
- The project uses gcc to generate deps instead
- mwcc deps work on Windows but not Linux without encounter's fix tool

##### Linker Issues

Error: `Unexpected error in CWParserSetOutputFileDirectory [3]`
- Known edge case on some setups
- Fix: Change linker to 1.2.5 in Makefile, or run `python tools/mwld_patch.py`

Source: revosucks, ribbanya (2022-12-20)

#### 2023-01 (source: 2023-01.md)

##### objdiff
- objdiff is great for local development - diffs as soon as you save the C file
- Recommended over asm-differ for iterative development
- Easy to set up with cargo
- Source: ribbanya (2023-01-11)

##### Decomp.me Context Generation
- Use `tools/generate_context.sh` or the pinned context
- Context needs all headers that would be included by the source file
- AT_ADDRESS macro needs special handling for permuter compatibility (use FIXEDADDR syntax)
- Source: various (2023-01-12)

##### gcc -E for Context
- Using `gcc -E -dM` can generate contexts with preprocessor defines included
- Useful for getting all macro definitions
- Source: rtburns (2023-01-12)

##### pcpp (Python C Preprocessor)
- pcpp has `passthru-defines` options that are perfect for context generation
- Can preserve macros while still preprocessing
- Source: rtburns, ribbanya (2023-01-13)

##### include-what-you-use
- Tool for fixing transitive include issues
- https://include-what-you-use.org/
- Source: rtburns (2023-01-12)

##### clang-format Version
- LLVM 15 fixes several clang-format bugs including:
  - Pointer alignment with inline struct declarations
  - `AfterControlStatement: MultiLine` issues
- Source: rtburns (2023-01-03)

##### -requireprotos Flag
- mwcc flag that requires function prototypes before use
- Essential for catching missing declarations
- Source: ribbanya (2023-01-06)

##### Decomp Progress Calculation
- Progress script scans source files for asm function regex
- If the name appears in map file, subtracts that symbol's size from progress
- Source: ribbanya (2023-01-09)

##### clang-format off for asm
- Place `// clang-format off` before asm blocks to prevent formatting issues:
  ```c
  // clang-format off
  asm u32 PPCMfmsr(void)
  {
      // asm code
  }
  // clang-format on
  ```
- Source: rtburns, ribbanya (2023-01-17)

##### Negative Float Literals in ASM
- Inline asm doesn't support negative float literals directly
- **Workaround**: Define a const float and reference it:
  ```c
  const float whatever = -1.0f;
  // use 'whatever' in asm
  ```
- Source: camthesaxman (2023-01-17)

#### 2023-02 (source: 2023-02.md)

##### Windows Build Without MSYS2/DevKitPro
- The build can work on Windows using only Git for Windows and MinGW (plus Python3)
- Key dependency is `powerpc-eabi-as.exe` from https://github.com/JLaferri/gecko
- Build command:
  ```
  make GENERATE_MAP=1 WINDOWS=1 AS=../gecko/powerpc-eabi-as.exe
  ```
- Can install MinGW via `choco install mingw` or from https://www.mingw-w64.org/
- This simplifies newcomer onboarding significantly
- Source: ribbanya, .durgan (2023-02-25)

##### DevKitPro Still Needed for Gekko Instructions
- Generic PowerPC embedded binutils don't support all instructions used in Melee
- DevKitPro's patches add support for Gekko-specific PS vector instructions
- Patch reference: https://github.com/devkitPro/buildscripts/blob/b5de354a1ef989df7f76f9faec723e780e75e9d3/dkppc/patches/binutils-2.37.patch#L25
- Source: rtburns (2023-02-25)

##### DTK Model Build System
- Discussion of moving to dtk-based build with ninja over make
- Would help eliminate devkit/msys dependencies on Windows
- Source: altafen (2023-02-25)

##### Avoiding Binaries in Git
- Don't add binary executables directly to the git repo - "slippery slope"
- Alternative: Create a smaller compilers zip that includes necessary binaries
- Or submodule an external repo containing the binaries
- Source: rtburns (2023-02-25)

#### 2023-03 (source: 2023-03.md)

##### Wibo for Faster Compilation
- Using wibo instead of wine for compiling makes objdiff "instantaneous"
- Wibo is a lightweight Windows binary compatibility layer
- Docker + wibo is a potential option for macOS users
- Source: ribbanya (2023-03-01)

##### Docker Build Environment
- Prime Decomp's setup: https://github.com/PrimeDecomp/build
- Can host Docker images on GitHub Container Registry
- Image size matters less than setup time - GitHub hosts and downloads it
- For minimal images: start with alpine/debian-slim and copy only needed binaries
- Use ninja instead of make for faster Windows builds
- Source: encounter, ribbanya (2023-03-01)

##### Lima VM for macOS
- https://github.com/lima-vm/lima is better than Docker on Mac for Linux VMs
- Docker on Mac runs a Linux VM anyway
- Source: encounter (2023-03-01)

##### dadosod for ASM Extraction
- Tool for dumping functions in proper format: https://github.com/InusualZ/dadosod
- Dumps entire DOL, then search for specific function
- Preserves symbols when used with build system
- Source: ribbanya (2023-03-21)

##### Submitting Matches Without Git
1. Find function (pinned ASM zip or Trello board)
2. Get context from https://doldecomp.github.io/melee/ctx.html
3. Create scratch on decomp.me
4. Submit GitHub issue with decomp.me link
5. Maintainers will add the code
- Partial functions are acceptable submissions
- Source: ribbanya (2023-03-28)

##### Vim/Neovim Config for Melee
```vim
function! MeleeProjectSetup()
  let project_root = "/path/to/melee"
  let project_vimrc = project_root . "/tools/vimrc"
  if expand('%:p:h') =~ project_root
    execute "source " . project_vimrc
  endif
endfunction

augroup MeleeProject
  autocmd!
  autocmd DirChanged,BufRead,BufEnter * call MeleeProjectSetup()
augroup END
```
Source: ribbanya (2023-03-22)

#### 2023-04-to-05 (source: 2023-04-to-05.md)

##### Context Generation with pcpp

The context generator uses pcpp (Python C Preprocessor):
- Macros are now included in context
- Use `-U SYMBOL` to force evaluation of specific defines before context generation
- `passthru-defines` passes defines to context as-is but doesn't expand them in array sizes

Source: ribbanya (2023-04-23)

##### Map File from GitHub Actions

Get `GALE01.map` from GitHub Actions artifacts:
1. Go to https://github.com/doldecomp/melee/actions/workflows/build-melee.yml
2. Find latest successful run on master
3. Download `GALE01.map` under Artifacts

Source: ribbanya (2023-05-02)

##### Git Branch Comparison

```
# Three dots shows merge-base comparison (for PRs)
github.com/doldecomp/melee/compare/master...user:branch

# Two dots shows direct comparison
github.com/doldecomp/melee/compare/master..user:branch
```

When heads are the same, reset hard or rebase to sync.

Source: ribbanya (2023-05-18)

##### Doxygen Documentation Format

```c
/**
 * Brief description (becomes summary).
 *
 * Detailed description here.
 *
 * @param arg0 Description of parameter
 * @return Description of return value
 */
```

Guidelines:
- Don't start with "This function"
- First sentence becomes summary
- Use `#SomeOtherMember` to reference other definitions
- Use `@p foo` to reference parameters
- Use `@code{c}` and `@endcode` for code blocks

Source: ribbanya (2023-05-19)

##### decomp.me Local vs Remote Mismatch

Sometimes code matches locally but not on decomp.me - verify with local build.

Source: ribbanya (2023-05-15)

##### asm-differ Setup for New Files

After setting up a new function file:
1. Run `make` once with `WIP=1`
2. Then asm-differ with `-m` option will auto-rebuild

Source: ribbanya (2023-05-25)

#### 2023-06 (source: 2023-06.md)

##### Context Generation for decomp.me (rtburns, 2023-06-15)
To speed up m2c processing:
- Edit the `files` list in m2ctx `write_header` to only use needed headers
- Omitting unused function declarations speeds up pycparser
- For HSD work, you often only need a couple of HSD structs without any melee code

Auto-generated context available at: https://doldecomp.github.io/melee/ctx.html (altafen, 2023-06-22)

##### __FILE__ Macro Behavior (rtburns, 2023-06-03)
Important considerations for assertion macros:
- `__FILE__` and a hardcoded string like `"foo.c"` are NOT merged by the compiler - treated as different
- `__FILE__` can affect ordering of string literals
- For scratches, check what `__FILE__` evaluates to in the context (e.g., `ctx.c`)
- Using `__FILE__` in HSD code serves as a sanity check for file structure

##### Assertion Filename Format (rtburns, 2023-06-03)
Assertion filenames must match exactly:
- Wrong: `__assert("src/sysdolphin/baselib/jobj.h", ...)`
- Right: `__assert("jobj.h", ...)`

##### Sorting ASM Files for Productivity (rtburns/ribbanya, 2023-06-30)
Sort item asm files by line count (or byte count) and start with smallest:
- Learn patterns on simpler functions first
- By the time you reach larger files, patterns are familiar

##### Build Environment Notes (various, 2023-06-27)
- Running make with sudo causes more problems than it fixes
- If builds fail, try `rm -rf build/` and rebuild fresh
- Docker works when native build has issues
- WSL can have very slow startup times (5 minutes before compiling starts)

##### GitHub Actions and Docker Images (ribbanya/rtburns, 2023-06-14)
Discussion about reproducibility vs. maintainability:
- GHCR images only last 90 days
- Base runner images may not persist long-term
- Manual pinning provides reproducibility but requires maintenance
- Current approach: let images update and recreate based on latest ubuntu/packages

#### 2023-07-to-12 (source: 2023-07-to-12.md)

##### decomp.me Workflow
1. Create new scratch with asm from one function
2. Use the Melee preset (auto-selects correct compiler/flags)
3. Functions in `asm/melee/it/items/` are good starting points
4. Use context from https://doldecomp.github.io/melee/ctx.html
- Source: rtburns, altafen (2023-07-13)

##### Context Generator Limitations
- Does not preserve `AT_ADDRESS` macro for hardware registers
- WGPIPE and similar hardware register definitions don't match properly
- Manual setup required for anything using hardware registers
- Source: werewolf.zip (2023-09-26)

##### objdiff Setup
- Remove `.c.o` and `.s.o` extensions to make objdiff work
- Disable build calls in objdiff
- Reference commit: `e05312dd333b6eb3c79f09c964bf5c43d7f0bfc4`
- Can generate `objdiff.json` for persistent config
- Source: altafen (2023-09-13), encounter (2023-11-21)

##### asm-differ Scoring
- Score of 0 = complete match
- Higher score = more bytes not matching
- Regswaps penalize less than reorders
- decomp.me and asm-differ use similar scoring mechanisms
- Source: ribbanya (2023-09-27)

##### Permuter
- https://github.com/simonlindholm/decomp-permuter
- Useful for final differences like regalloc
- Randomly permutes C statements to find matches
- Most effective when "1 diff away"
- Source: revosucks (2023-12-17)

##### Local Build Requirements
```bash
# Generate map file for function names
make GENERATE_MAP=1

# Progress only prints if map is generated
# Map location: build/ssbm.us.1.2/GALE01.map
```
- Source: rtburns (2023-12-20)

##### Finding Functions
- `obj_files.mk` maps the executable to files
- `asm/` contains undecompiled functions
- `src/` contains decompiled code
- Files with offsets as names are not fully identified
- Source: revosucks (2023-12-17)

##### Training Scratch
https://decomp.me/scratch/I6vWF - Training exercises with answer key
- Source: revosucks (2023-12-17)

---

#### 2024-01 (source: 2024-01.md)

##### decomp.me

For creating scratches with `.L` labels (local labels):
- m2c needed an update to recognize `.L` as a label prefix instead of a macro
- PR #269 to m2c added support for this
- Use the `dump` branch for m2c-compatible syntax
- Source: .durgan, encounter (2024-01-18)

##### Local Development Setup

Run m2c locally:
```sh
python tools/decomp.py function_name
python tools/decomp.py --colorize $fn_name --valid-syntax --no-casts
python tools/decomp.py $fn_name --gotos-only  # When logic is messy
```

Run asm-differ:
```sh
python tools/asm-differ/diff.py -3woms --width 40 "func_name"
python tools/asm-differ/diff.py -woms function_name
```
- Source: ribbanya (2024-01-25)

##### objdiff Setup

objdiff is the recommended local diffing tool:
1. Install from releases or `cargo install --git https://github.com/encounter/objdiff.git`
2. Run `python configure.py && ninja`
3. Open your melee folder in objdiff
4. Add TUs to `config/GALE01/splits.txt` for diffing
- Source: ribbanya (2024-01-20)

##### DTK (Decomp Toolkit) Notes

DTK split configuration:
- Splits should include alignment padding
- Set split end to where the next symbol starts
- Use `data:string` to tell DTK a symbol is a string
- When a symbol shows `scope:local` but has `_{address}` suffix, it was "globalized" (referenced from another TU due to wrong split)
- Source: encounter, werewolf.zip (2024-01-16)

DTK with make:
- `-cwd source` flag makes mwcc search for includes starting from the source file's directory
- Different from `-gccinc` in newer mwcc
- Source: ribbanya, encounter (2024-01-17)

##### MUST_MATCH Macro

- `MUST_MATCH` is for forcing C files to link with make
- No longer needed with dtk/objdiff workflow
- Being phased out
- Source: ribbanya (2024-01-24)

##### IWYU Pragmas for Include Checking

Use IWYU pragmas to fix false positives in include checking:
```c
#include <melee/sc/forward.h> // IWYU pragma: export
```
- Source: altafen (2024-01-24)

##### Windows-Specific Issues

- Python subprocess needs `executable=sys.executable` to find the correct venv Python
- m2ctx needs to specify `encoding='utf-8'` when writing files (defaults to ANSI on Windows)
- asm-differ needs `tail.exe` and `less.exe` on PATH (or use `--no-pager`)
- Source: altafen (2024-01-24, 2024-01-28)

#### 2024-02 (source: 2024-02.md)

##### Build System

###### Cleaning Properly
- Best way to clean is to delete the entire build directory
- `ninja -t clean` may not catch everything
- Linker processes can get stuck and lock files
- Source: encounter (2024-02-01)

###### ninja diff Command
- Use `ninja diff` to find which files broke when debugging non-matches
- objdiff doesn't make this easier on its own
- Source: encounter (2024-02-01)

###### objdiff vs asm-differ
- objdiff is less forgiving than asm-differ (which decomp.me also uses)
- Even with Levenshtein distance enabled
- objdiff considers relocations by default
- Source: ribbanya, gamemasterplc (2024-02-14)

###### Generating MAP Files
- Pass `--map` to configure.py
- Output: `build/GALE01/main.MAP`
- Linker takes longer when generating maps
- Can import into Dolphin debugger for symbols
- Source: ribbanya, revosucks (2024-02-16)

##### decomp.me Usage
- For local workflow, objdiff is preferred
- decomp.me mainly useful for sharing functions needing help
- Can use m2c directly instead of decomp.py wrapper:
```sh
python -m m2c.main --target ppc-mwcc-c --context build/ctx.c build/GALE01/asm/melee/it/items/itsscope.s >src/melee/it/items/itsscope.c
```
- Regenerate context with: `python tools/m2ctx/m2ctx.py -pq`
- Source: ribbanya (2024-02-13)

##### dtk Commands

###### Reverting ASM
```sh
tools/revert_asm.py src/.../foo.c
```
- For incorrect types, add `data:string` to symbols.txt entry
- Source: ribbanya (2024-02-20)

###### Building DOL from ELF
```sh
build/tools/dtk dol apply config/GALE01/config.yml build/GALE01/main.elf
```
- May add gaps (dtk bug) but can be sed'd away
- Source: ribbanya (2024-02-28)

##### objdiff-cli Installation
```sh
git clone https://github.com/encounter/objdiff.git -b cli
cargo install --path objdiff/objdiff-cli
cd melee
objdiff-cli report
```
- Generates detailed per-function progress
- Source: ribbanya (2024-02-28)

##### Nix Development Environment
- PR #1335 adds Nix support for reproducible builds
- `nix-shell` puts you in development environment
- Sandboxed builds without network access
- wibo with fortify hardening causes buffer overflow (use `hardeningDisable = [ "fortify" ]`)
- Compilers URL: `https://files.decomp.dev/compilers_20230715.zip`
- Source: rtburns, whovian9369 (2024-02-26-27)

#### 2024-03-to-07 (source: 2024-03-to-07.md)

##### objdiff-cli Progress Reporting (encounter/altafen, 2024-05-22)
Use `objdiff-cli report` to get partial progress:
```bash
objdiff-cli report generate --project . --output test.json
```
Output includes:
- `fuzzy_match_percent`: ~24%
- `matched_size_percent`: ~22%
- `matched_functions_percent`: ~37%

Note: On Windows, use full path instead of `.` for the project argument.

##### Relocation Diff Checking in objdiff (ribbanya, 2024-07-07)
To see relocation differences that might cause checksum failures:
- Uncheck `Diff Options > Relax relocation diffs` in objdiff

This helps catch sbss/sdata ordering issues that would otherwise show as "100% match."

##### ASM for decomp.me from Repository (altafen, 2024-07-09)
Don't manually extract ASM - use the repo's generated files:
```
https://github.com/doldecomp/melee/blob/master/asm/sysdolphin/baselib/hsd_3B2E.s
```
Copy from `.global function_name` to `blr` for decomp.me scratch.

##### Finding Virtual Addresses for Renamed Functions (ribbanya, 2024-03-14)
If a function was renamed, search for its virtual address (the hex suffix):
```
HSD_GObjObjet_80390B0C -> search for "80390B0C"
```
The address will still be in symbols.txt even if the name changed.

##### Build System: dtk-template Bug Fix (altafen, 2024-06-01)
If Matching files aren't being included in the DOL, check `tools/project.py`:
```python
# Move this line:
built_obj_path: Optional[Path] = None
# To before the if/else statement above it
```
This was fixed upstream in dtk-template.

##### make vs ninja for sdata/sbss Ordering (rtburns, 2024-05-23)
The ninja build's fuzzy matching can miss sbss/sdata ordering issues:
- `make` will catch reversed ordering
- Use `asmdiff-elf.sh` or similar tools to diff objdump output

Example of caught error:
```diff
-804d74b0 <__AR_Callback>:
+804d74b0 <__AR_init_flag>:
```

##### Creating Headers for New Functions (ribbanya, 2024-03-14)
When decompiling a function that calls undeclared functions:
1. Create the header file for that TU (e.g., `grfigureget.h`)
2. Add declarations there
3. Never use `extern` in .c files - that's laziness

#### 2024-08-to-12 (source: 2024-08-to-12.md)

##### objdiff Usage
- Opens with `python configure.py && ninja` then run objdiff
- Look at files that aren't green to find work
- Can generate function match percentages with `objdiff-cli`
- Supports hot reload when saving source files
- `-sym on` flag shows line numbers but may require passing to configure.py
- Source: werewolf.zip, ribbanya (2024-08-09, 2024-08-24)

##### m2c Local Flags
- Useful flags for local m2c usage:
```sh
python 'tools/decomp.py' "$1" -- "${@:2}" \
    --valid-syntax \
    --unk-underscore \
    --no-casts
```
- `--gotos-only` or `--stack-structs` can help with specific cases
- Source: ribbanya (2024-08-12, 2024-08-24)

##### decomp.me Tips
- Turn on line numbers: Options -> sym on
- Link scratches rather than posting screenshots for help
- The decompile button output often doesn't compile - use as starting point
- Valid syntax mode (`--valid-syntax`) makes compiler never generate non-compiling code
- Source: foxcam (2024-08-01)

##### Context Generation
- Online context updates automatically on each commit: https://doldecomp.github.io/melee/ctx.html
- Local context can be generated but the online one is preferred
- Missing includes can cause context generation failures
- Source: werewolf.zip, ribbanya (2024-08-24, 2024-09-19)

##### ASM Generation
- Build asm is in `build/GALE01/asm/` - generated by dtk during split process
- Use `python tools/decomp.py <function_name>` to decompile a specific function
- This version already has relocations fixed (vs raw asm)
- `build/tools/dtk elf disasm -h` to disassemble built objects
- Source: ribbanya, encounter (2024-10-07, 2024-09-19)

##### Symbol Renaming
- Use `tools/replace-symbols` (Rust tool) for proper renames
- Updates symbols.txt, asm files, and all references
- Currently needs Rust installed; download may be automated later
- Source: ribbanya (2024-09-24)

##### Building on Different Platforms
- WSL1 doesn't work - need WSL2 or native Windows
- WSL2: uname should show "Linux" not "Microsoft" kernel
- Native Windows works best since we use Win32 compilers
- `WINE='' ninja` or `--wrapper ""` if wine issues occur
- Source: swinginman, encounter (2024-09-25)

##### Wiki for File Claims
- Use https://github.com/doldecomp/melee/wiki/Translation-Units to claim files
- Tool exists: `tools/wiki_tu.py` to update wiki from configure.py
- Source: ribbanya (2024-08-10)

#### 2025-01-to-04 (source: 2025-01-to-04.md)

##### Context Generation
- Use https://doldecomp.github.io/melee/ctx.html for up-to-date context
- Old contexts cause matching issues (wrong types/functions)
- Source: werewolf.zip, cortex420 (2025-03-24)

##### objdiff Padding Issues
- Trailing zeros in objdiff are usually just padding
- Fix by trimming data object sizes in `config/GALE01/splits.txt` and `symbols.txt`
- Example: change `size:0x18` to `size:0x12` if extra bytes are padding
- Source: altafen, gamemasterplc (2025-03-13)

##### Linking Decompiled Files
- Run `tools/link.py src/melee/path/to/file.c` to make build system use C file
- This also toggles the green filename indicator in objdiff
- Source: altafen (2025-03-13)

##### decompctx.py Issues
- Only understands `-I` includes, not `-i` (or vice versa)
- Can cause "file cannot be opened" errors
- Source: encounter, max_pwr (2025-02-05)

##### PR Workflow
- Can contribute by opening issue with matching decomp.me scratch
- Or build locally and open PR
- Functions need to go in same order as original for linking
- Source: rtburns (2025-04-29)

#### 2025-05 (source: 2025-05.md)

##### objdiff Usage
- Use `ninja baseline` (on master) then `ninja changes` (on working branch) to see changes
- `ninja changes_all` shows if changes affect unlinked/fuzzy code too
- `ninja all_source && ninja` only checks errors + linked code match
- Source: ribbanya, altafen (2025-05-25, 2025-05-26)

##### Function Relocation Diffs in objdiff
- Set "Diff Options > None" to ignore function relocation differences when working on incomplete files
- Use "Diff Options > Data value" for stricter checking of actual values
- Issue: objdiff marks local vs extern symbols as mismatch even when names match
- Patch available to fix this behavior:
```diff
--- a/objdiff-core/src/diff/code.rs
+++ b/objdiff-core/src/diff/code.rs
@@ -325,7 +325,7 @@ fn reloc_eq(
                     || display_ins_data_literals(left_obj, left_ins)
                         == display_ins_data_literals(right_obj, right_ins))
         }
-        (Some(_), None) => false,
+        (Some(_), None) => symbol_name_addend_matches,
```
- Source: rtburns (2025-05-27, 2025-05-30)

##### decomp.me Button in objdiff
- The scratch button works but creates scratches from object files, not ASM
- You cannot run m2c on object-file-based scratches
- Workaround: Copy ASM from `build/GALE01/asm/src/.../*.s`
- Source: rtburns, werewolf.zip (2025-05-28)

##### Useful Tools
- `tools/scaffold.py <path>` - Generate function name comments for partially matched files
- `tools/sort-declarations.sh` - Sort declarations by symbols.txt order (vim integration)
- `tools/easy_funcs.py -a -S 24 -M 99.999` - Find small, nearly-matched functions for quick wins
- `tools/decomp.py` - Run m2c locally with auto-generated context
- `ninja apply` - Update symbols.txt from built ELF (only works on linked files)
- Source: ribbanya, altafen (2025-05-25)

##### Deprecated Tools
- `asm-differ` - Completely deprecated, use objdiff
- `report_score` - Replaced by decomp-dev-bot
- `calcprogress` - Deprecated
- `Makefile` - Deprecated, use ninja/dtk
- Source: ribbanya (2025-05-25)

##### Context Generation
- Global context (`ctx.html`) includes all `.static.h` files which can break data sections
- `.static.h` files should NOT be included in global context; only the one for the current file
- Workaround: Filter out `.static.h` or wrap in `#ifdef` block
- Source: rtburns (2025-05-28)

##### Getting Started Without Local Setup
- Copy function ASM from: https://github.com/doldecomp/melee/tree/master/asm
- Copy context from: https://doldecomp.github.io/melee/ctx.html
- Paste into: https://decomp.me/new (preset SSBM, diff label blank)
- Source: altafen (2025-05-26)

#### 2025-06 (source: 2025-06.md)

##### ninja Commands
- `ninja baseline` - Create baseline for comparison (run on master branch)
- `ninja changes` - Show functions that regressed
- `ninja changes_all` - Show both regressions AND improvements
- `ninja diff` - Compare built DOL against target
- `ninja apply` - Fix expected sizes in symbols.txt (causes churn with @1234 temporaries)
- Source: altafen, ribbanya (2025-06-01)

##### Symbol Renaming
- Use `cargo run -rpq melee-replace-symbols` from `tools/replace-symbols`
- Takes pairs of `from:to` separated by whitespace
- Accepts console input or text file
- Updates symbols.txt, asm, docs, everything
- Source: ribbanya (2025-06-01)

##### Context Issues and Solutions
- Pinned context in Discord has issues (OSContext not defined errors)
- Use `build/ctx.c` generated by ninja instead
- For decomp.py: Uses pcpp and is smarter about header smushing
- `decompctx.py` from dtk-template uses regex matching, not integrated well with M2CTX
- Source: rtburns, ribbanya (2025-06-29)

##### dtk ISO/DOL Handling
- dtk can auto-extract main.dol from ISO/RVZ disc images
- Set `object_base` in config.yml, remove base path from every `object` value
- Use `dtk vfs` to extract main.dol manually
- Use `dtk shasum` to verify file hash
- boot.dol and main.dol are the same - just rename if needed
- Source: encounter, kooshnoo (2025-06-18)

##### objdiff Setup
- ninja must be in PATH for objdiff to work
- Windows: Add ninja.exe location to system PATH via Environment Variables
- Don't forget to actually implement the function locally before checking objdiff!
- Source: altafen, gelatart (2025-06-24)

##### Missing Relocations in dtk
- dtk can miss relocations, causing hardcoded `bl` calls that break shiftability
- Use `add_relocations` in config.yml to fix missed relocs
- Example shows 75+ broken `bl -0x` calls in one file
- Check `config.yml.example` in dtk-template for syntax
- Can be scripted with regex patterns to generate the yml
- Source: rtburns, encounter (2025-06-05)

##### Shiftability Testing
- Add shift code and move it later in linking order until issues appear
- Shift code example:
```c
void shift() {
    *(volatile int *)0 = 0; // repeat several times
}
```
- "Boot to CSS" gekko code modifications can verify shiftability
- Source: revosucks (2025-06-24)

##### -sym on in decomp.me
- Enable `-sym on` in scratch Options to show approximate line numbers of the asm
- Helps correlate source lines with generated assembly
- Source: bbr0n (2025-06-17)

##### m2c Local Usage
- `m2c --valid-syntax --stack-structs` generates compilable code with M2C macros
- Outputs struct guesses that can be included back into context and iterated
- Source: ribbanya (2025-06-24)

#### 2025-07 (source: 2025-07.md)

##### decomp.py
- Run `python3 tools/decomp.py <function name>` for local decompilation
- Uses all headers in context automatically
- Context generated to `build/ctx.c` by ninja
- Can run m2c directly for entire files: `python -m m2c.main -t ppc-mwcc-c --context build/ctx.c file`
- Source: altafen, foxcam (2025-07-13)

##### objdiff
- VSCode extension available: `decomp-dev.objdiff`
- CLI usage: `build/tools/objdiff-cli diff -p . <function_name>`
- Run `python configure.py && ninja` before using
- Export symbols from Dolphin: load .elf and export, works for shifted addresses
- Source: encounter, ribbanya, foxcam (2025-07-13, 2025-07-30)

##### Checking for Regressions
```bash
# Check out known good commit (like master)
ninja baseline
# Check out your commit
ninja changes_all  # Shows all changes
ninja changes      # Shows only regressions
```
- Function renames will count as broken
- Source: ribbanya, altafen (2025-07-27)

##### split_suggester.py
- Fixed to work again (was bitrotted)
- Shows possible file split arrangements
- Doesn't know about dtk's asm macros
- Source: altafen (2025-07-02)

##### Branch Watch Tool (Dolphin)
Workflow to find functions needed for a specific path:
1. Start branch watch, start game
2. Navigate to starting point (e.g., title screen)
3. Hit "code path not taken" - ignores everything that ran before
4. Perform action (e.g., press start to go to main menu)
5. Hit "code path was taken" - saves calls between the two points
6. File > save branch watch as
- Output: `origin, destination, instr, total_hits, hits_snapshot, flags`
- Source: altafen (2025-07-31)

##### decomp-permuter
- Useful for functions with many floats where reordering declarations changes regalloc
- Import from decomp.me PR: https://github.com/simonlindholm/decomp-permuter/pull/134
- Source: rtburns (2025-07-29)

##### enter-the-fray Branch
- rtburns' src-only branch for bootable builds
- Run `./configure.py --demo` to enable nonmatching builds and stub functions
- Boots to title screen, can modify starting scene in `gm_801BF9A8`
- Stubs print function name on panic
- Required asm objects for title screen: `particle.o, math.o, OSSerial.o, texpdag.o, dolphin/mtx/mtx.o, lb_0192.o`
- Source: rtburns (2025-07-28, 2025-07-29)

##### clang-format for Cleanup
- Run `git-clang-format upstream/master` to reformat
- Fixes trailing whitespace
- Use editorconfig plugin to prevent trailing whitespace
- Source: rtburns (2025-07-28)

#### 2025-08 (source: 2025-08.md)

##### Useful Ninja Targets

```bash
ninja              # Standard build
ninja diff         # Build and diff against original (CI uses this)
ninja baseline     # Set baseline for changes check
ninja changes      # Check for broken functions
ninja changes_all  # Check for ALL regressed functions
ninja all_source   # Build all objects without linking
ninja -t clean     # Clean build (or rm -rf build/GALE01)
```
- Source: ribbanya (2025-08-05)

##### decomp.py Usage

```bash
python tools/decomp.py --format --colorize func_name --valid-syntax --no-casts --stack-structs
```
Dependencies: `pip install -r reqs/decomp.txt`
- Source: altafen (2025-08-12)

##### Other Useful Scripts

| Script | Purpose |
|--------|---------|
| `tools/scaffold.py` | Fill in function declarations in c/h files |
| `tools/easy_funcs.py` | Find small functions to match (requires Python 3.12) |
| `tools/m2ctx/m2ctx.py` | Generate m2c context |

Scripts requiring Python 3.12: `easy_funcs.py` (uses PEP 695 type syntax)
- Source: altafen (2025-08-05)

##### Testing Context Locally

```bash
tools/m2ctx/m2ctx.py -pqx && melee-mwcc -nofail build/ctx.c -v -o build/ctx.c.o
```
- Source: ribbanya (2025-08-13)

##### objdiff Enhancements

Altafen's fork has useful modifications:
- `bl` instruction anchoring for better diffs: https://github.com/encounter/objdiff/compare/main...BR-:objdiff:bl_anchor
- Symbol size display: https://github.com/encounter/objdiff/compare/main...BR-:objdiff:show_symbol_size
- Source: altafen (2025-08-02, 2025-08-12)

##### Branch Watch Tool

Located in Dolphin's debugging UI (not Dolphin Memory Engine):
- DME is separate: https://github.com/aldelaro5/dolphin-memory-engine
- Branch watch scans code execution for taken branches (ifs, whiles)
- Useful for dynamic analysis and gecko code debugging
- Source: altafen, sephdebusser (2025-08-14-15)

##### symbols.txt Data Types

To change how dtk interprets symbol data:
- Remove `data:byte` or set `data:4byte` in `config/GALE01/symbols.txt`
- dtk guesses `byte` by default, sometimes incorrectly
- Source: rtburns (2025-08-05)

##### VSCode Format-on-Save

To avoid massive diffs from auto-formatting:
```json
"editor.formatOnSaveMode": "modificationsIfAvailable"
```
- Source: altafen (2025-08-04)

#### 2025-09-to-2026-01 (source: 2025-09-to-2026-01.md)

##### decomp.me vs Local Workflow
decomp.me is good for sharing and #match-help, but has limitations:
- Cannot see data sections easily
- Must carefully track context changes
- Local build with objdiff and `tools/decomp.py` is the recommended workflow
- Source: altafen (2025-12-16)

##### GET_ITEM on decomp.me
decomp.me has a limitation where `GET_ITEM(item_gobj)` fails because it can't convert `Item_GObj*` to `HSD_GObj*`:
- Workaround: Cast to `HSD_GObj*` explicitly
- Or create `HSD_GObjGetUserDataItem` that takes `Item_GObj*`
- This doesn't need to be ported to repo, just for decomp.me compatibility
- Source: altafen, ribbanya (2025-09-02)

##### Ninja Build Commands
```bash
ninja all_source    # Compiles everything (including unlinked files)
ninja               # Only compiles linked (100% matched) files
ninja diff          # Shows what broke if a linked file broke

# For checking progress:
ninja baseline      # Run on master first
ninja changes       # Shows when % goes down (on your branch)
ninja changes_all   # Also shows when % goes up
```
- Source: altafen (2025-09-02)

##### Context Generation
```bash
# Generate context for a specific file:
ninja build/GALE01/src/melee/vi/vi.ctx

# Using m2ctx with preprocessing:
python tools/m2ctx/m2ctx.py --preprocess
```
Static variables should go in `.static.h` files included only from the `.c` file - this gets them into context too.
- Source: altafen (2025-10-06, 2025-10-07)

##### Debug Mode with Line Numbers
```bash
# Separate build dir for debug mode (avoids full rebuild when switching):
python configure.py --debug --build-dir debug

# Non-debug mode:
python configure.py --require-protos
```
Debug mode gives line numbers in objdiff, useful during development.
- Source: gigabowser (2025-12-21)

##### EditorConfig / Formatting
- EditorConfig enforces formatting (line endings, final newlines)
- Run `clang-format` on files to fix formatting issues
- Most editors can auto-format based on project style
- Source: altafen (2025-12-21)

##### M2C Update Issues
If m2c stops working with syntax errors about directives:
```
pip install --upgrade -r reqs/decomp.txt
```
If that doesn't work, delete `venv/Lib/site-packages/m2c*` and retry.
- Source: altafen (2025-11-02)

##### Killer7 Debug Symbols
Killer7 has debug ELF with sysdolphin symbols, including inline names:
- Use disk1d ELF for debug version (inlines not stripped)
- LuigiBlood's DWARF v1 dumper provides symbol info
- Ghidra plugins for DWARF 1: https://github.com/dbalatoni13/ghidra-dwarf1 and https://github.com/emoose/ghidra-dwarf1
- Ghidra reads struct names but not members from the ELF
- Source: werewolf.zip, encounter, altafen (2025-11-21, 2025-11-22)

##### Data Section Padding
Data sections are auto-padded to 8 bytes by the linker. If you see red in objdiff for a 3-byte difference at section end:
- Edit splits.txt and add `-3` to the end of that section
- It will match either way
- Source: roeming, altafen (2025-12-19)

---

### Tool Information

#### 2021-01-to-04 (source: 2021-01-to-04.md)

##### Debug Visualizer

A hitbox visualizer tool exists for Melee debugging/analysis.
- Source: theo3, camthesaxman (2021-04-05, 2021-04-06)

### AI/Automation Efforts

#### 2024-08-to-12 (source: 2024-08-to-12.md)

##### ChatGPT Experiments
- Stephen Jayakar documented attempts using ChatGPT for decompilation
- Article: https://stephenjayakar.com/posts/chatgpt-not-compiler/
- Got from "doesn't compile" to 94% match with 59k token prompt
- Conclusion: ChatGPT not trained on mwcc, generic approaches don't work well
- Source: stephenjayakar (2024-09-16, 2024-12-10)

##### Training Data Ideas
- Train on mwcc specifically by compiling random code and observing output
- Use RL since automated scoring/diffing exists
- Teaching a model to fix compiler errors and iterate with m2c could be effective
- Might need to fork m2c to output ASTs or internal representations
- Source: cortex420, ribbanya, renakunisaki (2024-09-17, 2024-10-02)

##### Custom Decompiler Development
- foxcam working on a Melee-centric decompiler with:
  - Known inline identification (scanning for patterns like int-to-float)
  - Better union matching
  - GObj type guessing
  - 64-bit integer support
  - Item table generation with function signature matching
- Written in C with ImGui frontend
- Source: foxcam (2024-10-16, 2024-12-21)

### GPT/AI for Decompilation

#### 2023-04-to-05 (source: 2023-04-to-05.md)

##### ChatGPT 4 Results

stephenjayakar reported GPT-4 improved a scratch from 44% -> 90% match:
- https://decomp.me/scratch/pt6Xo
- Had to tell it to use specific types
- Summarized changes it made

Source: stephenjayakar (2023-05-21)

##### AI Limitations

- ChatGPT not trained on mwcc/GameCube compiler specifics
- Produces code aesthetically similar to m2c output but often wrong
- Tends to give wrong SIMD functions and times out on complex requests
- Phind search engine gives better results than ChatGPT/Bing for decomp info

Source: werewolf.zip, darkeye., ribbanya (2023-04-07, 2023-05-20)

### AI/LLM Usage Notes

#### 2025-09-to-2026-01 (source: 2025-09-to-2026-01.md)

##### Claude Code for Decompilation
One contributor set up an agentic workflow using Claude Opus 4.5:
```bash
claude --dangerously-skip-permissions "run /decomp, don't stop until you match 10 new functions, then commit them and open a PR"
```
- Match percentage is verifiable; interpretation/naming is not
- LLMs can hallucinate function names and comments
- Always verify names have justification with file references
- Don't let incorrect assumptions from training data sneak in
- Source: itsgrimetime, rtburns, werewolf.zip (2025-12-26 - 2025-12-30)

##### Good LLM Use Cases
- "Hey this function does this, what's a better name for it?"
- Finding all sites where a placeholder struct member is used and suggesting names
- Processing Japanese function names to match English naming conventions
- Source: rtburns, troy._ (2025-09-19)

---

## Workflow, Style, and Practices

### Workflow Tips

#### 2022-10 (source: 2022-10.md)

##### File Claiming
- Claim files on Trello board to avoid duplicate work
- Can announce in Discord channel and someone will update Trello
- Trello is public access via link in channel topic
- Typically claim whole files and submit complete file PRs
- Source: revosucks, ribbanya (2022-10-24)

##### Top-Down vs Bottom-Up Matching
- Standard approach: match functions from top of .s file going down
- Convenient because you can move matched functions to .c and link before .s
- Alternative: two people work same file, one top-down, one bottom-up
- Source: rtburns, epochflame (2022-10-23, 2022-10-26)

##### Inferring Function Signatures
- Look at callsite ASM to infer parameter types
- Search codebase for other uses of the function
- Some functions have declarations in .h files even while body is in .s
- Source: altafen, ribbanya (2022-10-16)

##### OOT-style Global ASM Approach
OOT project uses a different approach to partial matching:
```c
#include "global.h"

GLOBAL_ASM("path/to/func1.s")
GLOBAL_ASM("path/to/func2.s")
```
- Enables function-based instead of file-based contributions
- Discussed but Melee project decided inline asm in C is better for CW compiler
- Source: revosucks, ribbanya, seekyct (2022-10-26-27)

##### ppcdis Tool
- Supports inline asm includes and autogenerated includes (orderfloats, orderstrings)
- Works with CW compilers; best documented for GC 3.0 (SPM project)
- Inline asm floats need special handling for older CW due to negative float bug
- Source: seekyct (2022-10-26)

#### 2025-05 (source: 2025-05.md)

##### Contributing
- Make a PR; progress is progress regardless of file vs function scope
- Functions at 70%+ can be committed if difficult; come back later with fresh eyes
- As long as it compiles and doesn't break other functions, it can be PRd
- Link decomp.me scratch in issue if not ready for full PR
- Source: ribbanya, werewolf.zip (2025-05-22)

##### Finding Work
- decomp.dev for browsing TUs and functions
- objdiff for exploring objects locally
- Translation Units wiki page for tracking who's working on what
- `tools/easy_funcs.py` for finding small, high-percentage functions
- Look at allocator callsites to find initializers
- Source: encounter, werewolf.zip, ribbanya (2025-05-21, 2025-05-25)

### Workflow Notes

#### 2022-08 (source: 2022-08.md)

##### Progress Tracking
- August 2022: Project reached ~12% code, ~3.4% data
- Trophy system: Unlock virtual trophies at progress milestones
- Trophy 35 unlocked this month
- Source: revosucks (various dates)

##### PR Guidelines
- Squash commits on merge for cleaner history
- PRs should be close to done before opening (non-draft)
- Draft PRs are fine to show WIP branch location
- Having matching source is more important than shiftability during early decomp
- Source: werewolf.zip, camthesaxman (2022-08-26)

##### Authoritative References
- archive.org has Dolphin SDK + documentation
- Leaked Wii SDK source exists but is for different version
- LibOGC is "practically just IDA dumped code" with different naming
- dolwin-docs repo has some reimplementation: https://github.com/ogamespec/dolwin-docs
- Source: werewolf.zip (2022-08-22)

### Workflow Examples

#### 2023-07-to-12 (source: 2023-07-to-12.md)

##### Basic Decompilation Flow
1. Find undecompiled function in `asm/` directory
2. Create scratch on decomp.me with Melee preset
3. Paste asm for single function (starts at `.global`, ends at `blr`)
4. Use m2c output as starting point
5. Fix types, clean up code until it compiles
6. Iterate until diff shows 0
7. Copy matched code to src file
8. Run `make` to verify overall build still matches

##### Unknown Struct Convention
```c
// For unknown structs, use address-based naming:
UnkStruct8005C22C         // General unknown struct
UnkInputStruct8005C22C    // Unknown struct passed as argument
UnkStruct8005C22C_Temp_R3 // Stack variable
```
- Source: revosucks (2023-12-17)

##### New Contributor Starting Points
- `asm/melee/it/items/` - Simple item callbacks
- Training scratch with exercises: https://decomp.me/scratch/I6vWF
- Ask questions in #match-help or main channel
- Post scratches for feedback
- Source: rtburns, ribbanya, revosucks (2023-08-12, 2023-12-17)

### Git Workflow

#### 2025-06 (source: 2025-06.md)

##### Fork Sync Issues
- Don't commit to master on your fork - it will diverge from upstream
- Use feature branches instead
- If diverged: `git reset --soft upstream/master`, then commit, then force push
- Or: `git reset --hard upstream/master` (loses local changes!)
- Source: clownssbm, ribbanya, kooshnoo (2025-06-28)

##### Feature Branch Workflow
1. Create local branch tracking `doldecomp/melee:master`
2. Pull to get upstream changes
3. Create feature branch for your work
4. Make changes and PR
5. Delete feature branch after merge
6. Repeat
- Source: ribbanya, clownssbm (2025-06-28)

##### CI Checks
- ninja is what CI uses - run locally to verify
- Can push to your fork to run checks before opening PR to upstream
- Draft PRs also trigger checks
- Source: rtburns, ribbanya (2025-06-22)

### Naming Conventions

#### 2023-04-to-05 (source: 2023-04-to-05.md)

##### Motion vs Action vs Subaction

- HAL calls them "motions" internally, "status" in Brawl onward
- Community historically used "Action State" (ASID)
- "Subaction" refers to animation-related data in dat files
- The counts line up: ~341 common states at `fp+2340`

Source: ribbanya, vetroidmania, rtburns (2023-04-15)

##### Animation Name Conventions

From dat file node names:
- `Hi`/`Lw` = High/Low (for aerials)
- `F`/`B`/`U`/`D` = Forward/Back/Up/Down (for throws, and U/D for prone facing)
- `3` = tilt, `4` = smash (Attack prefixes)
- Names come from animation filenames like `PlyCaptain5K_Share_ACTION_Swing42_figatree`

Source: altafen (2023-04-23)

##### Japanese Names in Code

- `ottotto` = teeter
- `furafura` = dazed

Recommendation: Use English names in code with Japanese noted in comments, though keeping Japanese for searchability against animation files is also valid.

Source: altafen, ribbanya (2023-05-28)

##### File Prefixes

- `mp` = map (stage/ground collision) - "proc map" callbacks
- `ft` = fighter
- `it` = item
- `ItCo.dat` exists for common items
- `PlFx.dat`, `GrPu.dat` = character/stage dat files

Source: vetroidmania (2023-05-05)

#### 2023-06 (source: 2023-06.md)

##### File Naming Discussion (ribbanya/rtburns, 2023-06-03)
- Two-letter character codes (ft, it, etc.) received mild negative feedback
- Options discussed: `ftGameWatch_SpecialS`, `ftgamewatchspecials`, `ftgamewatch_specials`
- Lowercase with underscores has word boundaries without conflicting with assert filenames
- Internal JP names recommended for code/filenames with English names in comments

##### Variable Naming (durgan/ribbanya, 2023-06-04)
- Very short names (2 letters) decrease readability for newcomers
- `fp` = fighter pointer (from asserts), used extensively throughout codebase
- Glossary available: https://doldecomp.github.io/melee/glossary.html
- 80 column limit necessitates some terseness
- `it` for item looks like English pronoun - problematic

### Code Style Conventions (discussed)

#### 2022-11 (source: 2022-11.md)

##### Naming Conventions
- HAL used snake_case for struct members (e.g., `ground_or_air`)
- HAL used camelCase for function names (e.g., `itGetKind`)
- Lower camelCase for smaller/static functions
- Local variables in asserts: abbreviations (`fp`, `o`) or snake_case
- Project uses upper camel with module prefixes for functions (`ftBlahblah_`)

##### Character Names (HAL-speak)
- Purin = Jigglypuff (keeping)
- Seak = Sheik (debated)
- Mars = Marth (debated)
- GKoops/Gkoopa = Giant Koopa (Giga Bowser) - from PlGk.dat
- AirCatch = Zair
- Emblem = Roy (though strings say Roy, module is Emblem)
- Crezy = Crazy (HAL phonetic spelling)
- PK Flush (instead of Flash)
- mato = target

##### Struct Naming
- Ongoing debate: `typedef struct _Foo Foo;` vs `typedef struct Foo Foo;`
- Leading underscore convention exists for historical/pre-standardization compatibility
- Either works; project moving toward `typedef struct Type Type`

### Code Style Decisions

#### 2022-12 (source: 2022-12.md)

- Line length: 80 columns (decided by consensus)
- Pointer style: `void* ptr` (left-aligned)
- Brace style: K&R for control structures, Allman for functions
- clang-format: Used for consistency, but include sorting disabled to preserve inline ordering

Source: ribbanya, altimor (2022-12-26)

## Pitfalls and Gotchas

### Pitfalls and Gotchas

#### 2020-07 (source: 2020-07.md)

##### Things That Cause Mismatches

1. **`asm` keyword presence** - Affects peephole optimization on ALL subsequent functions
2. **Function prototype presence** - Changes prologue scheduling
3. **Flag order** - `-proc gekko -O4,p` vs `-O4,p -proc gekko` have different behavior
4. **Literal vs extern constants** - Can reverse `fcmpu` operand order
5. **`!= NULL` vs implicit check** - Different codegen for NULL comparisons
6. **Control flow structure** - `if(a && b)` vs nested `if` produces different code

##### Nonmatching Strategy
Since `asm` functions affect other functions, use a postprocessing approach:
1. Write C that produces correct-size functions (using volatile writes if needed)
2. Inject correct assembly into the `.o` file after compilation
3. Use `#ifdef NONMATCHING` to keep the readable C version available

##### Linker Quirks
- `extab` section name is treated specially; may need different naming
- Partial filename matching can cause wrong file insertion
- Empty/stub functions may be ignored even with `FORCEACTIVE`
- Files with similar names (e.g., `id.o` and `grkraid.o`) may conflict

##### Cross-File Dependencies
- Constants are NOT shared across translation units (no LTO)
- Each file gets its own copy of int-to-float conversion constants
- Inline functions are duplicated in every file that uses them

#### 2020-08 (source: 2020-08.md)

##### SDA Relocation Limitations
- GNU assembler cannot generate `R_PPC_EMB_SDA21` relocations for SDA-relative access
- mwasmeppc also cannot do this from standalone assembly files
- Only inline assembly in C files (processed by mwcc) properly generates SDA21 relocations
- The assembler can't handle two linker symbols in a subtraction (e.g., `label - _SDA_BASE_`)
- Workaround: migrate asm to C files with inline assembly, or wait for full decompilation
- Source: revosucks, camthesaxman (2020-08-03 - 2020-08-05)

##### .word vs .4byte in Assembly
- `.word` directive may not be recognized by devkitPPC assembler
- Use `.4byte` instead - `.word` silently fails/is ignored
- Source: revosucks (2020-08-06)

##### Case Sensitivity in Makefiles
- File paths are case-sensitive on Linux
- Makefiles must preserve case sensitivity (e.g., `MSL/PPC_EABI/` vs `msl/ppc_eabi/`)
- mkdir may not preserve case; verify directory names match exactly
- Source: revosucks, werewolf.zip (2020-08-11)

##### Function Alignment Mystery
- mwasmeppc-assembled objects have default 0x10 alignment
- C-compiled objects do not have this same alignment
- Some functions have 0x00000000 padding after `blr` for alignment
- This may indicate static library boundaries (align at .a file boundaries)
- Source: revosucks (2020-08-06)

##### Linker Script Extab Issues
- extab/extabindex sections need proper GROUP placement in LCF
- Using SDK template requires renaming to `extab_` and `extabindex_` until proper fix
- Source: revosucks (2020-08-05)

##### CPP Exceptions Leftover
- Melee has C++ exception tables despite `-Cpp_exceptions off`
- Suggests pre-release build configuration or library linkage issues
- No actual try/catch usage in game code
- Source: werewolf.zip, revosucks (2020-08-06)

#### 2020-09-to-12 (source: 2020-09-to-12.md)

##### Assert String Typos
- Original assert strings contain typos like "dont't" (Engrish)
- These must be preserved exactly for matching
- Source: werewolf.zip (2020-09-27)

##### PR Workflow
- Maintainer (werewolf.zip) preferred PRs over manual copy of changes
- Cross-platform testing recommended (Mac vs Windows)
- Source: werewolf.zip, amber_0714 (2020-12-30)

##### C vs C++ Compilation
- When working with cstring functions, can use C mode directly instead of `extern "C"`
- Source: werewolf.zip (2020-12-30)

#### 2021-11 (source: 2021-11.md)

##### False Positive Pointers
- Floats surrounded by other floats are usually not pointers
- Use blacklists for known false positives when scripting pointer detection
- Search for `0x80N` pattern to find potential pointer values
Source: epochflame, werewolf.zip (2021-11-06, 2021-11-20)

##### Section Padding Issues
- Different tools (elf2dol, makedol) handle padding differently
- Natural section size vs padded size: only the last variable's true size matters
- Example: Two 32-bit variables with 64-bit alignment = 96 bits natural, not 128
Source: revosucks (2021-11-22)

##### Scheduling Pragma Side Effects
- `#pragma scheduling off` affects BOTH scheduling AND register allocation
- Cannot be used to isolate scheduling changes only
- For testing, compare scheduled vs unscheduled output from same compiler
Source: camthesaxman (2021-11-29)

##### sdata2 Shift Issues
- sdata2 pointers may not update correctly during shifts
- Caused graphical glitches when shifting code
- Reset Dolphin if seeing wrong DOL loaded
Source: werewolf.zip (2021-11-28)

##### Debug Menu Strings
- Huge number of debug menu strings require manual labeling
- werewolf.zip noted "there's so fucking many" - started with ~800, worked down to ~500
Source: werewolf.zip (2021-11-19)

#### 2021-12 (source: 2021-12.md)

##### Data Splitting is Critical
- Using extern for everything is "cringe and nonmatching"
- vtables cannot be extern'd - must be split first
- Split data BEFORE decompiling, not after
- Three approaches (in order of quality):
  1. Extern everything (bad - often doesn't match)
  2. Split files as needed (better but annoying)
  3. Split everything in advance (best)
- Source: epochflame (2021-12-14)

##### Link Order Matters
- Files must link in correct order for data to match
- `obj_files.mk` controls link order
- Order: data before .c file, data after .c file must be separate

```makefile
# In obj_files.mk:
data_0.s      # Data before thing.c
thing.c       # Your decompiled code
data_1.s      # Data after thing.c
```
- Source: epochflame (2021-12-14)

##### Global Labels Required for Cross-File References
- When splitting ASM, functions called from other files need `.global` directive
- Missing `.global` causes link errors
- Source: epochflame, camthesaxman (2021-12-14)

##### Inline ASM Limitations
- Remove `@sda21` from inline ASM - use extern for those labels
- `@ha` and `@l` are fine in inline ASM
- Remove `(r2)` from inline ASM
- Better approach: avoid inline ASM entirely
- Source: werewolf.zip (2021-12-14)

##### Stack Frame Instructions
- Instructions involving r1 (stack pointer) at function start/end are auto-generated
- `stwu r1, -0x28(r1)` - sets up stack frame
- Focus on the middle of the function, not prologue/epilogue
- Source: epochflame, gibhaltmannkill (2021-12-16)

##### Register Conventions
- r1: Stack pointer
- r2: Pointer to .sdata2 section (constants)
- r13: Pointer to .sdata and .sbss sections
- Both r2 and r13 are set at startup and never change
- Source: camthesaxman (2021-12-15)

##### Relocation Errors
- Usually mean something isn't in the right section
- Check that data is in correct section (.data, .sdata, .sdata2, .rodata)
- Source: camthesaxman (2021-12-14)

##### Non-Matching Macros
- Functions using macros that reference data may be non-matching until data is split
- Example: `Player_CheckSlot` macro - any function using it may need `#ifdef NON_MATCHING`
- Source: tri_wing_ (2021-12-31)

##### Trusting Decompiler Output
- Ghidra function names may be `lbl_` instead of `func_` - doesn't mean it's not a function
- Decompiler may show wrong types (undefined4 = unknown 4-byte type)
- Always verify against actual ASM
- Source: camthesaxman (2021-12-14)

#### 2022-01 (source: 2022-01.md)

##### Dead Code Stripping

- The linker strips unused functions - you won't get errors for undefined symbols in stripped code
- Use `#pragma force_active on` to prevent stripping during development
- If a function isn't referenced anywhere, the linker won't complain about missing symbols it calls
- Source: gibhaltmannkill, epochflame (2022-01-21)

##### Extern Declarations

- `extern` tells the compiler to look elsewhere for a symbol
- Unused externs don't cause errors - the linker only resolves symbols that are actually used
- Only when you actually USE an extern will you get "undefined symbol" errors
- Source: epochflame, camthesaxman (2022-01-21)

##### Partial Linking Caveats

- Float constants used in multiple functions can cause extern matching issues
- Recommend: Don't link the C file until all functions are decompiled
- Alternative: Put decompiled functions in unlinked .c file, mark as matching
- For Melee (C code), partial linking is less problematic than C++ projects
- Source: camthesaxman, epochflame, gibhaltmannkill (2022-01-21)

##### Label vs Function Detection

Some functions appear as `lbl_XXXXXXXX` instead of `func_XXXXXXXX` because:
- They're static (file-local)
- They're only called via function pointers
- They're callbacks that aren't directly branched to

Check for address usage in data sections (e.g., `lbl_802F4424` might reference `lbl_802F4194`)
- Source: werewolf.zip, epochflame (2022-01-21)

##### obj_files.mk Ordering

- Functions must be in the same order as the original
- Mismatched ordering causes shifted addresses
- When splitting ASM files, functions in one split file cannot reference labels defined in another split file (local labels)
- Source: waynebird (2022-01-15)

##### Workflow Best Practices

1. **Rename then decomp** (not decomp then rename)
2. **Check :ok: at every step**
3. Rename symbols in ALL files (ASM included) when renaming
4. Use defines for temporary name mappings: `#define sin func_80473745`
5. Don't use community/Akaneia struct names unless verified by matching
6. Put minimum required struct fields - use filler for unknown areas
- Source: Multiple contributors (2022-01-21)

##### Commit Practices

- Don't sit on matched functions for weeks - push WIP PRs
- If matching takes a while, push progress so others can help
- Commit to unlinked .c files if the file isn't complete
- Use `#ifdef NON_MATCHING` for functions that can't match due to string/data issues
- Source: werewolf.zip, epochflame (2022-01-04)

#### 2022-02 (source: 2022-02.md)

##### Trust No One's Work
- Akaneia struct definitions often have errors:
  - x2200 area is array of 0xC structs for Sheik, not individual flags
  - Many field types and names are wrong
- Always verify against matching assembly
- Source: werewolf.zip (2022-02-02, 2022-02-17)

##### Unsigned vs Signed Types
- Can produce identical code in many cases
- PPC comparison instructions give more info than other architectures
- Must reconcile across all functions using a type
- Source: revosucks (2022-02-20)

##### Static vs Global Functions
- Static functions aren't visible outside their file
- When using inline asm, may need to make static functions global temporarily
- Comment out `static` with `/* static */` until function is fully matched
- Source: werewolf.zip (2022-02-14)

##### Function Label Detection
- Original doldisasm only marked functions if `bl`-ed to
- Callbacks passed as pointers got labeled as `lbl_` instead of `func_`
- Must manually fix these by adding `.global` and renaming to `func_`
- Source: camthesaxman, werewolf.zip (2022-02-14)

##### ble vs blt Errors
- `<=` vs `<` comparison differences are subtle
- Double-check loop bounds: array[33] with `i <= 33` iterates 34 times
- Source: epochflame, kalua (2022-02-15)

##### e_files.mk for Epilogue Fixes
- Add files to e_files.mk to enable Frank epilogue patching
- Run `make clean` after adding to ensure rebuild
- Source: kalua (2022-02-15)

##### Multiple Functions Under One Label
- The disassembly has many instances of multiple functions under single label
- Not an error, just incomplete manual function splitting
- Look for `blr` instructions but note some functions have multiple returns
- Source: rtburns, snuffysasa (2022-02-22)

##### Extern Floats Change Register Allocation
- `extern float` declarations can change register allocation
- May need to keep going until file is complete to use proper literals
- Source: altatwo (2022-02-02)

##### Linker Cannot Be Changed
- GCC linker cannot link MWCC .o files due to EABI differences
- Stuck with MWLD even after full decompilation
- Source: werewolf.zip, revosucks (2022-02-26)

#### 2022-03 (source: 2022-03.md)

##### Extern Usage Patterns
- Using `extern lbl_XXXXXXXX` for local data is quick and dirty but generally fine for scratches.
- Extern floats and strings instead of literals can cause issues.
- `extern []` and `extern *` do not mean the same thing.
- Header declarations with extern are cleaner for multi-file usage.
- Source: epochflame, seekyct (2022-03-08)

##### Akaneia Context Warning
- Scratches marked "OLD VERSION -- uses the Akaneia context" use non-canonical types.
- Akaneia is a custom Melee build with guessed types - not verified for matching.
- Do not trust these types without verification.
- Source: revosucks, cortex420 (2022-03-20)

##### Context Changes Can Break Old Scratches
- Changing a struct member type (e.g., u32 to f32) may fix one function but break others.
- Consider unions when fields appear to have different types in different functions.
- Source: altafen (2022-03-18)

##### Fake Matching Caveats
- Inline ASM fake matches count toward progress but are not truly matched.
- Easy to grep for: search for inline asm patterns to find functions needing real matches.
- Source: rtburns, valorzard (2022-03-31)

##### Progress vs Completion
- "100% progress" is not the end - continued refactoring needed after matching.
- Inline ASM functions, structure improvements, and type corrections remain.
- Source: rtburns (2022-03-31)

#### 2022-04 (source: 2022-04.md)

##### Assert Line Numbers with Inlines
- Inline functions from headers have fixed line numbers in their asserts.
- However, asserts can be optimized out if the value is known at compile time.
- Stack addresses are known non-null, so asserts on them are removed.
- Function call results are not known, so asserts on them remain.
- Source: rtburns, antidote6212 (2022-04-11)

##### Data Section Alignment (.balign)
- Missing `.balign` directives when moving data to C can cause offset mismatches.
- Check symbol map carefully when data offsets are wrong.
- An extra space in a string can cause 4-byte alignment shift.
- Source: snuffysasa (2022-04-20)

##### Strings in .data vs .sdata
- Small strings go to `.sdata`, larger strings to `.data`.
- Inline functions with string literals (like assert filenames) put their strings in the compilation unit's data section, not in the header file's section.
- Source: epochflame, snuffysasa (2022-04-21)

##### Clone Fighters Share Attr Structs
- Dr. Mario uses Mario's special attributes struct.
- Falco uses Fox's, Ganondorf uses Falcon's, Young Link uses Link's, Roy uses Marth's.
- Pichu uses Pikachu's, GigaBowser uses Bowser's.
- Source: rtburns, revosucks (2022-04-02)

##### Japanese Internal Names
- Use internal/JP names for structs: Koopa (Bowser), Purin (Jigglypuff), Mars (Marth), Emblem (Roy), CLink (Young Link), GKoopa (Giga Bowser).
- Source: werewolf.zip (2022-04-02)

##### External Array Loading Issues
- Some external array access patterns don't match on decomp.me but do locally (or vice versa).
- May be related to static initialization or data pooling differences.
- Source: snuffysasa, revosucks, kiwidev (2022-04-20)

##### Permuter Limitations for PPC
- No C++ support (templates are computationally undecidable)
- No PPC support currently
- MWCC via Wine is slow compared to native recompiled IDO/agbcc
- Source: revosucks (2022-04-22)

#### 2022-05 (source: 2022-05.md)

##### Case-Sensitive Filenames
- Windows has case-insensitive filenames, Linux/macOS do not
- `#include "ftness.h"` vs `#include "ftNess.h"` will fail on CI
- Always verify on Linux/CI after building locally on Windows
- Source: snuffysasa, altafen (2022-05-20)

##### Function Order in File
- Functions must be decompiled in order within a file
- Skipping a function causes data shift issues
- Source: snuffysasa (2022-05-22)

##### Float Data Duplication
- When moving functions with float constants from ASM to C, floats get duplicated
- Options:
  1. Use `extern float lbl_xxxx` references (may alter codegen)
  2. Accept non-matching DOL until entire file is complete
- Source: snuffysasa (2022-05-22)

##### Union Member Default Types
- When adding union variants, don't change the default member's type:
```c
// Wrong - breaks existing usages:
-    /* 0x235C */ f32 x235C;
+    /* 0x235C */ u32 x235C;

// Correct - add new variant:
+    /* 0x235C */ u32 x235C_u32;
     /* 0x235C */ f32 x235C;
```
- Source: altafen (2022-05-27)

##### Struct Size Errors
- Adding fields without updating padding causes offset shifts
- Use asmdiff.sh to diagnose data shifts
- 4-byte shift typically indicates extra/missing field
- Source: altafen (2022-05-27)

##### Individual Matches vs Patterns
- Individual function matches may be "fake matches" (coincidentally matching but wrong approach)
- Focus on patterns that work across multiple similar functions
- If all OnLoad functions use same macro, a different approach for one is likely fake
- Source: revosucks (2022-05-20, 2022-05-21)

##### Permuter Limitations
- Cannot fix issues requiring changes external to function (structs, inlines)
- Does not try triple equals, self-assignment tricks
- Running for 300K iterations without match suggests structural issue
- Source: snuffysasa, vetroidmania (2022-05-30)

#### 2022-06 (source: 2022-06.md)

##### Duplicate Float Generation
- If compiler generates two floats instead of one, another function likely uses that value
- Check all uses of a float constant across the entire file
- Source: nic6372, altafen, revosucks (2022-06-05, 2022-06-06)

##### Relocation Errors
- "Relocation of symbol is out of range" - check if array size/type is correct
- Invalid target ASM can cause cryptic relocation errors
- Source: glazedgoose (2022-06-12)

##### Symbol Map Shifting
- Functions blending into others in symbol map indicates size mismatch
- Usually caused by unexpected inlining or missing code elsewhere
- Source: vetroidmania (2022-06-23)

##### Fake Variables from m2c
- m2c creates many pointless variables - remove as many as possible
- Getting code to compile first, then reduce variables
- Source: camthesaxman, revosucks (2022-06-30)

##### Copy-Paste Bugs in Original Code
- Original HAL code contains copy-paste bugs:
```c
pAtkShieldKB->x = p_kb_vel->y = 0;  // Bug: should be pAtkShieldKB->y
```
- Tired programmers, small screens, 3am coding - bugs happen
- Source: revosucks (2022-06-24)

##### File Splitting for Float Allocation
- Floats are generated per C file
- If original DOL has multiple copies of same float value, functions must be in separate files
- Split functions based on which float labels they use
- Source: vetroidmania, nic6372 (2022-06-05)

##### ActionStateChange Flags
- 32-bit flag values like `0x0C4C5080` are typically ORed constants:
```c
#define FLAG_A (1 << 7)
#define FLAG_B (1 << 14)
// ...
func(FLAG_A | FLAG_B | FLAG_C | ...)
```
- Source: ninji, vetroidmania (2022-06-28)

#### 2022-08 (source: 2022-08.md)

##### C/S File Order in Build
- The order of .c and .s files in the build determines symbol placement in DOL
- If functions compile to wrong addresses, check the build order
- Map file shows section sizes - compare to expected to find mismatches
- Source: revosucks, ribbanya (2022-08-14, 2022-08-27)

##### Frank Bugs
- Frank (epilogue scheduling patch) can introduce mismatches
- Not all code patterns benefit from Frank - turning it off may help some functions
- Some patterns don't match with or without Frank
- Pattern example:
  ```
  goal:          lwz fsubs addi
  without frank: lwz addi fsubs
  with frank:    fsubs lwz addi
  ```
- Source: altafen (2022-08-14)

##### Shared Float/String Constants
- Functions sharing rodata (float constants, strings) with asm can cause issues
- `const` keyword affects which section data goes to
- A function's rodata may be reused by subsequent functions in the same TU
- Source: altafen (2022-08-21)

##### Redeclared Identifier Errors
- Error like `identifier 'X(...)' redeclared - was declared as: 'int (...)'` means there's an implicit declaration somewhere
- The function was called before being declared, so compiler assumed `int` return type
- Add proper prototypes or reorder declarations
- Source: .durgan (2022-08-01)

##### Static Arrays Inside Functions
- Static arrays declared inside functions are real and may need to match specific addresses
- Order of static declarations affects their addresses
- May need to adjust C/S file ordering to get statics at correct addresses
- Source: vetroidmania (2022-08-17)

##### Data Section from Int to Float Conversion
- If int-to-float conversion constant is at wrong offset, you're missing constants in the file or the order is wrong
- Order of operations on a single line may affect constant ordering
- Source: seekyct (2022-08-28)

##### Macro Safety
- Always wrap macro arguments in parentheses:
  ```c
  // BAD:
  #define ASD(x) (x < 0) ? 0 : 1
  // ASD(-5) + 1 becomes (-5 < 0) ? 0 : 1 + 1 = 0

  // GOOD:
  #define ASD(x) (((x) < 0) ? 0 : 1)
  // ASD(-5) + 1 becomes (((-5) < 0) ? 0 : 1) + 1 = 1
  ```
- Source: altafen (2022-08-21)

#### 2022-09 (source: 2022-09.md)

##### #pragma force_active Limitations
- `#pragma force_active on` does NOT work reliably for data symbols
- May need to use FORCEACTIVE section in the LCF file instead
- Even with extern forward declaration trick, some symbols still get discarded
- Source: revosucks, seekyct (2022-09-03)

```c
// In LCF file:
FORCEACTIVE {
    lbl_804C28D0
}
```

##### sdata vs sbss
- Initialized data goes to sdata
- Uninitialized or zero-initialized data goes to sbss
- `char lbl[1] = "";` goes to sdata (initialized)
- `char lbl[1]` goes to sbss (uninitialized)
- Must specify array size `[1]` - otherwise uses .data relocs
- Source: rtburns (2022-09-03)

##### Parallel Build Issues
- `make -j` can cause build failures
- Some dependencies may not be properly specified
- Source: revosucks, kiwidev (2022-09-17)

##### Function Mismatches Between Scratch and Repo
- When function matches on decomp.me but not in repo, check:
  - Function/struct declarations that differ between scratch and repo
  - Values being passed as f64 instead of f32
  - Float conversion constants being generated incorrectly
- Tip: Put function in its own compilation unit and objdump to inspect sections
- Source: rtburns (2022-09-16)

##### CPP Environment Variable
- GitHub Actions may set CPP to use mwcc for preprocessing
- This can break LCF preprocessing
- Solution: Explicitly set `CPP=` or remove LCF preprocessing if not needed
- Source: rtburns (2022-09-04)

##### Static vs Global in Inline ASM
- Static callback functions in asm don't need `.global`
- But adding `static` in C to force file-local may not match
- Source: glazedgoose, encounter (2022-09-19)

#### 2022-10 (source: 2022-10.md)

##### Community Symbol Database Warning
Do NOT use names from the Dolphin memory map / community database in the codebase:
- Contains 20 years of modder guesses
- Some names are completely wrong
- C++ mangled names that don't match actual behavior
- Source: ribbanya, vetroidmania (2022-10-18)

##### Context Syntax Errors
Common issues with generated context:
- `@address` syntax not supported by m2c: convert to cast assignment
- Missing return types on forward declarations
- Example fix: `OSContext* OS_CURRENT_CONTEXT @ 0x800000D4;` becomes `OSContext* OS_CURRENT_CONTEXT = (OSContext*)0x800000D4;`
- Source: kiwidev, yoyoeat, ribbanya (2022-10-28)

##### Matching vs Non-Matching Decomp Distinction
This project is a MATCHING decomp:
- Goal is byte-for-byte identical output to original DOL
- Different from projects like Metaforce (Prime) which is non-matching
- All code compiled fresh, no mixed assembly patchwork
- Source: sage_of_mirrors, vetroidmania, ribbanya (2022-10-03)

##### Portability is NOT a Current Goal
- Project explicitly not targeting x86/ARM recompilation currently
- Inline ASM will not work on other architectures
- Native ports would require rewriting hardware layer (like Super Monkey Ball x86 port)
- Can split `dolphin` namespace from repo later
- Source: ribbanya, stephenjayakar (2022-10-27)

#### 2022-11 (source: 2022-11.md)

##### mwld Patch Required
- `CWParserSetOutputFileDirectory` bug: reads 64 bytes of uninitialized memory and throws error if it contains `/\:*?"<>|`
- Fix: Run `tools/mwld_patch.py`
- Triggered more often with wibo than wine due to stack frame layout
- Check `mwld_prepatch.sha1` and `mwld_postpatch.sha1` to verify patch applied

##### Include Syntax
- Don't use `#include "file.h"` (relative imports) in Melee - MWCC doesn't have `-gccinc` flag in 1.2.5
- Don't use `#pragma once` - stick to include guards
- `-once` compiler option would make code incompatible with gcc/modern compilers

##### Clean Builds Required
- Make gets confused if you delete a header - do clean rebuild
- Errors like "No rule to make target 'include/...'" often fixed by clean build

##### Reserved Identifiers
- Leading underscores in identifiers are reserved (ribbanya)
- Doxygen gets confused if typedef name differs from tag name
- Recommendation: Use `typedef struct Type Type` instead of `typedef struct _Type Type`

#### 2022-12 (source: 2022-12.md)

##### Shiftability Breaking

Hardcoded addresses in ASM files break shiftability:
- `.4byte` with literal addresses (string literals, floats)
- `asm/melee/mp/mpcoll.s` has this issue with `__FILE__` literal
- Solutions: extern from C or compute from base address

Source: rtburns, ribbanya (2022-12-14)

##### s32 unused[n] Anti-Pattern

Never use `s32 unused[2]` to pad stack - this is a fakematch:
- Find the real cause of stack differences
- Often indicates incorrect inline usage or wrong access patterns

Source: revosucks, ribbanya (2022-12-02)

##### sizeof Hardcoding

Don't hardcode allocation sizes:
```c
// Bad:
HSD_ObjAllocInit(&lbl_80458FD0, /*size*/0x23ec, /*align*/4);

// Good:
HSD_ObjAllocInit(&FighterAllocData, sizeof(Fighter), 4);
```

Source: altimor (2022-12-23)

##### Cast Significance

Explicit vs implicit casts matter to mwcc:
- `(Fighter*)void*` vs `(void*)Fighter*` can produce different codegen
- The presence of a cast is more important than the specific type in some cases
- Cast results may allocate temporary stack space even if optimized away

Source: altimor, revosucks (2022-12-24)

##### Static Variable Initialization

Using `= {}` on static variables:
- Forces BSS ordering but moves to .data section
- May be needed for certain functions to match (func_8006DABC)
- Can affect subsequent functions that see the definitions

Source: revosucks (2022-12-24)

#### 2023-01 (source: 2023-01.md)

##### __FILE__ in Matches
- Renaming files affects `__FILE__` macro, causing DOL mismatches
- Discovered when renaming `ftyoshi.c` broke the build
- Source: ribbanya (2023-01-21)

##### getFighter() is Wrong Pattern
- Using the `getFighter()` macro directly produces incorrect codegen
- Must use `(Fighter*)HSD_GObjGetUserData()` pattern instead
- All existing getFighter usages need to be converted
- Source: revosucks (2023-01-13, 2023-01-28)

##### Double Inline Stack Issue
- Having a double inline (e.g., `Fighter_GetFighter` calling `HSD_GObjGetUserData`) can cause stack issues
- The smallest fighter.c function that accesses user_data cannot get small enough stack with double inline
- Source: revosucks (2023-01-15)

##### functions.h is Problematic
- functions.h was considered a mistake - causes maintenance nightmare
- Inline extern functions in it should be removed
- Should use `-requireprotos` flag in Makefile instead
- Source: rtburns, ribbanya (2023-01-02-03)

##### Mixed C/ASM Constant Reuse
- No good workaround for sharing constants between C and inline asm in the same file
- Source: altimor, ribbanya (2023-01-02)

##### Commits Must Individually Compile
- Each commit in a PR should compile and match
- Otherwise `git bisect run make` becomes impossible
- Source: ribbanya (2023-01-03)

##### generate_context.sh Issues
- Had issues with Windows paths, `is_relative_to` attribute errors on older Python
- May need to remove normalization on some setups
- Wine association needed on Linux for mwcc
- Source: various (2023-01-12, 2023-01-15)

##### Hitbox Terminology
- Community calls them "hitboxes" but they're actually capsules (two spheres connected by cylinder)
- Similar misconception happened in OoT (thought they were spheres, turned out to be cylinders)
- Same with Tekken 7 (modders thought spheres, actually cylinders)
- Source: ribbanya, revosucks, altimor (2023-01-28)

##### C++ Incompatibilities
- `= { 0 }` for struct initialization doesn't work in C++ (need `= { }`)
- May need `extern "C"` for porting
- Source: werewolf.zip (2023-01-09)

##### Melee64 Code Similarity
- Smash 64 and Melee share design patterns (not code)
- Fighter pointer casting pattern is identical
- Proof that the cast+inline access is correct
- Source: revosucks (2023-01-10)

#### 2023-03 (source: 2023-03.md)

##### Gotos in Nested Loops
- Using gotos to break out of nested loop conditions is sometimes inevitable
- Java's `break label;` accomplishes the same thing
- Some functions can be refactored to use a helper function returning bool instead
- Note: IDO (N64) doesn't recognize the bool type
- Source: werewolf.zip, ribbanya (2023-03-05)

##### enum_t Usage
- `enum_t` is just `int` for unknown enums
- Using it where DWARF says `unsigned int` may cause future matching issues
- Even if wrong, you can cast to `(unsigned)` at usage sites
- Source: werewolf.zip, ribbanya (2023-03-11, 2023-03-15)

##### Mass Function Renaming
- Renaming functions can be painful for anyone with WIP branches
- Suggestion: Only rename when preliminary matching C code exists
- File splits may not be finalized anyway
- Counter: Modern git tooling can handle merge conflicts
- Source: rtburns, ribbanya (2023-03-22)

##### Inline Fake Functions
- Some functions that look like copy-paste are actually MWCC inlining
- Example: Ness yoyo setup appeared to be duplicated but was an inline
- Source: vetroidmania (2023-03-18)

##### IDO Strictness vs MWCC Flexibility
- IDO (Smash 64 compiler) creates register swaps for minor discrepancies
- MWCC has many more permutations that result in identical code
- Example: A single redundant `else` on a return caused IDO to switch from stack vars to saved registers
- IDO also quietly casts `(var)` and `(!var)` as `u32`
- Source: vetroidmania (2023-03-09, 2023-03-29)

#### 2023-04-to-05 (source: 2023-04-to-05.md)

##### Include Guards vs pragma once

`#pragma once` is buggy on mwcc before version 3.0. Use include guards instead:

```c
#ifndef _FILENAME_H_
#define _FILENAME_H_
// ... header content
#endif
```

Source: swarejonge (2023-04-29)

##### Circular Dependencies with Typedefs

To avoid circular includes:
1. Create a `forward.h` with typedefs only
2. Put struct definitions in main header
3. Include the struct header in .c files directly, not in other headers
4. Or use `struct Fighter` everywhere instead of typedef

Source: ribbanya (2023-04-28)

##### GET_FIGHTER Macro Issues

`GET_FIGHTER` stops working in some contexts:
- When extra float args are added (e.g., for landing lag)
- When used in callbacks passed to certain functions like `ft_80082C74`
- Workaround: Use direct `gobj->user_data` assignment with unused stack padding

Source: ribbanya (2023-05-28)

##### Smash 64 Hurtbox Bug

Both Smash 64 and Melee have a bug when setting individual hurtbox collision states - returns after first bone ID match instead of checking all hurtboxes on the same bone.

Source: vetroidmania (2023-05-26)

##### Windows Build Issues

If getting "fatal error: opening dependency file" on Windows:
- Try installing devkitpro and running in its msys environment
- Or use `bash -c 'make ...'` in PowerShell
- Issue may be Python path related

Source: _go0b_, ribbanya (2023-04-10)

#### 2023-06 (source: 2023-06.md)

##### sdata Mismatches (ribbanya, 2023-06-03)
When context assertions have wrong filenames, it can cause sdata ordering issues that look like `-sdata 32` problems but are actually just wrong strings.

##### Pointer Arithmetic (kiwidev, 2023-06-22)
`+ 3` becomes `0xc` in assembly when incrementing a pointer to a 4-byte type (pointer arithmetic multiplies by element size).

##### Refactoring Impact on Contributors (werewolf.zip, 2023-06-11)
Constant refactors discourage contributors:
> "When my limited time to work on it comes back to 'Ah yes, time to fix everything again' - it makes me less than enthused."

##### Linker Address vs Virtual Address Confusion (ribbanya, 2023-06-03)
Map file addresses should match function names if DOL matches. Any discrepancy is usually from reading wrong map file (e.g., `build/wip/.../GALE01.map` vs `expected/.../GALE01.map`).

##### Item Struct User Data Access (various, 2023-06-24)
When m2c generates code like:
```c
temp_r4 = arg0->user_data->unkDC9;
```
Don't comment out lines with uninitialized variables - find the correct field in the Item struct (context line 11966 for user_data definition).

#### 2023-07-to-12 (source: 2023-07-to-12.md)

##### decomp.me Preset Reset
- decomp.me sometimes randomly resets the preset when clicking "New"
- Especially happens when the site is slow
- Always verify compiler settings before debugging other issues
- Source: werewolf.zip (2023-12-20)

##### math.h Header Conflicts
- Including math.h can cause sdata2 mismatches in some TUs
- grizumi.c stops matching if math.h is included
- Use intrinsics.h for `__frsqrte` instead
- Source: altafen, ribbanya (2023-10-14)

##### Windows Build Considerations
- Windows builds are slower on GitHub Actions
- WSL2 is "extremely slow" for compiling Melee
- mingw provides bash and make, lighter than msys2
- Multiple bash environments (WSL, git bash, mingw) cause confusion
- Source: revosucks, altafen, ribbanya (2023-11-20)

##### Inline Detection
- Many functions have unused stack space suggesting stripped inlines
- Ness has ~8 functions with inlined yoyo code that matches without explicit inlines
- "We're just fake matching in a lot of cases"
- Source: werewolf.zip, vetroidmania (2023-10-30)

##### Stub Functions
```asm
.global grTMario_8021FB4C
grTMario_8021FB4C:
    blr
.L_8021FB50:
    mflr r0
    ...
```
- A `blr` followed by more code indicates two separate functions
- First is a stub (immediately returns)
- The `.L_` label starts a new function
- Source: werewolf.zip (2023-12-18)

---

#### 2024-01 (source: 2024-01.md)

##### Progress Calculation Bug

Splitting files can cause the progress script to report incorrect values:
- After splitting un_2FC9.s into smaller files, progress dropped ~6KB
- The calcprogress.py script has accuracy issues with slices
- Source: werewolf.zip, ribbanya (2024-01-09)

##### DTK ASSERT Line Numbers

When using DTK, `HSD_ASSERT` line numbers can get shifted if `MUST_MATCH` is not defined:
```c
// Without MUST_MATCH, line 489 might report as 0xf8 instead of 0x1e9
HSD_ASSERT(489, new);
```
Solution: Add `MUST_MATCH` to configure.py defines.
- Source: werewolf.zip, ribbanya (2024-01-16)

##### Common Section Behavior

In older GCC/mwcc, uninitialized data like `int counter;` (without `static`) goes into a "common" section that the linker deduplicates. This is different from functions and initialized data which cause multiple definition errors.
- Source: gamemasterplc (2024-01-17)

##### Stack Variable "Fake Matches"

When adding stack padding to match:
- Could indicate missing inline function calls
- Could indicate wrong parameter types (e.g., function takes `Vec3*` but you're passing `f32*`)
- The padding may be "real" if adjacent stack variables are accessed by an inlined function
- Not always UB - often just compiler inefficiency
- Source: revosucks, rtburns (2024-01-24)

##### Struct Field Access Bug Pattern

When you see code loading from wrong offsets, check for typos in variable names:
```c
// Bug: Uses gp instead of pp
*x = gp->x;  // Should be pp->x
```
This can make it look like the struct is wrong when it's actually a code bug.
- Source: werewolf.zip (2024-01-11)

#### 2024-02 (source: 2024-02.md)

##### Unused Stack Variables
- May be real (debug/retail differences) not fake
- Retail asserts can leave stubs that declare but don't use variables
- `asm("");` is sometimes a legitimate optimization trick
- Empty `goto jump; jump:;` can prevent compiler from moving code
- Source: revosucks, werewolf.zip (2024-02-16)

##### PAD_STACK Limitations
- Won't cover all cases
- Sometimes need specific types (e.g., 2 fake Vec3s instead of int _[6])
- Different allocation sizes can result from type choices
- Source: werewolf.zip (2024-02-16)

##### Type Alias Casting Issues
- Item_GObj, Fighter_GObj, Ground_GObj aliases are typedefs to HSD_GObj
- decomp.me context treats them as distinct structs
- Causes unnecessary casts in code
- Can cause matches to fail when inlines are involved
- Consider modifying context directly when working on decomp.me
- Source: ribbanya, werewolf.zip, rtburns (2024-02-22)

##### Circular Include Errors
- "array has incomplete element type" can be caused by circular includes
- Check if types.h or similar is including the problematic header
- Source: werewolf.zip, ribbanya (2024-02-19)

##### Symbol Name Volatility
- sdata2 literal names change as files change
- Will stabilize when entire file is matched
- Can update symbols.txt to match base object but not critical
- `dtk elf config` feature exists but was broken at time of discussion
- Source: ribbanya (2024-02-12)

##### PAL vs NTSC Timing
- Game/physics engine runs at same rate between PAL and NTSC
- PAL skips rendering every 6th frame
- PAL60 mode works like NTSC
- Source: camthesaxman (2024-02-19)

#### 2024-03-to-07 (source: 2024-03-to-07.md)

##### NonMatching Files Don't Affect DOL (altafen, 2024-06-01)
The build system combines:
- Original DOL (for NonMatching files)
- Built Matching files

If you modify a file marked NonMatching in configure.py, changes won't appear in the output DOL. Mark it as Matching to test modifications.

##### Errant cmpwi from Void Casts (ribbanya, 2024-03-11)
An unexplained `cmpwi` that does nothing with its result is often from:
```c
(void)gobj;  // Produces cmpwi with no branch
```
Used in RETURN_IF macros and similar patterns.

##### Multiple Data References Coalesce (gamemasterplc, 2024-05-12)
If you reference data symbols multiple times in a function, the compiler may coalesce them:
```c
// Instead of separate string loads:
OSReport("message1");
OSReport("message2");

// You might see:
OSReport(((char*) &baseSymbol) + offset1);  // Both relative to first symbol
OSReport(((char*) &baseSymbol) + offset2);
```
Solution: Define all data in that TU properly, possibly requiring decompilation of preceding functions.

##### SDK Version Differences (werewolf.zip/revosucks, 2024-05-23)
Melee uses SDK from around December 2001, not May 2001:
- September 2001 SDK had significant changes
- December 2001 debug builds may help
- Some functions have extra null checks that May 2001 lacks:
```c
// Melee version (Dec 2001):
void __AXGetAuxAInput(u32* p) {
    if (__AXCallbackAuxA != NULL) {
        *p = (u32) &__AXBufferAuxA[...];
    } else {
        *p = 0;
    }
}

// May 2001 version:
void __AXGetAuxAInput(u32* p) {
    *p = (u32) &__AXBufferAuxA[...];  // No null check!
}
```

##### Shiftability Explained (altafen, 2024-07-15)
The decomp is shiftable because symbols are referenced by name, not hardcoded addresses:
```asm
; Non-shiftable (hardcoded):
lis r4, -0x7fc0        ; Magic number
subi r0, r4, 0x58      ; Another magic number

; Shiftable (symbolic):
lis r4, un_803FFFA8@ha
addi r0, r4, un_803FFFA8@l
```
The linker resolves `@ha`/`@l` at link time. Can't just search-replace numbers because some are actual data (colors, bitmasks like `0x80400001`).

##### Stack Padding Can Be Many Things (ribbanya, 2024-07-14)
Stack size mismatches could indicate:
- Missing parameter
- Missing local variable
- Missing inline function
- Something else entirely

If the checksum passes, it's better to mark as matching even with padding hacks - perfect stack guessing is often not worth the time investment.

#### 2024-08-to-12 (source: 2024-08-to-12.md)

##### decomp.me Cast Errors
- When using specific GObj types (Item_GObj, Fighter_GObj), decomp.me requires casts
- The local build doesn't need these casts due to ifdef magic
- Workaround: Edit context to remove Item_/Fighter_ struct definitions
- Source: foxcam, altafen (2024-08-23, 2024-09-18)

##### Inlined Functions Cause Extra Stack
- Using `GET_MENU` or similar macros can cause unexpected stack allocation
- Sometimes removing the macro and using direct access fixes the issue
- Source: werewolf.zip (2024-08-17)

##### Clang Format Reordering Breaks Code
- Clang format reorders includes, which can break files that depend on include order
- Files may need explicit type includes instead of relying on ordering
- Source: werewolf.zip (2024-09-16, 2024-09-19)

##### Incomplete Target ASM
- Invalid/incomplete target ASM causes cryptic errors like `unknown relocation type 'R_PPC_REL14'`
- Functions extend to the `blr` instruction, not just the first local label
- Source: werewolf.zip (2024-11-17)

##### M2C_FIELD Indicates Missing Struct Fields
- When m2c outputs `M2C_FIELD(fp, u8*, 0x2223)`, the field doesn't exist in context
- Usually means there's a bitfield that needs to be accessed differently (e.g., `fp->x2223_b0`)
- Source: foxcam (2024-10-11)

##### Version Differences
- K7 (Kirby Air Ride) source from 4 years later has small differences
- Some Melee code has constructs not present in later SDK versions
- May lead to "fake matching" where code structure differs from original
- Source: werewolf.zip, .cuyler (2024-09-05)

#### 2025-01-to-04 (source: 2025-01-to-04.md)

##### Struct Field Order in Unions
- Getting x/y order wrong in vector structs is common mistake
- "maybe this is a dev that likes to do y then x"
- Source: revosucks (2025-04-29)

##### Decompiled Code Order
- Constants and functions must be in original order
- "the code sandwich has gotta be in the same order or its not the same sandwich"
- Working at file level is standard practice
- Source: revosucks (2025-04-29)

##### cror Instructions in Decompiler
- `M2C_ERROR(/* unknown instruction: cror eq, gt, eq */)` indicates compound comparison
- Delete the error and replace nearby `==` with `>=`
- Source: ribbanya (2025-04-29)

##### AI/LLM for Decomp
- ChatGPT trained on existing decomp code, recognizes struct names
- Can get ~90% matches but often uses hardcoded offsets instead of proper types
- Missing context is major limitation
- Still needs human "piloting" to provide relevant context
- Gemini's 2M token context could fit entire context file
- Source: tsanummy, werewolf.zip, altafen (2025-02-13)

##### GX Macros
- GX macros are actually inline functions, not preprocessor macros
- Source: gamemasterplc (2025-02-15)

#### 2025-05 (source: 2025-05.md)

##### Slippi ISO Issues
- Using Slippi-modified DOL will cause hash mismatch
- Ensure you extract from vanilla NTSC 1.02 ISO, not Slippi version
- Source: soulctf (2025-05-26)

##### .static.h and BSS Ordering
- Reordering items in `.static.h` can break BSS ordering
- Data section items (`gm_803DD2C0`) should be externed if not initialized in file
- Moving static data around can shift offsets and break partially-matched functions
- Source: rtburns, altafen, ribbanya (2025-05-25, 2025-05-28)

##### Function Renaming and CI
- Function renaming causes diff step to fail (shows 100% -> 0 for renamed functions)
- This is expected behavior; CI diff step is now non-blocking
- decomp.dev bot handles actual regression checking
- Source: werewolf.zip, altafen (2025-05-25)

##### Data Matching Advice
- Don't work on data sections until file is done
- Most static data are literals used in functions that m2c will auto-insert
- Data ordering only matters at final linking stage
- Source: ribbanya (2025-05-25)

##### clang Warning Pragmas
- Use clang push/pop pragmas to ignore warnings for specific functions
- `-Wsign-compare` often needs suppression; can also cast `(signed)` or `(unsigned)`
- `-Wreturn-type` may need suppression when missing return is intentional for match
- Source: werewolf.zip, rtburns (2025-05-29, 2025-05-30)

##### PAD_STACK Limitations
- `PAD_STACK(n)` cannot be placed between declarations
- For padding between stack variables, use scope blocks or manual array allocation
- Source: rtburns, ribbanya (2025-05-30, 2025-05-31)

#### 2025-06 (source: 2025-06.md)

##### AT_ADDRESS Macro for hw_regs
- `volatile u16 __VIRegs[59] : 0xCC002000;` syntax causes decomp.py syntax errors
- Use `AT_ADDRESS` macro instead for m2c compatibility
- Source: mr.grillo, werewolf.zip, rtburns (2025-06-03)

##### Wrong Union Member
- Using the wrong character's union member (e.g., Captain Falcon instead of Sheik) can appear to match better
- This indicates the correct union member needs its types fixed to match the "wrong" one
- Always use the semantically correct union member
- Source: ribbanya, gelatart (2025-06-21)

##### Headers in extern/ Not Triggering Rebuilds
- ninja wasn't seeing changes to headers in `extern/` directory
- Fixed by switching from `-i` includes to `-I` includes
- System includes don't get added to dep files
- Source: rtburns, ribbanya (2025-06-03)

##### m2c Generating Extra Casts
- m2c generates `(Fighter_GObj*)` casts that should be removed when committing
- These casts can cause stack/register differences
- The actual repo code should not have these casts
- Source: revosucks, rtburns (2025-06-26)

##### Scratches Matching on decomp.me but Not Locally
- Usually a missing `#include` in the local file
- decomp.me context has every header, but locally you must include manually
- Calling undeclared functions causes implicit int return assumption
- Source: rtburns (2025-06-19)

##### Items are More Than Pickups
- "Item" in code refers to fighter accessories too: Fox's laser, Link's arrows, G&W's bucket
- Many item functions are callbacks accessed indirectly via state tables
- Source: rtburns, werewolf.zip (2025-06-17-18)

#### 2025-07 (source: 2025-07.md)

##### M2CTX Macros on decomp.me
- decomp.me cannot use #ifdef directives
- m2c doesn't support directives: `Syntax error when parsing C context. Directives not supported yet`
- This is why GET_FIGHTER has the extra cast on decomp.me
- Source: rtburns (2025-07-03)

##### Include Path Issues
- MWCC has broken quote-include behavior (issue #1565)
- Prefer angle-bracket includes: `<melee/gm/types.h>` over `"melee/gm/types.h"`
- Quote includes check PWD first, then -I directories
- Angle-bracket includes only check -I directories
- Source: rtburns (2025-07-25)

##### func_XXXXXXXX Addresses Can Be Wrong
- Address in function name can get mangled (e.g., by AI comments)
- Always verify against symbols.txt
- `func_80081A24` wasn't even in symbols.txt
- Source: ribbanya (2025-07-24)

##### Float Literals vs Extern Floats
- Externed floats like `ftYs_Init_804D9A38` are just literals
- Check asm to find value (e.g., `.float 0`) and replace with `0.0F`
- Don't commit extern float declarations - inline the values
- Source: rtburns (2025-07-21)

##### Missing Header Causes lfs/lfd Issues
- Getting `lfs` instead of `lfd` (or vice versa) often means missing include
- Example: Including fighter.h fixed float load mismatch
- Example: Missing atan2f header caused different codegen
- Source: gelatart, gamemasterplc (2025-07-09, 2025-07-24)

##### efSync_Spawn Variadic
- `efSync_Spawn` is variadic - missing include causes different codegen
- Include `ef/efsync.h` to fix
- Source: gamemasterplc, rtburns (2025-07-12)

##### Splitting Considerations
- Float constants get deduplicated within a file but not between files
- If target sdata2 has multiple copies of same float (e.g., 13 copies of 1.0F), need multiple files
- Section boundaries rounded to 16 bytes by compiler
- Split boundaries can be identified by repeated float patterns in sdata2
- Don't split unless necessary - objdiff workflow makes splitting an afterthought
- Source: altafen, ribbanya (2025-07-02, 2025-07-25)

##### .static.h Files
- Temporary files for m2c/decomp.py to see struct definitions
- Contents should move into .c file once matching
- Source: altafen, rtburns (2025-07-19)

##### Build Failures After Branch Switch
- Delete `build/GALE01` to fix mysterious build failures after switching branches
- `ninja -t clean` doesn't always work
- Old split objects don't get removed when splits change
- Source: altafen, encounter (2025-07-30)

##### Symbol Shifts in Demo Build
- Demo/nonmatching builds have shifted addresses
- Load .elf into Dolphin and export symbols for correct addresses
- Or use `powerpc-eabi-objdump -d --section=.text build/GALE01/main.elf | less`
- Source: rtburns, foxcam (2025-07-30)

##### Struct Size Changes with Anonymous Structs
- Removing anonymous struct wrapper around bitfields can change Fighter size in mwcc
- But not in clangd - implementation difference
- Source: ribbanya, rtburns (2025-07-28)

#### 2025-08 (source: 2025-08.md)

##### decomp.me vs Local Builds

decomp.me context differs from local builds:
- `Item_GObj` on decomp.me has `Item* user_data` but locally has `void* user_data`
- `GET_ITEM` on decomp.me has extra `(HSD_GObj*)` cast
- Always verify matches locally with objdiff before committing
- Code that matches on decomp.me may need adjustments locally
- Source: altafen (2025-08-12)

##### M2C_FIELD Anti-Pattern

While `M2C_FIELD` can force matches, it defeats the purpose of matching:
- Doesn't help flesh out structs and function signatures
- Acceptable for bulk matching but not ideal
- Source: ribbanya (2025-08-12)

##### CI Build Failures

The error `Data mismatch for [function]` means your changes broke that function:
- Replicate with `ninja diff` locally
- The "os error 2" is a CI bug, ignore it
- Source: ribbanya (2025-08-05)

##### Include Conventions

Header include priorities exist but are being simplified:
- `forward.h` for type forward declarations
- `gobj.h` needed for struct definitions (non-m2c)
- Many .c files missing their corresponding .h include - oversight to be fixed
- iwyu is set up but hasn't been run in ~1 year
- Source: ribbanya (2025-08-06)

##### Float Constants

Don't use named float constants (like `THREE_F`), just use literals:
```c
// Bad
float x = THREE_F;
// Good
float x = 3.0f;
```
- Source: ribbanya (2025-08-02)

##### Struct Disambiguation

When matching reveals a new struct, create it locally until it clashes with existing:
- Happens all the time
- Can merge identical structs later
- Source: ribbanya (2025-08-15)

#### 2025-09-to-2026-01 (source: 2025-09-to-2026-01.md)

##### Diffing Mode in objdiff
When checking match status:
- Set "Diff Options" dropdown to "None" to ignore labels/data and check only instructions
- The GitHub diff bot runs with diffing type set to None
- Label differences don't mean the function is wrong if instructions match
- Source: rtburns, ribbanya (2025-10-13)

##### String Pooling / Label References
When you see data symbols referencing offsets from unexpected base symbols:
- This is likely pooled string literals
- The C code accesses the struct directly, but asm uses a reference point
- Fix: Ensure data offsets in asm mirror those from generated object
- Make sure order and size of each symbol is correct and properly split
- Source: ribbanya (2025-11-06)

##### Link Order for Module Files
Don't second-guess top-level modules (`gm`, `ft`, `gr`, etc.) - these are well-established by link order:
- Exception: `un` (unknown) which doesn't actually exist as a module
- Some files may need splitting
- Source: ribbanya, werewolf.zip (2025-10-17)

##### File vs Function Matching
- "Matched file" = every function is 100% AND data also matches
- If a file is unmatched, build system pulls it from original DOL for hash checking
- Still stores JSON of percentages for regression detection
- Source: altafen (2025-12-27)

##### Fake Matches to Avoid
Be wary of:
- Raw pointer arithmetic that happens to work
- Casts that don't make semantic sense
- Functions with pad_stack that might hide missing inlines
- LLM-generated names/comments (can be hallucinated)
- Source: rtburns, werewolf.zip (2025-12-29, 2025-12-30)

---

### Common Pitfalls

#### 2022-07 (source: 2022-07.md)

##### Including C Files
- Can include C files but considered bad practice
- If including code, should be an inline header instead
- Function declarations belong in headers, not C file includes
- Source: revosucks, werewolf.zip, camthesaxman (2022-07-28)

##### Register Swaps from Type Mismatches
- Passing wrong type (e.g., Fighter* vs Item GObj*) causes register shuffling
- Check `lwz r3, 0xXXXX(rYY)` to see what's actually being passed
- If compiler loads from struct offset for r3, that's what gets passed
- Source: altafen, vetroidmania (2022-07-15)

##### GameCube Float Non-Compliance
- GameCube FPU is ~99% IEEE 754 compliant, not 100%
- Some edge cases differ (e.g., early CW versions had `Sqrt(0)` return infinity)
- Dolphin developers have more info on specific differences
- Be careful when porting code to standard IEEE platforms
- Source: revosucks (2022-07-04, 2022-07-16)

##### Fake Matches
- Contrived code that matches assembly but isn't what developers wrote
- Look for: excessive temp variables, pointless casts, strange inline usage
- Clean up after matching when possible
- Document known fakes for later fixing
- Source: various (throughout month)

##### Stack Mismatch Debugging
- First match all code except stack, then fix stack
- Inlines often cause stack discrepancies
- Adding/removing inlines changes stack reservation
- Order of inline usage matters
- Source: revosucks (2022-07-21)

## Project Status, Progress, and History

### Project Status

#### 2023-04-to-05 (source: 2023-04-to-05.md)

- April 2023: ~14.5% code completion, 11.97% data
- End of May 2023: 16.43% code completion, 12.22% data (48 trophies)
- Smash 64 decomp approaching 30% completion (vetroidmania)

### Project Status Notes

#### 2023-01 (source: 2023-01.md)

##### Progress as of Late January 2023
- Code sections: 558405 / 3882272 bytes (14.38%)
- Data sections: 146256 / 1223369 bytes (11.96%)
- 41 of 293 Trophies milestone
- About 10% progress gained in the past year
- Source: revosucks, altafen (2023-01-24, 2023-01-31)

##### Dolphin SDK Remaining
- Largest remaining: vi.s, jpeg/jpegdec.s, pad/Pad.s
- Most data sections can likely be removed
- Plan to move to shared external repo
- Source: rtburns (2023-01-16)

##### Brawl Not Useful for Melee
- Brawl is C++ rewrite by Sora Ltd, not HAL
- Completely different codebase, not useful for Melee
- Source: revosucks (2023-01-13)

#### 2024-03-to-07 (source: 2024-03-to-07.md)

##### Progress Metrics (May 2024)
- Full file matching: ~18%
- Partial/fuzzy matching: ~24%
- The percentage dropped when partial linking and asm functions were deprecated

##### Trello Deprecated (April 2024)
- Trello limited free workspaces to 10 collaborators
- Project transitioning to GitHub Projects
- For now, just announce in Discord what you're working on

##### CI Regression Detection (altafen, 2024-05-22)
CI uses `objdiff-cli` with `jq` to detect regressions:
- Checks if any function went from 100% to less
- Catches changes in partial files that would be invisible otherwise
- Python script added (July 2024) for more reliable checking

### Project Status (October 2021)

#### 2021-06-to-10 (source: 2021-06-to-10.md)

##### File Splitting Progress
- Nearly all .sdata done
- Most .data sections addressed (many are jump tables)
- General understanding of entire Melee layout achieved
- Goal: shiftable build within the month
- Source: werewolf.zip (2021-09-27, 2021-08-25)

##### Ongoing Compiler Search
- Team actively searching for EPPC 4 compiler
- Considering Mac compiler hacking as alternative
- Research ongoing for 13+ months at this point
- Changelog documentation matches observed issues exactly
- Source: revosucks (2021-10-03)

### Project Status and Direction

#### 2022-10 (source: 2022-10.md)

##### Progress Statistics (October 2022)
```
Code sections: 476736 / 3882272 bytes in src (12.28%)
Data sections: 62507 / 1223369 bytes in src (5.11%)
35 of 293 Trophies, 2 of 51 Event Matches
```
- Progress dropped because project stopped counting asm functions
- Source: ribbanya (2022-10-26)

##### Multiple Pass Philosophy
1. First pass: Write "shitty C code" that matches
2. Later pass: Document structs, clean up patterns
3. Full documentation comes last (like sm64's shadow.c example)
- Source: stephenjayakar, ribbanya, revosucks (2022-10-27)

##### Contributor Profile
- Most contributors are Melee modders interested in specific code sections
- Fighter code gets the most attention
- Libraries, menu code, other systems less loved
- High friction for first-time contributors
- Source: ribbanya (2022-10-26-27)

##### Long-Term Vision
- Native Melee client (no emulator)
- Rollback netcode built into game code, not Dolphin patches
- Low-end device support (Raspberry Pi, Steam Deck)
- UI modding in C instead of complex hex editing
- Depends on near-complete decompilation
- Source: ribbanya, stephenjayakar, cortex420 (2022-10-09, 2022-10-27)

### Project Status and Estimates

#### 2023-06 (source: 2023-06.md)

##### Progress as of June 2023
- Code sections: 663,077 / 3,882,272 bytes (17.08%)
- Data sections: 167,049 / 1,223,369 bytes (13.65%)
- 50 trophies collected

##### Completion Estimates (various, 2023-06-01)
Discussion about which GC decomp might reach 100% first:
- Pikmin and Melee have good shots
- Ty the Tasmanian Tiger also mentioned (just one contributor: chippy)
- Super Monkey Ball was furthest (>50%) but cam left
- Libraries need to be decompiled for true 100%

At current rate: estimated late 2028 completion (ryankoop, 2023-06-08)
Alternative calc: ~8.66 years at 1 KiB/day (ribbanya, 2023-06-04)

### Project Progress

#### 2025-07 (source: 2025-07.md)

##### Milestone: 36% Matched
```
Progress:
  All: 36.18% matched, 24.59% linked (557 / 903 files)
    Code: 1405160 / 3883984 bytes (12535 / 19891 functions)
    Data: 175769 / 1211496 bytes (14.51%)
```
- 10% increase in 2 months (from ~26% in late May)
- Source: werewolf.zip (2025-07-28)

##### Trophy Tracking
- 72 trophies at 36% progress
- F pool (72 trophies) -> E pool (12) -> D pool (23) -> C pool (17) -> B pool (10) -> A pool (4)
- 133 total through lottery
- Remainder need matches/special circumstances
- Source: werewolf.zip, revosucks (2025-07-28)

##### Compiler Versions Used
- 1.2.5n for most things
- 1.2.5 for some things
- 1.1p1 for TRK
- Source: ribbanya (2025-07-25)

### Project Progress (November 2022)

#### 2022-11 (source: 2022-11.md)

```
Code sections: 476736 / 3882272 bytes (12.28%)
Data sections: 62539 / 1223369 bytes (5.11%)
35 of 293 Trophies, 2 of 51 Event Matches
```

### Progress Tracking

#### 2021-11 (source: 2021-11.md)

##### Melee Progress (as of November 28, 2021)
```
Progress:
    Code sections: 12152 / 3882272 bytes in src (0.313013%)
    Data sections: 0 / 1211849 bytes in src (0.000000%)

You have 0 of 290 Trophies and 0 of 51 Event Matches.
```
Source: werewolf.zip (2021-11-28)

### Progress Notes

#### 2022-02 (source: 2022-02.md)

##### Key Milestones This Month
- Started at ~1.5% code decompiled
- Reached 2% code decompiled (2022-02-22)
- Trophy count: 4 -> 6
- r40 DevkitPPC compatibility achieved
- Rumble.c fully decompiled
- Many clone fighters completed (Falco, Young Link, Dr. Mario, Ganondorf, etc.)

##### File Completion Status
- ftSandbag: Complete
- rumble.c: Complete
- Most clone fighters: Complete (short files)
- fighter.c: 15% (kalua working)
- player.c: Complete (mostly)

#### 2022-05 (source: 2022-05.md)

##### Milestones
- Trophy 18 achieved (2022-05-21): 6.31% code matched
- Trophy 20 achieved (2022-05-27): 6.90% code matched
- Ness character completed (2022-05-27)
- All 33 fighter OnLoad/OnDeath functions matched (2022-05-24)

##### Code Size Estimates
- Fighter code (0x80068000 - 0x8015CC10): ~26% of DOL
- Total DOL size: 4,425,184 bytes

##### SHA-1 Hash
- DOL hash: `08e0bf20134dfcb260699671004527b2d6bb1a45`
- Used for match verification
- SHA-1 collision attacks exist but impractical for this use case
- Source: altafen, revosucks (2022-05-21)

#### 2022-06 (source: 2022-06.md)

##### June 2022 Milestones
- June 15: Reached 7% code sections (272,316 / 3,882,272 bytes)
- June 19: Trophy count reached 21 of 290
- June 20: Reached 7.45% code sections (289,364 bytes)
- ftMario completed and PR submitted (nic6372)
- Major fighter.c cleanup pass begun (revosucks)
- item.c files progressing (vetroidmania)

##### Active Contributors
- snuffysasa: decomp.me/asm-differ development, permuter support
- revosucks: fighter.c cleanup, inline discovery
- vetroidmania: item.c, ftNess work
- nic6372: ftMario completion
- altafen: general matching help
- kiwidev: switch matching, argument ordering insights
- amber_0714: optimized switch blocks, item IDs
- chippy__: switch matching

### Progress and Metrics

#### 2024-02 (source: 2024-02.md)

##### Progress Calculation (as of late February 2024)
```json
{
  "fuzzy_match_percent": 23.460627,
  "total_size": 3894116,
  "matched_size": 845932,
  "matched_size_percent": 21.72334,
  "total_functions": 20126,
  "matched_functions": 7231,
  "matched_functions_percent": 35.92865
}
```
- `matched_size_percent` recommended as primary metric
- `matched_functions_percent` is function count only
- Source: ribbanya (2024-02-27)

##### Progress Tracking
- frogress integration: https://progress.decomp.club/data/melee/
- Auto-updates via CI
- Can exclude TRK/Dolphin SDK from progress (feature requested)
- Source: ribbanya, encounter (2024-02-27)

### Progress and Milestones

#### 2025-06 (source: 2025-06.md)

##### June 2025 Progress
- Started at ~28% matched
- Ended at ~29% matched
- 67 trophies collected (from 59)
- 10 event matches
- extern/dolphin merged (PR #1559)
- AX, AXFX matched
- Several character files progressed (Sheik, Yoshi, G&W items)
- Source: werewolf.zip, revosucks (various dates)

##### Playable Build Progress
- Most of sysdolphin is functional (regswaps or matched)
- Missing: audio, bytecode stuff
- `resolveCnsOrientation` can be stubbed as `return;` for basic functionality
- Text rendering has shiftability issues causing visual glitches
- mncharsel has gnarly functions - might be worth bypassing initially
- Source: werewolf.zip, rtburns, revosucks (2025-06-24)

### Progress Milestones

#### 2023-07-to-12 (source: 2023-07-to-12.md)

##### Major Completions (Jul-Dec 2023)
- **FObj fully matched** - "Eat my ass, HAL" (werewolf.zip, 2023-09-22)
- **AObj fully matched** (werewolf.zip, 2023-09-24)
- **PObj fully matched** - ~0.34% jump, new trophy (werewolf.zip, 2023-09-26)
- **LObj matched** (werewolf.zip, 2023-09-27)
- **video.c matched** - ~0.12% jump (werewolf.zip, 2023-12-20)
- **grIzumi.c (Fountain of Dreams)** matched (altafen, 2023-10-14)

##### Progress Tracking
- July: ~17.2%
- September: ~17.9% (52 trophies)
- October: ~18.14% (53 trophies)
- November: ~18.16% (53 trophies)
- December: ~18.3%

##### Code Statistics
- Melee DOL: ~3.9MB of code total
- Line count (naive): ~63k semicolons in src/
- Source: werewolf.zip, ribbanya (2023-09-13, 2023-10-23)

---

#### 2025-08 (source: 2025-08.md)

- August 8: Hit 38% completion
- August 27: Hit 40% completion
- Growth from ~33.33% to 40% in approximately one month

#### 2025-09-to-2026-01 (source: 2025-09-to-2026-01.md)

- September 2025: Fuzzy match % passed 50%
- November 2025: Close to halfway point on strict matching
- December 2025: 47.39% matched, 28.49% linked (640/962 files)
- gigabowser ported collision code to a Melee engine reimplementation, verifying behavior
- Source: various (2025-09 through 2025-12)

### Project Milestones

#### 2022-04 (source: 2022-04.md)

##### Progress: 5.07% Code (April 25, 2022)
```
Code sections: 196852 / 3882272 bytes in src (5.070536%)
Data sections: 35677 / 1211849 bytes in src (2.944014%)
15 of 290 Trophies, 1 of 51 Event Matches
```

##### Key Files Completed This Month
- fighter.c - Major completion by snuffysasa
- ftMasterHand - Completed by altafen
- ftcommon - Major progress by rtburns

##### Community Notes
- UnclePunch map: https://github.com/UnclePunch/Training-Mode/blob/master/GTME01.map
- Akaneia/m-ex fighter structs: https://github.com/akaneia/m-ex/blob/master/MexTK/include/fighter.h
- Missing FTP patch archive link: https://web.archive.org/web/20011121032509/http://www.metrowerks.com:80/games/gamecube/update/

#### 2022-07 (source: 2022-07.md)

##### Progress Statistics
- Started month: ~7.5%
- End of month: ~9.5%
- Trophies: 25 -> 27
- mtx.c fully decompiled (previously one of hardest files)
- Major fighter work: G&W, Luigi, Fox, Donkey Kong, Zelda

##### CW_Update.zip Search
- The compiler patch from 2001 remains unfound
- Was distributed via FTP to licensed developers only
- Contacted multiple potential sources (game developers) with no luck
- Eternal Darkness developers couldn't/wouldn't share
- Bounty still open
- Source: revosucks, cortex420 (2022-07-03, 2022-07-18)

---

*Compiled from 3,140 Discord messages in #smash-bros-melee, July 2022*

### Project Milestones (Aug-Dec 2024)

#### 2024-08-to-12 (source: 2024-08-to-12.md)

- 19% files fully matched (2024-09-04)
- 56 trophies (progress metric) (2024-09-09)
- Broke 25% matched code (2024-09-29)
- 73 trophies by end of September
- 25.17% perfectly matched by November

### Historical Notes

#### 2020-09-to-12 (source: 2020-09-to-12.md)

##### Early Project State (Late 2020)
- Project was very early stage (~1.1% C)
- werewolf.zip's prior work in the FRAY repository was being used as reference
- Not all work was transferred from FRAY to doldecomp/melee
- Missing: tons of sysdolphin, Player struct/functions, Character struct
- Source: werewolf.zip (2020-11-29)

##### Reference Projects
- melee-re (https://github.com/hosaka-corp/melee-re) - reverse engineering docs
- FRAY (https://github.com/PsiLupan/FRAY) - werewolf.zip's prior matching work
- GNT4 - has matching versions of some functions (like HSD_Randf/HSD_Randi) that differ slightly from Melee
- Source: werewolf.zip, ed_ (2020-11-19, 2020-11-29)

#### 2022-03 (source: 2022-03.md)

##### The Frank Patch Mystery
- Melee uses a patched version of mwcc (mwcc_233_163n) believed to be from a "CWUpdate.zip" hotfix.
- Known games using this patch: Pikmin 1, Melee, possibly Sonic Adventure 2.
- The patch affects epilogue scheduling.
- Archive.org link to patch notes: https://web.archive.org/web/20011121032509/http://www.metrowerks.com:80/games/gamecube/update/
- The actual CWUpdate.zip file has never been found despite extensive searching.
- Multiple former Metrowerks employees contacted, including MWRon, with no success.
- Source: revosucks, epochflame (2022-03-31)

##### Progress Milestones (March 2022)
- Started ~2.1% code
- After Marth: 2.49% code
- End of month: 3.38% code, 2.65% data
- Trophies: 7 -> 9 (of 290)
- Event Matches: 1 (of 51)

#### 2022-12 (source: 2022-12.md)

##### Progress Tracking

- The website showed incorrect progress (14.89%) due to tracking inlined ASM
- Actual progress was ~12.7% code, ~5.2% data
- Trophy/Event Match metaphor: Trophies = code progress, Events = data progress
- End of month: 40 of 293 Trophies, 2 of 51 Event Matches

##### Dolphin SDK Dates

- Melee's Dolphin SDK: Sep 2001
- Zoids VS: Dec 2001 (uses 1.2.5e)
- Prime: Sep 2002 (has some source changes)
- Some libs use 1.2.5e while others use vanilla 1.2.5

Source: rtburns (2022-12-17)

##### Killer7 Leak

Contains HSD structs and function/parameter names in DWARF debug info. Policy discussion ongoing about usage.

Source: altimor (2022-12-26)

#### 2025-01-to-04 (source: 2025-01-to-04.md)

##### Compiler Recovery
- Melee used CodeWarrior 1.2.5 with a Metrowerks hotfix for scheduler bug with epilogues
- Fix discovered via Wayback Machine documentation
- Ninji applied the fix to binary - marked one instruction as "volatile" in scheduler
- Before fix, Python script achieved ~95% same results
- Source: revosucks, cortex420 (2025-04-29)

##### Akaneia Stage
- Confirmed no Gr file exists for it
- Stage code has most asserts, all labeled
- No leftover hazard code found
- Source: werewolf.zip (2025-02-22)

### Historical Context

#### 2021-12 (source: 2021-12.md)

##### Progress at Month End
- Code: ~0.76% (29,588 / 3,882,272 bytes)
- Data: ~0.15% (1,840 / 1,211,849 bytes)
- Total DOL size: ~4MB code
- SDK/TRK/MSL probably account for ~800KB
- Source: werewolf.zip (2021-12-19)

##### Key Contributors
- werewolf.zip (psiLupan): Project lead, architecture knowledge, struct information
- revosucks (Revo): Toolchain, build system, pushing for matching decomps
- camthesaxman: Compiler behavior expertise, SMB decomp crossover
- epochflame: Pikmin decomp, Frank epilogue patch, MSL/SDK experience
- kiwidev: HSD/baselib work
- fluentcoding: Progress website, MSL math functions

##### Undefined Behavior Discoveries
- Some Melee behaviors may be caused by undefined behavior in the original code
- Example: V-canceling took years to discover
- TExp (TEV wrapper) has documented UB that doesn't affect display
- GXColor Alpha sometimes unset - UB but harmless due to Tev settings
- Similar to SM64 where "firsties" work due to UB (supposed to be 3 frames, is 1)
- Source: werewolf.zip, revosucks (2021-12-26)

#### 2023-03 (source: 2023-03.md)

##### Dantarion's Naming
- Called 0x2D4 attributes "Article Floating Points" based on Brawl structure
- Historical reference: https://web.archive.org/web/20200210183610/http://opensa.dantarion.com/wiki/Article_Floating_Points_(Melee)
- "Special" naming came from how Brawl was organized
- Source: werewolf.zip (2023-03-20)

##### Menu Music RNG
- Alternate menu theme: 1/4 chance (feels like 1/50)
- Paused game music: 20% of normal volume
- Source: vetroidmania, drl (2023-03-20, 2023-03-23)

## Community and Resources

### Community Notes

#### 2025-01-to-04 (source: 2025-01-to-04.md)

##### Learning Decomp
- No strict prerequisites - determination most important factor
- Pattern recognition more valuable than formal CS background
- M2C/decomp.me dramatically lowers barrier to entry
- Simple functions in `it/items` are good starting points
- Multiple contributors started with zero programming experience
- Source: ribbanya, werewolf.zip, encounter, vimescarrot (2025-01-29-30)

##### Recommended Learning Projects
- CHIP-8 emulator (simple, teaches CPU instruction basics)
- Flappy Bird clone
- Simple game with raylib
- "Ray Tracing in One Weekend" tutorial
- Source: encounter, mrkol, robojumper (2025-01-30)

##### Decomp Guide
- Available at https://wiki.decomp.dev/en/resources/decomp-intro
- Melee-specific intro at https://wiki.decomp.dev/en/resources/decomp-intro-melee
- Source: foxcam (2025-04-30)

### Community Resources

#### 2024-08-to-12 (source: 2024-08-to-12.md)

##### Documentation Sites
- Progress: https://decomp.dev/doldecomp/melee
- Doxygen: https://doldecomp.github.io/melee/index.html
- Getting Started: https://doldecomp.github.io/melee/getting_started.html
- Wiki Intro: https://github.com/doldecomp/melee/wiki/Decomp-Intro
- Decomp Glossary: https://wiki.decomp.dev/en/resources/decomp-glossary
- DAT attribute dumps: http://melee.theshoemaker.de/?dir=dat-dumps
- Source: foxcam, ribbanya (2024-10-04, 2024-11-08)

##### Ghidra Database
- Available via Discord link (1056368962373435484)
- Source: altafen (2024-11-21)

##### PowerPC Reference
- ELF spec with register usage: http://refspecs.linux-foundation.org/elf/elfspec_ppc.pdf (page 3-14)
- Registers >r13 are saved/restored per function; r1, r2, r13 have special purposes
- Source: foxcam (2024-09-25)

### Key Contributors This Month

#### 2021-11 (source: 2021-11.md)

- **werewolf.zip (psiLupan)**: Led shiftability effort, postprocessor fixes, struct documentation
- **epochflame**: Compiler research, prologue/epilogue analysis, cross-project tooling
- **revosucks**: Compiler version expertise, lbvector investigation
- **camthesaxman**: elf2dol fixes, TRK analysis, file splitting techniques
- **progenitor9339**: Jump table cleanup scripts
- **kiwidev**: elf2dol padding insights

### New Contributors Welcome

#### 2025-08 (source: 2025-08.md)

The Melee Decomp Dashboard tool (https://github.com/Bootstrings/decomp-dashboard) was introduced to help newcomers:
- Automates project setup and dependency installation
- Shows list of incomplete functions
- Integrates with decomp.me
- Windows only currently
- Source: bootstrings (2025-08-03)

Tips for new contributors:
- Start with ft/ (fighters) or it/ (items) - better understood than mn/ (menus)
- Use `tools/easy_funcs.py` to find small functions
- ASM files are in `build/GALE01/asm` after building
- Ask in Discord - the community is helpful

### Project Resources

#### 2025-09-to-2026-01 (source: 2025-09-to-2026-01.md)

##### HSD/Sysdolphin Sources
- Killer7 has debug ELF and release ELF with sysdolphin symbols
- Pokemon Channel (JP) has HSD and sysdolphin debug prints
- HAL licensed HSD to other companies (Killer7, Bloody Roar, etc.)
- Source: werewolf.zip, .cuyler (2025-09-02)

##### Naming Conventions (from asserts and patterns)
- Functions: `xxFileFunctionName` (prefix + file + name in CamelCase)
- Common file functions may not include file in name
- Structs: PascalCase
- Enum values: Mix of PascalCase and snake_case
- Defines: LOUD_SNAKE_CASE
- Source: troy._ (2025-09-19)

##### File Renames from un/
The `un` (unknown) directory has been cleaned up:
- `un_2FC91` -> `ifnametag` (name tag interface)
- `un_2FC92` -> `ifhazard` (hazard indicator for Onett/Big Blue)
- `IfCoGet` = Coin Get (coin display for coin matches)
- Source: werewolf.zip (2025-12-23)

---

### Cross-Project Insights

#### 2023-04-to-05 (source: 2023-04-to-05.md)

##### Smash 64 Subaction Events Pattern

Melee uses function pointers for "advance pointer 4 bytes at a time" convention while 64 uses one big switch statement:
https://decomp.me/scratch/A0gY4

Source: vetroidmania (2023-05-10)

##### Hitbox Differences

Smash 64 has interpolated cubes for hitboxes, Melee has interpolated spheres.

64 automatically ignores fighter hitbox vs item hitbox collision if you have a reflector up or the item can't be reflected. Melee doesn't do this, causing issues like Ness's bat destroying projectiles.

Source: vetroidmania (2023-05-08, 2023-05-20)

### Cross-Project References

#### 2023-02 (source: 2023-02.md)

##### Smash 64 Code Similarity
- Some Melee functions have recognizable equivalents in Smash 64
- Example: https://decomp.me/scratch/6sKb8 resembles Smash 64 code
- Melee equivalent identified at `0x80008688`
- Source: vetroidmania (2023-02-17)

### Cross-Project Resources

#### 2024-02 (source: 2024-02.md)

##### Dolphin SDK (dolsdk2001)
- r36 SDK (1.0-1.2.5 era) being decompiled by revosucks
- Has debug and DWARF available
- O0 version available
- https://github.com/doldecomp/dolsdk2001
- Very close to Melee's SDK version (Revision 47)
- Source: revosucks (2024-02-16)

##### Other Game Symbols
- Bloody Roar has same sysdolphin link order as Melee
- Killer7 has DWARF symbols (source of CObjDesc union info)
- Zoids games share symbols with Bloody Roar (both Eighting)
- Source: werewolf.zip (2024-02-01, 2024-02-05)

##### Altimor's Ghidra Database
- Contains some gmmain_lib function names
- IsTrophyUnlocked, IsFeatureUnlocked, etc.
- Source: altafen (2024-02-26)

### References

#### 2021-11 (source: 2021-11.md)

- Melee Symbol Spreadsheet: https://docs.google.com/spreadsheets/d/1JX2w-r2fuvWuNgGb6D3Cs4wHQKLFegZe2jhbBuIhCG8/edit#gid=20
- Metrowerks EPPC4 patch (archived): https://web.archive.org/web/20011121032509/http://www.metrowerks.com:80/games/gamecube/update/
- TP makerel.py: https://github.com/zeldaret/tp/blob/master/tools/makerel.py

### Resources

#### 2020-07 (source: 2020-07.md)

##### External References
- HAL Resource Tool: https://archive.org/details/halresourcetool
- Melee community documentation spreadsheet (struct layouts)
- FRAY (non-matching decomp): https://github.com/PsiLupan/FRAY
- Linker map documentation: https://github.com/hosaka-corp/melee-re/blob/master/docs/LINKERMAP.md

##### Debug Symbol Sources
- Killer7 - Sysdolphin DWARF v1 symbols
- Zoids games - Some HSD symbols
- Bloody Roar: Primal Fury - Additional HSD coverage
- Interactive Multi-Game Demo Disk - TRK symbols

#### 2023-04-to-05 (source: 2023-04-to-05.md)

##### External References

- Melee Light collision code: https://github.com/schmooblidon/meleelight/blob/master/src/physics/environmentalCollision.js
- FRAY HSD implementation: https://github.com/PsiLupan/FRAY
- MMW Character Data: https://github.com/DRGN-DRC/Melee-Modding-Wizard/blob/main/bin/CharDataTranslations.json
- Dat format docs: https://smashboards.com/threads/melee-dat-format.292603/
- GX docs: https://github.com/ogamespec/dolwin-docs/blob/master/HW/GraphicsSystem/GX.md
- Peppi action state enums: https://github.com/hohav/peppi/blob/master/peppi/src/model/enums/action_state.rs
- Smash 64 decomp: https://github.com/VetriTheRetri/ssb-decomp

##### Useful Scratches

- Master Hand fightervars: https://decomp.me/scratch/zwmsx
- Subaction events (64): https://decomp.me/scratch/A0gY4
- SDI implementation: https://decomp.me/scratch/aVCqi
- Knockback code: https://decomp.me/scratch/92pzH

#### 2025-06 (source: 2025-06.md)

##### Documentation Links
- Getting started guide: https://doldecomp.github.io/melee/getting_started.html
- foxcam's guide (pinned): https://gist.github.com/thefoxcam/678c9fa9050651e5f8a3aeedb2cf87e0
- decomp wiki intro: https://wiki.decomp.dev/en/resources/decomp-intro
- State tables glossary: https://wiki.decomp.dev/en/resources/decomp-glossary#state-tables-for-items-and-stages
- cdecl.org - C declaration parser/explainer
- mwcc-debugger: https://github.com/cadmic/mwcc-debugger

##### AI Tools for Decompilation
- ChatGPT is trained on the existing codebase - useful for already-matched functions
- Gemini can annotate asm lines decently as a learning aid
- No good AI decompiler exists yet - would need training on compiler IR
- PowerPC instructions can be explained by asking about MIPS (similar enough)
- Source: werewolf.zip, allocsb, revosucks, ribbanya (2025-06-24)
