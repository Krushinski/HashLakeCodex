import { LAKE_MAP, ZONE_TRUTH, distanceToShore, type LakePoint } from "./lakeMap";

export type ZoneBandMaterialKey =
  | "waterShader"
  | "wetSand"
  | "bankToe"
  | "shoreGrass"
  | "raisedBank"
  | "forestShelf"
  | "midForestShelf"
  | "farForest"
  | "mountainTerrain"
  | "sky";

export type ZoneBandOwner =
  | "waterSystem"
  | "createShoreline"
  | "createDestinations"
  | "forestSystem"
  | "terrainSystem"
  | "skySystem";

export type ZoneBandSpec = {
  key: string;
  zone: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  zoneName: string;
  startOffset: number;
  endOffset: number;
  startY: number;
  endY: number;
  material: ZoneBandMaterialKey;
  owner: ZoneBandOwner;
  overlapAllowed: boolean;
  waterAllowed: boolean;
  visualRole: string;
};

export type GroundBandSpec = ZoneBandSpec & {
  owner: "createShoreline";
  seed: number;
  wobble: number;
  outerBoundary: "outline" | "world";
};

const groundBand = (
  zoneBand: ZoneBandSpec,
  seed: number,
  wobble: number,
  outerBoundary: GroundBandSpec["outerBoundary"],
): GroundBandSpec => ({
  ...zoneBand,
  owner: "createShoreline",
  seed,
  wobble,
  outerBoundary,
});

export const ZONE_BAND_TABLE: readonly ZoneBandSpec[] = [
  {
    key: "water",
    zone: 1,
    zoneName: "Water / Lake",
    startOffset: Number.NEGATIVE_INFINITY,
    endOffset: 0,
    startY: -0.035,
    endY: -0.035,
    material: "waterShader",
    owner: "waterSystem",
    overlapAllowed: false,
    waterAllowed: true,
    visualRole: "Only valid lake water, wake, splashes, and ripple effects.",
  },
  {
    key: "wetSand",
    zone: 2,
    zoneName: "Shore / Wet Edge",
    startOffset: -6,
    endOffset: ZONE_TRUTH.wetEdgeWidth + 4,
    startY: 0.09,
    endY: 0.22,
    material: "wetSand",
    owner: "createShoreline",
    overlapAllowed: true,
    waterAllowed: true,
    visualRole: "Narrow damp land lip overlapping the first few waterline units.",
  },
  {
    key: "bankToe",
    zone: 2,
    zoneName: "Shore / Wet Edge",
    startOffset: ZONE_TRUTH.wetEdgeWidth + 4,
    endOffset: 42,
    startY: 0.22,
    endY: 0.72,
    material: "bankToe",
    owner: "createShoreline",
    overlapAllowed: false,
    waterAllowed: false,
    visualRole: "Muted earth/grass toe above the wet edge.",
  },
  {
    key: "shoreGrass",
    zone: 3,
    zoneName: "Raised Bank",
    startOffset: 42,
    endOffset: ZONE_TRUTH.shorelineGrassOuter,
    startY: 0.72,
    endY: 1.02,
    material: "shoreGrass",
    owner: "createShoreline",
    overlapAllowed: false,
    waterAllowed: false,
    visualRole: "Readable green shoreline bank rising above the lake.",
  },
  {
    key: "raisedBank",
    zone: 3,
    zoneName: "Raised Bank",
    startOffset: ZONE_TRUTH.shorelineGrassOuter,
    endOffset: ZONE_TRUTH.raisedBankOuter,
    startY: 1.02,
    endY: 1.44,
    material: "raisedBank",
    owner: "createShoreline",
    overlapAllowed: false,
    waterAllowed: false,
    visualRole: "Contained earth/grass basin lip.",
  },
  {
    key: "forestShelf",
    zone: 4,
    zoneName: "Near / Mid Forest Shelf",
    startOffset: ZONE_TRUTH.forestShelfInner,
    endOffset: 214,
    startY: 1.44,
    endY: 1.9,
    material: "forestShelf",
    owner: "createShoreline",
    overlapAllowed: false,
    waterAllowed: false,
    visualRole: "Near forest floor for sparse shoreline vegetation.",
  },
  {
    key: "midForestShelf",
    zone: 4,
    zoneName: "Near / Mid Forest Shelf",
    startOffset: 214,
    endOffset: ZONE_TRUTH.forestShelfOuter,
    startY: 1.9,
    endY: 2.24,
    material: "midForestShelf",
    owner: "createShoreline",
    overlapAllowed: false,
    waterAllowed: false,
    visualRole: "Darker mid-forest shelf before far forest massing.",
  },
  {
    key: "farForestGround",
    zone: 5,
    zoneName: "Far Forest Wall",
    startOffset: ZONE_TRUTH.forestShelfOuter,
    endOffset: LAKE_MAP.worldRadius,
    startY: 2.24,
    endY: 2.42,
    material: "farForest",
    owner: "createShoreline",
    overlapAllowed: false,
    waterAllowed: false,
    visualRole: "Outer land floor beneath the far forest wall.",
  },
  {
    key: "farForestInstances",
    zone: 5,
    zoneName: "Far Forest Wall",
    startOffset: ZONE_TRUTH.farForestMinShoreClearance,
    endOffset: ZONE_TRUTH.farForestMaxShoreClearance,
    startY: 2.24,
    endY: 2.42,
    material: "farForest",
    owner: "forestSystem",
    overlapAllowed: true,
    waterAllowed: false,
    visualRole: "Trees and canopy instances only; not another ground plane.",
  },
  {
    key: "mountainBackdrop",
    zone: 6,
    zoneName: "Mountain Backdrop / Back Arc",
    startOffset: LAKE_MAP.mapBounds.maxX + 620,
    endOffset: LAKE_MAP.mapBounds.maxX + 1480,
    startY: 0.75,
    endY: 315,
    material: "mountainTerrain",
    owner: "terrainSystem",
    overlapAllowed: false,
    waterAllowed: false,
    visualRole: "Rear/back-arc mountains behind Zone 5.",
  },
  {
    key: "sky",
    zone: 7,
    zoneName: "Sky / Clouds",
    startOffset: Number.POSITIVE_INFINITY,
    endOffset: Number.POSITIVE_INFINITY,
    startY: 0,
    endY: Number.POSITIVE_INFINITY,
    material: "sky",
    owner: "skySystem",
    overlapAllowed: true,
    waterAllowed: false,
    visualRole: "Atmosphere above and behind terrain.",
  },
] as const;

