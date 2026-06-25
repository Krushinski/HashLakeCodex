# Phase 70 Scenic Mode Clarity and Alpine Push

## Goal

Phase 70 makes Scenic Mode understandable and visibly user-verifiable while keeping the Phase 65-69 fallback path safe. The app still boots into the reliable WebGL scene first; the scenic layer is optional, lazy, and reversible.

## Scenic Mode Contract

- `V` toggles Scenic Mode.
- Debug `Toggle Scenic` uses the same toggle.
- `?webgpuScenic=1` forces Scenic Mode on for local review.
- `?webgpuScenic=0` forces fallback mode and blocks desktop auto-enable.
- Manual Debug/keyboard toggles persist in `localStorage["hashlake.webgpuScenic"]`.
- First paint remains fallback-safe.
- Desktop-sized WebGL2/WebGPU-capable sessions may auto-enable scenic after the first render settles if the user has not explicitly disabled it.
- Mobile does not auto-enable scenic.
- Sustained low FPS after desktop auto-enable turns scenic back off and shows `Scenic reduced for performance`.

## Debug Clarity

The old `Quality` tile is now `Perf Governor`. It describes the performance governor state only. It does not mean Scenic Mode is off.

New Scenic telemetry:

- `Scenic Mode`: `OFF`, `ON`, `FALLBACK`, or `ERROR`.
- `WebGPU scenic`: requested/active reason.
- `Fallback`: whether the safe fallback scene is active.
- `P70 terrain`, `P70 forest`, `P70 fog`: actual scenic layer visibility counters.

## Visual Push

The optional scenic layer now has:

- Higher far alpine peak wall behind the lake and forest shelf.
- A stronger mountain-foot skirt set outside the lake/shore zone.
- Denser instanced far forest massing.
- Six pooled height-fog layers for the mountain-base transition.
- Stronger rock, meadow, snow, and aerial-perspective material bands.

This remains a WebGL-compatible scenic proof with a WebGPU probe. It does not swap the app renderer to WebGPU.

## Verification

`npm.cmd run build` passes.

Build output:

- JS app chunk: `822.94 kB` raw / `220.11 kB` gzip.
- Three WebGPU probe chunk: `567.94 kB` raw / `159.22 kB` gzip.
- CSS: `22.63 kB` raw / `5.61 kB` gzip.

Fallback sample:

- Scenic Mode: `OFF`.
- Perf Governor: `Balanced`.
- FPS: `24`.
- Frame time: `41.9 ms`.
- Pixel ratio: `1.00`.
- Render scale: `0.84`.
- P70 terrain/forest/fog: `0 / 0 / off`.

Scenic sample:

- Scenic Mode: `ON`.
- Perf Governor: `Performance`.
- FPS: `28`.
- Frame time: `35.5 ms`.
- Pixel ratio: `1.00`.
- Render scale: `0.62`.
- WebGPU probe: `initialized`.
- Renderer path: WebGL scenic proof, not a WebGPU scene renderer.
- P70 terrain vertices: `48,044`.
- P70 forest instances: `92,800`.
- P70 fog: `WebGL pooled alpine height fog v3`.
- Extra render pass: no.
- External assets: no.

Drive scenic sample:

- Drive opens with body class `hashlake-drive-active`.
- Drive HUD: `DRIVE - Speed 0 - Camera locked`.
- Scenic Mode: `ON`.
- FPS: `24`.
- Pixel ratio: `1.00`.
- Render scale: `0.62`.

## Screenshots

Captured in `artifacts/phase70-scenic-clarity-alpine-push/`:

- `01-fallback-standard.png`
- `02-scenic-standard.png`
- `03-fallback-helicopter-truth.png`
- `04-scenic-helicopter-truth.png`
- `05-scenic-mountain-crop.png`
- `06-scenic-forest-fog-crop.png`
- `07-debug-scenic-on.png`
- `08-debug-fallback-perf-governor-distinction.png`
- `09-drive-opens-scenic-active.png`

`artifacts/` remains untracked.

## Recommendation For Phase 71

Do not jump to a full WebGPU renderer swap yet. The next best step is a scenic composition pass that makes the mountain silhouette more art-directed and less ring-like while preserving the current optional Scenic Mode contract. If WebGPU/TSL continues, keep it as a contained renderer spike with an explicit fallback boundary.
