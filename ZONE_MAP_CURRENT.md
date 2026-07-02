# Phase 81 Current Zone Map

Date: 2026-06-27

`src/scene/lakeMap.ts` is the geometry law. This document is the current tactical map for cleanup and future art passes. It inherits the rules in `ZONE_TRUTH_CONTRACT.md`, `SCENE_ZONES.md`, and `BLENDER_ZONE_PREP.md`.

## Global Rules

- No hidden full-world land under the lake.
- No fake second lake, water-colored outer ring, transparent treeline reflection plane, mountain pane, fog banner, or horizontal pale band.
- Collision, minimap, ripple blocking, driveable water, tree placement, rock placement, reeds, island, and sandbar must agree with `lakeMap.ts`.
- Any future mountain, forest, or Blender experiment must name its target zone before rendering.

## Map Direction Convention

Use the minimap orientation for all compass references:

- North = top of minimap, primary mountain/backdrop side.
- South = bottom of minimap, foreground/sandbar/reeds side.
- East = right side of minimap, cove side.
- West = left side of minimap, dock/reeds side.

Going forward, issue reports may use compass plus zone number, such as:

- `Zone 5, north-east quadrant`
- `Zone 6, north back-arc`
- `Zone 2, south-west reeds pocket`
- `Zone 4, east cove approach`

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

Debug and Legend both expose the Zone 6 relationship. `V` is now a truth toggle: it switches between the native baseline mountains and a no-mountains / zone-proof view. A future experiment can enter the cycle only after it passes placement, grounding, occlusion, artifact, and camera proof gates.

Phase 121 keeps the single ordered zone table and treats the oldest cone/spike forest as placeholder art rather than final vegetation. Placement and zone ownership remain intact, but the rendering layer now pushes further into native asset-like vegetation: taller airy shoreline pines for Zones 2/3, climbing firs for the Zone 5 mountain-base transition, mature alpine fir specimens, mountain-base mixed spruce stands, tower spruces, low understory evergreen patches, and a reduced native alpha-pine silhouette layer so far texture reads less like scratchy proxy art. The ground ribbons also receive richer terrain texture and stronger 3D support: shore pocket dips, root-mat darkening, conifer duff, forest rise veins, root buttress ridges, specimen-root rises, forest climb rolls, meadow flecks, hummocks, and woodland shelves. The intent remains foreground, middle ground, background, mountain base, with stronger 3D terrain character instead of flat paper bands or toy-cone dominance.

Phase 122 treats the tree render layer as the active bottleneck rather than continuing to tune placeholder density. It adds lakefront alpine pines for Zones 2/3/4 and slope-grove spruces for the Zone 4/5 climb toward the mountain base, while demoting the old black wall, alpha silhouette, and oversized canopy-proxy contribution so those layers support the forest texture rather than becoming the main read. Foliage materials now hold a little more alpine-green response in moody lighting so the forest does not collapse into pure black. Ground ribbons gain additional contained relief for specimen tree pads, root hollows, slope ecology benches, and a mountain-base toe rise. All relief still fades to zero at band boundaries and all placement remains lake-map validated.

Phase 123 continues the vegetation-render reset. It treats the remaining cone/spike and forest-wall layers as support texture only, not the visual subject, and introduces two native asset-like families: alpine meadow spruces and alpine specimen conifers. These carry irregular crowns, lateral limbs, lighter foliage, and shoreline-to-midground placement so Zones 2/3/4 read more like planted alpine woodland instead of toy proxies. The old proxy/spire and oversized canopy layers are further reduced across quality presets so the forest read shifts toward individual alpine specimens, mixed meadow woodland, slope groves, and mountain-base support masses. Zones 3/4/5 also receive stronger contained root swells, mixed-forest toe rolls, specimen pads, and shallow drainage cuts so trees feel planted into three-dimensional terrain. The goal is closer to the inspiration structure: water, shoreline specimens, meadow/woodland transition, denser forest, mountain base.

Phase 124 is a focused native vegetation/material upgrade. It adds larger hero lake spruces for Zones 2/3/4 and broader foothill canopy pines for Zones 4/5 so the shoreline and mid-forest are carried by readable tree forms rather than toy-like repeated cones. The older proxy forest remains only as support texture. Terrain material colors are warmed toward the inspiration palette, and the owned ribbons get stronger contained relief: brighter banks, fuller meadow hummocks, root pads, woodland shelves, mixed-forest toe rolls, and drainage cuts. The intended read is now foreground-readable alpine trees, shaped land under the trees, denser forest beyond, and mountain base behind, while preserving the existing lake-map ownership and no-hidden-land rules.

