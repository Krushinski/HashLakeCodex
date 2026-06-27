# Phase 78 Current Zone Map

Date: 2026-06-27

`src/scene/lakeMap.ts` is the geometry law. This document is the current tactical map for cleanup and future art passes. It inherits the rules in `ZONE_TRUTH_CONTRACT.md`, `SCENE_ZONES.md`, and `BLENDER_ZONE_PREP.md`.

## Global Rules

- No hidden full-world land under the lake.
- No fake second lake, water-colored outer ring, transparent treeline reflection plane, mountain pane, fog banner, or horizontal pale band.
- Collision, minimap, ripple blocking, driveable water, tree placement, rock placement, reeds, island, and sandbar must agree with `lakeMap.ts`.
- Any future mountain, forest, or Blender experiment must name its target zone before rendering.

## Stupid Simple Zone Map

| Zone | Name | Plain-English Meaning |
| --- | --- | --- |
| 1 | Water / Lake | The driveable lake, wake, splashes, and water effects. |
| 2 | Shore / Wet Edge | The narrow damp transition where water meets land. |
| 3 | Raised Bank | The lifted grass/earth shelf around the lake. |
| 4 | Near / Mid Forest Shelf | Trees, rocks, bushes, and land detail near the lake. |
| 5 | Far Forest Wall | The darker forest mass that sits in front of mountains. |
| 6 | Mountain Backdrop / Back Arc | Grounded rear mountains only. Behind Zone 5 and outside the lake play area. |
| 7 | Sky / Clouds | Sky dome, clouds, sun/moon, storm atmosphere. |

Debug and Legend both expose the Zone 6 relationship. `V` is a safe compare tool: it can show only the native baseline or the grounded Zone 6 Mountain Experiment V2 after placement, grounding, occlusion, artifact, and camera checks pass.

## Zone 1 - Water / Lake

- Allowed geometry: one main shader water surface, boat, stern wake blocks, BTC splash/ripple particles, New Block rings, water/weather effects.
- Forbidden geometry: trees, rocks, sand/land cards, terrain patches, reflection strips, mountain/fog/forest panes, hidden lake-fill surfaces.
- Placement rule: visible water must match `LAKE_OUTLINE` and driveable water; island/sandbar blockers come from `LAKE_FEATURE_FOOTPRINTS`.
- Material/color rules: deep center blue/teal, smoother shallow water near shore/island/sandbar, no black under-land leakage.
- Known current issues: water is acceptable baseline but should not be altered in Phase 78.
- Next-pass opportunity: keep water stable while future mountains/forest improve reflected composition.

## Zone 2 - Shore / Wet Edge

- Allowed geometry: opaque wet edge, narrow sand/wet transition, reeds only in `isReedWetlandZone`, small wet rocks where validated.
- Forbidden geometry: gray triangle halos, detached island/sandbar rings, broad full-shore beach bands, conifer trees in wet edge, transparent shallow cards.
- Placement rule: follows expanded lake outline only; island/sandbar wet behavior must be owned by their coherent footprints.
- Material/color rules: muted damp sand/earth, darker wet edge, no water-colored land patches.
- Known current issues: previous phases repeatedly created gray tile/triangle leakage here.
- Next-pass opportunity: formalize generated edge meshes from one source polygon and avoid duplicate rings.

## Zone 3 - Raised Bank

- Allowed geometry: raised grass/earth shelf, shoreline rocks, bushes, future roots, dock/cove land attachments.
- Forbidden geometry: water overlays, sand halos, mountain bases, far-forest walls, hidden under-lake platforms.
- Placement rule: outside wet edge and visibly above the water plane; must stay connected to mainland or named island/sandbar feature.
- Material/color rules: shore grass near water, darker earth/green farther out, no flat gray filler.
- Known current issues: needs to stay clear and boring after cleanup.
- Next-pass opportunity: low-poly bank caps or shoreline assets can sit here if validated by `lakeMap.ts`.

## Zone 4 - Near / Mid Forest Shelf

