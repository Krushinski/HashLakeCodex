import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { getWeatherPalette } from "./artDirection";
import { LAKE_MAP, getExpandedOutline } from "./lakeMap";
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

const TREE_ALPHA_PATHS: Record<TreeAlphaAssetKey, string> = {
  tallPine: "assets/models/hl-tree-alpha-tall-pine.glb",
  shortPine: "assets/models/hl-tree-alpha-short-pine.glb",
  layeredConifer: "assets/models/hl-tree-alpha-layered-conifer.glb",
};

const TREE_ALPHA_VERSION = "phase48";

const TREE_ALPHA_TARGET_HEIGHTS: Record<TreeAlphaAssetKey, number> = {
  tallPine: 30,
  shortPine: 19,
  layeredConifer: 24,
};

const treeAlphaPlacements: Array<{
  key: TreeAlphaAssetKey;
  x: number;
  z: number;
  scale: number;
  yaw: number;
}> = [
  { key: "tallPine", x: -92, z: -372, scale: 0.86, yaw: 0.2 },
  { key: "tallPine", x: 122, z: -332, scale: 0.78, yaw: 1.4 },
  { key: "shortPine", x: -46, z: -358, scale: 0.96, yaw: 2.1 },
  { key: "shortPine", x: 78, z: -344, scale: 0.84, yaw: -0.4 },
  { key: "layeredConifer", x: 18, z: -376, scale: 0.86, yaw: 0.9 },
  { key: "layeredConifer", x: 160, z: -318, scale: 0.78, yaw: -1.2 },
];

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

