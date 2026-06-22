# HashLake Codex Scene Zones

This map defines which visual systems own each part of the scene, what the HashLake3/reference target suggests, and where native procedural work should stop before Blender assets are justified.

## Sky

- Current Codex status: procedural gradient dome, sun disc, storm/fire tint, fog and lightning flash influence.
- HashLake3/reference target: wide cinematic sky with calm blue daylight, mysterious glow, and storm-dark override that still feels painterly.
- Procedural/native options: stronger horizon glow, slower cloud drift, cleaner day/night tint curves, more restrained fire tint.
- Future Blender asset options: none for the sky itself; baked plates could be considered later but must remain optional.
- Performance risk: low if shader-only; medium if adding particle-heavy cloud layers.
- Dependencies: weather engine skyDark/fire/fog, Eastern time baseline, post grade.
- Acceptance criteria: sky reads serene and spacious at low stormIndex, stormIndex 80+ overrides daylight, captions remain visible.

## Mountain Range

- Current Codex status: layered procedural ridges and haze, still softer and more toy-like than target.
- HashLake3/reference target: sharper alpine silhouettes, layered ridgelines, haze separation, tasteful light caps.
- Procedural/native options: adjust ridge profiles, add darker silhouette bands, reduce rounded blob feeling.
- Future Blender asset options: low-poly distant mountain GLB with merged ridge layers and material bands.
- Performance risk: low for merged geometry, high only if many separate meshes/textures are introduced.
- Dependencies: horizon haze, sky color, water reflection band.
- Acceptance criteria: horizon reads as cinematic mountains, not rounded green hills.

## Background Forest

- Current Codex status: procedural far treeline/forest band plus scattered silhouettes.
- HashLake3/reference target: dense dark conifer mass below mountains, broad silhouette, subtle reflection influence.
- Procedural/native options: merged/instanced silhouette strips, fewer isolated toy trees, stronger dark massing.
- Future Blender asset options: far treeline GLB strip with irregular skyline and few materials.
- Performance risk: medium if individual trees proliferate; low for merged bands.
- Dependencies: mountain range, water reflection band, quality preset.
- Acceptance criteria: far shore reads as forest mass from the camera, not loose cones.

## Rear Shore / Midground Forest

- Current Codex status: procedural trees, cove sides, shoreline accents, performance-gated updates.
- HashLake3/reference target: believable cove edge with forested mass, rocky/sandy transitions, light breeze.
- Procedural/native options: clustered tree silhouettes, grouped reed pockets, darker cove edge, subtle wind animation.
- Future Blender asset options: reusable low-poly shoreline/cove accent kit.
- Performance risk: medium due to instance count and update cadence.
- Dependencies: lake outline, forest system, quality governor.
- Acceptance criteria: midground helps composition without crowding Drive Mode or minimap readability.

## Foreground Land / Shoreline

- Current Codex status: procedural grass/sand/rock/reed zones around the organic lake.
- HashLake3/reference target: grounded transitions between grass, sand, rocks, reeds, and dock/cove land.
- Procedural/native options: shape refinement, color harmonization, blocky accent rocks/reeds only where readable.
- Future Blender asset options: small shoreline kit for rocks, reed clumps, and edge shelves.
- Performance risk: low if merged; medium if many standalone meshes.
- Dependencies: lake map, minimap, Drive boundary, water shallows.
- Acceptance criteria: shoreline supports lake geography and does not look like sticker shapes.

## Water

- Current Codex status: shader water with chop, deeper blue tone, wake blocks, splashes, block rings, fake reflection support.
- HashLake3/reference target: deep reflective lake center, visible wake/ripples/splashes, calm beauty when serene.
- Procedural/native options: reflection shimmer, darker center, horizon band tuning, splash/fizzle polish.
- Future Blender asset options: none for the water surface; Blender may provide reflected scenic silhouettes indirectly.
- Performance risk: medium if planar reflection expands; low for shader/ring/particle improvements.
- Dependencies: weather dials, boat drive state, effects bus, quality preset.
- Acceptance criteria: water feels like the main canvas for Bitcoin events without changing global weather for BTC amount.

## Hero Boat

- Current Codex status: procedural boat with clear bow/stern, motor, hard-locked Drive camera, wake origin at stern.
- HashLake3/reference target: recognizable subject that anchors scenic shots and reacts to block beats.
- Procedural/native options: small hull/cabin/motor refinements, preserve Drive coordinate contract.
- Future Blender asset options: stylized low-poly boat/fisherman later, after Drive remains stable.
- Performance risk: low unless animated rigging or high-poly asset is added.
- Dependencies: Drive physics, saved tableau, wake system, block hop.
- Acceptance criteria: bow always leads, wake starts at motor, scenic cameras frame it as the subject.

## Special Places

- Current Codex status: dock, sandbar, cove, island/rocks, reed marsh represented by map markers and simple geometry.
- HashLake3/reference target: memorable scenic locations that help tableau composition and navigation.
- Procedural/native options: stronger cove silhouette, better sandbar shape, dock connection, reed pockets.
- Future Blender asset options: modular dock/cabin/rock/reed pieces, only if small and optional.
- Performance risk: low to medium depending on object count.
- Dependencies: lake map, minimap labels, Drive boundaries, scenic camera compositions.
- Acceptance criteria: each place is navigable, visible on minimap, and useful for a background-worthy tableau.
