import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { SCENARIO_PALETTES, getWeatherPalette } from "./artDirection";
import { LAKE_FEATURE_FOOTPRINTS, LAKE_MAP, distanceToShore, isWater } from "./lakeMap";
import type { LakeFeatureFootprint } from "./lakeMap";
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

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const ellipseInfluence = (
  point: { x: number; z: number },
  footprint: LakeFeatureFootprint,
  radii: { radiusX: number; radiusZ: number },
) => {
  const dx = point.x - footprint.center.x;
  const dz = point.z - footprint.center.z;
  const cos = Math.cos(-footprint.rotation);
  const sin = Math.sin(-footprint.rotation);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return smoothstep(0, 1, clamp(1 - Math.hypot(localX / radii.radiusX, localZ / radii.radiusZ), 0, 1));
};

const inspirationDeepWater = new THREE.Color(0x032f48);
const inspirationShallowWater = new THREE.Color(0x39a294);
const inspirationHorizonWater = new THREE.Color(0x8fc7cf);
const hashLake3DeepWater = new THREE.Color(0x0c343a);

const createOrganicWaterGeometry = () => {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const depthFactors: number[] = [];
  const sandFactors: number[] = [];
  const shoreFactors: number[] = [];
  const indices: number[] = [];
  const step = 4.0;
  const { minX, maxX, minZ, maxZ } = LAKE_MAP.mapBounds;
  const deepColor = new THREE.Color(0x011d33);
  const midColor = new THREE.Color(0x053e52);
  const shallowColor = new THREE.Color(0x2a857c);
  const sandbarColor = new THREE.Color(0x9fd8c8);
  const coveColor = new THREE.Color(0x041f30);
  const samplePoint = (point: { x: number; z: number }) => {
    const shoreDistance = Math.max(0, distanceToShore(point));
    const shoreDepth = clamp(shoreDistance / 132, 0, 1);
    const shoreFactor = 1 - smoothstep(14, 96, shoreDistance);
    const nearSandbar = ellipseInfluence(
      point,
      LAKE_FEATURE_FOOTPRINTS.sandbar,
      LAKE_FEATURE_FOOTPRINTS.sandbar.shallowInner,
    );
    const nearSandbarBroad = ellipseInfluence(
      point,
      LAKE_FEATURE_FOOTPRINTS.sandbar,
      LAKE_FEATURE_FOOTPRINTS.sandbar.shallowOuter,
    );
    const nearIsland = ellipseInfluence(
      point,
      LAKE_FEATURE_FOOTPRINTS.island,
      LAKE_FEATURE_FOOTPRINTS.island.shallowInner,
    );
    const nearIslandBroad = ellipseInfluence(
      point,
      LAKE_FEATURE_FOOTPRINTS.island,
      LAKE_FEATURE_FOOTPRINTS.island.shallowOuter,
    );
    const cove = LAKE_MAP.destinations.find((destination) => destination.key === "cove")?.center ?? {
      x: 0,
      z: 0,
    };
    const nearCove = clamp(1 - Math.hypot(point.x - cove.x, point.z - cove.z) / 190, 0, 1);
    const sandFeature = clamp(
      Math.max(nearSandbar * 0.82, nearIsland * 0.72) +
        Math.max(nearSandbarBroad * 0.30, nearIslandBroad * 0.26),
      0,
      1,
    );
    const shallowShelf = clamp(
      Math.max(nearSandbarBroad * 0.62, nearIslandBroad * 0.54) +
        Math.max(nearSandbar * 0.18, nearIsland * 0.14),
      0,
      1,
    );
    const depthBase = smoothstep(0, 1, shoreDepth);
    const featureDepthRelief = shallowShelf * 0.38 + sandFeature * 0.18;
    const tint = shallowColor
      .clone()
      .lerp(midColor, smoothstep(0.08, 0.76, shoreDepth))
      .lerp(deepColor, smoothstep(0.42, 1, shoreDepth) * 0.72);
    tint.lerp(sandbarColor, sandFeature * 0.22 + shallowShelf * 0.055);
    tint.lerp(coveColor, nearCove * 0.20);

    return {
      depth: clamp(depthBase - featureDepthRelief + nearCove * 0.08, 0.14, 1),
      sand: sandFeature,
      shore: shoreFactor,
      tint,
    };
  };

  const isStableWaterTile = (center: { x: number; z: number }) => {
    const inset = step * 0.42;
    const samples = [
      center,
      { x: center.x - inset, z: center.z - inset },
      { x: center.x + inset, z: center.z - inset },
      { x: center.x + inset, z: center.z + inset },
      { x: center.x - inset, z: center.z + inset },
    ];
    const centerShoreDistance = distanceToShore(center);
    const waterSamples = samples.reduce(
      (count, sample) => count + (isWater(sample) ? 1 : 0),
      0,
    );

    return (
      (isWater(center) && centerShoreDistance > -step * 0.7) ||
      (waterSamples >= 3 && centerShoreDistance > -step * 1.15)
    );
  };

  for (let x = minX; x < maxX; x += step) {
    for (let z = minZ; z < maxZ; z += step) {
      const center = {
        x: x + step * 0.5,
        z: z + step * 0.5,
      };

      const tileVertices = [
        { x, z },
        { x: x + step, z },
        { x: x + step, z: z + step },
        { x, z: z + step },
      ];
      if (!isStableWaterTile(center)) {
        continue;
      }

      const vertexIndex = positions.length / 3;
      positions.push(x, 0, z, x + step, 0, z, x + step, 0, z + step, x, 0, z + step);

      for (const vertex of tileVertices) {
        const sample = samplePoint(vertex);
        colors.push(sample.tint.r, sample.tint.g, sample.tint.b);
        depthFactors.push(sample.depth);
        sandFactors.push(sample.sand);
        shoreFactors.push(sample.shore);
      }

      indices.push(vertexIndex, vertexIndex + 2, vertexIndex + 1);
      indices.push(vertexIndex, vertexIndex + 3, vertexIndex + 2);
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("depthFactor", new THREE.Float32BufferAttribute(depthFactors, 1));
  geometry.setAttribute("sandFactor", new THREE.Float32BufferAttribute(sandFactors, 1));
  geometry.setAttribute("shoreFactor", new THREE.Float32BufferAttribute(shoreFactors, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

export const createWater = (): WaterSurface => {
  const geometry = createOrganicWaterGeometry();
  const normalMap = createWaterNormalTexture(384, 17);
  const detailNormalMap = createWaterNormalTexture(256, 41);
  let currentPreset: WaterQualityPreset = "Balanced";
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uNormalMap: { value: normalMap },
      uDetailNormalMap: { value: detailNormalMap },
      uTime: { value: 0 },
      uChop: { value: 0 },
      uWind: { value: 0 },
      uRain: { value: 0 },
      uDark: { value: 0 },
      uFire: { value: 0 },
      uFlash: { value: 0 },
      uStale: { value: 0 },
      uDeepColor: { value: new THREE.Color(0x04384f) },
      uShallowColor: { value: new THREE.Color(0x32978d) },
      uHorizonColor: { value: new THREE.Color(0x72b7c2) },
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
      uniform float uRain;
      uniform vec2 uBoatPos;
      uniform float uBoatSpeed;
      attribute float depthFactor;
      attribute float sandFactor;
      attribute float shoreFactor;
      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying float vDepth;
      varying float vSand;
      varying float vShore;
      varying float vWake;

      void main() {
        vColor = color;
        vDepth = depthFactor;
        vSand = sandFactor;
        vShore = shoreFactor;
        float waveSpeed = 0.54 + uWind * 1.72 + uRain * 0.48;
        float waveHeight = (0.128 + uChop * 2.08 + uRain * 0.32) * (0.30 + vDepth * 0.70);
        float speedWake = clamp(abs(uBoatSpeed) / 100.0, 0.0, 1.0);
        float distanceToBoat = distance(position.xz, uBoatPos);
        float localWake = smoothstep(46.0, 10.0, distanceToBoat) *
          speedWake *
          sin(distanceToBoat * 0.26 - uTime * 5.2);
        float tidal = sin(position.x * 0.0022 - position.z * 0.0031 + uTime * (0.032 + uWind * 0.018)) *
          waveHeight *
          0.62;
        float breeze = sin(position.x * 0.018 - position.z * 0.012 + uTime * (0.18 + uWind * 0.22)) *
          waveHeight *
          (0.36 + uWind * 0.22);
        float lakeBreath = sin(position.x * -0.006 + position.z * 0.011 + uTime * (0.092 + uWind * 0.046)) *
          waveHeight *
          0.48;
        float travelingRipple = sin(position.x * 0.030 + position.z * -0.021 + uTime * (0.44 + uWind * 0.34)) *
          waveHeight *
          (0.18 + uWind * 0.12);
        float glassRoll = sin(position.x * 0.0044 + position.z * -0.0036 + uTime * (0.052 + uWind * 0.040)) *
          waveHeight *
          0.44;
        float longWave = sin(position.x * 0.010 + position.z * 0.0045 + uTime * waveSpeed) * waveHeight;
        float crossWave = cos(position.x * -0.0075 + position.z * 0.017 + uTime * waveSpeed * 0.72) *
          waveHeight *
          0.52;
        float micro = sin((position.x + position.z) * (0.040 + uChop * 0.030) +
          uTime * (0.56 + uChop * 1.28)) *
          (0.016 + uChop * 0.12 + uRain * 0.040) *
          (0.24 + vDepth * 0.76);
        vec3 displaced = position;
        displaced.y += (tidal + breeze + lakeBreath + travelingRipple + glassRoll + longWave + crossWave + micro) * (1.0 - vShore * 0.54) + localWake * 0.16;
        vWake = localWake;
        vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uNormalMap;
      uniform sampler2D uDetailNormalMap;
      uniform float uTime;
      uniform float uChop;
      uniform float uWind;
      uniform float uRain;
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
      uniform vec2 uBoatPos;
      uniform float uReflectionStrength;
      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying float vDepth;
      varying float vSand;
      varying float vShore;
      varying float vWake;

      vec3 sampleNormal(vec2 uv) {
        float t = uTime * (0.82 + uWind * 1.55 + uChop * 1.42 + uRain * 0.54);
        vec3 n1 = texture2D(uNormalMap, uv * 0.012 + vec2(t * 0.0062, t * 0.0034)).rgb;
        vec3 n2 = texture2D(uNormalMap, uv * 0.032 + vec2(-t * 0.0084, t * 0.0062)).rgb;
        vec3 n3 = texture2D(uDetailNormalMap, uv * 0.084 + vec2(t * 0.0056, -t * 0.0082)).rgb;
        vec3 n4 = texture2D(uDetailNormalMap, uv * 0.158 + vec2(-t * 0.0044, t * 0.0096)).rgb;
        vec3 n5 = texture2D(uDetailNormalMap, uv * 0.254 + vec2(t * 0.0028, t * 0.0112)).rgb;
        vec3 n6 = texture2D(uDetailNormalMap, uv * 0.382 + vec2(-t * 0.0020, t * 0.0124)).rgb;
        vec3 n = (n1 * 0.32 + n2 * 0.27 + n3 * 0.19 + n4 * 0.11 + n5 * 0.07 + n6 * 0.04) * 2.0 - 1.0;
        return normalize(vec3(n.x, 1.54, n.z));
      }

      void main() {
        vec3 viewDir = normalize(uCamPos - vWorldPos);
        float dist = length(uCamPos - vWorldPos);
        float detailFade = exp(-dist * 0.0032);
        vec3 normal = sampleNormal(vWorldPos.xz);
        float normalStrength = (0.42 + uWind * 0.18 + uRain * 0.20 + uChop * uChop * 1.16) * (0.48 + detailFade * 0.52);
        normal = normalize(mix(vec3(0.0, 1.0, 0.0), normal, normalStrength));

        float facing = max(dot(viewDir, normal), 0.0);
        float fresnel = pow(1.0 - facing, 1.72);
        fresnel = clamp(mix(0.17, 1.0, fresnel) + uChop * 0.060 + uWind * 0.030, 0.0, 1.0);
        float depth = smoothstep(0.02, 1.0, vDepth);
        float openWater = smoothstep(0.20, 0.96, depth);
        float shore = 1.0 - openWater;
        float sandGlow = smoothstep(0.10, 0.92, vSand) * (1.0 - uDark * 0.34);

        vec3 deep = mix(uDeepColor, uStormColor, clamp(uDark + uRain * 0.10, 0.0, 1.0));
        deep = mix(deep, vec3(0.004, 0.078, 0.128), (1.0 - uDark) * 0.095);
        vec3 shallow = mix(uShallowColor, vec3(0.66, 0.76, 0.63), sandGlow * 0.22);
        shallow = mix(shallow, vec3(0.30, 0.40, 0.38), uStale * 0.28);
        vec3 base = mix(shallow, deep, smoothstep(0.12, 0.94, depth));
        base = mix(base, vColor, 0.010 + shore * 0.018);
        base = mix(base, vec3(0.42, 0.78, 0.70), sandGlow * (1.0 - uDark * 0.42) * 0.145);
        base = mix(base, vec3(0.050, 0.096, 0.112), uFire * 0.10);

        float bodyWaveA = sin(vWorldPos.x * 0.0052 + vWorldPos.z * 0.0032 + uTime * (0.036 + uWind * 0.034));
        float bodyWaveB = sin(vWorldPos.x * -0.0030 + vWorldPos.z * 0.0064 - uTime * (0.032 + uWind * 0.029));
        float bodyWave = bodyWaveA * 0.56 + bodyWaveB * 0.44;
        float basin = smoothstep(0.22, 0.88, depth) * (0.986 + bodyWave * 0.014);
        base = mix(base, base * vec3(0.44, 0.70, 0.92), basin * (1.0 - uDark * 0.24) * 0.104);
        base += vec3(0.002, 0.014, 0.026) * (1.0 - uDark * 0.18) * openWater;

        float farBand = smoothstep(-710.0, -210.0, vWorldPos.z) * (1.0 - smoothstep(120.0, 380.0, vWorldPos.z));
        farBand *= smoothstep(0.10, 0.92, depth);
        float skySwell = bodyWave * 0.5 + 0.5;
        vec3 skyMirror = mix(uHorizonColor, uSunColor * 0.68, 0.18);
        skyMirror = mix(skyMirror, vec3(0.030, 0.046, 0.055), uDark * 0.72);
        float horizonGlass = smoothstep(0.18, 0.96, farBand) * (0.58 + skySwell * 0.18);
        vec3 reflectedMood = skyMirror;
        reflectedMood += vec3(0.064, 0.126, 0.142) * skySwell * openWater * (1.0 - uDark * 0.36) * 0.34;
        reflectedMood = mix(reflectedMood, uHorizonColor * 0.72, horizonGlass * 0.10);

        float reflectionAmount = clamp((fresnel * 1.08 + horizonGlass * 0.045 + openWater * 0.10) * uReflectionStrength * (1.0 - uRain * 0.15), 0.0, 0.88);
        vec3 color = mix(base, reflectedMood, reflectionAmount);
        color = mix(
          color,
          color * vec3(0.60, 0.78, 0.92),
          basin * (1.0 - sandGlow * 0.52) * (0.075 + uDark * 0.035)
        );

        float nearCamera = smoothstep(720.0, 100.0, dist);
        float midWave = sin(vWorldPos.x * 0.012 + vWorldPos.z * 0.009 + uTime * (0.116 + uWind * 0.084)) * 0.5 + 0.5;
        midWave = mix(midWave, sin(vWorldPos.x * -0.009 + vWorldPos.z * 0.014 - uTime * (0.102 + uWind * 0.052)) * 0.5 + 0.5, 0.34);
        float windSheet = sin(vWorldPos.x * 0.020 - vWorldPos.z * 0.015 + uTime * (0.38 + uWind * 0.42)) * 0.5 + 0.5;
        float fineRipple = sin(vWorldPos.x * 0.052 + vWorldPos.z * 0.034 + uTime * (0.84 + uChop * 0.58 + uWind * 0.32)) * 0.5 + 0.5;
        fineRipple *= sin(vWorldPos.x * -0.030 + vWorldPos.z * 0.050 - uTime * (0.66 + uRain * 0.34)) * 0.5 + 0.5;
        float glassRipple = sin(vWorldPos.x * 0.080 - vWorldPos.z * 0.058 + uTime * (1.18 + uWind * 0.50)) * 0.5 + 0.5;
        glassRipple *= sin(vWorldPos.x * -0.070 + vWorldPos.z * 0.078 - uTime * 0.96) * 0.5 + 0.5;
        float threadRipple = sin(vWorldPos.x * 0.142 + vWorldPos.z * -0.106 + uTime * (1.48 + uWind * 0.44)) * 0.5 + 0.5;
        threadRipple *= sin(vWorldPos.x * -0.122 + vWorldPos.z * 0.116 - uTime * 1.30) * 0.5 + 0.5;
        float needleRipple = sin(vWorldPos.x * 0.216 + vWorldPos.z * 0.154 + uTime * (1.78 + uWind * 0.48)) * 0.5 + 0.5;
        needleRipple *= sin(vWorldPos.x * -0.194 + vWorldPos.z * 0.210 - uTime * 1.58) * 0.5 + 0.5;
        float wavelet = sin(vWorldPos.x * 0.330 - vWorldPos.z * 0.270 + uTime * (2.04 + uWind * 0.58)) * 0.5 + 0.5;
        wavelet *= sin(vWorldPos.x * -0.286 + vWorldPos.z * 0.318 - uTime * 1.86) * 0.5 + 0.5;
        float calmMotion = bodyWave * 0.5 + (midWave - 0.5) * 0.34 + (windSheet - 0.5) * 0.14;
        color *= 0.990 + calmMotion * openWater * (1.0 - uDark * 0.24) * (0.068 + uWind * 0.022);
        color += vec3(0.054, 0.142, 0.164) * (midWave - 0.42) * openWater * (0.22 + nearCamera * 0.22) * (1.0 - uDark * 0.18);
        color += vec3(0.38, 0.60, 0.66) * pow(fineRipple, 2.05) * openWater * (0.20 + nearCamera * 0.48) * (0.15 + uChop * 0.18 + uWind * 0.09);
        float rippleLace = pow(max(0.0, fineRipple * 0.38 + windSheet * 0.20 + glassRipple * 0.18 + threadRipple * 0.12 + needleRipple * 0.07 + wavelet * 0.05), 3.18);
        color += vec3(0.48, 0.74, 0.80) * rippleLace * openWater * (0.20 + nearCamera * 0.34) * (1.0 - uDark * 0.36);
        float softSparkle = pow(max(0.0, fineRipple * 0.38 + glassRipple * 0.27 + threadRipple * 0.16 + needleRipple * 0.10 + wavelet * 0.09), 3.20) * smoothstep(0.12, 0.82, skySwell) * detailFade;
        color += vec3(0.72, 0.97, 1.0) * softSparkle * openWater * (0.34 + nearCamera * 0.50) * (1.0 - uDark * 0.36);
        float glintLane = pow(max(0.0, windSheet * 0.31 + glassRipple * 0.35 + threadRipple * 0.18 + needleRipple * 0.10 + wavelet * 0.06), 4.8) * smoothstep(0.13, 0.94, fresnel);
        glintLane *= (0.52 + nearCamera * 0.88) * openWater * (1.0 - uDark * 0.44);
        color += vec3(0.92, 1.0, 1.0) * glintLane * (0.25 + uWind * 0.08 + uChop * 0.06);

        float causticA = sin(vWorldPos.x * 0.055 + vWorldPos.z * 0.030 + uTime * 0.20);
        float causticB = sin(vWorldPos.x * -0.038 + vWorldPos.z * 0.060 - uTime * 0.17);
        float caustic = pow(max(0.0, causticA * 0.5 + causticB * 0.5), 2.7);
        float opticalShallow = smoothstep(0.08, 0.55, 1.0 - depth) * (1.0 - smoothstep(0.52, 0.95, sandGlow));
        color += vec3(0.118, 0.238, 0.204) * caustic * opticalShallow * (1.0 - uDark * 0.45) * 0.26;

        float skyWindow = smoothstep(0.38, 0.96, fresnel) * openWater * (1.0 - uDark * 0.28);
        color += uHorizonColor * skyWindow * (0.082 + (1.0 - uDark) * 0.036);
        color += vec3(0.020, 0.058, 0.056) * shore * (1.0 - uDark * 0.5);

        float contactDistance = distance(vWorldPos.xz, uBoatPos);
        float boatContact = 1.0 - smoothstep(8.0, 30.0, contactDistance);
        float boatSheen = smoothstep(12.0, 36.0, contactDistance) * (1.0 - smoothstep(36.0, 58.0, contactDistance));
        color = mix(color, color * vec3(0.80, 0.90, 0.94), boatContact * 0.018);
        color += vec3(0.20, 0.48, 0.52) * boatSheen * (0.030 + abs(vWake) * 0.045);

        vec3 sunDir = normalize(vec3(-0.32, 0.74 - uDark * 0.26, -0.48));
        vec3 halfDir = normalize(viewDir + sunDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), mix(132.0, 46.0, clamp(uChop + uRain * 0.32 + uDark * 0.20, 0.0, 1.0)));
        float specMask = smoothstep(0.24, 1.0, skySwell) * (0.44 + openWater * 0.56);
        color += uSunColor * spec * specMask * (1.0 - uDark * 0.42) * (7.60 + uWind * 1.22);
        float broadSun = pow(max(dot(reflect(-viewDir, vec3(0.0, 1.0, 0.0)), sunDir), 0.0), 2.25);
        color += mix(uHorizonColor, uSunColor, 0.30) * broadSun * openWater * (1.0 - uDark * 0.48) * 0.190;
        float sunGlance = pow(max(dot(reflect(-viewDir, normal), sunDir), 0.0), 4.15);
        color += mix(uHorizonColor, uSunColor, 0.36) * sunGlance * openWater * (1.0 - uDark * 0.48) * (0.56 + uWind * 0.12);
        float glitterFlecks = pow(max(0.0, sunGlance * 0.46 + glintLane * 0.36 + softSparkle * 0.18), 1.42);
        color += vec3(0.98, 1.0, 0.92) * glitterFlecks * openWater * detailFade * (1.0 - uDark * 0.52) * 0.20;

        float crest = smoothstep(0.60, 1.0, normal.x * normal.x + normal.z * normal.z + uChop * 0.10);
        color += vec3(0.62, 0.76, 0.82) * crest * (uDark * 0.16 + uChop * 0.12 + uRain * 0.06);
        color += vec3(0.78, 0.86, 1.0) * uFlash * 0.25;
        color = mix(color, vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), uStale * 0.13);
        color = mix(color, color * vec3(0.74, 0.86, 0.92), uDark * 0.08);
        color *= 1.10 - uDark * 0.03;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    vertexColors: true,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Single-surface world-space procedural lake water";
  mesh.receiveShadow = true;
  mesh.position.y = -0.035;
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
        currentPreset === "Scenic" ? 1.18 : currentPreset === "Performance" ? 0.82 : 1.02;
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
  const waterPalette = getWeatherPalette(Math.min(weather.stormIndex, 72));
  water.mesh.material.uniforms.uTime.value = elapsed;
  water.mesh.material.uniforms.uChop.value = weather.dials.chop;
  water.mesh.material.uniforms.uWind.value = weather.dials.wind;
  water.mesh.material.uniforms.uRain.value = weather.dials.rain;
  water.mesh.material.uniforms.uDark.value = weather.dials.skyDark;
  water.mesh.material.uniforms.uFire.value = weather.dials.fireWeather;
  water.mesh.material.uniforms.uFlash.value =
    weather.dials.lightning > 0.08 && Math.sin(elapsed * 8.5) > 0.88
      ? weather.dials.lightning * 0.34
      : 0;
  water.mesh.material.uniforms.uStale.value = weather.staleData ? 1 : 0;
  water.mesh.material.uniforms.uDeepColor.value
    .setHex(waterPalette.waterDeep)
    .lerp(inspirationDeepWater, Math.max(0.18, 0.50 - weather.dials.skyDark * 0.34))
    .lerp(hashLake3DeepWater, 0.24);
  water.mesh.material.uniforms.uShallowColor.value
    .setHex(waterPalette.waterShallow)
    .lerp(inspirationShallowWater, Math.max(0.24, 0.66 - weather.dials.skyDark * 0.34));
  water.mesh.material.uniforms.uHorizonColor.value
    .setHex(waterPalette.skyHorizon)
    .lerp(inspirationHorizonWater, Math.max(0.18, 0.50 - weather.dials.skyDark * 0.24));
  water.mesh.material.uniforms.uStormColor.value.setHex(waterPalette.waterDeep);
  water.mesh.material.uniforms.uSunColor.value.setHex(palette.sunColor);
  camera.getWorldPosition(water.mesh.material.uniforms.uCamPos.value);
  water.mesh.material.uniforms.uBoatPos.value.set(driveState.x, driveState.z);
  water.mesh.material.uniforms.uBoatSpeed.value = driveState.speed;
};
