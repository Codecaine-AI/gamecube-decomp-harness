# OilBall Factory Reconstruction Candidate

Not applied or compiled by the sub-agent.
This is an optional reconstruction from concrete caller assembly, not a symbol-forcing call or an empty placeholder.

`include/Enemy/BossEel.hpp:121` defines TOilBall as a TBEelTears subclass with no additional fields.
It declares `TOilBall(const char*)` but no body exists in tracked source.
All four overridden operations already exist at `src/Enemy/bosseel.cpp:613-666`.
The full original linker map has no TOilBall constructor symbol, consistent with complete inlining.

The original BossEnemy factory at 0x800fdd9c-0x800fdde4 has the complete construction sequence:

1. Compare the factory name against literal OilBall, `.sdata2 @3558`.
2. Allocate 0x170 bytes, the existing class footprint.
3. Call TBEelTears::TBEelTears with the string bytes 96 FB 83 5F 83 7D 00, CP932 for 油ダマ.
4. Replace the vtable pointers at offsets 0 and 0x20 with TOilBall's primary and secondary vtables.
5. Return the allocated object.

This corresponds directly to `return new TOilBall("油ダマ")` and an inline constructor delegating to TBEelTears without additional initialization.
The current commented factory branch inaccurately names TBEelTears rather than TOilBall.
The proposed constructor has an empty compound statement because all work is performed by the base constructor and compiler-generated derived vtable initialization.

Patch `round3-nameref-oilball.patch` changes only BossEel.hpp and the BossEnemy factory.
No changes to existing function bodies, no casts, allocation-size tricks, pragmas, new fake classes, or middleware changes.

Expected strict improvement is the missing weak TBEelTears destructor, since the inlined derived constructor now makes the base class definition participate in factory emission.
This remains a compiler hypothesis until tested.
Even if emitted, compare that destructor against original assembly and require no matching regressions in bosseel or any other header consumer.
The original missing initializer is handled by independent `round3-nameref-boss-sinit.patch`.
Adding BossEel.hpp may itself change static initializer emission, so test independently and inspect duplicate/redundant includes when integrating both.

Parent acceptance checks should include original factory branch allocation, constructor call, derived vtable stores, destructor match, unchanged existing matching code, strict inventory, and `ninja changes_all`.
