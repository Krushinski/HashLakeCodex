import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type ScenicAssetKey = "mountain" | "mountainAlpha" | "treeline" | "shoreline";
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
  mountainAlpha: "assets/models/hl-mountain-range-alpha-v1.glb",
  treeline: "assets/models/hl-far-treeline-v1.glb",
  shoreline: "assets/models/hl-shoreline-kit-v1.glb",
};

const ACTIVE_SCENIC_ASSET_LOADS: ScenicAssetKey[] = [];

const scenicMaterials = {
  mountainFar: new THREE.MeshStandardMaterial({ color: 0x647676, roughness: 0.96, metalness: 0 }),
  mountainMid: new THREE.MeshStandardMaterial({ color: 0x314740, roughness: 0.98, metalness: 0 }),
  mountainNear: new THREE.MeshStandardMaterial({ color: 0x10241e, roughness: 1, metalness: 0 }),
  mountainCap: new THREE.MeshStandardMaterial({ color: 0x9fa79a, roughness: 0.92, metalness: 0 }),
  treeline: new THREE.MeshBasicMaterial({ color: 0x061410, toneMapped: false }),
};

const normalizeLoadedScene = (scene: THREE.Group, key: ScenicAssetKey) => {
  scene.traverse((child) => {
    child.frustumCulled = false;
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = true;
      if (key === "mountain" || key === "mountainAlpha") {
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
    mountainAlpha: "fallback",
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
    loaded.mountainAlpha?.traverse((child) => {
      child.visible = useAssets;
    });
    loaded.treeline?.traverse((child) => {
      child.visible = useAssets;
    });
    loaded.shoreline?.traverse((child) => {
      child.visible = false;
    });
    if (loaded.mountain) {
      loaded.mountain.scale.set(scenic ? 1.08 : 1.02, scenic ? 1.56 : 1.34, 1);
    }
    if (loaded.mountainAlpha) {
      loaded.mountainAlpha.scale.set(scenic ? 1.04 : 1, scenic ? 1.24 : 1.14, scenic ? 1.02 : 1);
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
        } else if (key === "mountainAlpha") {
          gltf.scene.name = "Loaded Blender mountain range alpha v1";
          gltf.scene.position.set(0, 0, 0);
          loaded.mountainAlpha = gltf.scene;
          group.add(gltf.scene);
        } else if (key === "treeline") {
          gltf.scene.name = "Loaded Blender far treeline v1";
          gltf.scene.position.set(0, 0, 0);
          loaded.treeline = gltf.scene;
          group.add(gltf.scene);
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

  ACTIVE_SCENIC_ASSET_LOADS.forEach(loadAsset);

  return {
    group,
    setQualityPreset: (preset) => {
      activePreset = preset;
      applyVisibility();
    },
    getStatuses: () => ({ ...statuses }),
  };
};
