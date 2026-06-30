import * as THREE from "three";
import { BUILD_INFO } from "../buildInfo";
import type { HashlakeEventBus } from "../state/eventBus";
import type { WeatherSnapshot, WeatherStore } from "../state/weatherEngine";
import { SCENARIO_PALETTES, getWeatherPalette } from "./artDirection";
import { createSceneEffects } from "./effects";
import {
  createForestSystem,
  type NativeTreeTypeCounts,
  type TreeAlphaAssetStatuses,
} from "./forestSystem";
import {
  LAKE_FEATURE_FOOTPRINTS,
  LAKE_MAP,
  clampBoatToWater,
  distanceToShore,
  getExpandedOutline,
  getNearestLocation,
  isReedWetlandZone,
} from "./lakeMap";
import { createPostSystem } from "./postSystem";
import { createScenicAssetSystem, type ScenicAssetStatuses } from "./scenicAssets";
import {
  detectRendererCapabilities,
  type RendererCapabilityTelemetry,
} from "./rendererTelemetry";
import { createTerrainSystem } from "./terrainSystem";
import {
  type WaterSurface,
  animateWater,
  createWater,
} from "./waterSystem";
import {
  applyPlanarUvs,
  makeTexturedStandardMaterial,
} from "./proceduralMaterials";
import {
  NO_VALID_MOUNTAIN_EXPERIMENT_REASON,
  createZone6MountainExperimentSystem,
} from "./zone6MountainExperiment";
import {
  LAND_PERIMETER_BANDS,
  ZONE_BAND_TABLE_VERSION,
  type ZoneBandMaterialKey,
} from "./zoneBands";

type HashlakeSceneOptions = {
  container: HTMLElement;
  onFirstFrame: () => void;
  onRecoverableError: (message: string) => void;
  weatherStore: WeatherStore;
  eventBus: HashlakeEventBus;
};

type HashlakeScene = {
  start: () => void;
  stop: () => void;
  getTelemetry: () => SceneTelemetry;
  toggleDriveMode: () => void;
};

const CAMERA_HOME = new THREE.Vector3(0, 46, 126);
const BOAT_HOME = new THREE.Vector3(0, 2.2, 0);
const BOAT_WATERLINE_SINK = 1.22;
const TABLEAU_STORAGE_KEY = "hashlake.tableau.v1";
const SCENIC_CAMERA_STORAGE_KEY = "hashlake.scenicCamera.v1";
const DRIVE_ACCELERATION_BASE = 23;
const DRIVE_ACCELERATION_RAMP = 51;
const DRIVE_MAX_SPEED = 52;
const DRIVE_BOOST_MAX_SPEED = 100;
const DRIVE_SUPER_BOOST_MAX_SPEED = 120;
const DRIVE_BOOST_MULTIPLIER = 1.76;
const DRIVE_SUPER_BOOST_MULTIPLIER = 1.98;
const DRIVE_BOOST_IMPULSE = 20;
const DRIVE_SUPER_BOOST_IMPULSE = 26;
const DRIVE_NATURAL_BRAKE_DRAG = 34;
const DRIVE_COAST_DRAG = 0.9;
const DRIVE_ACTIVE_BRAKE_FORCE = 82;
const DRIVE_REVERSE_SPEED = -15;
const DRIVE_REVERSE_DELAY_THRESHOLD = 2.4;
const DRIVE_ANCHOR_BRAKE_FORCE = 145;
const DRIVE_TURN_RATE_LOW_SPEED = 2.48;
const DRIVE_TURN_RATE_HIGH_SPEED = 0.82;
const DRIVE_STEER_EASE_IN = 8.45;
const DRIVE_STEER_EASE_OUT = 5.8;
const DRIVE_STEER_SENSITIVITY = 1.1;
const DRIVE_MAX_YAW_PER_SECOND = 1.52;
const DRIVE_SPEED_TURN_DAMPING = 0.58;
const DRIVE_WATER_RESISTANCE_TURN_DAMPING = 0.86;
const DRIVE_BOW_LIFT_SCALE = 0.18;
const DRIVE_BANK_SCALE = 0.14;
const DRIVE_CAMERA_DAMPING = 0.42;
const FRAME_CAMERA_DAMPING = 0.08;
const WAKE_BLOCK_SIZE_MIN = 0.22;
const WAKE_BLOCK_SIZE_MAX = 0.72;
const WAKE_VERTICAL_VELOCITY = 0.08;
const WAKE_BACKWARD_VELOCITY = 4.6;
const WAKE_OUTWARD_SPREAD = 2.4;
const WAKE_LIFETIME_SECONDS = 0.74;
const WAKE_EMISSION_RATE = 128;
const WAKE_BOOST_MULTIPLIER = 1.72;
const WAKE_SURFACE_Y_OFFSET = 0.62;
const WAKE_FADE_SPEED = 1.26;
const WAKE_MAX_ACTIVE_BLOCKS = 320;
const QUALITY_TARGET_FPS = 54;
const QUALITY_WARMUP_MS = 4500;
const QUALITY_MIN_DESKTOP_PIXEL_RATIO = 1;
const QUALITY_MIN_MOBILE_PIXEL_RATIO = 0.78;
const QUALITY_MAX_PIXEL_RATIO = 1.75;
const QUALITY_GOVERNOR_INTERVAL = 2500;
const QUALITY_SCENIC_DOWNGRADE_FPS = 42;
const QUALITY_BALANCED_DOWNGRADE_FPS = 34;

export type QualityPreset = "Performance" | "Balanced" | "Scenic";

type QualityPresetConfig = {
  maxPixelRatio: number;
  effectScale: number;
  wakeScale: number;
  forestUpdateInterval: number;
  postEnabled: boolean;
};

const QUALITY_PRESETS: Record<QualityPreset, QualityPresetConfig> = {
  Performance: {
    maxPixelRatio: 1,
    effectScale: 0.62,
    wakeScale: 0.72,
    forestUpdateInterval: 0.18,
    postEnabled: false,
  },
  Balanced: {
    maxPixelRatio: 1.25,
    effectScale: 0.84,
    wakeScale: 1,
    forestUpdateInterval: 0.1,
    postEnabled: true,
  },
  Scenic: {
    maxPixelRatio: 1.6,
    effectScale: 1,
    wakeScale: 1.16,
    forestUpdateInterval: 0.055,
    postEnabled: true,
  },
};

type SceneTelemetry = {
  mode: "Frame" | "Drive";
  speed: number;
  position: {
    x: number;
    z: number;
  };
  heading: number;
  visualHeading: number;
  cameraHeading: number;
  movementVector: {
    x: number;
    z: number;
  };
  steerInput: number;
  throttleInput: number;
  brakeInput: number;
  boostActive: boolean;
  inputSource: "desktop" | "mobile" | "none";
  worldRotationLocked: boolean;
  headingWarning: boolean;
  cameraWarning: boolean;
  cameraPreset: string;
  nearestLocation: string;
  savedTableau: boolean;
  fps: number;
  frameTimeMs: number;
  qualityPreset: QualityPreset;
  pixelRatio: number;
  renderScale: number;
  visualMode: VisualModeTelemetry;
  activeWakeBlocks: number;
  activeEffectBlocks: number;
  activeRings: number;
  activeSplashes: number;
  lastSplashDistanceToBoat: number | null;
  lastBoatImpulseStrength: number;
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
  forestBandInstances: number;
  forestBandMethod: string;
  reedInstances: number;
  rockInstances: number;
  mountainVertices: number;
  groundBandCount: number;
  groundRibbonValid: boolean;
  groundBadBandSegments: number;
  groundContourLocked: boolean;
  groundFlippedBands: number;
  groundDownwardTriangles: number;
  zoneBandTableVersion: string;
  postEnabled: boolean;
  reflectionEnabled: boolean;
  scenicAssets: ScenicAssetStatuses;
};

type VisualModeTelemetry = {
  renderer: RendererCapabilityTelemetry;
  activeMode: "Native Baseline" | "No Mountains / Zone Proof";
  mountainOwner: string;
  nativeMountainsVisible: boolean;
  experimentMountainsVisible: boolean;
  zoneProofActive: boolean;
  mountainZone: string;
  mountainExperimentSlotReady: boolean;
  mountainExperimentAvailable: boolean;
  mountainExperimentActive: boolean;
  mountainExperimentReason: string;
  mountainExperimentVertices: number;
  mountainExperimentValid: boolean;
  mountainBackArcValid: boolean;
  mountainBackArcActive: boolean;
  mountainSideFadeoutActive: boolean;
  mountainInvalidVertexCount: number;
  mountainFoothillAnchor: boolean;
  mountainBaseTouchesFoothill: boolean;
  mountainGrounded: boolean;
  mountainFloatingGapDetected: boolean;
  mountainBottomSilhouetteValid: boolean;
  mountainForestOcclusionValid: boolean;
  mountainStageOrderValid: boolean;
  mountainArtifactFree: boolean;
  mountainCameraCheckValid: boolean;
  mountainLakeShoreOverlap: boolean;
  mountainSecondLakeArtifact: boolean;
  mountainGlassPaneArtifact: boolean;
  webGpuProbeActive: boolean;
  heavyScenicActive: boolean;
  waterMeshCount: number;
};

type MountainTruthMode = "native" | "zone-proof";

type CameraPreset = {
  name: string;
  distance: number;
  height: number;
  lookAhead: number;
  lookHeight: number;
};

type ScenicCameraPreset = CameraPreset & {
  yawOffset: number;
  lookPitch: number;
  sideOffset: number;
};

type SavedTableau = {
  boat: {
    x: number;
    z: number;
    yaw: number;
  };
  cameraPresetIndex: number;
  camera: {
    distance: number;
    height: number;
    lookAhead: number;
    lookHeight: number;
  };
};

type DriveState = {
  mode: "Frame" | "Drive";
  x: number;
  z: number;
  yaw: number;
  cameraYaw: number;
  speed: number;
  cameraPresetIndex: number;
  scenicCameraPresetIndex: number;
  scenicCameraLabelUntil: number;
  scenicCameraManualLook: boolean;
  savedTableau: SavedTableau;
  hasSavedTableau: boolean;
  lookYaw: number;
  lookPitch: number;
  boatHop: number;
  lastMode: "Frame" | "Drive";
  currentSteer: number;
  accelerationForce: number;
  throttleHoldTime: number;
  wakePower: number;
  throttleInput: number;
  brakeInput: number;
  boostActive: boolean;
  boostKick: number;
  inputSource: "desktop" | "mobile" | "none";
  mobilePointerId: number | null;
  mobileOriginX: number;
  mobileOriginY: number;
  mobileThrottle: boolean;
  mobileAnchor: boolean;
  mobileSteer: number;
  wakeVisibilityBurstUntil: number;
};

type QualityState = {
  fps: number;
  pixelRatio: number;
  preset: QualityPreset;
  effectScale: number;
  wakeScale: number;
  forestUpdateInterval: number;
  postEnabled: boolean;
  frameAccumulator: number;
  frameCount: number;
  lastGovernAt: number;
  stableLowSamples: number;
  stableHighSamples: number;
  warmupUntil: number;
  minPixelRatio: number;
  fxVisibilityTest: boolean;
};

type DriveInput = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  boost: boolean;
  superBoost: boolean;
  anchor: boolean;
};

const CAMERA_PRESETS: CameraPreset[] = [
  {
    name: "Chase",
    distance: 46,
    height: 22,
    lookAhead: 24,
    lookHeight: 6.4,
  },
  {
    name: "Low Chase",
    distance: 38,
    height: 12.4,
    lookAhead: 56,
    lookHeight: 11.6,
  },
  {
    name: "High Map",
    distance: 64,
    height: 42,
    lookAhead: 9,
    lookHeight: 4.4,
  },
  {
    name: "OJ Mode",
    distance: 168,
    height: 108,
    lookAhead: 118,
    lookHeight: 34,
  },
  {
    name: "Vice City",
    distance: 218,
    height: 142,
    lookAhead: 166,
    lookHeight: 54,
  },
];

const SCENIC_CAMERA_PRESETS: ScenicCameraPreset[] = [
  {
    name: "Hero Profile Low",
    distance: 66,
    height: 12,
    lookAhead: 16,
    lookHeight: 7.4,
    yawOffset: -Math.PI * 0.48,
    lookPitch: 0.035,
    sideOffset: -10,
  },
  {
    name: "Helicopter Truth View",
    distance: 154,
    height: 76,
    lookAhead: 82,
    lookHeight: 18,
    yawOffset: Math.PI * 0.18,
    lookPitch: -0.055,
    sideOffset: -8,
  },
  {
    name: "Three-Quarter Boat Portrait",
    distance: 58,
    height: 19,
    lookAhead: 22,
    lookHeight: 8.8,
    yawOffset: -Math.PI * 0.28,
    lookPitch: 0.025,
    sideOffset: 5,
  },
  {
    name: "Cove / Environment Shot",
    distance: 118,
    height: 34,
    lookAhead: 34,
    lookHeight: 10,
    yawOffset: Math.PI * 0.72,
    lookPitch: -0.015,
    sideOffset: -18,
  },
];

export const webGLCanRun = () => {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl")),
    );
  } catch {
    return false;
  }
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const smoothstepNumber = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const approach = (value: number, target: number, amount: number) => {
  if (value < target) {
    return Math.min(target, value + amount);
  }

  return Math.max(target, value - amount);
};

const shortestAngleDelta = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

const getBoatForward = (heading: number) =>
  new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));

const getVisualRotationForHeading = (heading: number) => -heading;

const getHeadingFromVisualRotation = (rotationY: number) => -rotationY;

const getDestinationCenter = (key: "dock" | "sandbar" | "cove" | "island" | "reeds") =>
  LAKE_MAP.destinations.find((destination) => destination.key === key)?.center ?? {
    x: 0,
    z: 0,
  };

const createDefaultTableau = (): SavedTableau => ({
  boat: {
    x: BOAT_HOME.x,
    z: BOAT_HOME.z,
    yaw: 0,
  },
  cameraPresetIndex: 0,
  camera: {
    distance: CAMERA_PRESETS[0].distance,
    height: CAMERA_PRESETS[0].height,
    lookAhead: CAMERA_PRESETS[0].lookAhead,
    lookHeight: CAMERA_PRESETS[0].lookHeight,
  },
});

const isSavedTableau = (value: unknown): value is SavedTableau => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as SavedTableau;
  return (
    typeof candidate.boat?.x === "number" &&
    typeof candidate.boat?.z === "number" &&
    typeof candidate.boat?.yaw === "number" &&
    typeof candidate.cameraPresetIndex === "number" &&
    typeof candidate.camera?.distance === "number" &&
    typeof candidate.camera?.height === "number" &&
    typeof candidate.camera?.lookAhead === "number" &&
    typeof candidate.camera?.lookHeight === "number"
  );
};

const loadSavedTableau = () => {
  try {
    const raw = window.localStorage.getItem(TABLEAU_STORAGE_KEY);
    if (!raw) {
      return {
        tableau: createDefaultTableau(),
        hasSavedTableau: false,
      };
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isSavedTableau(parsed)) {
      throw new Error("Saved tableau was not in the expected format.");
    }

    parsed.cameraPresetIndex = clamp(
      Math.round(parsed.cameraPresetIndex),
      0,
      CAMERA_PRESETS.length - 1,
    );
    return {
      tableau: parsed,
      hasSavedTableau: true,
    };
  } catch {
    return {
      tableau: createDefaultTableau(),
      hasSavedTableau: false,
    };
  }
};

const saveTableau = (tableau: SavedTableau) => {
  window.localStorage.setItem(TABLEAU_STORAGE_KEY, JSON.stringify(tableau));
};

const loadScenicCameraPresetIndex = () => {
  try {
    const raw = window.localStorage.getItem(SCENIC_CAMERA_STORAGE_KEY);
    if (raw === null) {
      return -1;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return -1;
    }

    return clamp(Math.round(parsed), -1, SCENIC_CAMERA_PRESETS.length - 1);
  } catch {
    return -1;
  }
};

const saveScenicCameraPresetIndex = (index: number) => {
  try {
    window.localStorage.setItem(SCENIC_CAMERA_STORAGE_KEY, String(index));
  } catch {
    // Camera persistence is cosmetic; private storage must not break rendering.
  }
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
};

const toggleFullscreen = async (container: HTMLElement) => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }

  await container.requestFullscreen();
};

