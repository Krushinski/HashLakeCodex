export type LakePoint = {
  x: number;
  z: number;
};

export type LakeDestinationKey = "dock" | "sandbar" | "cove" | "island" | "reeds";

export type LakeDestination = {
  key: LakeDestinationKey;
  label: string;
  center: LakePoint;
  radius: number;
  kind: "shore" | "shallows" | "island" | "cove";
};

type ClampResult = {
  point: LakePoint;
  hitBoundary: boolean;
  centerYaw: number;
};

type NearestShoreResult = {
  point: LakePoint;
  distance: number;
};

const ISLAND_EDGE_PADDING = {
  x: 6,
  z: 4,
} as const;

const SANDBAR_EDGE_PADDING = {
  x: 8,
  z: 3,
} as const;

export const LAKE_MAP = {
  outline: [
    { x: -690, z: -50 },
    { x: -660, z: -178 },
    { x: -575, z: -270 },
    { x: -465, z: -286 },
    { x: -410, z: -364 },
    { x: -320, z: -334 },
    { x: -225, z: -390 },
    { x: -120, z: -330 },
    { x: -20, z: -350 },
    { x: 72, z: -286 },
    { x: 150, z: -320 },
    { x: 260, z: -294 },
    { x: 330, z: -220 },
    { x: 430, z: -252 },
    { x: 560, z: -200 },
    { x: 626, z: -182 },
    { x: 690, z: -140 },
    { x: 724, z: -84 },
    { x: 704, z: -34 },
    { x: 728, z: 22 },
    { x: 700, z: 72 },
    { x: 672, z: 116 },
    { x: 704, z: 166 },
    { x: 650, z: 208 },
    { x: 594, z: 230 },
    { x: 478, z: 212 },
    { x: 390, z: 310 },
    { x: 270, z: 278 },
    { x: 168, z: 342 },
    { x: 40, z: 300 },
    { x: -78, z: 338 },
    { x: -178, z: 284 },
    { x: -288, z: 324 },
    { x: -370, z: 242 },
    { x: -496, z: 218 },
    { x: -620, z: 150 },
    { x: -668, z: 68 },
  ] satisfies LakePoint[],
  mapBounds: {
    minX: -760,
    maxX: 760,
    minZ: -430,
    maxZ: 390,
  },
  worldRadius: 960,
  shorelineWidth: 42,
  landWidth: 330,
  mainlandBeach: {
    center: { x: -576, z: 156 },
    radiusX: 54,
    radiusZ: 14,
    rotation: 0.34,
  },
  island: {
    center: { x: 248, z: 46 },
    radiusX: 60,
    radiusZ: 35,
    rotation: -0.28,
  },
  sandbar: {
    center: { x: -188, z: 158 },
    radiusX: 112,
    radiusZ: 30,
    rotation: 0.14,
  },
  destinations: [
    {
      key: "dock",
      label: "Dock",
      center: { x: -620, z: 116 },
      radius: 20,
      kind: "shore",
    },
    {
      key: "sandbar",
      label: "Sandbar",
      center: { x: -188, z: 158 },
      radius: 62,
      kind: "shallows",
    },
    {
      key: "cove",
      label: "Cove",
      center: { x: 654, z: -122 },
      radius: 68,
      kind: "cove",
    },
    {
      key: "island",
      label: "Island",
      center: { x: 248, z: 46 },
      radius: 64,
      kind: "island",
    },
    {
      key: "reeds",
      label: "Reeds",
      center: { x: -492, z: 204 },
      radius: 58,
      kind: "shore",
    },
  ] satisfies LakeDestination[],
} as const;

export type LakeFeatureFootprint = {
  center: LakePoint;
  rotation: number;
  blocker: { radiusX: number; radiusZ: number };
  dry: { radiusX: number; radiusZ: number };
  wetOuter: { radiusX: number; radiusZ: number };
  shallowInner: { radiusX: number; radiusZ: number };
  shallowOuter: { radiusX: number; radiusZ: number };
};

