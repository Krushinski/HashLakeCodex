# Phase 83 Mountain System Ownership

Date: 2026-06-27

This document is the current contract for HashLake mountain rendering. It exists because multiple recent phases proved that coordinate-valid mountain meshes can still be visually invalid from the real Drive and `V` camera angles.

## Diagnosis Before Code Changes

- Native mountains are owned by `src/scene/terrainSystem.ts`.
- The native owner creates two meshes, `Far HashLake ridge` and `Mid HashLake ridge`, through `buildRidgeRing()`.
- Before Phase 79, those native meshes formed full 360-degree rings. The rear arc was strongest, but the east and west sides still retained too much height and crowded the lake ends.
- The V experiment was owned by `src/scene/zone6MountainExperiment.ts`.
- Before Phase 79, the experiment built real foothill and ridge geometry under `Zone6MountainExperimentV2 grounded foothill anchor`.
- When `V` was off, the native terrain rings rendered unless a scenic GLB asset hid them.
- When `V` was on and the experiment reported valid, the experiment rendered and native terrain was hidden.
- The Phase 78 experiment is visually invalid because it can appear as a floating, detached mountain object with a visible underside/skirt from the user proof angles.
- The Phase 82 experiment was also visually invalid. It stayed inside nominal bounds, but from the real `V`/Drive angle it read as a floating island/plate behind the forest.
- The Phase 82 native back-arc attempt was also visually invalid. It produced an oversized floating/pane-base read from the same gameplay angle.
- WebGPU scenic code and older scenic asset loaders are not valid mountain owners for Phase 83. They must not be activated by `V`.

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
- no floating/pane underside from Drive, Helicopter, or `V` proof angles
- no hidden under-lake land
- no second lake, pane, banner, floating island, or underside artifact

### Zone Proof Mode

No mountain owner renders.

This mode exists to prove what the lake, forest, shore, and sky look like with mountains completely suppressed. It must not secretly show experiments, scenic GLBs, WebGPU terrain, or fallback mountain planes.

### Experiment Mode

`zone6MountainExperiment` is the only allowed future experiment owner.

There is a ready Zone 6 experiment slot, but no valid experiment art is loaded. The slot must remain empty, non-rendering, non-updating, and the art must remain invalid in Debug.

For Phase 83 this rule is stricter: the experiment slot may be ready, but experiment art is not loaded, not valid, not visible, and not reachable from `V`.

A future experiment is allowed only if it passes the Zone 6 gates:

- geometry stays inside the rear/back-arc Zone 6 bounds
- base sits behind Zone 5 Far Forest Wall
- foothill/base is grounded, not floating
- side fadeouts are present
- no overlap with water, shore, raised bank, near forest, or far forest play space
- no visible underside, pane, banner strip, second lake, or glass plane
- proof screenshots from Helicopter, Drive, side-angle, east, west, and OJ/high views

## Camera-Based Invalidity Rules

A mountain is invalid even if its vertices are inside the Zone 6 coordinate bounds when any required proof camera shows:

- sky or empty space underneath the mountain
- a flat/pane underside
- an island-in-the-sky silhouette
- a glass banner or long thin strip
- a terrain wall that reads like a backdrop card rather than landform
- a second-lake or water-reflection artifact
- far forest incorrectly overlaid by mountain material
- mountain geometry visible in front of Zone 5 forest shelf
- failure from known `V`, Drive, Helicopter Truth, side, east, west, or OJ/high camera angles

Future mountain experiments require screenshot proof before Debug can ever report `Experiment art valid: yes`.

## V Truth Toggle

`V` is a diagnostic truth toggle, not an art toggle.

Current Phase 83 states:

1. Native Baseline Mountains
2. No Mountains / Zone Proof View

Because no valid experiment art exists, `V` must show: `Zone 6 experiment slot ready - no valid mountain art loaded.`

In Phase 83, `V` must not cycle to experiment mode even if a future code path accidentally marks the slot valid. Experiment mode stays disabled until a later phase explicitly re-enables it with visual proof.

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
