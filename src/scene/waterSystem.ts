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
  const shoreFactors: number[] = [];
  const indices: number[] = [];
  const step = 12;
  const { minX, maxX, minZ, maxZ } = LAKE_MAP.mapBounds;
  const deepColor = new THREE.Color(0x043f65);
  const midColor = new THREE.Color(0x0b6780);
  const shallowColor = new THREE.Color(0x2c9295);
  const sandbarColor = new THREE.Color(0x78936e);
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

      const shoreDistance = Math.max(0, distanceToShore(center));
      const shoreDepth = clamp(shoreDistance / 128, 0, 1);
      const shoreFactor = 1 - clamp(shoreDistance / 86, 0, 1);
      const sandbarDx = (center.x - LAKE_MAP.sandbar.center.x) / (LAKE_MAP.sandbar.radiusX + 128);
      const sandbarDz = (center.z - LAKE_MAP.sandbar.center.z) / (LAKE_MAP.sandbar.radiusZ + 86);
      const nearSandbar = clamp(1 - Math.hypot(sandbarDx, sandbarDz), 0, 1);
      const islandDx = (center.x - LAKE_MAP.island.center.x) / (LAKE_MAP.island.radiusX + 78);
      const islandDz = (center.z - LAKE_MAP.island.center.z) / (LAKE_MAP.island.radiusZ + 62);
      const nearIsland = clamp(1 - Math.hypot(islandDx, islandDz), 0, 1);
      const cove = LAKE_MAP.destinations.find((destination) => destination.key === "cove")?.center ?? {
        x: 0,
        z: 0,
      };
      const nearCove = clamp(1 - Math.hypot(center.x - cove.x, center.z - cove.z) / 190, 0, 1);
      const tint = shallowColor
        .clone()
        .lerp(midColor, shoreDepth)
        .lerp(deepColor, shoreDepth * 0.7);
      tint.lerp(sandbarColor, nearSandbar * 0.34);
      tint.lerp(shallowColor, nearIsland * 0.12);
      tint.lerp(coveColor, nearCove * 0.25);

      for (let vertex = 0; vertex < 4; vertex += 1) {
        colors.push(tint.r, tint.g, tint.b);
        depthFactors.push(clamp(shoreDepth + nearCove * 0.06, 0.12, 1));
        sandFactors.push(nearSandbar);
        shoreFactors.push(shoreFactor);
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
        float waveSpeed = 0.34 + uWind * 1.2;
        float waveHeight = (0.06 + uChop * 1.8) * (0.32 + vDepth * 0.68);
        float speedWake = clamp(abs(uBoatSpeed) / 90.0, 0.0, 1.0);
        float distanceToBoat = distance(position.xz, uBoatPos);
        float localWake = max(0.0, 1.0 - distanceToBoat / 42.0) *
          speedWake *
          sin(distanceToBoat * 0.62 - uTime * 11.0);
        float longWave = sin(position.x * 0.014 + position.z * 0.006 + uTime * waveSpeed) * waveHeight;
        float crossWave = cos(position.x * -0.010 + position.z * 0.023 + uTime * waveSpeed * 0.72) *
          waveHeight *
          0.52;
        float micro = sin((position.x + position.z) * (0.040 + uChop * 0.030) +
          uTime * (0.68 + uChop * 1.45)) *
          (0.014 + uChop * 0.16) *
          (0.24 + vDepth * 0.76);
        vec3 displaced = position;
        displaced.y += (longWave + crossWave + micro) * (1.0 - vShore * 0.46) + localWake * 0.55;
        vWake = localWake;
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
      uniform vec2 uBoatPos;
      uniform float uReflectionStrength;
      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying float vDepth;
      varying float vSand;
      varying float vShore;
      varying float vWake;

      vec3 sampleNormal(vec2 uv) {
        float t = uTime * (0.46 + uWind * 1.12 + uChop * 1.05);
        vec3 n1 = texture2D(uNormalMap, uv * 0.020 + vec2(t * 0.0062, t * 0.0036)).rgb;
        vec3 n2 = texture2D(uNormalMap, uv * 0.060 + vec2(-t * 0.0080, t * 0.0057)).rgb;
        vec3 n3 = texture2D(uNormalMap, uv * 0.135 + vec2(t * 0.0040, -t * 0.0072)).rgb;
        vec3 n = (n1 * 0.48 + n2 * 0.36 + n3 * 0.16) * 2.0 - 1.0;
        return normalize(vec3(n.x, 2.20, n.z));
      }

      void main() {
        vec3 viewDir = normalize(uCamPos - vWorldPos);
        float dist = length(uCamPos - vWorldPos);
        float detailFade = exp(-dist * 0.0032);
        vec3 normal = sampleNormal(vWorldPos.xz);
        float normalStrength = (0.17 + uChop * uChop * 0.88) * (0.36 + detailFade * 0.64);
        normal = normalize(mix(vec3(0.0, 1.0, 0.0), normal, normalStrength));

        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.15);
        fresnel = clamp(mix(0.10, 1.0, fresnel) + uChop * 0.055, 0.0, 1.0);
        float openWater = smoothstep(0.24, 0.94, vDepth);
        float shore = 1.0 - openWater;
        float sandGlow = vSand * (1.0 - uDark * 0.34);

        vec3 deep = mix(uDeepColor, uStormColor, uDark);
        vec3 shallow = mix(uShallowColor, vec3(0.54, 0.58, 0.42), sandGlow * 0.30);
        shallow = mix(shallow, vec3(0.30, 0.40, 0.38), uStale * 0.28);
        vec3 base = mix(shallow, deep, smoothstep(0.05, 0.98, vDepth));
        base = mix(base, vColor, 0.10 + shore * 0.13);
        base = mix(base, vec3(0.32, 0.10, 0.035), uFire * 0.42);

        float basinNoise = sin(vWorldPos.x * 0.006 + vWorldPos.z * 0.010) * 0.5 + 0.5;
        float basin = smoothstep(0.42, 0.96, vDepth) * (0.42 + basinNoise * 0.58);
        base = mix(base, base * vec3(0.70, 0.88, 0.98), basin * (1.0 - uDark * 0.34) * 0.22);
        base += vec3(0.030, 0.090, 0.115) * (1.0 - uDark * 0.20) * openWater;

        float farBand = smoothstep(-650.0, -260.0, vWorldPos.z) * (1.0 - smoothstep(70.0, 310.0, vWorldPos.z));
        farBand *= smoothstep(0.18, 0.86, vDepth);
        float forestColumns = pow(1.0 - abs(fract(vWorldPos.x * 0.016 + sin(vWorldPos.z * 0.014 + uTime * 0.025) * 0.06) - 0.5) * 2.0, 2.2);
        float skySwell = pow(sin(vWorldPos.x * 0.010 + vWorldPos.z * 0.006 + uTime * 0.045) * 0.5 + 0.5, 2.8);
        vec3 skyMirror = mix(uHorizonColor, uSunColor * 0.60, 0.16);
        skyMirror = mix(skyMirror, vec3(0.035, 0.050, 0.060), uDark * 0.78);
        vec3 forestMirror = mix(vec3(0.010, 0.045, 0.038), vec3(0.028, 0.095, 0.080), forestColumns);
        vec3 reflectedMood = mix(skyMirror, forestMirror, 0.48 + farBand * 0.26);
        reflectedMood += vec3(0.070, 0.150, 0.165) * skySwell * openWater * (1.0 - uDark * 0.34) * 0.32;

        vec3 color = mix(base, reflectedMood, (fresnel * 0.58 + farBand * 0.44) * uReflectionStrength);

        float nearCamera = smoothstep(720.0, 100.0, dist);
        float rippleField = pow(
          (sin(vWorldPos.x * 0.055 + sin(vWorldPos.z * 0.026) * 2.0 + uTime * 0.46) * 0.5 + 0.5) *
            (sin(vWorldPos.z * 0.085 - uTime * 0.38) * 0.5 + 0.5),
          2.35
        );
        float broadMotion = pow(
          sin(vWorldPos.x * -0.009 + vWorldPos.z * 0.014 - uTime * 0.052) * 0.5 + 0.5,
          2.0
        );
        float longSwell = sin(vWorldPos.x * 0.012 + vWorldPos.z * 0.018 + uTime * 0.065) * 0.5 + 0.5;
        longSwell *= sin(vWorldPos.x * -0.006 + vWorldPos.z * 0.011 - uTime * 0.045) * 0.5 + 0.5;
        float crossingSwell = sin(vWorldPos.x * 0.018 - vWorldPos.z * 0.012 + uTime * 0.072) * 0.5 + 0.5;
        float reflectionCells = pow(longSwell * crossingSwell, 1.55);
        float waveThreads = pow(sin(vWorldPos.x * 0.024 + vWorldPos.z * 0.034 + uTime * 0.13) * 0.5 + 0.5, 3.15);
        float shortCrests = smoothstep(0.68, 0.94, sin(vWorldPos.x * 0.072 + vWorldPos.z * 0.038 + uTime * 0.72) * 0.5 + 0.5);
        shortCrests *= smoothstep(0.58, 0.96, sin(vWorldPos.x * -0.040 + vWorldPos.z * 0.066 - uTime * 0.54) * 0.5 + 0.5);
        color += vec3(0.095, 0.215, 0.255) * rippleField * openWater * (0.18 + nearCamera * 0.56) * (1.0 - uDark * 0.10) * 0.58;
        color += vec3(0.130, 0.295, 0.345) * broadMotion * openWater * (0.24 + nearCamera * 0.32) * (1.0 - uDark * 0.16);
        color += vec3(0.105, 0.245, 0.300) * reflectionCells * openWater * (1.0 - uDark * 0.18) * 0.32;
        color += vec3(0.110, 0.275, 0.335) * longSwell * openWater * (1.0 - uDark * 0.18) * 0.26;
        color += vec3(0.34, 0.56, 0.62) * waveThreads * openWater * (1.0 - uDark * 0.20) * 0.12;
        color += vec3(0.42, 0.68, 0.76) * shortCrests * openWater * (0.16 + nearCamera * 0.54) * (1.0 - uDark * 0.16) * 0.10;
        color += vec3(0.014, 0.052, 0.054) * shore * (1.0 - uDark * 0.5);

        float contactDistance = distance(vWorldPos.xz, uBoatPos);
        float boatContact = 1.0 - smoothstep(8.0, 30.0, contactDistance);
        float boatSheen = smoothstep(12.0, 36.0, contactDistance) * (1.0 - smoothstep(36.0, 58.0, contactDistance));
        color = mix(color, color * vec3(0.48, 0.62, 0.68), boatContact * 0.18);
        color += vec3(0.28, 0.58, 0.62) * boatSheen * (0.10 + abs(vWake) * 0.12);

        vec3 sunDir = normalize(vec3(-0.32, 0.74 - uDark * 0.26, -0.48));
        vec3 halfDir = normalize(viewDir + sunDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), mix(180.0, 54.0, uChop + uDark * 0.20));
        float specMask = smoothstep(0.22, 1.0, skySwell) * (0.34 + openWater * 0.66);
        color += uSunColor * spec * specMask * (1.0 - uDark * 0.38) * 4.4;

        float crest = smoothstep(0.60, 1.0, normal.x * normal.x + normal.z * normal.z + uChop * 0.10);
        color += vec3(0.62, 0.76, 0.82) * crest * (uDark * 0.14 + uChop * 0.08);
        color += vec3(0.78, 0.86, 1.0) * uFlash * 0.25;
        color = mix(color, vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), uStale * 0.13);
        color = mix(color, color * vec3(0.74, 0.86, 0.92), uDark * 0.08);
        color *= 1.08 - uDark * 0.02;

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
        currentPreset === "Scenic" ? 1.18 : currentPreset === "Performance" ? 0.82 : 1;
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