export const createHashlakeScene = ({
  container,
  onFirstFrame,
  onRecoverableError,
  weatherStore,
  eventBus,
}: HashlakeSceneOptions): HashlakeScene => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENARIO_PALETTES.Serene.skyTop);
  scene.fog = new THREE.FogExp2(SCENARIO_PALETTES.Serene.fogColor, 0.00058);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 2600);
  camera.position.copy(CAMERA_HOME);
  camera.lookAt(0, 6, 0);
  const cameraTarget = new THREE.Vector3(0, 6, 0);
  const desiredCameraPosition = new THREE.Vector3();
  const desiredCameraTarget = new THREE.Vector3();
  const tempForward = new THREE.Vector3();
  const tempSide = new THREE.Vector3();
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  const isMobileViewport =
    window.matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) < 720;
  const minPixelRatio = isMobileViewport
    ? QUALITY_MIN_MOBILE_PIXEL_RATIO
    : QUALITY_MIN_DESKTOP_PIXEL_RATIO;
  const initialPreset: QualityPreset = "Balanced";
  const initialPixelRatio = Math.max(
    minPixelRatio,
    Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[initialPreset].maxPixelRatio),
  );
  renderer.setClearColor(SCENARIO_PALETTES.Serene.skyTop, 1);
  renderer.setPixelRatio(initialPixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = "hashlake-canvas";
  renderer.domElement.setAttribute("aria-label", "Realtime Hashlake scene");
  container.append(renderer.domElement);
  const rendererCapabilities = detectRendererCapabilities(renderer);

  const sunlight = new THREE.DirectionalLight(SCENARIO_PALETTES.Serene.directionalLight, 3.6);
  sunlight.position.set(-36, 72, 45);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  scene.add(sunlight);
  const hemisphereLight = new THREE.HemisphereLight(
    SCENARIO_PALETTES.Serene.ambientLight,
    0x3f6f3d,
    1.35,
  );
  scene.add(hemisphereLight);

  const skyDome = createSkyDome();
  scene.add(skyDome.mesh);
  const water = createWater();
  scene.add(water.mesh);
  const shoreline = createShoreline();
  scene.add(shoreline);
  const terrainSystem = createTerrainSystem();
  scene.add(terrainSystem.group);
  const mountainExperimentSystem = createZone6MountainExperimentSystem();
  scene.add(mountainExperimentSystem.group);
  const forestSystem = createForestSystem();
  scene.add(forestSystem.group);
  const scenicAssetSystem = createScenicAssetSystem();
  scene.add(scenicAssetSystem.group);
  const horizonHaze = createHorizonHaze();
  scene.add(horizonHaze);
  scene.add(createDestinationMarkers());
  const sunDisc = createSunDisc();
  scene.add(sunDisc);
  const clouds = createClouds();
  scene.add(clouds);
  const postSystem = createPostSystem(container, renderer);

  const boat = createBoat();
  scene.add(boat);
  const savedTableau = loadSavedTableau();
  const clampedSavedBoat = clampBoatToWater(savedTableau.tableau.boat);
  if (clampedSavedBoat.hitBoundary) {
    savedTableau.tableau.boat.x = clampedSavedBoat.point.x;
    savedTableau.tableau.boat.z = clampedSavedBoat.point.z;
  }
  const driveState: DriveState = {
    mode: "Frame",
    x: savedTableau.tableau.boat.x,
    z: savedTableau.tableau.boat.z,
    yaw: savedTableau.tableau.boat.yaw,
    cameraYaw: savedTableau.tableau.boat.yaw,
    speed: 0,
    cameraPresetIndex: savedTableau.tableau.cameraPresetIndex,
    scenicCameraPresetIndex: loadScenicCameraPresetIndex(),
    scenicCameraLabelUntil: 0,
    scenicCameraManualLook: false,
    savedTableau: savedTableau.tableau,
    hasSavedTableau: savedTableau.hasSavedTableau,
    lookYaw: 0,
    lookPitch: 0,
    boatHop: 0,
    lastMode: "Frame",
    currentSteer: 0,
    accelerationForce: 0,
    throttleHoldTime: 0,
    wakePower: 0,
    throttleInput: 0,
    brakeInput: 0,
    boostActive: false,
    boostKick: 0,
    inputSource: "none",
    mobilePointerId: null,
    mobileOriginX: 0,
    mobileOriginY: 0,
    mobileThrottle: false,
    mobileAnchor: false,
    mobileSteer: 0,
    wakeVisibilityBurstUntil: 0,
  };
  boat.position.x = driveState.x;
  boat.position.z = driveState.z;
  boat.position.y = BOAT_HOME.y - BOAT_WATERLINE_SINK;
  boat.rotation.y = getVisualRotationForHeading(driveState.yaw);
  const input: DriveInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    boost: false,
    superBoost: false,
    anchor: false,
  };
  let lastFrameTime = window.performance.now();
  let isPointerLooking = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  const weatherEffects = createWeatherEffects();
  scene.add(weatherEffects.group);
  const wakeEffect = createWakeEffect();
  scene.add(wakeEffect.group);
  let lastForestUpdateAt = 0;
  const sceneEffects = createSceneEffects(
    eventBus,
    () => new THREE.Vector3(driveState.x, boat.position.y, driveState.z),
    (strength) => {
      driveState.boatHop = Math.min(2.35, Math.max(driveState.boatHop, strength));
    },
  );
  scene.add(sceneEffects.group);

  const status = createStatusPill();
  container.append(status);
  const driveHud = createDriveHud();
  container.append(driveHud);
  const driveSpeedometer = createDriveSpeedometer();
  container.append(driveSpeedometer);

  const startedAt = window.performance.now();
  const qualityState: QualityState = {
    fps: 60,
    pixelRatio: initialPixelRatio,
    preset: initialPreset,
    effectScale: QUALITY_PRESETS[initialPreset].effectScale,
    wakeScale: QUALITY_PRESETS[initialPreset].wakeScale,
    forestUpdateInterval: QUALITY_PRESETS[initialPreset].forestUpdateInterval,
    postEnabled: QUALITY_PRESETS[initialPreset].postEnabled,
    frameAccumulator: 0,
    frameCount: 0,
    lastGovernAt: startedAt,
    stableLowSamples: 0,
    stableHighSamples: 0,
    warmupUntil: startedAt + QUALITY_WARMUP_MS,
    minPixelRatio,
    fxVisibilityTest: false,
  };
  let animationId = 0;
  let hasRenderedFrame = false;
  let isRunning = false;
  let mountainTruthMode: MountainTruthMode = "native";

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    const width = Math.max(clientWidth, 1);
    const height = Math.max(clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    postSystem.resize();
  };

  const scheduleResize = () => {
    window.scrollTo(0, 0);
    resize();
    window.requestAnimationFrame(resize);
    window.setTimeout(resize, 80);
    window.setTimeout(resize, 320);
  };

  const getActiveWakeBlocks = () =>
    wakeEffect.segments.reduce((count, segment) => count + Number(segment.active), 0);

  const applyQualityPreset = (preset: QualityPreset, manual = false) => {
    const config = QUALITY_PRESETS[preset];
    qualityState.preset = preset;
    qualityState.effectScale = config.effectScale;
    qualityState.wakeScale = config.wakeScale;
    qualityState.forestUpdateInterval = config.forestUpdateInterval;
    qualityState.postEnabled = config.postEnabled;
    qualityState.stableLowSamples = 0;
    qualityState.stableHighSamples = 0;
    if (manual) {
      qualityState.warmupUntil = 0;
    }

    const deviceCap = Math.min(window.devicePixelRatio || 1, QUALITY_MAX_PIXEL_RATIO);
    const capped = Math.max(
      qualityState.minPixelRatio,
      Math.min(deviceCap, config.maxPixelRatio),
    );
    if (qualityState.pixelRatio > capped || manual) {
      qualityState.pixelRatio = capped;
      renderer.setPixelRatio(qualityState.pixelRatio);
    }
    sceneEffects.setQualityScale(qualityState.effectScale);
    sceneEffects.setVisibilityTest(qualityState.fxVisibilityTest);
    postSystem.setEnabled(qualityState.postEnabled);
    forestSystem.setQualityPreset(preset);
    scenicAssetSystem.setQualityPreset(preset);
    water.setQualityPreset(preset);
  };

  const getVisualModeTelemetry = (): VisualModeTelemetry => {
    const mountainHarness = mountainExperimentSystem.getTelemetry();
    const experimentMountainsVisible = false;
    const nativeMountainsVisible = mountainTruthMode === "native";
    const zoneProofActive = mountainTruthMode === "zone-proof";
    const activeMode = zoneProofActive ? "No Mountains / Zone Proof" : "Native Baseline";
    const mountainOwner = nativeMountainsVisible
      ? "terrainSystem restored native ridge baseline"
      : "none - zone proof";
    return {
      renderer: rendererCapabilities,
      activeMode,
      mountainOwner,
      nativeMountainsVisible,
      experimentMountainsVisible,
      zoneProofActive,
      mountainZone: mountainHarness.zoneLabel,
      mountainExperimentSlotReady: mountainHarness.experimentSlotReady,
      mountainExperimentAvailable: mountainHarness.experimentAvailable,
      mountainExperimentActive: experimentMountainsVisible,
      mountainExperimentReason: mountainHarness.reason,
      mountainExperimentVertices: mountainHarness.mountainVertices,
      mountainExperimentValid: mountainHarness.experimentValid,
      mountainBackArcValid: mountainHarness.backArcValid,
      mountainBackArcActive: mountainHarness.backArcActive,
      mountainSideFadeoutActive: mountainHarness.sideFadeoutActive,
      mountainInvalidVertexCount: mountainHarness.invalidVertexCount,
      mountainFoothillAnchor: mountainHarness.foothillAnchor,
      mountainBaseTouchesFoothill: mountainHarness.mountainBaseTouchesFoothill,
      mountainGrounded: mountainHarness.grounded,
      mountainFloatingGapDetected: mountainHarness.floatingGapDetected,
      mountainBottomSilhouetteValid: mountainHarness.bottomSilhouetteValid,
      mountainForestOcclusionValid: mountainHarness.forestOcclusionValid,
      mountainStageOrderValid: mountainHarness.stageOrderValid,
      mountainArtifactFree: mountainHarness.artifactFree,
      mountainCameraCheckValid: mountainHarness.cameraCheckValid,
      mountainLakeShoreOverlap: mountainHarness.lakeShoreOverlap,
      mountainSecondLakeArtifact: mountainHarness.secondLakeArtifact,
      mountainGlassPaneArtifact: mountainHarness.glassPaneArtifact,
      webGpuProbeActive: false,
      heavyScenicActive: false,
      waterMeshCount: 1,
    };
  };

  const applyMountainTruthMode = (nextMode: MountainTruthMode) => {
    mountainTruthMode = nextMode;
    mountainExperimentSystem.setActive(false);
    const telemetry = mountainExperimentSystem.getTelemetry();
    terrainSystem.setNativeMountainsSuppressed(mountainTruthMode !== "native");
    const zoneProofActive = mountainTruthMode === "zone-proof";
    const message = zoneProofActive
      ? NO_VALID_MOUNTAIN_EXPERIMENT_REASON
      : "Native baseline mountains active";
    showDriveHudMessage(
      driveHud,
      zoneProofActive ? "ZONE PROOF" : "NATIVE BASELINE",
    );
    eventBus.emit({
      type: "scenic",
      message,
    });
    window.dispatchEvent(
      new CustomEvent("hashlake:visual-mode-changed", {
        detail: {
          activeMode: zoneProofActive ? "No Mountains / Zone Proof" : "Native Baseline",
          mountainExperimentAvailable: telemetry.experimentAvailable,
          mountainExperimentValid: telemetry.experimentValid,
          mountainOwner: zoneProofActive
            ? "none - zone proof"
            : "terrainSystem restored native ridge baseline",
        },
      }),
    );
  };

  const cycleMountainTruthMode = () => {
    if (mountainTruthMode === "native") {
      applyMountainTruthMode("zone-proof");
      return;
    }
    applyMountainTruthMode("native");
  };

  const governQuality = (delta: number, now: number) => {
    qualityState.frameAccumulator += delta;
    qualityState.frameCount += 1;
    if (now - qualityState.lastGovernAt < QUALITY_GOVERNOR_INTERVAL) {
      return;
    }

    const fps =
      qualityState.frameCount / Math.max(qualityState.frameAccumulator, 0.001);
    qualityState.fps = fps;
    qualityState.frameAccumulator = 0;
    qualityState.frameCount = 0;
    qualityState.lastGovernAt = now;

    if (now < qualityState.warmupUntil) {
      return;
    }

    const deviceCap = Math.min(window.devicePixelRatio || 1, QUALITY_MAX_PIXEL_RATIO);
    const presetConfig = QUALITY_PRESETS[qualityState.preset];
    const targetCap = Math.max(
      qualityState.minPixelRatio,
      Math.min(deviceCap, presetConfig.maxPixelRatio),
    );
    let nextPixelRatio = Math.min(qualityState.pixelRatio, targetCap);

    const shouldReducePreset =
      (qualityState.preset === "Scenic" && fps < QUALITY_SCENIC_DOWNGRADE_FPS) ||
      (qualityState.preset !== "Scenic" && fps < QUALITY_BALANCED_DOWNGRADE_FPS);

    if (shouldReducePreset) {
      qualityState.stableLowSamples += 1;
      qualityState.stableHighSamples = 0;
    } else if (fps > QUALITY_TARGET_FPS + 8) {
      qualityState.stableHighSamples += 1;
      qualityState.stableLowSamples = 0;
    } else {
      qualityState.stableLowSamples = Math.max(0, qualityState.stableLowSamples - 1);
      qualityState.stableHighSamples = Math.max(0, qualityState.stableHighSamples - 1);
    }

    if (qualityState.stableLowSamples >= 4) {
      if (qualityState.preset === "Scenic") {
        applyQualityPreset("Balanced");
      } else if (qualityState.preset === "Balanced") {
        applyQualityPreset("Performance");
      } else if (nextPixelRatio > qualityState.minPixelRatio) {
        nextPixelRatio = Math.max(qualityState.minPixelRatio, nextPixelRatio - 0.08);
      }
    } else if (
      qualityState.stableHighSamples >= 4 &&
      qualityState.preset !== "Performance" &&
      nextPixelRatio < targetCap
    ) {
      nextPixelRatio = Math.min(targetCap, nextPixelRatio + 0.05);
    }

    if (Math.abs(nextPixelRatio - qualityState.pixelRatio) > 0.01) {
      qualityState.pixelRatio = nextPixelRatio;
      renderer.setPixelRatio(nextPixelRatio);
    }
  };

  applyQualityPreset(initialPreset);

  const render = () => {
    if (!isRunning) {
      return;
    }

    const now = window.performance.now();
    const elapsed = (now - startedAt) / 1000;
    const delta = Math.min(0.045, Math.max(0.001, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    governQuality(delta, now);
    const weather = weatherStore.getSnapshot();
    const scenicAssetStatuses = scenicAssetSystem.getStatuses();
    const scenicAssetsActive = qualityState.preset !== "Performance";
    terrainSystem.setScenicBackdropActive(
      scenicAssetsActive &&
        (scenicAssetStatuses.mountain === "loaded" ||
          scenicAssetStatuses.mountainAlpha === "loaded"),
    );
    terrainSystem.setNativeMountainsSuppressed(mountainTruthMode !== "native");
    forestSystem.setScenicTreelineActive(
      scenicAssetsActive && scenicAssetStatuses.treeline === "loaded",
    );
    updateDriveState(driveState, input, delta, weather);
    animateWater(water, elapsed, weather, driveState, camera);
    animateShoreline(shoreline, elapsed, weather);
    terrainSystem.update(weather, camera);
    mountainExperimentSystem.setActive(false);
    if (elapsed - lastForestUpdateAt >= qualityState.forestUpdateInterval) {
      forestSystem.update(elapsed, weather);
      lastForestUpdateAt = elapsed;
    }
    animateBoat(boat, elapsed, weather, driveState);
    animateWakeEffect(
      wakeEffect,
      driveState,
      elapsed,
      delta,
      qualityState.wakeScale,
      qualityState.fxVisibilityTest,
      now < driveState.wakeVisibilityBurstUntil,
    );
    animateWeatherEffects(weatherEffects, elapsed, weather);
    sceneEffects.update(delta);
    applyWeatherToScene({
      scene,
      camera,
      sunlight,
      hemisphereLight,
      skyDome,
      horizonHaze,
      water,
      sunDisc,
      clouds,
      weather,
      elapsed,
      driveState,
      cameraTarget,
      desiredCameraPosition,
      desiredCameraTarget,
      tempForward,
      tempSide,
    });
    postSystem.update(weather, elapsed);
    animateStatus(status, elapsed);
    animateDriveHud(driveHud, driveState, now);
    animateDriveSpeedometer(driveSpeedometer, driveState);
    renderer.render(scene, camera);

    if (!hasRenderedFrame) {
      hasRenderedFrame = true;
      onFirstFrame();
    }

    animationId = window.requestAnimationFrame(render);
  };

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    onRecoverableError(
      "The graphics context was interrupted. The fallback lake will stay visible until the browser recovers.",
    );
  };

  const handleContextRestored = () => {
    hasRenderedFrame = false;
    onRecoverableError("The graphics context recovered. Restarting the lake renderer...");
  };

  const toggleDriveMode = () => {
    driveState.mode = driveState.mode === "Drive" ? "Frame" : "Drive";
    driveState.speed = 0;
    driveState.throttleHoldTime = 0;
    driveState.wakePower = 0;
    driveState.throttleInput = 0;
    driveState.brakeInput = 0;
    driveState.boostActive = false;
    driveState.boostKick = 0;
    driveState.inputSource = "none";
    driveState.cameraYaw = driveState.yaw;
    driveState.mobilePointerId = null;
    driveState.mobileThrottle = false;
    driveState.mobileAnchor = false;
    driveState.mobileSteer = 0;
    driveState.lookYaw = 0;
    driveState.lookPitch = 0;
    showDriveHud(driveHud, driveState.mode);
  };

  const resetView = () => {
    if (driveState.mode === "Drive") {
      driveState.cameraPresetIndex = 0;
      camera.position.copy(getDriveCameraPosition(driveState, CAMERA_PRESETS[0]));
      return;
    }

    driveState.x = driveState.savedTableau.boat.x;
    driveState.z = driveState.savedTableau.boat.z;
    driveState.yaw = driveState.savedTableau.boat.yaw;
    driveState.cameraYaw = driveState.yaw;
    driveState.speed = 0;
    driveState.throttleHoldTime = 0;
    driveState.wakePower = 0;
    driveState.throttleInput = 0;
    driveState.brakeInput = 0;
    driveState.boostActive = false;
    driveState.boostKick = 0;
    driveState.inputSource = "none";
    driveState.mobilePointerId = null;
    driveState.mobileThrottle = false;
    driveState.mobileAnchor = false;
    driveState.mobileSteer = 0;
    driveState.lookYaw = 0;
    driveState.lookPitch = 0;
    driveState.scenicCameraManualLook = false;
    driveState.cameraPresetIndex = driveState.savedTableau.cameraPresetIndex;
  };

  const cycleFrameCameraPreset = () => {
    driveState.scenicCameraPresetIndex =
      driveState.scenicCameraPresetIndex >= SCENIC_CAMERA_PRESETS.length - 1
        ? -1
        : driveState.scenicCameraPresetIndex + 1;
    driveState.lookYaw = 0;
    driveState.lookPitch = 0;
    driveState.scenicCameraManualLook = false;
    driveState.scenicCameraLabelUntil = window.performance.now() + 2600;
    saveScenicCameraPresetIndex(driveState.scenicCameraPresetIndex);
    showDriveHud(driveHud, "Frame");
  };

  const saveCurrentTableau = () => {
    const preset = CAMERA_PRESETS[driveState.cameraPresetIndex];
    const tableau: SavedTableau = {
      boat: {
        x: driveState.x,
        z: driveState.z,
        yaw: driveState.yaw,
      },
      cameraPresetIndex: driveState.cameraPresetIndex,
      camera: {
        distance: preset.distance,
        height: preset.height,
        lookAhead: preset.lookAhead,
        lookHeight: preset.lookHeight,
      },
    };
    saveTableau(tableau);
    driveState.savedTableau = tableau;
    driveState.hasSavedTableau = true;
    driveState.mode = "Frame";
    driveState.speed = 0;
    driveState.throttleHoldTime = 0;
    driveState.wakePower = 0;
    driveState.throttleInput = 0;
    driveState.brakeInput = 0;
    driveState.boostActive = false;
    driveState.boostKick = 0;
    driveState.inputSource = "none";
    driveState.mobilePointerId = null;
    driveState.mobileThrottle = false;
    driveState.mobileAnchor = false;
    driveState.mobileSteer = 0;
    driveState.lookYaw = 0;
    driveState.lookPitch = 0;
    driveState.scenicCameraManualLook = false;
    driveState.scenicCameraPresetIndex = -1;
    saveScenicCameraPresetIndex(-1);
    showDriveHud(driveHud, "Frame");
  };

  const handleKey = (event: KeyboardEvent, isDown: boolean) => {
    if (isEditableTarget(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (isDown && key === "x") {
      event.preventDefault();
      toggleDriveMode();
      return;
    }

    if (isDown && key === "r") {
      event.preventDefault();
      resetView();
      return;
    }

    if (isDown && key === "c") {
      event.preventDefault();
      if (driveState.mode === "Drive") {
        driveState.cameraPresetIndex =
          (driveState.cameraPresetIndex + 1) % CAMERA_PRESETS.length;
      } else {
        cycleFrameCameraPreset();
      }
      return;
    }

    if (isDown && key === "f") {
      event.preventDefault();
      void toggleFullscreen(container);
      return;
    }

    if (isDown && key === "v") {
      event.preventDefault();
      cycleMountainTruthMode();
      return;
    }

    if (isDown && key === "enter" && driveState.mode === "Drive") {
      event.preventDefault();
      saveCurrentTableau();
      return;
    }

    if (isDown && key === "escape" && driveState.mode === "Drive") {
      event.preventDefault();
      driveState.mode = "Frame";
      driveState.speed = 0;
      driveState.throttleHoldTime = 0;
      driveState.wakePower = 0;
      driveState.throttleInput = 0;
      driveState.brakeInput = 0;
      driveState.boostActive = false;
      driveState.boostKick = 0;
      driveState.inputSource = "none";
      driveState.mobilePointerId = null;
      driveState.mobileThrottle = false;
      driveState.mobileAnchor = false;
      driveState.mobileSteer = 0;
      showDriveHud(driveHud, "Frame");
      Object.keys(input).forEach((name) => {
        input[name as keyof DriveInput] = false;
      });
      return;
    }

    if (isDown && key === "escape") {
      event.preventDefault();
      driveState.scenicCameraPresetIndex = -1;
      driveState.lookYaw = 0;
      driveState.lookPitch = 0;
      driveState.scenicCameraManualLook = false;
      driveState.scenicCameraLabelUntil = window.performance.now() + 2200;
      saveScenicCameraPresetIndex(-1);
      showDriveHud(driveHud, "Frame");
      return;
    }

    if (key === "arrowup") {
      event.preventDefault();
      input.forward = isDown;
    } else if (key === "arrowdown") {
      event.preventDefault();
      input.backward = isDown;
    } else if (key === "arrowleft") {
      event.preventDefault();
      input.left = isDown;
    } else if (key === "arrowright") {
      event.preventDefault();
      input.right = isDown;
    } else if (key === "shift") {
      event.preventDefault();
      input.boost = isDown;
    } else if (key === "control") {
      event.preventDefault();
      input.superBoost = isDown;
    } else if (key === " ") {
      event.preventDefault();
      input.anchor = isDown;
    }
  };
  const handleKeydown = (event: KeyboardEvent) => handleKey(event, true);
  const handleKeyup = (event: KeyboardEvent) => handleKey(event, false);
  const handleNativeMountainCompareEvent = () => cycleMountainTruthMode();

  const clearMobileDriveTouch = () => {
    driveState.mobilePointerId = null;
    driveState.mobileThrottle = false;
    driveState.mobileAnchor = false;
    driveState.mobileSteer = 0;
    driveState.throttleInput = 0;
    driveState.brakeInput = 0;
    driveState.boostActive = false;
    driveState.boostKick = 0;
    driveState.inputSource = "none";
  };

  const setMobileDriveTouch = (event: PointerEvent) => {
    const bounds = renderer.domElement.getBoundingClientRect();
    const localX = clamp((event.clientX - bounds.left) / Math.max(1, bounds.width), 0, 1);
    const localY = clamp((event.clientY - bounds.top) / Math.max(1, bounds.height), 0, 1);
    const dragX = event.clientX - driveState.mobileOriginX;
    const dragY = driveState.mobileOriginY - event.clientY;
    const upwardIntent = clamp((0.86 - localY) / 0.42 + Math.max(0, dragY) / 140, 0, 1);
    const brakeIntent = clamp((localY - 0.62) / 0.28 + Math.max(0, -dragY) / 120, 0, 1);
    const horizontalIntent = clamp(dragX / 132 + (localX - 0.5) * 0.72, -1, 1);
    const deadzonedSteer = Math.abs(horizontalIntent) < 0.12 ? 0 : horizontalIntent;

    driveState.throttleInput = brakeIntent > 0.25 ? 0 : upwardIntent;
    driveState.brakeInput = brakeIntent;
    driveState.inputSource = "mobile";
    driveState.mobileThrottle = driveState.throttleInput > 0.1;
    driveState.mobileAnchor = localY > 0.92 && Math.abs(dragY) < 12;
    driveState.mobileSteer = deadzonedSteer;
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button > 0) {
      return;
    }

    if (driveState.mode === "Drive") {
      event.preventDefault();
      isPointerLooking = false;
      driveState.mobilePointerId = event.pointerId;
      driveState.mobileOriginX = event.clientX;
      driveState.mobileOriginY = event.clientY;
      setMobileDriveTouch(event);
      renderer.domElement.setPointerCapture(event.pointerId);
      return;
    }

    isPointerLooking = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (driveState.mode === "Drive") {
      event.preventDefault();
      if (driveState.mobilePointerId === event.pointerId) {
        setMobileDriveTouch(event);
      }
      return;
    }

    if (!isPointerLooking || driveState.mode !== "Frame") {
      return;
    }

    const deltaX = event.clientX - lastPointerX;
    const deltaY = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    driveState.lookYaw = clamp(driveState.lookYaw - deltaX * 0.0025, -0.48, 0.48);
    driveState.lookPitch = clamp(driveState.lookPitch + deltaY * 0.002, -0.22, 0.22);
    driveState.scenicCameraManualLook = true;
    driveState.scenicCameraLabelUntil = window.performance.now() + 1800;
  };

  const handlePointerUp = (event: PointerEvent) => {
    isPointerLooking = false;
    if (driveState.mode === "Drive" && driveState.mobilePointerId === event.pointerId) {
      clearMobileDriveTouch();
    }
    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
  };

  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
  renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored);
  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("pointerup", handlePointerUp);
  renderer.domElement.addEventListener("pointercancel", handlePointerUp);
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("keyup", handleKeyup);
  window.addEventListener("hashlake:toggle-native-mountain-compare", handleNativeMountainCompareEvent);
  window.addEventListener("resize", scheduleResize);
  window.addEventListener("orientationchange", scheduleResize);
  window.addEventListener("pageshow", scheduleResize);
  window.visualViewport?.addEventListener("resize", scheduleResize);
  scheduleResize();

  return {
    start: () => {
      if (isRunning) {
        return;
      }

      isRunning = true;
      render();
    },
    stop: () => {
      isRunning = false;
      window.cancelAnimationFrame(animationId);
      window.removeEventListener("resize", scheduleResize);
      window.removeEventListener("orientationchange", scheduleResize);
      window.removeEventListener("pageshow", scheduleResize);
      window.visualViewport?.removeEventListener("resize", scheduleResize);
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("keyup", handleKeyup);
      window.removeEventListener("hashlake:toggle-native-mountain-compare", handleNativeMountainCompareEvent);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      status.remove();
      driveHud.remove();
      driveSpeedometer.remove();
      document.body.classList.remove("hashlake-drive-active");
      postSystem.dispose();
      sceneEffects.dispose();
      renderer.dispose();
    },
    getTelemetry: () => ({
      ...(() => {
        const effectStats = sceneEffects.getStats();
        const forestStats = forestSystem.getStats();
        const terrainStats = terrainSystem.getStats();
        return {
          mode: driveState.mode,
          speed: driveState.speed,
          position: {
            x: driveState.x,
            z: driveState.z,
          },
          heading: driveState.yaw,
          visualHeading: getHeadingFromVisualRotation(boat.rotation.y),
          cameraHeading: driveState.yaw,
          movementVector: {
            x: Math.cos(driveState.yaw) * driveState.speed,
            z: Math.sin(driveState.yaw) * driveState.speed,
          },
          steerInput: driveState.currentSteer,
          throttleInput: driveState.throttleInput,
          brakeInput: driveState.brakeInput,
          boostActive: driveState.boostActive,
          inputSource: driveState.inputSource,
          worldRotationLocked:
            Math.abs(scene.rotation.x) < 0.0001 &&
            Math.abs(scene.rotation.y) < 0.0001 &&
            Math.abs(scene.rotation.z) < 0.0001,
          headingWarning:
            Math.abs(
              shortestAngleDelta(driveState.yaw, getHeadingFromVisualRotation(boat.rotation.y)),
            ) > 0.02,
          cameraWarning: false,
          cameraPreset:
            driveState.mode === "Drive"
              ? CAMERA_PRESETS[driveState.cameraPresetIndex].name
              : getFrameCameraLabel(driveState),
          nearestLocation: getNearestLocation({
            x: driveState.x,
            z: driveState.z,
          }).destination.label,
          savedTableau: driveState.hasSavedTableau,
          fps: qualityState.fps,
          frameTimeMs: 1000 / Math.max(qualityState.fps, 0.001),
          qualityPreset: qualityState.preset,
          pixelRatio: qualityState.pixelRatio,
          renderScale: qualityState.effectScale,
          visualMode: getVisualModeTelemetry(),
          activeWakeBlocks: getActiveWakeBlocks(),
          activeEffectBlocks: effectStats.splashBlocks,
          activeRings: effectStats.rings,
          activeSplashes: effectStats.splashes,
          lastSplashDistanceToBoat: effectStats.lastSplashDistanceToBoat,
          lastBoatImpulseStrength: effectStats.lastBoatImpulseStrength,
          treeInstances: forestStats.treeInstances,
          nativeTreeInstances: forestStats.nativeTreeInstances,
          instancedTreeInstances: forestStats.instancedTreeInstances,
          individualTreeInstances: forestStats.individualTreeInstances,
          treeTypeCounts: forestStats.treeTypeCounts,
          treePlacementValidCandidates: forestStats.treePlacementValidCandidates,
          rejectedTreeCandidates: forestStats.rejectedTreeCandidates,
          ungroundedTreeInstances: forestStats.ungroundedTreeInstances,
          mountainOverlappedTreeInstances: forestStats.mountainOverlappedTreeInstances,
          treeAlphaInstances: forestStats.treeAlphaInstances,
          treeAlphaAssets: forestStats.treeAlphaAssets,
          forestBandInstances: forestStats.forestBandInstances,
          forestBandMethod: forestStats.forestBandMethod,
          reedInstances: forestStats.reedInstances,
          rockInstances: forestStats.rockInstances,
          mountainVertices: terrainStats.mountainVertices,
          groundBandCount: Number(shoreline.userData.groundBandCount ?? 0),
          groundRibbonValid: Boolean(shoreline.userData.groundRibbonValid),
          groundBadBandSegments: Number(shoreline.userData.groundBadBandSegments ?? 0),
          groundContourLocked: Boolean(shoreline.userData.groundContourLocked),
          groundFlippedBands: Number(shoreline.userData.groundFlippedBands ?? 0),
          groundDownwardTriangles: Number(shoreline.userData.groundDownwardTriangles ?? 0),
          zoneBandTableVersion: String(shoreline.userData.zoneBandTableVersion ?? "unknown"),
          postEnabled: postSystem.enabled && terrainStats.postEnabled,
          reflectionEnabled: water.reflectionEnabled || terrainStats.reflectionEnabled,
          scenicAssets: scenicAssetSystem.getStatuses(),
        };
      })(),
    }),
    toggleDriveMode,
  };
};

