import * as THREE from "three";
import type { WeatherSnapshot, WeatherStore } from "../state/weatherEngine";

type HashlakeSceneOptions = {
  container: HTMLElement;
  onFirstFrame: () => void;
  onRecoverableError: (message: string) => void;
  weatherStore: WeatherStore;
};

type HashlakeScene = {
  start: () => void;
  stop: () => void;
};

const LAKE_SIZE = 520;
const CAMERA_HOME = new THREE.Vector3(0, 34, 78);
const BOAT_HOME = new THREE.Vector3(0, 2.2, 0);

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

export const createHashlakeScene = ({
  container,
  onFirstFrame,
  onRecoverableError,
  weatherStore,
}: HashlakeSceneOptions): HashlakeScene => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc8d4);
  scene.fog = new THREE.FogExp2(0x9eb7b0, 0.0042);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1200);
  camera.position.copy(CAMERA_HOME);
  camera.lookAt(0, 6, 0);

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
  scene.add(createSunDisc());
  const clouds = createClouds();
  scene.add(clouds);

  const boat = createBoat();
  scene.add(boat);

  const weatherEffects = createWeatherEffects();
  scene.add(weatherEffects.group);

  const status = createStatusPill();
  container.append(status);

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

  const render = () => {
    if (!isRunning) {
      return;
    }

    const elapsed = (window.performance.now() - startedAt) / 1000;
    const weather = weatherStore.getSnapshot();
    animateWater(water, elapsed, weather);
    animateBoat(boat, elapsed, weather);
    animateWeatherEffects(weatherEffects, elapsed, weather);
    applyWeatherToScene({
      scene,
      camera,
      sunlight,
      hemisphereLight,
      water,
      clouds,
      weather,
      elapsed,
    });
    animateStatus(status, elapsed);
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

  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
  renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored);
  window.addEventListener("resize", resize);
  resize();

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
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
      status.remove();
      renderer.dispose();
    },
  };
};

type WaterSurface = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhysicalMaterial>;
  basePositions: Float32Array;
};

const createWater = (): WaterSurface => {
  const geometry = new THREE.PlaneGeometry(LAKE_SIZE, LAKE_SIZE, 128, 128);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x276f86,
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

const animateWater = (water: WaterSurface, elapsed: number, weather: WeatherSnapshot) => {
  const position = water.mesh.geometry.attributes.position;
  const values = position.array as Float32Array;
  const waveHeight = 0.34 + weather.dials.chop * 2.6;
  const waveSpeed = 0.72 + weather.dials.wind * 1.7;
  const chop = weather.dials.chop;

  for (let index = 0; index < values.length; index += 3) {
    const x = water.basePositions[index];
    const z = water.basePositions[index + 2];
    const longWave = Math.sin(x * 0.035 + elapsed * waveSpeed) * waveHeight;
    const crossWave = Math.cos(z * 0.042 + elapsed * (waveSpeed * 0.75)) * waveHeight * 0.62;
    const shimmer =
      Math.sin((x + z) * (0.08 + chop * 0.07) + elapsed * (1.35 + chop * 2)) *
      (0.08 + chop * 0.42);
    values[index + 1] = longWave + crossWave + shimmer;
  }

  position.needsUpdate = true;
  water.mesh.geometry.computeVertexNormals();
};

const createBoat = () => {
  const boat = new THREE.Group();
  boat.name = "Procedural boat placeholder";
  boat.position.copy(BOAT_HOME);

  const hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x7b4928,
    roughness: 0.62,
    metalness: 0.04,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0xd2a16c,
    roughness: 0.48,
  });
  const personMaterial = new THREE.MeshStandardMaterial({
    color: 0x2e3e47,
    roughness: 0.8,
  });
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: 0xc58f65,
    roughness: 0.7,
  });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 4.2), hullMaterial);
  hull.castShadow = true;
  hull.scale.set(1, 0.78, 1);
  boat.add(hull);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(2.15, 4.4, 4), hullMaterial);
  bow.rotation.z = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.x = 7.4;
  bow.castShadow = true;
  boat.add(bow);

  const stern = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 4.5), trimMaterial);
  stern.position.x = -7.1;
  stern.castShadow = true;
  boat.add(stern);

  const benchA = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.28, 4.7), trimMaterial);
  benchA.position.set(-2.6, 1.35, 0);
  benchA.castShadow = true;
  boat.add(benchA);

  const benchB = benchA.clone();
  benchB.position.x = 2.8;
  boat.add(benchB);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 1.5, 4, 8), personMaterial);
  body.position.set(-0.6, 2.65, 0);
  body.rotation.z = -0.12;
  body.castShadow = true;
  boat.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), skinMaterial);
  head.position.set(-0.84, 3.8, 0);
  head.castShadow = true;
  boat.add(head);

  const oarMaterial = new THREE.MeshStandardMaterial({ color: 0xb67a40, roughness: 0.55 });
  const oarGeometry = new THREE.CylinderGeometry(0.07, 0.07, 10, 8);

  for (const side of [-1, 1]) {
    const oar = new THREE.Mesh(oarGeometry, oarMaterial);
    oar.rotation.z = Math.PI / 2;
    oar.rotation.y = side * 0.28;
    oar.position.set(0.8, 2.1, side * 2.9);
    oar.castShadow = true;
    boat.add(oar);
  }

  return boat;
};

