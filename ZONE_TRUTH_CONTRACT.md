# HashLake Zone Truth Contract

Phase 56 establishes `src/scene/lakeMap.ts` as the master source for world zones. Phase 81 adds `src/scene/zoneBands.ts` as the ordered visible-band table for shoreline and ground ownership. Visual geometry, boat collision, ripple blocking, minimap shape, tree placement, reeds, rocks, and future asset placement must agree with these files.

## Non-Negotiable Rules

- The lake outline is `LAKE_OUTLINE`.
- Island and sandbar footprints are `LAKE_FEATURE_FOOTPRINTS`.
- Boat collision and ripple blocking use the same island/sandbar blockers as visible land.
- Tree, rock, reed, beach, and future asset placement must use exported zone helpers from `lakeMap.ts`.
- No separate visible wet/shallow rings around island or sandbar.
- No transparent vertical mountain, forest, treeline, haze, or reflection planes.
- No hidden full-world land under the lake.
- No object may render in water unless it is explicitly a water/wetland effect.
- Water geometry may render only inside valid Zone 1 lake water. Land is not allowed to hide a larger water sheet underneath it.
- Generated opaque land triangles must face upward at generation time. `DoubleSide` must not be the fix for bad winding.

## Zone Sequence

From lake center outward:

1. Water shader surface.
2. Shader-owned shallow/edge water.
3. Opaque wet edge.
4. Lighter shoreline grass.
5. Raised green bank.
6. Darker forest shelf.
7. Far forest silhouettes.
8. Mountain terrain.
9. Sky.

## Placement Zones

| Zone | Source | Allowed | Forbidden | Height / Clearance | Blender Ready |
| --- | --- | --- | --- | --- | --- |
| Water | `isWater(point)` and contained water tiles | boat, wake, BTC ripples, block rings, water effects | trees, rocks, land props, terrain cards, hidden water under dry land | y near water plane | no water Blender |
| Wet edge | `distanceToShore` near 0 | reeds, small wet rocks, shoreline foam later | conifer trees, cabins, mountain planes | just above water | limited accents |
| Shore grass | `getExpandedOutline(42..shorelineGrassOuter)` | grass, small rocks, beach transitions | forest masses, debug masks | raised above water | yes |
| Raised bank | `shorelineGrassOuter..raisedBankOuter` | rocks, shrubs, future roots | water cards, sand halos | visibly raised | yes |
| Forest shelf | `isMainlandForestZone` | trees, forest assets, cabins later | reeds, water effects, transparent planes | shore clearance 38-330 | yes |
| Far forest | `isMainlandForestZone` with far clearances | distant tree silhouettes, future forest strips made of real geometry | billboard planes | shore clearance 88-360 | yes |
| Island | `LAKE_FEATURE_FOOTPRINTS.island.dry` | one clean landform, rocks, intentional small trees | detached wet rings, gray triangles, water underneath dry sand | dry land above water | yes, later |
| Sandbar | `LAKE_FEATURE_FOOTPRINTS.sandbar.dry` | one clean low sand landform | detached wet rings, gray triangles, trees, water underneath dry sand | low dry sand above water | yes, later |
| Mainland beach | `ZONE_TRUTH.mainlandBeach` | one small beach pocket, future dock/beach props | full-shore beach halo, random sand ovals | gentle low slope | yes |
| Reed wetland | `isReedWetlandZone` | reeds and wetland grasses | conifers and rocks in deep water | near shore only | yes, light |
| Dock/cove | `LAKE_MAP.destinations` | dock, cabin, rocks, cove accents | water-invalid trees, debug markers | land-connected | yes |
| Mountains | `terrainSystem` ridge geometry | stable terrain meshes | vertical alpha curtains, haze banners | behind forest | later |

## Runtime Guard Expectations

- Forest trees are sampled from outline offsets and must pass `isMainlandForestZone`.
- Phase 57 native forest trees are instanced by type and must pass `isMainlandForestZone` with near/mid/far/cove/dock band clearances.
- Automatic trees must stay out of water, shallows, beach pockets, island, sandbar, dock openings, and cove openings.
- Far forest silhouettes are native instanced trees and must pass `isMainlandForestZone` with far clearances.
- Reeds must pass `isReedWetlandZone`.
- Shore rocks must pass `isMainlandShoreZone`.
- Scenic GLB treeline loading is disabled until future assets can satisfy this contract.
- Tree alpha samples are disabled until they can be validated by the same land placement rules.

## Future Blender Gate

A Blender asset is allowed only when it has:

- a named target zone from this contract,
- a ground height expectation,
- a water clearance expectation,
- a fallback path,
- no runtime external request,
- no transparent full-scene plane behavior.
