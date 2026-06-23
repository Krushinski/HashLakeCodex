import * as THREE from "three";
import type { HashlakeEventBus } from "../state/eventBus";
import type { WeatherSnapshot, WeatherStore } from "../state/weatherEngine";
import { SCENARIO_PALETTES, getWeatherPalette } from "./artDirection";
import { createSceneEffects } from "./effects";
import { createForestSystem } from "./forestSystem";
import {
  LAKE_MAP,
  clampBoatToWater,
  getExpandedOutline,
  getNearestLocation,
} from "./lakeMap";
import { createPostSystem } from "./postSystem";
import { createScenicAssetSystem, type ScenicAssetStatuses } from "./scenicAssets";
import { createTerrainSystem } from "./terrainSystem";
import {
  type WaterDebugMode,
  type WaterSurface,
  animateWater,
  createWater,
} from "./waterSystem";

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
  setQualityPreset: (preset: QualityPreset) => void;
  setFxVisibilityTest: (enabled: boolean) => void;
  setWaterMode: (mode: WaterDebugMode) => void;
  triggerWakeVisibilityBurst: () => void;
};

const CAMERA_HOME = new THREE.Vector3(0, 46, 126);
const BOAT_HOME = new THREE.Vector3(0, 2.2, 0);
const TABLEAU_STORAGE_KEY = "hashlake.tableau.v1";
const SCENIC_CAMERA_STORAGE_KEY = "hashlake.scenicCamera.v1";
const DRIVE_ACCELERATION_BASE = 23;
const DRIVE_ACCELERATION_RAMP = 51;
const DRIVE_MAX_SPEED = 52;
const DRIVE_BOOST_MAX_SPEED = 90;
const DRIVE_BOOST_MULTIPLIER = 1.58;
const DRIVE_BOOST_IMPULSE = 16;
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
const WAKE_BLOCK_SIZE_MIN = 0.38;
const WAKE_BLOCK_SIZE_MAX = 1.18;
const WAKE_VERTICAL_VELOCITY = 0.16;
const WAKE_BACKWARD_VELOCITY = 5.4;
const WAKE_OUTWARD_SPREAD = 3.15;
const WAKE_LIFETIME_SECONDS = 0.86;
const WAKE_EMISSION_RATE = 92;
const WAKE_BOOST_MULTIPLIER = 1.72;
const WAKE_SURFACE_Y_OFFSET = 0.74;
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
  pixelRatio: number;
  qualityMode: QualityPreset;
  qualityPreset: QualityPreset;
  renderScale: number;
  activeWakeBlocks: number;
  activeEffectBlocks: number;
  activeRings: number;
  activeSplashes: number;
  lastSplashDistanceToBoat: number | null;
  lastBoatImpulseStrength: number;
  treeInstances: number;
  forestBandInstances: number;
  forestBandMethod: string;
  reedInstances: number;
  mountainVertices: number;
  postEnabled: boolean;
  reflectionEnabled: boolean;
  fxVisibilityTest: boolean;
  waterMode: WaterDebugMode;
  scenicAssets: ScenicAssetStatuses;
};

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
  waterMode: WaterDebugMode;
};

