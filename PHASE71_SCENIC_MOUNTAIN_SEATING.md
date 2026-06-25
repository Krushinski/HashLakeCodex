# Phase 71 Scenic Mountain Seating

## Goal

Phase 71 corrects the optional Scenic Mode alpine backdrop so it reads as a distant mountain range seated behind the lake, raised shore, and far forest shelf. The existing Phase 65-70 fallback path remains intact, and Scenic Mode is still optional, gated, and reversible.

## What Changed

- Build/UI metadata now reports `Hashlake Phase 71`.
- Debug scenic counters are renamed from `P70` to `P71`.
- Scenic terrain is pushed farther back from the lake/play zone.
- The mountain ring and peak walls are lowered by roughly one third and moved outward.
- Far forest placement now starts behind the lake/shore clearance buffer.
- A low `Phase 71 seated forest-to-mountain valley apron` mesh fills the mountain-base seam behind the far forest without restoring hidden land under the lake.
- Valley fog layers are shifted backward and softened so the base transition reads as atmospheric depth instead of a foreground wall.

## Zone Seating Contract

- Lake/play water remains the foreground and is untouched.
- Far forest sits behind the raised shore/forest shelf.
- The valley apron sits behind far forest and ahead of the mountains.
- The mountain ring and craggy peak walls sit behind the apron.
- No hidden full-world land disk under the lake was restored.
- No fake treeline reflection plane was restored.
- No extra render pass was added.

## Verification

`npm.cmd run build` passes.

Build output:

- CSS: `22.63 kB` raw / `5.61 kB` gzip.
- Main JS: `824.74 kB` raw / `220.66 kB` gzip.
- Lazy Three WebGPU chunk: `567.94 kB` raw / `159.22 kB` gzip.

Local Scenic telemetry:

- Scenic Mode: `ON`.
- Renderer: `WebGLRenderer/WebGL2`.
- WebGPU active renderer: `no`.
- WebGPU probe: `initialized`.
- Fallback: `experimental gated`.
- P71 terrain vertices: `50,939`.
- P71 forest instances: `92,800`.
- P71 fog: `WebGL valley alpine height fog v4`.
- Pixel ratio: `1.00`.
- Frame render scale: `0.84`.
- Scenic/Drive render scale after governor: `0.62`.
- Sample FPS: `24-25 FPS`.
- Extra render pass: no.
- External assets: no.

## Screenshots

Captured in `artifacts/phase71-scenic-mountain-seating/`:

- `01-fallback-helicopter-truth.png`
- `02-scenic-helicopter-truth.png`
- `03-scenic-drive-mountains-behind-forest.png`
- `04-scenic-drive-oj-vice-sky-view.png`
- `05-mountain-base-foothill-crop.png`
- `06-fog-valley-forest-crop.png`
- `07-debug-scenic-on-renderer-status.png`

`artifacts/` remains untracked.

## Honest Read

The specific Phase 68/70 failure mode is improved: the mountains are no longer seated in the lake or directly on top of the playable shoreline, and the far forest now acts as the intended buffer. The new valley apron removes the worst mountain-base gap from the crop and Drive view.

The backdrop is still a procedural scenic proof, not final alpine realism. The next useful work should improve the distant valley/mountain-base material blend so the far transition becomes more natural and less horizontally banded, while preserving the new zone order.

## Phase 72 Recommendation

Keep the Scenic Mode contract stable and do one targeted alpine-base material pass: break up the remaining distant horizontal fog/foothill band with more organic shadow, forest silhouette variation, and atmospheric haze. Do not move the mountains forward again.
