import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { SCENARIO_PALETTES, getWeatherPalette } from "./artDirection";
import {
  LAKE_MAP,
  distanceToShore,
  isWater,
} from "./lakeMap";
import { createWaterNormalTexture } from "./scenicUtils";

type DriveWaterState = {
  x: number;
  z: number;
  speed: number;
};

export type WaterSurface = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  basePositions: Float32Array;
  reflectionEnabled: boolean;
  setQualityPreset: (preset: WaterQualityPreset) => void;
};

type WaterQualityPreset = "Performance" | "Balanced" | "Scenic";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const defaultDeepWater = new THREE.Color(0x011d38);
const defaultShallowWater = new THREE.Color(0x1d6974);

const createOrganicWaterGeometry = () => {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const depthFactors: number[] = [];
  const sandFactors: number[] = [];
  const indices: number[] = [];
  const step = 18;
  const { minX, maxX, minZ, maxZ } = LAKE_MAP.mapBounds;
  const deepColor = new THREE.Color(0x01192f);
  const midColor = new THREE.Color(0x06466d);
  const shallowColor = new THREE.Color(0x1f6f7b);
  const sandbarColor = new THREE.Color(0x477d78);
  const coveColor = new THREE.Color(0x010f22);

  for (let x = minX; x < maxX; x += step) {
    for (let z = minZ; z < maxZ; z += step) {
      const center = {
        x: x + step * 0.5,
        z: z + step * 0.5,
      };

      if (!isWater(center)) {
        continue;
      }

      const vertexIndex = positions.length / 3;
      positions.push(x, 0, z, x + step, 0, z, x + step, 0, z + step, x, 0, z + step);
      const shoreDepth = clamp(distanceToShore(center) / 82, 0, 1);
      const sandbarDx = (center.x - LAKE_MAP.sandbar.center.x) / (LAKE_MAP.sandbar.radiusX + 64);
      const sandbarDz = (center.z - LAKE_MAP.sandbar.center.z) / (LAKE_MAP.sandbar.radiusZ + 48);
      const nearSandbar = clamp(1 - Math.hypot(sandbarDx, sandbarDz), 0, 1);
      const islandDx = (center.x - LAKE_MAP.island.center.x) / (LAKE_MAP.island.radiusX + 48);
      const islandDz = (center.z - LAKE_MAP.island.center.z) / (LAKE_MAP.island.radiusZ + 42);
      const nearIsland = clamp(1 - Math.hypot(islandDx, islandDz), 0, 1);
      const cove = LAKE_MAP.destinations.find((destination) => destination.key === "cove")?.center ?? {
        x: 0,
        z: 0,
      };
      const nearCove = clamp(1 - Math.hypot(center.x - cove.x, center.z - cove.z) / 150, 0, 1);
      const tint = shallowColor
        .clone()
        .lerp(midColor, shoreDepth)
        .lerp(deepColor, shoreDepth * 0.68);
      tint.lerp(sandbarColor, nearSandbar * 0.34);
      tint.lerp(shallowColor, nearIsland * 0.18);
      tint.lerp(coveColor, nearCove * 0.38);
      for (let vertex = 0; vertex < 4; vertex += 1) {
        colors.push(tint.r, tint.g, tint.b);
        depthFactors.push(clamp(shoreDepth + nearCove * 0.12, 0.24, 1));
        sandFactors.push(nearSandbar);
      }
      indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
      indices.push(vertexIndex, vertexIndex + 2, vertexIndex + 3);
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("depthFactor", new THREE.Float32BufferAttribute(depthFactors, 1));
  geometry.setAttribute("sandFactor", new THREE.Float32BufferAttribute(sandFactors, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

export const createWater = (): WaterSurface => {
  const geometry = createOrganicWaterGeometry();
  const normalA = createWaterNormalTexture(192, 11);
  const normalB = createWaterNormalTexture(192, 29);
  let currentPreset: WaterQualityPreset = "Balanced";
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uNormalA: { value: normalA },
      uNormalB: { value: normalB },
      uTime: { value: 0 },
      uChop: { value: 0 },
      uWind: { value: 0 },
      uDark: { value: 0 },
      uFire: { value: 0 },
      uFlash: { value: 0 },
      uStale: { value: 0 },
      uDeepColor: { value: new THREE.Color(0x011f3d) },
      uShallowColor: { value: new THREE.Color(0x1c6f78) },
      uStormColor: { value: new THREE.Color(0x041018) },
      uSunColor: { value: new THREE.Color(SCENARIO_PALETTES.Serene.sunColor) },
      uCamPos: { value: new THREE.Vector3() },
      uReflectionStrength: { value: 1.26 },
    },
    vertexShader: `
      attribute float depthFactor;
      attribute float sandFactor;
      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying float vDepth;
      varying float vSand;

      void main() {
        vColor = color;
        vDepth = depthFactor;
        vSand = sandFactor;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uNormalA;
      uniform sampler2D uNormalB;
      uniform float uTime;
      uniform float uChop;
      uniform float uWind;
      uniform float uDark;
      uniform float uFire;
      uniform float uFlash;
      uniform float uStale;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uStormColor;
      uniform vec3 uSunColor;
      uniform vec3 uCamPos;
      uniform float uReflectionStrength;
      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying float vDepth;
      varying float vSand;

      vec3 sampleNormal(vec2 uv) {
        float t = uTime * (0.7 + uWind * 2.2 + uChop * 1.1);
        vec3 n1 = texture2D(uNormalA, uv * 0.030 + vec2(t * 0.0065, t * 0.0042)).rgb;
        vec3 n2 = texture2D(uNormalB, uv * 0.071 + vec2(-t * 0.0104, t * 0.0061)).rgb;
        vec3 n3 = texture2D(uNormalA, uv * 0.0049 + vec2(t * 0.0021, -t * 0.0015)).rgb;
        vec3 n = (n1 + n2) * 0.5 + (n3 - 0.5) * 0.6;
        n = n * 2.0 - 1.0;
        return normalize(vec3(n.x, 2.2, n.z));
      }

      void main() {
        vec3 viewDir = normalize(uCamPos - vWorldPos);
        float dist = length(uCamPos - vWorldPos);
        float detailFade = exp(-dist * 0.004);
        vec3 normal = sampleNormal(vWorldPos.xz);
        float strength = (0.16 + uChop * uChop * 0.96) * (0.32 + detailFade * 0.68);
        normal = normalize(mix(vec3(0.0, 1.0, 0.0), normal, strength));

        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.15);
        fresnel = clamp(mix(0.08, 0.95, fresnel) + uChop * 0.04, 0.0, 1.0);
        vec3 deep = mix(uDeepColor * 0.48, uStormColor * 0.86, uDark);
        vec3 shallow = mix(uShallowColor * 0.58, vec3(0.28, 0.42, 0.44), uStale * 0.42);
        vec3 depthColor = mix(shallow, deep, smoothstep(0.10, 1.0, vDepth));
        depthColor = mix(depthColor, vec3(0.30, 0.34, 0.25), vSand * (1.0 - uDark) * 0.10);
        depthColor = mix(depthColor, vColor * 0.56, 0.16);
        depthColor = mix(depthColor, vec3(0.30, 0.10, 0.035), uFire * 0.45);

        vec3 reflectedSky = mix(vec3(0.20, 0.34, 0.40), uSunColor * 0.42, 0.08);
        reflectedSky = mix(reflectedSky, vec3(0.035, 0.050, 0.066), uDark * 0.92);
        float horizonMirror = smoothstep(-675.0, -315.0, vWorldPos.z) * (1.0 - smoothstep(20.0, 250.0, vWorldPos.z));
        horizonMirror *= smoothstep(0.20, 0.92, vDepth);
        float treelineMirror = horizonMirror * (0.66 + 0.34 * smoothstep(0.28, 0.88, vDepth));
        float streaks = sin(vWorldPos.x * 0.026 + sin(vWorldPos.z * 0.010 + uTime * 0.12) * 1.15) * 0.5 + 0.5;
        streaks *= sin(vWorldPos.x * 0.007 - uTime * 0.055) * 0.12 + 0.88;
        vec3 reflectedTree = mix(vec3(0.002, 0.016, 0.018), vec3(0.020, 0.052, 0.052), streaks);
        vec3 mountainReflection = mix(vec3(0.040, 0.070, 0.086), vec3(0.13, 0.16, 0.16), streaks);
        float horizontalShimmer = sin(vWorldPos.x * 0.012 + uTime * 0.085) * 0.5 + 0.5;
        vec3 color = mix(depthColor, reflectedSky, fresnel * (0.42 + (1.0 - uDark) * 0.14));
        color = mix(color, mountainReflection, horizonMirror * 0.46 * uReflectionStrength);
        color = mix(color, reflectedTree, treelineMirror * (0.72 + fresnel * 0.28) * uReflectionStrength);
        color += vec3(0.020, 0.042, 0.050) * horizontalShimmer * horizonMirror * uReflectionStrength;
        float openWater = smoothstep(0.30, 0.96, vDepth) * (1.0 - vSand * 0.72);
        float silk = sin(vWorldPos.x * 0.018 + sin(vWorldPos.z * 0.012 + uTime * 0.05) * 1.4 + uTime * 0.07) * 0.5 + 0.5;
        silk = pow(silk, 3.0);
        float broadSheen = sin(vWorldPos.z * 0.016 - uTime * 0.035) * 0.5 + 0.5;
        float farGloss = smoothstep(-520.0, -160.0, vWorldPos.z) * (1.0 - smoothstep(120.0, 300.0, vWorldPos.z));
        color += vec3(0.030, 0.078, 0.095) * openWater * (0.24 + silk * 0.74 + broadSheen * 0.16) * (1.0 - uDark * 0.72);
        color += vec3(0.020, 0.055, 0.070) * farGloss * (0.42 + horizontalShimmer * 0.34) * (1.0 - uDark * 0.75);
        color = mix(color, color + vec3(0.0, 0.032, 0.042), fresnel * openWater * (1.0 - uDark * 0.65));
        color *= 0.50 + vDepth * 0.22;
        color += vec3(0.005, 0.018, 0.030) * smoothstep(0.45, 1.0, vDepth);

        vec3 sunDir = normalize(vec3(-0.36, 0.72 - uDark * 0.28, -0.44));
        vec3 halfDir = normalize(viewDir + sunDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), mix(520.0, 96.0, uChop + uDark * 0.35));
        color += uSunColor * spec * (1.0 - uDark * 0.78) * 3.4;

        float crest = smoothstep(0.55, 0.95, normal.x * normal.x + normal.z * normal.z + uChop * 0.08);
        color += vec3(0.66, 0.75, 0.80) * crest * uDark * 0.22;
        color += vec3(0.75, 0.82, 1.0) * uFlash * 0.24;
        color = mix(color, vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), uStale * 0.16);
        color = mix(color, color * vec3(0.62, 0.68, 0.72), uDark * 0.26);

        gl_FragColor = vec4(color, 0.96);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "HashLake3-adapted procedural water";
  mesh.receiveShadow = true;
  mesh.position.y = 0;
  const position = geometry.attributes.position;
  const surface: WaterSurface = {
    mesh,
    basePositions: new Float32Array(position.array),
    reflectionEnabled: true,
    setQualityPreset: (preset) => {
      currentPreset = preset;
      surface.reflectionEnabled = preset !== "Performance";
      const presetStrength =
        currentPreset === "Scenic" ? 1.38 : currentPreset === "Performance" ? 0.92 : 1.26;
      material.uniforms.uReflectionStrength.value = presetStrength;
    },
  };
  return surface;
};

export const animateWater = (
  water: WaterSurface,
  elapsed: number,
  weather: WeatherSnapshot,
  driveState: DriveWaterState,
  camera: THREE.PerspectiveCamera,
) => {
  const position = water.mesh.geometry.attributes.position;
  const values = position.array as Float32Array;
  const depthFactors = water.mesh.geometry.attributes.depthFactor.array as Float32Array;
  const waveHeight = 0.08 + weather.dials.chop * 2.35;
  const waveSpeed = 0.42 + weather.dials.wind * 1.75;
  const chop = weather.dials.chop;
  const speedWake = clamp(Math.abs(driveState.speed) / 90, 0, 1);

  for (let index = 0; index < values.length; index += 3) {
    const x = water.basePositions[index];
    const z = water.basePositions[index + 2];
    const distanceToBoat = Math.hypot(x - driveState.x, z - driveState.z);
    const localWake =
      Math.max(0, 1 - distanceToBoat / 32) *
      speedWake *
      Math.sin(distanceToBoat * 0.58 - elapsed * 10.4);
    const shoreDepth = depthFactors[index / 3] ?? 1;
    const longWave = Math.sin(x * 0.024 + elapsed * waveSpeed) * waveHeight * shoreDepth;
    const crossWave =
      Math.cos(z * 0.031 + elapsed * (waveSpeed * 0.72)) * waveHeight * 0.48 * shoreDepth;
    const micro =
      Math.sin((x + z) * (0.052 + chop * 0.06) + elapsed * (0.82 + chop * 2.4)) *
      (0.028 + chop * 0.32);
    values[index + 1] = longWave + crossWave + micro + localWake * 0.62;
  }

  position.needsUpdate = true;
  const palette = getWeatherPalette(weather.stormIndex);
  water.mesh.material.uniforms.uTime.value = elapsed;
  water.mesh.material.uniforms.uChop.value = weather.dials.chop;
  water.mesh.material.uniforms.uWind.value = weather.dials.wind;
  water.mesh.material.uniforms.uDark.value = weather.dials.skyDark;
  water.mesh.material.uniforms.uFire.value = weather.dials.fireWeather;
  water.mesh.material.uniforms.uFlash.value =
    weather.dials.lightning > 0.08 && Math.sin(elapsed * 8.5) > 0.88
      ? weather.dials.lightning * 0.36
      : 0;
  water.mesh.material.uniforms.uStale.value = weather.staleData ? 1 : 0;
  water.mesh.material.uniforms.uDeepColor.value
    .setHex(palette.waterDeep)
    .lerp(defaultDeepWater, Math.max(0.18, 0.72 - weather.dials.skyDark * 0.4));
  water.mesh.material.uniforms.uShallowColor.value
    .setHex(palette.waterShallow)
    .lerp(defaultShallowWater, Math.max(0.12, 0.54 - weather.dials.skyDark * 0.36));
  water.mesh.material.uniforms.uStormColor.value.setHex(palette.waterDeep);
  water.mesh.material.uniforms.uSunColor.value.setHex(palette.sunColor);
  camera.getWorldPosition(water.mesh.material.uniforms.uCamPos.value);
};
