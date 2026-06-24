# Blender Zone Prep

Phase 48 uses Blender only for a corrected three-tree alpha test. This note defines the scene zones that are ready for future controlled Blender exploration and which systems should stay native/procedural.

## Water surface

- Current native state: one shader-driven lake mesh with procedural normal textures, storm/weather uniforms, land-aware rings, motor wake blocks, BTC splashes, and New Block pulse visibility.
- Current weaknesses: high-end reflection realism is still approximated; shader zoning must stay subtle to avoid dark slabs or fake-object artifacts.
- Topology readiness: Phase 48 removed the stale hidden lake-fill/inverted-hole layer and tightened water tile sampling so island/sandbar/shore blockers no longer leave dark animated water fragments under land.
- Future Blender role: none for water surface; Blender may provide shoreline rocks, docks, or reflected silhouettes only as real geometry above land.
- Keep native: water shader, weather mapping, ripples, wakes, splashes, rings, and all runtime motion.
- Risk: any transparent fake reflection strip can recreate the old UFO artifact; avoid large water-plane overlays.

## Main shoreline

- Current native state: smoothed polygon outline with raised bank, wet edge, shallow strip, and drive/collision boundaries derived from the same map.
- Current weaknesses: some full-perimeter silhouette sections still feel procedural and faceted at close angles.
- Topology readiness: ready for lightweight accent placement, but not for replacing collision. Phase 48 changed shoreline expansion from radial-from-origin offsets to averaged shoreline-normal offsets so wet/shallow/land bands agree better with the actual coast.
- Future Blender role: modular low-poly shoreline shelves, rocky caps, and terrain transition pieces that sit above the existing outline.
- Keep native: collision, minimap, ripple blocking, drive boundaries, lake outline, and shoreline masks.
- Risk: imported shore pieces must not disagree with `lakeMap.ts` or visible boat collision will feel wrong.

## Sandy shoreline / beach ramps

- Current native state: pale sand and wet-edge feathers around the island/sandbar plus shallow shader zoning.
- Current weaknesses: needs better micro-shape and rock/reed accents in future art passes, but Phase 52 replaced flat sand disks with native mounded/ramped landforms.
- Topology readiness: feature footprints now align visible sand, blocker/collision, water validity, and shallow masks.
- Future Blender role: gentle beach ramps, shell/stone clusters, and organic sand shelves as reusable pieces.
- Keep native: broad sand fade, water zoning, and collision footprints.
- Risk: over-thick imported sand could look like a sticker unless it fades into shader shallows.

## Island

- Current native state: enlarged coherent island footprint with white sand beach, wet feather, submerged sand, rock shelf, rocks, and small pines.
- Current weaknesses: rock/tree detail remains toy-like and low density.
- Topology readiness: ready for a small grounded island kit once Blender begins.
- Future Blender role: low-poly island base, grounded rocks, roots, reed clumps, and an art-directed silhouette.
- Keep native: island blocker, minimap location, water/ripple exclusion, and drive collision.
- Risk: imported island must match the blocker ellipse or ripples and boat collision will expose mismatch.

## Sandbar

- Current native state: long pale sandbar with coherent blocker/dry/wet/shallow footprints and subtle sand variation.
- Current weaknesses: shape is still ellipse-derived, though less graphic than earlier ring/yolk versions.
- Topology readiness: ready for a Blender sandbar silhouette that follows the current footprint.
- Future Blender role: a low raised sand ridge with uneven edges and shallow wet shelves.
- Keep native: broad shallow fade and collision.
- Risk: if Blender adds a narrower sandbar than the blocker, missing water can appear as dark wedges.

## Cove / dock zone

- Current native state: procedural dock planks, small cabin, lantern, cove rock markers, and a navigable destination.
- Current weaknesses: dock and cove rocks are still simple primitives.
- Topology readiness: ready for isolated prop replacement.
- Future Blender role: better dock kit, shoreline supports, cabin silhouette, and cove rock arch.
- Keep native: destination logic, beacon/labels, drive boundaries, and lighting/weather response.
- Risk: prop count can rise quickly; combine objects and keep materials few.

## Foreground shore

