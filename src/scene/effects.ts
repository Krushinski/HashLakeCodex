import * as THREE from "three";
import type { HashlakeEvent, HashlakeEventBus } from "../state/eventBus";

type ExpandingRing = {
  mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  age: number;
  lifetime: number;
  maxScale: number;
};

type Splash = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  age: number;
  lifetime: number;
  velocity: Float32Array;
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

  const addRing = (color: number, strength: number) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.04 + strength * 0.026, 8, 72),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(getWaterPosition(getBoatPosition()));
    group.add(ring);
    rings.push({
      mesh: ring,
      age: 0,
      lifetime: 0.82 + strength * 0.28,
      maxScale: 28 + strength * 34,
    });
  };

  const addSplash = (btcAmount: number) => {
    const strength = Math.min(2.8, btcAmount / 8);
    const count = 28 + Math.round(strength * 26);
    const positions = new Float32Array(count * 3);
    const velocity = new Float32Array(count * 3);
    const origin = getWaterPosition(getBoatPosition());
    origin.x += (Math.random() - 0.5) * 12;
    origin.z += (Math.random() - 0.5) * 12;

    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.6;
      const radius = Math.random() * 3;
      positions[index * 3] = origin.x + Math.cos(angle) * radius;
      positions[index * 3 + 1] = 0.8 + Math.random() * 1.6;
      positions[index * 3 + 2] = origin.z + Math.sin(angle) * radius;
      velocity[index * 3] = Math.cos(angle) * (2.4 + strength * 2.7) * Math.random();
      velocity[index * 3 + 1] = 5.5 + strength * 5 + Math.random() * 2;
      velocity[index * 3 + 2] = Math.sin(angle) * (2.4 + strength * 2.7) * Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xbdefff,
        size: 1.2 + strength * 0.24,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
      }),
    );
    group.add(points);
    splashes.push({ points, age: 0, lifetime: 1.5 + strength * 0.36, velocity });
    addRing(0xbdefff, strength);
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
    if (event.type === "whale" && (event.btcAmount ?? 0) >= 3) {
      addSplash(event.btcAmount ?? 3);
    }

    if (event.type === "newBlock") {
      addRing(0xffe6a3, 0.85);
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
      ring.mesh.material.opacity = (1 - progress) ** 1.7 * 0.42;

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
      const positions = splash.points.geometry.attributes.position.array as Float32Array;

      for (let index = 0; index < positions.length; index += 3) {
        splash.velocity[index + 1] -= 14 * delta;
        positions[index] += splash.velocity[index] * delta;
        positions[index + 1] = Math.max(0.1, positions[index + 1] + splash.velocity[index + 1] * delta);
        positions[index + 2] += splash.velocity[index + 2] * delta;
      }

      const progress = Math.min(1, splash.age / splash.lifetime);
      splash.points.geometry.attributes.position.needsUpdate = true;
      splash.points.material.opacity = (1 - progress) * 0.86;

      if (progress >= 1) {
        group.remove(splash.points);
        splash.points.geometry.dispose();
        splash.points.material.dispose();
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
        splash.points.geometry.dispose();
        splash.points.material.dispose();
      });
      fireworks.forEach((firework) => {
        firework.points.geometry.dispose();
        firework.points.material.dispose();
      });
    },
  };
};
