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

The Phase 50 Blender sand alpha pair was removed from runtime and from the repository because it read as low-poly pasted geometry instead of natural shore treatment. Phase 51 tested one bounded Poly Haven diffuse texture, `coast_sand_01_diffuse_512.jpg`, as a local sand map with no runtime external request.

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

## Phase 52 Follow-Up

The Poly Haven sand diffuse is retained in the repository as an experiment, but it is disabled at runtime. Sandbar and island visuals are again clean procedural materials, with form handled by native mounded/ramped geometry rather than a texture swap.

Terrain integration changes:

- Shoreline/bank terrain now uses sloped strip geometry so the lake reads as recessed below wet edge, bank toe, forest bank, forest shelf, and midground forest shelf.
- Island and sandbar are raised landforms with dry mounds, wet sloped shoulders, submerged-sand fades, and restrained shallow halos.
- The broad outer land remains visible perimeter/away-from-water geometry only; no hidden under-lake disk or fake reflection/cloud-shadow plane was restored.
- Water remains one mesh, with deep/shallow zoning still driven by the lake mask and feature footprints.

## Phase 53 Follow-Up

The translucent forest-ready overlay rings were removed because they looked like gray debug terrain. Terrain visibility is now carried by darker native bank/shelf materials plus raised thicket and rocky-bank patches around dock, reeds, cove, and rear shore. Water is unchanged structurally: still one shader mesh, no hidden under-lake land disk, no cloud-shadow water darkening, and no fake reflection planes.

## Phase 54 Follow-Up

The light gray island/sandbar triangles came from transparent auxiliary feature meshes: submerged ellipse fills, turquoise shallow strips, and halo strips sitting just above the water surface. They were redundant because the main shader already computes island/sandbar shallow influence from `LAKE_FEATURE_FOOTPRINTS`. Phase 54 removed those overlay meshes and keeps island/sandbar underwater color in the single water shader.

Water and terrain changes:

- Island and sandbar now use opaque raised dry-sand cores plus opaque wet-sand ramps; no transparent triangle-fan or halo geometry remains around them.
- Shallow-to-deep feature blending now lives in `waterSystem.ts` through smoother sand/shallow/depth factors, reducing hard rings around the island and sandbar.
- The shared lake outline was smoothed from 6 to 8 subdivisions so visible shoreline, water validity, collision, and ripple blocking continue to agree.
- The raised bank, forest shelf, and mid-forest shelf were widened/lifted to strengthen the recessed container-lake read.
- The Phase 49 rule remains intact: one main water mesh, no hidden under-lake land disk, no fake reflection planes, and no cloud-shadow water darkening.
