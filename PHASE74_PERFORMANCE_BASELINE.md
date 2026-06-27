# Phase 74 Performance Baseline

Date: 2026-06-27

Baseline commit before cleanup: `4f7e8fd`

## Build Output

Command: `npm.cmd run build`

Result: pass

| Asset | Raw | Gzip |
| --- | ---: | ---: |
| `dist/index.html` | 1.36 kB | 0.54 kB |
| `dist/assets/index-DIoqr0cb.css` | 22.63 kB | 5.61 kB |
| `dist/assets/index-CFEJO_uX.js` | 776.00 kB | 208.19 kB |

## Bundle Cleanup Notes

- Active imports from `src/scene/realismSpike.ts`: removed.
- Active imports from `src/scene/webgpuScenicBackdrop.ts`: removed.
- Lazy WebGPU scenic chunk: removed from the Phase 74 build output.
- WebGPU probe: remains only in quarantined source, not active app path.
- Extra render pass added: no.
- External assets added: no.

## Runtime Sample

Sample target: `http://127.0.0.1:5174/HashLakeCodex/`

| Metric | Frame / Helicopter Truth View | Drive / Chase |
| --- | ---: | ---: |
| FPS | 22.3 | 22.5 |
| Frame time | 44.8 ms | 44.5 ms |
| Pixel ratio | 1.00 | 1.00 |
| Render scale | 0.62 | 0.62 |
| Render governor | Performance | Performance |
| Mode | Frame | Drive |
| Post | off | off |

## Scene Counts

| Metric | Value |
| --- | ---: |
| Native trees | 2868 |
| Instanced trees | 2868 |
| Individual trees | 0 |
| Forest band instances | 1278 |
| Reeds | 118 |
| Rocks | 66 |
| Native mountain vertices | 2838 |
| Experimental mountain vertices | 0 |
| Water meshes | 1 |
| Active heavy scenic systems | 0 |

Tree type counts:

`T99 S35 M102 L95 B97 C226 G326 W140 I162 U334 K140 V345 P129 F607 Y31`

## Debug Truth Sample

- Visual mode: `Native Baseline`
- V compare: `unavailable`
- Back arc: `valid`
- WebGPU probe: `off`
- Heavy scenic: `off`
- WebGL2: `supported`
- WebGPU capability: `available`, but not probed or used by Phase 74
- Mountain asset: `fallback`
- Mountain alpha: `fallback`
- Treeline asset: `fallback`
- Shoreline asset: `fallback`

## Screenshots

Saved under untracked `artifacts/phase74-scenic-cleanup-zone-reset/`:

- `01-native-baseline-helicopter-truth.png`
- `02-v-compare-native-baseline-unavailable.png`
- `03-debug-active-visual-mode.png`
- `04-debug-no-hidden-webgpu-scenic.png`
- `05-drive-mode-open.png`
- `06-zone-relevant-wide-shot.png`

## Recommendation

Phase 75 should build one bounded native mountain experiment inside `MOUNTAIN_BACK_ARC_ZONE` only. It should be toggleable by `V`, report actual vertex counts, and become default only if it visibly beats the native baseline without second-lake, pane, banner, or terrain-wall artifacts.