## Zone 1 - Water / Lake

- Allowed geometry: one main shader water surface, boat, stern wake blocks, BTC splash/ripple particles, New Block rings, water/weather effects.
- Forbidden geometry: trees, rocks, sand/land cards, terrain patches, reflection strips, mountain/fog/forest panes, hidden lake-fill surfaces.
- Placement rule: visible water must match `LAKE_OUTLINE` and driveable water; island/sandbar blockers come from `LAKE_FEATURE_FOOTPRINTS`.
- Material/color rules: deep center blue/teal, smoother shallow water near shore/island/sandbar, no black under-land leakage.
- Known current issues: water is clipped to contained Zone 1 tiles; future visual water changes must not reintroduce a hidden full-world sheet.
- Next-pass opportunity: keep water stable while future mountains/forest improve reflected composition.

## Zone 2 - Shore / Wet Edge

- Visible ground owner: `createShoreline()` wet sand and bank-toe strips.
- Expected elevation: `0.055 -> 0.42`.
- Overlap: none for opaque ground; reeds and rocks may sit above the owned surface only where validated.
- Allowed geometry: opaque wet edge, narrow sand/wet transition, reeds only in `isReedWetlandZone`, small wet rocks where validated.
- Forbidden geometry: gray triangle halos, detached island/sandbar rings, broad full-shore beach bands, conifer trees in wet edge, transparent shallow cards.
- Placement rule: follows expanded lake outline only; island/sandbar wet behavior must be owned by their coherent footprints.
- Material/color rules: muted damp sand/earth, darker wet edge, no water-colored land patches.
- Known current issues: Phase 81 removes the cyan/blue-gray land leak by clipping water to Zone 1, owning wet-edge material in the band table, and auditing triangle winding.
- Next-pass opportunity: future shoreline detail can sit on this owner as props, not as new ground planes.

## Zone 3 - Raised Bank

- Visible ground owner: `createShoreline()` grass transition and raised bank strips.
- Expected elevation: `0.42 -> 1.68`.
- Overlap: none for opaque ground; shoreline rocks and future roots may sit above it.
- Allowed geometry: raised grass/earth shelf, shoreline rocks, bushes, future roots, dock/cove land attachments.
- Forbidden geometry: water overlays, sand halos, mountain bases, far-forest walls, hidden under-lake platforms.
- Placement rule: outside wet edge and visibly above the water plane; must stay connected to mainland or named island/sandbar feature.
- Material/color rules: shore grass near water, darker earth/green farther out, no flat gray filler.
- Known current issues: keep this band clear and boring; it is the lake container lip.
- Next-pass opportunity: low-poly bank caps or shoreline assets can sit here if validated by `lakeMap.ts`.

## Zone 4 - Near / Mid Forest Shelf

- Visible ground owner: `createShoreline()` forest shelf and mid forest shelf strips.
- Expected elevation: `1.68 -> 2.92`.
- Overlap: no second floor; `forestSystem` trees, rocks, canopy, and understory may sit on the owned surface.
- Allowed geometry: native instanced trees, rocks, bushes, understory masses, cabin/dock props only where destination zones allow.
- Forbidden geometry: trees in water, trees on island/sandbar unless hand-authored later, debug triangles, unvalidated asset clones.
- Placement rule: candidates must pass mainland forest/shore helpers and keep water clearance; dock/cove openings stay navigable.
- Material/color rules: varied but muted greens, richer forest floor inland, no neon patches or black crush.
- Known current issues: Phase 81 aligns the forest ground helper to the visible shelf elevations to avoid exposed seams.
- Next-pass opportunity: rebuild scenic density zone-by-zone once the mountain backdrop is stable.

## Zone 5 - Far Forest Wall

- Visible ground owner: `createShoreline()` outer land ring; forest mass is owned by `forestSystem`.
- Expected elevation: `2.92 -> 4.10+`, with validated tree/canopy instances allowed to climb higher into the mountain-base transition.
- Overlap: canopy/tree instances only; no opaque terrain overlay, reflection plane, or hidden scenic layer.
- Allowed geometry: dense native instanced silhouette trees and canopy mass on validated far mainland forest shelf.
- Forbidden geometry: transparent reflection strips, billboard panes crossing water, unvalidated 80k instance experiments, forest walls in the lake.
- Placement rule: behind near/mid shelf and in front of mountains; must never overlap water or shoreline.
- Material/color rules: dark conifer mass, irregular skyline, reduced detail with distance.
- Known current issues: can look sparse or toy-like, but must stay real geometry.
- Next-pass opportunity: future forest massing can be rebuilt here after the mountain back-arc is safe.

