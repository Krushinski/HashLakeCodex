import * as THREE from "three";
import type { HashlakeEvent, HashlakeEventBus } from "../state/eventBus";

type ExpandingRing = {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  age: number;
  lifetime: number;
  baseScale: number;
  speed: number;
  baseOpacity: number;
};

type SplashBurst = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  positions: Float32Array;
  velocities: Float32Array;
  age: number;
  lifetime: number;
  active: boolean;
  strength: number;
};

type SplashBlock = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  age: number;
  lifetime: number;
  active: boolean;
  velocity: THREE.Vector3;
  strength: number;
  spin: number;
};

type Firework = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  age: number;
  lifetime: number;
  velocity: Float32Array;
};

const MAX_ACTIVE_RINGS = 18;
const MAX_ACTIVE_FIREWORKS = 5;
const MAX_SPLASH_BLOCKS = 280;
const SPLASH_POOL = 5;
const SPLASH_POINTS = 192;

export type SceneEffectStats = {
  rings: number;
  splashes: number;
  splashBlocks: number;
  fireworks: number;
  qualityScale: number;
  lastSplashDistanceToBoat: number | null;
  lastBoatImpulseStrength: number;
  fxVisibilityTest: boolean;
};

export type SceneEffects = {
  group: THREE.Group;
  update: (delta: number) => void;
  getStats: () => SceneEffectStats;
  setQualityScale: (scale: number) => void;
  setVisibilityTest: (enabled: boolean) => void;
  stressTest: () => void;
  dispose: () => void;
};

const getWaterPosition = (source: THREE.Vector3) =>
  new THREE.Vector3(source.x, 0.18, source.z);

const createSoftPointTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.36, "rgba(226,249,255,0.8)");
  gradient.addColorStop(0.74, "rgba(190,235,244,0.22)");
  gradient.addColorStop(1, "rgba(190,235,244,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const getWhaleSplashScale = (btcAmount: number) => {
  const baseScale = Math.min(
    3.4,
    Math.max(0.6, Math.log10(Math.max(1.01, btcAmount)) / 1.15),
  );
  const megaBoost = btcAmount >= 1000 ? 1.25 : 1;
  return Math.min(4.25, Math.max(0.6, baseScale * megaBoost));
};

const disposeRing = (group: THREE.Group, ring: ExpandingRing) => {
  group.remove(ring.mesh);
  ring.mesh.geometry.dispose();
  ring.mesh.material.dispose();
};

const disposeFirework = (group: THREE.Group, firework: Firework) => {
  group.remove(firework.points);
  firework.points.geometry.dispose();
  firework.points.material.dispose();
};

