import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { getWeatherPalette } from "./artDirection";
import {
  LAKE_MAP,
  ZONE_TRUTH,
  getExpandedOutline,
  isMainlandForestZone,
  isMainlandShoreZone,
  isReedWetlandZone,
  type LakePoint,
} from "./lakeMap";
import { makeRng } from "./scenicUtils";

export type TreeAlphaAssetKey = "tallPine" | "shortPine" | "layeredConifer";
export type TreeAlphaAssetLoadState = "fallback" | "loading" | "loaded" | "error";
export type TreeAlphaAssetStatuses = Record<TreeAlphaAssetKey, TreeAlphaAssetLoadState>;

type ForestStats = {
  treeInstances: number;
  treeAlphaInstances: number;
  treeAlphaAssets: TreeAlphaAssetStatuses;
  reedInstances: number;
  rockInstances: number;
  silhouetteInstances: number;
  forestBandInstances: number;
  forestBandMethod: string;
};

export type ForestSystem = {
  group: THREE.Group;
  update: (elapsed: number, weather: WeatherSnapshot) => void;
  getStats: () => ForestStats;
  setQualityPreset: (preset: ForestQualityPreset) => void;
  setScenicTreelineActive: (active: boolean) => void;
};

type ForestQualityPreset = "Performance" | "Balanced" | "Scenic";

const outlinePosition = (index: number, offset: number, jitter: number) => {
  const outline = getExpandedOutline(offset);
  const base = outline[index % outline.length];
  const previous = outline[(index - 1 + outline.length) % outline.length];
  const next = outline[(index + 1) % outline.length];
  const tangent = Math.atan2(next.z - previous.z, next.x - previous.x);
  return {
    x: base.x + Math.cos(tangent + Math.PI / 2) * jitter,
    z: base.z + Math.sin(tangent + Math.PI / 2) * jitter,
    tangent,
  };
};

const getSafeOutlinePoint = (
  rng: () => number,
  index: number,
  minClearance: number,
  maxClearance: number,
  jitter: number,
  predicate: (point: LakePoint) => boolean,
) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const offset = minClearance + Math.pow(rng(), 0.72) * (maxClearance - minClearance);
    const candidate = outlinePosition(index * 7 + attempt * 11 + Math.floor(rng() * 19), offset, (rng() - 0.5) * jitter);
    const point = { x: candidate.x, z: candidate.z };
    if (predicate(point)) {
      return candidate;
    }
  }

  return null;
};