type SkyDome = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
};

const createSkyDome = (): SkyDome => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(SCENARIO_PALETTES.Serene.skyTop) },
      horizonColor: { value: new THREE.Color(SCENARIO_PALETTES.Serene.skyHorizon) },
      fireColor: { value: new THREE.Color(0x5b160f) },
      sunDir: { value: new THREE.Vector3(-0.36, 0.72, -0.44).normalize() },
      dark: { value: 0 },
      fog: { value: 0 },
      fire: { value: 0 },
      stale: { value: 0 },
      flash: { value: 0 },
      time: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 fireColor;
      uniform vec3 sunDir;
      uniform float dark;
      uniform float fog;
      uniform float fire;
      uniform float stale;
      uniform float flash;
      uniform float time;
      varying vec3 vWorldPosition;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 5; i++) {
          value += noise(p) * amplitude;
          p = p * 2.03 + 17.7;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec3 direction = normalize(vWorldPosition);
        float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
        float horizon = pow(1.0 - clamp(direction.y, 0.0, 1.0), 3.0);
        float toSun = max(dot(normalize(vec3(direction.x, 0.0, direction.z) + 0.0001), normalize(vec3(sunDir.x, 0.0, sunDir.z) + 0.0001)), 0.0);
        vec3 zen = mix(topColor * 0.86, topColor * 1.12, 1.0 - dark);
        vec3 hor = mix(horizonColor, vec3(1.0, 0.58, 0.34), toSun * toSun * 0.18 * (1.0 - dark));
        vec3 color = mix(zen, hor, horizon);

        vec3 stormColor = mix(vec3(0.085, 0.098, 0.118), vec3(0.150, 0.163, 0.180), horizon);
        color = mix(color, stormColor, dark);

        float sunDot = max(dot(direction, sunDir), 0.0);
        float disc = smoothstep(0.9992, 0.99965, sunDot);
        float glow = pow(sunDot, 28.0) * 0.14 + pow(sunDot, 180.0) * 0.7;
        color += vec3(1.0, 0.88, 0.62) * (disc * 2.6 + glow) * (1.0 - dark * 0.92);

        float bend = max(direction.y + 0.14, 0.06);
        vec2 cloudUv = direction.xz / bend * 1.55 + vec2(time * 0.0065, time * 0.0026);
        float cloudNoise = fbm(cloudUv * 0.8 + fbm(cloudUv * 1.6) * 0.7);
        float coverage = mix(0.66, 0.19, dark) - stale * 0.05;
        float cloudMask = smoothstep(coverage, coverage + 0.24, cloudNoise) * smoothstep(0.0, 0.12, direction.y);
        float cloudShade = fbm(cloudUv * 2.3 + 41.0);
        vec3 cloudLit = vec3(0.78, 0.83, 0.82) * (0.90 + toSun * 0.08);
        vec3 cloudDark = mix(vec3(0.50, 0.56, 0.65), vec3(0.12, 0.13, 0.15), dark);
        vec3 cloudColor = mix(cloudLit, cloudDark, clamp(cloudShade + dark * 0.55, 0.0, 1.0));
        color = mix(color, cloudColor, cloudMask);

        color = mix(color, fireColor * (0.8 + 0.2 * sin(time * 6.0)), fire * horizon * 0.88);
        color = mix(color, hor, clamp(fog + stale * 0.55, 0.0, 1.0) * horizon * 0.7);
        color += vec3(0.85, 0.92, 1.1) * flash;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1120, 48, 24), material);
  mesh.name = "Hashlake atmospheric sky dome";
  mesh.renderOrder = -20;
  return { mesh };
};