const createStripGeometry = (
  inner: readonly { x: number; z: number }[],
  outer: readonly { x: number; z: number }[],
) => {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const count = Math.min(inner.length, outer.length);

  for (let index = 0; index < count; index += 1) {
    positions.push(inner[index].x, 0, inner[index].z, outer[index].x, 0, outer[index].z);
  }

  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    const innerA = index * 2;
    const outerA = innerA + 1;
    const innerB = next * 2;
    const outerB = innerB + 1;
    indices.push(innerA, outerA, outerB, innerA, outerB, innerB);
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createForestGroundZones = () => {
  const group = new THREE.Group();
  group.name = "Forest-ready ground placement zones";
  const zoneMaterial = new THREE.MeshStandardMaterial({
    color: 0x183420,
    roughness: 0.96,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const midZoneMaterial = zoneMaterial.clone();
  midZoneMaterial.color.setHex(0x132b1d);
  midZoneMaterial.opacity = 0.18;
  const farZoneMaterial = zoneMaterial.clone();
  farZoneMaterial.color.setHex(0x0b2118);
  farZoneMaterial.opacity = 0.14;

  const zones = [
    {
      name: "Foreground shoreline tree-ready shelf",
      inner: 86,
      outer: 150,
      y: 0.92,
      material: zoneMaterial,
    },
    {
      name: "Midground forest cluster shelf",
      inner: 158,
      outer: 246,
      y: 0.74,
      material: midZoneMaterial,
    },
    {
      name: "Semi-far forest staging shelf",
      inner: 252,
      outer: 360,
      y: 0.58,
      material: farZoneMaterial,
    },
  ];

  zones.forEach((zone) => {
    const mesh = new THREE.Mesh(
      createStripGeometry(getExpandedOutline(zone.inner), getExpandedOutline(zone.outer)),
      zone.material,
    );
    mesh.name = zone.name;
    mesh.position.y = zone.y;
    mesh.renderOrder = -1;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  return group;
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

const buildForestMassGeometry = (width: number, baseHeight: number, peakHeight: number) => {
  const segments = 160;
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const x = (t - 0.5) * width;
    const skyline =
      baseHeight +
      peakHeight *
        (0.42 +
          0.28 * Math.sin(t * Math.PI * 9.0 + 0.8) +
          0.18 * Math.sin(t * Math.PI * 23.0 + 1.9) +
          0.12 * Math.sin(t * Math.PI * 47.0));
    vertices.push(x, 0, 0, x, Math.max(baseHeight * 0.62, skyline), 0);
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

export const createForestSystem = (): ForestSystem => {
  const group = new THREE.Group();
  group.name = "HashLake3-adapted forest and reeds";
  group.add(createForestGroundZones());
  const rng = makeRng(4242);
  const loader = new GLTFLoader();
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

  for (let index = 0; index < treeCount; index += 1) {
    const offset = 76 + Math.pow(rng(), 0.7) * 280;
    const shore = outlinePosition(index * 7 + Math.floor(rng() * 12), offset, (rng() - 0.5) * 48);
    const size = 0.72 + rng() * 1.55;
    position.set(shore.x, 5.4 + rng() * 2.6, shore.z);
    quaternion.setFromAxisAngle(up, rng() * Math.PI * 2);
    scale.set(size * (0.84 + rng() * 0.28), size, size * (0.84 + rng() * 0.28));
    matrix.compose(position, quaternion, scale);
    foliage.setMatrixAt(index, matrix);
    position.y = 1.36;
    scale.set(size * 0.8, size, size * 0.8);
    matrix.compose(position, quaternion, scale);
    trunks.setMatrixAt(index, matrix);
    foliage.setColorAt(
      index,
      color.setHSL(0.34 + (rng() - 0.5) * 0.08, 0.24 + rng() * 0.22, 0.18 + rng() * 0.08),
    );
  }
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
  for (let index = 0; index < reedCount; index += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * 92;
    position.set(
      reedBase.x + Math.cos(angle) * radius,
      2.2,
      reedBase.z + Math.sin(angle) * radius * 0.55,
    );
    quaternion.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.18, rng() * Math.PI * 2, (rng() - 0.5) * 0.18));
    const reedScale = 0.62 + rng() * 0.82;
    scale.set(reedScale, reedScale, reedScale);
    matrix.compose(position, quaternion, scale);
    reeds.setMatrixAt(index, matrix);
  }
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
  for (let index = 0; index < rockCount; index += 1) {
    const offset = 10 + rng() * 42;
    const shore = outlinePosition(index * 5 + 3, offset, (rng() - 0.5) * 18);
    const rockScale = 1.2 + rng() * 4.1;
    position.set(shore.x, 0.8 + rng() * 0.55, shore.z);
    quaternion.setFromEuler(new THREE.Euler(rng() * 0.6, rng() * Math.PI * 2, rng() * 0.6));
    scale.set(rockScale, rockScale * (0.45 + rng() * 0.36), rockScale * (0.8 + rng() * 0.5));
    matrix.compose(position, quaternion, scale);
    rocks.setMatrixAt(index, matrix);
    rocks.setColorAt(index, color.setHSL(0.10 + rng() * 0.06, 0.05, 0.28 + rng() * 0.14));
  }
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) {
    rocks.instanceColor.needsUpdate = true;
  }
  group.add(rocks);

  let activePreset: ForestQualityPreset = "Balanced";
  let scenicTreelineActive = false;
  let treeAlphaSampleCount = 0;
  const treeAlphaStatuses: TreeAlphaAssetStatuses = {
    tallPine: "fallback",
    shortPine: "fallback",
    layeredConifer: "fallback",
  };
  const treeAlphaGroup = new THREE.Group();
  treeAlphaGroup.name = "Blender tree alpha sample";
  group.add(treeAlphaGroup);

  const normalizeTreeAlpha = (scene: THREE.Group, key: TreeAlphaAssetKey) => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const height = Math.max(0.001, size.y);
    const targetHeight = TREE_ALPHA_TARGET_HEIGHTS[key];
    const assetScale = targetHeight / height;
    const center = box.getCenter(new THREE.Vector3());
    scene.scale.multiplyScalar(assetScale);
    scene.position.x -= center.x * assetScale;
    scene.position.z -= center.z * assetScale;
    scene.position.y -= box.min.y * assetScale;
    scene.traverse((child) => {
      child.frustumCulled = false;
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const childName = child.name.toLowerCase();
        const materialName = Array.isArray(child.material)
          ? child.material.map((material) => material.name).join(" ")
          : child.material.name;
        const isTrunk = `${childName} ${materialName}`.toLowerCase().includes("trunk");
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if ("color" in material) {
            (material as THREE.MeshStandardMaterial).color.setHex(isTrunk ? 0x3b2718 : 0x123321);
          }
          if ("roughness" in material) {
            (material as THREE.MeshStandardMaterial).roughness = 0.92;
          }
          if ("metalness" in material) {
            (material as THREE.MeshStandardMaterial).metalness = 0;
          }
        });
      }
    });
  };

  const placeTreeAlphaSamples = (key: TreeAlphaAssetKey, source: THREE.Group) => {
    treeAlphaPlacements
      .filter((placement) => placement.key === key)
      .forEach((placement) => {
        const sample = source.clone(true);
        sample.name = `Tree alpha sample ${key}`;
        sample.position.set(placement.x, 0.68, placement.z);
        sample.rotation.y = placement.yaw;
        sample.scale.setScalar(placement.scale);
        treeAlphaGroup.add(sample);
        treeAlphaSampleCount += 1;
      });
  };

  const loadTreeAlpha = (key: TreeAlphaAssetKey) => {
    treeAlphaStatuses[key] = "loading";
    const url = `${import.meta.env.BASE_URL}${TREE_ALPHA_PATHS[key]}?v=${TREE_ALPHA_VERSION}`;
    loader.load(
      url,
      (gltf) => {
        gltf.scene.name = `Loaded tree alpha ${key}`;
        normalizeTreeAlpha(gltf.scene, key);
        placeTreeAlphaSamples(key, gltf.scene);
        treeAlphaStatuses[key] = "loaded";
      },
      undefined,
      () => {
        treeAlphaStatuses[key] = "error";
      },
    );
  };

  (Object.keys(TREE_ALPHA_PATHS) as TreeAlphaAssetKey[]).forEach(loadTreeAlpha);

  const silhouetteCount = 190;
  const silhouetteGeometry = new THREE.ConeGeometry(3.6, 18, 6, 1);
  const silhouetteMaterial = new THREE.MeshBasicMaterial({
    color: 0x05110f,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
  });
  const silhouettes = new THREE.InstancedMesh(
    silhouetteGeometry,
    silhouetteMaterial,
    silhouetteCount,
  );
  silhouettes.name = "Far shore forest silhouette band";
  silhouettes.frustumCulled = false;
  for (let index = 0; index < silhouetteCount; index += 1) {
    const x = -760 + (index / (silhouetteCount - 1)) * 1520 + (rng() - 0.5) * 18;
    const z = -294 + Math.sin(index * 0.27) * 24 + (rng() - 0.5) * 16;
    const height = 0.62 + rng() * 1.55;
    position.set(x, 7.8 * height, z);
    quaternion.setFromAxisAngle(up, rng() * Math.PI * 2);
    scale.set(0.75 + rng() * 0.9, height, 0.72 + rng() * 0.5);
    matrix.compose(position, quaternion, scale);
    silhouettes.setMatrixAt(index, matrix);
  }
  silhouettes.instanceMatrix.needsUpdate = true;
  const forestMassMaterial = new THREE.MeshBasicMaterial({
    color: 0x031411,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const forestDepthMaterial = new THREE.MeshBasicMaterial({
    color: 0x08221d,
    transparent: true,
    opacity: 0.40,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const forestDepthMass = new THREE.Mesh(
    buildForestMassGeometry(1780, 28, 42),
    forestDepthMaterial,
  );
  forestDepthMass.name = "Distant layered treeline depth mass";
  forestDepthMass.position.set(0, 0.2, -374);
  forestDepthMass.frustumCulled = false;
  const forestMass = new THREE.Mesh(
    buildForestMassGeometry(1700, 24, 38),
    forestMassMaterial,
  );
  forestMass.name = "Continuous far treeline silhouette mass";
  forestMass.position.set(0, 0.4, -338);
  forestMass.frustumCulled = false;
  group.add(forestDepthMass, forestMass);
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
  for (let index = 0; index < scenicSilhouetteCount; index += 1) {
    const x = -820 + (index / (scenicSilhouetteCount - 1)) * 1640 + (rng() - 0.5) * 24;
    const z = -330 + Math.sin(index * 0.41) * 18 + (rng() - 0.5) * 22;
    const height = 0.58 + rng() * 1.28;
    position.set(x, 7.3 * height, z);
    quaternion.setFromAxisAngle(up, rng() * Math.PI * 2);
    scale.set(0.65 + rng() * 0.8, height, 0.58 + rng() * 0.44);
    matrix.compose(position, quaternion, scale);
    scenicSilhouettes.setMatrixAt(index, matrix);
  }
  scenicSilhouettes.instanceMatrix.needsUpdate = true;
  group.add(scenicSilhouettes);

  return {
    group,
    update: (elapsed, weather) => {
      const palette = getWeatherPalette(weather.stormIndex);
      const useProceduralFarTrees = !scenicTreelineActive;
      silhouettes.visible = useProceduralFarTrees;
      forestMass.visible = useProceduralFarTrees;
      forestDepthMass.visible = useProceduralFarTrees && activePreset !== "Performance";
      scenicSilhouettes.visible = useProceduralFarTrees && activePreset === "Scenic";
      windUniforms.time.value = elapsed;
      windUniforms.wind.value = 0.15 + weather.dials.wind * 1.35;
      foliageMaterial.color.setHex(palette.shorelineGrass);
      foliageMaterial.color.multiplyScalar(Math.max(0.18, 1 - weather.dials.skyDark * 0.48));
      reedMaterial.color.setHex(weather.dials.skyDark > 0.55 ? 0x59613d : 0xa4b85f);
      rockMaterial.color.setHex(palette.rock);
      silhouetteMaterial.opacity =
        (activePreset === "Scenic" ? 0.92 : activePreset === "Performance" ? 0.68 : 0.82) +
        weather.dials.skyDark * 0.1;
      forestMassMaterial.opacity =
        activePreset === "Performance"
          ? 0.50 + weather.dials.skyDark * 0.08
          : activePreset === "Scenic"
            ? 0.86 + weather.dials.skyDark * 0.08
            : 0.74 + weather.dials.skyDark * 0.08;
      forestMassMaterial.color.setHex(weather.dials.skyDark > 0.48 ? 0x010607 : 0x031411);
      forestDepthMaterial.opacity =
        activePreset === "Performance"
          ? 0.20 + weather.dials.skyDark * 0.04
          : activePreset === "Scenic"
            ? 0.46 + weather.dials.skyDark * 0.05
            : 0.36 + weather.dials.skyDark * 0.05;
      forestDepthMaterial.color.setHex(weather.dials.skyDark > 0.48 ? 0x071012 : 0x08221d);
      treeAlphaGroup.visible = true;
    },
    getStats: () => ({
      treeInstances:
        treeCount + (silhouettes.visible ? silhouetteCount : 0) + (scenicSilhouettes.visible ? scenicSilhouetteCount : 0),
      treeAlphaInstances: treeAlphaSampleCount,
      treeAlphaAssets: { ...treeAlphaStatuses },
      reedInstances: reedCount,
      rockInstances: rockCount,
      silhouetteInstances: (silhouettes.visible ? silhouetteCount : 0) + (scenicSilhouettes.visible ? scenicSilhouetteCount : 0),
      forestBandInstances: (silhouettes.visible ? silhouetteCount : 0) + (scenicSilhouettes.visible ? scenicSilhouetteCount : 0),
      forestBandMethod: scenicTreelineActive
        ? "Blender GLB treeline"
        : scenicSilhouettes.visible
          ? "mass + instanced x2"
          : "mass + instanced",
    }),
    setQualityPreset: (preset) => {
      activePreset = preset;
      scenicSilhouettes.visible = !scenicTreelineActive && preset === "Scenic";
      forestDepthMass.visible = !scenicTreelineActive && preset !== "Performance";
      treeAlphaGroup.visible = true;
    },
    setScenicTreelineActive: (active) => {
      scenicTreelineActive = active;
      silhouettes.visible = !active;
      forestMass.visible = !active;
      forestDepthMass.visible = !active;
      scenicSilhouettes.visible = !active && activePreset === "Scenic";
    },
  };
};
