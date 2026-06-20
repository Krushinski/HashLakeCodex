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

export const LAKE_MAP = {
  waterRadius: 132,
  shorelineInnerRadius: 136,
  shorelineOuterRadius: 238,
  mapRadius: 250,
  island: {
    center: { x: 104, z: -34 },
    radius: 22,
  },
  sandbar: {
    center: { x: 72, z: 48 },
    radiusX: 30,
    radiusZ: 14,
  },
  destinations: [
    {
      key: "dock",
      label: "Dock",
      center: { x: -106, z: -110 },
      radius: 17,
      kind: "shore",
    },
    {
      key: "sandbar",
      label: "Sandbar",
      center: { x: 72, z: 48 },
      radius: 24,
      kind: "shallows",
    },
    {
      key: "cove",
      label: "Cove",
      center: { x: 22, z: -124 },
      radius: 24,
      kind: "cove",
    },
    {
      key: "island",
      label: "Island",
      center: { x: 104, z: -34 },
      radius: 25,
      kind: "island",
    },
    {
      key: "reeds",
      label: "Reeds",
      center: { x: -106, z: 64 },
      radius: 26,
      kind: "shore",
    },
  ] satisfies LakeDestination[],
} as const;

export const getDistance = (a: LakePoint, b: LakePoint) =>
  Math.hypot(a.x - b.x, a.z - b.z);

export const getRadius = (point: LakePoint) => Math.hypot(point.x, point.z);

export const isInSandbar = (point: LakePoint) => {
  const dx = (point.x - LAKE_MAP.sandbar.center.x) / LAKE_MAP.sandbar.radiusX;
  const dz = (point.z - LAKE_MAP.sandbar.center.z) / LAKE_MAP.sandbar.radiusZ;
  return dx * dx + dz * dz <= 1;
};

export const isInIsland = (point: LakePoint) =>
  getDistance(point, LAKE_MAP.island.center) <= LAKE_MAP.island.radius;

export const isWater = (point: LakePoint) =>
  getRadius(point) <= LAKE_MAP.waterRadius && !isInIsland(point) && !isInSandbar(point);

export const isLand = (point: LakePoint) =>
  getRadius(point) >= LAKE_MAP.shorelineInnerRadius || isInIsland(point) || isInSandbar(point);

export const distanceToShore = (point: LakePoint) => LAKE_MAP.waterRadius - getRadius(point);

const pushOutOfCircle = (
  point: LakePoint,
  center: LakePoint,
  radius: number,
  padding: number,
) => {
  const dx = point.x - center.x;
  const dz = point.z - center.z;
  const distance = Math.max(0.001, Math.hypot(dx, dz));
  const target = radius + padding;
  if (distance >= target) {
    return point;
  }

  return {
    x: center.x + (dx / distance) * target,
    z: center.z + (dz / distance) * target,
  };
};

const pushOutOfSandbar = (point: LakePoint, padding: number) => {
  const dx = point.x - LAKE_MAP.sandbar.center.x;
  const dz = point.z - LAKE_MAP.sandbar.center.z;
  const normalized = Math.hypot(
    dx / LAKE_MAP.sandbar.radiusX,
    dz / LAKE_MAP.sandbar.radiusZ,
  );
  if (normalized >= 1 + padding * 0.025) {
    return point;
  }

  const angle = Math.atan2(dz / LAKE_MAP.sandbar.radiusZ, dx / LAKE_MAP.sandbar.radiusX);
  return {
    x: LAKE_MAP.sandbar.center.x + Math.cos(angle) * (LAKE_MAP.sandbar.radiusX + padding),
    z: LAKE_MAP.sandbar.center.z + Math.sin(angle) * (LAKE_MAP.sandbar.radiusZ + padding),
  };
};

export const clampBoatToLake = (point: LakePoint): ClampResult => {
  let next = { ...point };
  let hitBoundary = false;
  const radius = getRadius(next);

  if (radius > LAKE_MAP.waterRadius) {
    const scale = LAKE_MAP.waterRadius / radius;
    next = {
      x: next.x * scale,
      z: next.z * scale,
    };
    hitBoundary = true;
  }

  const afterIsland = pushOutOfCircle(next, LAKE_MAP.island.center, LAKE_MAP.island.radius, 6);
  if (afterIsland !== next) {
    next = afterIsland;
    hitBoundary = true;
  }

  const afterSandbar = pushOutOfSandbar(next, 5);
  if (afterSandbar !== next) {
    next = afterSandbar;
    hitBoundary = true;
  }

  return {
    point: next,
    hitBoundary,
    centerYaw: Math.atan2(-next.z, -next.x),
  };
};

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