const createSpeedboatHullGeometry = () => {
  const geometry = new THREE.BoxGeometry(14.4, 1.86, 3.32, 22, 4, 5);
  const positions = geometry.attributes.position as THREE.BufferAttribute;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const t = (x + 7.2) / 14.4;
    const bowT = smoothstepNumber(0.50, 1, t);
    const sternT = 1 - smoothstepNumber(0, 0.16, t);
    const lower = smoothstepNumber(0.12, -0.95, y);
    const center = 1 - Math.min(1, Math.abs(z) / 1.66);
    const widthFactor = Math.max(0.045, 1 - bowT * 0.96 - sternT * 0.07);
    const chineFactor = 1 - lower * (0.38 + bowT * 0.18);
    const bowLift = Math.sin(Math.max(0, t - 0.56) / 0.44 * Math.PI * 0.5) * 0.40;
    const keelDrop = lower * center * (0.66 + bowT * 0.24);
    positions.setXYZ(
      index,
      x,
      y + bowLift - keelDrop,
      z * widthFactor * chineFactor,
    );
  }

  geometry.computeVertexNormals();
  return geometry;
};

const createBoat = () => {
  const boat = new THREE.Group();
  boat.name = "Classic wooden speedboat";
  boat.position.copy(BOAT_HOME);
  boat.scale.setScalar(0.82);

  const hullMaterial = makeTexturedStandardMaterial({
    kind: "wood",
    seed: 701,
    size: 128,
    base: 0x884523,
    accent: 0xd18440,
    dark: 0x35170a,
    color: 0xa15c30,
    roughness: 0.34,
    metalness: 0.03,
    emissive: 0x1d0a04,
    emissiveIntensity: 0.06,
  });
  const trimMaterial = makeTexturedStandardMaterial({
    kind: "wood",
    seed: 707,
    size: 128,
    base: 0xb87b46,
    accent: 0xf0bc77,
    dark: 0x61391a,
    color: 0xd19958,
    roughness: 0.30,
    metalness: 0.02,
  });
  const deckMaterial = makeTexturedStandardMaterial({
    kind: "wood",
    seed: 713,
    size: 128,
    base: 0xaa622f,
    accent: 0xeda75c,
    dark: 0x4a210e,
    color: 0xd28a47,
    roughness: 0.28,
    metalness: 0.02,
    emissive: 0x150805,
    emissiveIntensity: 0.04,
  });
  const darkTrimMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f160c,
    roughness: 0.44,
  });
  const creamMaterial = new THREE.MeshStandardMaterial({
    color: 0xf3dba5,
    roughness: 0.36,
  });
  const chromeMaterial = new THREE.MeshStandardMaterial({
    color: 0xdbe5df,
    roughness: 0.18,
    metalness: 0.46,
  });
  const motorMaterial = new THREE.MeshStandardMaterial({
    color: 0x151b1e,
    roughness: 0.62,
    metalness: 0.16,
  });
  const windshieldMaterial = new THREE.MeshStandardMaterial({
    color: 0xbce8f2,
    roughness: 0.14,
    metalness: 0.02,
    transparent: true,
    opacity: 0.62,
  });
  const jacketMaterial = new THREE.MeshStandardMaterial({
    color: 0x26353a,
    roughness: 0.82,
  });
  const hatMaterial = new THREE.MeshStandardMaterial({
    color: 0xb68a45,
    roughness: 0.82,
  });
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: 0xc58f65,
    roughness: 0.7,
  });

  const hull = new THREE.Mesh(applyPlanarUvs(createSpeedboatHullGeometry(), 7.4), hullMaterial);
  hull.castShadow = true;
  boat.add(hull);

  for (const side of [-1, 1]) {
    const rubRail = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.17, 0.14), darkTrimMaterial);
    rubRail.position.set(-0.62, 0.84, side * 1.64);
    rubRail.rotation.x = side * -0.06;
    rubRail.castShadow = true;
    boat.add(rubRail);

    const waterline = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.10, 0.09), darkTrimMaterial);
    waterline.name = "Hull waterline cue";
    waterline.position.set(-0.90, -0.34, side * 1.38);
    waterline.rotation.x = side * -0.10;
    waterline.castShadow = false;
    boat.add(waterline);
  }

  const bowDeck = new THREE.Mesh(new THREE.ConeGeometry(1.30, 6.15, 4), deckMaterial);
  bowDeck.rotation.set(0, Math.PI / 4, Math.PI / 2);
  bowDeck.position.set(4.98, 1.12, 0);
  bowDeck.scale.set(1.0, 0.22, 0.66);
  bowDeck.castShadow = true;
  boat.add(bowDeck);

  const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.34, 2.70), deckMaterial);
  rearDeck.position.set(-4.54, 1.06, 0);
  rearDeck.castShadow = true;
  boat.add(rearDeck);

  const centerDeck = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.28, 2.62), deckMaterial);
  centerDeck.position.set(-0.64, 1.05, 0);
  centerDeck.castShadow = true;
  boat.add(centerDeck);

  const stern = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.46, 2.96), darkTrimMaterial);
  stern.position.set(-7.06, 0.08, 0);
  stern.castShadow = true;
  boat.add(stern);

  for (let index = 0; index < 7; index += 1) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.045, 0.045), creamMaterial);
    stripe.position.set(0.04, 1.235 + index * 0.004, -1.02 + index * 0.34);
    stripe.castShadow = false;
    boat.add(stripe);
  }

  const centerSeam = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.055, 0.07), darkTrimMaterial);
  centerSeam.position.set(0.30, 1.28, 0);
  centerSeam.castShadow = false;
  boat.add(centerSeam);

  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.64, 1.8), darkTrimMaterial);
  cockpit.position.set(0.42, 1.45, 0);
  cockpit.castShadow = true;
  boat.add(cockpit);

  const cockpitInset = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.26, 1.28), motorMaterial);
  cockpitInset.position.set(0.28, 1.76, 0);
  cockpitInset.castShadow = true;
  boat.add(cockpitInset);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 2.15), windshieldMaterial);
  windshield.position.set(2.18, 1.90, 0);
  windshield.rotation.z = -0.24;
  boat.add(windshield);

  const windshieldCap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.10, 2.34), chromeMaterial);
  windshieldCap.position.set(2.14, 2.28, 0);
  windshieldCap.rotation.z = -0.24;
  boat.add(windshieldCap);

  const motor = new THREE.Mesh(new THREE.BoxGeometry(1.04, 1.64, 1.08), motorMaterial);
  motor.position.set(-7.68, 0.10, 0);
  motor.castShadow = true;
  boat.add(motor);

  const motorCap = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.46, 0.84), chromeMaterial);
  motorCap.position.set(-8.24, 0.70, 0);
  motorCap.castShadow = true;
  boat.add(motorCap);

  const propGuard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 1.46), motorMaterial);
  propGuard.position.set(-8.62, -0.38, 0);
  propGuard.castShadow = true;
  boat.add(propGuard);

  const benchA = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.22, 2.22), trimMaterial);
  benchA.position.set(-1.72, 1.58, 0);
  benchA.castShadow = true;
  boat.add(benchA);

  const benchB = benchA.clone();
  benchB.position.x = 1.12;
  boat.add(benchB);

  for (const side of [-1, 1]) {
    const sidePlank = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.060, 0.052), creamMaterial);
    sidePlank.position.set(-0.10, 1.17, side * 1.18);
    sidePlank.castShadow = false;
    boat.add(sidePlank);
  }

  const bowLight = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.36), chromeMaterial);
  bowLight.position.set(7.28, 1.02, 0);
  bowLight.castShadow = true;
  boat.add(bowLight);

  const sternPlate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 1.94), chromeMaterial);
  sternPlate.position.set(-7.30, 0.72, 0);
  sternPlate.castShadow = true;
  boat.add(sternPlate);

  const passenger = new THREE.Group();
  passenger.name = "Forward-facing seated passenger";
  passenger.position.set(-0.34, 1.74, 0);
  passenger.rotation.z = -0.04;
  boat.add(passenger);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.82, 4, 8), jacketMaterial);
  torso.name = "Seated passenger torso";
  torso.position.set(0.06, 0.68, 0);
  torso.rotation.z = -0.18;
  torso.castShadow = true;
  passenger.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), skinMaterial);
  head.name = "Passenger forward-facing head";
  head.position.set(0.42, 1.30, 0);
  head.castShadow = true;
  passenger.add(head);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 8), skinMaterial);
  nose.name = "Passenger nose direction cue";
  nose.position.set(0.72, 1.30, 0);
  nose.rotation.z = -Math.PI / 2;
  nose.castShadow = true;
  passenger.add(nose);

  const conicalHat = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.30, 24), hatMaterial);
  conicalHat.name = "Chinese conical passenger hat";
  conicalHat.position.set(0.42, 1.66, 0);
  conicalHat.rotation.z = -0.06;
  conicalHat.scale.y = 0.72;
  conicalHat.castShadow = true;
  passenger.add(conicalHat);

  const hatRim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.018, 6, 24), hatMaterial);
  hatRim.name = "Conical hat low rim";
  hatRim.position.set(0.42, 1.55, 0);
  hatRim.rotation.x = Math.PI / 2;
  hatRim.rotation.z = -0.06;
  passenger.add(hatRim);

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.54, 4, 6), jacketMaterial);
    arm.name = "Passenger forward arm";
    arm.position.set(0.36, 0.82, side * 0.36);
    arm.rotation.set(0.16, 0.42, side * 0.52);
    arm.castShadow = true;
    passenger.add(arm);
  }

  return boat;
};

