This guarded Dolphin VI header includes scalar, VI, and GX structure types and supplies C linkage for C++ consumers (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/vi/vifuncs.h#L1-L10; code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/vi/vifuncs.h#L29-L33).

The public declarations cover pre/post retrace callback setters, initialization, retrace waiting, render-mode and pan configuration, flushing, next framebuffer and next right-framebuffer selection, black/3D controls, and unsigned retrace-count, field, line, TV-format, and DTV-status queries (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/vi/vifuncs.h#L12-L27).

The existing API names fit the declarations. Canonical and rendered pages were read completely; the renderer reports no substitutions or parse errors. This declaration-only evidence does not establish callback replacement semantics, framebuffer lifetimes, flush timing, numeric query-value meanings, or exceptional implementation branches. No compiled-layout conclusions are drawn. All subject and link pages were enumerated and are empty, so there is no baseline knowledge requiring disposition and no supported correction to propose.

Status: researched; no-change lead bypass; independent review and live promotion pending.
