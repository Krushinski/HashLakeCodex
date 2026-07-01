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
  outerBoundary: "outline";
};

export const RIBBON_CAKE_OUTER_OFFSET =
  ZONE_TRUTH.farForestMaxShoreClearance + 72;

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
    startY: 0.055,
    endY: 0.15,
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
    endOffset: 50,
    startY: 0.15,
    endY: 0.42,
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
    startOffset: 50,
    endOffset: 112,
    startY: 0.42,
    endY: 1.08,
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
    startOffset: 112,
    endOffset: 176,
    startY: 1.08,
    endY: 1.68,
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
    startOffset: 176,
    endOffset: 258,
    startY: 1.68,
    endY: 2.34,
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
    startOffset: 258,
    endOffset: 326,
    startY: 2.34,
    endY: 2.92,
    material: "midForestShelf",
    owner: "createShoreline",
    overlapAllowed: false,
    waterAllowed: false,
    visualRole: "Darker mid-forest shelf before far forest massing.",
  },
  {
    key: "farForestGroundInner",
    zone: 5,
    zoneName: "Far Forest Wall",
    startOffset: 326,
    endOffset: 372,
    startY: 2.92,
    endY: 3.28,
    material: "farForest",
    owner: "createShoreline",
    overlapAllowed: false,
    waterAllowed: false,
    visualRole: "Inner far-forest floor ribbon beneath the far forest wall.",
  },
  {
    key: "farForestGroundMid",
    zone: 5,
    zoneName: "Far Forest Wall",
    startOffset: 372,
    endOffset: 408,
    startY: 3.28,
    endY: 3.62,
    material: "farForest",
    owner: "createShoreline",
    overlapAllowed: false,
    waterAllowed: false,
    visualRole: "Middle far-forest floor ribbon beneath the far forest wall.",
  },
  {
    key: "farForestGroundOuter",
    zone: 5,
    zoneName: "Far Forest Wall",
    startOffset: 408,
    endOffset: RIBBON_CAKE_OUTER_OFFSET,
    startY: 3.62,
    endY: 4.10,
    material: "farForest",
    owner: "createShoreline",
    overlapAllowed: false,
    waterAllowed: false,
    visualRole: "Outer far-forest floor ribbon beneath the far forest wall.",
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
  groundBand(ZONE_BAND_TABLE[7], 22, 0.011, "outline"),
  groundBand(ZONE_BAND_TABLE[8], 31, 0.011, "outline"),
  groundBand(ZONE_BAND_TABLE[9], 47, 0.011, "outline"),
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

export const ZONE_BAND_TABLE_VERSION = "phase113-riparian-depth-ecology";
