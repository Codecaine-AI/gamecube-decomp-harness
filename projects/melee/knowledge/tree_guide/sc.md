# sc — Scene Descriptors

Header-only micro-module: the structs that *describe* a renderable scene —
`SceneDesc` (models + camera + lights for a stage/menu/HUD layer),
`StaticModelDesc` (model with one/no animation), `DynamicModelDesc` (model
with animation sets). No `.c` files; consumers are `gm`, `mn`, and stage/menu
setup code that instantiate scenes from these descriptors.
