# SCENA Sandbox (VR) — v1

A purple-and-gold neon VR sandbox you build in right from the browser.
Static site: three.js + WebXR, no build step. Works on Meta Quest Browser (Enter VR),
desktop (WASD + mouse) and phones (touch).

- Spawn cubes, spheres, cylinders, cones, ramps and lights
- Select, grab, move, rotate, resize, recolor, duplicate, delete, undo
- Snap-to-grid, teleport in VR, wrist menu on the left controller
- Auto-saves to your browser; Save/Load plus JSON Export/Import
- `samples/scena-stage.json` is a starter build you can Import

three.js r170 is vendored in `vendor/three` (MIT, see its LICENSE).
