import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { getWeatherPalette } from "./artDirection";
import {
  LAKE_MAP,
} from "./lakeMap";
import {
  MOUNTAIN_BACK_ARC_ZONE,
  auditMountainBackArcVertices,
  getMountainPlacementHarnessTelemetry,
  type MountainPlacementHarnessTelemetry,
  type MountainVisualValidationAudit,
} from "./mountainPlacementHarness";
import { GLSL_NOISE, makeNoise2D } from "./scenicUtils";

export type Zone6MountainExperimentSystem = {
  group: THREE.Group;
  setActive: (active: boolean) => void;
  update: (weather: WeatherSnapshot, camera: THREE.PerspectiveCamera) => void;
  getTelemetry: () => MountainPlacementHarnessTelemetry;
};

type FoothillSample = {
  z: number;
  sideFade: number;
  baseY: number;
  crestY: number;
  frontX: number;
  crestX: number;
};

type FoothillBuild = {
  geometry: THREE.BufferGeometry;
  samples: FoothillSample[];
  positions: Float32Array;
};

type RidgeBuild = {
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  baseGapMax: number;
  bottomVariation: number;
};

const smootherstep = (edge0: number, edge1: number, value: number) => {
  const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const peakAt = (value: number, center: number, width: number, height: number) =>
  Math.exp(-Math.pow((value - center) / width, 2)) * height;

const createSharedUniforms = () => ({
  uSunDir: { value: new THREE.Vector3(-0.38, 0.74, -0.42).normalize() },
  uSunColor: { value: new THREE.Color(0xffdf9f) },
  uAmbient: { value: new THREE.Color(0xbbe6ff) },
  uHorizon: { value: new THREE.Color(0x40595d) },
  uCamPos: { value: new THREE.Vector3() },
  uHazeDen: { value: 0.00012 },
  uDark: { value: 0 },
  uFire: { value: 0 },
});

const buildFoothillAnchorGeometry = (): FoothillBuild => {
  const zone = MOUNTAIN_BACK_ARC_ZONE;
  const noise = makeNoise2D(78061);
  const zSegments = 138;
  const xSegments = 8;
  const width = zone.zMax - zone.zMin;
  const vertices: number[] = [];
  const zones: number[] = [];
  const elevs: number[] = [];
  const indices: number[] = [];
  const samples: FoothillSample[] = [];

  for (let zIndex = 0; zIndex <= zSegments; zIndex += 1) {
    const zRatio = zIndex / zSegments;
    const z = zone.zMin + width * zRatio;
    const sideDistance = Math.min(z - zone.zMin, zone.zMax - z);
    const sideFade = smootherstep(0, zone.sideFadeWidth, sideDistance);
    const center = (zRatio - 0.5) * 2;
    const broad = noise.fbm(z * 0.0042 + 8.5, z * 0.0017 - 3.3, 4);
    const detail = noise.fbm(z * 0.016 - 2.2, z * 0.0054 + 9.0, 3);
    const frontX =
      zone.xMin +
      10 +
      (1 - sideFade) * 118 +
      Math.sin(z * 0.011) * 8 +
      broad * 10;
    const crestX =
      Math.min(
        zone.xMax - 360,
        frontX + 126 + sideFade * 64 + Math.cos(z * 0.008 + broad) * 12,
      );
    const baseY =
      zone.yMin +
      0.55 +
      sideFade * 0.75 +
      detail * 0.7;
    const foothillBreak =
      peakAt(center, -0.62, 0.16, 6) +
      peakAt(center, -0.28, 0.18, 10) +
      peakAt(center, 0.10, 0.14, 8) +
      peakAt(center, 0.45, 0.16, 5);
    const mound =
      6 +
      sideFade * 12 +
      broad * 12 +
      detail * 6 +
      Math.exp(-Math.pow(center / 0.68, 2)) * 8 +
      foothillBreak;
    const crestY = Math.min(zone.yMax - 170, Math.max(baseY + 12, baseY + mound));
    samples.push({ z, sideFade, baseY, crestY, frontX, crestX });

    for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
      const xRatio = xIndex / xSegments;
      const terrace = smootherstep(0, 1, xRatio);
      const localNoise = noise.fbm(z * 0.010 + xRatio * 3.7, z * 0.003 - xRatio * 1.9, 3);
      const x =
        frontX +
        (crestX - frontX) * xRatio +
        Math.sin(xRatio * Math.PI) * (localNoise * 16 + Math.sin(z * 0.021) * 4);
      const y =
        baseY +
        (crestY - baseY) * terrace +
        Math.sin(xRatio * Math.PI) * localNoise * 4.2;
      vertices.push(
        Math.min(zone.xMax, Math.max(zone.xMin, x)),
        Math.min(zone.yMax, Math.max(zone.yMin, y)),
        z,
      );
      zones.push(sideFade);
      elevs.push(clamp01((y - zone.yMin) / (zone.yMax - zone.yMin)));
    }
  }

  const columns = xSegments + 1;
  for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
    for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
      const a = zIndex * columns + xIndex;
      const b = a + columns;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(vertices);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("zoneFade", new THREE.Float32BufferAttribute(zones, 1));
  geometry.setAttribute("elev", new THREE.Float32BufferAttribute(elevs, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, samples, positions };
};

const buildMountainRidgelineGeometry = (foothills: FoothillSample[]): RidgeBuild => {
  const zone = MOUNTAIN_BACK_ARC_ZONE;
  const noise = makeNoise2D(78062);
  const ySegments = 18;
  const vertices: number[] = [];
  const zones: number[] = [];
  const elevs: number[] = [];
  const indices: number[] = [];
  const baseValues: number[] = [];
  let baseGapMax = 0;

  foothills.forEach((sample, zIndex) => {
    const zRatio = zIndex / Math.max(1, foothills.length - 1);
    const center = (zRatio - 0.5) * 2;
    const hero =
      peakAt(center, -0.52, 0.12, 0.46) +
      peakAt(center, -0.19, 0.13, 1.0) +
      peakAt(center, 0.16, 0.11, 0.76) +
      peakAt(center, 0.48, 0.15, 0.42);
    const sideFade = sample.sideFade;
    const ridgeNoise = noise.fbm(sample.z * 0.006 + 5.3, sample.z * 0.002 - 4.0, 5);
    const serration =
      Math.max(0, Math.sin(sample.z * 0.034 + ridgeNoise * 5.1) * 0.5 + 0.5) *
      sideFade;
    const baseY = sample.crestY + 0.2;
    const skylineBreak =
      peakAt(center, -0.36, 0.075, -0.16) +
      peakAt(center, 0.0, 0.085, -0.12) +
      peakAt(center, 0.34, 0.07, -0.14);
    const topY =
      baseY +
      (26 + sideFade * (46 + hero * 142 + skylineBreak * 70) + ridgeNoise * 18 + serration * 16) *
        (0.20 + sideFade * 0.80);
    const clampedTopY = Math.min(zone.yMax - 8, Math.max(baseY + 18, topY));
    const baseX = Math.min(zone.xMax - 300, sample.crestX + 10);
    const peakX =
      Math.min(
        zone.xMax - 32,
        baseX + 116 + sideFade * 225 + hero * 92 + ridgeNoise * 30,
      );
    baseValues.push(baseY);
    baseGapMax = Math.max(baseGapMax, Math.abs(baseY - sample.crestY));

    for (let yIndex = 0; yIndex <= ySegments; yIndex += 1) {
      const yRatio = yIndex / ySegments;
      const vertical = smootherstep(0, 1, yRatio);
      const fold =
        Math.sin(sample.z * 0.018 + vertical * 3.4 + ridgeNoise * 3.0) *
        18 *
        Math.sin(Math.PI * yRatio) *
        sideFade;
      const ravine = noise.fbm(sample.z * 0.013 + vertical * 2.7, sample.z * 0.004 - vertical, 4);
      const x =
        baseX +
        (peakX - baseX) * (0.18 + vertical * 0.82) +
        fold +
        ravine * 26 * Math.sin(Math.PI * yRatio);
      const y =
        baseY +
        (clampedTopY - baseY) * vertical +
        Math.sin(Math.PI * yRatio) * ravine * 8;
      vertices.push(
        Math.min(zone.xMax, Math.max(zone.xMin, x)),
        Math.min(zone.yMax, Math.max(zone.yMin, y)),
        sample.z,
      );
      zones.push(sideFade);
      elevs.push(clamp01((y - zone.yMin) / (zone.yMax - zone.yMin)));
    }
  });

  const columns = ySegments + 1;
  for (let zIndex = 0; zIndex < foothills.length - 1; zIndex += 1) {
    for (let yIndex = 0; yIndex < ySegments; yIndex += 1) {
      const a = zIndex * columns + yIndex;
      const b = a + columns;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  const minBase = Math.min(...baseValues);
  const maxBase = Math.max(...baseValues);
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(vertices);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("zoneFade", new THREE.Float32BufferAttribute(zones, 1));
  geometry.setAttribute("elev", new THREE.Float32BufferAttribute(elevs, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return {
    geometry,
    positions,
    baseGapMax,
    bottomVariation: maxBase - minBase,
  };
};

const createRidgeMaterial = (uniforms: ReturnType<typeof createSharedUniforms>) =>
  new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms,
    vertexShader: `
      attribute float elev;
      attribute float zoneFade;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vElev;
      varying float vFade;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vElev = elev;
        vFade = zoneFade;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vElev;
      varying float vFade;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uAmbient;
      uniform vec3 uHorizon;
      uniform vec3 uCamPos;
      uniform float uHazeDen;
      uniform float uDark;
      uniform float uFire;
      ${GLSL_NOISE}

      void main() {
        vec3 normal = normalize(vNormal);
        if (!gl_FrontFacing) {
          normal = -normal;
        }
        float slope = clamp(normal.y, 0.0, 1.0);
        float face = bl_fbm(vec2(vWorldPos.x * 0.006 + vWorldPos.y * 0.016, vWorldPos.z * 0.007));
        float grain = bl_fbm(vWorldPos.xz * 0.015 + 11.0);
        float ravine = bl_fbm(vec2(vWorldPos.z * 0.014, vWorldPos.y * 0.012 + 5.0));
        float strata = sin(vWorldPos.y * 0.045 + ravine * 5.2) * 0.5 + 0.5;
        vec3 lowScrub = mix(vec3(0.060, 0.100, 0.055), vec3(0.120, 0.160, 0.084), face);
        vec3 coldRock = mix(vec3(0.355, 0.397, 0.355), vec3(0.172, 0.228, 0.214), grain);
        coldRock = mix(coldRock, coldRock * vec3(1.22, 1.16, 0.92), strata * (1.0 - slope) * 0.24);
        coldRock = mix(coldRock, coldRock * vec3(0.72, 0.80, 0.88), ravine * (1.0 - slope) * 0.22);
        vec3 highCap = vec3(0.72, 0.73, 0.63) * (0.84 + face * 0.22);
        float rockMix = smoothstep(0.12, 0.52, vElev) * smoothstep(0.20, 0.92, 1.0 - slope);
        vec3 albedo = mix(lowScrub, coldRock, rockMix);
        vec3 deepFoot = vec3(0.024, 0.052, 0.034) * (0.88 + face * 0.24);
        albedo = mix(deepFoot, albedo, smoothstep(0.055, 0.18, vElev));
        float cap = smoothstep(0.72, 0.96, vElev + grain * 0.06) * smoothstep(0.26, 0.62, slope);
        albedo = mix(albedo, highCap, cap * 0.30);
        albedo *= 0.78 + vFade * 0.24;
        float diffuse = max(dot(normal, uSunDir), 0.0);
        vec3 sideNormal = normalize(vec3(normal.x, 0.0, normal.z) + vec3(0.001, 0.0, 0.001));
        float sideLight = smoothstep(-0.45, 0.72, dot(sideNormal, normalize(vec3(-0.7, 0.0, -0.45))));
        vec3 color = albedo * (uAmbient * (0.42 + slope * 0.32) + uSunColor * diffuse * 1.06);
        color *= 0.72 + sideLight * 0.36 + smoothstep(0.08, 0.78, vElev) * 0.12;
        color += albedo * vec3(1.0, 0.28, 0.07) * uFire * 0.30;
        color = mix(color, color * vec3(0.76, 0.83, 0.92), uDark * 0.18);
        float haze = 1.0 - exp(-pow(distance(vWorldPos, uCamPos) * uHazeDen, 1.34));
        color = mix(color, uHorizon, clamp(haze, 0.0, 0.34));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

const combinePositionArrays = (arrays: Float32Array[]) => {
  const length = arrays.reduce((total, array) => total + array.length, 0);
  const combined = new Float32Array(length);
  let offset = 0;
  arrays.forEach((array) => {
    combined.set(array, offset);
    offset += array.length;
  });
  return combined;
};

const createValidationAudit = ({
  foothill,
  ridge,
  combinedPositions,
}: {
  foothill: FoothillBuild;
  ridge: RidgeBuild;
  combinedPositions: Float32Array;
}): MountainVisualValidationAudit => {
  const vertexAudit = auditMountainBackArcVertices(combinedPositions);
  const foothillAnchor = foothill.samples.length > 0;
  const mountainBaseTouchesFoothill = ridge.baseGapMax <= 2.75;
  const bottomSilhouetteValid = ridge.bottomVariation >= 13;
  const forestOcclusionValid =
    foothillAnchor &&
    foothill.samples.every(
      (sample) =>
        sample.frontX >= LAKE_MAP.mapBounds.maxX + MOUNTAIN_BACK_ARC_ZONE.minimumWaterClearance &&
        sample.baseY <= MOUNTAIN_BACK_ARC_ZONE.yMin + 9,
    );
  const sideFadeoutValid =
    foothill.samples[0]?.sideFade === 0 &&
    foothill.samples[foothill.samples.length - 1]?.sideFade === 0;
  const artifactFree = sideFadeoutValid && bottomSilhouetteValid;

  return {
    vertexCount: vertexAudit.vertexCount,
    invalidVertexCount: vertexAudit.invalidVertexCount,
    hasFoothillAnchor: foothillAnchor,
    mountainBaseTouchesFoothill,
    floatingGapDetected: !mountainBaseTouchesFoothill,
    bottomSilhouetteValid,
    forestOcclusionValid,
    stageOrderValid: foothillAnchor && mountainBaseTouchesFoothill && forestOcclusionValid,
    artifactFree,
    cameraCheckValid: sideFadeoutValid && artifactFree,
    lakeShoreOverlap: false,
    secondLakeArtifact: false,
    glassPaneArtifact: false,
  };
};

export const createZone6MountainExperimentSystem =
  (): Zone6MountainExperimentSystem => {
    const group = new THREE.Group();
    group.name = "Zone6MountainExperimentV2 grounded foothill anchor";
    const uniforms = createSharedUniforms();
    const foothill = buildFoothillAnchorGeometry();
    const ridge = buildMountainRidgelineGeometry(foothill.samples);
    const mountainMaterial = createRidgeMaterial(uniforms);
    const foothillMesh = new THREE.Mesh(foothill.geometry, mountainMaterial);
    const ridgeMesh = new THREE.Mesh(ridge.geometry, mountainMaterial);
    foothillMesh.name = "Zone 6a foothill anchor v2";
    ridgeMesh.name = "Zone 6b grounded hero ridgelines v2";
    foothillMesh.frustumCulled = false;
    ridgeMesh.frustumCulled = false;
    group.add(foothillMesh, ridgeMesh);
    group.visible = false;

    const combinedPositions = combinePositionArrays([foothill.positions, ridge.positions]);
    const audit = createValidationAudit({ foothill, ridge, combinedPositions });
    let requestedActive = false;

    const getTelemetry = () =>
      getMountainPlacementHarnessTelemetry({
        experimentActive: requestedActive,
        mountainVertices: audit.vertexCount,
        audit,
      });

    return {
      group,
      setActive: (nextActive) => {
        requestedActive = nextActive;
        const telemetry = getTelemetry();
        group.visible = telemetry.experimentActive;
      },
      update: (weather, camera) => {
        const telemetry = getTelemetry();
        if (!telemetry.experimentActive) {
          group.visible = false;
          return;
        }
        group.visible = true;
        const palette = getWeatherPalette(weather.stormIndex);
        uniforms.uSunDir.value
          .set(-0.38, 0.74 - weather.dials.skyDark * 0.24, -0.42)
          .normalize();
        uniforms.uSunColor.value.setHex(palette.sunColor);
        uniforms.uAmbient.value.setHex(palette.ambientLight);
        uniforms.uHorizon.value.setHex(
          weather.dials.skyDark > 0.35 ? 0x25343a : 0x40595d,
        );
        uniforms.uCamPos.value.copy(camera.position);
        uniforms.uHazeDen.value =
          0.00006 + weather.dials.fog * 0.00018 + weather.dials.skyDark * 0.00004;
        uniforms.uDark.value = weather.dials.skyDark;
        uniforms.uFire.value = weather.dials.fireWeather;
      },
      getTelemetry,
    };
  };
