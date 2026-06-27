# Phase 78 Zone 6 Implementation Note

Date: 2026-06-27

## Zone Separation

- Zone 5 ends at the validated far forest wall: real instanced dark forest geometry placed on mainland forest shelf behind the lake and in front of any mountain experiment.
- Zone 6 begins behind that forest wall, in the bounded back arc defined by `MOUNTAIN_BACK_ARC_ZONE`: x `1520..2240`, z `-680..680`, y `0.75..315`.
- Mountains are forbidden on east/west side shores. Side edges must fade to low foothills/forest/sky, not walls.
- The experiment stays behind the far forest by keeping its front foothill edge beyond `LAKE_MAP.mapBounds.maxX + 620`.
- The experiment avoids lake/shore overlap by never using lake/shore polygons, never adding water-colored materials, and passing Zone 6 vertex bounds before activation.

## Build Order

1. Zone 5 far forest remains the foreground occluder.
2. Zone 6a foothill anchor renders first as a low, dark, land-colored surface.
3. Zone 6b hero ridgelines use the foothill crest as their base samples.
4. `V` toggles the isolated experiment group only when the validator passes.
5. If any grounding or artifact rule fails, baseline remains active.

## Reference Checkpoints

- Before coding: the inspiration image wins through clear stage order, dense forest before mountain, and jagged ridges rising from grounded foothills. Phase 78 targets that order first, not full realism.
- r185 custom-fog direction: use eroded/domain-warped terrain, altitude/slope material bands, and aerial depth mindset, but no WebGPU or fog panes in this phase.
