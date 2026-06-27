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

const FAILED_FLOATING_EXPERIMENT_AUDIT: MountainVisualValidationAudit = {
  vertexCount: 0,
  invalidVertexCount: 0,
  hasFoothillAnchor: false,
  floatingGapDetected: true,
  bottomSilhouetteValid: false,
  forestOcclusionValid: false,
  stageOrderValid: false,
  artifactFree: false,
  cameraCheckValid: false,
  invalidReason: "Phase 76 floating mountain blob disabled",
};

export const createZone6MountainExperimentSystem =
  (): Zone6MountainExperimentSystem => {
    const group = new THREE.Group();
    group.name = "Zone 6 mountain experiment disabled until grounded";
    group.visible = false;
    let requestedActive = false;

    const getTelemetry = () =>
      getMountainPlacementHarnessTelemetry({
        experimentActive: requestedActive,
        mountainVertices: FAILED_FLOATING_EXPERIMENT_AUDIT.vertexCount,
        audit: FAILED_FLOATING_EXPERIMENT_AUDIT,
      });

    return {
      group,
      setActive: (nextActive) => {
        requestedActive = nextActive;
        const telemetry = getTelemetry();
        group.visible = telemetry.experimentActive;
      },
      update: () => {
        group.visible = false;
      },
      getTelemetry,
    };
  };
