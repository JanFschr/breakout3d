export type BodyType = 'cube' | 'pyramid';
export type CubeFaceId = 'front' | 'right' | 'back' | 'left' | 'top' | 'bottom';
export type PyramidFaceId = 'base' | 'north' | 'east' | 'south' | 'west';
export type FaceId = CubeFaceId | PyramidFaceId;
export type FaceEdge = 'left' | 'right' | 'top' | 'bottom';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface FaceBasis {
  readonly id: FaceId;
  readonly origin: Vec3Like;
  readonly u: Vec3Like;
  readonly v: Vec3Like;
  readonly normal: Vec3Like;
  readonly neighbors: Record<FaceEdge, FaceId>;
  readonly edgeAxes?: Partial<Record<FaceEdge, Vec3Like>>;
}

export interface LocalPoint {
  u: number;
  v: number;
  normal: number;
}

const HALF_SIZE = 7;
const PYRAMID_BASE_Y = -5;
const PYRAMID_APEX_Y = 7;
const PYRAMID_MID_Y = (PYRAMID_BASE_Y + PYRAMID_APEX_Y) / 2;
const PYRAMID_MID_INSET = HALF_SIZE / 2;
const PYRAMID_RISE = PYRAMID_APEX_Y - PYRAMID_BASE_Y;
const PYRAMID_SLANT = Math.hypot(PYRAMID_RISE, HALF_SIZE);
const SLOPE_UP = PYRAMID_RISE / PYRAMID_SLANT;
const SLOPE_IN = HALF_SIZE / PYRAMID_SLANT;

export const CUBE_FACE_IDS: readonly CubeFaceId[] = ['front', 'right', 'back', 'left', 'top', 'bottom'];
export const PYRAMID_FACE_IDS: readonly PyramidFaceId[] = ['base', 'north', 'east', 'south', 'west'];
export const FACE_IDS: readonly FaceId[] = [...CUBE_FACE_IDS, ...PYRAMID_FACE_IDS];

export const BODY_FACE_IDS: Record<BodyType, readonly FaceId[]> = {
  cube: CUBE_FACE_IDS,
  pyramid: PYRAMID_FACE_IDS,
};

const northWestAxis = normalize(vec(7, PYRAMID_RISE, -7));
const northEastAxis = normalize(vec(-7, PYRAMID_RISE, -7));
const southEastAxis = normalize(vec(-7, PYRAMID_RISE, 7));
const southWestAxis = normalize(vec(7, PYRAMID_RISE, 7));

export const FACE_GRAPH: Record<FaceId, FaceBasis> = {
  front: face('front', vec(0, 0, HALF_SIZE), vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1), {
    left: 'left', right: 'right', top: 'top', bottom: 'bottom',
  }),
  right: face('right', vec(HALF_SIZE, 0, 0), vec(0, 0, -1), vec(0, 1, 0), vec(1, 0, 0), {
    left: 'front', right: 'back', top: 'top', bottom: 'bottom',
  }),
  back: face('back', vec(0, 0, -HALF_SIZE), vec(-1, 0, 0), vec(0, 1, 0), vec(0, 0, -1), {
    left: 'right', right: 'left', top: 'top', bottom: 'bottom',
  }),
  left: face('left', vec(-HALF_SIZE, 0, 0), vec(0, 0, 1), vec(0, 1, 0), vec(-1, 0, 0), {
    left: 'back', right: 'front', top: 'top', bottom: 'bottom',
  }),
  top: face('top', vec(0, HALF_SIZE, 0), vec(1, 0, 0), vec(0, 0, -1), vec(0, 1, 0), {
    left: 'left', right: 'right', top: 'back', bottom: 'front',
  }),
  bottom: face('bottom', vec(0, -HALF_SIZE, 0), vec(1, 0, 0), vec(0, 0, 1), vec(0, -1, 0), {
    left: 'left', right: 'right', top: 'front', bottom: 'back',
  }),
  base: face('base', vec(0, PYRAMID_BASE_Y, 0), vec(1, 0, 0), vec(0, 0, 1), vec(0, -1, 0), {
    left: 'west', right: 'east', top: 'north', bottom: 'south',
  }, {
    left: vec(0, 0, 1), right: vec(0, 0, 1), top: vec(1, 0, 0), bottom: vec(1, 0, 0),
  }),
  north: face('north', vec(0, PYRAMID_MID_Y, PYRAMID_MID_INSET), vec(1, 0, 0), vec(0, SLOPE_UP, -SLOPE_IN), vec(0, SLOPE_IN, SLOPE_UP), {
    left: 'west', right: 'east', top: 'north', bottom: 'base',
  }, {
    left: northWestAxis, right: northEastAxis, bottom: vec(1, 0, 0),
  }),
  east: face('east', vec(PYRAMID_MID_INSET, PYRAMID_MID_Y, 0), vec(0, 0, -1), vec(-SLOPE_IN, SLOPE_UP, 0), vec(SLOPE_UP, SLOPE_IN, 0), {
    left: 'north', right: 'south', top: 'east', bottom: 'base',
  }, {
    left: northEastAxis, right: southEastAxis, bottom: vec(0, 0, 1),
  }),
  south: face('south', vec(0, PYRAMID_MID_Y, -PYRAMID_MID_INSET), vec(-1, 0, 0), vec(0, SLOPE_UP, SLOPE_IN), vec(0, SLOPE_IN, -SLOPE_UP), {
    left: 'east', right: 'west', top: 'south', bottom: 'base',
  }, {
    left: southEastAxis, right: southWestAxis, bottom: vec(1, 0, 0),
  }),
  west: face('west', vec(-PYRAMID_MID_INSET, PYRAMID_MID_Y, 0), vec(0, 0, 1), vec(SLOPE_IN, SLOPE_UP, 0), vec(-SLOPE_UP, SLOPE_IN, 0), {
    left: 'south', right: 'north', top: 'west', bottom: 'base',
  }, {
    left: southWestAxis, right: northWestAxis, bottom: vec(0, 0, 1),
  }),
};