- Current native state: native sloped terrain bands, reeds, rocks, shoreline materials, and raised foreground/mid/far tree-ready shelves behind the wet/sand edge.
- Current weaknesses: foreground close-ups can reveal repeated primitive shapes and the shelf still needs handcrafted vertical variation.
- Topology readiness: good for sparse accent kits, not full terrain replacement yet. The foreground shelf is intended for future shoreline trees and reeds without crowding the lake edge.
- Future Blender role: reusable reed beds, rock clusters, grass shelf pieces, and small wet-edge transitions.
- Keep native: broad land mass and collision.
- Risk: dense individual props can hurt mobile and low-end Drive Mode.

## Midground forest band

- Current native state: procedural forest massing, tree clusters, and a midground forest cluster shelf support the lake silhouette.
- Current weaknesses: individual cones still read in places and cluster placement is still generic around the whole outline.
- Topology readiness: suitable for merged silhouette bands or low-poly cluster replacements. Use the midground shelf for cove-side and rear-shore clusters.
- Future Blender role: grouped conifer silhouettes, forest edge strips, layered tree masses, and cove-side tree clusters.
- Keep native: weather sway and quality preset density gates.
- Risk: hundreds of separate tree meshes are too expensive; use merged/instanced geometry.

## Background forest band

- Current native state: distant forest impression without the removed fake water reflection planes, plus a semi-far staging shelf for future background forest silhouettes.
- Current weaknesses: horizon forest lacks the density and realism of the inspiration image.
- Topology readiness: ready for distant silhouette-only assets. Keep far assets above the shoreline and off the water plane.
- Future Blender role: merged far treeline strips above shoreline, never transparent water reflection planes.
- Keep native: shader reflection mood and atmospheric haze.
- Risk: any water-level reflection strip can reintroduce the UFO artifact.

## Mountain range

- Current native state: procedural layered mountain silhouettes and moody sky integration.
- Current weaknesses: ridges can feel soft/rounded rather than alpine and craggy.
- Topology readiness: good candidate for future distant low-poly backdrop assets.
- Future Blender role: layered ridgelines, sharper silhouettes, shaded faces, and tasteful light caps.
- Keep native: weather tinting, haze, storm-dark overrides, and performance quality gates.
- Risk: huge geometry or many materials can overwhelm the scene without much foreground benefit.

## Sky / cloud layer

- Current native state: shader sky dome plus wispy transparent procedural cloud banks.
- Current weaknesses: clouds are still stylized and cannot match photographic complexity.
- Topology readiness: not a Blender target for now.
- Future Blender role: none unless making fixed distant cloud cards, which should be treated cautiously.
- Keep native: sky shader, day/night, storm/fire tint, lightning, and cloud motion.
- Risk: cloud-driven water darkening and rectangular masks are explicitly banned.

## Hero boat

- Current native state: procedural classic wooden speedboat with slimmer hull, sharper bow, chrome accents, windshield, motor, forward-facing seated passenger, bow lift, and stern-origin voxel wake.
- Current weaknesses: still primitive-built; detailed planking and hull curvature are limited.
- Topology readiness: good reference for a future handcrafted low-poly boat, but current drive contract depends on orientation and stern wake.
- Future Blender role: optional single optimized hero boat model with clear bow/stern/motor and the same origin/heading convention.
- Keep native: drive physics, camera lock, wake emitter placement, speedometer, and tableau saves.
- Risk: imported boat must preserve forward vector, scale, waterline, and motor origin exactly.

## Tree alpha assets

- Current native state: three corrected Blender-generated low-poly tree alpha GLBs now exist in `public/assets/models/`: tall pine, short pine, and layered conifer.
- Current weaknesses: only six corrected sample placements are used in one dock/reed-side test cluster; this is deliberately not a forest replacement.
- Correction notes: Phase 48 regenerated the GLBs with attached trunks, dark materials, base origins, and a loader-side scale/material normalization plus cache-bust query. The bad tiny/white ghost-test placements near `-351, -218` and `501, -218` are not used.
- Topology readiness: the foreground, midground, and semi-far shelves are ready for sparse alpha placement, but the full forest still needs a placement plan.
- Future Blender role: expand from these alpha shapes into merged/instanced tree clusters and forest edge strips.
- Keep native: quality gates, fallback cone forest, wind sway system, far silhouette bands, and scene/collision boundaries.
- Risk: mass deploying GLB clones without instancing or merged meshes could hurt Drive Mode performance.