type DriveInput = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  boost: boolean;
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
    name: "Wide Reflection",
    distance: 104,
    height: 30,
    lookAhead: 24,
    lookHeight: 6.6,
    yawOffset: Math.PI * 0.18,
    lookPitch: -0.02,
    sideOffset: -4,
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
  const lakeFill = createLakeFill();
  scene.add(lakeFill);
  const water = createWater();
  scene.add(water.mesh);
  const shoreline = createShoreline();
  scene.add(shoreline);
  const terrainSystem = createTerrainSystem();
  scene.add(terrainSystem.group);
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
  boat.rotation.y = getVisualRotationForHeading(driveState.yaw);
  const input: DriveInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    boost: false,
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
    waterMode: "Balanced",
  };
  let animationId = 0;
  let hasRenderedFrame = false;
  let isRunning = false;

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
    water.setWaterMode(qualityState.waterMode);
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
      scenicAssetsActive && scenicAssetStatuses.mountain === "loaded",
    );
    forestSystem.setScenicTreelineActive(
      scenicAssetsActive && scenicAssetStatuses.treeline === "loaded",
    );
    updateDriveState(driveState, input, delta, weather);
    animateWater(water, elapsed, weather, driveState, camera);
    animateShoreline(shoreline, elapsed, weather);
    terrainSystem.update(weather, camera);
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
      lakeFill,
      sunDisc,
      clouds,
      weather,
      waterMode: qualityState.waterMode,
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
    } else if (key === " ") {
      event.preventDefault();
      input.anchor = isDown;
    }
  };
  const handleKeydown = (event: KeyboardEvent) => handleKey(event, true);
  const handleKeyup = (event: KeyboardEvent) => handleKey(event, false);

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
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      status.remove();
      driveHud.remove();
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
          pixelRatio: qualityState.pixelRatio,
          qualityMode: qualityState.preset,
          qualityPreset: qualityState.preset,
          renderScale: qualityState.effectScale,
          activeWakeBlocks: getActiveWakeBlocks(),
          activeEffectBlocks: effectStats.splashBlocks,
          activeRings: effectStats.rings,
          activeSplashes: effectStats.splashes,
          lastSplashDistanceToBoat: effectStats.lastSplashDistanceToBoat,
          lastBoatImpulseStrength: effectStats.lastBoatImpulseStrength,
          treeInstances: forestStats.treeInstances,
          forestBandInstances: forestStats.forestBandInstances,
          forestBandMethod: forestStats.forestBandMethod,
          reedInstances: forestStats.reedInstances,
          mountainVertices: terrainStats.mountainVertices,
          postEnabled: postSystem.enabled && terrainStats.postEnabled,
          reflectionEnabled: water.reflectionEnabled || terrainStats.reflectionEnabled,
          fxVisibilityTest: qualityState.fxVisibilityTest,
          waterMode: qualityState.waterMode,
          scenicAssets: scenicAssetSystem.getStatuses(),
        };
      })(),
    }),
    toggleDriveMode,
    setQualityPreset: (preset) => applyQualityPreset(preset, true),
    setFxVisibilityTest: (enabled) => {
      qualityState.fxVisibilityTest = enabled;
      sceneEffects.setVisibilityTest(enabled);
    },
    setWaterMode: (mode) => {
      qualityState.waterMode = mode;
      water.setWaterMode(mode);
    },
    triggerWakeVisibilityBurst: () => {
      driveState.wakeVisibilityBurstUntil = window.performance.now() + 1400;
      driveState.wakePower = Math.max(driveState.wakePower, 1.24);
    },
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
        vec3 cloudLit = vec3(1.05, 1.01, 0.96) * (0.92 + toSun * 0.12);
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

const createLakeFill = () => {
  const shape = new THREE.Shape(
    LAKE_MAP.outline.map((point) => new THREE.Vector2(point.x, point.z)),
  );
  const material = new THREE.MeshBasicMaterial({
    color: 0x075f96,
    transparent: true,
    opacity: 0.9,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), material);
  mesh.name = "Blue lake depth fill";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.08;
  return mesh;
};

