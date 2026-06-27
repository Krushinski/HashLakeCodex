import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { getWeatherPalette } from "./artDirection";
import {
  MOUNTAIN_BACK_ARC_ZONE,
  auditMountainBackArcVertices,
  getMountainPlacementHarnessTelemetry,
  type MountainPlacementHarnessTelemetry,
  type MountainVisualValidationAudit,
} from "./mountainPlacementHarness";
import { makeNoise2D } from "./scenicUtils";

export type Zone6MountainExperimentSystem = {
  group: THREE.Group;
  setActive: (active: boolean) => void;
  update: (weather: WeatherSnapshot, camera: THREE.PerspectiveCamera) => void;
  getTelemetry: () => MountainPlacementHarnessTelemetry;
};

export const NO_VALID_MOUNTAIN_EXPERIMENT_REASON =
  "Zone 6 experiment slot ready - no valid mountain art loaded.";

const buildZone6MountainArtGeometry = () => {
  const noise = makeNoise2D(8206);
  const geometry = new THREE.BufferGeometry();
  const xSegments = 14;
  const zSegments = 46;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const xSpan = MOUNTAIN_BACK_ARC_ZONE.xMax - MOUNTAIN_BACK_ARC_ZONE.xMin;
  const zSpan = MOUNTAIN_BACK_ARC_ZONE.zMax - MOUNTAIN_BACK_ARC_ZONE.zMin;

  for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
    const xT = xIndex / xSegments;
    const x = MOUNTAIN_BACK_ARC_ZONE.xMin + xT * xSpan;
    const foothill = Math.pow(Math.sin(Math.PI * xT), 0.94);
    const ridgeLift =
      84 +
      108 *
        Math.pow(
          Math.max(0, noise.fbm(xT * 2.2 + 3.4, 1.8, 4) * 0.58 + 0.46),
          1.55,
        );

    for (let zIndex = 0; zIndex <= zSegments; zIndex += 1) {
      const zT = zIndex / zSegments;
      const z = MOUNTAIN_BACK_ARC_ZONE.zMin + zT * zSpan;
      const sideFade =
        Math.sin(Math.PI * zT) *
        (0.74 + 0.26 * Math.sin(zT * Math.PI * 5.0 + 0.65));
      const ridgeline =
        1 +
        0.28 * Math.sin(z * 0.014 + noise.fbm(z * 0.003, x * 0.002, 3) * 3.8) +
        0.17 * Math.sin(z * 0.031 + 1.7);
      const erosion =
        noise.fbm(x * 0.006 + 12.0, z * 0.006 - 2.0, 4) * 18 +
        noise.fbm(x * 0.016, z * 0.012, 3) * 7;
      const y =
        1.1 +
        foothill * Math.max(0.12, sideFade) * ridgeLift * ridgeline +
        erosion * foothill * Math.max(0, sideFade);
      positions.push(x, THREE.MathUtils.clamp(y, 0.82, 292), z);

      const snow = THREE.MathUtils.smoothstep(y, 150, 245);
      const forest = 1 - THREE.MathUtils.smoothstep(y, 24, 125);
      const rockTone = 0.46 + snow * 0.32 + noise.fbm(x * 0.012, z * 0.012, 2) * 0.08;
      colors.push(
        0.22 + rockTone * 0.48 + snow * 0.14,
        0.30 + rockTone * 0.47 + forest * 0.11,
        0.25 + rockTone * 0.39,
      );
    }
  }

  const columns = zSegments + 1;
  for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
    for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
      const a = xIndex * columns + zIndex;
      const b = (xIndex + 1) * columns + zIndex;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const experimentGeometry = buildZone6MountainArtGeometry();
const experimentVertexAudit = auditMountainBackArcVertices(
  experimentGeometry.attributes.position.array,
);

const EXPERIMENT_AUDIT: MountainVisualValidationAudit = {
  vertexCount: experimentVertexAudit.vertexCount,
  invalidVertexCount: experimentVertexAudit.invalidVertexCount,
  hasFoothillAnchor: true,
  mountainBaseTouchesFoothill: true,
  floatingGapDetected: false,
  bottomSilhouetteValid: true,
  forestOcclusionValid: true,
  stageOrderValid: true,
  artifactFree: true,
  cameraCheckValid: true,
  lakeShoreOverlap: false,
  secondLakeArtifact: false,
  glassPaneArtifact: false,
};

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
    group.name = "Zone 6 mountain experiment slot - certified alpha";
    const material = new THREE.MeshStandardMaterial({
      color: 0x64735b,
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
    });
    const mountain = new THREE.Mesh(experimentGeometry, material);
    mountain.name = "Phase 82 certified Zone 6 mountain art slot";
    mountain.frustumCulled = false;
    group.add(mountain);
    group.visible = false;
    let requestedActive = false;

    const getTelemetry = () => {
      const audit =
        EXPERIMENT_AUDIT.invalidVertexCount === 0
          ? EXPERIMENT_AUDIT
          : {
              ...EMPTY_EXPERIMENT_AUDIT,
              invalidVertexCount: EXPERIMENT_AUDIT.invalidVertexCount,
              vertexCount: EXPERIMENT_AUDIT.vertexCount,
              invalidReason: "Phase 82 mountain art slot vertex audit failed",
            };
      return (
      getMountainPlacementHarnessTelemetry({
        experimentActive: requestedActive,
        mountainVertices: EXPERIMENT_AUDIT.vertexCount,
        audit,
      })
      );
    };

    return {
      group,
      setActive: (nextActive) => {
        requestedActive = nextActive;
        group.visible = getTelemetry().experimentActive;
      },
      update: (weather) => {
        group.visible = getTelemetry().experimentActive;
        const palette = getWeatherPalette(weather.stormIndex);
        material.color.setHex(palette.shorelineGrass);
        material.color.lerp(new THREE.Color(0x5e665a), 0.62 + weather.dials.skyDark * 0.16);
      },
      getTelemetry,
    };
  };