export const LAKE_FEATURE_FOOTPRINTS = {
  island: {
    center: LAKE_MAP.island.center,
    rotation: LAKE_MAP.island.rotation,
    blocker: {
      radiusX: LAKE_MAP.island.radiusX + ISLAND_EDGE_PADDING.x + 28,
      radiusZ: LAKE_MAP.island.radiusZ + ISLAND_EDGE_PADDING.z + 16,
    },
    dry: {
      radiusX: LAKE_MAP.island.radiusX + ISLAND_EDGE_PADDING.x + 34,
      radiusZ: LAKE_MAP.island.radiusZ + ISLAND_EDGE_PADDING.z + 20,
    },
    wetOuter: {
      radiusX: LAKE_MAP.island.radiusX + ISLAND_EDGE_PADDING.x + 56,
      radiusZ: LAKE_MAP.island.radiusZ + ISLAND_EDGE_PADDING.z + 34,
    },
    shallowInner: {
      radiusX: LAKE_MAP.island.radiusX + ISLAND_EDGE_PADDING.x + 82,
      radiusZ: LAKE_MAP.island.radiusZ + ISLAND_EDGE_PADDING.z + 52,
    },
    shallowOuter: {
      radiusX: LAKE_MAP.island.radiusX + ISLAND_EDGE_PADDING.x + 118,
      radiusZ: LAKE_MAP.island.radiusZ + ISLAND_EDGE_PADDING.z + 74,
    },
  },
  sandbar: {
    center: LAKE_MAP.sandbar.center,
    rotation: LAKE_MAP.sandbar.rotation,
    blocker: {
      radiusX: LAKE_MAP.sandbar.radiusX + SANDBAR_EDGE_PADDING.x + 18,
      radiusZ: LAKE_MAP.sandbar.radiusZ + SANDBAR_EDGE_PADDING.z + 12,
    },
    dry: {
      radiusX: LAKE_MAP.sandbar.radiusX + SANDBAR_EDGE_PADDING.x + 26,
      radiusZ: LAKE_MAP.sandbar.radiusZ + SANDBAR_EDGE_PADDING.z + 16,
    },
    wetOuter: {
      radiusX: LAKE_MAP.sandbar.radiusX + SANDBAR_EDGE_PADDING.x + 48,
      radiusZ: LAKE_MAP.sandbar.radiusZ + SANDBAR_EDGE_PADDING.z + 28,
    },
    shallowInner: {
      radiusX: LAKE_MAP.sandbar.radiusX + SANDBAR_EDGE_PADDING.x + 76,
      radiusZ: LAKE_MAP.sandbar.radiusZ + SANDBAR_EDGE_PADDING.z + 46,
    },
    shallowOuter: {
      radiusX: LAKE_MAP.sandbar.radiusX + SANDBAR_EDGE_PADDING.x + 116,
      radiusZ: LAKE_MAP.sandbar.radiusZ + SANDBAR_EDGE_PADDING.z + 68,
    },
  },
} as const satisfies Record<"island" | "sandbar", LakeFeatureFootprint>;

