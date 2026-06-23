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
  const thetaSegments = 128;
  const radialSegments = 10;
  const vertices: number[] = [];
  const elevs: number[] = [];
  const indices: number[] = [];
  const viewTheta = -Math.PI / 2;

  for (let thetaIndex = 0; thetaIndex <= thetaSegments; thetaIndex += 1) {
    const theta = (thetaIndex / thetaSegments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    let ridge =
      noise.fbm(cos * ridgeFrequency + 9.2, sin * ridgeFrequency + 4.7, 4) * 0.9 + 0.55;
    ridge = Math.pow(Math.max(0, Math.min(1, ridge)), hero ? 1.92 : 1.68);
    const jag =
      (Math.sin(theta * 13.0 + seed) * 0.5 + 0.5) *
      Math.max(0, noise.fbm(cos * 8.2 + seed, sin * 8.2 + 2.4, 3));
    ridge += jag * (hero ? 0.16 : 0.08);

    if (hero) {
      const centerPeak = angleDiff(theta, viewTheta + 0.1);
      const sidePeak = angleDiff(theta, viewTheta - 0.62);
      ridge += 0.55 * Math.exp(-(centerPeak * centerPeak) / (0.34 * 0.34));
      ridge += 0.38 * Math.exp(-(sidePeak * sidePeak) / (0.26 * 0.26));
      ridge = Math.min(ridge, 1.35);
    }

    const peakHeight = peakMin + (peakMax - peakMin) * ridge;
    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const radial = radialIndex / radialSegments;
      const radius = rInner + (rOuter - rInner) * radial;
      const rise =
        Math.pow(Math.sin(Math.PI * Math.min(radial / 0.78, 1) * 0.5), 1.25) *
        (radial < 0.78 ? 1 : 1 - (radial - 0.78) / 0.3);
      const detail =
        noise.fbm(cos * radius * 0.004 + 31, sin * radius * 0.004 + 17, 4) *
        peakHeight *
        (hero ? 0.28 : 0.2) *
        Math.max(rise, 0);
      const y = Math.max(0, peakHeight * Math.max(rise, 0) + detail);
      vertices.push(cos * radius, y, sin * radius);
      elevs.push(y / peakMax);
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
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

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
        float roughNoise = bl_fbm(vWorldPos.xz * 0.012);
        float broadNoise = bl_fbm(vWorldPos.xz * 0.0028 + 7.0);
        vec3 rock = mix(vec3(0.34, 0.35, 0.33), vec3(0.12, 0.15, 0.17), roughNoise)
          * (0.74 + 0.26 * broadNoise);
        float forest = smoothstep(0.45, 0.16, vElev) * smoothstep(0.34, 0.62, slope) * uForest;
        vec3 forestColor = vec3(0.035, 0.080, 0.050)
          * (0.75 + 0.55 * bl_fbm(vWorldPos.xz * 0.022 + 3.0));
        vec3 albedo = mix(rock, forestColor, forest);
        float snow = smoothstep(uSnowLine, uSnowLine + 0.13, vElev + roughNoise * 0.07)
          * smoothstep(0.18, 0.46, slope);
        albedo = mix(albedo, vec3(0.68, 0.70, 0.66), snow * 0.20);

        float diffuse = max(dot(normal, uSunDir), 0.0);
        vec3 color = albedo * (uSunColor * diffuse * 1.18 + uAmbient * (0.38 + 0.44 * slope));
        vec3 sideNormal = normalize(vec3(normal.x, 0.0, normal.z) + vec3(0.001, 0.0, 0.001));
        float sideLight = smoothstep(-0.55, 0.70, dot(sideNormal, normalize(vec3(-0.72, 0.0, -0.44))));
        color *= 0.80 + sideLight * 0.26;
        color *= 0.58 + slope * 0.24;
        float valleyShade = smoothstep(0.08, 0.52, vElev);
        float shadowBand = smoothstep(0.22, 0.82, bl_fbm(vec2(vWorldPos.x * 0.006, vWorldPos.y * 0.013) + 12.0));
        color *= (0.64 + valleyShade * 0.30) * (0.86 + shadowBand * 0.14);
        color += albedo * vec3(1.0, 0.32, 0.07) * uFire * 0.42;
        color = mix(color, color * vec3(0.66, 0.70, 0.78), uDark * 0.34);

        float distanceToCamera = distance(vWorldPos, uCamPos);
        float haze = 1.0 - exp(-pow(distanceToCamera * uHazeDen, 1.45));
        color = mix(color, uHorizon, clamp(haze, 0.0, 0.46));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

const buildMountainCurtain = (width: number, baseHeight: number, peakHeight: number, seed: number) => {
  const noise = makeNoise2D(seed);
  const segments = 72;
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const x = (t - 0.5) * width;
    const ridge =
      baseHeight +
      peakHeight *
        (0.35 +
          0.65 *
            Math.max(
              0,
              noise.fbm(t * 3.1 + seed * 0.01, Math.sin(t * Math.PI * 2) + 3.5, 4) + 0.56,
            ));
    const heroPeak = Math.exp(-((t - 0.52) * (t - 0.52)) / 0.018) * peakHeight * 0.45;
    const tooth =
      (Math.sin(t * Math.PI * 18 + seed) * 0.5 + 0.5) *
      Math.max(0, noise.fbm(t * 9.0 + seed, 5.1, 3)) *
      peakHeight *
      0.28;
    const blade =
      Math.pow(Math.max(0, Math.sin(t * Math.PI * 31 + seed * 0.1)), 4) *
      peakHeight *
      0.16;
    const top = ridge + heroPeak + tooth + blade;
    vertices.push(x, 0, 0, x, top, 0);
  }

  for (let index = 0; index < segments; index += 1) {
    const base = index * 2;
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

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
      peakMin: 170,
      peakMax: 520,
      seed: 21,
      ridgeFrequency: 2.4,
      hero: true,
    }),
    createTerrainMaterial(shared, 1.12, 0.9),
  );
  const mid = new THREE.Mesh(
    buildRidgeRing({
      rInner: 820,
      rOuter: 1220,
      peakMin: 54,
      peakMax: 210,
      seed: 53,
      ridgeFrequency: 3.1,
      hero: false,
    }),
    createTerrainMaterial(shared, 0.86, 1),
  );
  far.name = "Far HashLake ridge";
  mid.name = "Mid HashLake ridge";
  far.frustumCulled = false;
  mid.frustumCulled = false;
  const curtainBackMaterial = new THREE.MeshBasicMaterial({
    color: 0x30484f,
    transparent: true,
    opacity: 0.30,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const curtainFrontMaterial = new THREE.MeshBasicMaterial({
    color: 0x102926,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const backCurtain = new THREE.Mesh(
    buildMountainCurtain(1900, 58, 158, 181),
    curtainBackMaterial,
  );
  backCurtain.name = "Far painterly mountain silhouette";
  backCurtain.position.set(0, 20, -1020);
  const frontCurtain = new THREE.Mesh(
    buildMountainCurtain(1700, 36, 96, 331),
    curtainFrontMaterial,
  );
  frontCurtain.name = "Near painterly mountain silhouette";
  frontCurtain.position.set(0, 8, -760);
  group.add(backCurtain, far, frontCurtain, mid);
  let scenicBackdropActive = false;

  const vertexCount =
    far.geometry.attributes.position.count +
    mid.geometry.attributes.position.count +
    backCurtain.geometry.attributes.position.count +
    frontCurtain.geometry.attributes.position.count;

  return {
    group,
    update: (weather, camera) => {
      far.visible = !scenicBackdropActive;
      mid.visible = !scenicBackdropActive;
      backCurtain.visible = !scenicBackdropActive;
      frontCurtain.visible = !scenicBackdropActive;
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
      curtainBackMaterial.color.setHex(weather.dials.skyDark > 0.35 ? 0x26383c : 0x30484f);
      curtainBackMaterial.opacity = 0.15 + weather.dials.fog * 0.08 + weather.dials.skyDark * 0.04;
      curtainFrontMaterial.color.setHex(weather.dials.skyDark > 0.38 ? 0x203135 : 0x102926);
      curtainFrontMaterial.opacity = 0.44 + weather.dials.skyDark * 0.08;
    },
    getStats: () => ({
      mountainVertices: scenicBackdropActive ? 0 : vertexCount,
      reflectionEnabled: false,
      postEnabled: true,
    }),
    setScenicBackdropActive: (active) => {
      scenicBackdropActive = active;
    },
  };
};