const updateDriveState = (
  driveState: DriveState,
  input: DriveInput,
  delta: number,
  weather: WeatherSnapshot,
) => {
  if (driveState.mode !== "Drive") {
    driveState.speed = approach(driveState.speed, 0, DRIVE_ANCHOR_BRAKE_FORCE * delta);
    driveState.currentSteer +=
      (0 - driveState.currentSteer) * Math.min(1, delta * DRIVE_STEER_EASE_OUT);
    driveState.throttleHoldTime = 0;
    driveState.wakePower += (0 - driveState.wakePower) * Math.min(1, delta * 2.8);
    driveState.mobilePointerId = null;
    driveState.mobileThrottle = false;
    driveState.mobileAnchor = false;
    driveState.mobileSteer = 0;
    driveState.throttleInput = 0;
    driveState.brakeInput = 0;
    driveState.boostActive = false;
    driveState.boostKick = 0;
    driveState.inputSource = "none";
    return;
  }

  const stormDrag = weather.dials.boatInstability * 8;
  const superBoostActive = input.boost && input.superBoost && input.forward;
  const maxForwardSpeed = input.boost
    ? superBoostActive
      ? DRIVE_SUPER_BOOST_MAX_SPEED
      : DRIVE_BOOST_MAX_SPEED
    : DRIVE_MAX_SPEED;
  const previousSpeed = driveState.speed;

  const keyboardSteer = Number(input.right) - Number(input.left);
  const mobileSteer = driveState.mobileSteer;
  const targetSteer = clamp(keyboardSteer + mobileSteer, -1, 1) * DRIVE_STEER_SENSITIVITY;
  const desktopThrottle = input.forward ? 1 : 0;
  const desktopBrake = input.backward ? 1 : 0;
  const mobileThrottle = driveState.mobileThrottle ? driveState.throttleInput : 0;
  const mobileBrake = driveState.inputSource === "mobile" ? driveState.brakeInput : 0;
  const throttleAmount = clamp(Math.max(desktopThrottle, mobileThrottle), 0, 1);
  const brakeAmount = clamp(Math.max(desktopBrake, mobileBrake), 0, 1);
  const throttleActive = throttleAmount > 0.05;
  const brakeActive = brakeAmount > 0.05;
  const anchorActive = input.anchor || driveState.mobileAnchor;
  const boostJustPressed = input.boost && !driveState.boostActive;
  const hasDesktopInput =
    input.forward || input.backward || input.left || input.right || input.boost || input.anchor;
  driveState.throttleInput = throttleAmount;
  driveState.brakeInput = brakeAmount;
  driveState.inputSource = hasDesktopInput ? "desktop" : driveState.mobilePointerId === null ? "none" : "mobile";

  if (throttleActive) {
    driveState.throttleHoldTime = Math.min(2.2, driveState.throttleHoldTime + delta * 1.08);
  } else {
    driveState.throttleHoldTime = Math.max(0, driveState.throttleHoldTime - delta * 1.8);
  }

  const throttleRamp = clamp(driveState.throttleHoldTime / 1.44, 0, 1);
  const wakeTarget = clamp(
    throttleRamp * 0.82 +
      Math.abs(driveState.speed) / DRIVE_BOOST_MAX_SPEED * 0.34 +
      (input.boost ? 0.32 : 0) +
      (superBoostActive ? 0.12 : 0),
    0,
    superBoostActive ? 1.48 : input.boost ? 1.34 : 1.04,
  );
  driveState.wakePower += (wakeTarget - driveState.wakePower) * Math.min(1, delta * 4.4);

  if (throttleActive) {
    if (boostJustPressed && driveState.speed > 8) {
      driveState.speed = Math.min(
        maxForwardSpeed,
        driveState.speed + (superBoostActive ? DRIVE_SUPER_BOOST_IMPULSE : DRIVE_BOOST_IMPULSE),
      );
      driveState.wakePower = Math.min(1.32, driveState.wakePower + 0.36);
      driveState.boostKick = 1;
    }
    const acceleration =
      (DRIVE_ACCELERATION_BASE + DRIVE_ACCELERATION_RAMP * throttleRamp) *
      (superBoostActive ? DRIVE_SUPER_BOOST_MULTIPLIER : input.boost ? DRIVE_BOOST_MULTIPLIER : 1);
    driveState.speed += acceleration * throttleAmount * delta;
  }
  driveState.boostActive = input.boost;

  if (anchorActive) {
    driveState.speed = approach(driveState.speed, 0, DRIVE_ANCHOR_BRAKE_FORCE * delta);
    driveState.wakePower *= Math.pow(0.22, delta);
  } else if (brakeActive) {
    if (driveState.speed > DRIVE_REVERSE_DELAY_THRESHOLD) {
      driveState.speed = approach(driveState.speed, 0, DRIVE_ACTIVE_BRAKE_FORCE * brakeAmount * delta);
    } else {
      driveState.speed -= DRIVE_ACCELERATION_BASE * 0.62 * brakeAmount * delta;
    }
  } else if (!throttleActive) {
    if (driveState.speed > 0) {
      driveState.speed = approach(
        driveState.speed,
        0,
        (DRIVE_NATURAL_BRAKE_DRAG + stormDrag) * delta,
      );
    } else if (driveState.speed < 0) {
      driveState.speed = approach(driveState.speed, 0, DRIVE_NATURAL_BRAKE_DRAG * 0.8 * delta);
    }
  } else {
    driveState.speed *= Math.pow(DRIVE_COAST_DRAG, delta);
  }

  driveState.speed = clamp(driveState.speed, DRIVE_REVERSE_SPEED, maxForwardSpeed);
  driveState.accelerationForce = clamp(
    (driveState.speed - previousSpeed) /
      Math.max(delta, 0.001) /
      (DRIVE_ACCELERATION_BASE + DRIVE_ACCELERATION_RAMP),
    -1,
    1.2,
  );

  const speedRatio = clamp(Math.abs(driveState.speed) / DRIVE_BOOST_MAX_SPEED, 0, 1);
  const steerSmoothing =
    Math.abs(targetSteer) < 0.001 ? DRIVE_STEER_EASE_OUT : DRIVE_STEER_EASE_IN;
  driveState.currentSteer +=
    (targetSteer - driveState.currentSteer) * Math.min(1, delta * steerSmoothing);

  if (Math.abs(driveState.currentSteer) < 0.001) {
    driveState.currentSteer = 0;
  }

  const speedSteerFactor = clamp(0.35 + speedRatio * (1 - DRIVE_SPEED_TURN_DAMPING), 0.28, 1);
  const turnRate =
    driveState.currentSteer *
    (DRIVE_TURN_RATE_LOW_SPEED * (1 - speedRatio) + DRIVE_TURN_RATE_HIGH_SPEED * speedRatio) *
    speedSteerFactor *
    Math.max(throttleActive ? 0.32 : 0, clamp(Math.abs(driveState.speed) / 9.5, 0, 1)) *
    DRIVE_WATER_RESISTANCE_TURN_DAMPING;
  const yawDelta = clamp(
    turnRate * delta * (driveState.speed >= 0 ? 1 : -0.62),
    -DRIVE_MAX_YAW_PER_SECOND * delta,
    DRIVE_MAX_YAW_PER_SECOND * delta,
  );
  driveState.yaw += yawDelta;

  const forwardX = Math.cos(driveState.yaw);
  const forwardZ = Math.sin(driveState.yaw);
  driveState.x += forwardX * driveState.speed * delta;
  driveState.z += forwardZ * driveState.speed * delta;

  const clamped = clampBoatToWater({
    x: driveState.x,
    z: driveState.z,
  });

  if (clamped.hitBoundary) {
    const boundaryDistance = Math.hypot(
      clamped.point.x - driveState.x,
      clamped.point.z - driveState.z,
    );
    const correction = Math.min(1, delta * 8);
    driveState.x += (clamped.point.x - driveState.x) * correction;
    driveState.z += (clamped.point.z - driveState.z) * correction;
    driveState.speed *= Math.pow(0.32, delta);
    driveState.yaw += shortestAngleDelta(driveState.yaw, clamped.centerYaw) * delta * 0.8;

    if (boundaryDistance > 10) {
      const hardClamp = clampBoatToWater({
        x: driveState.x,
        z: driveState.z,
      });
      driveState.x = hardClamp.point.x;
      driveState.z = hardClamp.point.z;
      driveState.speed *= 0.68;
    }
  }
};

const animateBoat = (
  boat: THREE.Group,
  elapsed: number,
  weather: WeatherSnapshot,
  driveState: DriveState,
) => {
  const instability = weather.dials.boatInstability;
  const speed = 1.1 + weather.dials.wind * 1.6;
  const hopProgress = Math.min(1, driveState.boatHop);
  const hop = Math.sin(hopProgress * Math.PI) * hopProgress;
  driveState.boatHop = Math.max(0, driveState.boatHop - 2.7 / 60);
  const speedRatio = clamp(Math.abs(driveState.speed) / DRIVE_BOOST_MAX_SPEED, 0, 1);
  const boostTorque = driveState.boostKick;
  const bowLift =
    (clamp(driveState.accelerationForce, 0, 1) * 0.82 + driveState.throttleInput * 0.18) *
      DRIVE_BOW_LIFT_SCALE +
    speedRatio * 0.075 +
    boostTorque * 0.22;
  driveState.boostKick = Math.max(0, driveState.boostKick - 2.8 / 60);
  const turnBank = driveState.currentSteer * (0.06 + speedRatio * DRIVE_BANK_SCALE);
  boat.position.x = driveState.x;
  boat.position.z = driveState.z;
  boat.position.y =
    BOAT_HOME.y -
    BOAT_WATERLINE_SINK +
    hop * 2.2 +
    Math.sin(elapsed * speed) * (0.18 + instability * 1.08);
  boat.rotation.z =
    Math.sin(elapsed * (0.9 + instability)) * (0.05 + instability * 0.25) - turnBank;
  boat.rotation.x =
    Math.cos(elapsed * (0.72 + instability)) * (0.04 + instability * 0.18) - bowLift;
  boat.rotation.y = getVisualRotationForHeading(driveState.yaw);
};

type TopologyAudit = {
  averageNormalY: number;
  downwardTriangles: number;
  triangleCount: number;
  flipped: boolean;
  flippedTriangles: number;
};

const getTriangleNormalY = (
  positions: readonly number[],
  indexA: number,
  indexB: number,
  indexC: number,
) => {
  const a = indexA * 3;
  const b = indexB * 3;
  const c = indexC * 3;
  const abx = positions[b] - positions[a];
  const abz = positions[b + 2] - positions[a + 2];
  const acx = positions[c] - positions[a];
  const acz = positions[c + 2] - positions[a + 2];
  return abz * acx - abx * acz;
};

const auditTopFacingTriangles = (
  positions: readonly number[],
  indices: readonly number[],
): Omit<TopologyAudit, "flipped" | "flippedTriangles"> => {
  let normalYTotal = 0;
  let downwardTriangles = 0;
  const triangleCount = Math.floor(indices.length / 3);

  for (let offset = 0; offset < indices.length; offset += 3) {
    const normalY = getTriangleNormalY(
      positions,
      indices[offset],
      indices[offset + 1],
      indices[offset + 2],
    );
    normalYTotal += normalY;
    if (normalY < -0.0001) {
      downwardTriangles += 1;
    }
  }

  return {
    averageNormalY: triangleCount > 0 ? normalYTotal / triangleCount : 0,
    downwardTriangles,
    triangleCount,
  };
};

const orientIndicesUpward = (
  positions: readonly number[],
  indices: number[],
): TopologyAudit => {
  let flippedTriangles = 0;

  for (let offset = 0; offset < indices.length; offset += 3) {
    const normalY = getTriangleNormalY(
      positions,
      indices[offset],
      indices[offset + 1],
      indices[offset + 2],
    );
    if (normalY < -0.0001) {
      const temp = indices[offset + 1];
      indices[offset + 1] = indices[offset + 2];
      indices[offset + 2] = temp;
      flippedTriangles += 1;
    }
  }

  const audit = auditTopFacingTriangles(positions, indices);
  return {
    ...audit,
    flipped: flippedTriangles > 0,
    flippedTriangles,
  };
};

const createSlopedStripGeometry = (
  inner: readonly { x: number; z: number }[],
  outer: readonly { x: number; z: number }[],
  innerY: number,
  outerY: number,
  seed = 0,
  wobble = 0,
  label = "ground strip",
) => {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const count = Math.min(inner.length, outer.length);
  const radialSegments = 5;
  const columns = radialSegments + 1;

  const pushTone = (point: { x: number; z: number }, bandT: number, y: number) => {
    const mottled =
      Math.sin(point.x * 0.018 + point.z * 0.012 + seed * 0.31) * 0.020 +
      Math.cos(point.x * -0.010 + point.z * 0.020 + seed * 0.17) * 0.014;
    const broadWarmth =
      Math.sin(point.x * 0.0038 - point.z * 0.0046 + seed * 0.23) * 0.5 + 0.5;
    const valleyShade =
      Math.cos(point.x * 0.0062 + point.z * 0.0042 + seed * 0.19) * 0.5 + 0.5;
    const elevation = THREE.MathUtils.clamp((y - 0.06) / 2.10, 0, 1);
    const centerLight = Math.sin(Math.PI * bandT) * 0.014;
    const tone = THREE.MathUtils.clamp(
      0.90 + bandT * 0.024 + elevation * 0.050 + centerLight + mottled + broadWarmth * 0.026 - valleyShade * 0.018,
      0.78,
      1.08,
    );
    colors.push(
      tone * (0.988 + broadWarmth * 0.020),
      tone * (1.000 + bandT * 0.010),
      tone * (0.940 + elevation * 0.030),
    );
  };

  const getSharedBoundaryNoise = (
    point: { x: number; z: number },
    boundaryY: number,
  ) => {
    if (wobble <= 0) {
      return 0;
    }
    const elevationKey = Math.round(boundaryY * 1000) * 0.001;
    const broad =
      Math.sin(point.x * 0.018 + point.z * 0.013 + elevationKey * 7.1) +
      Math.cos(point.x * -0.011 + point.z * 0.024 + elevationKey * 5.3) * 0.42;
    const fine =
      Math.sin(point.x * 0.041 - point.z * 0.029 + elevationKey * 3.7) * 0.18;
    return (broad + fine) * wobble;
  };

  const getInternalRelief = (
    point: { x: number; z: number },
    bandT: number,
    baseY: number,
    heightDelta: number,
  ) => {
    const edgeFade = Math.sin(Math.PI * bandT);
    if (edgeFade <= 0.0001) {
      return 0;
    }

    const rolling =
      Math.sin(point.x * 0.010 + point.z * 0.007 + seed * 0.43) * 0.52 +
      Math.cos(point.x * -0.006 + point.z * 0.012 + seed * 0.29) * 0.38;
    const basin =
      Math.sin(point.x * 0.004 - point.z * 0.005 + seed * 0.21) * 0.5 + 0.5;
    const softValley = -Math.pow(basin, 2.2) * 0.055;
    const bankCrown = Math.pow(edgeFade, 1.7) * Math.max(0, heightDelta) * 0.10;
    const relief = (rolling * 0.030 + softValley + bankCrown) * edgeFade;
    return relief + Math.max(0, baseY - 1.2) * edgeFade * 0.012;
  };

  for (let index = 0; index < count; index += 1) {
    const innerPoint = inner[index];
    const outerPoint = outer[index];
    const innerNoise = getSharedBoundaryNoise(innerPoint, innerY);
    const outerNoise = getSharedBoundaryNoise(outerPoint, outerY);

    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const bandT = radialIndex / radialSegments;
      const easedT = bandT * bandT * (3 - 2 * bandT);
      const x = innerPoint.x + (outerPoint.x - innerPoint.x) * bandT;
      const z = innerPoint.z + (outerPoint.z - innerPoint.z) * bandT;
      const baseY = innerY + (outerY - innerY) * easedT;
      const boundaryNoise = innerNoise + (outerNoise - innerNoise) * easedT;
      const y =
        baseY +
        boundaryNoise +
        getInternalRelief({ x, z }, bandT, baseY, outerY - innerY);
      positions.push(x, y, z);
      pushTone({ x, z }, bandT, y);
    }
  }

  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const a = index * columns + radialIndex;
      const b = next * columns + radialIndex;
      indices.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }

  const topology = orientIndicesUpward(positions, indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.userData.topology = {
    ...topology,
    label,
  };
  geometry.computeVertexNormals();
  return applyPlanarUvs(geometry, 92, 900, 700);
};

const auditRibbonBand = (
  inner: readonly { x: number; z: number }[],
  outer: readonly { x: number; z: number }[],
  waterAllowed: boolean,
) => {
  const count = Math.min(inner.length, outer.length);
  let badSegments = 0;

  for (let index = 0; index < count; index += 1) {
    const innerPoint = inner[index];
    const outerPoint = outer[index];
    const innerClearance = -distanceToShore(innerPoint);
    const outerClearance = -distanceToShore(outerPoint);
    const segmentWidth = Math.hypot(outerPoint.x - innerPoint.x, outerPoint.z - innerPoint.z);
    const landWaterOverlap =
      !waterAllowed &&
      (distanceToShore(innerPoint) > 1.5 || distanceToShore(outerPoint) > 1.5);
    const reversed = outerClearance + 2 < innerClearance;
    const collapsed = segmentWidth < 2;

    if (landWaterOverlap || reversed || collapsed) {
      badSegments += 1;
    }
  }

  return badSegments;
};

type MoundToneProfile = {
  center: [number, number, number];
  dry: [number, number, number];
  damp: [number, number, number];
  edge: [number, number, number];
  ripple: number;
};

const sandMoundTone: MoundToneProfile = {
  center: [3.02, 3.00, 2.80],
  dry: [2.72, 2.66, 2.36],
  damp: [1.18, 1.00, 0.66],
  edge: [0.76, 0.65, 0.44],
  ripple: 0.0029,
};

const sandbarMoundTone: MoundToneProfile = {
  center: [3.18, 3.16, 2.92],
  dry: [2.82, 2.74, 2.44],
  damp: [1.20, 1.02, 0.68],
  edge: [0.76, 0.65, 0.44],
  ripple: 0.0028,
};

const featureWetLipTone: MoundToneProfile = {
  center: [1.18, 1.04, 0.73],
  dry: [1.02, 0.9, 0.61],
  damp: [0.82, 0.68, 0.46],
  edge: [0.68, 0.58, 0.42],
  ripple: 0.0014,
};

const rockMoundTone: MoundToneProfile = {
  center: [0.86, 0.90, 0.82],
  dry: [0.78, 0.84, 0.76],
  damp: [0.62, 0.69, 0.63],
  edge: [0.48, 0.55, 0.52],
  ripple: 0.012,
};

const mixTone = (
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  amount: number,
) =>
  [
    THREE.MathUtils.lerp(from[0], to[0], amount),
    THREE.MathUtils.lerp(from[1], to[1], amount),
    THREE.MathUtils.lerp(from[2], to[2], amount),
  ] as [number, number, number];

const createOrganicMoundedEllipseGeometry = (
  radiusX: number,
  radiusZ: number,
  seed = 0,
  wobble = 0.018,
  centerY = 0.5,
  edgeY = 0.32,
  count = 128,
  rings = 5,
  tone: MoundToneProfile = sandMoundTone,
) => {
  const positions: number[] = [0, centerY, 0];
  const colors: number[] = [...tone.center];
  const indices: number[] = [];

  for (let ring = 1; ring <= rings; ring += 1) {
    const t = ring / rings;
    const height = edgeY + (centerY - edgeY) * Math.pow(1 - smoothstepNumber(0, 1, t), 0.74);
    const dryBlend = smoothstepNumber(0.12, 0.86, t);
    const wetEdge = smoothstepNumber(0.62, 1, t);
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      const noise =
        Math.sin(angle * 2.4 + seed * 0.19 + ring * 0.42) * wobble +
        Math.cos(angle * 5.1 + seed * 0.31 + ring * 0.24) * wobble * 0.42 +
        Math.sin(angle * 8.6 + seed * 0.11) * wobble * 0.18;
      const rimBreakup = ring === rings ? 1.12 : 0.72;
      const rippleTone = Math.sin(angle * 7.0 + seed * 0.07 + ring * 0.9) * tone.ripple;
      positions.push(
        Math.cos(angle) * radiusX * t * (1 + noise * rimBreakup),
        height + noise * 0.08,
        Math.sin(angle) * radiusZ * t * (1 + noise * 0.72 * rimBreakup),
      );
      const dryToDamp = mixTone(tone.dry, tone.damp, dryBlend);
      const finalTone = mixTone(dryToDamp, tone.edge, wetEdge);
      colors.push(finalTone[0] + rippleTone, finalTone[1] + rippleTone * 0.82, finalTone[2] + rippleTone * 0.44);
    }
  }

  for (let index = 0; index < count; index += 1) {
    const current = 1 + index;
    const next = 1 + ((index + 1) % count);
    indices.push(0, next, current);
  }

  for (let ring = 2; ring <= rings; ring += 1) {
    const previousStart = 1 + (ring - 2) * count;
    const currentStart = 1 + (ring - 1) * count;
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      const innerA = previousStart + index;
      const innerB = previousStart + next;
      const outerA = currentStart + index;
      const outerB = currentStart + next;
      indices.push(innerA, outerB, outerA, innerA, innerB, outerB);
    }
  }

  const topology = orientIndicesUpward(positions, indices);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.userData.topology = {
    ...topology,
    label: "organic mounded landform",
  };
  geometry.computeVertexNormals();
  return applyPlanarUvs(geometry, Math.max(34, Math.max(radiusX, radiusZ) * 0.72), radiusX, radiusZ);
};