const smoothClosedPolygon = (points: readonly LakePoint[], subdivisions = 4) => {
  const smoothed: LakePoint[] = [];
  const count = points.length;

  for (let index = 0; index < count; index += 1) {
    const p0 = points[(index - 1 + count) % count];
    const p1 = points[index];
    const p2 = points[(index + 1) % count];
    const p3 = points[(index + 2) % count];

    for (let step = 0; step < subdivisions; step += 1) {
      const t = step / subdivisions;
      const t2 = t * t;
      const t3 = t2 * t;
      smoothed.push({
        x:
          0.5 *
          ((2 * p1.x) +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z:
          0.5 *
          ((2 * p1.z) +
            (-p0.z + p2.z) * t +
            (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
            (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      });
    }
  }

  return smoothed;
};

export const LAKE_OUTLINE = smoothClosedPolygon(LAKE_MAP.outline, 8);

export const getDistance = (a: LakePoint, b: LakePoint) =>
  Math.hypot(a.x - b.x, a.z - b.z);

export const getRadius = (point: LakePoint) => Math.hypot(point.x, point.z);

const rotateIntoEllipse = (
  point: LakePoint,
  center: LakePoint,
  rotation: number,
) => {
  const dx = point.x - center.x;
  const dz = point.z - center.z;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos,
  };
};

const getEllipseClearance = (
  point: LakePoint,
  center: LakePoint,
  radiusX: number,
  radiusZ: number,
  rotation: number,
) => {
  const rotated = rotateIntoEllipse(point, center, rotation);
  const normalized = Math.hypot(rotated.x / radiusX, rotated.z / radiusZ);
  const angle = Math.atan2(rotated.z / radiusZ, rotated.x / radiusX);
  const boundary = {
    x: Math.cos(angle) * radiusX,
    z: Math.sin(angle) * radiusZ,
  };
  const distance = Math.hypot(rotated.x - boundary.x, rotated.z - boundary.z);
  return normalized <= 1 ? -distance : distance;
};

const pointInPolygon = (point: LakePoint, polygon: readonly LakePoint[]) => {
  let inside = false;
  for (let index = 0, last = polygon.length - 1; index < polygon.length; last = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[last];
    const intersects =
      current.z > point.z !== previous.z > point.z &&
      point.x <
        ((previous.x - current.x) * (point.z - current.z)) /
          (previous.z - current.z) +
          current.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
};

const closestPointOnSegment = (point: LakePoint, start: LakePoint, end: LakePoint) => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 0.001) {
    return { ...start };
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared),
  );
  return {
    x: start.x + dx * t,
    z: start.z + dz * t,
  };
};

export const getNearestShorePoint = (point: LakePoint): NearestShoreResult => {
  let nearest = LAKE_OUTLINE[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < LAKE_OUTLINE.length; index += 1) {
    const start = LAKE_OUTLINE[index];
    const end = LAKE_OUTLINE[(index + 1) % LAKE_OUTLINE.length];
    const candidate = closestPointOnSegment(point, start, end);
    const distance = getDistance(point, candidate);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return {
    point: nearest,
    distance: nearestDistance,
  };
};

const isInEllipse = (
  point: LakePoint,
  center: LakePoint,
  radiusX: number,
  radiusZ: number,
  rotation: number,
  padding = 0,
) => {
  const rotated = rotateIntoEllipse(point, center, rotation);
  const xRadius = Math.max(1, radiusX + padding);
  const zRadius = Math.max(1, radiusZ + padding);
  return (rotated.x / xRadius) ** 2 + (rotated.z / zRadius) ** 2 <= 1;
};

const pushOutOfEllipse = (
  point: LakePoint,
  center: LakePoint,
  radiusX: number,
  radiusZ: number,
  rotation: number,
  padding: number,
) => {
  const rotated = rotateIntoEllipse(point, center, rotation);
  const normalized = Math.hypot(rotated.x / radiusX, rotated.z / radiusZ);
  if (normalized >= 1 + padding / Math.max(radiusX, radiusZ)) {
    return point;
  }

  const angle = Math.atan2(rotated.z / radiusZ, rotated.x / radiusX);
  const local = {
    x: Math.cos(angle) * (radiusX + padding),
    z: Math.sin(angle) * (radiusZ + padding),
  };
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: center.x + local.x * cos - local.z * sin,
    z: center.z + local.x * sin + local.z * cos,
  };
};

export const isInSandbar = (point: LakePoint) =>
  isInEllipse(
    point,
    LAKE_FEATURE_FOOTPRINTS.sandbar.center,
    LAKE_FEATURE_FOOTPRINTS.sandbar.dry.radiusX,
    LAKE_FEATURE_FOOTPRINTS.sandbar.dry.radiusZ,
    LAKE_FEATURE_FOOTPRINTS.sandbar.rotation,
  );

export const isInIsland = (point: LakePoint) =>
  isInEllipse(
    point,
    LAKE_FEATURE_FOOTPRINTS.island.center,
    LAKE_FEATURE_FOOTPRINTS.island.dry.radiusX,
    LAKE_FEATURE_FOOTPRINTS.island.dry.radiusZ,
    LAKE_FEATURE_FOOTPRINTS.island.rotation,
  );

export const isInsideLakeOutline = (point: LakePoint) =>
  pointInPolygon(point, LAKE_OUTLINE);

export const isWater = (point: LakePoint) =>
  pointInPolygon(point, LAKE_OUTLINE) && !isInIsland(point) && !isInSandbar(point);

export const isLand = (point: LakePoint) => !isWater(point);

export const isMainland = (point: LakePoint) =>
  !isInsideLakeOutline(point) && !isInIsland(point) && !isInSandbar(point);

export const distanceToShore = (point: LakePoint) => {
  const shore = getNearestShorePoint(point);
  const signedDistance = pointInPolygon(point, LAKE_OUTLINE) ? shore.distance : -shore.distance;
  const obstacleDistance = Math.min(
    getEllipseClearance(
      point,
      LAKE_FEATURE_FOOTPRINTS.island.center,
      LAKE_FEATURE_FOOTPRINTS.island.dry.radiusX,
      LAKE_FEATURE_FOOTPRINTS.island.dry.radiusZ,
      LAKE_FEATURE_FOOTPRINTS.island.rotation,
    ),
    getEllipseClearance(
      point,
      LAKE_FEATURE_FOOTPRINTS.sandbar.center,
      LAKE_FEATURE_FOOTPRINTS.sandbar.dry.radiusX,
      LAKE_FEATURE_FOOTPRINTS.sandbar.dry.radiusZ,
      LAKE_FEATURE_FOOTPRINTS.sandbar.rotation,
    ),
  );
  return Math.min(signedDistance, obstacleDistance);
};

export const ZONE_TRUTH = {
  wetEdgeWidth: 10,
  shorelineGrassOuter: 88,
  raisedBankOuter: 142,
  forestShelfInner: 142,
  forestShelfOuter: 260,
  forestTreeMinShoreClearance: 38,
  forestTreeMaxShoreClearance: 330,
  farForestMinShoreClearance: 88,
  farForestMaxShoreClearance: 360,
  rockMinShoreClearance: 6,
  rockMaxShoreClearance: 58,
  reedWaterSideMax: 22,
  reedLandSideMax: 12,
  mainlandBeach: LAKE_MAP.mainlandBeach,
} as const;

export const isMainlandShoreZone = (
  point: LakePoint,
  minClearance: number = ZONE_TRUTH.rockMinShoreClearance,
  maxClearance: number = ZONE_TRUTH.rockMaxShoreClearance,
) => {
  const shoreDistance = distanceToShore(point);
  return (
    isMainland(point) &&
    shoreDistance <= -minClearance &&
    shoreDistance >= -maxClearance
  );
};

export const isMainlandForestZone = (
  point: LakePoint,
  minClearance: number = ZONE_TRUTH.forestTreeMinShoreClearance,
  maxClearance: number = ZONE_TRUTH.forestTreeMaxShoreClearance,
) => {
  const shoreDistance = distanceToShore(point);
  return (
    isMainland(point) &&
    shoreDistance <= -minClearance &&
    shoreDistance >= -maxClearance
  );
};

export const isReedWetlandZone = (point: LakePoint) => {
  const reedCenter =
    LAKE_MAP.destinations.find((destination) => destination.key === "reeds")?.center ??
    LAKE_MAP.mainlandBeach.center;
  const shoreDistance = distanceToShore(point);
  return (
    !isInIsland(point) &&
    !isInSandbar(point) &&
    getDistance(point, reedCenter) <= 126 &&
    shoreDistance <= ZONE_TRUTH.reedWaterSideMax &&
    shoreDistance >= -ZONE_TRUTH.reedLandSideMax
  );
};

export const getLakeNormalizedPosition = (point: LakePoint) => {
  const { minX, maxX, minZ, maxZ } = LAKE_MAP.mapBounds;
  return {
    x: (point.x - minX) / (maxX - minX),
    z: (point.z - minZ) / (maxZ - minZ),
  };
};

const getPolygonSignedArea = (points: readonly LakePoint[]) => {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.z - next.x * current.z;
  }
  return area * 0.5;
};

