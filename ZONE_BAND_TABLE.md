# Phase 81 Zone Band Table

Date: 2026-06-27

`src/scene/zoneBands.ts` is the paint-by-number table for the visible world. It
defines offsets, heights, materials, owners, and water permission before any art
pass is allowed to render geometry.

## Hard Law

- Zone 1 is the only zone that can contain the lake water shader.
- Zones 2-5 are visible land bands generated from one ordered table.
- Land is not a lid hiding water. Dry land removes water from that footprint.
- Island and sandbar dry footprints are non-water for water generation, boat
  clamping, and ripple blocking.
- Ground triangles are oriented upward when generated. `DoubleSide` is not the
  correctness mechanism.
- Adjacent opaque ground bands share table boundaries and heights.

## Ordered Bands

| Zone | Key | Offset From Shore | Height | Material | Owner | Water Allowed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | water | inside lake only | `-0.035` | `waterShader` | `waterSystem` | yes |
| 2 | wetSand | `-6..14` | `0.09..0.22` | `wetSand` | `createShoreline` | overlap edge only |
| 2 | bankToe | `14..42` | `0.22..0.72` | `bankToe` | `createShoreline` | no |
| 3 | shoreGrass | `42..88` | `0.72..1.02` | `shoreGrass` | `createShoreline` | no |
| 3 | raisedBank | `88..142` | `1.02..1.44` | `raisedBank` | `createShoreline` | no |
| 4 | forestShelf | `142..214` | `1.44..1.90` | `forestShelf` | `createShoreline` | no |
| 4 | midForestShelf | `214..260` | `1.90..2.24` | `midForestShelf` | `createShoreline` | no |
| 5 | farForestGround | `260..world edge` | `2.24..2.42` | `farForest` | `createShoreline` | no |
| 5 | farForestInstances | `88..360` | follows ground table | `farForest` | `forestSystem` | no |
| 6 | mountainBackdrop | back arc only | `0.75..315` | `mountainTerrain` | `terrainSystem` | no |
| 7 | sky | atmosphere | sky space | `sky` | `skySystem` | no |

## Phase 81 Leak Cause And Fix

Phase 80 leaked visually because several correctness assumptions were split
across systems:

- the water mesh tolerated partial tiles near the shore,
- island and sandbar visible dry land was larger than the water-blocking
  footprint,
- the first shore materials were pale enough to read as water,
- ground strips used `FrontSide` before triangle winding was guaranteed.

Phase 81 fixes these at the root:

- water tiles are emitted only when the tile center, inset samples, and corners
  are all valid water,
- island and sandbar dry footprints now remove water and clamp the boat,
- Zones 2-5 use muted earth/grass materials and never inherit water tones,
- every generated ground triangle is audited and individually flipped upward.

## Future Art Rule

Future mountains, Blender assets, trees, rocks, beaches, docks, reeds, and
textures must name a target zone from this table. If an asset cannot state its
zone, owner, placement height, and water permission, it does not render.
