import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { getWeatherPalette } from "./artDirection";
import type { RendererCapabilityTelemetry } from "./realismSpike";
import { GLSL_NOISE, makeNoise2D, makeRng } from "./scenicUtils";

export type WebGpuProbeStatus =
  | "idle"
  | "unavailable"
  | "probing"
  | "initialized"
  | "failed";

export type WebGpuScenicStats = {
  requested: boolean;
  eligible: boolean;
  active: boolean;
  fallbackActive: boolean;
  reason: string;
  scenicMode: "OFF" | "ON" | "FALLBACK" | "ERROR";
  rendererPath: "WebGL Performance" | "WebGL ScenicExperimental" | "WebGPU ScenicExperimental";
  webgpuAvailable: boolean;
  webgpuActive: boolean;
  webgpuProbeStatus: WebGpuProbeStatus;
  webgpuProbeError: string;
  terrainVertices: number;
  forestInstances: number;
  fogMode: string;
  fogLayers: number;
  terrainVisible: boolean;
  forestVisible: boolean;
  fogVisible: boolean;
  compareMode: boolean;
  extraRenderPass: boolean;
};

export type WebGpuScenicPreference = {
  requested: boolean;
  source: "url-on" | "url-off" | "storage-on" | "storage-off" | "unset";
  explicit: boolean;
  explicitDisabled: boolean;
};

export type WebGpuScenicGate = {
  requested: boolean;
  eligible: boolean;
  active: boolean;
  fallbackActive: boolean;
  reason: string;
};

export type WebGpuScenicBackdropSystem = {
  group: THREE.Group;
  update: (
    weather: WeatherSnapshot,
    camera: THREE.PerspectiveCamera,
    elapsed: number,
  ) => void;
  setGate: (gate: WebGpuScenicGate) => void;
  getStats: () => WebGpuScenicStats;
};

type TerrainSampler = {
  sampleHeight: (x: number, z: number) => number;
  sampleSlope: (x: number, z: number) => number;
  minY: number;
  maxY: number;
};

const TERRAIN_SEGMENTS_X = 256;
const TERRAIN_SEGMENTS_Z = 88;
const TERRAIN_WIDTH = 3300;
const TERRAIN_NEAR_Z = -640;
const TERRAIN_FAR_Z = -2320;
const FOREST_SPIRE_TARGET = 76000;
const FOREST_CANOPY_TARGET = 16800;

export const getWebGpuScenicPreference = (): WebGpuScenicPreference => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("webgpuScenic") === "1") {
      return { requested: true, source: "url-on", explicit: true, explicitDisabled: false };
    }
    if (params.get("webgpuScenic") === "0") {
      return { requested: false, source: "url-off", explicit: true, explicitDisabled: true };
    }
    const stored = window.localStorage.getItem("hashlake.webgpuScenic");
    if (stored === "true") {
      return { requested: true, source: "storage-on", explicit: true, explicitDisabled: false };
    }
    if (stored === "false") {
      return { requested: false, source: "storage-off", explicit: true, explicitDisabled: true };
    }
  } catch {
    // Storage may be unavailable in restrictive browser contexts. Fall back safely.
  }
  return { requested: false, source: "unset", explicit: false, explicitDisabled: false };
};

export const isWebGpuScenicRequested = () => {
  return getWebGpuScenicPreference().requested;
};

const isScenicCompareRequested = () => {
  try {
    return new URLSearchParams(window.location.search).get("scenicCompare") === "1";
  } catch {
    return false;
  }
};

