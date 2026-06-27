import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import {
  getMountainPlacementHarnessTelemetry,
  type MountainPlacementHarnessTelemetry,
  type MountainVisualValidationAudit,
} from "./mountainPlacementHarness";

export type Zone6MountainExperimentSystem = {
  group: THREE.Group;
  setActive: (active: boolean) => void;
  update: (weather: WeatherSnapshot, camera: THREE.PerspectiveCamera) => void;
  getTelemetry: () => MountainPlacementHarnessTelemetry;
};

export const NO_VALID_MOUNTAIN_EXPERIMENT_REASON =
  "No valid mountain experiment loaded - baseline/zone proof only.";

const EMPTY_EXPERIMENT_AUDIT: MountainVisualValidationAudit = {
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
  lakeShoreOverlap: false,
  secondLakeArtifact: false,
  glassPaneArtifact: false,
  invalidReason: NO_VALID_MOUNTAIN_EXPERIMENT_REASON,
};

export const createZone6MountainExperimentSystem =
  (): Zone6MountainExperimentSystem => {
    const group = new THREE.Group();
    group.name = "Zone 6 mountain experiment slot - empty";
    group.visible = false;
    let requestedActive = false;

    const getTelemetry = () =>
      getMountainPlacementHarnessTelemetry({
        experimentActive: requestedActive,
        mountainVertices: 0,
        audit: EMPTY_EXPERIMENT_AUDIT,
      });

    return {
      group,
      setActive: (nextActive) => {
        requestedActive = nextActive;
        group.visible = false;
      },
      update: () => {
        group.visible = false;
      },
      getTelemetry,
    };
  };

