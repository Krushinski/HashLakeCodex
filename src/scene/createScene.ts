import * as THREE from "three";
import type { HashlakeEventBus } from "../state/eventBus";
import type { WeatherSnapshot, WeatherStore } from "../state/weatherEngine";
import { createSceneEffects } from "./effects";
import {
  LAKE_MAP,
  clampBoatToWater,
  getExpandedOutline,
  getNearestLocation,
  isWater,
} from "./lakeMap";

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
const TABLEAU_STORAGE_KEY = "hashlake.tableau.v1";
const DRIVE_ACCELERATION_BASE = 22;
const DRIVE_ACCELERATION_RAMP = 48;
const DRIVE_MAX_SPEED = 52;
const DRIVE_BOOST_MAX_SPEED = 72;
const DRIVE_BOOST_MULTIPLIER = 1.22;
const DRIVE_NATURAL_BRAKE_DRAG = 34;
const DRIVE_COAST_DRAG = 0.9;
const DRIVE_ACTIVE_BRAKE_FORCE = 82;
const DRIVE_REVERSE_SPEED = -15;
const DRIVE_REVERSE_DELAY_THRESHOLD = 2.4;
const DRIVE_ANCHOR_BRAKE_FORCE = 145;
const DRIVE_TURN_RATE_LOW_SPEED = 2.35;
const DRIVE_TURN_RATE_HIGH_SPEED = 0.82;
const DRIVE_STEER_EASE_IN = 7.8;
const DRIVE_STEER_EASE_OUT = 5.8;
const DRIVE_STEER_SENSITIVITY = 1;
const DRIVE_MAX_YAW_PER_SECOND = 1.45;
const DRIVE_SPEED_TURN_DAMPING = 0.58;
const DRIVE_WATER_RESISTANCE_TURN_DAMPING = 0.86;
const DRIVE_BOW_LIFT_SCALE = 0.13;
const DRIVE_BANK_SCALE = 0.14;
const DRIVE_CAMERA_DAMPING = 0.42;
const FRAME_CAMERA_DAMPING = 0.08;

type SceneTelemetry = {
  mode: "Frame" | "Drive";
  speed: number;
  position: {
    x: number;
    z: number;
  };
  heading: number;
  visualHeading: number;
  movementVector: {
    x: number;
    z: number;
  };
  steerInput: number;
  cameraPreset: string;
  nearestLocation: string;
  savedTableau: boolean;
};

