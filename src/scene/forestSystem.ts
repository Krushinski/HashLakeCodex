import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { getWeatherPalette } from "./artDirection";
import {
  createProceduralRoughnessTexture,
  createProceduralTexture,
} from "./proceduralMaterials";
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
import { getGroundHeightAtPoint, RIBBON_CAKE_OUTER_OFFSET } from "./zoneBands";
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
  | "canopyMound"
  | "backgroundCanopyMass"
  | "wideDarkConiferCluster"
  | "irregularCanopyMound"
  | "understoryShrubMass"
  | "brokenSilhouettePine"
  | "forestWallCanopy"
  | "fullSpruceCluster"
  | "distantSilhouetteTree"
  | "youngPine"
  | "shorelineSignatureSpruce"
  | "foothillClimberSpruce";

export type NativeTreeTypeCounts = Record<NativeTreeTypeKey, number>;

type ForestStats = {
  treeInstances: number;
  nativeTreeInstances: number;
  instancedTreeInstances: number;
  individualTreeInstances: number;
  treeTypeCounts: NativeTreeTypeCounts;
  treePlacementValidCandidates: number;
  rejectedTreeCandidates: number;
  ungroundedTreeInstances: number;
  mountainOverlappedTreeInstances: number;
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
type PlacementBand = "near" | "mid" | "far" | "alpineBase" | "cove" | "dock";

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
  "canopyMound",
  "backgroundCanopyMass",
  "wideDarkConiferCluster",
  "irregularCanopyMound",
  "understoryShrubMass",
  "brokenSilhouettePine",
  "forestWallCanopy",
  "fullSpruceCluster",
  "distantSilhouetteTree",
  "youngPine",
  "shorelineSignatureSpruce",
  "foothillClimberSpruce",
];

