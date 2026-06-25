import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { getWeatherPalette } from "./artDirection";
import {
  LAKE_MAP,
  ZONE_TRUTH,
  distanceToShore,
  getExpandedOutline,
  getDistance,
  isMainlandForestZone,
  isMainlandShoreZone,
  isReedWetlandZone,
  type LakePoint,
} from "./lakeMap";
import { makeRng } from "./scenicUtils";

export type TreeAlphaAssetKey = "tallPine" | "shortPine" | "layeredConifer";
export type TreeAlphaAssetLoadState = "fallback" | "loading" | "loaded" | "error";
export type TreeAlphaAssetStatuses = Record<TreeAlphaAssetKey, TreeAlphaAssetLoadState>;

export type NativeTreeTypeKey =
  | "tallNarrowPine"
  | "shortPine"
  | "mediumConifer"
  | "layeredConifer"
  | "broadEvergreenCluster"
  | "distantSilhouetteTree"
  | "youngPine";

export type NativeTreeTypeCounts = Record<NativeTreeTypeKey, number>;

type ForestStats = {
  treeInstances: number;
  nativeTreeInstances: number;
  instancedTreeInstances: number;
  individualTreeInstances: number;
  treeTypeCounts: NativeTreeTypeCounts;
  rejectedTreeCandidates: number;
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
type PlacementBand = "near" | "mid" | "far" | "cove" | "dock";

type TreeInstance = {
  point: LakePoint;
  groundY: number;
  yaw: number;
  heightScale: number;
  widthScale: number;
  color: THREE.Color;
  band: PlacementBand;
};

type TreeBuildResult = {
  key: NativeTreeTypeKey;
  meshes: THREE.InstancedMesh[];
  baseCount: number;
};

const TREE_TYPE_KEYS: NativeTreeTypeKey[] = [
  "tallNarrowPine",
  "shortPine",
  "mediumConifer",
  "layeredConifer",
  "broadEvergreenCluster",
  "distantSilhouetteTree",
  "youngPine",
];

const emptyTypeCounts = (): NativeTreeTypeCounts => ({
  tallNarrowPine: 0,
  shortPine: 0,
  mediumConifer: 0,
  layeredConifer: 0,
  broadEvergreenCluster: 0,
  distantSilhouetteTree: 0,
  youngPine: 0,
});

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
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const offset = minClearance + Math.pow(rng(), 0.76) * (maxClearance - minClearance);
    const candidate = outlinePosition(index * 7 + attempt * 11 + Math.floor(rng() * 19), offset, (rng() - 0.5) * jitter);
    const point = { x: candidate.x, z: candidate.z };
    if (predicate(point)) {
      return candidate;
    }
  }

  return null;
};

const pointInRotatedEllipse = (
  point: LakePoint,
  center: LakePoint,
  radiusX: number,
  radiusZ: number,
  rotation: number,
) => {
  const dx = point.x - center.x;
  const dz = point.z - center.z;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const x = dx * cos - dz * sin;
  const z = dx * sin + dz * cos;
  return (x * x) / (radiusX * radiusX) + (z * z) / (radiusZ * radiusZ) <= 1;
};

const isInMainlandBeachPocket = (point: LakePoint, padding = 24) =>
  pointInRotatedEllipse(
    point,
    ZONE_TRUTH.mainlandBeach.center,
    ZONE_TRUTH.mainlandBeach.radiusX + padding,
    ZONE_TRUTH.mainlandBeach.radiusZ + padding * 0.72,
    ZONE_TRUTH.mainlandBeach.rotation,
  );

const isNearDestination = (point: LakePoint, key: "dock" | "cove", radius: number) => {
  const center = LAKE_MAP.destinations.find((destination) => destination.key === key)?.center;
  return center ? getDistance(point, center) < radius : false;
};