const lakeWinding = Math.sign(getPolygonSignedArea(LAKE_OUTLINE)) || 1;

export const getExpandedOutline = (amount: number) =>
  LAKE_OUTLINE.map((point, index) => {
    const previous = LAKE_OUTLINE[(index - 1 + LAKE_OUTLINE.length) % LAKE_OUTLINE.length];
    const next = LAKE_OUTLINE[(index + 1) % LAKE_OUTLINE.length];
    const inX = point.x - previous.x;
    const inZ = point.z - previous.z;
    const outX = next.x - point.x;
    const outZ = next.z - point.z;
    const inLength = Math.max(1, Math.hypot(inX, inZ));
    const outLength = Math.max(1, Math.hypot(outX, outZ));
    const inNormal = {
      x: lakeWinding * (inZ / inLength),
      z: lakeWinding * (-inX / inLength),
    };
    const outNormal = {
      x: lakeWinding * (outZ / outLength),
      z: lakeWinding * (-outX / outLength),
    };
    const normalX = inNormal.x + outNormal.x;
    const normalZ = inNormal.z + outNormal.z;
    const normalLength = Math.max(0.001, Math.hypot(normalX, normalZ));
    return {
      x: point.x + (normalX / normalLength) * amount,
      z: point.z + (normalZ / normalLength) * amount,
    };
  });

