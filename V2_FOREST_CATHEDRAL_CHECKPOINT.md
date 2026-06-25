# V2 Forest Cathedral Checkpoint

Checkpoint name: `v2-forest-cathedral-phase64`

Phase: Hashlake Phase 64

Checkpoint commit: `2a6c59a Phase 64 forest cathedral checkpoint and lush canopy pass`

## What Works

- Phase 64 created the first convincing native forest cathedral direction.
- The scene keeps the Phase 49 black-blob fix and does not restore hidden under-lake land.
- The water shader remains stable and central.
- The lake basin, white sand, forest shelf, mountain backdrop, wooden boat, speedometer, Drive Mode, Debug, Legend, minimap, BTC pill, Mempool Whale Watch, whale splashes, New Block effects, loading screen, and GitHub Pages deployment are intact.
- Forest rendering is still native, deterministic, instanced, and zone-validated.
- The current live build renders immediately and Drive Mode opens.

## What Still Falls Short

- The far dark forest zone before the mountains still reads too much like placed objects instead of a continuous scenic forest wall.
- Canopy overlap is not yet lush enough from the Helicopter Truth View.
- Mountain-base forest integration needs more depth and horizontal continuity.
- Forest tone can become too black in some areas or too sparse in others.
- Island and sandbar tops can still move toward a more premium white/ivory look.

## Must Not Regress

- No hidden lake-floor land, water blob, fake reflection plane, cloud-shadow water artifact, or black-tile regression.
- No trees in water or on unintended beach pockets.
- No external assets, paid APIs, API keys, CoinGecko runtime calls, Sketchfab, Poly Haven, Rodin, Hunyuan, Hyper3D, Blender, or MCP.
- No selector/debug graphics clutter.
- Preserve Drive camera lock, Drive physics, speed tiers, mobile controls, scenic cameras, wake blocks, event effects, and live data architecture.
- Preserve `references/` and `artifacts/` as untracked folders unless explicitly approved.

## Rollback Instructions

To inspect or return to the Phase 64 forest cathedral baseline:

```bash
git fetch --tags
git checkout v2-forest-cathedral-phase64
```

To intentionally reset `master` back to this checkpoint:

```bash
git checkout master
git reset --hard v2-forest-cathedral-phase64
```

Only use the hard reset command when intentionally discarding later work.

## Protected Systems

- `src/scene/waterSystem.ts`
- `src/scene/lakeMap.ts`
- `src/scene/createScene.ts`
- `src/scene/forestSystem.ts`
- `src/scene/terrainSystem.ts`
- `src/state/liveBitcoinStore.ts`
- `src/state/weatherEngine.ts`
- `src/scene/effects.ts`
- `DRIVE_CONTRACT.md`
- `ZERO_COST_DATA_SOURCES.md`
- `EFFECTS_CONTRACT.md`
- `WATER_SHADER_AUDIT.md`
- `SCENE_ZONES.md`
- `BLENDER_ZONE_PREP.md`
- `ZONE_TRUTH_CONTRACT.md`