type CameraPreset = {
  name: string;
  distance: number;
  height: number;
  lookAhead: number;
  lookHeight: number;
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
  mobilePointerId: number | null;
  mobileOriginX: number;
  mobileOriginY: number;
  mobileThrottle: boolean;
  mobileAnchor: boolean;
  mobileSteer: number;
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
    name: "High",
    distance: 64,
    height: 42,
    lookAhead: 9,
    lookHeight: 4.4,
  },
  {
    name: "Close",
    distance: 36,
    height: 17,
    lookAhead: 21,
    lookHeight: 5.4,
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
  scene.background = new THREE.Color(0x9fc8d4);
  scene.fog = new THREE.FogExp2(0x9eb7b0, 0.0042);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1200);
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
  renderer.setClearColor(0x9fc8d4, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = "hashlake-canvas";
  renderer.domElement.setAttribute("aria-label", "Realtime Hashlake scene");
  container.append(renderer.domElement);

  const sunlight = new THREE.DirectionalLight(0xffd79a, 3.6);
  sunlight.position.set(-36, 72, 45);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  scene.add(sunlight);
  const hemisphereLight = new THREE.HemisphereLight(0x9fd4ff, 0x304e36, 1.35);
  scene.add(hemisphereLight);

  const water = createWater();
  scene.add(water.mesh);
  scene.add(createShoreline());
  scene.add(createMountains());
  scene.add(createDestinationMarkers());
  scene.add(createSunDisc());
  const clouds = createClouds();
  scene.add(clouds);

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
    mobilePointerId: null,
    mobileOriginX: 0,
    mobileOriginY: 0,
    mobileThrottle: false,
    mobileAnchor: false,
    mobileSteer: 0,
  };
  boat.position.x = driveState.x;
  boat.position.z = driveState.z;
  boat.rotation.y = driveState.yaw;
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
  const sceneEffects = createSceneEffects(
    eventBus,
    () => new THREE.Vector3(driveState.x, boat.position.y, driveState.z),
    (strength) => {
      driveState.boatHop = Math.min(1, Math.max(driveState.boatHop, strength));
    },
  );
  scene.add(sceneEffects.group);

  const status = createStatusPill();
  container.append(status);
  const driveHud = createDriveHud();
  container.append(driveHud);

  const startedAt = window.performance.now();
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
  };

  const scheduleResize = () => {
    window.scrollTo(0, 0);
    resize();
    window.requestAnimationFrame(resize);
    window.setTimeout(resize, 80);
    window.setTimeout(resize, 320);
  };

  const render = () => {
    if (!isRunning) {
      return;
    }

    const now = window.performance.now();
    const elapsed = (now - startedAt) / 1000;
    const delta = Math.min(0.045, Math.max(0.001, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    const weather = weatherStore.getSnapshot();
    updateDriveState(driveState, input, delta, weather);
    animateWater(water, elapsed, weather, driveState);
    animateBoat(boat, elapsed, weather, driveState);
    animateWakeEffect(wakeEffect, driveState, elapsed, delta);
    animateWeatherEffects(weatherEffects, elapsed, weather);
    sceneEffects.update(delta);
    applyWeatherToScene({
      scene,
      camera,
      sunlight,
      hemisphereLight,
      water,
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
    driveState.mobilePointerId = null;
    driveState.mobileThrottle = false;
    driveState.mobileAnchor = false;
    driveState.mobileSteer = 0;
    driveState.lookYaw = 0;
    driveState.lookPitch = 0;
    driveState.cameraPresetIndex = driveState.savedTableau.cameraPresetIndex;
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
    driveState.mobilePointerId = null;
    driveState.mobileThrottle = false;
    driveState.mobileAnchor = false;
    driveState.mobileSteer = 0;
    driveState.lookYaw = 0;
    driveState.lookPitch = 0;
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
      driveState.cameraPresetIndex =
        (driveState.cameraPresetIndex + 1) % CAMERA_PRESETS.length;
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
  };

  const setMobileDriveTouch = (event: PointerEvent) => {
    const bounds = renderer.domElement.getBoundingClientRect();
    const localX = clamp((event.clientX - bounds.left) / Math.max(1, bounds.width), 0, 1);
    const localY = clamp((event.clientY - bounds.top) / Math.max(1, bounds.height), 0, 1);
    const dragX = event.clientX - driveState.mobileOriginX;
    const dragY = driveState.mobileOriginY - event.clientY;
    const upwardIntent = clamp((0.86 - localY) / 0.42 + Math.max(0, dragY) / 140, 0, 1);
    const horizontalIntent = clamp(dragX / 132 + (localX - 0.5) * 0.72, -1, 1);
    const deadzonedSteer = Math.abs(horizontalIntent) < 0.12 ? 0 : horizontalIntent;

    driveState.mobileThrottle = upwardIntent > 0.1;
    driveState.mobileAnchor = localY > 0.9 && Math.abs(dragY) < 12;
    driveState.mobileSteer = -deadzonedSteer;
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
      sceneEffects.dispose();
      renderer.dispose();
    },
    getTelemetry: () => ({
      mode: driveState.mode,
      speed: driveState.speed,
      position: {
        x: driveState.x,
        z: driveState.z,
      },
      heading: driveState.yaw,
      visualHeading: boat.rotation.y,
      movementVector: {
        x: Math.cos(driveState.yaw) * driveState.speed,
        z: Math.sin(driveState.yaw) * driveState.speed,
      },
      steerInput: driveState.currentSteer,
      cameraPreset: CAMERA_PRESETS[driveState.cameraPresetIndex].name,
      nearestLocation: getNearestLocation({
        x: driveState.x,
        z: driveState.z,
      }).destination.label,
      savedTableau: driveState.hasSavedTableau,
    }),
    toggleDriveMode,
  };
};

type WaterSurface = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  basePositions: Float32Array;
};

const createOrganicWaterGeometry = () => {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const step = 9;
  const { minX, maxX, minZ, maxZ } = LAKE_MAP.mapBounds;

  for (let x = minX; x < maxX; x += step) {
    for (let z = minZ; z < maxZ; z += step) {
      const center = {
        x: x + step * 0.5,
        z: z + step * 0.5,
      };

      if (!isWater(center)) {
        continue;
      }

      const vertexIndex = positions.length / 3;
      positions.push(x, 0, z, x + step, 0, z, x + step, 0, z + step, x, 0, z + step);
      indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
      indices.push(vertexIndex, vertexIndex + 2, vertexIndex + 3);
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createWater = (): WaterSurface => {
  const geometry = createOrganicWaterGeometry();

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x187da5,
    roughness: 0.28,
    metalness: 0.02,
    transmission: 0,
    clearcoat: 0.45,
    clearcoatRoughness: 0.18,
    reflectivity: 0.7,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.position.y = 0;

  const position = geometry.attributes.position;
  return {
    mesh,
    basePositions: new Float32Array(position.array),
  };
};

const animateWater = (
  water: WaterSurface,
  elapsed: number,
  weather: WeatherSnapshot,
  driveState: DriveState,
) => {
  const position = water.mesh.geometry.attributes.position;
  const values = position.array as Float32Array;
  const waveHeight = 0.34 + weather.dials.chop * 2.6;
  const waveSpeed = 0.72 + weather.dials.wind * 1.7;
  const chop = weather.dials.chop;
  const speedWake = clamp(Math.abs(driveState.speed) / DRIVE_BOOST_MAX_SPEED, 0, 1);

  for (let index = 0; index < values.length; index += 3) {
    const x = water.basePositions[index];
    const z = water.basePositions[index + 2];
    const distanceToBoat = Math.hypot(x - driveState.x, z - driveState.z);
    const localWake =
      Math.max(0, 1 - distanceToBoat / 30) *
      speedWake *
      Math.sin(distanceToBoat * 0.56 - elapsed * 10);
    const longWave = Math.sin(x * 0.035 + elapsed * waveSpeed) * waveHeight;
    const crossWave = Math.cos(z * 0.042 + elapsed * (waveSpeed * 0.75)) * waveHeight * 0.62;
    const shimmer =
      Math.sin((x + z) * (0.08 + chop * 0.07) + elapsed * (1.35 + chop * 2)) *
      (0.08 + chop * 0.42);
    values[index + 1] = longWave + crossWave + shimmer + localWake * 0.62;
  }

  position.needsUpdate = true;
  water.mesh.geometry.computeVertexNormals();
};

const createBoat = () => {
  const boat = new THREE.Group();
  boat.name = "Procedural motor skiff";
  boat.position.copy(BOAT_HOME);
  boat.scale.setScalar(0.84);

  const hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x7b4928,
    roughness: 0.62,
    metalness: 0.04,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0xd2a16c,
    roughness: 0.48,
  });
  const bowMarkerMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f5eb,
    roughness: 0.42,
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

  const hull = new THREE.Mesh(new THREE.BoxGeometry(12.4, 1.75, 3.65), hullMaterial);
  hull.castShadow = true;
  hull.scale.set(1, 0.82, 1);
  boat.add(hull);

  for (const side of [-1, 1]) {
    const hullSide = new THREE.Mesh(new THREE.BoxGeometry(10.8, 1.05, 0.42), hullMaterial);
    hullSide.position.set(-0.45, 0.1, side * 2.08);
    hullSide.rotation.x = side * -0.18;
    hullSide.castShadow = true;
    boat.add(hullSide);
  }

  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(10.9, 1.1, 2.85), hullMaterial);
  lowerHull.position.set(-0.55, -0.72, 0);
  lowerHull.scale.set(1, 0.68, 1);
  lowerHull.castShadow = true;
  boat.add(lowerHull);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(2.35, 5.35, 4), hullMaterial);
  bow.rotation.z = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.x = 6.95;
  bow.scale.set(1.1, 0.9, 0.82);
  bow.castShadow = true;
  boat.add(bow);

  const bowStripe = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 0.5), bowMarkerMaterial);
  bowStripe.position.set(4.65, 1.12, 0);
  bowStripe.castShadow = true;
  boat.add(bowStripe);

  const bowDeck = new THREE.Mesh(new THREE.ConeGeometry(1.42, 3.4, 4), trimMaterial);
  bowDeck.rotation.z = Math.PI / 2;
  bowDeck.rotation.y = Math.PI / 4;
  bowDeck.position.set(4.9, 1.42, 0);
  bowDeck.scale.set(0.95, 0.28, 0.74);
  bowDeck.castShadow = true;
  boat.add(bowDeck);

  const bowLight = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.34, 0.62), bowMarkerMaterial);
  bowLight.position.set(7.65, 1.05, 0);
  bowLight.castShadow = true;
  boat.add(bowLight);

  const keel = new THREE.Mesh(new THREE.ConeGeometry(1.15, 10.9, 4), hullMaterial);
  keel.rotation.z = Math.PI / 2;
  keel.rotation.y = Math.PI / 4;
  keel.scale.set(1, 0.36, 0.68);
  keel.position.set(-0.6, -0.74, 0);
  keel.castShadow = true;
  boat.add(keel);

  const stern = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.15, 4.35), trimMaterial);
  stern.position.set(-6.5, 0.05, 0);
  stern.castShadow = true;
  boat.add(stern);

  const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 3.75), trimMaterial);
  rearDeck.position.set(-4.75, 1.26, 0);
  rearDeck.castShadow = true;
  boat.add(rearDeck);

  for (const side of [-1, 1]) {
    const gunwale = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.34, 0.34), trimMaterial);
    gunwale.position.set(-0.4, 1.24, side * 2.06);
    gunwale.castShadow = true;
    boat.add(gunwale);
  }

  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 2.2), trimMaterial);
  cockpit.position.set(1.2, 1.72, 0);
  cockpit.castShadow = true;
  boat.add(cockpit);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.1, 2.35), windshieldMaterial);
  windshield.position.set(2.55, 2.28, 0);
  windshield.rotation.z = -0.18;
  boat.add(windshield);

  const motor = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.8, 1.45), motorMaterial);
  motor.position.set(-7.35, 0.32, 0);
  motor.castShadow = true;
  boat.add(motor);

  const motorCap = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.58, 1.04), bowMarkerMaterial);
  motorCap.position.set(-8.02, 0.94, 0);
  motorCap.castShadow = true;
  boat.add(motorCap);

  const propGuard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 1.95), motorMaterial);
  propGuard.position.set(-8.45, -0.18, 0);
  propGuard.castShadow = true;
  boat.add(propGuard);

  const benchA = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.28, 3.55), trimMaterial);
  benchA.position.set(-2.25, 1.38, 0);
  benchA.castShadow = true;
  boat.add(benchA);

  const benchB = benchA.clone();
  benchB.position.x = 3.05;
  boat.add(benchB);

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
    return;
  }

  const stormDrag = weather.dials.boatInstability * 8;
  const maxForwardSpeed = input.boost ? DRIVE_BOOST_MAX_SPEED : DRIVE_MAX_SPEED;
  const previousSpeed = driveState.speed;

  const keyboardSteer = Number(input.left) - Number(input.right);
  const mobileSteer = driveState.mobileSteer;
  const targetSteer = clamp(keyboardSteer + mobileSteer, -1, 1) * DRIVE_STEER_SENSITIVITY;
  const throttleActive = input.forward || driveState.mobileThrottle;
  const brakeActive = input.backward;
  const anchorActive = input.anchor || driveState.mobileAnchor;

  if (throttleActive) {
    driveState.throttleHoldTime = Math.min(2.2, driveState.throttleHoldTime + delta);
  } else {
    driveState.throttleHoldTime = Math.max(0, driveState.throttleHoldTime - delta * 1.8);
  }

  const throttleRamp = clamp(driveState.throttleHoldTime / 1.55, 0, 1);
  const wakeTarget = clamp(
    throttleRamp * 0.78 + Math.abs(driveState.speed) / DRIVE_BOOST_MAX_SPEED * 0.38,
    0,
    input.boost ? 1.18 : 1,
  );
  driveState.wakePower += (wakeTarget - driveState.wakePower) * Math.min(1, delta * 3.5);

  if (throttleActive) {
    const acceleration =
      (DRIVE_ACCELERATION_BASE + DRIVE_ACCELERATION_RAMP * throttleRamp) *
      (input.boost ? DRIVE_BOOST_MULTIPLIER : 1);
    driveState.speed += acceleration * delta;
  }

  if (anchorActive) {
    driveState.speed = approach(driveState.speed, 0, DRIVE_ANCHOR_BRAKE_FORCE * delta);
    driveState.wakePower *= Math.pow(0.22, delta);
  } else if (brakeActive) {
    if (driveState.speed > DRIVE_REVERSE_DELAY_THRESHOLD) {
      driveState.speed = approach(driveState.speed, 0, DRIVE_ACTIVE_BRAKE_FORCE * delta);
    } else {
      driveState.speed -= DRIVE_ACCELERATION_BASE * 0.62 * delta;
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
    Math.max(throttleActive ? 0.18 : 0, clamp(Math.abs(driveState.speed) / 12, 0, 1)) *
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
  const bowLift =
    clamp(driveState.accelerationForce, 0, 1) * DRIVE_BOW_LIFT_SCALE + speedRatio * 0.07;
  const turnBank = driveState.currentSteer * (0.06 + speedRatio * DRIVE_BANK_SCALE);
  boat.position.x = driveState.x;
  boat.position.z = driveState.z;
  boat.position.y =
    BOAT_HOME.y + hop * 2.2 + Math.sin(elapsed * speed) * (0.24 + instability * 1.2);
  boat.rotation.z =
    Math.sin(elapsed * (0.9 + instability)) * (0.05 + instability * 0.25) - turnBank;
  boat.rotation.x =
    Math.cos(elapsed * (0.72 + instability)) * (0.04 + instability * 0.18) - bowLift;
  boat.rotation.y = driveState.yaw;
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
    color: 0xb79d67,
    roughness: 0.9,
  });
  const shallowMaterial = new THREE.MeshBasicMaterial({
    color: 0x7fb8aa,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const landMaterial = new THREE.MeshStandardMaterial({
    color: 0x315f3f,
    roughness: 0.92,
  });
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d623e,
    roughness: 0.86,
  });
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x6c7571,
    roughness: 0.94,
  });

  const land = new THREE.Mesh(
    new THREE.CircleGeometry(LAKE_MAP.worldRadius, 128),
    landMaterial,
  );
  land.rotation.x = -Math.PI / 2;
  land.position.y = -0.42;
  land.receiveShadow = true;
  group.add(land);

  const shoreline = new THREE.Mesh(
    createStripGeometry(LAKE_MAP.outline, getExpandedOutline(LAKE_MAP.shorelineWidth)),
    sandMaterial,
  );
  shoreline.position.y = 0.03;
  shoreline.receiveShadow = true;
  group.add(shoreline);

  const shallow = new THREE.Mesh(
    createStripGeometry(getExpandedOutline(-16), LAKE_MAP.outline),
    shallowMaterial,
  );
  shallow.position.y = 0.09;
  group.add(shallow);

  const treeGeometry = new THREE.ConeGeometry(3.2, 14, 8);
  const trunkGeometry = new THREE.CylinderGeometry(0.42, 0.56, 3, 7);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6f4428, roughness: 0.82 });

  for (let index = 0; index < 148; index += 1) {
    const base = LAKE_MAP.outline[(index * 7) % LAKE_MAP.outline.length];
    const length = Math.max(1, Math.hypot(base.x, base.z));
    const shoreOffset = 34 + ((index * 37) % 118);
    const angleJitter = Math.sin(index * 2.17) * 14;
    const x = base.x + (base.x / length) * shoreOffset + Math.cos(index * 1.91) * angleJitter;
    const z = base.z + (base.z / length) * shoreOffset + Math.sin(index * 2.29) * angleJitter;

    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, 1.4, z);
    trunk.castShadow = true;
    group.add(trunk);

    const tree = new THREE.Mesh(treeGeometry, grassMaterial);
    tree.position.set(x, 9, z);
    tree.rotation.y = index * 0.41;
    tree.scale.setScalar(0.75 + ((index * 13) % 9) / 18);
    tree.castShadow = true;
    group.add(tree);
  }

  for (let index = 0; index < 72; index += 1) {
    const base = LAKE_MAP.outline[(index * 5 + 3) % LAKE_MAP.outline.length];
    const length = Math.max(1, Math.hypot(base.x, base.z));
    const offset = 5 + ((index * 19) % 34);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.5 + (index % 5) * 0.4), rockMaterial);
    rock.position.set(
      base.x + (base.x / length) * offset + Math.sin(index * 1.3) * 5,
      1.1,
      base.z + (base.z / length) * offset + Math.cos(index * 1.7) * 5,
    );
    rock.scale.y = 0.55 + (index % 4) * 0.12;
    rock.rotation.set(index * 0.4, index * 0.33, index * 0.17);
    rock.castShadow = true;
    group.add(rock);
  }

  return group;
};

