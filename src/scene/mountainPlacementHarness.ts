import { LAKE_MAP } from "./lakeMap";

export type MountainPlacementHarnessTelemetry = {
  experimentAvailable: boolean;
  experimentActive: boolean;
  experimentValid: boolean;
  reason: string;
  invalidReason: string;
  zoneLabel: string;
  mountainVertices: number;
  backArcValid: boolean;
  backArcActive: boolean;
  sideFadeoutActive: boolean;
  invalidVertexCount: number;
  foothillAnchor: boolean;
  mountainBaseTouchesFoothill: boolean;
  grounded: boolean;
  floatingGapDetected: boolean;
  bottomSilhouetteValid: boolean;
  forestOcclusionValid: boolean;
  stageOrderValid: boolean;
  artifactFree: boolean;
  cameraCheckValid: boolean;
  lakeShoreOverlap: boolean;
  secondLakeArtifact: boolean;
  glassPaneArtifact: boolean;
};

export type MountainVisualValidationAudit = {
  vertexCount: number;
  invalidVertexCount: number;
  hasFoothillAnchor: boolean;
  mountainBaseTouchesFoothill: boolean;
  floatingGapDetected: boolean;
  bottomSilhouetteValid: boolean;
  forestOcclusionValid: boolean;
  stageOrderValid: boolean;
  artifactFree: boolean;
  cameraCheckValid: boolean;
  lakeShoreOverlap: boolean;
  secondLakeArtifact: boolean;
  glassPaneArtifact: boolean;
  invalidReason?: string;
};

export const MOUNTAIN_BACK_ARC_ZONE = {
  label: "Mountain Backdrop Ring / Back Arc",
  xMin: 1520,
  xMax: 2240,
  zMin: -680,
  zMax: 680,
  yMin: 0.75,
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

const getDefaultInvalidAudit = (): MountainVisualValidationAudit => ({
  vertexCount: 0,
  invalidVertexCount: 0,
  hasFoothillAnchor: false,
  mountainBaseTouchesFoothill: false,
  floatingGapDetected: true,
  bottomSilhouetteValid: false,
  forestOcclusionValid: false,
  stageOrderValid: false,
  artifactFree: false,
  cameraCheckValid: false,
  lakeShoreOverlap: true,
  secondLakeArtifact: true,
  glassPaneArtifact: true,
  invalidReason: "No grounded foothill-anchored Zone 6 experiment exists",
});

export const getMountainPlacementHarnessTelemetry = ({
  experimentActive = false,
  mountainVertices = 0,
  invalidVertexCount = 0,
  audit,
}: {
  experimentActive?: boolean;
  mountainVertices?: number;
  invalidVertexCount?: number;
  audit?: Partial<MountainVisualValidationAudit>;
} = {}): MountainPlacementHarnessTelemetry => {
  const backArcValid = validateMountainBackArc();
  const sideFadeoutActive =
    MOUNTAIN_BACK_ARC_ZONE.sideFadeWidth > 0 &&
    MOUNTAIN_BACK_ARC_ZONE.sideFadeWidth * 2 <
      MOUNTAIN_BACK_ARC_ZONE.zMax - MOUNTAIN_BACK_ARC_ZONE.zMin;
  const validation = {
    ...getDefaultInvalidAudit(),
    ...audit,
    invalidVertexCount: audit?.invalidVertexCount ?? invalidVertexCount,
  };
  const grounded =
    validation.hasFoothillAnchor &&
    validation.mountainBaseTouchesFoothill &&
    !validation.floatingGapDetected;
  const experimentValid =
    backArcValid &&
    sideFadeoutActive &&
    validation.invalidVertexCount === 0 &&
    grounded &&
    validation.bottomSilhouetteValid &&
    validation.forestOcclusionValid &&
    validation.stageOrderValid &&
    validation.artifactFree &&
    validation.cameraCheckValid &&
    !validation.lakeShoreOverlap &&
    !validation.secondLakeArtifact &&
    !validation.glassPaneArtifact;
  const nextExperimentActive = experimentActive && experimentValid;
  const invalidReasons = [
    validation.invalidReason ?? "",
    !backArcValid ? "Zone 6 bounds invalid" : "",
    !sideFadeoutActive ? "side fadeout invalid" : "",
    validation.invalidVertexCount > 0
      ? `vertex audit failed (${validation.invalidVertexCount})`
      : "",
    !validation.hasFoothillAnchor ? "missing foothill anchor" : "",
    !validation.mountainBaseTouchesFoothill ? "mountain base not seated into foothill" : "",
    validation.floatingGapDetected ? "floating gap under mountain base" : "",
    !validation.bottomSilhouetteValid ? "flat/floating bottom silhouette" : "",
    !validation.forestOcclusionValid ? "far forest does not occlude base" : "",
    !validation.stageOrderValid ? "scene stage order not proven" : "",
    !validation.artifactFree ? "artifact check failed" : "",
    !validation.cameraCheckValid ? "camera proof not approved" : "",
    validation.lakeShoreOverlap ? "lake/shore overlap" : "",
    validation.secondLakeArtifact ? "second-lake artifact risk" : "",
    validation.glassPaneArtifact ? "glass-pane/banner artifact risk" : "",
  ].filter(Boolean);
  const invalidReason = experimentValid ? "" : invalidReasons[0] ?? "invalid";
  return {
    experimentAvailable: experimentValid,
    experimentActive: nextExperimentActive,
    experimentValid,
    reason: experimentValid ? "Grounded Zone 6 mountain experiment valid" : invalidReason,
    invalidReason,
    zoneLabel: "Zone 6 Mountain Backdrop / Back Arc",
    mountainVertices: nextExperimentActive ? mountainVertices : 0,
    backArcValid,
    backArcActive: nextExperimentActive,
    sideFadeoutActive,
    invalidVertexCount: validation.invalidVertexCount,
    foothillAnchor: validation.hasFoothillAnchor,
    mountainBaseTouchesFoothill: validation.mountainBaseTouchesFoothill,
    grounded,
    floatingGapDetected: validation.floatingGapDetected,
    bottomSilhouetteValid: validation.bottomSilhouetteValid,
    forestOcclusionValid: validation.forestOcclusionValid,
    stageOrderValid: validation.stageOrderValid,
    artifactFree: validation.artifactFree,
    cameraCheckValid: validation.cameraCheckValid,
    lakeShoreOverlap: validation.lakeShoreOverlap,
    secondLakeArtifact: validation.secondLakeArtifact,
    glassPaneArtifact: validation.glassPaneArtifact,
  };
};