const animateBoat = (boat: THREE.Group, elapsed: number, weather: WeatherSnapshot) => {
  const instability = weather.dials.boatInstability;
  const speed = 1.1 + weather.dials.wind * 1.6;
  boat.position.y = BOAT_HOME.y + Math.sin(elapsed * speed) * (0.24 + instability * 1.2);
  boat.rotation.z = Math.sin(elapsed * (0.9 + instability)) * (0.05 + instability * 0.25);
  boat.rotation.x = Math.cos(elapsed * (0.72 + instability)) * (0.04 + instability * 0.18);
  boat.rotation.y = Math.sin(elapsed * 0.22) * 0.05;
};

const createShoreline = () => {
  const group = new THREE.Group();
  const sandMaterial = new THREE.MeshStandardMaterial({
    color: 0xbda873,
    roughness: 0.9,
  });
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d623e,
    roughness: 0.86,
  });
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x6c7571,
    roughness: 0.94,
  });

  const sand = new THREE.Mesh(new THREE.RingGeometry(150, 236, 96), sandMaterial);
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.18;
  sand.receiveShadow = true;
  group.add(sand);

  const treeGeometry = new THREE.ConeGeometry(3.2, 14, 8);
  const trunkGeometry = new THREE.CylinderGeometry(0.42, 0.56, 3, 7);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6f4428, roughness: 0.82 });

  for (let index = 0; index < 90; index += 1) {
    const angle = index * 2.399963 + Math.sin(index) * 0.1;
    const radius = 172 + ((index * 37) % 55);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, 1.4, z);
    trunk.castShadow = true;
    group.add(trunk);

    const tree = new THREE.Mesh(treeGeometry, grassMaterial);
    tree.position.set(x, 9, z);
    tree.rotation.y = angle;
    tree.scale.setScalar(0.75 + ((index * 13) % 9) / 18);
    tree.castShadow = true;
    group.add(tree);
  }

  for (let index = 0; index < 34; index += 1) {
    const angle = index * 1.77;
    const radius = 126 + ((index * 29) % 42);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.5 + (index % 5) * 0.4), rockMaterial);
    rock.position.set(Math.cos(angle) * radius, 1.1, Math.sin(angle) * radius);
    rock.scale.y = 0.55 + (index % 4) * 0.12;
    rock.rotation.set(index * 0.4, angle, index * 0.17);
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

  for (let index = 0; index < 11; index += 1) {
    const angle = -2.5 + index * 0.5;
    const radius = 310 + (index % 3) * 18;
    const height = 58 + (index % 4) * 13;
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(34, height, 5), mountainMaterial);
    mountain.position.set(Math.cos(angle) * radius, height / 2 - 3, Math.sin(angle) * radius - 30);
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
    .set(0x276f86)
    .lerp(new THREE.Color(0x10272e), dark)
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
  camera.position.set(
    CAMERA_HOME.x + Math.sin(elapsed * 8.7) * shake * 0.48,
    CAMERA_HOME.y + Math.sin(elapsed * 11.1) * shake * 0.28,
    CAMERA_HOME.z + Math.cos(elapsed * 7.5) * shake * 0.42,
  );
  camera.lookAt(
    Math.sin(elapsed * 5.4) * shake * 0.7,
    6 + Math.cos(elapsed * 6.8) * shake * 0.32,
    0,
  );
};

const createStatusPill = () => {
  const status = document.createElement("div");
  status.className = "status-pill";
  status.innerHTML = `
    <span class="status-pill__dot"></span>
    <span>Hashlake Phase 3</span>
  `;
  return status;
};

const animateStatus = (status: HTMLDivElement, elapsed: number) => {
  const dot = status.querySelector<HTMLSpanElement>(".status-pill__dot");
  if (!dot) {
    return;
  }

  const pulse = 0.7 + Math.sin(elapsed * 2) * 0.3;
  dot.style.opacity = pulse.toFixed(2);
};
