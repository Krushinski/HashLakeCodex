# Zone Object Ownership

Phase 82 rule: every visible thing has one zone owner. If an object cannot prove its zone, it must be hidden, rejected, or left as a disabled experiment.

## Zone Table

| Zone | Name | Owner Surface |
| --- | --- | --- |
| 1 | Water / Lake | `waterSystem` |
| 2 | Shore / Wet Edge | `createShoreline` |
| 3 | Raised Bank | `createShoreline` |
| 4 | Near / Mid Forest Shelf | `createShoreline` + validated forest instances |
| 5 | Far Forest Wall | `createShoreline` + validated forest instances |
| 6 | Mountain Backdrop / Back Arc | `terrainSystem` or valid `zone6MountainExperiment` only |
| 7 | Sky / Clouds | sky and cloud systems only |

## Object Ownership Audit

| Object category | Owner zone | Allowed placement | Forbidden placement | Ground-height source | Validation rule | Current bug risk |
| --- | --- | --- | --- | --- | --- | --- |
| Water mesh | Zone 1 | Inside `LAKE_OUTLINE`, excluding island and sandbar dry footprints | Any land band, hidden full-world land, mountain or forest zone | Fixed water plane y | `isWater(point)`/lake mask remains the only render domain | Water leakage if a land perimeter mesh is mistaken for water |
| Wake, BTC ripples, new block rings | Zone 1 | Valid water surface only, with land-aware segmentation | Through island, sandbar, shore, or land shelves | Water surface y | Ripple segments are clipped by lake/obstacle tests | Rings visually crossing land if masks drift |
| Wet edge / damp shore | Zone 2 | Narrow `-6..wetEdge+4` shoreline band | Full lake perimeter as wide beach, forest shelf, mountain back arc | `LAND_PERIMETER_BANDS` | Ordered band geometry from `ZONE_BAND_TABLE` | Gray/white halos if over-widened |
| Raised bank | Zone 3 | `42..raisedBankOuter` shoreline clearance | Water, mountain back arc, second lake rings | `getGroundHeightForShoreClearance` | Upward-facing ordered strip, no water ownership | Jagged seams if winding or offsets drift |
| Near/mid forest floor | Zone 4 | `forestShelfInner..forestShelfOuter` | Water, wet edge, Zone 6 mountains | `getGroundHeightAtPoint` | Ordered ground strip, tree predicates use mainland forest clearance | Black seam lines if triangles flip or overlap |
| Far forest floor | Zone 5 | Outer mainland floor and far forest shelf | Mountain geometry in front of trees, water, wet edge | `getGroundHeightAtPoint` | Zone 5 remains visually in front of Zone 6 | Mountain mesh swallowing tree bodies |
| Tall/medium/short pine trees | Zones 4-5 | Mainland forest clearance from band-specific predicates | Zone 1 water, Zone 2 wet edge, Zone 6 mountains, sky | `groundHeightAt(point)` from zone bands | `certifyTreeInstance` requires mainland forest ownership, finite ground y, no mountain ownership | Hovering or buried trees if accepted without certification |
| Broad evergreen/canopy masses | Zones 4-5 | Far and mid forest clearances | Water, wet edge, mountain zone | `groundHeightAt(point)` | Same tree certification, then instanced mesh count scaling | Blob forests can hide bad placement if not counted |
| Distant silhouettes / forest wall | Zone 5 | Far forest clearances up to `farForestMaxShoreClearance` | Behind/inside mountain art, lake, shore | `groundHeightAt(point)` | Certification rejects mountain-owned clearance | Tree tips poking through mountain if Zone 6 starts too early |
| Reeds | Zone 2 exception | Reed wetland pocket straddling water/land edge | Open water outside reed pocket, Zone 4/5 forest, Zone 6 | Fixed shallow reed y | `isReedWetlandZone` | Reeds in open lake if wetland center drifts |
| Rocks/boulders | Zone 2-3 | Mainland shore clearance `rockMin..rockMax` | Water interior, island/sandbar top unless explicitly authored, mountains | `groundHeightAt(shore)` | `isMainlandShoreZone` and beach-pocket exclusion | Black pebble lines if they land on invalid seams |
| Island | Zone 1 obstacle / local land | Dry island footprint inside lake | Mainland shore or mountain zone | Island mound logic | `isInIsland` excludes water and clips ripples | Gray edge teeth if wet edge gets separate ownership |
| Sandbar | Zone 1 obstacle / local land | Dry sandbar footprint inside lake | Mainland shore or mountain zone | Sandbar mound logic | `isInSandbar` excludes water and clips ripples | Ring/halo artifacts if sand alpha exceeds footprint |
| Dock | Zone 2-3 destination | Shore pocket only | Open water except pilings, forest shelf, mountain zone | Destination placement + local y | Destination key placement must remain shore-adjacent | Floating dock pieces if local y changes |
| Native mountains | Zone 6 | Clean back-arc grid behind Zone 5 and the far forest clearance | Zone 5 forest shelf, lake, shore, side/east/west foreground | Fixed foothill base behind forest wall | `xMin/xMax/zMin/zMax` place the mesh behind `LAKE_MAP.mapBounds.maxX` with side fade | Swallowing forest if the back-arc x gate moves inward |
| Mountain experiment slot | Zone 6 | Harness bounds `MOUNTAIN_BACK_ARC_ZONE` only | Any vertex outside harness bounds; second-lake or pane artifacts | Internal foothill/base geometry | `auditMountainBackArcVertices` plus visual audit flags | False valid art if audit flags are set without screenshots |
| Sky and clouds | Zone 7 | Above and behind all scene geometry | Ground/water ownership, transparent landscape panes | Sky shader/cloud mesh logic | No land/water/collision ownership | Fog/cloud layers reading as mountain panes |
| Legacy scenic / WebGPU / hidden fallbacks | None unless explicitly active | Disabled by default | Any live visual path without a valid owner | N/A | Must stay off or report fallback/error in Debug | Covered-but-still-rendering performance hogs |

## Phase 82 Enforcement

- Tree instances are counted as certified only after `certifyTreeInstance` confirms Zone 4/5 land, valid sampled ground height, and no mountain-owned clearance.
- Native mountains no longer use free circular rings. They are clean Zone 6 back-arc ridges that sit behind the far forest clearance.
- The `V` key remains diagnostic: native baseline, no-mountains zone proof, and the Zone 6 experiment only when the harness says it is valid.
- The boot/fallback shell remains independent of all zone ownership so a scene failure does not become a blank screen.