- Allowed geometry: native instanced trees, rocks, bushes, understory masses, cabin/dock props only where destination zones allow.
- Forbidden geometry: trees in water, trees on island/sandbar unless hand-authored later, debug triangles, unvalidated asset clones.
- Placement rule: candidates must pass mainland forest/shore helpers and keep water clearance; dock/cove openings stay navigable.
- Material/color rules: varied but muted greens, richer forest floor inland, no neon patches or black crush.
- Known current issues: density and shape are baseline only after Phase 73 cleanup.
- Next-pass opportunity: rebuild scenic density zone-by-zone once the mountain backdrop is stable.

## Zone 5 - Far Forest Wall

- Allowed geometry: dense native instanced silhouette trees and canopy mass on validated far mainland forest shelf.
- Forbidden geometry: transparent reflection strips, billboard panes crossing water, unvalidated 80k instance experiments, forest walls in the lake.
- Placement rule: behind near/mid shelf and in front of mountains; must never overlap water or shoreline.
- Material/color rules: dark conifer mass, irregular skyline, reduced detail with distance.
- Known current issues: can look sparse or toy-like, but must stay real geometry.
- Next-pass opportunity: future forest massing can be rebuilt here after the mountain back-arc is safe.

## Zone 6 - Mountain Backdrop Ring / Back Arc

- Allowed geometry: distant terrain meshes inside `MOUNTAIN_BACK_ARC_ZONE` from `src/scene/mountainPlacementHarness.ts`, behind the far forest wall, with a visible foothill/base connection. Phase 78 adds a removable native V2 experiment built from a Zone 6a foothill anchor and Zone 6b ridgelines.
- Forbidden geometry: vertical glass panes, terrain walls, horizontal pale bands, snow slabs floating over trees, zeppelin/blob undersides, visible sky gaps under mountain bases, any mesh intersecting water/shore/bank/forest shelf.
- Placement rule: back-arc bounds are x `1520..2240`, z `-680..680`, y `0.75..315`, with mandatory side fadeouts and generated-vertex auditing. The back arc must remain beyond `LAKE_MAP.mapBounds.maxX + 620`, behind the visible far forest wall used by the main Drive and Helicopter views.
- Grounding rule: a valid experiment needs a foothill anchor, no floating gap, no long flat bottom silhouette, far-forest occlusion at the base, proven stage order, artifact-free checks, and camera proof from Helicopter/Drive/OJ views.
- Material/color rules: alpine rock/green/snow only on terrain surfaces; no flat single-pane material strips.
- Known current issues: Phase 66-73 experiments caused false second lake, glass-pane mountains, and banner strips. Phase 75 proved the seam fix but made the V experiment too wide. Phase 76 fixed horizontal containment but falsely marked a floating mountain blob as valid. Phase 77 made that impossible by failing closed.
- Next-pass opportunity: improve the V2 ridgeline art only if it continues to pass the full grounded validator.

## Zone 7 - Sky / Clouds

- Allowed geometry: sky dome, sun/moon disc, procedural cloud layers, weather fog/lightning in sky space.
- Forbidden geometry: cloud-shadow water darkening, slab/band planes masquerading as mountains, fixed cloud cards that intersect ridges.
- Placement rule: sky systems stay above/behind terrain and do not create geometry near the lake surface.
- Material/color rules: moody alpine sky, storm darkness overrides daylight, no BTC-driven global sky tint.
- Known current issues: sky is good enough for the cleanup baseline.
- Next-pass opportunity: later tune only after terrain/forest composition stops lying.

## Phase 78 Mountain Harness Summary

- Active visual modes: `Native Baseline` and `Mountain Experiment` when V2 validates.
- `V` behavior: toggles the isolated Zone 6 Mountain Experiment V2. Invalid experiments fall back to native baseline and report `Mountain experiment invalid - baseline active`.
- Validity: Debug reports bounds, active back arc, side fadeout, invalid vertices, foothill anchor, base seated, grounded yes/no, floating gap yes/no, bottom silhouette, forest occlusion, stage order, artifact check, camera check, lake overlap, second-lake risk, pane/banner risk, and invalid reason.
- WebGPU scenic: quarantined; not part of the active mode contract.
