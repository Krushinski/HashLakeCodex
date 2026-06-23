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

const inspirationDeepWater = new THREE.Color(0x0a6793);
const inspirationShallowWater = new THREE.Color(0x2b9295);
const inspirationHorizonWater = new THREE.Color(0x77c7d2);
const hashLake3DeepWater = new THREE.Color(0x123c40);

const createOrganicWaterGeometry = () => {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const depthFactors: number[] = [];
  const sandFactors: number[] = [];
  const indices: number[] = [];
  const step = 30;
  const { minX, maxX, minZ, maxZ } = LAKE_MAP.mapBounds;
  const deepColor = new THREE.Color(0x043d63);
  const midColor = new THREE.Color(0x0a617a);
  const shallowColor = new THREE.Color(0x29939a);
  const sandbarColor = new THREE.Color(0x6f927b);
  const coveColor = new THREE.Color(0x06304d);

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
      const shoreDepth = clamp(distanceToShore(center) / 92, 0, 1);
      const sandbarDx = (center.x - LAKE_MAP.sandbar.center.x) / (LAKE_MAP.sandbar.radiusX + 84);
      const sandbarDz = (center.z - LAKE_MAP.sandbar.center.z) / (LAKE_MAP.sandbar.radiusZ + 58);
      const nearSandbar = clamp(1 - Math.hypot(sandbarDx, sandbarDz), 0, 1);
      const islandDx = (center.x - LAKE_MAP.island.center.x) / (LAKE_MAP.island.radiusX + 56);
      const islandDz = (center.z - LAKE_MAP.island.center.z) / (LAKE_MAP.island.radiusZ + 46);
      const nearIsland = clamp(1 - Math.hypot(islandDx, islandDz), 0, 1);
      const cove = LAKE_MAP.destinations.find((destination) => destination.key === "cove")?.center ?? {
        x: 0,
        z: 0,
      };
      const nearCove = clamp(1 - Math.hypot(center.x - cove.x, center.z - cove.z) / 170, 0, 1);
      const tint = shallowColor
        .clone()
        .lerp(midColor, shoreDepth)
        .lerp(deepColor, shoreDepth * 0.72);
      tint.lerp(sandbarColor, nearSandbar * 0.44);
      tint.lerp(shallowColor, nearIsland * 0.18);
      tint.lerp(coveColor, nearCove * 0.32);
      for (let vertex = 0; vertex < 4; vertex += 1) {
        colors.push(tint.r, tint.g, tint.b);
        depthFactors.push(clamp(shoreDepth + nearCove * 0.08, 0.18, 1));
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
  const normalMap = createWaterNormalTexture(192, 17);
  let currentPreset: WaterQualityPreset = "Balanced";
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uNormalMap: { value: normalMap },
      uTime: { value: 0 },
      uChop: { value: 0 },
      uWind: { value: 0 },
      uDark: { value: 0 },
      uFire: { value: 0 },
      uFlash: { value: 0 },
      uStale: { value: 0 },
      uDeepColor: { value: new THREE.Color(0x0a6793) },
      uShallowColor: { value: new THREE.Color(0x2b9295) },
      uHorizonColor: { value: new THREE.Color(0x77c7d2) },
      uStormColor: { value: new THREE.Color(0x061924) },
      uSunColor: { value: new THREE.Color(SCENARIO_PALETTES.Serene.sunColor) },
      uCamPos: { value: new THREE.Vector3() },
      uBoatPos: { value: new THREE.Vector2() },
      uBoatSpeed: { value: 0 },
      uReflectionStrength: { value: 1 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uChop;
      uniform float uWind;
      uniform vec2 uBoatPos;
      uniform float uBoatSpeed;
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
        float waveHeight = 0.045 + uChop * 1.72;
        float waveSpeed = 0.32 + uWind * 1.25;
        float speedWake = clamp(abs(uBoatSpeed) / 90.0, 0.0, 1.0);
        float distanceToBoat = distance(position.xz, uBoatPos);
        float localWake = max(0.0, 1.0 - distanceToBoat / 34.0) *
          speedWake *
          sin(distanceToBoat * 0.56 - uTime * 10.2);
        float longWave = sin(position.x * 0.018 + uTime * waveSpeed) * waveHeight * vDepth;
        float crossWave = cos(position.z * 0.026 + uTime * (waveSpeed * 0.68)) *
          waveHeight *
          0.42 *
          vDepth;
        float micro = sin((position.x + position.z) * (0.040 + uChop * 0.044) +
          uTime * (0.62 + uChop * 1.6)) *
          (0.012 + uChop * 0.18);
        vec3 displaced = position;
        displaced.y += longWave + crossWave + micro + localWake * 0.48;
        vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uNormalMap;
      uniform float uTime;
      uniform float uChop;
      uniform float uWind;
      uniform float uDark;
      uniform float uFire;
      uniform float uFlash;
      uniform float uStale;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uStormColor;
      uniform vec3 uSunColor;
      uniform vec3 uCamPos;
      uniform float uReflectionStrength;
      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying float vDepth;
      varying float vSand;

      vec3 sampleNormal(vec2 uv) {
        float t = uTime * (0.64 + uWind * 1.35 + uChop * 1.25);
        vec3 n1 = texture2D(uNormalMap, uv * 0.026 + vec2(t * 0.0056, t * 0.0037)).rgb;
        vec3 n2 = texture2D(uNormalMap, uv * 0.067 + vec2(-t * 0.0088, t * 0.0052)).rgb;
        vec3 n = (n1 * 0.58 + n2 * 0.42) * 2.0 - 1.0;
        return normalize(vec3(n.x, 2.35, n.z));
      }

      void main() {
        vec3 viewDir = normalize(uCamPos - vWorldPos);
        float dist = length(uCamPos - vWorldPos);
        float detailFade = exp(-dist * 0.0038);
        vec3 normal = sampleNormal(vWorldPos.xz);
        float normalStrength = (0.10 + uChop * uChop * 0.92) * (0.28 + detailFade * 0.72);
        normal = normalize(mix(vec3(0.0, 1.0, 0.0), normal, normalStrength));

        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.6);
        fresnel = clamp(mix(0.055, 1.0, fresnel) + uChop * 0.035, 0.0, 1.0);
        float openWater = smoothstep(0.28, 0.98, vDepth);
        float shore = 1.0 - openWater;
        float sandGlow = vSand * (1.0 - uDark * 0.35);

        vec3 deep = mix(uDeepColor, uStormColor, uDark);
        vec3 shallow = mix(uShallowColor, vec3(0.42, 0.52, 0.43), sandGlow * 0.34);
        shallow = mix(shallow, vec3(0.30, 0.40, 0.38), uStale * 0.28);
        vec3 base = mix(shallow, deep, smoothstep(0.06, 0.96, vDepth));
        base = mix(base, vColor, 0.055 + shore * 0.055);
        base = mix(base, vec3(0.32, 0.10, 0.035), uFire * 0.44);

        float farBand = smoothstep(-650.0, -300.0, vWorldPos.z) * (1.0 - smoothstep(78.0, 315.0, vWorldPos.z));
        farBand *= smoothstep(0.22, 0.92, vDepth);
        float reflectionBreakup = sin(vWorldPos.x * 0.018 + sin(vWorldPos.z * 0.012 + uTime * 0.11) * 1.7) * 0.5 + 0.5;
        float verticalForest = sin(vWorldPos.x * 0.055 + uTime * 0.025) * 0.5 + 0.5;
        vec3 skyMirror = mix(uHorizonColor, uSunColor * 0.55, 0.16);
        skyMirror = mix(skyMirror, vec3(0.035, 0.050, 0.060), uDark * 0.82);
        vec3 forestMirror = mix(vec3(0.030, 0.095, 0.070), vec3(0.010, 0.034, 0.030), verticalForest);
        vec3 reflectedMood = mix(skyMirror, forestMirror, 0.52 + farBand * 0.22);
        reflectedMood += vec3(0.070, 0.130, 0.128) * pow(reflectionBreakup, 3.5) * (1.0 - uDark * 0.70);

        vec3 color = mix(base, reflectedMood, (fresnel * 0.60 + farBand * 0.42) * uReflectionStrength);

        float waveSilk = sin(vWorldPos.x * 0.019 + vWorldPos.z * 0.006 + uTime * 0.075) * 0.5 + 0.5;
        float crossSilk = sin(vWorldPos.x * -0.010 + vWorldPos.z * 0.030 - uTime * 0.11) * 0.5 + 0.5;
        float silk = pow(waveSilk * crossSilk, 2.8);
        float needleGlint = pow(sin(vWorldPos.x * 0.046 + vWorldPos.z * 0.014 + uTime * 0.22) * 0.5 + 0.5, 9.0);
        needleGlint *= pow(sin(vWorldPos.x * -0.019 + vWorldPos.z * 0.038 - uTime * 0.16) * 0.5 + 0.5, 2.4);
        float readableRipples = pow(sin(vWorldPos.z * 0.052 + sin(vWorldPos.x * 0.010) * 1.8 + uTime * 0.16) * 0.5 + 0.5, 4.2);
        readableRipples *= 0.50 + 0.50 * (sin(vWorldPos.x * 0.018 - uTime * 0.05) * 0.5 + 0.5);
        color += vec3(0.100, 0.215, 0.250) * silk * openWater * (1.0 - uDark * 0.72);
        color += vec3(0.070, 0.170, 0.205) * readableRipples * openWater * (1.0 - uDark * 0.64) * 0.30;
        color += vec3(0.60, 0.84, 0.88) * needleGlint * openWater * (1.0 - uDark * 0.82) * 0.31;
        color += uHorizonColor * fresnel * openWater * (1.0 - uDark * 0.78) * 0.075;
        color += vec3(0.16, 0.26, 0.25) * farBand * (0.08 + reflectionBreakup * 0.16) * (1.0 - uDark * 0.76);
        color += vec3(0.014, 0.052, 0.054) * shore * (1.0 - uDark * 0.5);

        vec3 sunDir = normalize(vec3(-0.32, 0.74 - uDark * 0.26, -0.48));
        vec3 halfDir = normalize(viewDir + sunDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), mix(470.0, 86.0, uChop + uDark * 0.28));
        float glintMask = smoothstep(0.58, 1.0, reflectionBreakup) * (0.46 + openWater * 0.54);
        color += uSunColor * spec * glintMask * (1.0 - uDark * 0.76) * 4.2;

        float crest = smoothstep(0.58, 0.98, normal.x * normal.x + normal.z * normal.z + uChop * 0.08);
        color += vec3(0.66, 0.76, 0.82) * crest * uDark * 0.20;
        color += vec3(0.78, 0.86, 1.0) * uFlash * 0.27;
        color = mix(color, vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), uStale * 0.13);
        color = mix(color, color * vec3(0.66, 0.74, 0.78), uDark * 0.22);
        color *= 1.08 - uDark * 0.10;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    vertexColors: true,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Single-pass glossy procedural lake water";
  mesh.receiveShadow = true;
  mesh.position.y = 0;
  mesh.renderOrder = 5;
  const position = geometry.attributes.position;
  const surface: WaterSurface = {
    mesh,
    basePositions: new Float32Array(position.array),
    reflectionEnabled: true,
    setQualityPreset: (preset) => {
      currentPreset = preset;
      surface.reflectionEnabled = true;
      material.uniforms.uReflectionStrength.value =
        currentPreset === "Scenic" ? 1.16 : currentPreset === "Performance" ? 0.86 : 1;
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
    .lerp(inspirationDeepWater, Math.max(0.26, 0.78 - weather.dials.skyDark * 0.48))
    .lerp(hashLake3DeepWater, 0.12);
  water.mesh.material.uniforms.uShallowColor.value
    .setHex(palette.waterShallow)
    .lerp(inspirationShallowWater, Math.max(0.18, 0.62 - weather.dials.skyDark * 0.34));
  water.mesh.material.uniforms.uHorizonColor.value
    .setHex(palette.skyHorizon)
    .lerp(inspirationHorizonWater, Math.max(0.20, 0.58 - weather.dials.skyDark * 0.28));
  water.mesh.material.uniforms.uStormColor.value.setHex(palette.waterDeep);
  water.mesh.material.uniforms.uSunColor.value.setHex(palette.sunColor);
  camera.getWorldPosition(water.mesh.material.uniforms.uCamPos.value);
  water.mesh.material.uniforms.uBoatPos.value.set(driveState.x, driveState.z);
  water.mesh.material.uniforms.uBoatSpeed.value = driveState.speed;
};