const groundHeightAt = (point: LakePoint) => {
  const clearance = Math.max(0, -distanceToShore(point));
  if (clearance < 42) {
    return THREE.MathUtils.lerp(0.72, 1.02, THREE.MathUtils.clamp((clearance - 14) / 28, 0, 1));
  }
  if (clearance < ZONE_TRUTH.shorelineGrassOuter) {
    return THREE.MathUtils.lerp(1.02, 1.16, (clearance - 42) / (ZONE_TRUTH.shorelineGrassOuter - 42));
  }
  if (clearance < ZONE_TRUTH.raisedBankOuter) {
    return THREE.MathUtils.lerp(1.16, 1.28, (clearance - ZONE_TRUTH.shorelineGrassOuter) / (ZONE_TRUTH.raisedBankOuter - ZONE_TRUTH.shorelineGrassOuter));
  }
  if (clearance < 214) {
    return THREE.MathUtils.lerp(1.28, 1.40, (clearance - ZONE_TRUTH.forestShelfInner) / (214 - ZONE_TRUTH.forestShelfInner));
  }
  if (clearance < ZONE_TRUTH.forestShelfOuter) {
    return THREE.MathUtils.lerp(1.40, 1.48, (clearance - 214) / (ZONE_TRUTH.forestShelfOuter - 214));
  }
  return 1.5;
};

const getBandRange = (band: PlacementBand) => {
  if (band === "near") {
    return { min: 44, max: 108, jitter: 30 };
  }
  if (band === "mid") {
    return { min: 92, max: 226, jitter: 54 };
  }
  if (band === "far") {
    return { min: 174, max: ZONE_TRUTH.farForestMaxShoreClearance, jitter: 78 };
  }
  if (band === "cove") {
    return { min: 86, max: 230, jitter: 48 };
  }
  return { min: 58, max: 150, jitter: 34 };
};

const getTreeSafePredicate = (band: PlacementBand) => {
  const range = getBandRange(band);
  return (point: LakePoint) =>
    isMainlandForestZone(point, range.min, range.max) &&
    !isInMainlandBeachPocket(point) &&
    !isNearDestination(point, "dock", band === "dock" ? 42 : 76) &&
    !isNearDestination(point, "cove", band === "cove" ? 50 : 82);
};

const sampleClusterPoint = (
  rng: () => number,
  center: LakePoint,
  radiusX: number,
  radiusZ: number,
  predicate: (point: LakePoint) => boolean,
) => {
  for (let attempt = 0; attempt < 52; attempt += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng());
    const point = {
      x: center.x + Math.cos(angle) * radiusX * radius,
      z: center.z + Math.sin(angle) * radiusZ * radius,
    };
    if (predicate(point)) {
      return point;
    }
  }

  return null;
};

