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
