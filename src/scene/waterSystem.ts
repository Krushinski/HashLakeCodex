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

const createOrganicWaterGeometry = () => {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const depthFactors: number[] = [];
  const sandFactors: number[] = [];
  const indices: number[] = [];
  const step = 18;
  const { minX, maxX, minZ, maxZ } = LAKE_MAP.mapBounds;
  const deepColor = new THREE.Color(0x021f3a);
  const midColor = new THREE.Color(0x055f90);
  const shallowColor = new THREE.Color(0x2c8790);
  const sandbarColor = new THREE.Color(0x75a894);
  const coveColor = new THREE.Color(0x011a32);

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
      tint.lerp(sandbarColor, nearSandbar * 0.56);
      tint.lerp(shallowColor, nearIsland * 0.28);
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
      uDeepColor: { value: new THREE.Color(0x022d55) },
      uShallowColor: { value: new THREE.Color(0x2b8790) },
      uStormColor: { value: new THREE.Color(0x061924) },
      uSunColor: { value: new THREE.Color(SCENARIO_PALETTES.Serene.sunColor) },
      uCamPos: { value: new THREE.Vector3() },
      uReflectionStrength: { value: 0.88 },
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

        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);
        fresnel = clamp(mix(0.05, 0.9, fresnel) + uChop * 0.05, 0.0, 1.0);
        vec3 deep = mix(uDeepColor * 0.38, uStormColor * 0.78, uDark);
        vec3 shallow = mix(uShallowColor * 0.50, vec3(0.40, 0.52, 0.52), uStale * 0.42);
        vec3 depthColor = mix(shallow, deep, vDepth);
        depthColor = mix(depthColor, vec3(0.43, 0.40, 0.29), vSand * (1.0 - uDark) * 0.18);
        depthColor = mix(depthColor, vColor * 0.48, 0.24);
        depthColor = mix(depthColor, vec3(0.30, 0.10, 0.035), uFire * 0.45);

        vec3 reflectedSky = mix(vec3(0.15, 0.27, 0.33), uSunColor * 0.50, 0.08);
        reflectedSky = mix(reflectedSky, vec3(0.045, 0.060, 0.076), uDark * 0.9);
        float horizonMirror = smoothstep(-620.0, -270.0, vWorldPos.z) * (1.0 - smoothstep(40.0, 230.0, vWorldPos.z));
        float treelineMirror = horizonMirror * (0.58 + 0.42 * smoothstep(0.18, 0.82, vDepth));
        float streaks = sin(vWorldPos.x * 0.042 + sin(vWorldPos.z * 0.014 + uTime * 0.22) * 1.8) * 0.5 + 0.5;
        streaks *= sin(vWorldPos.x * 0.011 - uTime * 0.09) * 0.18 + 0.82;
        vec3 reflectedTree = mix(vec3(0.006, 0.020, 0.023), vec3(0.030, 0.060, 0.060), streaks);
        vec3 mountainReflection = mix(vec3(0.030, 0.064, 0.084), vec3(0.11, 0.145, 0.15), streaks);
        float horizontalShimmer = sin(vWorldPos.x * 0.018 + uTime * 0.16) * 0.5 + 0.5;
        vec3 color = mix(depthColor, reflectedSky, fresnel * (0.30 + (1.0 - uDark) * 0.18));
        color = mix(color, mountainReflection, horizonMirror * 0.24 * uReflectionStrength);
        color = mix(color, reflectedTree, treelineMirror * (0.66 + fresnel * 0.38) * uReflectionStrength);
        color += vec3(0.012, 0.026, 0.030) * horizontalShimmer * horizonMirror * uReflectionStrength;
        color *= 0.58 + vDepth * 0.12;

        vec3 sunDir = normalize(vec3(-0.36, 0.72 - uDark * 0.28, -0.44));
        vec3 halfDir = normalize(viewDir + sunDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), mix(420.0, 82.0, uChop + uDark * 0.35));
        color += uSunColor * spec * (1.0 - uDark * 0.78) * 2.8;

        float crest = smoothstep(0.55, 0.95, normal.x * normal.x + normal.z * normal.z + uChop * 0.08);
        color += vec3(0.66, 0.75, 0.80) * crest * uDark * 0.22;
        color += vec3(0.75, 0.82, 1.0) * uFlash * 0.24;
        color = mix(color, vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), uStale * 0.16);

        gl_FragColor = vec4(color, 0.94);
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
      surface.reflectionEnabled = preset !== "Performance";
      material.uniforms.uReflectionStrength.value =
        preset === "Scenic" ? 1.28 : preset === "Performance" ? 0.46 : 0.98;
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
  water.mesh.material.uniforms.uDeepColor.value.setHex(palette.waterDeep);
  water.mesh.material.uniforms.uShallowColor.value.setHex(palette.waterShallow);
  water.mesh.material.uniforms.uStormColor.value.setHex(palette.waterDeep);
  water.mesh.material.uniforms.uSunColor.value.setHex(palette.sunColor);
  camera.getWorldPosition(water.mesh.material.uniforms.uCamPos.value);
};
