import * as THREE from "three";
import type { HashlakeEvent, HashlakeEventBus, LargeTradeSide } from "../state/eventBus";

type ExpandingRing = {
  mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  age: number;
  lifetime: number;
  maxScale: number;
  baseOpacity: number;
};

type Splash = {
  age: number;
  lifetime: number;
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

const MAX_ACTIVE_RINGS = 14;
const MAX_ACTIVE_SPLASHES = 5;
const MAX_ACTIVE_FIREWORKS = 5;
const MAX_SPLASH_BLOCKS = 220;

export type SceneEffectStats = {
  rings: number;
  splashes: number;
  splashBlocks: number;
  fireworks: number;
  qualityScale: number;
};

export type SceneEffects = {
  group: THREE.Group;
  update: (delta: number) => void;
  getStats: () => SceneEffectStats;
  setQualityScale: (scale: number) => void;
  stressTest: () => void;
  dispose: () => void;
};

const getWaterPosition = (source: THREE.Vector3) =>
  new THREE.Vector3(source.x, 0.18, source.z);

const getTradeColor = (side: LargeTradeSide | undefined) => {
  if (side === "buy") {
    return 0x7df6a7;
  }

  if (side === "sell") {
    return 0xff7979;
  }

  return 0xbdefff;
};

const getTradeStrength = (btcAmount: number) =>
  Math.min(4.6, Math.max(0.42, Math.log10(Math.max(3, btcAmount)) * 1.48));

const disposeRing = (group: THREE.Group, ring: ExpandingRing) => {
  group.remove(ring.mesh);
  ring.mesh.geometry.dispose();
  ring.mesh.material.dispose();
};

const disposeSplash = (group: THREE.Group, splash: Splash) => {
  void group;
  void splash;
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
  const splashes: Splash[] = [];
  const fireworks: Firework[] = [];
  let qualityScale = 1;

  const splashGeometry = new THREE.BoxGeometry(1, 1, 1);
  const splashBlocks: SplashBlock[] = Array.from({ length: MAX_SPLASH_BLOCKS }, (_, index) => {
    const mesh = new THREE.Mesh(
      splashGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xdff7ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    mesh.visible = false;
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
    lifetime = 0.78 + strength * 0.24,
    opacity = 0.28,
  ) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.035 + strength * 0.018, 8, 72),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(origin);
    group.add(ring);
    rings.push({
      mesh: ring,
      age: 0,
      lifetime,
      maxScale: 24 + strength * 38,
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
    addRing(color, strength, origin, 0.58 + strength * 0.16, 0.075 + strength * 0.045);
  };

  const addLargeTradeSplash = (
    btcAmount: number,
    side: LargeTradeSide | undefined = "unknown",
  ) => {
    // Trade/whale splash is a local event effect and must not drive global weather color.
    const strength = getTradeStrength(btcAmount);
    const count = Math.min(96, Math.round((16 + strength * 16) * qualityScale));
    const origin = getWaterPosition(getBoatPosition());
    const placementAngle =
      side === "buy"
        ? -Math.PI * 0.24
        : side === "sell"
          ? Math.PI * 0.2
          : Math.random() * Math.PI * 2;
    const placementDistance = 10 + Math.min(32, btcAmount * 0.18) + Math.random() * 10;
    origin.x += Math.cos(placementAngle) * placementDistance + (Math.random() - 0.5) * 8;
    origin.z += Math.sin(placementAngle) * placementDistance + (Math.random() - 0.5) * 8;
    const color = getTradeColor(side);

    for (let index = 0; index < count; index += 1) {
      const block = splashBlocks.find((candidate) => !candidate.active);
      if (!block) {
        break;
      }
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.6;
      const radius = Math.random() * (2.4 + strength * 1.9);
      block.active = true;
      block.age = 0;
      block.lifetime = 1.0 + strength * 0.16 + Math.random() * 0.28;
      block.strength = strength;
      block.spin = (Math.random() - 0.5) * (0.55 + strength * 0.2);
      block.mesh.visible = true;
      block.mesh.position.set(
        origin.x + Math.cos(angle) * radius,
        0.24 + Math.random() * 0.18,
        origin.z + Math.sin(angle) * radius,
      );
      const size = 0.52 + Math.random() * 0.78 + strength * 0.12;
      block.mesh.scale.set(size * (1.35 + Math.random() * 0.7), size * 0.2, size);
      block.mesh.rotation.set(Math.random() * 0.12, angle, Math.random() * Math.PI);
      block.mesh.material.color.set(index % 4 === 0 ? color : 0xe7fbff);
      block.mesh.material.opacity = 0.78;
      block.velocity.set(
        Math.cos(angle) * (4.0 + strength * 2.1) * (0.4 + Math.random() * 0.8),
        0.08 + Math.random() * 0.24 + strength * 0.035,
        Math.sin(angle) * (4.0 + strength * 2.1) * (0.4 + Math.random() * 0.8),
      );
    }

    splashes.push({
      age: 0,
      lifetime: 1.0 + strength * 0.18,
      strength,
    });
    while (splashes.length > MAX_ACTIVE_SPLASHES) {
      const oldest = splashes.shift();
      if (oldest) {
        disposeSplash(group, oldest);
      }
    }
    addRing(color, strength, origin, 0.82 + strength * 0.14, 0.22);
    if (btcAmount >= 50) {
      addRing(color, strength * 0.78, origin, 1.0 + strength * 0.1, 0.14);
    }
    if (btcAmount >= 300) {
      addRing(0xdff7ff, strength * 0.55, origin, 0.72 + strength * 0.08, 0.11);
      addBoatHop(1.45);
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

    if ((event.type === "whale" || event.type === "largeTrade") && (event.btcAmount ?? 0) >= 3) {
      addLargeTradeSplash(event.btcAmount ?? 3, event.side ?? "unknown");
    }

    if (event.type === "newBlock") {
      addRing(0x8df7ff, 1.05, getWaterPosition(getBoatPosition()), 0.42, 0.16);
      addRing(0xd8fbff, 0.62, getWaterPosition(getBoatPosition()), 0.32, 0.12);
      addBoatHop(1.25);
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
      const eased = 1 - (1 - progress) ** 3;
      const scale = 1 + eased * ring.maxScale;
      ring.mesh.scale.setScalar(scale);
      ring.mesh.material.opacity = (1 - progress) ** 1.7 * ring.baseOpacity;

      if (progress >= 1) {
        disposeRing(group, ring);
        rings.splice(index, 1);
      }
    }
  };

  const updateSplashes = (delta: number) => {
    for (let splashIndex = splashes.length - 1; splashIndex >= 0; splashIndex -= 1) {
      const splash = splashes[splashIndex];
      splash.age += delta;
      const progress = Math.min(1, splash.age / splash.lifetime);

      if (progress >= 1) {
        disposeSplash(group, splash);
        splashes.splice(splashIndex, 1);
      }
    }

    splashBlocks.forEach((block) => {
      if (!block.active) {
        return;
      }

      block.age += delta;
      const progress = Math.min(1, block.age / block.lifetime);
      block.velocity.y -= 1.55 * delta;
      block.velocity.x *= Math.pow(0.88, delta);
      block.velocity.z *= Math.pow(0.88, delta);
      block.mesh.position.x += block.velocity.x * delta;
      block.mesh.position.z += block.velocity.z * delta;
      block.mesh.position.y = Math.max(0.18, block.mesh.position.y + block.velocity.y * delta);
      block.mesh.rotation.y += delta * block.spin;
      block.mesh.rotation.z += delta * block.spin * 0.65;
      const settle = Math.max(0.1, 1 - progress * 0.72);
      block.mesh.scale.y = Math.max(0.025, block.mesh.scale.y * (1 - delta * 0.45));
      block.mesh.scale.x *= 1 + delta * 0.08;
      block.mesh.scale.z *= 1 + delta * 0.04;
      block.mesh.material.opacity = (1 - progress) ** 1.45 * 0.78;
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
      splashes: splashes.length,
      splashBlocks: splashBlocks.filter((block) => block.active).length,
      fireworks: fireworks.length,
      qualityScale,
    }),
    setQualityScale: (scale) => {
      qualityScale = Math.max(0.45, Math.min(1, scale));
    },
    stressTest: () => {
      addLargeTradeSplash(3, "buy");
      addLargeTradeSplash(10, "sell");
      addLargeTradeSplash(50, "buy");
      addLargeTradeSplash(300, "sell");
      addRing(0x8df7ff, 0.9, getWaterPosition(getBoatPosition()), 0.42, 0.14);
    },
    dispose: () => {
      unsubscribe();
      rings.forEach((ring) => disposeRing(group, ring));
      splashes.forEach((splash) => disposeSplash(group, splash));
      fireworks.forEach((firework) => disposeFirework(group, firework));
      splashBlocks.forEach((block) => {
        group.remove(block.mesh);
        block.mesh.material.dispose();
      });
      splashGeometry.dispose();
    },
  };
};
