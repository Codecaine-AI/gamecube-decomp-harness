DEMOInit.h provides a guarded, declaration-only interface including dolphin/gx.h. It declares three external void-pointer buffer variables; initialization and reinitialization with a render-mode pointer; before-render, done-render, and swap entry points; typed TEV color-input and operation setters; a render-mode pointer getter; a u32 current-buffer getter; and a bypass-workaround entry point accepting unsigned long timeoutFrames. These declarations do not establish allocation, synchronization, buffer ownership or lifetime, or workaround implementation. In particular, the u32 getter return type alone does not establish whether its value is an address, index, or other encoding.

Canonical and rendered source agree throughout all 22 lines. The renderer reports zero substitutions and zero parse errors. Subject and link enumeration both returned empty, so there is no baseline knowledge to retain or correct and no supported naming change to propose.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/demo/DEMOInit.h#L1-L22.

Status: researched; no-change lead bypass; independent review and live promotion pending.
