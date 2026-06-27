import { LAKE_MAP } from "./lakeMap";

export type MountainPlacementHarnessTelemetry = {
  experimentAvailable: boolean;
  experimentActive: boolean;
  reason: string;
  mountainVertices: number;
  backArcValid: boolean;
};

export const MOUNTAIN_BACK_ARC_ZONE = {
  label: "Mountain Backdrop Ring / Back Arc",
  xMin: -940,
  xMax: 940,
  zMin: -980,
  zMax: -560,
  yMin: 12,
  yMax: 275,
  sideFadeWidth: 180,
} as const;

const validateBackArc = () =>
  MOUNTAIN_BACK_ARC_ZONE.zMax < LAKE_MAP.mapBounds.minZ - 80 &&
  MOUNTAIN_BACK_ARC_ZONE.xMin < LAKE_MAP.mapBounds.minX - 120 &&
  MOUNTAIN_BACK_ARC_ZONE.xMax > LAKE_MAP.mapBounds.maxX + 120 &&
  MOUNTAIN_BACK_ARC_ZONE.yMin > 0 &&
  MOUNTAIN_BACK_ARC_ZONE.yMax > MOUNTAIN_BACK_ARC_ZONE.yMin;

export const getMountainPlacementHarnessTelemetry =
  (): MountainPlacementHarnessTelemetry => ({
    experimentAvailable: false,
    experimentActive: false,
    reason: "Native mountain experiment not implemented in Phase 74",
    mountainVertices: 0,
    backArcValid: validateBackArc(),
  });