const createShoreline = () => {
  const group = new THREE.Group();
  group.name = "Phase 81 ordered zone-band terrain";
  const materials: Partial<Record<ZoneBandMaterialKey, THREE.MeshStandardMaterial>> = {
    wetSand: makeTexturedStandardMaterial({
      kind: "wetSand",
      seed: 901,
      size: 128,
      base: 0x6f664b,
      accent: 0xb5a468,
      dark: 0x3e382b,
      color: 0xd1bd82,
      roughness: 0.97,
      side: THREE.FrontSide,
    }),
    bankToe: makeTexturedStandardMaterial({
      kind: "grass",
      seed: 902,
      size: 128,
      base: 0x53683d,
      accent: 0xa7b06d,
      dark: 0x314029,
      color: 0xacb779,
      roughness: 0.94,
      side: THREE.FrontSide,
    }),
    shoreGrass: makeTexturedStandardMaterial({
      kind: "grass",
      seed: 903,
      size: 128,
      base: 0x5f8044,
      accent: 0xb5c075,
      dark: 0x344b2c,
      color: 0xb4c37d,
      roughness: 0.93,
      side: THREE.FrontSide,
    }),
    raisedBank: makeTexturedStandardMaterial({
      kind: "grass",
      seed: 904,
      size: 128,
      base: 0x4e703e,
      accent: 0x9cad64,
      dark: 0x263a25,
      color: 0xa2b873,
      roughness: 0.95,
      side: THREE.FrontSide,
    }),
    forestShelf: makeTexturedStandardMaterial({
      kind: "forestFloor",
      seed: 905,
      size: 128,
      base: 0x335831,
      accent: 0x738952,
      dark: 0x15291a,
      color: 0x6f8958,
      roughness: 0.99,
      side: THREE.FrontSide,
    }),
    midForestShelf: makeTexturedStandardMaterial({
      kind: "forestFloor",
      seed: 907,
      size: 128,
      base: 0x284a2d,
      accent: 0x5f7448,
      dark: 0x102113,
      color: 0x5e744c,
      roughness: 0.99,
      side: THREE.FrontSide,
    }),
    farForest: makeTexturedStandardMaterial({
      kind: "forestFloor",
      seed: 906,
      size: 128,
      base: 0x173820,
      accent: 0x526a41,
      dark: 0x0a1a0e,
      color: 0x4d6641,
      roughness: 1,
      side: THREE.FrontSide,
    }),
  };

  Object.values(materials).forEach((material) => {
    if (!material) {
      return;
    }
    material.vertexColors = true;
  });

  const topologyAudits: TopologyAudit[] = [];
  let badRibbonSegments = 0;
  let contourLocked = true;

  for (const band of LAND_PERIMETER_BANDS) {
    const inner = getExpandedOutline(band.startOffset);
    const outer = getExpandedOutline(band.endOffset);
    contourLocked = contourLocked && band.outerBoundary === "outline";
    badRibbonSegments += auditRibbonBand(inner, outer, band.waterAllowed);
    const geometry = createSlopedStripGeometry(
      inner,
      outer,
      band.startY,
      band.endY,
      band.seed,
      band.wobble,
      `${band.zone} ${band.key}`,
    );
    const material = materials[band.material];
    if (!material) {
      continue;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Zone ${band.zone} ${band.zoneName} - ${band.key}`;
    mesh.userData.zoneBand = {
      key: band.key,
      zone: band.zone,
      zoneName: band.zoneName,
      startOffset: band.startOffset,
      endOffset: band.endOffset,
      startY: band.startY,
      endY: band.endY,
      material: band.material,
      owner: band.owner,
      waterAllowed: band.waterAllowed,
      overlapAllowed: band.overlapAllowed,
    };
    mesh.receiveShadow = true;
    group.add(mesh);
    topologyAudits.push(geometry.userData.topology as TopologyAudit);
  }

  group.userData.groundBandCount = LAND_PERIMETER_BANDS.length;
  group.userData.groundFlippedBands = topologyAudits.filter((audit) => audit.flipped).length;
  group.userData.groundDownwardTriangles = topologyAudits.reduce(
    (total, audit) => total + audit.downwardTriangles,
    0,
  );
  group.userData.groundBadBandSegments = badRibbonSegments;
  group.userData.groundContourLocked = contourLocked;
  group.userData.groundRibbonValid =
    contourLocked &&
    badRibbonSegments === 0 &&
    Number(group.userData.groundDownwardTriangles) === 0;
  group.userData.zoneBandTableVersion = ZONE_BAND_TABLE_VERSION;

  return group;
};

const animateShoreline = (
  shoreline: THREE.Group,
  elapsed: number,
  weather: WeatherSnapshot,
) => {
  const sway = 0.018 + weather.dials.wind * 0.045;
  shoreline.children.forEach((child) => {
    const phase = Number(child.userData.swayPhase);
    if (!Number.isFinite(phase)) {
      return;
    }

    const baseRotationZ = Number(child.userData.baseRotationZ ?? 0);
    child.rotation.z = baseRotationZ + Math.sin(elapsed * (0.9 + weather.dials.wind) + phase) * sway;
  });
};

const createDestinationMarkers = () => {
  const group = new THREE.Group();
  group.name = "Phase 12 destination landmarks";
  const dockMaterial = makeTexturedStandardMaterial({
    kind: "wood",
    seed: 811,
    size: 128,
    base: 0x7c4b29,
    accent: 0xbe8050,
    dark: 0x3a2112,
    color: 0x8b5b36,
    roughness: 0.72,
  });
  const sandMaterial = makeTexturedStandardMaterial({
    kind: "sand",
    seed: 821,
    size: 192,
    base: 0xffffff,
    accent: 0xffffff,
    dark: 0xefe0ad,
    color: 0xffffff,
    emissive: 0x443d2e,
    emissiveIntensity: 0.048,
    roughness: 0.96,
  });
  const rockMaterial = makeTexturedStandardMaterial({
    kind: "rock",
    seed: 831,
    size: 128,
    base: 0x747b70,
    accent: 0xb2b89f,
    dark: 0x3f4a45,
    color: 0xf0f1e2,
    emissive: 0x1b221e,
    emissiveIntensity: 0.035,
    roughness: 0.93,
  });
  const islandShelfMaterial = makeTexturedStandardMaterial({
    kind: "rock",
    seed: 833,
    size: 128,
    base: 0x9da591,
    accent: 0xc5c9ac,
    dark: 0x66705f,
    color: 0xf3f3e7,
    emissive: 0x1a211b,
    emissiveIntensity: 0.025,
    roughness: 0.94,
  });
  const darkRockMaterial = makeTexturedStandardMaterial({
    kind: "rock",
    seed: 837,
    size: 128,
    base: 0x53605c,
    accent: 0x858c7c,
    dark: 0x2a3735,
    color: 0xe4e7dd,
    roughness: 0.96,
  });
  const reedMaterial = makeTexturedStandardMaterial({
    kind: "reed",
    seed: 841,
    size: 96,
    base: 0x76884d,
    accent: 0xb2b76d,
    dark: 0x3d4a2a,
    color: 0xf0f3da,
    roughness: 0.88,
  });
  const pineMaterial = new THREE.MeshStandardMaterial({
    color: 0x24492b,
    roughness: 0.88,
  });
  sandMaterial.vertexColors = true;
  islandShelfMaterial.vertexColors = true;
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x91f2bf });
  const lanternMaterial = new THREE.MeshBasicMaterial({ color: 0xffd37d });
  const dockCenter = getDestinationCenter("dock");
  const sandbarCenter = getDestinationCenter("sandbar");
  const coveCenter = getDestinationCenter("cove");
  const islandCenter = getDestinationCenter("island");
  const reedsCenter = getDestinationCenter("reeds");
  const sandbarFootprint = LAKE_FEATURE_FOOTPRINTS.sandbar;
  const islandFootprint = LAKE_FEATURE_FOOTPRINTS.island;
  const beachPocket = LAKE_MAP.mainlandBeach;

  const dock = new THREE.Group();
  dock.name = "Dock area";
  const dockBeacon = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 22, 8), dockMaterial);
  dockBeacon.position.set(dockCenter.x - 4, 10, dockCenter.z + 8);
  dockBeacon.castShadow = true;
  dock.add(dockBeacon);
  const dockLantern = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 12), lanternMaterial);
  dockLantern.position.set(dockCenter.x - 4, 22.4, dockCenter.z + 8);
  dock.add(dockLantern);
  const dockCabin = new THREE.Mesh(new THREE.BoxGeometry(13, 8, 10), dockMaterial);
  dockCabin.position.set(dockCenter.x - 26, 4.2, dockCenter.z + 18);
  dockCabin.rotation.y = -0.52;
  dockCabin.castShadow = true;
  dock.add(dockCabin);
  for (let index = 0; index < 5; index += 1) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(24, 0.38, 1.35), dockMaterial);
    plank.position.set(dockCenter.x + index * 4.2, 0.58, dockCenter.z - 1 - index * 1.65);
    plank.rotation.y = 0.42;
    plank.castShadow = true;
    dock.add(plank);
  }
  for (let index = 0; index < 7; index += 1) {
    const crossPlank = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.32, 8.8), dockMaterial);
    crossPlank.position.set(dockCenter.x + 1.5 + index * 3.3, 0.82, dockCenter.z - 2.6 - index * 1.35);
    crossPlank.rotation.y = 0.42;
    crossPlank.castShadow = true;
    dock.add(crossPlank);
  }
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 8, 8), dockMaterial);
    post.position.set(dockCenter.x + 18, 3, dockCenter.z - 8 + side * 5.4);
    post.castShadow = true;
    dock.add(post);
  }
  group.add(dock);

  const mainlandBeach = new THREE.Mesh(
    createOrganicMoundedEllipseGeometry(
      beachPocket.radiusX,
      beachPocket.radiusZ,
      451,
      0.030,
      0.48,
      0.18,
      120,
      4,
    ),
    sandMaterial,
  );
  mainlandBeach.name = "Zone-validated mainland beach pocket";
  mainlandBeach.position.set(beachPocket.center.x, 0, beachPocket.center.z);
  mainlandBeach.rotation.y = beachPocket.rotation;
  mainlandBeach.receiveShadow = true;
  group.add(mainlandBeach);

  const sandbarWetLip = new THREE.Mesh(
    createOrganicMoundedEllipseGeometry(
      sandbarFootprint.dry.radiusX + 7,
      sandbarFootprint.dry.radiusZ + 5,
      59,
      0.014,
      0.19,
      0.075,
      224,
      5,
      featureWetLipTone,
    ),
    sandMaterial,
  );
  sandbarWetLip.name = "Zone 2 sandbar warm wet-edge overlap lip";
  sandbarWetLip.position.set(sandbarCenter.x, 0, sandbarCenter.z);
  sandbarWetLip.rotation.y = -sandbarFootprint.rotation;
  sandbarWetLip.receiveShadow = true;
  group.add(sandbarWetLip);

  const sandbar = new THREE.Mesh(
    createOrganicMoundedEllipseGeometry(
      sandbarFootprint.dry.radiusX,
      sandbarFootprint.dry.radiusZ,
      61,
      0.026,
      0.66,
      0.19,
      208,
      7,
      sandbarMoundTone,
    ),
    sandMaterial,
  );
  sandbar.name = "Raised low sandy sandbar landform";
  sandbar.position.set(sandbarCenter.x, 0, sandbarCenter.z);
  sandbar.rotation.y = -sandbarFootprint.rotation;
  sandbar.receiveShadow = true;
  group.add(sandbar);

  const coveMarker = new THREE.Group();
  coveMarker.name = "Mountain cove";
  const coveStone = new THREE.Mesh(new THREE.ConeGeometry(12, 28, 5), darkRockMaterial);
  coveStone.position.set(coveCenter.x - 10, 14, coveCenter.z + 8);
  coveStone.rotation.y = 0.7;
  coveStone.castShadow = true;
  coveMarker.add(coveStone);
  const coveArch = new THREE.Mesh(new THREE.TorusGeometry(13, 1.6, 8, 28, Math.PI), darkRockMaterial);
  coveArch.position.set(coveCenter.x + 13, 8, coveCenter.z - 2);
  coveArch.rotation.set(0, 0.35, Math.PI);
  coveArch.castShadow = true;
  coveMarker.add(coveArch);
  for (let index = 0; index < 6; index += 1) {
    const coveFacet = new THREE.Mesh(
      new THREE.ConeGeometry(8 + index, 20 + index * 2.2, 5),
      darkRockMaterial,
    );
    coveFacet.position.set(
      coveCenter.x - 34 + index * 12,
      9 + index * 0.7,
      coveCenter.z + 28 - Math.abs(index - 2.5) * 7,
    );
    coveFacet.rotation.y = 0.5 + index * 0.28;
    coveFacet.castShadow = true;
    coveMarker.add(coveFacet);
  }
  const coveBeacon = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 10), markerMaterial);
  coveBeacon.position.set(coveCenter.x - 10, 30, coveCenter.z + 8);
  coveMarker.add(coveBeacon);
  group.add(coveMarker);

  const island = new THREE.Group();
  island.name = "Rocky island";
  const islandWetLip = new THREE.Mesh(
    createOrganicMoundedEllipseGeometry(
      islandFootprint.dry.radiusX + 8,
      islandFootprint.dry.radiusZ + 6,
      71,
      0.014,
      0.2,
      0.08,
      224,
      5,
      featureWetLipTone,
    ),
    sandMaterial,
  );
  islandWetLip.name = "Zone 2 island warm wet-edge overlap lip";
  islandWetLip.position.set(islandCenter.x, 0, islandCenter.z);
  islandWetLip.rotation.y = -islandFootprint.rotation;
  islandWetLip.receiveShadow = true;
  island.add(islandWetLip);

  const islandBeach = new THREE.Mesh(
    createOrganicMoundedEllipseGeometry(
      islandFootprint.dry.radiusX,
      islandFootprint.dry.radiusZ,
      73,
      0.024,
      0.82,
      0.24,
      208,
      7,
    ),
    sandMaterial,
  );
  islandBeach.name = "Raised island beach landform";
  islandBeach.position.set(islandCenter.x, 0, islandCenter.z);
  islandBeach.rotation.y = -islandFootprint.rotation;
  islandBeach.receiveShadow = true;
  island.add(islandBeach);

  const islandRockShelf = new THREE.Mesh(
    createOrganicMoundedEllipseGeometry(
      islandFootprint.blocker.radiusX * 0.3,
      islandFootprint.blocker.radiusZ * 0.34,
      79,
      0.018,
      0.82,
      0.56,
      72,
      4,
      rockMoundTone,
    ),
    islandShelfMaterial,
  );
  islandRockShelf.name = "Island rock shelf";
  islandRockShelf.position.set(islandCenter.x, 0, islandCenter.z);
  islandRockShelf.rotation.y = -islandFootprint.rotation;
  islandRockShelf.receiveShadow = true;
  island.add(islandRockShelf);
  for (let index = 0; index < 8; index += 1) {
    const angle = index * 0.78;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(3.8 + (index % 3)), rockMaterial);
    rock.position.set(
      islandCenter.x + Math.cos(angle) * 12,
      2.74,
      islandCenter.z + Math.sin(angle) * 8,
    );
    rock.scale.y = 0.58 + (index % 4) * 0.14;
    rock.rotation.set(index * 0.22, angle, index * 0.17);
    rock.castShadow = true;
    island.add(rock);
  }
  for (let index = 0; index < 5; index += 1) {
    const tree = new THREE.Mesh(new THREE.ConeGeometry(2.2, 8, 7), pineMaterial);
    tree.position.set(
      islandCenter.x - 11 + index * 5.4,
      5.5,
      islandCenter.z + Math.sin(index * 1.4) * 7,
    );
    tree.rotation.y = index * 0.7;
    tree.castShadow = true;
    island.add(tree);
  }
  group.add(island);

  const reeds = new THREE.Group();
  reeds.name = "Reed shoreline";
  for (let index = 0; index < 46; index += 1) {
    const base = {
      x: reedsCenter.x + (index % 12) * 3.2 - 16,
      z: reedsCenter.z + Math.floor(index / 12) * 5 - 7,
    };
    const reedPoint = {
      x: base.x + Math.sin(index * 1.8) * 2.8,
      z: base.z + Math.cos(index * 1.3) * 2.2,
    };
    if (!isReedWetlandZone(reedPoint)) {
      continue;
    }
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 6 + (index % 4), 5), reedMaterial);
    reed.position.set(
      reedPoint.x,
      2.5,
      reedPoint.z,
    );
    reed.rotation.z = Math.sin(index) * 0.12;
    reed.castShadow = true;
    reeds.add(reed);
  }
  group.add(reeds);

  return group;
};

const createSunDisc = () => {
  const material = new THREE.MeshBasicMaterial({ color: 0xffd37d });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(6.8, 28, 14), material);
  sun.position.set(-154, 98, -188);
  return sun;
};

const createSeededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state >>>= 0;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
};

const createCloudWispTexture = (seed: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const random = createSeededRandom(seed);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "lighter";

  for (let index = 0; index < 30; index += 1) {
    const x = canvas.width * (0.08 + random() * 0.84);
    const y = canvas.height * (0.26 + random() * 0.48);
    const radiusX = 28 + random() * 86;
    const radiusY = 10 + random() * 28;
    const gradient = context.createRadialGradient(x, y, 0, x, y, Math.max(radiusX, radiusY));
    const opacity = 0.045 + random() * 0.08;
    gradient.addColorStop(0, `rgba(255,255,255,${opacity})`);
    gradient.addColorStop(0.46, `rgba(225,235,232,${opacity * 0.52})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.save();
    context.translate(x, y);
    context.rotate((random() - 0.5) * 0.42);
    context.scale(radiusX / Math.max(radiusY, 1), 1);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, radiusY, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  context.globalCompositeOperation = "source-over";
  const fade = context.createLinearGradient(0, 0, canvas.width, 0);
  fade.addColorStop(0, "rgba(255,255,255,0)");
  fade.addColorStop(0.18, "rgba(255,255,255,0.85)");
  fade.addColorStop(0.82, "rgba(255,255,255,0.85)");
  fade.addColorStop(1, "rgba(255,255,255,0)");
  context.globalCompositeOperation = "destination-in";
  context.fillStyle = fade;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

const createClouds = () => {
  const group = new THREE.Group();
  group.name = "Wispy atmospheric cloud banks";
  const planeGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const cloudTextures = [createCloudWispTexture(101), createCloudWispTexture(211), createCloudWispTexture(337)].filter(
    (texture): texture is THREE.CanvasTexture => texture !== null,
  );
  if (cloudTextures.length === 0) {
    return group;
  }
  const cloudConfigs = [
    { x: -680, y: 254, z: -900, scale: 0.72, width: 220, depth: 24, wisps: 3, phase: 0.2, yaw: 0.08 },
    { x: -330, y: 214, z: -720, scale: 1.12, width: 330, depth: 38, wisps: 5, phase: 1.8, yaw: -0.04 },
    { x: -70, y: 176, z: -560, scale: 0.92, width: 230, depth: 28, wisps: 4, phase: 3.1, yaw: 0.13 },
    { x: 210, y: 206, z: -690, scale: 1.08, width: 310, depth: 36, wisps: 5, phase: 4.7, yaw: -0.10 },
    { x: 520, y: 184, z: -610, scale: 0.94, width: 260, depth: 30, wisps: 4, phase: 6.0, yaw: 0.06 },
    { x: -560, y: 238, z: -780, scale: 0.58, width: 170, depth: 22, wisps: 3, phase: 7.4, yaw: -0.10 },
    { x: -150, y: 232, z: -820, scale: 0.86, width: 260, depth: 34, wisps: 4, phase: 8.9, yaw: 0.04 },
    { x: 390, y: 156, z: -300, scale: 0.70, width: 180, depth: 22, wisps: 3, phase: 10.3, yaw: 0.18 },
    { x: 690, y: 224, z: -760, scale: 0.82, width: 220, depth: 32, wisps: 3, phase: 11.6, yaw: -0.08 },
  ];

  cloudConfigs.forEach((config, bankIndex) => {
    const cloud = new THREE.Group();
    cloud.name = "Wispy cloud bank";
    cloud.position.set(config.x, config.y, config.z);
    cloud.scale.setScalar(config.scale);
    cloud.userData.baseX = config.x;
    cloud.userData.baseY = config.y;
    cloud.userData.baseZ = config.z;
    cloud.userData.baseScale = config.scale;
    cloud.userData.phase = config.phase;

    for (let wisp = 0; wisp < config.wisps; wisp += 1) {
      const t = config.wisps <= 1 ? 0.5 : wisp / (config.wisps - 1);
      const side = (t - 0.5) * config.width;
      const layer = Math.sin((wisp + bankIndex) * 1.41);
      const material = new THREE.MeshBasicMaterial({
        map: cloudTextures[(bankIndex + wisp) % cloudTextures.length],
        color: 0xdfe8e3,
        transparent: true,
        opacity: 0.15 + (wisp % 3) * 0.026,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(planeGeometry, material);
      mesh.name = "Wispy cloud veil";
      mesh.position.set(
        side + Math.sin(config.phase + wisp * 1.13) * 18,
        Math.sin(config.phase * 0.7 + wisp * 1.17) * 11,
        layer * config.depth + Math.cos(config.phase + wisp * 0.8) * 9,
      );
      mesh.scale.set(
        118 + (wisp % 3) * 34 + Math.sin(config.phase + wisp) * 16,
        28 + (wisp % 2) * 12,
        1,
      );
      mesh.rotation.set(
        Math.sin(config.phase + wisp) * 0.035,
        config.yaw + Math.sin(config.phase + wisp * 0.8) * 0.16,
        Math.cos(config.phase + wisp) * 0.085,
      );
      mesh.userData.baseOpacity = material.opacity;
      cloud.add(mesh);
    }

    group.add(cloud);
  });

  return group;
};

const createHorizonHaze = () => {
  const group = new THREE.Group();
  group.name = "Atmospheric horizon haze disabled";
  return group;
};

type WeatherEffects = {
  group: THREE.Group;
  rain: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  embers: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  lightning: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
};

type WakeEffect = {
  group: THREE.Group;
  segments: WakeSegment[];
  cursor: number;
  lastEmitAt: number;
};

type WakeSegment = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  age: number;
  lifetime: number;
  active: boolean;
  side: number;
  speedRatio: number;
  baseScale: number;
  heightScale: number;
  lengthScale: number;
  driftX: number;
  driftZ: number;
  spin: number;
};

const createWakeEffect = (): WakeEffect => {
  const group = new THREE.Group();
  group.name = "Drive wake";
  const segments: WakeSegment[] = [];

  for (let index = 0; index < WAKE_MAX_ACTIVE_BLOCKS; index += 1) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xf2fbff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    );
    mesh.renderOrder = 40;
    group.add(mesh);
    segments.push({
      mesh,
      age: 0,
      lifetime: 1,
      active: false,
      side: index % 2 === 0 ? -1 : 1,
      speedRatio: 0,
      baseScale: 1,
      heightScale: 1,
      lengthScale: 1,
      driftX: 0,
      driftZ: 0,
      spin: 0,
    });
  }

  return { group, segments, cursor: 0, lastEmitAt: 0 };
};

const emitWakeSegment = (
  wake: WakeEffect,
  driveState: DriveState,
  side: number,
  visibilityTest: boolean,
  forceBurst: boolean,
) => {
  const effectiveSpeed = forceBurst ? Math.max(38, Math.abs(driveState.speed)) : driveState.speed;
  const speedRatio = clamp(Math.abs(effectiveSpeed) / DRIVE_BOOST_MAX_SPEED, 0, 1);
  const wakePower = clamp(forceBurst ? Math.max(1.18, driveState.wakePower) : driveState.wakePower, 0, 1.34);
  const reverseChurn = !forceBurst && driveState.speed < -1;
  const visibilityScale = visibilityTest ? 1.36 : 1;
  const forward = getBoatForward(driveState.yaw);
  const lateral = new THREE.Vector3(-forward.z, 0, forward.x);
  const segment = wake.segments[wake.cursor];
  wake.cursor = (wake.cursor + 1) % wake.segments.length;
  const boostIntensity =
    driveState.throttleInput > 0 && Math.abs(driveState.speed) > DRIVE_MAX_SPEED
      ? WAKE_BOOST_MULTIPLIER
      : 1;
  const spread =
    side === 0
      ? (Math.random() - 0.5) * WAKE_OUTWARD_SPREAD * (reverseChurn ? 0.18 : 0.28)
      : 0.3 + speedRatio * WAKE_OUTWARD_SPREAD * (reverseChurn ? 0.18 : 0.48) + wakePower * 0.44;
  const rearDistance =
    side === 0
      ? 7.72 + Math.random() * 0.58
      : 7.86 + speedRatio * WAKE_BACKWARD_VELOCITY * (reverseChurn ? 0.18 : 0.36) + Math.random() * 0.74;
  segment.mesh.position
    .set(
      driveState.x,
      WAKE_SURFACE_Y_OFFSET + Math.random() * WAKE_VERTICAL_VELOCITY + (visibilityTest ? 0.08 : 0),
      driveState.z,
    )
    .addScaledVector(forward, -rearDistance)
    .addScaledVector(lateral, side * spread + (Math.random() - 0.5) * 1.25);
  segment.mesh.rotation.set(
    (Math.random() - 0.5) * 0.08,
    -driveState.yaw + side * (0.32 + speedRatio * 0.32) - driveState.currentSteer * 0.16,
    Math.random() * Math.PI,
  );
  segment.mesh.scale.set(1, 1, 1);
  segment.age = 0;
  segment.lifetime =
    WAKE_LIFETIME_SECONDS + speedRatio * 0.1 + wakePower * 0.06 + (visibilityTest ? 0.12 : 0);
  segment.active = true;
  segment.side = side;
  segment.speedRatio = speedRatio;
  segment.baseScale =
    clamp(
      WAKE_BLOCK_SIZE_MIN +
        Math.random() * (WAKE_BLOCK_SIZE_MAX - WAKE_BLOCK_SIZE_MIN) +
        wakePower * 0.11,
      WAKE_BLOCK_SIZE_MIN,
      WAKE_BLOCK_SIZE_MAX * boostIntensity * visibilityScale,
    );
  segment.heightScale =
    (visibilityTest ? 0.72 : 0.56) + Math.random() * 0.24 + wakePower * (visibilityTest ? 0.12 : 0.08);
  segment.lengthScale =
    (reverseChurn ? 0.7 : 0.82) +
    speedRatio * (visibilityTest ? 0.46 : 0.28) +
    Math.random() * 0.28;
  segment.driftX =
    forward.x * -(WAKE_BACKWARD_VELOCITY + speedRatio * 1.2) * boostIntensity * (reverseChurn ? 0.18 : 0.74) +
    lateral.x * side * (0.22 + speedRatio * 0.62);
  segment.driftZ =
    forward.z * -(WAKE_BACKWARD_VELOCITY + speedRatio * 1.2) * boostIntensity * (reverseChurn ? 0.18 : 0.74) +
    lateral.z * side * (0.22 + speedRatio * 0.62);
  segment.spin = (Math.random() - 0.5) * (0.58 + wakePower * 0.26);
  segment.mesh.material.color.set(speedRatio > 0.35 || wakePower > 0.42 || visibilityTest ? 0xffffff : 0xf0fbff);
  segment.mesh.material.opacity = clamp(
    (visibilityTest ? 1 : 0.92) + speedRatio * 0.08 + wakePower * 0.06,
    visibilityTest ? 0.96 : 0.88,
    1,
  );
};

const animateWakeEffect = (
  wake: WakeEffect,
  driveState: DriveState,
  elapsed: number,
  delta: number,
  wakeQualityScale: number,
  visibilityTest: boolean,
  forceBurst: boolean,
) => {
  const effectiveSpeed = forceBurst ? Math.max(38, Math.abs(driveState.speed)) : driveState.speed;
  const speedRatio = clamp(Math.abs(effectiveSpeed) / DRIVE_BOOST_MAX_SPEED, 0, 1);
  const wakePower = clamp(forceBurst ? Math.max(1.18, driveState.wakePower) : driveState.wakePower, 0, 1.34);
  const emitCadence = clamp(
    1 / ((WAKE_EMISSION_RATE + wakePower * 58 + speedRatio * 44) * wakeQualityScale * (visibilityTest ? 1.55 : 1)),
    visibilityTest ? 0.006 : 0.009,
    0.034,
  );
  const liveMotorChurn =
    driveState.mode === "Drive" &&
    (driveState.throttleInput > 0.04 || driveState.brakeInput > 0.04 || wakePower > 0.04 || speedRatio > 0.035);
  if (
    (liveMotorChurn || forceBurst) &&
    elapsed - wake.lastEmitAt > emitCadence
  ) {
    emitWakeSegment(wake, driveState, -1, visibilityTest, forceBurst);
    emitWakeSegment(wake, driveState, 1, visibilityTest, forceBurst);
    emitWakeSegment(wake, driveState, 0, visibilityTest, forceBurst);
    emitWakeSegment(wake, driveState, 0, visibilityTest, forceBurst);
    emitWakeSegment(wake, driveState, 0, visibilityTest, forceBurst);
    if (wakePower > 0.22) {
      emitWakeSegment(wake, driveState, 0, visibilityTest, forceBurst);
    }
    if (driveState.throttleInput > 0.7 || speedRatio > 0.52 || driveState.boostActive) {
      emitWakeSegment(wake, driveState, Math.random() > 0.5 ? 1 : -1, visibilityTest, forceBurst);
      emitWakeSegment(wake, driveState, 0, visibilityTest, forceBurst);
    }
    if (visibilityTest || forceBurst) {
      emitWakeSegment(wake, driveState, -1, visibilityTest, forceBurst);
      emitWakeSegment(wake, driveState, 1, visibilityTest, forceBurst);
    }
    wake.lastEmitAt = elapsed;
  }

  wake.segments.forEach((segment) => {
    if (!segment.active) {
      return;
    }

    segment.age += delta;
    const progress = clamp(segment.age / segment.lifetime, 0, 1);
    const fade = (1 - progress) ** WAKE_FADE_SPEED * (0.64 + segment.speedRatio * 0.3);
    const widen = 1 + progress * (0.68 + segment.speedRatio * 1.2);
    const settle = 1 - progress * 0.5;
    segment.mesh.position.x += segment.driftX * delta;
    segment.mesh.position.z += segment.driftZ * delta;
    segment.mesh.position.y =
      WAKE_SURFACE_Y_OFFSET +
      (visibilityTest ? 0.08 : 0) +
      Math.sin(segment.age * 14 + segment.side * 1.7) * WAKE_VERTICAL_VELOCITY;
    segment.mesh.rotation.x += segment.spin * 0.04 * delta;
    segment.mesh.rotation.z += segment.spin * 0.48 * delta;
    segment.mesh.scale.set(
      segment.baseScale * segment.lengthScale * widen,
      Math.max(0.12, segment.heightScale * settle),
      segment.baseScale * (0.92 + segment.speedRatio * 0.34) * widen,
    );
    segment.mesh.material.opacity = Math.min(1, fade * (visibilityTest ? 1.06 : 0.98));

    if (progress >= 1) {
      segment.active = false;
      segment.mesh.material.opacity = 0;
    }
  });
};

const createWeatherEffects = (): WeatherEffects => {
  const group = new THREE.Group();
  const rain = createParticleSheet(1200, 300, 130, 0x9dd8ef, 0.8, 0.62);
  const embers = createParticleSheet(360, 210, 110, 0xff7340, 1.15, 0.72);
  const lightning = createLightning();

  rain.name = "Phase 3 rain";
  embers.name = "Phase 3 embers";
  lightning.name = "Phase 3 lightning";
  group.add(rain, embers, lightning);

  return { group, rain, embers, lightning };
};

const createParticleSheet = (
  count: number,
  spread: number,
  height: number,
  color: number,
  size: number,
  opacity: number,
) => {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * spread;
    positions[index * 3 + 1] = Math.random() * height + 10;
    positions[index * 3 + 2] = (Math.random() - 0.5) * spread;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color,
    opacity: 0,
    size,
    transparent: true,
    depthWrite: false,
  });
  material.userData.targetOpacity = opacity;

  return new THREE.Points(geometry, material);
};