## Zone 6 - Mountain Backdrop / Back Arc

- Allowed geometry: distant rear-arc terrain behind the far forest wall, with side fadeouts and visible foothill/base connection. Baseline mountains are owned by `src/scene/terrainSystem.ts`; future experiments must fit `MOUNTAIN_BACK_ARC_ZONE` from `src/scene/mountainPlacementHarness.ts`.
- Forbidden geometry: vertical glass panes, terrain walls, horizontal pale bands, snow slabs floating over trees, zeppelin/blob undersides, visible sky gaps under mountain bases, any mesh intersecting water/shore/bank/forest shelf.
- Placement rule: back-arc bounds are x `1520..2240`, z `-680..680`, y `0.75..315`, with mandatory side fadeouts and generated-vertex auditing. The back arc must remain beyond `LAKE_MAP.mapBounds.maxX + 620`, behind the visible far forest wall used by the main Drive and Helicopter views.
- Grounding rule: a valid experiment needs a foothill anchor, no floating gap, no long flat bottom silhouette, far-forest occlusion at the base, proven stage order, artifact-free checks, and camera proof from Helicopter/Drive/OJ views.
- Material/color rules: alpine rock/green/snow only on terrain surfaces; no flat single-pane material strips.
- Known current issues: Phase 66-73 experiments caused false second lake, glass-pane mountains, and banner strips. Phase 75 proved the seam fix but made the V experiment too wide. Phase 76 fixed horizontal containment but falsely marked a floating mountain blob as valid. Phase 77/78 still left a floating experiment reachable through `V`, so Phase 79 disables it completely.
- Next-pass opportunity: build a small replacement experiment only after baseline/zone-proof ownership is stable and the proof angles show no floating objects.

## Zone 7 - Sky / Clouds

- Allowed geometry: sky dome, sun/moon disc, procedural cloud layers, weather fog/lightning in sky space.
- Forbidden geometry: cloud-shadow water darkening, slab/band planes masquerading as mountains, fixed cloud cards that intersect ridges.
- Placement rule: sky systems stay above/behind terrain and do not create geometry near the lake surface.
- Material/color rules: moody alpine sky, storm darkness overrides daylight, no BTC-driven global sky tint.
- Known current issues: sky is good enough for the cleanup baseline.
- Next-pass opportunity: later tune only after terrain/forest composition stops lying.

## Phase 80 Mountain Harness Summary

- Active visual modes: `Native Baseline` and `No Mountains / Zone Proof`.
- `V` behavior: toggles native mountains on/off for zone proof. Because Phase 80 has a ready but empty experiment slot, Debug and toasts report `Zone 6 experiment slot ready - no valid mountain art loaded.`
- Native owner: `src/scene/terrainSystem.ts` owns `Far HashLake ridge` and `Mid HashLake ridge`.
- Experiment owner: `src/scene/zone6MountainExperiment.ts` owns an empty, non-rendering experiment slot until a future experiment passes all gates. Debug separates `Experiment slot` from `Experiment art valid`.
- Validity: Debug reports mountain owner, native mountain visibility, experiment mountain visibility, zone proof state, slot readiness, bounds, active back arc, side fadeout, invalid vertices, foothill anchor, base seated, grounded yes/no, floating gap yes/no, bottom silhouette, forest occlusion, stage order, artifact check, camera check, lake overlap, second-lake risk, pane/banner risk, and invalid reason.
- WebGPU scenic: quarantined; not part of the active mode contract and never activated by `V`.

## Phase 125 Terrain / Tree Depth Note

- Purpose: move the existing valid Zone 2-5 land outward from flat painted ribbons toward readable alpine shore, meadow, woodland, and foothill depth without changing water ownership or mountain ownership.
- Runtime change: native tree render language adds larger shoreline larch/spruce specimens and mixed foothill groves so the shore and slopes read as 3D vegetation instead of a dotted toy-tree fence.
- Terrain change: Zone 3-5 internal relief and material tone are strengthened while the official zone boundaries stay unchanged.
- Guardrail: no new water surface, mountain experiment, hidden ground sheet, external asset, or selector/debug clutter was introduced.
