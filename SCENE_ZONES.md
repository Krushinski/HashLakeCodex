# HashLake Codex Scene Zones

This file is an executable art-direction contract. Native procedural work should follow these zones now; future Blender work should only fill gaps named here. The scene must remain zero-cost, asset-light, fail-safe, and compatible with Drive Mode.

## Global Rules

- Preserve: Drive coordinate contract, hard-locked Drive camera, mobile controls, live zero-cost data, Debug, Legend, minimap, Bitcoin pill, whale splashes, New Block swell, stale fog, quality presets, GitHub Pages.
- Must not: add paid APIs, API keys, CoinGecko runtime calls, external assets, global weather changes from BTC amounts, debug strobe behavior, or required heavyweight visuals.
- Performance: prefer shader math, merged geometry, instancing, bounded pools, and quality preset gates. Performance mode must keep the lake playable and readable.
- Phase 55 zone truth reset: `src/scene/lakeMap.ts` is the shared geometry truth for the lake outline, shore expansion, island/sandbar footprints, collision, ripple blocking, and minimap validation. Do not reintroduce random terrain-patch ovals, translucent full-lake shallow cards, fake treeline reflection planes, hidden under-lake land disks, or flat mountain/banner curtain planes as stage-building shortcuts.

## Sky

- Current status: procedural sky dome, sun disc, cloud drift, Eastern time baseline, fog, lightning, storm/fire tint.
- Target: cinematic alpine sky, calm blue and heavenly when serene, ominous and storm-dark when stormIndex rises, apocalyptic black/red only at high stormIndex.
- Geometry directive: keep sky shader/native; do not use mesh clutter or external plates.
- Material/lighting directive: preserve sharp storm darkness curve. Serene should favor clear blue, soft horizon glow, readable captions.
- Motion directive: clouds and flashes stay slow/subtle except storm lightning.
- Native options: tune gradient, haze, sun/moon glow, cloud opacity, lightning timing.
- Future Blender options: none unless a tiny optional horizon prop is justified.
- Must not: let daylight override stormIndex 60+, hide captions, or make BTC splashes tint the sky.
- Acceptance: at least one scenic camera shows generous sky and mountain mood; stormIndex 80+ clearly wins over daytime.

## Mountain Range

- Current status: procedural ridge rings plus painterly curtain silhouettes; sharper after Phase 24 but still native.
- Target: layered alpine silhouettes, sharper ridgelines, haze separation, tasteful snow/light caps, no rounded green blob hills.
- Geometry directive: use broad merged ridges and curtain silhouettes. Favor jagged skyline over smooth mounds.
- Material directive: dark shaded faces, cool rock, subtle pale caps, haze between layers.
- Lighting directive: mountains should catch serene warmth but become silhouette-heavy in storms.
- Motion directive: static except weather haze/light changes.
- Native options: ridge profile tuning, darker silhouette curtains, haze density, reflection color support.
- Future Blender options: low-poly distant mountain GLB with 2-4 material bands and clean origin.
- Performance risk: low for merged geometry; high only if many separate peaks/textures appear.
- Must not: dominate foreground gameplay, hide lake outline, or add required large textures.
- Acceptance: horizon reads as cinematic mountain backdrop from Frame cameras.

## Background Forest

- Current status: far treeline mesh mass plus instanced conifer silhouettes and fake reflection strips.
- Target: dense dark conifer mass below mountains, irregular skyline, broad reflected influence in water.
- Geometry directive: primary read should be one continuous silhouette band; individual cones are secondary texture.
- Material directive: near-black green/teal mass, slightly stronger in Scenic, reduced in Performance.
- Lighting directive: silhouette remains readable under serene and storm palettes.
- Motion directive: far mass static; closer instances may sway lightly.
- Native options: merged silhouette band, instanced crowns, reflection strip tuning.
- Future Blender options: optional far treeline GLB strip with irregular skyline and very few materials.
- Performance risk: medium if individual trees proliferate; low for merged/instanced bands.
- Must not: become scattered toy cones or consume per-frame DOM/debug work.
- Acceptance: far shore reads as forest mass, and water shows a subtle dark reflected band.

## Rear Shore / Midground Forest

