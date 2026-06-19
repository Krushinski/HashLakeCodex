import * as THREE from "three";

type HashlakeSceneOptions = {
  container: HTMLElement;
  onFirstFrame: () => void;
  onRecoverableError: (message: string) => void;
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
}: HashlakeSceneOptions): HashlakeScene => {
  const scene = new THREE.Scene();
  scene.background = createSkyTexture();
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
  scene.add(new THREE.HemisphereLight(0x9fd4ff, 0x304e36, 1.35));

  const water = createWater();
  scene.add(water.mesh);
  scene.add(createShoreline());
  scene.add(createMountains());
  scene.add(createSunDisc());
  scene.add(createClouds());

  const boat = createBoat();
  scene.add(boat);

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
    animateWater(water, elapsed);
    animateBoat(boat, elapsed);
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

const animateWater = (water: WaterSurface, elapsed: number) => {
  const position = water.mesh.geometry.attributes.position;
  const values = position.array as Float32Array;

  for (let index = 0; index < values.length; index += 3) {
    const x = water.basePositions[index];
    const z = water.basePositions[index + 2];
    const longWave = Math.sin(x * 0.035 + elapsed * 0.85) * 0.42;
    const crossWave = Math.cos(z * 0.042 + elapsed * 0.62) * 0.3;
    const shimmer = Math.sin((x + z) * 0.08 + elapsed * 1.35) * 0.08;
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

const animateBoat = (boat: THREE.Group, elapsed: number) => {
  boat.position.y = BOAT_HOME.y + Math.sin(elapsed * 1.2) * 0.32;
  boat.rotation.z = Math.sin(elapsed * 0.9) * 0.055;
  boat.rotation.x = Math.cos(elapsed * 0.72) * 0.045;
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

const createStatusPill = () => {
  const status = document.createElement("div");
  status.className = "status-pill";
  status.innerHTML = `
    <span class="status-pill__dot"></span>
    <span>Hashlake Phase 1</span>
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

const createSkyTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.Color(0x9fc8d4);
  }

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#6da8ce");
  gradient.addColorStop(0.48, "#c9d8bd");
  gradient.addColorStop(1, "#f0c27a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
};
