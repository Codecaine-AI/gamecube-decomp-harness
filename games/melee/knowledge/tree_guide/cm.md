# cm — Camera

The match camera: tracking all fighters (each is a `CmSubject`), zooming and
panning inside per-stage `CameraBounds`, plus the pause camera and the
free-flying Camera Mode used for snapshots.

| File | What it is |
|------|------------|
| `camera.c` | The `Camera` singleton: subject list, transform state, mode callbacks (normal follow, pause orbit, fixed camera, demo/cutscene control). |
| `camera.static.h` | Static camera tuning data. |
| `cmsnap.c` | Snapshot support — freezing/saving the camera-mode photo (file side in `lb/lbsnap.c`, viewer in `mn/mnsnap.c`). |
| `types.h` | `Camera`, `CmSubject`, `CameraTransformState`, `CameraBounds`, mode callback tables. |

Neighbors: `gm/gmcamera.c`/`gmfixedcamera.c` pick modes, `db/dbcamera.c` is
the debug fly-cam, `vi/` drives the camera during cutscenes via `HSD_CObj`
animations.