const createMountains = () => {
  const group = new THREE.Group();
  const mountainMaterial = new THREE.MeshStandardMaterial({
    color: 0x6f8377,
    roughness: 0.95,
  });
  const snowMaterial = new THREE.MeshStandardMaterial({
    color: 0xe4ece5,
    roughness: 0.74,
  });

  for (let index = 0; index < 18; index += 1) {
    const angle = -2.85 + index * 0.34 + Math.sin(index) * 0.08;
    const radius = 420 + (index % 4) * 28;
    const height = 62 + (index % 5) * 14;
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(38 + (index % 3) * 8, height, 5), mountainMaterial);
    mountain.position.set(Math.cos(angle) * radius, height / 2 - 5, Math.sin(angle) * radius - 40);
    mountain.rotation.y = angle;
    mountain.castShadow = true;
    group.add(mountain);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(13, height * 0.26, 5), snowMaterial);
    cap.position.copy(mountain.position);
    cap.position.y += height * 0.31;
    cap.rotation.y = angle;
    cap.castShadow = true;
    group.add(cap);
  }

  return group;
};

const createDestinationMarkers = () => {
  const group = new THREE.Group();
  group.name = "Phase 11 destination landmarks";
  const dockMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5b36, roughness: 0.72 });
  const sandMaterial = new THREE.MeshStandardMaterial({ color: 0xd7c282, roughness: 0.92 });
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x6f7471, roughness: 0.9 });
  const reedMaterial = new THREE.MeshStandardMaterial({ color: 0x88a45c, roughness: 0.86 });
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
    const plank = new THREE.Mesh(new THREE.BoxGeometry(22, 0.45, 2.1), dockMaterial);
    plank.position.set(dockCenter.x + index * 4.6, 0.55, dockCenter.z - 1 - index * 1.9);
    plank.rotation.y = 0.42;
    plank.castShadow = true;
    dock.add(plank);
  }
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 8, 8), dockMaterial);
    post.position.set(dockCenter.x + 18, 3, dockCenter.z - 8 + side * 5.4);
    post.castShadow = true;
    dock.add(post);
  }
  group.add(dock);

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
  const coveStone = new THREE.Mesh(new THREE.ConeGeometry(12, 28, 5), rockMaterial);
  coveStone.position.set(coveCenter.x - 10, 14, coveCenter.z + 8);
  coveStone.rotation.y = 0.7;
  coveStone.castShadow = true;
  coveMarker.add(coveStone);
  const coveArch = new THREE.Mesh(new THREE.TorusGeometry(13, 1.6, 8, 28, Math.PI), rockMaterial);
  coveArch.position.set(coveCenter.x + 13, 8, coveCenter.z - 2);
  coveArch.rotation.set(0, 0.35, Math.PI);
  coveArch.castShadow = true;
  coveMarker.add(coveArch);
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
    cloud.position.set(-120 + index * 38, 70 + (index % 3) * 5, -125 - (index % 4) * 18);

    for (let puff = 0; puff < 4; puff += 1) {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(7 + puff * 1.2, 16, 8), material);
      sphere.position.set(puff * 7, Math.sin(puff) * 2, Math.cos(puff) * 2);
      sphere.scale.y = 0.52;
      cloud.add(sphere);
    }

    group.add(cloud);
  }

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

  for (let index = 0; index < 144; index += 1) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xf2fbff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
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
) => {
  const speedRatio = clamp(Math.abs(driveState.speed) / DRIVE_BOOST_MAX_SPEED, 0, 1);
  const wakePower = clamp(driveState.wakePower, 0, 1.2);
  const forward = new THREE.Vector3(Math.cos(driveState.yaw), 0, Math.sin(driveState.yaw));
  const lateral = new THREE.Vector3(-forward.z, 0, forward.x);
  const segment = wake.segments[wake.cursor];
  wake.cursor = (wake.cursor + 1) % wake.segments.length;
  const spread =
    side === 0 ? (Math.random() - 0.5) * 1.8 : 1.8 + speedRatio * 6.4 + wakePower * 2.6;
  const rearDistance =
    side === 0
      ? 7.35 + Math.random() * 2.2
      : 8.2 + speedRatio * 6.6 + Math.random() * 4.2;
  segment.mesh.position
    .set(driveState.x, 0.74 + Math.random() * 0.38, driveState.z)
    .addScaledVector(forward, -rearDistance)
    .addScaledVector(lateral, side * spread + (Math.random() - 0.5) * 1.9);
  segment.mesh.rotation.set(
    (Math.random() - 0.5) * 0.35,
    -driveState.yaw + side * (0.32 + speedRatio * 0.32) - driveState.currentSteer * 0.16,
    Math.random() * Math.PI,
  );
  segment.mesh.scale.set(1, 1, 1);
  segment.age = 0;
  segment.lifetime = 0.78 + speedRatio * 0.78 + wakePower * 0.42;
  segment.active = true;
  segment.side = side;
  segment.speedRatio = speedRatio;
  segment.baseScale = 0.9 + speedRatio * 1.7 + wakePower * 1.25 + Math.random() * 0.36;
  segment.heightScale = 0.52 + speedRatio * 0.62 + wakePower * 0.52 + Math.random() * 0.22;
  segment.lengthScale = 1.05 + speedRatio * 1.45 + Math.random() * 0.78;
  segment.driftX = forward.x * -(2.4 + speedRatio * 1.8) + lateral.x * side * (0.9 + speedRatio * 2.2);
  segment.driftZ = forward.z * -(2.4 + speedRatio * 1.8) + lateral.z * side * (0.9 + speedRatio * 2.2);
  segment.spin = (Math.random() - 0.5) * (2.2 + wakePower);
  segment.mesh.material.color.set(wakePower > 1 ? 0xffffff : 0xd8f5ff);
  segment.mesh.material.opacity = 0.58 + speedRatio * 0.24 + wakePower * 0.18;
};

