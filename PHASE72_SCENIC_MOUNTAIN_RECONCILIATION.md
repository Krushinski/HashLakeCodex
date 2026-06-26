# Phase 72 Scenic Mountain Reconciliation

Date: 2026-06-25
Baseline: `f65be85` (`Phase 71 scenic mountain seating and alpine composition correction`)

## Goal

Phase 72 corrected the Phase 71 marker mismatch and reconciled the experimental scenic mountain layer so it no longer reads as a second lake or a detached pale band behind the forest. The pass favored zone truth and Drive stability over a dramatic but risky mountain rebuild.

## What Changed

- Updated the app/build marker to `Hashlake Phase 72`.
- Updated Debug scenic telemetry labels to `P72 terrain`, `P72 forest`, and `P72 fog`.
- Re-seated the scenic mountain system closer to the lake than Phase 71 while keeping it behind the far forest shelf.
- Removed the previous full alpine ring geometry that could expose side seams and false background planes.
- Hid the broad terrain sheet from rendering while keeping its sampler available for deterministic forest placement.
- Added a dark far-forest base mass and opaque far-forest silhouette to block the pale blue-gray strip behind the lake.
- Reworked peak wall geometry with edge fading, stronger ridgeline structure, and safer front/back placement.
- Reduced and darkened valley fog so it acts as atmospheric depth rather than a water-like horizontal band.
- Moved the low-left cloud banks higher/farther back and lowered opacity to reduce the faded vertical-plane read.

## Zone Order

The intended visible order is now:

1. Lake
2. Shore
3. Forest shelf
4. Dark far forest
5. Foothill/apron mass
6. Hero mountain walls
7. Sky

The broad scenic terrain sampler remains internal. It should not be visible as a lake, shelf, or gray/blue strip.

## Verification Notes

- Phase marker: `Hashlake Phase 72`.
- Debug scenic status: active and visible when Scenic Mode is enabled.
- Scenic telemetry from screenshot:
  - `P72 terrain`: `29756`
  - `P72 forest`: `106000`
  - `P72 fog`: `WebGL broken alpine valley fog v5`
  - Pixel ratio: `1.00`
  - Render scale: `0.84`
  - Frame time: `42.8 ms`
  - FPS shown: `23 fps`
- Build output from final local build:
  - JS app: `826.46 kB` raw / `221.28 kB` gzip
  - Three WebGPU chunk: `567.94 kB` raw / `159.22 kB` gzip
  - CSS: `22.63 kB` raw / `5.61 kB` gzip
- Extra render pass: no.
- External assets/APIs added: none.
- CoinGecko/API keys/paid services added: none.

## Screenshots

Captured in `artifacts/phase72-scenic-mountain-reconciliation/`:

- `01-fallback-helicopter-truth.png`
- `02-scenic-helicopter-truth.png`
- `03-scenic-drive-view.png`
- `04-scenic-oj-vice-high-proof.png`
- `05-mountain-base-forest-wall-crop.png`
- `06-fog-depth-crop.png`
- `07-no-second-lake-proof.png`
- `08-debug-scenic-on-active-visible.png`

These artifacts remain untracked.

## Honest Assessment

This pass improves the seam correctness and removes the strongest "lake behind the lake" failure mode. It also reduces the left-side slab/ghost-plane problem. The tradeoff is that the mountains are now safer and more coherent, but not yet as heroic as the inspiration target.

## Phase 73 Recommendation

Build the next hero ridgeline as a bounded back-arc or authored strip with explicit left/right fadeouts, not a 360-degree ring and not a full hidden terrain sheet. If Blender returns, use it for a controlled distant mountain/foothill alpha that can be seated behind the far forest without any under-lake or side-edge geometry.
