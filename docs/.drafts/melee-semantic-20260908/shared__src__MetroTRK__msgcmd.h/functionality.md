## MetroTRK message protocol definitions

`src/MetroTRK/msgcmd.h` is a declaration-only protocol header. It supplies typed pointer-dereference fetch macros, protocol version 1.10 and kernel version 0.4 constants, and command IDs for connection/control, memory/register access, execution control, replies, notifications and file operations. The fetch macros themselves perform no byte swapping or bounds/alignment validation. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/msgcmd.h#L1-L54)

CPU major/minor identifiers include deliberately imprecise PowerPC family codes; these declarations do not identify the running CPU. A 32-byte support-mask type represents 256 bits. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/msgcmd.h#L56-L165)

Memory request minimum lengths differ between the `DS_PROTOCOL == DS_PROTOCOL_RTOS` branch and its alternative: 16 versus 8. Register request minima similarly differ, 14 versus 6. Memory flags distinguish segmented, extended, protected and user-view access, with a separate address-space mask. `TRK_MSG_HEADER_LENGTH` aliases the data-space constant numerically to 0x40; its reply counterpart is 0x41. This alias does not establish a semantic relationship between header length and address-space selection. The maximum data portion is 0x800 and maximum message size is 0x880. Register options distinguish default, floating-point and two extended sets. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/msgcmd.h#L167-L226)

Step options distinguish into/over and count/range modes. Count/range request minima are 11/18 in the RTOS branch and 3/10 otherwise; the generic step minimum aliases the count minimum. The header alone does not establish which conditional branch is active in a particular build. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/msgcmd.h#L228-L244)

Predefined file handles are stdin/stdout/stderr (0/1/2); the comment explicitly permits additional handles returned by open-file commands. I/O outcomes distinguish success, error and EOF, separately from the reply-error namespace covering framing, unsupported commands/options, invalid ranges, execution state, breakpoints, OS/process/thread and security errors. These declarations do not establish handler implementations or handle lifetimes. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/msgcmd.h#L246-L292)

## Semantic assessment

Both canonical and rendered views were reviewed through line 295. The renderer reports no parse errors or substitutions; the existing source names fit their declarations. The frozen baseline contains no subjects, facts or links to retain or correct. No supported semantic correction or rename is proposed, and no compiled-layout or runtime-support claims are made.

Status: researched; no-change lead bypass; independent review and live promotion pending.
