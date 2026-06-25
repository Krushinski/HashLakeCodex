# V1 Forest Shell Checkpoint

Checkpoint name: `v1-forest-shell-phase63`

Current phase: Hashlake Phase 63

Checkpoint commit: `afbe352 Phase 63 lush forest deepening and white sand premium push`

## Why This Checkpoint Matters

Phase 63 is the first native forest shell that feels directionally right from the Helicopter Truth View: denser far woods, cleaner premium sand, preserved water, stable Drive Mode, and intact live Bitcoin/event systems. This checkpoint is the rollback point before the Phase 64 forest cathedral push.

## What Works Well

- The water shader remains the visual hero and the Phase 49 black-blob fix is preserved.
- Island and sandbar tops read cleaner and more premium than earlier beige passes.
- Far forest density is meaningfully better than the scattered-prop baseline.
- Drive Mode, camera lock, OJ/Drive presets, speedometer, passenger, and wake systems remain stable.
- Debug, Legend, minimap, BTC pill, Mempool Whale Watch, whale splashes, block effects, stale fog, and loading screen remain intact.
- The app builds and deploys through GitHub Pages.

## Must Preserve

- No hidden under-lake land or fallback leakage.
- No fake treeline reflection planes.
- No cloud-shadow darkening that can create water blobs.
- No trees in water and no shoreline invasion.
- No external assets, paid APIs, API keys, CoinGecko runtime calls, Sketchfab, Poly Haven, Rodin, Hunyuan, Hyper3D, or Blender/MCP in native-only phases.
- No debug/selector clutter for art modes.
- The Phase 12/13 Drive coordinate contract and camera lock.
- `references/` and `artifacts/` remain untracked unless explicitly approved.

## Known Weaknesses

- Forest still needs more depth, canopy mass, and silhouette variety from the helicopter view.
- Far mountain-base forest can still read too sparse compared with the inspiration image.
- Procedural trees are native and lightweight, but still lack the fine organic detail of real assets.
- Stale/offline fog can wash out visual judgment in headless/local screenshots; use manual calm/live state for beauty checks.
- Frame/Drive FPS is acceptable but tight, so future density must use instancing and mass geometry.

## Rollback Instructions

To return to the Phase 63 forest shell baseline:

```bash
git fetch --tags
git checkout v1-forest-shell-phase63
```

To return `master` to this checkpoint intentionally:

```bash
git checkout master
git reset --hard v1-forest-shell-phase63
```

Only use the hard reset command when intentionally discarding later work.

## Systems Not To Casually Edit

- `src/scene/waterSystem.ts`
- `src/scene/lakeMap.ts`
- `src/scene/createScene.ts` shoreline, sandbar, island, camera, and Drive integration sections
- `src/scene/forestSystem.ts` zone validation and instanced tree placement
- `src/state/weatherEngine.ts`
- `src/state/liveBitcoinStore.ts`
- `src/scene/effects.ts`
- `src/ui/debugPanel.ts`
- `src/ui/legendPanel.ts`
- `DRIVE_CONTRACT.md`
- `ZERO_COST_DATA_SOURCES.md`
- `EFFECTS_CONTRACT.md`
- `WATER_SHADER_AUDIT.md`
- `SCENE_ZONES.md`
- `BLENDER_ZONE_PREP.md`
- `ZONE_TRUTH_CONTRACT.md`