export function localToBody(faceId: FaceId, u: number, v: number, normalOffset = 0): Vec3Like {
  const basis = FACE_GRAPH[faceId];
  return add(
    basis.origin,
    add(scale(basis.u, u), add(scale(basis.v, v), scale(basis.normal, normalOffset))),
  );
}

export function bodyToLocal(faceId: FaceId, point: Vec3Like): LocalPoint {
  const basis = FACE_GRAPH[faceId];
  const relative = subtract(point, basis.origin);
  return {
    u: dot(relative, basis.u),
    v: dot(relative, basis.v),
    normal: dot(relative, basis.normal),
  };
}

export function destinationForEdge(faceId: FaceId, edge: FaceEdge): FaceId {
  return FACE_GRAPH[faceId].neighbors[edge];
}

export function reciprocalEdge(source: FaceId, destination: FaceId): FaceEdge {
  const entries = Object.entries(FACE_GRAPH[destination].neighbors) as [FaceEdge, FaceId][];
  const result = entries.find(([, faceId]) => faceId === source);
  if (!result) throw new Error(`Faces ${source} and ${destination} are not adjacent`);
  return result[0];
}

export function transferVelocity(
  source: FaceId,
  destination: FaceId,
  velocity: { x: number; y: number },
): { x: number; y: number } {
  const sourceBasis = FACE_GRAPH[source];
  const destinationBasis = FACE_GRAPH[destination];
  const worldVelocity = add(scale(sourceBasis.u, velocity.x), scale(sourceBasis.v, velocity.y));
  const edgeAxis = normalize(sharedEdgeAxis(source, destination));
  const sinAngle = dot(edgeAxis, cross(sourceBasis.normal, destinationBasis.normal));
  const cosAngle = clamp(dot(sourceBasis.normal, destinationBasis.normal), -1, 1);
  const rotatedVelocity = rotateAroundAxis(worldVelocity, edgeAxis, Math.atan2(sinAngle, cosAngle));
  return {
    x: dot(rotatedVelocity, destinationBasis.u),
    y: dot(rotatedVelocity, destinationBasis.v),
  };
}

export function sharedEdgeAxis(source: FaceId, destination: FaceId): Vec3Like {
  const basis = FACE_GRAPH[source];
  const edge = (Object.entries(basis.neighbors) as [FaceEdge, FaceId][]).find(([, id]) => id === destination)?.[0];
  if (!edge) throw new Error(`Faces ${source} and ${destination} are not adjacent`);
  return basis.edgeAxes?.[edge] ?? (edge === 'left' || edge === 'right' ? basis.v : basis.u);
}

function rotateAroundAxis(vector: Vec3Like, axisValue: Vec3Like, angle: number): Vec3Like {
  const axis = normalize(axisValue);
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  return add(
    add(scale(vector, cosAngle), scale(cross(axis, vector), sinAngle)),
    scale(axis, dot(axis, vector) * (1 - cosAngle)),
  );
}

function face(
  id: FaceId,
  origin: Vec3Like,
  u: Vec3Like,
  v: Vec3Like,
  normal: Vec3Like,
  neighbors: Record<FaceEdge, FaceId>,
  edgeAxes?: Partial<Record<FaceEdge, Vec3Like>>,
): FaceBasis {
  return { id, origin, u: normalize(u), v: normalize(v), normal: normalize(normal), neighbors, edgeAxes };
}

function vec(x: number, y: number, z: number): Vec3Like {
  return { x, y, z };
}

function add(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value: Vec3Like, factor: number): Vec3Like {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function dot(a: Vec3Like, b: Vec3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3Like, b: Vec3Like): Vec3Like {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(value: Vec3Like): Vec3Like {
  const length = Math.hypot(value.x, value.y, value.z) || 1;
  return scale(value, 1 / length);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
