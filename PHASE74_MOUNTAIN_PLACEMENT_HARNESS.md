# Phase 74 Mountain Placement Harness

Date: 2026-06-27

This is a harness, not a new mountain art system.

## Purpose

Future mountain experiments must have a safe placement container before they render. The Phase 66-73 attempts produced false lakes, glass panes, horizontal bands, and terrain walls because mountain/fog/forest visuals were not constrained tightly enough against the lake map.

## Source Of Truth

- Code bounds: `src/scene/mountainPlacementHarness.ts`
- Lake geometry law: `src/scene/lakeMap.ts`
- Human zone map: `ZONE_MAP_CURRENT.md`

## Current Back Arc

- Label: Mountain Backdrop Ring / Back Arc
- x bounds: `-940..940`
- z bounds: `-980..-560`
- y bounds: `12..275`
- side fade width: `180`
- relationship: behind `LAKE_MAP.mapBounds.minZ`

## Validation Rules

- Back arc must stay behind the far forest wall and outside lake map bounds.
- No mountain experiment may overlap water, shore, raised bank, near/mid forest shelf, island, sandbar, or driveable water.
- Side fadeouts are mandatory so the layer does not become a visible wall.
- Any future vertex count must be reported in Debug.
- If the harness validity check fails, future mountain rendering should stay off.

## Phase 74 Runtime State

- Native mountain experiment available: no.
- Native mountain experiment active: no.
- Mountain vertices: `0`.
- Heavy scenic active: no.
- WebGPU probe active: no.

## Phase 75 Recommendation

Build one small native mountain experiment inside this back arc only. Do not use panes, fog banners, water-colored terrain, or side-spanning horizontal bands. It must beat the native baseline in `V` comparison before becoming default.
