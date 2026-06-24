import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LAKE_FEATURE_FOOTPRINTS } from "./lakeMap";

export type ScenicAssetKey = "mountain" | "treeline" | "shoreline" | "sandbarAlpha" | "islandSandAlpha";
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
  sandbarAlpha: "assets/models/hl-sandbar-alpha-v1.glb",
  islandSandAlpha: "assets/models/hl-island-sand-alpha-v1.glb",
};

const scenicMaterials = {
  mountainFar: new THREE.MeshBasicMaterial({ color: 0x8fa2a1, toneMapped: false }),
  mountainMid: new THREE.MeshBasicMaterial({ color: 0x3d5554, toneMapped: false }),
  mountainNear: new THREE.MeshBasicMaterial({ color: 0x0a1c1d, toneMapped: false }),
  mountainCap: new THREE.MeshBasicMaterial({ color: 0xd9ded6, toneMapped: false }),
  treeline: new THREE.MeshBasicMaterial({ color: 0x020b09, toneMapped: false }),
  sandCore: new THREE.MeshStandardMaterial({ color: 0xd7cb9d, roughness: 0.92 }),
  sandDamp: new THREE.MeshStandardMaterial({
    color: 0xa99f7a,
    roughness: 0.96,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  }),
  sandFeather: new THREE.MeshStandardMaterial({
    color: 0x9ecfc0,
    roughness: 0.98,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  }),
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
      } else if (key === "sandbarAlpha" || key === "islandSandAlpha") {
        child.material = [
          scenicMaterials.sandCore,
          scenicMaterials.sandDamp,
          scenicMaterials.sandFeather,
        ];
        child.renderOrder = 7;
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
    sandbarAlpha: "fallback",
    islandSandAlpha: "fallback",
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
    loaded.shoreline?.traverse((child) => {
      child.visible = false;
    });
    loaded.sandbarAlpha?.traverse((child) => {
      child.visible = useAssets;
    });
    loaded.islandSandAlpha?.traverse((child) => {
      child.visible = useAssets;
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
        } else if (key === "sandbarAlpha") {
          gltf.scene.name = "Loaded Blender sandbar alpha v1";
          gltf.scene.position.set(
            LAKE_FEATURE_FOOTPRINTS.sandbar.center.x,
            0.335,
            LAKE_FEATURE_FOOTPRINTS.sandbar.center.z,
          );
          gltf.scene.rotation.y = -LAKE_FEATURE_FOOTPRINTS.sandbar.rotation;
          loaded.sandbarAlpha = gltf.scene;
          group.add(gltf.scene);
        } else if (key === "islandSandAlpha") {
          gltf.scene.name = "Loaded Blender island sand alpha v1";
          gltf.scene.position.set(
            LAKE_FEATURE_FOOTPRINTS.island.center.x,
            0.355,
            LAKE_FEATURE_FOOTPRINTS.island.center.z,
          );
          gltf.scene.rotation.y = -LAKE_FEATURE_FOOTPRINTS.island.rotation;
          loaded.islandSandAlpha = gltf.scene;
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

  (["treeline", "sandbarAlpha", "islandSandAlpha"] as ScenicAssetKey[]).forEach(loadAsset);

  return {
    group,
    setQualityPreset: (preset) => {
      activePreset = preset;
      applyVisibility();
    },
    getStatuses: () => ({ ...statuses }),
  };
};