export const clampBoatToWater = (point: LakePoint): ClampResult => {
  let next = { ...point };
  let hitBoundary = false;

  if (!pointInPolygon(next, LAKE_OUTLINE)) {
    const shore = getNearestShorePoint(next).point;
    const towardCenter = Math.atan2(-shore.z, -shore.x);
    next = {
      x: shore.x + Math.cos(towardCenter) * 9,
      z: shore.z + Math.sin(towardCenter) * 9,
    };
    hitBoundary = true;
  }

  const afterIsland = pushOutOfEllipse(
    next,
    LAKE_FEATURE_FOOTPRINTS.island.center,
    LAKE_FEATURE_FOOTPRINTS.island.dry.radiusX,
    LAKE_FEATURE_FOOTPRINTS.island.dry.radiusZ,
    LAKE_FEATURE_FOOTPRINTS.island.rotation,
    3,
  );
  if (afterIsland !== next) {
    next = afterIsland;
    hitBoundary = true;
  }

  const afterSandbar = pushOutOfEllipse(
    next,
    LAKE_FEATURE_FOOTPRINTS.sandbar.center,
    LAKE_FEATURE_FOOTPRINTS.sandbar.dry.radiusX,
    LAKE_FEATURE_FOOTPRINTS.sandbar.dry.radiusZ,
    LAKE_FEATURE_FOOTPRINTS.sandbar.rotation,
    3,
  );
  if (afterSandbar !== next) {
    next = afterSandbar;
    hitBoundary = true;
  }

  if (!pointInPolygon(next, LAKE_OUTLINE)) {
    const shore = getNearestShorePoint(next).point;
    const towardCenter = Math.atan2(-shore.z, -shore.x);
    next = {
      x: shore.x + Math.cos(towardCenter) * 11,
      z: shore.z + Math.sin(towardCenter) * 11,
    };
    hitBoundary = true;
  }

  const shore = getNearestShorePoint(next).point;
  return {
    point: next,
    hitBoundary,
    centerYaw: Math.atan2(next.z - shore.z, next.x - shore.x),
  };
};

export const clampBoatToLake = clampBoatToWater;

export const getNearestLocation = (point: LakePoint) =>
  LAKE_MAP.destinations.reduce(
    (nearest, destination) => {
      const distance = getDistance(point, destination.center);
      return distance < nearest.distance ? { destination, distance } : nearest;
    },
    {
      destination: LAKE_MAP.destinations[0],
      distance: Number.POSITIVE_INFINITY,
    },
  );
