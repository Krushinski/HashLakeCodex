import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { getWeatherPalette } from "./artDirection";
import {
  MOUNTAIN_BACK_ARC_ZONE,
  auditMountainBackArcVertices,
  getMountainPlacementHarnessTelemetry,
  type MountainPlacementHarnessTelemetry,
} from "./mountainPlacementHarness";
import { GLSL_NOISE, makeNoise2D } from "./scenicUtils";

export type Zone6MountainExperimentSystem = {
  group: THREE.Group;
  setActive: (active: boolean) => void;
  update: (weather: WeatherSnapshot, camera: THREE.PerspectiveCamera) => void;
  getTelemetry: () => MountainPlacementHarnessTelemetry;
};

const smootherstep = (edge0: number, edge1: number, value: number) => {
  const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

const buildZone6Geometry = () => {
  const noise = makeNoise2D(7506);
  const ySegments = 22;
  const zSegments = 124;
  const vertices: number[] = [];
  const elevs: number[] = [];
  const fades: number[] = [];
  const indices: number[] = [];
  const zone = MOUNTAIN_BACK_ARC_ZONE;
  const width = zone.zMax - zone.zMin;

  for (let zIndex = 0; zIndex <= zSegments; zIndex += 1) {
    const zRatio = zIndex / zSegments;
    const z = zone.zMin + width * zRatio;
    const sideDistance = Math.min(z - zone.zMin, zone.zMax - z);
    const sideFade = smootherstep(0, zone.sideFadeWidth, sideDistance);
    const center = (zRatio - 0.5) * 2;
    const ridgeNoise = noise.fbm(z * 0.0061 + 8.5, z * 0.0019 - 4.1, 5);
    const shoulderNoise = noise.fbm(z * 0.004 + 11.4, z * 0.009 - 7.2, 4);
    const heroFade = sideFade * sideFade;
    const centerHero = Math.exp(-Math.pow((center + 0.02) / 0.28, 2)) * heroFade;
    const leftShoulder = Math.exp(-Math.pow((center + 0.36) / 0.22, 2)) * heroFade;
    const rightShoulder = Math.exp(-Math.pow((center - 0.34) / 0.22, 2)) * heroFade;
    const serration = Math.max(
      0,
      Math.sin(z * 0.035 + ridgeNoise * 4.2) * 0.5 + 0.5,
    ) * heroFade;
    const ridgeProfile =
      0.36 +
      ridgeNoise * 0.22 +
      shoulderNoise * 0.15 +
      centerHero * 0.44 +
      leftShoulder * 0.19 +
      rightShoulder * 0.18 +
      serration * 0.11;
    const ridgeTop =
      zone.yMin +
      (zone.yMax - zone.yMin) *
        (0.34 + Math.max(0, Math.min(1.08, ridgeProfile)) * 0.66) *
        (0.04 + sideFade * 0.96);
    const baseY = Math.max(zone.yMin, zone.yMin + sideFade * 6 + shoulderNoise * 4);
    const footX =
      zone.xMin +
      (1 - sideFade) * 300 +
      noise.fbm(z * 0.006 - 12.6, 3.2, 3) * 18 +
      Math.sin(z * 0.008) * 12;
    const faceDepth =
      68 +
      centerHero * 112 +
      leftShoulder * 36 +
      rightShoulder * 34 +
      ridgeNoise * 24;

    for (let yIndex = 0; yIndex <= ySegments; yIndex += 1) {
      const yRatio = yIndex / ySegments;
      const vertical = smootherstep(0, 1, yRatio);
      const y = Math.min(
        zone.yMax,
        Math.max(zone.yMin, baseY + (ridgeTop - baseY) * vertical),
      );
      const faceNoise = noise.fbm(
        z * 0.010 + y * 0.012 + 18.5,
        z * 0.004 - y * 0.017 - 3.2,
        4,
      );
      const fold =
        Math.sin(z * 0.014 + vertical * 2.1 + ridgeNoise * 2.6) *
        14 *
        Math.sin(Math.PI * yRatio);
      const x =
        footX +
        faceDepth * (0.18 + vertical * 0.82) +
        faceNoise * 36 * Math.sin(Math.PI * yRatio) +
        fold;

      vertices.push(Math.min(zone.xMax, Math.max(zone.xMin, x)), y, z);
      elevs.push(Math.max(0, Math.min(1, yRatio)));
      fades.push(sideFade);
    }
  }

  const columns = ySegments + 1;
  for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
    for (let yIndex = 0; yIndex < ySegments; yIndex += 1) {
      const a = zIndex * columns + yIndex;
      const b = a + columns;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("elev", new THREE.Float32BufferAttribute(elevs, 1));
  geometry.setAttribute("zoneFade", new THREE.Float32BufferAttribute(fades, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createZone6Material = () =>
  new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(-0.38, 0.74, -0.42).normalize() },
      uSunColor: { value: new THREE.Color(0xffdf9f) },
      uAmbient: { value: new THREE.Color(0xbbe6ff) },
      uHorizon: { value: new THREE.Color(0x40595d) },
      uCamPos: { value: new THREE.Vector3() },
      uHazeDen: { value: 0.00014 },
      uDark: { value: 0 },
      uFire: { value: 0 },
    },
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
        float face = bl_fbm(vec2(vWorldPos.x * 0.006 + vWorldPos.y * 0.014, vWorldPos.z * 0.006));
        float grain = bl_fbm(vWorldPos.xz * 0.018 + 11.0);
        float strata = sin(vWorldPos.y * 0.044 + bl_fbm(vWorldPos.xz * 0.007 + 24.0) * 5.0) * 0.5 + 0.5;

        vec3 lowerForest = vec3(0.060, 0.142, 0.074) * (0.86 + face * 0.34);
        vec3 coldRock = mix(vec3(0.50, 0.54, 0.48), vec3(0.24, 0.31, 0.29), grain);
        coldRock = mix(coldRock, coldRock * vec3(1.20, 1.14, 0.92), strata * (1.0 - slope) * 0.18);
        vec3 highRidge = vec3(0.70, 0.73, 0.64) * (0.86 + face * 0.24);

        float rockMix = smoothstep(0.22, 0.58, vElev) * smoothstep(0.18, 0.88, 1.0 - slope);
        vec3 albedo = mix(lowerForest, coldRock, rockMix);
        float cap = smoothstep(0.68, 0.92, vElev + grain * 0.07) * smoothstep(0.24, 0.58, slope);
        albedo = mix(albedo, highRidge, cap * 0.34);
        albedo *= 0.84 + vFade * 0.18;

        float diffuse = max(dot(normal, uSunDir), 0.0);
        float rim = smoothstep(0.18, 1.0, 1.0 - abs(dot(normal, normalize(uCamPos - vWorldPos))));
        vec3 color = albedo * (uAmbient * (0.46 + slope * 0.34) + uSunColor * diffuse * 1.18);
        color *= 0.78 + smoothstep(0.08, 0.74, vElev) * 0.34;
        color += albedo * rim * 0.08;
        color += albedo * vec3(1.0, 0.28, 0.07) * uFire * 0.34;
        color = mix(color, color * vec3(0.78, 0.84, 0.92), uDark * 0.18);

        float distanceToCamera = distance(vWorldPos, uCamPos);
        float haze = 1.0 - exp(-pow(distanceToCamera * uHazeDen, 1.34));
        color = mix(color, uHorizon, clamp(haze, 0.0, 0.30));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

export const createZone6MountainExperimentSystem =
  (): Zone6MountainExperimentSystem => {
    const group = new THREE.Group();
    group.name = "Zone 6 native mountain back-arc experiment";
    const geometry = buildZone6Geometry();
    const material = createZone6Material();
    const positionAttribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const vertexAudit = auditMountainBackArcVertices(
      positionAttribute.array,
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Zone 6 bounded native mountain experiment";
    mesh.frustumCulled = false;
    group.add(mesh);
    group.visible = false;
    let active = false;

    const getTelemetry = () =>
      getMountainPlacementHarnessTelemetry({
        experimentActive: active,
        mountainVertices: positionAttribute.count,
        invalidVertexCount: vertexAudit.invalidVertexCount,
      });

    return {
      group,
      setActive: (nextActive) => {
        const telemetry = getMountainPlacementHarnessTelemetry({
          experimentActive: nextActive,
          mountainVertices: positionAttribute.count,
          invalidVertexCount: vertexAudit.invalidVertexCount,
        });
        active = telemetry.experimentActive;
        group.visible = active;
      },
      update: (weather, camera) => {
        if (!active) {
          return;
        }

        const palette = getWeatherPalette(weather.stormIndex);
        material.uniforms.uSunDir.value
          .set(-0.38, 0.74 - weather.dials.skyDark * 0.24, -0.42)
          .normalize();
        material.uniforms.uSunColor.value.setHex(palette.sunColor);
        material.uniforms.uAmbient.value.setHex(palette.ambientLight);
        material.uniforms.uHorizon.value.setHex(
          weather.dials.skyDark > 0.35 ? 0x25343a : 0x40595d,
        );
        material.uniforms.uCamPos.value.copy(camera.position);
        material.uniforms.uHazeDen.value =
          0.00006 + weather.dials.fog * 0.00018 + weather.dials.skyDark * 0.00004;
        material.uniforms.uDark.value = weather.dials.skyDark;
        material.uniforms.uFire.value = weather.dials.fireWeather;
      },
      getTelemetry,
    };
  };
