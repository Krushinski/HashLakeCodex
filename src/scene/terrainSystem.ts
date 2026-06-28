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
  const thetaSegments = 192;
  const radialSegments = 14;
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
      ? 0.09 + rearArc * 1.02
      : 0.14 + shoulderArc * 0.30 + rearArc * 0.86;
    let ridge =
      noise.fbm(cos * ridgeFrequency + 9.2, sin * ridgeFrequency + 4.7, 5) * 0.82 + 0.58;
    ridge = Math.pow(Math.max(0, Math.min(1, ridge)), hero ? 1.86 : 1.46);
    const jag =
      (Math.sin(theta * 13.0 + seed) * 0.5 + 0.5) *
      Math.max(0, noise.fbm(cos * 8.2 + seed, sin * 8.2 + 2.4, 4));
    const knife =
      Math.max(0, Math.sin(theta * (hero ? 17.0 : 12.0) + seed * 0.41)) *
      Math.max(0, noise.fbm(cos * 12.0 - seed, sin * 12.0 + seed, 4));
    const saw =
      Math.pow(Math.max(0, Math.sin(theta * (hero ? 31.0 : 20.0) + seed * 0.19)), 2.4) *
      Math.max(0, noise.fbm(cos * 18.0 + seed * 0.4, sin * 18.0 - seed * 0.2, 3));
    const tooth =
      Math.pow(Math.max(0, Math.sin(theta * (hero ? 43.0 : 27.0) + seed * 0.11)), 3.2) *
      Math.max(0, noise.fbm(cos * 24.0 - seed * 0.3, sin * 24.0 + seed * 0.5, 3));
    ridge +=
      jag * (hero ? 0.34 : 0.32) +
      Math.pow(knife, 1.12) * (hero ? 0.36 : 0.34) +
      saw * (hero ? 0.24 : 0.26) +
      tooth * (hero ? 0.22 : 0.18);

    if (hero) {
      const centerPeak = angleDiff(theta, viewTheta + 0.1);
      const sidePeak = angleDiff(theta, viewTheta - 0.62);
      const rightPeak = angleDiff(theta, viewTheta + 0.56);
      ridge += 0.72 * Math.exp(-(centerPeak * centerPeak) / (0.25 * 0.25));
      ridge += 0.42 * Math.exp(-(sidePeak * sidePeak) / (0.22 * 0.22));
      ridge += 0.34 * Math.exp(-(rightPeak * rightPeak) / (0.30 * 0.30));
      ridge = Math.min(ridge, 1.96);
    }

    const peakHeight = (peakMin + (peakMax - peakMin) * ridge) * heightMask;
    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const radial = radialIndex / radialSegments;
      const radius = rInner + (rOuter - rInner) * radial;
      const ridgeSpine = Math.sin(Math.PI * Math.min(radial / 0.82, 1) * 0.5);
      const outerFalloff = radial < 0.82 ? 1 : 1 - (radial - 0.82) / 0.26;
      const heroLowerScoop = hero ? 0.50 + smoothstep(0.34, 0.74, radial) * 0.50 : 1;
      const rise = Math.pow(ridgeSpine, hero ? 1.22 : 1.08) * outerFalloff * heroLowerScoop;
      const crag =
        Math.max(0, Math.sin(theta * (hero ? 29.0 : 22.0) + radial * 8.0 + seed * 0.31)) *
        Math.max(0, noise.fbm(cos * 16.0 + radial * 3.5, sin * 16.0 - radial * 2.5, 3));
      const buttress =
        Math.max(0, Math.sin(theta * (hero ? 9.0 : 7.0) + radial * 3.2 + seed * 0.72)) *
        Math.max(0, noise.fbm(cos * 5.6 + radial * 2.2, sin * 5.6 - radial * 1.9, 3));
      const facetSignA = Math.sin(theta * (hero ? 11.0 : 9.0) + seed * 0.33) > 0.0 ? 1 : -1;
      const facetSignB = Math.sin(theta * (hero ? 19.0 : 15.0) + radial * 3.0 + seed * 0.61) > 0.0 ? 1 : -1;
      const facetPlane =
        (facetSignA * 0.65 + facetSignB * 0.35) *
        peakHeight *
        (hero ? 0.060 : 0.085) *
        Math.max(0, rise) *
        Math.max(0, 1 - Math.abs(radial - 0.54) * 1.9);
      const detail =
        noise.fbm(cos * radius * 0.004 + 31, sin * radius * 0.004 + 17, 4) *
        peakHeight *
        (hero ? 0.50 : 0.46) *
        Math.max(rise, 0);
      const ravine =
        Math.max(0, Math.sin(theta * (hero ? 21.0 : 14.0) + radial * 5.2 + seed)) *
        Math.max(0, 1 - Math.abs(radial - 0.58) * 2.1) *
        peakHeight *
        (hero ? 0.16 : 0.115);
      const verticalCut =
        Math.max(0, Math.sin(theta * (hero ? 37.0 : 24.0) + seed * 0.68)) *
        Math.max(0, 1 - Math.abs(radial - 0.48) * 2.7) *
        peakHeight *
        (hero ? 0.115 : 0.085);
      const ledge =
        Math.sin(radial * 18.0 + theta * 4.0 + seed) *
        peakHeight *
        (hero ? 0.052 : 0.046) *
        Math.max(0, rise);
      const y = Math.max(
        0,
        peakHeight * Math.max(rise, 0) +
          detail -
          ravine -
          verticalCut +
          ledge +
          facetPlane +
          crag * peakHeight * (hero ? 0.110 : 0.140) * Math.max(rise, 0) +
          buttress * peakHeight * (hero ? 0.080 : 0.115) * Math.max(0, rise),
      );
      const basalCut =
        hero
          ? peakHeight *
            (1 - smoothstep(0.26, 0.64, radial)) *
            (0.30 + rearArc * 0.28)
          : 0;
      const seatedY = Math.max(0, y - basalCut);
      const baseSeat = radial < 0.08 ? -18 * (1 - smoothstep(0.0, 0.08, radial)) : 0;
      vertices.push(cos * radius, seatedY + baseSeat, sin * radius);
      elevs.push(Math.max(0, seatedY) / peakMax);
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

