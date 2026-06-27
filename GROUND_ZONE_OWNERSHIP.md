# Phase 81 Ground Zone Ownership

Date: 2026-06-27

This document defines the current land and shore ownership contract for HashLake Codex.
It exists because the same black triangle and break-line artifact kept returning around
the forest floor and near-shore bands.

## Phase 81 Diagnosis

Phase 80 solved several seam causes, but the proof screenshots exposed a deeper
topology leak. The first land band looked like water because water and land rules were
still split across different systems:

- the water mesh still allowed partial shoreline tiles,
- island and sandbar visible dry land was larger than the water-blocking footprint,
- the first shore materials were too pale and water-like,
- ground strips used `FrontSide` before triangle winding was guaranteed upward.

That produced pale blue-gray shore patches, apparent water leaking through the beach
zone, and recurring triangle/edge artifacts.

## Permanent Rule

No two opaque ground surfaces may fight for the same pixels.

If two zones meet, they must either:

- share the same generated boundary and the same boundary elevation, or
- be intentionally vertically ordered as a visible detail object, such as a rock, tree,
  reed, dock, or hand-authored prop.

Opaque filler planes, hidden land cards, dark connector triangles, and random seam strips
are forbidden.

Water is never a full-world sheet hidden under land. The main lake shader is clipped to
valid Zone 1 water. Dry island and sandbar footprints remove water from the water mesh,
boat collision, and ripple blocking.

The authoritative table is `ZONE_BAND_TABLE.md` and `src/scene/zoneBands.ts`.

## Current Owners

| Zone | Name | Visible Ground Owner | Elevation Band | Overlap |
| --- | --- | --- | --- | --- |
| 2 | Shore / Wet Edge | `createShoreline()` wet sand and bank-toe strips | `0.09 -> 0.72` | Wet lip may overlap water edge only |
| 3 | Raised Bank | `createShoreline()` grass transition and raised bank strips | `0.72 -> 1.44` | No opaque overlap |
| 4 | Near / Mid Forest Shelf | `createShoreline()` forest shelf and mid forest shelf strips | `1.44 -> 2.24` | Trees/rocks only |
| 5 | Far Forest Wall | `createShoreline()` outer land ring plus `forestSystem` instances | `2.24 -> 2.42+` | Trees/canopy only |

## Boundary Law

The generated ground strips use shared boundary noise based on world position and
boundary elevation. Adjacent strips that share a boundary must pass the same elevation
for that boundary. This keeps both sides of the join numerically aligned.

Current critical shared boundaries:

- wet edge outer: `0.22`
- bank toe outer: `0.72`
- grass transition outer: `1.02`
- raised bank / forest shelf join: `1.44`
- forest shelf / mid forest shelf join: `1.90`
- mid forest shelf / outer land join: `2.24`

`forestSystem.groundHeightAt()` must match these same visible terrain elevations so
tree and canopy bases do not expose old seam lines.

Generated ground indices are audited per triangle and flipped upward at generation
time. `DoubleSide` is allowed only as a visual fallback for explicit special cases,
not as the solution to bad topology.

## Forbidden Geometry

- hidden full-world land under the lake
- duplicate gray shoreline halos
- coplanar grass or forest floor overlays
- water-colored land patches
- mountain bases in Zones 2-5
- transparent reflection planes
- dark triangle seam patches
- decorative ground cards that are not validated to a zone

## Future Art Rule

Future Blender, texture, or procedural assets must name their target zone and sit on top
of the owned ground. They do not become a second hidden floor.
