import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { SCENARIO_PALETTES, getWeatherPalette } from "./artDirection";
import { LAKE_MAP, distanceToShore, isWater } from "./lakeMap";
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

const inspirationDeepWater = new THREE.Color(0x07577a);
const inspirationShallowWater = new THREE.Color(0x2f8f8d);
const inspirationHorizonWater = new THREE.Color(0x9ccfd6);
const hashLake3DeepWater = new THREE.Color(0x0c343a);

const createOrganicWaterGeometry = () => {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const depthFactors: number[] = [];
  const sandFactors: number[] = [];
  const shoreFactors: number[] = [];
  const indices: number[] = [];
  const step = 7;
  const { minX, maxX, minZ, maxZ } = LAKE_MAP.mapBounds;
  const deepColor = new THREE.Color(0x05344d);
  const midColor = new THREE.Color(0x0a5964);
  const shallowColor = new THREE.Color(0x287c78);
  const sandbarColor = new THREE.Color(0x6d8e75);
  const coveColor = new THREE.Color(0x052638);
  const samplePoint = (point: { x: number; z: number }) => {
    const shoreDistance = Math.max(0, distanceToShore(point));
    const shoreDepth = clamp(shoreDistance / 168, 0, 1);
    const shoreFactor = 1 - clamp(shoreDistance / 124, 0, 1);
    const sandbarDx = (point.x - LAKE_MAP.sandbar.center.x) / (LAKE_MAP.sandbar.radiusX + 172);
    const sandbarDz = (point.z - LAKE_MAP.sandbar.center.z) / (LAKE_MAP.sandbar.radiusZ + 116);
    const nearSandbar = smoothstep(0, 1, clamp(1 - Math.hypot(sandbarDx, sandbarDz), 0, 1));
    const islandDx = (point.x - LAKE_MAP.island.center.x) / (LAKE_MAP.island.radiusX + 78);
    const islandDz = (point.z - LAKE_MAP.island.center.z) / (LAKE_MAP.island.radiusZ + 62);
    const nearIsland = clamp(1 - Math.hypot(islandDx, islandDz), 0, 1);
    const cove = LAKE_MAP.destinations.find((destination) => destination.key === "cove")?.center ?? {
      x: 0,
      z: 0,
    };
    const nearCove = clamp(1 - Math.hypot(point.x - cove.x, point.z - cove.z) / 190, 0, 1);
    const tint = shallowColor
      .clone()
      .lerp(midColor, shoreDepth)
      .lerp(deepColor, shoreDepth * 0.7);
    tint.lerp(sandbarColor, nearSandbar * 0.16);
    tint.lerp(shallowColor, nearIsland * 0.09);
    tint.lerp(coveColor, nearCove * 0.18);

    return {
      depth: clamp(smoothstep(0, 1, shoreDepth) + nearCove * 0.04, 0.14, 1),
      sand: nearSandbar,
      shore: shoreFactor,
      tint,
    };
  };

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

      const tileVertices = [
        { x, z },
        { x: x + step, z },
        { x: x + step, z: z + step },
        { x, z: z + step },
      ];
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
  const normalMap = createWaterNormalTexture(192, 17);
  const detailNormalMap = createWaterNormalTexture(128, 41);
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
        float waveSpeed = 0.36 + uWind * 1.28 + uRain * 0.36;
        float waveHeight = (0.070 + uChop * 1.64 + uRain * 0.22) * (0.32 + vDepth * 0.68);
        float speedWake = clamp(abs(uBoatSpeed) / 100.0, 0.0, 1.0);
        float distanceToBoat = distance(position.xz, uBoatPos);
        float localWake = smoothstep(46.0, 10.0, distanceToBoat) *
          speedWake *
          sin(distanceToBoat * 0.26 - uTime * 5.2);
        float tidal = sin(position.x * 0.0022 - position.z * 0.0031 + uTime * (0.032 + uWind * 0.018)) *
          waveHeight *
          0.52;
        float breeze = sin(position.x * 0.018 - position.z * 0.012 + uTime * (0.18 + uWind * 0.22)) *
          waveHeight *
          (0.18 + uWind * 0.12);
        float longWave = sin(position.x * 0.010 + position.z * 0.0045 + uTime * waveSpeed) * waveHeight;
        float crossWave = cos(position.x * -0.0075 + position.z * 0.017 + uTime * waveSpeed * 0.72) *
          waveHeight *
          0.46;
        float micro = sin((position.x + position.z) * (0.040 + uChop * 0.030) +
          uTime * (0.56 + uChop * 1.28)) *
          (0.012 + uChop * 0.11 + uRain * 0.035) *
          (0.24 + vDepth * 0.76);
        vec3 displaced = position;
        displaced.y += (tidal + breeze + longWave + crossWave + micro) * (1.0 - vShore * 0.54) + localWake * 0.16;
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
        float t = uTime * (0.54 + uWind * 1.18 + uChop * 1.15 + uRain * 0.42);
        vec3 n1 = texture2D(uNormalMap, uv * 0.016 + vec2(t * 0.0060, t * 0.0034)).rgb;
        vec3 n2 = texture2D(uNormalMap, uv * 0.044 + vec2(-t * 0.0072, t * 0.0053)).rgb;
        vec3 n3 = texture2D(uDetailNormalMap, uv * 0.118 + vec2(t * 0.0038, -t * 0.0068)).rgb;
        vec3 n4 = texture2D(uDetailNormalMap, uv * 0.214 + vec2(-t * 0.0032, t * 0.0078)).rgb;
        vec3 n = (n1 * 0.46 + n2 * 0.30 + n3 * 0.16 + n4 * 0.08) * 2.0 - 1.0;
        return normalize(vec3(n.x, 2.06, n.z));
      }

      void main() {
        vec3 viewDir = normalize(uCamPos - vWorldPos);
        float dist = length(uCamPos - vWorldPos);
        float detailFade = exp(-dist * 0.0032);
        vec3 normal = sampleNormal(vWorldPos.xz);
        float normalStrength = (0.21 + uWind * 0.08 + uRain * 0.13 + uChop * uChop * 0.92) * (0.38 + detailFade * 0.62);
        normal = normalize(mix(vec3(0.0, 1.0, 0.0), normal, normalStrength));

        float facing = max(dot(viewDir, normal), 0.0);
        float fresnel = pow(1.0 - facing, 2.05);
        fresnel = clamp(mix(0.13, 1.0, fresnel) + uChop * 0.055 + uWind * 0.025, 0.0, 1.0);
        float depth = smoothstep(0.02, 1.0, vDepth);
        float openWater = smoothstep(0.16, 0.96, depth);
        float shore = 1.0 - openWater;
        float sandGlow = smoothstep(0.04, 0.86, vSand) * (1.0 - uDark * 0.34);

        vec3 deep = mix(uDeepColor, uStormColor, clamp(uDark + uRain * 0.10, 0.0, 1.0));
        vec3 shallow = mix(uShallowColor, vec3(0.46, 0.56, 0.42), sandGlow * 0.22);
        shallow = mix(shallow, vec3(0.30, 0.40, 0.38), uStale * 0.28);
        vec3 base = mix(shallow, deep, smoothstep(0.04, 1.0, depth));
        base = mix(base, vColor, 0.018 + shore * 0.028);
        base = mix(base, vec3(0.32, 0.10, 0.035), uFire * 0.42);

        float bodyWaveA = sin(vWorldPos.x * 0.0052 + vWorldPos.z * 0.0032 + uTime * (0.036 + uWind * 0.034));
        float bodyWaveB = sin(vWorldPos.x * -0.0030 + vWorldPos.z * 0.0064 - uTime * (0.032 + uWind * 0.029));
        float bodyWave = bodyWaveA * 0.56 + bodyWaveB * 0.44;
        float basin = smoothstep(0.30, 0.98, depth) * (0.980 + bodyWave * 0.020);
        base = mix(base, base * vec3(0.70, 0.92, 1.0), basin * (1.0 - uDark * 0.30) * 0.064);
        base += vec3(0.018, 0.066, 0.084) * (1.0 - uDark * 0.24) * openWater;

        float farBand = smoothstep(-710.0, -210.0, vWorldPos.z) * (1.0 - smoothstep(120.0, 380.0, vWorldPos.z));
        farBand *= smoothstep(0.10, 0.92, depth);
        float forestColumns = sin(vWorldPos.x * 0.006 + sin(vWorldPos.z * 0.003) * 0.45 + uTime * 0.002) * 0.5 + 0.5;
        forestColumns = mix(forestColumns, sin(vWorldPos.x * 0.011 + 2.4) * 0.5 + 0.5, 0.22);
        forestColumns = smoothstep(0.16, 0.90, forestColumns);
        float skySwell = bodyWave * 0.5 + 0.5;
        vec3 skyMirror = mix(uHorizonColor, uSunColor * 0.68, 0.18);
        skyMirror = mix(skyMirror, vec3(0.030, 0.046, 0.055), uDark * 0.72);
        vec3 forestMirror = mix(vec3(0.008, 0.036, 0.032), vec3(0.026, 0.076, 0.062), forestColumns);
        float reflectedForest = 0.34 + farBand * 0.28 + smoothstep(-260.0, 120.0, vWorldPos.z) * 0.05;
        vec3 reflectedMood = mix(skyMirror, forestMirror, reflectedForest);
        reflectedMood += vec3(0.080, 0.154, 0.166) * skySwell * openWater * (1.0 - uDark * 0.36) * 0.40;

        float reflectionAmount = clamp((fresnel * 0.84 + farBand * 0.20 + openWater * 0.16) * uReflectionStrength * (1.0 - uRain * 0.16), 0.0, 0.90);
        vec3 color = mix(base, reflectedMood, reflectionAmount);

        float nearCamera = smoothstep(720.0, 100.0, dist);
        float midWave = sin(vWorldPos.x * 0.012 + vWorldPos.z * 0.009 + uTime * (0.116 + uWind * 0.084)) * 0.5 + 0.5;
        midWave = mix(midWave, sin(vWorldPos.x * -0.009 + vWorldPos.z * 0.014 - uTime * (0.102 + uWind * 0.052)) * 0.5 + 0.5, 0.34);
        float windSheet = sin(vWorldPos.x * 0.023 - vWorldPos.z * 0.017 + uTime * (0.23 + uWind * 0.28)) * 0.5 + 0.5;
        float fineRipple = sin(vWorldPos.x * 0.056 + vWorldPos.z * 0.036 + uTime * (0.50 + uChop * 0.42 + uWind * 0.18)) * 0.5 + 0.5;
        fineRipple *= sin(vWorldPos.x * -0.032 + vWorldPos.z * 0.052 - uTime * (0.40 + uRain * 0.26)) * 0.5 + 0.5;
        float calmMotion = bodyWave * 0.5 + (midWave - 0.5) * 0.26 + (windSheet - 0.5) * 0.10;
        color *= 0.994 + calmMotion * openWater * (1.0 - uDark * 0.24) * (0.030 + uWind * 0.010);
        color += vec3(0.062, 0.152, 0.184) * (midWave - 0.46) * openWater * (0.13 + nearCamera * 0.15) * (1.0 - uDark * 0.18);
        color += vec3(0.34, 0.54, 0.60) * pow(fineRipple, 2.8) * openWater * (0.14 + nearCamera * 0.34) * (0.10 + uChop * 0.16 + uWind * 0.05);
        float rippleLace = pow(max(0.0, fineRipple * 0.70 + windSheet * 0.30), 4.6);
        color += vec3(0.38, 0.64, 0.70) * rippleLace * openWater * (0.08 + nearCamera * 0.15) * (1.0 - uDark * 0.38);
        float softSparkle = pow(fineRipple, 5.0) * smoothstep(0.20, 0.90, skySwell) * detailFade;
        color += vec3(0.54, 0.82, 0.88) * softSparkle * openWater * (0.12 + nearCamera * 0.20) * (1.0 - uDark * 0.38);

        float causticA = sin(vWorldPos.x * 0.055 + vWorldPos.z * 0.030 + uTime * 0.20);
        float causticB = sin(vWorldPos.x * -0.038 + vWorldPos.z * 0.060 - uTime * 0.17);
        float caustic = pow(max(0.0, causticA * 0.5 + causticB * 0.5), 2.7);
        float opticalShallow = smoothstep(0.08, 0.55, 1.0 - depth) * (1.0 - smoothstep(0.52, 0.95, sandGlow));
        color += vec3(0.085, 0.185, 0.165) * caustic * opticalShallow * (1.0 - uDark * 0.45) * 0.18;

        float skyWindow = smoothstep(0.38, 0.96, fresnel) * openWater * (1.0 - uDark * 0.28);
        color += uHorizonColor * skyWindow * (0.070 + (1.0 - uDark) * 0.025);
        color += vec3(0.012, 0.040, 0.044) * shore * (1.0 - uDark * 0.5);

        float contactDistance = distance(vWorldPos.xz, uBoatPos);
        float boatContact = 1.0 - smoothstep(8.0, 30.0, contactDistance);
        float boatSheen = smoothstep(12.0, 36.0, contactDistance) * (1.0 - smoothstep(36.0, 58.0, contactDistance));
        color = mix(color, color * vec3(0.80, 0.90, 0.94), boatContact * 0.018);
        color += vec3(0.20, 0.48, 0.52) * boatSheen * (0.030 + abs(vWake) * 0.045);

        vec3 sunDir = normalize(vec3(-0.32, 0.74 - uDark * 0.26, -0.48));
        vec3 halfDir = normalize(viewDir + sunDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), mix(132.0, 46.0, clamp(uChop + uRain * 0.32 + uDark * 0.20, 0.0, 1.0)));
        float specMask = smoothstep(0.24, 1.0, skySwell) * (0.44 + openWater * 0.56);
        color += uSunColor * spec * specMask * (1.0 - uDark * 0.42) * (5.25 + uWind * 0.70);
        float broadSun = pow(max(dot(reflect(-viewDir, vec3(0.0, 1.0, 0.0)), sunDir), 0.0), 2.25);
        color += mix(uHorizonColor, uSunColor, 0.28) * broadSun * openWater * (1.0 - uDark * 0.48) * 0.105;
        float sunGlance = pow(max(dot(reflect(-viewDir, normal), sunDir), 0.0), 4.8);
        color += mix(uHorizonColor, uSunColor, 0.34) * sunGlance * openWater * (1.0 - uDark * 0.48) * (0.30 + uWind * 0.06);

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
        currentPreset === "Scenic" ? 1.24 : currentPreset === "Performance" ? 0.86 : 1.06;
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
  water.mesh.material.uniforms.uRain.value = weather.dials.rain;
  water.mesh.material.uniforms.uDark.value = weather.dials.skyDark;
  water.mesh.material.uniforms.uFire.value = weather.dials.fireWeather;
  water.mesh.material.uniforms.uFlash.value =
    weather.dials.lightning > 0.08 && Math.sin(elapsed * 8.5) > 0.88
      ? weather.dials.lightning * 0.34
      : 0;
  water.mesh.material.uniforms.uStale.value = weather.staleData ? 1 : 0;
  water.mesh.material.uniforms.uDeepColor.value
    .setHex(palette.waterDeep)
    .lerp(inspirationDeepWater, Math.max(0.24, 0.72 - weather.dials.skyDark * 0.44))
    .lerp(hashLake3DeepWater, 0.12);
  water.mesh.material.uniforms.uShallowColor.value
    .setHex(palette.waterShallow)
    .lerp(inspirationShallowWater, Math.max(0.18, 0.60 - weather.dials.skyDark * 0.32));
  water.mesh.material.uniforms.uHorizonColor.value
    .setHex(palette.skyHorizon)
    .lerp(inspirationHorizonWater, Math.max(0.20, 0.56 - weather.dials.skyDark * 0.26));
  water.mesh.material.uniforms.uStormColor.value.setHex(palette.waterDeep);
  water.mesh.material.uniforms.uSunColor.value.setHex(palette.sunColor);
  camera.getWorldPosition(water.mesh.material.uniforms.uCamPos.value);
  water.mesh.material.uniforms.uBoatPos.value.set(driveState.x, driveState.z);
  water.mesh.material.uniforms.uBoatSpeed.value = driveState.speed;
};
