# Phase 68 WebGPU Alpine Backdrop v2

## Implementation Note Before Coding

Phase 67 proved architecture but not enough visual delta. It added a lazy `?webgpuScenic=1` path, detected WebGPU, initialized a contained WebGPU probe, and rendered a WebGL-compatible terrain/forest/fog slice. The result was technically useful, but it did not separate itself strongly enough from the fallback view.

For Phase 68, the scenic flag must be visibly obvious. The specific escalations from the official Three.js r185 `webgpu_custom_fog` direction are:

- Make the scenic terrain replace the weak fallback ridge rings while active, rather than stacking behind them.
- Use a larger and taller eroded alpine heightfield with stronger ridgelines, ravines, and slope/altitude bands.
- Make the mountain-base forest read as a dense wall, using one/few instanced meshes rather than scattered props.
- Strengthen height fog/aerial perspective so it visibly pools between forest and mountain base.
- Add Debug proof for actual visible state: scenic active, scenic terrain visible, scenic forest visible, scenic fog visible.

What remains deferred:

- Full app migration to `WebGPURenderer`.
- TSL conversion of the existing water/effects stack.
- `scene.fogNode`/`scene.backgroundNode` production integration.
- The official 500,000-tree target and heavy shadow pipeline.

The Phase 68 rule is simple: telemetry is not enough. Baseline-off and scenic-on screenshots must show a clear mountain/forest/fog difference.

## Official r185 Reference Points Rechecked

- `examples/webgpu_custom_fog.html`: WebGPU renderer, TSL `fogNode`, low pooled fog band, distance haze, physical sky/IBL, `TerrainGenerator`, `ForestGenerator`.
- `TerrainGenerator.js`: derivative-damped fractal heightfield, domain warp, thermal erosion, diamond triangulation, altitude/slope material bands, aerial perspective.
- `ForestGenerator.js`: one-draw-call instanced forest, ecological rejection sampling by altitude/slope/density, distance culling, dark-base/bright-crown canopy material.

## Safety Constraints

- Normal boot must remain WebGL fallback.
- The Phase 68 scenic layer remains gated behind `?webgpuScenic=1` or `localStorage["hashlake.webgpuScenic"] = "true"`.
- `references/`, `artifacts/`, `dist/`, and `node_modules/` must remain uncommitted.
- No external runtime assets, paid APIs, API keys, CoinGecko, Sketchfab, Poly Haven, Rodin, Hunyuan, or Hyper3D.

## Implementation Result

Phase 68 keeps the production app on the existing WebGLRenderer/WebGL2 path and adds a more obvious optional scenic layer behind the established Phase 65/67 fallback scene. The `?webgpuScenic=1` gate now:

- suppresses the weaker fallback ridge rings while the scenic layer is active;
- adds a larger eroded alpine backdrop and a surrounding alpine ring so the layer is visible from the current lake cameras;
- adds a dense far forest wall with 52,000 spire instances and 8,200 canopy mass instances;
- adds five pooled height-fog bands between the forest and mountain base;
- reports Debug proof for scenic active, terrain visible, forest visible, and fog visible.

The scenic result is intentionally still a WebGL-compatible proof. WebGPU is detected and a contained WebGPU probe initializes, but the app renderer is not switched to `WebGPURenderer` in this phase. That keeps Drive Mode, water, BTC effects, HUD, and mobile controls on the known-stable path.

## Visual Outcome

The scenic flag now creates a visible difference versus fallback:

- Fallback: brighter rounded Phase 65/67 hill bands and lighter forest horizon.
- Scenic: darker alpine wall, denser mountain-base forest, more obvious low fog/aerial layer, and a clearer "experimental scenic layer is active" read.

This is an architecture spike, not final art. The alpine wall is deliberately obvious and will need art-direction tuning before becoming the default scenic look. It proves the layer can be made human-visible without touching Drive physics, water, or the main renderer.

## Telemetry

- Three.js: r185
- WebGPU detected: available
- WebGPU renderer used by app: no
- WebGPU probe: initialized
- Renderer path: WebGLRenderer/WebGL2
- Quality: Balanced
- Pixel ratio: 1.00
- Render scale: 0.84
- Extra render pass: no
- External assets: none
- Runtime network/API changes: none
- Scenic terrain vertices: 37,940
- Scenic forest instances: 60,200
- Scenic fog mode: WebGL pooled alpine height fog v2
- Native fallback trees: 4,731
- Fallback sampled frame time: 35.9 ms, about 28 FPS
- Scenic sampled frame time: 34.9 ms, about 29 FPS

## Bundle Output

Production build passed with:

- CSS: `dist/assets/index-DIoqr0cb.css`, 22.63 kB raw / 5.61 kB gzip
- Main JS: `dist/assets/index-DQ7w1_p1.js`, 819.13 kB raw / 218.85 kB gzip
- Lazy WebGPU chunk: `dist/assets/three.webgpu-CF0S3rUG.js`, 567.94 kB raw / 159.22 kB gzip

The WebGPU code remains lazy-loaded and does not enter the initial bundle.

## Screenshots Captured

Screenshots are in `artifacts/phase68-webgpu-alpine-v2/`:

- `01-baseline-fallback-standard.png`
- `02-scenic-standard-webgpu-flag.png`
- `03-baseline-helicopter-truth.png`
- `04-scenic-helicopter-truth-webgpu-flag.png`
- `05-scenic-far-forest-mountain-base-crop.png`
- `06-scenic-height-fog-crop.png`
- `07-debug-telemetry-scenic-active.png`
- `08-drive-opens-scenic-active.png`

`artifacts/` remains untracked by design.

## Preserved Systems

- Drive Mode opens with the scenic flag active.
- Drive camera lock remains unchanged.
- Water, boat, BTC pill, event effects, Debug, Legend, minimap, speedometer, loading screen, and deployment flow were not rewritten.
- The Phase 65/WebGL fallback remains available when `?webgpuScenic=1` is absent.

## Phase 69 Recommendation

Do not flip this on by default yet. The next step should be a focused "Scenic Art Direction Stabilization" pass:

- improve the alpine wall silhouette so it feels less like an obvious ring and more like layered real mountain geography;
- tune colors/material bands toward the inspiration photo;
- keep the dense far forest, but blend it better into terrain and fog;
- decide whether to continue WebGL-first scenic generation or reserve a dedicated Phase 69/70 for a true WebGPU/TSL renderer experiment.

The important result is that the optional path is now visible, measurable, and reversible.
