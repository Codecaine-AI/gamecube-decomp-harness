# Special-Purpose Register Reader

baselib_mfspr is a numeric selector for fixed Gekko/PowerPC register-read instructions. All 69 register cases are conditional on MWERKS_GEKKO. A build without that macro reports every selector as unsupported and returns zero. The owned header declares s32 baselib_mfspr(s32) and defines no types or inline helpers. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_397E.c#L5-L13, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_397E.c#L222-L228 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_397E.h#L1-L9.

## Complete Case Coverage

The function covers XER, LR, CTR, fault/status/address registers, decrementer and translation/recovery registers; four SPRG registers; the raw 0x118 selector, EAR and PVR; instruction and data BAT halves; GQR registers and selected control/DMA registers; user and supervisor performance-monitor groups; and HID, breakpoint, cache and thermal registers. register-cases.json records every exact selector and source instruction, rather than assigning additional names to unknown selectors. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_397E.c#L14-L109 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_397E.c#L110-L221.

Each recognized case assigns result through its fixed inline instruction, breaks from the switch and returns that s32 bit pattern. There is no dynamic instruction construction. Unsupported numbers reach OSReport with the format string and selector and return zero. Because valid registers may contain zero, the return alone does not distinguish failure from a zero register value. No architectural-fault recovery is implemented. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_397E.c#L9-L228.

The source comments leave selector 0x118 unnamed and document explicit SPR_HID2/SPR_USDA operands used for compiler compatibility. This review preserves those statements and does not claim to have verified alternative mnemonic encodings. The preserved current source is the evidence for instruction choice.

## Diagnostic Consumers

The debug console calls this helper with SPR metadata entries and formats the returned value. Its BAT inspection code requests 0x219 + 2*i and 0x218 + 2*i, then interprets individual bits. The inherited broad IBAT/DBAT-view wording is narrowed to the observed call pattern; the lookup function still contains both BAT instruction families. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L2150-L2204 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debugconsole_main.c#L2335-L2370. No debug-console or CPU-register-family type claim is promoted.

## Data and Render Limits

Existing objects identify one 50-byte null-terminated diagnostic format string in .data: unsupported no. of special purpose register (%d). The linked section has six final padding bytes, totaling 56. compiled-evidence.json records object hashes, bytes and symbols; the report hash matches the manifest. No compilation or matching ran.

All 229 C lines and nine header lines were read in canonical and rendered form. The C renderer reports 138 errors around inline assembly and marks function names parse_uncertain, but returns the entire text with no substitutions. Header rendering has no errors or substitutions. Both reach EOF. These parser errors remain explicit review exceptions; they do not erase the manually reviewed case inventory.

## TU Lead Verification

Complete canonical/rendered C1–229/H1–9 and all7slots reviewed. Conditional register cases, diagnostic zero fallback and absent architectural-fault recovery confirmed. All text read despite138 parser errors. [Lead receipt](lead-verification.json). Independent review pending.