export const createSceneEffects = (
  eventBus: HashlakeEventBus,
  getBoatPosition: () => THREE.Vector3,
  addBoatHop: (strength: number) => void,
): SceneEffects => {
  const group = new THREE.Group();
  group.name = "Hashlake event effects";
  const rings: ExpandingRing[] = [];
  const splashBursts: SplashBurst[] = [];
  const fireworks: Firework[] = [];
  let qualityScale = 1;
  let visibilityTest = false;
  let lastSplashDistanceToBoat: number | null = null;
  let lastBoatImpulseStrength = 0;
  const splashTexture = createSoftPointTexture();

  for (let index = 0; index < SPLASH_POOL; index += 1) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(SPLASH_POINTS * 3);
    const velocities = new Float32Array(SPLASH_POINTS * 3);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xdff7ff,
      map: splashTexture,
      opacity: 0,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      size: 1.2,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 42;
    points.visible = false;
    group.add(points);
    splashBursts.push({
      points,
      positions,
      velocities,
      age: 0,
      lifetime: 2.4,
      active: false,
      strength: 1,
    });
  }

  const splashGeometry = new THREE.BoxGeometry(1, 1, 1);
  const splashBlocks: SplashBlock[] = Array.from({ length: MAX_SPLASH_BLOCKS }, (_, index) => {
    const mesh = new THREE.Mesh(
      splashGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xdff7ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
      }),
    );
    mesh.visible = false;
    mesh.renderOrder = 43;
    group.add(mesh);
    return {
      mesh,
      age: 0,
      lifetime: 1,
      active: false,
      velocity: new THREE.Vector3(),
      strength: 1,
      spin: (index % 5) * 0.2,
    };
  });

  const addRing = (
    color: number,
    strength: number,
    origin = getWaterPosition(getBoatPosition()),
    lifetime = 1.15 + strength * 0.12,
    opacity = 0.45,
    speed = 1,
  ) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.82, visibilityTest ? 1.36 : 1.16, 96),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(origin);
    ring.position.y = visibilityTest ? 0.74 : 0.48;
    ring.renderOrder = 41;
    ring.scale.setScalar(Math.max(1.35, strength * (visibilityTest ? 2.05 : 1.62)));
    group.add(ring);
    rings.push({
      mesh: ring,
      age: 0,
      lifetime,
      baseScale: Math.max(1.35, strength * (visibilityTest ? 2.05 : 1.62)),
      speed,
      baseOpacity: opacity,
    });
    while (rings.length > MAX_ACTIVE_RINGS) {
      const oldest = rings.shift();
      if (oldest) {
        disposeRing(group, oldest);
      }
    }
  };

  const addMarketSignal = (strength: number, color = 0x8be8ff) => {
    const origin = getWaterPosition(getBoatPosition());
    origin.x += (Math.random() - 0.5) * 8;
    origin.z += 8 + Math.random() * 8;
    addRing(color, strength, origin, 0.58 + strength * 0.16, 0.075 + strength * 0.045, 1.45);
  };

  const addSplashBurst = (origin: THREE.Vector3, strength: number, color: number) => {
    const burst = splashBursts.find((candidate) => !candidate.active);
    if (!burst) {
      return;
    }

    const visibilityBoost = visibilityTest ? 1.7 : 1;
    const activePoints = Math.min(
      SPLASH_POINTS,
      Math.round(SPLASH_POINTS * qualityScale * visibilityBoost),
    );
    burst.age = 0;
    burst.lifetime = 1.95 + strength * 0.3 + (visibilityTest ? 0.35 : 0);
    burst.active = true;
    burst.strength = strength;
    burst.points.visible = true;
    burst.points.material.color.setHex(color);
    burst.points.material.size = (visibilityTest ? 1.45 : 1.08) + strength * (visibilityTest ? 0.78 : 0.56);
    burst.points.material.opacity = visibilityTest ? 1 : 0.98;
    burst.points.renderOrder = 44;
    burst.points.geometry.setDrawRange(0, activePoints);

    for (let index = 0; index < SPLASH_POINTS; index += 1) {
      const offset = index * 3;
      const crown = index >= activePoints * 0.4;
      const angle = Math.random() * Math.PI * 2;
      burst.positions[offset] = origin.x + (Math.random() - 0.5) * 1.05 * strength;
      burst.positions[offset + 1] = 0.15;
      burst.positions[offset + 2] = origin.z + (Math.random() - 0.5) * 1.2 * strength;

      if (index >= activePoints) {
        burst.velocities[offset] = 0;
        burst.velocities[offset + 1] = 0;
        burst.velocities[offset + 2] = 0;
        continue;
      }

      if (crown) {
        const spread = (4.8 + Math.random() * (visibilityTest ? 10 : 8)) * strength;
        burst.velocities[offset] = Math.cos(angle) * spread;
        burst.velocities[offset + 1] = (5.2 + Math.random() * (visibilityTest ? 8.5 : 6.5)) * strength;
        burst.velocities[offset + 2] = Math.sin(angle) * spread;
      } else {
        burst.velocities[offset] = (Math.random() - 0.5) * 3.5 * strength;
        burst.velocities[offset + 1] = (14 + Math.random() * (visibilityTest ? 19 : 15)) * strength;
        burst.velocities[offset + 2] = (Math.random() - 0.5) * 3.5 * strength;
      }
    }

    burst.points.geometry.attributes.position.needsUpdate = true;
  };

  const addSplashBlocks = (origin: THREE.Vector3, strength: number, color: number) => {
    const blockCount = Math.min(
      Math.round((16 + strength * (visibilityTest ? 34 : 24)) * qualityScale * (visibilityTest ? 1.25 : 1)),
      splashBlocks.length,
    );
    for (let index = 0; index < blockCount; index += 1) {
      const block = splashBlocks.find((candidate) => !candidate.active);
      if (!block) {
        return;
      }

      const angle = Math.random() * Math.PI * 2;
      const radius = (0.85 + Math.random() * (visibilityTest ? 6.4 : 5.2)) * strength;
      const upward = 3.1 + Math.random() * (visibilityTest ? 8.6 : 6.9) * strength;
      block.active = true;
      block.age = 0;
      block.lifetime = 0.78 + Math.random() * 0.6 + strength * 0.16;
      block.strength = strength;
      block.spin = (Math.random() - 0.5) * (1.2 + strength * 0.55);
      block.velocity.set(
        Math.cos(angle) * radius,
        upward,
        Math.sin(angle) * radius,
      );
      block.mesh.position.copy(origin);
      block.mesh.position.x += (Math.random() - 0.5) * strength * 1.6;
      block.mesh.position.z += (Math.random() - 0.5) * strength * 1.6;
      block.mesh.position.y = visibilityTest ? 0.74 : 0.54;
      block.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      const scale =
        (visibilityTest ? 0.28 : 0.2) +
        Math.random() * (visibilityTest ? 0.46 : 0.34) +
        strength * (visibilityTest ? 0.22 : 0.16);
      block.mesh.scale.set(scale * (0.86 + Math.random() * 1.0), scale * 0.55, scale);
      block.mesh.material.color.setHex(color);
      block.mesh.material.opacity = visibilityTest ? 1 : 0.92;
      block.mesh.visible = true;
    }
  };

  const addWhaleSplash = (btcAmount: number) => {
    // Whale splashes are local on-chain events and never drive global weather color.
    const strength = getWhaleSplashScale(btcAmount) * (visibilityTest ? 1.22 : 1);
    const boat = getWaterPosition(getBoatPosition());
    const placementAngle = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 0.42;
    const placementDistance = btcAmount >= 300 ? 48 + Math.random() * 32 : 58 + Math.random() * 42;
    const origin = new THREE.Vector3(
      boat.x + Math.cos(placementAngle) * placementDistance + (Math.random() - 0.5) * 12,
      0.42,
      boat.z + Math.sin(placementAngle) * placementDistance - 22 + (Math.random() - 0.5) * 12,
    );
    lastSplashDistanceToBoat = origin.distanceTo(boat);
    const proximity = Math.max(0, 1 - lastSplashDistanceToBoat / 92);
    lastBoatImpulseStrength =
      btcAmount >= 10 ? Math.min(2.35, strength * proximity * (btcAmount >= 300 ? 0.68 : 0.38)) : 0;
    const color = btcAmount >= 1000
      ? 0xffffff
      : btcAmount >= 300
        ? 0xf1fbff
        : btcAmount >= 50
          ? 0xd7f7ff
          : 0xbdefff;
    addSplashBurst(origin, strength, color);
    addSplashBlocks(origin, strength, color);

    addRing(color, strength * 2.6, origin, 1.72 + strength * 0.13, visibilityTest ? 0.74 : 0.54, 1.34);
    addRing(0xdff6f8, strength * 1.38, origin, 1.08 + strength * 0.08, visibilityTest ? 0.66 : 0.48, 1.92);
    if (btcAmount >= 50) {
      addRing(0x7deaff, strength * 1.02, origin, 0.86 + strength * 0.08, visibilityTest ? 0.44 : 0.3, 2.28);
    }
    if (btcAmount >= 300) {
      addRing(0xffffff, strength * 3.35, origin, 1.95, visibilityTest ? 0.42 : 0.32, 1.48);
    }
    if (btcAmount >= 1000) {
      addRing(0x9ff8ff, strength * 4.15, origin, 2.08, visibilityTest ? 0.36 : 0.26, 1.62);
    }
    if (lastBoatImpulseStrength > 0.08) {
      addBoatHop(lastBoatImpulseStrength);
    }
  };

  const addFireworks = (intensity: number) => {
    const bursts = 1 + Math.round(intensity * 4);
    for (let burst = 0; burst < bursts; burst += 1) {
      const count = 32;
      const positions = new Float32Array(count * 3);
      const velocity = new Float32Array(count * 3);
      const origin = new THREE.Vector3(
        -116 + Math.random() * 60,
        36 + Math.random() * 30,
        -122 - Math.random() * 42,
      );

      for (let index = 0; index < count; index += 1) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 6 + Math.random() * 10 + intensity * 7;
        positions[index * 3] = origin.x;
        positions[index * 3 + 1] = origin.y;
        positions[index * 3 + 2] = origin.z;
        velocity[index * 3] = Math.sin(phi) * Math.cos(theta) * speed;
        velocity[index * 3 + 1] = Math.cos(phi) * speed;
        velocity[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: burst % 2 === 0 ? 0xffd37d : 0x91f2bf,
          size: 1.7,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        }),
      );
      group.add(points);
      fireworks.push({ points, age: 0, lifetime: 1.35 + intensity * 0.4, velocity });
      while (fireworks.length > MAX_ACTIVE_FIREWORKS) {
        const oldest = fireworks.shift();
        if (oldest) {
          disposeFirework(group, oldest);
        }
      }
    }
  };

  const handleEvent = (event: HashlakeEvent) => {
    if (event.type === "marketHeartbeat") {
      addMarketSignal(event.intensity ?? 0.16, 0x75dddd);
    }

    if (event.type === "marketTick") {
      addMarketSignal(0.24 + (event.intensity ?? 0.2) * 0.36, 0x91f2bf);
    }

    if (event.type === "whale" && (event.btcAmount ?? 0) >= 3) {
      addWhaleSplash(event.btcAmount ?? 3);
    }

    if (event.type === "newBlock") {
      const origin = getWaterPosition(getBoatPosition());
      addRing(0x7fd8c8, 5, origin, 1.08, 0.5, 0.8);
      addBoatHop(1.32);
    }

    if (event.type === "rally") {
      addFireworks(event.intensity ?? 0.55);
    }
  };

  const unsubscribe = eventBus.subscribe(handleEvent);

  const updateRings = (delta: number) => {
    for (let index = rings.length - 1; index >= 0; index -= 1) {
      const ring = rings[index];
      ring.age += delta;
      const progress = Math.min(1, ring.age / ring.lifetime);
      const t = ring.age * ring.speed;
      const scale = ring.baseScale * (1 + t * 9);
      ring.mesh.scale.setScalar(scale);
      ring.mesh.material.opacity = Math.max(0, ring.baseOpacity * (1 - progress) ** 1.55);

      if (progress >= 1) {
        disposeRing(group, ring);
        rings.splice(index, 1);
      }
    }
  };

  const updateSplashes = (delta: number) => {
    splashBursts.forEach((burst) => {
      if (!burst.active) {
        return;
      }

      burst.age += delta;
      const progress = Math.min(1, burst.age / burst.lifetime);
      for (let index = 0; index < burst.positions.length; index += 3) {
        burst.velocities[index + 1] -= 24 * delta;
        burst.positions[index] += burst.velocities[index] * delta;
        burst.positions[index + 1] += burst.velocities[index + 1] * delta;
        burst.positions[index + 2] += burst.velocities[index + 2] * delta;
        if (burst.positions[index + 1] < 0.05) {
          burst.positions[index + 1] = 0.05;
          burst.velocities[index + 1] = 0;
          burst.velocities[index] *= 0.9;
          burst.velocities[index + 2] *= 0.9;
        }
      }
      burst.points.geometry.attributes.position.needsUpdate = true;
      burst.points.material.opacity = (1 - progress) ** 1.25 * 0.98;
      burst.points.material.size = (0.95 + burst.strength * 0.42) * (0.8 + (1 - progress) * 0.2);

      if (progress >= 1) {
        burst.active = false;
        burst.points.visible = false;
        burst.points.material.opacity = 0;
      }
    });

    splashBlocks.forEach((block) => {
      if (!block.active) {
        return;
      }

      block.age += delta;
      const progress = Math.min(1, block.age / block.lifetime);
      block.velocity.y -= 3.2 * delta;
      block.velocity.x *= Math.pow(0.84, delta);
      block.velocity.z *= Math.pow(0.84, delta);
      block.mesh.position.x += block.velocity.x * delta;
      block.mesh.position.z += block.velocity.z * delta;
      block.mesh.position.y = Math.max(0.18, block.mesh.position.y + block.velocity.y * delta);
      block.mesh.rotation.y += delta * block.spin;
      block.mesh.rotation.z += delta * block.spin * 0.65;
      const settle = Math.max(0.1, 1 - progress * 0.72);
      block.mesh.scale.y = Math.max(0.025, block.mesh.scale.y * (1 - delta * 0.45));
      block.mesh.scale.x *= 1 + delta * 0.08;
      block.mesh.scale.z *= 1 + delta * 0.04;
      block.mesh.material.opacity = (1 - progress) ** 1.65 * 0.82;
      block.mesh.scale.multiplyScalar(0.997 + settle * 0.003);

      if (progress >= 1) {
        block.active = false;
        block.mesh.visible = false;
        block.mesh.material.opacity = 0;
      }
    });
  };

  const updateFireworks = (delta: number) => {
    for (let fireworkIndex = fireworks.length - 1; fireworkIndex >= 0; fireworkIndex -= 1) {
      const firework = fireworks[fireworkIndex];
      firework.age += delta;
      const positions = firework.points.geometry.attributes.position.array as Float32Array;

      for (let index = 0; index < positions.length; index += 3) {
        firework.velocity[index + 1] -= 5.8 * delta;
        positions[index] += firework.velocity[index] * delta;
        positions[index + 1] += firework.velocity[index + 1] * delta;
        positions[index + 2] += firework.velocity[index + 2] * delta;
      }

      const progress = Math.min(1, firework.age / firework.lifetime);
      firework.points.geometry.attributes.position.needsUpdate = true;
      firework.points.material.opacity = (1 - progress) * 0.95;

      if (progress >= 1) {
        disposeFirework(group, firework);
        fireworks.splice(fireworkIndex, 1);
      }
    }
  };

  return {
    group,
    update: (delta) => {
      updateRings(delta);
      updateSplashes(delta);
      updateFireworks(delta);
    },
    getStats: () => ({
      rings: rings.length,
      splashes: splashBursts.filter((burst) => burst.active).length,
      splashBlocks: splashBlocks.filter((block) => block.active).length,
      fireworks: fireworks.length,
      qualityScale,
      lastSplashDistanceToBoat,
      lastBoatImpulseStrength,
      fxVisibilityTest: visibilityTest,
    }),
    setQualityScale: (scale) => {
      qualityScale = Math.max(0.45, Math.min(1, scale));
    },
    setVisibilityTest: (enabled) => {
      visibilityTest = enabled;
    },
    stressTest: () => {
      addWhaleSplash(3);
      addWhaleSplash(10);
      addWhaleSplash(50);
      addWhaleSplash(300);
      addWhaleSplash(1000);
      addRing(0x7fd8c8, 5, getWaterPosition(getBoatPosition()), 1.08, 0.5, 0.8);
    },
    dispose: () => {
      unsubscribe();
      rings.forEach((ring) => disposeRing(group, ring));
      splashBursts.forEach((burst) => {
        group.remove(burst.points);
        burst.points.geometry.dispose();
        burst.points.material.dispose();
      });
      fireworks.forEach((firework) => disposeFirework(group, firework));
      splashBlocks.forEach((block) => {
        group.remove(block.mesh);
        block.mesh.material.dispose();
      });
      splashGeometry.dispose();
      splashTexture?.dispose();
    },
  };
};
