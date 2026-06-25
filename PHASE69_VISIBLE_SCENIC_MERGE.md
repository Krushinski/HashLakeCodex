# Phase 69 Visible Scenic Merge

## Safety Checkpoint

- Rollback tag: `v1-visible-scenic-premerge-phase68`
- Tagged commit: `00313430ebd066b9079488eb5c15e489baaaf25c`
- Tag was pushed before Phase 69 edits.

## What Changed

Phase 69 turns the Phase 68 scenic proof into a user-verifiable mode instead of a hidden URL-only experiment.

- Build/UI metadata now reports `Hashlake Phase 69` from the shared `BUILD_INFO` source.
- GitHub Actions passes the build SHA explicitly through `HASHLAKE_BUILD_SHA`.
- The scenic path still supports `?webgpuScenic=1`.
- Pressing `V` toggles the Phase 69 scenic backdrop and persists it with `localStorage["hashlake.webgpuScenic"]`.
- Debug includes `Scenic requested`, `Scenic active`, `Scenic terrain`, `Scenic forest`, and `Scenic fog`.
- The Debug panel action `Toggle Scenic` dispatches the same scenic toggle path.
- The older Phase 66 architecture spike metrics are renamed as `Legacy spike` so they do not contradict the active Phase 69 scenic layer.

## Visual Fixes

- Added a low mountain-foot/foothill skirt under the alpine ring so the mountain base overlaps the forest line instead of floating above it.
- Lowered and widened the scenic alpine ring into the lake backdrop so the active mode is visible within seconds.
- Kept the dense Phase 69 mountain-base forest and pooled height fog visible while active.
- Rebalanced native forest canopy mass transforms to avoid ultra-flat black pancake geometry reading as long triangular slivers.
- Left water, boat physics, Drive camera, BTC systems, minimap, speedometer, and event systems untouched.

## Why The User Previously Saw "No Changes"

The main live URL booted into fallback mode because the Phase 68 scenic path was gated behind `?webgpuScenic=1` or local storage. Debug therefore correctly showed `webgpu scenic: off - not requested`, `fallback: active`, and zero scenic terrain/forest/fog. In other words, the code existed, but the normal user path was still rendering the fallback world. Phase 69 fixes that by adding a visible app-level toggle and explicit requested/active/visible telemetry.

## Renderer / WebGPU Status

- Renderer path: `WebGLRenderer/WebGL2`
- WebGPU available locally: yes
- WebGPU active renderer: no
- WebGPU probe: initialized
- Scenic implementation: hybrid-gated, WebGPU-probed, WebGL-rendered scenic layer
- Extra render pass: no
- External assets: none
- Paid/runtime API/key changes: none

## Local Telemetry

- Fallback frame time: `38.3 ms`
- Fallback FPS: about `26 FPS`
- Scenic frame time: `42.3 ms` in the refreshed Debug proof, previously `38.8 ms`
- Scenic FPS: about `24-26 FPS`
- Pixel ratio: `1.00`
- Fallback render scale: `0.84`
- Scenic render scale after governor: `0.62`
- P69 terrain vertices: `40,705`
- P69 forest instances: `60,200`
- P69 fog mode: `WebGL pooled alpine height fog v2`

## Bundle Output

Latest local production build passed with:

- CSS: `dist/assets/index-DIoqr0cb.css`, 22.63 kB raw / 5.61 kB gzip
- Main JS: `dist/assets/index-BLaW6zMU.js`, 821.20 kB raw / 219.47 kB gzip
- Lazy WebGPU chunk: `dist/assets/three.webgpu-BoBT7PfJ.js`, 567.94 kB raw / 159.22 kB gzip

## Screenshots

Captured in `artifacts/phase69-visible-scenic-merge/`:

- `01-fallback-standard-view.png`
- `02-scenic-standard-view.png`
- `03-fallback-helicopter-truth.png`
- `04-scenic-helicopter-truth.png`
- `05-scenic-mountain-fog-crop.png`
- `06-scenic-forest-wall-crop.png`
- `07-debug-scenic-requested-active.png`
- `08-drive-opens-fallback.png`
- `09-drive-opens-scenic-enabled.png`

`artifacts/` remains untracked.

## Honest Read

The scenic path is now visibly different and worth keeping user-facing as an experimental scenic mode. The strongest improvement is the moody mountain/fog backdrop and the clear Debug truth path. It is still not final art: the alpine wall is more convincing than Phase 68 but still needs better natural layering, and the forest masses should continue evolving away from isolated dark blobs.

## Phase 70 Recommendation

Do not start another hidden renderer spike. Keep scenic user-facing and either:

1. merge the best scenic mountain/fog pieces into the default world once stable, or
2. run a dedicated scenic art pass that improves the mountain-foot forest blend, canopy shapes, and fog depth while preserving the toggle as rollback.

WebGPU/TSL remains worth studying, but it should not become the mainline renderer until the WebGL scenic layer itself is visually excellent.