export const LAND_PERIMETER_BANDS: readonly GroundBandSpec[] = [
  groundBand(ZONE_BAND_TABLE[1], 9, 0.003, "outline"),
  groundBand(ZONE_BAND_TABLE[2], 13, 0.01, "outline"),
  groundBand(ZONE_BAND_TABLE[3], 17, 0.014, "outline"),
  groundBand(ZONE_BAND_TABLE[4], 29, 0.014, "outline"),
  groundBand(ZONE_BAND_TABLE[5], 37, 0.012, "outline"),
  groundBand(ZONE_BAND_TABLE[6], 43, 0.014, "outline"),
  groundBand(ZONE_BAND_TABLE[7], 22, 0.014, "world"),
] as const;

export const getGroundHeightForShoreClearance = (clearance: number) => {
  const normalizedClearance = Math.max(0, clearance);
  const ownedBand =
    LAND_PERIMETER_BANDS.find(
      (band) =>
        normalizedClearance >= Math.max(0, band.startOffset) &&
        normalizedClearance <= band.endOffset,
    ) ?? LAND_PERIMETER_BANDS[LAND_PERIMETER_BANDS.length - 1];

  const start = Math.max(0, ownedBand.startOffset);
  const span = Math.max(1, ownedBand.endOffset - start);
  const amount = Math.min(1, Math.max(0, (normalizedClearance - start) / span));
  return ownedBand.startY + (ownedBand.endY - ownedBand.startY) * amount;
};

export const getGroundHeightAtPoint = (point: LakePoint) =>
  getGroundHeightForShoreClearance(Math.max(0, -distanceToShore(point)));

export const ZONE_BAND_TABLE_VERSION = "phase82-certified-object-ownership";