const createBoat = () => {
  const boat = new THREE.Group();
  boat.name = "Procedural motor skiff";
  boat.position.copy(BOAT_HOME);
  boat.scale.setScalar(0.78);

  const hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x6f3f25,
    roughness: 0.54,
    metalness: 0.04,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8b57c,
    roughness: 0.42,
  });
  const bowMarkerMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7f2dd,
    roughness: 0.34,
  });
  const motorMaterial = new THREE.MeshStandardMaterial({
    color: 0x20292d,
    roughness: 0.62,
    metalness: 0.08,
  });
  const windshieldMaterial = new THREE.MeshStandardMaterial({
    color: 0xa9d9ef,
    roughness: 0.2,
    metalness: 0.02,
    transparent: true,
    opacity: 0.68,
  });
  const personMaterial = new THREE.MeshStandardMaterial({
    color: 0x2e3e47,
    roughness: 0.8,
  });
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: 0xc58f65,
    roughness: 0.7,
  });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(11.5, 1.62, 3.12), hullMaterial);
  hull.castShadow = true;
  hull.scale.set(1, 0.82, 1);
  boat.add(hull);

  for (const side of [-1, 1]) {
    const hullSide = new THREE.Mesh(new THREE.BoxGeometry(10.35, 1.06, 0.36), hullMaterial);
    hullSide.position.set(-0.58, 0.08, side * 1.82);
    hullSide.rotation.x = side * -0.22;
    hullSide.castShadow = true;
    boat.add(hullSide);
  }

  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(10.1, 1.02, 2.36), hullMaterial);
  lowerHull.position.set(-0.72, -0.7, 0);
  lowerHull.scale.set(1, 0.68, 0.92);
  lowerHull.castShadow = true;
  boat.add(lowerHull);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.76, 6.15, 4), hullMaterial);
  bow.rotation.z = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.x = 6.75;
  bow.scale.set(1.14, 0.8, 0.68);
  bow.castShadow = true;
  boat.add(bow);

  const bowStripe = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.14, 0.42), bowMarkerMaterial);
  bowStripe.position.set(4.35, 1.06, 0);
  bowStripe.castShadow = true;
  boat.add(bowStripe);

  const bowDeck = new THREE.Mesh(new THREE.ConeGeometry(1.05, 3.65, 4), trimMaterial);
  bowDeck.rotation.z = Math.PI / 2;
  bowDeck.rotation.y = Math.PI / 4;
  bowDeck.position.set(4.7, 1.34, 0);
  bowDeck.scale.set(0.98, 0.24, 0.62);
  bowDeck.castShadow = true;
  boat.add(bowDeck);

  const bowLight = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.34, 0.62), bowMarkerMaterial);
  bowLight.position.set(7.48, 0.98, 0);
  bowLight.castShadow = true;
  boat.add(bowLight);

  const keel = new THREE.Mesh(new THREE.ConeGeometry(0.96, 10.45, 4), hullMaterial);
  keel.rotation.z = Math.PI / 2;
  keel.rotation.y = Math.PI / 4;
  keel.scale.set(1, 0.32, 0.58);
  keel.position.set(-0.72, -0.73, 0);
  keel.castShadow = true;
  boat.add(keel);

  const stern = new THREE.Mesh(new THREE.BoxGeometry(0.82, 2.0, 3.62), trimMaterial);
  stern.position.set(-6.22, 0.04, 0);
  stern.castShadow = true;
  boat.add(stern);

  const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.38, 3.18), trimMaterial);
  rearDeck.position.set(-4.55, 1.18, 0);
  rearDeck.castShadow = true;
  boat.add(rearDeck);

  for (const side of [-1, 1]) {
    const gunwale = new THREE.Mesh(new THREE.BoxGeometry(10.25, 0.3, 0.28), trimMaterial);
    gunwale.position.set(-0.5, 1.16, side * 1.84);
    gunwale.castShadow = true;
    boat.add(gunwale);
  }

  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.82, 1.82), trimMaterial);
  cockpit.position.set(1.0, 1.58, 0);
  cockpit.castShadow = true;
  boat.add(cockpit);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.98, 1.98), windshieldMaterial);
  windshield.position.set(2.26, 2.08, 0);
  windshield.rotation.z = -0.18;
  boat.add(windshield);

  const motor = new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.7, 1.3), motorMaterial);
  motor.position.set(-7.0, 0.28, 0);
  motor.castShadow = true;
  boat.add(motor);

  const motorCap = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.54, 0.94), bowMarkerMaterial);
  motorCap.position.set(-7.62, 0.88, 0);
  motorCap.castShadow = true;
  boat.add(motorCap);

  const propGuard = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.44, 1.68), motorMaterial);
  propGuard.position.set(-8.02, -0.18, 0);
  propGuard.castShadow = true;
  boat.add(propGuard);

  const benchA = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.25, 3.0), trimMaterial);
  benchA.position.set(-2.1, 1.28, 0);
  benchA.castShadow = true;
  boat.add(benchA);

  const benchB = benchA.clone();
  benchB.position.x = 2.74;
  boat.add(benchB);

  const deckLineMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0d9a6,
    roughness: 0.38,
  });
  for (const side of [-1, 1]) {
    const rubRail = new THREE.Mesh(new THREE.BoxGeometry(10.65, 0.14, 0.14), deckLineMaterial);
    rubRail.position.set(-0.44, 0.76, side * 2.12);
    rubRail.castShadow = true;
    boat.add(rubRail);
  }

  const sternPlate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 2.2), deckLineMaterial);
  sternPlate.position.set(-6.65, 0.84, 0);
  sternPlate.castShadow = true;
  boat.add(sternPlate);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 1.5, 4, 8), personMaterial);
  body.position.set(-0.42, 2.75, 0);
  body.rotation.z = -0.12;
  body.castShadow = true;
  boat.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), skinMaterial);
  head.position.set(-0.84, 3.8, 0);
  head.castShadow = true;
  boat.add(head);

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
  const maxForwardSpeed = input.boost ? DRIVE_BOOST_MAX_SPEED : DRIVE_MAX_SPEED;
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
      (input.boost ? 0.32 : 0),
    0,
    input.boost ? 1.34 : 1.04,
  );
  driveState.wakePower += (wakeTarget - driveState.wakePower) * Math.min(1, delta * 4.4);

  if (throttleActive) {
    if (boostJustPressed && driveState.speed > 8) {
      driveState.speed = Math.min(maxForwardSpeed, driveState.speed + DRIVE_BOOST_IMPULSE);
      driveState.wakePower = Math.min(1.32, driveState.wakePower + 0.36);
      driveState.boostKick = 1;
    }
    const acceleration =
      (DRIVE_ACCELERATION_BASE + DRIVE_ACCELERATION_RAMP * throttleRamp) *
      (input.boost ? DRIVE_BOOST_MULTIPLIER : 1);
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
    BOAT_HOME.y + hop * 2.2 + Math.sin(elapsed * speed) * (0.24 + instability * 1.2);
  boat.rotation.z =
    Math.sin(elapsed * (0.9 + instability)) * (0.05 + instability * 0.25) - turnBank;
  boat.rotation.x =
    Math.cos(elapsed * (0.72 + instability)) * (0.04 + instability * 0.18) - bowLift;
  boat.rotation.y = getVisualRotationForHeading(driveState.yaw);
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

const createEllipseOutline = (
  center: { x: number; z: number },
  radiusX: number,
  radiusZ: number,
  rotation: number,
  count = 48,
) =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const localX = Math.cos(angle) * radiusX;
    const localZ = Math.sin(angle) * radiusZ;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
      x: center.x + localX * cos - localZ * sin,
      z: center.z + localX * sin + localZ * cos,
    };
  });

