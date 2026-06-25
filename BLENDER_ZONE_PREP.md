# Blender Zone Prep

Phase 48 uses Blender only for a corrected three-tree alpha test. This note defines the scene zones that are ready for future controlled Blender exploration and which systems should stay native/procedural.

## Water surface

- Current native state: one shader-driven lake mesh with procedural normal textures, storm/weather uniforms, land-aware rings, motor wake blocks, BTC splashes, New Block pulse visibility, and Phase 54 shader-owned island/sandbar shallow zoning.
- Current weaknesses: high-end reflection realism is still approximated; shader zoning must stay subtle to avoid dark slabs or fake-object artifacts.
- Topology readiness: Phase 48 removed the stale hidden lake-fill/inverted-hole layer and tightened water tile sampling so island/sandbar/shore blockers no longer leave dark animated water fragments under land. Phase 54 removed transparent shallow overlay cards around island/sandbar so underwater color now comes from the single water shader.
- Future Blender role: none for water surface; Blender may provide shoreline rocks, docks, or reflected silhouettes only as real geometry above land.
- Keep native: water shader, weather mapping, ripples, wakes, splashes, rings, and all runtime motion.
- Risk: any transparent fake reflection strip can recreate the old UFO artifact; avoid large water-plane overlays.

## Main shoreline

- Current native state: Phase 55 renders clean opaque wet-edge, raised-bank, forest-shelf, mid-forest, and outer-land bands from the shared lake polygon only. Collision, minimap, ripple blocking, and visual shoreline all derive from `lakeMap.ts`.
- Current weaknesses: some full-perimeter silhouette sections still feel procedural and faceted at close angles, but random green mound ovals, gray shallow-card fields, visible filler terrain patches, island/sandbar wet rings, and vertical forest/mountain banner planes are removed.
- Topology readiness: ready for lightweight accent placement, but not for replacing collision. Future shore props should sit on the existing raised green/earth bands and must not rebuild hidden under-lake land, transparent shallow cards, detached island/sandbar rings, or disconnected patch ovals.
- Future Blender role: modular low-poly shoreline shelves, rocky caps, and terrain transition pieces that sit above the existing outline.
- Keep native: collision, minimap, ripple blocking, drive boundaries, lake outline, and shoreline masks.
- Risk: imported shore pieces must not disagree with `lakeMap.ts` or visible boat collision will feel wrong.

## Phase 56 asset zones

Use `ZONE_TRUTH_CONTRACT.md` before adding any Blender asset. The named ready zones are near shoreline grass, raised bank, forest shelf, far forest, mainland beach pocket, island, sandbar, cove, dock, reed wetland, rocky shoreline pockets, and mountain terrain. All tree and prop placement must pass `lakeMap.ts` water-clearance helpers before rendering.

## Sandy shoreline / beach ramps

- Current native state: pale raised sand cores and opaque wet-edge feathers around the island/sandbar plus single-shader shallow water zoning.
- Current weaknesses: needs better micro-shape and rock/reed accents in future art passes, but Phase 54 reduced the broad dry footprint and removed the old transparent halo geometry that produced light gray triangle artifacts.
- Topology readiness: feature footprints now align visible sand, blocker/collision, water validity, and shallow masks.
- Future Blender role: gentle beach ramps, shell/stone clusters, and organic sand shelves as reusable pieces.
- Keep native: broad sand fade, water zoning, and collision footprints.
- Risk: over-thick imported sand could look like a sticker unless it fades into shader shallows.

## Island

- Current native state: coherent island footprint with smaller white sand beach, opaque wet feather, shader-driven submerged shallows, rock shelf, rocks, and small pines.
- Current weaknesses: rock/tree detail remains toy-like and low density.
- Topology readiness: ready for a small grounded island kit once Blender begins.
- Future Blender role: low-poly island base, grounded rocks, roots, reed clumps, and an art-directed silhouette.
- Keep native: island blocker, minimap location, water/ripple exclusion, and drive collision.
- Risk: imported island must match the blocker ellipse or ripples and boat collision will expose mismatch.

## Sandbar

- Current native state: long pale sandbar with smaller raised dry core, opaque wet feather, shader-driven shallow footprint, and subtle sand variation.
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

