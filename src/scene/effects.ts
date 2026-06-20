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
  blocks: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[];
  age: number;
  lifetime: number;
  velocity: THREE.Vector3[];
  strength: number;
};

type Firework = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  age: number;
  lifetime: number;
  velocity: Float32Array;
};

export type SceneEffects = {
  group: THREE.Group;
  update: (delta: number) => void;
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
  Math.min(4.2, Math.max(0.32, Math.log10(Math.max(3, btcAmount)) * 1.42));

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

  const addRing = (
    color: number,
    strength: number,
    origin = getWaterPosition(getBoatPosition()),
    lifetime = 0.78 + strength * 0.24,
    opacity = 0.34,
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
      maxScale: 22 + strength * 36,
      baseOpacity: opacity,
    });
  };

  const addLargeTradeSplash = (
    btcAmount: number,
    side: LargeTradeSide | undefined = "unknown",
  ) => {
    const strength = getTradeStrength(btcAmount);
    const count = Math.min(72, 14 + Math.round(strength * 14));
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
    const blocks: Splash["blocks"] = [];
    const velocity: Splash["velocity"] = [];

    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.6;
      const radius = Math.random() * (1.8 + strength * 1.4);
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
        }),
      );
      block.position.set(
        origin.x + Math.cos(angle) * radius,
        0.42 + Math.random() * 0.32,
        origin.z + Math.sin(angle) * radius,
      );
      const size = 0.42 + Math.random() * 0.54 + strength * 0.08;
      block.scale.set(size * (1.15 + Math.random() * 0.5), size * 0.42, size);
      block.rotation.set(Math.random() * 0.25, angle, Math.random() * Math.PI);
      group.add(block);
      blocks.push(block);
      velocity.push(
        new THREE.Vector3(
          Math.cos(angle) * (3.2 + strength * 1.6) * Math.random(),
          0.45 + Math.random() * 0.75 + strength * 0.08,
          Math.sin(angle) * (3.2 + strength * 1.6) * Math.random(),
        ),
      );
    }

    splashes.push({
      blocks,
      age: 0,
      lifetime: 1.0 + strength * 0.18,
      velocity,
      strength,
    });
    addRing(color, strength, origin, 0.9 + strength * 0.16, 0.24);
    if (btcAmount >= 50) {
      addRing(color, strength * 0.72, origin, 1.15 + strength * 0.12, 0.16);
    }
    if (btcAmount >= 300) {
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
    }
  };

  const handleEvent = (event: HashlakeEvent) => {
    if ((event.type === "whale" || event.type === "largeTrade") && (event.btcAmount ?? 0) >= 3) {
      addLargeTradeSplash(event.btcAmount ?? 3, event.side ?? "unknown");
    }

    if (event.type === "newBlock") {
      addRing(0xffe6a3, 0.85, getWaterPosition(getBoatPosition()), 0.58, 0.24);
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
        group.remove(ring.mesh);
        ring.mesh.geometry.dispose();
        ring.mesh.material.dispose();
        rings.splice(index, 1);
      }
    }
  };

  const updateSplashes = (delta: number) => {
    for (let splashIndex = splashes.length - 1; splashIndex >= 0; splashIndex -= 1) {
      const splash = splashes[splashIndex];
      splash.age += delta;
      const progress = Math.min(1, splash.age / splash.lifetime);
      splash.blocks.forEach((block, index) => {
        const velocity = splash.velocity[index];
        velocity.y -= 2.1 * delta;
        block.position.x += velocity.x * delta;
        block.position.z += velocity.z * delta;
        block.position.y = Math.max(0.25, block.position.y + velocity.y * delta);
        block.rotation.y += delta * (0.6 + splash.strength * 0.2);
        block.scale.multiplyScalar(1 - delta * 0.32);
        block.material.opacity = (1 - progress) * 0.72;
      });

      if (progress >= 1) {
        splash.blocks.forEach((block) => {
          group.remove(block);
          block.geometry.dispose();
          block.material.dispose();
        });
        splashes.splice(splashIndex, 1);
      }
    }
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
        group.remove(firework.points);
        firework.points.geometry.dispose();
        firework.points.material.dispose();
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
    dispose: () => {
      unsubscribe();
      rings.forEach((ring) => {
        ring.mesh.geometry.dispose();
        ring.mesh.material.dispose();
      });
      splashes.forEach((splash) => {
        splash.blocks.forEach((block) => {
          block.geometry.dispose();
          block.material.dispose();
        });
      });
      fireworks.forEach((firework) => {
        firework.points.geometry.dispose();
        firework.points.material.dispose();
      });
    },
  };
};
