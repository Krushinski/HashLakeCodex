# Hashlake Drive Contract

Phase 12 fixed Drive Mode around one canonical coordinate model:

- `driveState.yaw` is the boat heading and is the source of truth.
- Boat movement uses `getBoatForward(driveState.yaw)` only.
- The procedural boat mesh converts that heading with `getVisualRotationForHeading`, so the bow matches physics.
- Drive camera position and target derive from boat heading only.
- Input never controls camera, world, lake, minimap, or scene rotation.
- The world/scene stays rotation-locked in Drive Mode.
- Wake emits from the stern/rear motor, opposite the boat forward vector.

Future drive changes should tune around this contract, not replace it.