const createShoreline = () => {
  const group = new THREE.Group();
  group.name = "Organic mountain lake terrain";
  const sandMaterial = new THREE.MeshStandardMaterial({
    color: 0xc4b27b,
    roughness: 0.88,
  });
  const wetSandMaterial = new THREE.MeshStandardMaterial({
    color: 0x67634e,
    roughness: 0.96,
  });
  const bankMaterial = new THREE.MeshStandardMaterial({
    color: 0x213b2a,
    roughness: 0.94,
  });
  const shallowMaterial = new THREE.MeshBasicMaterial({
    color: 0x3f827d,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const landMaterial = new THREE.MeshStandardMaterial({
    color: 0x14291c,
    roughness: 0.92,
  });
  const land = new THREE.Mesh(
    new THREE.CircleGeometry(LAKE_MAP.worldRadius, 128),
    landMaterial,
  );
  land.rotation.x = -Math.PI / 2;
  land.position.y = -0.42;
  land.receiveShadow = true;
  group.add(land);

  const wetSand = new THREE.Mesh(
    createStripGeometry(LAKE_MAP.outline, getExpandedOutline(13)),
    wetSandMaterial,
  );
  wetSand.position.y = 0.035;
  wetSand.receiveShadow = true;
  group.add(wetSand);

  const shoreline = new THREE.Mesh(
    createStripGeometry(getExpandedOutline(13), getExpandedOutline(LAKE_MAP.shorelineWidth)),
    sandMaterial,
  );
  shoreline.position.y = 0.025;
  shoreline.receiveShadow = true;
  group.add(shoreline);

  const grassTransition = new THREE.Mesh(
    createStripGeometry(getExpandedOutline(48), getExpandedOutline(82)),
    new THREE.MeshStandardMaterial({
      color: 0x1b3321,
      roughness: 0.96,
    }),
  );
  grassTransition.position.y = 0.006;
  grassTransition.receiveShadow = true;
  group.add(grassTransition);

  const raisedBank = new THREE.Mesh(
    createStripGeometry(getExpandedOutline(34), getExpandedOutline(62)),
    bankMaterial,
  );
  raisedBank.position.y = 0;
  raisedBank.receiveShadow = true;
  group.add(raisedBank);

  const shallow = new THREE.Mesh(
    createStripGeometry(getExpandedOutline(-26), LAKE_MAP.outline),
    shallowMaterial,
  );
  shallow.position.y = 0.11;
  group.add(shallow);

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
  const dockMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5b36, roughness: 0.72 });
  const sandMaterial = new THREE.MeshStandardMaterial({
    color: 0xc4b27b,
    roughness: 0.92,
  });
  const sandShallowMaterial = new THREE.MeshBasicMaterial({
    color: 0x4e8c86,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: SCENARIO_PALETTES.Serene.rock,
    roughness: 0.9,
  });
  const darkRockMaterial = new THREE.MeshStandardMaterial({ color: 0x4c5655, roughness: 0.96 });
  const reedMaterial = new THREE.MeshStandardMaterial({ color: 0x6f8147, roughness: 0.86 });
  const pineMaterial = new THREE.MeshStandardMaterial({
    color: 0x24492b,
    roughness: 0.88,
  });
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x91f2bf });
  const lanternMaterial = new THREE.MeshBasicMaterial({ color: 0xffd37d });
  const dockCenter = getDestinationCenter("dock");
  const sandbarCenter = getDestinationCenter("sandbar");
  const coveCenter = getDestinationCenter("cove");
  const islandCenter = getDestinationCenter("island");
  const reedsCenter = getDestinationCenter("reeds");

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

  const sandbarHaloShape = new THREE.Shape(
    createEllipseOutline(
      { x: 0, z: 0 },
      LAKE_MAP.sandbar.radiusX + 28,
      LAKE_MAP.sandbar.radiusZ + 14,
      0,
    ).map((point) => new THREE.Vector2(point.x, point.z)),
  );
  const sandbarHalo = new THREE.Mesh(new THREE.ShapeGeometry(sandbarHaloShape, 8), sandShallowMaterial);
  sandbarHalo.name = "Sandbar shallows";
  sandbarHalo.position.set(sandbarCenter.x, 0.13, sandbarCenter.z);
  sandbarHalo.rotation.x = -Math.PI / 2;
  sandbarHalo.rotation.z = LAKE_MAP.sandbar.rotation;
  group.add(sandbarHalo);

  const sandbarShape = new THREE.Shape(
    createEllipseOutline(
      { x: 0, z: 0 },
      LAKE_MAP.sandbar.radiusX,
      LAKE_MAP.sandbar.radiusZ,
      0,
    ).map((point) => new THREE.Vector2(point.x, point.z)),
  );
  const sandbar = new THREE.Mesh(new THREE.ShapeGeometry(sandbarShape, 8), sandMaterial);
  sandbar.name = "Sandbar";
  sandbar.position.set(sandbarCenter.x, 0.08, sandbarCenter.z);
  sandbar.rotation.x = -Math.PI / 2;
  sandbar.rotation.z = LAKE_MAP.sandbar.rotation;
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
  const islandShape = new THREE.Shape(
    createEllipseOutline(
      { x: 0, z: 0 },
      LAKE_MAP.island.radiusX,
      LAKE_MAP.island.radiusZ,
      0,
    ).map((point) => new THREE.Vector2(point.x, point.z)),
  );
  const islandBase = new THREE.Mesh(new THREE.ShapeGeometry(islandShape, 8), rockMaterial);
  islandBase.position.set(islandCenter.x, 0.25, islandCenter.z);
  islandBase.rotation.x = -Math.PI / 2;
  islandBase.rotation.z = LAKE_MAP.island.rotation;
  islandBase.receiveShadow = true;
  island.add(islandBase);
  for (let index = 0; index < 8; index += 1) {
    const angle = index * 0.78;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(3.8 + (index % 3)), rockMaterial);
    rock.position.set(
      islandCenter.x + Math.cos(angle) * 12,
      2.3,
      islandCenter.z + Math.sin(angle) * 8,
    );
    rock.scale.y = 0.58 + (index % 4) * 0.14;
    rock.rotation.set(index * 0.22, angle, index * 0.17);
    rock.castShadow = true;
    island.add(rock);
  }
  const islandBank = new THREE.Mesh(
    new THREE.ShapeGeometry(
      new THREE.Shape(
        createEllipseOutline(
          { x: 0, z: 0 },
          LAKE_MAP.island.radiusX + 6,
          LAKE_MAP.island.radiusZ + 4,
          0,
        ).map((point) => new THREE.Vector2(point.x, point.z)),
      ),
      8,
    ),
    sandMaterial,
  );
  islandBank.position.set(islandCenter.x, 0.14, islandCenter.z);
  islandBank.rotation.x = -Math.PI / 2;
  islandBank.rotation.z = LAKE_MAP.island.rotation;
  islandBank.receiveShadow = true;
  island.add(islandBank);
  for (let index = 0; index < 5; index += 1) {
    const tree = new THREE.Mesh(new THREE.ConeGeometry(2.2, 8, 7), pineMaterial);
    tree.position.set(
      islandCenter.x - 11 + index * 5.4,
      5.2,
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
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 6 + (index % 4), 5), reedMaterial);
    const base = {
      x: reedsCenter.x + (index % 12) * 3.2 - 16,
      z: reedsCenter.z + Math.floor(index / 12) * 5 - 7,
    };
    reed.position.set(
      base.x + Math.sin(index * 1.8) * 2.8,
      2.5,
      base.z + Math.cos(index * 1.3) * 2.2,
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
  const sun = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), material);
  sun.position.set(-104, 92, -170);
  return sun;
};

