# HashLake V1 Shell Checkpoint

Phase 57 marks the current clean-shell baseline before any broader Blender-assisted scenic work. The baseline commit entering this phase was `2ddb28a` (`Phase 56 geometry law baseline and zone orientation perfection`).

## What The Shell Preserves

- Vite, TypeScript, Three.js app shell with immediate render and no blank screen fallback.
- GitHub Pages deployment through `/HashLakeCodex/`.
- Zero-cost data policy: no API keys, no paid APIs, no CoinGecko runtime calls, no external asset downloads.
- Coinbase public websocket for price/market heartbeat where still used.
- mempool.space feeds for block/mempool and Mempool Whale Watch.
- Debug Mode, Legend Mode, minimap, bottom-left Bitcoin pill, event toasts, stale fog, loading screen, and feed timers.
- Drive Mode contract, hard-locked Drive camera, desktop/mobile controls, speed tiers, natural braking/reverse, speedometer, saved tableau, and Frame scenic cameras.
- White stern-origin motor wake blocks, BTC splashes, New Block effects, land-aware ripple arcs, and no global weather changes from BTC size.

## Geometry Law Baseline

`src/scene/lakeMap.ts` is the zone source of truth. Visible geometry, water validity, ripple blocking, boat collision, minimap, trees, reeds, rocks, and future Blender placements must agree with it.

Hard rules:

- No hidden full-world land under the lake.
- No transparent vertical mountain, forest, treeline, haze, or water-reflection planes.
- No fake treeline reflection planes or cloud-shadow water masks.
- No detached visible wet/shallow rings around island or sandbar.
- No object may render in water unless it is explicitly water, wake, reed/wetland, ripple, or splash behavior.
- Any feature footprint that blocks water must be covered by visible land with a small overlap.
- Island and sandbar visible landforms must cover their `LAKE_FEATURE_FOOTPRINTS.*.blocker` ellipses.
- Future Blender assets must name their target zone, keep clean scale/origin, load asynchronously, and fail back to native procedural geometry.

## Current Zone State

- Water: native shader lake, no Blender water, no extra render pass.
- Island/sandbar: visible sand landforms now cover their blocker footprints to prevent gray filler/teeth gaps.
- Shoreline: visible wet edge overlaps the water boundary slightly and rises into green/earth bank bands.
- Forest shelf: native raised green/earth bands outside the shoreline remain the placement base for trees and future assets.
- Mountains: native procedural fallback remains active unless a validated mountain alpha loads and is accepted.
- Tree alpha: corrected local test assets remain optional and placement-gated.

## Future Blender Gate

Only small, controlled GLB assets are allowed after this checkpoint. They must be local/procedural, low-poly, few-material, async-loaded, and optional. If a Blender asset looks worse than native fallback or violates zone truth, it stays disabled by default.
