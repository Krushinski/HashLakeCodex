# Blender Zone Prep

Phase 46 does not use Blender assets. This note defines the scene zones that are ready for future controlled Blender exploration and which systems should stay native/procedural.

## Water surface

- Current native state: one shader-driven lake mesh with procedural normal textures, storm/weather uniforms, land-aware rings, motor wake blocks, BTC splashes, and New Block pulse visibility.
- Current weaknesses: high-end reflection realism is still approximated; shader zoning must stay subtle to avoid dark slabs or fake-object artifacts.
- Topology readiness: water mask and feature holes are coherent enough for asset-adjacent shoreline work, but water itself should remain native.
- Future Blender role: none for water surface; Blender may provide shoreline rocks, docks, or reflected silhouettes only as real geometry above land.
- Keep native: water shader, weather mapping, ripples, wakes, splashes, rings, and all runtime motion.
- Risk: any transparent fake reflection strip can recreate the old UFO artifact; avoid large water-plane overlays.

## Main shoreline

- Current native state: smoothed polygon outline with raised bank, wet edge, shallow strip, and drive/collision boundaries derived from the same map.
- Current weaknesses: some full-perimeter silhouette sections still feel procedural and faceted at close angles.
- Topology readiness: ready for lightweight accent placement, but not for replacing collision.
- Future Blender role: modular low-poly shoreline shelves, rocky caps, and terrain transition pieces that sit above the existing outline.
- Keep native: collision, minimap, ripple blocking, drive boundaries, lake outline, and shoreline masks.
- Risk: imported shore pieces must not disagree with `lakeMap.ts` or visible boat collision will feel wrong.

## Sandy shoreline / beach ramps

- Current native state: pale sand and wet-edge feathers around the island/sandbar plus shallow shader zoning.
- Current weaknesses: needs handcrafted slope profiles and better micro-shape in future art passes.
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

- Current native state: native terrain bands, reeds, rocks, and shoreline materials.
- Current weaknesses: foreground close-ups can reveal repeated primitive shapes.
- Topology readiness: good for sparse accent kits, not full terrain replacement yet.
- Future Blender role: reusable reed beds, rock clusters, grass shelf pieces, and small wet-edge transitions.
- Keep native: broad land mass and collision.
- Risk: dense individual props can hurt mobile and low-end Drive Mode.

## Midground forest band

- Current native state: procedural forest massing and tree clusters support the lake silhouette.
- Current weaknesses: individual cones still read in places.
- Topology readiness: suitable for merged silhouette bands or low-poly cluster replacements.
- Future Blender role: grouped conifer silhouettes, forest edge strips, and layered tree masses.
- Keep native: weather sway and quality preset density gates.
- Risk: hundreds of separate tree meshes are too expensive; use merged/instanced geometry.

## Background forest band

- Current native state: distant forest impression without the removed fake water reflection planes.
- Current weaknesses: horizon forest lacks the density and realism of the inspiration image.
- Topology readiness: ready for distant silhouette-only assets.
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

- Current native state: procedural classic wooden speedboat with slimmer hull, sharper bow, chrome accents, windshield, motor, pilot, bow lift, and stern-origin voxel wake.
- Current weaknesses: still primitive-built; detailed planking and hull curvature are limited.
- Topology readiness: good reference for a future handcrafted low-poly boat, but current drive contract depends on orientation and stern wake.
- Future Blender role: optional single optimized hero boat model with clear bow/stern/motor and the same origin/heading convention.
- Keep native: drive physics, camera lock, wake emitter placement, speedometer, and tableau saves.
- Risk: imported boat must preserve forward vector, scale, waterline, and motor origin exactly.