- Current status: procedural tree instances, cove sides, reeds, rocks, quality-gated update cadence.
- Target: believable cove edge, forested mass, rocky and sandy transitions, subtle wind.
- Geometry directive: cluster trees in pockets; keep Drive lanes and boundaries readable.
- Material directive: earthy greens, darker cove edge, muted rocks, reeds in pockets rather than everywhere.
- Lighting directive: preserve scenic depth; do not flatten into one green wall.
- Motion directive: wind shader only, no heavy animation.
- Native options: grouped tree density, cove silhouette darkening, reed clusters, rock accents.
- Future Blender options: small reusable cove/shoreline kit if native silhouettes hit a ceiling.
- Performance risk: medium due to instance counts; quality governor may reduce richness.
- Must not: block minimap logic, collide with invisible lake boundary, or clutter Drive view.
- Acceptance: midground frames the lake without distracting from boat and water.

## Foreground Land / Shoreline

- Current status: organic lake outline with sand, wet sand, grass transition, bank, rocks, reeds.
- Target: grounded transitions between grass, sand, rocks, reeds, dock, island, cove, and water.
- Geometry directive: shoreline must follow the organic lake shape; use strips and small instanced accents.
- Material directive: less sticker-like sandbar, wet edges, darker banks, natural blue-green shallows.
- Lighting directive: foreground should remain legible in serene and muted under storms.
- Motion directive: reeds sway; land is static.
- Native options: color harmonization, transition strips, rock/reed pockets, sandbar edge refinement.
- Future Blender options: small optional shoreline kit for rocks, reeds, shelves, dock pieces.
- Performance risk: low if strips/instances are reused.
- Must not: look like a circular/snowglobe edge or add labels in 3D scene.
- Acceptance: shoreline supports geography and scenic cameras without pulling attention from the lake.

## Water

- Current status: shader lake with blue depth, chop, reflection bands, wake, splash/fizzle, rings, stale fog interaction.
- Target: deep reflective center, calm beautiful blue when serene, painterly horizon band, visible wake/ripples/splashes.
- Geometry directive: keep procedural water grid; no full planar reflection unless Scenic-only and proven safe later.
- Material directive: deeper center blue, less flat cyan, smoother shallows, stronger reflected mountain/treeline band.
- Lighting directive: water should mirror sky mood but BTC splashes remain local neutral blue/white/teal.
- Motion directive: wind/chop from weather, motor wake from stern, whale ripples local, New Block pulse distinct.
- Native options: shader shimmer, reflection tuning, bounded particles/rings/voxel foam.
- Future Blender options: none for water; Blender should improve things water reflects.
- Performance risk: medium for particles; controlled by pools and qualityScale.
- Must not: let BTC amount affect stormIndex, fog, sky, grade, or global color.
- Acceptance: 3 BTC is subtle, 10/50 captions feel clear, 300 dramatic, 1000+ unmistakably huge but local.

## Hero Boat

- Current status: procedural motor skiff with clear bow/stern/motor, stern wake, saved tableau, Drive hard lock.
- Target: recognizable subject for scenic shots, stable drive feel, wake origin unmistakably at motor.
- Geometry directive: keep lightweight procedural hull until Blender phase; do not rework physics.
- Material directive: warm hull, bright bow marker, dark motor, foam blocks blue-white.
- Lighting directive: boat remains readable against water in Frame and Drive.
- Motion directive: bow always leads; steering only shapes path; wake follows actual heading/speed.
- Native options: minor material/proportion tuning, motor wake polish, scenic framing.
- Future Blender options: stylized low-poly boat/fisherman only after Drive remains stable.
- Performance risk: low.
- Must not: touch Drive physics/camera contract in art phases.
- Acceptance: scenic cameras frame current boat placement; Drive C remains separate and unchanged.

## Special Places

- Current status: dock, sandbar, cove, island/rocks, reed marsh, minimap labels, simple procedural geometry.
- Target: memorable navigation/composition anchors for background-worthy tableaus.
- Geometry directive: keep locations simple and readable; strengthen silhouettes and material transitions.
- Material directive: sandbar muted, island grounded, dock warm, rocks cool, reeds pocketed.
- Lighting directive: places should show in serene and become mood silhouettes in storm.
- Motion directive: only reeds/water/wake move.
- Native options: better sandbar edge, cove dark mass, dock connection, reed pockets, rock grouping.
- Future Blender options: modular dock/cabin/rock/reed pieces if small and optional.
- Performance risk: low to medium depending on object count.
- Must not: add 3D text labels or break lake boundary/minimap alignment.
- Acceptance: each place is navigable, visible on minimap, and useful for tableau composition.
