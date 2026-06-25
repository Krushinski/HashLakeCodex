# Phase 67 WebGPU / TSL Alpine Fog Feasibility

## Safety Baseline

- Starting branch: `phase67-webgpu-tsl-feasibility`
- Starting commit: `1dfecf21d3661189fbbd04487eeacf2abbdf0c1c`
- Starting marker: `Hashlake Phase 66`
- Three.js version: `0.185.0`
- Current production renderer: `THREE.WebGLRenderer`
- Current fallback behavior: normal boot remains the Phase 66 WebGL path with Performance/Balanced/Scenic quality governor behavior.
- Untracked local folders that must remain uncommitted: `references/`, `artifacts/`

## Rollback Plan

If the feasibility path causes instability, switch back to the protected Phase 66 checkpoint:

```powershell
git switch master
```

Or remove the Phase 67 branch after confirming no work is needed from it:

```powershell
git branch -D phase67-webgpu-tsl-feasibility
```

The Phase 67 code must stay gated so deleting the branch is not required for users to retain the WebGL fallback.

## Systems Not To Touch

- Drive Mode physics and camera lock
- Water shader and wake systems
- Boat mesh/passenger/speedometer
- BTC pill, Coinbase heartbeat, mempool.space feeds, Mempool Whale Watch
- Whale splashes, New Block effects, toasts
- Debug, Legend, minimap, mobile controls, loading screen
- GitHub Pages deployment
- Zero-cost data policy

## Official r185 Source Study

Studied local Three.js r185 files:

- `node_modules/three/examples/jsm/generators/TerrainGenerator.js`
- `node_modules/three/examples/jsm/generators/ForestGenerator.js`

Studied official example source:

- `examples/webgpu_custom_fog.html` from the Three.js `r185` tag

Studied official PR context:

- Three.js PR `#33873`, "Examples: Improve webgpu_custom_fog with terrain and forest generators."
- The PR was merged on 2026-06-24 and describes the target as a misty alpine valley with custom TSL height fog, a derivative-damped fractal terrain generator, and a one-draw-call instanced forest generator.

## What The r185 Example Does Architecturally

- Uses `THREE.WebGPURenderer`, not `WebGLRenderer`.
- Uses TSL/node materials from `three/webgpu` and `three/tsl`.
- Uses `scene.fogNode` for custom height fog that pools from a low `fogBase` to a `fogTop`, with animated `triNoise3D` wisps and distance haze.
- Uses `scene.backgroundNode` for a fog/sky gradient.
- Builds terrain with a baked heightfield, domain warp, derivative-damped fractal noise, thermal erosion, diamond triangulation, and altitude/slope material bands.
- Exposes `sampleHeight()` and `sampleSlope()` so the forest generator can place trees ecologically.
- Builds a single huge `InstancedMesh` forest with distance-thinned TSL culling and canopy material variation.

## What Can Be Ported Directly

- The terrain architecture: baked height grid, deterministic seed, domain warp, fake erosion, sampleHeight/sampleSlope.
- The forest placement idea: altitude band, slope limit, density mask, instanced drawing.
- The height-fog concept: pooled low fog plus distance haze and subtle animated/noisy top edge.
- The telemetry mindset: make renderer path, tree counts, fog mode, and fallback state visible.

## What Must Be Adapted For HashLake

- HashLake is lake-first, so the terrain must be a backdrop behind the lake, not a full valley floor replacing the world.
- Forest placement must respect lake/world zones and never invade water or the user-drive area.
- The existing WebGL water and ShaderMaterial systems must stay untouched.
- Fog must integrate with the existing moody sky/weather without creating translucent banner planes.
- The forest count must be practical for the current app, not a blind 500,000-tree demo.

## What Should Not Be Ported Yet

- A global swap from `WebGLRenderer` to `WebGPURenderer`.
- TSL conversion of existing water/post/weather materials.
- First-person example controls.
- Inspector UI.
- Huge shadow-map setup and 500,000 casting trees.
- PMREM/physical sky replacement of the existing HashLake sky.

## WebGPU Feasibility Judgment

Full WebGPU renderer integration is too invasive for this phase because HashLake's current water, post, weather, and effects stack relies on mature WebGL/ShaderMaterial behavior. Phase 67 should attempt only an isolated WebGPU renderer initialization probe behind an explicit flag while implementing the visible alpine terrain/forest/fog proof as a WebGL-compatible scenic backdrop.

## Fallback Strategy

- Default path: WebGL fallback.
- `?scenicExperimental=1`: existing Phase 66 WebGL scenic spike.
- `?webgpuScenic=1` or `localStorage["hashlake.webgpuScenic"] = "true"`: attempt WebGPU probe and enable the Phase 67 WebGL-compatible alpine backdrop.
- If WebGPU import/init fails, keep the visible WebGL scenic approximation and report the failure in Debug telemetry.
- No blank screen should occur from WebGPU failure.

