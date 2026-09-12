import type { GameplayTuning } from '../core/config';
import type { BodyType, FaceEdge, FaceId } from '../world/FaceGraph';
import type { Vec2 } from '../gameplay/contracts';

export interface BoundaryHit {
  readonly edge: 'left' | 'right';
  readonly time: number;
  readonly normal: Vec2;
}

const EPSILON = 1e-8;

export function isTriangularPlayfield(bodyType: BodyType, faceId: FaceId): boolean {
  return bodyType === 'pyramid' && faceId !== 'base';
}

export function triangleHalfWidthAtY(tuning: GameplayTuning, y: number): number {
  const halfWidth = tuning.fieldWidth / 2;
  return Math.max(0, halfWidth * (1 - y / tuning.fieldHeight));
}

/**
 * Maximum horizontal center distance for a circle that must remain inside the
 * triangular playfield. The radius is applied as a true perpendicular inset
 * against the sloped side walls, not as a horizontal approximation.
 */
export function triangleBallCenterHalfWidth(tuning: GameplayTuning, y: number, radius: number): number {
  const halfWidth = tuning.fieldWidth / 2;
  const slope = halfWidth / tuning.fieldHeight;
  const normalScale = Math.hypot(1, slope);
  return Math.max(0, halfWidth - slope * y - radius * normalScale);
}

export function paddleCenterLimit(
  bodyType: BodyType,
  faceId: FaceId,
  tuning: GameplayTuning,
  paddleY: number,
  paddleWidth: number,
  paddleHeight: number,
): number {
  if (!isTriangularPlayfield(bodyType, faceId)) return tuning.fieldWidth / 2 - paddleWidth / 2;
  const topY = paddleY + paddleHeight / 2;
  return Math.max(0, triangleHalfWidthAtY(tuning, topY) - paddleWidth / 2);
}

/** Continuous circle-vs-sloped-wall candidates for a triangular face. */
export function triangularBoundaryHits(
  tuning: GameplayTuning,
  position: Vec2,
  velocity: Vec2,
  radius: number,
  maxTime: number,
): readonly BoundaryHit[] {
  const halfWidth = tuning.fieldWidth / 2;
  const slope = halfWidth / tuning.fieldHeight;
  const normalScale = Math.hypot(1, slope);
  const limit = halfWidth - radius * normalScale;
  const hits: BoundaryHit[] = [];

  const leftValue = -position.x + slope * position.y;
  const leftRate = -velocity.x + slope * velocity.y;
  if (leftRate > EPSILON) {
    const time = (limit - leftValue) / leftRate;
    if (time >= 0 && time <= maxTime) {
      hits.push({
        edge: 'left',
        time,
        normal: { x: 1 / normalScale, y: -slope / normalScale },
      });
    }
  }

  const rightValue = position.x + slope * position.y;
  const rightRate = velocity.x + slope * velocity.y;
  if (rightRate > EPSILON) {
    const time = (limit - rightValue) / rightRate;
    if (time >= 0 && time <= maxTime) {
      hits.push({
        edge: 'right',
        time,
        normal: { x: -1 / normalScale, y: -slope / normalScale },
      });
    }
  }

  return hits;
}

export function nudgeBallInsidePlayfield(
  bodyType: BodyType,
  faceId: FaceId,
  edge: FaceEdge,
  position: Vec2,
  tuning: GameplayTuning,
  inset = 0.08,
): void {
  if (!isTriangularPlayfield(bodyType, faceId)) {
    if (edge === 'left') position.x = -tuning.fieldWidth / 2 + tuning.ballRadius + inset;
    if (edge === 'right') position.x = tuning.fieldWidth / 2 - tuning.ballRadius - inset;
    if (edge === 'top') position.y = tuning.fieldHeight - tuning.ballRadius - inset;
    if (edge === 'bottom') position.y = tuning.ballRadius + inset;
    return;
  }

  const halfWidth = tuning.fieldWidth / 2;
  const slope = halfWidth / tuning.fieldHeight;
  const normalScale = Math.hypot(1, slope);
  const radiusInset = (tuning.ballRadius + inset) * normalScale;
  const maxCenterY = (halfWidth - radiusInset) / slope;
  position.y = clamp(position.y, tuning.ballRadius + inset, maxCenterY);

  const centerHalfWidth = Math.max(0, halfWidth - slope * position.y - radiusInset);
  if (edge === 'left') position.x = -centerHalfWidth;
  else if (edge === 'right') position.x = centerHalfWidth;
  else position.x = clamp(position.x, -centerHalfWidth, centerHalfWidth);
}

export function blockFitsTriangularFace(
  tuning: Pick<GameplayTuning, 'fieldWidth' | 'fieldHeight'>,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  const halfWidth = tuning.fieldWidth / 2;
  const topY = y + height / 2;
  if (topY > tuning.fieldHeight || y - height / 2 < 0) return false;
  const available = halfWidth * (1 - topY / tuning.fieldHeight);
  return Math.abs(x) + width / 2 <= available + 1e-6;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
