import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { getWeatherPalette } from "./artDirection";
import { getExpandedOutline, type LakePoint } from "./lakeMap";
import { GLSL_NOISE, makeNoise2D } from "./scenicUtils";
import { RIBBON_CAKE_OUTER_OFFSET } from "./zoneBands";

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

const getRayPolygonIntersection = (theta: number, polygon: readonly LakePoint[]) => {
  const dx = Math.cos(theta);
  const dz = Math.sin(theta);
  let hit = 0;

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const sx = end.x - start.x;
    const sz = end.z - start.z;
    const denom = dx * sz - dz * sx;
    if (Math.abs(denom) < 0.00001) {
      continue;
    }

    const t = (start.x * sz - start.z * sx) / denom;
    const u = (start.x * dz - start.z * dx) / denom;
    if (t > hit && u >= -0.0001 && u <= 1.0001) {
      hit = t;
    }
  }

  return hit;
};

const contourCache = new Map<number, readonly LakePoint[]>();

const getContourPoint = (offset: number, theta: number) => {
  if (!contourCache.has(offset)) {
    contourCache.set(offset, getExpandedOutline(offset));
  }
  const outline = contourCache.get(offset) ?? [];
  const radius = getRayPolygonIntersection(theta, outline);
  return {
    x: Math.cos(theta) * radius,
    z: Math.sin(theta) * radius,
  };
};

