import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { getWeatherPalette } from "./artDirection";
import { GLSL_NOISE, makeNoise2D } from "./scenicUtils";

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

const angleDiff = (a: number, b: number) => {
  let delta = a - b;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
};

const buildRidgeRing = ({
  rInner,
  rOuter,
  peakMin,
  peakMax,
  seed,
  ridgeFrequency,
  hero,
}: {
  rInner: number;
  rOuter: number;
  peakMin: number;
  peakMax: number;
  seed: number;
  ridgeFrequency: number;
  hero: boolean;
}) => {
  const noise = makeNoise2D(seed);
  const thetaSegments = 160;
  const radialSegments = 12;
  const vertices: number[] = [];
  const elevs: number[] = [];
  const indices: number[] = [];
  const viewTheta = -Math.PI / 2;

  for (let thetaIndex = 0; thetaIndex < thetaSegments; thetaIndex += 1) {
    const theta = (thetaIndex / thetaSegments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const rearAlignment = Math.cos(angleDiff(theta, viewTheta));
    const rearArc = smoothstep(-0.04, 0.72, rearAlignment);
    const shoulderArc = smoothstep(-0.42, 0.32, rearAlignment);
    const heightMask = hero
      ? 0.09 + rearArc * 0.98
      : 0.09 + shoulderArc * 0.15 + rearArc * 0.78;
    let ridge =
      noise.fbm(cos * ridgeFrequency + 9.2, sin * ridgeFrequency + 4.7, 5) * 0.82 + 0.58;
    ridge = Math.pow(Math.max(0, Math.min(1, ridge)), hero ? 1.72 : 1.58);
    const jag =
      (Math.sin(theta * 13.0 + seed) * 0.5 + 0.5) *
      Math.max(0, noise.fbm(cos * 8.2 + seed, sin * 8.2 + 2.4, 3));
    const knife =
      Math.max(0, Math.sin(theta * (hero ? 17.0 : 12.0) + seed * 0.41)) *
      Math.max(0, noise.fbm(cos * 12.0 - seed, sin * 12.0 + seed, 3));
    ridge += jag * (hero ? 0.20 : 0.10) + Math.pow(knife, 1.35) * (hero ? 0.18 : 0.06);

    if (hero) {
      const centerPeak = angleDiff(theta, viewTheta + 0.1);
      const sidePeak = angleDiff(theta, viewTheta - 0.62);
      const rightPeak = angleDiff(theta, viewTheta + 0.56);
      ridge += 0.72 * Math.exp(-(centerPeak * centerPeak) / (0.25 * 0.25));
      ridge += 0.42 * Math.exp(-(sidePeak * sidePeak) / (0.22 * 0.22));
      ridge += 0.34 * Math.exp(-(rightPeak * rightPeak) / (0.30 * 0.30));
      ridge = Math.min(ridge, 1.55);
    }

    const peakHeight = (peakMin + (peakMax - peakMin) * ridge) * heightMask;
    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const radial = radialIndex / radialSegments;
      const radius = rInner + (rOuter - rInner) * radial;
      const ridgeSpine = Math.sin(Math.PI * Math.min(radial / 0.82, 1) * 0.5);
      const outerFalloff = radial < 0.82 ? 1 : 1 - (radial - 0.82) / 0.26;
      const rise = Math.pow(ridgeSpine, hero ? 1.05 : 1.18) * outerFalloff;
      const detail =
        noise.fbm(cos * radius * 0.004 + 31, sin * radius * 0.004 + 17, 4) *
        peakHeight *
        (hero ? 0.34 : 0.20) *
        Math.max(rise, 0);
      const ravine =
        Math.max(0, Math.sin(theta * (hero ? 21.0 : 14.0) + radial * 5.2 + seed)) *
        Math.max(0, 1 - Math.abs(radial - 0.58) * 2.1) *
        peakHeight *
        (hero ? 0.10 : 0.04);
      const ledge =
        Math.sin(radial * 18.0 + theta * 4.0 + seed) *
        peakHeight *
        (hero ? 0.035 : 0.018) *
        Math.max(0, rise);
      const y = Math.max(0, peakHeight * Math.max(rise, 0) + detail - ravine + ledge);
      vertices.push(cos * radius, y, sin * radius);
      elevs.push(y / peakMax);
    }
  }

  const columns = radialSegments + 1;
  for (let thetaIndex = 0; thetaIndex < thetaSegments; thetaIndex += 1) {
    const nextThetaIndex = (thetaIndex + 1) % thetaSegments;
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const a = thetaIndex * columns + radialIndex;
      const b = nextThetaIndex * columns + radialIndex;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
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
        float roughNoise = bl_fbm(vWorldPos.xz * 0.010);
        float broadNoise = bl_fbm(vWorldPos.xz * 0.0024 + 7.0);
        float cliff = smoothstep(0.74, 0.18, slope);
        float strata = sin(vWorldPos.y * 0.050 + bl_fbm(vWorldPos.xz * 0.005 + 31.0) * 5.6) * 0.5 + 0.5;
        float verticalGrain = bl_fbm(vec2(vWorldPos.x * 0.018 + vWorldPos.y * 0.026, vWorldPos.z * 0.010 + vWorldPos.y * 0.018));
        float faceBreakup = bl_fbm(vec2(vWorldPos.x * 0.014 + vWorldPos.y * 0.012, vWorldPos.z * 0.014));
        float alpineRibs = smoothstep(
          0.50,
          0.94,
          sin(vWorldPos.x * 0.034 + vWorldPos.z * 0.018 + vWorldPos.y * 0.072 + faceBreakup * 4.0) * 0.5 + 0.5
        ) * cliff;
        float screeLines = smoothstep(
          0.64,
          0.98,
          sin(vWorldPos.x * -0.018 + vWorldPos.z * 0.036 + vWorldPos.y * 0.044 + roughNoise * 3.0) * 0.5 + 0.5
        ) * cliff;
        vec3 graniteWarm = vec3(0.58, 0.58, 0.53);
        vec3 graniteCool = vec3(0.34, 0.40, 0.41);
        vec3 graniteDark = vec3(0.12, 0.19, 0.17);
        vec3 rock = mix(graniteWarm, graniteCool, roughNoise);
        rock = mix(rock, graniteDark, cliff * (0.26 + 0.30 * (1.0 - broadNoise)));
        rock = mix(rock, rock * vec3(1.22, 1.16, 0.94), strata * cliff * 0.30);
        rock = mix(rock, rock * vec3(0.66, 0.75, 0.80), verticalGrain * cliff * 0.26);
        rock = mix(rock, rock * vec3(0.47, 0.55, 0.54), alpineRibs * 0.38);
        rock = mix(rock, rock * vec3(1.32, 1.25, 1.03), screeLines * (1.0 - alpineRibs) * 0.16);
        rock *= 0.82 + 0.34 * broadNoise + 0.18 * faceBreakup;
        float forest = smoothstep(0.30, 0.10, vElev) * smoothstep(0.34, 0.72, slope) * uForest;
        vec3 forestColor = vec3(0.050, 0.128, 0.066)
          * (0.86 + 0.40 * bl_fbm(vWorldPos.xz * 0.020 + 3.0));
        forestColor = mix(forestColor, forestColor * vec3(1.16, 1.12, 0.82), broadNoise * 0.12);
        vec3 albedo = mix(rock, forestColor, forest);
        float snow = smoothstep(uSnowLine - 0.14, uSnowLine + 0.08, vElev + roughNoise * 0.06)
          * smoothstep(0.16, 0.58, slope);
        float sunCap = smoothstep(uSnowLine - 0.24, uSnowLine + 0.04, vElev + strata * 0.05)
          * smoothstep(0.22, 0.70, slope);
        albedo = mix(albedo, vec3(0.82, 0.82, 0.76), snow * 0.24);
        albedo = mix(albedo, vec3(0.74, 0.72, 0.58), sunCap * 0.10);

        float diffuse = max(dot(normal, uSunDir), 0.0);
        vec3 color = albedo * (uSunColor * diffuse * 1.30 + uAmbient * (0.45 + 0.52 * slope));
        vec3 sideNormal = normalize(vec3(normal.x, 0.0, normal.z) + vec3(0.001, 0.0, 0.001));
        float sideLight = smoothstep(-0.55, 0.70, dot(sideNormal, normalize(vec3(-0.72, 0.0, -0.44))));
        color *= 0.74 + sideLight * 0.52;
        color *= 0.78 + slope * 0.34;
        float valleyShade = smoothstep(0.08, 0.52, vElev);
        float shadowBand = smoothstep(0.22, 0.82, bl_fbm(vec2(vWorldPos.x * 0.006, vWorldPos.y * 0.013) + 12.0));
        float verticalShadow = smoothstep(0.20, 0.86, bl_fbm(vec2(vWorldPos.x * 0.004 + vWorldPos.y * 0.018, vWorldPos.z * 0.006) + 18.0));
        color *= (0.68 + valleyShade * 0.36) * (0.86 + shadowBand * 0.12) * (0.78 + verticalShadow * 0.24);
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
  group.name = "HashLake3-adapted ridge terrain";

  const far = new THREE.Mesh(
    buildRidgeRing({
      rInner: 1040,
      rOuter: 1820,
      peakMin: 170,
      peakMax: 548,
      seed: 21,
      ridgeFrequency: 2.4,
      hero: true,
    }),
    createTerrainMaterial(shared, 1.12, 0.9),
  );
  const mid = new THREE.Mesh(
    buildRidgeRing({
      rInner: 820,
      rOuter: 1220,
      peakMin: 54,
      peakMax: 222,
      seed: 53,
      ridgeFrequency: 3.1,
      hero: false,
    }),
    createTerrainMaterial(shared, 0.86, 1),
  );
  far.name = "Far HashLake ridge";
  mid.name = "Mid HashLake ridge";
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
