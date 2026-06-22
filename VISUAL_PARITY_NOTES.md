# Visual Parity Notes

## HashLake3 Traits Targeted

- Low cinematic lake framing with more sky and horizon mood.
- Dark reflective water with treeline and mountain impression.
- Strong far-shore forest silhouette massing.
- Layered mountain depth with darker near ridges and hazier far ridges.
- Neutral local BTC splash effects that do not alter global weather.

## Current Codex Match

- Phase 22 adds a hard-locked Low Chase drive camera preset.
- Water uses shader bands, horizontal shimmer, mountain tone, and treeline reflection.
- Far woods use instanced silhouettes plus optional Scenic massing.
- Mountains use low-vertex rings and painterly curtain silhouettes.
- Debug separates Large Trade FX liveness from actual large-trade events.

## Still Different

- No true planar reflection pass.
- No imported boat, terrain, or tree assets.
- No bespoke art-directed skybox.
- No post-processing bloom/composer stack.

## Avoided For Performance

- Full reflection render targets in the default path.
- Large numbers of individual tree meshes.
- External texture or model assets.
- Paid, keyed, or metered data providers.

## Later Blender Targets

- Real boat mesh and material pass.
- Hand-authored shoreline/cove terrain.
- Art-directed mountain silhouettes.
- Hero trees, dock/cabin props, and lake markers.
