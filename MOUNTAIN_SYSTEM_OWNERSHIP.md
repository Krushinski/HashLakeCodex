# Phase 80 Mountain System Ownership

Date: 2026-06-27

This document is the current contract for HashLake mountain rendering. It exists because Phase 78 left two different mountain systems reachable through `V`: the native full ridge rings and a visually invalid Zone 6 experiment that could appear as a detached floating island.

## Diagnosis Before Code Changes

- Native mountains are owned by `src/scene/terrainSystem.ts`.
- The native owner creates two meshes, `Far HashLake ridge` and `Mid HashLake ridge`, through `buildRidgeRing()`.
- Before Phase 79, those native meshes formed full 360-degree rings. The rear arc was strongest, but the east and west sides still retained too much height and crowded the lake ends.
- The V experiment was owned by `src/scene/zone6MountainExperiment.ts`.
- Before Phase 79, the experiment built real foothill and ridge geometry under `Zone6MountainExperimentV2 grounded foothill anchor`.
- When `V` was off, the native terrain rings rendered unless a scenic GLB asset hid them.
- When `V` was on and the experiment reported valid, the experiment rendered and native terrain was hidden.
- The Phase 78 experiment is visually invalid because it can appear as a floating, detached mountain object with a visible underside/skirt from the user proof angles.
- WebGPU scenic code and older scenic asset loaders are not valid mountain owners for Phase 80. They must not be activated by `V`.

## Ownership Contract

### Baseline Mode

`terrainSystem` is the only active owner of baseline mountains.

It may render:

- `Far HashLake ridge`
- `Mid HashLake ridge`

It must obey:

- rear/back-arc dominance
- strong east/west side fadeout
- no high mountain wall crowding the side shorelines
- no hidden under-lake land
- no second lake, pane, banner, floating island, or underside artifact

### Zone Proof Mode

No mountain owner renders.

This mode exists to prove what the lake, forest, shore, and sky look like with mountains completely suppressed. It must not secretly show experiments, scenic GLBs, WebGPU terrain, or fallback mountain planes.

### Experiment Mode

`zone6MountainExperiment` is the only allowed future experiment owner.

For Phase 80 there is a ready Zone 6 experiment slot, but no valid experiment art is loaded. The slot must remain empty, non-rendering, non-updating, and the art must remain invalid in Debug.

A future experiment is allowed only if it passes the Zone 6 gates:

- geometry stays inside the rear/back-arc Zone 6 bounds
- base sits behind Zone 5 Far Forest Wall
- foothill/base is grounded, not floating
- side fadeouts are present
- no overlap with water, shore, raised bank, near forest, or far forest play space
- no visible underside, pane, banner strip, second lake, or glass plane
- proof screenshots from Helicopter, Drive, side-angle, east, west, and OJ/high views

## V Truth Toggle

`V` is a diagnostic truth toggle, not an art toggle.

Current Phase 80 states:

1. Native Baseline Mountains
2. No Mountains / Zone Proof View

Because no valid experiment art exists, `V` must show: `Zone 6 experiment slot ready - no valid mountain art loaded.`

If a future valid experiment exists, `V` may cycle:

1. Native Baseline Mountains
2. No Mountains / Zone Proof View
3. Valid Zone 6 Experiment

`V` must never activate:

- invalid mountain geometry
- WebGPU scenic experiments
- old scenic systems
- hidden fallback mountain layers

## Zone 6 Definition

Zone 6 is the rear/back-arc mountain backdrop only. It is not the full world perimeter.

Allowed:

- distant mountain terrain behind Zone 5
- low foothill connection at the base
- side fadeouts into low land, far forest, or sky

Forbidden:

- full mountain rings as visual walls
- high east/west mountain encroachment
- floating islands or visible undersides
- second lake artifacts
- glass panes or banner strips
- mountains intersecting water, shore, raised bank, or forest shelves
