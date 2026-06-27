# Phase 74 Pre-Cleanup Checkpoint

Date: 2026-06-27
Branch: `master`
Current phase before cleanup: `Hashlake Phase 73`
Current commit: `4f7e8fd` (`Phase 73 scenic forensics and second lake cleanup`)

## Checkpoint Purpose

Phase 74 starts from the post-forensics state where the broken Scenic/WebGPU mountain layer is visually gated off and native fallback is active. This checkpoint records the rollback point before removing or quarantining the remaining experimental scenic/WebGPU weight.

## Systems Being Cleaned

- Phase 66 `ScenicExperimental` realism spike path.
- Phase 67/68/69/70/71/72/73 WebGPU scenic probe and toggle path.
- Scenic auto-enable logic.
- Scenic URL/localStorage flags.
- Hidden scenic terrain/fog/mountain/forest builders.
- Debug telemetry that references inactive scenic systems.
- Lazy WebGPU/scenic chunk imports that no longer deliver accepted visuals.
- The `V` toggle behavior, which should become a cheap native mountain comparison toggle.

## Known Issues From Phases 66-73

- WebGPU/scenic systems introduced hidden state and confusing Debug readouts.
- Scenic mountain/fog/terrain layers caused false second-lake bands.
- Scenic peak/apron geometry exposed glass-pane and banner-strip artifacts.
- Heavy scenic forest/terrain builders had high cost and low accepted visible value.
- Scenic auto-enable and localStorage state made it unclear what mode was active.
- Fallback/native mountains are currently the safer spatial reference.

## Systems That Must Not Break

- Immediate render and no blank screen.
- GitHub Pages deployment.
- Debug (`D`) and Legend (`L`).
- Drive Mode (`X`), Drive camera lock, Drive camera presets, and OJ/Vice City if present.
- Frame Mode scenic camera presets (`C` outside Drive).
- Desktop/mobile drive controls, natural braking/reverse, and speed tiers.
- Water shader, wake blocks, BTC splashes, New Block effects, stale fog.
- Bottom-left BTC pill, Coinbase heartbeat, mempool.space feeds, Mempool Whale Watch.
- Minimap, speedometer, loading screen, iOS/Safari stability.
- Zero-cost data policy.
- `references/` and `artifacts/` remain untracked.

## Rollback

Use this if Phase 74 cleanup needs to be abandoned:

```bash
git reset --hard pre-phase74-scenic-cleanup
```

Only run the rollback after confirming no user work would be lost.
