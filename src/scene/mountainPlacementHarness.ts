import { LAKE_MAP } from "./lakeMap";

export type MountainPlacementHarnessTelemetry = {
  experimentAvailable: boolean;
  experimentActive: boolean;
  experimentValid: boolean;
  reason: string;
  zoneLabel: string;
  mountainVertices: number;
  backArcValid: boolean;
  backArcActive: boolean;
  sideFadeoutActive: boolean;
  invalidVertexCount: number;
};

export const MOUNTAIN_BACK_ARC_ZONE = {
  label: "Mountain Backdrop Ring / Back Arc",
  xMin: 1520,
  xMax: 2240,
  zMin: -680,
  zMax: 680,
  yMin: 16,
  yMax: 315,
  sideFadeWidth: 260,
  minimumWaterClearance: 620,
  minimumBackArcWidth: 760,
} as const;

export const validateMountainBackArc = () =>
  MOUNTAIN_BACK_ARC_ZONE.xMin >
    LAKE_MAP.mapBounds.maxX + MOUNTAIN_BACK_ARC_ZONE.minimumWaterClearance &&
  MOUNTAIN_BACK_ARC_ZONE.zMin < LAKE_MAP.mapBounds.minZ - 80 &&
  MOUNTAIN_BACK_ARC_ZONE.zMax > LAKE_MAP.mapBounds.maxZ + 80 &&
  MOUNTAIN_BACK_ARC_ZONE.zMax - MOUNTAIN_BACK_ARC_ZONE.zMin >=
    MOUNTAIN_BACK_ARC_ZONE.minimumBackArcWidth &&
  MOUNTAIN_BACK_ARC_ZONE.sideFadeWidth > 0 &&
  MOUNTAIN_BACK_ARC_ZONE.sideFadeWidth * 2 <
    MOUNTAIN_BACK_ARC_ZONE.zMax - MOUNTAIN_BACK_ARC_ZONE.zMin &&
  MOUNTAIN_BACK_ARC_ZONE.yMin > 0 &&
  MOUNTAIN_BACK_ARC_ZONE.yMax > MOUNTAIN_BACK_ARC_ZONE.yMin;

export const auditMountainBackArcVertices = (positions: ArrayLike<number>) => {
  let invalidVertexCount = 0;
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index] ?? 0;
    const y = positions[index + 1] ?? 0;
    const z = positions[index + 2] ?? 0;
    const valid =
      x >= MOUNTAIN_BACK_ARC_ZONE.xMin &&
      x <= MOUNTAIN_BACK_ARC_ZONE.xMax &&
      z >= MOUNTAIN_BACK_ARC_ZONE.zMin &&
      z <= MOUNTAIN_BACK_ARC_ZONE.zMax &&
      y >= MOUNTAIN_BACK_ARC_ZONE.yMin &&
      y <= MOUNTAIN_BACK_ARC_ZONE.yMax;
    if (!valid) {
      invalidVertexCount += 1;
    }
  }

  return {
    invalidVertexCount,
    vertexCount: Math.floor(positions.length / 3),
  };
};

export const getMountainPlacementHarnessTelemetry = ({
  experimentActive = false,
  mountainVertices = 0,
  invalidVertexCount = 0,
}: {
  experimentActive?: boolean;
  mountainVertices?: number;
  invalidVertexCount?: number;
} = {}): MountainPlacementHarnessTelemetry => {
  const backArcValid = validateMountainBackArc();
  const sideFadeoutActive =
    MOUNTAIN_BACK_ARC_ZONE.sideFadeWidth > 0 &&
    MOUNTAIN_BACK_ARC_ZONE.sideFadeWidth * 2 <
      MOUNTAIN_BACK_ARC_ZONE.zMax - MOUNTAIN_BACK_ARC_ZONE.zMin;
  const experimentValid = backArcValid && sideFadeoutActive && invalidVertexCount === 0;
  const nextExperimentActive = experimentActive && experimentValid;
  return {
    experimentAvailable: experimentValid,
    experimentActive: nextExperimentActive,
    experimentValid,
    reason: experimentValid
      ? "Zone 6 back-arc harness valid"
      : invalidVertexCount > 0
        ? `Zone 6 vertex audit failed (${invalidVertexCount})`
      : "Zone 6 back-arc harness invalid",
    zoneLabel: "Zone 6 Mountain Backdrop / Back Arc",
    mountainVertices: nextExperimentActive ? mountainVertices : 0,
    backArcValid,
    backArcActive: nextExperimentActive,
    sideFadeoutActive,
    invalidVertexCount,
  };
};