const buildRidgeRing = ({
  innerOffset,
  outerOffset,
  peakMin,
  peakMax,
  seed,
  ridgeFrequency,
  hero,
}: {
  innerOffset: number;
  outerOffset: number;
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
      const innerPoint = getContourPoint(innerOffset, theta);
      const outerPoint = getContourPoint(outerOffset, theta);
      const x = innerPoint.x + (outerPoint.x - innerPoint.x) * radial;
      const z = innerPoint.z + (outerPoint.z - innerPoint.z) * radial;
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
        noise.fbm(x * 0.004 + 31, z * 0.004 + 17, 4) *
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
      vertices.push(x, seatedY + baseSeat, z);
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
  const radialSegments = 10;
  const innerOffset = RIBBON_CAKE_OUTER_OFFSET;
  const outerOffset = RIBBON_CAKE_OUTER_OFFSET + 470;
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
      const innerPoint = getContourPoint(innerOffset, theta);
      const outerPoint = getContourPoint(outerOffset, theta);
      const x = innerPoint.x + (outerPoint.x - innerPoint.x) * radial;
      const z = innerPoint.z + (outerPoint.z - innerPoint.z) * radial;
      const baseRise = smoothstep(0.02, 0.98, radial);
      const crease =
        Math.max(0, Math.sin(theta * 14.0 + radial * 3.2 + 1.7)) *
        Math.max(0, 1 - Math.abs(radial - 0.76) * 2.8);
      const bench =
        Math.max(0, Math.sin(theta * 7.0 + radial * 4.4 + 0.9)) *
        Math.max(0, 1 - Math.abs(radial - 0.52) * 2.4);
      const y =
        2.45 +
        baseRise * 25 +
        lowRoll * 4.5 +
        ridgeRoll * 5.5 * baseRise +
        crease * 4.0 +
        bench * 3.2;
      vertices.push(x, Math.max(2.32, y), z);
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

const buildForestedFoothillRiseRing = () => {
  const noise = makeNoise2D(137);
  const thetaSegments = 224;
  const radialSegments = 12;
  const innerOffset = RIBBON_CAKE_OUTER_OFFSET + 320;
  const outerOffset = RIBBON_CAKE_OUTER_OFFSET + 920;
  const vertices: number[] = [];
  const elevs: number[] = [];
  const indices: number[] = [];

  for (let thetaIndex = 0; thetaIndex < thetaSegments; thetaIndex += 1) {
    const theta = (thetaIndex / thetaSegments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const broad = noise.fbm(cos * 1.65 + 4.5, sin * 1.65 - 12.0, 4);
    const grove = noise.fbm(cos * 4.6 - 15.0, sin * 4.6 + 7.0, 4);
    const shoulder = noise.fbm(cos * 8.5 + 21.0, sin * 8.5 - 8.0, 3);

    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const radial = radialIndex / radialSegments;
      const innerPoint = getContourPoint(innerOffset, theta);
      const outerPoint = getContourPoint(outerOffset, theta);
      const x = innerPoint.x + (outerPoint.x - innerPoint.x) * radial;
      const z = innerPoint.z + (outerPoint.z - innerPoint.z) * radial;
      const rise = smoothstep(0.02, 0.98, radial);
      const backRise = smoothstep(0.48, 1.0, radial);
      const shelf = smoothstep(0.06, 0.34, radial) * (1 - smoothstep(0.78, 1.0, radial));
      const rollingCanopy =
        Math.max(0, Math.sin(theta * 9.0 + radial * 4.1 + 0.8)) *
        Math.max(0, 1 - Math.abs(radial - 0.68) * 2.2);
      const y =
        10 +
        rise * 24 +
        backRise * 54 +
        broad * 9 +
        grove * 8 * shelf +
        shoulder * 8 * backRise +
        rollingCanopy * 10;
      vertices.push(x, Math.max(7.0, y), z);
      elevs.push(rise);
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
        float forestPatch = smoothstep(0.34, 0.78, bl_fbm(vWorldPos.xz * 0.008 + 23.0));
        float earthPatch = smoothstep(0.58, 0.88, bl_fbm(vWorldPos.xz * 0.014 - 8.0)) * (1.0 - smoothstep(0.72, 1.0, vElev));
        vec3 lowForest = vec3(0.020, 0.070, 0.034);
        vec3 moss = vec3(0.068, 0.150, 0.056);
        vec3 grass = vec3(0.118, 0.220, 0.074);
        vec3 earth = vec3(0.104, 0.082, 0.046);
        vec3 albedo = mix(moss, grass, smoothstep(0.08, 0.86, broad));
        albedo = mix(albedo, lowForest, forestPatch * (0.34 + vElev * 0.32));
        albedo = mix(albedo, earth, earthPatch * 0.24);
        albedo *= 0.88 + grain * 0.16;
        float diffuse = max(dot(normal, uSunDir), 0.0);
        vec3 color = albedo * (uAmbient * 0.74 + uSunColor * diffuse * 0.44);
        color *= 0.92 + clamp(normal.y, 0.0, 1.0) * 0.22;
        color += albedo * vec3(1.0, 0.28, 0.06) * uFire * 0.30;
        color = mix(color, color * vec3(0.82, 0.88, 0.94), uDark * 0.12);
        float haze = 1.0 - exp(-pow(distance(vWorldPos, uCamPos) * uHazeDen, 1.32));
        color = mix(color, uHorizon, clamp(haze, 0.0, 0.18));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

const createForestedFoothillRiseMaterial = (
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
        float slope = clamp(normal.y, 0.0, 1.0);
        float broad = bl_fbm(vWorldPos.xz * 0.0028 + 9.0);
        float grassNoise = bl_fbm(vWorldPos.xz * 0.014 + 3.0);
        float forestNoise = bl_fbm(vWorldPos.xz * 0.007 + 17.0);
        float contour = smoothstep(0.12, 0.92, vElev);
        float grove = smoothstep(0.42, 0.80, forestNoise + contour * 0.26);
        float earthGate = smoothstep(0.52, 0.18, slope) * 0.38;
        vec3 nearGrass = vec3(0.096, 0.205, 0.066);
        vec3 moss = vec3(0.052, 0.128, 0.048);
        vec3 deepForest = vec3(0.022, 0.070, 0.034);
        vec3 earth = vec3(0.112, 0.088, 0.052);
        vec3 albedo = mix(nearGrass, moss, contour);
        albedo = mix(albedo, deepForest, grove * (0.36 + contour * 0.26));
        albedo = mix(albedo, earth, earthGate * (0.30 + broad * 0.26));
        albedo *= 0.84 + grassNoise * 0.22 + broad * 0.08;
        albedo = mix(albedo, vec3(0.030, 0.082, 0.036), smoothstep(0.62, 1.0, contour) * 0.18);

        float diffuse = max(dot(normal, uSunDir), 0.0);
        vec3 color = albedo * (uAmbient * 0.76 + uSunColor * diffuse * 0.50);
        color *= 0.90 + slope * 0.20;
        color += albedo * vec3(1.0, 0.30, 0.07) * uFire * 0.24;
        color = mix(color, color * vec3(0.82, 0.88, 0.94), uDark * 0.12);
        float haze = 1.0 - exp(-pow(distance(vWorldPos, uCamPos) * uHazeDen, 1.30));
        color = mix(color, uHorizon, clamp(haze, 0.0, 0.28));
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
      innerOffset: RIBBON_CAKE_OUTER_OFFSET + 390,
      outerOffset: RIBBON_CAKE_OUTER_OFFSET + 1020,
      peakMin: 148,
      peakMax: 505,
      seed: 21,
      ridgeFrequency: 2.4,
      hero: true,
    }),
    createTerrainMaterial(shared, 1.12, 0.9),
  );
  const foothillRise = new THREE.Mesh(
    buildForestedFoothillRiseRing(),
    createForestedFoothillRiseMaterial(shared),
  );
  const foothillSeal = new THREE.Mesh(
    buildFoothillSealRing(),
    createFoothillSealMaterial(shared),
  );
  far.name = "Far HashLake ridge";
  foothillRise.name = "Forested foothill rise";
  foothillSeal.name = "Native mountain base foothill seal";
  far.frustumCulled = false;
  foothillRise.frustumCulled = false;
  foothillSeal.frustumCulled = false;
  group.add(foothillSeal, foothillRise, far);
  let scenicBackdropActive = false;
  let nativeMountainsSuppressed = false;

  const vertexCount =
    foothillSeal.geometry.attributes.position.count +
    foothillRise.geometry.attributes.position.count +
    far.geometry.attributes.position.count;

  return {
    group,
    update: (weather, camera) => {
      const nativeVisible = !scenicBackdropActive && !nativeMountainsSuppressed;
      foothillSeal.visible = nativeVisible;
      foothillRise.visible = nativeVisible;
      far.visible = nativeVisible;
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
