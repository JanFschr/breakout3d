import type { Vec2 } from '../gameplay/contracts';

export interface Aabb {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface SweepHit {
  readonly time: number;
  readonly normal: Vec2;
}

export function sweepPointAgainstAabb(
  position: Vec2,
  velocity: Vec2,
  maxTime: number,
  aabb: Aabb,
): SweepHit | null {
  let tNearX = Number.NEGATIVE_INFINITY;
  let tFarX = Number.POSITIVE_INFINITY;
  let tNearY = Number.NEGATIVE_INFINITY;
  let tFarY = Number.POSITIVE_INFINITY;

  if (Math.abs(velocity.x) < 1e-9) {
    if (position.x < aabb.minX || position.x > aabb.maxX) return null;
  } else {
    const tx1 = (aabb.minX - position.x) / velocity.x;
    const tx2 = (aabb.maxX - position.x) / velocity.x;
    tNearX = Math.min(tx1, tx2);
    tFarX = Math.max(tx1, tx2);
  }

  if (Math.abs(velocity.y) < 1e-9) {
    if (position.y < aabb.minY || position.y > aabb.maxY) return null;
  } else {
    const ty1 = (aabb.minY - position.y) / velocity.y;
    const ty2 = (aabb.maxY - position.y) / velocity.y;
    tNearY = Math.min(ty1, ty2);
    tFarY = Math.max(ty1, ty2);
  }

  const tNear = Math.max(tNearX, tNearY);
  const tFar = Math.min(tFarX, tFarY);
  if (tNear > tFar || tFar < 0 || tNear < 0 || tNear > maxTime) return null;

  if (tNearX > tNearY) {
    return { time: tNear, normal: { x: velocity.x > 0 ? -1 : 1, y: 0 } };
  }
  return { time: tNear, normal: { x: 0, y: velocity.y > 0 ? -1 : 1 } };
}

export function expandedAabb(center: Vec2, width: number, height: number, radius: number): Aabb {
  const halfWidth = width / 2 + radius;
  const halfHeight = height / 2 + radius;
  return {
    minX: center.x - halfWidth,
    maxX: center.x + halfWidth,
    minY: center.y - halfHeight,
    maxY: center.y + halfHeight,
  };
}
