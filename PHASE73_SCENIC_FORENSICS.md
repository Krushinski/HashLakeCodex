# Phase 73 Scenic Forensics

## Pre-Edit Diagnosis

Artifact: false second lake / pale horizontal ring.
Visible symptom: pale blue-gray band appears outside the real lake behind the far forest, especially from Helicopter Truth View and Drive view.
Likely file/function: `src/scene/webgpuScenicBackdrop.ts`, `buildFoothillSkirtGeometry`, `buildValleyApronGeometry`, `buildHeightFogGeometry`, and the scenic material/fog palette.
Likely geometry/material: circular foothill skirt, wide valley apron sheet, height fog sheets, and transparent terrain material using fog/ambient colors that can read as water from shallow camera angles.
Remove, move, recolor, or disable: disable/remove the circular skirt, wide apron, and scenic fog planes from the active Scenic group; if any far-forest occluder remains, make it dark land/forest only.
Risk: disabling these layers reduces the intended alpine depth, but it removes the invalid water-like band class.

Artifact: glass-pane / banner mountain strips.
Visible symptom: several long flat layered mountain/foothill strips appear like stacked panes or pencil-length glass slabs along the side of the scene.
Likely file/function: `src/scene/webgpuScenicBackdrop.ts`, `buildPeakWallGeometry`, `buildValleyApronGeometry`, and `buildFarForestSilhouetteGeometry`.
Likely geometry/material: wide vertical peak-wall strips with visible side edges, valley apron sheet, and layered far-forest silhouette curtains.
Remove, move, recolor, or disable: remove active wide strip/pane terrain and replace with bounded fallback-safe hero mountain walls only if their side edges cannot be seen; otherwise keep Scenic forest-only.
Risk: mountains become less dramatic if strips are removed, but broken mountain banners are worse than fallback.

Artifact: scenic zone overlap.
Visible symptom: Scenic terrain/foothill/fog layers sit between forest and lake visually, creating a fake boundary and breaking the order of lake, shore, bank, forest, foothill, mountain, sky.
Likely file/function: `src/scene/webgpuScenicBackdrop.ts`, active group assembly in `build`.
Likely geometry/material: group-added foothill skirt, valley apron, forest base, forest silhouette, peak walls, and fog layers are all independent of `lakeMap` shore validation.
Remove, move, recolor, or disable: keep only scenic elements that sit visually behind the native shore/forest, and use native/fallback mountains as the spatial truth until a bounded mountain design is ready.
Risk: Scenic toggle may be less visually ambitious, so Debug must disclose that regression-prone terrain/fog is disabled.

Artifact: heavy Scenic with low visible value.
Visible symptom: Scenic load/capture is slow relative to the improvement, and the user-facing output still fails basic composition gates.
Likely file/function: `src/scene/webgpuScenicBackdrop.ts`, instanced scenic forest and wide procedural layers.
Likely geometry/material: 106k scenic forest instances plus several wide meshes and fog planes.
Remove, move, recolor, or disable: reduce Scenic to a lightweight, honest correction path: native scene plus a dark far forest reinforcement and no invalid scenic terrain/fog panes.
Risk: less experimental realism in Phase 73, but it preserves the working app and prepares a cleaner Phase 74 mountain rebuild.

## Initial Decision

Phase 73 should not try to hide the false second lake. It should remove the layer class that creates it. Scenic Mode can remain toggleable only if the bad terrain/fog/pane layers are disabled and Debug tells the truth.

## Correction Implemented

- Updated the build marker to `Hashlake Phase 73`.
- Closed the WebGPU/Scenic visual regression gate in `getWebGpuScenicGate`.
- `?webgpuScenic=1` and the `V` toggle now request Scenic, but the app intentionally stays in fallback while the broken terrain/fog/pane family is disabled.
- Native/fallback mountains remain visible because `terrainSystem.setScenicBackdropActive` now only hides them when a safe Scenic terrain layer is actually visible.
- The Scenic backdrop system keeps the old terrain/fog/pane builders behind `ENABLE_PHASE73_SCENIC_TERRAIN_AND_FOG = false`; none of those meshes are added to the active scene.
- Debug now shows:
  - `Scenic Mode: FALLBACK`
  - `Scenic requested: yes`
  - `Scenic active: no`
  - `Scenic terrain: no`
  - `Scenic forest: no`
  - `Scenic fog: no`
  - `Scenic visual gate: terrain/fog panes disabled`

## Cause Confirmed

False second lake cause: the active Phase 72 Scenic backdrop added wide horizontal/curtain-like terrain, foothill, forest-base, and fog layers behind the native forest while also hiding fallback mountains. From helicopter and drive angles, those low, pale, fog-tinted sheets read as a second water surface.

Glass-pane mountain cause: the active Phase 72 Scenic peak walls and apron were broad strip meshes with visible side/edge exposure. They looked like stacked flat banners instead of terrain when viewed from side-biased cameras.

Phase 73 does not claim those layers are fixed artistically. It quarantines them so they cannot render.

## Verification

- `npm.cmd run build` passed.
- Local smoke rendered immediately.
- Fallback view rendered.
- Scenic-requested view rendered using fallback without the broken Scenic geometry.
- Drive Mode opened.
- Debug opened and reported the visual gate truthfully.
- Extra render pass: no.
- External assets/API additions: none.
- Scenic active layer status: disabled by visual-regression gate; fallback remains active.

Measured during local debug screenshot:

- FPS: `25 fps`
- Frame time: `40.5 ms`
- Pixel ratio: `1.00`
- Render scale: `0.84`
- Scenic requested: `yes`
- Scenic active: `no`
- P73 terrain: `0`
- P73 forest: `0`
- P73 fog: `off`

Build output:

- JS app: `814.42 kB` raw / `218.03 kB` gzip
- Three WebGPU chunk: `567.94 kB` raw / `159.22 kB` gzip
- CSS: `22.63 kB` raw / `5.61 kB` gzip

## Screenshots

Captured in `artifacts/phase73-scenic-forensics/`:

- `00-before-fallback-helicopter-truth.png`
- `01-fallback-helicopter-truth-after.png`
- `02-scenic-requested-fallback-helicopter-truth-after.png`
- `03-proof-no-second-lake-after.png`
- `04-mountain-forest-boundary-crop-after.png`
- `05-drive-opens-after.png`
- `06-debug-scenic-truth-after.png`

Artifacts remain untracked.

## Next Recommendation

The next scenic mountain attempt should not revive the disabled wide sheet family. Build a bounded authored back-arc or Blender-assisted mountain card/mesh with explicit side fadeouts, then pass a visual gate before it is allowed to hide fallback mountains.
