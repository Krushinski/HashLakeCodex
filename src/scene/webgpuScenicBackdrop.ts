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
  rendererPath: "WebGL Performance" | "WebGL ScenicExperimental" | "WebGPU ScenicExperimental";
  webgpuAvailable: boolean;
  webgpuActive: boolean;
  webgpuProbeStatus: WebGpuProbeStatus;
  webgpuProbeError: string;
  terrainVertices: number;
  forestInstances: number;
  fogMode: string;
  fogLayers: number;
  extraRenderPass: boolean;
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

const TERRAIN_SEGMENTS_X = 192;
const TERRAIN_SEGMENTS_Z = 64;
const TERRAIN_WIDTH = 2500;
const TERRAIN_NEAR_Z = -680;
const TERRAIN_FAR_Z = -1740;
const FOREST_INSTANCE_TARGET = 18000;

export const isWebGpuScenicRequested = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("webgpuScenic") === "1") {
      return true;
    }
    if (params.get("webgpuScenic") === "0") {
      return false;
    }
    return window.localStorage.getItem("hashlake.webgpuScenic") === "true";
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
    const zDepth = THREE.MathUtils.clamp((-z - 620) / 1180, 0, 1);
    const xNorm = x / (TERRAIN_WIDTH * 0.5);
    const centerPeak = Math.exp(-((xNorm - 0.02) ** 2) / 0.052);
    const leftPeak = Math.exp(-((xNorm + 0.47) ** 2) / 0.030);
    const rightPeak = Math.exp(-((xNorm - 0.55) ** 2) / 0.040);
    const shoulder = Math.exp(-((xNorm + 0.86) ** 2) / 0.090);
    const ridgeLine =
      0.24 +
      centerPeak * 1.25 +
      leftPeak * 0.64 +
      rightPeak * 0.82 +
      shoulder * 0.42 +
      eroded(x * 0.58, z * 0.72) * 0.72;
    const valleyFloor = smoothBlend(0.0, 0.38, zDepth);
    const mountainRise = Math.pow(THREE.MathUtils.clamp(zDepth, 0, 1), 1.18);
    const ravines =
      Math.abs(noise.fbm(x * 0.012 + 41.0, z * 0.010 - 17.0, 4)) *
      86 *
      mountainRise;
    const highFrequency = noise.fbm(x * 0.027 - 14, z * 0.019 + 33, 3) * 22 * mountainRise;
    return 18 + valleyFloor * 30 + Math.max(0, ridgeLine) * 280 * mountainRise - ravines + highFrequency;
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

        vec3 forest = vec3(0.040, 0.105, 0.058);
        vec3 meadow = vec3(0.160, 0.232, 0.130);
        vec3 rock = mix(vec3(0.335, 0.355, 0.330), vec3(0.560, 0.535, 0.470), strata);
        vec3 scree = vec3(0.430, 0.418, 0.375);
        vec3 snow = vec3(0.760, 0.785, 0.765);

        float forestBand = smoothstep(0.30, 0.08, vElev) * smoothstep(0.44, 0.86, vFlatness);
        float meadowBand = smoothstep(0.48, 0.14, vElev) * smoothstep(0.24, 0.76, vFlatness);
        float rockBand = smoothstep(0.34, 0.60, vElev) + smoothstep(0.24, 0.58, steep);
        float snowBand = smoothstep(0.72, 0.95, vElev + grain * 0.08) * smoothstep(0.22, 0.70, vFlatness);

        vec3 albedo = mix(rock, meadow, meadowBand * 0.36);
        albedo = mix(albedo, forest, forestBand * 0.72);
        albedo = mix(albedo, scree, clamp(rockBand * steep * 0.42, 0.0, 0.52));
        albedo = mix(albedo, snow, snowBand * 0.34);
        albedo *= 0.82 + macro * 0.32 + grain * 0.08;

        vec3 sunDir = normalize(vec3(-0.38, 0.66, -0.55));
        float diffuse = max(dot(normal, sunDir), 0.0);
        float rim = smoothstep(-0.2, 0.9, dot(normalize(vec3(normal.x, 0.0, normal.z) + 0.001), normalize(vec3(-0.65, 0.0, -0.52))));
        vec3 color = albedo * (uAmbient * (0.48 + vFlatness * 0.34) + uSunColor * diffuse * 1.05);
        color *= 0.80 + rim * 0.30;
        color += albedo * vec3(0.90, 0.24, 0.08) * uFire * 0.28;
        color = mix(color, color * vec3(0.76, 0.82, 0.92), uDark * 0.20);

        float dist = distance(vWorldPos, uCamera);
        float aerial = 1.0 - exp(-pow(dist * 0.00056, 1.42));
        float lowFog = smoothstep(120.0, 16.0, vWorldPos.y) * smoothstep(760.0, 1180.0, -vWorldPos.z) * 0.25;
        color = mix(color, uFogColor, clamp(aerial * 0.36 + lowFog, 0.0, 0.58));
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
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  geometry.deleteAttribute("uv");
  const material = createForestMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, FOREST_INSTANCE_TARGET);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const low = sampler.minY;
  const span = Math.max(1, sampler.maxY - sampler.minY);
  let placed = 0;
  let attempts = 0;
  const maxAttempts = FOREST_INSTANCE_TARGET * 18;

  while (placed < FOREST_INSTANCE_TARGET && attempts < maxAttempts) {
    attempts += 1;
    const x = (rng() - 0.5) * TERRAIN_WIDTH * 0.96;
    const z = TERRAIN_NEAR_Z - 42 - rng() * 850;
    const y = sampler.sampleHeight(x, z);
    const altitude = (y - low) / span;
    const slope = sampler.sampleSlope(x, z);
    if (z > -720) {
      continue;
    }
    if (altitude < 0.05 || altitude > 0.48) {
      continue;
    }
    if (slope < 0.42) {
      continue;
    }
    const density =
      smoothBlend(0.0, 0.26, altitude) *
      smoothBlend(0.58, 0.28, altitude) *
      smoothBlend(0.38, 0.78, slope) *
      (0.45 + 0.55 * Math.max(0, Math.sin(x * 0.006 + z * 0.004 + 1.4)));
    if (rng() > density) {
      continue;
    }

    const far = THREE.MathUtils.clamp((-z - 760) / 780, 0, 1);
    const scale = 3.4 + rng() * 6.2 + far * 7.6;
    dummy.position.set(x + (rng() - 0.5) * 7.5, y - scale * 0.20, z + (rng() - 0.5) * 7.5);
    dummy.rotation.set((rng() - 0.5) * 0.10, rng() * Math.PI * 2, (rng() - 0.5) * 0.10);
    dummy.scale.set(scale * (0.65 + rng() * 0.46), scale * (1.35 + rng() * 0.95), scale * (0.65 + rng() * 0.46));
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    color.setHSL(0.334 + (rng() - 0.5) * 0.045, 0.24 + rng() * 0.11, 0.032 + rng() * 0.072);
    mesh.setColorAt(placed, color);
    placed += 1;
  }

  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.frustumCulled = false;
  return { mesh, count: placed, attempts };
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
      uOpacity: { value: 0.18 },
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
        float alpha = vFogAlpha * uOpacity * heightFade * (0.38 + breakup * 0.78) * (1.0 - uDark * 0.22);
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
  group.name = "Phase 67 WebGPU/TSL alpine fog feasibility backdrop";
  group.visible = false;

  const stats: WebGpuScenicStats = {
    requested: false,
    eligible: false,
    active: false,
    fallbackActive: true,
    reason: "not requested",
    rendererPath: "WebGL Performance",
    webgpuAvailable: capabilities.webgpu,
    webgpuActive: false,
    webgpuProbeStatus: capabilities.webgpu ? "idle" : "unavailable",
    webgpuProbeError: capabilities.webgpu ? "" : "navigator.gpu unavailable",
    terrainVertices: 0,
    forestInstances: 0,
    fogMode: "off",
    fogLayers: 0,
    extraRenderPass: false,
  };

  const startWebGpuProbe = createWebGpuProbe(stats);
  let built = false;
  let terrainMaterial: THREE.ShaderMaterial | null = null;
  let fogMaterials: THREE.ShaderMaterial[] = [];

  const build = () => {
    if (built) {
      return;
    }
    built = true;
    const terrain = buildTerrain();
    terrainMaterial = createTerrainMaterial();
    const terrainMesh = new THREE.Mesh(terrain.geometry, terrainMaterial);
    terrainMesh.name = "Phase 67 eroded alpine terrain proof";
    terrainMesh.frustumCulled = false;
    group.add(terrainMesh);

    const forest = buildForest(terrain.sampler);
    forest.mesh.name = "Phase 67 ecological instanced mountain-base forest";
    group.add(forest.mesh);

    const fogGeometries = [
      buildHeightFogGeometry(-720, -1180, 36, 2280),
      buildHeightFogGeometry(-860, -1500, 78, 2400),
      buildHeightFogGeometry(-1030, -1680, 126, 2100),
    ];
    fogMaterials = fogGeometries.map(() => createHeightFogMaterial());
    fogGeometries.forEach((geometry, index) => {
      const fog = new THREE.Mesh(geometry, fogMaterials[index]);
      fog.name = `Phase 67 pooled height fog layer ${index + 1}`;
      fog.renderOrder = 4 + index;
      fog.frustumCulled = false;
      group.add(fog);
    });

    stats.terrainVertices = terrain.geometry.attributes.position.count;
    stats.forestInstances = forest.count;
    stats.fogLayers = fogGeometries.length;
    stats.fogMode = "WebGL height fog approximation";
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
      fogMaterials.forEach((material, index) => {
        material.uniforms.uColor.value.setHex(palette.fogColor);
        material.uniforms.uTime.value = elapsed;
        material.uniforms.uDark.value = dark;
        material.uniforms.uOpacity.value = 0.105 + weather.dials.fog * 0.16 + index * 0.026;
      });
    },
    setGate: (gate) => {
      stats.requested = gate.requested;
      stats.eligible = gate.eligible;
      stats.active = gate.active;
      stats.fallbackActive = gate.fallbackActive;
      stats.reason = gate.reason;
      stats.rendererPath = gate.active ? "WebGL ScenicExperimental" : "WebGL Performance";
      stats.webgpuActive = false;
      group.visible = gate.active;
      if (gate.requested) {
        startWebGpuProbe();
      }
      if (gate.active) {
        build();
      }
    },
    getStats: () => ({ ...stats }),
  };
};
