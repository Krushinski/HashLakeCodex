import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { getWeatherPalette } from "./artDirection";
import { GLSL_NOISE, makeNoise2D } from "./scenicUtils";
import { LAKE_MAP } from "./lakeMap";

type TerrainStats = {
  mountainVertices: number;
  reflectionEnabled: boolean;
  postEnabled: boolean;
};

export type TerrainSystem = {
  group: THREE.Group;
  update: (weather: WeatherSnapshot, camera: THREE.PerspectiveCamera) => void;
  getStats: () => TerrainStats;
  setScenicBackdropActive: (active: boolean) => void;
  setNativeMountainsSuppressed: (active: boolean) => void;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
};

const pushMountainIndices = (
  indices: number[],
  columns: number,
  row: number,
  nextRow: number,
  col: number,
) => {
  const a = row * columns + col;
  const b = nextRow * columns + col;
  indices.push(a, b, a + 1, b, b + 1, a + 1);
};

const buildZone6BackArcRidge = ({
  xMin,
  xMax,
  zMin,
  zMax,
  peakMin,
  peakMax,
  seed,
  ridgeFrequency,
  hero,
}: {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  peakMin: number;
  peakMax: number;
  seed: number;
  ridgeFrequency: number;
  hero: boolean;
}) => {
  const noise = makeNoise2D(seed);
  const xSegments = hero ? 18 : 10;
  const zSegments = hero ? 72 : 56;
  const vertices: number[] = [];
  const elevs: number[] = [];
  const indices: number[] = [];

  for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
    const xT = xIndex / xSegments;
    const x = xMin + (xMax - xMin) * xT;
    const rise = Math.pow(Math.sin(Math.PI * xT), hero ? 1.04 : 1.25);
    const frontSeat = smoothstep(0.0, 0.18, xT);
    const rearSeat = 1 - smoothstep(0.82, 1.0, xT);
    for (let zIndex = 0; zIndex <= zSegments; zIndex += 1) {
      const zT = zIndex / zSegments;
      const z = zMin + (zMax - zMin) * zT;
      const sideFade = Math.pow(Math.sin(Math.PI * zT), 0.66);
      const broad =
        noise.fbm(z * 0.0028 + seed, x * 0.0022 + 4.7, 4) * 0.76 + 0.46;
      const ridgeNoise = Math.pow(Math.max(0, Math.min(1, broad)), hero ? 1.74 : 1.46);
      const ridgeLine =
        0.55 +
        0.45 *
          Math.sin(
            z * (hero ? 0.0044 : 0.0058) +
              noise.fbm(x * 0.0022, z * 0.0026, 3) * ridgeFrequency +
              seed,
          );
      const peakHeight =
        (peakMin + (peakMax - peakMin) * Math.max(ridgeNoise, ridgeLine * 0.62)) *
        sideFade *
        frontSeat *
        rearSeat;
      const detail =
        noise.fbm(x * 0.004 + 31, z * 0.004 + 17, 4) *
        peakHeight *
        (hero ? 0.28 : 0.2) *
        Math.max(rise, 0);
      const y = 2.25 + Math.max(0, peakHeight * Math.max(rise, 0) + detail);
      vertices.push(x, y, z);
      elevs.push(y / peakMax);
    }
  }

  const columns = zSegments + 1;
  for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
    for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
      pushMountainIndices(indices, columns, xIndex, xIndex + 1, zIndex);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("elev", new THREE.Float32BufferAttribute(elevs, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createTerrainMaterial = (
  shared: {
    sunDir: { value: THREE.Vector3 };
    sunColor: { value: THREE.Color };
    horizon: { value: THREE.Color };
    ambient: { value: THREE.Color };
    cameraPosition: { value: THREE.Vector3 };
    hazeDensity: { value: number };
    fire: { value: number };
    dark: { value: number };
  },
  snowLine: number,
  forestAmount: number,
) =>
  new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: shared.sunDir,
      uSunColor: shared.sunColor,
      uHorizon: shared.horizon,
      uAmbient: shared.ambient,
      uCamPos: shared.cameraPosition,
      uHazeDen: shared.hazeDensity,
      uFire: shared.fire,
      uDark: shared.dark,
      uSnowLine: { value: snowLine },
      uForest: { value: forestAmount },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vElev;
      attribute float elev;

      void main() {
        vElev = elev;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vElev;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uHorizon;
      uniform vec3 uAmbient;
      uniform vec3 uCamPos;
      uniform float uHazeDen;
      uniform float uFire;
      uniform float uDark;
      uniform float uSnowLine;
      uniform float uForest;
      ${GLSL_NOISE}

      void main() {
        vec3 normal = normalize(vNormal);
        float slope = clamp(normal.y, 0.0, 1.0);
        float roughNoise = bl_fbm(vWorldPos.xz * 0.012);
        float broadNoise = bl_fbm(vWorldPos.xz * 0.0028 + 7.0);
        float strata = sin(vWorldPos.y * 0.034 + bl_fbm(vWorldPos.xz * 0.006 + 31.0) * 4.2) * 0.5 + 0.5;
        float faceBreakup = bl_fbm(vec2(vWorldPos.x * 0.015 + vWorldPos.y * 0.009, vWorldPos.z * 0.015));
        vec3 rock = mix(vec3(0.60, 0.60, 0.55), vec3(0.30, 0.35, 0.34), roughNoise)
          * (0.86 + 0.25 * broadNoise);
        rock = mix(rock, rock * vec3(1.24, 1.18, 0.98), strata * (1.0 - slope) * 0.17);
        rock = mix(rock, rock * vec3(0.86, 0.92, 0.98), faceBreakup * (1.0 - slope) * 0.10);
        float forest = smoothstep(0.45, 0.16, vElev) * smoothstep(0.34, 0.62, slope) * uForest;
        vec3 forestColor = vec3(0.086, 0.166, 0.096)
          * (0.86 + 0.46 * bl_fbm(vWorldPos.xz * 0.022 + 3.0));
        forestColor = mix(forestColor, forestColor * vec3(1.24, 1.15, 0.82), broadNoise * 0.16);
        vec3 albedo = mix(rock, forestColor, forest);
        float snow = smoothstep(uSnowLine, uSnowLine + 0.13, vElev + roughNoise * 0.07)
          * smoothstep(0.18, 0.46, slope);
        albedo = mix(albedo, vec3(0.80, 0.80, 0.74), snow * 0.22);

        float diffuse = max(dot(normal, uSunDir), 0.0);
        vec3 color = albedo * (uSunColor * diffuse * 1.30 + uAmbient * (0.45 + 0.52 * slope));
        vec3 sideNormal = normalize(vec3(normal.x, 0.0, normal.z) + vec3(0.001, 0.0, 0.001));
        float sideLight = smoothstep(-0.55, 0.70, dot(sideNormal, normalize(vec3(-0.72, 0.0, -0.44))));
        color *= 0.86 + sideLight * 0.40;
        color *= 0.84 + slope * 0.27;
        float valleyShade = smoothstep(0.08, 0.52, vElev);
        float shadowBand = smoothstep(0.22, 0.82, bl_fbm(vec2(vWorldPos.x * 0.006, vWorldPos.y * 0.013) + 12.0));
        color *= (0.80 + valleyShade * 0.23) * (0.92 + shadowBand * 0.08);
        color += albedo * vec3(1.0, 0.32, 0.07) * uFire * 0.42;
        color = mix(color, color * vec3(0.82, 0.86, 0.93), uDark * 0.16);

        float distanceToCamera = distance(vWorldPos, uCamPos);
        float haze = 1.0 - exp(-pow(distanceToCamera * uHazeDen, 1.45));
        color = mix(color, uHorizon, clamp(haze, 0.0, 0.46));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

export const createTerrainSystem = (): TerrainSystem => {
  const shared = {
    sunDir: { value: new THREE.Vector3(-0.36, 0.72, -0.44).normalize() },
    sunColor: { value: new THREE.Color(0xffdf9f) },
    horizon: { value: new THREE.Color(0xd8edf2) },
    ambient: { value: new THREE.Color(0xbbe6ff) },
    cameraPosition: { value: new THREE.Vector3() },
    hazeDensity: { value: 0.0003 },
    fire: { value: 0 },
    dark: { value: 0 },
  };
  const group = new THREE.Group();
  group.name = "Zone 6 back-arc native ridge terrain";

  const far = new THREE.Mesh(
    buildZone6BackArcRidge({
      xMin: LAKE_MAP.mapBounds.maxX + 760,
      xMax: LAKE_MAP.mapBounds.maxX + 1480,
      zMin: LAKE_MAP.mapBounds.minZ - 330,
      zMax: LAKE_MAP.mapBounds.maxZ + 330,
      peakMin: 116,
      peakMax: 352,
      seed: 21,
      ridgeFrequency: 2.4,
      hero: true,
    }),
    createTerrainMaterial(shared, 1.12, 0.9),
  );
  const mid = new THREE.Mesh(
    buildZone6BackArcRidge({
      xMin: LAKE_MAP.mapBounds.maxX + 560,
      xMax: LAKE_MAP.mapBounds.maxX + 980,
      zMin: LAKE_MAP.mapBounds.minZ - 300,
      zMax: LAKE_MAP.mapBounds.maxZ + 300,
      peakMin: 22,
      peakMax: 88,
      seed: 53,
      ridgeFrequency: 3.1,
      hero: false,
    }),
    createTerrainMaterial(shared, 0.86, 1),
  );
  far.name = "Zone 6 far perimeter ridge";
  mid.name = "Zone 6 foothill perimeter ridge";
  far.frustumCulled = false;
  mid.frustumCulled = false;
  group.add(far, mid);
  let scenicBackdropActive = false;
  let nativeMountainsSuppressed = false;

  const vertexCount =
    far.geometry.attributes.position.count +
    mid.geometry.attributes.position.count;

  return {
    group,
    update: (weather, camera) => {
      const nativeVisible = !scenicBackdropActive && !nativeMountainsSuppressed;
      far.visible = nativeVisible;
      mid.visible = nativeVisible;
      const palette = getWeatherPalette(weather.stormIndex);
      shared.sunDir.value.set(-0.36, 0.72 - weather.dials.skyDark * 0.28, -0.44).normalize();
      shared.sunColor.value.setHex(palette.sunColor);
      shared.horizon.value.setHex(
        weather.dials.fireWeather > 0.25
          ? palette.skyHorizon
          : weather.dials.skyDark > 0.35
            ? 0x25343a
            : 0x40595d,
      );
      shared.ambient.value.setHex(palette.ambientLight);
      shared.cameraPosition.value.copy(camera.position);
      shared.hazeDensity.value = 0.00008 + weather.dials.fog * 0.00040 + weather.dials.skyDark * 0.00006;
      shared.fire.value = weather.dials.fireWeather;
      shared.dark.value = weather.dials.skyDark;
    },
    getStats: () => ({
      mountainVertices: scenicBackdropActive || nativeMountainsSuppressed ? 0 : vertexCount,
      reflectionEnabled: false,
      postEnabled: true,
    }),
    setScenicBackdropActive: (active) => {
      scenicBackdropActive = active;
    },
    setNativeMountainsSuppressed: (active) => {
      nativeMountainsSuppressed = active;
    },
  };
};
