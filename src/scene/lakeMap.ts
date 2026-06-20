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

export const LAKE_MAP = {
  outline: [
    { x: -510, z: -34 },
    { x: -486, z: -104 },
    { x: -424, z: -166 },
    { x: -322, z: -192 },
    { x: -244, z: -238 },
    { x: -126, z: -214 },
    { x: -30, z: -176 },
    { x: 78, z: -224 },
    { x: 190, z: -202 },
    { x: 284, z: -148 },
    { x: 388, z: -168 },
    { x: 486, z: -112 },
    { x: 542, z: -52 },
    { x: 498, z: 10 },
    { x: 552, z: 66 },
    { x: 476, z: 126 },
    { x: 356, z: 144 },
    { x: 274, z: 204 },
    { x: 146, z: 184 },
    { x: 36, z: 222 },
    { x: -72, z: 176 },
    { x: -178, z: 210 },
    { x: -288, z: 174 },
    { x: -366, z: 118 },
    { x: -476, z: 96 },
    { x: -528, z: 34 },
  ] satisfies LakePoint[],
  mapBounds: {
    minX: -585,
    maxX: 585,
    minZ: -290,
    maxZ: 270,
  },
  worldRadius: 730,
  shorelineWidth: 34,
  landWidth: 270,
  island: {
    center: { x: 184, z: 28 },
    radiusX: 42,
    radiusZ: 24,
    rotation: -0.34,
  },
  sandbar: {
    center: { x: -138, z: 96 },
    radiusX: 76,
    radiusZ: 20,
    rotation: 0.18,
  },
  destinations: [
    {
      key: "dock",
      label: "Dock",
      center: { x: -474, z: 70 },
      radius: 20,
      kind: "shore",
    },
    {
      key: "sandbar",
      label: "Sandbar",
      center: { x: -138, z: 96 },
      radius: 42,
      kind: "shallows",
    },
    {
      key: "cove",
      label: "Cove",
      center: { x: 486, z: -102 },
      radius: 46,
      kind: "cove",
    },
    {
      key: "island",
      label: "Island",
      center: { x: 184, z: 28 },
      radius: 44,
      kind: "island",
    },
    {
      key: "reeds",
      label: "Reeds",
      center: { x: -346, z: 136 },
      radius: 44,
      kind: "shore",
    },
  ] satisfies LakeDestination[],
} as const;

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
  let nearest = LAKE_MAP.outline[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < LAKE_MAP.outline.length; index += 1) {
    const start = LAKE_MAP.outline[index];
    const end = LAKE_MAP.outline[(index + 1) % LAKE_MAP.outline.length];
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
    LAKE_MAP.sandbar.center,
    LAKE_MAP.sandbar.radiusX,
    LAKE_MAP.sandbar.radiusZ,
    LAKE_MAP.sandbar.rotation,
  );

export const isInIsland = (point: LakePoint) =>
  isInEllipse(
    point,
    LAKE_MAP.island.center,
    LAKE_MAP.island.radiusX,
    LAKE_MAP.island.radiusZ,
    LAKE_MAP.island.rotation,
  );

export const isWater = (point: LakePoint) =>
  pointInPolygon(point, LAKE_MAP.outline) && !isInIsland(point) && !isInSandbar(point);

export const isLand = (point: LakePoint) => !isWater(point);

export const distanceToShore = (point: LakePoint) => {
  const shore = getNearestShorePoint(point);
  const signedDistance = pointInPolygon(point, LAKE_MAP.outline) ? shore.distance : -shore.distance;
  const obstacleDistance = Math.min(
    getDistance(point, LAKE_MAP.island.center) - LAKE_MAP.island.radiusX,
    getDistance(point, LAKE_MAP.sandbar.center) - LAKE_MAP.sandbar.radiusX,
  );
  return Math.min(signedDistance, obstacleDistance);
};

export const getLakeNormalizedPosition = (point: LakePoint) => {
  const { minX, maxX, minZ, maxZ } = LAKE_MAP.mapBounds;
  return {
    x: (point.x - minX) / (maxX - minX),
    z: (point.z - minZ) / (maxZ - minZ),
  };
};

export const getExpandedOutline = (amount: number) =>
  LAKE_MAP.outline.map((point) => {
    const length = Math.max(1, Math.hypot(point.x, point.z));
    return {
      x: point.x + (point.x / length) * amount,
      z: point.z + (point.z / length) * amount,
    };
  });

export const clampBoatToWater = (point: LakePoint): ClampResult => {
  let next = { ...point };
  let hitBoundary = false;

  if (!pointInPolygon(next, LAKE_MAP.outline)) {
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
    LAKE_MAP.island.center,
    LAKE_MAP.island.radiusX,
    LAKE_MAP.island.radiusZ,
    LAKE_MAP.island.rotation,
    7,
  );
  if (afterIsland !== next) {
    next = afterIsland;
    hitBoundary = true;
  }

  const afterSandbar = pushOutOfEllipse(
    next,
    LAKE_MAP.sandbar.center,
    LAKE_MAP.sandbar.radiusX,
    LAKE_MAP.sandbar.radiusZ,
    LAKE_MAP.sandbar.rotation,
    6,
  );
  if (afterSandbar !== next) {
    next = afterSandbar;
    hitBoundary = true;
  }

  if (!pointInPolygon(next, LAKE_MAP.outline)) {
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