const createLightning = () => {
  const points = [
    new THREE.Vector3(-30, 94, -110),
    new THREE.Vector3(-22, 72, -106),
    new THREE.Vector3(-34, 55, -112),
    new THREE.Vector3(-18, 36, -108),
    new THREE.Vector3(-24, 20, -104),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0xd9f7ff,
    transparent: true,
    opacity: 0,
  });
  return new THREE.Line(geometry, material);
};

const animateWeatherEffects = (
  effects: WeatherEffects,
  elapsed: number,
  weather: WeatherSnapshot,
) => {
  const rainPositions = effects.rain.geometry.attributes.position.array as Float32Array;
  const emberPositions = effects.embers.geometry.attributes.position.array as Float32Array;

  for (let index = 0; index < rainPositions.length; index += 3) {
    rainPositions[index + 1] -= 0.9 + weather.dials.wind * 2.2;
    rainPositions[index] += weather.dials.wind * 0.08;
    if (rainPositions[index + 1] < 1) {
      rainPositions[index + 1] = 132;
    }
  }

  for (let index = 0; index < emberPositions.length; index += 3) {
    emberPositions[index + 1] -= 0.16 + weather.dials.wind * 0.22;
    emberPositions[index] += Math.sin(elapsed + index) * 0.035 + weather.dials.wind * 0.05;
    if (emberPositions[index + 1] < 2) {
      emberPositions[index + 1] = 112;
    }
  }

  effects.rain.geometry.attributes.position.needsUpdate = true;
  effects.embers.geometry.attributes.position.needsUpdate = true;
  effects.rain.material.opacity =
    weather.dials.rain * Number(effects.rain.material.userData.targetOpacity);
  effects.embers.material.opacity =
    weather.dials.fireWeather * Number(effects.embers.material.userData.targetOpacity);
  effects.lightning.material.opacity =
    weather.dials.lightning > 0.08 && Math.sin(elapsed * 8.5) > 0.86
      ? 0.35 + weather.dials.lightning * 0.65
      : 0;
};