const createClouds = () => {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xf4f1df,
    roughness: 0.75,
    transparent: true,
    opacity: 0.82,
  });

  for (let index = 0; index < 8; index += 1) {
    const cloud = new THREE.Group();
    cloud.name = "Procedural cloud";
    cloud.position.set(
      -270 + index * 74,
      82 + (index % 4) * 6,
      -185 - (index % 5) * 22,
    );
    cloud.scale.setScalar(0.68 + (index % 5) * 0.1);

    for (let puff = 0; puff < 4; puff += 1) {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(6 + puff * 0.9, 10, 6), material);
      sphere.position.set(puff * 7.4, Math.sin(puff + index) * 2.2, Math.cos(puff) * 2.8);
      sphere.scale.set(1.1 + puff * 0.08, 0.45 + (puff % 2) * 0.08, 0.72);
      cloud.add(sphere);
    }

    group.add(cloud);
  }

  return group;
};

const createHorizonHaze = () => {
  const group = new THREE.Group();
  group.name = "Atmospheric horizon haze";
  const bands = [
    { y: 32, z: -540, height: 70, opacity: 0.22 },
    { y: 70, z: -690, height: 108, opacity: 0.16 },
    { y: 120, z: -840, height: 150, opacity: 0.1 },
  ];

  bands.forEach((band, index) => {
    const material = new THREE.MeshBasicMaterial({
      color: index === 0 ? 0xc9e4e9 : 0x9fc2cc,
      transparent: true,
      opacity: band.opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1700, band.height), material);
    mesh.position.set(0, band.y, band.z);
    mesh.name = "Horizon haze band";
    group.add(mesh);
  });

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
  const visibilityScale = visibilityTest ? 1.58 : 1;
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
      ? (Math.random() - 0.5) * WAKE_OUTWARD_SPREAD * (reverseChurn ? 0.24 : 0.34)
      : 0.42 + speedRatio * WAKE_OUTWARD_SPREAD * (reverseChurn ? 0.22 : 0.56) + wakePower * 0.58;
  const rearDistance =
    side === 0
      ? 7.85 + Math.random() * 0.78
      : 8.05 + speedRatio * WAKE_BACKWARD_VELOCITY * (reverseChurn ? 0.24 : 0.42) + Math.random() * 1.08;
  segment.mesh.position
    .set(
      driveState.x,
      WAKE_SURFACE_Y_OFFSET + Math.random() * WAKE_VERTICAL_VELOCITY + (visibilityTest ? 0.16 : 0),
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
    WAKE_LIFETIME_SECONDS + speedRatio * 0.16 + wakePower * 0.1 + (visibilityTest ? 0.16 : 0);
  segment.active = true;
  segment.side = side;
  segment.speedRatio = speedRatio;
  segment.baseScale =
    clamp(
      WAKE_BLOCK_SIZE_MIN +
        Math.random() * (WAKE_BLOCK_SIZE_MAX - WAKE_BLOCK_SIZE_MIN) +
        wakePower * 0.16,
      WAKE_BLOCK_SIZE_MIN,
      WAKE_BLOCK_SIZE_MAX * boostIntensity * visibilityScale,
    );
  segment.heightScale =
    (visibilityTest ? 0.38 : 0.28) + Math.random() * 0.16 + wakePower * (visibilityTest ? 0.1 : 0.07);
  segment.lengthScale =
    (reverseChurn ? 0.86 : 1.08) +
    speedRatio * (visibilityTest ? 0.88 : 0.54) +
    Math.random() * 0.38;
  segment.driftX =
    forward.x * -(WAKE_BACKWARD_VELOCITY + speedRatio * 1.65) * boostIntensity * (reverseChurn ? 0.24 : 0.82) +
    lateral.x * side * (0.34 + speedRatio * 0.86);
  segment.driftZ =
    forward.z * -(WAKE_BACKWARD_VELOCITY + speedRatio * 1.65) * boostIntensity * (reverseChurn ? 0.24 : 0.82) +
    lateral.z * side * (0.34 + speedRatio * 0.86);
  segment.spin = (Math.random() - 0.5) * (0.58 + wakePower * 0.26);
  segment.mesh.material.color.set(speedRatio > 0.35 || wakePower > 0.42 || visibilityTest ? 0xffffff : 0xf0fbff);
  segment.mesh.material.opacity = clamp(
    (visibilityTest ? 0.96 : 0.86) + speedRatio * 0.12 + wakePower * 0.08,
    visibilityTest ? 0.9 : 0.82,
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
    1 / ((WAKE_EMISSION_RATE + wakePower * 46 + speedRatio * 30) * wakeQualityScale * (visibilityTest ? 1.9 : 1)),
    visibilityTest ? 0.007 : 0.012,
    0.042,
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
      (visibilityTest ? 0.14 : 0) +
      Math.sin(segment.age * 14 + segment.side * 1.7) * WAKE_VERTICAL_VELOCITY;
    segment.mesh.rotation.x += segment.spin * 0.04 * delta;
    segment.mesh.rotation.z += segment.spin * 0.48 * delta;
    segment.mesh.scale.set(
      segment.baseScale * segment.lengthScale * widen,
      Math.max(0.16, segment.heightScale * settle),
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
  lakeFill: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  sunDisc: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  clouds: THREE.Group;
  weather: WeatherSnapshot;
  waterMode: WaterDebugMode;
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
  lakeFill,
  sunDisc,
  clouds,
  weather,
  waterMode,
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

  lakeFill.material.color.setHex(palette.waterDeep);
  lakeFill.material.opacity = Math.max(0.5, 0.86 - weather.stormDarkness * 0.22);
  if (waterMode === "Deep Reflective") {
    lakeFill.material.color.setHex(0x023c78);
    lakeFill.material.opacity = 0.74;
  } else if (waterMode === "High Contrast Debug") {
    lakeFill.material.color.setHex(0x000724);
    lakeFill.material.opacity = 0.96;
  }
  water.mesh.visible = true;

  clouds.children.forEach((cloud, index) => {
    cloud.position.y = 70 - dark * 18 + Math.sin(elapsed * 0.2 + index) * 0.8;
    cloud.scale.setScalar(1 + dark * 1.35);
    cloud.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        cloudColorScratch.setHex(dark > 0.48 ? palette.stormTint : 0xf5f1df);
        child.material.color.copy(cloudColorScratch);
        child.material.opacity = 0.62 + dark * 0.28;
      }
    });
  });

  horizonHaze.children.forEach((band, index) => {
    if (band instanceof THREE.Mesh && band.material instanceof THREE.MeshBasicMaterial) {
      band.material.color.setHex(fire > 0.25 ? palette.skyHorizon : palette.fogColor);
      band.material.opacity = (0.1 + index * 0.045) + fog * 0.24 + dark * 0.08;
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
  status.innerHTML = `
    <span class="status-pill__dot"></span>
    <span>Hashlake Phase 25</span>
  `;
  return status;
};

const createDriveHud = () => {
  const hud = document.createElement("div");
  hud.className = "drive-hud";
  hud.setAttribute("aria-live", "polite");
  hud.textContent = "FRAME MODE - Living art view";
  return hud;
};

const showDriveHud = (hud: HTMLDivElement, mode: "Frame" | "Drive") => {
  hud.dataset.mode = mode;
  hud.dataset.visibleUntil =
    mode === "Frame" ? String(window.performance.now() + 2200) : "always";
  hud.textContent =
    mode === "Drive"
      ? "DRIVE MODE - Up throttle / Left-right steer / Hold-drag upward on mobile"
      : "FRAME MODE - Living art view";
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
    hud.textContent = `DRIVE MODE - Hard-lock chase / Hold-drag upward to steer / Speed ${Math.abs(
      driveState.speed,
    ).toFixed(0)}`;
    hud.classList.add("drive-hud--visible");
    return;
  }

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

const animateStatus = (status: HTMLDivElement, elapsed: number) => {
  const dot = status.querySelector<HTMLSpanElement>(".status-pill__dot");
  if (!dot) {
    return;
  }

  const pulse = 0.7 + Math.sin(elapsed * 2) * 0.3;
  dot.style.opacity = pulse.toFixed(2);
};