const buildFoothillSealRing = () => {
  const noise = makeNoise2D(89);
  const thetaSegments = 224;
  const radialSegments = 8;
  const rInner = 700;
  const rOuter = 1240;
  const vertices: number[] = [];
  const elevs: number[] = [];
  const indices: number[] = [];

  for (let thetaIndex = 0; thetaIndex < thetaSegments; thetaIndex += 1) {
    const theta = (thetaIndex / thetaSegments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const lowRoll = noise.fbm(cos * 2.1 + 6, sin * 2.1 - 9, 3);
    const ridgeRoll = noise.fbm(cos * 6.4 - 14, sin * 6.4 + 11, 3);

    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const radial = radialIndex / radialSegments;
      const radius = rInner + (rOuter - rInner) * radial;
      const baseRise = smoothstep(0.05, 0.84, radial);
      const crease =
        Math.max(0, Math.sin(theta * 18.0 + radial * 4.0 + 1.7)) *
        Math.max(0, 1 - Math.abs(radial - 0.72) * 2.4);
      const bench =
        Math.max(0, Math.sin(theta * 11.0 + radial * 5.2 + 0.9)) *
        Math.max(0, 1 - Math.abs(radial - 0.60) * 2.8);
      const y =
        1.9 +
        baseRise * 188 +
        lowRoll * 14 +
        ridgeRoll * 34 * baseRise +
        crease * 58 +
        bench * 34;
      vertices.push(cos * radius, Math.max(1.8, y), sin * radius);
      elevs.push(baseRise);
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

const createFoothillSealMaterial = (
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
      ${GLSL_NOISE}

      void main() {
        vec3 normal = normalize(vNormal);
        float grain = bl_fbm(vWorldPos.xz * 0.018);
        float broad = bl_fbm(vWorldPos.xz * 0.003 + 18.0);
        float fractureA = bl_fbm(vec2(vWorldPos.x * 0.020 + vWorldPos.y * 0.012, vWorldPos.z * 0.024 - vWorldPos.y * 0.018));
        float fractureB = bl_fbm(vec2(vWorldPos.x * -0.030 + vWorldPos.y * 0.018, vWorldPos.z * 0.014 + vWorldPos.y * 0.026));
        float chipMask = smoothstep(0.36, 0.78, fractureA) * smoothstep(0.26, 0.72, 1.0 - fractureB);
        float rib = smoothstep(0.54, 0.92, bl_fbm(vec2(vWorldPos.x * 0.012 + vWorldPos.y * 0.018, vWorldPos.z * 0.014 + grain * 1.4)))
          * (0.12 + chipMask * 0.28);
        float shadowCrack = smoothstep(
          0.66,
          0.994,
          sin(vWorldPos.x * -0.104 + vWorldPos.z * 0.062 + vWorldPos.y * 0.236 + grain * 8.8) * 0.5 + 0.5
        ) * smoothstep(0.44, 0.84, fractureB);
        float ledge = smoothstep(0.58, 0.90, bl_fbm(vec2(vWorldPos.x * -0.010 + vWorldPos.y * 0.016, vWorldPos.z * 0.015 + broad * 1.8)))
          * smoothstep(0.38, 0.82, fractureA) * 0.36;
        float brightSlash = smoothstep(0.78, 0.96, bl_fbm(vec2(vWorldPos.x * 0.018 + vWorldPos.y * 0.018, vWorldPos.z * -0.012 + grain * 2.1)))
          * smoothstep(0.54, 0.92, chipMask) * 0.28;
        float narrowSnow = smoothstep(0.84, 0.98, bl_fbm(vec2(vWorldPos.x * 0.010 + vWorldPos.y * 0.020, vWorldPos.z * 0.012 + broad * 1.5)));
        float cliffFace = smoothstep(0.24, 0.80, 1.0 - normal.y);
        float highFace = smoothstep(0.22, 0.78, vElev);
        vec3 lowForest = vec3(0.010, 0.040, 0.025);
        vec3 moss = vec3(0.038, 0.090, 0.044);
        vec3 granite = vec3(0.660, 0.650, 0.570);
        vec3 graniteLight = vec3(1.000, 0.960, 0.720);
        vec3 graniteDark = vec3(0.034, 0.056, 0.058);
        vec3 albedo = mix(lowForest, moss, smoothstep(0.10, 0.88, broad));
        albedo = mix(albedo, granite, clamp(highFace * 1.08 + cliffFace * 0.62, 0.0, 0.98));
        albedo = mix(albedo, graniteDark, rib * (0.20 + highFace * 0.28));
        albedo = mix(albedo, vec3(0.018, 0.038, 0.042), shadowCrack * cliffFace * (0.14 + highFace * 0.24));
        albedo = mix(albedo, graniteLight, ledge * (0.42 + highFace * 0.58) * (0.22 + cliffFace * 0.78));
        albedo = mix(albedo, vec3(1.00, 0.98, 0.78), brightSlash * highFace * cliffFace * 0.48);
        albedo = mix(albedo, vec3(0.88, 0.88, 0.80), narrowSnow * highFace * cliffFace * 0.10);
        float diffuse = max(dot(normal, uSunDir), 0.0);
        vec3 color = albedo * (uAmbient * 0.54 + uSunColor * diffuse * 0.56);
        color *= 0.88 + vElev * 0.54;
        color += albedo * vec3(1.0, 0.28, 0.06) * uFire * 0.30;
        color = mix(color, color * vec3(0.74, 0.80, 0.88), uDark * 0.22);
        float haze = 1.0 - exp(-pow(distance(vWorldPos, uCamPos) * uHazeDen, 1.32));
        color = mix(color, uHorizon, clamp(haze, 0.0, 0.24));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

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
        float cliff = smoothstep(0.84, 0.22, slope);
        float facetNoiseA = bl_fbm(vec2(vWorldPos.x * 0.018 + vWorldPos.y * 0.014, vWorldPos.z * 0.026 - vWorldPos.y * 0.020) + 11.0);
        float facetNoiseB = bl_fbm(vec2(vWorldPos.x * -0.024 + vWorldPos.y * 0.020, vWorldPos.z * 0.018 + vWorldPos.y * 0.030) + 23.0);
        float fractureMask = smoothstep(0.34, 0.76, facetNoiseA) * smoothstep(0.28, 0.76, 1.0 - facetNoiseB);
        float strata = bl_fbm(vec2(vWorldPos.x * 0.004 + vWorldPos.y * 0.010, vWorldPos.z * 0.005 + 31.0));
        strata = smoothstep(0.44, 0.82, strata) * (0.08 + fractureMask * 0.16);
        float verticalGrain = bl_fbm(vec2(vWorldPos.x * 0.018 + vWorldPos.y * 0.026, vWorldPos.z * 0.010 + vWorldPos.y * 0.018));
        float faceBreakup = bl_fbm(vec2(vWorldPos.x * 0.014 + vWorldPos.y * 0.012, vWorldPos.z * 0.014));
        float alpineRibs = smoothstep(
          0.54,
          0.975,
          sin(vWorldPos.x * 0.088 + vWorldPos.z * 0.038 + vWorldPos.y * 0.150 + faceBreakup * 7.4) * 0.5 + 0.5
        ) * cliff * (0.34 + fractureMask * 0.66);
        float screeLines = smoothstep(0.66, 0.94, bl_fbm(vec2(vWorldPos.x * -0.010 + vWorldPos.y * 0.022, vWorldPos.z * 0.014 + roughNoise * 1.6)))
          * cliff * smoothstep(0.42, 0.82, facetNoiseA) * 0.34;
        float heroEdge = smoothstep(
          0.76,
          0.992,
          sin(vWorldPos.x * 0.130 + vWorldPos.z * -0.060 + vWorldPos.y * 0.192 + faceBreakup * 8.2) * 0.5 + 0.5
        ) * cliff * smoothstep(0.18, 0.82, vElev) * smoothstep(0.36, 0.82, fractureMask);
        float knifeHighlight = smoothstep(
          0.86,
          0.995,
          sin(vWorldPos.x * 0.172 + vWorldPos.z * -0.084 + vWorldPos.y * 0.236 + faceBreakup * 9.4) * 0.5 + 0.5
        ) * cliff * smoothstep(0.22, 0.76, vElev) * smoothstep(0.46, 0.88, facetNoiseB);
        float verticalCleavage = smoothstep(
          0.54,
          0.985,
          sin(vWorldPos.x * 0.032 + vWorldPos.z * -0.086 + vWorldPos.y * 0.190 + verticalGrain * 4.8) * 0.5 + 0.5
        ) * cliff * (0.38 + smoothstep(0.42, 0.86, facetNoiseB) * 0.62);
        float facePlane = smoothstep(
          0.48,
          0.94,
          sin(vWorldPos.x * -0.022 + vWorldPos.z * 0.106 + vWorldPos.y * 0.044 + broadNoise * 5.0) * 0.5 + 0.5
        ) * cliff * smoothstep(0.30, 0.72, facetNoiseA);
        vec3 graniteWarm = vec3(0.82, 0.78, 0.66);
        vec3 graniteCool = vec3(0.50, 0.56, 0.55);
        vec3 graniteDark = vec3(0.060, 0.105, 0.108);
        vec3 rock = mix(graniteWarm, graniteCool, roughNoise);
        rock = mix(rock, graniteDark, cliff * (0.14 + 0.18 * (1.0 - broadNoise)));
        rock = mix(rock, rock * vec3(1.10, 1.08, 0.98), strata * cliff * 0.10);
        rock = mix(rock, rock * vec3(0.66, 0.75, 0.80), verticalGrain * cliff * 0.26);
        rock = mix(rock, rock * vec3(0.38, 0.48, 0.52), alpineRibs * 0.34);
        rock = mix(rock, rock * vec3(0.46, 0.54, 0.58), verticalCleavage * 0.28);
        rock = mix(rock, rock * vec3(1.76, 1.58, 1.20), facePlane * 0.34);
        rock = mix(rock, rock * vec3(1.38, 1.30, 1.08), screeLines * (1.0 - alpineRibs * 0.55) * 0.18);
        rock = mix(rock, vec3(1.00, 0.95, 0.70), heroEdge * 0.52);
        rock = mix(rock, vec3(1.00, 1.00, 0.78), knifeHighlight * 0.56);
        rock *= 0.82 + 0.34 * broadNoise + 0.18 * faceBreakup;
        float forest = smoothstep(0.10, 0.026, vElev) * smoothstep(0.58, 0.88, slope) * uForest;
        forest *= 1.0 - smoothstep(0.08, 0.26, cliff);
        vec3 forestColor = vec3(0.050, 0.128, 0.066)
          * (0.86 + 0.40 * bl_fbm(vWorldPos.xz * 0.020 + 3.0));
        forestColor = mix(forestColor, forestColor * vec3(1.16, 1.12, 0.82), broadNoise * 0.12);
        vec3 albedo = mix(rock, forestColor, forest);
        float snow = smoothstep(uSnowLine - 0.14, uSnowLine + 0.08, vElev + roughNoise * 0.06)
          * smoothstep(0.16, 0.58, slope);
        float sunCap = smoothstep(uSnowLine - 0.24, uSnowLine + 0.04, vElev + strata * 0.05)
          * smoothstep(0.22, 0.70, slope);
        albedo = mix(albedo, vec3(0.90, 0.89, 0.82), snow * 0.30);
        albedo = mix(albedo, vec3(0.88, 0.83, 0.62), sunCap * 0.17);

        float diffuse = max(dot(normal, uSunDir), 0.0);
        vec3 color = albedo * (uSunColor * diffuse * 1.30 + uAmbient * (0.45 + 0.52 * slope));
        vec3 sideNormal = normalize(vec3(normal.x, 0.0, normal.z) + vec3(0.001, 0.0, 0.001));
        float sideLight = smoothstep(-0.55, 0.70, dot(sideNormal, normalize(vec3(-0.72, 0.0, -0.44))));
        color *= 0.74 + sideLight * 0.52;
        color *= 0.78 + slope * 0.34;
        float valleyShade = smoothstep(0.08, 0.52, vElev);
        float shadowBand = smoothstep(0.22, 0.82, bl_fbm(vec2(vWorldPos.x * 0.006, vWorldPos.y * 0.013) + 12.0));
        float verticalShadow = smoothstep(0.20, 0.86, bl_fbm(vec2(vWorldPos.x * 0.004 + vWorldPos.y * 0.018, vWorldPos.z * 0.006) + 18.0));
        color *= (0.88 + valleyShade * 0.24) * (0.96 + shadowBand * 0.08) * (0.92 + verticalShadow * 0.14);
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
      peakMin: 168,
      peakMax: 585,
      seed: 21,
      ridgeFrequency: 2.4,
      hero: true,
    }),
    createTerrainMaterial(shared, 1.12, 0.9),
  );
  const mid = new THREE.Mesh(
    buildRidgeRing({
      rInner: 880,
      rOuter: 1320,
      peakMin: 190,
      peakMax: 530,
      seed: 53,
      ridgeFrequency: 3.85,
      hero: false,
    }),
    createTerrainMaterial(shared, 0.42, 0.02),
  );
  const foothillSeal = new THREE.Mesh(
    buildFoothillSealRing(),
    createFoothillSealMaterial(shared),
  );
  far.name = "Far HashLake ridge";
  mid.name = "Mid HashLake ridge";
  foothillSeal.name = "Native mountain base foothill seal";
  far.frustumCulled = false;
  mid.frustumCulled = false;
  foothillSeal.frustumCulled = false;
  group.add(foothillSeal, far, mid);
  let scenicBackdropActive = false;
  let nativeMountainsSuppressed = false;

  const vertexCount =
    foothillSeal.geometry.attributes.position.count +
    far.geometry.attributes.position.count +
    mid.geometry.attributes.position.count;

  return {
    group,
    update: (weather, camera) => {
      const nativeVisible = !scenicBackdropActive && !nativeMountainsSuppressed;
      foothillSeal.visible = nativeVisible;
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
