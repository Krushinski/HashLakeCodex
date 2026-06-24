# Water Shader Audit

Phase 50 audit after the Phase 49 storm-reactive blob fix.

## Visible And Meaningful

- Single water mesh: the active lake surface and the right place to keep future water work.
- Depth and shore masks: control deep basin, shallows, sandbar/island glow, and near-shore color.
- Normal maps: visible in Drive and scenic views; they carry most of the living surface texture.
- Fresnel/specular/glint terms: visible and important for the glossy lake read.
- Mid/fine/glass/thread ripples: visible as surface movement, especially at low and drive cameras.
- Boat contact and wake response: subtle but visible near the boat and helps wake blocks belong.
- BTC/New Block rings: separate effects remain readable over the shader.

## Subtle But Useful

- Horizon glass/far-band reflection: low-intensity mood cue; useful if kept soft.
- Shallow caustic term: helps sandbar/island zones but should remain restrained.
- Stale grayscale/fog influence: very light in water; most stale read comes from scene fog.
- Lightning flash: visible only during storm pulses and should remain brief.

## Hidden Or Low Value

- Shore vertex tint is now mixed lightly into the shader and is secondary to depth masks.
- Fire water tint is intentionally clamped after Phase 49; it should not drive global red water.
- Shoreline asset status exists but the shoreline GLB is not currently used.

## Risky Terms

- Coarse water coverage near land features can expose non-water geometry if any hidden under-lake surface exists.
- Storm/fire palette mixing can turn any exposed fallback surface into a red-black stain.
- Broad cloud-shadow or fake reflection overlays should not return; they can read as tiles/blobs.
- Any future full-world land/fill plane under the lake would re-open the Phase 49 failure mode.

## Current Rule

Keep one main shader water surface, no full hidden land disk under the lake, no fake reflection planes, and no cloud-shadow darkening on water.

## Phase 51 Follow-Up

The Phase 50 Blender sand alpha pair was removed from runtime and from the repository because it read as low-poly pasted geometry instead of natural shore treatment. The current sand/island treatment is back to the safer procedural geometry, with one bounded Poly Haven test texture: `coast_sand_01_diffuse_512.jpg`, a local 512px diffuse-only sand map used on sandbar/island materials with color fallback if it fails to load. There is no runtime external request for that texture.

Visible and useful after inspection:

- The single water shader mesh remains the only lake surface.
- The generated normal maps, Fresnel/specular terms, basin depth blend, shallow/sandbar masks, boat contact sheen, wake blocks, BTC rings, and New Block rings are the meaningful water systems.
- The deep/shallow mask is useful, but the perimeter shallow falloff was too wide; Phase 51 tightens it so deeper water occupies more of the lake center.
- Stale/fog and lightning remain subtle but useful scene-level cues.

Low-value or removed:

- Blender sand alpha GLBs are removed.
- The shoreline GLB remains a known fallback/status entry but is not loaded or visible.
- Old fake reflection/cloud-shadow planes remain intentionally absent.

Risky terms:

- Any future hidden under-lake land, wide dark cloud mask, or fake reflection plane can recreate the Phase 49 black-blob failure.
- Very broad shallow overlays can make the whole lake edge read as beach; keep sand concentrated at the island, sandbar, and a few selected pockets.