## Phase 67 Implementation Result

- Added `src/scene/webgpuScenicBackdrop.ts`.
- Default boot remains WebGL fallback; the Phase 67 backdrop is lazy and reports `0` terrain/forest instances when not requested.
- `?webgpuScenic=1` activates the WebGL-compatible alpine backdrop and starts an isolated WebGPU renderer initialization probe.
- Local browser result: WebGPU was detected and the isolated probe initialized successfully.
- The app renderer was not swapped; live rendering remained `WebGLRenderer/WebGL2`.
- Visible hero slice:
  - Eroded/domain-warped background terrain proof.
  - Slope/altitude material bands for forest, meadow, rock/scree, and pale high ridges.
  - Ecologically masked instanced mountain-base forest.
  - Three horizontal pooled height-fog/aerial perspective layers.
- Extra render pass: no.
- External runtime assets/APIs: none.

## Measurements

- Build output:
  - Main JS: `813.91 kB` raw / `217.37 kB` gzip
  - Lazy WebGPU chunk: `567.94 kB` raw / `159.22 kB` gzip
  - CSS: `22.63 kB` raw / `5.61 kB` gzip
- Fallback local Debug telemetry:
  - Quality: `Balanced`
  - Frame time: `38.4 ms`
  - Approx FPS: `26`
  - Pixel ratio/render scale: `1.00` / `0.84`
  - Phase 67 terrain/forest: `0` / `0`
  - Fallback: `active`
- `?webgpuScenic=1` local Debug telemetry:
  - Quality: `Performance`
  - Frame time: `37.7 ms`
  - Approx FPS: `27`
  - Pixel ratio/render scale: `1.00` / `0.62`
  - WebGPU available: `yes`
  - WebGPU active for app renderer: `no`
  - WebGPU probe: `initialized`
  - Terrain vertices: `12545`
  - Forest instances: `18000`
  - Fog mode: `WebGL height fog approximation`
  - Fog layers: `3`

## Screenshot Artifacts

Captured under `artifacts/phase67-webgpu-tsl-feasibility/` and intentionally left untracked:

- `01-standard-fallback-webgl.png`
- `02-webgpu-scenic-flag-standard.png`
- `03-helicopter-truth-webgpu-scenic.png`
- `04-far-forest-mountain-base-crop.png`
- `05-debug-telemetry-webgpu-scenic.png`
- `06-drive-opens-webgpu-scenic.png`
- `07-debug-telemetry-fallback-webgl.png`

## Inspiration Comparison Notes

1. Before coding: `references/000_INSPIRATION.jpg` has a tall mountain wall, dense forest at the base, and haze that creates depth. Phase 66 had a reversible architecture but not enough atmosphere or ecological forest density.
2. After terrain proof: the new terrain is more alpine and larger-scale than the old rounded hills, but still lacks the inspiration image's rocky crag detail and true cliff-face complexity.
3. After forest proof: the far forest reads denser and more continuous, closer to the inspiration image's forest wall. It still needs better species/canopy variation before production use.
4. After fog proof: pooled height fog improves depth and separates forest from mountain base. It is closer to the r185 example, but still a WebGL approximation rather than TSL fogNode integration.
5. Helicopter Truth View: the scene gains a clearer mountain/forest/fog backdrop and is easier to judge as an alpine basin. The water/boat systems remained intact.
6. Before commit: the result is a meaningful architecture proof, not final beauty. It supports expanding the scenic path, but a full WebGPU/TSL renderer migration should remain isolated in a later phase.

## What Was Borrowed From The r185 Example

- Baked terrain heightfield concept.
- Domain warp and erosion-inspired ridge shaping.
- Altitude/slope material bands.
- `sampleHeight()` / `sampleSlope()` style placement contract.
- Ecological forest placement using altitude, slope, density, and distance from the lake.
- One/few-draw-call instancing mindset.
- Pooled height fog / aerial perspective direction.

## What Was Intentionally Not Ported

- Full `WebGPURenderer` replacement of the app renderer.
- TSL/node material conversion of HashLake water/effects.
- `scene.fogNode` / `scene.backgroundNode` production integration.
- `FirstPersonControls`, `Inspector`, PMREM sky pipeline, shadow-map-heavy setup.
- 500,000-tree stress target.

## Recommendation For Phase 68

Proceed with a dedicated scenic renderer path only if it stays optional and lazy. The best next step is not a full app renderer swap; it is a contained WebGPU/TSL prototype scene that renders only terrain/forest/fog to prove material compatibility and camera composition. In parallel, the WebGL approximation can be art-tuned, but it should remain behind `?webgpuScenic=1` until it is visibly better and cheaper.
