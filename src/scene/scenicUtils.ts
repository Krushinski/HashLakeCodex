import * as THREE from "three";

export const makeRng = (seed = 1337) => {
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

export const makeNoise2D = (seed = 7) => {
  const rng = makeRng(seed);
  const permutation = new Uint8Array(512);
  const source = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) {
    source[index] = index;
  }
  for (let index = 255; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const value = source[index];
    source[index] = source[swapIndex];
    source[swapIndex] = value;
  }
  for (let index = 0; index < 512; index += 1) {
    permutation[index] = source[index & 255];
  }

  const fade = (value: number) => value * value * (3 - 2 * value);
  const grad = (hash: number, x: number, y: number) =>
    (hash & 1 ? -x : x) + (hash & 2 ? -y : y);
  const noise = (x: number, y: number) => {
    const cellX = Math.floor(x) & 255;
    const cellY = Math.floor(y) & 255;
    const localX = x - Math.floor(x);
    const localY = y - Math.floor(y);
    const u = fade(localX);
    const v = fade(localY);
    const a = permutation[cellX + permutation[cellY]];
    const b = permutation[cellX + 1 + permutation[cellY]];
    const c = permutation[cellX + permutation[cellY + 1]];
    const d = permutation[cellX + 1 + permutation[cellY + 1]];
    return (
      (1 - v) *
        ((1 - u) * grad(a, localX, localY) + u * grad(b, localX - 1, localY)) +
      v *
        ((1 - u) * grad(c, localX, localY - 1) +
          u * grad(d, localX - 1, localY - 1))
    ) * 0.7;
  };

  return {
    noise,
    fbm: (x: number, y: number, octaves = 4) => {
      let value = 0;
      let amplitude = 0.5;
      let frequency = 1;
      for (let octave = 0; octave < octaves; octave += 1) {
        value += amplitude * noise(x * frequency, y * frequency);
        frequency *= 2.03;
        amplitude *= 0.5;
      }
      return value;
    },
  };
};

export const GLSL_NOISE = `
  float bl_hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float bl_noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(bl_hash(i), bl_hash(i + vec2(1.0, 0.0)), u.x),
      mix(bl_hash(i + vec2(0.0, 1.0)), bl_hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float bl_fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int index = 0; index < 5; index++) {
      value += bl_noise(p) * amplitude;
      p = p * 2.02 + 19.19;
      amplitude *= 0.5;
    }
    return value;
  }
`;

export const createWaterNormalTexture = (size = 192, seed = 11) => {
  const rng = makeRng(seed);
  const waves: Array<{ fx: number; fy: number; phase: number; amplitude: number }> = [];
  for (let index = 0; index < 14; index += 1) {
    const fx = Math.floor(rng() * 7) - 3;
    const fy = Math.floor(rng() * 7) - 3;
    if (fx !== 0 || fy !== 0) {
      waves.push({
        fx,
        fy,
        phase: rng() * Math.PI * 2,
        amplitude: 0.5 + rng(),
      });
    }
  }

  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      height[y * size + x] = waves.reduce(
        (sum, wave) =>
          sum +
          wave.amplitude *
            Math.sin(2 * Math.PI * (wave.fx * u + wave.fy * v) + wave.phase),
        0,
      );
    }
  }

  const getHeight = (x: number, y: number) =>
    height[((y + size) % size) * size + ((x + size) % size)];
  const data = new Uint8Array(size * size * 4);
  const strength = 2.2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (getHeight(x + 1, y) - getHeight(x - 1, y)) * strength;
      const dy = (getHeight(x, y + 1) - getHeight(x, y - 1)) * strength;
      const inverse = 1 / Math.hypot(dx, dy, 1);
      const offset = (y * size + x) * 4;
      data[offset] = (-dx * inverse * 0.5 + 0.5) * 255;
      data[offset + 1] = (-dy * inverse * 0.5 + 0.5) * 255;
      data[offset + 2] = (inverse * 0.5 + 0.5) * 255;
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
};
