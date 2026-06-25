# Phase 66 Realism Architecture Spike

## Purpose

Phase 65 is stable, lightweight, and playable, but it is visually plateauing against the alpine realism target in `references/000_INSPIRATION.jpg`. Phase 66 tests whether HashLake can add an optional higher-realism scenic path without rewriting the app or risking Drive Mode, water, Bitcoin data, event effects, or GitHub Pages deployment.

## Baseline

- Starting commit: `9d6512b Phase 65 museum forest deepening and scenic beautification pass`
- Baseline behavior: WebGLRenderer, native/procedural, no runtime external art/data beyond existing zero-cost feeds.
- Fallback rule: Performance mode and normal boot keep the Phase 65 WebGL path available.
- Dependency change: `three` is pinned from floating `latest` to `0.185.0`. `@types/three` remains pinned at `0.184.1` because `@types/three@0.185.0` is not published.

## What Was Attempted

Phase 66 added an optional `ScenicExperimental` path as a separate native scene system:

- Eroded/domain-warped alpine mountain backdrop.
- Slope/altitude-driven mountain material bands for rock, grass, forest, and light caps.
- Mountain-base forest wall using native instancing.
- Custom height fog/mist sheets pooling between terrain and forest.
- Renderer capability telemetry for Three revision, WebGL2, WebGPU, renderer path, quality preset, frame time, and spike status.

The spike is WebGL-first. WebGPU/TSL is intentionally deferred.

## Why WebGPU/TSL Was Deferred

Three r185's `webgpu_custom_fog` direction is the right strategic reference, but moving HashLake from `WebGLRenderer` to `WebGPURenderer`/TSL would touch renderer construction, material assumptions, post/weather overlays, GLTF/runtime compatibility, browser support, and fallback logic. That is larger than an architecture spike and belongs in a dedicated phase after this proof is evaluated.

## Activation Gate

The spike is off by default unless the gate opens:

- Eligible device: WebGL2 and non-mobile viewport.
- Requested by local debug flag: `?scenicExperimental=1` or `localStorage["hashlake.scenicExperimental.v1"] = "1"`.
- Or requested automatically by a future Scenic preset path.
- Normal Performance fallback stays available when no local debug flag is present.
- An explicit local debug flag can force the spike on for testing even if the governor has downgraded quality.

This keeps Phase 65 behavior available and reversible.

## What Worked

- The experimental path compiles and renders without touching Drive physics/camera, water, boat, BTC systems, or live data.
- Debug telemetry exposes the renderer/device path and the spike's active/off reason.
- The mountain/forest/fog proof is isolated in `src/scene/realismSpike.ts`.
- No extra render pass was added.
- No external assets, paid APIs, API keys, CoinGecko, Sketchfab, Poly Haven, Rodin, Hunyuan, or Hyper3D were added.
- Local visual smoke passed with `?scenicExperimental=1`.
- Drive Mode opened successfully with the experimental path active and camera lock intact.

## Current Technical Cost

- Added source module: `src/scene/realismSpike.ts`
- Build output after the spike:
  - JS: `782.47 kB` raw / `209.90 kB` gzip
  - CSS: `22.63 kB` raw / `5.61 kB` gzip
- Local proof URL: `/HashLakeCodex/?scenicExperimental=1`
- Measured debug telemetry during smoke:
  - Three.js: `r185`
  - Renderer path: `WebGLRenderer/WebGL2`
  - WebGPU support: available in the browser, deferred by architecture
  - Current path: WebGL, not WebGPU
  - Quality preset during proof: `Performance`
  - FPS/frame time: `25 FPS` / `40.7 ms`
  - Pixel ratio/render scale: `1.00` / `0.62`
  - Native trees: `2868`
  - Forest band instances: `1278`
- Added optional geometry when constructed:
  - Alpine backdrop vertices: `3009`
  - Experimental forest instances: `940`
  - Height fog layers: `2`
- Extra render pass: no
- Runtime external network calls: no
- Captured screenshots under `artifacts/phase66-realism-spike/`; artifacts remain untracked.

## Risks

- The experimental mountains/fog are still native approximation, not real WebGPU/TSL parity.
- The current module constructs geometry at startup even when inactive; if this path is kept, Phase 67 should consider lazy construction behind the gate.
- Explicit debug mode can force the spike on after a quality downgrade, so it should remain a developer/testing path until performance is tuned.
- Visual benefit depends on camera framing and may need composition-specific tuning.
- WebGPU/TSL migration is still unproven in this app.
- The proof is architecturally useful, but not production-grade beauty yet; it needs either stronger art tuning or a dedicated WebGPU/TSL terrain/fog branch before becoming the default scenic path.

## Recommendation For Phase 67

Do not rewrite the whole app. Either:

1. Promote the WebGL `ScenicExperimental` path into a lazy-loaded, manually gated Scenic mode and tune it against screenshots, or
2. Run a dedicated WebGPU/TSL feasibility branch that ports only terrain/fog first while keeping WebGL as the default fallback.

The safest next move is a dedicated Phase 67 WebGPU feasibility branch or a lazy WebGL scenic mode, not a broad renderer migration.