const sampleTreeInstance = (
  rng: () => number,
  index: number,
  band: PlacementBand,
  baseHue: number,
  baseLightness: number,
) => {
  const range = getBandRange(band);
  const predicate = getTreeSafePredicate(band);
  const coveCenter = LAKE_MAP.destinations.find((destination) => destination.key === "cove")?.center ?? { x: 650, z: -122 };
  const dockCenter = LAKE_MAP.destinations.find((destination) => destination.key === "dock")?.center ?? { x: -620, z: 116 };
  const clustered =
    band === "cove"
      ? sampleClusterPoint(rng, { x: coveCenter.x - 48, z: coveCenter.z - 18 }, 150, 86, predicate)
      : band === "dock"
        ? sampleClusterPoint(rng, { x: dockCenter.x - 64, z: dockCenter.z + 68 }, 120, 70, predicate)
        : null;
  const shore = clustered
    ? { ...clustered, tangent: rng() * Math.PI * 2 }
    : getSafeOutlinePoint(rng, index, range.min, range.max, range.jitter, predicate);

  if (!shore) {
    return null;
  }

  const point = { x: shore.x, z: shore.z };
  const inland = THREE.MathUtils.clamp((-distanceToShore(point) - 38) / 300, 0, 1);
  const lightness = baseLightness - inland * 0.045 + (rng() - 0.5) * 0.035;
  return {
    point,
    groundY: groundHeightAt(point),
    yaw: rng() * Math.PI * 2,
    heightScale: 0.82 + rng() * 0.42 + inland * 0.28,
    widthScale: 0.78 + rng() * 0.42,
    color: new THREE.Color().setHSL(baseHue + (rng() - 0.5) * 0.034, 0.24 + rng() * 0.16, lightness),
    band,
  } satisfies TreeInstance;
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
          float height = clamp(position.y / 18.0, 0.0, 1.0);
          float sway = height * height * height * uWind;
          float gust = sin(uTime * 1.7 + phase) + 0.5 * sin(uTime * 3.9 + phase * 1.7);
          transformed.x += gust * sway * 0.55;
          transformed.z += cos(uTime * 1.3 + phase * 0.8) * sway * 0.34;
        }`,
      );
  };
};

const makeFoliageMaterial = (
  color: number,
  windUniforms: { time: { value: number }; wind: { value: number } },
  basic = false,
) => {
  if (basic) {
    return new THREE.MeshBasicMaterial({
      color,
      vertexColors: true,
      depthWrite: true,
    });
  }

  const material = new THREE.MeshStandardMaterial({
    color,
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  });
  installWindShader(material, windUniforms);
  return material;
};

const makeInstancedMesh = (
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  name: string,
) => {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
};

export const createForestSystem = (): ForestSystem => {
  const group = new THREE.Group();
  group.name = "Native zone-validated forest system";
  const rng = makeRng(4242);
  const windUniforms = {
    time: { value: 0 },
    wind: { value: 0.15 },
  };
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  let rejectedTreeCandidates = 0;

  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x4c3020,
    roughness: 0.92,
  });
  const foliageMaterial = makeFoliageMaterial(0x183927, windUniforms) as THREE.MeshStandardMaterial;
  const darkFoliageMaterial = makeFoliageMaterial(0x0d261b, windUniforms) as THREE.MeshStandardMaterial;
  const clusterMaterial = makeFoliageMaterial(0x0b251a, windUniforms) as THREE.MeshStandardMaterial;
  const silhouetteMaterial = makeFoliageMaterial(0x04100d, windUniforms, true) as THREE.MeshBasicMaterial;

  const tallCanopy = new THREE.ConeGeometry(2.2, 18, 8, 2);
  const shortCanopy = new THREE.ConeGeometry(2.9, 10.5, 8, 2);
  const mediumCanopy = new THREE.ConeGeometry(3.2, 14, 9, 2);
  const youngCanopy = new THREE.ConeGeometry(1.35, 5.8, 7, 1);
  const broadCanopy = new THREE.DodecahedronGeometry(3.2, 1);
  const silhouetteCanopy = new THREE.ConeGeometry(3.6, 18, 6, 1);
  const layerLow = new THREE.ConeGeometry(3.7, 7.5, 8, 1);
  const layerMid = new THREE.ConeGeometry(2.8, 6.8, 8, 1);
  const layerTop = new THREE.ConeGeometry(1.9, 6.2, 8, 1);
  const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.32, 1, 7, 1);

  const treeBuilds: TreeBuildResult[] = [];

  const fillTrunk = (mesh: THREE.InstancedMesh, instance: TreeInstance, index: number, height: number, width: number) => {
    position.set(instance.point.x, instance.groundY + height * 0.5, instance.point.z);
    quaternion.setFromAxisAngle(up, instance.yaw);
    scale.set(width, height, width);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  };

  const fillCone = (
    mesh: THREE.InstancedMesh,
    instance: TreeInstance,
    index: number,
    y: number,
    width: number,
    height: number,
    depthScale = 1,
  ) => {
    position.set(instance.point.x, instance.groundY + y, instance.point.z);
    quaternion.setFromAxisAngle(up, instance.yaw);
    scale.set(width, height, width * depthScale);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, instance.color);
  };

  const finalizeMesh = (mesh: THREE.InstancedMesh, count: number) => {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  };

  const makeInstances = (
    count: number,
    key: NativeTreeTypeKey,
    bands: PlacementBand[],
    baseHue: number,
    baseLightness: number,
  ) => {
    const instances: TreeInstance[] = [];
    for (let index = 0; index < count; index += 1) {
      const band = bands[index % bands.length];
      const instance = sampleTreeInstance(rng, index + key.length * 37, band, baseHue, baseLightness);
      if (!instance) {
        rejectedTreeCandidates += 1;
        continue;
      }
      instances.push(instance);
    }
    return instances;
  };

  const addSimpleTreeType = (
    key: NativeTreeTypeKey,
    count: number,
    bands: PlacementBand[],
    canopyGeometry: THREE.BufferGeometry,
    material: THREE.Material,
    trunkHeight: number,
    trunkWidth: number,
    canopyY: number,
    canopyWidth: number,
    canopyHeight: number,
    baseHue: number,
    baseLightness: number,
  ) => {
    const instances = makeInstances(count, key, bands, baseHue, baseLightness);
    const canopy = makeInstancedMesh(canopyGeometry, material, instances.length, `Native tree type - ${key} canopy`);
    const trunks = makeInstancedMesh(trunkGeometry, trunkMaterial, instances.length, `Native tree type - ${key} trunks`);
    instances.forEach((instance, index) => {
      const trunkScale = trunkHeight * instance.heightScale * (0.88 + rng() * 0.16);
      fillTrunk(trunks, instance, index, trunkScale, trunkWidth * instance.widthScale);
      fillCone(
        canopy,
        instance,
        index,
        canopyY * instance.heightScale,
        canopyWidth * instance.widthScale,
        canopyHeight * instance.heightScale,
        0.82 + rng() * 0.34,
      );
    });
    finalizeMesh(canopy, instances.length);
    finalizeMesh(trunks, instances.length);
    group.add(canopy, trunks);
    treeBuilds.push({ key, meshes: [canopy, trunks], baseCount: instances.length });
  };

  addSimpleTreeType("tallNarrowPine", 82, ["mid", "far", "cove"], tallCanopy, foliageMaterial, 5.2, 1.0, 13.1, 0.92, 1.02, 0.35, 0.17);
  addSimpleTreeType("shortPine", 54, ["near", "dock", "mid"], shortCanopy, foliageMaterial, 3.0, 0.86, 7.4, 0.94, 0.95, 0.34, 0.19);
  addSimpleTreeType("mediumConifer", 76, ["mid", "near", "far"], mediumCanopy, foliageMaterial, 4.0, 0.96, 10.0, 1.0, 1.0, 0.35, 0.18);
  addSimpleTreeType("youngPine", 48, ["near", "dock"], youngCanopy, foliageMaterial, 1.7, 0.58, 4.2, 0.84, 0.92, 0.34, 0.21);

  const layeredInstances = makeInstances(64, "layeredConifer", ["mid", "far", "cove"], 0.35, 0.165);
  const layeredTrunks = makeInstancedMesh(trunkGeometry, trunkMaterial, layeredInstances.length, "Native tree type - layeredConifer trunks");
  const layeredLow = makeInstancedMesh(layerLow, darkFoliageMaterial, layeredInstances.length, "Native tree type - layeredConifer low skirt");
  const layeredMid = makeInstancedMesh(layerMid, darkFoliageMaterial, layeredInstances.length, "Native tree type - layeredConifer middle skirt");
  const layeredTop = makeInstancedMesh(layerTop, darkFoliageMaterial, layeredInstances.length, "Native tree type - layeredConifer top");
  layeredInstances.forEach((instance, index) => {
    const trunkScale = 4.1 * instance.heightScale;
    fillTrunk(layeredTrunks, instance, index, trunkScale, 0.95 * instance.widthScale);
    fillCone(layeredLow, instance, index, 6.6 * instance.heightScale, 1.08 * instance.widthScale, 0.92 * instance.heightScale, 0.90);
    fillCone(layeredMid, instance, index, 9.7 * instance.heightScale, 1.0 * instance.widthScale, 0.94 * instance.heightScale, 0.88);
    fillCone(layeredTop, instance, index, 12.5 * instance.heightScale, 0.92 * instance.widthScale, 0.96 * instance.heightScale, 0.86);
  });
  [layeredTrunks, layeredLow, layeredMid, layeredTop].forEach((mesh) => finalizeMesh(mesh, layeredInstances.length));
  group.add(layeredTrunks, layeredLow, layeredMid, layeredTop);
  treeBuilds.push({
    key: "layeredConifer",
    meshes: [layeredTrunks, layeredLow, layeredMid, layeredTop],
    baseCount: layeredInstances.length,
  });

  const broadInstances = makeInstances(46, "broadEvergreenCluster", ["far", "mid", "cove"], 0.34, 0.145);
  const broad = makeInstancedMesh(broadCanopy, clusterMaterial, broadInstances.length, "Native tree type - broadEvergreenCluster crowns");
  const broadTrunks = makeInstancedMesh(trunkGeometry, trunkMaterial, broadInstances.length, "Native tree type - broadEvergreenCluster trunks");
  broadInstances.forEach((instance, index) => {
    const trunkScale = 3.2 * instance.heightScale;
    fillTrunk(broadTrunks, instance, index, trunkScale, 1.04 * instance.widthScale);
    position.set(instance.point.x, instance.groundY + 6.8 * instance.heightScale, instance.point.z);
    quaternion.setFromAxisAngle(up, instance.yaw);
    scale.set(1.25 * instance.widthScale, 1.35 * instance.heightScale, 0.92 * instance.widthScale);
    matrix.compose(position, quaternion, scale);
    broad.setMatrixAt(index, matrix);
    broad.setColorAt(index, instance.color);
  });
  finalizeMesh(broad, broadInstances.length);
  finalizeMesh(broadTrunks, broadInstances.length);
  group.add(broad, broadTrunks);
  treeBuilds.push({
    key: "broadEvergreenCluster",
    meshes: [broad, broadTrunks],
    baseCount: broadInstances.length,
  });

  const distantInstances = makeInstances(254, "distantSilhouetteTree", ["far", "far", "mid"], 0.36, 0.105);
  const distant = makeInstancedMesh(silhouetteCanopy, silhouetteMaterial, distantInstances.length, "Native tree type - distantSilhouetteTree band");
  distantInstances.forEach((instance, index) => {
    const height = 0.72 + rng() * 1.05 + (instance.band === "far" ? 0.25 : 0);
    position.set(instance.point.x, instance.groundY + 8.8 * height, instance.point.z);
    quaternion.setFromAxisAngle(up, instance.yaw);
    scale.set(0.70 + rng() * 0.95, height, 0.62 + rng() * 0.50);
    matrix.compose(position, quaternion, scale);
    distant.setMatrixAt(index, matrix);
    distant.setColorAt(index, color.setHSL(0.36 + (rng() - 0.5) * 0.03, 0.24, 0.055 + rng() * 0.035));
  });
  finalizeMesh(distant, distantInstances.length);
  group.add(distant);
  treeBuilds.push({
    key: "distantSilhouetteTree",
    meshes: [distant],
    baseCount: distantInstances.length,
  });

  const reedCount = 118;
  const reedGeometry = new THREE.CylinderGeometry(0.08, 0.16, 4.8, 5, 1);
  const reedMaterial = new THREE.MeshStandardMaterial({
    color: 0x95aa55,
    roughness: 0.88,
  });
  installWindShader(reedMaterial, windUniforms);
  const reeds = makeInstancedMesh(reedGeometry, reedMaterial, reedCount, "Zone-validated shoreline reeds");
  const reedBase = LAKE_MAP.destinations.find((destination) => destination.key === "reeds")?.center ?? {
    x: -492,
    z: 204,
  };
  let validReedCount = 0;
  for (let index = 0; index < reedCount; index += 1) {
    let reedPoint: LakePoint | null = null;
    for (let attempt = 0; attempt < 34; attempt += 1) {
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng()) * 96;
      const candidate = {
        x: reedBase.x + Math.cos(angle) * radius,
        z: reedBase.z + Math.sin(angle) * radius * 0.58,
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
    const reedScale = 0.62 + rng() * 0.86;
    scale.set(reedScale, reedScale, reedScale);
    matrix.compose(position, quaternion, scale);
    reeds.setMatrixAt(validReedCount, matrix);
    validReedCount += 1;
  }
  finalizeMesh(reeds, validReedCount);
  group.add(reeds);

  const rockCount = 66;
  const rockGeometry = new THREE.DodecahedronGeometry(1, 1);
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x64675f,
    vertexColors: true,
    roughness: 0.95,
  });
  const rocks = makeInstancedMesh(rockGeometry, rockMaterial, rockCount, "Zone-validated shoreline boulders");
  let validRockCount = 0;
  for (let index = 0; index < rockCount; index += 1) {
    const shore = getSafeOutlinePoint(
      rng,
      index + 3,
      ZONE_TRUTH.rockMinShoreClearance,
      ZONE_TRUTH.rockMaxShoreClearance,
      16,
      (point) => isMainlandShoreZone(point) && !isInMainlandBeachPocket(point, 18),
    );
    if (!shore) {
      continue;
    }
    const rockScale = 1.1 + rng() * 3.6;
    position.set(shore.x, groundHeightAt(shore) + 0.15 + rng() * 0.28, shore.z);
    quaternion.setFromEuler(new THREE.Euler(rng() * 0.6, rng() * Math.PI * 2, rng() * 0.6));
    scale.set(rockScale, rockScale * (0.42 + rng() * 0.36), rockScale * (0.76 + rng() * 0.52));
    matrix.compose(position, quaternion, scale);
    rocks.setMatrixAt(validRockCount, matrix);
    rocks.setColorAt(validRockCount, color.setHSL(0.10 + rng() * 0.06, 0.05, 0.28 + rng() * 0.14));
    validRockCount += 1;
  }
  finalizeMesh(rocks, validRockCount);
  group.add(rocks);

  let activePreset: ForestQualityPreset = "Balanced";
  let scenicTreelineActive = false;
  const treeAlphaStatuses: TreeAlphaAssetStatuses = {
    tallPine: "fallback",
    shortPine: "fallback",
    layeredConifer: "fallback",
  };

  const presetScale = (preset: ForestQualityPreset, key: NativeTreeTypeKey) => {
    if (preset === "Performance") {
      return key === "distantSilhouetteTree" ? 0.66 : 0.56;
    }
    if (preset === "Scenic") {
      return key === "distantSilhouetteTree" || key === "broadEvergreenCluster" ? 1 : 0.96;
    }
    return key === "distantSilhouetteTree" ? 0.88 : 0.86;
  };

  const applyPresetCounts = () => {
    treeBuilds.forEach((build) => {
      const nextCount = Math.max(0, Math.floor(build.baseCount * presetScale(activePreset, build.key)));
      build.meshes.forEach((mesh) => {
        mesh.count = scenicTreelineActive && build.key === "distantSilhouetteTree" ? 0 : nextCount;
      });
    });
  };

  applyPresetCounts();

  const getTypeCounts = () => {
    const counts = emptyTypeCounts();
    treeBuilds.forEach((build) => {
      counts[build.key] = build.meshes[0]?.count ?? 0;
    });
    return counts;
  };

  return {
    group,
    update: (elapsed, weather) => {
      const palette = getWeatherPalette(weather.stormIndex);
      windUniforms.time.value = elapsed;
      windUniforms.wind.value = 0.12 + weather.dials.wind * 1.18;
      const darken = Math.max(0.22, 1 - weather.dials.skyDark * 0.52);
      foliageMaterial.color.setHex(palette.shorelineGrass);
      foliageMaterial.color.multiplyScalar(darken * 0.72);
      darkFoliageMaterial.color.setHex(weather.dials.skyDark > 0.52 ? 0x06110d : 0x10281d);
      clusterMaterial.color.setHex(weather.dials.skyDark > 0.52 ? 0x030b08 : 0x0a2016);
      reedMaterial.color.setHex(weather.dials.skyDark > 0.55 ? 0x59613d : 0xa4b85f);
      rockMaterial.color.setHex(palette.rock);
      silhouetteMaterial.color.setHex(weather.dials.skyDark > 0.48 ? 0x010607 : 0x03100d);
    },
    getStats: () => {
      const treeTypeCounts = getTypeCounts();
      const silhouetteInstances = treeTypeCounts.distantSilhouetteTree;
      const nativeTreeInstances = TREE_TYPE_KEYS.reduce((total, key) => total + treeTypeCounts[key], 0);
      return {
        treeInstances: nativeTreeInstances,
        nativeTreeInstances,
        instancedTreeInstances: nativeTreeInstances,
        individualTreeInstances: 0,
        treeTypeCounts,
        rejectedTreeCandidates,
        treeAlphaInstances: 0,
        treeAlphaAssets: { ...treeAlphaStatuses },
        reedInstances: validReedCount,
        rockInstances: validRockCount,
        silhouetteInstances,
        forestBandInstances: silhouetteInstances,
        forestBandMethod: scenicTreelineActive
          ? "native far band hidden by scenic asset"
          : `native instanced, ${TREE_TYPE_KEYS.length} tree types`,
      };
    },
    setQualityPreset: (preset) => {
      activePreset = preset;
      applyPresetCounts();
    },
    setScenicTreelineActive: (active) => {
      scenicTreelineActive = active;
      applyPresetCounts();
    },
  };
};
