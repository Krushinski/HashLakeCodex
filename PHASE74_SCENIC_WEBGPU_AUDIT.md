# Phase 74 Scenic / WebGPU Audit

Date: 2026-06-27
Baseline commit: `4f7e8fd`

| System | File / Function | Active By Default | Imported In Main Bundle | Lazy Loaded | Updates While Hidden | Visible Value | Cost | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Phase 66 realism spike | `src/scene/realismSpike.ts`, `createRealismSpikeSystem` | No | Yes | No | `setGate` and `update` called every frame, early returns while inactive | None accepted | Medium | Remove from active app imports; keep file only as unimported history for now |
| WebGPU scenic backdrop | `src/scene/webgpuScenicBackdrop.ts`, `createWebGpuScenicBackdropSystem` | No after Phase 73 gate | Yes | Probe imports `three/webgpu` lazily | `setGate` and `update` called every frame, early returns while inactive | Rejected due false lake / panes | High if built | Remove from active app imports; keep file unimported as quarantined history |
| WebGPU probe | `webgpuScenicBackdrop.ts`, `createWebGpuProbe` | No visual value | Yes via module | Yes, `import("three/webgpu")` | Can run when old Scenic requested | Telemetry only | Medium + lazy chunk | Remove from active app path |
| Scenic auto-enable | `createScene.ts`, `scenicAutoEnableEligible` flow | Could auto-trigger before Phase 73 | Yes | No | Evaluated every frame | Confusing | Low/medium | Remove |
| Scenic URL/localStorage flags | `webgpuScenic=1`, `hashlake.webgpuScenic` | User/state dependent | Yes | No | Read at boot | Confusing after quarantine | Low | Retire for active app; do not use for `V` |
| Legacy Debug scenic metrics | `src/ui/debugPanel.ts` scenic and legacy metric tiles | Visible in Debug | Yes | No | DOM updates when Debug visible | Confusing | Low | Replace with native visual-mode truth |
| Scenic terrain/fog/forest builders | `webgpuScenicBackdrop.ts` builders | No after Phase 73 gate | Yes via module | No | Not built after gate | Rejected | High if built | Remove from bundle by dropping import |
| GLB scenic asset hooks | `src/scene/scenicAssets.ts` | Inactive load list empty | Yes | GLTFLoader already used but no active loads | Quality setter only | Low / future useful | Low | Keep, but not part of `V` |
| Native terrain/fallback mountains | `src/scene/terrainSystem.ts` | Yes | Yes | No | Updates normally | Current spatial anchor | Accepted | Keep |
| Native forest system | `src/scene/forestSystem.ts` | Yes | Yes | No | Updates by cadence | Accepted baseline | Medium | Keep |

## Summary

The active app should stop importing Phase 66-73 Scenic/WebGPU modules. `V` should become a cheap native comparison state, not a request to build or probe WebGPU/Scenic layers. Debug should report only the active native visual mode and a small mountain-harness placeholder.

## Phase 74 Result

- `src/scene/createScene.ts` no longer imports `realismSpike.ts` or `webgpuScenicBackdrop.ts`.
- The auto-enable path, WebGPU scenic request state, hidden per-frame scenic updates, and old Scenic/WebGPU event listeners are removed from the active app.
- `V` now reports the native baseline and the unavailable mountain experiment placeholder.
- Debug reports `Visual mode`, `V compare`, `Back arc`, `WebGPU probe`, `Heavy scenic`, and `Water meshes`.
- The WebGPU probe remains only inside quarantined `src/scene/webgpuScenicBackdrop.ts`; because that file is not imported by the app, the Phase 74 build emits no lazy WebGPU scenic chunk.