const animateWakeEffect = (
  wake: WakeEffect,
  driveState: DriveState,
  elapsed: number,
  delta: number,
) => {
  const speedRatio = clamp(Math.abs(driveState.speed) / DRIVE_BOOST_MAX_SPEED, 0, 1);
  const wakePower = clamp(driveState.wakePower, 0, 1.2);
  const emitCadence = clamp(0.066 - wakePower * 0.036 - speedRatio * 0.02, 0.018, 0.066);
  if (
    driveState.mode === "Drive" &&
    (wakePower > 0.1 || speedRatio > 0.08) &&
    elapsed - wake.lastEmitAt > emitCadence
  ) {
    emitWakeSegment(wake, driveState, -1);
    emitWakeSegment(wake, driveState, 1);
    emitWakeSegment(wake, driveState, 0);
    if (wakePower > 0.32) {
      emitWakeSegment(wake, driveState, 0);
    }
    wake.lastEmitAt = elapsed;
  }

  wake.segments.forEach((segment) => {
    if (!segment.active) {
      return;
    }

    segment.age += delta;
    const progress = clamp(segment.age / segment.lifetime, 0, 1);
    const fade = (1 - progress) * (0.55 + segment.speedRatio * 0.45);
    const widen = 1 + progress * (0.45 + segment.speedRatio * 1.15);
    const settle = 1 - progress * 0.5;
    segment.mesh.position.x += segment.driftX * delta;
    segment.mesh.position.z += segment.driftZ * delta;
    segment.mesh.position.y = Math.max(0.28, segment.mesh.position.y - delta * (0.2 + progress * 0.52));
    segment.mesh.rotation.x += segment.spin * 0.42 * delta;
    segment.mesh.rotation.z += segment.spin * delta;
    segment.mesh.scale.set(
      segment.baseScale * segment.lengthScale * widen,
      Math.max(0.18, segment.heightScale * settle),
      segment.baseScale * (0.62 + segment.speedRatio * 0.42) * widen,
    );
    segment.mesh.material.opacity = fade * 0.86;

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
  water: WaterSurface;
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

const getDriveCameraPosition = (driveState: DriveState, preset: CameraPreset) => {
  const forward = new THREE.Vector3(Math.cos(driveState.yaw), 0, Math.sin(driveState.yaw));
  return new THREE.Vector3(
    driveState.x - forward.x * preset.distance,
    BOAT_HOME.y + preset.height,
    driveState.z - forward.z * preset.distance,
  );
};

const applyWeatherToScene = ({
  scene,
  camera,
  sunlight,
  hemisphereLight,
  water,
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
  const brightSky = new THREE.Color(0x98cad9);
  const stormSky = new THREE.Color(0x172a31);
  const apocalypticSky = new THREE.Color(0x1a0808);
  const skyColor = brightSky.lerp(stormSky, dark).lerp(apocalypticSky, fire * 0.75);
  const fogColor = new THREE.Color(0x9eb7b0).lerp(new THREE.Color(0x22383b), dark);

  scene.background = skyColor;
  if (scene.fog instanceof THREE.FogExp2) {
    scene.fog.color.copy(fogColor.lerp(new THREE.Color(0xb9c5bd), weather.staleData ? 0.45 : 0));
    scene.fog.density = 0.0035 + fog * 0.018 + dark * 0.004;
  }

  sunlight.intensity = Math.max(0.18, 3.6 * (1 - dark * 0.88));
  sunlight.color.set(fire > 0.08 ? 0xff6c3d : 0xffd79a);
  hemisphereLight.intensity = Math.max(0.22, 1.35 * (1 - dark * 0.72));
  hemisphereLight.color.set(fire > 0.12 ? 0x7a2117 : 0x9fd4ff);

  water.mesh.material.color
    .set(0x187da5)
    .lerp(new THREE.Color(0x0e3442), dark)
    .lerp(new THREE.Color(0x401514), fire * 0.45);
  water.mesh.material.roughness = 0.24 + weather.dials.chop * 0.55;
  water.mesh.material.clearcoat = Math.max(0.05, 0.45 - weather.dials.chop * 0.28);

  clouds.children.forEach((cloud, index) => {
    cloud.position.y = 70 - dark * 18 + Math.sin(elapsed * 0.2 + index) * 0.8;
    cloud.scale.setScalar(1 + dark * 1.35);
    cloud.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.color.set(dark > 0.45 ? 0x404c4c : 0xf4f1df);
        child.material.opacity = 0.7 + dark * 0.25;
      }
    });
  });

  const shake = weather.dials.cameraShake;
  const preset = getCameraPresetForState(driveState);
  if (driveState.mode === "Drive") {
    driveState.cameraYaw = driveState.yaw;
  } else {
    driveState.cameraYaw = driveState.yaw;
  }

  tempForward.set(Math.cos(driveState.cameraYaw), 0, Math.sin(driveState.cameraYaw));
  tempSide.set(-tempForward.z, 0, tempForward.x);

  if (driveState.mode === "Drive") {
    tempForward.set(Math.cos(driveState.yaw), 0, Math.sin(driveState.yaw));
    desiredCameraPosition
      .copy(tempForward)
      .multiplyScalar(-preset.distance)
      .add(new THREE.Vector3(driveState.x, BOAT_HOME.y + preset.height, driveState.z));
    desiredCameraTarget
      .copy(tempForward)
      .multiplyScalar(preset.lookAhead)
      .add(new THREE.Vector3(driveState.x, BOAT_HOME.y + preset.lookHeight, driveState.z));
  } else {
    const tableauPreset = driveState.savedTableau.camera;
    const lookYaw = driveState.yaw + driveState.lookYaw;
    tempForward.set(Math.cos(lookYaw), driveState.lookPitch, Math.sin(lookYaw)).normalize();
    tempSide.set(-tempForward.z, 0, tempForward.x);
    desiredCameraPosition
      .set(driveState.x, BOAT_HOME.y + tableauPreset.height, driveState.z)
      .addScaledVector(tempForward, -tableauPreset.distance)
      .addScaledVector(tempSide, driveState.lookYaw * 10);
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
    <span>Hashlake Phase 11</span>
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