const installWindShader = (
  material: THREE.MeshStandardMaterial,
  uniforms: { time: { value: number }; wind: { value: number } },
) => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.time;
    shader.uniforms.uWind = uniforms.wind;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform float uWind;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          vec3 instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float phase = instancePos.x * 0.083 + instancePos.z * 0.117;
          float height = clamp(position.y / 10.0, 0.0, 1.0);
          float sway = height * height * height * uWind;
          float gust = sin(uTime * 1.7 + phase) + 0.5 * sin(uTime * 3.9 + phase * 1.7);
          transformed.x += gust * sway * 0.55;
          transformed.z += cos(uTime * 1.3 + phase * 0.8) * sway * 0.34;
        }`,
      );
  };
};

export const createForestSystem = (): ForestSystem => {
  const group = new THREE.Group();
  group.name = "HashLake3-adapted forest and reeds";
  const rng = makeRng(4242);
  const windUniforms = {
    time: { value: 0 },
    wind: { value: 0.15 },
  };

  const treeCount = 200;
  const foliageGeometry = new THREE.ConeGeometry(2.8, 12, 9, 2);
  const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.34, 3.2, 7, 1);
  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: 0x1f4c31,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
  });
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x5b3824,
    roughness: 0.9,
  });
  installWindShader(foliageMaterial, windUniforms);

  const foliage = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, treeCount);
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeCount);
  foliage.name = "Wind-swayed conifers";
  trunks.name = "Conifer trunks";
  foliage.castShadow = false;
  trunks.castShadow = false;
  foliage.frustumCulled = false;
  trunks.frustumCulled = false;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();

  let validTreeCount = 0;
  for (let index = 0; index < treeCount; index += 1) {
    const shore = getSafeOutlinePoint(
      rng,
      index,
      ZONE_TRUTH.forestTreeMinShoreClearance,
      ZONE_TRUTH.forestTreeMaxShoreClearance,
      42,
      (point) => isMainlandForestZone(point),
    );
    if (!shore) {
      continue;
    }
    const size = 0.72 + rng() * 1.55;
    position.set(shore.x, 5.4 + rng() * 2.6, shore.z);
    quaternion.setFromAxisAngle(up, rng() * Math.PI * 2);
    scale.set(size * (0.84 + rng() * 0.28), size, size * (0.84 + rng() * 0.28));
    matrix.compose(position, quaternion, scale);
    foliage.setMatrixAt(validTreeCount, matrix);
    position.y = 1.36;
    scale.set(size * 0.8, size, size * 0.8);
    matrix.compose(position, quaternion, scale);
    trunks.setMatrixAt(validTreeCount, matrix);
    foliage.setColorAt(
      validTreeCount,
      color.setHSL(0.34 + (rng() - 0.5) * 0.08, 0.24 + rng() * 0.22, 0.18 + rng() * 0.08),
    );
    validTreeCount += 1;
  }
  foliage.count = validTreeCount;
  trunks.count = validTreeCount;
  foliage.instanceMatrix.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;
  if (foliage.instanceColor) {
    foliage.instanceColor.needsUpdate = true;
  }
  group.add(foliage, trunks);

  const reedCount = 100;
  const reedGeometry = new THREE.CylinderGeometry(0.08, 0.16, 4.8, 5, 1);
  const reedMaterial = new THREE.MeshStandardMaterial({
    color: 0x95aa55,
    roughness: 0.88,
  });
  installWindShader(reedMaterial, windUniforms);
  const reeds = new THREE.InstancedMesh(reedGeometry, reedMaterial, reedCount);
  reeds.name = "Shoreline reeds";
  reeds.frustumCulled = false;
  const reedBase = LAKE_MAP.destinations.find((destination) => destination.key === "reeds")?.center ?? {
    x: -492,
    z: 204,
  };
  let validReedCount = 0;
  for (let index = 0; index < reedCount; index += 1) {
    let reedPoint: LakePoint | null = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng()) * 92;
      const candidate = {
        x: reedBase.x + Math.cos(angle) * radius,
        z: reedBase.z + Math.sin(angle) * radius * 0.55,
      };
      if (isReedWetlandZone(candidate)) {
        reedPoint = candidate;
        break;
      }
    }
    if (!reedPoint) {
      continue;
    }
    position.set(reedPoint.x, 2.2, reedPoint.z);
    quaternion.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.18, rng() * Math.PI * 2, (rng() - 0.5) * 0.18));
    const reedScale = 0.62 + rng() * 0.82;
    scale.set(reedScale, reedScale, reedScale);
    matrix.compose(position, quaternion, scale);
    reeds.setMatrixAt(validReedCount, matrix);
    validReedCount += 1;
  }
  reeds.count = validReedCount;
  reeds.instanceMatrix.needsUpdate = true;
  group.add(reeds);

  const rockCount = 56;
  const rockGeometry = new THREE.DodecahedronGeometry(1, 1);
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x64675f,
    vertexColors: true,
    roughness: 0.95,
  });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);
  rocks.name = "Shoreline boulders";
  rocks.frustumCulled = false;
  let validRockCount = 0;
  for (let index = 0; index < rockCount; index += 1) {
    const shore = getSafeOutlinePoint(
      rng,
      index + 3,
      ZONE_TRUTH.rockMinShoreClearance,
      ZONE_TRUTH.rockMaxShoreClearance,
      16,
      (point) => isMainlandShoreZone(point),
    );
    if (!shore) {
      continue;
    }
    const rockScale = 1.2 + rng() * 4.1;
    position.set(shore.x, 0.8 + rng() * 0.55, shore.z);
    quaternion.setFromEuler(new THREE.Euler(rng() * 0.6, rng() * Math.PI * 2, rng() * 0.6));
    scale.set(rockScale, rockScale * (0.45 + rng() * 0.36), rockScale * (0.8 + rng() * 0.5));
    matrix.compose(position, quaternion, scale);
    rocks.setMatrixAt(validRockCount, matrix);
    rocks.setColorAt(validRockCount, color.setHSL(0.10 + rng() * 0.06, 0.05, 0.28 + rng() * 0.14));
    validRockCount += 1;
  }
  rocks.count = validRockCount;
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) {
    rocks.instanceColor.needsUpdate = true;
  }
  group.add(rocks);

  let activePreset: ForestQualityPreset = "Balanced";
  let scenicTreelineActive = false;
  const treeAlphaStatuses: TreeAlphaAssetStatuses = {
    tallPine: "fallback",
    shortPine: "fallback",
    layeredConifer: "fallback",
  };

  const silhouetteCount = 190;
  const silhouetteGeometry = new THREE.ConeGeometry(3.6, 18, 6, 1);
  const silhouetteMaterial = new THREE.MeshBasicMaterial({
    color: 0x05110f,
    depthWrite: true,
  });
  const silhouettes = new THREE.InstancedMesh(
    silhouetteGeometry,
    silhouetteMaterial,
    silhouetteCount,
  );
  silhouettes.name = "Far shore forest silhouette band";
  silhouettes.frustumCulled = false;
  let validSilhouetteCount = 0;
  for (let index = 0; index < silhouetteCount; index += 1) {
    const shore = getSafeOutlinePoint(
      rng,
      index + 100,
      ZONE_TRUTH.farForestMinShoreClearance,
      ZONE_TRUTH.farForestMaxShoreClearance,
      30,
      (point) =>
        isMainlandForestZone(
          point,
          ZONE_TRUTH.farForestMinShoreClearance,
          ZONE_TRUTH.farForestMaxShoreClearance,
        ),
    );
    if (!shore) {
      continue;
    }
    const height = 0.62 + rng() * 1.55;
    position.set(shore.x, 7.8 * height, shore.z);
    quaternion.setFromAxisAngle(up, rng() * Math.PI * 2);
    scale.set(0.75 + rng() * 0.9, height, 0.72 + rng() * 0.5);
    matrix.compose(position, quaternion, scale);
    silhouettes.setMatrixAt(validSilhouetteCount, matrix);
    validSilhouetteCount += 1;
  }
  silhouettes.count = validSilhouetteCount;
  silhouettes.instanceMatrix.needsUpdate = true;
  group.add(silhouettes);

  const scenicSilhouetteCount = 90;
  const scenicSilhouettes = new THREE.InstancedMesh(
    silhouetteGeometry,
    silhouetteMaterial,
    scenicSilhouetteCount,
  );
  scenicSilhouettes.name = "Scenic far forest massing band";
  scenicSilhouettes.frustumCulled = false;
  scenicSilhouettes.visible = false;
  let validScenicSilhouetteCount = 0;
  for (let index = 0; index < scenicSilhouetteCount; index += 1) {
    const shore = getSafeOutlinePoint(
      rng,
      index + 400,
      ZONE_TRUTH.farForestMinShoreClearance + 34,
      ZONE_TRUTH.farForestMaxShoreClearance,
      38,
      (point) =>
        isMainlandForestZone(
          point,
          ZONE_TRUTH.farForestMinShoreClearance + 24,
          ZONE_TRUTH.farForestMaxShoreClearance,
        ),
    );
    if (!shore) {
      continue;
    }
    const height = 0.58 + rng() * 1.28;
    position.set(shore.x, 7.3 * height, shore.z);
    quaternion.setFromAxisAngle(up, rng() * Math.PI * 2);
    scale.set(0.65 + rng() * 0.8, height, 0.58 + rng() * 0.44);
    matrix.compose(position, quaternion, scale);
    scenicSilhouettes.setMatrixAt(validScenicSilhouetteCount, matrix);
    validScenicSilhouetteCount += 1;
  }
  scenicSilhouettes.count = validScenicSilhouetteCount;
  scenicSilhouettes.instanceMatrix.needsUpdate = true;
  group.add(scenicSilhouettes);

  return {
    group,
    update: (elapsed, weather) => {
      const palette = getWeatherPalette(weather.stormIndex);
      const useProceduralFarTrees = !scenicTreelineActive;
      silhouettes.visible = useProceduralFarTrees;
      scenicSilhouettes.visible = useProceduralFarTrees && activePreset === "Scenic";
      windUniforms.time.value = elapsed;
      windUniforms.wind.value = 0.15 + weather.dials.wind * 1.35;
      foliageMaterial.color.setHex(palette.shorelineGrass);
      foliageMaterial.color.multiplyScalar(Math.max(0.18, 1 - weather.dials.skyDark * 0.48));
      reedMaterial.color.setHex(weather.dials.skyDark > 0.55 ? 0x59613d : 0xa4b85f);
      rockMaterial.color.setHex(palette.rock);
      silhouetteMaterial.color.setHex(weather.dials.skyDark > 0.48 ? 0x010607 : 0x05110f);
    },
    getStats: () => ({
      treeInstances:
        validTreeCount +
        (silhouettes.visible ? validSilhouetteCount : 0) +
        (scenicSilhouettes.visible ? validScenicSilhouetteCount : 0),
      treeAlphaInstances: 0,
      treeAlphaAssets: { ...treeAlphaStatuses },
      reedInstances: validReedCount,
      rockInstances: validRockCount,
      silhouetteInstances:
        (silhouettes.visible ? validSilhouetteCount : 0) +
        (scenicSilhouettes.visible ? validScenicSilhouetteCount : 0),
      forestBandInstances:
        (silhouettes.visible ? validSilhouetteCount : 0) +
        (scenicSilhouettes.visible ? validScenicSilhouetteCount : 0),
      forestBandMethod: scenicTreelineActive
        ? "scenic treeline disabled for zone law"
        : scenicSilhouettes.visible
          ? "zone-validated instanced x2"
          : "zone-validated instanced",
    }),
    setQualityPreset: (preset) => {
      activePreset = preset;
      scenicSilhouettes.visible = !scenicTreelineActive && preset === "Scenic";
    },
    setScenicTreelineActive: (active) => {
      scenicTreelineActive = active;
      silhouettes.visible = !active;
      scenicSilhouettes.visible = !active && activePreset === "Scenic";
    },
  };
};
