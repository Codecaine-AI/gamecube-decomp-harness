## Vi1202 cinematic scene

The module loads `Vi1202.dat/visual1202Scene`, `TyKoopaR.dat/ToyKoopaRModel_TopN_joint`, and `GmRgStnd.dat/standScene`, constructs lighting and an animated camera, then creates visual models, the Koopa trophy and its stand. The established Bowser/Giga Bowser defeat-outro mapping is retained with its baseline runtime provenance; C resource names alone do not prove the precise authored imagery.

`un_80321178` walks the null-terminated visual-model descriptor array. Each model receives animation data, a frame-zero request and immediate evaluation, and a priority-0x17 animation process. Each iteration passes the shared JObj destination to `lb_80011E24` with selection argument 2. Trophy and stand construction subsequently consume that runtime reference. It is not an archive-symbol destination. The module neither explicitly resets this reference before the loop nor tears it down locally; an empty model list therefore performs no new selection. Archive topology and externally managed destruction remain outside the demonstrated lifetime.

The three animation wrappers are identical locally, but their registration sites support the rendered stand, trophy and visual-model names. Delegated JObj evaluation tolerates a null root, evaluates parents before eligible descendants, skips instance-child recursion and invokes accumulated animation-end callbacks after traversal. Historical spellings remain hypotheses.

The trophy receives uniform scale 0.49. Stand-child setup negates trophy parameters 0, 1, 2 and 5 for translation and Y rotation, and uses `0.49 * (parameter4 * (1 / parameter3))` for scale. There is no local denominator guard. A null stand root produces a null child, but child setup is still called; this branch is not a demonstrated graceful construction-failure path.

`vi1202_RunFrame` evaluates camera animation before testing its AObj. Exact frame equality with 100 dispatches `(0xE, 0)` through `vi_8031C9B4`; independently, equality with the ending frame calls `lb_800145F4` and then `gm_801A4B60`. Both branches may execute together, and there is no local one-shot latch or threshold-crossing test. The callback requires a valid camera and AObj despite the camera evaluator's own null tolerance. The shared event wrapper suppresses forwarding when its selected value equals 4; that numeric case is not renamed here.

The parameterless scene-frame callback delegates to `vi_8031CAAC`, whose newly triggered Start check invokes two audio calls followed by the shared exit hooks. This is independent of natural camera completion; requesting exit does not establish synchronous resource teardown.

Both owned canonical and rendered files were reviewed completely. Their rendered role-based names fit canonical registration and construction behavior; no naming change is warranted. One module data-flow correction is proposed. Three compiled section/layout claims remain unresolved because no compiled artifacts were supplied.

Status: synthesized; independent review and live promotion pending.