type WeatherSceneTargets = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sunlight: THREE.DirectionalLight;
  hemisphereLight: THREE.HemisphereLight;
  skyDome: SkyDome;
  horizonHaze: THREE.Group;
  water: WaterSurface;
  sunDisc: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  clouds: THREE.Group;
  weather: WeatherSnapshot;
  elapsed: number;
  driveState: DriveState;
  cameraTarget: THREE.Vector3;
  desiredCameraPosition: THREE.Vector3;
  desiredCameraTarget: THREE.Vector3;
  tempForward: THREE.Vector3;
  tempSide: THREE.Vector3;
};

const getCameraPresetForState = (driveState: DriveState) =>
  CAMERA_PRESETS[clamp(driveState.cameraPresetIndex, 0, CAMERA_PRESETS.length - 1)];

const getScenicCameraPresetForState = (driveState: DriveState) => {
  if (driveState.scenicCameraPresetIndex < 0) {
    return null;
  }

  return SCENIC_CAMERA_PRESETS[
    clamp(driveState.scenicCameraPresetIndex, 0, SCENIC_CAMERA_PRESETS.length - 1)
  ];
};

const getFrameCameraLabel = (driveState: DriveState) => {
  if (driveState.scenicCameraManualLook) {
    return "Manual Look";
  }

  return getScenicCameraPresetForState(driveState)?.name ?? "Standard Frame View";
};

const getDriveCameraPosition = (driveState: DriveState, preset: CameraPreset) => {
  const forward = getBoatForward(driveState.yaw);
  return new THREE.Vector3(
    driveState.x - forward.x * preset.distance,
    BOAT_HOME.y + preset.height,
    driveState.z - forward.z * preset.distance,
  );
};

const skyColorScratch = new THREE.Color();
const horizonColorScratch = new THREE.Color();
const fogColorScratch = new THREE.Color();
const cloudColorScratch = new THREE.Color();

const applyWeatherToScene = ({
  scene,
  camera,
  sunlight,
  hemisphereLight,
  skyDome,
  horizonHaze,
  water,
  sunDisc,
  clouds,
  weather,
  elapsed,
  driveState,
  cameraTarget,
  desiredCameraPosition,
  desiredCameraTarget,
  tempForward,
  tempSide,
}: WeatherSceneTargets) => {
  const dark = weather.dials.skyDark;
  const fire = weather.dials.fireWeather;
  const fog = weather.dials.fog;
  const palette = getWeatherPalette(weather.stormIndex);
  const daylightRelief = Math.max(0, 1 - dark);
  const skyColor = skyColorScratch.setHex(palette.skyTop);
  horizonColorScratch.setHex(palette.skyHorizon);
  skyColor.lerp(horizonColorScratch, 0.2 + daylightRelief * 0.18);
  if (weather.staleData) {
    skyColor.lerp(fogColorScratch.setHex(palette.fogColor), 0.22);
  }

  scene.background = skyColor;
  skyDome.mesh.position.copy(camera.position);
  skyDome.mesh.material.uniforms.topColor.value.setHex(palette.skyTop);
  skyDome.mesh.material.uniforms.horizonColor.value.setHex(palette.skyHorizon);
  skyDome.mesh.material.uniforms.fireColor.value.setHex(fire > 0.08 ? 0x5b160f : palette.sunColor);
  skyDome.mesh.material.uniforms.sunDir.value.set(-0.36, 0.72 - dark * 0.28, -0.44).normalize();
  skyDome.mesh.material.uniforms.dark.value = dark;
  skyDome.mesh.material.uniforms.fog.value = fog;
  skyDome.mesh.material.uniforms.fire.value = fire;
  skyDome.mesh.material.uniforms.stale.value = weather.staleData ? 1 : 0;
  skyDome.mesh.material.uniforms.flash.value =
    weather.dials.lightning > 0.08 && Math.sin(elapsed * 8.5) > 0.88
      ? weather.dials.lightning * 0.24
      : 0;
  skyDome.mesh.material.uniforms.time.value = elapsed;
  if (scene.fog instanceof THREE.FogExp2) {
    fogColorScratch.setHex(palette.fogColor);
    scene.fog.color.copy(fogColorScratch);
    scene.fog.density = 0.00046 + fog * 0.012 + weather.stormDarkness * 0.0028;
  }

  sunlight.intensity = Math.max(0.16, 4.25 * (1 - dark * 0.82) + daylightRelief * 0.18);
  sunlight.color.setHex(fire > 0.08 ? palette.sunColor : palette.directionalLight);
  hemisphereLight.intensity = Math.max(0.24, 1.64 * (1 - dark * 0.66));
  hemisphereLight.color.setHex(palette.ambientLight);
  hemisphereLight.groundColor.setHex(palette.shorelineGrass);
  sunDisc.material.color.setHex(palette.sunColor);
  sunDisc.visible = dark < 0.72 || fire > 0.38;

  water.mesh.visible = true;

  clouds.children.forEach((cloud, index) => {
    const baseX = Number(cloud.userData.baseX ?? cloud.position.x);
    const baseY = Number(cloud.userData.baseY ?? cloud.position.y);
    const baseZ = Number(cloud.userData.baseZ ?? cloud.position.z);
    const baseScale = Number(cloud.userData.baseScale ?? 1);
    const phase = Number(cloud.userData.phase ?? index);
    cloud.position.set(
      baseX + Math.sin(elapsed * 0.018 + phase) * (3.6 + weather.dials.wind * 5.2),
      baseY - dark * 14 + Math.sin(elapsed * 0.12 + phase) * 1.2,
      baseZ + Math.cos(elapsed * 0.014 + phase * 0.7) * (2.2 + weather.dials.wind * 4.2),
    );
    cloud.scale.setScalar(baseScale * (1 + dark * 0.18 + weather.dials.wind * 0.04));
    cloud.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
        cloudColorScratch.setHex(dark > 0.48 ? palette.stormTint : 0xd8dfd6);
        child.material.color.copy(cloudColorScratch);
        const baseOpacity = Number(child.userData.baseOpacity ?? 0.22);
        child.material.opacity = baseOpacity * (0.82 + dark * 0.42 + weather.dials.fog * 0.24);
      }
    });
  });

  horizonHaze.children.forEach((band, index) => {
    if (band instanceof THREE.Mesh && band.material instanceof THREE.MeshBasicMaterial) {
      band.material.color.setHex(fire > 0.25 ? palette.skyHorizon : index === 0 ? 0x425d5e : 0x2d454b);
      const baseOpacity = Number(band.userData.baseOpacity ?? 0.05);
      band.material.opacity = baseOpacity + fog * 0.13 + dark * 0.04;
    }
  });

  const shake = weather.dials.cameraShake;
  const preset = getCameraPresetForState(driveState);
  if (driveState.mode === "Drive") {
    driveState.cameraYaw = driveState.yaw;
  } else {
    driveState.cameraYaw = driveState.yaw;
  }

  tempForward.copy(getBoatForward(driveState.cameraYaw));
  tempSide.set(-tempForward.z, 0, tempForward.x);

  if (driveState.mode === "Drive") {
    tempForward.copy(getBoatForward(driveState.yaw));
    desiredCameraPosition
      .copy(tempForward)
      .multiplyScalar(-preset.distance)
      .add(new THREE.Vector3(driveState.x, BOAT_HOME.y + preset.height, driveState.z));
    desiredCameraTarget
      .copy(tempForward)
      .multiplyScalar(preset.lookAhead)
      .add(new THREE.Vector3(driveState.x, BOAT_HOME.y + preset.lookHeight, driveState.z));
  } else {
    const scenicPreset = getScenicCameraPresetForState(driveState);
    const tableauPreset = scenicPreset ?? driveState.savedTableau.camera;
    const lookYaw = driveState.yaw + (scenicPreset?.yawOffset ?? 0) + driveState.lookYaw;
    const lookPitch = (scenicPreset?.lookPitch ?? 0) + driveState.lookPitch;
    tempForward.set(Math.cos(lookYaw), lookPitch, Math.sin(lookYaw)).normalize();
    tempSide.set(-tempForward.z, 0, tempForward.x);
    desiredCameraPosition
      .set(driveState.x, BOAT_HOME.y + tableauPreset.height, driveState.z)
      .addScaledVector(tempForward, -tableauPreset.distance)
      .addScaledVector(tempSide, scenicPreset?.sideOffset ?? driveState.lookYaw * 10);
    desiredCameraTarget
      .set(driveState.x, BOAT_HOME.y + tableauPreset.lookHeight, driveState.z)
      .addScaledVector(tempForward, tableauPreset.lookAhead);
  }

  const cameraShake = driveState.mode === "Drive" ? 0 : shake;
  desiredCameraPosition.x += Math.sin(elapsed * 8.7) * cameraShake * 0.48;
  desiredCameraPosition.y += Math.sin(elapsed * 11.1) * cameraShake * 0.28;
  desiredCameraPosition.z += Math.cos(elapsed * 7.5) * cameraShake * 0.42;
  desiredCameraPosition.y = Math.max(9, desiredCameraPosition.y);
  camera.position.lerp(
    desiredCameraPosition,
    driveState.mode === "Drive" ? DRIVE_CAMERA_DAMPING : FRAME_CAMERA_DAMPING,
  );
  cameraTarget.lerp(desiredCameraTarget, driveState.mode === "Drive" ? 0.32 : 0.08);
  camera.lookAt(cameraTarget);
};

const createStatusPill = () => {
  const status = document.createElement("div");
  status.className = "status-pill";
  const dot = document.createElement("span");
  dot.className = "status-pill__dot";
  const label = document.createElement("span");
  label.textContent = BUILD_INFO.phase;
  status.append(dot, label);
  return status;
};

const createDriveHud = () => {
  const hud = document.createElement("div");
  hud.className = "drive-hud";
  hud.setAttribute("aria-live", "polite");
  hud.textContent = "FRAME MODE - Living art view";
  return hud;
};

const createDriveSpeedometer = () => {
  const meter = document.createElement("div");
  meter.className = "drive-speedometer";
  meter.setAttribute("aria-hidden", "true");
  meter.innerHTML = `
    <div class="drive-speedometer__dial">
      <span class="drive-speedometer__tick drive-speedometer__tick--zero">0</span>
      <span class="drive-speedometer__tick drive-speedometer__tick--max">120</span>
      <span class="drive-speedometer__needle"></span>
      <span class="drive-speedometer__hub"></span>
    </div>
    <div class="drive-speedometer__readout"><strong data-drive-speed-value>0</strong><span>speed</span></div>
  `;
  return meter;
};

const showDriveHud = (hud: HTMLDivElement, mode: "Frame" | "Drive") => {
  hud.dataset.mode = mode;
  document.body.classList.toggle("hashlake-drive-active", mode === "Drive");
  hud.dataset.visibleUntil =
    mode === "Frame" ? String(window.performance.now() + 2200) : "always";
  hud.textContent =
    mode === "Drive"
      ? "DRIVE - Speed 0 - Camera locked"
      : "FRAME MODE - Living art view";
  hud.classList.add("drive-hud--visible");
};

const showDriveHudMessage = (hud: HTMLDivElement, message: string) => {
  hud.dataset.visibleUntil = String(window.performance.now() + 2400);
  hud.textContent = message;
  hud.classList.add("drive-hud--visible");
};

const animateDriveHud = (
  hud: HTMLDivElement,
  driveState: DriveState,
  timestamp: number,
) => {
  if (driveState.mode !== driveState.lastMode) {
    showDriveHud(hud, driveState.mode);
    driveState.lastMode = driveState.mode;
  }

  if (driveState.mode === "Drive") {
    document.body.classList.add("hashlake-drive-active");
    hud.textContent = `DRIVE - Speed ${Math.abs(
      driveState.speed,
    ).toFixed(0)} - Camera locked`;
    hud.classList.add("drive-hud--visible");
    return;
  }

  document.body.classList.remove("hashlake-drive-active");

  if (timestamp < driveState.scenicCameraLabelUntil) {
    const scenicPreset = getScenicCameraPresetForState(driveState);
    hud.dataset.mode = "Frame";
    hud.dataset.visibleUntil = String(driveState.scenicCameraLabelUntil);
    hud.textContent = `Frame Camera - ${
      driveState.scenicCameraManualLook
        ? "Manual Look"
        : scenicPreset?.name ?? "Standard"
    }`;
    hud.classList.add("drive-hud--visible");
    return;
  }

  const visibleUntil = Number(hud.dataset.visibleUntil ?? 0);
  hud.classList.toggle("drive-hud--visible", timestamp < visibleUntil);
};

const animateDriveSpeedometer = (
  meter: HTMLDivElement,
  driveState: DriveState,
) => {
  const visible = driveState.mode === "Drive";
  meter.classList.toggle("drive-speedometer--visible", visible);
  if (!visible) {
    return;
  }

  const displaySpeed = Math.round(clamp(Math.abs(driveState.speed), 0, DRIVE_SUPER_BOOST_MAX_SPEED));
  const speedRatio = clamp(displaySpeed / DRIVE_SUPER_BOOST_MAX_SPEED, 0, 1);
  meter.style.setProperty("--speed-ratio", speedRatio.toFixed(3));
  meter.style.setProperty("--needle-angle", `${(-116 + speedRatio * 232).toFixed(1)}deg`);
  const value = meter.querySelector<HTMLElement>("[data-drive-speed-value]");
  if (value && value.textContent !== String(displaySpeed)) {
    value.textContent = String(displaySpeed);
  }
};

const animateStatus = (status: HTMLDivElement, elapsed: number) => {
  const dot = status.querySelector<HTMLSpanElement>(".status-pill__dot");
  if (!dot) {
    return;
  }

  const pulse = 0.7 + Math.sin(elapsed * 2) * 0.3;
  dot.style.opacity = pulse.toFixed(2);
};
