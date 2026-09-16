# Findings

Correct all three initialized-section inventories: format strings in .data, world-up Vec3 in .rodata, palette plus floats in .sdata2. Correct timer units/reset behavior, setup dropping a live display pointer, setup not reapplying stage preset, and camera entry restrictions versus ongoing movement. Preserve the follow-field inversion supported by the camera consumer.