const emptyTypeCounts = (): NativeTreeTypeCounts => ({
  tallNarrowPine: 0,
  shortPine: 0,
  mediumConifer: 0,
  layeredConifer: 0,
  broadEvergreenCluster: 0,
  canopyMound: 0,
  backgroundCanopyMass: 0,
  wideDarkConiferCluster: 0,
  irregularCanopyMound: 0,
  understoryShrubMass: 0,
  brokenSilhouettePine: 0,
  forestWallCanopy: 0,
  fullSpruceCluster: 0,
  distantSilhouetteTree: 0,
  youngPine: 0,
  shorelineSignatureSpruce: 0,
  foothillClimberSpruce: 0,
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
  return getGroundHeightAtPoint(point);
};

const getTreeGroundHeightAt = (point: LakePoint, band: PlacementBand) => {
  const base = groundHeightAt(point);
  if (band !== "alpineBase") {
    return base;
  }

  const shoreClearance = Math.max(0, -distanceToShore(point));
  const alpineAmount = THREE.MathUtils.smoothstep(
    shoreClearance,
    ZONE_TRUTH.farForestMaxShoreClearance + 8,
    ZONE_TRUTH.farForestMaxShoreClearance + 330,
  );
  const northLift = THREE.MathUtils.clamp((-point.z - 80) / 680, 0, 1);
  const sideLift = THREE.MathUtils.clamp((Math.abs(point.x) - 450) / 400, 0, 1) * 0.44;
  const wave = Math.sin(point.x * 0.012 + point.z * 0.007) * 0.55;
  return base + alpineAmount * (2.4 + northLift * 5.1 + sideLift * 2.6 + wave);
};

const getBandRange = (band: PlacementBand) => {
  if (band === "near") {
    return { min: 38, max: 152, jitter: 58 };
  }
  if (band === "mid") {
    return { min: 78, max: 316, jitter: 118 };
  }
  if (band === "far") {
    return { min: 148, max: ZONE_TRUTH.farForestMaxShoreClearance + 156, jitter: 232 };
  }
  if (band === "alpineBase") {
    return {
      min: ZONE_TRUTH.farForestMaxShoreClearance + 10,
      max: RIBBON_CAKE_OUTER_OFFSET + 350,
      jitter: 218,
    };
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
  const nearShore = 1 - THREE.MathUtils.clamp((-distanceToShore(point) - 38) / 130, 0, 1);
  const shoreClearance = Math.max(0, -distanceToShore(point));
  const mountainBlend = band === "alpineBase" ? THREE.MathUtils.clamp((shoreClearance - 300) / 440, 0, 1) : 0;
  const lightness =
    baseLightness -
    inland * 0.052 -
    mountainBlend * 0.018 +
    nearShore * 0.060 +
    (rng() - 0.5) * 0.064;
  return {
    point,
    groundY: getTreeGroundHeightAt(point, band),
    yaw: rng() * Math.PI * 2,
    heightScale: 0.82 + rng() * 0.76 + inland * 0.60 + nearShore * 0.18 + mountainBlend * 0.22,
    widthScale: 0.70 + rng() * 0.76 + inland * 0.30 + mountainBlend * 0.10,
    color: new THREE.Color().setHSL(baseHue + (rng() - 0.5) * 0.078, 0.30 + rng() * 0.30, lightness),
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
    map: createProceduralTexture({
      kind: "grass",
      seed: color & 0xfff,
      size: 96,
      base: 0x6f9658,
      accent: 0xc4d68a,
      dark: 0x274d30,
    }),
    roughnessMap: createProceduralRoughnessTexture("grass", (color & 0xfff) + 13, 96),
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    emissive: 0x071108,
    emissiveIntensity: 0.018,
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
  let treePlacementValidCandidates = 0;
  let ungroundedTreeInstances = 0;
  let mountainOverlappedTreeInstances = 0;

  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x4c3020,
    map: createProceduralTexture({
      kind: "wood",
      seed: 622,
      size: 96,
      base: 0x5c3822,
      accent: 0x8b5c36,
      dark: 0x2e190d,
    }),
    roughnessMap: createProceduralRoughnessTexture("wood", 629, 96),
    roughness: 0.92,
  });
  const foliageMaterial = makeFoliageMaterial(0x4f8a45, windUniforms) as THREE.MeshStandardMaterial;
  const darkFoliageMaterial = makeFoliageMaterial(0x3f7440, windUniforms) as THREE.MeshStandardMaterial;
  const clusterMaterial = makeFoliageMaterial(0x376f3d, windUniforms) as THREE.MeshStandardMaterial;
  const silhouetteMaterial = makeFoliageMaterial(0x264c2f, windUniforms) as THREE.MeshStandardMaterial;

  const tallCanopy = new THREE.ConeGeometry(2.55, 18.0, 9, 2);
  const shortCanopy = new THREE.ConeGeometry(2.9, 10.5, 8, 2);
  const mediumCanopy = new THREE.ConeGeometry(3.45, 15.6, 9, 2);
  const youngCanopy = new THREE.ConeGeometry(1.35, 5.8, 7, 1);
  const broadCanopy = new THREE.DodecahedronGeometry(3.75, 1);
  const canopyMoundGeometry = new THREE.DodecahedronGeometry(4.4, 1);
  const backgroundCanopyGeometry = new THREE.DodecahedronGeometry(5.8, 1);
  const wideDarkConiferGeometry = new THREE.DodecahedronGeometry(5.2, 1);
  const irregularCanopyGeometry = new THREE.IcosahedronGeometry(4.8, 1);
  const understoryGeometry = new THREE.DodecahedronGeometry(2.2, 1);
  const brokenSilhouetteGeometry = new THREE.ConeGeometry(3.3, 18.8, 6, 1);
  const forestWallGeometry = new THREE.DodecahedronGeometry(8.4, 1);
  const fullSpruceLow = new THREE.ConeGeometry(4.5, 8.0, 9, 1);
  const fullSpruceMid = new THREE.ConeGeometry(3.5, 8.6, 9, 1);
  const fullSpruceTop = new THREE.ConeGeometry(2.4, 7.8, 8, 1);
  const silhouetteCanopy = new THREE.ConeGeometry(4.9, 17.4, 7, 1);
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

  const certifyTreeInstance = (instance: TreeInstance) => {
    const range = getBandRange(instance.band);
    const expectedGround = getTreeGroundHeightAt(instance.point, instance.band);
    const shoreClearance = -distanceToShore(instance.point);
    const maxGround = instance.band === "alpineBase" ? 15.4 : 3.04;
    const grounded =
      Number.isFinite(instance.groundY) &&
      Math.abs(instance.groundY - expectedGround) <= 0.02 &&
      instance.groundY >= 1.36 &&
      instance.groundY <= maxGround;
    const forestOwned =
      isMainlandForestZone(instance.point, range.min, range.max) &&
      shoreClearance >= ZONE_TRUTH.forestTreeMinShoreClearance &&
      shoreClearance <= range.max + 2;
    const mountainOwned =
      (instance.band !== "alpineBase" && shoreClearance > ZONE_TRUTH.farForestMaxShoreClearance + 138) ||
      instance.point.x > LAKE_MAP.mapBounds.maxX + ZONE_TRUTH.farForestMaxShoreClearance + 132;

    return {
      grounded,
      forestOwned,
      mountainOwned,
      valid: grounded && forestOwned && !mountainOwned,
    };
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
      const certification = certifyTreeInstance(instance);
      if (!certification.valid) {
        rejectedTreeCandidates += 1;
        continue;
      }
      if (!certification.grounded) {
        ungroundedTreeInstances += 1;
      }
      if (certification.mountainOwned) {
        mountainOverlappedTreeInstances += 1;
      }
      treePlacementValidCandidates += 1;
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

  addSimpleTreeType("tallNarrowPine", 170, ["near", "mid", "far", "far", "alpineBase", "cove"], tallCanopy, foliageMaterial, 5.2, 1.0, 12.0, 1.02, 0.96, 0.35, 0.262);
  addSimpleTreeType("shortPine", 220, ["near", "near", "dock", "mid", "cove"], shortCanopy, foliageMaterial, 3.0, 0.86, 7.4, 0.96, 0.96, 0.34, 0.288);
  addSimpleTreeType("mediumConifer", 500, ["near", "mid", "mid", "far", "far", "alpineBase"], mediumCanopy, foliageMaterial, 4.0, 0.96, 10.0, 1.02, 1.02, 0.35, 0.262);
  addSimpleTreeType("youngPine", 240, ["near", "near", "dock", "mid", "cove"], youngCanopy, foliageMaterial, 1.7, 0.58, 4.2, 0.86, 0.94, 0.34, 0.292);

  const shorelineSignatureInstances = makeInstances(620, "shorelineSignatureSpruce", ["near", "near", "near", "near", "mid", "dock", "cove"], 0.342, 0.306);
  const shorelineTrunks = makeInstancedMesh(trunkGeometry, trunkMaterial, shorelineSignatureInstances.length, "Native tree type - shorelineSignatureSpruce trunks");
  const shorelineLow = makeInstancedMesh(fullSpruceLow, foliageMaterial, shorelineSignatureInstances.length, "Native tree type - shorelineSignatureSpruce lower boughs");
  const shorelineMid = makeInstancedMesh(fullSpruceMid, foliageMaterial, shorelineSignatureInstances.length, "Native tree type - shorelineSignatureSpruce middle boughs");
  const shorelineTop = makeInstancedMesh(fullSpruceTop, foliageMaterial, shorelineSignatureInstances.length, "Native tree type - shorelineSignatureSpruce top boughs");
  shorelineSignatureInstances.forEach((instance, index) => {
    const heroScale = 0.84 + rng() * 0.48;
    fillTrunk(shorelineTrunks, instance, index, 5.4 * instance.heightScale * heroScale, 0.72 * instance.widthScale);
    fillCone(shorelineLow, instance, index, 7.8 * instance.heightScale * heroScale, 1.28 * instance.widthScale, 1.02 * instance.heightScale * heroScale, 0.82 + rng() * 0.18);
    fillCone(shorelineMid, instance, index, 11.0 * instance.heightScale * heroScale, 1.08 * instance.widthScale, 0.99 * instance.heightScale * heroScale, 0.80 + rng() * 0.16);
    fillCone(shorelineTop, instance, index, 14.0 * instance.heightScale * heroScale, 0.82 * instance.widthScale, 0.99 * instance.heightScale * heroScale, 0.78 + rng() * 0.14);
  });
  [shorelineTrunks, shorelineLow, shorelineMid, shorelineTop].forEach((mesh) => finalizeMesh(mesh, shorelineSignatureInstances.length));
  group.add(shorelineTrunks, shorelineLow, shorelineMid, shorelineTop);
  treeBuilds.push({
    key: "shorelineSignatureSpruce",
    meshes: [shorelineTrunks, shorelineLow, shorelineMid, shorelineTop],
    baseCount: shorelineSignatureInstances.length,
  });

  const layeredInstances = makeInstances(760, "layeredConifer", ["near", "mid", "mid", "far", "far", "alpineBase", "alpineBase", "cove"], 0.35, 0.236);
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

  const broadInstances = makeInstances(650, "broadEvergreenCluster", ["mid", "far", "far", "alpineBase", "alpineBase", "mid", "cove"], 0.34, 0.208);
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

  const canopyInstances = makeInstances(1080, "canopyMound", ["mid", "far", "far", "alpineBase", "alpineBase", "cove"], 0.335, 0.196);
  const canopyMounds = makeInstancedMesh(canopyMoundGeometry, clusterMaterial, canopyInstances.length, "Native tree type - canopyMound crowns");
  canopyInstances.forEach((instance, index) => {
    const inland = THREE.MathUtils.clamp((-distanceToShore(instance.point) - 86) / 260, 0, 1);
    position.set(instance.point.x, instance.groundY + 5.0 * instance.heightScale, instance.point.z);
    quaternion.setFromAxisAngle(up, instance.yaw);
    scale.set(
      (1.05 + inland * 0.42) * instance.widthScale,
      (0.58 + inland * 0.18) * instance.heightScale,
      (0.72 + rng() * 0.42) * instance.widthScale,
    );
    matrix.compose(position, quaternion, scale);
    canopyMounds.setMatrixAt(index, matrix);
    canopyMounds.setColorAt(index, instance.color);
  });
  finalizeMesh(canopyMounds, canopyInstances.length);
  group.add(canopyMounds);
  treeBuilds.push({
    key: "canopyMound",
    meshes: [canopyMounds],
    baseCount: canopyInstances.length,
  });

  const backgroundMassInstances = makeInstances(1340, "backgroundCanopyMass", ["far", "far", "alpineBase", "alpineBase", "far", "mid"], 0.342, 0.176);
  const backgroundMass = makeInstancedMesh(backgroundCanopyGeometry, clusterMaterial, backgroundMassInstances.length, "Native tree type - backgroundCanopyMass crowns");
  backgroundMassInstances.forEach((instance, index) => {
    const inland = THREE.MathUtils.clamp((-distanceToShore(instance.point) - 150) / 300, 0, 1);
    position.set(instance.point.x, instance.groundY + 5.4 * instance.heightScale, instance.point.z);
    quaternion.setFromAxisAngle(up, instance.yaw);
    scale.set(
      (1.28 + inland * 0.46) * instance.widthScale,
      (0.62 + inland * 0.20) * instance.heightScale,
      (0.92 + rng() * 0.32) * instance.widthScale,
    );
    matrix.compose(position, quaternion, scale);
    backgroundMass.setMatrixAt(index, matrix);
    backgroundMass.setColorAt(index, color.setHSL(0.35 + (rng() - 0.5) * 0.04, 0.36 + rng() * 0.14, 0.156 + rng() * 0.058));
  });
  finalizeMesh(backgroundMass, backgroundMassInstances.length);
  group.add(backgroundMass);
  treeBuilds.push({
    key: "backgroundCanopyMass",
    meshes: [backgroundMass],
    baseCount: backgroundMassInstances.length,
  });

  const wideClusterInstances = makeInstances(640, "wideDarkConiferCluster", ["far", "far", "alpineBase", "alpineBase", "mid", "cove"], 0.338, 0.184);
  const wideClusters = makeInstancedMesh(wideDarkConiferGeometry, darkFoliageMaterial, wideClusterInstances.length, "Native tree type - wideDarkConiferCluster crowns");
  wideClusterInstances.forEach((instance, index) => {
    const inland = THREE.MathUtils.clamp((-distanceToShore(instance.point) - 126) / 270, 0, 1);
    position.set(instance.point.x, instance.groundY + 6.1 * instance.heightScale, instance.point.z);
    quaternion.setFromAxisAngle(up, instance.yaw);
    scale.set(
      (1.26 + inland * 0.36) * instance.widthScale,
      (0.70 + inland * 0.20) * instance.heightScale,
      (0.86 + rng() * 0.44) * instance.widthScale,
    );
    matrix.compose(position, quaternion, scale);
    wideClusters.setMatrixAt(index, matrix);
    wideClusters.setColorAt(index, instance.color);
  });
  finalizeMesh(wideClusters, wideClusterInstances.length);
  group.add(wideClusters);
  treeBuilds.push({
    key: "wideDarkConiferCluster",
    meshes: [wideClusters],
    baseCount: wideClusterInstances.length,
  });

  const irregularInstances = makeInstances(860, "irregularCanopyMound", ["mid", "far", "far", "alpineBase", "alpineBase", "cove"], 0.332, 0.188);
  const irregularMounds = makeInstancedMesh(irregularCanopyGeometry, clusterMaterial, irregularInstances.length, "Native tree type - irregularCanopyMound crowns");
  irregularInstances.forEach((instance, index) => {
    const inland = THREE.MathUtils.clamp((-distanceToShore(instance.point) - 112) / 280, 0, 1);
    position.set(instance.point.x, instance.groundY + 5.3 * instance.heightScale, instance.point.z);
    quaternion.setFromAxisAngle(up, instance.yaw);
    scale.set(
      (0.90 + inland * 0.38) * instance.widthScale,
      (0.58 + inland * 0.22) * instance.heightScale,
      (0.78 + rng() * 0.42) * instance.widthScale,
    );
    matrix.compose(position, quaternion, scale);
    irregularMounds.setMatrixAt(index, matrix);
    irregularMounds.setColorAt(index, color.setHSL(0.335 + (rng() - 0.5) * 0.055, 0.34 + rng() * 0.16, 0.160 + rng() * 0.062));
  });
  finalizeMesh(irregularMounds, irregularInstances.length);
  group.add(irregularMounds);
  treeBuilds.push({
    key: "irregularCanopyMound",
    meshes: [irregularMounds],
    baseCount: irregularInstances.length,
  });

  const understoryInstances = makeInstances(1320, "understoryShrubMass", ["near", "near", "near", "mid", "far", "far", "alpineBase", "cove"], 0.318, 0.210);
  const understory = makeInstancedMesh(understoryGeometry, clusterMaterial, understoryInstances.length, "Native tree type - understoryShrubMass low crowns");
  understoryInstances.forEach((instance, index) => {
    const inland = THREE.MathUtils.clamp((-distanceToShore(instance.point) - 96) / 300, 0, 1);
    position.set(instance.point.x, instance.groundY + 2.2 * instance.heightScale, instance.point.z);
    quaternion.setFromAxisAngle(up, instance.yaw);
    scale.set(
      (0.62 + inland * 0.30) * instance.widthScale,
      (0.34 + inland * 0.14) * instance.heightScale,
      (0.54 + rng() * 0.32) * instance.widthScale,
    );
    matrix.compose(position, quaternion, scale);
    understory.setMatrixAt(index, matrix);
    understory.setColorAt(index, color.setHSL(0.315 + (rng() - 0.5) * 0.06, 0.34 + rng() * 0.15, 0.150 + rng() * 0.060));
  });
  finalizeMesh(understory, understoryInstances.length);
  group.add(understory);
  treeBuilds.push({
    key: "understoryShrubMass",
    meshes: [understory],
    baseCount: understoryInstances.length,
  });

  const brokenInstances = makeInstances(34, "brokenSilhouettePine", ["far", "alpineBase", "alpineBase", "far", "mid"], 0.355, 0.172);
  const brokenSilhouettes = makeInstancedMesh(brokenSilhouetteGeometry, silhouetteMaterial, brokenInstances.length, "Native tree type - brokenSilhouettePine spires");
  brokenInstances.forEach((instance, index) => {
    const height = 0.58 + rng() * 0.92 + (instance.band === "far" ? 0.22 : 0);
    position.set(instance.point.x, instance.groundY + 8.4 * height, instance.point.z);
    quaternion.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.055, instance.yaw, (rng() - 0.5) * 0.075));
    scale.set(0.54 + rng() * 0.72, height, 0.44 + rng() * 0.48);
    matrix.compose(position, quaternion, scale);
    brokenSilhouettes.setMatrixAt(index, matrix);
    brokenSilhouettes.setColorAt(index, color.setHSL(0.36 + (rng() - 0.5) * 0.025, 0.31, 0.136 + rng() * 0.040));
  });
  finalizeMesh(brokenSilhouettes, brokenInstances.length);
  group.add(brokenSilhouettes);
  treeBuilds.push({
    key: "brokenSilhouettePine",
    meshes: [brokenSilhouettes],
    baseCount: brokenInstances.length,
  });

  const fullSpruceInstances = makeInstances(1450, "fullSpruceCluster", ["near", "mid", "mid", "far", "far", "alpineBase", "alpineBase", "cove"], 0.346, 0.222);
  const fullSpruceLowMesh = makeInstancedMesh(fullSpruceLow, darkFoliageMaterial, fullSpruceInstances.length, "Native tree type - fullSpruceCluster low skirt");
  const fullSpruceMidMesh = makeInstancedMesh(fullSpruceMid, darkFoliageMaterial, fullSpruceInstances.length, "Native tree type - fullSpruceCluster middle skirt");
  const fullSpruceTopMesh = makeInstancedMesh(fullSpruceTop, darkFoliageMaterial, fullSpruceInstances.length, "Native tree type - fullSpruceCluster top");
  fullSpruceInstances.forEach((instance, index) => {
    const inland = THREE.MathUtils.clamp((-distanceToShore(instance.point) - 118) / 280, 0, 1);
    fillCone(fullSpruceLowMesh, instance, index, 6.7 * instance.heightScale, (1.36 + inland * 0.28) * instance.widthScale, 0.94 * instance.heightScale, 0.84 + rng() * 0.22);
    fillCone(fullSpruceMidMesh, instance, index, 10.0 * instance.heightScale, (1.15 + inland * 0.24) * instance.widthScale, 0.96 * instance.heightScale, 0.82 + rng() * 0.20);
    fillCone(fullSpruceTopMesh, instance, index, 13.3 * instance.heightScale, (0.94 + inland * 0.18) * instance.widthScale, 0.98 * instance.heightScale, 0.80 + rng() * 0.18);
  });
  [fullSpruceLowMesh, fullSpruceMidMesh, fullSpruceTopMesh].forEach((mesh) => finalizeMesh(mesh, fullSpruceInstances.length));
  group.add(fullSpruceLowMesh, fullSpruceMidMesh, fullSpruceTopMesh);
  treeBuilds.push({
    key: "fullSpruceCluster",
    meshes: [fullSpruceLowMesh, fullSpruceMidMesh, fullSpruceTopMesh],
    baseCount: fullSpruceInstances.length,
  });

  const foothillClimberInstances = makeInstances(760, "foothillClimberSpruce", ["far", "far", "alpineBase", "alpineBase", "alpineBase", "alpineBase", "mid"], 0.348, 0.212);
  const foothillTrunks = makeInstancedMesh(trunkGeometry, trunkMaterial, foothillClimberInstances.length, "Native tree type - foothillClimberSpruce trunks");
  const foothillLow = makeInstancedMesh(layerLow, darkFoliageMaterial, foothillClimberInstances.length, "Native tree type - foothillClimberSpruce lower skirts");
  const foothillMid = makeInstancedMesh(layerMid, darkFoliageMaterial, foothillClimberInstances.length, "Native tree type - foothillClimberSpruce middle skirts");
  const foothillTop = makeInstancedMesh(layerTop, darkFoliageMaterial, foothillClimberInstances.length, "Native tree type - foothillClimberSpruce top skirts");
  foothillClimberInstances.forEach((instance, index) => {
    const shoreClearance = Math.max(0, -distanceToShore(instance.point));
    const climb = THREE.MathUtils.clamp((shoreClearance - 250) / 420, 0, 1);
    const liftScale = 0.86 + climb * 0.36 + rng() * 0.22;
    fillTrunk(foothillTrunks, instance, index, 4.6 * instance.heightScale * liftScale, 0.82 * instance.widthScale);
    fillCone(foothillLow, instance, index, 7.4 * instance.heightScale * liftScale, (1.20 + climb * 0.18) * instance.widthScale, 0.92 * instance.heightScale * liftScale, 0.86 + rng() * 0.18);
    fillCone(foothillMid, instance, index, 10.7 * instance.heightScale * liftScale, (1.00 + climb * 0.14) * instance.widthScale, 0.94 * instance.heightScale * liftScale, 0.84 + rng() * 0.16);
    fillCone(foothillTop, instance, index, 13.7 * instance.heightScale * liftScale, (0.80 + climb * 0.10) * instance.widthScale, 0.96 * instance.heightScale * liftScale, 0.82 + rng() * 0.14);
  });
  [foothillTrunks, foothillLow, foothillMid, foothillTop].forEach((mesh) => finalizeMesh(mesh, foothillClimberInstances.length));
  group.add(foothillTrunks, foothillLow, foothillMid, foothillTop);
  treeBuilds.push({
    key: "foothillClimberSpruce",
    meshes: [foothillTrunks, foothillLow, foothillMid, foothillTop],
    baseCount: foothillClimberInstances.length,
  });

  const wallInstances = makeInstances(1320, "forestWallCanopy", ["far", "far", "alpineBase", "alpineBase", "far", "mid"], 0.338, 0.170);
  const forestWall = makeInstancedMesh(forestWallGeometry, clusterMaterial, wallInstances.length, "Native tree type - forestWallCanopy living wall");
  wallInstances.forEach((instance, index) => {
    const inland = THREE.MathUtils.clamp((-distanceToShore(instance.point) - 168) / 340, 0, 1);
    position.set(instance.point.x, instance.groundY + 5.8 * instance.heightScale, instance.point.z);
    quaternion.setFromAxisAngle(up, instance.yaw + (rng() - 0.5) * 0.48);
    scale.set(
      (1.32 + inland * 0.52) * instance.widthScale,
      (0.66 + inland * 0.22) * instance.heightScale,
      (0.92 + rng() * 0.36) * instance.widthScale,
    );
    matrix.compose(position, quaternion, scale);
    forestWall.setMatrixAt(index, matrix);
    forestWall.setColorAt(index, color.setHSL(0.335 + (rng() - 0.5) * 0.05, 0.34 + rng() * 0.14, 0.148 + rng() * 0.060));
  });
  finalizeMesh(forestWall, wallInstances.length);
  group.add(forestWall);
  treeBuilds.push({
    key: "forestWallCanopy",
    meshes: [forestWall],
    baseCount: wallInstances.length,
  });

  const distantInstances = makeInstances(260, "distantSilhouetteTree", ["far", "far", "alpineBase", "alpineBase", "far", "mid"], 0.36, 0.178);
  const distant = makeInstancedMesh(silhouetteCanopy, silhouetteMaterial, distantInstances.length, "Native tree type - distantSilhouetteTree band");
  distantInstances.forEach((instance, index) => {
    const height = 0.68 + rng() * 0.86 + (instance.band === "far" ? 0.18 : 0);
    position.set(instance.point.x, instance.groundY + 7.8 * height, instance.point.z);
    quaternion.setFromAxisAngle(up, instance.yaw);
    scale.set(0.86 + rng() * 1.02, height, 0.72 + rng() * 0.54);
    matrix.compose(position, quaternion, scale);
    distant.setMatrixAt(index, matrix);
    distant.setColorAt(index, color.setHSL(0.36 + (rng() - 0.5) * 0.03, 0.32, 0.140 + rng() * 0.046));
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
    map: createProceduralTexture({
      kind: "reed",
      seed: 646,
      size: 96,
      base: 0x7b8c50,
      accent: 0xbdc47a,
      dark: 0x46552f,
    }),
    roughnessMap: createProceduralRoughnessTexture("reed", 653, 96),
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

  const rockCount = 88;
  const rockGeometry = new THREE.DodecahedronGeometry(1, 1);
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x76796f,
    map: createProceduralTexture({
      kind: "rock",
      seed: 661,
      size: 96,
      base: 0x74786f,
      accent: 0xacb09e,
      dark: 0x3e4945,
    }),
    roughnessMap: createProceduralRoughnessTexture("rock", 668, 96),
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
      if (key === "forestWallCanopy" || key === "backgroundCanopyMass") {
        return 0.48;
      }
      return key === "distantSilhouetteTree" ? 0.62 : 0.54;
    }
    if (preset === "Scenic") {
      return key === "distantSilhouetteTree" ||
        key === "broadEvergreenCluster" ||
        key === "backgroundCanopyMass" ||
        key === "forestWallCanopy" ||
        key === "fullSpruceCluster" ||
        key === "shorelineSignatureSpruce" ||
        key === "foothillClimberSpruce"
        ? 1
        : 0.98;
    }
    if (
      key === "forestWallCanopy" ||
      key === "backgroundCanopyMass" ||
      key === "fullSpruceCluster" ||
      key === "shorelineSignatureSpruce" ||
      key === "foothillClimberSpruce"
    ) {
      return 0.94;
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
      const darken = Math.max(0.36, 1 - weather.dials.skyDark * 0.42);
      foliageMaterial.color.setHex(palette.shorelineGrass);
      foliageMaterial.color.multiplyScalar(darken * 0.98);
      darkFoliageMaterial.color.setHex(weather.dials.skyDark > 0.52 ? 0x18311e : 0x447b46);
      clusterMaterial.color.setHex(weather.dials.skyDark > 0.52 ? 0x142b1a : 0x376f3d);
      reedMaterial.color.setHex(weather.dials.skyDark > 0.55 ? 0x687246 : 0xa9bd68);
      rockMaterial.color.setHex(palette.rock);
      rockMaterial.color.lerp(new THREE.Color(0x9aa08f), 0.18);
      silhouetteMaterial.color.setHex(weather.dials.skyDark > 0.48 ? 0x142a1b : 0x2d5a38);
    },
    getStats: () => {
      const treeTypeCounts = getTypeCounts();
      const silhouetteInstances = treeTypeCounts.distantSilhouetteTree;
      const forestBandInstances =
        treeTypeCounts.distantSilhouetteTree +
        treeTypeCounts.backgroundCanopyMass +
        treeTypeCounts.forestWallCanopy;
      const nativeTreeInstances = TREE_TYPE_KEYS.reduce((total, key) => total + treeTypeCounts[key], 0);
      return {
        treeInstances: nativeTreeInstances,
        nativeTreeInstances,
        instancedTreeInstances: nativeTreeInstances,
        individualTreeInstances: 0,
        treeTypeCounts,
        treePlacementValidCandidates,
        rejectedTreeCandidates,
        ungroundedTreeInstances,
        mountainOverlappedTreeInstances,
        treeAlphaInstances: 0,
        treeAlphaAssets: { ...treeAlphaStatuses },
        reedInstances: validReedCount,
        rockInstances: validRockCount,
        silhouetteInstances,
        forestBandInstances,
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