- Current native state: native sloped terrain bands, reeds, rocks, shoreline materials, and darker raised terrain shelves/patches behind the wet/sand edge. Phase 54 widened and lifted the green/earth forest shelf for a clearer recessed-basin read.
- Current weaknesses: foreground close-ups can reveal repeated primitive shapes and the shelf still needs handcrafted vertical variation and asset dressing.
- Topology readiness: good for sparse accent kits, not full terrain replacement yet. The foreground shelf is now visibly ready for future shoreline trees, rocks, reeds, and small bank caps without crowding the lake edge.
- Future Blender role: reusable reed beds, rock clusters, grass shelf pieces, and small wet-edge transitions.
- Keep native: broad land mass and collision.
- Risk: dense individual props can hurt mobile and low-end Drive Mode.

## Midground forest band

- Current native state: Phase 57 replaces the single cone forest with a deterministic, zone-validated native tree library: tall narrow pine, short pine, medium conifer, layered conifer, broad evergreen cluster, distant silhouette tree, and young pine/sapling. Near, mid, far, cove, and dock bands are all sampled through `lakeMap.ts` helpers.
- Current weaknesses: procedural silhouettes are richer but still primitive-built; close foreground trees will eventually need better trunks, branch breakup, and ground dressing.
- Topology readiness: suitable for future merged tree masses only after the asset can prove the same water/beach/island/sandbar exclusions. Use the midground shelf for cove-side and rear-shore clusters.
- Future Blender role: grouped conifer silhouettes, forest edge strips, layered tree masses, and cove-side tree clusters that sit on validated mainland forest shelf geometry.
- Keep native: placement law, weather sway, quality preset density gates, Debug type counts, and fallback native forest.
- Risk: hundreds of separate tree meshes are too expensive; use merged/instanced geometry and never place assets by eye over the water.

## Background forest band

- Current native state: Phase 57 uses an instanced distant silhouette tree band plus broad evergreen clusters for a darker forest mass below the mountains. The old fake water reflection planes remain banned.
- Current weaknesses: horizon forest is denser and moodier, but still procedural and not yet a handcrafted alpine treeline.
- Topology readiness: ready for distant silhouette-only assets if they are real geometry above the shoreline and validated against the far mainland forest zone.
- Future Blender role: merged far treeline strips above shoreline, never transparent water reflection planes.
- Keep native: shader reflection mood and atmospheric haze.
- Risk: any water-level reflection strip can reintroduce the UFO artifact.

## Mountain range

- Current native state: procedural layered mountain silhouettes and moody sky integration.
- Current weaknesses: ridges can feel soft/rounded rather than alpine and craggy.
- Topology readiness: good candidate for future distant low-poly backdrop assets. Phase 57 generated `public/assets/models/hl-mountain-range-alpha-v1.glb` as a controlled local test, but the screenshot read as a pale sawtooth horizon band, so the asset remains disabled by default and native mountains stay active.
- Future Blender role: replace the Phase 57 alpha with layered ridgelines, sharper silhouettes, shaded faces, and tasteful light caps that beat the native fallback before enabling.
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

- Current native state: Phase 57 disables tree alpha usage by default and reports those assets as fallback-only. The visible forest is native procedural instanced geometry.
- Current weaknesses: the alpha tests are not a production forest path and should not return unless they beat the native shapes without ghosts, white remnants, scale errors, or water placement errors.
- Correction notes: old bad tiny/white ghost-test placements near `-351, -218` and `501, -218` are still forbidden. Any future alpha or Blender tree must use the same `lakeMap.ts` candidate validation as native trees.
- Topology readiness: foreground, midground, and semi-far shelves are ready for sparse asset experiments only after the Phase 57 tree bands are preserved as fallback.
- Future Blender role: replace or augment native type groups with merged/instanced tree clusters and forest edge strips, not individual clone spam.
- Keep native: quality gates, native forest fallback, wind sway system, far silhouette bands, Debug counts, and scene/collision boundaries.
- Risk: mass deploying GLB clones without instancing or merged meshes could hurt Drive Mode performance and resurrect ghost-tree cleanup loops.