const smoothBlend = (edge0: number, edge1: number, value: number) => {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const createHeightFunction = () => {
  const noise = makeNoise2D(67031);

  const warpedNoise = (x: number, z: number, scale: number, octaves = 5) => {
    const warpX = noise.fbm(x * scale * 0.37 + 18.2, z * scale * 0.37 - 7.8, 3) * 0.72;
    const warpZ = noise.fbm(x * scale * 0.37 - 24.1, z * scale * 0.37 + 13.5, 3) * 0.72;
    return noise.fbm(x * scale + warpX, z * scale + warpZ, octaves);
  };

  const eroded = (x: number, z: number) => {
    let sum = 0;
    let amp = 1;
    let freq = 0.0038;
    let dx = 0;
    let dz = 0;
    let norm = 0;
    for (let octave = 0; octave < 5; octave += 1) {
      const n = warpedNoise(x + octave * 19.7, z - octave * 31.1, freq, 4);
      const nx = warpedNoise(x + 1.7 + octave * 19.7, z - octave * 31.1, freq, 3);
      const nz = warpedNoise(x + octave * 19.7, z + 1.7 - octave * 31.1, freq, 3);
      dx += (nx - n) * freq * 180;
      dz += (nz - n) * freq * 180;
      const damp = 1 + 0.82 * (dx * dx + dz * dz);
      sum += (n * amp) / damp;
      norm += amp;
      amp *= 0.52;
      freq *= 1.93;
    }
    return sum / norm;
  };

  return (x: number, z: number) => {
    const zDepth = THREE.MathUtils.clamp((-z - 600) / 1500, 0, 1);
    const xNorm = x / (TERRAIN_WIDTH * 0.5);
    const centerPeak = Math.exp(-((xNorm - 0.03) ** 2) / 0.038);
    const leftPeak = Math.exp(-((xNorm + 0.48) ** 2) / 0.024);
    const rightPeak = Math.exp(-((xNorm - 0.58) ** 2) / 0.030);
    const shoulder = Math.exp(-((xNorm + 0.86) ** 2) / 0.070);
    const farNeedles = Math.max(0, Math.sin((xNorm + 0.12) * 21.0)) * 0.11;
    const ridgeLine =
      0.18 +
      centerPeak * 1.64 +
      leftPeak * 0.92 +
      rightPeak * 1.08 +
      shoulder * 0.58 +
      farNeedles +
      eroded(x * 0.66, z * 0.76) * 0.92;
    const valleyFloor = smoothBlend(0.0, 0.38, zDepth);
    const mountainRise = Math.pow(THREE.MathUtils.clamp(zDepth, 0, 1), 1.05);
    const ravines =
      Math.abs(noise.fbm(x * 0.012 + 41.0, z * 0.010 - 17.0, 4)) *
      126 *
      mountainRise;
    const cliffCuts =
      Math.max(0, noise.fbm(x * 0.020 - 12, z * 0.024 + 8, 3)) *
      82 *
      mountainRise *
      smoothBlend(0.34, 0.86, zDepth);
    const highFrequency = noise.fbm(x * 0.035 - 14, z * 0.024 + 33, 4) * 38 * mountainRise;
    return 12 + valleyFloor * 20 + Math.max(0, ridgeLine) * 360 * mountainRise - ravines - cliffCuts + highFrequency;
  };
};

const buildTerrain = () => {
  const heightAt = createHeightFunction();
  const columns = TERRAIN_SEGMENTS_X + 1;
  const rows = TERRAIN_SEGMENTS_Z + 1;
  const heights = new Float32Array(columns * rows);
  const positions = new Float32Array(columns * rows * 3);
  const elevs = new Float32Array(columns * rows);
  const slopes = new Float32Array(columns * rows);
  const indices: number[] = [];
  let minY = Infinity;
  let maxY = -Infinity;

  for (let row = 0; row < rows; row += 1) {
    const z = TERRAIN_NEAR_Z + (row / TERRAIN_SEGMENTS_Z) * (TERRAIN_FAR_Z - TERRAIN_NEAR_Z);
    for (let column = 0; column < columns; column += 1) {
      const x = (column / TERRAIN_SEGMENTS_X - 0.5) * TERRAIN_WIDTH;
      const index = row * columns + column;
      const y = heightAt(x, z);
      heights[index] = y;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
    }
  }

  const cellX = TERRAIN_WIDTH / TERRAIN_SEGMENTS_X;
  const cellZ = Math.abs((TERRAIN_FAR_Z - TERRAIN_NEAR_Z) / TERRAIN_SEGMENTS_Z);
  const sampleGridHeight = (column: number, row: number) => {
    const c = THREE.MathUtils.clamp(column, 0, TERRAIN_SEGMENTS_X);
    const r = THREE.MathUtils.clamp(row, 0, TERRAIN_SEGMENTS_Z);
    return heights[r * columns + c];
  };

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const hx = sampleGridHeight(column + 1, row) - sampleGridHeight(column - 1, row);
      const hz = sampleGridHeight(column, row + 1) - sampleGridHeight(column, row - 1);
      const flatness = 1 / Math.sqrt(1 + (hx / (cellX * 2)) ** 2 + (hz / (cellZ * 2)) ** 2);
      elevs[index] = THREE.MathUtils.clamp((heights[index] - minY) / Math.max(1, maxY - minY), 0, 1);
      slopes[index] = THREE.MathUtils.clamp(flatness, 0, 1);
    }
  }

  for (let row = 0; row < TERRAIN_SEGMENTS_Z; row += 1) {
    for (let column = 0; column < TERRAIN_SEGMENTS_X; column += 1) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      if ((row + column) % 2 === 0) {
        indices.push(a, c, b, b, c, d);
      } else {
        indices.push(a, c, d, a, d, b);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("elev", new THREE.BufferAttribute(elevs, 1));
  geometry.setAttribute("flatness", new THREE.BufferAttribute(slopes, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const sampleHeight = (x: number, z: number) => {
    const fx = THREE.MathUtils.clamp((x / TERRAIN_WIDTH + 0.5) * TERRAIN_SEGMENTS_X, 0, TERRAIN_SEGMENTS_X);
    const fz = THREE.MathUtils.clamp(
      ((z - TERRAIN_NEAR_Z) / (TERRAIN_FAR_Z - TERRAIN_NEAR_Z)) * TERRAIN_SEGMENTS_Z,
      0,
      TERRAIN_SEGMENTS_Z,
    );
    const x0 = Math.min(TERRAIN_SEGMENTS_X - 1, Math.floor(fx));
    const z0 = Math.min(TERRAIN_SEGMENTS_Z - 1, Math.floor(fz));
    const tx = fx - x0;
    const tz = fz - z0;
    const h00 = sampleGridHeight(x0, z0);
    const h10 = sampleGridHeight(x0 + 1, z0);
    const h01 = sampleGridHeight(x0, z0 + 1);
    const h11 = sampleGridHeight(x0 + 1, z0 + 1);
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  };

  const sampleSlope = (x: number, z: number) => {
    const hx = sampleHeight(x + cellX, z) - sampleHeight(x - cellX, z);
    const hz = sampleHeight(x, z + cellZ) - sampleHeight(x, z - cellZ);
    return 1 / Math.sqrt(1 + (hx / (cellX * 2)) ** 2 + (hz / (cellZ * 2)) ** 2);
  };

  return {
    geometry,
    sampler: {
      sampleHeight,
      sampleSlope,
      minY,
      maxY,
    } satisfies TerrainSampler,
  };
};

const buildPeakWallGeometry = ({
  seed,
  z,
  depth,
  width,
  baseY,
  peakY,
  xSegments,
  ySegments,
}: {
  seed: number;
  z: number;
  depth: number;
  width: number;
  baseY: number;
  peakY: number;
  xSegments: number;
  ySegments: number;
}) => {
  const noise = makeNoise2D(seed);
  const positions: number[] = [];
  const elevs: number[] = [];
  const flatnesses: number[] = [];
  const indices: number[] = [];

  for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
    const xT = xIndex / xSegments;
    const xNorm = xT * 2 - 1;
    const x = xNorm * width * 0.5;
    const center = Math.exp(-((xNorm - 0.08) ** 2) / 0.070);
    const left = Math.exp(-((xNorm + 0.52) ** 2) / 0.042);
    const right = Math.exp(-((xNorm - 0.62) ** 2) / 0.052);
    const skyline =
      0.50 +
      center * 0.62 +
      left * 0.36 +
      right * 0.42 +
      noise.fbm(xNorm * 3.2 + 21, 4.4, 5) * 0.25 +
      Math.max(0, Math.sin(xNorm * 28.0 + 1.7)) * 0.10;
    const ridgeTop = baseY + peakY * THREE.MathUtils.clamp(skyline, 0.34, 1.48);
    const cutA = Math.abs(noise.fbm(xNorm * 7.5 - 8, 2.1, 4));
    const cutB = Math.abs(noise.fbm(xNorm * 13.0 + 6, -3.4, 3));
    for (let yIndex = 0; yIndex <= ySegments; yIndex += 1) {
      const yT = yIndex / ySegments;
      const terrace = Math.pow(yT, 0.78);
      const ravine = (cutA * 42 + cutB * 20) * Math.sin(yT * Math.PI) * (1 - yT * 0.25);
      const fold = noise.fbm(xNorm * 5.2 + yT * 2.4, yT * 7.2 - 14, 4) * 26 * Math.sin(yT * Math.PI);
      const y = baseY + (ridgeTop - baseY) * terrace - ravine + fold;
      const zOffset =
        -depth * yT +
        noise.fbm(xNorm * 4.8 + yT * 8.2, yT * 5.4 + 3, 3) * 34 * Math.sin(yT * Math.PI);
      positions.push(x + noise.fbm(xNorm * 11 + yT, 18.0, 3) * 8 * Math.sin(yT * Math.PI), y, z + zOffset);
      elevs.push(THREE.MathUtils.clamp((y - baseY) / Math.max(1, peakY * 1.35), 0, 1));
      flatnesses.push(THREE.MathUtils.clamp(0.18 + (1 - yT) * 0.44 + noise.fbm(xNorm * 8.0, yT * 6.0, 3) * 0.18, 0.05, 0.82));
    }
  }

  const columns = ySegments + 1;
  for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
    for (let yIndex = 0; yIndex < ySegments; yIndex += 1) {
      const a = xIndex * columns + yIndex;
      const b = a + columns;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("elev", new THREE.Float32BufferAttribute(elevs, 1));
  geometry.setAttribute("flatness", new THREE.Float32BufferAttribute(flatnesses, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const angleDelta = (a: number, b: number) => {
  let delta = a - b;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
};

const buildAlpineRingGeometry = () => {
  const noise = makeNoise2D(68273);
  const thetaSegments = 256;
  const radialSegments = 24;
  const rInner = 700;
  const rOuter = 2520;
  const vertices: number[] = [];
  const elevs: number[] = [];
  const flatnesses: number[] = [];
  const indices: number[] = [];
  const heroTheta = -Math.PI * 0.55;

  for (let thetaIndex = 0; thetaIndex <= thetaSegments; thetaIndex += 1) {
    const theta = (thetaIndex / thetaSegments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const warp = noise.fbm(cos * 3.2 + 13.0, sin * 3.2 - 8.0, 4) * 0.34;
    const centerPeak = Math.exp(-(angleDelta(theta, heroTheta) ** 2) / (0.32 * 0.32));
    const leftPeak = Math.exp(-(angleDelta(theta, heroTheta - 0.78) ** 2) / (0.38 * 0.38));
    const rightPeak = Math.exp(-(angleDelta(theta, heroTheta + 0.92) ** 2) / (0.42 * 0.42));
    let ridge =
      0.42 +
      centerPeak * 0.76 +
      leftPeak * 0.48 +
      rightPeak * 0.54 +
      noise.fbm(cos * 5.4 + warp * 4.0, sin * 5.4 - warp * 3.0, 5) * 0.48 +
      Math.max(0, Math.sin(theta * 19.0 + 0.8)) * 0.12;
    ridge = THREE.MathUtils.clamp(ridge, 0.20, 1.46);
    const peakHeight = 195 + ridge * 505;

    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const radial = radialIndex / radialSegments;
      const radius = rInner + (rOuter - rInner) * radial;
      const rise = Math.sin(Math.min(radial / 0.78, 1) * Math.PI * 0.5);
      const farDrop = radial < 0.82 ? 1 : 1 - (radial - 0.82) / 0.22;
      const shoulder = Math.pow(Math.max(0, rise), 0.96) * Math.max(0, farDrop);
      const foothill = smoothBlend(0.0, 0.22, radial) * smoothBlend(0.52, 0.18, radial);
      const local =
        noise.fbm(cos * radius * 0.006 + 31, sin * radius * 0.006 - 11, 5) *
        peakHeight *
        0.24 *
        shoulder;
      const ravine =
        Math.abs(noise.fbm(cos * radius * 0.013 + 7, sin * radius * 0.012 + 19, 4)) *
        peakHeight *
        0.18 *
        (1 - radial * 0.35) *
        shoulder;
      const y = Math.max(5, 6 + foothill * (34 + ridge * 28) + peakHeight * shoulder + local - ravine);
      vertices.push(cos * radius, y, sin * radius);
      elevs.push(THREE.MathUtils.clamp(y / 620, 0, 1));
      flatnesses.push(THREE.MathUtils.clamp(0.18 + (1 - radial) * 0.42 + noise.fbm(cos * 9, sin * 9, 3) * 0.18, 0.04, 0.82));
    }
  }

  const columns = radialSegments + 1;
  for (let thetaIndex = 0; thetaIndex < thetaSegments; thetaIndex += 1) {
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const a = thetaIndex * columns + radialIndex;
      const b = a + columns;
      if ((thetaIndex + radialIndex) % 2 === 0) {
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      } else {
        indices.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("elev", new THREE.Float32BufferAttribute(elevs, 1));
  geometry.setAttribute("flatness", new THREE.Float32BufferAttribute(flatnesses, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const buildFoothillSkirtGeometry = () => {
  const noise = makeNoise2D(69137);
  const thetaSegments = 192;
  const radialSegments = 8;
  const rInner = 660;
  const rOuter = 1160;
  const vertices: number[] = [];
  const elevs: number[] = [];
  const flatnesses: number[] = [];
  const indices: number[] = [];

  for (let thetaIndex = 0; thetaIndex <= thetaSegments; thetaIndex += 1) {
    const theta = (thetaIndex / thetaSegments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const ridgeNoise = noise.fbm(cos * 4.2 + 8, sin * 4.2 - 12, 4);
    const hummock = 0.55 + ridgeNoise * 0.34 + Math.max(0, Math.sin(theta * 13.0 - 0.7)) * 0.18;
    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const radial = radialIndex / radialSegments;
      const radius =
        rInner +
        (rOuter - rInner) * radial +
        noise.fbm(cos * 9.0 + radial * 2.0, sin * 9.0 - radial * 2.0, 3) * 18;
      const mound = Math.sin(radial * Math.PI) * (34 + hummock * 44);
      const y = 7 + mound + radial * 26 + noise.fbm(cos * radius * 0.009, sin * radius * 0.009, 4) * 8;
      vertices.push(cos * radius, y, sin * radius);
      elevs.push(THREE.MathUtils.clamp(y / 130, 0, 0.34));
      flatnesses.push(THREE.MathUtils.clamp(0.52 + radial * 0.26 + ridgeNoise * 0.12, 0.28, 0.86));
    }
  }

  const columns = radialSegments + 1;
  for (let thetaIndex = 0; thetaIndex < thetaSegments; thetaIndex += 1) {
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const a = thetaIndex * columns + radialIndex;
      const b = a + columns;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("elev", new THREE.Float32BufferAttribute(elevs, 1));
  geometry.setAttribute("flatness", new THREE.Float32BufferAttribute(flatnesses, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createTerrainMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      uCamera: { value: new THREE.Vector3() },
      uFogColor: { value: new THREE.Color(0xd8e7e2) },
      uSunColor: { value: new THREE.Color(0xf7d3a0) },
      uAmbient: { value: new THREE.Color(0xaec8d0) },
      uDark: { value: 0 },
      uFire: { value: 0 },
    },
    vertexShader: `
      attribute float elev;
      attribute float flatness;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vElev;
      varying float vFlatness;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vElev = elev;
        vFlatness = flatness;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vElev;
      varying float vFlatness;
      uniform vec3 uCamera;
      uniform vec3 uFogColor;
      uniform vec3 uSunColor;
      uniform vec3 uAmbient;
      uniform float uDark;
      uniform float uFire;
      ${GLSL_NOISE}

      void main() {
        vec3 normal = normalize(vNormal);
        float steep = 1.0 - clamp(vFlatness, 0.0, 1.0);
        float grain = bl_fbm(vWorldPos.xz * 0.018 + vec2(9.0, -31.0));
        float macro = bl_fbm(vWorldPos.xz * 0.0045 + vec2(-17.0, 22.0));
        float strata = sin(vWorldPos.y * 0.075 + grain * 3.5 + macro * 2.0) * 0.5 + 0.5;

        vec3 forest = vec3(0.022, 0.074, 0.040);
        vec3 meadow = vec3(0.120, 0.185, 0.100);
        vec3 rock = mix(vec3(0.235, 0.266, 0.260), vec3(0.650, 0.640, 0.565), strata);
        vec3 scree = vec3(0.430, 0.420, 0.372);
        vec3 snow = vec3(0.900, 0.920, 0.860);

        float forestBand = smoothstep(0.34, 0.06, vElev) * smoothstep(0.38, 0.88, vFlatness);
        float meadowBand = smoothstep(0.40, 0.11, vElev) * smoothstep(0.24, 0.74, vFlatness);
        float rockBand = smoothstep(0.26, 0.56, vElev) + smoothstep(0.17, 0.55, steep);
        float snowBand = smoothstep(0.76, 0.98, vElev + grain * 0.06) * smoothstep(0.28, 0.76, vFlatness);

        vec3 albedo = mix(rock, meadow, meadowBand * 0.36);
        albedo = mix(albedo, forest, forestBand * 0.88);
        albedo = mix(albedo, scree, clamp(rockBand * steep * 0.52, 0.0, 0.62));
        albedo = mix(albedo, snow, snowBand * 0.58);
        albedo *= 0.78 + macro * 0.36 + grain * 0.12;

        vec3 sunDir = normalize(vec3(-0.38, 0.66, -0.55));
        float diffuse = max(dot(normal, sunDir), 0.0);
        float rim = smoothstep(-0.2, 0.9, dot(normalize(vec3(normal.x, 0.0, normal.z) + 0.001), normalize(vec3(-0.65, 0.0, -0.52))));
        vec3 color = albedo * (uAmbient * (0.50 + vFlatness * 0.34) + uSunColor * diffuse * 1.20);
        color *= 0.82 + rim * 0.38;
        color += albedo * vec3(0.90, 0.24, 0.08) * uFire * 0.28;
        color = mix(color, color * vec3(0.76, 0.82, 0.92), uDark * 0.20);

        float dist = distance(vWorldPos, uCamera);
        float aerial = 1.0 - exp(-pow(dist * 0.00056, 1.42));
        float lowFog = smoothstep(160.0, 18.0, vWorldPos.y) * smoothstep(690.0, 1180.0, -vWorldPos.z) * 0.34;
        color = mix(color, uFogColor, clamp(aerial * 0.50 + lowFog, 0.0, 0.72));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

const createForestMaterial = () =>
  new THREE.MeshStandardMaterial({
    color: 0x12301a,
    roughness: 0.92,
    metalness: 0,
    vertexColors: true,
  });

const buildForest = (sampler: TerrainSampler) => {
  const rng = makeRng(6799);
  const spireGeometry = new THREE.ConeGeometry(1, 1, 5, 1);
  spireGeometry.deleteAttribute("uv");
  const canopyGeometry = new THREE.DodecahedronGeometry(1, 0);
  canopyGeometry.deleteAttribute("uv");
  const material = createForestMaterial();
  const canopyMaterial = createForestMaterial();
  canopyMaterial.color.setHex(0x0a1c11);
  const spires = new THREE.InstancedMesh(spireGeometry, material, FOREST_SPIRE_TARGET);
  const canopy = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, FOREST_CANOPY_TARGET);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const low = sampler.minY;
  const span = Math.max(1, sampler.maxY - sampler.minY);
  let placed = 0;
  let attempts = 0;
  const maxAttempts = FOREST_SPIRE_TARGET * 18;

  while (placed < FOREST_SPIRE_TARGET && attempts < maxAttempts) {
    attempts += 1;
    const x = (rng() - 0.5) * TERRAIN_WIDTH * 0.98;
    const z = TERRAIN_NEAR_Z - 38 - rng() * 1260;
    const y = sampler.sampleHeight(x, z);
    const altitude = (y - low) / span;
    const slope = sampler.sampleSlope(x, z);
    if (z > -690) {
      continue;
    }
    if (altitude < 0.035 || altitude > 0.55) {
      continue;
    }
    if (slope < 0.34) {
      continue;
    }
    const density =
      smoothBlend(0.0, 0.18, altitude) *
      smoothBlend(0.62, 0.24, altitude) *
      smoothBlend(0.28, 0.72, slope) *
      (0.72 + 0.28 * Math.max(0, Math.sin(x * 0.007 + z * 0.006 + 1.4)));
    if (rng() > density) {
      continue;
    }

    const far = THREE.MathUtils.clamp((-z - 700) / 1260, 0, 1);
    const scale = 4.4 + rng() * 8.4 + far * 12.8;
    dummy.position.set(x + (rng() - 0.5) * 8.5, y + scale * 0.38, z + (rng() - 0.5) * 8.5);
    dummy.rotation.set((rng() - 0.5) * 0.10, rng() * Math.PI * 2, (rng() - 0.5) * 0.10);
    dummy.scale.set(scale * (0.56 + rng() * 0.36), scale * (1.75 + rng() * 1.10), scale * (0.56 + rng() * 0.34));
    dummy.updateMatrix();
    spires.setMatrixAt(placed, dummy.matrix);
    color.setHSL(0.335 + (rng() - 0.5) * 0.044, 0.30 + rng() * 0.14, 0.032 + rng() * 0.078);
    spires.setColorAt(placed, color);
    placed += 1;
  }

  let canopyPlaced = 0;
  let canopyAttempts = 0;
  const maxCanopyAttempts = FOREST_CANOPY_TARGET * 14;
  while (canopyPlaced < FOREST_CANOPY_TARGET && canopyAttempts < maxCanopyAttempts) {
    canopyAttempts += 1;
    const x = (rng() - 0.5) * TERRAIN_WIDTH * 0.98;
    const z = TERRAIN_NEAR_Z - 64 - rng() * 1180;
    const y = sampler.sampleHeight(x, z);
    const altitude = (y - low) / span;
    const slope = sampler.sampleSlope(x, z);
    if (z > -710 || altitude < 0.03 || altitude > 0.46 || slope < 0.30) {
      continue;
    }
    const far = THREE.MathUtils.clamp((-z - 710) / 1180, 0, 1);
    const scale = 12 + rng() * 28 + far * 26;
    dummy.position.set(x + (rng() - 0.5) * 15, y + scale * 0.18, z + (rng() - 0.5) * 15);
    dummy.rotation.set((rng() - 0.5) * 0.08, rng() * Math.PI * 2, (rng() - 0.5) * 0.08);
    dummy.scale.set(scale * (1.25 + rng() * 1.8), scale * (0.28 + rng() * 0.24), scale * (0.90 + rng() * 1.3));
    dummy.updateMatrix();
    canopy.setMatrixAt(canopyPlaced, dummy.matrix);
    color.setHSL(0.332 + (rng() - 0.5) * 0.038, 0.28 + rng() * 0.12, 0.030 + rng() * 0.064);
    canopy.setColorAt(canopyPlaced, color);
    canopyPlaced += 1;
  }

  spires.count = placed;
  spires.instanceMatrix.needsUpdate = true;
  if (spires.instanceColor) {
    spires.instanceColor.needsUpdate = true;
  }
  spires.frustumCulled = false;

  canopy.count = canopyPlaced;
  canopy.instanceMatrix.needsUpdate = true;
  if (canopy.instanceColor) {
    canopy.instanceColor.needsUpdate = true;
  }
  canopy.frustumCulled = false;

  const group = new THREE.Group();
  group.name = "Phase 70 dense ecological forest wall";
  group.add(canopy, spires);
  return { group, count: placed + canopyPlaced, attempts: attempts + canopyAttempts };
};

const buildHeightFogGeometry = (nearZ: number, farZ: number, y: number, width = 2300) => {
  const xSegments = 96;
  const zSegments = 6;
  const positions: number[] = [];
  const fogAlpha: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= zSegments; row += 1) {
    const zT = row / zSegments;
    const z = nearZ + (farZ - nearZ) * zT;
    for (let column = 0; column <= xSegments; column += 1) {
      const xT = column / xSegments;
      const x = (xT - 0.5) * width;
      const edge = Math.sin(xT * Math.PI);
      const rowFade = Math.sin(zT * Math.PI);
      const waviness = Math.sin(xT * Math.PI * 5.0 + zT * 2.7) * 8 + Math.sin(xT * Math.PI * 11.0) * 3;
      positions.push(x, y + waviness + row * 2.0, z);
      fogAlpha.push(edge * rowFade);
    }
  }

  const columns = xSegments + 1;
  for (let row = 0; row < zSegments; row += 1) {
    for (let column = 0; column < xSegments; column += 1) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("fogAlpha", new THREE.Float32BufferAttribute(fogAlpha, 1));
  geometry.setIndex(indices);
  return geometry;
};

const createHeightFogMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(0xd9e8e2) },
      uOpacity: { value: 0.24 },
      uTime: { value: 0 },
      uDark: { value: 0 },
    },
    vertexShader: `
      attribute float fogAlpha;
      varying vec3 vWorldPos;
      varying float vFogAlpha;

      void main() {
        vFogAlpha = fogAlpha;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      varying float vFogAlpha;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uDark;
      ${GLSL_NOISE}

      void main() {
        float slow = bl_fbm(vWorldPos.xz * 0.005 + vec2(uTime * 0.010, -uTime * 0.007));
        float fine = bl_fbm(vWorldPos.xz * 0.014 + vec2(-uTime * 0.018, uTime * 0.011));
        float breakup = smoothstep(0.15, 0.82, slow * 0.78 + fine * 0.32);
        float heightFade = smoothstep(160.0, 20.0, vWorldPos.y);
        float basin = smoothstep(560.0, 1020.0, -vWorldPos.z) * smoothstep(2300.0, 1500.0, -vWorldPos.z);
        float alpha = vFogAlpha * uOpacity * heightFade * basin * (0.52 + breakup * 0.94) * (1.0 - uDark * 0.16);
        if (alpha < 0.010) {
          discard;
        }
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });

const createWebGpuProbe = (stats: WebGpuScenicStats) => {
  let started = false;
  return () => {
    if (started || stats.webgpuProbeStatus === "initialized" || stats.webgpuProbeStatus === "failed") {
      return;
    }
    started = true;
    if (!stats.webgpuAvailable) {
      stats.webgpuProbeStatus = "unavailable";
      stats.webgpuProbeError = "navigator.gpu unavailable";
      return;
    }
    stats.webgpuProbeStatus = "probing";
    void import("three/webgpu")
      .then(async ({ WebGPURenderer }) => {
        const canvas = document.createElement("canvas");
        const probeRenderer = new WebGPURenderer({
          canvas,
          antialias: false,
        });
        probeRenderer.setSize(1, 1, false);
        await probeRenderer.init();
        probeRenderer.dispose();
        stats.webgpuProbeStatus = "initialized";
        stats.webgpuProbeError = "";
      })
      .catch((error: unknown) => {
        stats.webgpuProbeStatus = "failed";
        stats.webgpuProbeError = error instanceof Error ? error.message.slice(0, 120) : "unknown WebGPU init error";
      });
  };
};

export const createWebGpuScenicBackdropSystem = (
  capabilities: RendererCapabilityTelemetry,
): WebGpuScenicBackdropSystem => {
  const group = new THREE.Group();
  group.name = "Phase 70 WebGPU alpine scenic layer v3";
  group.visible = false;

  const stats: WebGpuScenicStats = {
    requested: false,
    eligible: false,
    active: false,
    fallbackActive: true,
    reason: "not requested",
    scenicMode: "OFF",
    rendererPath: "WebGL Performance",
    webgpuAvailable: capabilities.webgpu,
    webgpuActive: false,
    webgpuProbeStatus: capabilities.webgpu ? "idle" : "unavailable",
    webgpuProbeError: capabilities.webgpu ? "" : "navigator.gpu unavailable",
    terrainVertices: 0,
    forestInstances: 0,
    fogMode: "off",
    fogLayers: 0,
    terrainVisible: false,
    forestVisible: false,
    fogVisible: false,
    compareMode: isScenicCompareRequested(),
    extraRenderPass: false,
  };

  const startWebGpuProbe = createWebGpuProbe(stats);
  let built = false;
  let terrainMaterial: THREE.ShaderMaterial | null = null;
  let peakMaterial: THREE.ShaderMaterial | null = null;
  let fogMaterials: THREE.ShaderMaterial[] = [];

  const build = () => {
    if (built) {
      return;
    }
    built = true;
    const terrain = buildTerrain();
    terrainMaterial = createTerrainMaterial();
    const terrainMesh = new THREE.Mesh(terrain.geometry, terrainMaterial);
    terrainMesh.name = "Phase 70 eroded alpine terrain v3";
    terrainMesh.frustumCulled = false;
    group.add(terrainMesh);

    peakMaterial = createTerrainMaterial();
    const foothillMesh = new THREE.Mesh(buildFoothillSkirtGeometry(), peakMaterial.clone());
    foothillMesh.name = "Phase 70 grounded mountain-foot skirt";
    foothillMesh.frustumCulled = false;
    group.add(foothillMesh);

    const ringMesh = new THREE.Mesh(buildAlpineRingGeometry(), peakMaterial);
    ringMesh.name = "Phase 70 visible alpine ring backdrop";
    ringMesh.frustumCulled = false;
    group.add(ringMesh);

    const peakWalls = [
      new THREE.Mesh(
        buildPeakWallGeometry({
          seed: 68101,
          z: -1220,
          depth: 290,
          width: 3300,
          baseY: 18,
          peakY: 470,
          xSegments: 220,
          ySegments: 20,
        }),
        peakMaterial,
      ),
      new THREE.Mesh(
        buildPeakWallGeometry({
          seed: 68141,
          z: -1680,
          depth: 360,
          width: 3700,
          baseY: 62,
          peakY: 560,
          xSegments: 240,
          ySegments: 22,
        }),
        peakMaterial.clone(),
      ),
      new THREE.Mesh(
        buildPeakWallGeometry({
          seed: 68187,
          z: -2060,
          depth: 450,
          width: 4300,
          baseY: 112,
          peakY: 700,
          xSegments: 272,
          ySegments: 24,
        }),
        peakMaterial.clone(),
      ),
    ];
    peakWalls.forEach((wall, index) => {
      wall.name = `Phase 70 craggy alpine peak wall ${index + 1}`;
      wall.frustumCulled = false;
      group.add(wall);
    });

    const forest = buildForest(terrain.sampler);
    forest.group.name = "Phase 70 ecological instanced mountain-base forest";
    group.add(forest.group);

    const fogGeometries = [
      buildHeightFogGeometry(-640, -1040, 22, 3180),
      buildHeightFogGeometry(-700, -1220, 42, 3260),
      buildHeightFogGeometry(-800, -1460, 70, 3180),
      buildHeightFogGeometry(-920, -1700, 104, 2920),
      buildHeightFogGeometry(-1080, -1960, 142, 2600),
      buildHeightFogGeometry(-1260, -2260, 186, 2220),
    ];
    fogMaterials = fogGeometries.map(() => createHeightFogMaterial());
    fogGeometries.forEach((geometry, index) => {
      const fog = new THREE.Mesh(geometry, fogMaterials[index]);
      fog.name = `Phase 70 pooled height fog layer ${index + 1}`;
      fog.renderOrder = 4 + index;
      fog.frustumCulled = false;
      group.add(fog);
    });

    stats.terrainVertices =
      terrain.geometry.attributes.position.count +
      foothillMesh.geometry.attributes.position.count +
      ringMesh.geometry.attributes.position.count +
      peakWalls.reduce((count, wall) => count + wall.geometry.attributes.position.count, 0);
    stats.forestInstances = forest.count;
    stats.fogLayers = fogGeometries.length;
    stats.fogMode = "WebGL pooled alpine height fog v3";
  };

  return {
    group,
    update: (weather, camera, elapsed) => {
      if (!stats.active) {
        return;
      }
      const palette = getWeatherPalette(weather.stormIndex);
      const dark = weather.dials.skyDark;
      if (terrainMaterial) {
        terrainMaterial.uniforms.uCamera.value.copy(camera.position);
        terrainMaterial.uniforms.uFogColor.value.setHex(palette.fogColor);
        terrainMaterial.uniforms.uSunColor.value.setHex(palette.directionalLight);
        terrainMaterial.uniforms.uAmbient.value.setHex(palette.ambientLight);
        terrainMaterial.uniforms.uDark.value = dark;
        terrainMaterial.uniforms.uFire.value = weather.dials.fireWeather;
      }
      group.children.forEach((child) => {
        if (
          !child.name.startsWith("Phase 70 craggy alpine peak wall") &&
          child.name !== "Phase 70 grounded mountain-foot skirt" &&
          child.name !== "Phase 70 visible alpine ring backdrop"
        ) {
          return;
        }
        const material = (child as THREE.Mesh).material as THREE.ShaderMaterial;
        material.uniforms.uCamera.value.copy(camera.position);
        material.uniforms.uFogColor.value.setHex(palette.fogColor);
        material.uniforms.uSunColor.value.setHex(palette.directionalLight);
        material.uniforms.uAmbient.value.setHex(palette.ambientLight);
        material.uniforms.uDark.value = dark;
        material.uniforms.uFire.value = weather.dials.fireWeather;
      });
      fogMaterials.forEach((material, index) => {
        material.uniforms.uColor.value.setHex(palette.fogColor);
        material.uniforms.uTime.value = elapsed;
        material.uniforms.uDark.value = dark;
        material.uniforms.uOpacity.value = 0.132 + weather.dials.fog * 0.18 + index * 0.028;
      });
    },
    setGate: (gate) => {
      stats.requested = gate.requested;
      stats.eligible = gate.eligible;
      stats.active = gate.active;
      stats.fallbackActive = gate.fallbackActive;
      stats.reason = gate.reason;
      stats.scenicMode = gate.active
        ? "ON"
        : gate.requested
          ? gate.reason.toLowerCase().includes("error")
            ? "ERROR"
            : "FALLBACK"
          : "OFF";
      stats.rendererPath = gate.active ? "WebGL ScenicExperimental" : "WebGL Performance";
      stats.webgpuActive = false;
      group.visible = gate.active;
      if (gate.requested) {
        startWebGpuProbe();
      }
      if (gate.active) {
        build();
      }
      stats.terrainVisible = gate.active && stats.terrainVertices > 0;
      stats.forestVisible = gate.active && stats.forestInstances > 0;
      stats.fogVisible = gate.active && stats.fogLayers > 0;
    },
    getStats: () => ({ ...stats }),
  };
};
