import { LAKE_MAP } from "./lakeMap";

export type MountainPlacementHarnessTelemetry = {
  experimentAvailable: boolean;
  experimentActive: boolean;
  reason: string;
  zoneLabel: string;
  mountainVertices: number;
  backArcValid: boolean;
};

export const MOUNTAIN_BACK_ARC_ZONE = {
  label: "Mountain Backdrop Ring / Back Arc",
  xMin: 1600,
  xMax: 2300,
  zMin: -1180,
  zMax: 1180,
  yMin: 14,
  yMax: 360,
  sideFadeWidth: 260,
} as const;

export const validateMountainBackArc = () =>
  MOUNTAIN_BACK_ARC_ZONE.xMin > LAKE_MAP.mapBounds.maxX + 80 &&
  MOUNTAIN_BACK_ARC_ZONE.zMin < LAKE_MAP.mapBounds.minZ - 120 &&
  MOUNTAIN_BACK_ARC_ZONE.zMax > LAKE_MAP.mapBounds.maxZ + 120 &&
  MOUNTAIN_BACK_ARC_ZONE.yMin > 0 &&
  MOUNTAIN_BACK_ARC_ZONE.yMax > MOUNTAIN_BACK_ARC_ZONE.yMin;

export const getMountainPlacementHarnessTelemetry = ({
  experimentActive = false,
  mountainVertices = 0,
}: {
  experimentActive?: boolean;
  mountainVertices?: number;
} = {}): MountainPlacementHarnessTelemetry => {
  const backArcValid = validateMountainBackArc();
  return {
    experimentAvailable: backArcValid,
    experimentActive: experimentActive && backArcValid,
    reason: backArcValid
      ? "Zone 6 back-arc harness valid"
      : "Zone 6 back-arc harness invalid",
    zoneLabel: "Zone 6 Mountain Backdrop / Back Arc",
    mountainVertices: experimentActive && backArcValid ? mountainVertices : 0,
    backArcValid,
  };
};
