import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type ScenicAssetKey = "mountain" | "treeline" | "shoreline";
export type ScenicAssetLoadState = "fallback" | "loading" | "loaded" | "error";
export type ScenicAssetStatuses = Record<ScenicAssetKey, ScenicAssetLoadState>;
export type ScenicAssetQualityPreset = "Performance" | "Balanced" | "Scenic";

export type ScenicAssetSystem = {
  group: THREE.Group;
  setQualityPreset: (preset: ScenicAssetQualityPreset) => void;
  getStatuses: () => ScenicAssetStatuses;
};

const ASSET_PATHS: Record<ScenicAssetKey, string> = {
  mountain: "assets/models/hl-mountain-backdrop-v1.glb",
  treeline: "assets/models/hl-far-treeline-v1.glb",
  shoreline: "assets/models/hl-shoreline-kit-v1.glb",
};

const cloneScene = (source: THREE.Group) => {
  const clone = source.clone(true);
  clone.traverse((child) => {
    child.frustumCulled = false;
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });
  return clone;
};

const scenicMaterials = {
  mountainFar: new THREE.MeshBasicMaterial({ color: 0x8fa2a1, toneMapped: false }),
  mountainMid: new THREE.MeshBasicMaterial({ color: 0x3d5554, toneMapped: false }),
  mountainNear: new THREE.MeshBasicMaterial({ color: 0x0a1c1d, toneMapped: false }),
  mountainCap: new THREE.MeshBasicMaterial({ color: 0xd9ded6, toneMapped: false }),
  treeline: new THREE.MeshBasicMaterial({ color: 0x020b09, toneMapped: false }),
};

const normalizeLoadedScene = (scene: THREE.Group, key: ScenicAssetKey) => {
  scene.traverse((child) => {
    child.frustumCulled = false;
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = true;
      if (key === "mountain") {
        const name = child.name.toLowerCase();
        child.material = name.includes("cap")
          ? scenicMaterials.mountainCap
          : name.includes("far")
            ? scenicMaterials.mountainFar
            : name.includes("mid")
              ? scenicMaterials.mountainMid
              : scenicMaterials.mountainNear;
      } else if (key === "treeline") {
        child.material = scenicMaterials.treeline;
      }
    }
  });
};

export const createScenicAssetSystem = (): ScenicAssetSystem => {
  const loader = new GLTFLoader();
  const group = new THREE.Group();
  group.name = "Blender scenic foundation assets";

  const statuses: ScenicAssetStatuses = {
    mountain: "fallback",
    treeline: "fallback",
    shoreline: "fallback",
  };

  const loaded: Partial<Record<ScenicAssetKey, THREE.Group>> = {};
  let activePreset: ScenicAssetQualityPreset = "Balanced";

  const applyVisibility = () => {
    const useAssets = activePreset !== "Performance";
    const scenic = activePreset === "Scenic";
    loaded.mountain?.traverse((child) => {
      child.visible = useAssets;
    });
    loaded.treeline?.traverse((child) => {
      child.visible = useAssets;
    });
    loaded.shoreline?.children.forEach((child, index) => {
      child.visible = useAssets && (scenic || index < 2);
    });
    if (loaded.mountain) {
      loaded.mountain.scale.set(scenic ? 1.08 : 1.02, scenic ? 1.56 : 1.34, 1);
    }
    if (loaded.treeline) {
      loaded.treeline.scale.set(scenic ? 1.06 : 1, scenic ? 1.12 : 1, 1);
    }
  };

  const loadAsset = (key: ScenicAssetKey) => {
    statuses[key] = "loading";
    const url = `${import.meta.env.BASE_URL}${ASSET_PATHS[key]}`;
    loader.load(
      url,
      (gltf) => {
        normalizeLoadedScene(gltf.scene, key);
        statuses[key] = "loaded";
        if (key === "mountain") {
          gltf.scene.name = "Loaded Blender mountain backdrop v1";
          gltf.scene.position.set(0, 0, 0);
          loaded.mountain = gltf.scene;
          group.add(gltf.scene);
        } else if (key === "treeline") {
          gltf.scene.name = "Loaded Blender far treeline v1";
          gltf.scene.position.set(0, 0, 0);
          loaded.treeline = gltf.scene;
          group.add(gltf.scene);
        } else {
          const shorelineGroup = new THREE.Group();
          shorelineGroup.name = "Loaded Blender shoreline accent placements v1";
          const placements = [
            { x: -270, z: -72, rotation: -0.24, scale: 1.65 },
            { x: 196, z: 126, rotation: 0.54, scale: 1.32 },
            { x: -432, z: 228, rotation: -0.9, scale: 1.46 },
            { x: 362, z: -128, rotation: 0.18, scale: 1.18 },
            { x: -52, z: 244, rotation: 1.02, scale: 1.08 },
          ];
          placements.forEach((placement) => {
            const clone = cloneScene(gltf.scene);
            clone.position.set(placement.x, 0.18, placement.z);
            clone.rotation.y = placement.rotation;
            clone.scale.setScalar(placement.scale);
            shorelineGroup.add(clone);
          });
          loaded.shoreline = shorelineGroup;
          group.add(shorelineGroup);
        }
        applyVisibility();
      },
      undefined,
      () => {
        statuses[key] = "error";
        applyVisibility();
      },
    );
  };

  (Object.keys(ASSET_PATHS) as ScenicAssetKey[]).forEach(loadAsset);

  return {
    group,
    setQualityPreset: (preset) => {
      activePreset = preset;
      applyVisibility();
    },
    getStatuses: () => ({ ...statuses }),
  };
};
