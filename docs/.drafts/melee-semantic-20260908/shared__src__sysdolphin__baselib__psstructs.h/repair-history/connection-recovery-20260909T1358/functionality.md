# Shared psstructs header review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. All361 canonical lines and both rendered pages reviewed; zero parse errors/substitutions. No owned subjects, facts or outgoing links exist in the frozen baseline; zero queries are recorded in baseline-zero.json. No proposal is authorized or emitted.

## Shared data model

This header connects banked resource recipes (HSD_PSCmdList), runtime emitter state (HSD_Generator), runtime particle state (HSD_Particle), shared transforms (HSD_psAppSRT), and texture/form metadata. Generator constructors read command records; emission passes generator ownership to particle creation; particles inherit generator IDs/AppSRT and participate in its child accounting. AppSRT carries a generator backlink and usedCount, not exclusive ownership merely because gp is set.

Every field/enumerator declaration is preserved with exact line citations in coverage.json. Types below describe source contracts; offset and size comments are not fresh binary-layout proof. One-element tails texTable[1],formTable[1],cmdList[1] are declared arrays, not C flexible-array syntax and not proof of a single runtime element.

| Declaration | Interpretation | Evidence |
|---|---|---|
| HSD_ParticleKind | Partial named kind-bit inventory: simulation and rendering flags share u32 kind; unlisted bits used elsewhere remain unnamed. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L16-L33) |
| HSD_PSTexGroup | Texture/palette metadata and one-element trailing pointer-table declaration; num governs resource content, not a checked bound in the type. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L36-L49) |
| HSD_PSFormGroup | Form count and one-element trailing pointer-table declaration; serialized tail length is not sizeof. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L52-L55) |
| HSD_PSCmdList | Banked generator/particle recipe: type and texture group, generator/particle lifetimes, kind, physical fields, three shape parameters, inline one-byte command-stream tail. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L58-L84) |
| PS_AppStatus | Named statuses1/2 only. Generator construction passes0, so this is not an exhaustive input-domain proof. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L86-L89) |
| HSD_psAppSRT | Shared application transform with linked-list and generator-owner pointers, translate/rot/scale, frame/status/use tracking, matrix/scalars, free hook and ID. x6C through x98 and xA2 meanings remain incomplete. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L91-L126) |
| HSD_Particle | Runtime particle: list and kind/resource selectors, command interpreter cursors, lifetime/physical state, animated current/target/count/remaining attributes, generator/AppSRT associations, userdata and callback. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L129-L188) |
| HSD_PSUserFunc | Three int-returning function-pointer slots: create/delete take HSD_Particle*, data hook additionally takes u8/float. Distinct from per-particle/per-generator callbacks and global constructor hook. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L191-L196) |
| auxDisc | Two azimuth bounds. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L198-L201) |
| auxLine | Three-component emission offset; also overlaid by tornado speed use. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L203-L207) |
| auxTornado | One float velocity/speed slot; constructor shape2 leaves zeroed aux until emitter stores speed. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L209-L211) |
| auxRect | Three dimensions, nine basis components, u16 face-selection flag. Signs encode face mode; raw dimension fields remain signed. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L213-L227) |
| auxCone | Two azimuth bounds and height; third float aliases sphere latRange. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L229-L233) |
| auxSphere | Speed plus angular center/range fields. Generator emitter reads only speed/latRange through alternate union members; names do not prove all fields affect emission. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L235-L241) |
| HSD_Generator | Runtime emitter with active-list link, rate/count, optional joint, lifecycle/type/resource/ID fields, position/velocity/physics, children, AppSRT/userfunc/callback and shape-selected aux union. | [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L243-L277) |

## Fields and limits

Particle current values, target values, counts and remaining counters are separate storage: color/size/rotation/alpha comparison/material/ambient animation must not be collapsed into one interpolation object without reading the interpreter. command pointers and cursor/mark/loop offsets are similarly distinct. userdata is float*, while the callback is int(HSD_Particle*). Generator callback is int(HSD_Generator*); userfunc points to the three-hook HSD_PSUserFunc table. No declaration establishes whether callback returns are tested.

AppSRT rot is declared Quaternion, but that name does not prove quaternion operations; generator/effect code uses selected components and initialization. status enum names1/2 but constructors pass0. x6C through x98 remain opaque f32 slots; xA2 is an opaque u8 with known stores0/1, not enough to assign a full semantic name. ssx/ssy and mmtx are named storage but need renderer/update consumers for precise meaning. usedCount is u16; generator retirement tests !=1, not >1.

Generator type low nibble chooses aux interpretation; kind is a distinctu32 flag word. auxSphere speed aliases auxRect.x/auxLine.x2/auxTornado.vel; latRange aliases auxCone.height. The full generator review confirms sphere emission reads speed/latRange through those alternate members and does not consume its stored angular centers/lonRange. Named sphere fields therefore cannot alone justify a spherical-range algorithm description.

## Declaration boundary

The header contains no function bodies. Static inline declarations at291–310 and358 are only prototypes, so they do not implement rendering or removal. PS_TEXDIRECTION and PS_APPSRT are defined here before their guarded declarations; _NFUNCPROTO only gates the two fog prototypes. Extern texc[4][4] and td define neither storage nor value. HSD_Fog is forward-declared. Include dependencies provide GX/matrix/JObj/archive/platform and forward aliases.

All function signatures are inventoried in coverage.json, including every parameter and return type. A bounded baselib search found only these shared declarations for psGenerateParticle,psSetUserFunc,psRemoveBillboardCamera,psSetCallback,psInitParticle,psKillFamily,psSetFog,psRemoveFog; this does not prove implementations are absent under other names. In particular, canonical particle adapter hsd_80398F0C returns void and accepts gen before float arguments; its proposed name psGenerateParticle is not signature-equivalent to the legacy declaration here.

Rendered view leaves all text unchanged. Its callback symbol annotation points to an unrelated Donkey function even though the source occurrence is a parameter declaration; no actual function call or dependency is implied.

## Owner followups

Particle owner: keep legacy prototypes separate from attested adapters. AppSRT owner: resolve unknown fields and actual rotation/status conventions from consumers. Effect-library owner: review void callback vector versus int-return hook types. Generator owner: union and queue corrections already drafted in its librarian packet. Coordinator: renderer callback annotation is identity noise. Exact routes and citations are in followups.json.

No source/shared KB/compiled layout or matching checks were changed. Findings and coverage are mirrored to campaign unit and draft directories.
