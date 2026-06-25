import * as THREE from "three";
import { makeRng } from "./scenicUtils";

type TextureKind = "sand" | "wetSand" | "grass" | "forestFloor" | "rock" | "wood" | "reed";

type TextureOptions = {
  size?: number;
  seed?: number;
  base: number;
  accent?: number;
  dark?: number;
  kind: TextureKind;
};

type MaterialOptions = TextureOptions & {
  color?: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  side?: THREE.Side;
};

const textureCache = new Map<string, THREE.CanvasTexture>();

const colorToRgb = (hex: number) => ({
  r: (hex >> 16) & 255,
  g: (hex >> 8) & 255,
  b: hex & 255,
});

const mixRgb = (
  from: ReturnType<typeof colorToRgb>,
  to: ReturnType<typeof colorToRgb>,
  amount: number,
) => ({
  r: Math.round(from.r + (to.r - from.r) * amount),
  g: Math.round(from.g + (to.g - from.g) * amount),
  b: Math.round(from.b + (to.b - from.b) * amount),
});

const cssRgb = (rgb: ReturnType<typeof colorToRgb>, alpha = 1) =>
  `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;

const drawSpeckles = (
  context: CanvasRenderingContext2D,
  rng: () => number,
  size: number,
  color: ReturnType<typeof colorToRgb>,
  count: number,
  alpha: number,
  maxRadius: number,
) => {
  for (let index = 0; index < count; index += 1) {
    context.fillStyle = cssRgb(color, alpha * (0.35 + rng() * 0.65));
    context.beginPath();
    context.ellipse(
      rng() * size,
      rng() * size,
      0.45 + rng() * maxRadius,
      0.35 + rng() * maxRadius * 0.72,
      rng() * Math.PI,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
};

export const createProceduralTexture = ({
  size = 128,
  seed = 1,
  base,
  accent = base,
  dark = base,
  kind,
}: TextureOptions) => {
  const key = `${kind}:${size}:${seed}:${base}:${accent}:${dark}`;
  const cached = textureCache.get(key);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create procedural texture canvas.");
  }

  const rng = makeRng(seed);
  const baseRgb = colorToRgb(base);
  const accentRgb = colorToRgb(accent);
  const darkRgb = colorToRgb(dark);
  const image = context.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const broad =
        Math.sin((u * 3.7 + seed * 0.013) * Math.PI * 2) * 0.5 +
        Math.cos((v * 4.3 + seed * 0.021) * Math.PI * 2) * 0.5;
      const fine =
        Math.sin((u * 19.0 + v * 6.0 + seed * 0.017) * Math.PI * 2) * 0.5 +
        Math.cos((v * 23.0 - u * 5.0 + seed * 0.019) * Math.PI * 2) * 0.5;
      const grain = (rng() - 0.5) * 0.36;
      let amount = 0.56 + broad * 0.065 + fine * 0.028 + grain * 0.052;

      if (kind === "sand" || kind === "wetSand") {
        const ripple =
          Math.sin((u * 12.0 + Math.sin(v * Math.PI * 2) * 0.52 + seed * 0.01) * Math.PI * 2) *
          0.5;
        amount += ripple * (kind === "sand" ? 0.038 : 0.020);
      } else if (kind === "wood") {
        const plank = Math.sin((u * 7.0 + seed * 0.03) * Math.PI * 2);
        const grainLine = Math.sin((v * 34.0 + u * 7.0 + seed * 0.02) * Math.PI * 2);
        amount += plank * 0.050 + grainLine * 0.030;
      } else if (kind === "rock") {
        amount += Math.sin((u * 9.0 - v * 11.0 + seed * 0.05) * Math.PI * 2) * 0.046;
      } else if (kind === "grass" || kind === "forestFloor") {
        amount += Math.sin((u * 8.0 + v * 13.0 + seed * 0.03) * Math.PI * 2) * 0.026;
      }

      amount = THREE.MathUtils.clamp(amount, 0, 1);
      const mid = mixRgb(darkRgb, accentRgb, amount);
      const influence =
        kind === "sand"
          ? 0.16
          : kind === "wetSand"
            ? 0.40
            : kind === "forestFloor"
              ? 0.54
            : kind === "grass"
                ? 0.48
                : kind === "rock"
                  ? 0.50
                  : 0.56;
      const finalRgb = mixRgb(baseRgb, mid, influence);
      const offset = (y * size + x) * 4;
      image.data[offset] = finalRgb.r;
      image.data[offset + 1] = finalRgb.g;
      image.data[offset + 2] = finalRgb.b;
      image.data[offset + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);

  if (kind === "sand") {
    drawSpeckles(context, rng, size, colorToRgb(0xffffff), 230, 0.060, 0.54);
    drawSpeckles(context, rng, size, colorToRgb(0xe2cf9b), 58, 0.024, 0.34);
  } else if (kind === "wetSand") {
    drawSpeckles(context, rng, size, colorToRgb(0xa2aa8d), 110, 0.070, 0.62);
  } else if (kind === "rock") {
    drawSpeckles(context, rng, size, colorToRgb(0xc7c9b8), 80, 0.064, 1.10);
    drawSpeckles(context, rng, size, colorToRgb(0x2d3934), 80, 0.052, 0.95);
  } else if (kind === "grass" || kind === "forestFloor") {
    drawSpeckles(context, rng, size, colorToRgb(0xa8b57a), 170, kind === "grass" ? 0.052 : 0.038, 0.82);
    drawSpeckles(context, rng, size, colorToRgb(0x18281b), 96, kind === "grass" ? 0.034 : 0.046, 0.92);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
};

export const createProceduralRoughnessTexture = (
  kind: TextureKind,
  seed = 1,
  size = 128,
) => {
  const key = `rough:${kind}:${size}:${seed}`;
  const cached = textureCache.get(key);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create roughness texture canvas.");
  }

  const rng = makeRng(seed + 991);
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const pattern =
        0.66 +
        Math.sin((u * 8.0 + seed * 0.01) * Math.PI * 2) * 0.06 +
        Math.cos((v * 12.0 - seed * 0.02) * Math.PI * 2) * 0.05 +
        (rng() - 0.5) * 0.16;
      const value = Math.round(THREE.MathUtils.clamp(pattern, 0.32, 0.98) * 255);
      const offset = (y * size + x) * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
};

export const makeTexturedStandardMaterial = ({
  color,
  roughness = 0.86,
  metalness = 0,
  emissive,
  emissiveIntensity = 0,
  side,
  ...textureOptions
}: MaterialOptions) => {
  const parameters: THREE.MeshStandardMaterialParameters = {
    color: color ?? textureOptions.base,
    map: createProceduralTexture(textureOptions),
    roughnessMap: createProceduralRoughnessTexture(
      textureOptions.kind,
      (textureOptions.seed ?? 1) + 47,
      textureOptions.size,
    ),
    roughness,
    metalness,
  };

  if (emissive !== undefined) {
    parameters.emissive = emissive;
    parameters.emissiveIntensity = emissiveIntensity;
  }

  if (side !== undefined) {
    parameters.side = side;
  }

  return new THREE.MeshStandardMaterial(parameters);
};

export const applyPlanarUvs = (
  geometry: THREE.BufferGeometry,
  scale = 90,
  offsetX = 0,
  offsetZ = 0,
) => {
  const position = geometry.getAttribute("position");
  const uvs: number[] = [];
  for (let index = 0; index < position.count; index += 1) {
    uvs.push(
      (position.getX(index) + offsetX) / scale,
      (position.getZ(index) + offsetZ) / scale,
    );
  }
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
};
