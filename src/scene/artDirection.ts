import type { StormStageName } from "../state/weatherEngine";

export type VisualPalette = {
  stage: StormStageName;
  skyTop: number;
  skyHorizon: number;
  sunColor: number;
  waterDeep: number;
  waterShallow: number;
  shorelineGrass: number;
  sand: number;
  rock: number;
  fogColor: number;
  ambientLight: number;
  directionalLight: number;
  stormTint: number;
  vignette: number;
  gradeWarmth: number;
};

export const SCENARIO_PALETTES: Record<StormStageName, VisualPalette> = {
  Serene: {
    stage: "Serene",
    skyTop: 0x8fc8ef,
    skyHorizon: 0xd8edf2,
    sunColor: 0xffdf9f,
    waterDeep: 0x034a82,
    waterShallow: 0x399aa9,
    shorelineGrass: 0x37653b,
    sand: 0xd8c486,
    rock: 0x7f8f84,
    fogColor: 0xcfe4dc,
    ambientLight: 0xbbe6ff,
    directionalLight: 0xffdaa0,
    stormTint: 0xeef7eb,
    vignette: 0.04,
    gradeWarmth: 0.62,
  },
  "Slightly Uneasy": {
    stage: "Slightly Uneasy",
    skyTop: 0x879caf,
    skyHorizon: 0xb9c8c5,
    sunColor: 0xd4c8aa,
    waterDeep: 0x0c3f58,
    waterShallow: 0x4f858d,
    shorelineGrass: 0x315a36,
    sand: 0xb7ab78,
    rock: 0x717b76,
    fogColor: 0xaebeba,
    ambientLight: 0x91aebe,
    directionalLight: 0xd4c8aa,
    stormTint: 0x81929b,
    vignette: 0.16,
    gradeWarmth: 0.38,
  },
  Volatile: {
    stage: "Volatile",
    skyTop: 0x33424a,
    skyHorizon: 0x6f7f7d,
    sunColor: 0xaeb7b5,
    waterDeep: 0x0b2d3b,
    waterShallow: 0x315c63,
    shorelineGrass: 0x2f4d31,
    sand: 0x8a805f,
    rock: 0x565f5f,
    fogColor: 0x6f8180,
    ambientLight: 0x6e8592,
    directionalLight: 0xa3b0b4,
    stormTint: 0x42505a,
    vignette: 0.32,
    gradeWarmth: 0.18,
  },
  Storm: {
    stage: "Storm",
    skyTop: 0x101820,
    skyHorizon: 0x314149,
    sunColor: 0x90a9ba,
    waterDeep: 0x061924,
    waterShallow: 0x173943,
    shorelineGrass: 0x203826,
    sand: 0x6c654f,
    rock: 0x3d4648,
    fogColor: 0x334148,
    ambientLight: 0x506a78,
    directionalLight: 0x8fa7b7,
    stormTint: 0x1d2b35,
    vignette: 0.52,
    gradeWarmth: 0.06,
  },
  Apocalyptic: {
    stage: "Apocalyptic",
    skyTop: 0x120606,
    skyHorizon: 0x661b10,
    sunColor: 0xff6c3d,
    waterDeep: 0x14080a,
    waterShallow: 0x5c1b12,
    shorelineGrass: 0x24150f,
    sand: 0x704024,
    rock: 0x2a1d1a,
    fogColor: 0x2c1211,
    ambientLight: 0x6f2418,
    directionalLight: 0xff7340,
    stormTint: 0x7c1b0f,
    vignette: 0.76,
    gradeWarmth: 0.9,
  },
};

const PALETTE_STOPS = [
  { value: 0, palette: SCENARIO_PALETTES.Serene },
  { value: 20, palette: SCENARIO_PALETTES["Slightly Uneasy"] },
  { value: 40, palette: SCENARIO_PALETTES.Volatile },
  { value: 60, palette: SCENARIO_PALETTES.Storm },
  { value: 80, palette: SCENARIO_PALETTES.Apocalyptic },
  { value: 100, palette: SCENARIO_PALETTES.Apocalyptic },
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const smoothstep = (value: number) => {
  const next = clamp01(value);
  return next * next * (3 - 2 * next);
};

const lerpNumber = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

const lerpHex = (from: number, to: number, amount: number) => {
  const fromR = (from >> 16) & 255;
  const fromG = (from >> 8) & 255;
  const fromB = from & 255;
  const toR = (to >> 16) & 255;
  const toG = (to >> 8) & 255;
  const toB = to & 255;

  return (
    (Math.round(lerpNumber(fromR, toR, amount)) << 16) |
    (Math.round(lerpNumber(fromG, toG, amount)) << 8) |
    Math.round(lerpNumber(fromB, toB, amount))
  );
};

export const getWeatherPalette = (stormIndex: number): VisualPalette => {
  const clamped = Math.max(0, Math.min(100, stormIndex));
  const upperIndex = PALETTE_STOPS.findIndex((stop) => clamped <= stop.value);
  const upper = PALETTE_STOPS[Math.max(1, upperIndex)];
  const lower = PALETTE_STOPS[Math.max(0, upperIndex - 1)];
  const amount = smoothstep((clamped - lower.value) / Math.max(1, upper.value - lower.value));
  const from = lower.palette;
  const to = upper.palette;

  return {
    stage: clamped < 20 ? "Serene" : clamped < 40 ? "Slightly Uneasy" : clamped < 60 ? "Volatile" : clamped < 80 ? "Storm" : "Apocalyptic",
    skyTop: lerpHex(from.skyTop, to.skyTop, amount),
    skyHorizon: lerpHex(from.skyHorizon, to.skyHorizon, amount),
    sunColor: lerpHex(from.sunColor, to.sunColor, amount),
    waterDeep: lerpHex(from.waterDeep, to.waterDeep, amount),
    waterShallow: lerpHex(from.waterShallow, to.waterShallow, amount),
    shorelineGrass: lerpHex(from.shorelineGrass, to.shorelineGrass, amount),
    sand: lerpHex(from.sand, to.sand, amount),
    rock: lerpHex(from.rock, to.rock, amount),
    fogColor: lerpHex(from.fogColor, to.fogColor, amount),
    ambientLight: lerpHex(from.ambientLight, to.ambientLight, amount),
    directionalLight: lerpHex(from.directionalLight, to.directionalLight, amount),
    stormTint: lerpHex(from.stormTint, to.stormTint, amount),
    vignette: lerpNumber(from.vignette, to.vignette, amount),
    gradeWarmth: lerpNumber(from.gradeWarmth, to.gradeWarmth, amount),
  };
};
